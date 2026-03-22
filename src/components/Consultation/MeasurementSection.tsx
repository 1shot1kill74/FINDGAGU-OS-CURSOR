/**
 * 실측 탭 — 발주서·배치도 분리 업로드
 * - [발주서 업로드]: 새 order_assets 전용 테이블에 저장
 * - [배치도 업로드]: 이미지/PDF 모두 새 order_assets 전용 테이블에 저장
 * - OrderDocumentsGallery: 발주서 PDF/PPT 갤러리
 */
import { useState, useEffect, useCallback } from 'react'
import { FileText, LayoutGrid, Plus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadEngine } from '@/lib/uploadEngine'
import { validateMetadataForConsultation } from '@/lib/uploadEngine'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { OrderDocumentsGallery } from '@/components/order/OrderDocumentsGallery'
import type { OrderDocument } from '@/types/orderDocument'
import type { OrderAsset, OrderAssetFileType } from '@/types/orderAsset'
import {
  deleteOrderAsset as deleteOrderAssetRecord,
  fetchOrderAssetsByConsultation,
  insertOrderAsset,
} from '@/lib/orderAssetService'

const CATEGORY_PURCHASE_ORDER = 'purchase_order'
const CATEGORY_FLOOR_PLAN = 'floor_plan'

const ACCEPT_PURCHASE_ORDER = '.pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'
const ACCEPT_FLOOR_PLAN = 'image/*,.pdf,application/pdf'

const hasThumbnail = (a: OrderAssetItem) => !!(a.thumbnail_url && a.thumbnail_url.trim())
const isDocWithoutThumb = (a: OrderAssetItem) =>
  (a.file_type === 'pdf' || a.file_type === 'ppt' || a.file_type === 'pptx' || /\.(pdf|ppt|pptx)$/i.test(a.storage_path ?? '')) && !hasThumbnail(a)

type OrderAssetItem = OrderAsset

interface MeasurementSectionProps {
  consultationId: string
  projectName: string
  orderDocuments: OrderDocument[]
  measurementDrawingPath?: string | null
  onOrderDocumentsChange?: (data: OrderDocument[]) => void
}

function getOrderDocFileType(file: File): 'pdf' | 'ppt' | 'pptx' {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'ppt') return 'ppt'
  if (ext === 'pptx') return 'pptx'
  return 'pdf'
}

export function MeasurementSection({
  consultationId,
  projectName,
  orderDocuments,
  measurementDrawingPath,
  onOrderDocumentsChange,
}: MeasurementSectionProps) {
  const [orderAssets, setOrderAssets] = useState<OrderAssetItem[]>([])
  const [uploadingPurchase, setUploadingPurchase] = useState(false)
  const [uploadingFloor, setUploadingFloor] = useState(false)
  const fetchOrderAssets = useCallback(async () => {
    const data = await fetchOrderAssetsByConsultation(consultationId)
    setOrderAssets(data)
  }, [consultationId])

  useEffect(() => {
    fetchOrderAssets()
  }, [fetchOrderAssets])

  const meta = {
    customer_name: projectName?.trim() || '',
    project_id: consultationId,
    upload_date: new Date().toISOString().slice(0, 10),
    source: 'consultation_measurement',
  }

  const refetchOrderDocuments = useCallback(() => {
    supabase
      .from('order_documents')
      .select('id, consultation_id, storage_path, file_name, file_type, thumbnail_path, product_tags, document_category, created_at')
      .eq('consultation_id', consultationId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) onOrderDocumentsChange?.(data as OrderDocument[])
      })
  }, [consultationId, onOrderDocumentsChange])

  /** 발주서: PPT/PDF → uploadEngine (Supabase documents) → image_assets */
  const handleUploadPurchaseOrder = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['pdf', 'ppt', 'pptx']
    if (!allowed.includes(ext)) {
      toast.error('PDF 또는 PPT/PPTX 파일만 업로드할 수 있습니다.')
      return
    }
    setUploadingPurchase(true)
    try {
      const result = await uploadEngine(file, { ...meta, category: CATEGORY_PURCHASE_ORDER })
      const res = await insertOrderAsset({
        consultation_id: consultationId,
        asset_type: CATEGORY_PURCHASE_ORDER,
        storage_type: result.storage_type,
        file_url: result.cloudinary_url,
        thumbnail_url: result.thumbnail_url,
        storage_path: result.storage_path ?? null,
        public_id: result.public_id ?? null,
        file_name: file.name,
        file_type: getOrderDocFileType(file) as OrderAssetFileType,
        site_name: projectName?.trim() || null,
        metadata: {
          storage_path: result.storage_path,
          file_name: file.name,
          file_type: getOrderDocFileType(file),
        },
      })
      if ('error' in res) throw res.error
      toast.success('발주서가 업로드되었습니다.')
      fetchOrderAssets()
    } catch (e) {
      toast.error((e as Error).message ?? '업로드 실패')
    } finally {
      setUploadingPurchase(false)
    }
  }

  /** 배치도: 이미지 → Cloudinary, PDF → order_documents */
  const handleUploadFloorPlan = async (file: File) => {
    if (!validateMetadataForConsultation(meta)) {
      toast.error('상담 정보가 부족하여 업로드할 수 없습니다.')
      return
    }
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isImage && !isPdf) {
      toast.error('이미지 또는 PDF 파일만 업로드할 수 있습니다.')
      return
    }
    setUploadingFloor(true)
    try {
      if (isImage) {
        const result = await uploadEngine(file, { ...meta, category: CATEGORY_FLOOR_PLAN })
        const res = await insertOrderAsset({
          consultation_id: consultationId,
          asset_type: CATEGORY_FLOOR_PLAN,
          storage_type: result.storage_type,
          file_url: result.cloudinary_url,
          thumbnail_url: result.thumbnail_url,
          storage_path: result.storage_path ?? null,
          public_id: result.public_id ?? null,
          file_name: file.name,
          file_type: 'image',
          site_name: projectName?.trim() || null,
          metadata: {
            storage_path: result.storage_path,
            space_info: {}, // AI 참조용: 평수(pyeong), 구조(structure) 등
          },
        })
        if ('error' in res) throw res.error
        toast.success('배치도가 업로드되었습니다.')
        fetchOrderAssets()
      } else {
        const result = await uploadEngine(file, { ...meta, category: CATEGORY_FLOOR_PLAN })
        const res = await insertOrderAsset({
          consultation_id: consultationId,
          asset_type: CATEGORY_FLOOR_PLAN,
          storage_type: result.storage_type,
          file_url: result.cloudinary_url,
          thumbnail_url: result.thumbnail_url,
          storage_path: result.storage_path ?? null,
          public_id: result.public_id ?? null,
          file_name: file.name,
          file_type: 'pdf',
          site_name: projectName?.trim() || null,
          metadata: {
            storage_path: result.storage_path,
            file_name: file.name,
            file_type: 'pdf',
            space_info: {}, // AI 참조용: 평수(pyeong), 구조(structure) 등
          },
        })
        if ('error' in res) throw res.error
        toast.success('배치도 PDF가 업로드되었습니다.')
        fetchOrderAssets()
      }
    } catch (e) {
      toast.error((e as Error).message ?? '업로드 실패')
    } finally {
      setUploadingFloor(false)
    }
  }

  const handleFileSelectPurchase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUploadPurchaseOrder(file)
    e.target.value = ''
  }

  const handleFileSelectFloor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUploadFloorPlan(file)
    e.target.value = ''
  }

  const handleDeleteAsset = async (asset: OrderAssetItem) => {
    if (!confirm('이 항목을 삭제할까요?')) return
    try {
      const { error } = await deleteOrderAssetRecord(asset)
      if (error) throw error
      toast.success('삭제되었습니다.')
      fetchOrderAssets()
    } catch (e) {
      toast.error((e as Error).message ?? '삭제 실패')
    }
  }

  const purchaseOrderAssets = orderAssets.filter((a) => a.asset_type === CATEGORY_PURCHASE_ORDER)
  const floorPlanAssets = orderAssets.filter((a) => a.asset_type === CATEGORY_FLOOR_PLAN)

  return (
    <div className="space-y-6">
      {/* [발주서 업로드] — PPT/PDF */}
      <div className="rounded-lg border border-dashed border-border p-4 bg-muted/20 space-y-3">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          발주서 업로드
        </h4>
        <p className="text-[11px] text-muted-foreground">PPT 또는 PDF 파일을 업로드합니다.</p>
        <label className="inline-flex cursor-pointer">
          <input
            type="file"
            accept={ACCEPT_PURCHASE_ORDER}
            className="sr-only"
            onChange={handleFileSelectPurchase}
            disabled={uploadingPurchase}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
            <span>
              {uploadingPurchase ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              발주서 파일 선택
            </span>
          </Button>
        </label>
      </div>

      {/* [배치도 업로드] — 이미지 또는 PDF */}
      <div className="rounded-lg border border-dashed border-border p-4 bg-muted/20 space-y-3">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          배치도 업로드
        </h4>
        <p className="text-[11px] text-muted-foreground">이미지 또는 PDF 파일을 업로드합니다.</p>
        <label className="inline-flex cursor-pointer">
          <input
            type="file"
            accept={ACCEPT_FLOOR_PLAN}
            className="sr-only"
            onChange={handleFileSelectFloor}
            disabled={uploadingFloor}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
            <span>
              {uploadingFloor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              배치도 파일 선택
            </span>
          </Button>
        </label>
        {floorPlanAssets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            {floorPlanAssets.map((a) =>
              isDocWithoutThumb(a) ? (
                <div key={a.id} className="relative group">
                  <a
                    href={a.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-[4/3] rounded-lg border border-border bg-muted/40 hover:bg-muted/70 flex flex-col items-center justify-center gap-1 p-2 transition-colors"
                  >
                    <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-foreground truncate w-full text-center">
                      {a.file_name || '배치도 PDF'}
                    </span>
                  </a>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.preventDefault(); handleDeleteAsset(a) }}
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div key={a.id} className="relative group">
                  <a
                    href={a.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-[4/3] rounded-lg border border-border bg-muted/40 overflow-hidden hover:bg-muted/70 transition-colors"
                  >
                    <img
                      src={a.thumbnail_url || a.file_url}
                      alt={a.site_name || a.asset_type || ''}
                      className="w-full h-full object-cover"
                    />
                  </a>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.preventDefault(); handleDeleteAsset(a) }}
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* 발주서 갤러리 (order_assets + legacy order_documents 혼합) */}
      <div className="space-y-3">
        {purchaseOrderAssets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {purchaseOrderAssets.map((a) => (
              <div key={a.id} className="relative group">
                <a
                  href={a.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block aspect-[4/3] rounded-lg border border-border bg-muted/40 hover:bg-muted/70 transition-colors overflow-hidden ${
                    hasThumbnail(a) ? '' : 'flex flex-col items-center justify-center gap-1 p-2'
                  }`}
                >
                  {hasThumbnail(a) ? (
                    <img
                      src={a.thumbnail_url!}
                      alt={a.file_name || '발주서'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate w-full text-center">
                        {a.file_name || '발주서'}
                      </span>
                    </>
                  )}
                </a>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.preventDefault(); handleDeleteAsset(a) }}
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <OrderDocumentsGallery
          consultationId={consultationId}
          consultationDisplayName={projectName}
          measurementDrawingPath={measurementDrawingPath}
          orderDocuments={orderDocuments.filter((d) => (d.document_category ?? 'purchase_order') === 'purchase_order')}
          onUploadComplete={refetchOrderDocuments}
        />
      </div>

    </div>
  )
}
