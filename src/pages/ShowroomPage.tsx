/**
 * 고객용 시공사례 쇼룸
 * - image_assets 기준, 현장(site_name) 또는 제품(product_name) 그룹
 * - 핀터레스트 스타일 그리드, 쇼룸 비주얼
 * - 카드 클릭 시 해당 현장/제품 사진 갤러리 (모달)
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import {
  fetchShowroomImageAssets,
  fetchShowroomSiteOverrides,
  incrementImageAssetShareCount,
  saveShowroomSiteOverride,
  type ShowroomImageAsset,
  type ShowroomSiteOverride,
  type ShowroomSiteOverrideSectionKey,
} from '@/lib/imageAssetService'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Package, Images, Sparkles, FileText, MousePointerClick, MessageCircle, FileCheck, Users, Wrench, ClipboardCheck, ArrowRight, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { shareGalleryKakao } from '@/lib/kakaoShare'
import { createSharedGallery, snapshotShowroomImageAsset } from '@/lib/sharedGalleryService'

const INTERNAL_SHOWROOM = true
const INDUSTRY_PREFERRED_ORDER = ['관리형', '학원', '스터디카페', '학교', '아파트', '기타'] as const
const INDUSTRY_PAGE_SIZE = 6

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
  { tag: '스터디카페를 관리형 스타일로', industryFilter: '스터디카페리뉴얼', emoji: '🎯', message: '기존 스터디카페처럼 보여서는 차별화가 어렵습니다. 관리형 스타일 리뉴얼로 경쟁력과 엑시트 전략을 함께 준비해 보시겠습니까? 🧭' },
  { tag: '스터디카페 같은 학원 자습실', industryFilter: '학원', emoji: '😭', message: '공간만 만든다고 애들이 남을까요? 스터디카페로 유출되는 아이들을 붙잡는 건 \'공부하고 싶게 만드는\' 한 끗 차이의 가구 배치입니다. 🏫', imageSrc: '/showroom-concern-academy-study.png' },
  { tag: '고교학점제 자습공간 구축', industryFilter: '학교', emoji: '📚', message: '예산만 낭비하는 교실 리뉴얼은 이제 그만하세요. 실제 교육 현장에서 아이들의 학습 몰입도가 검증된 \'성공적인 학교 공간\'의 표준을 제안드립니다. 🏛️', imageSrc: '/showroom-concern-highschool-credit.png' },
  { tag: '아파트 독서실 리뉴얼', industryFilter: '아파트', emoji: '🏠', message: '입주민들이 찾지 않는 무늬만 독서실인가요? 우리 아파트 가치를 높이고 아이들이 먼저 찾는 \'성공적인 커뮤니티\'의 디테일을 담았습니다. ✨', imageSrc: '/showroom-concern-apartment-reading.png' },
]

type ViewMode = 'product' | 'industry'

/** 현장별 그룹: 대표 이미지(is_main), 현장명, 지역, 업종, 제품명, 색상 */
interface SiteGroup {
  siteName: string
  externalDisplayName: string | null
  industryLabel: string
  sectionKey: ShowroomSiteOverrideSectionKey
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  hasBeforeAfter: boolean
  latestCreatedAt: string | null
  representativeScore: number
  manualPriority: number | null
}

/** 제품별 그룹: 제품명, 현장명·지역·업종·색상(해당 제품 쓰인 사례 기준) */
interface ProductGroup {
  productName: string
  siteNames: string[]
  externalDisplayNames: string[]
  locations: string[]
  businessTypes: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
}

interface IndustrySection {
  industry: string
  groups: SiteGroup[]
  siteCount: number
  photoCount: number
}

interface PaginatedIndustrySection extends IndustrySection {
  currentPage: number
  totalPages: number
  pagedGroups: SiteGroup[]
}

function getPrimaryIndustryLabel(businessTypes: string[]): string {
  const normalized = businessTypes.map((type) => type.trim()).filter(Boolean)
  if (normalized.length === 0) return '기타'

  for (const preferred of INDUSTRY_PREFERRED_ORDER) {
    if (normalized.some((type) => type === preferred || type.includes(preferred))) {
      return preferred
    }
  }

  return normalized[0]
}

function buildShowroomSiteKey(
  sectionKey: ShowroomSiteOverrideSectionKey,
  industryLabel: string,
  siteName: string
): string {
  return `${sectionKey}::${industryLabel}::${siteName}`
}

function getShowroomGroupKey(asset: ShowroomImageAsset): string {
  const spaceId = asset.space_id?.trim()
  if (spaceId) return `space:${spaceId}`
  const beforeAfterGroupId = asset.before_after_group_id?.trim()
  if (beforeAfterGroupId) return `before-after:${beforeAfterGroupId}`
  const canonicalSiteName = asset.canonical_site_name?.trim()
  if (canonicalSiteName) return `site:${canonicalSiteName}`
  const siteName = asset.site_name?.trim()
  if (siteName) return `site:${siteName}`
  return 'site:미지정'
}

function getPreferredShowroomSiteName(images: ShowroomImageAsset[]): string {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const canonical = image.canonical_site_name?.trim()
    if (canonical) return canonical
    const siteName = image.site_name?.trim()
    if (siteName) return siteName
  }
  return '미지정'
}

function getPreferredExternalDisplayName(images: ShowroomImageAsset[]): string | null {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const externalDisplayName = image.external_display_name?.trim()
    if (externalDisplayName) return externalDisplayName
  }
  return null
}

function resolveShowroomSiteOverride(
  overrideMap: Map<string, ShowroomSiteOverride>,
  sectionKey: ShowroomSiteOverrideSectionKey,
  industryLabel: string,
  images: ShowroomImageAsset[],
  preferredSiteName: string
): ShowroomSiteOverride | undefined {
  const candidates = [
    preferredSiteName,
    ...Array.from(
      new Set(
        images.flatMap((image) => [
          image.canonical_site_name?.trim() ?? '',
          image.site_name?.trim() ?? '',
        ]).filter(Boolean)
      )
    ),
  ]

  for (const siteName of candidates) {
    const override = overrideMap.get(buildShowroomSiteKey(sectionKey, industryLabel, siteName))
    if (override) return override
  }
  return undefined
}

function parseProductSeries(productName: string): {
  baseName: string
  seriesSuffix: string | null
  normalizedName: string
} {
  const normalizedName = productName.trim().replace(/\s+/g, ' ')
  if (!normalizedName) {
    return { baseName: '', seriesSuffix: null, normalizedName: '' }
  }

  const firstToken = normalizedName.split(' ')[0] ?? normalizedName
  const tokenMatch = firstToken.match(/^(.*?)([A-Za-z]+)$/)
  if (!tokenMatch) {
    return { baseName: normalizedName, seriesSuffix: null, normalizedName }
  }

  const tokenBase = tokenMatch[1]?.trim()
  const seriesSuffix = tokenMatch[2]?.toUpperCase() ?? null
  if (!tokenBase || !seriesSuffix) {
    return { baseName: normalizedName, seriesSuffix: null, normalizedName }
  }

  const rest = normalizedName.slice(firstToken.length).trim()
  const baseName = `${tokenBase}${rest ? ` ${rest}` : ''}`.trim()
  return {
    baseName: baseName || normalizedName,
    seriesSuffix,
    normalizedName,
  }
}

function compareSeriesSuffix(a: string | null, b: string | null): number {
  if (a && !b) return -1
  if (!a && b) return 1
  if (!a && !b) return 0
  return a!.localeCompare(b!, 'en', { numeric: true })
}

function getLatestCreatedAt(images: ShowroomImageAsset[]): string | null {
  let latestTime = 0
  let latestValue: string | null = null

  images.forEach((image) => {
    const createdAt = image.created_at?.trim() ?? ''
    if (!createdAt) return
    const time = new Date(createdAt).getTime()
    if (!Number.isFinite(time)) return
    if (time > latestTime) {
      latestTime = time
      latestValue = createdAt
    }
  })

  return latestValue
}

function getRecencyScore(latestCreatedAt: string | null): number {
  if (!latestCreatedAt) return 0
  const ageMs = Date.now() - new Date(latestCreatedAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays <= 30) return 12
  if (ageDays <= 90) return 8
  if (ageDays <= 180) return 4
  return 0
}

function getRepresentativeScore(
  images: ShowroomImageAsset[],
  products: string[],
  colors: string[],
  hasBeforeAfter: boolean,
  latestCreatedAt: string | null
): number {
  const photoScore = Math.min(30, images.length * 3)
  const beforeAfterScore = hasBeforeAfter ? 18 : 0
  const mainBonus = images.some((image) => image.is_main) ? 10 : 0
  const productVarietyScore = Math.min(12, products.length * 4)
  const colorVarietyScore = Math.min(8, colors.length * 2)
  const totalViews = images.reduce((sum, image) => sum + Math.max(0, image.view_count ?? 0), 0)
  const totalShares = images.reduce((sum, image) => sum + Math.max(0, image.share_count ?? 0), 0)
  const averageInternalScore = images.length > 0
    ? images.reduce((sum, image) => sum + Math.max(0, image.internal_score ?? 0), 0) / images.length
    : 0
  const engagementScore = Math.min(
    20,
    averageInternalScore * 10 +
      Math.min(5, Math.log10(totalViews + 1) * 2.5) +
      Math.min(5, Math.log10(totalShares + 1) * 4)
  )
  const recencyScore = getRecencyScore(latestCreatedAt)

  return Math.round(
    (photoScore + beforeAfterScore + mainBonus + productVarietyScore + colorVarietyScore + engagementScore + recencyScore) * 10
  ) / 10
}

function compareSiteGroups(a: SiteGroup, b: SiteGroup): number {
  const aHasManual = a.manualPriority != null
  const bHasManual = b.manualPriority != null
  if (aHasManual && !bHasManual) return -1
  if (!aHasManual && bHasManual) return 1
  if (aHasManual && bHasManual && a.manualPriority !== b.manualPriority) {
    return (a.manualPriority ?? Number.MAX_SAFE_INTEGER) - (b.manualPriority ?? Number.MAX_SAFE_INTEGER)
  }
  if (a.representativeScore !== b.representativeScore) return b.representativeScore - a.representativeScore

  const aTime = a.latestCreatedAt ? new Date(a.latestCreatedAt).getTime() : 0
  const bTime = b.latestCreatedAt ? new Date(b.latestCreatedAt).getTime() : 0
  if (aTime !== bTime) return bTime - aTime

  return a.siteName.localeCompare(b.siteName, 'ko')
}

function buildSiteGroups(
  assets: ShowroomImageAsset[],
  overrideMap: Map<string, ShowroomSiteOverride> = new Map(),
  sectionKey: ShowroomSiteOverrideSectionKey = 'industry'
): SiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()
  for (const a of assets) {
    const siteKey = getShowroomGroupKey(a)
    const list = bySite.get(siteKey) ?? []
    list.push(a)
    bySite.set(siteKey, list)
  }
  const groups: SiteGroup[] = []
  for (const [, images] of bySite) {
    const siteName = getPreferredShowroomSiteName(images)
    const externalDisplayName = getPreferredExternalDisplayName(images)
    const mainImage = images.find((i) => i.is_main) ?? images[0] ?? null
    const location = images[0]?.location?.trim() ?? ''
    const businessTypes = Array.from(new Set(images.map((i) => i.business_type?.trim()).filter(Boolean) as string[]))
    const products = Array.from(new Set(images.map((i) => i.product_name?.trim()).filter(Boolean) as string[]))
    const colors = Array.from(new Set(images.map((i) => i.color_name?.trim()).filter(Boolean) as string[]))
    const industryLabel = getPrimaryIndustryLabel(businessTypes)
    const hasBefore = images.some((i) => i.before_after_role === 'before')
    const hasAfter = images.some((i) => i.before_after_role === 'after')
    const latestCreatedAt = getLatestCreatedAt(images)
    const override = resolveShowroomSiteOverride(overrideMap, sectionKey, industryLabel, images, siteName)
    groups.push({
      siteName,
      externalDisplayName,
      industryLabel,
      sectionKey,
      location,
      businessTypes,
      products,
      colors,
      images,
      mainImage,
      hasBeforeAfter: hasBefore && hasAfter,
      latestCreatedAt,
      representativeScore: getRepresentativeScore(images, products, colors, hasBefore && hasAfter, latestCreatedAt),
      manualPriority: override?.manual_priority ?? null,
    })
  }
  return groups.sort(compareSiteGroups)
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
      const sortedImages = [...images].sort((a, b) => {
        const aMain = a.is_main ? 1 : 0
        const bMain = b.is_main ? 1 : 0
        if (aMain !== bMain) return bMain - aMain

        const aScore = (a.internal_score ?? 0) + (a.share_count ?? 0) * 0.2 + (a.view_count ?? 0) * 0.05
        const bScore = (b.internal_score ?? 0) + (b.share_count ?? 0) * 0.2 + (b.view_count ?? 0) * 0.05
        if (aScore !== bScore) return bScore - aScore

        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
      const siteNames = Array.from(new Set(images.map((i) => i.site_name?.trim()).filter(Boolean) as string[]))
      const externalDisplayNames = Array.from(new Set(images.map((i) => i.external_display_name?.trim()).filter(Boolean) as string[]))
      const locations = Array.from(new Set(images.map((i) => i.location?.trim()).filter(Boolean) as string[]))
      const businessTypes = Array.from(new Set(images.map((i) => i.business_type?.trim()).filter(Boolean) as string[]))
      const colors = Array.from(new Set(images.map((i) => i.color_name?.trim()).filter(Boolean) as string[]))
      return {
        productName,
        siteNames,
        externalDisplayNames,
        locations,
        businessTypes,
        colors,
        images: sortedImages,
        mainImage: sortedImages[0] ?? null,
      }
    })
    .sort((a, b) => {
      const aSeries = parseProductSeries(a.productName)
      const bSeries = parseProductSeries(b.productName)

      const aHasSeries = aSeries.seriesSuffix ? 1 : 0
      const bHasSeries = bSeries.seriesSuffix ? 1 : 0
      if (aHasSeries !== bHasSeries) return bHasSeries - aHasSeries

      const baseCompare = aSeries.baseName.localeCompare(bSeries.baseName, 'ko')
      if (baseCompare !== 0) return baseCompare

      const seriesCompare = compareSeriesSuffix(aSeries.seriesSuffix, bSeries.seriesSuffix)
      if (seriesCompare !== 0) return seriesCompare

      if (a.siteNames.length !== b.siteNames.length) return b.siteNames.length - a.siteNames.length
      if (a.images.length !== b.images.length) return b.images.length - a.images.length
      return aSeries.normalizedName.localeCompare(bSeries.normalizedName, 'ko')
    })
}

function buildShowroomContactUrl(params: {
  siteName?: string | null
  category?: string | null
  imageUrl?: string | null
  showroomContext?: string | null
  showroomEntryLabel?: string | null
}): string {
  const query = new URLSearchParams()
  if (params.siteName?.trim()) query.set('site_name', params.siteName.trim())
  if (params.category?.trim()) query.set('category', params.category.trim())
  if (params.imageUrl?.trim()) query.set('image_url', params.imageUrl.trim())
  if (params.showroomContext?.trim()) query.set('showroom_context', params.showroomContext.trim())
  if (params.showroomEntryLabel?.trim()) query.set('showroom_entry_label', params.showroomEntryLabel.trim())
  return `/contact?${query.toString()}`
}

function isConcernTag(value: string | null | undefined): value is string {
  if (!value) return false
  return CONCERN_CARDS.some((card) => card.tag === value)
}

export default function ShowroomPage() {
  const headerRef = useRef<HTMLElement | null>(null)
  const selectionBarRef = useRef<HTMLDivElement | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [siteOverrides, setSiteOverrides] = useState<ShowroomSiteOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('industry')
  const [selectedProductSeries, setSelectedProductSeries] = useState<string | null>(null)
  const [selectedProductFilter, setSelectedProductFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedConcernTag, setSelectedConcernTag] = useState<string | null>(() => {
    const concern = searchParams.get('concern')
    if (isConcernTag(concern)) return concern
    const legacyTag = searchParams.get('tag')
    return isConcernTag(legacyTag) ? legacyTag : null
  })
  const [detailOpen, setDetailOpen] = useState<'site' | 'product' | 'beforeAfter' | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [industryPageBySection, setIndustryPageBySection] = useState<Record<string, number>>({})
  const [beforeAfterPage, setBeforeAfterPage] = useState(1)
  const [priorityInputByKey, setPriorityInputByKey] = useState<Record<string, string>>({})
  const [savingPriorityByKey, setSavingPriorityByKey] = useState<Record<string, boolean>>({})
  const [priorityEditorOpenByKey, setPriorityEditorOpenByKey] = useState<Record<string, boolean>>({})

  // 딥링크: URL ?q, ?concern 변경 시(뒤로가기 등) 상태 동기화. 레거시 ?tag도 지원.
  useEffect(() => {
    const q = searchParams.get('q')
    const concern = searchParams.get('concern')
    const legacyTag = searchParams.get('tag')
    setSearchQuery(q ?? (isConcernTag(legacyTag) ? '' : (legacyTag ?? '')))
    setSelectedConcernTag(isConcernTag(concern) ? concern : (isConcernTag(legacyTag) ? legacyTag : null))
  }, [searchParams])

  const updateShowroomParams = (next: { q?: string; concern?: string | null }) => {
    const params = new URLSearchParams(searchParams)
    const q = next.q ?? searchQuery
    const concern = next.concern === undefined ? selectedConcernTag : next.concern
    params.delete('tag')
    if (q.trim()) params.set('q', q.trim())
    else params.delete('q')
    if (concern?.trim()) params.set('concern', concern.trim())
    else params.delete('concern')
    setSearchParams(params)
  }

  const setSearchQueryAndUrl = (value: string) => {
    setSearchQuery(value)
    updateShowroomParams({ q: value })
  }

  const setConcernTagAndUrl = (value: string | null) => {
    setSelectedConcernTag(value)
    updateShowroomParams({ concern: value })
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchShowroomImageAssets(), fetchShowroomSiteOverrides()]).then(([list, overrides]) => {
      if (!cancelled) {
        setAssets(list)
        setSiteOverrides(overrides)
        setPriorityInputByKey(
          overrides.reduce<Record<string, string>>((acc, override) => {
            if (override.manual_priority != null) {
              acc[buildShowroomSiteKey(override.section_key, override.industry_label, override.site_name)] = String(override.manual_priority)
            }
            return acc
          }, {})
        )
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const siteOverrideMap = useMemo(
    () =>
      new Map(
        siteOverrides.map((override) => [
          buildShowroomSiteKey(override.section_key, override.industry_label, override.site_name),
          override,
        ] as const)
      ),
    [siteOverrides]
  )

  const showroomAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role !== 'before'),
    [assets]
  )
  const beforeAfterAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role === 'before' || asset.before_after_role === 'after'),
    [assets]
  )
  const siteGroups = useMemo(() => buildSiteGroups(showroomAssets, siteOverrideMap, 'industry'), [showroomAssets, siteOverrideMap])
  const productGroups = useMemo(() => buildProductGroups(showroomAssets), [showroomAssets])
  const beforeAfterGroups = useMemo(
    () => buildSiteGroups(beforeAfterAssets, siteOverrideMap, 'before_after').filter((group) => group.hasBeforeAfter),
    [beforeAfterAssets, siteOverrideMap]
  )
  const productOptions = useMemo(
    () => productGroups.map((group) => group.productName),
    [productGroups]
  )
  const productSeriesOptions = useMemo(() => {
    const grouped = new Map<string, string[]>()
    productOptions.forEach((productName) => {
      const parsed = parseProductSeries(productName)
      const bucket = parsed.seriesSuffix ? parsed.baseName : '기타'
      const list = grouped.get(bucket) ?? []
      list.push(productName)
      grouped.set(bucket, list)
    })
    return Array.from(grouped.entries())
      .map(([seriesName, products]) => ({
        seriesName,
        products: products.sort((a, b) => {
          const aParsed = parseProductSeries(a)
          const bParsed = parseProductSeries(b)
          const suffixCompare = compareSeriesSuffix(aParsed.seriesSuffix, bParsed.seriesSuffix)
          if (suffixCompare !== 0) return suffixCompare
          return a.localeCompare(b, 'ko')
        }),
      }))
      .sort((a, b) => {
        if (a.seriesName === '기타' && b.seriesName !== '기타') return 1
        if (a.seriesName !== '기타' && b.seriesName === '기타') return -1
        return a.seriesName.localeCompare(b.seriesName, 'ko')
      })
  }, [productOptions])
  const currentSeriesProducts = useMemo(
    () => productSeriesOptions.find((option) => option.seriesName === selectedProductSeries)?.products ?? [],
    [productSeriesOptions, selectedProductSeries]
  )
  const searchTrim = searchQuery.trim()
  const searchLower = searchTrim.toLowerCase()
  /** 카드 태그와 일치할 때 해당 카드의 업종 키워드로만 필터 (업종 기준) */
  const industryFilterForTag = useMemo(() => {
    if (INTERNAL_SHOWROOM) return null
    const card = CONCERN_CARDS.find((c) => c.tag === selectedConcernTag)
    return card?.industryFilter ?? null
  }, [selectedConcernTag])

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
        (g.externalDisplayName ?? '').toLowerCase().includes(searchLower) ||
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
        g.externalDisplayNames.some((name) => name.toLowerCase().includes(searchLower)) ||
        g.locations.some((l) => l.toLowerCase().includes(searchLower)) ||
        g.businessTypes.some((b) => b.toLowerCase().includes(searchLower)) ||
        g.colors.some((c) => c.toLowerCase().includes(searchLower))
    )
  }, [productGroups, searchTrim, searchLower, industryFilterForTag])

  const productFilteredGroups = useMemo(() => {
    if (selectedProductSeries) {
      const seriesGroups = selectedProductSeries === '기타'
        ? filteredProductGroups.filter((group) => !parseProductSeries(group.productName).seriesSuffix)
        : filteredProductGroups.filter((group) => parseProductSeries(group.productName).baseName === selectedProductSeries)
      if (!selectedProductFilter) return seriesGroups
      return seriesGroups.filter((group) => group.productName === selectedProductFilter)
    }
    if (!selectedProductFilter) return filteredProductGroups
    return filteredProductGroups.filter((g) => g.productName === selectedProductFilter)
  }, [filteredProductGroups, selectedProductSeries, selectedProductFilter])

  useEffect(() => {
    if (selectedProductSeries && !productSeriesOptions.some((option) => option.seriesName === selectedProductSeries)) {
      setSelectedProductSeries(null)
    }
  }, [productSeriesOptions, selectedProductSeries])

  useEffect(() => {
    if (!selectedProductFilter) return
    if (selectedProductSeries) {
      if (!currentSeriesProducts.includes(selectedProductFilter)) {
        setSelectedProductFilter(null)
      }
      return
    }
    if (!productOptions.includes(selectedProductFilter)) {
      setSelectedProductFilter(null)
    }
  }, [selectedProductFilter, selectedProductSeries, currentSeriesProducts, productOptions])

  const industrySections = useMemo<IndustrySection[]>(() => {
    const grouped = new Map<string, SiteGroup[]>()

    filteredSiteGroups.forEach((group) => {
      const industry = getPrimaryIndustryLabel(group.businessTypes)
      const list = grouped.get(industry) ?? []
      list.push(group)
      grouped.set(industry, list)
    })

    const labels = Array.from(grouped.keys())
    const orderedLabels = [
      ...INDUSTRY_PREFERRED_ORDER.filter((industry) => labels.includes(industry)),
      ...labels
        .filter((industry) => !INDUSTRY_PREFERRED_ORDER.includes(industry as typeof INDUSTRY_PREFERRED_ORDER[number]))
        .sort((a, b) => a.localeCompare(b, 'ko')),
    ]

    return orderedLabels.map((industry) => {
      const groups = grouped.get(industry) ?? []
      return {
        industry,
        groups,
        siteCount: groups.length,
        photoCount: groups.reduce((total, group) => total + group.images.length, 0),
      }
    })
  }, [filteredSiteGroups])

  const paginatedIndustrySections = useMemo<PaginatedIndustrySection[]>(() => {
    return industrySections.map((section) => {
      const totalPages = Math.max(1, Math.ceil(section.groups.length / INDUSTRY_PAGE_SIZE))
      const currentPage = Math.min(Math.max(industryPageBySection[section.industry] ?? 1, 1), totalPages)
      const startIndex = (currentPage - 1) * INDUSTRY_PAGE_SIZE
      const pagedGroups = section.groups.slice(startIndex, startIndex + INDUSTRY_PAGE_SIZE)

      return {
        ...section,
        currentPage,
        totalPages,
        pagedGroups,
      }
    })
  }, [industrySections, industryPageBySection])

  const beforeAfterShowcaseGroups = useMemo(() => {
    if (INTERNAL_SHOWROOM) return []
    if (selectedConcernTag === '스터디카페를 관리형 스타일로') {
      return beforeAfterGroups.filter((group) =>
        group.businessTypes.some((type) => type.includes('스터디카페') || type.includes('관리형'))
      )
    }
    return []
  }, [beforeAfterGroups, selectedConcernTag])
  const visibleBeforeAfterGroups = useMemo(
    () => (INTERNAL_SHOWROOM ? beforeAfterGroups : beforeAfterShowcaseGroups),
    [beforeAfterGroups, beforeAfterShowcaseGroups]
  )
  const featuredBeforeAfterGroups = useMemo(
    () => visibleBeforeAfterGroups.slice(0, 3),
    [visibleBeforeAfterGroups]
  )
  const beforeAfterTotalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleBeforeAfterGroups.length / INDUSTRY_PAGE_SIZE)),
    [visibleBeforeAfterGroups.length]
  )
  const currentBeforeAfterPage = Math.min(Math.max(beforeAfterPage, 1), beforeAfterTotalPages)
  const pagedBeforeAfterGroups = useMemo(() => {
    const startIndex = (currentBeforeAfterPage - 1) * INDUSTRY_PAGE_SIZE
    return visibleBeforeAfterGroups.slice(startIndex, startIndex + INDUSTRY_PAGE_SIZE)
  }, [visibleBeforeAfterGroups, currentBeforeAfterPage])
  const showroomContactContext = useMemo(() => {
    if (INTERNAL_SHOWROOM) return null
    if (selectedConcernTag === '스터디카페를 관리형 스타일로') {
      return {
        showroomContext: '관리형 스타일 전환과 엑시트 전략을 염두에 두고 문의한 고객',
        showroomEntryLabel: '스터디카페를 관리형 스타일로',
      }
    }
    return null
  }, [selectedConcernTag])

  const detailImages = useMemo(() => {
    if (!detailKey || detailOpen === null) return []
    if (detailOpen === 'site') {
      const g = siteGroups.find((x) => x.siteName === detailKey)
      return g?.images ?? []
    }
    if (detailOpen === 'beforeAfter') {
      const g = beforeAfterGroups.find((x) => x.siteName === detailKey)
      return g?.images ?? []
    }
    const g = productGroups.find((x) => x.productName === detailKey)
    return g?.images ?? []
  }, [detailOpen, detailKey, siteGroups, productGroups, beforeAfterGroups])

  const openDetail = (mode: 'site' | 'product' | 'beforeAfter', key: string) => {
    setDetailOpen(mode)
    setDetailKey(key)
    setLightboxIndex(0)
  }

  const goPrev = () => setLightboxIndex((i) => (i <= 0 ? detailImages.length - 1 : i - 1))
  const goNext = () => setLightboxIndex((i) => (i >= detailImages.length - 1 ? 0 : i + 1))

  const createShareGalleryUrl = useCallback(async () => {
    if (selectedImageIds.size === 0) return ''
    const snapshots = Array.from(selectedImageIds)
      .map((id) => assets.find((asset) => asset.id === id))
      .filter((asset): asset is ShowroomImageAsset => asset != null)
      .map(snapshotShowroomImageAsset)

    if (snapshots.length === 0) {
      throw new Error('전송할 이미지를 찾을 수 없습니다.')
    }

    const result = await createSharedGallery({
      items: snapshots,
      title: '선별 시공 사례',
      description: `고객에게 보여줄 참고 이미지 ${snapshots.length}장`,
      source: 'showroom',
    })
    return result.url
  }, [selectedImageIds, assets])

  const toggleSelectedImage = useCallback((id: string) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const markSelectedImagesShared = useCallback(() => {
    selectedImageIds.forEach((id) => {
      incrementImageAssetShareCount(id).catch(() => {})
    })
  }, [selectedImageIds])

  const copyShareLink = useCallback(async () => {
    if (selectedImageIds.size === 0) {
      toast.error('먼저 전송할 이미지를 선택하세요.')
      return
    }
    try {
      const shareGalleryUrl = await createShareGalleryUrl()
      await navigator.clipboard.writeText(shareGalleryUrl)
      markSelectedImagesShared()
      toast.success('선택 이미지 링크를 복사했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
    }
  }, [selectedImageIds.size, createShareGalleryUrl, markSelectedImagesShared])

  const shareSelectedImagesKakao = useCallback(async () => {
    if (selectedImageIds.size === 0) {
      toast.error('먼저 전송할 이미지를 선택하세요.')
      return
    }
    try {
      const shareGalleryUrl = await createShareGalleryUrl()
      markSelectedImagesShared()
      shareGalleryKakao(
        shareGalleryUrl,
        '선별 시공 사례',
        `고객에게 보여줄 참고 이미지 ${selectedImageIds.size}장`,
        () => toast.success('링크를 복사했습니다. 카카오톡에 붙여 넣어 공유하세요.')
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
    }
  }, [selectedImageIds.size, createShareGalleryUrl, markSelectedImagesShared])

  const reloadSiteOverrides = useCallback(async () => {
    const overrides = await fetchShowroomSiteOverrides()
    setSiteOverrides(overrides)
    setPriorityInputByKey((prev) => {
      const next = { ...prev }
      overrides.forEach((override) => {
        const key = buildShowroomSiteKey(override.section_key, override.industry_label, override.site_name)
        next[key] = override.manual_priority != null ? String(override.manual_priority) : ''
      })
      return next
    })
  }, [])

  const handlePriorityInputChange = useCallback((group: SiteGroup, value: string) => {
    const key = buildShowroomSiteKey(group.sectionKey, group.industryLabel, group.siteName)
    const normalized = value.replace(/[^\d]/g, '').slice(0, 4)
    setPriorityInputByKey((prev) => ({
      ...prev,
      [key]: normalized,
    }))
  }, [])

  const handlePrioritySave = useCallback(async (group: SiteGroup) => {
    const key = buildShowroomSiteKey(group.sectionKey, group.industryLabel, group.siteName)
    const rawValue = (priorityInputByKey[key] ?? '').trim()
    const manualPriority = rawValue ? Number(rawValue) : null

    if (manualPriority != null && (!Number.isInteger(manualPriority) || manualPriority <= 0)) {
      toast.error('우선순위는 1 이상의 숫자로 입력하세요.')
      return
    }

    setSavingPriorityByKey((prev) => ({ ...prev, [key]: true }))
    const { error } = await saveShowroomSiteOverride(group.siteName, group.industryLabel, manualPriority, group.sectionKey)
    setSavingPriorityByKey((prev) => ({ ...prev, [key]: false }))

    if (error) {
      toast.error('우선순위 저장에 실패했습니다.')
      return
    }

    await reloadSiteOverrides()
    toast.success(
      manualPriority == null
        ? `${group.siteName} 우선순위를 해제했습니다.`
        : `${group.siteName} 우선순위를 ${manualPriority}번으로 저장했습니다.`
    )
  }, [priorityInputByKey, reloadSiteOverrides])

  const handlePriorityClear = useCallback(async (group: SiteGroup) => {
    const key = buildShowroomSiteKey(group.sectionKey, group.industryLabel, group.siteName)
    setPriorityInputByKey((prev) => ({
      ...prev,
      [key]: '',
    }))
    setSavingPriorityByKey((prev) => ({ ...prev, [key]: true }))
    const { error } = await saveShowroomSiteOverride(group.siteName, group.industryLabel, null, group.sectionKey)
    setSavingPriorityByKey((prev) => ({ ...prev, [key]: false }))

    if (error) {
      toast.error('우선순위 해제에 실패했습니다.')
      return
    }

    await reloadSiteOverrides()
    toast.success(`${group.siteName} 우선순위를 해제했습니다.`)
  }, [reloadSiteOverrides])

  const togglePriorityEditor = useCallback((group: SiteGroup) => {
    const key = buildShowroomSiteKey(group.sectionKey, group.industryLabel, group.siteName)
    setPriorityEditorOpenByKey((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }, [])

  const moveIndustryPage = useCallback((industry: string, nextPage: number) => {
    setIndustryPageBySection((prev) => ({
      ...prev,
      [industry]: nextPage,
    }))
  }, [])

  const scrollToSectionWithOffset = useCallback((elementId: string) => {
    const target = document.getElementById(elementId)
    if (!target) return
    const headerHeight = headerRef.current?.offsetHeight ?? 0
    const selectionBarHeight = selectionBarRef.current?.offsetHeight ?? 0
    const extraGap = 16
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - selectionBarHeight - extraGap
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  const scrollToIndustrySection = useCallback((industry: string) => {
    scrollToSectionWithOffset(`showroom-industry-${industry}`)
  }, [scrollToSectionWithOffset])

  useEffect(() => {
    if (beforeAfterPage > beforeAfterTotalPages) {
      setBeforeAfterPage(beforeAfterTotalPages)
    }
  }, [beforeAfterPage, beforeAfterTotalPages])

  const scrollToBeforeAfterSection = useCallback(() => {
    scrollToSectionWithOffset('showroom-before-after-section')
  }, [scrollToSectionWithOffset])

  const renderSiteGroupCard = (
    group: SiteGroup,
    helperText: string,
    options?: { showPriorityEditor?: boolean }
  ) => {
    const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''
    const priorityKey = buildShowroomSiteKey(group.sectionKey, group.industryLabel, group.siteName)
    const priorityValue = priorityInputByKey[priorityKey] ?? (group.manualPriority != null ? String(group.manualPriority) : '')
    const isSavingPriority = savingPriorityByKey[priorityKey] === true
    const isPriorityEditorOpen = priorityEditorOpenByKey[priorityKey] === true

    const renderPriorityEditor = () => {
      if (!options?.showPriorityEditor) return null
      return (
        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-neutral-800">현장 노출 순서</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-neutral-600"
              onClick={() => togglePriorityEditor(group)}
              aria-label={isPriorityEditorOpen ? '현장 노출 순서 접기' : '현장 노출 순서 펼치기'}
            >
              {isPriorityEditorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
          {isPriorityEditorOpen && (
            <>
              <p className="mt-2 text-[11px] text-neutral-500">
                비워두면 자동 대표성 점수 순으로 정렬됩니다.
              </p>
              {group.manualPriority != null && (
                <div className="mt-2">
                  <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700">
                    현재 {group.manualPriority}번
                  </span>
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={priorityValue}
                  onChange={(e) => handlePriorityInputChange(group, e.target.value)}
                  inputMode="numeric"
                  placeholder="자동"
                  className="h-9 bg-white"
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={isSavingPriority}
                  onClick={() => void handlePrioritySave(group)}
                >
                  저장
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-neutral-400">
                  자동 점수 {group.representativeScore}
                </p>
                {group.manualPriority != null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-neutral-500"
                    disabled={isSavingPriority}
                    onClick={() => void handlePriorityClear(group)}
                  >
                    수동 순서 해제
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )
    }

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
            {group.hasBeforeAfter && (
              <span className="absolute top-2 right-2 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                Before/After
              </span>
            )}
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
            <div>
              <h3 className="font-semibold text-neutral-900 truncate">{group.siteName}</h3>
              {group.externalDisplayName && group.externalDisplayName !== group.siteName && (
                <div className="mt-1 flex items-center gap-2 min-w-0">
                  {group.businessTypes.length > 0 && (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                      {getPrimaryIndustryLabel(group.businessTypes)}
                    </span>
                  )}
                  <p className="min-w-0 truncate text-[12px] leading-tight text-amber-600">{group.externalDisplayName}</p>
                </div>
              )}
            </div>
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
        {INTERNAL_SHOWROOM && (
          <div className="p-3 border-t border-neutral-100 bg-neutral-50/50 space-y-3">
            <p className="text-xs text-neutral-500">{helperText}</p>
            {renderPriorityEditor()}
          </div>
        )}
      </div>
    )
  }

  const renderBeforeAfterCard = (group: SiteGroup) => {
    const beforeImages = group.images.filter((image) => image.before_after_role === 'before')
    const afterImages = group.images.filter((image) => image.before_after_role === 'after')
    const beforeImage = beforeImages[0] ?? null
    const afterImage = afterImages.find((image) => image.is_main) ?? afterImages[0] ?? null
    const priorityKey = buildShowroomSiteKey(group.sectionKey, group.industryLabel, group.siteName)
    const priorityValue = priorityInputByKey[priorityKey] ?? (group.manualPriority != null ? String(group.manualPriority) : '')
    const isSavingPriority = savingPriorityByKey[priorityKey] === true
    const isPriorityEditorOpen = priorityEditorOpenByKey[priorityKey] === true
    if (!beforeImage || !afterImage) return null

    return (
      <div
        key={`before-after-${group.siteName}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <button
          type="button"
          onClick={() => openDetail('beforeAfter', group.siteName)}
          className="w-full flex-1 text-left"
        >
          <div className="grid grid-cols-2">
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img
                src={beforeImage.thumbnail_url || beforeImage.cloudinary_url}
                alt={`${group.siteName} before`}
                className="w-full h-full object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                Before
              </span>
            </div>
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img
                src={afterImage.thumbnail_url || afterImage.cloudinary_url}
                alt={`${group.siteName} after`}
                className="w-full h-full object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
                After
              </span>
            </div>
          </div>
          <div className="p-4">
            <h4 className="font-semibold text-neutral-900">{group.siteName}</h4>
            {group.externalDisplayName && group.externalDisplayName !== group.siteName && (
              <div className="mt-1 flex items-center gap-2 min-w-0">
                {group.businessTypes[0] && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                    {group.businessTypes[0]}
                  </span>
                )}
                <p className="min-w-0 truncate text-[12px] leading-tight text-amber-600">{group.externalDisplayName}</p>
              </div>
            )}
            <p className="mt-1 text-sm text-neutral-600">
              전후 비교가 가능한 리뉴얼 사례입니다. 눌러서 전체 사진을 확인해 보세요.
            </p>
          </div>
        </button>
        {INTERNAL_SHOWROOM && (
          <div className="space-y-3 border-t border-neutral-100 bg-neutral-50/50 p-3">
            <p className="text-xs text-neutral-500">
              전후 비교 사례 안에서도 노출 순서를 조정해 필요한 현장을 먼저 보여줄 수 있습니다.
            </p>
            <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-neutral-800">현장 노출 순서</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-neutral-600"
                  onClick={() => togglePriorityEditor(group)}
                  aria-label={isPriorityEditorOpen ? '현장 노출 순서 접기' : '현장 노출 순서 펼치기'}
                >
                  {isPriorityEditorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {isPriorityEditorOpen && (
                <>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    비워두면 자동 대표성 점수 순으로 정렬됩니다.
                  </p>
                  {group.manualPriority != null && (
                    <div className="mt-2">
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700">
                        현재 {group.manualPriority}번
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={priorityValue}
                      onChange={(e) => handlePriorityInputChange(group, e.target.value)}
                      inputMode="numeric"
                      placeholder="자동"
                      className="h-9 bg-white"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      disabled={isSavingPriority}
                      onClick={() => void handlePrioritySave(group)}
                    >
                      저장
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-neutral-400">
                      자동 점수 {group.representativeScore}
                    </p>
                    {group.manualPriority != null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-neutral-500"
                        disabled={isSavingPriority}
                        onClick={() => void handlePriorityClear(group)}
                      >
                        수동 순서 해제
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

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
      <header ref={headerRef} className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-200 px-4 py-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 tracking-tight">
              {INTERNAL_SHOWROOM ? '내부용 시공사례 쇼룸' : '시공사례 쇼룸'}
            </h1>
            <div className="flex items-center gap-2">
              <Link to="/consultation">
                <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                  <Users className="h-4 w-4" />
                  상담 관리
                </Button>
              </Link>
              <Link to="/image-assets">
                <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                  이미지 자산 관리
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-100/80">
              <button
                type="button"
                onClick={() => setViewMode('industry')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'industry' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                업종별로 보기
              </button>
              <button
                type="button"
                onClick={() => setViewMode('product')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'product' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Package className="h-4 w-4" />
                제품별로 보기
              </button>
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder={
                  viewMode === 'product'
                      ? '제품명 검색 (예: 아카시아, 원목)'
                      : '업종, 현장명, 지역, 제품명 검색'
                }
                value={searchQuery}
                onChange={(e) => setSearchQueryAndUrl(e.target.value)}
                className="pl-9 h-10 bg-white border-neutral-200 rounded-lg"
              />
            </div>
          </div>
          {viewMode === 'product' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500 shrink-0">시리즈 선택</span>
              <div className="w-full sm:w-56">
                <select
                  value={selectedProductSeries ?? ''}
                  onChange={(e) => {
                    setSelectedProductSeries(e.target.value || null)
                    setSelectedProductFilter(null)
                  }}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400"
                >
                  <option value="">전체 시리즈</option>
                  {productSeriesOptions.map((series) => (
                    <option key={series.seriesName} value={series.seriesName}>
                      {series.seriesName}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-neutral-500 shrink-0">세부 제품</span>
              <div className="w-full sm:w-80">
                <select
                  value={selectedProductFilter ?? ''}
                  onChange={(e) => setSelectedProductFilter(e.target.value || null)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400"
                >
                  <option value="">{selectedProductSeries ? '전체 세부 제품' : '전체 제품'}</option>
                  {(selectedProductSeries ? currentSeriesProducts : productOptions).map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {viewMode === 'industry' && paginatedIndustrySections.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-2">
                {paginatedIndustrySections.map((section) => (
                  <Button
                    key={`industry-nav-${section.industry}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full"
                    onClick={() => scrollToIndustrySection(section.industry)}
                  >
                    {section.industry}
                  </Button>
                ))}
                {visibleBeforeAfterGroups.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0 rounded-full"
                    onClick={scrollToBeforeAfterSection}
                  >
                    <FileCheck className="h-4 w-4" />
                    Before/After
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {INTERNAL_SHOWROOM && selectedImageIds.size > 0 && (
        <div ref={selectionBarRef} className="sticky top-[88px] z-10 border-b border-neutral-200 bg-white/95 backdrop-blur px-4 py-3 md:px-8">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-900">{selectedImageIds.size}장 선택됨</p>
              <p className="text-xs text-neutral-500">고객에게 보여주거나 전송할 이미지를 모아둔 상태입니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyShareLink}>
                <Copy className="h-4 w-4" />
                링크 복사
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={shareSelectedImagesKakao}>
                <MessageCircle className="h-4 w-4" />
                카톡 공유
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedImageIds(new Set())}>
                선택 해제
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        {/* 메인 카피: 강렬한 헤드라인 */}
        <section className="mb-8" aria-labelledby="showroom-main-heading">
          <h1 id="showroom-main-heading" className="text-2xl md:text-3xl font-bold text-neutral-900 leading-tight mb-1">
            {INTERNAL_SHOWROOM ? (
              <>
                고객과 함께 보며 <span className="text-amber-600">설명하고 전송하는</span> 내부용 쇼룸
              </>
            ) : (
              <>
                실패하지 않는 공간 기획, 그 차이는 <span className="text-amber-600">디테일</span>에 있습니다.
              </>
            )}
          </h1>
          {INTERNAL_SHOWROOM ? (
            <>
              <p className="text-neutral-600 text-base md:text-lg">현장에서 사례를 탐색하고, 필요한 이미지를 바로 선별해 공유하세요.</p>
              <p className="text-xs md:text-sm text-neutral-500 mt-2">
                고객용 문의 유도 대신 내부 공유와 설명에 집중한 화면입니다. 이미지를 선택해 링크 복사 또는 카카오톡 공유를 사용할 수 있습니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-neutral-600 text-base md:text-lg">대표님의 공간, 어떤 변화가 필요하신가요?</p>
              <p className="text-xs md:text-sm text-neutral-500 mt-2">
                이 페이지는 다양한 사례를 탐색하는 쇼룸입니다. 상담 중 특정 사진을 따로 안내받으셨다면 전달받은 선별 공유 링크를 확인해 주세요.
              </p>
            </>
          )}
        </section>

        {featuredBeforeAfterGroups.length > 0 && (
          <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">대표 Before/After 사례</h2>
                <p className="text-sm text-neutral-600">
                  변화 폭이 큰 전후 비교 사례 3개를 먼저 보여드립니다. 더 보고 싶으면 아래 전체 전후 비교 섹션으로 이동하세요.
                </p>
              </div>
              <Button type="button" variant="outline" className="gap-2 shrink-0" onClick={scrollToBeforeAfterSection}>
                <FileCheck className="h-4 w-4" />
                전체 Before/After 보기
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {featuredBeforeAfterGroups.map((group) => renderBeforeAfterCard(group))}
            </div>
          </section>
        )}

        {/* 전문가가 먼저 질문하는 공감 카드: 말풍선 + 핵심어 하이라이트 + 성공 사례 보기 CTA */}
        {!INTERNAL_SHOWROOM && (
        <section className="mb-8" aria-labelledby="showroom-concern-heading">
          <h2 id="showroom-concern-heading" className="sr-only">고민별 시공사례 보기</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CONCERN_CARDS.map((card) => {
              const isSelected = selectedConcernTag === card.tag
              const handleCardClick = () => {
                setConcernTagAndUrl(selectedConcernTag === card.tag ? null : card.tag)
                requestAnimationFrame(() => {
                  document.getElementById('showroom-concern-result-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
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
                    <div className="flex shrink-0 self-center flex-col items-center justify-center gap-2">
                      <span
                        className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center text-3xl border-2 border-neutral-200 group-hover:border-amber-200 transition-colors overflow-hidden"
                        aria-hidden
                      >
                        {card.imageSrc ? (
                          <img src={card.imageSrc} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                          card.emoji
                        )}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        {card.industryFilter}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`pr-8 rounded-xl rounded-tl-none px-4 py-3 border border-neutral-100 group-hover:bg-amber-50/50 group-hover:border-amber-100 transition-colors ${
                          isSelected ? 'bg-amber-50/80 border-amber-200' : ''
                        }`}
                        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                      >
                      <p className="text-sm text-neutral-700 leading-relaxed font-medium">
                        {highlightKeywords(card.message)}
                      </p>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
        )}
        <div id="showroom-concern-result-anchor" className="h-px scroll-mt-28 md:scroll-mt-32" aria-hidden />
        {/* 전문가 코멘트: 해당 카드 클릭 시에만 표시 — 왼쪽 코멘트, 오른쪽 전문가 이미지(답하는 느낌) */}
        {!INTERNAL_SHOWROOM && selectedConcernTag === '관리형 창업 또는 전환' && (
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
        {!INTERNAL_SHOWROOM && selectedConcernTag === '매출 향상 스터디카페 리뉴얼' && (
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
        {!INTERNAL_SHOWROOM && selectedConcernTag === '스터디카페를 관리형 스타일로' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">같은 스터디카페처럼 보여서는 나중에 프리미엄을 받기 어렵습니다.</p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  지금 운영 중인 스터디카페라도, 공간의 인상과 동선을 <span className="font-bold text-slate-800">관리형 스타일로 재설계</span>하면 기존 매장과의 차별화가 훨씬 선명해집니다.
                </p>
                <p>
                  이것은 단순히 예쁘게 바꾸는 리뉴얼이 아닙니다. 고객이 느끼는 프리미엄을 높이고, 향후 관리형 오픈을 고민하는 인수자에게도 <span className="font-bold text-slate-800">더 설득력 있는 매장 자산</span>으로 보이게 만드는 전략입니다.
                </p>
                <p>
                  결국 잘된 리뉴얼은 현재의 경쟁력을 만들고, 나중의 엑시트 가능성까지 바꿉니다. 파인드가구는 그 흐름까지 고려해 공간을 제안합니다.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <Link
                  to={buildShowroomContactUrl({
                    category: '스터디카페 관리형 스타일 리뉴얼',
                    showroomContext: '관리형 스타일 전환과 엑시트 전략을 염두에 두고 문의한 고객',
                    showroomEntryLabel: '스터디카페를 관리형 스타일로',
                  })}
                  className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
                >
                  관리형 스타일 리뉴얼 상담하기
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
        {!INTERNAL_SHOWROOM && selectedConcernTag === '스터디카페 같은 학원 자습실' && (
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

        {!INTERNAL_SHOWROOM && selectedConcernTag === '고교학점제 자습공간 구축' && (
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

        {!INTERNAL_SHOWROOM && selectedConcernTag === '아파트 독서실 리뉴얼' && (
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
                  입주민의 만족과 단지의 가치를 함께 높이는 공간은 기본입니다. 복잡한 절차는 파인드가구가 책임지고, 입주자대표회의에는 <span className="font-bold text-slate-800">단지의 가치가 올라가는 결과</span>만 드립니다.
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

        {viewMode === 'product' && (
          <div id="showroom-gallery" className="grid grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {productFilteredGroups.map((group) => {
              const mainImg = group.mainImage
              const imageUrl = mainImg?.thumbnail_url || mainImg?.cloudinary_url || ''
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
                      {group.businessTypes.length > 0 && (
                        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                          {group.businessTypes[0]}
                        </span>
                      )}
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
                      <h3 className="font-semibold text-neutral-900 leading-snug">{group.productName}</h3>
                      <dl className="text-xs text-neutral-500 mt-1.5 space-y-0.5">
                        {group.siteNames.length > 0 && (
                          <div className="flex gap-1.5 items-start">
                            <span className="text-neutral-400 shrink-0">현장명</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap gap-1">
                                {group.siteNames.slice(0, 3).map((siteName) => (
                                  <span
                                    key={`${group.productName}-${siteName}`}
                                    className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700"
                                  >
                                    {siteName}
                                  </span>
                                ))}
                              </div>
                              {group.siteNames.length > 3 && (
                                <p className="mt-1 text-[11px] text-neutral-400">외 {group.siteNames.length - 3}개 현장</p>
                              )}
                            </div>
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
                  {INTERNAL_SHOWROOM && (
                    <div className="p-3 border-t border-neutral-100 bg-neutral-50/50 text-xs text-neutral-500">
                      관련 제품 이미지를 열어 필요한 컷을 선별하세요.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {viewMode === 'industry' && (
          <>
            <div id="showroom-gallery" className="space-y-10">
              {paginatedIndustrySections.map((section, index) => (
                <section
                  key={section.industry}
                  id={`showroom-industry-${section.industry}`}
                  className={`space-y-4 ${index > 0 ? 'border-t-4 border-neutral-300 pt-8' : ''}`}
                >
                  <div className="flex flex-col gap-1 border-b border-neutral-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-neutral-900">{section.industry}</h2>
                      <p className="text-sm text-neutral-500">
                        {section.siteCount}개 현장 · 사진 {section.photoCount}장
                      </p>
                    </div>
                    <p className="text-xs text-neutral-400">
                      비슷한 업종 사례를 위에서 아래로 비교해 보세요.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                    {section.pagedGroups.map((group) =>
                      renderSiteGroupCard(group, '업종 안에서 현장을 비교하고 필요한 이미지를 선택하세요.', {
                        showPriorityEditor: true,
                      })
                    )}
                  </div>
                  {section.totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={section.currentPage <= 1}
                        onClick={() => moveIndustryPage(section.industry, section.currentPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        이전
                      </Button>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {Array.from({ length: section.totalPages }, (_, index) => {
                          const pageNumber = index + 1
                          const isCurrent = pageNumber === section.currentPage
                          return (
                            <Button
                              key={`${section.industry}-page-${pageNumber}`}
                              type="button"
                              variant={isCurrent ? 'default' : 'outline'}
                              size="sm"
                              className="min-w-9 px-0"
                              onClick={() => moveIndustryPage(section.industry, pageNumber)}
                            >
                              {pageNumber}
                            </Button>
                          )
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={section.currentPage >= section.totalPages}
                        onClick={() => moveIndustryPage(section.industry, section.currentPage + 1)}
                      >
                        다음
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </section>
              ))}
            </div>

            {visibleBeforeAfterGroups.length > 0 && (
              <section
                id="showroom-before-after-section"
                className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:p-5 scroll-mt-28"
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-neutral-900">
                      {INTERNAL_SHOWROOM ? '전후 비교 사례' : '엑시트까지 고려한 전환 사례'}
                    </h3>
                    <p className="text-sm text-neutral-600">
                      {INTERNAL_SHOWROOM
                        ? '리뉴얼 전후 변화를 한눈에 비교할 수 있는 현장들입니다. 관심 있는 고객은 상단 버튼으로 바로 이동해 설명을 이어갈 수 있습니다.'
                        : '기존 스터디카페를 관리형 스타일로 바꿨을 때, 공간의 인상과 매각 경쟁력이 어떻게 달라지는지 전후 사례로 보여드립니다.'}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500">{visibleBeforeAfterGroups.length}개 현장</p>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pagedBeforeAfterGroups.map((group) => renderBeforeAfterCard(group))}
                </div>
                {beforeAfterTotalPages > 1 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={currentBeforeAfterPage <= 1}
                      onClick={() => setBeforeAfterPage(currentBeforeAfterPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </Button>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {Array.from({ length: beforeAfterTotalPages }, (_, index) => {
                        const pageNumber = index + 1
                        const isCurrent = pageNumber === currentBeforeAfterPage
                        return (
                          <Button
                            key={`before-after-page-${pageNumber}`}
                            type="button"
                            variant={isCurrent ? 'default' : 'outline'}
                            size="sm"
                            className="min-w-9 px-0"
                            onClick={() => setBeforeAfterPage(pageNumber)}
                          >
                            {pageNumber}
                          </Button>
                        )
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={currentBeforeAfterPage >= beforeAfterTotalPages}
                      onClick={() => setBeforeAfterPage(currentBeforeAfterPage + 1)}
                    >
                      다음
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {viewMode === 'product' && productFilteredGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
        {viewMode === 'industry' && paginatedIndustrySections.length === 0 && (
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
              {detailOpen === 'beforeAfter' && detailKey}
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
                    const beforeAfterRole = current?.before_after_role
                    if (!productName && !colorName && !beforeAfterRole) return null
                    return (
                      <div className="absolute top-2 right-2 z-10 px-3 py-2 rounded-lg bg-black/70 text-white text-sm shadow-lg backdrop-blur-sm">
                        {beforeAfterRole && (
                          <div className="mb-1">
                            <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {beforeAfterRole === 'before' ? 'Before' : 'After'}
                            </span>
                          </div>
                        )}
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
          <div className="px-4 pb-4 pt-3 border-t border-neutral-700 space-y-2">
            {detailImages[lightboxIndex] && (
              <Button
                type="button"
                variant={selectedImageIds.has(detailImages[lightboxIndex].id) ? 'secondary' : 'default'}
                className="w-full gap-2"
                onClick={() => toggleSelectedImage(detailImages[lightboxIndex].id)}
              >
                {selectedImageIds.has(detailImages[lightboxIndex].id) ? <Check className="h-4 w-4" /> : <Images className="h-4 w-4" />}
                {selectedImageIds.has(detailImages[lightboxIndex].id) ? '선택 해제' : '이 이미지 선택'}
              </Button>
            )}
            {INTERNAL_SHOWROOM ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 gap-2 border-neutral-600 text-white hover:bg-neutral-800" onClick={copyShareLink}>
                  <Copy className="h-4 w-4" />
                  링크 복사
                </Button>
                <Button type="button" variant="outline" className="flex-1 gap-2 border-neutral-600 text-white hover:bg-neutral-800" onClick={shareSelectedImagesKakao}>
                  <MessageCircle className="h-4 w-4" />
                  카톡 공유
                </Button>
              </div>
            ) : (
              <Link
                to="/consultation"
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold text-sm transition-colors shadow-md"
              >
                <Sparkles className="h-4 w-4" />
                무료 레이아웃 컨설팅 신청
              </Link>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
