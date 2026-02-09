/**
 * 데이터 통합 마이그레이션 — PDF/JPG 통합 업로드 및 AI 데이터 추출
 * - PDF: 견적서 → Estimates (consultations + estimates)
 * - JPG: 원가표 → vendor_price_book
 * - 드래그앤드롭, 리뷰 테이블, Storage 업로드, is_test: true
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, Image, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { EstimateFormData, EstimateRow } from '@/components/estimate/EstimateForm'
import { computeFinalTotals } from '@/components/estimate/EstimateForm'
import type { Json } from '@/types/database'
import {
  parseFileWithAI,
  detectIsOurCompanyEstimate,
  type ParsedEstimateFromPDF,
  type ParsedVendorPrice,
  type ParsedVendorPriceItem,
  type FileCategory,
} from '@/lib/parseFileWithAI'

const SUPPLIER_FIXED = {
  bizNumber: '374-81-02631',
  address: '경기도 남양주시 화도읍 가곡로 88번길 29-2, 1동',
  contact: '031-592-7981',
} as const

const BUCKET_ESTIMATES = 'estimate-documents'
const BUCKET_VENDOR = 'vendor-assets'

type MigrationTab = 'estimates' | 'vendor_price'
type FileStatus = '대기' | '분석중' | '검수대기' | '완료'

interface VendorPriceFile {
  id: string
  file: File
  status: FileStatus
  parsedVendor: ParsedVendorPrice | null
  error: string | null
}

interface MigrationFile {
  id: string
  file: File
  status: FileStatus
  category: FileCategory
  parsedEstimate: ParsedEstimateFromPDF | null
  parsedVendor: ParsedVendorPrice | null
  error: string | null
  savedId: string | null
}

function toCreatedAtISO(quoteDate: string): string {
  const t = String(quoteDate || '').trim()
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date().toISOString()
  return new Date(t + 'T00:00:00').toISOString()
}

/** 연락처 정규화 (숫자만) — 상담 매칭 검색용 */
function normalizePhone(s: string): string {
  return String(s || '').replace(/\D/g, '').slice(-11) || ''
}

/** Mac/한글 파일명 인코딩 문제 방지 — timestamp + 안전한 영문 확장자로 치환 */
function toSafeStoragePath(originalName: string, prefix = 'estimate'): string {
  const ext = (originalName.split('.').pop() ?? '').toLowerCase()
  const safeExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'bin'
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`
}

/** Storage 업로드용 contentType — file.type이 비거나 잘못됐을 때 확장자로 보완 (Win/Mac/Chrome 호환) */
function getContentTypeForUpload(file: File, bucket: 'estimate' | 'vendor'): string {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const extMap: Record<string, string> =
    bucket === 'estimate'
      ? { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
      : { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
  const fromExt = extMap[ext]
  const fromFile = file.type?.trim()
  if (fromFile && /^(application\/pdf|image\/(jpeg|jpg|png))$/i.test(fromFile)) return fromFile
  return fromExt || fromFile || (bucket === 'estimate' ? 'application/pdf' : 'image/jpeg')
}

const DEFAULT_VENDOR_NAME = '한국 프라임'

/** 업로드 성공 시 누적 표시용 — 최신순 정렬, 클릭 시 견적 상세 보기 */
interface UploadedEstimateItem {
  filename: string
  grand_total: number
  /** 견적서 원본의 견적일 (YYYY-MM-DD) */
  quoteDate: string
  uploadedAt: string
  consultationId: string
  estimateId: string
  status: string
}

/** 중복 체크용 시간 창 (밀리초) — 동일 파일명/금액이 이 시간 내에 있으면 경고 */
const DUPLICATE_CHECK_WINDOW_MS = 5 * 60 * 1000

const UPLOADED_ITEMS_STORAGE_KEY = 'findgagu-migration-uploaded-estimates'

function loadUploadedItemsFromStorage(): UploadedEstimateItem[] {
  try {
    const raw = localStorage.getItem(UPLOADED_ITEMS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map((x) => ({
        filename: String(x.filename ?? ''),
        grand_total: Number(x.grand_total) || 0,
        quoteDate: String(x.quoteDate ?? ''),
        uploadedAt: String(x.uploadedAt ?? ''),
        consultationId: String(x.consultationId ?? ''),
        estimateId: String(x.estimateId ?? ''),
        status: String(x.status ?? '저장완료'),
      }))
      .filter((x) => x.estimateId && x.consultationId)
  } catch {
    return []
  }
}

export default function MigrationPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<MigrationTab>('estimates')
  const [vendorName, setVendorName] = useState(DEFAULT_VENDOR_NAME)
  const [files, setFiles] = useState<MigrationFile[]>([])
  const [vendorPriceFiles, setVendorPriceFiles] = useState<VendorPriceFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [savingBulk, setSavingBulk] = useState(false)
  /** 업로드 성공한 견적 리스트 (localStorage에 영구 저장, 서버 재시작·새로고침 후에도 유지) */
  const [uploadedItems, setUploadedItems] = useState<UploadedEstimateItem[]>(loadUploadedItemsFromStorage)
  /** 견적서 파일별 매칭된 상담 (기존 상담 연결 시) */
  const [matchedConsultation, setMatchedConsultation] = useState<Record<string, { id: string; company_name: string } | null>>({})

  useEffect(() => {
    try {
      localStorage.setItem(UPLOADED_ITEMS_STORAGE_KEY, JSON.stringify(uploadedItems))
    } catch {
      // quota exceeded 등
    }
  }, [uploadedItems])

  /** DB에 없는 항목 정리 — localStorage에는 있지만 DB에서 삭제된 견적 제거 */
  useEffect(() => {
    if (uploadedItems.length === 0) return
    let cancelled = false
    const run = async () => {
      const ids = uploadedItems.map((u) => u.estimateId)
      const { data } = await supabase.from('estimates').select('id').in('id', ids)
      if (cancelled) return
      const existingIds = new Set((data ?? []).map((r) => r.id))
      const valid = uploadedItems.filter((u) => existingIds.has(u.estimateId))
      if (valid.length !== uploadedItems.length) {
        setUploadedItems(valid)
        toast.info('DB에서 삭제된 항목을 목록에서 제거했습니다.')
      }
    }
    run()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 마운트 시 1회

  /** 마운트 시 DB에서 is_test 견적 조회 → localStorage에 없는 항목 병합 (서버 재시작 등으로 누락된 데이터 복구) */
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data: estData } = await supabase
        .from('estimates')
        .select('id, consultation_id, grand_total, created_at, payload')
        .eq('is_test', true)
        .order('created_at', { ascending: false })
        .limit(200)
      if (cancelled || !estData?.length) return
      const consultIds = [...new Set(estData.map((e) => e.consultation_id))]
      const { data: consultData } = await supabase
        .from('consultations')
        .select('id, company_name')
        .in('id', consultIds)
      const consultMap = new Map((consultData ?? []).map((c) => [c.id, c.company_name ?? '']))
      const existingIds = new Set(loadUploadedItemsFromStorage().map((u) => u.estimateId))
      const payloads = estData as Array<{ id: string; consultation_id: string; grand_total: number; created_at: string; payload?: { quoteDate?: string; _migration_original_filename?: string } | null }>
      const toAdd: UploadedEstimateItem[] = payloads
        .filter((e) => !existingIds.has(e.id))
        .map((e) => {
          const company = consultMap.get(e.consultation_id) || ''
          const originalFilename = e.payload?._migration_original_filename
          const filename = originalFilename || (company ? `[DB복원] ${company}_견적` : `[DB복원] ${e.id.slice(0, 8)}`)
          return {
            filename,
            grand_total: Number(e.grand_total) || 0,
            quoteDate: e.payload?.quoteDate ?? e.created_at.slice(0, 10) ?? '',
            uploadedAt: e.created_at,
            consultationId: e.consultation_id,
            estimateId: e.id,
            status: '저장완료',
          }
        })
      if (toAdd.length > 0) {
        setUploadedItems((prev) => {
          const prevIds = new Set(prev.map((u) => u.estimateId))
          const newOnes = toAdd.filter((t) => !prevIds.has(t.estimateId))
          return newOnes.length > 0 ? [...newOnes, ...prev] : prev
        })
      }
    }
    run()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 마운트 시 1회만

  /** 거래처 탭에서 판매 탭으로 이동 시 자동 AI 분석 대기용 */
  const pendingAnalysisIdRef = useRef<string | null>(null)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter((f) => f.size > 0)
    const next: MigrationFile[] = list.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: '대기' as FileStatus,
      category: 'Estimates' as FileCategory,
      parsedEstimate: null,
      parsedVendor: null,
      error: null,
      savedId: null,
    }))
    setFiles((prev) => [...prev, ...next])
  }, [])

  const addVendorPriceFiles = useCallback((newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter((f) => {
      const ext = (f.name.split('.').pop() ?? '').toLowerCase()
      return f.size > 0 && (['pdf', 'jpg', 'jpeg', 'png'].includes(ext))
    })
    const next: VendorPriceFile[] = list.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: '대기' as FileStatus,
      parsedVendor: null,
      error: null,
    }))
    setVendorPriceFiles((prev) => [...prev, ...next])
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const startAnalysis = useCallback(async (id: string) => {
    const item = files.find((f) => f.id === id)
    if (!item) return
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: '분석중' as FileStatus, error: null } : f)))
    try {
      const { result } = await parseFileWithAI(item.file, { mode: 'estimates' })
      const estimateData = result.type === 'Estimates' ? result.data : null
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: '검수대기' as FileStatus,
                category: 'Estimates' as FileCategory,
                parsedEstimate: estimateData,
                parsedVendor: null,
                error: null,
              }
            : f
        )
      )
      toast.success('AI 분석이 완료되었습니다.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '분석 실패'
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: '대기' as FileStatus, error: msg } : f))
      )
      toast.error(msg)
    }
  }, [files])

  const startVendorAnalysis = useCallback(async (id: string) => {
    const item = vendorPriceFiles.find((f) => f.id === id)
    if (!item) return
    setVendorPriceFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: '분석중' as FileStatus, error: null } : f)))
    try {
      const isOurEstimate = await detectIsOurCompanyEstimate(item.file)
      if (isOurEstimate && window.confirm('우리 회사 견적서가 감지되었습니다. 판매 탭으로 이동할까요?')) {
        const newId = `${item.file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const migrationFile: MigrationFile = {
          id: newId,
          file: item.file,
          status: '대기',
          category: 'Estimates',
          parsedEstimate: null,
          parsedVendor: null,
          error: null,
          savedId: null,
        }
        setVendorPriceFiles((prev) => prev.filter((f) => f.id !== id))
        setFiles((prev) => [...prev, migrationFile])
        setActiveTab('estimates')
        pendingAnalysisIdRef.current = newId
        toast.success('판매 견적서 탭으로 이동했습니다. AI 분석을 시작합니다.')
        return
      }
      const { result } = await parseFileWithAI(item.file, { mode: 'vendor_price' })
      if (result.type !== 'VendorPrice') throw new Error('원가 데이터를 추출할 수 없습니다.')
      setVendorPriceFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, status: '검수대기' as FileStatus, parsedVendor: result.data, error: null } : f
        )
      )
      toast.success(`AI 분석 완료 (${result.data.items.length}건 추출)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '분석 실패'
      setVendorPriceFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: '대기' as FileStatus, error: msg } : f))
      )
      toast.error(msg)
    }
  }, [vendorPriceFiles])

  const startAllVendorAnalysis = useCallback(async () => {
    const pending = vendorPriceFiles.filter((f) => f.status === '대기')
    for (const f of pending) {
      await startVendorAnalysis(f.id)
    }
  }, [vendorPriceFiles, startVendorAnalysis])

  const updateParsedEstimate = useCallback((id: string, upd: Partial<ParsedEstimateFromPDF>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id && f.parsedEstimate ? { ...f, parsedEstimate: { ...f.parsedEstimate, ...upd } } : f))
    )
  }, [])

  const updateParsedVendor = useCallback((id: string, upd: Partial<ParsedVendorPrice>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id && f.parsedVendor ? { ...f, parsedVendor: { ...f.parsedVendor, ...upd } } : f))
    )
  }, [])

  const updateVendorItem = useCallback((id: string, itemIndex: number, field: keyof ParsedVendorPriceItem, value: string | number) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id || !f.parsedVendor?.items) return f
        const items = f.parsedVendor.items.map((it, i) =>
          i === itemIndex ? { ...it, [field]: value } : it
        )
        return { ...f, parsedVendor: { ...f.parsedVendor, items } }
      })
    )
  }, [])

  const removeVendorItem = useCallback((id: string, itemIndex: number) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id || !f.parsedVendor?.items) return f
        const items = f.parsedVendor.items.filter((_, i) => i !== itemIndex)
        return { ...f, parsedVendor: { ...f.parsedVendor, items } }
      })
    )
  }, [])

  const addVendorItem = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id || !f.parsedVendor) return f
        const items = [...(f.parsedVendor.items ?? []), { vendor_name: '', product_name: '', size: '', cost_price: 0, description: '' }]
        return { ...f, parsedVendor: { ...f.parsedVendor, items } }
      })
    )
  }, [])

  const updateVendorPriceItem = useCallback((fileId: string, itemIndex: number, field: keyof ParsedVendorPriceItem, value: string | number) => {
    setVendorPriceFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId || !f.parsedVendor?.items) return f
        const items = f.parsedVendor.items.map((it, i) =>
          i === itemIndex ? { ...it, [field]: value } : it
        )
        return { ...f, parsedVendor: { ...f.parsedVendor, items } }
      })
    )
  }, [])

  const removeVendorPriceItem = useCallback((fileId: string, itemIndex: number) => {
    setVendorPriceFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId || !f.parsedVendor?.items) return f
        const items = f.parsedVendor.items.filter((_, i) => i !== itemIndex)
        return { ...f, parsedVendor: { ...f.parsedVendor, items } }
      })
    )
  }, [])

  const removeVendorPriceFile = useCallback((id: string) => {
    setVendorPriceFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const updateRow = useCallback((fileId: string, rowIndex: number, field: keyof EstimateRow, value: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId || !f.parsedEstimate) return f
        const rows = f.parsedEstimate.rows.map((r, i) =>
          i === rowIndex ? { ...r, [field]: value } : r
        ) as EstimateRow[]
        return { ...f, parsedEstimate: { ...f.parsedEstimate, rows } }
      })
    )
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  /** 거래처 탭 → 판매 탭 이동 시 대기 중인 파일 자동 AI 분석 */
  useEffect(() => {
    const pendingId = pendingAnalysisIdRef.current
    if (!pendingId || !files.some((f) => f.id === pendingId)) return
    pendingAnalysisIdRef.current = null
    startAnalysis(pendingId)
  }, [files, startAnalysis])

  /** 견적서 검수대기 파일의 연락처/성함으로 기존 상담 검색 */
  useEffect(() => {
    const toSearch = files.filter((f) => f.status === '검수대기' && f.parsedEstimate)
    if (toSearch.length === 0) {
      setMatchedConsultation({})
      return
    }
    const run = async () => {
      const next: Record<string, { id: string; company_name: string } | null> = {}
      for (const f of toSearch) {
        const pe = f.parsedEstimate!
        const contact = normalizePhone(pe.customer_phone ?? pe.recipientContact ?? '')
        const name = (pe.customer_name ?? pe.siteName ?? '').trim()
        if (!contact && !name) {
          next[f.id] = null
          continue
        }
        let found: { id: string; company_name: string } | null = null
        if (contact.length >= 7) {
          const tail = contact.slice(-8)
          const { data } = await supabase
            .from('consultations')
            .select('id, company_name')
            .eq('is_visible', true)
            .ilike('contact', `%${tail}%`)
            .limit(1)
          found = data?.[0] ? { id: data[0].id, company_name: data[0].company_name ?? '' } : null
        }
        if (!found && name) {
          const { data } = await supabase
            .from('consultations')
            .select('id, company_name')
            .eq('is_visible', true)
            .ilike('company_name', `%${name}%`)
            .limit(1)
          found = data?.[0] ? { id: data[0].id, company_name: data[0].company_name ?? '' } : null
        }
        next[f.id] = found
      }
      setMatchedConsultation(next)
    }
    run()
  }, [files])

  const handleSave = useCallback(
    async (id: string) => {
      const item = files.find((f) => f.id === id)
      if (!item) return

      setSaving(id)
      try {
        const storagePath = toSafeStoragePath(item.file.name)

        if (item.category === 'Estimates' && item.parsedEstimate) {
          const { siteName, region, industry, quoteDate, recipientContact, rows, customer_name, customer_phone, site_location, total_amount } = item.parsedEstimate
          const createdAt = toCreatedAtISO(quoteDate)
          const contact = (customer_phone ?? recipientContact ?? '').trim() || '000-0000-0000'
          const companyName = ((customer_name ?? siteName ?? '').trim() || siteName || '').trim() || '알 수 없는 고객'

          const payload: EstimateFormData & { _migration_original_filename?: string } = {
            mode: 'FINAL',
            recipientName: companyName,
            recipientContact: contact,
            quoteDate,
            bizNumber: SUPPLIER_FIXED.bizNumber,
            address: SUPPLIER_FIXED.address,
            supplierContact: SUPPLIER_FIXED.contact,
            sealImageUrl: '',
            rows,
            footerNotes: '과거 데이터 마이그레이션',
            _migration_original_filename: item.file.name,
          }
          const { supplyTotal, vat, grandTotal } = computeFinalTotals(payload)
          const finalAmount = total_amount && total_amount > 0 ? total_amount : grandTotal

          // 중복 체크: 동일 파일명 또는 동일 금액이 짧은 시간 내에 있으면 경고
          const now = Date.now()
          const recentCutoff = now - DUPLICATE_CHECK_WINDOW_MS
          const duplicate = uploadedItems.some((u) => {
            if (u.uploadedAt && new Date(u.uploadedAt).getTime() < recentCutoff) return false
            if (u.filename === item.file.name) return true
            if (u.grand_total === finalAmount) return true
            return false
          })
          if (duplicate) {
            toast.warning('이미 업로드된 견적 같습니다.')
            setSaving(null)
            return
          }

          const { error: uploadErr } = await supabase.storage.from(BUCKET_ESTIMATES).upload(storagePath, item.file, {
            contentType: getContentTypeForUpload(item.file, 'estimate'),
            upsert: true,
          })
          if (uploadErr) throw uploadErr
          const consultStatus: '계약완료' | '견적발송' | '상담중' = finalAmount > 0 ? '계약완료' : '견적발송'

          let consultationId: string
          const existing = matchedConsultation[id]
          if (existing?.id) {
            consultationId = existing.id
            const { data: cur } = await supabase.from('consultations').select('metadata').eq('id', consultationId).single()
            const metaJson = (cur as { metadata?: Json } | null)?.metadata ?? {}
            const nextMeta = {
              ...(typeof metaJson === 'object' && metaJson !== null ? metaJson : {}),
              migration_tag: '과거데이터',
              source: '마이그레이션',
              region,
              industry,
              site_location: site_location || undefined,
              estimate_document_path: storagePath,
            } as Json
            await supabase.from('consultations').update({
              expected_revenue: finalAmount,
              status: consultStatus,
              metadata: nextMeta,
            }).eq('id', consultationId)
          } else {
            const { data: consultation, error: consultErr } = await supabase
              .from('consultations')
              .insert({
                company_name: companyName,
                manager_name: companyName,
                contact,
                status: consultStatus,
                expected_revenue: finalAmount,
                created_at: createdAt,
                metadata: {
                  migration_tag: '과거데이터',
                  source: '마이그레이션',
                  region,
                  industry,
                  site_location: site_location || undefined,
                  estimate_document_path: storagePath,
                } as Json,
                is_test: true,
              })
              .select('id')
              .single()
            if (consultErr) throw consultErr
            consultationId = consultation!.id
          }

          const payloadForDb = { ...payload, _migration_original_filename: item.file.name } as unknown as Json
          const { data: insertedEst, error: estErr } = await supabase
            .from('estimates')
            .insert({
              consultation_id: consultationId,
              payload: payloadForDb,
              supply_total: supplyTotal,
              vat,
              grand_total: grandTotal,
              approved_at: new Date().toISOString(),
              final_proposal_data: payloadForDb,
              created_at: createdAt,
              is_test: true,
            })
            .select('id')
            .single()
          if (estErr) throw estErr
          const estimateId = (insertedEst as { id: string } | null)?.id ?? ''

          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: '완료' as FileStatus, savedId: consultationId } : f))
          )
          setUploadedItems((prev) => [
            {
              filename: item.file.name,
              grand_total: finalAmount,
              quoteDate: item.parsedEstimate.quoteDate ?? '',
              uploadedAt: new Date().toISOString(),
              consultationId,
              estimateId,
              status: '저장완료',
            },
            ...prev,
          ])
          const toastMsg = existing?.id
            ? `기존 상담 [${existing.company_name || companyName}]에 견적 1건 연결됨.`
            : `상담 카드 [${companyName}] 생성됨. 견적 1건 연결됨.`
          toast.success(toastMsg)
        } else if (item.category === 'VendorPrice' && item.parsedVendor?.items?.length) {
          const items = item.parsedVendor.items

          const { error: uploadErr } = await supabase.storage.from(BUCKET_VENDOR).upload(storagePath, item.file, {
            contentType: getContentTypeForUpload(item.file, 'vendor'),
            upsert: true,
          })
          if (uploadErr) throw uploadErr
          const { data: urlData } = supabase.storage.from(BUCKET_VENDOR).getPublicUrl(storagePath)
          const imageUrl = urlData.publicUrl

          const rows = items.map((it) => ({
            product_name: it.product_name?.trim() || '(미명)',
            cost: Number(it.cost_price) || 0,
            image_url: imageUrl,
            vendor_name: it.vendor_name?.trim() || null,
            spec: it.size?.trim() || null,
            description: it.description?.trim() || null,
            is_test: true,
          }))

          const { data: inserted, error: vErr } = await supabase
            .from('vendor_price_book')
            .insert(rows)
            .select('id')
          if (vErr) throw vErr

          const firstId = (Array.isArray(inserted) && inserted.length > 0 ? inserted[0]?.id : (inserted as { id?: string } | null)?.id) ?? null
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: '완료' as FileStatus, savedId: firstId } : f))
          )
          toast.success(`원가표 ${rows.length}건이 저장되었습니다.`)
        }
      } catch (err) {
        console.error(err)
        toast.error(err instanceof Error ? err.message : '저장 실패')
      } finally {
        setSaving(null)
      }
    },
    [files, navigate, matchedConsultation, uploadedItems]
  )

  const handleBulkVendorSave = useCallback(async () => {
    const withItems = vendorPriceFiles.filter((f) => f.parsedVendor?.items?.length)
    if (!withItems.length) {
      toast.error('저장할 품목이 없습니다.')
      return
    }
    setSavingBulk(true)
    try {
      const rows: Array<{ product_name: string; cost: number; image_url: string; vendor_name: string; spec: string | null; description: string | null; is_test: boolean }> = []
      for (const vf of withItems) {
        const storagePath = toSafeStoragePath(vf.file.name, 'vendor')
        const { error: uploadErr } = await supabase.storage.from(BUCKET_VENDOR).upload(storagePath, vf.file, {
          contentType: getContentTypeForUpload(vf.file, 'vendor'),
          upsert: true,
        })
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from(BUCKET_VENDOR).getPublicUrl(storagePath)
        const imageUrl = urlData.publicUrl
        const vn = vendorName?.trim() || DEFAULT_VENDOR_NAME
        for (const it of vf.parsedVendor!.items) {
          rows.push({
            product_name: it.product_name?.trim() || '(미명)',
            cost: Number(it.cost_price) || 0,
            image_url: imageUrl,
            vendor_name: vn,
            spec: it.size?.trim() || null,
            description: it.description?.trim() || null,
            is_test: true,
          })
        }
      }
      if (rows.length === 0) {
        toast.error('저장할 품목이 없습니다.')
        return
      }
      const { error: vErr } = await supabase.from('vendor_price_book').insert(rows)
      if (vErr) throw vErr
      toast.success(`원가 장부에 ${rows.length}건이 저장되었습니다.`)
      setVendorPriceFiles([])
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingBulk(false)
    }
  }, [vendorPriceFiles, vendorName])

  const accumulatedVendorItems = useMemo(() => {
    const out: Array<ParsedVendorPriceItem & { _fileId: string; _itemIndex: number }> = []
    for (const vf of vendorPriceFiles) {
      const items = vf.parsedVendor?.items ?? []
      items.forEach((it, i) => out.push({ ...it, _fileId: vf.id, _itemIndex: i }))
    }
    return out
  }, [vendorPriceFiles])

  const hasOpenAIKey = Boolean(import.meta.env.VITE_OPENAI_API_KEY?.trim())

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">
              ← 홈
            </Link>
            <h1 className="text-2xl font-bold text-foreground">데이터 통합 마이그레이션</h1>
          </div>
        </div>

        {!hasOpenAIKey && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            .env에 VITE_OPENAI_API_KEY를 설정하세요. OpenAI API 키가 없으면 AI 분석을 사용할 수 없습니다.
          </div>
        )}

        {/* 탭: 판매 견적서 등록 | 거래처 원가 등록 */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab('estimates')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'estimates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            판매 견적서 등록
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vendor_price')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'vendor_price'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            거래처 원가 등록
          </button>
        </div>

        {activeTab === 'estimates' && (
          <>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
              }`}
            >
              <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">PDF(견적서) 또는 JPG(원가표)를 드래그하여 놓거나 클릭하여 선택하세요.</p>
              <p className="text-xs text-muted-foreground mt-1">
                현재 탭 기준으로 판매 단가(견적서) 추출
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                id="migration-file-input"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => document.getElementById('migration-file-input')?.click()}
              >
                파일 선택
              </Button>
            </div>

            <ul className="space-y-4">
          {files.map((f) => (
            <li key={f.id} className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  {f.category === 'Estimates' ? (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">{f.file.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      f.category === 'Estimates'
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                        : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                    }`}
                  >
                    {f.category === 'Estimates' ? '판매 단가' : '매입 원가'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      f.status === '완료'
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                        : f.status === '검수대기'
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                          : f.status === '분석중'
                            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                            : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {f.status === '분석중' && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
                    {f.status}
                  </span>
                  {f.status === '대기' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startAnalysis(f.id)}
                      disabled={!hasOpenAIKey}
                    >
                      AI 분석
                    </Button>
                  )}
                  {f.status === '검수대기' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSave(f.id)}
                      disabled={saving === f.id || (f.category === 'VendorPrice' && !(f.parsedVendor?.items?.length))}
                    >
                      {saving === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : f.category === 'VendorPrice' ? '전체 저장' : '판매 견적서 저장'}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeFile(f.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {f.error && (
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-destructive bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {f.error}
                </div>
              )}

              {/* Estimates 리뷰 테이블 */}
              {f.status === '검수대기' && f.parsedEstimate && (
                <div className="p-4 space-y-4">
                  {f.category === 'Estimates' && (
                    <div className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      matchedConsultation[f.id]
                        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    )}>
                      {matchedConsultation[f.id] ? (
                        <>기존 <strong>{matchedConsultation[f.id]!.company_name}</strong> 고객님 상담에 연결됩니다.</>
                      ) : (
                        <>새로운 상담 카드가 생성됩니다.</>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">고객/현장명</span>
                      <Input
                        value={f.parsedEstimate.customer_name ?? f.parsedEstimate.siteName}
                        onChange={(e) => {
                          const v = e.target.value
                          updateParsedEstimate(f.id, { siteName: v, customer_name: v })
                        }}
                        className="h-9"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">지역</span>
                      <Input
                        value={f.parsedEstimate.region}
                        onChange={(e) => updateParsedEstimate(f.id, { region: e.target.value })}
                        className="h-9"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">업종</span>
                      <Input
                        value={f.parsedEstimate.industry}
                        onChange={(e) => updateParsedEstimate(f.id, { industry: e.target.value })}
                        className="h-9"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">인입일</span>
                      <Input
                        type="date"
                        value={f.parsedEstimate.quoteDate}
                        onChange={(e) => updateParsedEstimate(f.id, { quoteDate: e.target.value })}
                        className="h-9"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">연락처</span>
                      <Input
                        value={f.parsedEstimate.customer_phone ?? f.parsedEstimate.recipientContact}
                        onChange={(e) => updateParsedEstimate(f.id, { recipientContact: e.target.value, customer_phone: e.target.value })}
                        className="h-9"
                        placeholder="000-0000-0000"
                      />
                    </label>
                    <label className="text-sm md:col-span-2">
                      <span className="text-muted-foreground block mb-1">현장 주소/지역</span>
                      <Input
                        value={f.parsedEstimate.site_location ?? ''}
                        onChange={(e) => updateParsedEstimate(f.id, { site_location: e.target.value })}
                        className="h-9"
                        placeholder="서울 강남구 XX동 123"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">견적 총액 (원)</span>
                      <Input
                        type="number"
                        value={(f.parsedEstimate.total_amount ?? 0) > 0 ? f.parsedEstimate.total_amount : ''}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          updateParsedEstimate(f.id, { total_amount: Number.isNaN(n) ? 0 : n })
                        }}
                        className="h-9"
                        placeholder="자동 계산 또는 입력"
                      />
                    </label>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-foreground block mb-2">품목 리뷰</span>
                    <div className="border border-border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="border-b border-border px-2 py-2 text-left w-8">No</th>
                            <th className="border-b border-border px-2 py-2 text-left min-w-[100px]">품목</th>
                            <th className="border-b border-border px-2 py-2 text-left min-w-[120px]">규격</th>
                            <th className="border-b border-border px-2 py-2 text-left w-16">수량</th>
                            <th className="border-b border-border px-2 py-2 text-right min-w-[90px]">판매가(원)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.parsedEstimate.rows.map((row, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-2 py-1.5">{row.no}</td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.name}
                                  onChange={(e) => updateRow(f.id, i, 'name', e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.spec}
                                  onChange={(e) => updateRow(f.id, i, 'spec', e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.qty}
                                  onChange={(e) => updateRow(f.id, i, 'qty', e.target.value)}
                                  className="h-8 text-sm w-14"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <Input
                                  value={row.unitPrice}
                                  onChange={(e) => updateRow(f.id, i, 'unitPrice', e.target.value)}
                                  className="h-8 text-sm text-right"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* VendorPrice 멀티 로우 데이터 그리드 */}
              {f.status === '검수대기' && f.parsedVendor?.items && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">품목 검수 (총 {f.parsedVendor.items.length}건)</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => addVendorItem(f.id)}>
                      + 행 추가
                    </Button>
                  </div>
                  <div className="border border-border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="border-b border-border px-2 py-2 text-left w-8">No</th>
                          <th className="border-b border-border px-2 py-2 text-left min-w-[120px]">거래처명</th>
                          <th className="border-b border-border px-2 py-2 text-left min-w-[120px]">제품명</th>
                          <th className="border-b border-border px-2 py-2 text-left min-w-[100px]">규격</th>
                          <th className="border-b border-border px-2 py-2 text-right min-w-[90px]">원가(원)</th>
                          <th className="border-b border-border px-2 py-2 text-left min-w-[100px]">색상/특이사항</th>
                          <th className="border-b border-border px-2 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {f.parsedVendor.items.map((row, i) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.vendor_name}
                                onChange={(e) => updateVendorItem(f.id, i, 'vendor_name', e.target.value)}
                                className="h-8 text-sm"
                                placeholder="거래처"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.product_name}
                                onChange={(e) => updateVendorItem(f.id, i, 'product_name', e.target.value)}
                                className="h-8 text-sm"
                                placeholder="제품명"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.size}
                                onChange={(e) => updateVendorItem(f.id, i, 'size', e.target.value)}
                                className="h-8 text-sm"
                                placeholder="1200×600"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Input
                                type="number"
                                value={row.cost_price || ''}
                                onChange={(e) => updateVendorItem(f.id, i, 'cost_price', parseInt(e.target.value, 10) || 0)}
                                className="h-8 text-sm text-right"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                value={row.description}
                                onChange={(e) => updateVendorItem(f.id, i, 'description', e.target.value)}
                                className="h-8 text-sm"
                                placeholder="색상/메모"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => removeVendorItem(f.id, i)}
                                title="행 삭제"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">수정 후 상단 [데이터 저장]을 눌러 vendor_price_book에 Bulk Insert합니다.</p>
                </div>
              )}

              {f.status === '완료' && (
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  DB 저장 완료 {f.savedId && `(ID: ${f.savedId.slice(0, 8)}…)`}
                </div>
              )}
            </li>
          ))}
        </ul>

            {/* 업로드 성공한 견적 실시간 누적 리스트 — 최신순 */}
            {uploadedItems.length > 0 && (
              <div className="mt-6 border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">업로드 완료 목록 ({uploadedItems.length}건)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setUploadedItems([])
                      localStorage.removeItem(UPLOADED_ITEMS_STORAGE_KEY)
                      toast.success('목록을 비웠습니다.')
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    목록 비우기
                  </Button>
                </div>
                <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 z-10">
                      <tr>
                        <th className="border-b border-border px-3 py-2 text-left w-12">No</th>
                        <th className="border-b border-border px-3 py-2 text-left min-w-[180px]">파일명</th>
                        <th className="border-b border-border px-3 py-2 text-right min-w-[100px]">금액</th>
                        <th className="border-b border-border px-3 py-2 text-left min-w-[100px]">견적일</th>
                        <th className="border-b border-border px-3 py-2 text-left min-w-[140px]">업로드 시간</th>
                        <th className="border-b border-border px-3 py-2 text-left min-w-[80px]">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedItems.map((u, idx) => (
                        <tr
                          key={`${u.estimateId}-${u.uploadedAt}`}
                          className="border-b border-border last:border-0 hover:bg-primary/5 cursor-pointer transition-colors"
                          onClick={() =>
                            navigate('/consultation', {
                              state: {
                                focusConsultationId: u.consultationId,
                                openEstimateTab: true,
                                openEstimateId: u.estimateId,
                              },
                            })
                          }
                        >
                          <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium truncate max-w-[200px]" title={u.filename}>
                            {u.filename}
                          </td>
                          <td className="px-3 py-2 text-right">{u.grand_total.toLocaleString()}원</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {u.quoteDate
                              ? new Date(u.quoteDate + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(u.uploadedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-400">
                              {u.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'vendor_price' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">거래처명</span>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder={DEFAULT_VENDOR_NAME}
                  className="w-48 h-9"
                />
              </label>
            </div>
            <div
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                addVendorPriceFiles(e.dataTransfer.files)
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
              }`}
            >
              <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">원가 명세서 이미지/PDF를 드래그하거나 선택하세요. 수십 개도 한 번에 추가 가능합니다.</p>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                id="vendor-file-input"
                onChange={(e) => {
                  if (e.target.files) addVendorPriceFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => document.getElementById('vendor-file-input')?.click()}
              >
                파일 선택
              </Button>
            </div>

            {vendorPriceFiles.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
                  <span className="text-sm font-medium">업로드된 파일 ({vendorPriceFiles.length}개)</span>
                  {vendorPriceFiles.some((f) => f.status === '대기') && (
                    <Button type="button" size="sm" variant="outline" onClick={startAllVendorAnalysis} disabled={!hasOpenAIKey}>
                      전체 AI 분석
                    </Button>
                  )}
                </div>
                <ul className="divide-y divide-border max-h-40 overflow-y-auto">
                  {vendorPriceFiles.map((f) => (
                    <li key={f.id} className="flex items-center justify-between px-4 py-2 text-sm gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{f.file.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-400 shrink-0">매입 원가</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            f.status === '검수대기' ? 'bg-amber-500/20 text-amber-700' : f.status === '분석중' ? 'bg-blue-500/20' : 'bg-muted'
                          }`}
                        >
                          {f.status === '분석중' && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
                          {f.status}
                        </span>
                        {f.status === '대기' && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => startVendorAnalysis(f.id)} disabled={!hasOpenAIKey}>
                            AI 분석
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeVendorPriceFile(f.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                {vendorPriceFiles.some((f) => f.error) && (
                  <div className="px-4 py-2 text-sm text-destructive bg-destructive/10">
                    {vendorPriceFiles.find((f) => f.error)?.error}
                  </div>
                )}
              </div>
            )}

            {accumulatedVendorItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
                  <span className="text-sm font-medium">검수 테이블 (총 {accumulatedVendorItems.length}건)</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleBulkVendorSave}
                    disabled={savingBulk}
                  >
                    {savingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : '원가 장부 저장'}
                  </Button>
                </div>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 z-10">
                      <tr>
                        <th className="border-b border-border px-2 py-2 text-left w-8">No</th>
                        <th className="border-b border-border px-2 py-2 text-left min-w-[120px]">제품명</th>
                        <th className="border-b border-border px-2 py-2 text-left min-w-[90px]">규격</th>
                        <th className="border-b border-border px-2 py-2 text-right min-w-[90px]">원가(원)</th>
                        <th className="border-b border-border px-2 py-2 text-left min-w-[100px]">색상/특이사항</th>
                        <th className="border-b border-border px-2 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {accumulatedVendorItems.map((row, idx) => (
                        <tr key={`${row._fileId}-${row._itemIndex}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={row.product_name}
                              onChange={(e) => updateVendorPriceItem(row._fileId, row._itemIndex, 'product_name', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={row.size}
                              onChange={(e) => updateVendorPriceItem(row._fileId, row._itemIndex, 'size', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              value={row.cost_price || ''}
                              onChange={(e) => updateVendorPriceItem(row._fileId, row._itemIndex, 'cost_price', parseInt(e.target.value, 10) || 0)}
                              className="h-8 text-sm text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={row.description}
                              onChange={(e) => updateVendorPriceItem(row._fileId, row._itemIndex, 'description', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive"
                              onClick={() => removeVendorPriceItem(row._fileId, row._itemIndex)}
                              title="행 삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                  저장 시 vendor_name은 &quot;{vendorName || DEFAULT_VENDOR_NAME}&quot;로 통일됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground">
            저장된 데이터에는 is_test: true가 적용됩니다. 상담 관리 또는 별도 기능에서 테스트 데이터 일괄 삭제가 가능합니다.
          </p>
        </div>
      </div>
    </div>
  )
}
