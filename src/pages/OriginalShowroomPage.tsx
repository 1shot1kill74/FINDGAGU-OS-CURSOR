import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink, Images, Search, X } from 'lucide-react'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { fetchShowroomImageAssets, getShowroomAssetGroupKey } from '@/lib/imageAssetService'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  getPreferredExternalDisplayName,
  getPreferredShowroomSiteName,
} from '@/pages/showroom/showroomPageGrouping'

type OriginalShowroomPageProps = {
  mode?: 'internal' | 'public'
}

type OriginalSiteGroup = {
  key: string
  siteName: string
  externalDisplayName: string | null
  businessTypes: string[]
  products: string[]
  colors: string[]
  location: string
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  latestCreatedAt: string | null
}

function buildOriginalSiteGroups(assets: ShowroomImageAsset[]): OriginalSiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()

  assets.forEach((asset) => {
    const key = getShowroomAssetGroupKey(asset)
    const list = bySite.get(key) ?? []
    list.push(asset)
    bySite.set(key, list)
  })

  return Array.from(bySite.entries())
    .map(([key, images]) => {
      const sortedImages = [...images].sort((a, b) => {
        const aMain = a.is_main ? 1 : 0
        const bMain = b.is_main ? 1 : 0
        if (aMain !== bMain) return bMain - aMain

        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })

      return {
        key,
        siteName: getPreferredShowroomSiteName(sortedImages),
        externalDisplayName: getPreferredExternalDisplayName(sortedImages),
        businessTypes: Array.from(new Set(sortedImages.map((image) => image.business_type?.trim()).filter(Boolean) as string[])),
        products: Array.from(new Set(sortedImages.map((image) => image.product_name?.trim()).filter(Boolean) as string[])),
        colors: Array.from(new Set(sortedImages.map((image) => image.color_name?.trim()).filter(Boolean) as string[])),
        location: sortedImages[0]?.location?.trim() ?? '',
        images: sortedImages,
        mainImage: sortedImages[0] ?? null,
        latestCreatedAt: sortedImages.find((image) => image.created_at)?.created_at ?? null,
      }
    })
    .sort((a, b) => {
      const aTime = a.latestCreatedAt ? new Date(a.latestCreatedAt).getTime() : 0
      const bTime = b.latestCreatedAt ? new Date(b.latestCreatedAt).getTime() : 0
      if (aTime !== bTime) return bTime - aTime
      if (a.images.length !== b.images.length) return b.images.length - a.images.length
      return a.siteName.localeCompare(b.siteName, 'ko')
    })
}

function WatermarkBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-white shadow-lg backdrop-blur-sm ${className}`}
    >
      FINDGAGU.COM
    </div>
  )
}

export default function OriginalShowroomPage({ mode = 'internal' }: OriginalShowroomPageProps) {
  const showInternalControls = mode === 'internal'
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTitle, setDetailTitle] = useState<string | null>(null)
  const [detailImages, setDetailImages] = useState<ShowroomImageAsset[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const list = showInternalControls
          ? await fetchShowroomImageAssets()
          : await fetchPublicShowroomAssets()

        if (!cancelled) {
          setAssets(list)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setAssets([])
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [showInternalControls])

  const siteGroups = useMemo(() => buildOriginalSiteGroups(assets), [assets])

  const filteredGroups = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    if (!needle) return siteGroups

    return siteGroups.filter((group) => (
      group.siteName.toLowerCase().includes(needle) ||
      (group.externalDisplayName ?? '').toLowerCase().includes(needle) ||
      group.location.toLowerCase().includes(needle) ||
      group.businessTypes.some((value) => value.toLowerCase().includes(needle)) ||
      group.products.some((value) => value.toLowerCase().includes(needle)) ||
      group.colors.some((value) => value.toLowerCase().includes(needle))
    ))
  }, [searchQuery, siteGroups])

  const totalPhotoCount = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.images.length, 0),
    [filteredGroups]
  )

  const baseShowroomPath = showInternalControls ? '/showroom' : '/public/showroom'

  const openDetail = (title: string, images: ShowroomImageAsset[]) => {
    setDetailTitle(title)
    setDetailImages(images)
    setLightboxIndex(0)
    setDetailOpen(true)
  }

  const goPrev = () => {
    setLightboxIndex((current) => (current - 1 + detailImages.length) % detailImages.length)
  }

  const goNext = () => {
    setLightboxIndex((current) => (current + 1) % detailImages.length)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">Original Archive</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 md:text-2xl">
                {showInternalControls ? '내부 원자료 쇼룸' : '원자료 쇼룸'}
              </h1>
              <p className="mt-1 text-sm text-neutral-600 md:text-base">
                비포어/애프터 카드로 묶기 전, 현장 단위 원자료를 그대로 확인하는 페이지입니다.
              </p>
            </div>
            <Link to={baseShowroomPath}>
              <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                <ExternalLink className="h-4 w-4" />
                기존 쇼룸으로 돌아가기
              </Button>
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="현장명, 업종, 지역, 제품명으로 검색"
                className="pl-9"
              />
            </div>
            <p className="text-sm text-neutral-500">
              {filteredGroups.length}개 현장 · 사진 {totalPhotoCount}장
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">확인 포인트</h2>
              <p className="text-sm text-neutral-600">
                이 화면은 픽셀에 워터마크를 새긴 결과물이 아니라, 화면 위에 CSS 배지를 덧씌운 수준인지 확인하기 위한 원자료 아카이브입니다.
              </p>
            </div>
            <Link
              to={baseShowroomPath}
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 transition hover:text-amber-800"
            >
              쇼룸 메인으로 돌아가기
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {filteredGroups.length === 0 ? (
          <p className="py-12 text-center text-neutral-500">검색 결과가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredGroups.map((group) => {
              const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''
              const displayLabel = group.externalDisplayName ?? group.siteName

              return (
                <div
                  key={group.key}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => openDetail(displayLabel, group.images)}
                    className="group flex h-full w-full flex-col text-left"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={displayLabel}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-400">대표 이미지 없음</div>
                      )}
                      <span className="absolute right-2 top-2 rounded-full bg-black/85 px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] text-white shadow-xl">
                        원자료
                      </span>
                      <WatermarkBadge />
                      {group.images.length > 1 && (
                        <div className="absolute bottom-2 right-2 flex gap-0.5" aria-hidden>
                          {group.images.slice(1, 4).map((image, index) => (
                            <div
                              key={image.id}
                              className="h-10 w-10 overflow-hidden rounded-md border-2 border-white bg-neutral-200 shadow-md"
                              style={{ transform: `translateY(${index * 2}px) rotate(${index * 3 - 2}deg)` }}
                            >
                              <img
                                src={image.thumbnail_url || image.cloudinary_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col p-4">
                      <div className="flex min-w-0 items-center gap-2">
                        {group.businessTypes[0] && (
                          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                            {group.businessTypes[0]}
                          </span>
                        )}
                        <p className="min-w-0 truncate text-[13px] font-medium leading-tight text-amber-600">{displayLabel}</p>
                      </div>

                      <dl className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
                        {group.location && (
                          <div className="flex gap-1.5">
                            <span className="shrink-0 text-neutral-400">지역</span>
                            <span>{group.location}</span>
                          </div>
                        )}
                        {group.businessTypes.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="shrink-0 text-neutral-400">업종</span>
                            <span>{group.businessTypes.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.products.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="shrink-0 text-neutral-400">제품명</span>
                            <span className="truncate">{group.products.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.colors.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="shrink-0 text-neutral-400">색상</span>
                            <span>{group.colors.slice(0, 4).join(', ')}</span>
                          </div>
                        )}
                      </dl>

                      <p className="mt-2 flex items-center gap-1.5 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
                        <Images className="h-3.5 w-3.5 shrink-0" />
                        <span>사진 {group.images.length}장</span>
                      </p>
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden border-0 bg-neutral-900 p-0">
          <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
            <DialogTitle className="truncate font-semibold text-white">{detailTitle}</DialogTitle>
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {detailImages.length === 0 ? (
              <p className="py-8 text-center text-neutral-500">사진이 없습니다.</p>
            ) : (
              <div className="relative flex min-h-[60vh] items-center justify-center">
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  aria-label="이전"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div className="relative inline-block max-w-full">
                  <img
                    src={detailImages[lightboxIndex]?.cloudinary_url || detailImages[lightboxIndex]?.thumbnail_url || ''}
                    alt=""
                    className="block max-h-[70vh] max-w-full rounded-lg object-contain"
                  />
                  <WatermarkBadge className="bottom-3 left-3" />
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  aria-label="다음"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
          {detailImages.length > 0 && (
            <div className="border-t border-neutral-700 px-4 py-2 text-center text-sm text-neutral-500">
              {lightboxIndex + 1} / {detailImages.length}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
