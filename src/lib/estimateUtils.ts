/**
 * 견적용 유틸 — 단순 계산만. 자연어 파싱은 estimateAiService에서.
 * 역산 수식(전역 고정): 마진율 = (판매가 − 원가) / 판매가 × 100;
 * 판매가 = 원가 / (1 − 마진율/100). 모든 역산·반올림은 roundToPriceUnit 적용.
 */

/** 원가 결정의 복합 차원 — [제품명 + 규격(사이즈) + 색상] 3자가 동시에 결합되어 원가가 결정됨. */
export interface CostDimension {
  productName: string
  spec: string | null
  color: string | null
}

/** 복합 키 생성: DB/API 원가 조회·캐시 키용. 제품명|규격|색상 (빈 값은 ''로 통일). */
export function toCostLookupKey(d: CostDimension): string {
  const name = (d.productName ?? '').trim()
  const spec = (d.spec ?? '').trim()
  const color = (d.color ?? '').trim()
  return `${name}|${spec}|${color}`
}

/** 견적 행 한 줄에서 CostDimension 추출 (품명·규격·색상). */
export function rowToCostDimension(row: { name?: string; spec?: string; color?: string }): CostDimension {
  return {
    productName: (row.name ?? '').trim(),
    spec: (row.spec ?? '').trim() || null,
    color: (row.color ?? '').trim() || null,
  }
}

/** 가구 단가·원가 보정: 10만원 미만은 100원 단위, 이상은 1,000원 단위로 반올림. 역산·단가 전역 적용 */
export function roundToPriceUnit(n: number): number {
  if (Number.isNaN(n) || n <= 0) return 0
  if (n >= 100_000) return Math.round(n / 1000) * 1000
  return Math.round(n / 100) * 100
}

/** YYYY-MM-DD 또는 ISO → YY.MM.DD 간결 포맷 (AI 가이드 날짜 표시용) */
export function formatDateYYMMDD(isoOrYmd: string | null | undefined): string {
  const s = (isoOrYmd ?? '').toString().trim()
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1].slice(-2)}.${m[2]}.${m[3]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const y = String(d.getFullYear()).slice(-2)
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${mo}.${day}`
}

/** 마진율 신호등: ≥30% 초록, 25~30% 주황, <25% 빨강. 행·수익 분석기 패널 전역 적용 */
export const MARGIN_SIGNAL_THRESHOLDS = { green: 30, amber: 25 } as const
export function getMarginSignalClass(marginPercent: number): string {
  if (marginPercent >= MARGIN_SIGNAL_THRESHOLDS.green) return 'text-green-600 dark:text-green-400 font-medium'
  if (marginPercent >= MARGIN_SIGNAL_THRESHOLDS.amber) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400 font-bold'
}

/** AI 가이드: 과거 판매가 날짜 색상 (초록 계열) */
export const GUIDE_PAST_DATE_CLASS = 'text-green-600 dark:text-green-400'
/** AI 가이드: 최신 원가 날짜 색상 (파란 계열) */
export const GUIDE_VENDOR_DATE_CLASS = 'text-blue-600 dark:text-blue-400'

/** 금액 문자열 → 원화 숫자. "25만", "25만원", "12", "120000" */
export function parseAmountToWon(raw: string): number {
  const s = String(raw).replace(/,/g, '').trim()
  if (!s) return 0
  const m = s.match(/^([\d.]+)\s*(만\s*원?|만원?)?$/i)
  const num = m ? parseFloat(m[1]) : parseFloat(s)
  if (Number.isNaN(num)) return 0
  const hasMan = m?.[2]
  return hasMan ? Math.round(num * 10000) : (num < 1000 ? Math.round(num * 10000) : Math.round(num))
}

/** 총액 맞춤 — 비례 배분 계수 반환. target/current */
export function scaleFactorToTarget(currentTotal: number, targetTotal: number): number {
  if (currentTotal <= 0) return 1
  return targetTotal / currentTotal
}

/** 총 원가 = Σ(수량 × 원가). costPrice 없으면 0으로 처리. */
export function computeTotalCost(
  rows: { qty: string; costPrice?: string }[],
  parseNum: (s: string) => number
): number {
  return rows.reduce((sum, r) => {
    const q = parseNum(r.qty)
    const c = parseNum(r.costPrice ?? '')
    return sum + q * c
  }, 0)
}

export interface MarginRowInput {
  qty: string
  unitPrice: string
  unitPriceMax?: string
  costPrice?: string
}

export interface MarginRowOutput {
  unitPrice: string
  unitPriceMax?: string
}

/**
 * 마진율 목표에 맞춰 단가 역계산.
 * - 하한선: 단가 >= 원가 (costPrice). 원가 미입력 시 0으로 간주.
 * - 목표 마진율: (총 견적액 - 총 원가) / 총 견적액 * 100.
 * - 조정 후에도 목표 마진율 이하로 떨어지지 않도록 비례 조정 후 행별 하한 클램프.
 */
export function adjustUnitPricesToTargetMargin(
  rows: MarginRowInput[],
  targetMarginPercent: number,
  parseNum: (s: string) => number
): MarginRowOutput[] {
  const clampPct = Math.min(100, Math.max(0, targetMarginPercent)) / 100
  const qtys = rows.map((r) => parseNum(r.qty))
  const unitPrices = rows.map((r) => parseNum(r.unitPrice))
  const unitPricesMax = rows.map((r) => (r.unitPriceMax ? parseNum(r.unitPriceMax) : parseNum(r.unitPrice)))
  const costPrices = rows.map((r) => parseNum(r.costPrice ?? ''))

  const totalCost = qtys.reduce((s, q, i) => s + q * costPrices[i], 0)
  let totalSales = qtys.reduce((s, q, i) => s + q * unitPrices[i], 0)

  if (totalSales <= 0) return rows.map((r) => ({ unitPrice: r.unitPrice, unitPriceMax: r.unitPriceMax }))

  const targetSales = totalCost / (1 - clampPct)
  if (targetSales <= totalCost) return rows.map((r) => ({ unitPrice: r.unitPrice, unitPriceMax: r.unitPriceMax }))

  let scale = targetSales / totalSales
  let newPrices = unitPrices.map((p, i) => roundToPriceUnit(p * scale))
  let newPricesMax = unitPricesMax.map((p, i) => roundToPriceUnit(p * scale))

  const floor = (p: number, i: number) => Math.max(p, costPrices[i])
  newPrices = newPrices.map(floor)
  newPricesMax = newPricesMax.map((p, i) => Math.max(p, costPrices[i], newPrices[i]))

  let newTotal = qtys.reduce((s, q, i) => s + q * newPrices[i], 0)
  if (newTotal < targetSales && newTotal > totalCost) {
    const marginTotal = newTotal - totalCost
    const targetMarginTotal = targetSales - totalCost
    const marginScale = targetMarginTotal / marginTotal
    newPrices = newPrices.map((p, i) => roundToPriceUnit(costPrices[i] + (p - costPrices[i]) * marginScale))
    newPricesMax = newPricesMax.map((p, i) =>
      roundToPriceUnit(costPrices[i] + Math.max(p - costPrices[i], newPrices[i] - costPrices[i]) * marginScale)
    )
  }

  return newPrices.map((p, i) => ({
    unitPrice: String(p),
    unitPriceMax: rows[i].unitPriceMax ? String(newPricesMax[i]) : undefined,
  }))
}
