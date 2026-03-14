/**
 * autoEstimate.ts
 *
 * Browser-compatible estimate calculation engine.
 * Mirrors scripts/calculateEstimate.ts + scripts/lib/quoteUtils.ts
 * — Node.js fs/path 없이 fetch 기반으로 가격 테이블 로드.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutoEstimateItem {
  id: string
  base_name: string
  spec: string
  qty: number
}

export interface AutoEstimateRow {
  id: string
  base_name: string
  spec: string
  qty: number
  unit_price: number
  amount: number
  matchType: 'spec' | 'base' | 'none'
}

export interface AutoEstimateResult {
  supply_total: number
  delivery_cost: number
  delivery_rate: number
  install_cost: number
  install_rate: number
  vat: number
  grand_total: number
  rows: AutoEstimateRow[]
}

export type PriceTable = Record<string, Record<string, number>>

// ─── Rate constants (scripts/calculateEstimate.ts 기준 중앙값) ───────────────

const RATES = [
  { maxSupply: 5_000_000,  delivery: 0.030, install: 0.070 },
  { maxSupply: 10_000_000, delivery: 0.020, install: 0.060 },
  { maxSupply: Infinity,   delivery: 0.014, install: 0.043 },
] as const

const VAT_RATE = 0.1

// ─── Normalization (scripts/lib/quoteUtils.ts 동일 로직) ────────────────────

export function normalizeName(raw: string): string {
  const slashIdx = raw.indexOf('/')
  let base = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw
  base = base.replace(/[()（）[\]]/g, '').trim().replace(/\s+/g, ' ')
  return base
}

export function normalizeSpec(raw: string): string {
  return raw
    .replace(/[()（）[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// ─── Price lookup ────────────────────────────────────────────────────────────

function lookupPrice(
  table: PriceTable,
  base_name: string,
  spec: string,
): { unit_price: number; matchType: 'spec' | 'base' | 'none' } {
  const normBase = normalizeName(base_name)
  const normSpec = normalizeSpec(spec)
  const entry = table[normBase]
  if (!entry) return { unit_price: 0, matchType: 'none' }
  if (normSpec && entry[normSpec] !== undefined) {
    return { unit_price: entry[normSpec]!, matchType: 'spec' }
  }
  if (entry['__BASE__'] !== undefined) {
    return { unit_price: entry['__BASE__']!, matchType: 'base' }
  }
  return { unit_price: 0, matchType: 'none' }
}

function getRates(supply_total: number): { delivery: number; install: number } {
  for (const rate of RATES) {
    if (supply_total < rate.maxSupply) {
      return { delivery: rate.delivery, install: rate.install }
    }
  }
  return { delivery: RATES[2].delivery, install: RATES[2].install }
}

// ─── Core calculation ────────────────────────────────────────────────────────

export function calculateAutoEstimate(
  items: AutoEstimateItem[],
  priceTable: PriceTable,
): AutoEstimateResult {
  const rows: AutoEstimateRow[] = items.map((item) => {
    const { unit_price, matchType } = lookupPrice(priceTable, item.base_name, item.spec)
    return {
      id: item.id,
      base_name: item.base_name,
      spec: item.spec,
      qty: item.qty,
      unit_price,
      amount: item.qty * unit_price,
      matchType,
    }
  })

  const supply_total = rows.reduce((s, r) => s + r.amount, 0)
  const { delivery, install } = getRates(supply_total)

  const delivery_cost = Math.round(supply_total * delivery)
  const install_cost  = Math.round(supply_total * install)
  const vat           = Math.round(supply_total * VAT_RATE)
  const grand_total   = supply_total + delivery_cost + install_cost + vat

  return { supply_total, delivery_cost, delivery_rate: delivery, install_cost, install_rate: install, vat, grand_total, rows }
}

// ─── Price table loading (browser, fetch 기반) ───────────────────────────────

let _cache: PriceTable | null = null

/**
 * priceTable.meta.json → latest 버전 확인 → standardPriceTable.v{latest}.json 로드.
 * meta.json 없거나 실패 시 v1 폴백.
 * 세션 내 캐시: 모듈 스코프 변수, 페이지 새로고침 시 초기화.
 */
export async function loadPriceTable(): Promise<PriceTable> {
  if (_cache) return _cache

  // 1. meta.json에서 최신 버전 번호 확인
  let version = 1
  try {
    const metaRes = await fetch('/data/priceTable.meta.json')
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { latest: number; updatedAt: string }
      if (typeof meta.latest === 'number' && meta.latest >= 1) {
        version = meta.latest
      }
    }
  } catch {
    // meta.json 취득 실패 → v1 폴백
  }

  // 2. 해당 버전 파일 로드
  const res = await fetch(`/data/standardPriceTable.v${version}.json`)
  if (!res.ok) throw new Error(`가격 테이블 로드 실패 (v${version}, ${res.status})`)
  const raw = (await res.json()) as { version: string; prices: PriceTable }
  _cache = raw.prices
  return _cache
}

// ─── Query helpers ───────────────────────────────────────────────────────────

/** 가격 테이블의 모든 제품명 목록 (정렬) */
export function getProductNames(priceTable: PriceTable): string[] {
  return Object.keys(priceTable).sort()
}

/** 특정 제품의 등록된 규격 목록 (__BASE__ 제외) */
export function getSpecsForProduct(priceTable: PriceTable, baseName: string): string[] {
  const normBase = normalizeName(baseName)
  const entry = priceTable[normBase]
  if (!entry) return []
  return Object.keys(entry).filter((k) => k !== '__BASE__')
}
