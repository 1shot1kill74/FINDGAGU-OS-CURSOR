import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ShowroomImageAsset } from '@/lib/imageAssetShowroom'

export type AdInboxPreviewMode = 'single' | 'compare'

/** Dialog 표시용 — 원본 대신 화면용 중간 해상도 (체감 로딩 ↓) */
const ENLARGE_TRANSFORM = 'w_1600,c_limit,f_auto,q_auto'

/** Cloudinary delivery URL에 변환을 끼워 넣거나 교체 */
export function withCloudinaryTransform(url: string, transform: string): string {
  const u = url.trim()
  const marker = '/image/upload/'
  const idx = u.indexOf(marker)
  if (idx < 0 || !transform.trim()) return u

  const after = u.slice(idx + marker.length)
  const firstSeg = after.split('/')[0] ?? ''
  const looksLikeTransform =
    firstSeg.includes(',') || /^(w_|h_|c_|f_|q_|e_|l_|t_)/.test(firstSeg)

  if (looksLikeTransform) {
    const rest = after.slice(firstSeg.length + (after.length > firstSeg.length ? 1 : 0))
    return `${u.slice(0, idx + marker.length)}${transform}/${rest}`
  }
  return `${u.slice(0, idx + marker.length)}${transform}/${after}`
}

/** 확대 보기용 — 원본 full 대신 w_1600급 (이미 그리드에 있는 썸네일과 별도 요청) */
export function getAdInboxFullPreviewUrl(
  asset: Pick<ShowroomImageAsset, 'cloudinary_url' | 'thumbnail_url'>,
): string {
  const original = asset.cloudinary_url?.trim() || ''
  if (original.includes('/image/upload/')) {
    return withCloudinaryTransform(original, ENLARGE_TRANSFORM)
  }
  return (original || asset.thumbnail_url?.trim() || '').trim()
}

function getAdInboxInstantPreviewUrl(
  asset: Pick<ShowroomImageAsset, 'cloudinary_url' | 'thumbnail_url'>,
): string {
  return (asset.thumbnail_url?.trim() || asset.cloudinary_url?.trim() || getAdInboxFullPreviewUrl(asset)).trim()
}

function prefetchUrl(url: string) {
  const href = url.trim()
  if (!href || typeof window === 'undefined') return
  const img = new Image()
  img.decoding = 'async'
  img.src = href
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: AdInboxPreviewMode
  assets: ShowroomImageAsset[]
  index: number
  onIndexChange: (index: number) => void
  beforeId: string | null
  afterId: string | null
  onPick: (asset: ShowroomImageAsset, slot: 'before' | 'after') => void
  /** 승격 후에도 쇼룸 대표 After를 다시 지정 */
  onSetMain?: (asset: ShowroomImageAsset) => void
  settingMain?: boolean
  /** 가져오기 Dialog 등 위에 띄울 때 */
  stackClassName?: string
  overlayStackClassName?: string
  /** 바깥 클릭으로 닫히지 않게 (중첩 Dialog용) */
  lockOutsideDismiss?: boolean
}

export default function AdInboxImagePreviewDialog({
  open,
  onOpenChange,
  mode,
  assets,
  index,
  onIndexChange,
  beforeId,
  afterId,
  onPick,
  onSetMain,
  settingMain = false,
  stackClassName = 'z-[100]',
  overlayStackClassName = 'z-[100]',
  lockOutsideDismiss = false,
}: Props) {
  const safeIndex = assets.length === 0 ? 0 : Math.min(Math.max(index, 0), assets.length - 1)
  const current = assets[safeIndex] ?? null
  const beforeAsset = beforeId ? assets.find((a) => a.id === beforeId) ?? null : null
  const afterAsset = afterId ? assets.find((a) => a.id === afterId) ?? null : null

  const goPrev = () => {
    if (assets.length < 2) return
    onIndexChange(safeIndex <= 0 ? assets.length - 1 : safeIndex - 1)
  }
  const goNext = () => {
    if (assets.length < 2) return
    onIndexChange(safeIndex >= assets.length - 1 ? 0 : safeIndex + 1)
  }

  useEffect(() => {
    if (!open || mode !== 'single' || assets.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, mode, assets.length, safeIndex])

  // 현재 장 선명본 + 이웃 장 prefetch (선택 장만, 전체 일괄 아님)
  useEffect(() => {
    if (!open || mode !== 'single' || !current) return
    prefetchUrl(getAdInboxFullPreviewUrl(current))
    if (assets.length < 2) return
    const prev = assets[safeIndex <= 0 ? assets.length - 1 : safeIndex - 1]
    const next = assets[safeIndex >= assets.length - 1 ? 0 : safeIndex + 1]
    if (prev) prefetchUrl(getAdInboxFullPreviewUrl(prev))
    if (next) prefetchUrl(getAdInboxFullPreviewUrl(next))
  }, [open, mode, current?.id, safeIndex, assets])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        className={`${stackClassName} max-h-[92vh] max-w-5xl overflow-hidden p-4 sm:p-5`}
        overlayClassName={overlayStackClassName}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={lockOutsideDismiss ? (e) => e.preventDefault() : undefined}
        onInteractOutside={lockOutsideDismiss ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">
            {mode === 'compare' ? 'Before / After 비교' : '사진 확대'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'compare'
              ? '선택한 Before·After를 나란히 확인합니다. 필요하면 닫은 뒤 그리드에서 다시 고르세요.'
              : '크게 보고 Before / After, 쇼룸 대표 After를 지정할 수 있습니다.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'compare' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ComparePane label="Before" tone="before" asset={beforeAsset} />
            <ComparePane label="After" tone="after" asset={afterAsset} />
          </div>
        ) : current ? (
          <div className="space-y-3">
            <div className="relative flex max-h-[70vh] items-center justify-center overflow-hidden rounded-xl bg-neutral-950">
              {assets.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="이전 사진"
                    className="absolute left-2 z-10 rounded-full bg-black/55 p-2 text-white hover:bg-black/75"
                    onClick={goPrev}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 사진"
                    className="absolute right-2 z-10 rounded-full bg-black/55 p-2 text-white hover:bg-black/75"
                    onClick={goNext}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}
              <ProgressivePreviewImage asset={current} />
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
                {safeIndex + 1} / {assets.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={beforeId === current.id ? 'default' : 'outline'}
                className={beforeId === current.id ? 'bg-amber-600 hover:bg-amber-600' : ''}
                onClick={() => onPick(current, 'before')}
              >
                Before로 지정
              </Button>
              <Button
                type="button"
                size="sm"
                variant={afterId === current.id ? 'default' : 'outline'}
                className={afterId === current.id ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
                onClick={() => onPick(current, 'after')}
              >
                After로 지정
              </Button>
              {onSetMain ? (
                <Button
                  type="button"
                  size="sm"
                  variant={current.is_main ? 'secondary' : 'outline'}
                  disabled={current.is_main || settingMain}
                  onClick={() => onSetMain(current)}
                >
                  {current.is_main ? '대표 After' : '대표로 지정'}
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                <X className="mr-1 h-3.5 w-3.5" />
                닫기
              </Button>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">표시할 사진이 없습니다.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProgressivePreviewImage({ asset }: { asset: ShowroomImageAsset }) {
  const instantUrl = getAdInboxInstantPreviewUrl(asset)
  const sharpUrl = getAdInboxFullPreviewUrl(asset)
  const [src, setSrc] = useState(instantUrl)
  const [sharpReady, setSharpReady] = useState(instantUrl === sharpUrl)

  useEffect(() => {
    setSrc(instantUrl)
    setSharpReady(instantUrl === sharpUrl)
    if (instantUrl === sharpUrl) return

    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      setSrc(sharpUrl)
      setSharpReady(true)
    }
    img.onerror = () => {
      if (cancelled) return
      setSharpReady(true)
    }
    img.src = sharpUrl
    return () => {
      cancelled = true
    }
  }, [asset.id, instantUrl, sharpUrl])

  return (
    <>
      <img
        key={asset.id}
        src={src}
        alt=""
        className={`max-h-[70vh] w-full object-contain transition-[filter] duration-200 ${
          sharpReady ? '' : 'blur-[1px]'
        }`}
      />
      {!sharpReady ? (
        <span className="absolute left-2 bottom-2 rounded bg-black/55 px-2 py-0.5 text-[10px] text-white">
          선명하게 불러오는 중…
        </span>
      ) : null}
    </>
  )
}

function ComparePane({
  label,
  tone,
  asset,
}: {
  label: string
  tone: 'before' | 'after'
  asset: ShowroomImageAsset | null
}) {
  const ring = tone === 'before' ? 'border-amber-300' : 'border-emerald-300'
  const badge = tone === 'before' ? 'bg-amber-600' : 'bg-emerald-600'
  const url = asset ? getAdInboxFullPreviewUrl(asset) : ''

  return (
    <div className={`overflow-hidden rounded-xl border ${ring} bg-neutral-50`}>
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${badge}`}>{label}</span>
        {!asset ? <span className="text-[11px] text-neutral-400">미선택</span> : null}
      </div>
      <div className="flex aspect-[4/3] items-center justify-center bg-neutral-900/90">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-neutral-400">사진을 선택하세요</span>
        )}
      </div>
    </div>
  )
}

/** 그리드 hover 시 선명본만 미리 받기 (선택 장 1개) */
export function prefetchAdInboxEnlarge(asset: Pick<ShowroomImageAsset, 'cloudinary_url' | 'thumbnail_url'>) {
  prefetchUrl(getAdInboxFullPreviewUrl(asset))
}
