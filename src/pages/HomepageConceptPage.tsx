import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Images, Sparkles } from 'lucide-react'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/imageAssetService'

type ConcernId = 'all' | 'management' | 'renewal' | 'academy' | 'school'

type ConcernCard = {
  id: ConcernId
  title: string
  summary: string
  industryKeywords: string[]
  category: string
}

interface SiteGroup {
  siteName: string
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  hasBeforeAfter: boolean
}

const CONCERN_CARDS: ConcernCard[] = [
  {
    id: 'all',
    title: '대표 사례 전체 보기',
    summary: '주력 현장을 중심으로 파인드가구의 결과물을 빠르게 확인합니다.',
    industryKeywords: [],
    category: '대표 사례',
  },
  {
    id: 'management',
    title: '관리형 창업 또는 전환',
    summary: '관리 동선과 좌석 운영이 중요한 공간을 우선 보여줍니다.',
    industryKeywords: ['관리형', '스터디카페'],
    category: '관리형 창업',
  },
  {
    id: 'renewal',
    title: '리뉴얼 설득 사례',
    summary: 'Before/After 또는 전환 포인트가 있는 사례를 우선 노출합니다.',
    industryKeywords: ['스터디카페', '아파트'],
    category: '리뉴얼 상담',
  },
  {
    id: 'academy',
    title: '학원 자습실 기획',
    summary: '학원 운영과 학습 몰입 관점에서 설명하기 좋은 사례를 모읍니다.',
    industryKeywords: ['학원'],
    category: '학원 자습실 문의',
  },
  {
    id: 'school',
    title: '학교 공간 구축',
    summary: '학교, 고교학점제, 공공성 있는 공간 사례를 우선 보여줍니다.',
    industryKeywords: ['학교'],
    category: '고교학점제 행정 상담',
  },
]

function buildSiteGroups(assets: ShowroomImageAsset[]): SiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()
  for (const asset of assets) {
    const siteName = (asset.site_name ?? '').trim()
    if (!siteName) continue
    const list = bySite.get(siteName) ?? []
    list.push(asset)
    bySite.set(siteName, list)
  }

  return Array.from(bySite.entries())
    .map(([siteName, images]) => {
      const businessTypes = Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[]))
      const products = Array.from(new Set(images.map((image) => image.product_name?.trim()).filter(Boolean) as string[]))
      const colors = Array.from(new Set(images.map((image) => image.color_name?.trim()).filter(Boolean) as string[]))
      const mainImage = images.find((image) => image.is_main) ?? images[0] ?? null
      const hasBefore = images.some((image) => image.before_after_role === 'before')
      const hasAfter = images.some((image) => image.before_after_role === 'after')
      return {
        siteName,
        location: images[0]?.location?.trim() ?? '',
        businessTypes,
        products,
        colors,
        images,
        mainImage,
        hasBeforeAfter: hasBefore && hasAfter,
      }
    })
    .sort((a, b) => {
      const scoreA = Number(a.hasBeforeAfter) * 100 + a.images.length
      const scoreB = Number(b.hasBeforeAfter) * 100 + b.images.length
      return scoreB - scoreA
    })
}

function matchesConcern(group: SiteGroup, concern: ConcernCard): boolean {
  if (concern.id === 'all') return true
  const industryText = `${group.businessTypes.join(' ')} ${group.products.join(' ')}`.toLowerCase()
  return concern.industryKeywords.some((keyword) => industryText.includes(keyword.toLowerCase()))
}

function buildConceptContactUrl(group: SiteGroup, concern: ConcernCard): string {
  const query = new URLSearchParams()
  query.set('site_name', group.siteName)
  query.set('category', concern.category)
  if (group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url) {
    query.set('image_url', group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || '')
  }
  query.set('showroom_context', `${group.siteName} 사례와 비슷한 방향으로 상담을 요청합니다.`)
  query.set('showroom_entry_label', concern.title)
  return `/contact?${query.toString()}`
}

export default function HomepageConceptPage() {
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConcernId, setSelectedConcernId] = useState<ConcernId>('all')

  useEffect(() => {
    let cancelled = false
    fetchShowroomImageAssets().then((list) => {
      if (!cancelled) {
        setAssets(list)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const selectedConcern = useMemo(
    () => CONCERN_CARDS.find((card) => card.id === selectedConcernId) ?? CONCERN_CARDS[0],
    [selectedConcernId]
  )

  const showroomAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role !== 'before'),
    [assets]
  )

  const siteGroups = useMemo(() => buildSiteGroups(showroomAssets), [showroomAssets])

  const featuredSites = useMemo(() => {
    const candidates = siteGroups.filter((group) => group.images.length >= 4 || group.hasBeforeAfter)
    return (candidates.length > 0 ? candidates : siteGroups).slice(0, 12)
  }, [siteGroups])

  const filteredSites = useMemo(() => {
    const matched = featuredSites.filter((group) => matchesConcern(group, selectedConcern))
    if (matched.length > 0) return matched.slice(0, 6)
    return featuredSites.slice(0, 6)
  }, [featuredSites, selectedConcern])

  const heroSites = useMemo(() => filteredSites.slice(0, 3), [filteredSites])

  const topProducts = useMemo(() => {
    const productCount = new Map<string, number>()
    filteredSites.forEach((group) => {
      group.products.forEach((product) => {
        productCount.set(product, (productCount.get(product) ?? 0) + 1)
      })
    })
    return Array.from(productCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [filteredSites])

  const beforeAfterSites = useMemo(
    () => featuredSites.filter((group) => group.hasBeforeAfter).slice(0, 2),
    [featuredSites]
  )

  const heroBackground = heroSites[0]?.mainImage?.cloudinary_url || heroSites[0]?.mainImage?.thumbnail_url || ''

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-sm text-neutral-300">홈페이지 컨셉을 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-50">
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
                임시 컨셉 페이지
              </p>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-5xl">
                제품보다 먼저,
                <br />
                완성된 현장을 보여주는 홈페이지 실험안
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300 md:text-base">
                파인드가구가 어떤 제품을 갖고 있는지보다, 실제로 어떤 공간 결과를 만들어내는지를 먼저 보여주는 방향입니다.
                현재 OS의 `image_assets`, `showroom`, `contact` 흐름을 기준으로 바로 붙여볼 수 있는 컨셉만 담았습니다.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/showroom"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
                >
                  시공사례 쇼룸 보기
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact?category=대표%20사례%20상담"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  무료 레이아웃 상담
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
                  <p className="mt-1 font-medium text-white">현 시스템 연동</p>
                  <p className="mt-2 text-xs leading-6">새 플랫폼을 따로 만드는 대신 OS 내부 공개 동선을 고도화하는 방향입니다.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {heroSites.map((site) => {
                const imageUrl = site.mainImage?.thumbnail_url || site.mainImage?.cloudinary_url || ''
                return (
                  <div key={site.siteName} className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
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
                      <p className="mt-1 text-xs text-stone-400">
                        {site.location || '지역 미지정'} · 사진 {site.images.length}장
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Concern Entry</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">대표님이 먼저 보고 싶은 사례 흐름을 골라보는 영역</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-stone-300">
            톤은 과하게 마케팅형으로 밀지 않고, 상담 잘하는 사람이 먼저 질문하는 방식으로 구성했습니다.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {CONCERN_CARDS.map((card) => {
            const selected = card.id === selectedConcernId
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedConcernId(card.id)}
                className={`rounded-3xl border p-5 text-left transition ${
                  selected
                    ? 'border-amber-300 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.25)]'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <p className="text-sm font-semibold text-white">{card.title}</p>
                <p className="mt-3 text-xs leading-6 text-stone-300">{card.summary}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-2 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Featured Sites</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{selectedConcern.title}에 맞는 대표 현장</h2>
          </div>
          <Link to="/showroom" className="inline-flex items-center gap-2 text-sm font-medium text-amber-300 hover:text-amber-200">
            전체 쇼룸으로 이동
            <ArrowRight className="h-4 w-4" />
          </Link>
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
                  <p className="mt-2 text-sm leading-6 text-stone-300">
                    {site.location || '지역 미지정'}에서 진행된 사례입니다. {site.products[0] ? `${site.products[0]} 중심으로 ` : ''}공간 분위기와 운영 흐름을 함께 설명하기 좋은 현장입니다.
                  </p>

                  <ul className="mt-4 space-y-2 text-xs text-stone-300">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      사진 {site.images.length}장으로 공간 이해가 가능합니다.
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      주력 제품: {site.products.slice(0, 3).join(', ') || '분류 전'}
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      색상: {site.colors.slice(0, 3).join(', ') || '분류 전'}
                    </li>
                  </ul>

                  <div className="mt-5 flex gap-2">
                    <Link
                      to={`/showroom?q=${encodeURIComponent(site.siteName)}`}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      사례 보기
                    </Link>
                    <Link
                      to={buildConceptContactUrl(site, selectedConcern)}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
                    >
                      상담 연결
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Reasoning</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">왜 현장 중심으로 보여주려는가</h2>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              고객은 제품명보다 먼저 결과를 봅니다. 그래서 메인 홈에서는 완성된 현장을 먼저 보여주고, 그 현장을 만들기 위해 어떤 제품 조합이 들어갔는지를 뒤에서 연결하는 흐름을 의도했습니다.
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-sm font-medium text-white">기존 구조</p>
                <p className="mt-1 text-xs leading-6 text-stone-300">제품이 메인이고, 현장은 증거처럼 따라오는 흐름</p>
              </div>
              <div className="rounded-2xl border border-amber-300/30 bg-amber-300/8 p-4">
                <p className="text-sm font-medium text-white">임시 컨셉 구조</p>
                <p className="mt-1 text-xs leading-6 text-stone-200">현장이 메인이고, 제품은 그 결과를 만드는 솔루션으로 연결되는 흐름</p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-[#16110f] p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Product Bridge</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">이 분위기를 만들 때 자주 연결되는 제품</h2>
              </div>
              <Link to="/products-sites" className="text-sm font-medium text-amber-300 hover:text-amber-200">제품별 현장 보기</Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {topProducts.length > 0 ? (
                topProducts.map(([productName, count]) => (
                  <div key={productName} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-base font-semibold text-white">{productName}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-300">
                      현재 선택된 대표 사례 안에서 {count}개 현장에 연결되는 주력 제품입니다.
                    </p>
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-stone-400">
                      <Images className="h-3.5 w-3.5" />
                      제품을 먼저 파는 구조보다, 현장을 설명하면서 자연스럽게 연결하는 용도
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-stone-300">
                  아직 충분히 분류된 제품 데이터가 없어, 이 영역은 메타데이터 정리 후 더 정교하게 구성할 수 있습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
                  <div key={`before-after-${site.siteName}`} className="overflow-hidden rounded-[28px] border border-white/10 bg-stone-950/40">
                    <div className="grid grid-cols-2">
                      <div className="aspect-[4/3] bg-stone-800">
                        {beforeImage ? (
                          <img src={beforeImage.thumbnail_url || beforeImage.cloudinary_url} alt={`${site.siteName} before`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-stone-400">Before 없음</div>
                        )}
                      </div>
                      <div className="aspect-[4/3] bg-stone-800">
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
                        리뉴얼 또는 전환 사례로 설명하기 좋은 현장입니다. 홈페이지에서는 이런 사례를 적게, 하지만 강하게 보여주는 전략이 적합합니다.
                      </p>
                    </div>
                  </div>
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

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">CTA</p>
              <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">이 임시안의 목적은 예쁘게 보이는지보다, 낯설지 않게 설득이 되는지 확인하는 것입니다</h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
                이 페이지는 톤을 완전히 바꾼 시안이 아니라, 현재 OS와 연동하면서도 현장 중심 구조가 얼마나 자연스럽게 보이는지 시험하는 프로토타입입니다.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                to="/showroom"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-stone-200"
              >
                쇼룸 전체 보기
              </Link>
              <Link
                to="/contact?category=홈페이지%20컨셉%20상담"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-transparent px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                상담 폼 연결 확인
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
