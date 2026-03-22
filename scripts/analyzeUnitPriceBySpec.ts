/**
 * analyzeUnitPriceBySpec.ts
 *
 * base_name × spec 기준 평균 단가 분석.
 * 안정(CV < 20%) / 변동 큰(CV ≥ 20%) 제품 분류 포함.
 *
 * 실행:
 *   npx tsx scripts/analyzeUnitPriceBySpec.ts
 */

import {
  INPUT_DIR,
  MIN_SAMPLES,
  loadAllEntries,
  normalizeName,
  normalizeSpec,
  toNumber,
  mean,
  stddev,
  won,
  type QuoteEntry,
} from "./lib/quoteUtils"

// ─── 반환 타입 ─────────────────────────────────────────────────

export interface PriceGroup {
  base_name: string
  spec: string
  count: number
  avg_price: number
  min_price: number
  max_price: number
  std: number
  cv: number // coefficient of variation = std / avg
}

export interface UnitPriceResult {
  totalGroups: number
  groups: PriceGroup[]    // MIN_SAMPLES 이상, 평균 내림차순
  stable: PriceGroup[]    // cv < 0.2
  volatile: PriceGroup[]  // cv >= 0.2
}

// ─── 분석 함수 ─────────────────────────────────────────────────

export function analyzeUnitPriceBySpec(entries: QuoteEntry[]): UnitPriceResult {
  const groupMap = new Map<string, { base_name: string; spec: string; prices: number[] }>()

  for (const { parsed } of entries) {
    const rows = parsed?.data?.rows
    if (!Array.isArray(rows)) continue

    for (const row of rows) {
      const rawName = String(row.name ?? "").trim()
      const rawSpec = String(row.spec ?? "").trim()
      const price = toNumber(row.unitPrice)

      if (!rawName || price <= 0) continue

      const base_name = normalizeName(rawName)
      const spec = normalizeSpec(rawSpec)
      if (!base_name) continue

      const key = `${base_name}|||${spec}`
      let group = groupMap.get(key)
      if (!group) {
        group = { base_name, spec, prices: [] }
        groupMap.set(key, group)
      }
      group.prices.push(price)
    }
  }

  const groups: PriceGroup[] = [...groupMap.values()]
    .filter((g) => g.prices.length >= MIN_SAMPLES)
    .map((g) => {
      const avg_price = mean(g.prices)
      const std = stddev(g.prices)
      return {
        base_name: g.base_name,
        spec: g.spec,
        count: g.prices.length,
        avg_price,
        min_price: Math.min(...g.prices),
        max_price: Math.max(...g.prices),
        std,
        cv: avg_price > 0 ? std / avg_price : 0,
      }
    })
    .sort((a, b) => b.avg_price - a.avg_price)

  return {
    totalGroups: groups.length,
    groups,
    stable: groups.filter((g) => g.cv < 0.2),
    volatile: groups.filter((g) => g.cv >= 0.2),
  }
}

// ─── 출력 함수 ─────────────────────────────────────────────────

export function printUnitPriceResult(result: UnitPriceResult) {
  const { groups, stable, volatile } = result
  const SEP = "─".repeat(96)

  console.log(`  표본 ${MIN_SAMPLES}개 이상 그룹 : ${groups.length}`)
  console.log(`  안정 (CV < 20%)    : ${stable.length}`)
  console.log(`  변동 (CV ≥ 20%)    : ${volatile.length}`)
  console.log(
    `\n  ${"제품명".padEnd(20)}  ${"규격".padEnd(22)}` +
    `  ${"평균단가".padStart(12)}  ${"최소".padStart(10)}  ${"최대".padStart(10)}` +
    `  ${"CV".padStart(5)}  ${"표본".padStart(4)}`
  )
  console.log(`  ${SEP}`)

  for (const g of groups) {
    const name = g.base_name.length > 14 ? g.base_name.slice(0, 13) + "…" : g.base_name
    const spec = g.spec.length > 20 ? g.spec.slice(0, 19) + "…" : g.spec
    console.log(
      `  ${name.padEnd(20)}  ${spec.padEnd(22)}` +
      `  ${won(Math.round(g.avg_price)).padStart(12)}` +
      `  ${won(g.min_price).padStart(10)}` +
      `  ${won(g.max_price).padStart(10)}` +
      `  ${(g.cv * 100).toFixed(0).padStart(4)}%` +
      `  ${String(g.count).padStart(4)}`
    )
  }

  console.log(`  ${SEP}`)
}

// ─── 단독 실행 ─────────────────────────────────────────────────

if (process.argv[1]?.includes("analyzeUnitPriceBySpec")) {
  const entries = loadAllEntries(INPUT_DIR)
  console.log(`\nJSON 파일 수: ${entries.length}개\n`)
  const result = analyzeUnitPriceBySpec(entries)
  printUnitPriceResult(result)
}
