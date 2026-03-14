/**
 * analyzeCostRatios.ts
 *
 * 배송비 / 설치비 비율 분석.
 * 중앙값 기준 통계 및 supply_total 구간별 분석 포함.
 *
 * 실행:
 *   npx tsx scripts/analyzeCostRatios.ts
 */

import {
  INPUT_DIR,
  loadAllEntries,
  normalizeName,
  toNumber,
  mean,
  median,
  stddev,
  pct,
  type QuoteEntry,
} from "./lib/quoteUtils"

// ─── 반환 타입 ─────────────────────────────────────────────────

export interface RatioStats {
  count: number
  mean: number
  median: number
  min: number
  max: number
  std: number
}

export interface RangeStats {
  label: string
  count: number
  delivery: RatioStats
  install: RatioStats
}

export interface CostRatioResult {
  totalRecords: number
  withDelivery: number
  withInstall: number
  deliveryAll: RatioStats
  installAll: RatioStats
  deliveryNonZero: RatioStats
  installNonZero: RatioStats
  byRange: RangeStats[]
}

// ─── 내부 헬퍼 ─────────────────────────────────────────────────

interface QuoteRecord {
  supply_total: number
  delivery_sum: number
  install_sum: number
  delivery_ratio: number
  install_ratio: number
}

function calcStats(ratios: number[]): RatioStats {
  if (ratios.length === 0) return { count: 0, mean: 0, median: 0, min: 0, max: 0, std: 0 }
  return {
    count: ratios.length,
    mean: mean(ratios),
    median: median(ratios),
    min: Math.min(...ratios),
    max: Math.max(...ratios),
    std: stddev(ratios),
  }
}

// ─── 분석 함수 ─────────────────────────────────────────────────

export function analyzeCostRatios(entries: QuoteEntry[]): CostRatioResult {
  const records: QuoteRecord[] = []

  for (const { parsed } of entries) {
    const rows = parsed?.data?.rows
    if (!Array.isArray(rows) || rows.length === 0) continue

    let supply_total = toNumber(parsed.data?.supply_total)
    if (supply_total === 0) {
      supply_total = rows.reduce(
        (s, row) => s + toNumber(row.qty) * toNumber(row.unitPrice), 0
      )
    }
    if (supply_total === 0) continue

    let delivery_sum = 0
    let install_sum = 0
    for (const row of rows) {
      const base = normalizeName(String(row.name ?? ""))
      const amount = toNumber(row.qty) * toNumber(row.unitPrice)
      if (base.includes("배송비")) delivery_sum += amount
      else if (base.includes("설치비")) install_sum += amount
    }

    records.push({
      supply_total,
      delivery_sum,
      install_sum,
      delivery_ratio: delivery_sum / supply_total,
      install_ratio: install_sum / supply_total,
    })
  }

  const withDelivery = records.filter((r) => r.delivery_sum > 0)
  const withInstall = records.filter((r) => r.install_sum > 0)

  const ranges = [
    { label: "0 ~ 500만",      min: 0,          max: 5_000_000 },
    { label: "500만 ~ 1000만", min: 5_000_000,  max: 10_000_000 },
    { label: "1000만 이상",    min: 10_000_000, max: Infinity },
  ]

  const byRange: RangeStats[] = ranges.map(({ label, min, max }) => {
    const r = records.filter((rec) => rec.supply_total >= min && rec.supply_total < max)
    return {
      label,
      count: r.length,
      delivery: calcStats(r.map((rec) => rec.delivery_ratio)),
      install: calcStats(r.map((rec) => rec.install_ratio)),
    }
  })

  return {
    totalRecords: records.length,
    withDelivery: withDelivery.length,
    withInstall: withInstall.length,
    deliveryAll: calcStats(records.map((r) => r.delivery_ratio)),
    installAll: calcStats(records.map((r) => r.install_ratio)),
    deliveryNonZero: calcStats(withDelivery.map((r) => r.delivery_ratio)),
    installNonZero: calcStats(withInstall.map((r) => r.install_ratio)),
    byRange,
  }
}

// ─── 출력 함수 ─────────────────────────────────────────────────

function printStatRow(label: string, s: RatioStats) {
  if (s.count === 0) {
    console.log(`  ${label.padEnd(22)}  데이터 없음`)
    return
  }
  console.log(
    `  ${label.padEnd(22)}` +
    `  n=${String(s.count).padStart(4)}` +
    `  평균 ${pct(s.mean).padStart(6)}` +
    `  중앙 ${pct(s.median).padStart(6)}` +
    `  최소 ${pct(s.min).padStart(6)}` +
    `  최대 ${pct(s.max).padStart(6)}` +
    `  σ ${pct(s.std).padStart(5)}`
  )
}

export function printCostRatioResult(result: CostRatioResult) {
  const SEP = "─".repeat(80)

  console.log(`  분석 대상    : ${result.totalRecords}건`)
  console.log(`  배송비 포함  : ${result.withDelivery}건`)
  console.log(`  설치비 포함  : ${result.withInstall}건`)
  console.log(`\n  ${SEP}`)
  console.log(
    `  ${"항목".padEnd(22)}  ${"건수".padStart(6)}  ${"평균".padStart(6)}` +
    `  ${"중앙".padStart(6)}  ${"최소".padStart(6)}  ${"최대".padStart(6)}  ${"σ".padStart(5)}`
  )
  console.log(`  ${SEP}`)
  printStatRow("배송비 (전체)", result.deliveryAll)
  printStatRow("설치비 (전체)", result.installAll)
  printStatRow("배송비 (>0)", result.deliveryNonZero)
  printStatRow("설치비 (>0)", result.installNonZero)

  console.log(`\n  ── 구간별 ──`)
  for (const r of result.byRange) {
    console.log(`\n  [${r.label}]  n=${r.count}`)
    printStatRow("  배송비", r.delivery)
    printStatRow("  설치비", r.install)
  }
}

// ─── 단독 실행 ─────────────────────────────────────────────────

if (process.argv[1]?.includes("analyzeCostRatios")) {
  const entries = loadAllEntries(INPUT_DIR)
  console.log(`\nJSON 파일 수: ${entries.length}개\n`)
  const result = analyzeCostRatios(entries)
  printCostRatioResult(result)
}
