import { CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildCompactCaseLabel,
  buildConceptContactUrl,
  buildSiteFactChips,
  type ConcernCard,
  type SiteGroup,
} from '@/features/지능형쇼룸홈페이지/useShowroomHomepageData'

interface FeaturedSitesSectionProps {
  selectedConcern: ConcernCard
  filteredSites: SiteGroup[]
  onOpenSite: (site: SiteGroup, startFrom?: 'before' | 'after' | 'main') => void
}

export default function FeaturedSitesSection({
  selectedConcern,
  filteredSites,
  onOpenSite,
}: FeaturedSitesSectionProps) {
  return (
    <section id="featured-sites" className="mx-auto max-w-7xl px-4 py-2 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Featured Sites</p>
          <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{selectedConcern.title}에 맞는 대표 현장</h2>
        </div>
        <p className="text-sm text-stone-300">관심 있는 현장을 열면 좌석 규모, 예산대, 해결 포인트까지 함께 볼 수 있습니다.</p>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredSites.map((site) => {
          const imageUrl = site.mainImage?.thumbnail_url || site.mainImage?.cloudinary_url || ''
          return (
            <article key={site.siteName} className="overflow-hidden rounded-[28px] border border-white/10 bg-[#181412]">
              <div className="aspect-[4/3] bg-stone-800">
                {imageUrl ? (
                  <img src={imageUrl} alt={site.siteName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-stone-400">대표 이미지 없음</div>
                )}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {site.businessTypes.slice(0, 2).map((businessType) => (
                    <span key={`${site.siteName}-${businessType}`} className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-stone-200">
                      {businessType}
                    </span>
                  ))}
                  {site.hasBeforeAfter && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-200">
                      리뉴얼 설명 가능
                    </span>
                  )}
                </div>

                <h3 className="mt-4 text-lg font-semibold text-white">{site.siteName}</h3>
                <p className="mt-1 text-xs font-medium text-amber-200">{buildCompactCaseLabel(site.siteName)}</p>
                <p className="mt-2 text-sm leading-6 text-stone-300">
                  {site.location || '지역 미지정'}에서 진행된 사례입니다. {site.products[0] ? `${site.products[0]} 중심으로 ` : ''}공간 분위기와 운영 흐름을 함께 설명하기 좋은 현장입니다.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {buildSiteFactChips(site).map((chip) => (
                    <span
                      key={`${site.siteName}-${chip}`}
                      className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-medium text-amber-100"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                <ul className="mt-4 space-y-2 text-xs text-stone-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    {site.profile.seatCountBand} · {site.profile.areaPyeongBand}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    예산 기준: {site.profile.budgetBand}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    주력 제품: {site.products.slice(0, 3).join(', ') || '분류 전'}
                  </li>
                </ul>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => onOpenSite(site, 'after')}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    사례 보기
                  </button>
                  <Link
                    to={buildConceptContactUrl(site, selectedConcern)}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
                  >
                    이 사례 기준 상담
                  </Link>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
