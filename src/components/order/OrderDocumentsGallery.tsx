/**
 * BLUEPRINT: 상담 카드 '실측·발주서' 탭 = 단순 파일 리스트가 아닌,
 * Supabase Storage 기반 비주얼 갤러리 뷰. 썸네일(또는 타입 아이콘) 표시, 클릭 시 라이트박스 퀵뷰.
 */
import { useState, useEffect } from 'react'
import { FileText, Presentation, Ruler, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentLightbox, type LightboxSource } from './DocumentLightbox'
import type { OrderDocument } from '@/types/orderDocument'
import type { DocumentGalleryItem } from '@/types/orderDocument'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const ORDER_DOCUMENTS_BUCKET = 'order-documents'
const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'
const THUMB_EXPIRES = 3600

interface OrderDocumentsGalleryProps {
  consultationId: string
  consultationDisplayName: string
  /** legacy 실측 PDF 경로 (있으면 갤러리 첫 카드로 표시) */
  measurementDrawingPath?: string | null
  /** 발주서 목록 (order_documents) */
  orderDocuments: OrderDocument[]
  onUploadComplete?: () => void
}

export function OrderDocumentsGallery({
  consultationId,
  consultationDisplayName,
  measurementDrawingPath,
  orderDocuments,
  onUploadComplete,
}: OrderDocumentsGalleryProps) {
  const [lightboxSource, setLightboxSource] = useState<LightboxSource | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [tagEditDoc, setTagEditDoc] = useState<OrderDocument | null>(null)
  const [tagEditValue, setTagEditValue] = useState('')

  const items: DocumentGalleryItem[] = []
  if (measurementDrawingPath) {
    items.push({
      type: 'measurement',
      consultationId,
      path: measurementDrawingPath,
      name: '실측 도면 PDF',
    })
  }
  orderDocuments.forEach((doc) => items.push({ type: 'order', doc }))

  useEffect(() => {
    if (orderDocuments.length === 0) return
    const docIds = orderDocuments.filter((d) => d.thumbnail_path).map((d) => d.id)
    if (docIds.length === 0) return
    const unsub: (() => void)[] = []
    docIds.forEach((id) => {
      const doc = orderDocuments.find((d) => d.id === id)
      if (!doc?.thumbnail_path) return
      supabase.storage
        .from(ORDER_DOCUMENTS_BUCKET)
        .createSignedUrl(doc.thumbnail_path, THUMB_EXPIRES)
        .then(({ data }) => {
          if (data?.signedUrl) setThumbUrls((prev) => ({ ...prev, [id]: data.signedUrl }))
        })
    })
    return () => unsub.forEach((f) => f())
  }, [orderDocuments])

  const openPreview = (item: DocumentGalleryItem) => {
    if (item.type === 'measurement') {
      setLightboxSource({ type: 'measurement', path: item.path, name: item.name })
    } else {
      setLightboxSource({
        type: 'order',
        path: item.doc.storage_path,
        name: item.doc.file_name,
        fileType: item.doc.file_type,
      })
    }
  }

  const openTagEdit = (e: React.MouseEvent, doc: OrderDocument) => {
    e.stopPropagation()
    setTagEditDoc(doc)
    setTagEditValue(doc.product_tags.join(', '))
  }

  const saveProductTags = async () => {
    if (!tagEditDoc) return
    const tags = tagEditValue
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    const { error } = await supabase.from('order_documents').update({ product_tags: tags }).eq('id', tagEditDoc.id)
    if (!error) {
      setTagEditDoc(null)
      onUploadComplete?.()
    }
  }

  const handleDelete = async (e: React.MouseEvent, doc: OrderDocument) => {
    e.stopPropagation()
    if (!confirm(`"${doc.file_name}"을(를) 삭제할까요? Storage 파일과 DB 기록이 모두 삭제됩니다.`)) return
    setDeletingId(doc.id)
    try {
      const pathsToRemove: string[] = [doc.storage_path]
      if (doc.thumbnail_path && doc.thumbnail_path !== doc.storage_path) {
        pathsToRemove.push(doc.thumbnail_path)
      }
      const { error: storageErr } = await supabase.storage.from(ORDER_DOCUMENTS_BUCKET).remove(pathsToRemove)
      if (storageErr) console.warn('Storage 삭제:', storageErr)
      const { error: dbErr } = await supabase.from('order_documents').delete().eq('id', doc.id)
      if (dbErr) throw dbErr
      toast.success('삭제되었습니다.')
      onUploadComplete?.()
    } catch (err) {
      toast.error((err as Error).message ?? '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item, idx) => {
          if (item.type === 'measurement') {
            return (
              <button
                key="measurement"
                type="button"
                onClick={() => openPreview(item)}
                className="aspect-[4/3] rounded-lg border border-border bg-muted/40 hover:bg-muted/70 flex flex-col items-center justify-center gap-1.5 p-2 text-left transition-colors"
              >
                <Ruler className="h-8 w-8 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground truncate w-full text-center">{item.name}</span>
              </button>
            )
          }
          const doc = item.doc
          const thumb = doc.thumbnail_path ? thumbUrls[doc.id] : null
          const Icon = doc.file_type === 'pdf' ? FileText : Presentation
          return (
            <div key={doc.id} className="relative group">
              <button
                type="button"
                onClick={() => openPreview(item)}
                className="w-full aspect-[4/3] rounded-lg border border-border bg-muted/40 hover:bg-muted/70 overflow-hidden flex flex-col items-center justify-center gap-1 p-2 text-left transition-colors"
              >
                {thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover rounded flex-1 min-h-0" />
                ) : (
                  <Icon className="h-8 w-8 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground truncate w-full text-center">{doc.file_name}</span>
                {doc.product_tags.length > 0 && (
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                    {doc.product_tags.slice(0, 2).join(', ')}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => openTagEdit(e, doc)}
                className="absolute top-1 right-1 h-6 w-6 rounded bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                title="제품·규격 태그 편집 (제품별 시공 현장 리스트에 반영)"
              >
                <Tag className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(e, doc)}
                disabled={deletingId === doc.id}
                className="absolute top-1 left-1 h-6 w-6 rounded bg-destructive/90 text-destructive-foreground border border-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive disabled:opacity-50"
                title="삭제 (Storage + DB)"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed border-border">
          등록된 PDF/PPT 발주서가 없습니다.
        </p>
      )}
      <DocumentLightbox open={!!lightboxSource} onOpenChange={(open) => !open && setLightboxSource(null)} source={lightboxSource} />

      <Dialog open={!!tagEditDoc} onOpenChange={(open) => !open && setTagEditDoc(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>제품·규격 태그</DialogTitle>
          </DialogHeader>
          {tagEditDoc && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">쉼표로 구분하여 입력하면 제품별 시공 현장 리스트에 반영됩니다.</p>
              <Input
                value={tagEditValue}
                onChange={(e) => setTagEditValue(e.target.value)}
                placeholder="예: 스마트책장, 1200×600, 모번"
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setTagEditDoc(null)}>취소</Button>
                <Button type="button" size="sm" onClick={saveProductTags}>저장</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
