import fs from "fs"
import path from "path"
import sharp from "sharp"
import pLimit from "p-limit"
import { createWorker } from "tesseract.js"

const BASE_DIR = "/Users/findgagu/findgagu-os-data/staging"
const CONCURRENCY = 2

type SpaceResult = {
  hasQuote: boolean
  matchedFiles: string[]
}

const limit = pLimit(CONCURRENCY)

async function preprocessImage(filePath: string): Promise<Buffer> {
  const image = sharp(filePath)
  const metadata = await image.metadata()

  const width = metadata.width ?? 1000
  const height = metadata.height ?? 1000

  const cropped = await image
    .extract({
      left: 0,
      top: 0,
      width,
      height: Math.floor(height * 0.4) // 상단 40%만
    })
    .resize({ width: 1000 })
    .jpeg({ quality: 70 })
    .toBuffer()

  return cropped
}

async function checkQuote(filePath: string, worker: any): Promise<boolean> {
  try {
    const buffer = await preprocessImage(filePath)
    const { data } = await worker.recognize(buffer)

    const text = data.text.replace(/\s/g, "")
    return /견\s*적\s*서/.test(text)
  } catch (err) {
    console.error("OCR 실패:", filePath)
    return false
  }
}

async function scanSpaces() {
  const results: Record<string, SpaceResult> = {}

  const worker = await createWorker("kor")

  const takeouts = fs.readdirSync(BASE_DIR)

  for (const takeout of takeouts) {
    const groupsPath = path.join(BASE_DIR, takeout, "Google Chat", "Groups")
    if (!fs.existsSync(groupsPath)) continue

    const spaceFolders = fs.readdirSync(groupsPath)

    for (const spaceFolder of spaceFolders) {
      const spacePath = path.join(groupsPath, spaceFolder)

      if (!fs.statSync(spacePath).isDirectory()) continue

      const files = fs.readdirSync(spacePath)

      const imageFiles = files
        .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
        .map(f => path.join(spacePath, f))

      if (imageFiles.length === 0) continue

      let hasQuote = false
      const matchedFiles: string[] = []

      for (const img of imageFiles) {
        const detected = await limit(() =>
          checkQuote(img, worker)
        )

        if (detected) {
          hasQuote = true
          matchedFiles.push(img)
          console.log("  → 견적서 파일:", img)
        }
      }

      results[spaceFolder] = {
        hasQuote,
        matchedFiles
      }

      console.log(
        `${spaceFolder} → ${hasQuote ? "견적서 있음" : "없음"}`
      )
    }
  }

  await worker.terminate()

  fs.writeFileSync(
    "has_quote_local.json",
    JSON.stringify(results, null, 2)
  )

  console.log("=== 완료 ===")
}

scanSpaces()