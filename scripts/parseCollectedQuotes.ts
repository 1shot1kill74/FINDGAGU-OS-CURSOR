import "dotenv/config"
import fs from "fs"
import path from "path"
import pLimit from "p-limit"
import fetch from "node-fetch"

const BASE_DIR = "/Users/findgagu/findgagu-os-data"
const OUTPUT_BASE = path.join(BASE_DIR, "parsed-quotes")
const ERROR_LOG = path.join(BASE_DIR, "parsed-quotes-errors.log")

const TAKEOUT_RANGE = [3, 4, 5, 6, 7, 8, 9]
const CONCURRENCY = 2
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.error("GOOGLE_GEMINI_API_KEY 필요")
  process.exit(1)
}

function getAllImages() {
  const tasks: { spaceId: string; imagePath: string }[] = []

  for (const n of TAKEOUT_RANGE) {
    const dir = path.join(BASE_DIR, `collected-quotes-v${n}`)
    if (!fs.existsSync(dir)) continue

    for (const spaceId of fs.readdirSync(dir)) {
      const spacePath = path.join(dir, spaceId)
      if (!fs.statSync(spacePath).isDirectory()) continue

      for (const file of fs.readdirSync(spacePath)) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
          tasks.push({
            spaceId,
            imagePath: path.join(spacePath, file),
          })
        }
      }
    }
  }

  return tasks
}

// ─── 금액 계산 ──────────────────────────────────────────────────

function toNumber(val: unknown): number {
  if (typeof val === "number") return val
  if (typeof val === "string") return Number(val.replace(/,/g, "")) || 0
  return 0
}

interface ParsedRow {
  name: string
  spec: string
  qty: string | number
  unitPrice: string | number
}

interface GeminiData {
  siteName?: string
  quoteDate?: string
  customer_name?: string
  customer_phone?: string
  total_amount?: string | number
  rows?: ParsedRow[]
  [key: string]: unknown
}

function calcAmounts(data: GeminiData): {
  siteName: string
  quoteDate: string
  customer_name: string
  customer_phone: string
  supply_total: number
  vat_amount: number
  grand_total: number
  rows: ParsedRow[]
} {
  const rows = Array.isArray(data.rows) ? data.rows : []

  const supply_total = rows.reduce((sum, row) => {
    const qty = toNumber(row.qty)
    const unitPrice = toNumber(row.unitPrice)
    return sum + qty * unitPrice
  }, 0)

  const grand_total = toNumber(data.total_amount)
  const vat_amount = grand_total - supply_total

  return {
    siteName: String(data.siteName ?? ""),
    quoteDate: String(data.quoteDate ?? ""),
    customer_name: String(data.customer_name ?? ""),
    customer_phone: String(data.customer_phone ?? ""),
    supply_total,
    vat_amount,
    grand_total,
    rows,
  }
}

// ─── JSON 파싱 강화 ────────────────────────────────────────────

function parseJsonRobust(raw: string): unknown {
  let text = raw.trim()

  // 1) ```json ... ``` 또는 ``` ... ``` 코드 블록 제거
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    console.log("  [parse] 코드블록 감지 → 내부 추출")
    text = codeBlockMatch[1]!.trim()
  }

  // 2) 직접 파싱 시도
  try {
    return JSON.parse(text)
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1)
    console.warn(`  [parse] 1차 JSON.parse 실패: ${msg}`)
    console.warn(`  [parse] 실패 대상(첫 300자): ${text.slice(0, 300)}`)
  }

  // 3) 중괄호 { } 부분만 추출해서 파싱
  const braceStart = text.indexOf("{")
  const braceEnd = text.lastIndexOf("}")
  if (braceStart !== -1 && braceEnd > braceStart) {
    const extracted = text.slice(braceStart, braceEnd + 1)
    console.log(`  [parse] 중괄호 추출 시도(첫 200자): ${extracted.slice(0, 200)}`)
    try {
      return JSON.parse(extracted)
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : String(e2)
      console.warn(`  [parse] 2차(중괄호 추출) JSON.parse 실패: ${msg}`)
    }
  } else {
    console.warn("  [parse] 중괄호({}) 를 찾을 수 없음")
  }

  // 4) 배열 [ ] 부분 추출 시도
  const bracketStart = text.indexOf("[")
  const bracketEnd = text.lastIndexOf("]")
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    const extracted = text.slice(bracketStart, bracketEnd + 1)
    console.log(`  [parse] 배열 추출 시도(첫 200자): ${extracted.slice(0, 200)}`)
    try {
      return { rows: JSON.parse(extracted) }
    } catch (e3) {
      const msg = e3 instanceof Error ? e3.message : String(e3)
      console.warn(`  [parse] 3차(배열 추출) JSON.parse 실패: ${msg}`)
    }
  }

  throw new Error(`JSON 파싱 전체 실패. 원문(첫 500자): ${raw.slice(0, 500)}`)
}

// ─── Gemini REST 호출 ──────────────────────────────────────────

async function callGemini(imagePath: string) {
  const imageBase64 = fs.readFileSync(imagePath).toString("base64")
  const ext = (imagePath.split(".").pop() ?? "jpeg").toLowerCase()
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  }
  const mimeType = mimeMap[ext] ?? "image/jpeg"

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `
이 이미지는 가구 견적서입니다.
설명 없이 JSON만 반환하세요.

{
  "siteName": "",
  "quoteDate": "",
  "customer_name": "",
  "customer_phone": "",
  "total_amount": 0,
  "rows": [
    {
      "name": "",
      "spec": "",
      "qty": "",
      "unitPrice": ""
    }
  ]
}
`,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  // HTTP 실패 시 status + body 로깅
  if (!res.ok) {
    const errBody = await res.text()
    console.error(`  [HTTP 오류] status=${res.status} ${res.statusText}`)
    console.error(`  [HTTP 응답 body]: ${errBody.slice(0, 500)}`)
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
  }

  const json = await res.json() as Record<string, unknown>

  const text: string =
    (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

  if (!text) {
    console.error("  [Gemini] 응답 candidates 없음. 전체 응답:")
    console.error(JSON.stringify(json, null, 2).slice(0, 1000))
    throw new Error("Gemini 응답 없음")
  }

  // ① 원문 응답 출력
  console.log("  ─── Gemini 원문 응답 ───────────────────────────")
  console.log(text)
  console.log("  ────────────────────────────────────────────────")

  return parseJsonRobust(text)
}

async function parseWithRetry(imagePath: string) {
  try {
    return await callGemini(imagePath)
  } catch (e) {
    console.warn(`  [재시도] 1회 재시도 중... (원인: ${e instanceof Error ? e.message : e})`)
    return await callGemini(imagePath)
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_BASE, { recursive: true })

  const allTasks = getAllImages()

  const tasks = allTasks

  console.log(`\n총 이미지: ${tasks.length}개`)

  const limit = pLimit(CONCURRENCY)

  let processed = 0
  let success = 0

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        const spaceDir = path.join(OUTPUT_BASE, task.spaceId)
        fs.mkdirSync(spaceDir, { recursive: true })

        const baseName = path.basename(
          task.imagePath,
          path.extname(task.imagePath)
        )

        const jsonPath = path.join(spaceDir, `${baseName}.json`)

        if (fs.existsSync(jsonPath)) {
          processed++
          console.log(`\n[skip] 이미 처리됨: ${task.imagePath}`)
          return
        }

        console.log(`\n[처리] ${task.imagePath}`)

        try {
          const raw = await parseWithRetry(task.imagePath)

          // ─── parse 직후 금액 계산 ──────────────────────────
          const data = calcAmounts(raw as GeminiData)
          console.log(
            `  [calc] supply_total=${data.supply_total.toLocaleString()}` +
            ` vat_amount=${data.vat_amount.toLocaleString()}` +
            ` grand_total=${data.grand_total.toLocaleString()}`
          )
          // ────────────────────────────────────────────────────

          fs.writeFileSync(
            jsonPath,
            JSON.stringify(
              {
                space_id: task.spaceId,
                source_image: task.imagePath,
                parsed_at: new Date().toISOString(),
                data,
              },
              null,
              2
            )
          )

          console.log(`  → SUCCESS: ${jsonPath}`)
          success++
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`  → ERROR: ${msg}`)

          fs.appendFileSync(
            ERROR_LOG,
            `${new Date().toISOString()} | ${task.imagePath} | ${msg}\n`
          )
        }

        processed++
        process.stdout.write(
          `\r진행 ${processed}/${tasks.length} | 성공 ${success}`
        )
      })
    )
  )

  console.log(`\n\n완료 — 성공 ${success}/${tasks.length}`)
}

main()
