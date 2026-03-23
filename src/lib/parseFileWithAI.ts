/**
 * PDF/JPG 파일 AI 데이터 추출 — Supabase Edge Function (analyze-quote) 연동
 * - 클라이언트: 파일 → base64 또는 PDF 텍스트 추출 후 Edge Function 호출
 * - Edge Function: Gemini 2.0 Flash Vision/Text API로 텍스트 추출 및 구조화 (가격 계산 로직 없음)
 * - PDF.js worker: 로컬 패키지 사용 (CDN 미사용)
 */
import { toast } from 'sonner'
import type { EstimateRow } from '@/components/estimate/EstimateForm'
import { supabase } from '@/lib/supabase'

/** pdfjs-dist worker 로컬 참조 (Vite ?url → 번들 시 올바른 경로) */
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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

/** 단가 테이블 추출용 간단 구조 — {품목, 단가, 수량} JSON */
export interface ParsedUnitPriceItem {
  품목: string
  단가: number
  수량: number
}

/** 원가표 품목 1건 — 현장명/품명/색상/수량/단가/외경사이즈 */
export interface ParsedVendorPriceItem {
  vendor_name: string
  product_name: string
  size: string
  cost_price: number
  description: string
  quantity?: number
  site_name?: string
  color?: string
  quote_date?: string
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

function getFileCategory(file: File): FileCategory {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf') return 'Estimates'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'VendorPrice'
  return 'Estimates'
}

const PDF_LOAD_ERROR_MSG = 'PDF 해석 라이브러리 로드 실패. 다시 시도해 주세요.'

/** PDF에서 텍스트 추출 (pdfjs-dist, 로컬 worker) */
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist')
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
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
  } catch {
    throw new Error(PDF_LOAD_ERROR_MSG)
  }
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

type AnalyzeMode = 'estimates' | 'vendor_price' | 'detect' | 'unit_price'

interface AnalyzeQuoteInput {
  image?: string
  text?: string
  fileName: string
  mode?: AnalyzeMode
}

interface AnalyzeQuoteResponse {
  category?: FileCategory
  result?: { type: 'Estimates'; data: ParsedEstimateFromPDF } | { type: 'VendorPrice'; data: ParsedVendorPrice }
  items?: ParsedUnitPriceItem[]
  error?: string
}

export interface EdgeFunctionError extends Error {
  context?: { error?: string; detail?: string }
}

/** Edge Function analyze-quote 호출 */
async function invokeAnalyzeQuote(input: AnalyzeQuoteInput): Promise<AnalyzeQuoteResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const accessToken = session?.access_token

  if (!accessToken) {
    const err = new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인 후 시도해 주세요.') as EdgeFunctionError
    err.context = { error: 'missing_access_token' }
    throw err
  }

  const { data, error } = await supabase.functions.invoke<AnalyzeQuoteResponse>('analyze-quote', {
    body: input,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (error) {
    const err = new Error(error.message || 'Edge Function 호출 실패') as EdgeFunctionError
    err.context = { error: error.message }
    throw err
  }

  if (data?.error) {
    const err = new Error(data.error) as EdgeFunctionError
    err.context = { error: data.error, detail: (data as { detail?: string }).detail }
    throw err
  }

  return data ?? {}
}

export type ParseMode = 'default' | 'estimates' | 'vendor_price'

export async function parseFileWithAI(
  file: File,
  options?: { mode?: ParseMode }
): Promise<{ category: FileCategory; result: ParsedResult }> {
  const forceEstimates = options?.mode === 'estimates'
  const forceVendorPrice = options?.mode === 'vendor_price'
  const category: FileCategory =
    forceEstimates ? 'Estimates'
    : forceVendorPrice ? 'VendorPrice'
    : getFileCategory(file)

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const isPdf = ext === 'pdf'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

  const mode: AnalyzeMode = forceEstimates ? 'estimates' : forceVendorPrice ? 'vendor_price' : category === 'Estimates' ? 'estimates' : 'vendor_price'

  try {
    let response: AnalyzeQuoteResponse

    if (isPdf) {
      const text = await extractTextFromPDF(file)
      if (!text.trim()) throw new Error('PDF에서 텍스트를 추출할 수 없습니다.')
      response = await invokeAnalyzeQuote({ text: text.slice(0, 15000), fileName: file.name, mode })
    } else if (isImage) {
      const base64 = await fileToBase64(file)
      response = await invokeAnalyzeQuote({ image: base64, fileName: file.name, mode })
    } else {
      throw new Error('지원하지 않는 파일 형식입니다. PDF 또는 이미지(png, jpg, webp)만 업로드할 수 있습니다.')
    }

    if (response.result) {
      return {
        category: response.result.type === 'Estimates' ? 'Estimates' : 'VendorPrice',
        result: response.result,
      }
    }

    throw new Error('AI 분석 결과가 비어 있습니다.')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 분석에 실패했습니다.'
    toast.error(message)
    throw err
  }
}

export async function detectIsOurCompanyEstimate(file: File): Promise<boolean> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const isPdf = ext === 'pdf'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

  try {
    let response: AnalyzeQuoteResponse

    if (isPdf) {
      const text = await extractTextFromPDF(file)
      if (!text.trim()) return false
      response = await invokeAnalyzeQuote({ text: text.slice(0, 15000), fileName: file.name, mode: 'detect' })
    } else if (isImage) {
      const base64 = await fileToBase64(file)
      response = await invokeAnalyzeQuote({ image: base64, fileName: file.name, mode: 'detect' })
    } else {
      return false
    }

    return response.category === 'Estimates'
  } catch {
    return false
  }
}

/**
 * PDF/이미지에서 {품목, 단가, 수량} 형태의 단가 테이블 추출
 * 확인용 미리보기 UI에서 사용
 */
export async function parseUnitPriceTableFromFile(file: File): Promise<ParsedUnitPriceItem[]> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const isPdf = ext === 'pdf'
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

  if (!isPdf && !isImage) {
    throw new Error('PDF 또는 이미지 파일만 지원합니다.')
  }

  let response: AnalyzeQuoteResponse

  if (isPdf) {
    const text = await extractTextFromPDF(file)
    if (!text.trim()) throw new Error('PDF에서 텍스트를 추출할 수 없습니다.')
    response = await invokeAnalyzeQuote({ text: text.slice(0, 15000), fileName: file.name, mode: 'unit_price' })
  } else {
    const base64 = await fileToBase64(file)
    response = await invokeAnalyzeQuote({ image: base64, fileName: file.name, mode: 'unit_price' })
  }

  if (response.items && Array.isArray(response.items)) {
    return response.items
  }

  throw new Error('AI 분석 결과가 비어 있습니다.')
}

export { getFileCategory }
