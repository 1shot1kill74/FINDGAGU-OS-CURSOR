import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildCompactCaseLabel,
  buildSiteFactChips,
  type SiteGroup,
} from '@/features/지능형쇼룸홈페이지/useShowroomHomepageData'

interface HeroSectionProps {
  heroSites: SiteGroup[]
  heroBackground: string
  onOpenSite: (site: SiteGroup, startFrom?: 'before' | 'after' | 'main') => void
}

export default function HeroSection({ heroSites, heroBackground, onOpenSite }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0">
        {heroBackground ? (
          <img src={heroBackground} alt="" className="h-full w-full object-cover opacity-30" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_45%),linear-gradient(180deg,#1c1917,#0c0a09)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/90 to-stone-950/65" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-stone-200">
              <Sparkles className="h-3.5 w-3.5" />
              실제 시공사례 기반 안내
            </p>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-5xl">
              제품보다 먼저,
              <br />
              완성된 현장을 보여드리는 쇼룸형 홈페이지
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300 md:text-base">
              파인드가구는 어떤 제품이 있는지보다, 실제로 어떤 공간 결과를 만들었는지부터 보여드립니다.
              비슷한 사례를 먼저 보고, 필요한 경우에만 좌석 수, 예산대, 리뉴얼 포인트 같은 추가 정보를 이어서 확인하실 수 있습니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#featured-sites"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
              >
                대표 사례 바로 보기
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/contact?category=대표%20사례%20상담"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                사례 기반 상담 요청
              </Link>
            </div>

            <div className="mt-8 grid gap-3 text-sm text-stone-300 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-stone-400">기준 1</p>
                <p className="mt-1 font-medium text-white">대표 현장 중심</p>
                <p className="mt-2 text-xs leading-6">강한 사례를 먼저 보여주고, 제품은 결과를 구성하는 요소로 연결합니다.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-stone-400">기준 2</p>
                <p className="mt-1 font-medium text-white">리뉴얼 설득 강화</p>
                <p className="mt-2 text-xs leading-6">Before/After 또는 운영상 개선 포인트가 있는 사례를 우선 사용합니다.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-stone-400">기준 3</p>
                <p className="mt-1 font-medium text-white">필요한 정보만 후속 안내</p>
                <p className="mt-2 text-xs leading-6">같은 내용을 반복해서 보내기보다, 관심 사례를 남기시면 필요한 정보만 이어서 설명드립니다.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {heroSites.map((site) => {
              const imageUrl = site.mainImage?.thumbnail_url || site.mainImage?.cloudinary_url || ''
              return (
                <button
                  key={site.siteName}
                  type="button"
                  onClick={() => onOpenSite(site, 'after')}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 text-left transition hover:border-white/20"
                >
                  <div className="aspect-[4/3] bg-stone-800">
                    {imageUrl ? (
                      <img src={imageUrl} alt={site.siteName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-stone-400">대표 이미지 없음</div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {site.businessTypes[0] && (
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-stone-200">
                          {site.businessTypes[0]}
                        </span>
                      )}
                      {site.hasBeforeAfter && (
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] text-emerald-200">
                          Before / After
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">{site.siteName}</p>
                    <p className="mt-1 text-xs text-stone-300">{buildCompactCaseLabel(site.siteName)}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {site.location || '지역 미지정'} · 사진 {site.images.length}장
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {buildSiteFactChips(site).map((chip) => (
                        <span
                          key={`${site.siteName}-${chip}`}
                          className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-stone-200"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
