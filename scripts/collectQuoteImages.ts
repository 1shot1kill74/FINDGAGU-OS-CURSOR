/**
 * collectQuoteImages.ts
 *
 * Google Chat Takeout 폴더(2~9)에서 견적서 이미지만 선별해 복사한다.
 *
 * 실행:
 *   TAKEOUT_NUMBER=3 npx tsx scripts/collectQuoteImages.ts
 *   TAKEOUT_NUMBER=4 npx tsx scripts/collectQuoteImages.ts
 *
 * 또는 collectAllTakeouts.ts에서 순차 실행.
 */

import fs from "fs"
import path from "path"
import sharp from "sharp"
import pLimit from "p-limit"
import { createWorker, type Worker } from "tesseract.js"

// ─────────────────────────────────────────────────────────────
// 🔧 설정
// ─────────────────────────────────────────────────────────────

const TAKEOUT_NUMBER = Number(process.env.TAKEOUT_NUMBER) || 2

const TAKEOUT_DIR = `/Users/findgagu/findgagu-os-data/staging/Takeout ${TAKEOUT_NUMBER}`
const GROUPS_PATH = path.join(TAKEOUT_DIR, "Google Chat", "Groups")

const OUT_DIR = `/Users/findgagu/findgagu-os-data/collected-quotes-v${TAKEOUT_NUMBER}`
const INDEX_CSV = path.join(OUT_DIR, "index.csv")

const LANG_PATH = path.join(process.cwd(), "public", "assets", "ocr")

const CONCURRENCY = 3
const FORCE_RESCAN = true

const IMAGE_EXTS = /\.(png|jpg|jpeg|webp)$/i

// ─────────────────────────────────────────────────────────────
// 🎯 판별 조건
// ─────────────────────────────────────────────────────────────

const TABLE_KEYWORDS = [
  "공급가액",
  "VAT",
  "합계",
  "총액",
  "단가",
  "수량",
  "품명",
  "규격",
]

const MIN_KEYWORDS = 2
const MIN_NUMBERS = 6
const CHAT_UI_WORDS = ["오전", "오후", "읽음", "답장", "전달", "보냄"]

// ─────────────────────────────────────────────────────────────
// 🖼 이미지 전처리
// ─────────────────────────────────────────────────────────────

async function cropHeader(filePath: string): Promise<Buffer> {
  const img = sharp(filePath)
  const { width = 1200, height = 1600 } = await img.metadata()

  return img
    .extract({ left: 0, top: 0, width, height: Math.floor(height * 0.3) })
    .resize({ width: 1600 })
    .grayscale()
    .sharpen()
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function cropFull(filePath: string): Promise<Buffer> {
  return sharp(filePath)
    .resize({ width: 1600 })
    .grayscale()
    .sharpen()
    .jpeg({ quality: 90 })
    .toBuffer()
}

// ─────────────────────────────────────────────────────────────
// 🔍 OCR 판별
// ─────────────────────────────────────────────────────────────

type DetectResult = { matched: boolean; reasons: string[] }

async function detectQuote(
  filePath: string,
  worker: Worker
): Promise<DetectResult> {
  const fail: DetectResult = { matched: false, reasons: [] }

  try {
    // PASS 1: 헤더에 "견적서" 필수
    const headerBuf = await cropHeader(filePath)
    const { data: headerData } = await worker.recognize(headerBuf)
    const headerNorm = headerData.text.replace(/\s+/g, "")

    if (!headerNorm.includes("견적서")) return fail

    // PASS 2: 전체 키워드 + 숫자
    const fullBuf = await cropFull(filePath)
    const { data: fullData } = await worker.recognize(fullBuf)

    const fullText = fullData.text
    const fullNorm = fullText.replace(/\s+/g, "")

    const matchedKws = TABLE_KEYWORDS.filter((kw) =>
      fullNorm.includes(kw)
    )
    const kwCount = matchedKws.length
    const numCount = fullText.match(/\d+/g)?.length ?? 0

    const hasChatUi = CHAT_UI_WORDS.some((w) =>
      fullNorm.includes(w)
    )

    if (hasChatUi && kwCount < MIN_KEYWORDS) return fail
    if (kwCount < MIN_KEYWORDS || numCount < MIN_NUMBERS) return fail

    return {
      matched: true,
      reasons: [`HEADER_OK + KEYWORDS(${kwCount}) + NUM(${numCount})`],
    }
  } catch {
    return fail
  }
}

// ─────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────

function csvEscape(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(fields: string[]): string {
  return fields.map(csvEscape).join(",") + "\n"
}

// ─────────────────────────────────────────────────────────────
// 진행률
// ─────────────────────────────────────────────────────────────

function logProgress(
  scanned: number,
  total: number,
  matched: number,
  startMs: number
) {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(0)
  process.stdout.write(
    `\r스캔: ${scanned}/${total} | 매칭: ${matched} | 경과: ${elapsed}s   `
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (!fs.existsSync(GROUPS_PATH)) {
    console.error(`\n[오류] Groups 폴더 없음:\n  ${GROUPS_PATH}`)
    process.exit(1)
  }

  if (FORCE_RESCAN && fs.existsSync(INDEX_CSV)) {
    fs.unlinkSync(INDEX_CSV)
  }

  if (!fs.existsSync(INDEX_CSV)) {
    fs.writeFileSync(
      INDEX_CSV,
      "space_id,file_name,src_path,dst_path,match_reason\n"
    )
  }

  const csvStream = fs.createWriteStream(INDEX_CSV, { flags: "a" })

  const spaceFolders = fs
    .readdirSync(GROUPS_PATH)
    .filter((name) =>
      fs.statSync(path.join(GROUPS_PATH, name)).isDirectory()
    )

  const tasks: {
    spaceId: string
    srcPath: string
    fileName: string
  }[] = []

  for (const spaceId of spaceFolders) {
    const spacePath = path.join(GROUPS_PATH, spaceId)

    for (const f of fs.readdirSync(spacePath)) {
      if (IMAGE_EXTS.test(f)) {
        tasks.push({
          spaceId,
          srcPath: path.join(spacePath, f),
          fileName: f,
        })
      }
    }
  }

  console.log(`\n=========================================`)
  console.log(` Takeout ${TAKEOUT_NUMBER} 스캔 시작`)
  console.log(`=========================================`)
  console.log(` Groups : ${GROUPS_PATH}`)
  console.log(` 출력   : ${OUT_DIR}`)
  console.log(` 이미지 : ${tasks.length}개`)
  console.log(`=========================================\n`)

  const worker = await createWorker("kor", 1, {
    langPath: LANG_PATH,
  })

  const limit = pLimit(CONCURRENCY)

  let scanned = 0
  let matched = 0
  let skipped = 0
  const startMs = Date.now()

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        const dstDir = path.join(OUT_DIR, task.spaceId)
        const dstPath = path.join(dstDir, task.fileName)

        if (!FORCE_RESCAN && fs.existsSync(dstPath)) {
          skipped++
          scanned++
          logProgress(scanned, tasks.length, matched, startMs)
          return
        }

        if (FORCE_RESCAN && fs.existsSync(dstPath)) {
          fs.unlinkSync(dstPath)
        }

        const result = await detectQuote(task.srcPath, worker)
        scanned++

        if (result.matched) {
          matched++
          fs.mkdirSync(dstDir, { recursive: true })
          fs.copyFileSync(task.srcPath, dstPath)

          csvStream.write(
            csvRow([
              task.spaceId,
              task.fileName,
              task.srcPath,
              dstPath,
              result.reasons.join("|"),
            ])
          )
        }

        logProgress(scanned, tasks.length, matched, startMs)
      })
    )
  )

  await worker.terminate()
  await new Promise<void>((resolve) => csvStream.end(resolve))

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)

  console.log(`\n\n=========================================`)
  console.log(` 완료`)
  console.log(`=========================================`)
  console.log(` 스캔     : ${scanned}`)
  console.log(` skip     : ${skipped}`)
  console.log(` 견적서   : ${matched}`)
  console.log(` 총 경과  : ${elapsed}s`)
  console.log(`=========================================\n`)
}

main().catch((err) => {
  console.error("\n[오류]", err)
  process.exit(1)
})