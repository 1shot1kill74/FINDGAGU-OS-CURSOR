import type { SiteGroup } from '@/features/지능형쇼룸홈페이지/useShowroomHomepageData'

interface RenewalSectionProps {
  beforeAfterSites: SiteGroup[]
  onOpenSite: (site: SiteGroup, startFrom?: 'before' | 'after' | 'main') => void
}

export default function RenewalSection({ beforeAfterSites, onOpenSite }: RenewalSectionProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-2 md:px-8">
      <div className="rounded-[32px] border border-emerald-400/20 bg-emerald-400/8 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-200/80">Renewal Logic</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">리뉴얼은 결과보다 변화 논리가 더 중요합니다</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-stone-200">
            Before가 있는 현장을 우선 선별하면, "예쁘다"가 아니라 "왜 이 시공이 필요했는가"를 설명하기 쉬워집니다.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {beforeAfterSites.length > 0 ? (
            beforeAfterSites.map((site) => {
              const beforeImage = site.images.find((image) => image.before_after_role === 'before')
              const afterImage = site.images.find((image) => image.before_after_role === 'after') ?? site.mainImage
              return (
                <button
                  key={`before-after-${site.siteName}`}
                  type="button"
                  onClick={() => onOpenSite(site, 'before')}
                  className="overflow-hidden rounded-[28px] border border-white/10 bg-stone-950/40 text-left transition hover:border-emerald-300/40"
                >
                  <div className="grid grid-cols-2">
                    <div className="relative aspect-[4/3] bg-stone-800">
                      <div className="absolute ml-3 mt-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
                        Before
                      </div>
                      {beforeImage ? (
                        <img src={beforeImage.thumbnail_url || beforeImage.cloudinary_url} alt={`${site.siteName} before`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-stone-400">Before 없음</div>
                      )}
                    </div>
                    <div className="relative aspect-[4/3] bg-stone-800">
                      <div className="absolute ml-3 mt-3 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[11px] font-medium text-white">
                        After
                      </div>
                      {afterImage ? (
                        <img src={afterImage.thumbnail_url || afterImage.cloudinary_url} alt={`${site.siteName} after`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-stone-400">After 없음</div>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-base font-semibold text-white">{site.siteName}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      {site.profile.painPoint}
                    </p>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-3xl border border-white/10 bg-stone-950/40 p-5 text-sm text-stone-300">
              아직 Before/After로 묶인 대표 사례가 충분하지 않습니다. 메인 홈페이지 공개 전에는 이 자산부터 선별하는 것이 좋습니다.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
