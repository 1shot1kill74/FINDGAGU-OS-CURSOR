import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Images, Sparkles } from 'lucide-react'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/publicData'

type PainPointCard = {
  id: string
  icon: string
  title: string
  summary: string
  concern: string
  ctaCategory: string
}

type Testimonial = {
  quote: string
  customer: string
  context: string
}

type FaqItem = {
  question: string
  answer: string
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

const PAIN_POINT_CARDS: PainPointCard[] = [
  {
    id: 'management',
    icon: '📦',
    title: '관리형처럼 보이게 바꾸고 싶다',
    summary: '관리 동선과 좌석 운영이 보이는 현장 중심으로 먼저 보여줍니다.',
    concern: 'management',
    ctaCategory: '관리형 창업',
  },
  {
    id: 'renewal',
    icon: '🔄',
    title: '리뉴얼이 필요한데 설득 포인트가 필요하다',
    summary: '전후 비교와 변화 논리가 보이는 사례를 우선으로 보여줍니다.',
    concern: 'renewal',
    ctaCategory: '리뉴얼 상담',
  },
  {
    id: 'academy',
    icon: '📐',
    title: '학원 자습실을 더 몰입감 있게 만들고 싶다',
    summary: '학습 몰입과 운영 기준을 설명하기 좋은 현장을 우선 정리합니다.',
    concern: 'academy',
    ctaCategory: '학원 자습실 문의',
  },
  {
    id: 'school',
    icon: '🏫',
    title: '학교 공간을 실제 사례로 검토하고 싶다',
    summary: '학교와 공공성 있는 공간 사례를 먼저 보며 방향을 잡습니다.',
    concern: 'school',
    ctaCategory: '고교학점제 행정 상담',
  },
]

const TESTIMONIALS: Testimonial[] = [
  {
    quote: '단순히 제품을 고르는 느낌이 아니라, 우리 공간에서 무엇이 먼저 정리되어야 하는지부터 설명해줘서 결정이 훨씬 쉬웠습니다.',
    customer: '관리형 운영 고객',
    context: '공간 방향과 운영 기준 만족',
  },
  {
    quote: '가구만 예쁘게 들어온 것이 아니라 수납과 동선이 같이 정리돼서, 실제 운영이 훨씬 편해졌습니다.',
    customer: '학원 운영 고객',
    context: '수납과 동선 개선 만족',
  },
  {
    quote: '가격만 비교되는 느낌이 아니라 결과와 분위기를 먼저 볼 수 있어서, 원하는 방향을 이야기하기가 쉬웠습니다.',
    customer: '리뉴얼 상담 고객',
    context: '사례 기반 설명 만족',
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    question: '우리 업종과 비슷한 사례도 바로 볼 수 있나요?',
    answer: '네. 쇼룸에서 업종, 현장 성격, 제품 적용 사례를 기준으로 비슷한 사례를 먼저 볼 수 있도록 구성하고 있습니다.',
  },
  {
    question: '상담 전에 무엇을 준비하면 되나요?',
    answer: '평면도나 정확한 자료가 없어도 괜찮습니다. 현재 공간 사진, 운영 방식, 원하는 분위기 정도만 있어도 1차 방향을 잡을 수 있습니다.',
  },
  {
    question: '제품만 따로 볼 수도 있나요?',
    answer: '가능합니다. 다만 단순 제품 목록보다 실제 적용 현장과 함께 보시는 것이 더 이해가 쉬워 제품 카탈로그와 사례를 함께 연결해 두었습니다.',
  },
  {
    question: '리뉴얼 사례도 확인할 수 있나요?',
    answer: '네. Before / After가 있는 현장을 우선 선별해 리뉴얼 이유와 변화 포인트를 설명할 수 있도록 구성하고 있습니다.',
  },
  {
    question: '문의하면 바로 대표가 직접 대응하나요?',
    answer: '처음부터 대표가 직접 붙는 구조보다는, 사례와 기준을 먼저 확인하고 필요한 맥락을 정리한 뒤 적절한 방식으로 연결되는 구조를 지향합니다.',
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

export default function HomePage() {
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchShowroomImageAssets().then((list) => {
      if (!cancelled) {
        setAssets(list)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const showroomAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role !== 'before'),
    [assets]
  )

  const siteGroups = useMemo(() => buildSiteGroups(showroomAssets), [showroomAssets])

  const featuredSites = useMemo(
    () => siteGroups.filter((group) => group.images.length >= 4 || group.hasBeforeAfter).slice(0, 6),
    [siteGroups]
  )

  const topProducts = useMemo(() => {
    const productCounts = new Map<string, number>()
    featuredSites.forEach((site) => {
      site.products.forEach((product) => {
        productCounts.set(product, (productCounts.get(product) ?? 0) + 1)
      })
    })
    return Array.from(productCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [featuredSites])

  const totalBeforeAfter = useMemo(
    () => featuredSites.filter((site) => site.hasBeforeAfter).length,
    [featuredSites]
  )

  const recommendedPainPoints = useMemo(
    () =>
      PAIN_POINT_CARDS.map((card) => ({
        ...card,
        href: `/showroom?concern=${encodeURIComponent(card.concern)}`,
        contactHref: `/contact?category=${encodeURIComponent(card.ctaCategory)}&showroom_entry_label=${encodeURIComponent(card.title)}`,
      })),
    []
  )

  const heroImage = featuredSites[0]?.mainImage?.cloudinary_url || featuredSites[0]?.mainImage?.thumbnail_url || ''
  const featuredPreview = featuredSites.slice(0, 3)

  return (
    <div className="bg-background">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_38%),linear-gradient(180deg,#ffffff,#f8fafc)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 section-padding py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-sub card-shadow">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              실제 시공사례 기반 제안
            </p>
            <h1 className="heading-display mt-6 text-foreground leading-[1.15]">
              고객의 문제에서 시작해,
              <br />
              어떤 결과로 해결했는지 보여드립니다
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              파인드가구는 제품만 나열하기보다, 고객이 겪는 문제를 실제 현장에서 어떻게 해결했는지부터 설명합니다.
              먼저 비슷한 문제를 해결한 시공 사례를 보고, 그다음 유사 사례와 제품 적용 현장을 둘러보며 방향을 좁혀갈 수 있게 구성했습니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                사례 기반 상담 받기
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/showroom"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                시공 사례 보기
              </Link>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-white p-4 card-shadow">
                <p className="text-xs text-muted-foreground">원칙 1</p>
                <p className="mt-1 text-sm font-semibold text-foreground">현장 중심</p>
                <p className="mt-2 text-xs text-muted-foreground">메인 주어는 제품이 아니라 완성된 현장입니다.</p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-4 card-shadow">
                <p className="text-xs text-muted-foreground">원칙 2</p>
                <p className="mt-1 text-sm font-semibold text-foreground">설명 먼저</p>
                <p className="mt-2 text-xs text-muted-foreground">홈페이지에서 1차 설명을 먼저 보고 유사 사례를 둘러볼 수 있게 구성합니다.</p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-4 card-shadow">
                <p className="text-xs text-muted-foreground">원칙 3</p>
                <p className="mt-1 text-sm font-semibold text-foreground">현장과 제품 연결</p>
                <p className="mt-2 text-xs text-muted-foreground">제품은 단독 비교보다 실제 적용 현장과 함께 이해할 수 있게 연결합니다.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-[28px] bg-card card-shadow">
              <div className="aspect-[16/10] bg-muted">
                {heroImage ? (
                  <img src={heroImage} alt="대표 시공 사례" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    대표 이미지를 준비하는 중입니다
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {featuredPreview.map((site) => {
                const imageUrl = site.mainImage?.thumbnail_url || site.mainImage?.cloudinary_url || ''
                return (
                  <div key={site.siteName} className="overflow-hidden rounded-2xl border border-border bg-white card-shadow">
                    <div className="aspect-[4/3] bg-muted">
                      {imageUrl ? (
                        <img src={imageUrl} alt={site.siteName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">이미지 없음</div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {site.businessTypes[0] ? (
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                            {site.businessTypes[0]}
                          </span>
                        ) : null}
                        {site.hasBeforeAfter ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                            Before / After
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">{site.siteName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
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

      <section className="bg-[hsl(var(--surface))] py-20">
        <div className="mx-auto max-w-7xl section-padding">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Pain Point Entry</p>
            <h2 className="heading-section mt-3 text-foreground">먼저 어떤 문제가 있는지부터 선택합니다</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
              출발점은 제품이 아니라 고객의 페인포인트입니다. 문제를 먼저 고르면, 그 문제를 해결한 시공 사례로 바로 이어집니다.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {recommendedPainPoints.map((card) => (
              <div key={card.id} className="rounded-[28px] bg-white p-5 card-shadow transition-all hover:-translate-y-0.5 hover:card-shadow-hover">
                <span className="text-2xl">{card.icon}</span>
                <p className="mt-3 text-sm font-semibold text-foreground">{card.title}</p>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">{card.summary}</p>
                <div className="mt-5 flex gap-2">
                  <Link
                    to={card.href}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    해결 사례 보기
                  </Link>
                  <Link
                    to={card.contactHref}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    바로 상담
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl section-padding">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Featured Sites</p>
              <h2 className="heading-section mt-2 text-foreground">1차 설득은 해결된 시공 사례로 합니다</h2>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              고객이 가격 비교보다 "이런 결과를 원합니다"라고 말할 수 있도록 대표 사례를 먼저 보여줍니다.
            </p>
          </div>

          {loading ? (
            <div className="mt-8 rounded-[28px] border border-border bg-white p-8 text-sm text-muted-foreground card-shadow">
              대표 현장을 불러오는 중…
            </div>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {featuredSites.map((site) => {
                const imageUrl = site.mainImage?.thumbnail_url || site.mainImage?.cloudinary_url || ''
                return (
                  <article key={site.siteName} className="overflow-hidden rounded-[28px] bg-white card-shadow">
                    <div className="aspect-[16/10] bg-muted">
                      {imageUrl ? (
                        <img src={imageUrl} alt={site.siteName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">대표 이미지 없음</div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="flex flex-wrap gap-2">
                        {site.businessTypes.slice(0, 2).map((businessType) => (
                          <span key={`${site.siteName}-${businessType}`} className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                            {businessType}
                          </span>
                        ))}
                        {site.hasBeforeAfter ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                            리뉴얼 설명 가능
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-4 text-lg font-semibold text-foreground">{site.siteName}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {site.location || '지역 미지정'}에서 진행된 현장입니다. {site.products[0] ? `${site.products[0]} 중심으로 ` : ''}
                        공간 분위기와 운영 흐름을 함께 설명하기 좋은 사례입니다.
                      </p>

                      <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          사진 {site.images.length}장으로 공간 이해가 가능합니다.
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          주력 제품: {site.products.slice(0, 3).join(', ') || '분류 전'}
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          색상: {site.colors.slice(0, 3).join(', ') || '분류 전'}
                        </li>
                      </ul>

                      <div className="mt-5 flex gap-2">
                        <Link
                          to={`/showroom?q=${encodeURIComponent(site.siteName)}`}
                          className="inline-flex flex-1 items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          유사 사례 더 보기
                        </Link>
                        <Link
                          to={`/contact?site_name=${encodeURIComponent(site.siteName)}&category=${encodeURIComponent('대표 사례 상담')}`}
                          className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          상담 연결
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[hsl(var(--surface))] py-16">
        <div className="mx-auto max-w-7xl section-padding">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Customer Voice</p>
              <h2 className="heading-section mt-2 text-foreground">고객이 실제로 좋았다고 말한 이유</h2>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              현장별 후기를 모두 보여주기보다, 파인드가구의 설명 방식과 결과에 만족했던 고객 반응을 대표적으로 먼저 보여줍니다.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <article key={`${item.customer}-${item.context}`} className="rounded-[28px] bg-white p-6 card-shadow">
                <p className="text-3xl leading-none text-primary/20">"</p>
                <p className="mt-3 text-sm leading-7 text-foreground">{item.quote}</p>
                <div className="mt-6 border-t border-border pt-4">
                  <p className="text-sm font-semibold text-foreground">{item.customer}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.context}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[hsl(var(--surface))] py-16">
        <div className="mx-auto max-w-7xl section-padding">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Related Exploration</p>
              <h2 className="heading-section mt-2 text-foreground">2차 설득은 유사 사례를 더 둘러보게 하는 것입니다</h2>
            </div>
            <Link to="/showroom" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80">
              시공사례 쇼룸 전체 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Link to="/showroom?concern=renewal" className="rounded-[28px] bg-white p-5 card-shadow transition-all hover:-translate-y-0.5 hover:card-shadow-hover">
              <p className="text-sm font-semibold text-foreground">리뉴얼 사례만 보기</p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Before/After가 있는 사례를 중심으로, 왜 이 시공이 필요했는지 먼저 확인합니다.
              </p>
            </Link>
            <Link to="/showroom?concern=management" className="rounded-[28px] bg-white p-5 card-shadow transition-all hover:-translate-y-0.5 hover:card-shadow-hover">
              <p className="text-sm font-semibold text-foreground">관리형 분위기 사례 보기</p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                운영 기준과 관리 동선이 보이는 대표 현장을 우선적으로 둘러봅니다.
              </p>
            </Link>
            <Link to="/showroom?concern=academy" className="rounded-[28px] bg-white p-5 card-shadow transition-all hover:-translate-y-0.5 hover:card-shadow-hover">
              <p className="text-sm font-semibold text-foreground">학원 자습실 사례 보기</p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                학원 자습실, 몰입감, 좌석 흐름 관점으로 설명하기 좋은 사례를 모아봅니다.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="mx-auto max-w-7xl section-padding">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] bg-white p-5 card-shadow">
              <p className="text-xs text-muted-foreground">대표 사례</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{featuredSites.length}개</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">메인에 먼저 보여줄 대표 현장 기준으로 선별한 사례 수</p>
            </div>
            <div className="rounded-[28px] bg-white p-5 card-shadow">
              <p className="text-xs text-muted-foreground">Before / After</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{totalBeforeAfter}개</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">리뉴얼 필요성과 변화 논리를 설명하기 좋은 대표 현장 수</p>
            </div>
            <div className="rounded-[28px] bg-white p-5 card-shadow">
              <p className="text-xs text-muted-foreground">주요 제품 연결</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{topProducts.length}개</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">대표 현장에서 자주 연결되는 주력 제품군을 우선 정리합니다</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20 pt-8">
        <div className="mx-auto grid max-w-7xl gap-6 section-padding lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[32px] bg-[hsl(var(--surface))] p-6 card-shadow">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Reasoning</p>
            <h2 className="heading-section mt-2 text-foreground">제품은 3번째 단계에서 이해하면 됩니다</h2>
            <p className="mt-4 text-sm text-muted-foreground">
              출발점은 고객의 문제와 해결 사례이고, 제품은 그다음 단계에서 이 결과를 만들 때 어떤 조합이 자주 쓰였는가를 이해하는 용도로 보여주는 것이 더 자연스럽습니다.
            </p>
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-sm font-medium text-foreground">1단계</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">페인포인트와 해결 사례로 신뢰를 먼저 만든다</p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-sm font-medium text-foreground">2단계</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">유사 사례를 더 보게 하고, 그다음 제품으로 자연스럽게 이어준다</p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] bg-white p-6 card-shadow">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Product Bridge</p>
                <h2 className="heading-section mt-2 text-foreground">제품을 더 보고 싶은 분은 이 단계로 이동합니다</h2>
              </div>
              <Link to="/products-sites" className="text-sm font-medium text-primary hover:opacity-80">
                제품 적용 현장 보기
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {topProducts.length > 0 ? (
                topProducts.map(([productName, count]) => (
                  <div key={productName} className="rounded-3xl border border-border bg-[hsl(var(--surface))] p-5">
                    <p className="text-base font-semibold text-foreground">{productName}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      대표 현장 안에서 {count}개 사례에 연결되는 주력 제품입니다.
                    </p>
                    <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Images className="h-3.5 w-3.5" />
                      단독 판매보다 적용 맥락을 함께 보여주는 방식으로 사용
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Link
                        to={`/products-sites?q=${encodeURIComponent(productName)}`}
                        className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white"
                      >
                        제품 둘러보기
                      </Link>
                      <Link
                        to={`/contact?category=${encodeURIComponent('제품 구성 상담')}&showroom_entry_label=${encodeURIComponent(productName)}`}
                        className="inline-flex items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        제품 상담 연결
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-border bg-[hsl(var(--surface))] p-5 text-sm text-muted-foreground">
                  아직 충분히 분류된 제품 데이터가 없어, 이 영역은 메타데이터 정리 후 더 정교하게 구성할 수 있습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-7xl section-padding">
          <div className="rounded-[32px] bg-[hsl(var(--surface))] p-6 card-shadow md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">FAQ</p>
                <h2 className="heading-section mt-2 text-foreground">문의 전에 많이 확인하는 질문</h2>
              </div>
              <p className="max-w-xl text-sm text-muted-foreground md:text-base">
                바로 문의하기 전에 자주 묻는 내용을 먼저 정리해 두었습니다. SEO와 AEO 관점에서도 이 영역은 중요한 설명 장치가 됩니다.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {FAQ_ITEMS.map((item) => (
                <details key={item.question} className="rounded-2xl border border-border bg-white p-5 open:card-shadow">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
