/**
 * 맞춤형 공개 쇼룸 — 로그인 없이 토큰만으로 접근
 * /public/showroom?t=...
 * - 업종 스코프 + 현장(사이트) 개수 상한으로 결정 피로 완화
 * - "전체 현장 보기"로 같은 토큰 범위 내 전체 노출
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  fetchPublicShowroomAssetsByShareToken,
  resolveShowroomShare,
  type ResolvedShowroomShare,
} from '@/lib/showroomShareService'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { ArrowLeft, ChevronLeft, ChevronRight, Images, MessageCircle } from 'lucide-react'

function siteKey(asset: ShowroomImageAsset): string {
  return (asset.site_name?.trim() || asset.id).trim()
}

function sortDetailImages(images: ShowroomImageAsset[]): ShowroomImageAsset[] {
  return [...images].sort((a, b) => {
    const order = (role: ShowroomImageAsset['before_after_role']) => {
      if (role === 'before') return 0
      if (role === 'after') return 1
      return 2
    }

    const roleDiff = order(a.before_after_role) - order(b.before_after_role)
    if (roleDiff !== 0) return roleDiff
    if (a.is_main !== b.is_main) return a.is_main ? -1 : 1
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return aTime - bTime
  })
}

function pickHeroImage(images: ShowroomImageAsset[]): ShowroomImageAsset | null {
  if (images.length === 0) return null
  const main = images.find((i) => i.is_main)
  return main ?? images[0]
}

function assetLabel(asset: ShowroomImageAsset): string {
  return (
    asset.external_display_name?.trim() ||
    asset.canonical_site_name?.trim() ||
    asset.site_name?.trim() ||
    '시공 사례'
  )
}

function findPreferredImageIndex(
  images: ShowroomImageAsset[],
  role: ShowroomImageAsset['before_after_role'] | 'main',
): number {
  if (images.length === 0) return 0
  if (role === 'main') {
    const mainIndex = images.findIndex((image) => image.is_main)
    return mainIndex >= 0 ? mainIndex : 0
  }
  const roleIndex = images.findIndex((image) => image.before_after_role === role)
  return roleIndex >= 0 ? roleIndex : 0
}

function buildSiteGroups(
  assets: ShowroomImageAsset[],
  options?: { excludeBefore?: boolean },
): Array<{ key: string; images: ShowroomImageAsset[]; hero: ShowroomImageAsset | null; hasBeforeAfter: boolean }> {
  const visible = options?.excludeBefore ? assets.filter((a) => a.before_after_role !== 'before') : assets
  const map = new Map<string, ShowroomImageAsset[]>()
  for (const a of visible) {
    const key = siteKey(a)
    const list = map.get(key) ?? []
    list.push(a)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([key, images]) => ({
    key,
    images: sortDetailImages(images),
    hero: pickHeroImage(images),
    hasBeforeAfter:
      images.some((image) => image.before_after_role === 'before') &&
      images.some((image) => image.before_after_role === 'after'),
  }))
}

export default function PublicShowroomPage() {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('t')?.trim() ?? '', [searchParams])

  const [shareMeta, setShareMeta] = useState<ResolvedShowroomShare | null>(null)
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSiteKey, setSelectedSiteKey] = useState<string | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  const load = useCallback(
    async (includeAll: boolean) => {
      if (!token) {
        setShareMeta(null)
        setAssets([])
        setLoading(false)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const meta = await resolveShowroomShare(token)
        if (!meta) {
          setShareMeta(null)
          setAssets([])
          setError('링크가 만료되었거나 잘못되었습니다.')
          return
        }
        setShareMeta(meta)
        const list = await fetchPublicShowroomAssetsByShareToken(token, { includeAll })
        setAssets(list)
        setShowAll(includeAll)
        setSelectedSiteKey(null)
        setSelectedImageIndex(0)
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.')
        setShareMeta(null)
        setAssets([])
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const allSiteGroups = useMemo(() => buildSiteGroups(assets), [assets])
  const siteGroups = useMemo(() => buildSiteGroups(assets, { excludeBefore: true }), [assets])
  const beforeAfterGroups = useMemo(
    () => allSiteGroups.filter((group) => group.hasBeforeAfter),
    [allSiteGroups],
  )
  const selectedSite = useMemo(
    () => allSiteGroups.find((group) => group.key === selectedSiteKey) ?? null,
    [selectedSiteKey, allSiteGroups],
  )
  const selectedImage = selectedSite?.images[selectedImageIndex] ?? null

  const canShowMore =
    !showAll && shareMeta != null && siteGroups.length >= shareMeta.preview_site_limit

  const openSiteDetail = useCallback(
    (key: string, startFrom: ShowroomImageAsset['before_after_role'] | 'main' = 'main') => {
      const targetGroup = allSiteGroups.find((group) => group.key === key)
      setSelectedSiteKey(key)
      setSelectedImageIndex(findPreferredImageIndex(targetGroup?.images ?? [], startFrom))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [allSiteGroups],
  )

  const closeSiteDetail = useCallback(() => {
    setSelectedSiteKey(null)
    setSelectedImageIndex(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const showPrevImage = useCallback(() => {
    setSelectedImageIndex((prev) => {
      if (!selectedSite || selectedSite.images.length === 0) return 0
      return prev === 0 ? selectedSite.images.length - 1 : prev - 1
    })
  }, [selectedSite])

  const showNextImage = useCallback(() => {
    setSelectedImageIndex((prev) => {
      if (!selectedSite || selectedSite.images.length === 0) return 0
      return prev === selectedSite.images.length - 1 ? 0 : prev + 1
    })
  }, [selectedSite])

  if (!token) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-6 text-center">
        <Images className="h-10 w-10 text-stone-400 mb-3" aria-hidden />
        <h1 className="text-lg font-semibold text-stone-900">쇼룸 링크가 없습니다</h1>
        <p className="mt-2 text-sm text-stone-600 max-w-md">주소에 토큰이 포함되어 있는지 확인해 주세요.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-sm text-stone-500">맞춤 사례를 불러오는 중…</p>
      </div>
    )
  }

  if (error || !shareMeta) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-6 text-center">
        <Images className="h-10 w-10 text-amber-600/70 mb-3" aria-hidden />
        <h1 className="text-lg font-semibold text-stone-900">쇼룸을 열 수 없습니다</h1>
        <p className="mt-2 text-sm text-stone-600 max-w-md">{error ?? '유효한 공유 링크가 아닙니다.'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-8 md:px-8 md:py-10">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-800/90 mb-2">맞춤 시공사례</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">{shareMeta.title}</h1>
          <p className="mt-3 text-sm md:text-base text-stone-600 leading-relaxed">{shareMeta.description}</p>
          {shareMeta.industry_scope ? (
            <p className="mt-4 text-sm text-stone-700">
              <span className="font-medium text-stone-800">{shareMeta.industry_scope}</span> 업종 사례 위주로 먼저
              모아 두었습니다. 결정이 필요할 때만 천천히 보셔도 됩니다.
            </p>
          ) : (
            <p className="mt-4 text-sm text-stone-700">
              먼저 핵심 현장 위주로만 보여 드립니다. 더 보기를 누르면 같은 링크로 범위 안의 전체 현장을 볼 수 있습니다.
            </p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 md:px-8 md:pb-14">
        {selectedSite && selectedImage ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="px-0 text-stone-700 hover:text-stone-950"
                onClick={closeSiteDetail}
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                사례 목록으로
              </Button>
              <p className="text-xs text-stone-500">
                {selectedImageIndex + 1} / {selectedSite.images.length}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="aspect-[4/3] bg-stone-100">
                <img
                  src={selectedImage.cloudinary_url}
                  alt={assetLabel(selectedImage)}
                  className="h-full w-full object-contain bg-stone-100"
                />
              </div>
              <div className="border-t border-stone-100 px-5 py-4">
                <p className="text-lg font-semibold text-stone-900">{assetLabel(selectedImage)}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {[selectedImage.location, selectedImage.business_type, selectedImage.product_name]
                    .filter(Boolean)
                    .join(' · ') || '현장 사진'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-stone-300 bg-white"
                onClick={showPrevImage}
              >
                <ChevronLeft className="mr-2 h-4 w-4" aria-hidden />
                이전 사진
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-stone-300 bg-white"
                onClick={showNextImage}
              >
                다음 사진
                <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-stone-900">전체 사진</h2>
                <span className="text-xs text-stone-500">썸네일을 눌러 크게 볼 수 있습니다.</span>
              </div>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {selectedSite.images.map((image, index) => {
                  const thumb = image.thumbnail_url || image.cloudinary_url
                  const active = index === selectedImageIndex
                  return (
                    <li key={`${selectedSite.key}-${image.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedImageIndex(index)}
                        className={`w-full overflow-hidden rounded-2xl border bg-white text-left transition ${
                          active
                            ? 'border-amber-500 ring-2 ring-amber-200'
                            : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div className="aspect-square bg-stone-100">
                          <img
                            src={thumb}
                            alt={assetLabel(image)}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          </section>
        ) : siteGroups.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white/80 p-8 text-center text-sm text-stone-600">
            이 조건에 맞는 공개 사례가 아직 없습니다. 채팅으로 말씀해 주시면 담당자가 안내해 드립니다.
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {siteGroups.map(({ key, hero, images }) => {
              if (!hero) return null
              const thumb = hero.thumbnail_url || hero.cloudinary_url
              const label = assetLabel(hero)
              const subtitle = [hero.location, hero.business_type].filter(Boolean).join(' · ')
              return (
                <li
                  key={key}
                  className="group rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden transition hover:border-amber-200/90 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => openSiteDetail(key, 'after')}
                    className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <div className="aspect-[4/3] bg-stone-200 relative overflow-hidden">
                      <img
                        src={thumb}
                        alt={label}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 pt-10">
                        <p className="text-white text-sm font-medium drop-shadow-sm">{label}</p>
                        {subtitle ? <p className="text-white/85 text-xs mt-0.5 drop-shadow-sm">{subtitle}</p> : null}
                      </div>
                    </div>
                  </button>
                  <div className="px-4 py-3 flex items-center justify-between gap-2 border-t border-stone-100">
                    <span className="text-xs text-stone-500">사진 {images.length}장 보기</span>
                    <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" aria-hidden />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {canShowMore ? (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 bg-white text-amber-950 hover:bg-amber-50"
              onClick={() => void load(true)}
            >
              전체 현장 보기
            </Button>
            <p className="text-xs text-stone-500 text-center max-w-sm">
              처음에는 선택이 쉽도록 일부만 보여 드립니다. 더 보기에서 같은 조건의 나머지 현장을 확인할 수 있어요.
            </p>
          </div>
        ) : null}

        {beforeAfterGroups.length > 0 && !selectedSite ? (
          <section className="mt-14 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-amber-800/90 mb-2">전후 변화로 보는 사례</p>
              <h2 className="text-xl font-semibold tracking-tight text-stone-900">비포어/애프터 시공 사례</h2>
              <p className="mt-2 text-sm text-stone-600">
                업종에 맞는 사례를 먼저 보셨다면, 아래 전후 비교 사례에서 실제 변화 폭을 확인해 보세요.
              </p>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2">
              {beforeAfterGroups.map(({ key, hero, images }) => {
                if (!hero) return null
                const label = assetLabel(hero)
                const beforeImages = images.filter((image) => image.before_after_role === 'before')
                const afterImages = images.filter((image) => image.before_after_role === 'after')
                const beforeImage = beforeImages[0] ?? null
                const afterImage = afterImages.find((image) => image.is_main) ?? afterImages[0] ?? null
                if (!beforeImage || !afterImage) return null
                const subtitle = [hero.location, hero.business_type].filter(Boolean).join(' · ')
                return (
                  <li
                    key={`before-after-${key}`}
                    className="group overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => openSiteDetail(key, 'before')}
                      className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <div className="grid grid-cols-2">
                        <div className="relative aspect-[4/3] bg-stone-100">
                          <img
                            src={beforeImage.thumbnail_url || beforeImage.cloudinary_url}
                            alt={`${label} before`}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                            Before
                          </span>
                        </div>
                        <div className="relative aspect-[4/3] bg-stone-100">
                          <img
                            src={afterImage.thumbnail_url || afterImage.cloudinary_url}
                            alt={`${label} after`}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
                            After
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="border-t border-stone-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900">{label}</p>
                          {subtitle ? <p className="mt-1 text-xs text-stone-500">{subtitle}</p> : null}
                          <p className="mt-2 text-sm text-stone-600">
                            전후 비교가 가능한 리뉴얼 사례입니다. 눌러서 Before부터 전체 사진을 확인해 보세요.
                          </p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <div className="mt-14 rounded-2xl border border-stone-200 bg-white p-6 flex flex-col gap-4">
          <div className="flex gap-3">
            <MessageCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-medium text-stone-900">마음에 드는 사례가 있으면 이 채팅에 바로 회신해 주세요.</p>
              <p className="text-sm text-stone-600 mt-1">
                사례명 예시: <span className="font-medium text-stone-800">2512 서울 목동 관리형 9242</span> 또는{' '}
                <span className="font-medium text-stone-800">관리형 9242</span> 처럼 남겨 주시면, 비슷한 방향으로
                이어서 상담 도와드리겠습니다.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
