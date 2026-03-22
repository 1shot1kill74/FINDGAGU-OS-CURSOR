/**
 * analyzeProductFrequency.ts
 *
 * base_name 기준 제품 빈도 분석.
 * 결과를 객체로 반환하며, runEngineResearch.ts에서 import하거나
 * 단독 실행도 가능하다.
 *
 * 실행:
 *   npx tsx scripts/analyzeProductFrequency.ts
 */

import {
  INPUT_DIR,
  loadAllEntries,
  normalizeName,
  type QuoteEntry,
} from "./lib/quoteUtils"

// ─── 반환 타입 ─────────────────────────────────────────────────

export interface FreqItem {
  base_name: string
  count: number
}

export interface FrequencyResult {
  totalRows: number
  uniqueProducts: number
  top20: FreqItem[]
  freqMap: Map<string, number>
}

// ─── 분석 함수 ─────────────────────────────────────────────────

export function analyzeProductFrequency(entries: QuoteEntry[]): FrequencyResult {
  const freqMap = new Map<string, number>()
  let totalRows = 0

  for (const { parsed } of entries) {
    const rows = parsed?.data?.rows
    if (!Array.isArray(rows)) continue

    for (const row of rows) {
      const rawName = String(row.name ?? "").trim()
      if (!rawName) continue

      totalRows++
      const base_name = normalizeName(rawName)
      if (!base_name) continue

      freqMap.set(base_name, (freqMap.get(base_name) ?? 0) + 1)
    }
  }

  const sorted = [...freqMap.entries()].sort((a, b) => b[1] - a[1])

  return {
    totalRows,
    uniqueProducts: freqMap.size,
    top20: sorted.slice(0, 20).map(([base_name, count]) => ({ base_name, count })),
    freqMap,
  }
}

// ─── 출력 함수 ─────────────────────────────────────────────────

export function printFrequencyResult(result: FrequencyResult) {
  console.log(`  총 row 수        : ${result.totalRows.toLocaleString()}`)
  console.log(`  총 고유 제품 수   : ${result.uniqueProducts.toLocaleString()}`)
  console.log(`\n  ${"순위".padEnd(5)} ${"빈도".padStart(5)}  제품명`)
  console.log("  " + "─".repeat(50))
  result.top20.forEach(({ base_name, count }, i) => {
    console.log(`  ${String(i + 1).padEnd(5)} ${String(count).padStart(5)}  ${base_name}`)
  })
  console.log("  " + "─".repeat(50))
}

// ─── 단독 실행 ─────────────────────────────────────────────────

if (process.argv[1]?.includes("analyzeProductFrequency")) {
  const entries = loadAllEntries(INPUT_DIR)
  console.log(`\nJSON 파일 수: ${entries.length}개\n`)
  const result = analyzeProductFrequency(entries)
  printFrequencyResult(result)
}
