/**
 * 데이터 통합 관리 — 견적 파일 AI 파싱
 * - VITE_MIGRATION_PARSE_API 설정 시 해당 URL로 파일 전송 후 ParsedEstimate 수신
 * - 미설정 시 Mock 반환 (테스트용)
 */
import type { EstimateRow } from '@/components/estimate/estimateFormShared'

export interface ParsedEstimate {
  recipientName: string
  recipientContact: string
  quoteDate: string
  rows: EstimateRow[]
}

const API_URL = import.meta.env.VITE_MIGRATION_PARSE_API as string | undefined

/** API 응답 행: 숫자 필드는 문자열로 정규화 */
function normalizeRow(raw: Record<string, unknown>, index: number): EstimateRow {
  const no = String(raw.no ?? index + 1)
  const name = String(raw.name ?? '')
  const spec = String(raw.spec ?? '')
  const qty = typeof raw.qty === 'number' ? String(raw.qty) : String(raw.qty ?? '1')
  const unit = String(raw.unit ?? 'EA')
  const unitPrice = typeof raw.unitPrice === 'number' ? String(raw.unitPrice) : String(raw.unitPrice ?? '')
  const note = String(raw.note ?? '')
  return { no, name, spec, qty, unit, unitPrice, note }
}

/** API 응답 → ParsedEstimate (행 정규화) */
function normalizeParsed(raw: Record<string, unknown>): ParsedEstimate {
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : []
  const rows: EstimateRow[] = rowsRaw.map((r, i) =>
    normalizeRow(typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}, i)
  )
  return {
    recipientName: String(raw.recipientName ?? ''),
    recipientContact: String(raw.recipientContact ?? ''),
    quoteDate: String(raw.quoteDate ?? new Date().toISOString().slice(0, 10)),
    rows,
  }
}

/** Mock: API 없이 테스트용 고정 데이터 반환 */
export async function mockParseEstimateFromFile(
  file: File,
  testMode: boolean
): Promise<ParsedEstimate> {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || '미명'
  const companyName = testMode ? `[TEST] ${baseName}` : baseName
  await new Promise((r) => setTimeout(r, 800))
  const rows: EstimateRow[] = [
    { no: '1', name: '스마트A', spec: '1200×600×740', qty: '1', unit: 'EA', unitPrice: '120000', note: '' },
    { no: '2', name: '올데이B', spec: '1400×700', qty: '2', unit: 'EA', unitPrice: '85000', note: '' },
  ]
  return {
    recipientName: companyName,
    recipientContact: '',
    quoteDate: new Date().toISOString().slice(0, 10),
    rows,
  }
}

/**
 * 파일 하나를 AI로 파싱해 견적 구조 반환.
 * - VITE_MIGRATION_PARSE_API 가 있으면 POST (multipart/form-data: file, testMode) 후 JSON 파싱.
 * - 없으면 Mock 사용.
 */
export async function parseEstimateFromFile(
  file: File,
  testMode: boolean
): Promise<ParsedEstimate> {
  if (!API_URL?.trim()) {
    return mockParseEstimateFromFile(file, testMode)
  }

  const form = new FormData()
  form.append('file', file)
  form.append('testMode', testMode ? 'true' : 'false')

  const res = await fetch(API_URL, {
    method: 'POST',
    body: form,
    headers: {
      // Content-Type은 FormData 시 브라우저가 자동 설정 (boundary 포함)
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AI 파싱 실패 (${res.status}): ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as Record<string, unknown>
  return normalizeParsed(json)
}
