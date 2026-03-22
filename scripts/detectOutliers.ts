/**
 * detectOutliers.ts
 *
 * 이상치 감지:
 *   ① VAT 오차 5% 이상 케이스
 *   ② 평균 대비 2배 이상 / 50% 미만 단가 케이스
 *
 * 실행:
 *   npx tsx scripts/detectOutliers.ts
 */

import {
  INPUT_DIR,
  loadAllEntries,
  normalizeName,
  normalizeSpec,
  toNumber,
  pct,
  won,
  type QuoteEntry,
} from "./lib/quoteUtils"
import type { PriceGroup } from "./analyzeUnitPriceBySpec"

// ─── 상수 ──────────────────────────────────────────────────────

const VAT_RATE = 0.1
const VAT_ERROR_THRESHOLD = 0.05  // 5% 이상 오차
const PRICE_RATIO_HIGH = 2.0      // 평균 대비 2배 이상
const PRICE_RATIO_LOW = 0.5       // 평균 대비 50% 미만

// ─── 반환 타입 ─────────────────────────────────────────────────

export interface VatOutlier {
  source: string
  supply_total: number
  grand_total: number
  expected_vat: number  // supply_total × 0.1
  actual_vat: number    // grand_total - supply_total
  error_rate: number    // |actual - expected| / supply_total
}

export interface PriceOutlier {
  source: string
  base_name: string
  spec: string
  unit_price: number
  avg_price: number
  ratio: number  // unit_price / avg_price
}

export interface OutlierResult {
  vatOutliers: VatOutlier[]
  priceOutliers: PriceOutlier[]
}

// ─── 감지 함수 ─────────────────────────────────────────────────

export function detectOutliers(
  entries: QuoteEntry[],
  priceGroups: PriceGroup[]
): OutlierResult {
  const vatOutliers: VatOutlier[] = []
  const priceOutliers: PriceOutlier[] = []

  // 단가 기준 맵 구성
  const priceMap = new Map<string, PriceGroup>()
  for (const g of priceGroups) {
    priceMap.set(`${g.base_name}|||${g.spec}`, g)
  }

  for (const { filePath, parsed } of entries) {
    const data = parsed?.data
    if (!data) continue

    const rows = data.rows

    // supply_total 결정 (저장값 우선, 없으면 재계산)
    let supply_total = toNumber(data.supply_total)
    if (supply_total === 0 && Array.isArray(rows)) {
      supply_total = rows.reduce(
        (s, r) => s + toNumber(r.qty) * toNumber(r.unitPrice), 0
      )
    }

    const grand_total = toNumber(data.grand_total)

    // ① VAT 오차 감지
    if (supply_total > 0 && grand_total > supply_total) {
      const expected_vat = supply_total * VAT_RATE
      const actual_vat = grand_total - supply_total
      const error_rate = Math.abs(actual_vat - expected_vat) / supply_total

      if (error_rate > VAT_ERROR_THRESHOLD) {
        vatOutliers.push({
          source: filePath,
          supply_total,
          grand_total,
          expected_vat,
          actual_vat,
          error_rate,
        })
      }
    }

    // ② 단가 이상치 감지
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const rawName = String(row.name ?? "").trim()
        const rawSpec = String(row.spec ?? "").trim()
        const unit_price = toNumber(row.unitPrice)

        if (!rawName || unit_price <= 0) continue

        const base_name = normalizeName(rawName)
        const spec = normalizeSpec(rawSpec)
        const group = priceMap.get(`${base_name}|||${spec}`)
        if (!group || group.avg_price <= 0) continue

        const ratio = unit_price / group.avg_price
        if (ratio >= PRICE_RATIO_HIGH || ratio <= PRICE_RATIO_LOW) {
          priceOutliers.push({
            source: filePath,
            base_name,
            spec,
            unit_price,
            avg_price: group.avg_price,
            ratio,
          })
        }
      }
    }
  }

  // 오차율 / 배율 기준 내림차순 정렬
  vatOutliers.sort((a, b) => b.error_rate - a.error_rate)
  priceOutliers.sort((a, b) => b.ratio - a.ratio)

  return { vatOutliers, priceOutliers }
}

// ─── 출력 함수 ─────────────────────────────────────────────────

export function printOutlierResult(result: OutlierResult) {
  const { vatOutliers, priceOutliers } = result
  const SEP = "─".repeat(80)

  console.log(`  VAT 오차 5% 이상  : ${vatOutliers.length}건`)
  console.log(`  단가 이상치       : ${priceOutliers.length}건`)

  if (vatOutliers.length > 0) {
    console.log(`\n  ── VAT 오차 상위 10건 ──`)
    console.log(
      `  ${"공급가액".padStart(13)}  ${"합계".padStart(13)}` +
      `  ${"예상VAT".padStart(12)}  ${"실제VAT".padStart(12)}  ${"오차율".padStart(7)}`
    )
    console.log(`  ${SEP}`)
    vatOutliers.slice(0, 10).forEach((v) =>
      console.log(
        `  ${won(v.supply_total).padStart(13)}` +
        `  ${won(v.grand_total).padStart(13)}` +
        `  ${won(v.expected_vat).padStart(12)}` +
        `  ${won(v.actual_vat).padStart(12)}` +
        `  ${pct(v.error_rate).padStart(7)}`
      )
    )
  }

  if (priceOutliers.length > 0) {
    console.log(`\n  ── 단가 이상치 상위 10건 ──`)
    console.log(
      `  ${"제품명".padEnd(20)}  ${"단가".padStart(12)}` +
      `  ${"평균".padStart(12)}  ${"배율".padStart(6)}`
    )
    console.log(`  ${SEP}`)
    priceOutliers.slice(0, 10).forEach((p) => {
      const name = p.base_name.length > 14 ? p.base_name.slice(0, 13) + "…" : p.base_name
      console.log(
        `  ${name.padEnd(20)}` +
        `  ${won(p.unit_price).padStart(12)}` +
        `  ${won(p.avg_price).padStart(12)}` +
        `  ${p.ratio.toFixed(1).padStart(5)}x`
      )
    })
  }
}

// ─── 단독 실행 ─────────────────────────────────────────────────

if (process.argv[1]?.includes("detectOutliers")) {
  const { analyzeUnitPriceBySpec } = await import("./analyzeUnitPriceBySpec")
  const entries = loadAllEntries(INPUT_DIR)
  console.log(`\nJSON 파일 수: ${entries.length}개\n`)
  const priceResult = analyzeUnitPriceBySpec(entries)
  const result = detectOutliers(entries, priceResult.groups)
  printOutlierResult(result)
}
