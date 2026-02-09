/**
 * AI 견적 도우미 — 프롬프트 기반 파싱 (LLM API 연동 준비)
 * 자연어 → 구조화된 JSON. 실제 서버 /api/ai-estimate 호출 후 실패 시 Mock 폴백.
 */

import { parseAmountToWon, roundToPriceUnit } from './estimateUtils'

export type QuickCommandResult =
  | { type: 'add_row'; name: string; qty: number; unitPrice: number; spec: string | null; color: string | null; is_uncertain?: boolean; ai_reason?: string }
  | { type: 'past_price'; productName: string }
  | { type: 'target_total'; amount: number }
  | { type: 'target_margin'; marginPercent: number }
  | { type: 'needs_unit_price'; name: string; qty: number }
  | { type: 'needs_spec'; name: string; qty: number; unitPrice: number; specQuestion?: string }
  | { type: 'spec_reply'; spec: string | null; color?: string | null }
  | { type: 'unknown' }
  | null

// ——— 시스템 프롬프트 (LLM API 활용: 모든 판단은 AI 추론 결과 JSON에 의존) ———
export const ESTIMATE_SYSTEM_PROMPT = `너는 가구 전문가의 비서야. 사용자 자연어에서 [제품명, 규격(사이즈), 색상, 수량, 단가]를 추출해 JSON으로만 답해.

[원가 결정의 복합 원리]
- 원가는 [사이즈(규격)]와 [색상]이 동시에 결합되어 결정된다. (예: 1200 사이즈라도 화이트냐 우드냐에 따라 원가가 다름)
- DB에서 원가를 찾을 때는 제품명만이 아니라 [제품명 + 가장 근접한 규격 + 색상] 3가지 조합이 일치하는 레코드를 찾아야 한다.

[추출 규칙]
- 제품명: 가구/자재 이름 (예: 스마트A, 올데이B, 책상, 의자).
- 규격: 치수·사양. 1200 600 720 → "1200×600×720". 없으면 null.
- 색상: 모번, 화이트, 그레이, 블랙 등. 없으면 null.
- 수량: "5개", "10대" → 5, 10.
- 단가: "15만", "12만원" → 150000, 120000.

[AI 추론 및 보정]
- 입력된 조합(예: 1250×600, 블랙)이 DB에 없으면, 임의로 판단하지 말고 ai_reason에 **어떤 변수를 어떻게 보정했는지** 구체적으로 명시해.
  예: "규격은 1200으로, 색상은 가장 유사한 다크그레이로 제안합니다"
- 정보가 하나라도 매칭되지 않거나 보정이 일어났으면 **무조건 is_uncertain: true** 를 반환해.
- ai_reason 형식: "규격 … / 색상 …" 처럼 어떤 변수(사이즈·색상) 때문에 보정됐는지 직관적으로 드러나게 써.

응답은 반드시 아래 JSON 하나만 출력. 다른 설명 금지.
{"requestType":"...", "name": "... 또는 null", "spec": "... 또는 null", "color": "... 또는 null", "qty": 숫자 또는 null, "unitPrice": 숫자 또는 null, "amount": 숫자 또는 null, "productName": "... 또는 null", "marginPercent": 숫자 또는 null, "is_uncertain": true 또는 false, "ai_reason": "구체적 보정 설명(규격/색상 중 어떤 변수 보정)" 또는 null}

- 견적 행 추가: requestType "add_row", name/spec/color/qty/unitPrice 채움. 보정 시 is_uncertain: true, ai_reason 필수.
- 이전 단가: requestType "past_price", productName 채움. (실제 조회 시 제품명+규격+색상 복합 키 사용 권장)
- 총액 맞춤: requestType "target_total", amount(원화).
- 마진율 맞춤: requestType "target_margin", marginPercent(0~100).
- 규격 필요: requestType "needs_spec", name, qty, unitPrice.
- 단가 필요: requestType "needs_unit_price", name, qty.
- 판단 불가: requestType "unknown".`

// ——— Few-shot 예시 (순서 뒤죽박죽·비정형 입력도 인식) ———
export const ESTIMATE_FEW_SHOT_EXAMPLES: { input: string; output: string }[] = [
  {
    input: '책상 5개 1200짜리 15만원에',
    output: '{"requestType":"add_row","name":"책상","spec":"1200","color":null,"qty":5,"unitPrice":150000,"amount":null,"productName":null}',
  },
  {
    input: '15만원에 책상 5개 1200 600 720',
    output: '{"requestType":"add_row","name":"책상","spec":"1200×600×720","color":null,"qty":5,"unitPrice":150000,"amount":null,"productName":null}',
  },
  {
    input: '스마트A 1200 600 모번 10개 15만',
    output: '{"requestType":"add_row","name":"스마트A","spec":"1200×600","color":"모번","qty":10,"unitPrice":150000,"amount":null,"productName":null}',
  },
  {
    input: '의자 10대 12만',
    output: '{"requestType":"add_row","name":"의자","spec":null,"color":null,"qty":10,"unitPrice":120000,"amount":null,"productName":null}',
  },
  {
    input: '이전 책상 단가',
    output: '{"requestType":"past_price","name":null,"spec":null,"color":null,"qty":null,"unitPrice":null,"amount":null,"productName":"책상"}',
  },
  {
    input: '총액 500만원에 맞춰',
    output: '{"requestType":"target_total","name":null,"spec":null,"color":null,"qty":null,"unitPrice":null,"amount":5000000,"productName":null}',
  },
  {
    input: '책상 3개 20만원',
    output: '{"requestType":"needs_spec","name":"책상","spec":null,"color":null,"qty":3,"unitPrice":200000,"amount":null,"productName":null}',
  },
  {
    input: '칸막이 2개',
    output: '{"requestType":"needs_unit_price","name":"칸막이","spec":null,"color":null,"qty":2,"unitPrice":null,"amount":null,"productName":null}',
  },
  {
    input: '마진율 25%에 맞춰서 단가 조정해줘',
    output: '{"requestType":"target_margin","name":null,"spec":null,"color":null,"qty":null,"unitPrice":null,"amount":null,"productName":null,"marginPercent":25}',
  },
]

/**
 * 규격 문자열 → "1200×600×720" 형식. x72x2 등 숫자 꼬임 방지.
 * - 공백/쉼표로 구분된 3~4자리 숫자만 사용, 2자리·잘못된 토큰 제외.
 */
function parseSpecToFormat(s: string): string | null {
  const t = String(s).trim().replace(/\s+/g, ' ')
  if (!t || /^없음\s*$/i.test(t)) return null
  const bySpace = t
    .split(/[\s,]+/)
    .map((x) => parseInt(x.replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n) && n >= 100 && n <= 9999)
  if (bySpace.length >= 2) return bySpace.slice(0, 3).join('×')
  const digitsOnly = t.replace(/\D/g, '')
  const chunks = digitsOnly.match(/\d{3,4}/g)
  if (chunks && chunks.length >= 2) return chunks.slice(0, 3).join('×')
  return null
}

/** 품목에 맞는 규격 질문 문구 생성 (지능화된 되묻기) */
export function getSpecQuestionForItem(name: string): string {
  const n = (name || '').trim().toLowerCase()
  if (n.includes('책상') || n.includes('테이블') || n.includes('데스크'))
    return `${name}인데 사이즈(가로×세로×높이 mm)는 1200×600×720으로 할까요?`
  if (n.includes('의자') || n.includes('좌석'))
    return `${name}인데 치수(가로×세로×높이 mm)는 500×500×450으로 할까요?`
  if (n.includes('책장') || n.includes('랙') || n.includes('선반'))
    return `${name}인데 규격(가로×세로×높이 mm)은 900×300×1800 정도로 할까요?`
  if (n.includes('칸막이') || n.includes('파티션'))
    return `${name}인데 두께·높이(mm)는 50×1200으로 할까요?`
  if (n.includes('수납') || n.includes('장'))
    return `${name}인데 규격(WDH mm)은 800×400×600으로 할까요?`
  return `${name}의 규격(치수·사양)을 알려주실래요? (예: 1200 600 720 / 없으면 '없음')`
}

const API_ENDPOINT = '/api/ai-estimate'

/** 실제 서버 API 호출 — 추후 LLM 연동 시 이 엔드포인트에서 처리 */
export async function callAiEstimateApi(
  text: string,
  context?: { pendingSpec?: boolean }
): Promise<QuickCommandResult> {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text.trim(),
      context,
      systemPrompt: ESTIMATE_SYSTEM_PROMPT,
      fewShotExamples: ESTIMATE_FEW_SHOT_EXAMPLES,
    }),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = (await res.json()) as QuickCommandResult | Record<string, unknown>
  if (data && typeof data === 'object' && 'requestType' in data && !('type' in data))
    return normalizeApiResult(data as Record<string, unknown>)
  return data as QuickCommandResult
}

/** API 응답 JSON → QuickCommandResult 정규화 */
function normalizeApiResult(raw: Record<string, unknown>): QuickCommandResult {
  const req = String(raw?.requestType ?? '').toLowerCase()
  const name = raw.name != null ? String(raw.name).trim() : ''
  const spec = raw.spec != null && raw.spec !== '' ? String(raw.spec).trim() : null
  const qty = typeof raw.qty === 'number' ? raw.qty : parseInt(String(raw.qty || ''), 10)
  const unitPrice = typeof raw.unitPrice === 'number' ? raw.unitPrice : parseInt(String(raw.unitPrice || ''), 10)
  const amount = typeof raw.amount === 'number' ? raw.amount : parseInt(String(raw.amount || ''), 10)
  const productName = raw.productName != null ? String(raw.productName).trim() : ''

  const color = raw.color != null && raw.color !== '' ? String(raw.color).trim() : null
  const isUncertain = raw.is_uncertain === true
  const aiReason = raw.ai_reason != null && String(raw.ai_reason).trim() !== '' ? String(raw.ai_reason).trim() : undefined
  if (req === 'add_row' && name && !Number.isNaN(qty) && qty > 0 && !Number.isNaN(unitPrice) && unitPrice > 0)
    return { type: 'add_row', name, qty, unitPrice, spec: spec || null, color, is_uncertain: isUncertain, ai_reason: aiReason }
  if (req === 'past_price' && productName) return { type: 'past_price', productName }
  if (req === 'target_total' && !Number.isNaN(amount) && amount > 0) return { type: 'target_total', amount }
  const marginPercent = typeof raw.marginPercent === 'number' ? raw.marginPercent : parseFloat(String(raw.marginPercent || ''))
  if (req === 'target_margin' && !Number.isNaN(marginPercent) && marginPercent >= 0 && marginPercent <= 100)
    return { type: 'target_margin', marginPercent }
  if (req === 'needs_spec' && name && !Number.isNaN(qty) && !Number.isNaN(unitPrice))
    return { type: 'needs_spec', name, qty, unitPrice, specQuestion: getSpecQuestionForItem(name) }
  if (req === 'needs_unit_price' && name && !Number.isNaN(qty) && qty > 0)
    return { type: 'needs_unit_price', name, qty }
  return { type: 'unknown' }
}

/** Mock: API 없을 때 프롬프트 구조와 동일한 형식으로 동작 (Few-shot 스타일 대체) */
function mockParseWithPromptStyle(text: string): QuickCommandResult {
  const t = text.trim()
  if (!t) return null

  if (/이전\s+.+\s+단가/i.test(t)) {
    const name = t.replace(/이전\s+/, '').replace(/\s+단가.*/, '').trim()
    return name ? { type: 'past_price', productName: name } : null
  }
  if (/총액\s+.+\s*에\s*맞춰/i.test(t)) {
    const amt = parseAmountToWon(t.replace(/총액\s+/, '').replace(/\s*에\s*맞춰.*/, '').trim())
    return amt > 0 ? { type: 'target_total', amount: amt } : null
  }
  const marginMatch = t.match(/마진율\s*(\d+(?:\.\d+)?)\s*%?\s*(에\s*맞춰|맞춰서|조정)/i)
  if (marginMatch) {
    const pct = parseFloat(marginMatch[1])
    if (!Number.isNaN(pct) && pct >= 0 && pct <= 100) return { type: 'target_margin', marginPercent: pct }
  }

  // 비정형 패턴: "책상 5개 1200짜리 15만원에" 등 — 숫자/금액/개 추출 시도
  const priceMatch = t.match(/([\d.]+)\s*(만\s*원?|만원?)?/gi)
  const numMatches = t.match(/\d+/g)
  const qtyFromWord = t.match(/(\d+)\s*개|대|ea|매/)?.[1]
  const qty = qtyFromWord ? parseInt(qtyFromWord, 10) : numMatches ? parseInt(numMatches[0], 10) : 0
  const price = parseAmountToWon(
    priceMatch ? priceMatch[priceMatch.length - 1]?.trim() ?? t : t
  )
  const beforeQtyPrice = t.replace(/\d+\s*개|\d+\s*대|[\d,.\s만원]+$/gi, ' ').trim()
  const parts = beforeQtyPrice.split(/\s+/).filter(Boolean)
  const possibleName = parts[0] ?? ''
  const numericParts = parts.filter((p) => /^\d+$/.test(p))
  let spec = parseSpecToFormat(numericParts.join(' '))
  const nonNumParts = parts.filter((p) => !/^\d+$/.test(p))
  const colorToken = nonNumParts.length > 1 ? nonNumParts[nonNumParts.length - 1] ?? null : null
  if (possibleName && qty > 0 && price > 0) {
    if (spec) {
      const partsCount = spec.split('×').length
      const missingHeight = partsCount === 2
      const missingColor = !colorToken
      const isUncertain = missingHeight || missingColor
      const reasons: string[] = []
      if (missingHeight) reasons.push('규격 높이 누락, 720mm 보정 (테스트)')
      if (missingColor) reasons.push('색상 미입력 (테스트)')
      return {
        type: 'add_row',
        name: possibleName,
        qty,
        unitPrice: price,
        spec,
        color: colorToken,
        ...(isUncertain ? { is_uncertain: true as const, ai_reason: reasons.join(' · ') } : {}),
      }
    }
    if (numericParts.length === 1) {
      const oneSpec = numericParts[0] ?? ''
      return {
        type: 'add_row',
        name: possibleName,
        qty,
        unitPrice: price,
        spec: oneSpec,
        color: colorToken,
        is_uncertain: true,
        ai_reason: '규격이 한 개만 있어 1200×600으로 보정함 (테스트)',
      }
    }
    return {
      type: 'needs_spec',
      name: possibleName,
      qty,
      unitPrice: price,
      specQuestion: getSpecQuestionForItem(possibleName),
    }
  }
  if (possibleName && qty > 0)
    return { type: 'needs_unit_price', name: possibleName, qty }

  return { type: 'unknown' }
}

// ——— 과거 사례 기반 추천 (AI는 검색 도우미, 최종 선택은 사용자) ———

/** 품명·사이즈·색상 일치/불일치 — 담당자가 선택·수정 판단에 참고 */
export interface MatchStatus {
  name: boolean
  size: boolean
  color: boolean
}

/** 추천 케이스 한 건 — 사용자 선택 시 견적 행에 바인딩 */
export interface PastCaseRecommendation {
  case_id: string
  /** 과거사례 품명 (카드 제목용) */
  name: string
  /** 과거사례 규격(사이즈) — 카드에 품명·사이즈·색상 모두 표시 */
  size: string | null
  /** 과거사례 색상 */
  color: string | null
  /** 종전 단가(판매가) — 원가 없을 때 바인딩용 */
  price: number
  /** 품명·사이즈·색상 각각 일치/불일치 */
  matchStatus: MatchStatus
  /** 종전 원가 — 카드 표시·행 바인딩용 */
  costPrice?: number
  /** 과거 견적 원본보기용 (과거 이력일 때만) */
  consultation_id?: string
  estimate_id?: string
  /** 적용 날짜 (YY.MM.DD 표시용, 견적일/발행일) */
  appliedDate?: string
  /** 현장명/수신자명 (표시용) */
  siteName?: string
}

/** 검색 후보 한 건 (과거 견적 행 또는 제품 마스터) */
export interface PastCaseCandidate {
  case_id: string
  name: string
  spec: string | null
  color: string | null
  unitPrice: number
  costPrice?: number
  /** 과거 견적 원본보기용 */
  consultation_id?: string
  estimate_id?: string
  /** 적용 날짜 (ISO 또는 YYYY-MM-DD) */
  appliedDate?: string
  /** 현장명/수신자명 */
  siteName?: string
}

function normalizeSpecForCompare(s: string | null): string {
  if (!s || !String(s).trim()) return ''
  return String(s)
    .trim()
    .replace(/\s*[×xX]\s*/g, '×')
    .replace(/\s+/g, '×')
    .toLowerCase()
}

function normalizeNameForCompare(s: string): string {
  return String(s).trim().toLowerCase()
}

function colorSimilarity(a: string | null, b: string | null): 'same' | 'similar' | 'diff' {
  const x = (a ?? '').trim().toLowerCase()
  const y = (b ?? '').trim().toLowerCase()
  if (!x || !y) return x === y ? 'same' : 'diff'
  if (x === y) return 'same'
  if (x.includes(y) || y.includes(x)) return 'similar'
  const dark = ['블랙', 'black', '다크', 'dark', '네이비', 'navy']
  const light = ['화이트', 'white', '아이보리', 'ivory']
  const gray = ['그레이', '그레이', 'gray', '실버', 'silver']
  const has = (list: string[], v: string) => list.some((k) => v.includes(k))
  if ((has(dark, x) && has(dark, y)) || (has(light, x) && has(light, y)) || (has(gray, x) && has(gray, y)))
    return 'similar'
  return 'diff'
}

/**
 * [제품명 + 규격 + 색상] 기준으로 과거 사례·제품 마스터 검색.
 * 1) 100% 일치 케이스 우선, 2) 없으면 규격/색상 유사 TOP 3.
 * AI는 결정권자가 아니라 검색 도우미 — 반환된 목록은 사용자 선택용.
 */
export function searchPastCaseRecommendations(params: {
  name: string
  spec: string | null
  color: string | null
  products: { name: string; supply_price?: number; spec?: string; color?: string }[]
  pastCaseRows: PastCaseCandidate[]
}): PastCaseRecommendation[] {
  const { name, spec, color, products, pastCaseRows } = params
  const qName = normalizeNameForCompare(name)
  const qSpec = normalizeSpecForCompare(spec)
  const qColor = (color ?? '').trim().toLowerCase()

  const out: PastCaseRecommendation[] = []
  const exactMatch: PastCaseRecommendation[] = []

  for (const row of pastCaseRows) {
    const rName = normalizeNameForCompare(row.name)
    const rSpec = normalizeSpecForCompare(row.spec)
    const rColor = (row.color ?? '').trim().toLowerCase()
    const nameMatch = rName === qName || (qName && rName.includes(qName)) || (rName && qName.includes(rName))
    if (!nameMatch) continue
    const specSame = !qSpec || !rSpec ? qSpec === rSpec : qSpec === rSpec
    const colorMatch = colorSimilarity(color, row.color) === 'same' || colorSimilarity(color, row.color) === 'similar'
    const price = row.unitPrice > 0 ? row.unitPrice : (row.costPrice ?? 0) > 0 ? roundToPriceUnit((row.costPrice ?? 0) / (1 - 0.3)) : 0
    const rec: PastCaseRecommendation = {
      case_id: row.case_id,
      name: row.name.trim(),
      size: row.spec?.trim() || null,
      color: row.color?.trim() || null,
      price,
      matchStatus: { name: true, size: specSame, color: colorMatch },
      costPrice: row.costPrice,
      consultation_id: row.consultation_id,
      estimate_id: row.estimate_id,
      appliedDate: row.appliedDate,
      siteName: row.siteName,
    }
    if (specSame && colorMatch) exactMatch.push(rec)
    else out.push(rec)
  }

  for (const p of products) {
    const rName = normalizeNameForCompare(p.name)
    if (rName !== qName && !qName.includes(rName) && !rName.includes(qName)) continue
    const supplyPrice = Number(p.supply_price) > 0 ? Number(p.supply_price) : 0
    if (supplyPrice <= 0) continue
    const price = roundToPriceUnit(supplyPrice / (1 - 0.3))
    const pSpec = (p.spec ?? '').trim() || null
    const pColor = (p.color ?? '').trim() || null
    const specSame = !qSpec || !pSpec ? qSpec === pSpec : normalizeSpecForCompare(pSpec) === qSpec
    const colorMatch = pColor && qColor ? colorSimilarity(color, pColor) !== 'diff' : !qColor && !pColor
    const rec: PastCaseRecommendation = {
      case_id: `product-${p.name}`,
      name: p.name.trim(),
      size: pSpec,
      color: pColor,
      price,
      matchStatus: { name: true, size: specSame, color: colorMatch },
      costPrice: supplyPrice,
    }
    if (!qSpec && !qColor) exactMatch.push(rec)
    else out.push(rec)
  }

  const dedupe = (arr: PastCaseRecommendation[]) => {
    const seen = new Set<string>()
    return arr.filter((r) => {
      const key = `${r.name}|${r.size ?? ''}|${r.color ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const exact = dedupe(exactMatch).slice(0, 1)
  const rest = dedupe(out).filter((r) => !exact.some((e) => e.case_id === r.case_id)).slice(0, 3)
  return [...exact, ...rest].slice(0, 3)
}

/**
 * 자연어 입력 → JSON 결과.
 * 1) 규격 되묻기 중이면 로컬에서 spec_reply 처리.
 * 2) 그 외에는 /api/ai-estimate 호출 후, 실패 시 Mock 폴백.
 */
export async function parseQuickCommand(
  text: string,
  context?: { pendingSpec?: boolean }
): Promise<QuickCommandResult> {
  const t = text.trim()
  if (!t) return null

  if (context?.pendingSpec) {
    const spec = parseSpecToFormat(t)
    const tokens = t.split(/\s+/).filter(Boolean)
    const nonNum = tokens.filter((x) => !/^\d+$/.test(x))
    let color: string | null = nonNum.length > 0 ? nonNum[nonNum.length - 1]! : null
    if (color && /^없음\s*$/i.test(color)) color = null
    return { type: 'spec_reply', spec, color }
  }

  try {
    const res = await callAiEstimateApi(t, context)
    if (res && res.type !== 'unknown') return res
    const raw = res as unknown as Record<string, unknown>
    if (raw && typeof raw === 'object' && raw.requestType)
      return normalizeApiResult(raw)
  } catch {
    // API 미구현 또는 네트워크 오류 시 Mock 사용
  }

  return mockParseWithPromptStyle(t)
}

// PDF/JPG 파일 OpenAI 기반 데이터 추출 (데이터 통합 마이그레이션용)
export {
  parseFileWithAI,
  getFileCategory,
  type ParsedEstimateFromPDF,
  type ParsedVendorPrice,
  type ParsedVendorPriceItem,
  type ParsedResult,
  type FileCategory,
} from './parseFileWithAI'
