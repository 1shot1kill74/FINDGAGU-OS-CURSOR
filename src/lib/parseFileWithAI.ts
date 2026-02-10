/**
 * PDF/JPG 파일 AI 데이터 추출 — Gemini 2.0 Flash (메인) + OpenAI GPT-4o (폴백)
 * - 메인: Gemini 2.0 Flash — 표 구조·파인드가구 키워드 인식 등 향상된 비전 활용
 * - 폴백: Gemini 할당량/서버 에러/지연 시 OpenAI GPT-4o로 재시도
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { toast } from 'sonner'
import type { EstimateRow } from '@/components/estimate/EstimateForm'

const GEMINI_API_KEY = (
  import.meta.env.VITE_GOOGLE_GEMINI_API_KEY ??
  import.meta.env.GOOGLE_GEMINI_API_KEY ??
  import.meta.env.VITE_GEMINI_API_KEY
) as string | undefined

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const GEMINI_MODEL = 'gemini-2.0-flash'

/** 무료 티어 분당 호출 제한 관련 에러인지 판별 */
function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('per minute') ||
    lower.includes('requests per minute') ||
    lower.includes('too many requests')
  )
}

/** 사용자 친화적 에러로 변환 (무료 티어 제한 시) */
function toUserFriendlyError(err: unknown): Error {
  if (isRateLimitError(err)) {
    return new Error(
      'Gemini API 무료 티어의 분당 호출 제한에 걸렸습니다. 1분 후 다시 시도해 주세요.'
    )
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Gemini 실패 시 OpenAI 폴백 대상인지 (할당량/서버에러/지연) */
function isGeminiFallbackTarget(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    isRateLimitError(err) ||
    lower.includes('500') ||
    lower.includes('503') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('server') ||
    lower.includes('unavailable') ||
    lower.includes('resource_exhausted')
  )
}

/**
 * OpenAI Chat Completions API (GPT-4o) — Gemini 폴백용
 * userParts: 텍스트 또는 [텍스트, { inlineData }]
 */
async function callOpenAI(
  systemInstruction: string,
  userParts: Array<string | { inlineData: { data: string; mimeType: string } }>
): Promise<string> {
  if (!OPENAI_API_KEY?.trim()) {
    throw new Error('폴백용 VITE_OPENAI_API_KEY가 .env에 설정되지 않았습니다.')
  }
  const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'high' } }> = []
  for (const p of userParts) {
    if (typeof p === 'string') {
      contentParts.push({ type: 'text', text: p })
    } else if (p.inlineData) {
      const mime = (p.inlineData.mimeType || 'image/jpeg').split(';')[0]!.trim()
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${p.inlineData.data}`,
          detail: 'high',
        },
      })
    }
  }
  const userContent = contentParts.length === 1 && contentParts[0]!.type === 'text'
    ? contentParts[0]!.text
    : contentParts
  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4096,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API 오류 (${res.status}): ${err.slice(0, 200)}`)
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const text = json.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('OpenAI AI 분석 결과가 비어 있습니다.')
  return text
}

export type FileCategory = 'Estimates' | 'VendorPrice'

/** PDF 파싱 결과 (견적서) */
export interface ParsedEstimateFromPDF {
  siteName: string
  region: string
  industry: string
  quoteDate: string
  recipientContact: string
  rows: EstimateRow[]
  customer_name?: string
  customer_phone?: string
  site_location?: string
  total_amount?: number
}

/** 원가표 품목 1건 — 현장명/품명/색상/수량/단가/외경사이즈 */
export interface ParsedVendorPriceItem {
  vendor_name: string
  product_name: string
  size: string
  cost_price: number
  description: string
  /** 현장명 — "[파인드가구] 루브르"에서 "루브르" 추출 */
  site_name?: string
  /** 색상 (예: 기성칼라) */
  color?: string
  /** 견적일 YYYY-MM-DD — 검수 시 필요 시 입력, 기본 빈칸 */
  quote_date?: string
  /** 메모 — 상판 모번 23T, 그외 18T 라이트그레이 등 상세 사양 */
  memo?: string
}

/** JPG 파싱 결과 (원가표) */
export interface ParsedVendorPrice {
  items: ParsedVendorPriceItem[]
}

/** @deprecated 하위 호환용 alias */
export interface ParsedVendorPriceLegacy {
  vendorName: string
  product_name: string
  spec: string
  cost: number
}

export type ParsedResult = { type: 'Estimates'; data: ParsedEstimateFromPDF } | { type: 'VendorPrice'; data: ParsedVendorPrice }

const COMPANY_KEYWORDS = ['파인드가구', '김지윤'] as const

function hasCompanyKeywords(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  return COMPANY_KEYWORDS.every((kw) => t.includes(kw))
}

/**
 * 문서 상단·직인 근처에서 '파인드가구'와 '김지윤'을 찾아라.
 */
async function detectCategoryFromContent(file: File): Promise<FileCategory> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf') {
    const text = await extractTextFromPDF(file)
    return hasCompanyKeywords(text) ? 'Estimates' : 'VendorPrice'
  }
  if (['jpg', 'jpeg', 'png'].includes(ext)) {
    const base64 = await fileToBase64(file)
    const mimeType = getMimeFromExtension(file)
    const sysPrompt = `이미지에서 '파인드가구'와 '김지윤' 키워드를 찾아라. 문서 상단·직인(도장)·헤더 근처를 집중 확인. 둘 다 있으면 우리 회사 판매 견적서.
다음 JSON만 출력: {"hasFindgagu": true/false, "hasKimJiyoon": true/false}`
    const content = await callAIWithFallback(sysPrompt, [
      '이 이미지에 "파인드가구"와 "김지윤"이 둘 다 보이는지 확인하세요.',
      { inlineData: { data: base64, mimeType } },
    ])
    if (!content) return 'VendorPrice'
    try {
      const parsed = parseJsonBlock(content) as { hasFindgagu?: boolean; hasKimJiyoon?: boolean }
      const hasBoth = parsed?.hasFindgagu === true && parsed?.hasKimJiyoon === true
      return hasBoth ? 'Estimates' : 'VendorPrice'
    } catch {
      return 'VendorPrice'
    }
  }
  return 'Estimates'
}

function getFileCategory(file: File): FileCategory {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf') return 'Estimates'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'VendorPrice'
  return 'Estimates'
}

/** PDF에서 텍스트 추출 (pdfjs-dist) */
async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const version = (pdfjs as { version?: string }).version || '4.8.69'
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const texts: string[] = []
  for (let i = 1; i <= Math.min(numPages, 10); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map((item) => ('str' in item ? (item as { str: string }).str : '')).join(' ')
    texts.push(pageText)
  }
  return texts.join('\n\n')
}

function getMimeFromExtension(file: File): string {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  return map[ext] || file.type || 'image/jpeg'
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64 ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Gemini 2.0 Flash 호출 (google-generative-ai SDK)
 */
async function callGeminiSDK(
  systemInstruction: string,
  userParts: Array<string | { inlineData: { data: string; mimeType: string } }>
): Promise<string> {
  if (!GEMINI_API_KEY?.trim()) {
    throw new Error('GOOGLE_GEMINI_API_KEY(또는 VITE_GOOGLE_GEMINI_API_KEY)가 .env에 설정되지 않았습니다.')
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    generationConfig: { maxOutputTokens: 4096 },
  })
  const result = await model.generateContent(userParts)
  const response = result.response
  const text = response.text?.()?.trim() ?? ''
  if (!text) {
    console.error('[parseFileWithAI] Gemini API 응답이 비어 있습니다.')
    throw new Error('AI 분석 결과가 비어 있습니다.')
  }
  return text
}

/**
 * 메인: Gemini 2.0 → 폴백: OpenAI GPT-4o
 * Gemini가 할당량/서버에러/지연 시 OpenAI로 재시도, 사모님께 안내 토스트 표시
 */
async function callAIWithFallback(
  systemInstruction: string,
  userParts: Array<string | { inlineData: { data: string; mimeType: string } }>
): Promise<string> {
  try {
    return await callGeminiSDK(systemInstruction, userParts)
  } catch (geminiErr) {
    if (isGeminiFallbackTarget(geminiErr) && OPENAI_API_KEY?.trim()) {
      toast.info('제미나이가 응답하지 않아 오픈AI로 분석 중입니다...', { duration: 4000 })
      return await callOpenAI(systemInstruction, userParts)
    }
    throw toUserFriendlyError(geminiErr)
  }
}

/** JSON 블록 파싱 (마크다운 코드 블록 제거) */
function parseJsonBlock(text: string): Record<string, unknown> {
  let cleaned = text.trim()
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) cleaned = match[1]!.trim()
  return JSON.parse(cleaned) as Record<string, unknown>
}

function normalizeRow(raw: Record<string, unknown>, index: number): EstimateRow {
  return {
    no: String(raw.no ?? index + 1),
    name: String(raw.name ?? raw.product_name ?? ''),
    spec: String(raw.spec ?? ''),
    qty: typeof raw.qty === 'number' ? String(raw.qty) : String(raw.qty ?? '1'),
    unit: String(raw.unit ?? 'EA'),
    unitPrice: typeof raw.unitPrice === 'number' ? String(raw.unitPrice) : String(raw.unitPrice ?? raw.unit_price ?? ''),
    note: String(raw.note ?? ''),
  }
}

export type ParseMode = 'default' | 'estimates' | 'vendor_price'

/** 비전 전용: 원가표 이미지 분석 (Gemini 2.0 향상된 비전 — 표 구조·수기 메모·도면 인식) */
const VISION_VENDOR_PROMPT = `당신은 원가표/가격표 이미지 분석 전문가입니다. 다음 항목을 반드시 유심히 분석하세요.

**1) 현장명 (site_name)**: "[파인드가구] 루브르"처럼 파인드가구 옆에 적힌 부분 → "루브르"만 추출해 site_name에 저장

**2) 품명 (product_name)**: 표·도면에 적힌 품명 (예: 올데이CA)

**3) 색상 (color)**: 표에 적힌 색상 (예: 기성칼라, 라이트그레이)

**4) 단가 (cost_price)**: 손글씨 "162,000" 등 수기 금액 포함, ₩·원·콤마 제거 후 숫자만

**5) 외경 사이즈 (size)**: 가로×세로×높이 형식. 도면 치수에서 가로(Width), 세로(Depth, 여러 값이면 합산 예: 700+620=1320), 높이(Height) 추출 → "1000×1320×1200"

**6) 메모 (memo)**: "상판 모번 23T", "그외 18T 라이트그레이" 등 불릿·추가 사양 텍스트. 도면 옆 인쇄/수기 메모를 그대로 추출. 줄바꿈은 공백으로.

**추가**: description에는 색상/특이사항. memo에는 상세 사양(두께·재질·색상 배치 등).

**출력** (유효한 JSON만, items 배열 필수):
{"items":[{"vendor_name":"","product_name":"","size":"","cost_price":숫자,"description":"","site_name":"","color":"","memo":""}]}`

/** 비전 전용: 견적서 이미지 분석 (Gemini 2.0 — 파인드가구 키워드·표 구조 최우선) */
const VISION_ESTIMATE_PROMPT = `당신은 가구 견적서 이미지 분석 전문가입니다. Gemini 2.0의 향상된 비전으로 다음을 최우선 수행합니다.

**1) '파인드가구' & '김지윤' 식별**: 문서 상단·직인(도장) 근처에서 반드시 확인. 둘 다 있으면 우리 회사 판매 견적서.

**2) 표(Table) 구조**: 품목·규격·수량·단가·금액 열을 정확히 구분. 병합 셀·여러 행 구조 이해.

**추출 필드**: siteName, region, industry, quoteDate(YYYY-MM-DD), recipientContact, customer_name, customer_phone, site_location, total_amount, rows[{no,name,spec,qty,unit,unitPrice,note}]. unitPrice=판매가(원), spec="1200×600×720".

**규칙**: 추출 불가 필드는 빈 문자열·null·0. 유효한 JSON만 출력.`

export async function parseFileWithAI(
  file: File,
  options?: { mode?: ParseMode }
): Promise<{ category: FileCategory; result: ParsedResult }> {
  const forceEstimates = options?.mode === 'estimates'
  const forceVendorPrice = options?.mode === 'vendor_price'
  const category: FileCategory =
    forceEstimates ? 'Estimates'
    : forceVendorPrice ? 'VendorPrice'
    : await detectCategoryFromContent(file)

  if (forceVendorPrice) {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const isPdf = ext === 'pdf'
    const basePrompt = `매입 원가 등록. 아래 항목 모두 추출: site_name, product_name, color, cost_price, size(외경 가로×세로×높이), memo(상판 모번 23T·그외 18T 라이트그레이 등 상세 사양). items 배열.`
    const jsonFormat = '{ "items": [ { "site_name", "product_name", "color", "size", "cost_price", "description", "memo" } ] }'

    if (isPdf) {
      const text = await extractTextFromPDF(file)
      if (!text.trim()) throw new Error('PDF에서 텍스트를 추출할 수 없습니다.')
      const sysPrompt = `${basePrompt}\n출력: ${jsonFormat}\n유효한 JSON만 출력.`
      const content = await callAIWithFallback(sysPrompt, [text.slice(0, 15000)])
      if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
      const parsed = parseJsonBlock(content)
    const rawItems = Array.isArray(parsed.items) ? parsed.items : []
    const items: ParsedVendorPriceItem[] = rawItems.map((r: unknown) => {
      const row = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}
      const costVal = row.cost_price ?? row.cost
      const cost = typeof costVal === 'number' ? costVal : parseInt(String(costVal ?? 0).replace(/\D/g, ''), 10) || 0
      return {
        vendor_name: '',
        product_name: String(row.product_name ?? row.productName ?? ''),
        size: String(row.size ?? row.spec ?? ''),
        cost_price: cost,
        description: String(row.description ?? row.note ?? ''),
        site_name: String(row.site_name ?? '').trim() || undefined,
        color: String(row.color ?? '').trim() || undefined,
        quote_date: undefined,
        memo: String(row.memo ?? '').trim() || undefined,
      }
    })
      return { category: 'VendorPrice', result: { type: 'VendorPrice', data: { items } } }
    }

    const base64 = await fileToBase64(file)
    const mimeType = getMimeFromExtension(file)
    const sysPrompt = `${VISION_VENDOR_PROMPT}\n${basePrompt}\n${jsonFormat}`
    const content = await callAIWithFallback(sysPrompt, [
      '이 원가 명세서 이미지에서 표와 도면 옆 수기 메모를 모두 분석해, 모든 품목을 items 배열로 추출하세요.',
      { inlineData: { data: base64, mimeType } },
    ])
    if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
    const parsed = parseJsonBlock(content)
    const rawItems = Array.isArray(parsed.items) ? parsed.items : []
    const items: ParsedVendorPriceItem[] = rawItems.map((r: unknown) => {
      const row = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}
      const costVal = row.cost_price ?? row.cost
      const cost = typeof costVal === 'number' ? costVal : parseInt(String(costVal ?? 0).replace(/\D/g, ''), 10) || 0
      return {
        vendor_name: '',
        product_name: String(row.product_name ?? row.productName ?? ''),
        size: String(row.size ?? row.spec ?? ''),
        cost_price: cost,
        description: String(row.description ?? row.note ?? ''),
        site_name: String(row.site_name ?? '').trim() || undefined,
        color: String(row.color ?? '').trim() || undefined,
        quote_date: String(row.quote_date ?? '').trim() || undefined,
        memo: String(row.memo ?? '').trim() || undefined,
      }
    })
    if (items.length === 0) {
      items.push({
        vendor_name: '',
        product_name: String(parsed.product_name ?? ''),
        size: String(parsed.size ?? parsed.spec ?? ''),
        cost_price: parseInt(String(parsed.cost_price ?? parsed.cost ?? 0).replace(/\D/g, ''), 10) || 0,
        description: String(parsed.description ?? ''),
        site_name: String(parsed.site_name ?? '').trim() || undefined,
        color: String(parsed.color ?? '').trim() || undefined,
        quote_date: undefined,
        memo: String(parsed.memo ?? '').trim() || undefined,
      })
    }
    return { category: 'VendorPrice', result: { type: 'VendorPrice', data: { items } } }
  }

  if (category === 'Estimates') {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const isPdf = ext === 'pdf'
    const tabHint = forceEstimates ? '판매 견적서 등록. 품목 단가는 판매가(unitPrice) 추출. ' : ''
    const sysPrompt = isPdf
      ? `가구 견적서 문서 분석. ${tabHint}파인드가구·김지윤 확인. 텍스트에서 JSON 추출: siteName, region, industry, quoteDate(YYYY-MM-DD), recipientContact, customer_name, customer_phone, site_location, total_amount, rows[{no,name,spec,qty,unit,unitPrice,note}]. 유효한 JSON만 출력.`
      : `${VISION_ESTIMATE_PROMPT}\n${tabHint}`

    let content: string
    if (isPdf) {
      const text = await extractTextFromPDF(file)
      if (!text.trim()) throw new Error('PDF에서 텍스트를 추출할 수 없습니다.')
      content = (await callAIWithFallback(sysPrompt, [text.slice(0, 12000)])) ?? ''
    } else {
      const base64 = await fileToBase64(file)
      const mimeType = getMimeFromExtension(file)
      content = (await callAIWithFallback(sysPrompt, [
        '이 견적서 이미지에서 모든 정보를 추출하세요.',
        { inlineData: { data: base64, mimeType } },
      ])) ?? ''
    }
    if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
    const parsed = parseJsonBlock(content)
    const rowsRaw = Array.isArray(parsed.rows) ? parsed.rows : []
    const rows: EstimateRow[] = rowsRaw.map((r, i) =>
      normalizeRow(typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}, i)
    )
    const today = new Date().toISOString().slice(0, 10)
    const quoteDate = String(parsed.quoteDate ?? '').trim()
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(quoteDate) ? quoteDate : today
    const customerName = String(parsed.customer_name ?? parsed.siteName ?? '').trim()
    const customerPhone = String(parsed.customer_phone ?? parsed.recipientContact ?? '').trim()
    const siteLocation = String(parsed.site_location ?? parsed.region ?? '').trim()
    let totalAmount = typeof parsed.total_amount === 'number' ? parsed.total_amount : 0
    if (totalAmount <= 0 && typeof parsed.total_amount === 'string') {
      totalAmount = parseInt(String(parsed.total_amount).replace(/\D/g, ''), 10) || 0
    }
    return {
      category: 'Estimates',
      result: {
        type: 'Estimates',
        data: {
          siteName: String(parsed.siteName ?? customerName ?? ''),
          region: String(parsed.region ?? ''),
          industry: String(parsed.industry ?? ''),
          quoteDate: validDate,
          recipientContact: customerPhone || String(parsed.recipientContact ?? ''),
          customer_name: customerName || undefined,
          customer_phone: customerPhone || undefined,
          site_location: siteLocation || undefined,
          total_amount: totalAmount > 0 ? totalAmount : undefined,
          rows: rows.length > 0 ? rows : [{ no: '1', name: '', spec: '', qty: '1', unit: 'EA', unitPrice: '', note: '' }],
        },
      },
    }
  }

  const base64 = await fileToBase64(file)
  const mimeType = getMimeFromExtension(file)
  const content = await callAIWithFallback(VISION_VENDOR_PROMPT, [
    '이 원가표/견적서 이미지에서 표와 도면 옆 수기 메모를 모두 분석해, 모든 품목을 items 배열로 추출하세요.',
    { inlineData: { data: base64, mimeType } },
  ])
  if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
  const parsed = parseJsonBlock(content)
  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const items: ParsedVendorPriceItem[] = rawItems.map((r: unknown) => {
    const row = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}
    const costVal = row.cost_price ?? row.cost
    const cost = typeof costVal === 'number' ? costVal : parseInt(String(costVal ?? 0).replace(/\D/g, ''), 10) || 0
    return {
      vendor_name: String(row.vendor_name ?? row.vendorName ?? ''),
      product_name: String(row.product_name ?? row.productName ?? ''),
      size: String(row.size ?? row.spec ?? ''),
      cost_price: cost,
      description: String(row.description ?? row.note ?? ''),
      site_name: String(row.site_name ?? '').trim() || undefined,
      color: String(row.color ?? '').trim() || undefined,
      quote_date: undefined,
      memo: String(row.memo ?? '').trim() || undefined,
    }
  })
  if (items.length === 0) {
    items.push({
      vendor_name: String(parsed.vendor_name ?? parsed.vendorName ?? ''),
      product_name: String(parsed.product_name ?? parsed.productName ?? ''),
      size: String(parsed.size ?? parsed.spec ?? ''),
      cost_price: typeof parsed.cost === 'number' ? parsed.cost : parseInt(String(parsed.cost ?? 0).replace(/\D/g, ''), 10) || 0,
      description: String(parsed.description ?? parsed.note ?? ''),
      site_name: String(parsed.site_name ?? '').trim() || undefined,
      color: String(parsed.color ?? '').trim() || undefined,
      quote_date: undefined,
      memo: String(parsed.memo ?? '').trim() || undefined,
    })
  }
  return { category: 'VendorPrice', result: { type: 'VendorPrice', data: { items } } }
}

export async function detectIsOurCompanyEstimate(file: File): Promise<boolean> {
  const category = await detectCategoryFromContent(file)
  return category === 'Estimates'
}

export { getFileCategory }
