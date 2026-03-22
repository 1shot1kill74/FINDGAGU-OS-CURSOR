/**
 * calculateEstimate.ts
 *
 * standardPriceTable.v1.json 기반 견적 자동 계산.
 * spec 매칭 실패 시 __BASE__ 중앙값으로 폴백.
 *
 * 실행:
 *   npx tsx scripts/calculateEstimate.ts
 */

import fs from "fs"
import path from "path"
import { normalizeSpec, normalizeName } from "./lib/quoteUtils"

// ─── 경로 ──────────────────────────────────────────────────────

const PRICE_TABLE_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "standardPriceTable.v1.json"
)

// ─── 타입 ──────────────────────────────────────────────────────

export interface EstimateItem {
  base_name: string
  spec: string
  qty: number
}

export interface EstimateRow {
  base_name: string
  spec: string
  qty: number
  unit_price: number
  amount: number
  matched: boolean             // true: spec 또는 base 매칭됨
  matchType: "spec" | "base" | "none"
}

export interface EstimateResult {
  supply_total: number
  delivery_cost: number
  install_cost: number
  vat: number
  grand_total: number
  rows: EstimateRow[]
}

// { base_name → { __BASE__: number, [spec]: number } }
type PriceTable = Record<string, Record<string, number>>

// ─── 요율 상수 (analyzeCostRatios 중앙값 기준) ─────────────────

const RATES = [
  { maxSupply: 5_000_000,  delivery: 0.030, install: 0.070 },
  { maxSupply: 10_000_000, delivery: 0.020, install: 0.060 },
  { maxSupply: Infinity,   delivery: 0.014, install: 0.043 },
] as const

const VAT_RATE = 0.1

// ─── 가격 테이블 로딩 ──────────────────────────────────────────

export function loadPriceMap(): PriceTable {
  if (!fs.existsSync(PRICE_TABLE_PATH)) {
    throw new Error(
      `가격 테이블 없음: ${PRICE_TABLE_PATH}\nnpx tsx scripts/buildPriceTable.ts 먼저 실행하세요.`
    )
  }
  const raw = JSON.parse(fs.readFileSync(PRICE_TABLE_PATH, "utf-8"))

  // v1 (entries 배열) → v2 (prices 객체) 자동 변환
  if (raw.version === "1" && Array.isArray(raw.entries)) {
    const prices: PriceTable = {}
    for (const entry of raw.entries as Array<{ base_name: string; spec: string; avg_price: number }>) {
      const base = normalizeName(entry.base_name)
      const spec = normalizeSpec(entry.spec)
      if (!prices[base]) prices[base] = { __BASE__: entry.avg_price }
      prices[base]![spec] = entry.avg_price
    }
    return prices
  }

  return raw.prices as PriceTable
}

// ─── 단가 조회 (spec → BASE 폴백) ─────────────────────────────

function lookupPrice(
  table: PriceTable,
  base_name: string,
  spec: string
): { unit_price: number; matchType: "spec" | "base" | "none" } {
  const normBase = normalizeName(base_name)
  const normSpec = normalizeSpec(spec)

  const entry = table[normBase]
  if (!entry) return { unit_price: 0, matchType: "none" }

  // 1순위: 규격 정확 매칭
  if (normSpec && entry[normSpec] !== undefined) {
    return { unit_price: entry[normSpec]!, matchType: "spec" }
  }

  // 2순위: __BASE__ 폴백
  if (entry["__BASE__"] !== undefined) {
    return { unit_price: entry["__BASE__"]!, matchType: "base" }
  }

  return { unit_price: 0, matchType: "none" }
}

// ─── 요율 결정 ─────────────────────────────────────────────────

function getRates(supply_total: number): { delivery: number; install: number } {
  for (const rate of RATES) {
    if (supply_total < rate.maxSupply) {
      return { delivery: rate.delivery, install: rate.install }
    }
  }
  return { delivery: RATES[2].delivery, install: RATES[2].install }
}

// ─── 핵심 계산 함수 ────────────────────────────────────────────

export function calculateEstimate(
  items: EstimateItem[],
  priceTable: PriceTable
): EstimateResult {
  const rows: EstimateRow[] = items.map((item) => {
    const { unit_price, matchType } = lookupPrice(priceTable, item.base_name, item.spec)
    return {
      base_name: item.base_name,
      spec: item.spec,
      qty: item.qty,
      unit_price,
      amount: item.qty * unit_price,
      matched: matchType !== "none",
      matchType,
    }
  })

  const supply_total = rows.reduce((s, r) => s + r.amount, 0)
  const { delivery, install } = getRates(supply_total)

  const delivery_cost = Math.round(supply_total * delivery)
  const install_cost  = Math.round(supply_total * install)
  const vat           = Math.round(supply_total * VAT_RATE)
  const grand_total   = supply_total + delivery_cost + install_cost + vat

  return { supply_total, delivery_cost, install_cost, vat, grand_total, rows }
}

// ─── 출력 ──────────────────────────────────────────────────────

function printResult(result: EstimateResult) {
  const w = (n: number) => n.toLocaleString("ko-KR")
  const SEP = "─".repeat(76)

  const matchLabel: Record<EstimateRow["matchType"], string> = {
    spec: "✓ spec",
    base: "△ base",
    none: "✗ 미등록",
  }

  console.log(`\n${SEP}`)
  console.log(" 품목별 단가")
  console.log(SEP)
  console.log(
    `  ${"제품명".padEnd(22)}  ${"규격".padEnd(22)}` +
    `  ${"수량".padStart(4)}  ${"단가".padStart(10)}  ${"금액".padStart(12)}  ${"조회"}`
  )
  console.log(`  ${SEP}`)

  for (const r of result.rows) {
    const name = r.base_name.length > 16 ? r.base_name.slice(0, 15) + "…" : r.base_name
    const spec = r.spec.length > 20     ? r.spec.slice(0, 19) + "…"      : r.spec
    console.log(
      `  ${name.padEnd(22)}  ${spec.padEnd(22)}` +
      `  ${String(r.qty).padStart(4)}  ${w(r.unit_price).padStart(10)}` +
      `  ${w(r.amount).padStart(12)}  ${matchLabel[r.matchType]}`
    )
  }

  console.log(`\n${SEP}`)
  console.log(" 견적 합계")
  console.log(SEP)
  console.log(`  공급가액   : ${w(result.supply_total).padStart(14)}`)
  console.log(`  배송비     : ${w(result.delivery_cost).padStart(14)}`)
  console.log(`  설치비     : ${w(result.install_cost).padStart(14)}`)
  console.log(`  부가세(10%): ${w(result.vat).padStart(14)}`)
  console.log(`  ${"─".repeat(32)}`)
  console.log(`  최종 합계  : ${w(result.grand_total).padStart(14)}`)
  console.log(SEP)

  const none = result.rows.filter((r) => r.matchType === "none")
  const base = result.rows.filter((r) => r.matchType === "base")
  if (base.length > 0) console.log(`\n  △ BASE 폴백 ${base.length}개: ${base.map((r) => r.base_name).join(", ")}`)
  if (none.length > 0) console.log(`  ✗ 미등록 ${none.length}개: ${none.map((r) => r.base_name).join(", ")}`)
  console.log()
}

// ─── 테스트 실행 ───────────────────────────────────────────────

const SAMPLE_INPUT: EstimateItem[] = [
  { base_name: "스마트D",         spec: "W900*D600*H740", qty: 20 },
  { base_name: "스마트D",         spec: "W800*H1200/18T", qty: 20 },
  { base_name: "스마트B 조명",    spec: "아이클 351F",     qty: 20 },
  { base_name: "2구 콘센트기본형", spec: "기구 + 타공",    qty: 20 },
  { base_name: "올데이 책상",     spec: "W1068*D700*H1200", qty: 10 }, // BASE 폴백 테스트
]

const priceTable = loadPriceMap()
const productCount = Object.keys(priceTable).length
console.log(`\n가격 테이블 로드: ${productCount}개 제품`)

const result = calculateEstimate(SAMPLE_INPUT, priceTable)
printResult(result)
