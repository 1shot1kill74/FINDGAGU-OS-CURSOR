/**
 * 견적서 표준 양식 — 예산 기획(PROPOSAL) / 확정 견적(FINAL) 듀얼 모드
 * - PROPOSAL: 예산 기획안, 범위 단가·패키지·면책 문구
 * - FINAL: 표준 견적서, 승인 시 저장·상담 상태 견적발송
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { X, Send, ImageIcon, Info, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { parseQuickCommand as aiParse, searchPastCaseRecommendations, type PastCaseRecommendation, type PastCaseCandidate } from '@/lib/estimateAiService'
import { getVendorPriceRecommendation, type VendorPriceRecommendation } from '@/lib/estimateRecommendationService'
import { parseAmountToWon, scaleFactorToTarget, computeTotalCost, adjustUnitPricesToTargetMargin, roundToPriceUnit, getMarginSignalClass, formatDateYYMMDD, GUIDE_PAST_DATE_CLASS, GUIDE_VENDOR_DATE_CLASS } from '@/lib/estimateUtils'
import { EstimateRowGalleryDialog } from '@/components/estimate/EstimateRowGalleryDialog'
import { getDataByProductTag } from '@/lib/productDataMatching'
import { supabase } from '@/lib/supabase'

export type EstimateMode = 'PROPOSAL' | 'FINAL'

/** 천 단위 콤마 포맷 (표시용) */
function formatNumber(n: number): string {
  if (Number.isNaN(n) || n === 0) return '0'
  return Math.round(n).toLocaleString('ko-KR')
}

/** 문자열을 숫자로 파싱 (입력용) */
function parseNum(s: string): number {
  const v = parseFloat(String(s).replace(/,/g, ''))
  return Number.isNaN(v) ? 0 : v
}

/** 천 단위 콤마 붙인 문자열 (입력 필드 표시용) */
function addComma(s: string): string {
  const cleaned = String(s).replace(/,/g, '')
  if (cleaned === '' || cleaned === '-') return cleaned
  const num = parseFloat(cleaned)
  if (Number.isNaN(num)) return s
  return num.toLocaleString('ko-KR')
}

/** 콤마 제거 (저장/계산용) */
function removeComma(s: string): string {
  return String(s).replace(/,/g, '')
}

/** 실무 고정 공급자 정보 (수정 불가) */
const SUPPLIER_FIXED = {
  bizNumber: '374-81-02631',
  company: '주식회사 파인드가구',
  representative: '대표이사 김지윤',
  address: '경기도 남양주시 화도읍 가곡로 88번길 29-2, 1동',
  contact: '031-592-7981',
} as const

/** 예산 기획안(PROPOSAL) 하단 면책문구 */
const PROPOSAL_DISCLAIMER =
  '이 자료는 예산 수립의 참고용이며, 협의 완료 후 확정된 최종 견적서는 별도 발급이 되며, 이때 단가는 변경이 될 수 있습니다.'

export interface EstimateRow {
  no: string
  name: string
  spec: string
  qty: string
  unit: string
  unitPrice: string
  /** PROPOSAL 모드: 범위 단가 시 최대값 (비우면 고정 단가) */
  unitPriceMax?: string
  /** FINAL(확정 견적) 전용: 비고(특이사항). PROPOSAL에서는 미표시 */
  note?: string
  /** 총액 맞춤 등으로 단가가 자동 조정된 행 표시 */
  adjusted?: boolean
  /**
   * 원가(비용) — 영업 담당자 전용. PDF·고객용 화면에서는 절대 렌더링하지 않음.
   * 수익성 분석 및 마진율 역계산에만 사용.
   */
  costPrice?: string
  /** 색상 — 품명 표준: [품명] ([사이즈] / [색상]) */
  color?: string
  /** 역산 원가 여부. true면 기본 마진 30%로 역산한 가상 원가이며, 실제 원가로 수정 시 false로 구분 */
  costEstimated?: boolean
  /** AI 추론으로 보정된 행 — 확인 필요 시 true, 수동 수정 또는 확인 시 해제 */
  aiUncertain?: boolean
  /** AI가 추론·보정 시 남긴 사유 (툴팁/작은 텍스트 노출) */
  aiReason?: string
  /** 과거 사례 추천에서 사용자가 [선택]한 케이스로 채워진 행 — 신뢰도 표시용 */
  is_confirmed?: boolean
}

export interface EstimateFormData {
  /** 예산 기획 vs 확정 견적 */
  mode: EstimateMode
  /** 수신자: 상호(업체명) */
  recipientName: string
  /** 수신자: 연락처 (상담에서 불러옴, 폼에서는 미표시) */
  recipientContact: string
  /** 견적일시 (표시/입력) */
  quoteDate: string
  /** 공급자: 사업자번호 */
  bizNumber: string
  /** 공급자: 주소 */
  address: string
  /** 공급자: 연락처 */
  supplierContact: string
  /** 대표자 직인 이미지 URL (빈 값이면 placeholder 영역만) */
  sealImageUrl: string
  /** 견적 행 목록 */
  rows: EstimateRow[]
  /** 특이사항 및 입금계좌 정보 */
  footerNotes: string
}

/** 빈 견적 행 생성 (20행 고정 시 패딩·PDF 출력용) */
export function createEmptyRow(index: number): EstimateRow {
  return {
    no: String(index + 1),
    name: '',
    spec: '',
    qty: '',
    unit: '',
    unitPrice: '',
    note: '',
    costPrice: '',
    color: '',
  }
}

/** 표준 품목 표시: [품명] ([사이즈] / [색상]). 사이즈·색상 없으면 괄호 생략 또는 일부만 */
function getRowDisplayName(row: EstimateRow): string {
  const n = String(row.name ?? '').trim()
  const s = String(row.spec ?? '').trim().replace(/\s*mm\s*$/i, '').trim()
  const c = String(row.color ?? '').trim()
  if (s && c) return n ? `${n} (${s} / ${c})` : `${s} / ${c}`
  if (s) return n ? `${n} (${s})` : s
  if (c) return n ? `${n} (${c})` : c
  return n
}

/** "품명 (사이즈 / 색상)" 또는 "품명 (사이즈)" 등 결합 문자열 파싱 */
function parseCombinedName(combined: string): { name: string; spec: string; color: string } {
  const t = combined.trim()
  const m = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (!m) return { name: t, spec: '', color: '' }
  const name = m[1].trim()
  const inner = m[2].trim()
  const slash = inner.indexOf('/')
  if (slash >= 0) {
    const spec = inner.slice(0, slash).trim()
    const color = inner.slice(slash + 1).trim()
    return { name, spec, color }
  }
  return { name, spec: inner, color: '' }
}

/** 날짜 문자열을 짧은 표시용으로 (YYYY-MM-DD → MM/DD) */
function formatDateShort(iso: string): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  return m && day ? `${m}/${day}` : d
}

export interface CostHistoryItem {
  date: string
  supplier: string
  cost: number
  /** true면 과거 견적에 원가 없이 단가만 있어서 30% 역산한 추정 원가 */
  estimated?: boolean
}

/** 품목 키(품목 및 규격 전체 텍스트)로 과거 견적에서 원가 이력 최대 4건 반환. 실제 원가 우선, 없으면 단가만 있는 건 역산 원가로 (추정) 표시 */
function getCostHistory(
  pastEstimates: PastEstimate[],
  fullKey: string,
  parseNumFn: (s: string) => number
): CostHistoryItem[] {
  const key = fullKey.trim().toLowerCase()
  if (!key) return []
  const items: CostHistoryItem[] = []
  for (const est of pastEstimates) {
    const data = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as {
      rows?: { name?: string; spec?: string; color?: string; costPrice?: string; unitPrice?: string }[]
    }
    const list = data?.rows ?? []
    for (const r of list) {
      const rowDisplay = getRowDisplayName(r as EstimateRow)
      if (rowDisplay.trim().toLowerCase() !== key) continue
      const cost = parseNumFn(r.costPrice ?? '')
      const unitP = parseNumFn(r.unitPrice ?? '')
      if (cost > 0) {
        items.push({ date: est.created_at ?? '', supplier: '—', cost })
      } else if (unitP > 0) {
        const estimatedCost = roundToPriceUnit(unitP * (1 - DEFAULT_MARGIN_PERCENT / 100))
        items.push({ date: est.created_at ?? '', supplier: '—', cost: estimatedCost, estimated: true })
      }
    }
  }
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return items.slice(0, 4)
}

const DEFAULT_MARGIN_PERCENT = 30
/** 견적서 행 20개 고정 (실무형 레이아웃) */
const FIXED_ESTIMATE_ROWS = 20

export interface PastEstimate {
  payload: Record<string, unknown>
  final_proposal_data: Record<string, unknown> | null
  approved_at: string | null
  created_at: string
  /** 원본보기(견적서 미리보기) 연동용 */
  id?: string
  consultation_id?: string
}

export interface EstimateFormProps {
  /** 초기 데이터 (없으면 빈 폼) */
  initialData?: Partial<EstimateFormData>
  /** 초기 모드 (없으면 FINAL) */
  initialMode?: EstimateMode
  /** 과거 견적 목록 (이전 단가 조회용) */
  pastEstimates?: PastEstimate[]
  /** 승인 시 콜백 — FINAL 모드에서만 호출, PDF 저장/전송·상담 상태 업데이트 */
  onApproved?: (data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) => void
  /** PROPOSAL → FINAL 전환 시 콜백 (데이터 유지한 채 모드만 전환) */
  onConvertToFinal?: (data: EstimateFormData) => void
  /** true 시 하단 승인/전환 버튼 숨김 (풀스크린 모달 헤더 버튼 사용 시) */
  hideInternalActions?: boolean
  /** 영업 담당자 전용: 원가 컬럼·수익 분석기 패널 노출 (PDF/고객 화면에서는 false) */
  showProfitabilityPanel?: boolean
  /** 과거 이력 [원본보기] 클릭 시 — 견적서 미리보기 모달 열기 */
  onRequestEstimatePreview?: (consultationId: string, estimateId: string) => void
  /** 원가표 [원본보기] 클릭 시 — image_url 라이트박스 열기 */
  onRequestPriceBookImage?: (imageUrl: string) => void
  className?: string
}

export interface EstimateFormHandle {
  getCurrentData: () => EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }
  requestApprove: () => void
}

export const EstimateForm = forwardRef<EstimateFormHandle, EstimateFormProps>(function EstimateForm(
  { initialData, initialMode = 'FINAL', pastEstimates = [], onApproved, onConvertToFinal, hideInternalActions, showProfitabilityPanel = false, onRequestEstimatePreview, onRequestPriceBookImage, className },
  ref
) {
  const [mode, setMode] = useState<EstimateMode>(initialData?.mode ?? initialMode)
  const [recipientName, setRecipientName] = useState(initialData?.recipientName ?? '')
  const [recipientContact, setRecipientContact] = useState(initialData?.recipientContact ?? '')
  const [quoteDate, setQuoteDate] = useState(
    initialData?.quoteDate ?? new Date().toISOString().slice(0, 16).replace('T', ' ')
  )
  const [footerNotes, setFooterNotes] = useState(initialData?.footerNotes ?? '')
  const [approved, setApproved] = useState(false)

  const [rows, setRows] = useState<EstimateRow[]>(() => {
    const raw = initialData?.rows
    if (!raw?.length) return Array.from({ length: FIXED_ESTIMATE_ROWS }, (_, i) => createEmptyRow(i))
    const mapped = raw.map((r) => {
      const row = { ...r } as EstimateRow
      const hasLegacyCombined = !row.spec && !row.color && String(row.name ?? '').includes('(')
      if (hasLegacyCombined) {
        const parsed = parseCombinedName(String(row.name ?? ''))
        row.name = parsed.name
        row.spec = parsed.spec
        row.color = parsed.color ?? ''
      }
      const unitP = parseNum(row.unitPrice ?? '')
      const costP = parseNum(row.costPrice ?? '')
      if (unitP > 0 && costP <= 0) {
        row.costPrice = String(roundToPriceUnit(unitP * (1 - DEFAULT_MARGIN_PERCENT / 100)))
        row.costEstimated = true
      }
      if (!row.color) row.color = ''
      return row
    })
    if (mapped.length >= FIXED_ESTIMATE_ROWS) return mapped
    return [
      ...mapped,
      ...Array.from({ length: FIXED_ESTIMATE_ROWS - mapped.length }, (_, i) => createEmptyRow(mapped.length + i)),
    ]
  })

  const [quickCommandInput, setQuickCommandInput] = useState('')
  const quickCommandInputRef = useRef<HTMLInputElement>(null)
  const [isProcessingQuickCommand, setIsProcessingQuickCommand] = useState(false)
  /** 과거 사례 추천 목록 — 사용자 선택 전까지 유지 */
  const [quickRecommendations, setQuickRecommendations] = useState<PastCaseRecommendation[] | null>(null)
  /** 추천 표시 중인 add_row 페이로드 (선택 시 또는 직접 입력 시 사용) */
  const [pendingAddRowFromQuick, setPendingAddRowFromQuick] = useState<{
    name: string
    qty: number
    unitPrice: number
    spec: string | null
    color: string | null
    is_uncertain?: boolean
    ai_reason?: string
  } | null>(null)
  /** 제품 마스터 목록 (과거 사례 추천 검색용) */
  const [productsList, setProductsList] = useState<{ name: string; supply_price?: number; spec?: string; color?: string }[]>([])
  /** AI 추천 가이드: 품명 입력 시 하단 패널에 표시할 행 인덱스 */
  const [guideRowIndex, setGuideRowIndex] = useState<number | null>(null)
  /** AI 추천 가이드: 과거 이력 기반 추천 목록 */
  const [guidePast, setGuidePast] = useState<PastCaseRecommendation[]>([])
  /** AI 추천 가이드: 최신 원가 기반 추천 (vendor_price_book / products) */
  const [guideVendor, setGuideVendor] = useState<VendorPriceRecommendation | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [pendingQuickCommand, setPendingQuickCommand] = useState<{
    name: string
    qty: number
    unitPrice: number
    specQuestion?: string
  } | null>(null)
  const [pastPriceResult, setPastPriceResult] = useState<{ name: string; unitPrice: number } | null>(null)
  const [galleryProductTag, setGalleryProductTag] = useState<string | null>(null)
  const [hasGalleryDataByProduct, setHasGalleryDataByProduct] = useState<Record<string, boolean>>({})
  /** 퀵 커맨드로 행 추가 시 onBlur가 발생하지 않으므로, 추가 직후 원가 자동 매칭용 */
  const lastQuickCommandProductNameRef = useRef<string | null>(null)

  const productNameKeys = useMemo(
    () => [...new Set(rows.map((r) => r.name?.trim()).filter(Boolean))].sort().join(','),
    [rows]
  )

  // 품명별 시공 데이터 유무 미리 조회 → 시공 버튼은 데이터 있을 때만 활성화
  useEffect(() => {
    const names = productNameKeys ? productNameKeys.split(',') : []
    if (names.length === 0) return
    let cancelled = false
    names.forEach((name) => {
      getDataByProductTag(name).then((res) => {
        if (cancelled) return
        setHasGalleryDataByProduct((prev) => ({ ...prev, [name]: res.images.length > 0 }))
      }).catch(() => {
        if (!cancelled) setHasGalleryDataByProduct((prev) => ({ ...prev, [name]: false }))
      })
    })
    return () => { cancelled = true }
  }, [productNameKeys])

  const searchPastPrice = useCallback(
    (fullKey: string): number | null => {
      const key = fullKey.trim().toLowerCase()
      if (!key) return null
      const hits: { price: number; created: string }[] = []
      for (const est of pastEstimates) {
        const data = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as {
          rows?: { name?: string; spec?: string; unitPrice?: string }[]
        }
        const list = data?.rows ?? []
        for (const r of list) {
          const rowDisplay = getRowDisplayName(r as EstimateRow)
          const rowKey = rowDisplay.trim().toLowerCase()
          if (!rowKey || rowKey !== key) continue
          const p = parseNum(r.unitPrice || '0')
          if (p > 0) hits.push({ price: p, created: est.created_at || '' })
        }
      }
      if (hits.length === 0) return null
      hits.sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      return hits[0].price
    },
    [pastEstimates]
  )

  const addRowFromQuickCommand = useCallback(
    (payload: {
      name: string
      qty: number
      unitPrice: number
      spec?: string | null
      color?: string | null
      is_uncertain?: boolean
      ai_reason?: string
      is_confirmed?: boolean
      costPrice?: number
    }) => {
      const productNameForLookup = (parseCombinedName(payload.name.trim()).name || payload.name).trim()
      if (productNameForLookup) lastQuickCommandProductNameRef.current = productNameForLookup
      const spec = (payload.spec ?? '').trim()
      const color = (payload.color ?? '').trim()
      const aiUncertain = payload.is_uncertain === true
      const aiReason = payload.ai_reason?.trim() ?? undefined
      const isConfirmed = payload.is_confirmed === true
      const costPrice = payload.costPrice != null && payload.costPrice > 0 ? payload.costPrice : undefined
      const displayPrice = costPrice != null ? roundToPriceUnit(costPrice / (1 - DEFAULT_MARGIN_PERCENT / 100)) : payload.unitPrice
      setRows((prev) => {
        const emptyIdx = prev.findIndex((r) => !getRowDisplayName(r).trim())
        const newData: Partial<EstimateRow> = {
          name: payload.name.trim(),
          spec,
          color,
          qty: String(payload.qty),
          unit: 'EA',
          unitPrice: String(displayPrice),
          ...(mode === 'PROPOSAL' ? {} : { note: '' }),
          ...(aiUncertain ? { aiUncertain: true, aiReason } : {}),
          ...(isConfirmed ? { is_confirmed: true } : {}),
          ...(costPrice != null ? { costPrice: String(costPrice), costEstimated: false } : {}),
        }
        let next: EstimateRow[]
        if (emptyIdx >= 0) {
          next = prev.map((r, i) =>
            i === emptyIdx ? { ...r, ...newData } as EstimateRow : r
          )
        } else {
          const newRow: EstimateRow = {
            no: String(prev.length + 1),
            name: payload.name.trim(),
            spec,
            color,
            qty: String(payload.qty),
            unit: 'EA',
            unitPrice: String(displayPrice),
            ...(mode === 'PROPOSAL' ? {} : { note: '' }),
            ...(aiUncertain ? { aiUncertain: true, aiReason } : {}),
            ...(isConfirmed ? { is_confirmed: true } : {}),
            ...(costPrice != null ? { costPrice: String(costPrice), costEstimated: false } : {}),
          }
          next = [...prev, newRow]
        }
        return next.map((r, i) => ({ ...r, no: String(i + 1) }))
      })
      setQuickCommandInput('')
      setPendingQuickCommand(null)
      setQuickRecommendations(null)
      setPendingAddRowFromQuick(null)
      queueMicrotask(() => quickCommandInputRef.current?.focus())
    },
    [mode]
  )

  const applyPastPrice = useCallback(
    (fullKey: string, unitPrice: number) => {
      addRowFromQuickCommand({ name: fullKey, qty: 1, unitPrice, spec: null })
      setPastPriceResult(null)
      setQuickCommandInput('')
    },
    [addRowFromQuickCommand]
  )

  const needsSpec = !!pendingQuickCommand

  /** 단가(unitPrice) 수정 시 마진율은 표시만 재계산됨. 수동 수정 시 AI 불확실 하이라이트 해제. */
  const updateRow = useCallback((index: number, field: keyof EstimateRow, value: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = next[index] as unknown as Record<string, unknown>
      row[field] = value
      next[index] = { ...next[index], ...row, aiUncertain: false, aiReason: undefined } as EstimateRow
      return next
    })
  }, [])

  /** 원가 직접 입력 시 기본 마진 30%로 판매단가 역산. 수동 수정 시 AI 불확실 하이라이트 해제. */
  const updateRowCostAndSellingPrice = useCallback((index: number, costValue: string) => {
    const cost = parseNum(costValue)
    setRows((prev) => {
      const next = [...prev]
      const r = next[index] as EstimateRow
      next[index] = { ...r, costPrice: costValue, costEstimated: false, aiUncertain: false, aiReason: undefined } as EstimateRow
      if (cost > 0) {
        const selling = roundToPriceUnit(cost / (1 - DEFAULT_MARGIN_PERCENT / 100))
        next[index].unitPrice = String(selling)
        if (mode === 'PROPOSAL' && r.unitPriceMax) next[index].unitPriceMax = String(selling)
      }
      return next
    })
  }, [mode])

  const updateRowNameCombined = useCallback((index: number, value: string) => {
    const normalized = value.trim().replace(/\s+/g, ' ')
    const { name, spec, color } = parseCombinedName(normalized)
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], name, spec, color, aiUncertain: false, aiReason: undefined } as EstimateRow
      return next
    })
  }, [])

  /** 원가 적용 + 기본 마진 30%로 판매단가 역산. clearAiUncertain true일 때만 AI 검토 하이라이트 해제(사용자가 이력에서 선택·확정 시). */
  const applyCostToRow = useCallback((index: number, cost: number, fromEstimated?: boolean, clearAiUncertain?: boolean) => {
    if (cost <= 0) return
    const sellingPrice = roundToPriceUnit(cost / (1 - DEFAULT_MARGIN_PERCENT / 100))
    setRows((prev) => {
      const next = [...prev]
      const r = next[index] as EstimateRow
      next[index] = {
        ...r,
        costPrice: String(cost),
        unitPrice: String(sellingPrice),
        costEstimated: !!fromEstimated,
        ...(clearAiUncertain ? { aiUncertain: false, aiReason: undefined } : {}),
      } as EstimateRow
      if (mode === 'PROPOSAL' && r.unitPriceMax) next[index].unitPriceMax = String(sellingPrice)
      return next
    })
  }, [mode])

  /** 품목 blur 시 원가 비어 있으면 1) 제품 마스터(products) 조회 → 2) 없으면 과거 견적 이력으로 채우기 */
  const handleNameBlurFillCost = useCallback(
    async (index: number) => {
      const row = rows[index] as EstimateRow
      const costStr = String(row.costPrice ?? '').trim()
      if (costStr) return
      const productName = String(row.name ?? '').trim()
      if (!productName) return
      const { data: product } = await supabase
        .from('products')
        .select('supply_price')
        .eq('name', productName)
        .maybeSingle()
      if (product != null && Number(product.supply_price) > 0) {
        applyCostToRow(index, Number(product.supply_price), false, false)
        return
      }
      const fullKey = getRowDisplayName(row).trim()
      if (!fullKey) return
      const history = getCostHistory(pastEstimates, fullKey, parseNum)
      if (history.length === 0) return
      const first = history[0]
      applyCostToRow(index, first.cost, first.estimated, true)
    },
    [rows, pastEstimates, applyCostToRow]
  )

  /** 제품 마스터 목록 로드 (과거 사례 추천 검색용) */
  useEffect(() => {
    supabase
      .from('products')
      .select('name, supply_price, spec, color')
      .then(({ data }) => {
        setProductsList((data ?? []).map((r) => ({ name: r?.name ?? '', supply_price: r?.supply_price ?? undefined, spec: r?.spec ?? undefined, color: r?.color ?? undefined })))
      })
  }, [])

  /** AI 추천 가이드: 선택된 행의 품명으로 과거 이력·원가표 추천 로드 (디바운스 300ms) */
  useEffect(() => {
    if (guideRowIndex == null || guideRowIndex < 0 || guideRowIndex >= rows.length) {
      setGuidePast([])
      setGuideVendor(null)
      setGuideLoading(false)
      return
    }
    const row = rows[guideRowIndex]
    const productName = (parseCombinedName(getRowDisplayName(row)).name || (row.name ?? '').trim()).trim()
    if (!productName) {
      setGuidePast([])
      setGuideVendor(null)
      setGuideLoading(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setGuideLoading(true)
      const spec = (row.spec ?? '').trim() || null
      const color = (row.color ?? '').trim() || null

      const pastCaseRows: PastCaseCandidate[] = []
      pastEstimates.forEach((est, estIdx) => {
        const data = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as {
          rows?: { name?: string; spec?: string; color?: string; unitPrice?: string; costPrice?: string }[]
          quoteDate?: string
          recipientName?: string
        }
        const list = data?.rows ?? []
        const estWithIds = est as PastEstimate & { id?: string; consultation_id?: string }
        const appliedDate = (data?.quoteDate ?? est.created_at ?? '').toString().slice(0, 10)
        const siteName = String(data?.recipientName ?? '').trim() || undefined
        list.forEach((r, rowIdx) => {
          const name = String(r.name ?? '').trim()
          if (!name) return
          pastCaseRows.push({
            case_id: `est-${estIdx}-${rowIdx}`,
            name,
            spec: (r.spec ?? '').trim() || null,
            color: (r.color ?? '').trim() || null,
            unitPrice: parseNum(r.unitPrice ?? ''),
            costPrice: parseNum(r.costPrice ?? '') || undefined,
            consultation_id: estWithIds.consultation_id,
            estimate_id: estWithIds.id,
            appliedDate: appliedDate || undefined,
            siteName,
          })
        })
      })

      const past = searchPastCaseRecommendations({
        name: productName,
        spec,
        color,
        products: productsList,
        pastCaseRows,
      })

      if (!cancelled) setGuidePast(past)
      void getVendorPriceRecommendation(supabase, productName).then((vendor) => {
        if (cancelled) return
        setGuideVendor(vendor ?? null)
        setGuideLoading(false)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [guideRowIndex, rows, pastEstimates, productsList])

  /** 퀵 커맨드로 행 추가 시 품목란 onBlur가 없으므로, 추가 직후 제품 마스터에서 원가 조회해 채우기 */
  useEffect(() => {
    const name = lastQuickCommandProductNameRef.current
    if (!name || !showProfitabilityPanel) return
    lastQuickCommandProductNameRef.current = null
    const idx = rows.findIndex((r) => {
      const rowProductName = (parseCombinedName(getRowDisplayName(r)).name || (r.name ?? '').trim()).trim()
      return rowProductName === name && !String(r.costPrice ?? '').trim()
    })
    if (idx < 0) return
    supabase
      .from('products')
      .select('supply_price')
      .eq('name', name)
      .maybeSingle()
      .then(({ data }) => {
        if (data != null && Number(data.supply_price) > 0) {
          applyCostToRow(idx, Number(data.supply_price), false, false)
        }
      })
  }, [rows, showProfitabilityPanel, applyCostToRow])

  /** 마진율 수정 시 판매단가만 역산. 수동 수정 시 AI 불확실 하이라이트 해제. */
  const updateRowMarginPercent = useCallback((index: number, marginPercentStr: string) => {
    const pct = parseFloat(String(marginPercentStr).replace(/,/g, ''))
    if (Number.isNaN(pct) || pct < 0 || pct >= 100) return
    setRows((prev) => {
      const next = [...prev]
      const r = next[index] as EstimateRow
      const cost = parseNum(r.costPrice ?? '')
      if (cost <= 0) return prev
      const sellingPrice = roundToPriceUnit(cost / (1 - pct / 100))
      next[index] = { ...r, unitPrice: String(sellingPrice), aiUncertain: false, aiReason: undefined } as EstimateRow
      if (mode === 'PROPOSAL' && r.unitPriceMax) next[index].unitPriceMax = String(sellingPrice)
      return next
    })
  }, [mode])

  /** AI 추천 가이드: 추천가 클릭 시 해당 행에 단가(및 원가) 적용 */
  const applyGuidePriceToRow = useCallback(
    (unitPrice: number, costPrice?: number) => {
      if (guideRowIndex == null || guideRowIndex < 0 || guideRowIndex >= rows.length) return
      setRows((prev) => {
        const next = [...prev]
        const r = next[guideRowIndex] as EstimateRow
        next[guideRowIndex] = {
          ...r,
          unitPrice: String(unitPrice),
          ...(costPrice != null && costPrice > 0 ? { costPrice: String(costPrice), costEstimated: false } : {}),
          is_confirmed: true,
        } as EstimateRow
        if (mode === 'PROPOSAL' && r.unitPriceMax) next[guideRowIndex].unitPriceMax = String(unitPrice)
        return next
      })
      toast.success('추천 단가가 적용되었습니다.')
    },
    [guideRowIndex, rows.length, mode]
  )

  /** AI 추론 행 확인 — 하이라이트 해제 */
  const clearRowAiUncertain = useCallback((index: number) => {
    setRows((prev) => {
      const next = [...prev]
      const r = next[index] as EstimateRow
      next[index] = { ...r, aiUncertain: false, aiReason: undefined } as EstimateRow
      return next
    })
  }, [])

  const deleteRow = useCallback((index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== index)
      return next.map((r, i) => ({ ...r, no: String(i + 1) }))
    })
  }, [])

  /** 행별 금액 — FINAL: 단일값, PROPOSAL: 단일 또는 min~max (단일 품목 리스트만) */
  const { rowAmounts, rowAmountsMax, supplyTotal, supplyTotalMax, vat, vatMax, grandTotal, grandTotalMax, isRange } = useMemo(() => {
    const qtyList = rows.map((r) => parseNum(r.qty))
    const singleAmounts = rows.map((r, i) => {
      const q = qtyList[i]
      const p = parseNum(r.unitPrice)
      return q * p
    })
    const minAmounts = rows.map((r, i) => {
      const q = qtyList[i]
      const pMin = parseNum(r.unitPrice)
      const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
      return q * Math.min(pMin, pMax)
    })
    const maxAmounts = rows.map((r, i) => {
      const q = qtyList[i]
      const pMin = parseNum(r.unitPrice)
      const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
      return q * Math.max(pMin, pMax)
    })
    const totalMin = minAmounts.reduce((a, b) => a + b, 0)
    const totalMax = maxAmounts.reduce((a, b) => a + b, 0)
    const useRange = mode === 'PROPOSAL'
    const total = useRange ? totalMin : singleAmounts.reduce((a, b) => a + b, 0)
    const totalMaxVal = useRange ? totalMax : total
    const vatVal = Math.round(total * 0.1)
    const vatMaxVal = Math.round(totalMaxVal * 0.1)
    return {
      rowAmounts: useRange ? minAmounts : singleAmounts,
      rowAmountsMax: useRange ? maxAmounts : singleAmounts,
      supplyTotal: total,
      supplyTotalMax: totalMaxVal,
      vat: vatVal,
      vatMax: vatMaxVal,
      grandTotal: total + vatVal,
      grandTotalMax: totalMaxVal + vatMaxVal,
      isRange: useRange,
    }
  }, [rows, mode])

  const totalCost = useMemo(() => computeTotalCost(rows, parseNum), [rows])
  const marginPercent = useMemo(() => {
    if (supplyTotal <= 0) return 0
    return Number((((supplyTotal - totalCost) / supplyTotal) * 100).toFixed(1))
  }, [supplyTotal, totalCost])

  const applyTargetPricing = useCallback(
    (targetTotal: number) => {
      const currentTotal = mode === 'PROPOSAL' ? grandTotalMax : grandTotal
      if (currentTotal <= 0) {
        toast.error('조정할 품목이 없습니다.')
        return
      }
      const factor = scaleFactorToTarget(currentTotal, targetTotal)
      setRows((prev) =>
        prev.map((r) => {
          const p = parseNum(r.unitPrice)
          if (p <= 0) return r
          const newP = Math.round(p * factor)
          const updated = { ...r, unitPrice: String(newP), adjusted: true as const }
          if (r.unitPriceMax) {
            const pMax = parseNum(r.unitPriceMax)
            if (pMax > 0) updated.unitPriceMax = String(Math.round(pMax * factor))
          }
          return updated
        })
      )
      setQuickCommandInput('')
      toast.success(`총액 ${formatNumber(targetTotal)}원에 맞춰 단가를 조정했습니다.`)
      queueMicrotask(() => quickCommandInputRef.current?.focus())
    },
    [mode, grandTotal, grandTotalMax]
  )

  const applyTargetMargin = useCallback((targetMarginPct: number) => {
    const updated = adjustUnitPricesToTargetMargin(rows, targetMarginPct, parseNum)
    setRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        unitPrice: updated[i].unitPrice,
        ...(updated[i].unitPriceMax != null ? { unitPriceMax: updated[i].unitPriceMax } : {}),
        adjusted: true as const,
      }))
    )
    setQuickCommandInput('')
    toast.success(`마진율 ${targetMarginPct}%에 맞춰 단가를 조정했습니다. (원가 하한 적용)`)
    queueMicrotask(() => quickCommandInputRef.current?.focus())
  }, [rows])

  const handleQuickCommandSubmit = useCallback(async () => {
    if (isProcessingQuickCommand) return
    const input = quickCommandInput.trim().replace(/\s+/g, ' ').replace(/\n/g, ' ')
    if (!input) return
    setIsProcessingQuickCommand(true)
    setQuickCommandInput('')
    try {
      const res = await aiParse(input, { pendingSpec: !!pendingQuickCommand })

      if (pendingQuickCommand && res?.type === 'spec_reply') {
        addRowFromQuickCommand({ ...pendingQuickCommand, spec: res.spec, color: res.color ?? undefined })
        return
      }
      if (pendingQuickCommand) {
        toast.info('규격을 입력하거나 "없음"을 입력해 주세요.')
        return
      }

      if (!res) return
      switch (res.type) {
        case 'add_row': {
          const pastCaseRows: PastCaseCandidate[] = []
          pastEstimates.forEach((est, estIdx) => {
            const data = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as {
              rows?: { name?: string; spec?: string; color?: string; unitPrice?: string; costPrice?: string }[]
              quoteDate?: string
              recipientName?: string
            }
            const list = data?.rows ?? []
            const estWithIds = est as PastEstimate & { id?: string; consultation_id?: string }
            const appliedDate = (data?.quoteDate ?? est.created_at ?? '').toString().slice(0, 10)
            const siteName = String(data?.recipientName ?? '').trim() || undefined
            list.forEach((r, rowIdx) => {
              const name = String(r.name ?? '').trim()
              if (!name) return
              pastCaseRows.push({
                case_id: `est-${estIdx}-${rowIdx}`,
                name,
                spec: (r.spec ?? '').trim() || null,
                color: (r.color ?? '').trim() || null,
                unitPrice: parseNum(r.unitPrice ?? ''),
                costPrice: parseNum(r.costPrice ?? '') || undefined,
                consultation_id: estWithIds.consultation_id,
                estimate_id: estWithIds.id,
                appliedDate: appliedDate || undefined,
                siteName,
              })
            })
          })
          const recs = searchPastCaseRecommendations({
            name: res.name,
            spec: res.spec ?? null,
            color: res.color ?? null,
            products: productsList,
            pastCaseRows,
          })
          setPendingAddRowFromQuick({
            name: res.name,
            qty: res.qty,
            unitPrice: res.unitPrice,
            spec: res.spec ?? null,
            color: res.color ?? null,
            is_uncertain: res.is_uncertain,
            ai_reason: res.ai_reason ?? undefined,
          })
          setQuickRecommendations(recs)
          break
        }
        case 'past_price': {
          const price = searchPastPrice(res.productName)
          if (price != null) {
            setPastPriceResult({ name: res.productName, unitPrice: price })
          } else {
            toast.info(`'${res.productName}'에 대한 과거 단가 이력이 없습니다.`)
          }
          break
        }
        case 'target_total':
          applyTargetPricing(res.amount)
          break
        case 'target_margin':
          applyTargetMargin(res.marginPercent)
          break
        case 'needs_unit_price':
          toast.info('단가는 얼마로 책정할까요?', { description: '예: 12 (만원) 또는 25만원' })
          break
        case 'needs_spec':
          setPendingQuickCommand({
            name: res.name,
            qty: res.qty,
            unitPrice: res.unitPrice,
            specQuestion: res.specQuestion,
          })
          queueMicrotask(() => quickCommandInputRef.current?.focus())
          break
        default:
          break
      }
    } finally {
      setTimeout(() => setIsProcessingQuickCommand(false), 500)
    }
  }, [quickCommandInput, pendingQuickCommand, isProcessingQuickCommand, addRowFromQuickCommand, searchPastPrice, applyTargetPricing, applyTargetMargin])

  /* 엔터 두 줄 입력 버그 완전 차단: (1) KeyDown에서 Enter 시 prevent/stop + isComposing 시 리턴 (한글 조합 중 이중 실행 방지) (2) KeyPress에서도 Enter 차단 (3) 제출 시 입력창 즉시 비움 + isProcessing 0.5초 잠금 (4) onChange에서 \n → 공백 */
  const handleQuickCommandKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      if (e.nativeEvent.isComposing) return
      void handleQuickCommandSubmit()
    },
    [handleQuickCommandSubmit]
  )
  const handleQuickCommandKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])
  const handleQuickCommandChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\n/g, ' ')
    setQuickCommandInput(v)
  }, [])

  const handleApprove = useCallback(() => {
    setApproved(true)
    const data: EstimateFormData = {
      mode: 'FINAL',
      recipientName,
      recipientContact,
      quoteDate,
      bizNumber: SUPPLIER_FIXED.bizNumber,
      address: SUPPLIER_FIXED.address,
      supplierContact: SUPPLIER_FIXED.contact,
      sealImageUrl: '',
      rows,
      footerNotes,
    }
    onApproved?.({
      ...data,
      supplyTotal: supplyTotal,
      vat,
      grandTotal,
    })
  }, [
    recipientName,
    recipientContact,
    quoteDate,
    rows,
    mode,
    footerNotes,
    supplyTotal,
    vat,
    grandTotal,
    onApproved,
  ])

  /** 예산 기획안 → 확정 견적서 전환: 데이터 유지, 범위는 중간값으로 */
  const handleConvertToFinal = useCallback(() => {
    const convertedRows: EstimateRow[] = rows.map((r) => {
      const q = parseNum(r.qty)
      const pMin = parseNum(r.unitPrice)
      const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
      const mid = pMin && (pMax > pMin) ? Math.round((pMin + pMax) / 2) : pMin || pMax
      return { ...r, unitPrice: String(mid), unitPriceMax: undefined }
    })
    const data: EstimateFormData = {
      mode: 'FINAL',
      recipientName,
      recipientContact,
      quoteDate,
      bizNumber: SUPPLIER_FIXED.bizNumber,
      address: SUPPLIER_FIXED.address,
      supplierContact: SUPPLIER_FIXED.contact,
      sealImageUrl: '',
      rows: convertedRows,
      footerNotes,
    }
    setRows(convertedRows)
    setMode('FINAL')
    onConvertToFinal?.(data)
  }, [rows, recipientName, recipientContact, quoteDate, footerNotes, onConvertToFinal])

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow(prev.length)])
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      getCurrentData: () => {
        const data: EstimateFormData = {
          mode,
          recipientName,
          recipientContact,
          quoteDate,
          bizNumber: SUPPLIER_FIXED.bizNumber,
          address: SUPPLIER_FIXED.address,
          supplierContact: SUPPLIER_FIXED.contact,
          sealImageUrl: '',
          rows,
          footerNotes,
        }
        return { ...data, supplyTotal: supplyTotal, vat, grandTotal }
      },
      requestApprove: () => handleApprove(),
    }),
    [
      recipientName,
      recipientContact,
      quoteDate,
      rows,
      mode,
      footerNotes,
      supplyTotal,
      vat,
      grandTotal,
      handleApprove,
    ]
  )

  return (
    <article
      className={cn('mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-lg shadow-sm overflow-hidden print:w-[210mm] print:max-w-[210mm]', className)}
      aria-label={mode === 'PROPOSAL' ? '예산 기획안' : '견적서'}
    >
      {/* ——— 0. 듀얼 모드 스위치 ——— */}
      <div className="flex items-center gap-2 p-4 border-b border-border bg-muted/30">
        <span className="text-sm font-medium text-muted-foreground">모드</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('PROPOSAL')}
            className={cn('px-3 py-1.5 text-sm font-medium transition-colors', mode === 'PROPOSAL' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
          >
            예산 기획(PROPOSAL)
          </button>
          <button
            type="button"
            onClick={() => setMode('FINAL')}
            className={cn('px-3 py-1.5 text-sm font-medium transition-colors', mode === 'FINAL' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
          >
            확정 견적(FINAL)
          </button>
        </div>
      </div>

      {/* ——— 1. 상단 헤더 ——— */}
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 p-6 border-b border-border">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {mode === 'PROPOSAL' ? '예산 기획안' : '견적서'}
          </h1>
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">상호(업체명)</span>
              <Input
                className="max-w-xs inline-flex h-9"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="업체명"
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">견적일시</span>
              <Input
                className="max-w-xs inline-flex h-9"
                type="datetime-local"
                value={quoteDate.replace(' ', 'T')}
                onChange={(e) => setQuoteDate(e.target.value.replace('T', ' '))}
              />
            </div>
          </div>
        </div>
        <div className="text-sm text-right space-y-1">
          <p><span className="text-muted-foreground">사업자번호</span> <span className="font-medium">{SUPPLIER_FIXED.bizNumber}</span></p>
          <p><span className="text-muted-foreground">상호</span> <span className="font-medium">{SUPPLIER_FIXED.company}</span></p>
          <p><span className="text-muted-foreground">대표이사</span> <span className="font-medium">김지윤</span></p>
          <p><span className="text-muted-foreground">주소</span> <span className="font-medium">{SUPPLIER_FIXED.address}</span></p>
          <p><span className="text-muted-foreground">연락처</span> <span className="font-medium">{SUPPLIER_FIXED.contact}</span></p>
        </div>
      </header>

      {/* ——— 1.5 AI 퀵 커맨드 (테스트 모드) ——— */}
      <div className="px-4 py-2 border-b border-border bg-muted/20 print:hidden">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">AI 퀵 커맨드</label>
        <div className="flex gap-2">
          <Input
            ref={quickCommandInputRef}
            type="text"
            autoComplete="off"
            placeholder={needsSpec ? '1200 600 720 또는 없음' : '예: 스마트A 1200 600 720 10 15만'}
            value={quickCommandInput}
            onChange={handleQuickCommandChange}
            onKeyDown={handleQuickCommandKeyDown}
            onKeyPress={handleQuickCommandKeyPress}
            className="h-9 text-sm flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleQuickCommandSubmit}
            title="추가"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {needsSpec && pendingQuickCommand && (
          <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-400 font-medium">
            {pendingQuickCommand.specQuestion ?? '규격을 알려주세요. (예: 1200 600 720 / 없으면 없음)'}
          </p>
        )}
        {pastPriceResult && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-sm text-foreground">
              지난번엔 <span className="font-semibold text-primary">{formatNumber(pastPriceResult.unitPrice)}원</span>에 나갔습니다.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyPastPrice(pastPriceResult.name, pastPriceResult.unitPrice)}
            >
              적용할까요?
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPastPriceResult(null)}
            >
              취소
            </button>
          </div>
        )}
        {/* 과거 사례 추천 — 사용자 선택 시에만 행에 바인딩 (AI는 검색 도우미) */}
        {pendingAddRowFromQuick && quickRecommendations !== null && (
          <div className="mt-2 space-y-2">
            {quickRecommendations.length > 0 ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">과거 작업 케이스 추천 (선택 시 해당 행에 반영)</p>
                <div className="flex flex-wrap gap-2">
                  {quickRecommendations.map((c) => {
                    const ms = c.matchStatus
                    const matchText = [
                      `품명 ${ms.name ? '일치' : '불일치'}`,
                      `사이즈 ${ms.size ? '일치' : '불일치'}`,
                      `색상 ${ms.color ? '일치' : '불일치'}`,
                    ].join(' · ')
                    return (
                    <div
                      key={c.case_id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.name}{c.size ? ` · ${c.size}` : ''}{c.color ? ` / ${c.color}` : ''}</p>
                        <p className="text-xs text-muted-foreground">
                          종전 원가: {c.costPrice != null && c.costPrice > 0 ? `${formatNumber(c.costPrice)}원` : '—'} · {matchText}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => {
                          addRowFromQuickCommand({
                            name: pendingAddRowFromQuick.name,
                            qty: pendingAddRowFromQuick.qty,
                            unitPrice: c.price,
                            spec: pendingAddRowFromQuick.spec ?? c.size,
                            color: pendingAddRowFromQuick.color ?? c.color,
                            is_confirmed: true,
                            costPrice: c.costPrice,
                          })
                        }}
                      >
                        선택
                      </Button>
                    </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">위 추천이 없으면 직접 입력하세요.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    addRowFromQuickCommand(pendingAddRowFromQuick)
                    setPendingAddRowFromQuick(null)
                    setQuickRecommendations(null)
                  }}
                >
                  직접 입력으로 추가
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">새로운 조합입니다. 직접 입력하시겠습니까?</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    addRowFromQuickCommand(pendingAddRowFromQuick)
                    setPendingAddRowFromQuick(null)
                    setQuickRecommendations(null)
                  }}
                >
                  직접 입력
                </Button>
                <button
                  type="button"
                  className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setPendingAddRowFromQuick(null)
                    setQuickRecommendations(null)
                  }}
                >
                  취소
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ——— 2. 메인 견적 테이블 (모드별 양식 분리) ——— */}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-base leading-snug min-w-[720px] print:w-[210mm]">
          <thead>
            <tr className="bg-muted/50">
              {mode === 'PROPOSAL' ? (
                /* 예산 기획안: 품목 및 규격 통합 컬럼 */
                <>
                  <th className="border border-border px-2 py-2 text-left font-semibold w-12">번호</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold min-w-[320px]">품목 및 규격</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold w-16">수량</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold w-14">단위</th>
                  <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px]">단가(최소)</th>
                  <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px]">단가(최대)</th>
                  {showProfitabilityPanel && (
                    <>
                      <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px] print:hidden" data-html2canvas-ignore>원가</th>
                      <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px] print:hidden" data-html2canvas-ignore>마진율</th>
                    </>
                  )}
                  <th className="border border-border px-2 py-2 text-right font-semibold min-w-[140px]">금액(공급가)</th>
                  <th className="border border-border px-2 py-2 w-9 print:hidden" aria-label="행 삭제" data-html2canvas-ignore />
                </>
              ) : (
                /* 확정 견적서: 품목 및 규격 통합, 비고(Remarks) 포함 */
                <>
                  <th className="border border-border px-2 py-2 text-left font-semibold w-10">번호</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold min-w-[320px]">품목 및 규격</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold w-14">수량</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold w-12">단위</th>
                  <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px]">단가</th>
                  {showProfitabilityPanel && (
                    <>
                      <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px] print:hidden" data-html2canvas-ignore>원가</th>
                      <th className="border border-border px-2 py-2 text-right font-semibold min-w-[92px] print:hidden" data-html2canvas-ignore>마진율</th>
                    </>
                  )}
                  <th className="border border-border px-2 py-2 text-right font-semibold min-w-[140px]">금액(공급가)</th>
                  <th className="border border-border px-2 py-2 text-left font-semibold min-w-[100px]">비고(Remarks)</th>
                  <th className="border border-border px-2 py-2 w-9 print:hidden" aria-label="행 삭제" data-html2canvas-ignore />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {mode === 'PROPOSAL' ? (
              rows.map((row, idx) => (
                <tr key={idx} className={cn('border-b border-border', row.aiUncertain && 'bg-yellow-50 dark:bg-yellow-950/30')} title={row.aiUncertain && row.aiReason ? row.aiReason : undefined}>
                  <td className="border border-border px-2 py-2 w-12">
                    <Input className="h-9 border-0 rounded-none bg-transparent" value={row.no} onChange={(e) => updateRow(idx, 'no', e.target.value)} readOnly tabIndex={-1} />
                  </td>
                  <td className="border border-border px-2 py-2 min-w-[320px]">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Input className="h-9 flex-1 border-0 rounded-none bg-transparent min-w-0" value={getRowDisplayName(row)} onChange={(e) => updateRowNameCombined(idx, e.target.value)} onBlur={() => { showProfitabilityPanel && handleNameBlurFillCost(idx); setGuideRowIndex(idx) }} onFocus={() => setGuideRowIndex(idx)} placeholder="품목명 (규격)" title={row.aiReason} />
                      {guideRowIndex === idx && (guideLoading || guidePast.length > 0 || guideVendor != null) && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">AI 가이드</span>
                      )}
                      {row.name?.trim() && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                          title="시공사례 보기"
                          disabled={hasGalleryDataByProduct[row.name] !== true}
                          onClick={() => {
                            const tag = row.name?.trim() ?? null
                            if (tag) console.log('[EstimateForm] 시공사례 아이콘 클릭 — productTag:', tag)
                            setGalleryProductTag(tag)
                          }}
                          aria-label="시공사례 보기"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      )}
                      {row.adjusted && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">조정됨</span>}
                      {row.is_confirmed && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200">과거사례</span>}
                      {row.aiUncertain && (
                        <>
                          {row.aiReason && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-amber-800 dark:text-amber-200 max-w-[200px]" title={row.aiReason}>
                              <Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                              <span className="font-medium">검토 사유:</span>
                              <span className="truncate">{row.aiReason}</span>
                            </span>
                          )}
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => clearRowAiUncertain(idx)} title={row.aiReason}>확인</Button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="border border-border px-2 py-2 w-16">
                    <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.qty)} onChange={(e) => updateRow(idx, 'qty', removeComma(e.target.value))} />
                  </td>
                  <td className="border border-border px-2 py-2 w-14">
                    <Input className="h-9 border-0 rounded-none bg-transparent" value={row.unit} onChange={(e) => updateRow(idx, 'unit', e.target.value)} placeholder="EA" />
                  </td>
                  <td className="border border-border px-2 py-2 text-right min-w-[92px] align-middle">
                    <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.unitPrice)} onChange={(e) => updateRow(idx, 'unitPrice', removeComma(e.target.value))} placeholder="최소" />
                  </td>
                  <td className="border border-border px-2 py-2 text-right min-w-[92px] align-middle">
                    <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.unitPriceMax ?? '')} onChange={(e) => updateRow(idx, 'unitPriceMax', removeComma(e.target.value))} placeholder="최대" />
                  </td>
                  {showProfitabilityPanel && (() => {
                    const unitP = parseNum(row.unitPrice)
                    const costP = parseNum(row.costPrice ?? '')
                    const rowMarginPct = unitP > 0 ? ((unitP - costP) / unitP) * 100 : 0
                    const marginClass = getMarginSignalClass(rowMarginPct)
                    return (
                      <>
                        <td className="border border-border px-2 py-2 text-right min-w-[92px] align-middle print:hidden" data-html2canvas-ignore>
                          <div className="flex items-center justify-end gap-0.5 flex-wrap">
                            <Input data-cost-input-row={idx} className="h-9 w-20 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.costPrice ?? '')} onChange={(e) => updateRowCostAndSellingPrice(idx, removeComma(e.target.value))} placeholder="원가" />
                            {row.costEstimated && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">역산됨</span>}
                          </div>
                        </td>
                        <td className={cn('border border-border px-2 py-2 text-right min-w-[92px] align-middle print:hidden', marginClass)} data-html2canvas-ignore>
                          <div className="flex items-center justify-end gap-0.5">
                            <Input className="h-9 min-w-[52px] w-14 border-0 rounded-none bg-transparent text-right text-inherit tabular-nums" inputMode="decimal" value={unitP > 0 ? Number(rowMarginPct.toFixed(1)) : ''} onChange={(e) => updateRowMarginPercent(idx, e.target.value)} placeholder="30" />
                            {unitP > 0 && <span className="text-[10px] text-muted-foreground">%</span>}
                          </div>
                        </td>
                      </>
                    )
                  })()}
                  <td className="border border-border px-2 py-2 text-right tabular-nums font-medium min-w-[140px]">
                    {`${formatNumber(rowAmounts[idx])} ~ ${formatNumber(rowAmountsMax[idx])}`}
                  </td>
                  <td className="border border-border px-2 py-2 w-9 text-center print:hidden" data-html2canvas-ignore>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteRow(idx)} title="행 삭제" disabled={rows.length <= FIXED_ESTIMATE_ROWS}>
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              rows.map((row, idx) => (
                <tr key={idx} className={cn('border-b border-border', row.aiUncertain && 'bg-yellow-50 dark:bg-yellow-950/30')} title={row.aiUncertain && row.aiReason ? row.aiReason : undefined}>
                  <td className="border border-border px-2 py-2 w-10">
                    <Input className="h-9 border-0 rounded-none bg-transparent" value={row.no} onChange={(e) => updateRow(idx, 'no', e.target.value)} readOnly tabIndex={-1} />
                  </td>
                  <td className="border border-border px-2 py-2 min-w-[320px]">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Input className="h-9 flex-1 border-0 rounded-none bg-transparent min-w-0" value={getRowDisplayName(row)} onChange={(e) => updateRowNameCombined(idx, e.target.value)} onBlur={() => { showProfitabilityPanel && handleNameBlurFillCost(idx); setGuideRowIndex(idx) }} onFocus={() => setGuideRowIndex(idx)} placeholder="품목명 (규격)" title={row.aiReason} />
                      {guideRowIndex === idx && (guideLoading || guidePast.length > 0 || guideVendor != null) && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">AI 가이드</span>
                      )}
                      {row.name?.trim() && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                          title="시공사례 보기"
                          disabled={hasGalleryDataByProduct[row.name] !== true}
                          onClick={() => {
                            const tag = row.name?.trim() ?? null
                            if (tag) console.log('[EstimateForm] 시공사례 아이콘 클릭 — productTag:', tag)
                            setGalleryProductTag(tag)
                          }}
                          aria-label="시공사례 보기"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      )}
                      {row.adjusted && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">조정됨</span>}
                      {row.is_confirmed && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200">과거사례</span>}
                      {row.aiUncertain && (
                        <>
                          {row.aiReason && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-amber-800 dark:text-amber-200 max-w-[200px]" title={row.aiReason}>
                              <Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                              <span className="font-medium">검토 사유:</span>
                              <span className="truncate">{row.aiReason}</span>
                            </span>
                          )}
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => clearRowAiUncertain(idx)} title={row.aiReason}>확인</Button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="border border-border px-2 py-2 w-14">
                    <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.qty)} onChange={(e) => updateRow(idx, 'qty', removeComma(e.target.value))} />
                  </td>
                  <td className="border border-border px-2 py-2 w-12">
                    <Input className="h-9 border-0 rounded-none bg-transparent" value={row.unit} onChange={(e) => updateRow(idx, 'unit', e.target.value)} placeholder="EA" />
                  </td>
                  <td className="border border-border px-2 py-2 text-right min-w-[92px] align-middle">
                    <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.unitPrice)} onChange={(e) => updateRow(idx, 'unitPrice', removeComma(e.target.value))} />
                  </td>
                  {showProfitabilityPanel && (() => {
                    const unitP = parseNum(row.unitPrice)
                    const costP = parseNum(row.costPrice ?? '')
                    const rowMarginPct = unitP > 0 ? ((unitP - costP) / unitP) * 100 : 0
                    const marginClass = getMarginSignalClass(rowMarginPct)
                    return (
                      <>
                        <td className="border border-border px-2 py-2 text-right min-w-[92px] align-middle print:hidden" data-html2canvas-ignore>
                          <div className="flex items-center justify-end gap-0.5 flex-wrap">
                            <Input data-cost-input-row={idx} className="h-9 w-20 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={addComma(row.costPrice ?? '')} onChange={(e) => updateRowCostAndSellingPrice(idx, removeComma(e.target.value))} placeholder="원가" />
                            {row.costEstimated && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">역산됨</span>}
                          </div>
                        </td>
                        <td className={cn('border border-border px-2 py-2 text-right min-w-[92px] align-middle print:hidden', marginClass)} data-html2canvas-ignore>
                          <div className="flex items-center justify-end gap-0.5">
                            <Input className="h-9 min-w-[52px] w-14 border-0 rounded-none bg-transparent text-right text-inherit tabular-nums" inputMode="decimal" value={unitP > 0 ? Number(rowMarginPct.toFixed(1)) : ''} onChange={(e) => updateRowMarginPercent(idx, e.target.value)} placeholder="30" />
                            {unitP > 0 && <span className="text-[10px] text-muted-foreground">%</span>}
                          </div>
                        </td>
                      </>
                    )
                  })()}
                  <td className="border border-border px-2 py-2 text-right tabular-nums font-medium min-w-[140px]">
                    {formatNumber(rowAmounts[idx])}
                  </td>
                  <td className="border border-border px-2 py-2 min-w-[100px]">
                    <Input className="h-9 border-0 rounded-none bg-transparent" value={row.note ?? ''} onChange={(e) => updateRow(idx, 'note', e.target.value)} placeholder="특이사항" />
                  </td>
                  <td className="border border-border px-2 py-2 w-9 text-center print:hidden" data-html2canvas-ignore>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteRow(idx)} title="행 삭제" disabled={rows.length <= FIXED_ESTIMATE_ROWS}>
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* AI 추천 가이드: 품명 입력 시 과거 이력·원가표 기반 추천 + 원클릭 적용 + 원본보기 */}
      {(guideRowIndex != null && (guidePast.length > 0 || guideVendor != null || guideLoading)) && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 print:hidden space-y-3" data-html2canvas-ignore>
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary">AI 가이드</span>
            추천가 클릭 시 단가 적용
          </p>
          {guideLoading && (
            <p className="text-sm text-muted-foreground">추천 조회 중…</p>
          )}
          {!guideLoading && guidePast.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">[추천 A: 과거 이력]</p>
              <ul className="flex flex-wrap gap-2">
                {guidePast.map((rec, i) => {
                  const cost = rec.costPrice ?? 0
                  const marginPct = rec.price > 0 && cost > 0 ? ((rec.price - cost) / rec.price) * 100 : 30
                  const marginClass = getMarginSignalClass(marginPct)
                  const dateStr = formatDateYYMMDD(rec.appliedDate)
                  const label = dateStr ? `${rec.siteName || '과거'} (${dateStr})` : (rec.siteName || '과거')
                  return (
                    <li key={rec.case_id + i} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                      <span className={cn(dateStr ? GUIDE_PAST_DATE_CLASS : 'text-muted-foreground', 'text-xs shrink-0')}>
                        {label}:
                      </span>
                      <button
                        type="button"
                        onClick={() => applyGuidePriceToRow(rec.price, rec.costPrice)}
                        className={cn('tabular-nums font-medium hover:underline cursor-pointer text-left', marginClass)}
                        title="클릭 시 단가 적용"
                      >
                        {formatNumber(rec.price)}원
                      </button>
                      {rec.consultation_id && rec.estimate_id && onRequestEstimatePreview ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1.5 text-xs text-primary hover:text-primary"
                          onClick={() => onRequestEstimatePreview(rec.consultation_id!, rec.estimate_id!)}
                          title="견적서 원본 보기"
                        >
                          📄 PDF 확인
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {!guideLoading && guideVendor != null && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">[추천 B: 최신 원가] (마진 30% 역산)</p>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                {guideVendor.appliedDate ? (
                  <span className={cn(GUIDE_VENDOR_DATE_CLASS, 'text-xs shrink-0')}>
                    원가 ({guideVendor.appliedDate}):
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => applyGuidePriceToRow(guideVendor.unitPrice, guideVendor.cost)}
                  className="tabular-nums font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  title="클릭 시 단가 적용"
                >
                  {formatNumber(guideVendor.unitPrice)}원
                </button>
                {guideVendor.image_url && onRequestPriceBookImage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-xs text-primary hover:text-primary"
                    onClick={() => onRequestPriceBookImage(guideVendor!.image_url!)}
                    title="원가표 원본 이미지 보기"
                  >
                    📸 원가표 확인
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-2 border-b border-border print:hidden">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>+ 행 추가</Button>
      </div>

      {/* ——— 3. 하단 요약 및 안내 ——— */}
      <footer className="p-6 space-y-4">
        <div className="flex justify-end">
          <div className="border border-border rounded-md bg-muted/30 px-4 py-3 min-w-[220px] space-y-1 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">공급가액 합계</span>
              <span className="tabular-nums font-medium">
                {isRange ? `${formatNumber(supplyTotal)} ~ ${formatNumber(supplyTotalMax)}원` : `${formatNumber(supplyTotal)}원`}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">부가세(10%)</span>
              <span className="tabular-nums font-medium">
                {isRange ? `${formatNumber(vat)} ~ ${formatNumber(vatMax)}원` : `${formatNumber(vat)}원`}
              </span>
            </p>
            <p className="flex justify-between gap-4 border-t border-border pt-2 mt-2 font-semibold">
              <span>총 합계액</span>
              <span className="tabular-nums">
                {isRange ? `${formatNumber(grandTotal)} ~ ${formatNumber(grandTotalMax)}원` : `${formatNumber(grandTotal)}원`}
              </span>
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">특이사항 및 입금계좌 정보</label>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={footerNotes}
            onChange={(e) => setFooterNotes(e.target.value)}
            placeholder="입금 계좌, 특이사항 등을 입력하세요."
          />
        </div>

        {mode === 'PROPOSAL' && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
            {PROPOSAL_DISCLAIMER}
          </p>
        )}
        {mode === 'FINAL' && (
          <p className="text-xs text-muted-foreground">본 견적은 발행일로부터 7일간 유효함.</p>
        )}

        {/* 영업 담당자 전용 수익 분석기 — PDF·고객 화면 미노출 */}
        {showProfitabilityPanel && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 print:hidden" data-html2canvas-ignore>
            <p className="text-sm font-semibold text-foreground mb-2">[수익 분석기]</p>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-1 text-sm">
              <p className="flex justify-between gap-4 sm:block">
                <span className="text-muted-foreground">총 견적액(공급가)</span>
                <span className="tabular-nums font-medium">{formatNumber(supplyTotal)}원</span>
              </p>
              <p className="flex justify-between gap-4 sm:block">
                <span className="text-muted-foreground">총 원가</span>
                <span className="tabular-nums font-medium">{formatNumber(totalCost)}원</span>
              </p>
              <p className="flex justify-between gap-4 sm:block">
                <span className="text-muted-foreground">마진액</span>
                <span className="tabular-nums font-medium">{formatNumber(Math.max(0, supplyTotal - totalCost))}원</span>
              </p>
              <p className="flex justify-between gap-4 sm:block">
                <span className="text-muted-foreground">마진율</span>
                <span className={cn('tabular-nums font-medium', supplyTotal > 0 ? getMarginSignalClass(marginPercent) : '')}>{supplyTotal > 0 ? `${marginPercent}%` : '—'}</span>
              </p>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">마진율 = (총 견적액 − 총 원가) / 총 견적액 × 100 · AI 커맨드: &quot;마진율 25%에 맞춰서 단가 조정해줘&quot;</p>
          </div>
        )}

        {/* PROPOSAL: 확정 견적서로 전환 | FINAL: 승인 (hideInternalActions 시 모달 헤더에서 처리) */}
        {!hideInternalActions && (
          <div className="flex flex-wrap gap-2 items-center pt-2">
            {mode === 'PROPOSAL' ? (
              <Button type="button" onClick={handleConvertToFinal}>
                확정 견적서로 전환
              </Button>
            ) : (
              <>
                <Button type="button" onClick={handleApprove} disabled={approved}>
                  {approved ? '승인 완료' : '승인'}
                </Button>
                {approved && (
                  <span className="text-sm text-muted-foreground">PDF 저장 및 전송을 진행할 수 있습니다.</span>
                )}
              </>
            )}
          </div>
        )}
      </footer>
      <EstimateRowGalleryDialog
        productTag={galleryProductTag}
        open={!!galleryProductTag}
        onClose={() => setGalleryProductTag(null)}
        onLoad={(tag, hasData) => setHasGalleryDataByProduct((prev) => ({ ...prev, [tag]: hasData }))}
      />
    </article>
  )
})

/** 예산 기획안 데이터로부터 행별·합계 금액 계산 (미리보기/PDF용, 단일 품목 리스트만) */
export function computeProposalTotals(data: EstimateFormData): {
  rowAmounts: number[]
  rowAmountsMax: number[]
  supplyTotal: number
  supplyTotalMax: number
  vat: number
  vatMax: number
  grandTotal: number
  grandTotalMax: number
} {
  const rows = data.rows ?? []
  const qtyList = rows.map((r) => parseNum(r.qty))
  const minAmounts = rows.map((r, i) => {
    const q = qtyList[i]
    const pMin = parseNum(r.unitPrice)
    const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
    return q * Math.min(pMin, pMax)
  })
  const maxAmounts = rows.map((r, i) => {
    const q = qtyList[i]
    const pMin = parseNum(r.unitPrice)
    const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
    return q * Math.max(pMin, pMax)
  })
  const totalMin = minAmounts.reduce((a, b) => a + b, 0)
  const totalMax = maxAmounts.reduce((a, b) => a + b, 0)
  const vatVal = Math.round(totalMin * 0.1)
  const vatMaxVal = Math.round(totalMax * 0.1)
  return {
    rowAmounts: minAmounts,
    rowAmountsMax: maxAmounts,
    supplyTotal: totalMin,
    supplyTotalMax: totalMax,
    vat: vatVal,
    vatMax: vatMaxVal,
    grandTotal: totalMin + vatVal,
    grandTotalMax: totalMax + vatMaxVal,
  }
}

/** 확정 견적서(FINAL) 행별·합계 금액 계산 — 고정 단가만 사용 */
export function computeFinalTotals(data: EstimateFormData): {
  rowAmounts: number[]
  supplyTotal: number
  vat: number
  grandTotal: number
} {
  const rows = data.rows ?? []
  const qtyList = rows.map((r) => parseNum(r.qty))
  const amounts = rows.map((r, i) => {
    const q = qtyList[i]
    const p = parseNum(r.unitPrice)
    return q * p
  })
  const total = amounts.reduce((a, b) => a + b, 0)
  const vatVal = Math.round(total * 0.1)
  return {
    rowAmounts: amounts,
    supplyTotal: total,
    vat: vatVal,
    grandTotal: total + vatVal,
  }
}

/** 고객에게 보여질 예산 기획안 읽기 전용 뷰 (미리보기·공유 링크용) — 공급자 고정 + 면책문구 포함 */
export function ProposalPreviewContent({
  data,
  totals,
}: {
  data: EstimateFormData
  totals: ReturnType<typeof computeProposalTotals>
}) {
  const { rowAmounts, rowAmountsMax, supplyTotal, supplyTotalMax, vat, vatMax, grandTotal, grandTotalMax } = totals
  const rows = data.rows ?? []

  return (
    <article className="mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-lg shadow-sm overflow-hidden print:shadow-none print:border print:max-w-none print:w-[210mm] flex flex-1 flex-col min-h-0">
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 p-6 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">예산 기획안</h1>
          <div className="space-y-2 text-base">
            <p><span className="text-muted-foreground">상호(업체명)</span> <span className="font-medium">{data.recipientName || '—'}</span></p>
            <p><span className="text-muted-foreground">견적일시</span> <span className="font-medium">{data.quoteDate || '—'}</span></p>
          </div>
        </div>
        <div className="text-base text-right space-y-1">
          <p><span className="text-muted-foreground">사업자번호</span> <span className="font-medium">{SUPPLIER_FIXED.bizNumber}</span></p>
          <p><span className="text-muted-foreground">상호</span> <span className="font-medium">{SUPPLIER_FIXED.company}</span></p>
          <p><span className="text-muted-foreground">대표이사</span> <span className="font-medium">김지윤</span></p>
          <p><span className="text-muted-foreground">주소</span> <span className="font-medium">{SUPPLIER_FIXED.address}</span></p>
          <p><span className="text-muted-foreground">연락처</span> <span className="font-medium">{SUPPLIER_FIXED.contact}</span></p>
        </div>
      </header>

      <div className="overflow-x-auto print:overflow-visible shrink-0">
        <table className="w-full border-collapse text-base leading-snug min-w-[720px] print:w-[210mm]">
          <thead>
            <tr className="bg-muted/50">
              <th className="border border-border px-2 py-1.5 text-left font-semibold w-12">번호</th>
              <th className="border border-border px-2 py-1.5 text-left font-semibold min-w-[320px]">품목 및 규격</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold w-16">수량</th>
              <th className="border border-border px-2 py-1.5 text-left font-semibold w-14">단위</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold min-w-[88px]">단가(최소)</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold min-w-[88px]">단가(최대)</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold min-w-[140px]">금액(공급가)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border">
                <td className="border border-border px-2 py-1.5 w-12">{row.no || '—'}</td>
                <td className="border border-border px-2 py-1.5 min-w-[320px]">{getRowDisplayName(row) || '—'}</td>
                <td className="border border-border px-2 py-1.5 text-right w-16 tabular-nums">{formatNumber(parseNum(row.qty))}</td>
                <td className="border border-border px-2 py-1.5 w-14">{row.unit || '—'}</td>
                <td className="border border-border px-2 py-1.5 text-right tabular-nums min-w-[88px]">{formatNumber(parseNum(row.unitPrice))}</td>
                <td className="border border-border px-2 py-1.5 text-right tabular-nums min-w-[88px]">{formatNumber(parseNum(row.unitPriceMax ?? ''))}</td>
                <td className="border border-border px-2 py-1.5 text-right tabular-nums font-medium min-w-[140px]">
                  {formatNumber(rowAmounts[idx] ?? 0)} ~ {formatNumber(rowAmountsMax[idx] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-1 min-h-12" aria-hidden />

      <footer className="p-6 space-y-4 shrink-0">
        <div className="flex justify-end">
          <div className="border border-border rounded-md bg-muted/30 px-4 py-3 min-w-[220px] space-y-1 text-base">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">공급가액 합계</span>
              <span className="tabular-nums font-medium">{formatNumber(supplyTotal)} ~ {formatNumber(supplyTotalMax)}원</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">부가세(10%)</span>
              <span className="tabular-nums font-medium">{formatNumber(vat)} ~ {formatNumber(vatMax)}원</span>
            </p>
            <p className="flex justify-between gap-4 border-t border-border pt-2 mt-2 font-semibold">
              <span>총 합계액</span>
              <span className="tabular-nums">{formatNumber(grandTotal)} ~ {formatNumber(grandTotalMax)}원</span>
            </p>
          </div>
        </div>
        {data.footerNotes && (
          <div>
            <p className="text-base font-medium text-muted-foreground mb-1">특이사항 및 입금계좌 정보</p>
            <p className="text-base whitespace-pre-wrap">{data.footerNotes}</p>
          </div>
        )}
        <p className="text-base font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          {PROPOSAL_DISCLAIMER}
        </p>
      </footer>
    </article>
  )
}

/** 확정 견적서 읽기 전용 뷰 (미리보기·공유 링크용) — 비고(Remarks) 칸 포함, 고정 단가 */
export function FinalEstimatePreviewContent({
  data,
  totals,
}: {
  data: EstimateFormData
  totals: ReturnType<typeof computeFinalTotals>
}) {
  const { rowAmounts, supplyTotal, vat, grandTotal } = totals
  const rows = data.rows ?? []

  return (
    <article className="mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-lg shadow-sm overflow-hidden print:shadow-none print:border print:max-w-none print:w-[210mm] flex flex-1 flex-col min-h-0">
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 p-6 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">확정 견적서</h1>
          <div className="space-y-2 text-base">
            <p><span className="text-muted-foreground">상호(업체명)</span> <span className="font-medium">{data.recipientName || '—'}</span></p>
            <p><span className="text-muted-foreground">견적일시</span> <span className="font-medium">{data.quoteDate || '—'}</span></p>
          </div>
        </div>
        <div className="text-base text-right space-y-1">
          <p><span className="text-muted-foreground">사업자번호</span> <span className="font-medium">{SUPPLIER_FIXED.bizNumber}</span></p>
          <p><span className="text-muted-foreground">상호</span> <span className="font-medium">{SUPPLIER_FIXED.company}</span></p>
          <p><span className="text-muted-foreground">대표이사</span> <span className="font-medium">김지윤</span></p>
          <p><span className="text-muted-foreground">주소</span> <span className="font-medium">{SUPPLIER_FIXED.address}</span></p>
          <p><span className="text-muted-foreground">연락처</span> <span className="font-medium">{SUPPLIER_FIXED.contact}</span></p>
        </div>
      </header>

      <div className="overflow-x-auto print:overflow-visible shrink-0">
        <table className="w-full border-collapse text-base leading-snug min-w-[720px] print:w-[210mm]">
          <thead>
            <tr className="bg-muted/50">
              <th className="border border-border px-2 py-1.5 text-left font-semibold w-10">번호</th>
              <th className="border border-border px-2 py-1.5 text-left font-semibold min-w-[320px]">품목 및 규격</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold w-14">수량</th>
              <th className="border border-border px-2 py-1.5 text-left font-semibold w-12">단위</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold min-w-[120px]">단가</th>
              <th className="border border-border px-2 py-1.5 text-right font-semibold min-w-[140px]">금액(공급가)</th>
              <th className="border border-border px-2 py-1.5 text-left font-semibold min-w-[100px]">비고(Remarks)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border">
                <td className="border border-border px-2 py-1.5 w-10">{row.no || '—'}</td>
                <td className="border border-border px-2 py-1.5 min-w-[320px]">{getRowDisplayName(row) || '—'}</td>
                <td className="border border-border px-2 py-1.5 text-right w-14 tabular-nums">{formatNumber(parseNum(row.qty))}</td>
                <td className="border border-border px-2 py-1.5 w-12">{row.unit || '—'}</td>
                <td className="border border-border px-2 py-1.5 text-right tabular-nums min-w-[120px]">{formatNumber(parseNum(row.unitPrice))}</td>
                <td className="border border-border px-2 py-1.5 text-right tabular-nums font-medium min-w-[140px]">{formatNumber(rowAmounts[idx] ?? 0)}</td>
                <td className="border border-border px-2 py-1.5 min-w-[100px]">{row.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-1 min-h-12" aria-hidden />

      <footer className="p-6 space-y-4 shrink-0">
        <div className="flex justify-end">
          <div className="border border-border rounded-md bg-muted/30 px-4 py-3 min-w-[220px] space-y-1 text-base">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">공급가액 합계</span>
              <span className="tabular-nums font-medium">{formatNumber(supplyTotal)}원</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">부가세(10%)</span>
              <span className="tabular-nums font-medium">{formatNumber(vat)}원</span>
            </p>
            <p className="flex justify-between gap-4 border-t border-border pt-2 mt-2 font-semibold">
              <span>총 합계액</span>
              <span className="tabular-nums">{formatNumber(grandTotal)}원</span>
            </p>
          </div>
        </div>
        {data.footerNotes && (
          <div>
            <p className="text-base font-medium text-muted-foreground mb-1">특이사항 및 입금계좌 정보</p>
            <p className="text-base whitespace-pre-wrap">{data.footerNotes}</p>
          </div>
        )}
        <p className="text-base text-muted-foreground">본 견적은 발행일로부터 7일간 유효함.</p>
      </footer>
    </article>
  )
}

export default EstimateForm
