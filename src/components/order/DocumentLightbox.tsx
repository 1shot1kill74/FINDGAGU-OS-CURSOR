/**
 * 발주서/실측 PDF 퀵뷰 라이트박스 — 다운로드 없이 웹에서 즉시 확인
 * PDF: iframe으로 표시, PPT: 썸네일/아이콘 + 다운로드 버튼
 */
import { useEffect, useState } from 'react'
import { X, Download, FileText, Presentation } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const ORDER_DOCUMENTS_BUCKET = 'order-documents'
const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'
export const ESTIMATE_FILES_BUCKET = 'estimate-files'
const SIGNED_URL_EXPIRES = 3600

export type LightboxSource =
  | { type: 'measurement'; path: string; name: string }
  | { type: 'order'; path: string; name: string; fileType: 'pdf' | 'ppt' | 'pptx' }
  | { type: 'estimate'; path: string; name: string; fileType: 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' }

interface DocumentLightboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: LightboxSource | null
}

export function DocumentLightbox({ open, onOpenChange, source }: DocumentLightboxProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bucket =
    source?.type === 'measurement'
      ? MEASUREMENT_DRAWINGS_BUCKET
      : source?.type === 'estimate'
        ? ESTIMATE_FILES_BUCKET
        : ORDER_DOCUMENTS_BUCKET
  const path =
    source?.type === 'measurement' ? source.path : source?.type === 'order' || source?.type === 'estimate' ? source.path : ''
  const isPdf =
    source?.type === 'order'
      ? source.fileType === 'pdf'
      : source?.type === 'estimate'
        ? source.fileType === 'pdf'
        : true
  const isImage = source?.type === 'estimate' && ['png', 'jpg', 'jpeg', 'webp'].includes(source.fileType)
  const isPpt = source?.type === 'order' && source.fileType !== 'pdf'
  const name = source?.name ?? '문서'

  useEffect(() => {
    if (!open || !path) {
      setSignedUrl(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_EXPIRES)
      .then(({ data, error: err }) => {
        setLoading(false)
        if (err) {
          setError('미리보기를 불러올 수 없습니다.')
          return
        }
        setSignedUrl(data?.signedUrl ?? null)
      })
  }, [open, bucket, path])

  const handleDownload = () => {
    if (signedUrl) {
      const a = document.createElement('a')
      a.href = signedUrl
      a.download = name
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[90vw] w-full max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0"
        overlayClassName="bg-black/90"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <DialogTitle className="text-base font-medium truncate pr-4">{name}</DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            {signedUrl && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                다운로드
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)} aria-label="닫기">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-muted/30 p-4">
          {loading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {signedUrl && isPdf && (
            <iframe
              src={signedUrl}
              title={name}
              className="w-full flex-1 min-h-[70vh] rounded border border-border bg-background"
            />
          )}
          {signedUrl && isImage && (
            <img
              src={signedUrl}
              alt={name}
              className="max-w-full max-h-[80vh] object-contain rounded border border-border bg-background"
            />
          )}
          {signedUrl && isPpt && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Presentation className="h-16 w-16 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">PPT 파일은 브라우저에서 바로 보기가 제한됩니다.</p>
              <Button type="button" variant="default" className="gap-2" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                다운로드하여 보기
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
