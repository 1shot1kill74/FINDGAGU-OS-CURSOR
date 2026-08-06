import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 0.5

type BlogImageItem = {
  src: string
  alt: string
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))))
}

function collectBlogImages(root: HTMLElement): BlogImageItem[] {
  return Array.from(root.querySelectorAll('img'))
    .map((img) => ({
      src: (img.currentSrc || img.src || '').trim(),
      alt: (img.alt || '').trim(),
    }))
    .filter((item) => Boolean(item.src))
}

function enhanceBlogImages(root: HTMLElement) {
  // 이전에 주입된 「확대 보기」 칩이 남아 있으면 제거
  root.querySelectorAll('[data-blog-zoom-btn]').forEach((el) => el.remove())

  root.querySelectorAll('img').forEach((img, index) => {
    img.setAttribute('tabindex', '0')
    img.setAttribute('role', 'button')
    const label = (img.alt || '사진').trim()
    img.setAttribute('aria-label', `${label} 클릭하여 확대`)
    img.dataset.blogImageIndex = String(index)
  })
}

type ShowroomCaseBlogHtmlProps = {
  html: string
  className?: string
}

/** 정본 블로그 HTML — 본문 이미지 클릭 → 라이트박스 줌 */
export function ShowroomCaseBlogHtml({ html, className }: ShowroomCaseBlogHtmlProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxItems, setLightboxItems] = useState<BlogImageItem[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [zoom, setZoom] = useState(ZOOM_MIN)

  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    enhanceBlogImages(root)
  }, [html])

  const openAt = useCallback((items: BlogImageItem[], index: number) => {
    if (items.length === 0) return
    setLightboxItems(items)
    setLightboxIndex(Math.max(0, Math.min(index, items.length - 1)))
    setZoom(ZOOM_MIN)
    setLightboxOpen(true)
  }, [])

  const openFromTarget = useCallback(
    (root: HTMLElement, target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      const img =
        target instanceof HTMLImageElement
          ? target
          : (target.closest('figure')?.querySelector('img') as HTMLImageElement | null)
      if (!img || !root.contains(img)) return false
      const imgs = Array.from(root.querySelectorAll('img'))
      const index = imgs.indexOf(img)
      if (index < 0) return false
      openAt(collectBlogImages(root), index)
      return true
    },
    [openAt],
  )

  const handleBodyClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (openFromTarget(event.currentTarget, event.target)) {
        event.preventDefault()
      }
    },
    [openFromTarget],
  )

  const handleBodyKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (openFromTarget(event.currentTarget, event.target)) {
        event.preventDefault()
      }
    },
    [openFromTarget],
  )

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev <= 0 ? lightboxItems.length - 1 : prev - 1))
    setZoom(ZOOM_MIN)
  }, [lightboxItems.length])

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev >= lightboxItems.length - 1 ? 0 : prev + 1))
    setZoom(ZOOM_MIN)
  }, [lightboxItems.length])

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goPrev()
      else if (event.key === 'ArrowRight') goNext()
      else if (event.key === '+' || event.key === '=') setZoom((z) => clampZoom(z + ZOOM_STEP))
      else if (event.key === '-' || event.key === '_') setZoom((z) => clampZoom(z - ZOOM_STEP))
      else if (event.key === '0') setZoom(ZOOM_MIN)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, lightboxOpen])

  const current = lightboxItems[lightboxIndex] ?? null
  const hasMultiple = lightboxItems.length > 1

  return (
    <>
      <div
        ref={bodyRef}
        className={cn(
          'showroom-canonical-blog-public max-w-none text-sm leading-relaxed text-neutral-700',
          '[&_h1]:mt-2 [&_h1]:mb-4 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-neutral-900',
          '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-neutral-900 [&_h2:first-child]:mt-0',
          '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-neutral-900',
          '[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-neutral-900',
          '[&_p]:mb-4 [&_p]:leading-[1.75] [&_p]:text-neutral-700',
          '[&_img]:max-h-96 [&_img]:w-full [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_img]:object-cover',
          '[&_img]:outline-none [&_img]:ring-offset-2 focus-visible:[&_img]:ring-2 focus-visible:[&_img]:ring-emerald-500',
          '[&_figure]:relative [&_figure]:my-6 [&_figure]:overflow-hidden [&_figure]:rounded-lg',
          className,
        )}
        role="presentation"
        onClick={handleBodyClick}
        onKeyDown={handleBodyKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <Dialog
        open={lightboxOpen}
        onOpenChange={(open) => {
          setLightboxOpen(open)
          if (!open) setZoom(ZOOM_MIN)
        }}
      >
        <DialogContent
          className="max-h-[96vh] w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] gap-0 overflow-hidden border-0 bg-neutral-950 p-0 text-white shadow-2xl"
          overlayClassName="bg-black/90"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 sm:px-4">
            <DialogTitle className="min-w-0 truncate text-sm font-semibold text-white">
              {current?.alt?.trim() || '사진 확대'}
              {hasMultiple ? (
                <span className="ml-2 font-normal text-white/60">
                  {lightboxIndex + 1} / {lightboxItems.length}
                </span>
              ) : null}
            </DialogTitle>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
              aria-label="닫기"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className={cn(
              'relative flex min-h-[50vh] items-center justify-center bg-black px-2 pb-20 pt-4 sm:px-12',
              zoom > 1 ? 'overflow-auto' : 'overflow-hidden',
            )}
            onWheel={(event) => {
              if (!event.ctrlKey && !event.metaKey) return
              event.preventDefault()
              setZoom((z) => clampZoom(z + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
            }}
          >
            {hasMultiple ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                  aria-label="이전 사진"
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                  aria-label="다음 사진"
                  onClick={goNext}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            ) : null}
            {current ? (
              <img
                src={current.src}
                alt={current.alt || '확대 사진'}
                className="max-h-[72vh] w-auto max-w-full origin-center object-contain transition-transform duration-150"
                style={{ transform: `scale(${zoom})` }}
              />
            ) : null}

            {/* 이미지 위 플로팅 줌 — 어두운 배경에서도 바로 보이게 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/25 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur-sm">
                <button
                  type="button"
                  aria-label="축소"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-35 hover:bg-white/10"
                >
                  <ZoomOut className="h-4 w-4" />
                  축소
                </button>
                <span className="min-w-14 text-center text-sm font-bold tabular-nums text-emerald-300">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="확대"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-600 px-5 text-sm font-bold text-white shadow disabled:opacity-35 hover:bg-emerald-500"
                >
                  <ZoomIn className="h-4 w-4" />
                  확대
                </button>
                <button
                  type="button"
                  aria-label="원래 크기"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom(ZOOM_MIN)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-35 hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="border-t border-white/10 px-4 py-2 text-center text-xs text-white/55">
            {hasMultiple ? '좌우 화살표로 다른 사진 · ' : ''}
            + / − 키로도 확대·축소
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
