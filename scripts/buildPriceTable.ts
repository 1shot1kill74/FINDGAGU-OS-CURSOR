/**
 * buildPriceTable.ts
 *
 * parsed-quotes 데이터로 standardPriceTable.v1.json 생성.
 *
 * 출력 구조:
 * {
 *   "제품명": {
 *     "__BASE__": baseMedian,   ← 모든 규격 합산 중앙값
 *     "규격1": median,
 *     "규격2": median
 *   }
 * }
 *
 * 실행:
 *   npx tsx scripts/buildPriceTable.ts
 */

import fs from "fs"
import path from "path"
import {
  loadAllEntries,
  INPUT_DIR,
  normalizeName,
  normalizeSpec,
  toNumber,
  median,
} from "./lib/quoteUtils"

const OUTPUT_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "standardPriceTable.v1.json"
)

// 배송/설치 계열은 calculateEstimate가 별도 계산 → 제외
const SKIP_KEYWORDS = [
  "배송비", "설치비", "조립설치비", "조립 설치비",
  "전기작업비", "운임", "실리콘시공",
]

function main() {
  const entries = loadAllEntries(INPUT_DIR)
  console.log(`JSON 파일 수: ${entries.length}개`)

  // base_name → { allPrices, bySpec: Map<spec, prices[]> }
  const byBase = new Map<string, {
    allPrices: number[]
    bySpec: Map<string, number[]>
  }>()

  for (const { parsed } of entries) {
    const rows = parsed?.data?.rows
    if (!Array.isArray(rows)) continue

    for (const row of rows) {
      const rawName = String(row.name ?? "").trim()
      const rawSpec = String(row.spec ?? "").split(/\n/)[0]!.trim()
      const price = toNumber(row.unitPrice)

      if (!rawName || price <= 0) continue

      const base_name = normalizeName(rawName)
      if (!base_name) continue
      if (SKIP_KEYWORDS.some((kw) => base_name.includes(kw))) continue

      const spec = normalizeSpec(rawSpec)

      let entry = byBase.get(base_name)
      if (!entry) {
        entry = { allPrices: [], bySpec: new Map() }
        byBase.set(base_name, entry)
      }

      entry.allPrices.push(price)

      let specPrices = entry.bySpec.get(spec)
      if (!specPrices) {
        specPrices = []
        entry.bySpec.set(spec, specPrices)
      }
      specPrices.push(price)
    }
  }

  // 출력 구조 구성
  const prices: Record<string, Record<string, number>> = {}
  let totalProducts = 0
  let totalSpecs = 0

  for (const [base_name, entry] of byBase.entries()) {
    const productEntry: Record<string, number> = {
      __BASE__: Math.round(median(entry.allPrices)),
    }

    for (const [spec, specPrices] of entry.bySpec.entries()) {
      productEntry[spec] = Math.round(median(specPrices))
      totalSpecs++
    }

    prices[base_name] = productEntry
    totalProducts++
  }

  const table = {
    version: "2",
    generated_at: new Date().toISOString(),
    sample_source: INPUT_DIR,
    product_count: totalProducts,
    spec_count: totalSpecs,
    prices,
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(table, null, 2), "utf-8")
  console.log(`\n저장 완료: ${OUTPUT_PATH}`)
  console.log(`제품 수   : ${totalProducts}개`)
  console.log(`규격 수   : ${totalSpecs}개 (spec 레벨)`)
}

main()
