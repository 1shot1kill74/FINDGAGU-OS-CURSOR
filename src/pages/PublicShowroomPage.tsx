/**
 * 맞춤형 공개 쇼룸 — 로그인 없이 토큰만으로 접근
 * /public/showroom?t=...
 * - 업종 스코프 + 현장(사이트) 개수 상한으로 결정 피로 완화
 * - "전체 현장 보기"로 같은 토큰 범위 내 전체 노출
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  fetchPublicShowroomAssetsByShareToken,
  resolveShowroomShare,
  type ResolvedShowroomShare,
} from '@/lib/showroomShareService'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { ChevronRight, Images, MessageCircle } from 'lucide-react'

function siteKey(asset: ShowroomImageAsset): string {
  return (asset.site_name?.trim() || asset.id).trim()
}

function pickHeroImage(images: ShowroomImageAsset[]): ShowroomImageAsset | null {
  if (images.length === 0) return null
  const main = images.find((i) => i.is_main)
  return main ?? images[0]
}

function buildSiteGroups(assets: ShowroomImageAsset[]): Array<{ key: string; images: ShowroomImageAsset[]; hero: ShowroomImageAsset | null }> {
  const visible = assets.filter((a) => a.before_after_role !== 'before')
  const map = new Map<string, ShowroomImageAsset[]>()
  for (const a of visible) {
    const key = siteKey(a)
    const list = map.get(key) ?? []
    list.push(a)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([key, images]) => ({
    key,
    images,
    hero: pickHeroImage(images),
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

  const siteGroups = useMemo(() => buildSiteGroups(assets), [assets])

  const canShowMore =
    !showAll && shareMeta != null && siteGroups.length >= shareMeta.preview_site_limit

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
        {siteGroups.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white/80 p-8 text-center text-sm text-stone-600">
            이 조건에 맞는 공개 사례가 아직 없습니다. 채팅으로 말씀해 주시면 담당자가 안내해 드립니다.
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {siteGroups.map(({ key, hero, images }) => {
              if (!hero) return null
              const thumb = hero.thumbnail_url || hero.cloudinary_url
              const label =
                hero.external_display_name?.trim() ||
                hero.canonical_site_name?.trim() ||
                hero.site_name?.trim() ||
                '시공 사례'
              const subtitle = [hero.location, hero.business_type].filter(Boolean).join(' · ')
              return (
                <li
                  key={key}
                  className="group rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden transition hover:border-amber-200/90 hover:shadow-md"
                >
                  <a href={hero.cloudinary_url} target="_blank" rel="noreferrer" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                    <div className="aspect-[4/3] bg-stone-200 relative overflow-hidden">
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 pt-10">
                        <p className="text-white text-sm font-medium drop-shadow-sm">{label}</p>
                        {subtitle ? <p className="text-white/85 text-xs mt-0.5 drop-shadow-sm">{subtitle}</p> : null}
                      </div>
                    </div>
                  </a>
                  <div className="px-4 py-3 flex items-center justify-between gap-2 border-t border-stone-100">
                    <span className="text-xs text-stone-500">사진 {images.length}장</span>
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

        <div className="mt-14 rounded-2xl border border-stone-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-3">
            <MessageCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-medium text-stone-900">추가로 궁금하신 점이 있나요?</p>
              <p className="text-sm text-stone-600 mt-1">받으신 채널(채팅·문자 등)로 편하게 회신해 주세요.</p>
            </div>
          </div>
          <Button asChild variant="secondary" className="shrink-0">
            <Link to="/contact">문의 페이지</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
