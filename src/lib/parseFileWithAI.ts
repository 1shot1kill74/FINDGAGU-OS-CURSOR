/**
 * PDF/JPG 파일 OpenAI 기반 데이터 추출
 * - PDF: GPT-4o로 현장명, 지역, 업종, 품목 리스트 추출
 * - JPG: GPT-4o Vision으로 거래처명, 제품명, 규격, 원가 추출
 */
import type { EstimateRow } from '@/components/estimate/EstimateForm'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

export type FileCategory = 'Estimates' | 'VendorPrice'

/** PDF 파싱 결과 (견적서) */
export interface ParsedEstimateFromPDF {
  siteName: string
  region: string
  industry: string
  quoteDate: string
  recipientContact: string
  rows: EstimateRow[]
  /** 고객/수신명 (견적서 수신처) */
  customer_name?: string
  /** 연락처 (전화번호) */
  customer_phone?: string
  /** 현장 주소/지역 (상세 주소 포함 가능) */
  site_location?: string
  /** 견적 총액 (원). 문서에 명시된 경우 추출, 없으면 0 */
  total_amount?: number
}

/** 원가표 품목 1건 (복합 표·수기 메모 추출) */
export interface ParsedVendorPriceItem {
  vendor_name: string
  product_name: string
  size: string
  cost_price: number
  description: string
}

/** JPG 파싱 결과 (원가표) — 여러 품목 배열 */
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

/** 우리 회사 판매 견적서 식별 키워드 — 둘 다 있어야 Estimates */
const COMPANY_KEYWORDS = ['파인드가구', '김지윤'] as const

function hasCompanyKeywords(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  return COMPANY_KEYWORDS.every((kw) => t.includes(kw))
}

/**
 * 문서 상단·직인 근처에서 '파인드가구'와 '김지윤'을 찾아라.
 * 둘 다 있으면 우리 회사의 판매 견적서다.
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
    const sysPrompt = `문서 상단이나 직인(도장) 근처에서 '파인드가구'와 '김지윤' 텍스트를 찾아라. 둘 다 있으면 우리 회사의 판매 견적서다.
다음 JSON만 출력: {"hasFindgagu": true/false, "hasKimJiyoon": true/false}`
    const content = await callOpenAI([
      { role: 'system', content: sysPrompt },
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: '이 이미지에 "파인드가구"와 "김지윤"이 둘 다 보이는지 확인하세요.' },
          { type: 'image_url' as const, image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'low' as const } },
        ],
      },
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
  return 'Estimates' // 기본값
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

/** 파일 확장자 → MIME (file.type이 비거나 잘못됐을 때 사용, Win/Mac 호환) */
function getMimeFromExtension(file: File): string {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  return map[ext] || file.type || 'image/jpeg'
}

/** JPG를 base64로 인코딩 */
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

/** OpenAI Chat API 호출 */
async function callOpenAI(
  messages: Array<{
    role: 'system' | 'user'
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }>
  }>
): Promise<string> {
  if (!OPENAI_API_KEY?.trim()) {
    throw new Error('VITE_OPENAI_API_KEY가 설정되지 않았습니다. .env에 OpenAI API 키를 추가하세요.')
  }
  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      max_tokens: 4096,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API 오류 (${res.status}): ${err.slice(0, 200)}`)
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content?.trim() ?? ''
  if (!content) {
    console.error('[parseFileWithAI] OpenAI API 응답이 비어 있습니다.', { json: JSON.stringify(json).slice(0, 200) })
    throw new Error('AI 분석 결과가 비어 있습니다. API 응답을 확인해 주세요.')
  }
  return content
}

/** JSON 블록 파싱 (마크다운 코드 블록 제거) */
function parseJsonBlock(text: string): Record<string, unknown> {
  let cleaned = text.trim()
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) cleaned = match[1]!.trim()
  return JSON.parse(cleaned) as Record<string, unknown>
}

/** EstimateRow 정규화 */
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

/**
 * PDF/JPG 파일을 OpenAI로 파싱하여 구조화된 데이터 반환
 * @param file - 업로드된 파일
 * @param options.mode - 'estimates'이면 판매 견적서(selling_price), 'vendor_price'이면 매입 원가(cost_price) 추출
 */
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

  // 원가 등록 모드: PDF도 원가 추출
  if (forceVendorPrice) {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const isPdf = ext === 'pdf'
    const VENDOR_PROMPT =
      '현재 탭 목적: 매입 원가 등록. 오로지 제품명, 규격, 매입 원가(cost_price) 추출에만 집중하라. 모든 품목을 items 배열로 반환하라. 가격 필드명은 반드시 cost_price 사용.'

    if (isPdf) {
      const text = await extractTextFromPDF(file)
      if (!text.trim()) throw new Error('PDF에서 텍스트를 추출할 수 없습니다.')
      const sysPrompt = `${VENDOR_PROMPT}\n출력 형식: { "items": [ { "product_name": "제품명", "size": "규격", "cost_price": 숫자, "description": "색상/특이사항" } ] }\n반드시 유효한 JSON만 출력하세요.`
    const content = await callOpenAI([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: text.slice(0, 15000) },
    ])
    if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
    console.log('[parseFileWithAI] PDF(vendor) 파싱 완료, content 길이:', content.length)
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
        }
      })
      return {
        category: 'VendorPrice',
        result: { type: 'VendorPrice', data: { items } },
      }
    }
    // 이미지: Vision API
    const base64 = await fileToBase64(file)
    const mimeType = getMimeFromExtension(file)
    const sysPrompt = `${VENDOR_PROMPT}\n출력 형식: { "items": [ { "product_name": "제품명", "size": "규격", "cost_price": 숫자, "description": "색상/특이사항" } ] }\n표·수기 메모 모두 포함. cost_price는 숫자만(원). 반드시 유효한 JSON만 출력하세요.`
    const content = await callOpenAI([
      { role: 'system', content: sysPrompt },
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: '이 원가 명세서에서 모든 품목을 추출하세요.' },
          {
            type: 'image_url' as const,
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' as const },
          },
        ],
      },
    ])
    if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
    console.log('[parseFileWithAI] 이미지(vendor) 파싱 완료, content 길이:', content.length)
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
      }
    })
    if (items.length === 0) {
      items.push({
        vendor_name: '',
        product_name: String(parsed.product_name ?? ''),
        size: String(parsed.size ?? parsed.spec ?? ''),
        cost_price: parseInt(String(parsed.cost_price ?? parsed.cost ?? 0).replace(/\D/g, ''), 10) || 0,
        description: String(parsed.description ?? ''),
      })
    }
    return {
      category: 'VendorPrice',
      result: { type: 'VendorPrice', data: { items } },
    }
  }

  if (category === 'Estimates') {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const isPdf = ext === 'pdf'

    const tabHint = forceEstimates
      ? '현재 탭 목적: 판매 견적서 등록. 품목 단가는 판매가(selling_price)이므로 unitPrice 필드로 추출하라. '
      : ''
    const sysPrompt = `당신은 가구 견적서 문서 분석 전문가입니다. ${tabHint}문서 상단이나 직인 근처에서 '파인드가구'와 '김지윤'을 찾아라. 둘 다 있으면 우리 회사의 판매 견적서다.
주어진 ${isPdf ? '텍스트' : '이미지'}에서 다음 정보를 JSON으로 추출하세요.
- siteName: 현장명 (업체/학교/학원명)
- region: 지역 (예: 서울, 경기, 부산)
- industry: 업종 (예: 초등학교, 중학교, 학원, 오피스)
- quoteDate: 견적일 또는 발행일을 반드시 찾아서 추출 (YYYY-MM-DD 형식. "견적일", "발행일", "작성일", "날짜" 등 문서에 기재된 날짜. 없으면 오늘)
- recipientContact: 연락처/전화번호 (없으면 빈 문자열)
- customer_name: 고객/수신명 (견적서 수신처, 수하인. siteName과 동일할 수 있음)
- customer_phone: 연락처/전화번호 (recipientContact와 동일 값 가능)
- site_location: 현장 주소/지역 (상세 주소 포함, 예: "서울 강남구 XX동 123")
- total_amount: 견적 총액(원). "총 금액", "합계", "공급가액 합계" 등 문서에 명시된 최종 금액 숫자만. 없으면 0
- rows: 품목 배열. 각 항목은 { no, name, spec, qty, unit, unitPrice, note } 포함. unitPrice는 판매가(원), 숫자만. spec은 "1200×600×720" 형식.
추출 불가한 필드는 빈 문자열, null 또는 0. 반드시 유효한 JSON만 출력하세요.`

    let content: string
    if (isPdf) {
      const text = await extractTextFromPDF(file)
      if (!text.trim()) throw new Error('PDF에서 텍스트를 추출할 수 없습니다.')
      content = (await callOpenAI([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: text.slice(0, 12000) },
      ])) ?? ''
    } else {
      const base64 = await fileToBase64(file)
      const mimeType = getMimeFromExtension(file)
      content = (await callOpenAI([
        { role: 'system', content: sysPrompt },
        {
          role: 'user',
          content: [
            { type: 'text' as const, text: '이 견적서 이미지에서 모든 정보를 추출하세요.' },
            { type: 'image_url' as const, image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' as const } },
          ],
        },
      ])) ?? ''
    }
    if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
    console.log(`[parseFileWithAI] ${isPdf ? 'PDF' : '이미지'}(견적서) 파싱 완료, content 길이:`, content.length)
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

  // JPG: Vision API
  const base64 = await fileToBase64(file)
  const mimeType = getMimeFromExtension(file)

  const sysPrompt = `당신은 원가표/가격표 이미지 분석 전문가입니다. 현재 탭 목적: 매입 원가 등록. 가격 필드명은 반드시 cost_price 사용.
이미지에서 다음을 모두 찾아 JSON으로 추출하세요.

1) **표(Table)**: 행·열 구조로 된 품목 리스트
2) **도면 옆 수기 메모**: 손글씨, 메모, 옆에 적힌 단가·품명

**출력 형식 (반드시 items 배열)**:
{
  "items": [
    {
      "vendor_name": "거래처명(회사명/상호)",
      "product_name": "제품명(품목명)",
      "size": "규격 (예: 1200×600×720, W×D×H. 없으면 빈 문자열)",
      "cost_price": 숫자,
      "description": "색상/특이사항 (없으면 빈 문자열)"
    }
  ]
}

**규칙**:
- 품목이 1개여도 items 배열로 반환
- 표의 모든 행 + 수기 메모의 모든 품목을 개별 items 요소로 추가
- cost_price: 숫자만(원). ₩, 원, 콤마 제거
- 한글·숫자·영문·손글씨를 정확히 읽고, 놓친 행 없이 모두 추출
- 반드시 유효한 JSON만 출력`

  const content = await callOpenAI([
    { role: 'system', content: sysPrompt },
    {
      role: 'user',
      content: [
        { type: 'text' as const, text: '이 원가표/견적서 이미지에서 표와 도면 옆 수기 메모를 모두 분석해, 모든 품목을 items 배열로 추출하세요.' },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
            detail: 'high' as const,
          },
        },
      ],
    },
  ])
  if (!content) throw new Error('AI 분석 결과가 비어 있습니다.')
  console.log('[parseFileWithAI] 이미지(원가표) 파싱 완료, content 길이:', content.length)
  const parsed = parseJsonBlock(content)
  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const items: ParsedVendorPriceItem[] = rawItems.map((r: unknown, i: number) => {
    const row = typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}
    const costVal = row.cost_price ?? row.cost
    const cost = typeof costVal === 'number' ? costVal : parseInt(String(costVal ?? 0).replace(/\D/g, ''), 10) || 0
    return {
      vendor_name: String(row.vendor_name ?? row.vendorName ?? ''),
      product_name: String(row.product_name ?? row.productName ?? ''),
      size: String(row.size ?? row.spec ?? ''),
      cost_price: cost,
      description: String(row.description ?? row.note ?? ''),
    }
  })

  // items가 비어 있으면 레거시 단일 객체 패턴 fallback
  if (items.length === 0) {
    console.warn('[parseFileWithAI] 원가표 추출 결과 items가 비어 있어 fallback 적용.', { parsed: JSON.stringify(parsed).slice(0, 300) })
    const cost = typeof parsed.cost === 'number' ? parsed.cost : parseInt(String(parsed.cost ?? 0).replace(/\D/g, ''), 10) || 0
    items.push({
      vendor_name: String(parsed.vendor_name ?? parsed.vendorName ?? ''),
      product_name: String(parsed.product_name ?? parsed.productName ?? ''),
      size: String(parsed.size ?? parsed.spec ?? ''),
      cost_price: cost,
      description: String(parsed.description ?? parsed.note ?? ''),
    })
  }
  return {
    category: 'VendorPrice',
    result: { type: 'VendorPrice', data: { items } },
  }
}

/** 우리 회사 견적서 여부 (파인드가구 & 김지윤 동시 존재) — 거래처 탭 경고용 */
export async function detectIsOurCompanyEstimate(file: File): Promise<boolean> {
  const category = await detectCategoryFromContent(file)
  return category === 'Estimates'
}

export { getFileCategory }
