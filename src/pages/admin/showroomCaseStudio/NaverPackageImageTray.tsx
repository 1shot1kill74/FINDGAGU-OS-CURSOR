import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Copy, GripVertical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  attachNaverPackageImageDragData,
  copyNaverPackageImageToClipboard,
  fetchNaverPackageImageFile,
  type NaverPackageImageItem,
} from '@/lib/naverBlogPackageBuilder'
import { cn } from '@/lib/utils'

type ImageReadyState =
  | { status: 'loading' }
  | { status: 'ready'; file: File }
  | { status: 'error' }

function labelText(img: NaverPackageImageItem): string {
  if (img.label === 'before') return `Before · [이미지 ${img.index}]`
  if (img.label === 'after') return `After · [이미지 ${img.index}]`
  return `[이미지 ${img.index}]`
}

export function NaverPackageImageTray({ images }: { images: NaverPackageImageItem[] }) {
  const [readyByIndex, setReadyByIndex] = useState<Record<number, ImageReadyState>>({})
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [copyingIndex, setCopyingIndex] = useState<number | null>(null)

  const imageKey = useMemo(() => images.map((img) => `${img.index}:${img.url}`).join('|'), [images])

  useEffect(() => {
    if (images.length === 0) {
      setReadyByIndex({})
      return
    }
    let cancelled = false
    const initial: Record<number, ImageReadyState> = {}
    for (const img of images) initial[img.index] = { status: 'loading' }
    setReadyByIndex(initial)

    void Promise.all(
      images.map(async (img) => {
        try {
          const file = await fetchNaverPackageImageFile(img)
          if (cancelled) return
          setReadyByIndex((prev) => ({ ...prev, [img.index]: { status: 'ready', file } }))
        } catch {
          if (cancelled) return
          setReadyByIndex((prev) => ({ ...prev, [img.index]: { status: 'error' } }))
        }
      }),
    )

    return () => {
      cancelled = true
    }
  }, [imageKey, images])

  const readyCount = images.filter((img) => readyByIndex[img.index]?.status === 'ready').length
  const errorCount = images.filter((img) => readyByIndex[img.index]?.status === 'error').length

  function handleDragStart(event: DragEvent<HTMLDivElement>, img: NaverPackageImageItem) {
    const state = readyByIndex[img.index]
    if (state?.status !== 'ready') {
      event.preventDefault()
      toast.error(`[이미지 ${img.index}] 아직 불러오는 중입니다.`)
      return
    }
    attachNaverPackageImageDragData(event.dataTransfer, state.file)
    const thumb = event.currentTarget.querySelector('img')
    if (thumb) event.dataTransfer.setDragImage(thumb, 48, 36)
    setDraggingIndex(img.index)
  }

  async function handleCopy(img: NaverPackageImageItem) {
    const state = readyByIndex[img.index]
    if (state?.status !== 'ready') {
      toast.error(`[이미지 ${img.index}] 아직 불러오는 중입니다.`)
      return
    }
    setCopyingIndex(img.index)
    try {
      await copyNaverPackageImageToClipboard(state.file)
      toast.success(`[이미지 ${img.index}] 복사 완료. 에디터에 붙여넣으면 됩니다.`)
    } catch (err) {
      console.warn('image clipboard failed', err)
      toast.error(`[이미지 ${img.index}] 복사 실패. 끌어다 놓거나 zip을 받아 주세요.`)
    } finally {
      setCopyingIndex(null)
    }
  }

  if (images.length === 0) {
    return (
      <p className="mt-2 text-xs text-slate-500">
        정본에 이미지가 없습니다. 이미지 없이 본문만 발행하거나, 정본을 다시 만들어주세요.
      </p>
    )
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">이미지 · 끌어다 놓기</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        준비된 사진을 네이버 에디터의 <span className="font-medium text-slate-700">[이미지 N]</span> 자리로
        끌어다 놓거나, 복사한 뒤 붙여넣으세요.
        {readyCount === images.length
          ? ` ${readyCount}장 모두 준비됐습니다.`
          : ` ${readyCount}/${images.length}장 준비 중.`}
        {errorCount > 0 ? ` ${errorCount}장은 권한 문제로 끌어다 놓을 수 없습니다. zip을 받아 주세요.` : null}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img) => {
          const state = readyByIndex[img.index] ?? { status: 'loading' as const }
          const canDrag = state.status === 'ready'
          return (
            <li
              key={`${img.index}-${img.url}`}
              className={cn(
                'overflow-hidden rounded-xl border bg-slate-50',
                draggingIndex === img.index ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-100',
              )}
            >
              <div
                draggable={canDrag}
                onDragStart={(event) => handleDragStart(event, img)}
                onDragEnd={() => setDraggingIndex(null)}
                className={cn(
                  'relative aspect-[4/3] bg-slate-200 select-none',
                  canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                )}
              >
                <img
                  src={img.url}
                  alt={img.alt}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-cover"
                  loading="lazy"
                />
                <span
                  className={cn(
                    'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white',
                    img.label === 'before' ? 'bg-slate-900/80' : img.label === 'after' ? 'bg-emerald-700/85' : 'bg-slate-700/80',
                  )}
                >
                  {labelText(img)}
                </span>
                {canDrag ? (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                    <GripVertical className="h-3 w-3" aria-hidden />
                    끌기
                  </span>
                ) : null}
                {state.status === 'loading' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/25">
                    <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
                    <span className="sr-only">[이미지 {img.index}] 불러오는 중</span>
                  </div>
                ) : null}
                {state.status === 'error' ? (
                  <div className="absolute inset-0 flex items-end bg-slate-900/40 p-2">
                    <p className="text-[10px] font-medium text-white">끌어다 놓기 불가 · zip으로 받으세요</p>
                  </div>
                ) : null}
              </div>
              <div className="flex items-start justify-between gap-2 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-slate-800" title={img.caption}>
                    {img.caption}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500" title={img.filename}>
                    {img.filename}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 gap-1 px-2 text-[11px]"
                  disabled={!canDrag || copyingIndex === img.index}
                  aria-label={`[이미지 ${img.index}] 사진 복사`}
                  onClick={() => void handleCopy(img)}
                >
                  {copyingIndex === img.index ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  복사
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
