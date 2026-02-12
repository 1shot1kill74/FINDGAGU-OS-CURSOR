/**
 * 상담별 견적서 업로드 갤러리 — PDF/이미지 견적서 업로드, project_name 연동, AI 참조용
 * + 데이터 마이그레이션: AI 분석 → 확인용 미리보기 → products/estimates 저장
 * Storage: estimate-files/{consultation_id}/{timestamp}_{filename}
 */
import { useState } from 'react'
import { FileText, Image, Plus, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
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
  onUploadComplete?: () => void
}

function getFileType(ext: string): EstimateFileType | null {
  const e = ext?.toLowerCase()
  if (VALID_EXT.includes(e as EstimateFileType)) return e as EstimateFileType
  return null
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
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setPreviewCategory(null)
    setPreviewVendor(null)
    setPreviewEstimate(null)
    setPreviewError(null)
    try {
      const { category, result } = await parseFileWithAI(file)
      setPreviewCategory(category)
      if (result.type === 'VendorPrice') {
        setPreviewVendor(result.data.items)
      } else {
        setPreviewEstimate(result.data)
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'AI 분석 실패')
      toast.error('AI 분석에 실패했습니다.')
    } finally {
      setAnalyzing(false)
    }
  }

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewFile(null)
    setPreviewCategory(null)
    setPreviewVendor(null)
    setPreviewEstimate(null)
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
      const { error: pErr } = await supabase
        .from('products')
        .upsert(productRows, { onConflict: 'name', ignoreDuplicates: false })
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

      await uploadAndRegister(previewFile)
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
    if (!previewEstimate || !previewFile) return
    setSaving(true)
    try {
      const { siteName, region, industry, quoteDate, recipientContact, rows, customer_name, customer_phone, total_amount } = previewEstimate
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
      const nextMeta = { ...metaObj, region: region || metaObj.region, industry: industry || metaObj.industry } as Json
      await supabase.from('consultations').update({ expected_revenue: finalAmount, metadata: nextMeta }).eq('id', consultationId)

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
        await supabase
          .from('products')
          .upsert(productRows, { onConflict: 'name', ignoreDuplicates: false })
      }

      await uploadAndRegister(previewFile)
      toast.success(
        productRows.length > 0
          ? '견적서가 등록되었고, Products에도 반영되었습니다.'
          : '견적서가 이 상담에 등록되었습니다.'
      )
      closePreview()
      onUploadComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const uploadAndRegister = async (file: File) => {
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

    // @ts-expect-error consultation_estimate_files 신규 테이블
    const { error: insertError } = await supabase.from('consultation_estimate_files').insert({
      consultation_id: consultationId,
      project_name: projectName || null,
      storage_path: storagePath,
      file_name: file.name,
      file_type: fileType,
    })
    if (insertError) throw insertError

    // @ts-expect-error estimate_pdf_url 신규 컬럼
    await supabase.from('consultations').update({ estimate_pdf_url: storagePath }).eq('id', consultationId)
  }

  const handleSkipToUpload = async () => {
    if (!previewFile) return
    setSaving(true)
    try {
      await uploadAndRegister(previewFile)
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">업로드 견적서 (AI 참조용)</h4>
        <label className="cursor-pointer">
          <input
            type="file"
            accept={ACCEPT_TYPES}
            className="sr-only"
            onChange={handleFileSelect}
            disabled={uploading || analyzing}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8" asChild>
            <span>
              {(uploading || analyzing) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              견적서 업로드
            </span>
          </Button>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        PDF 또는 이미지 견적서/외주업체 단가표를 업로드하면 AI가 분석 후 <strong>확인용 미리보기</strong>를 보여줍니다.
        검수 후 저장하면 공식 상품 목록(Products) 또는 견적서로 등록됩니다.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {files.map((f) => {
          const isPdf = f.file_type === 'pdf'
          const Icon = isPdf ? FileText : Image
          const isDeleting = deletingId === f.id
          return (
            <div
              key={f.id}
              className="relative group aspect-[4/3] rounded-lg border border-border bg-muted/40 hover:bg-muted/70 flex flex-col items-center justify-center gap-1 p-2 text-left transition-colors"
            >
              <button
                type="button"
                onClick={() => openPreview(f)}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-1 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <Icon className="h-8 w-8 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground truncate w-full text-center">{f.file_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(f.created_at).toLocaleDateString('ko-KR')}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 z-10"
                onClick={(e) => handleDeleteFile(e, f)}
                disabled={isDeleting}
                title="삭제"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )
        })}
      </div>
      {files.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed border-border">
          견적서 또는 외주업체 단가표(PDF/이미지)를 업로드하면 AI가 분석 후 products/견적서로 반영합니다.
        </p>
      )}

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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!analyzing && !previewError && previewEstimate && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-800 dark:text-blue-200">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">견적서 — 견적 이력과 Products(판매 단가표)에 모두 저장됩니다.</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">고객/현장:</span> {previewEstimate.customer_name ?? previewEstimate.siteName}</div>
                <div><span className="text-muted-foreground">견적일:</span> {previewEstimate.quoteDate}</div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {previewEstimate.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">{row.no}</td>
                        <td className="px-2 py-1.5">{row.name}</td>
                        <td className="px-2 py-1.5">{row.spec}</td>
                        <td className="px-2 py-1.5 text-right">{row.qty}</td>
                        <td className="px-2 py-1.5 text-right">{row.unitPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

      <DocumentLightbox open={!!lightboxSource} onOpenChange={(open) => !open && setLightboxSource(null)} source={lightboxSource} />
    </div>
  )
}
