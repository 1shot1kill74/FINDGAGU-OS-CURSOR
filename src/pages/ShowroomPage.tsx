/**
 * 고객용 시공사례 쇼룸
 * - image_assets 기준, 현장(site_name) 또는 제품(product_name) 그룹
 * - 핀터레스트 스타일 그리드, 쇼룸 비주얼
 * - 카드 클릭 시 해당 현장/제품 사진 갤러리 (모달)
 */
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/imageAssetService'
import type { Json } from '@/types/database'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, X, ChevronLeft, ChevronRight, LayoutGrid, Package, Images, Sparkles, FileText, MousePointerClick, MessageCircle, FileCheck, Users, Wrench, ClipboardCheck, ArrowRight } from 'lucide-react'

/** 말풍선 문구에서 하이라이트할 핵심 단어 (주황/브랜드 강조색) */
const HIGHLIGHT_KEYWORDS = ['실패', '매출', '디테일', '통제력', '점유율', '프리미엄', '원스톱', '품격', '인건비']

function highlightKeywords(text: string) {
  if (!text) return null
  const parts: { str: string; highlight: boolean }[] = []
  let remaining = text
  while (remaining.length > 0) {
    let earliest = { index: remaining.length, kw: '' }
    for (const kw of HIGHLIGHT_KEYWORDS) {
      const i = remaining.indexOf(kw)
      if (i !== -1 && i < earliest.index) earliest = { index: i, kw }
    }
    if (earliest.kw) {
      if (earliest.index > 0) parts.push({ str: remaining.slice(0, earliest.index), highlight: false })
      parts.push({ str: earliest.kw, highlight: true })
      remaining = remaining.slice(earliest.index + earliest.kw.length)
    } else {
      parts.push({ str: remaining, highlight: false })
      break
    }
  }
  return parts.map((p, i) =>
    p.highlight ? (
      <span key={i} className="text-amber-600 font-semibold">
        {p.str}
      </span>
    ) : (
      <span key={i}>{p.str}</span>
    )
  )
}

/** 전문가가 먼저 질문하는 형태의 공감 카드: 필터 태그 + 업종 키워드 + 말풍선 메시지 */
const CONCERN_CARDS: { tag: string; industryFilter: string; emoji: string; message: string; imageSrc?: string }[] = [
  { tag: '관리형 창업 또는 전환', industryFilter: '관리형', emoji: '💼', message: '관리형 오픈한다고 만석이 되는 시기는 끝났습니다. 수익률을 가르는 건 화려함이 아니라, \'실패 없는 관리 동선\'의 디테일입니다. 확인해 보시겠습니까? 📋', imageSrc: '/showroom-concern-management.png' },
  { tag: '매출 향상 스터디카페 리뉴얼', industryFilter: '스터디카페', emoji: '📈', message: '무작정 예쁘게만 바꾼다고 매출이 오를까요? 잘되는 곳은 \'좌석 회전율\'을 설계합니다. 매출이 좋은 곳들은 그 디테일이 다릅니다. 📈', imageSrc: '/showroom-concern-studycafe-sales.png' },
  { tag: '스터디카페 같은 학원 자습실', industryFilter: '학원', emoji: '😭', message: '공간만 만든다고 애들이 남을까요? 스터디카페로 유출되는 아이들을 붙잡는 건 \'공부하고 싶게 만드는\' 한 끗 차이의 가구 배치입니다. 🏫', imageSrc: '/showroom-concern-academy-study.png' },
  { tag: '고교학점제 자습공간 구축', industryFilter: '학교', emoji: '📚', message: '예산만 낭비하는 교실 리뉴얼은 이제 그만하세요. 실제 교육 현장에서 아이들의 학습 몰입도가 검증된 \'성공적인 학교 공간\'의 표준을 제안드립니다. 🏛️', imageSrc: '/showroom-concern-highschool-credit.png' },
  { tag: '아파트 독서실 리뉴얼', industryFilter: '아파트', emoji: '🏠', message: '입주민들이 찾지 않는 무늬만 독서실인가요? 우리 아파트 가치를 높이고 아이들이 먼저 찾는 \'성공적인 커뮤니티\'의 디테일을 담았습니다. ✨', imageSrc: '/showroom-concern-apartment-reading.png' },
  { tag: '무인 창업 공간', industryFilter: '무인창업', emoji: '🤖', message: '인건비 부담 없이, 진짜 무인으로 돌아가는 공간 창업을 고민 중이신가요? 🤖', imageSrc: '/showroom-concern-unmanned-startup.png' },
]

type ViewMode = 'site' | 'product'

/** 현장별 그룹: 대표 이미지(is_main), 현장명, 지역, 업종, 제품명, 색상 */
interface SiteGroup {
  siteName: string
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
}

/** 제품별 그룹: 제품명, 현장명·지역·업종·색상(해당 제품 쓰인 사례 기준) */
interface ProductGroup {
  productName: string
  siteNames: string[]
  locations: string[]
  businessTypes: string[]
  colors: string[]
  images: ShowroomImageAsset[]
}

function buildSiteGroups(assets: ShowroomImageAsset[]): SiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()
  for (const a of assets) {
    const site = (a.site_name ?? '').trim() || '미지정'
    const list = bySite.get(site) ?? []
    list.push(a)
    bySite.set(site, list)
  }
  const groups: SiteGroup[] = []
  for (const [siteName, images] of bySite) {
    const mainImage = images.find((i) => i.is_main) ?? images[0] ?? null
    const location = images[0]?.location?.trim() ?? ''
    const businessTypes = Array.from(new Set(images.map((i) => i.business_type?.trim()).filter(Boolean) as string[]))
    const products = Array.from(new Set(images.map((i) => i.product_name?.trim()).filter(Boolean) as string[]))
    const colors = Array.from(new Set(images.map((i) => i.color_name?.trim()).filter(Boolean) as string[]))
    groups.push({ siteName, location, businessTypes, products, colors, images, mainImage })
  }
  return groups.sort((a, b) => a.siteName.localeCompare(b.siteName, 'ko'))
}

function buildProductGroups(assets: ShowroomImageAsset[]): ProductGroup[] {
  const byProduct = new Map<string, ShowroomImageAsset[]>()
  for (const a of assets) {
    const product = (a.product_name ?? '').trim() || '미지정'
    const list = byProduct.get(product) ?? []
    list.push(a)
    byProduct.set(product, list)
  }
  return Array.from(byProduct.entries())
    .map(([productName, images]) => {
      const siteNames = Array.from(new Set(images.map((i) => i.site_name?.trim()).filter(Boolean) as string[]))
      const locations = Array.from(new Set(images.map((i) => i.location?.trim()).filter(Boolean) as string[]))
      const businessTypes = Array.from(new Set(images.map((i) => i.business_type?.trim()).filter(Boolean) as string[]))
      const colors = Array.from(new Set(images.map((i) => i.color_name?.trim()).filter(Boolean) as string[]))
      return { productName, siteNames, locations, businessTypes, colors, images }
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, 'ko'))
}

export default function ShowroomPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('site')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('tag') ?? '')
  const [detailOpen, setDetailOpen] = useState<'site' | 'product' | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [unmannedNameOrCompany, setUnmannedNameOrCompany] = useState('')
  const [unmannedContact, setUnmannedContact] = useState('')
  const [unmannedRegion, setUnmannedRegion] = useState('')
  const [unmannedSubmitting, setUnmannedSubmitting] = useState(false)

  // 딥링크: URL ?tag= 변경 시(뒤로가기 등) 검색어 동기화
  useEffect(() => {
    const tag = searchParams.get('tag') ?? ''
    setSearchQuery(tag)
  }, [searchParams])

  const setSearchQueryAndUrl = (value: string) => {
    setSearchQuery(value)
    setSearchParams(value ? { tag: value } : {})
  }

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

  const siteGroups = useMemo(() => buildSiteGroups(assets), [assets])
  const productGroups = useMemo(() => buildProductGroups(assets), [assets])

  const searchTrim = searchQuery.trim()
  const searchLower = searchTrim.toLowerCase()
  /** 카드 태그와 일치할 때 해당 카드의 업종 키워드로만 필터 (업종 기준) */
  const industryFilterForTag = useMemo(() => {
    const card = CONCERN_CARDS.find((c) => c.tag === searchTrim)
    return card?.industryFilter ?? null
  }, [searchTrim])

  const filteredSiteGroups = useMemo(() => {
    if (!searchTrim) return siteGroups
    if (industryFilterForTag) {
      const kw = industryFilterForTag.toLowerCase()
      return siteGroups.filter((g) =>
        g.businessTypes.some((b) => (b || '').toLowerCase().includes(kw))
      )
    }
    return siteGroups.filter(
      (g) =>
        g.siteName.toLowerCase().includes(searchLower) ||
        g.location.toLowerCase().includes(searchLower) ||
        g.businessTypes.some((b) => b.toLowerCase().includes(searchLower)) ||
        g.products.some((p) => p.toLowerCase().includes(searchLower)) ||
        g.colors.some((c) => c.toLowerCase().includes(searchLower))
    )
  }, [siteGroups, searchTrim, searchLower, industryFilterForTag])

  const filteredProductGroups = useMemo(() => {
    if (!searchTrim) return productGroups
    if (industryFilterForTag) {
      const kw = industryFilterForTag.toLowerCase()
      return productGroups.filter((g) =>
        g.businessTypes.some((b) => (b || '').toLowerCase().includes(kw))
      )
    }
    return productGroups.filter(
      (g) =>
        g.productName.toLowerCase().includes(searchLower) ||
        g.siteNames.some((s) => s.toLowerCase().includes(searchLower)) ||
        g.locations.some((l) => l.toLowerCase().includes(searchLower)) ||
        g.businessTypes.some((b) => b.toLowerCase().includes(searchLower)) ||
        g.colors.some((c) => c.toLowerCase().includes(searchLower))
    )
  }, [productGroups, searchTrim, searchLower, industryFilterForTag])

  const detailImages = useMemo(() => {
    if (!detailKey || detailOpen === null) return []
    if (detailOpen === 'site') {
      const g = siteGroups.find((x) => x.siteName === detailKey)
      return g?.images ?? []
    }
    const g = productGroups.find((x) => x.productName === detailKey)
    return g?.images ?? []
  }, [detailOpen, detailKey, siteGroups, productGroups])

  const openDetail = (mode: 'site' | 'product', key: string) => {
    setDetailOpen(mode)
    setDetailKey(key)
    setLightboxIndex(0)
  }

  const goPrev = () => setLightboxIndex((i) => (i <= 0 ? detailImages.length - 1 : i - 1))
  const goNext = () => setLightboxIndex((i) => (i >= detailImages.length - 1 ? 0 : i + 1))

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-neutral-500 text-sm">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* 헤더: 타이틀 + 토글 + 검색 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200 px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 tracking-tight">
            시공사례 쇼룸
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-100/80">
              <button
                type="button"
                onClick={() => setViewMode('site')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'site' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                현장 중심
              </button>
              <button
                type="button"
                onClick={() => setViewMode('product')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'product' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Package className="h-4 w-4" />
                제품 중심
              </button>
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder={viewMode === 'site' ? '현장명, 지역, 컬러 검색' : '제품명 검색 (예: 아카시아, 원목)'}
                value={searchQuery}
                onChange={(e) => setSearchQueryAndUrl(e.target.value)}
                className="pl-9 h-10 bg-white border-neutral-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        {/* 메인 카피: 강렬한 헤드라인 */}
        <section className="mb-8" aria-labelledby="showroom-main-heading">
          <h1 id="showroom-main-heading" className="text-2xl md:text-3xl font-bold text-neutral-900 leading-tight mb-1">
            실패하지 않는 공간 기획, 그 차이는 <span className="text-amber-600">디테일</span>에 있습니다.
          </h1>
          <p className="text-neutral-600 text-base md:text-lg">대표님의 공간, 어떤 변화가 필요하신가요?</p>
        </section>

        {/* 전문가가 먼저 질문하는 공감 카드: 말풍선 + 핵심어 하이라이트 + 성공 사례 보기 CTA */}
        <section className="mb-8" aria-labelledby="showroom-concern-heading">
          <h2 id="showroom-concern-heading" className="sr-only">고민별 시공사례 보기</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CONCERN_CARDS.map((card) => {
              const isSelected = searchQuery === card.tag
              const handleCardClick = () => {
                setSearchQueryAndUrl(card.tag)
                document.getElementById('showroom-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              return (
                <button
                  key={card.tag}
                  type="button"
                  onClick={handleCardClick}
                  className="group relative flex flex-col gap-3 text-left rounded-2xl p-4 bg-white border-2 border-neutral-200 shadow-sm hover:shadow-xl hover:border-amber-300 hover:-translate-y-1 active:scale-[0.99] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 min-h-[88px] cursor-pointer"
                >
                  <span className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 rounded-full bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 shadow-md">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    성공 사례 보기
                  </span>
                  <div className="flex items-center gap-3 flex-1 min-h-0">
                    <span
                      className="flex-shrink-0 w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center text-3xl border-2 border-neutral-200 group-hover:border-amber-200 transition-colors overflow-hidden"
                      aria-hidden
                    >
                      {card.imageSrc ? (
                        <img src={card.imageSrc} alt="" className="w-full h-full object-cover object-top" />
                      ) : (
                        card.emoji
                      )}
                    </span>
                    <div
                      className={`flex-1 min-w-0 pr-8 rounded-xl rounded-tl-none px-4 py-3 border border-neutral-100 group-hover:bg-amber-50/50 group-hover:border-amber-100 transition-colors ${
                        isSelected ? 'bg-amber-50/80 border-amber-200' : ''
                      }`}
                      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                    >
                      <p className="text-sm text-neutral-700 leading-relaxed font-medium">
                        {highlightKeywords(card.message)}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
        {/* 전문가 코멘트: 해당 카드 클릭 시에만 표시 — 왼쪽 코멘트, 오른쪽 전문가 이미지(답하는 느낌) */}
        {searchQuery === '관리형 창업 또는 전환' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  관리형 공간은 단순한 인테리어가 아닙니다. 아이들의 <span className="font-bold text-slate-800">성과를 만들어내는 학습 엔진</span>이어야 합니다.
                </p>
                <p>
                  누군가 우리 공간의 겉모습을 카피하는 것은 쉽습니다. 자재를 줄여서 가격을 낮추는 것도 어렵지 않습니다. 하지만 장시간 학습의 피로도를 낮추는 인체공학적 설계, 교시제 운영을 고려한 정교한 동선, 조도와 환기 시스템의 최적화까지—그 <span className="font-bold text-slate-800">이유를 알고 설계하는 것</span>과 모르고 흉내 내는 것은 결과에서 천지 차이를 만듭니다.
                </p>
                <p>
                  결국, 성공하는 공간은 보이지 않는 <span className="font-bold text-slate-800">디테일에서 결정됩니다.</span> 그 한 끗 차이의 디테일이 원장님의 사업을 성공으로 이끕니다.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Link
                  to="/contact?category=관리형%20창업%20문의"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                >
                  관리형 맞춤형 레이아웃 상담하기
                </Link>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 flex items-center justify-center sm:justify-end pr-4 pb-2">
              <span className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/showroom-expert-comment.png"
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </span>
            </div>
          </section>
        )}
        {searchQuery === '매출 향상 스터디카페 리뉴얼' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">비슷해 보인다고 똑같은 스터디카페가 아닙니다.</p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  수많은 스터디카페가 생겨나고, 이제 인테리어는 상향 평준화되어 다 비슷해 보입니다. 하지만 현장에는 <span className="font-bold text-slate-800">유독 잘되는 집과 안 되는 집</span>의 극명한 차이가 존재합니다.
                </p>
                <p>
                  우리는 그 차이를 명확히 압니다. 성공하는 스터디카페는 화려한 조명보다, 고객이 <span className="font-bold text-slate-800">&apos;무의식중에 편하다&apos;라고 느끼는 공간 디테일</span>에서 승부가 갈리기 때문입니다.
                </p>
                <p>
                  점주의 관리 방식이 녹아든 가구 배치, 무의식적인 피로감을 줄여주는 책상의 높이와 각도—이런 보이지 않는 <span className="font-bold text-slate-800">디테일의 격차</span>가 모여 고객이 다시 찾는 &apos;잘되는 집&apos;을 만듭니다. 그 차이를 아는 전문가와 함께 시작하십시오.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Link
                  to="/contact?category=매출%20향상%20스터디카페%20리뉴얼"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                >
                  스터디카페 리뉴얼 맞춤형 상담하기
                </Link>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 flex items-center justify-center sm:justify-end pr-4 pb-2">
              <span className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/showroom-expert-comment.png"
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </span>
            </div>
          </section>
        )}
        {searchQuery === '스터디카페 같은 학원 자습실' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">유료인가요, 무료인가요? 목적이 분명해야 성공합니다.</p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  학원 자습실 기획의 첫 단추는 <span className="font-bold text-slate-800">유료 공간인지, 무료 서비스 공간인지</span>를 결정하는 것입니다.
                </p>
                <p>
                  유료 공간이라면 학부모와 학생이 지불한 비용만큼의 &apos;특별한 가치&apos;가 체감되어야 합니다. 반면, 무료 공간이라면 관리 효율과 기본기에 집중하여 예산의 최적화를 이뤄내야 하죠.
                </p>
                <p>
                  원장님, 자습실은 단순히 아이들이 머무는 곳이 아닙니다. <span className="font-bold text-slate-800">학생들에게는 몰입의 경험을, 원장님께는 추가 매출</span>과 재등록률 상승을 가져다주는 <span className="font-bold text-slate-800">&apos;전략적 자산&apos;</span>이어야 합니다. 목적에 맞는 정교한 기획이 예산 낭비를 막고 학원의 가치를 높입니다.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Link
                  to="/contact?category=학원%20자습실%20문의"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                >
                  우리 학원 맞춤형 자습실 예산 상담하기
                </Link>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 flex items-center justify-center sm:justify-end pr-4 pb-2">
              <span className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/showroom-expert-comment.png"
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </span>
            </div>
          </section>
        )}

        {searchQuery === '고교학점제 자습공간 구축' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">
                모호했던 고교학점제 공간 기획, 이제 <span className="font-bold text-slate-900">&apos;검증된 표준&apos;</span>이 정답입니다.
              </p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  고교학점제 시행 초기, 교육 현장에는 수많은 고민이 있었습니다. 공간의 가변성은 어느 정도여야 하는지, 학습 몰입도와 개방성 사이의 균형은 어떻게 잡아야 하는지…
                </p>
                <p>
                  이제 수많은 시공 사례를 통해 최적의 방향성은 명확해졌습니다. 고교학점제 자율학습 공간은 단순한 휴게실이 아닌, 학생 개개인의 공강 시간을 실질적인 학습 성과로 연결하는 <span className="font-bold text-slate-800">&apos;맞춤형 거점&apos;</span>이어야 합니다.
                </p>
                <p>
                  복잡한 행정 절차와 예산에 맞춘 최적의 공간 설계, 이제 고민하지 마십시오. 수많은 학교 현장에서 검증된 <span className="font-bold text-slate-800">파인드가구만의 특화된 공간 솔루션</span>이 선생님의 명쾌한 해답이 되어드리겠습니다.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Link
                  to="/contact?category=고교학점제%20행정%20상담"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                >
                  우리 학교 맞춤형 제안서 및 견적 상담하기
                </Link>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 flex items-center justify-center sm:justify-end pr-4 pb-2">
              <span className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/showroom-expert-comment.png"
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </span>
            </div>
          </section>
        )}

        {searchQuery === '아파트 독서실 리뉴얼' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">단순한 시설 교체가 아닙니다. 입주민의 자부심을 설계하는 일입니다.</p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  최근 아파트 커뮤니티의 중심이 &apos;미니 도서관&apos;에서 &apos;프리미엄 독서실·스터디카페&apos;로 빠르게 재편되고 있습니다. 이용자는 늘었지만, 낡은 시설이 단지의 가치를 떨어뜨리고 있지는 않습니까?
                </p>
                <p>
                  아파트 리뉴얼은 일반 창업과 다릅니다. 의사결정 주체에 따른 계약 방식의 차이, 단지 내 관리 규정 준수 등 <span className="font-bold text-slate-800">복잡한 행정 절차를 완벽하게 이해</span>해야 합니다. 단순히 가구를 잘 만드는 것을 넘어, <span className="font-bold text-slate-800">실수 없는 행정 처리와 투명한 공정 관리</span>가 동반되어야 입주민들의 신뢰를 얻을 수 있습니다.
                </p>
                <p>
                  입주민이 만족하는 호텔급 시설은 기본입니다. 복잡한 절차는 파인드가구가 책임지고, 원장님(관리 주체)께는 <span className="font-bold text-slate-800">단지의 가치가 올라가는 결과</span>만 드립니다.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-700">
                <span className="flex items-center gap-1 shrink-0"><MessageCircle className="h-3.5 w-3.5" aria-hidden /> 상담</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden />
                <span className="flex items-center gap-1 shrink-0"><FileCheck className="h-3.5 w-3.5" aria-hidden /> 규정 검토</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden />
                <span className="flex items-center gap-1 shrink-0"><Users className="h-3.5 w-3.5" aria-hidden /> 입주민 동의 지원</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden />
                <span className="flex items-center gap-1 shrink-0"><Wrench className="h-3.5 w-3.5" aria-hidden /> 시공</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden />
                <span className="flex items-center gap-1 shrink-0"><ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> 사후관리</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Link
                  to="/contact?category=아파트%20리뉴얼%20제안서"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                >
                  우리 아파트 맞춤형 리뉴얼 제안서 요청하기
                </Link>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 flex items-center justify-center sm:justify-end pr-4 pb-2">
              <span className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/showroom-expert-comment.png"
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </span>
            </div>
          </section>
        )}

        {searchQuery === '무인 창업 공간' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">파인드가구의 무인창업 솔루션, 곧 공개됩니다.</p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  공간 그 이상의 가치를 만드는 파인드가구가 현재 <span className="font-bold text-slate-800">업계 최고 수준의 기술력을 가진 협력업체들과 함께 &apos;무인창업 최적화 솔루션&apos;을 긴밀히 협의 중</span>에 있습니다.
                </p>
                <p>
                  단순한 무인 매장이 아닙니다. 인건비는 최소화하고 운영 효율은 극대화하는, 파인드가구만의 디테일이 담긴 차세대 무인 공간 모델을 준비하고 있습니다.
                </p>
                <p>
                  지금 아래에 연락처를 남겨주시면, 솔루션이 런칭되는 즉시 <span className="font-bold text-slate-800">가장 먼저 상세 제안서와 창업 혜택을 전달</span>해 드리겠습니다. 잠시만 기다려 주십시오.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-slate-600 text-xs font-medium mb-3">출시 알림을 받으실 연락처를 남겨주세요.</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const phone = (unmannedContact || '').trim().replace(/\s/g, '')
                    if (!phone) {
                      toast.error('연락처를 입력해 주세요.')
                      return
                    }
                    setUnmannedSubmitting(true)
                    try {
                      const nameOrCompany = unmannedNameOrCompany.trim() || '(성함/업체명 미입력)'
                      const { error } = await supabase.from('consultations').insert({
                        company_name: nameOrCompany,
                        manager_name: '(출시 알림 신청)',
                        contact: phone,
                        status: '상담중',
                        metadata: {
                          source: '쇼룸',
                          showroom_category: '무인창업 출시 알림',
                          interest_region: (unmannedRegion || '').trim() || null,
                        } as Json,
                        is_visible: true,
                        expected_revenue: 0,
                      })
                      if (error) throw error
                      toast.success('신청이 완료되었습니다. 출시 시 가장 먼저 연락드리겠습니다.')
                      setUnmannedNameOrCompany('')
                      setUnmannedContact('')
                      setUnmannedRegion('')
                    } catch (err) {
                      console.error(err)
                      toast.error('신청에 실패했습니다. 잠시 후 다시 시도해 주세요.')
                    } finally {
                      setUnmannedSubmitting(false)
                    }
                  }}
                  className="space-y-3"
                >
                  <Input
                    value={unmannedNameOrCompany}
                    onChange={(e) => setUnmannedNameOrCompany(e.target.value)}
                    placeholder="성함 / 업체명"
                    className="bg-white border-slate-200"
                  />
                  <Input
                    type="tel"
                    value={unmannedContact}
                    onChange={(e) => setUnmannedContact(e.target.value)}
                    placeholder="연락처 *"
                    className="bg-white border-slate-200"
                    required
                  />
                  <Input
                    value={unmannedRegion}
                    onChange={(e) => setUnmannedRegion(e.target.value)}
                    placeholder="관심 지역"
                    className="bg-white border-slate-200"
                  />
                  <Button
                    type="submit"
                    disabled={unmannedSubmitting}
                    className="w-full rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                  >
                    {unmannedSubmitting ? '신청 중…' : '무인창업 솔루션 출시 알림 신청하기'}
                  </Button>
                </form>
              </div>
            </div>
            <div className="sm:w-40 shrink-0 flex items-center justify-center sm:justify-end pr-4 pb-2">
              <span className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/showroom-expert-comment.png"
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
              </span>
            </div>
          </section>
        )}

        {viewMode === 'site' && (
          <div id="showroom-gallery" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
            {filteredSiteGroups.map((group) => {
              const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''
              const contactParams = new URLSearchParams({
                site_name: group.siteName,
                category: searchQuery.trim() || (group.businessTypes[0] ?? ''),
                image_url: imageUrl,
              })
              const contactUrl = `/contact?${contactParams.toString()}`
              return (
                <div
                  key={group.siteName}
                  className="flex flex-col h-full rounded-2xl overflow-hidden bg-white border border-neutral-200 shadow-sm hover:shadow-md hover:border-neutral-300 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => openDetail('site', group.siteName)}
                    className="flex flex-col flex-1 min-h-0 text-left group"
                  >
                    <div className="aspect-[4/3] relative bg-neutral-100 overflow-hidden shrink-0 rounded-t-2xl">
                      <img
                        src={imageUrl}
                        alt={group.siteName}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      {group.images.length > 1 && (
                        <div className="absolute bottom-2 right-2 flex gap-0.5" aria-hidden>
                          {group.images.slice(1, 4).map((img, i) => (
                            <div
                              key={img.id}
                              className="w-10 h-10 rounded-md border-2 border-white shadow-md overflow-hidden bg-neutral-200"
                              style={{ transform: `translateY(${i * 2}px) rotate(${i * 3 - 2}deg)` }}
                            >
                              <img
                                src={img.thumbnail_url || img.cloudinary_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col min-h-0">
                      <h3 className="font-semibold text-neutral-900 truncate">{group.siteName}</h3>
                      <dl className="text-xs text-neutral-500 mt-1.5 space-y-0.5">
                        {group.location && (
                          <div className="flex gap-1.5">
                            <span className="text-neutral-400 shrink-0">지역</span>
                            <span>{group.location}</span>
                          </div>
                        )}
                        {group.businessTypes.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="text-neutral-400 shrink-0">업종</span>
                            <span>{group.businessTypes.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.products.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="text-neutral-400 shrink-0">제품명</span>
                            <span className="truncate">{group.products.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.colors.length > 0 && (
                          <div className="flex gap-1.5 items-center flex-wrap">
                            <span className="text-neutral-400 shrink-0">색상</span>
                            <span>{group.colors.slice(0, 4).join(', ')}</span>
                          </div>
                        )}
                      </dl>
                      <p className="mt-2 pt-2 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-neutral-500">
                        <Images className="h-3.5 w-3.5 shrink-0" />
                        <span>사진 {group.images.length}장</span>
                      </p>
                    </div>
                  </button>
                  <div className="p-2 border-t border-neutral-100 bg-neutral-50/50">
                    <Link
                      to={contactUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition-colors"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      이 현장처럼 견적 받기
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {viewMode === 'product' && (
          <div id="showroom-gallery" className="grid grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {filteredProductGroups.map((group) => {
              const mainImg = group.images[0]
              const imageUrl = mainImg?.thumbnail_url || mainImg?.cloudinary_url || ''
              const siteNameForContact = group.siteNames[0] || group.productName
              const contactParams = new URLSearchParams({
                site_name: siteNameForContact,
                category: searchQuery.trim() || (group.businessTypes[0] ?? ''),
                image_url: imageUrl,
              })
              const contactUrl = `/contact?${contactParams.toString()}`
              return (
                <div
                  key={group.productName}
                  className="flex flex-col h-full rounded-2xl overflow-hidden bg-white border border-neutral-200 shadow-sm hover:shadow-md hover:border-neutral-300 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => openDetail('product', group.productName)}
                    className="flex flex-col flex-1 min-h-0 text-left group"
                  >
                    <div className="aspect-[4/3] relative bg-neutral-100 overflow-hidden shrink-0 rounded-t-2xl">
                      <img
                        src={imageUrl}
                        alt={group.productName}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      {group.images.length > 1 && (
                        <div className="absolute bottom-2 right-2 flex gap-0.5" aria-hidden>
                          {group.images.slice(1, 4).map((img, i) => (
                            <div
                              key={img.id}
                              className="w-10 h-10 rounded-md border-2 border-white shadow-md overflow-hidden bg-neutral-200"
                              style={{ transform: `translateY(${i * 2}px) rotate(${i * 3 - 2}deg)` }}
                            >
                              <img
                                src={img.thumbnail_url || img.cloudinary_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col min-h-0">
                      <h3 className="font-semibold text-neutral-900">{group.productName}</h3>
                      <dl className="text-xs text-neutral-500 mt-1.5 space-y-0.5">
                        {group.siteNames.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="text-neutral-400 shrink-0">현장명</span>
                            <span className="truncate">{group.siteNames.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.locations.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="text-neutral-400 shrink-0">지역</span>
                            <span>{group.locations.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.businessTypes.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="text-neutral-400 shrink-0">업종</span>
                            <span>{group.businessTypes.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.colors.length > 0 && (
                          <div className="flex gap-1.5 items-center flex-wrap">
                            <span className="text-neutral-400 shrink-0">색상</span>
                            <span>{group.colors.slice(0, 4).join(', ')}</span>
                          </div>
                        )}
                      </dl>
                      <p className="mt-2 pt-2 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-neutral-500">
                        <Images className="h-3.5 w-3.5 shrink-0" />
                        <span>사진 {group.images.length}장</span>
                      </p>
                    </div>
                  </button>
                  <div className="p-2 border-t border-neutral-100 bg-neutral-50/50">
                    <Link
                      to={contactUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition-colors"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      이 현장처럼 견적 받기
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {viewMode === 'site' && filteredSiteGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
        {viewMode === 'product' && filteredProductGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
      </main>

      {/* 상세 갤러리 모달 */}
      <Dialog open={detailOpen !== null} onOpenChange={(open) => !open && setDetailOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 bg-neutral-900 border-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
            <DialogTitle className="text-white font-semibold truncate">
              {detailOpen === 'site' && detailKey}
              {detailOpen === 'product' && detailKey}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              onClick={() => setDetailOpen(null)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {detailImages.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">사진이 없습니다.</p>
            ) : (
              <div className="relative flex items-center justify-center min-h-[60vh]">
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  aria-label="이전"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div className="relative inline-block max-w-full">
                  <img
                    src={detailImages[lightboxIndex]?.cloudinary_url ?? detailImages[lightboxIndex]?.thumbnail_url ?? ''}
                    alt=""
                    className="max-w-full max-h-[70vh] object-contain rounded-lg block"
                  />
                  {(() => {
                    const current = detailImages[lightboxIndex]
                    const productName = current?.product_name?.trim()
                    const colorName = current?.color_name?.trim()
                    if (!productName && !colorName) return null
                    return (
                      <div className="absolute top-2 right-2 z-10 px-3 py-2 rounded-lg bg-black/70 text-white text-sm shadow-lg backdrop-blur-sm">
                        {productName && <div className="font-medium">제품명 {productName}</div>}
                        {colorName && <div className="text-neutral-200 text-xs mt-0.5">색상 {colorName}</div>}
                      </div>
                    )
                  })()}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  aria-label="다음"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
          {detailImages.length > 0 && (
            <div className="px-4 py-2 border-t border-neutral-700 text-center text-neutral-500 text-sm">
              {lightboxIndex + 1} / {detailImages.length}
            </div>
          )}
          {/* 상담 전환 CTA: 사례 보고 감동했을 때 바로 상담 유도 */}
          <div className="px-4 pb-4 pt-2 border-t border-neutral-700">
            <Link
              to="/consultation"
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold text-sm transition-colors shadow-md"
            >
              <Sparkles className="h-4 w-4" />
              무료 레이아웃 컨설팅 신청
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
