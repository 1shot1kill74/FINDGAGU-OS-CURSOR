/**
 * 상담별 견적서 업로드 갤러리 — PDF/이미지 견적서 업로드, project_name 연동, AI 참조용
 * + 데이터 마이그레이션: AI 분석 → 확인용 미리보기 → products/estimates 저장
 * Storage: estimate-files/{consultation_id}/{timestamp}_{filename}
 */
import { useState, useEffect } from 'react'
import { FileText, Image, Plus, Loader2, CheckCircle, AlertCircle, Trash2, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { DocumentLightbox, type LightboxSource } from '@/components/order/DocumentLightbox'
import type { ConsultationEstimateFile } from '@/types/consultationEstimateFile'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  parseFileWithAI,
  type ParsedVendorPriceItem,
  type ParsedEstimateFromPDF,
  type FileCategory,
} from '@/lib/parseFileWithAI'
import { shouldExcludeFromProducts, splitForProducts } from '@/lib/productFilter'
import { roundToPriceUnit } from '@/lib/estimateUtils'
import type { EstimateFormData, EstimateRow } from '@/components/estimate/EstimateForm'
import { computeFinalTotals } from '@/components/estimate/EstimateForm'
import type { Json } from '@/types/database'

const ESTIMATE_FILES_BUCKET = 'estimate-files'
const ACCEPT_TYPES = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp'
const VALID_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const
type EstimateFileType = (typeof VALID_EXT)[number]
const SUPPLIER_FIXED = {
  bizNumber: '374-81-02631',
  address: '경기도 남양주시 화도읍 가곡로 88번길 29-2, 1동',
  contact: '031-592-7981',
} as const

interface EstimateFilesGalleryProps {
  consultationId: string
  projectName: string
  files: ConsultationEstimateFile[]
  onUploadComplete?: (payload?: { estimateAmount: number }) => void
}

function getFileType(ext: string): EstimateFileType | null {
  const e = ext?.toLowerCase()
  if (VALID_EXT.includes(e as EstimateFileType)) return e as EstimateFileType
  return null
}

/** 견적서/단가표 리스트용 카드 — 첨부 참조와 동일 높이, 원본보기·삭제 버튼 */
function FileListCard({
  file,
  isDeleting,
  onViewOriginal,
  onDelete,
}: {
  file: ConsultationEstimateFile
  isDeleting: boolean
  onViewOriginal: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const dateStr =
    file.upload_type === 'estimates' && file.quote_date && /^\d{4}-\d{2}-\d{2}$/.test(file.quote_date)
      ? new Date(file.quote_date + 'T00:00:00').toLocaleString('ko-KR', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date(file.created_at).toLocaleString('ko-KR', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 h-[52px] shadow-sm">
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <p className="text-xs font-semibold text-foreground leading-tight truncate">{dateStr}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{file.file_name}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs border-border"
          onClick={onViewOriginal}
          title="원본 보기"
        >
          <FileText className="h-3.5 w-3.5" />
          원본보기
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={isDeleting}
          title="삭제"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          삭제
        </Button>
      </div>
    </div>
  )
}

export function EstimateFilesGallery({
  consultationId,
  projectName,
  files,
  onUploadComplete,
}: EstimateFilesGalleryProps) {
  const [lightboxSource, setLightboxSource] = useState<LightboxSource | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewCategory, setPreviewCategory] = useState<FileCategory | null>(null)
  const [previewVendor, setPreviewVendor] = useState<ParsedVendorPriceItem[] | null>(null)
  const [previewEstimate, setPreviewEstimate] = useState<ParsedEstimateFromPDF | null>(null)
  /** AI 분석 결과 저장 전 수정용 — previewEstimate와 동기화 후 테이블에서 편집 */
  const [editableEstimate, setEditableEstimate] = useState<ParsedEstimateFromPDF | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /** [표준단가 고정] 시 기존 마스터 존재하면 확인용 */
  const [confirmFixProduct, setConfirmFixProduct] = useState<{
    name: string
    spec: string | null
    color: string | null
    supplyPrice: number
  } | null>(null)
  const [fixingProduct, setFixingProduct] = useState(false)
  /** 판매 단가표 반영 시 — 이미 Products에 있는데 금액이 다른 항목 선택용 */
  const [productConflictModalOpen, setProductConflictModalOpen] = useState(false)
  const [productConflicts, setProductConflicts] = useState<{ name: string; spec: string | null; color: string | null; currentPrice: number; newPrice: number; key: string }[]>([])
  const [productRowsPending, setProductRowsPending] = useState<{ name: string; supply_price: number; spec: string | null; color: string | null }[]>([])
  const [applyConflictKeys, setApplyConflictKeys] = useState<Set<string>>(new Set())
  /** 현재 미리보기 파일의 업로드 입구 (저장 시 upload_type으로 기록) */
  const [uploadTypeForCurrentFile, setUploadTypeForCurrentFile] = useState<'estimates' | 'vendor_price'>('estimates')

  /** 제품 키: 동일 제품 = name+spec+color (빈 값은 ''로 통일) */
  const productKey = (name: string, spec: string | null, color: string | null) =>
    `${(name ?? '').trim()}|${(spec ?? '').toString().trim()}|${(color ?? '').toString().trim()}`

  /** 제품명+규격+색상으로 products에 기존 행 존재 여부 */
  const checkProductExists = async (name: string, spec: string | null, color: string | null): Promise<boolean> => {
    const n = name.trim().slice(0, 255)
    const s = (spec ?? '').toString().trim()
    const c = (color ?? '').toString().trim()
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('name', n)
      .eq('spec', s)
      .eq('color', c)
      .maybeSingle()
    return data != null
  }

  /** products에 단일 행 업서트 (공급단가 = supply_price, 표준단가표). 복합 유일키 name,spec,color */
  const upsertProductRow = async (payload: { name: string; spec: string | null; color: string | null; supplyPrice: number }) => {
    const row = {
      name: payload.name.trim().slice(0, 255),
      supply_price: payload.supplyPrice,
      spec: (payload.spec ?? '').toString().trim() || '',
      color: (payload.color ?? '').toString().trim() || '',
    }
    const { error } = await supabase.from('products').upsert(row, { onConflict: 'name,spec,color', ignoreDuplicates: false })
    if (error) throw error
  }

  const handleFixStandardPriceVendor = async (row: ParsedVendorPriceItem) => {
    const name = (row.product_name ?? '').trim()
    if (!name || shouldExcludeFromProducts(name)) return
    const cost = Number(row.cost_price) || 0
    if (cost <= 0) {
      toast.error('원가가 없어 표준단가를 계산할 수 없습니다.')
      return
    }
    const supplyPrice = roundToPriceUnit(cost / (1 - 0.3))
    const spec = row.size?.trim() || null
    const color = row.color?.trim() || null
    const exists = await checkProductExists(name, spec, color)
    if (exists) {
      setConfirmFixProduct({ name, spec, color, supplyPrice })
      return
    }
    setFixingProduct(true)
    try {
      await upsertProductRow({ name, spec, color, supplyPrice })
      toast.success(`'${name}' 표준단가가 등록되었습니다.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '표준단가 고정 실패')
    } finally {
      setFixingProduct(false)
    }
  }

  const handleFixStandardPriceEstimate = async (row: EstimateRow) => {
    const name = (row.name ?? '').trim()
    if (!name || shouldExcludeFromProducts(name)) return
    const unitNum = parseFloat(String(row.unitPrice ?? '').replace(/,/g, '')) || 0
    if (unitNum <= 0) {
      toast.error('단가가 없어 표준단가로 등록할 수 없습니다.')
      return
    }
    const spec = (row.spec ?? '').trim() || null
    const color = (row.color ?? '').trim() || null
    const exists = await checkProductExists(name, spec, color)
    if (exists) {
      setConfirmFixProduct({ name, spec, color, supplyPrice: unitNum })
      return
    }
    setFixingProduct(true)
    try {
      await upsertProductRow({ name, spec, color, supplyPrice: unitNum })
      toast.success(`'${name}' 표준단가가 등록되었습니다.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '표준단가 고정 실패')
    } finally {
      setFixingProduct(false)
    }
  }

  const handleConfirmFixProductSubmit = async () => {
    if (!confirmFixProduct) return
    setFixingProduct(true)
    try {
      await upsertProductRow(confirmFixProduct)
      toast.success(`'${confirmFixProduct.name}' 표준단가가 수정되었습니다.`)
      setConfirmFixProduct(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '표준단가 고정 실패')
    } finally {
      setFixingProduct(false)
    }
  }

  /** 동일 제품·다른 금액 충돌 모달에서 "선택한 항목만 반영" 클릭 시 */
  const handleConfirmProductConflicts = async () => {
    if (!productRowsPending.length || !previewVendor?.length || !previewFile) return
    setSaving(true)
    try {
      const conflictKeys = new Set(productConflicts.map((c) => c.key))
      const toUpsert = productRowsPending
        .map((row) => ({ ...row, spec: (row.spec ?? '').toString().trim() || '', color: (row.color ?? '').toString().trim() || '' }))
        .filter((row) => !conflictKeys.has(productKey(row.name, row.spec, row.color)) || applyConflictKeys.has(productKey(row.name, row.spec, row.color)))
      if (toUpsert.length > 0) {
        const { error: pErr } = await supabase
          .from('products')
          .upsert(toUpsert.map((r) => ({ name: r.name.slice(0, 255), supply_price: r.supply_price, spec: r.spec, color: r.color })), { onConflict: 'name,spec,color', ignoreDuplicates: false })
        if (pErr) throw pErr
      }

      // 견적서 이력에는 전체 반영 (원가표 → 견적 형식)
      const estimateRows: EstimateRow[] = previewVendor.map((it, i) => {
        const cost = Number(it.cost_price) || 0
        const unitPrice = cost > 0 ? roundToPriceUnit(cost / (1 - 0.3)) : 0
        return {
          no: String(i + 1),
          name: (it.product_name?.trim() || '(미명)').slice(0, 255),
          spec: it.size?.trim() || '',
          qty: String(it.quantity ?? 1),
          unit: 'EA',
          unitPrice: String(unitPrice),
          note: '',
          costPrice: cost > 0 ? String(cost) : undefined,
          color: it.color?.trim() || undefined,
        }
      })
      const quoteDateForPayload = new Date().toISOString().slice(0, 16).replace('T', ' ')
      const payload: EstimateFormData = {
        mode: 'FINAL',
        recipientName: '원가표 반영',
        recipientContact: '',
        quoteDate: quoteDateForPayload,
        bizNumber: SUPPLIER_FIXED.bizNumber,
        address: SUPPLIER_FIXED.address,
        supplierContact: SUPPLIER_FIXED.contact,
        sealImageUrl: '',
        rows: estimateRows,
        footerNotes: '원가표 AI 분석 → Products 및 견적 이력 반영',
      }
      const { supplyTotal, vat, grandTotal } = computeFinalTotals(payload)
      const payloadForDb = { ...payload } as unknown as Json
      const { error: estErr } = await supabase
        .from('estimates')
        .insert({
          consultation_id: consultationId,
          payload: payloadForDb,
          supply_total: supplyTotal,
          vat,
          grand_total: grandTotal,
          approved_at: new Date().toISOString(),
          final_proposal_data: payloadForDb,
          is_test: false,
        })
      if (estErr) throw estErr

      await uploadAndRegister(previewFile, 'vendor_price')
      const appliedCount = toUpsert.length
      const skippedCount = productConflicts.length - applyConflictKeys.size
      toast.success(
        appliedCount > 0
          ? `Products에 ${appliedCount}건 반영, 견적 이력 저장 완료.${skippedCount > 0 ? ` (금액 유지한 항목 ${skippedCount}건)` : ''}`
          : '견적 이력만 저장되었습니다. (표준단가 반영 없음)'
      )
      setProductConflictModalOpen(false)
      setProductConflicts([])
      setProductRowsPending([])
      setApplyConflictKeys(new Set())
      closePreview()
      onUploadComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const toggleConflictApply = (key: string) => {
    setApplyConflictKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleDeleteFile = async (e: React.MouseEvent, f: ConsultationEstimateFile) => {
    e.stopPropagation()
    if (!confirm(`'${f.file_name}' 파일을 삭제하시겠습니까?`)) return
    setDeletingId(f.id)
    try {
      // @ts-expect-error consultation_estimate_files 신규 테이블
      const { error: deleteErr } = await supabase.from('consultation_estimate_files').delete().eq('id', f.id)
      if (deleteErr) throw deleteErr
      await supabase.storage.from(ESTIMATE_FILES_BUCKET).remove([f.storage_path]).catch(() => {})
      toast.success('파일이 삭제되었습니다.')
      onUploadComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  /** 입구별 모드: 견적서 입구 → 항상 estimates(공급가), 외주업체 단가표 입구 → 항상 vendor_price(원가) */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, uploadType: 'estimates' | 'vendor_price') => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType = getFileType(ext)
    if (!fileType) {
      toast.error('PDF 또는 이미지(png, jpg, webp)만 업로드할 수 있습니다.')
      return
    }
    e.target.value = ''
    setAnalyzing(true)
    setPreviewOpen(true)
    setPreviewFile(file)
    setPreviewCategory(uploadType === 'estimates' ? 'Estimates' : 'VendorPrice')
    setPreviewVendor(null)
    setPreviewEstimate(null)
    setPreviewError(null)
    setUploadTypeForCurrentFile(uploadType)
    try {
      const { category, result } = await parseFileWithAI(file, { mode: uploadType })
      setPreviewCategory(category)
      if (result.type === 'VendorPrice') {
        setPreviewVendor(result.data.items)
        setPreviewEstimate(null)
      } else {
        setPreviewEstimate(result.data)
        setPreviewVendor(null)
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'AI 분석 실패')
      toast.error('AI 분석에 실패했습니다.')
    } finally {
      setAnalyzing(false)
    }
  }

  /** AI 분석 결과가 바뀌면 편집용 복사본 동기화 */
  useEffect(() => {
    if (previewEstimate) {
      setEditableEstimate(JSON.parse(JSON.stringify(previewEstimate)))
    } else {
      setEditableEstimate(null)
    }
  }, [previewEstimate])

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewFile(null)
    setPreviewCategory(null)
    setPreviewVendor(null)
    setPreviewEstimate(null)
    setEditableEstimate(null)
    setPreviewError(null)
  }

  const handleSaveVendor = async () => {
    if (!previewVendor?.length || !previewFile) return
    setSaving(true)
    try {
      const { toSave } = splitForProducts(previewVendor)
      const productRows = toSave.map((it) => {
        const cost = Number(it.cost_price) || 0
        const sellingPrice = cost > 0 ? roundToPriceUnit(cost / (1 - 0.3)) : 0
        return {
          name: (it.product_name?.trim() || '(미명)').slice(0, 255),
          supply_price: sellingPrice,
          spec: it.size?.trim() || null,
          color: it.color?.trim() || null,
        }
      })
      if (productRows.length === 0) {
        toast.info('저장할 가구 제품이 없습니다. (배송/설치/시공 등 제외 항목만 있습니다)')
        setSaving(false)
        return
      }

      // 이미 표준단가표에 있는데 금액이 다른 항목 찾기 (제품 = name+spec+color 동일)
      const normalizedRows = productRows.map((r) => ({
        ...r,
        spec: (r.spec ?? '').toString().trim() || '',
        color: (r.color ?? '').toString().trim() || '',
      }))
      const names = [...new Set(normalizedRows.map((r) => r.name))]
      const { data: existingProducts } = await supabase
        .from('products')
        .select('name, supply_price, spec, color')
        .in('name', names)
      const existingByKey = new Map(
        (existingProducts ?? []).map((p) => [
          productKey(p.name ?? '', p.spec ?? null, p.color ?? null),
          Number(p.supply_price),
        ])
      )
      const conflicts = normalizedRows.filter((r) => {
        const key = productKey(r.name, r.spec, r.color)
        const current = existingByKey.get(key)
        return current != null && current !== r.supply_price
      })

      if (conflicts.length > 0) {
        setProductConflicts(
          conflicts.map((r) => ({
            name: r.name,
            spec: r.spec || null,
            color: r.color || null,
            currentPrice: existingByKey.get(productKey(r.name, r.spec, r.color)) ?? 0,
            newPrice: r.supply_price,
            key: productKey(r.name, r.spec, r.color),
          }))
        )
        setProductRowsPending(productRows)
        setApplyConflictKeys(new Set())
        setProductConflictModalOpen(true)
        setSaving(false)
        return
      }

      const { error: pErr } = await supabase
        .from('products')
        .upsert(
          normalizedRows.map((r) => ({ name: r.name.slice(0, 255), supply_price: r.supply_price, spec: r.spec, color: r.color })),
          { onConflict: 'name,spec,color', ignoreDuplicates: false }
        )
      if (pErr) throw pErr

      // 견적서 이력에도 저장 (원가표 → 견적 형식 변환)
      const estimateRows: EstimateRow[] = previewVendor.map((it, i) => {
        const cost = Number(it.cost_price) || 0
        const unitPrice = cost > 0 ? roundToPriceUnit(cost / (1 - 0.3)) : 0
        return {
          no: String(i + 1),
          name: (it.product_name?.trim() || '(미명)').slice(0, 255),
          spec: it.size?.trim() || '',
          qty: String(it.quantity ?? 1),
          unit: 'EA',
          unitPrice: String(unitPrice),
          note: '',
          costPrice: cost > 0 ? String(cost) : undefined,
          color: it.color?.trim() || undefined,
        }
      })
      const quoteDateForPayload = new Date().toISOString().slice(0, 16).replace('T', ' ')
      const payload: EstimateFormData = {
        mode: 'FINAL',
        recipientName: '원가표 반영',
        recipientContact: '',
        quoteDate: quoteDateForPayload,
        bizNumber: SUPPLIER_FIXED.bizNumber,
        address: SUPPLIER_FIXED.address,
        supplierContact: SUPPLIER_FIXED.contact,
        sealImageUrl: '',
        rows: estimateRows,
        footerNotes: '원가표 AI 분석 → Products 및 견적 이력 반영',
      }
      const { supplyTotal, vat, grandTotal } = computeFinalTotals(payload)
      const payloadForDb = { ...payload } as unknown as Json
      const { error: estErr } = await supabase
        .from('estimates')
        .insert({
          consultation_id: consultationId,
          payload: payloadForDb,
          supply_total: supplyTotal,
          vat,
          grand_total: grandTotal,
          approved_at: new Date().toISOString(),
          final_proposal_data: payloadForDb,
          is_test: false,
        })
      if (estErr) throw estErr

      await uploadAndRegister(previewFile, 'vendor_price')
      toast.success(`Products에 ${productRows.length}건, 견적 이력에 반영되었습니다.`)
      closePreview()
      onUploadComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEstimate = async () => {
    const toSave = editableEstimate ?? previewEstimate
    if (!toSave || !previewFile) return
    setSaving(true)
    try {
      const { siteName, region, industry, quoteDate, recipientContact, rows, customer_name, customer_phone, total_amount } = toSave
      const quoteDateForPayload =
        quoteDate && /^\d{4}-\d{2}-\d{2}$/.test(quoteDate)
          ? `${quoteDate} 00:00`
          : new Date().toISOString().slice(0, 16).replace('T', ' ')
      const payload: EstimateFormData & { _migration_original_filename?: string } = {
        mode: 'FINAL',
        recipientName: (customer_name ?? siteName ?? '').trim() || '알 수 없는 고객',
        recipientContact: (customer_phone ?? recipientContact ?? '').trim() || '000-0000-0000',
        quoteDate: quoteDateForPayload,
        bizNumber: SUPPLIER_FIXED.bizNumber,
        address: SUPPLIER_FIXED.address,
        supplierContact: SUPPLIER_FIXED.contact,
        sealImageUrl: '',
        rows: rows as EstimateRow[],
        footerNotes: '업로드 견적서 AI 분석',
        _migration_original_filename: previewFile.name,
      }
      const { supplyTotal, vat, grandTotal } = computeFinalTotals(payload)
      const finalAmount = total_amount && total_amount > 0 ? total_amount : grandTotal

      const payloadForDb = { ...payload, _migration_original_filename: previewFile.name } as unknown as Json
      const { error: estErr } = await supabase
        .from('estimates')
        .insert({
          consultation_id: consultationId,
          payload: payloadForDb,
          supply_total: supplyTotal,
          vat,
          grand_total: grandTotal,
          approved_at: new Date().toISOString(),
          final_proposal_data: payloadForDb,
          is_test: false,
        })
      if (estErr) throw estErr

      const { data: cur } = await supabase.from('consultations').select('metadata').eq('id', consultationId).single()
      const meta = (cur as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}
      const metaObj = typeof meta === 'object' && meta !== null ? meta : {}
      const nextMeta = { ...metaObj } as Json
      const recognizedPhone = (customer_phone ?? recipientContact ?? '').trim().replace(/\s/g, '')
      const hasValidPhone = recognizedPhone.length >= 9 && /\d/.test(recognizedPhone)
      const updatePayload: Record<string, unknown> = {
        estimate_amount: finalAmount,
        status: '견적발송',
        metadata: nextMeta,
        ...(hasValidPhone ? { customer_phone: recognizedPhone } : {}),
      }
      await supabase.from('consultations').update(updatePayload as Record<string, unknown>).eq('id', consultationId)

      // 판매 단가표(products)에 판매단가로 반영 (원가는 역산해서 수익률 판단용)
      const productRows: { name: string; supply_price: number; spec: string | null; color: string | null }[] = []
      for (const r of rows as EstimateRow[]) {
        const name = (r.name ?? '').trim()
        if (!name || shouldExcludeFromProducts(name)) continue
        const unitNum = parseFloat(String(r.unitPrice ?? '').replace(/,/g, '')) || 0
        const costNum = parseFloat(String(r.costPrice ?? '').replace(/,/g, '')) || 0
        const sellingPrice = unitNum > 0 ? unitNum : costNum > 0 ? roundToPriceUnit(costNum / (1 - 0.3)) : 0
        if (sellingPrice <= 0) continue
        productRows.push({
          name: name.slice(0, 255),
          supply_price: sellingPrice,
          spec: (r.spec ?? '').trim() || null,
          color: (r.color ?? '').trim() || null,
        })
      }
      if (productRows.length > 0) {
        const normalized = productRows.map((r) => ({
          name: r.name.slice(0, 255),
          supply_price: r.supply_price,
          spec: (r.spec ?? '').toString().trim() || '',
          color: (r.color ?? '').toString().trim() || '',
        }))
        await supabase.from('products').upsert(normalized, { onConflict: 'name,spec,color', ignoreDuplicates: false })
      }

      const quoteDateOnly = quoteDate && /^\d{4}-\d{2}-\d{2}$/.test(quoteDate) ? quoteDate : undefined
      await uploadAndRegister(previewFile, 'estimates', quoteDateOnly)
      toast.success(
        productRows.length > 0
          ? '견적서가 등록되었고, Products에도 반영되었습니다.'
          : '견적서가 이 상담에 등록되었습니다.'
      )
      closePreview()
      onUploadComplete?.({ estimateAmount: finalAmount })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const uploadAndRegister = async (file: File, uploadType: 'estimates' | 'vendor_price', quoteDate?: string) => {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${consultationId}/${timestamp}_${safeName}`
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType = getFileType(ext) ?? 'pdf'
    const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg')

    const { error: uploadError } = await supabase.storage
      .from(ESTIMATE_FILES_BUCKET)
      .upload(storagePath, file, { contentType, upsert: false })
    if (uploadError) throw uploadError

    const quoteDateVal = uploadType === 'estimates' && quoteDate && /^\d{4}-\d{2}-\d{2}$/.test(quoteDate) ? quoteDate : null
    // @ts-expect-error consultation_estimate_files 신규 테이블
    const { error: insertError } = await supabase.from('consultation_estimate_files').insert({
      consultation_id: consultationId,
      project_name: projectName || null,
      storage_path: storagePath,
      file_name: file.name,
      file_type: fileType,
      upload_type: uploadType,
      ...(quoteDateVal != null ? { quote_date: quoteDateVal } : {}),
    })
    if (insertError) throw insertError

    // @ts-expect-error estimate_pdf_url 신규 컬럼
    await supabase.from('consultations').update({ estimate_pdf_url: storagePath }).eq('id', consultationId)
  }

  const handleSkipToUpload = async () => {
    if (!previewFile) return
    setSaving(true)
    try {
      await uploadAndRegister(previewFile, uploadTypeForCurrentFile ?? 'estimates')
      toast.success('참조용으로 업로드되었습니다. AI가 참조할 수 있습니다.')
      closePreview()
      onUploadComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setSaving(false)
    }
  }

  const openPreview = (f: ConsultationEstimateFile) => {
    setLightboxSource({
      type: 'estimate',
      path: f.storage_path,
      name: f.file_name,
      fileType: f.file_type,
    })
  }

  const estimateFiles = files.filter((f) => (f.upload_type ?? 'estimates') === 'estimates')
  const vendorFiles = files.filter((f) => f.upload_type === 'vendor_price')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-foreground">업로드 (AI 참조용)</h4>
        <div className="flex gap-2">
          <input
            type="file"
            accept={ACCEPT_TYPES}
            className="sr-only"
            id="estimate-upload-input"
            onChange={(e) => handleFileSelect(e, 'estimates')}
            disabled={uploading || analyzing}
          />
          <input
            type="file"
            accept={ACCEPT_TYPES}
            className="sr-only"
            id="vendor-upload-input"
            onChange={(e) => handleFileSelect(e, 'vendor_price')}
            disabled={uploading || analyzing}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            disabled={uploading || analyzing}
            onClick={() => document.getElementById('estimate-upload-input')?.click()}
          >
            {(uploading || analyzing) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            견적서 업로드
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            disabled={uploading || analyzing}
            onClick={() => document.getElementById('vendor-upload-input')?.click()}
          >
            {(uploading || analyzing) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            외주업체 단가표 업로드
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <strong>견적서 업로드</strong> → 단가는 공급가로 인식. <strong>외주업체 단가표 업로드</strong> → 단가는 원가로 인식. 검수 후 저장하면 Products·견적 이력에 반영됩니다.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 왼쪽: 견적서 리스트 */}
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-foreground">견적서</h5>
          <div className="space-y-1.5 rounded-lg border border-border bg-background p-2 min-h-[120px]">
            {estimateFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">업로드한 견적서가 없습니다.</p>
            ) : (
              estimateFiles.map((f) => (
                <FileListCard
                  key={f.id}
                  file={f}
                  isDeleting={deletingId === f.id}
                  onViewOriginal={() => openPreview(f)}
                  onDelete={(e) => handleDeleteFile(e, f)}
                />
              ))
            )}
          </div>
        </div>
        {/* 오른쪽: 외주업체 단가표 리스트 */}
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-foreground">외주업체 단가표</h5>
          <div className="space-y-1.5 rounded-lg border border-border bg-background p-2 min-h-[120px]">
            {vendorFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">업로드한 외주업체 단가표가 없습니다.</p>
            ) : (
              vendorFiles.map((f) => (
                  <FileListCard
                    key={f.id}
                    file={f}
                    isDeleting={deletingId === f.id}
                    onViewOriginal={() => openPreview(f)}
                    onDelete={(e) => handleDeleteFile(e, f)}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      {/* AI 분석 결과 확인용 미리보기 모달 */}
      <Dialog open={previewOpen} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>확인용 미리보기</DialogTitle>
            <DialogDescription>
              {previewFile?.name} — AI가 추출한 내용을 검수한 뒤 저장하세요.
            </DialogDescription>
          </DialogHeader>
          {analyzing && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>AI 분석 중…</span>
            </div>
          )}
          {previewError && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}
          {!analyzing && !previewError && previewVendor && previewVendor.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">외주업체 단가표 — 가구 제품·부속품만 Products에 등록됩니다. 배송/설치/시공 등은 자동 제외.</span>
              </div>
              <div className="border border-border rounded-lg overflow-x-auto max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="border-b border-border px-2 py-2 text-left w-8">No</th>
                      <th className="border-b border-border px-2 py-2 text-left">품명</th>
                      <th className="border-b border-border px-2 py-2 text-left">규격</th>
                      <th className="border-b border-border px-2 py-2 text-right">단가(원)</th>
                      <th className="border-b border-border px-2 py-2 text-left">색상/메모</th>
                      <th className="border-b border-border px-2 py-2 text-center w-24">상태</th>
                      <th className="border-b border-border px-2 py-2 text-center w-28 print:hidden">표준단가 고정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewVendor.map((row, i) => {
                      const isExcluded = shouldExcludeFromProducts(row.product_name ?? '')
                      return (
                        <tr key={i} className={`border-b border-border last:border-0 ${isExcluded ? 'bg-muted/30' : ''}`}>
                          <td className="px-2 py-1.5">{i + 1}</td>
                          <td className="px-2 py-1.5">{row.product_name}</td>
                          <td className="px-2 py-1.5">{row.size || '-'}</td>
                          <td className="px-2 py-1.5 text-right">{(row.cost_price ?? 0).toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.description || row.memo || '-'}</td>
                          <td className="px-2 py-1.5 text-center">
                            {isExcluded ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                                단가 장부 제외 항목
                              </span>
                            ) : (
                              <span className="text-[10px] text-green-600 dark:text-green-400">→ 저장</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {!isExcluded && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={fixingProduct}
                                onClick={() => void handleFixStandardPriceVendor(row)}
                                title="이 항목을 제품 마스터(표준단가표)에 등록/수정"
                              >
                                {fixingProduct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}
                                표준단가 고정
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!analyzing && !previewError && previewEstimate && (() => {
            const display = editableEstimate ?? previewEstimate
            const updateRow = (rowIndex: number, field: keyof EstimateRow, value: string) => {
              setEditableEstimate((prev) => {
                if (!prev) return null
                const next = { ...prev, rows: prev.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r)) }
                return next
              })
            }
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-800 dark:text-blue-200">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">견적서 — 저장 전에 품목/규격/수량/단가를 수정할 수 있습니다. (예: E→ㅌ 등 OCR 오류 수정)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">고객/현장:</span>{' '}
                    <Input
                      className="mt-0.5 h-8 max-w-xs inline-flex"
                      value={display.customer_name ?? display.siteName ?? ''}
                      onChange={(e) => setEditableEstimate((prev) => (prev ? { ...prev, customer_name: e.target.value } : null))}
                    />
                  </div>
                  <div>
                    <span className="text-muted-foreground">견적일:</span>{' '}
                    <Input
                      className="mt-0.5 h-8 max-w-[140px] inline-flex"
                      value={display.quoteDate ?? ''}
                      onChange={(e) => setEditableEstimate((prev) => (prev ? { ...prev, quoteDate: e.target.value } : null))}
                    />
                  </div>
                </div>
                <div className="border border-border rounded-lg overflow-x-auto max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr>
                        <th className="border-b border-border px-2 py-2 text-left w-8">No</th>
                        <th className="border-b border-border px-2 py-2 text-left">품목</th>
                        <th className="border-b border-border px-2 py-2 text-left">규격</th>
                        <th className="border-b border-border px-2 py-2 text-right">수량</th>
                        <th className="border-b border-border px-2 py-2 text-right">단가(원)</th>
                        <th className="border-b border-border px-2 py-2 text-center w-28 print:hidden">표준단가 고정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.rows.map((row, i) => {
                        const isExcluded = shouldExcludeFromProducts(row.name ?? '')
                        return (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-2 py-1.5">{row.no}</td>
                            <td className="px-2 py-1.5">
                              <Input
                                className="h-8 text-sm"
                                value={row.name ?? ''}
                                onChange={(e) => updateRow(i, 'name', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                className="h-8 text-sm"
                                value={row.spec ?? ''}
                                onChange={(e) => updateRow(i, 'spec', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Input
                                className="h-8 text-sm text-right"
                                value={row.qty ?? ''}
                                onChange={(e) => updateRow(i, 'qty', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Input
                                className="h-8 text-sm text-right"
                                value={row.unitPrice ?? ''}
                                onChange={(e) => updateRow(i, 'unitPrice', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {!isExcluded && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  disabled={fixingProduct}
                                  onClick={() => void handleFixStandardPriceEstimate(row as EstimateRow)}
                                  title="이 항목을 제품 마스터(표준단가표)에 등록/수정"
                                >
                                  {fixingProduct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}
                                  표준단가 고정
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
          {!analyzing && !previewError && previewCategory && previewVendor?.length === 0 && !previewEstimate && (
            <p className="text-sm text-muted-foreground py-4">추출된 항목이 없습니다.</p>
          )}
          {!analyzing && previewVendor && previewVendor.length > 0 && (
            <p className="text-xs text-muted-foreground -mt-2 mb-1">
              [판매 단가표 반영] 시 Products와 견적 이력에 모두 저장됩니다.
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            {!analyzing && (
              <>
                {previewVendor && previewVendor.length > 0 && (
                  <Button onClick={handleSaveVendor} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '판매 단가표 반영'}
                  </Button>
                )}
                {previewEstimate && (
                  <Button onClick={handleSaveEstimate} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '견적서로 저장'}
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={handleSkipToUpload} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '참조용으로만 업로드'}
                </Button>
                <Button type="button" variant="outline" onClick={closePreview}>
                  취소
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 표준단가 고정 시 기존 마스터 존재 확인 */}
      <Dialog open={!!confirmFixProduct} onOpenChange={(open) => !open && setConfirmFixProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>표준단가 수정 확인</DialogTitle>
            <DialogDescription>
              마스터 데이터(표준단가)가 이미 존재합니다. 새로운 값으로 수정하시겠습니까?
              {confirmFixProduct && (
                <span className="block mt-2 text-foreground font-medium">
                  {confirmFixProduct.name} · {confirmFixProduct.supplyPrice.toLocaleString()}원
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmFixProduct(null)}>
              취소
            </Button>
            <Button type="button" onClick={() => void handleConfirmFixProductSubmit()} disabled={fixingProduct}>
              {fixingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : '수정'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 판매 단가표 반영 — 동일 제품·다른 금액일 때 반영 여부 선택 */}
      <Dialog
        open={productConflictModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setProductConflictModalOpen(false)
            setProductConflicts([])
            setProductRowsPending([])
            setApplyConflictNames(new Set())
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>표준단가표에 이미 있는 항목 (금액이 다름)</DialogTitle>
            <DialogDescription>
              아래 항목은 이미 표준단가표에 있으며, 이번 파일의 금액이 다릅니다. <strong>새 금액으로 반영할 항목만 체크</strong>하세요. 체크하지 않으면 기존 표준단가가 유지됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-border rounded-lg overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="border-b border-border px-2 py-2 text-left">품명</th>
                  <th className="border-b border-border px-2 py-2 text-left">규격</th>
                  <th className="border-b border-border px-2 py-2 text-left">색상</th>
                  <th className="border-b border-border px-2 py-2 text-right">현재 표준단가</th>
                  <th className="border-b border-border px-2 py-2 text-right">새 단가</th>
                  <th className="border-b border-border px-2 py-2 text-center w-20">반영</th>
                </tr>
              </thead>
              <tbody>
                {productConflicts.map((c) => (
                  <tr key={c.key} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-medium">{c.name}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{c.spec ?? '-'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{c.color ?? '-'}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{c.currentPrice.toLocaleString()}원</td>
                    <td className="px-2 py-1.5 text-right">{c.newPrice.toLocaleString()}원</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={applyConflictKeys.has(c.key)}
                        onChange={() => toggleConflictApply(c.key)}
                        className="h-4 w-4 rounded border-input"
                        aria-label={`${c.name} 새 금액 반영`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setProductConflictModalOpen(false)
                setProductConflicts([])
                setProductRowsPending([])
                setApplyConflictKeys(new Set())
              }}
            >
              취소
            </Button>
            <Button type="button" onClick={() => void handleConfirmProductConflicts()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '선택한 항목만 반영하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentLightbox open={!!lightboxSource} onOpenChange={(open) => !open && setLightboxSource(null)} source={lightboxSource} />
    </div>
  )
}
