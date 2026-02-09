/**
 * 견적서 품명 선택 시 시공 사례 이원화 갤러리
 * - 썸네일: Supabase / 클릭 시 고화질: Cloudinary
 */
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, ImageOff } from 'lucide-react'
import { useDualSourceGallery } from '@/hooks/useDualSourceGallery'

/** 이미지 로드 실패 시 대체용 (작은 회색 플레이스홀더, 외부 요청 없음) */
const FALLBACK_IMAGE_DATA =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect fill="#e5e7eb" width="200" height="120"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="12" font-family="sans-serif">이미지 없음</text></svg>')

interface EstimateRowGalleryDialogProps {
  productTag: string | null
  open: boolean
  onClose: () => void
  /** 로드 완료 시 데이터 유무 알림 (견적서에서 시공 버튼 활성화용) */
  onLoad?: (productTag: string, hasData: boolean) => void
}

export function EstimateRowGalleryDialog({
  productTag,
  open,
  onClose,
  onLoad,
}: EstimateRowGalleryDialogProps) {
  const { images, loading, error, selectedImage, openLightbox } = useDualSourceGallery(
    open ? productTag : null
  )
  const reportedRef = useRef(false)
  const [lightboxImageError, setLightboxImageError] = useState(false)

  useEffect(() => {
    if (!open || !productTag?.trim() || loading) return
    if (reportedRef.current) return
    reportedRef.current = true
    onLoad?.(productTag.trim(), images.length > 0)
  }, [open, productTag, loading, images.length, onLoad])

  useEffect(() => {
    if (!open) reportedRef.current = false
  }, [open])

  useEffect(() => {
    if (selectedImage) setLightboxImageError(false)
  }, [selectedImage])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 flex flex-row items-center justify-between gap-2">
          <DialogTitle className="text-base">
            시공 사례 — {productTag || '—'} (썸네일: Supabase / 클릭 시 Cloudinary 고화질)
          </DialogTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
          )}
          {error && (
            <p className="py-4 text-center text-sm text-destructive">{error}</p>
          )}
          {!loading && !error && images.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              해당 품목 시공 사례가 없습니다.
            </p>
          )}
          {!loading && images.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-4">
              {images.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    console.log('[EstimateRowGalleryDialog] 이미지 클릭 — image_url(highRes):', item.highResUrl, 'thumbnail_url:', item.thumbnailUrl, 'id:', item.id)
                    openLightbox(item)
                  }}
                  className="rounded-lg border border-border overflow-hidden bg-muted/30 hover:border-primary/50 aspect-[4/3]"
                >
                  <img
                    src={item.thumbnailUrl}
                    alt={item.displayName || item.projectTitle || '시공'}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 라이트박스: 클릭 시 고화질 — fixed로 전체 화면 덮어 확실히 표시 */}
        {selectedImage && (
          <div className="fixed inset-0 z-[100] flex flex-col bg-background/98 backdrop-blur items-center justify-center">
            <div className="absolute top-0 left-0 right-0 shrink-0 flex items-center justify-between p-2 border-b bg-background/95">
              <span className="text-sm font-medium truncate">
                {selectedImage.displayName || selectedImage.projectTitle || '고화질'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => openLightbox(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 w-full flex items-center justify-center p-4 pt-12">
              {lightboxImageError ? (
                <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <ImageOff className="h-16 w-16 opacity-50" />
                  <p className="text-sm font-medium">이미지를 불러올 수 없습니다.</p>
                  <img
                    src={FALLBACK_IMAGE_DATA}
                    alt=""
                    className="max-w-[200px] object-contain opacity-60"
                  />
                </div>
              ) : (
                <img
                  src={selectedImage.highResUrl}
                  alt=""
                  className="max-w-full max-h-[80vh] object-contain"
                  onError={() => setLightboxImageError(true)}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
