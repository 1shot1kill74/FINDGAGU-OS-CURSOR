/**
 * 공개 쇼룸 전용 화면
 * - 고객 ABM / 상담 전용 엔트리
 * - 내부 쇼룸 컨텐츠 공장의 공개 RPC 데이터를 읽어 자동 업데이트
 * - 내부 운영 UI는 ShowroomPage/InternalShowroomPage에 남김
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import {
  type ShowroomImageAsset,
} from '@/lib/imageAssetService'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useColorChips } from '@/hooks/useColorChips'
import { cn } from '@/lib/utils'
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Package, Images, FileText, MessageCircle, ArrowRight, ArrowLeft, Copy, Check, Video, BarChart3, Building2, Palette, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { parseShowroomCtaAttribution, trackShowroomCtaVisit } from '@/lib/showroomCtaTracking'
import { captureShowroomAbmAttribution } from '@/lib/showroomAbmTraffic'
import { appendShowroomConcernQuery, openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'
import { trackShowroomAbmEvent, trackShowroomAbmHeaderNavClick } from '@/lib/showroomAbmTracking'
import ShowroomAeoGuideTeaser from '@/components/showroom/ShowroomAeoGuideTeaser'
import { ShowroomBeforeAfterTapPreview } from '@/components/showroom/ShowroomBeforeAfterTapPreview'

import {
  formatShowroomProductSeriesOptionLabel,
  getShowroomProductSeriesDescription,
  compareShowroomProductSeriesNames,
  HUB_FEATURED_BA_MAX_PER_INDUSTRY,
  INDUSTRY_PAGE_SIZE,
  INDUSTRY_PREFERRED_ORDER,
  SWIPE_THRESHOLD_PX,
} from '@/pages/showroom/showroomPageConstants'
import { ShowroomLightboxSlide } from '@/pages/showroom/ShowroomLightboxSlide'
import {
  prefetchShowroomLightboxNeighbors,
  prefetchShowroomLightboxThumbnails,
} from '@/pages/showroom/showroomLightboxImages'
import {
  buildColorGroups,
  buildProductGroups,
  buildSiteGroups,
  collectUniqueLabels,
  getBroadPublicLabel,
  getConcernIndustryFilter,
  getGroupPublicLabel,
  getPreferredExternalDisplayName,
  findHubBeforeAfterPageForSiteKey,
  resolveHubFeaturedBeforeAfterSections,
  getInternalShowroomSiteName,
  getPreferredShowroomSiteName,
  getPrimaryIndustryLabel,
  getPublicLabelsFromImages,
  normalizeConcernTag,
  parseProductSeries,
  compareSeriesSuffix,
  sortBeforeAfterImages,
  summarizeTopLabels,
} from '@/pages/showroom/showroomPageGrouping'
import { ShowroomExpertConsultationButton } from '@/pages/showroom/ShowroomExpertConsultationButton'
import { ShowroomMainStickyConsultCta } from '@/pages/showroom/ShowroomMainStickyConsultCta'
import { loadShowroomDataset } from '@/pages/showroom/showroomDataset'
import type {
  ColorGroup,
  IndustrySection,
  PaginatedIndustrySection,
  ProductGroup,
  SiteGroup,
  ViewMode,
} from '@/pages/showroom/showroomPageTypes'

const DETAIL_ZOOM_MIN = 1
const DETAIL_ZOOM_MAX = 4
const DETAIL_ZOOM_STEP = 0.5

function clampDetailZoom(value: number): number {
  return Math.min(DETAIL_ZOOM_MAX, Math.max(DETAIL_ZOOM_MIN, Number(value.toFixed(2))))
}

function getPointerDistance(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}

function bindPenSafeButtonHandlers(action: () => void) {
  return {
    onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
      if (event.pointerType === 'pen' || event.pointerType === 'touch') {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    },
    onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
      if (event.pointerType !== 'pen' && event.pointerType !== 'touch') return
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.releasePointerCapture(event.pointerId)
      action()
    },
    onClick(event: React.MouseEvent<HTMLButtonElement>) {
      if (event.nativeEvent instanceof PointerEvent) {
        const pointerType = event.nativeEvent.pointerType
        if (pointerType === 'pen' || pointerType === 'touch') return
      }
      action()
    },
  }
}

export type PublicShowroomSurface = 'hub' | 'gallery'

const PUBLIC_SHOWROOM_GALLERY_HREF = '/public/showroom/gallery'

export default function PublicShowroomExperience({
  surface = 'hub',
}: {
  surface?: PublicShowroomSurface
} = {}) {
  const mode = 'public' as const
  const isHub = surface === 'hub'
  const isGallery = surface === 'gallery'
  const headerRef = useRef<HTMLElement | null>(null)
  const selectionBarRef = useRef<HTMLDivElement | null>(null)
  const { chips: colorChips, isLoading: colorLoading } = useColorChips()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('industry')
  const [selectedProductSeries, setSelectedProductSeries] = useState<string | null>(null)
  const [selectedProductFilter, setSelectedProductFilter] = useState<string | null>(null)
  const [selectedColorFilter, setSelectedColorFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedConcernTag, setSelectedConcernTag] = useState<string | null>(() => {
    const concern = normalizeConcernTag(searchParams.get('concern'))
    if (concern) return concern
    return normalizeConcernTag(searchParams.get('tag'))
  })
  const [detailOpen, setDetailOpen] = useState<'site' | 'product' | 'color' | 'beforeAfter' | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [detailViewMode, setDetailViewMode] = useState<'grid' | 'image'>('grid')
  const [detailZoom, setDetailZoom] = useState(DETAIL_ZOOM_MIN)
  const [detailPan, setDetailPan] = useState({ x: 0, y: 0 })
  const [industryPageBySection, setIndustryPageBySection] = useState<Record<string, number>>({})
  const [hubBaPageByIndustry, setHubBaPageByIndustry] = useState<Record<string, number>>({})
  const [selectedHubBaIndustry, setSelectedHubBaIndustry] = useState<string | null>(null)
  const [focusedHubBaSiteName, setFocusedHubBaSiteName] = useState<string | null>(null)
  const focusedHubBaSiteParamRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const refreshInFlightRef = useRef(false)
  const lastAutoRefreshAtRef = useRef(0)
  const trackedPublicEntryRef = useRef(false)
  const trackedAbmEnterRef = useRef(false)
  const originalArchivePath = '/public/showroom/original'
  // 딥링크: URL ?q, ?concern 변경 시(뒤로가기 등) 상태 동기화. 레거시 ?tag도 지원.
  useEffect(() => {
    const q = searchParams.get('q')
    const concern = searchParams.get('concern')
    const legacyTag = searchParams.get('tag')
    setSearchQuery(q ?? (normalizeConcernTag(legacyTag) ? '' : (legacyTag ?? '')))
    const nextConcern = normalizeConcernTag(concern) ?? normalizeConcernTag(legacyTag)
    setSelectedConcernTag(nextConcern)
  }, [searchParams])

  useEffect(() => {
    if (mode !== 'public' || trackedPublicEntryRef.current) return
    trackedPublicEntryRef.current = true

    const attribution = parseShowroomCtaAttribution(searchParams)
    if (!attribution) return

    void trackShowroomCtaVisit({
      attribution,
      landingPath: window.location.pathname,
      landingQuery: window.location.search,
    }).catch((error) => {
      console.error('showroom_cta_visit_track_failed', error)
    })
  }, [mode, searchParams])

  useEffect(() => {
    if (mode !== 'public') return
    captureShowroomAbmAttribution({
      pathname: window.location.pathname,
      search: window.location.search,
      jobId: searchParams.get('jobId'),
    })
  }, [mode, searchParams])

  useEffect(() => {
    if (mode !== 'public' || trackedAbmEnterRef.current) return
    trackedAbmEnterRef.current = true

    captureShowroomAbmAttribution({
      pathname: window.location.pathname,
      search: window.location.search,
      jobId: searchParams.get('jobId'),
    })

    const concern = searchParams.get('concern')
    trackShowroomAbmEvent({
      eventName: 'abm_showroom_enter',
      concern: normalizeConcernTag(concern),
      metadata: {
        landingPath: window.location.pathname,
        landingQuery: window.location.search,
      },
    })
  }, [mode, searchParams])

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

  const loadShowroomData = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (refreshInFlightRef.current) return

    refreshInFlightRef.current = true
    if (!background) setLoading(true)

    try {
      const { assets: list } = await loadShowroomDataset('public')
      if (!mountedRef.current) return

      setAssets(list)
    } catch (error) {
      if (!background) {
        toast.error(error instanceof Error ? error.message : '쇼룸 데이터를 불러오지 못했습니다.')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
      refreshInFlightRef.current = false
    }
  }, [])

  const refreshShowroomOnReturn = useCallback(() => {
    if (document.visibilityState === 'hidden') return

    const now = Date.now()
    if (now - lastAutoRefreshAtRef.current < 1500) return

    lastAutoRefreshAtRef.current = now
    void loadShowroomData({ background: true })
  }, [loadShowroomData])

  useEffect(() => {
    mountedRef.current = true
    void loadShowroomData()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshShowroomOnReturn()
    }
    const onFocus = () => {
      refreshShowroomOnReturn()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadShowroomData, refreshShowroomOnReturn])

  const siteOverrideMap = useMemo(() => new Map(), [])

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
  const colorGroups = useMemo(() => buildColorGroups(showroomAssets), [showroomAssets])
  const beforeAfterGroups = useMemo(
    () => buildSiteGroups(beforeAfterAssets, siteOverrideMap, 'before_after').filter((group) => group.hasBeforeAfter),
    [beforeAfterAssets, siteOverrideMap]
  )
  const productOptions = useMemo(
    () => productGroups.map((group) => group.productName),
    [productGroups]
  )
  const colorOptions = useMemo(
    () => colorGroups.map((group) => group.colorName),
    [colorGroups]
  )
  const colorOptionsByGroup = useMemo(() => {
    const grouped: Record<'Standard' | 'Special' | 'Other', string[]> = {
      Standard: [],
      Special: [],
      Other: [],
    }
    const availableColors = new Set(colorOptions)
    const seen = new Set<string>()

    colorChips.forEach((chip) => {
      if (!availableColors.has(chip.color_name)) return
      const group = chip.color_type === 'Standard' || chip.color_type === 'Special' || chip.color_type === 'Other'
        ? chip.color_type
        : 'Other'
      if (seen.has(chip.color_name)) return
      grouped[group].push(chip.color_name)
      seen.add(chip.color_name)
    })

    colorOptions.forEach((colorName) => {
      if (seen.has(colorName)) return
      grouped.Other.push(colorName)
      seen.add(colorName)
    })

    return grouped
  }, [colorChips, colorOptions])
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
      .sort((a, b) => compareShowroomProductSeriesNames(a.seriesName, b.seriesName))
  }, [productOptions])
  const currentSeriesProducts = useMemo(
    () => productSeriesOptions.find((option) => option.seriesName === selectedProductSeries)?.products ?? [],
    [productSeriesOptions, selectedProductSeries]
  )
  const searchTrim = searchQuery.trim()
  const searchLower = searchTrim.toLowerCase()
  const concernIndustryFilter = useMemo(
    () => getConcernIndustryFilter(selectedConcernTag),
    [selectedConcernTag]
  )
  const industryFilterForTag = concernIndustryFilter

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

  const filteredColorGroups = useMemo(() => {
    if (!searchTrim) return colorGroups
    if (industryFilterForTag) {
      const kw = industryFilterForTag.toLowerCase()
      return colorGroups.filter((g) =>
        g.businessTypes.some((b) => (b || '').toLowerCase().includes(kw))
      )
    }
    return colorGroups.filter(
      (g) =>
        g.colorName.toLowerCase().includes(searchLower) ||
        g.siteNames.some((s) => s.toLowerCase().includes(searchLower)) ||
        g.externalDisplayNames.some((name) => name.toLowerCase().includes(searchLower)) ||
        g.locations.some((l) => l.toLowerCase().includes(searchLower)) ||
        g.businessTypes.some((b) => b.toLowerCase().includes(searchLower)) ||
        g.products.some((p) => p.toLowerCase().includes(searchLower))
    )
  }, [colorGroups, searchTrim, searchLower, industryFilterForTag])

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

  const colorFilteredGroups = useMemo(() => {
    if (!selectedColorFilter) return filteredColorGroups
    return filteredColorGroups.filter((group) => group.colorName === selectedColorFilter)
  }, [filteredColorGroups, selectedColorFilter])

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

  useEffect(() => {
    if (!selectedColorFilter) return
    if (!colorOptions.includes(selectedColorFilter)) {
      setSelectedColorFilter(null)
    }
  }, [selectedColorFilter, colorOptions])

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
    ].filter((industry) => industry !== '기타')

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

  const visibleBeforeAfterGroups = useMemo(() => beforeAfterGroups, [beforeAfterGroups])
  const hubFeaturedBeforeAfterSections = useMemo(
    () => resolveHubFeaturedBeforeAfterSections(visibleBeforeAfterGroups),
    [visibleBeforeAfterGroups],
  )
  const hasHubFeaturedBeforeAfter = hubFeaturedBeforeAfterSections.length > 0
  const paginatedHubBaSections = useMemo(() => {
    const pageSize = HUB_FEATURED_BA_MAX_PER_INDUSTRY
    return hubFeaturedBeforeAfterSections.map((section) => {
      const totalPages = Math.max(1, Math.ceil(section.groups.length / pageSize))
      const currentPage = Math.min(Math.max(hubBaPageByIndustry[section.industry] ?? 1, 1), totalPages)
      const startIndex = (currentPage - 1) * pageSize
      return {
        ...section,
        currentPage,
        totalPages,
        pagedGroups: section.groups.slice(startIndex, startIndex + pageSize),
      }
    })
  }, [hubFeaturedBeforeAfterSections, hubBaPageByIndustry])
  const activeHubBaSection = useMemo(() => {
    if (paginatedHubBaSections.length === 0) return null
    return (
      paginatedHubBaSections.find((section) => section.industry === selectedHubBaIndustry) ??
      paginatedHubBaSections[0]
    )
  }, [paginatedHubBaSections, selectedHubBaIndustry])

  useEffect(() => {
    if (paginatedHubBaSections.length === 0) {
      if (selectedHubBaIndustry !== null) setSelectedHubBaIndustry(null)
      return
    }
    const exists = paginatedHubBaSections.some((section) => section.industry === selectedHubBaIndustry)
    if (!exists) {
      setSelectedHubBaIndustry(paginatedHubBaSections[0].industry)
    }
  }, [paginatedHubBaSections, selectedHubBaIndustry])
  const detailImages = useMemo(() => {
    if (!detailKey || detailOpen === null) return []
    if (detailOpen === 'site') {
      const g = siteGroups.find((x) => x.siteName === detailKey)
      return g?.images ?? []
    }
    if (detailOpen === 'beforeAfter') {
      const g = beforeAfterGroups.find((x) => x.siteName === detailKey)
      return g ? sortBeforeAfterImages(g.images) : []
    }
    if (detailOpen === 'product') {
      const g = productGroups.find((x) => x.productName === detailKey)
      return g?.images ?? []
    }
    const g = colorGroups.find((x) => x.colorName === detailKey)
    return g?.images ?? []
  }, [detailOpen, detailKey, siteGroups, productGroups, colorGroups, beforeAfterGroups])
  const detailDisplayTitle = useMemo(() => {
    if (!detailKey || detailOpen === null) return ''

    if (detailOpen === 'site') {
      const group = siteGroups.find((item) => item.siteName === detailKey)
      return group ? getGroupPublicLabel(group) : detailKey
    }
    if (detailOpen === 'beforeAfter') {
      const group = beforeAfterGroups.find((item) => item.siteName === detailKey)
      return group ? getGroupPublicLabel(group) : detailKey
    }
    return detailKey
  }, [beforeAfterGroups, detailKey, detailOpen, siteGroups])
  const detailGridClassName = useMemo(() => {
    if (detailImages.length <= 4) return 'grid grid-cols-2 gap-3 md:grid-cols-4'
    if (detailImages.length <= 8) return 'grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5'
    return 'grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-6'
  }, [detailImages.length])
  const detailThumbAspectClassName = detailImages.length > 8 ? 'aspect-[5/3]' : 'aspect-[4/3]'

  useEffect(() => {
    if (detailOpen === null || detailImages.length === 0) return
    prefetchShowroomLightboxThumbnails(detailImages)
  }, [detailOpen, detailKey, detailImages])

  useEffect(() => {
    if (detailOpen === null || detailViewMode !== 'image' || detailImages.length === 0) return
    prefetchShowroomLightboxNeighbors(detailImages, lightboxIndex, 2)
  }, [detailOpen, detailImages, detailViewMode, lightboxIndex])

  const detailImageFrameRef = useRef<HTMLDivElement | null>(null)
  const detailAnimatedImageIdRef = useRef<string | null>(null)
  const detailTransitionDirectionRef = useRef<'next' | 'prev'>('next')
  const detailActivePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const detailPinchStartRef = useRef<{ distance: number; zoom: number } | null>(null)
  const detailPanStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const detailDismissLockRef = useRef(false)

  const openDetail = (mode: 'site' | 'product' | 'color' | 'beforeAfter', key: string) => {
    if (detailDismissLockRef.current) return
    trackShowroomAbmEvent({
      eventName: 'abm_gallery_open',
      concern: selectedConcernTag,
      siteName: mode === 'site' || mode === 'beforeAfter' ? key : null,
      metadata: {
        galleryMode: mode,
        viewMode,
        detailKey: key,
      },
    })
    detailAnimatedImageIdRef.current = null
    detailTransitionDirectionRef.current = 'next'
    setDetailViewMode('grid')
    setDetailOpen(mode)
    setDetailKey(key)
    setLightboxIndex(0)
  }

  const closeDetail = useCallback(() => {
    setDetailOpen(null)
    setDetailViewMode('grid')
    detailDismissLockRef.current = true
    window.setTimeout(() => {
      detailDismissLockRef.current = false
    }, 400)
  }, [])

  const returnDetailToGrid = useCallback(() => {
    setDetailViewMode('grid')
  }, [])

  const handleDetailHeaderDismiss = useCallback(() => {
    if (detailViewMode === 'image') {
      returnDetailToGrid()
      return
    }
    closeDetail()
  }, [closeDetail, detailViewMode, returnDetailToGrid])

  const openDetailImage = useCallback((index: number) => {
    setLightboxIndex(index)
    setDetailViewMode('image')
  }, [])

  const goPrev = useCallback(() => {
    detailTransitionDirectionRef.current = 'prev'
    setLightboxIndex((i) => (i <= 0 ? detailImages.length - 1 : i - 1))
  }, [detailImages.length])
  const goNext = useCallback(() => {
    detailTransitionDirectionRef.current = 'next'
    setLightboxIndex((i) => (i >= detailImages.length - 1 ? 0 : i + 1))
  }, [detailImages.length])
  const detailPointerStartRef = useRef<{ x: number; y: number } | null>(null)

  const resetDetailZoom = useCallback(() => {
    setDetailZoom(DETAIL_ZOOM_MIN)
    setDetailPan({ x: 0, y: 0 })
    detailPointerStartRef.current = null
    detailActivePointersRef.current.clear()
    detailPinchStartRef.current = null
    detailPanStartRef.current = null
  }, [])

  const updateDetailZoom = useCallback((nextZoom: number) => {
    const clamped = clampDetailZoom(nextZoom)
    setDetailZoom(clamped)
    if (clamped <= DETAIL_ZOOM_MIN) {
      setDetailPan({ x: 0, y: 0 })
    }
  }, [])

  const zoomDetailIn = useCallback(() => {
    setDetailZoom((current) => clampDetailZoom(current + DETAIL_ZOOM_STEP))
  }, [])

  const zoomDetailOut = useCallback(() => {
    setDetailZoom((current) => {
      const next = clampDetailZoom(current - DETAIL_ZOOM_STEP)
      if (next <= DETAIL_ZOOM_MIN) setDetailPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  const handleDetailPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    detailActivePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const pointers = Array.from(detailActivePointersRef.current.values())
    if (pointers.length >= 2) {
      detailPointerStartRef.current = null
      detailPanStartRef.current = null
      detailPinchStartRef.current = { distance: getPointerDistance(pointers), zoom: detailZoom }
      return
    }

    detailPinchStartRef.current = null
    if (detailZoom > DETAIL_ZOOM_MIN) {
      detailPointerStartRef.current = null
      detailPanStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: detailPan.x,
        panY: detailPan.y,
      }
      return
    }

    if (!event.isPrimary) return
    detailPointerStartRef.current = { x: event.clientX, y: event.clientY }
  }, [detailPan.x, detailPan.y, detailZoom])

  const handleDetailPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!detailActivePointersRef.current.has(event.pointerId)) return
    detailActivePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const pointers = Array.from(detailActivePointersRef.current.values())
    if (pointers.length >= 2 && detailPinchStartRef.current) {
      const nextDistance = getPointerDistance(pointers)
      if (nextDistance > 0 && detailPinchStartRef.current.distance > 0) {
        updateDetailZoom(detailPinchStartRef.current.zoom * (nextDistance / detailPinchStartRef.current.distance))
      }
      return
    }

    if (detailZoom > DETAIL_ZOOM_MIN && detailPanStartRef.current) {
      setDetailPan({
        x: detailPanStartRef.current.panX + event.clientX - detailPanStartRef.current.x,
        y: detailPanStartRef.current.panY + event.clientY - detailPanStartRef.current.y,
      })
    }
  }, [detailZoom, updateDetailZoom])

  const handleDetailPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = detailPointerStartRef.current
    detailPointerStartRef.current = null
    const wasGesture = detailActivePointersRef.current.size > 1 || Boolean(detailPinchStartRef.current) || detailZoom > DETAIL_ZOOM_MIN
    detailActivePointersRef.current.delete(event.pointerId)
    detailPinchStartRef.current = null
    detailPanStartRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (wasGesture || !start || detailImages.length <= 1) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return
    if (deltaX < 0) goNext()
    else goPrev()
  }, [detailImages.length, detailZoom, goNext, goPrev])
  const handleDetailPointerCancel = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    detailPointerStartRef.current = null
    detailPanStartRef.current = null
    detailPinchStartRef.current = null
    if (event) {
      detailActivePointersRef.current.delete(event.pointerId)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } else {
      detailActivePointersRef.current.clear()
    }
  }, [])
  useEffect(() => {
    const currentImageId = detailImages[lightboxIndex]?.id ?? null
    if (!currentImageId) {
      detailAnimatedImageIdRef.current = null
      return
    }
    if (detailAnimatedImageIdRef.current === null) {
      detailAnimatedImageIdRef.current = currentImageId
      return
    }
    if (detailAnimatedImageIdRef.current === currentImageId) return
    detailAnimatedImageIdRef.current = currentImageId
    const frame = detailImageFrameRef.current
    if (!frame) return
    const offset = detailTransitionDirectionRef.current === 'next' ? 28 : -28
    frame.animate(
      [
        { opacity: 0.55, transform: `translateX(${offset}px) scale(0.985)` },
        { opacity: 1, transform: 'translateX(0) scale(1)' },
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }
    )
  }, [detailImages, lightboxIndex])

  useEffect(() => {
    resetDetailZoom()
  }, [detailOpen, detailViewMode, lightboxIndex, resetDetailZoom])

  const getBeforeAfterStoryHref = useCallback((group: SiteGroup) => {
    const candidates = [
      getInternalShowroomSiteName(group.images).trim(),
      group.siteName.trim(),
    ].filter((value): value is string => Boolean(value) && value !== '미지정')
    const siteName = candidates[0]
    if (!siteName) return null
    return appendShowroomConcernQuery(
      `/public/showroom/case/${encodeURIComponent(siteName)}`,
      selectedConcernTag,
    )
  }, [selectedConcernTag])

  const moveIndustryPage = useCallback((industry: string, nextPage: number) => {
    setIndustryPageBySection((prev) => ({
      ...prev,
      [industry]: nextPage,
    }))
  }, [])

  const moveHubBaPage = useCallback((industry: string, nextPage: number) => {
    setHubBaPageByIndustry((prev) => ({
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

  const goToGalleryPage = useCallback(() => {
    trackShowroomAbmHeaderNavClick({ target: 'gallery_more', concern: selectedConcernTag })
    trackShowroomAbmEvent({
      eventName: 'abm_gallery_browse',
      concern: selectedConcernTag,
      metadata: { viewMode, entry: 'hub_nav' },
    })
    navigate(PUBLIC_SHOWROOM_GALLERY_HREF)
  }, [navigate, selectedConcernTag, viewMode])

  /** URL 해시로 진입 시 해당 섹션으로 스크롤 */
  useEffect(() => {
    if (!isHub) return
    if (loading) return
    const hash = location.hash.replace(/^#/, '')
    if (hash !== 'showroom-featured-ba-heading') {
      return
    }
    const t = window.setTimeout(() => {
      scrollToSectionWithOffset(hash)
    }, 280)
    return () => window.clearTimeout(t)
  }, [isHub, location.hash, loading, scrollToSectionWithOffset])

  /** 숏츠·SNS deep link(?baSite=) → 해당 현장이 있는 BA 페이지로 이동 */
  useEffect(() => {
    if (!isHub || loading) return
    const baSite = (searchParams.get('baSite') ?? searchParams.get('site') ?? '').trim()
    if (!baSite) return
    if (focusedHubBaSiteParamRef.current === baSite) return

    const hit = findHubBeforeAfterPageForSiteKey(
      hubFeaturedBeforeAfterSections,
      baSite,
      HUB_FEATURED_BA_MAX_PER_INDUSTRY,
    )
    if (!hit) return

    focusedHubBaSiteParamRef.current = baSite
    setSelectedHubBaIndustry(hit.industry)
    setHubBaPageByIndustry((prev) => ({ ...prev, [hit.industry]: hit.page }))
    setFocusedHubBaSiteName(hit.siteName)

    const t = window.setTimeout(() => {
      scrollToSectionWithOffset('showroom-featured-ba-heading')
    }, 320)
    return () => window.clearTimeout(t)
  }, [
    isHub,
    loading,
    searchParams,
    hubFeaturedBeforeAfterSections,
    scrollToSectionWithOffset,
  ])

  const renderSectionBookmarkTabs = () => (
    <nav
      className="fixed right-0 top-32 z-30 flex flex-col items-end gap-2 md:top-40"
      aria-label="쇼룸 주요 섹션 바로가기"
    >
      {isHub ? (
          <button
            type="button"
            onClick={goToGalleryPage}
            className="rounded-l-2xl border border-r-0 border-[#5f7058]/25 bg-white/95 px-2.5 py-3 text-[12px] font-semibold text-[#43503e] shadow-[0_8px_22px_rgba(0,0,0,0.14)] backdrop-blur transition hover:-translate-x-1 hover:bg-[#f4f7f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5f7058]/35"
            style={{ writingMode: 'vertical-rl' }}
          >
            시공사례 더보기
          </button>
      ) : (
        <Link
          to="/public/showroom"
          className="rounded-l-2xl border border-r-0 border-[#5f7058]/25 bg-white/95 px-2.5 py-3 text-[12px] font-semibold text-[#43503e] shadow-[0_8px_22px_rgba(0,0,0,0.14)] backdrop-blur transition hover:-translate-x-1 hover:bg-[#f4f7f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5f7058]/35"
          style={{ writingMode: 'vertical-rl' }}
        >
          쇼룸 홈
        </Link>
      )}
    </nav>
  )

  const renderSiteGroupCard = (
    group: SiteGroup,
    helperText: string,
    options?: { showPriorityEditor?: boolean }
  ) => {
    const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''
    const publicLabel = getGroupPublicLabel(group)
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
              alt={publicLabel}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              loading="lazy"
              decoding="async"
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
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 flex-1 flex flex-col min-h-0">
            <div>
              <h3 className="font-semibold text-neutral-900 truncate">{publicLabel}</h3>
              
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
        
      </div>
    )
  }

  const renderBeforeAfterCard = (
    group: SiteGroup,
    options?: { linkToStory?: boolean; compactPreview?: boolean; highlighted?: boolean },
  ) => {
    const beforeImages = group.images.filter((image) => image.before_after_role === 'before')
    const afterImages = group.images.filter((image) => image.before_after_role === 'after')
    const beforeImage = beforeImages[0] ?? null
    const afterImage = afterImages.find((image) => image.is_main) ?? afterImages[0] ?? null
    const publicLabel = getGroupPublicLabel(group)
    const storyHref = options?.linkToStory ? getBeforeAfterStoryHref(group) : null
    const compactPreview = options?.compactPreview ?? false
    const highlighted = options?.highlighted ?? false
    if (!beforeImage || !afterImage) return null

    const beforeSrc = beforeImage.thumbnail_url || beforeImage.cloudinary_url || ''
    const afterSrc = afterImage.thumbnail_url || afterImage.cloudinary_url || ''
    const trackStoryClick = () => {
      trackShowroomAbmEvent({
        eventName: 'abm_ba_story_click',
        concern: selectedConcernTag,
        siteName: group.siteName,
        industry: group.businessTypes[0] ?? null,
      })
    }
    const beforeAfterPreview = (
      <ShowroomBeforeAfterTapPreview
        beforeSrc={beforeSrc}
        afterSrc={afterSrc}
        altLabel={publicLabel}
        aspectClassName={compactPreview ? 'aspect-[16/10]' : 'aspect-[4/3]'}
        imageHref={storyHref}
        onImageActivate={storyHref ? trackStoryClick : undefined}
      />
    )
    const footerBlock = (
      <div className={cn('flex flex-col gap-3 border-t border-neutral-100', compactPreview ? 'p-3' : 'p-4')}>
        <h4
          className={cn(
            'font-semibold leading-snug text-neutral-900',
            compactPreview ? 'text-sm' : undefined,
          )}
        >
          {publicLabel}
        </h4>
        <span
          className={cn(
            'inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#5f7058] font-semibold text-white shadow-sm transition-colors',
            'group-hover:bg-[#4a5744] group-active:bg-[#3f4b3a]',
            compactPreview ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm',
          )}
        >
          사례 이야기·사진 더 보기
          <ArrowRight className={cn('shrink-0', compactPreview ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
        </span>
      </div>
    )

    return (
      <div
        key={`before-after-${group.siteName}`}
        id={highlighted ? 'showroom-hub-ba-focus' : undefined}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
          compactPreview && 'rounded-xl shadow-none hover:translate-y-0 hover:shadow-sm',
          highlighted && 'ring-2 ring-[#5f7058] ring-offset-2',
        )}
      >
        {/* 슬라이더=비교, 하단=이야기 진입. 허브에는 블로그 티저 문단을 두지 않음 */}
        {beforeAfterPreview}
        {storyHref ? (
          <Link
            to={storyHref}
            className="group flex w-full flex-1 flex-col text-left"
            onClick={trackStoryClick}
          >
            {footerBlock}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openDetail('beforeAfter', group.siteName)}
            className="group flex w-full flex-1 flex-col text-left"
          >
            {footerBlock}
          </button>
        )}
      </div>
    )
  }

  const mugwortSelectedFillClass =
    'border border-[#455240] bg-gradient-to-b from-[#5f7058] to-[#4a5744] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(45,55,40,0.18)]'

  const selectedBrowseButtonClass = cn(
    mugwortSelectedFillClass,
    'font-semibold text-white hover:from-[#667a60] hover:to-[#505f4a] hover:text-white',
  )

  const handleGalleryViewModeChange = (mode: ViewMode) => {
    trackShowroomAbmEvent({
      eventName: 'abm_gallery_browse',
      concern: selectedConcernTag,
      metadata: { viewMode: mode },
    })
    setViewMode(mode)
  }

  const renderGalleryViewModeButton = (
    mode: ViewMode,
    label: string,
    Icon: typeof Building2,
  ) => {
    const isActive = viewMode === mode
    return (
      <Button
        type="button"
        variant="outline"
        role="tab"
        aria-selected={isActive}
        className={cn(
          'h-10 min-w-0 flex-1 gap-2 rounded-lg border-neutral-200 bg-white px-3 shadow-sm sm:flex-none sm:px-4',
          'hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-[#5f7058]/35',
          isActive
            ? selectedBrowseButtonClass
            : 'font-medium text-neutral-700',
        )}
        onClick={() => handleGalleryViewModeChange(mode)}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Button>
    )
  }

  const renderGalleryBrowseControls = () => (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div
            className="flex w-full max-w-2xl flex-wrap gap-2"
            role="tablist"
            aria-label="사례 사진 보기 기준"
          >
            {renderGalleryViewModeButton('industry', '업종별로 보기', Building2)}
            {renderGalleryViewModeButton('product', '제품별로 보기', Package)}
            {renderGalleryViewModeButton('color', '색상별로 보기', Palette)}
          </div>
          <p className="text-sm leading-relaxed text-neutral-600">
            업종 · 제품 · 색상 기준으로 사례 사진을 바로 찾을 수 있습니다.
          </p>
        </div>
        <div className="relative w-full max-w-md lg:shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={
              viewMode === 'product'
                ? '제품명 검색 (예: 아카시아, 원목)'
                : viewMode === 'color'
                  ? '색상명 검색 (예: 백색, 모번)'
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
                  {formatShowroomProductSeriesOptionLabel(series.seriesName)}
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
      {viewMode === 'color' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500 shrink-0">색상 선택</span>
          <div className="w-full sm:w-80">
            <select
              value={selectedColorFilter ?? ''}
              onChange={(e) => setSelectedColorFilter(e.target.value || null)}
              disabled={colorLoading}
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400"
            >
              <option value="">전체 색상</option>
              {colorOptionsByGroup.Standard.length > 0 ? (
                <optgroup label="기본 컬러 (Standard)">
                  {colorOptionsByGroup.Standard.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {colorOptionsByGroup.Special.length > 0 ? (
                <optgroup label="스페셜 컬러 (Special)">
                  {colorOptionsByGroup.Special.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {colorOptionsByGroup.Other.length > 0 ? (
                <optgroup label="기타">
                  {colorOptionsByGroup.Other.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
        </div>
      )}
      {viewMode === 'industry' && paginatedIndustrySections.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {paginatedIndustrySections
              .filter((section) => section.industry !== '기타')
              .map((section) => (
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
          </div>
          <p className="mt-2 text-sm font-semibold text-amber-600">먼저 업종을 선택하세요</p>
          
        </div>
      )}
    </>
  )

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
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 tracking-tight">
                {'시공사례 쇼룸'}
              </h1>
              
            </div>
          </div>
          
        </div>
      </header>
      {renderSectionBookmarkTabs()}

      <main className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        {isHub ? (
          <section className="mb-6" aria-labelledby="showroom-main-heading">
            <h1 id="showroom-main-heading" className="text-2xl md:text-3xl font-bold text-neutral-900 leading-tight mb-1">
              실패하지 않는 공간 기획, 그 차이는 <span className="text-amber-600">디테일</span>에 있습니다.
            </h1>
            <p className="text-neutral-600 text-base md:text-lg">
              우리 업종에 가까운 변화부터 확인한 뒤, 시공사례 더보기에서 사진을 더 찾아보세요.
            </p>
          </section>
        ) : (
          <section className="mb-6" aria-labelledby="showroom-gallery-main-heading">
            <Button asChild variant="ghost" size="sm" className="mb-3 h-8 gap-1.5 px-0 text-neutral-600">
              <Link to="/public/showroom">
                <ArrowLeft className="h-4 w-4" />
                쇼룸 홈
              </Link>
            </Button>
            <h1 id="showroom-gallery-main-heading" className="text-2xl md:text-3xl font-bold text-neutral-900 leading-tight mb-1">
              시공사례 더보기
            </h1>
            <p className="text-neutral-600 text-base md:text-lg">
              업종 · 제품 · 색상 기준으로 After 사진을 더 둘러보세요.
            </p>
          </section>
        )}

        {isHub && hasHubFeaturedBeforeAfter && activeHubBaSection && (
          <section
            className="mb-8 scroll-mt-24 md:scroll-mt-28"
            aria-labelledby="showroom-featured-ba-heading"
          >
            <div className="mb-5">
              <h2 id="showroom-featured-ba-heading" className="text-lg font-semibold text-neutral-900">
                업종 선택
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                우리 업종을 고르면 대표 전후 사례를 보여 드립니다.
              </p>
              <div
                className="mt-3 flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="업종 선택"
              >
                {paginatedHubBaSections.map((section) => {
                  const isActive = section.industry === activeHubBaSection.industry
                  return (
                    <Button
                      key={`hub-ba-industry-${section.industry}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      role="tab"
                      aria-selected={isActive}
                      className={cn(
                        'shrink-0 rounded-full',
                        isActive
                          ? selectedBrowseButtonClass
                          : 'font-medium text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
                      )}
                      onClick={() => {
                        setSelectedHubBaIndustry(section.industry)
                        trackShowroomAbmEvent({
                          eventName: 'abm_gallery_browse',
                          concern: selectedConcernTag,
                          metadata: { hubBaIndustry: section.industry, entry: 'hub_ba_industry' },
                        })
                      }}
                    >
                      {section.title}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div
              key={`hub-ba-${activeHubBaSection.industry}`}
              id={`showroom-hub-ba-${activeHubBaSection.industry}`}
              role="tabpanel"
              aria-label={activeHubBaSection.title}
              className="scroll-mt-28 md:scroll-mt-32"
            >
              <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-sm text-neutral-600">{activeHubBaSection.blurb}</p>
                <p className="text-xs text-neutral-500">
                  {activeHubBaSection.groups.length}개 현장
                  {activeHubBaSection.totalPages > 1
                    ? ` · ${activeHubBaSection.currentPage}/${activeHubBaSection.totalPages}페이지`
                    : null}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeHubBaSection.pagedGroups.map((group) =>
                  renderBeforeAfterCard(group, {
                    linkToStory: true,
                    highlighted: focusedHubBaSiteName === group.siteName,
                  }),
                )}
              </div>
              {activeHubBaSection.totalPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={activeHubBaSection.currentPage <= 1}
                    onClick={() =>
                      moveHubBaPage(activeHubBaSection.industry, activeHubBaSection.currentPage - 1)
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                    이전
                  </Button>
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {Array.from({ length: activeHubBaSection.totalPages }, (_, index) => {
                      const pageNumber = index + 1
                      const isCurrent = pageNumber === activeHubBaSection.currentPage
                      return (
                        <Button
                          key={`hub-ba-${activeHubBaSection.industry}-page-${pageNumber}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn('min-w-9 px-0', isCurrent && selectedBrowseButtonClass)}
                          onClick={() => moveHubBaPage(activeHubBaSection.industry, pageNumber)}
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
                    disabled={activeHubBaSection.currentPage >= activeHubBaSection.totalPages}
                    onClick={() =>
                      moveHubBaPage(activeHubBaSection.industry, activeHubBaSection.currentPage + 1)
                    }
                  >
                    다음
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                onClick={goToGalleryPage}
                className="h-11 gap-2 rounded-xl bg-[#5f7058] px-5 text-sm font-semibold text-white hover:bg-[#4a5744]"
              >
                <Images className="h-4 w-4" />
                시공사례 더보기
              </Button>
            </div>
          </section>
        )}

        {isHub && !hasHubFeaturedBeforeAfter && (
          <div className="mb-8 flex justify-center">
            <Button
              type="button"
              onClick={goToGalleryPage}
              className="h-11 gap-2 rounded-xl bg-[#5f7058] px-5 text-sm font-semibold text-white hover:bg-[#4a5744]"
            >
              <Images className="h-4 w-4" />
              시공사례 더보기
            </Button>
          </div>
        )}

        {isGallery && (
          <section
            id="showroom-gallery-browse"
            className="scroll-mt-24 md:scroll-mt-28"
            aria-labelledby="showroom-gallery-browse-heading"
          >
            <div className="mb-8 flex flex-col gap-4 md:mb-10">{renderGalleryBrowseControls()}</div>
          </section>
        )}

        {isGallery && viewMode === 'product' && (
          <div id="showroom-gallery" className="grid grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {productFilteredGroups.map((group) => {
              const mainImg = group.mainImage
              const imageUrl = mainImg?.thumbnail_url || mainImg?.cloudinary_url || ''
              const visibleSiteLabels = getPublicLabelsFromImages(group.images)
              const parsedSeries = parseProductSeries(group.productName)
              const seriesDescription = parsedSeries.seriesSuffix
                ? getShowroomProductSeriesDescription(parsedSeries.baseName)
                : null
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
                        loading="lazy"
                        decoding="async"
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
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col min-h-0">
                      <h3 className="font-semibold text-neutral-900 leading-snug">{group.productName}</h3>
                      {seriesDescription ? (
                        <p className="mt-0.5 text-xs leading-snug text-neutral-500">{seriesDescription}</p>
                      ) : null}
                      <dl className="text-xs text-neutral-500 mt-1.5 space-y-0.5">
                        {visibleSiteLabels.length > 0 && (
                          <div className="flex gap-1.5 items-start">
                            <span className="text-neutral-400 shrink-0">현장명</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap gap-1">
                                {visibleSiteLabels.slice(0, 3).map((siteName) => (
                                  <span
                                    key={`${group.productName}-${siteName}`}
                                    className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700"
                                  >
                                    {siteName}
                                  </span>
                                ))}
                              </div>
                              {visibleSiteLabels.length > 3 && (
                                <p className="mt-1 text-[11px] text-neutral-400">외 {visibleSiteLabels.length - 3}개 현장</p>
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
                  
                </div>
              )
            })}
          </div>
        )}

        {isGallery && viewMode === 'color' && (
          <div id="showroom-gallery" className="grid grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {colorFilteredGroups.map((group) => {
              const mainImg = group.mainImage
              const imageUrl = mainImg?.thumbnail_url || mainImg?.cloudinary_url || ''
              const visibleSiteLabels = getPublicLabelsFromImages(group.images)
              return (
                <div
                  key={group.colorName}
                  className="flex flex-col h-full rounded-2xl overflow-hidden bg-white border border-neutral-200 shadow-sm hover:shadow-md hover:border-neutral-300 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => openDetail('color', group.colorName)}
                    className="flex flex-col flex-1 min-h-0 text-left group"
                  >
                    <div className="aspect-[4/3] relative bg-neutral-100 overflow-hidden shrink-0 rounded-t-2xl">
                      <img
                        src={imageUrl}
                        alt={group.colorName}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        loading="lazy"
                        decoding="async"
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
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col min-h-0">
                      <h3 className="font-semibold text-neutral-900 leading-snug">{group.colorName}</h3>
                      <dl className="text-xs text-neutral-500 mt-1.5 space-y-0.5">
                        {group.products.length > 0 && (
                          <div className="flex gap-1.5 items-start">
                            <span className="text-neutral-400 shrink-0">제품</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap gap-1">
                                {group.products.slice(0, 3).map((product) => (
                                  <span
                                    key={`${group.colorName}-${product}`}
                                    className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700"
                                  >
                                    {product}
                                  </span>
                                ))}
                              </div>
                              {group.products.length > 3 && (
                                <p className="mt-1 text-[11px] text-neutral-400">외 {group.products.length - 3}개 제품</p>
                              )}
                            </div>
                          </div>
                        )}
                        {visibleSiteLabels.length > 0 && (
                          <div className="flex gap-1.5 items-start">
                            <span className="text-neutral-400 shrink-0">현장명</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap gap-1">
                                {visibleSiteLabels.slice(0, 3).map((siteName) => (
                                  <span
                                    key={`${group.colorName}-${siteName}`}
                                    className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700"
                                  >
                                    {siteName}
                                  </span>
                                ))}
                              </div>
                              {visibleSiteLabels.length > 3 && (
                                <p className="mt-1 text-[11px] text-neutral-400">외 {visibleSiteLabels.length - 3}개 현장</p>
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
                      </dl>
                      <p className="mt-2 pt-2 border-t border-neutral-100 flex items-center gap-1.5 text-xs text-neutral-500">
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

        {isGallery && viewMode === 'industry' && (
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
                        {(
                          [
                            ...Array.from({ length: Math.min(section.totalPages, 4) }, (_, index) => index + 1),
                            ...(section.totalPages > 4 ? (['ellipsis'] as const) : []),
                          ] as Array<number | 'ellipsis'>
                        ).map((item) =>
                          item === 'ellipsis' ? (
                            <span
                              key={`${section.industry}-page-ellipsis`}
                              className="inline-flex min-w-9 items-center justify-center px-1 text-sm text-neutral-500"
                              aria-hidden
                            >
                              ...
                            </span>
                          ) : (
                            <Button
                              key={`${section.industry}-page-${item}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn('min-w-9 px-0', item === section.currentPage && selectedBrowseButtonClass)}
                              onClick={() => moveIndustryPage(section.industry, item)}
                            >
                              {item}
                            </Button>
                          ),
                        )}
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

            
          </>
        )}

        {isGallery && viewMode === 'product' && productFilteredGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
        {isGallery && viewMode === 'color' && colorFilteredGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
        {isGallery && viewMode === 'industry' && paginatedIndustrySections.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}

        {isGallery && (
        <section
          className="mb-8 rounded-2xl border border-[#5f7058]/20 bg-[#f6f8f4] p-5 md:p-6"
          aria-labelledby="showroom-gallery-consult-heading"
        >
          <h2 id="showroom-gallery-consult-heading" className="text-lg font-semibold text-neutral-900">
            비슷한 공간이 보이셨나요?
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            업종·규모가 가까운 사례를 골랐다면, 우리 현장에 맞게 어떻게 가져올지 이어서 확인해 보세요.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ShowroomExpertConsultationButton concern={selectedConcernTag} surface="gallery_close">
              우리 공간 맞춤 상담하기
            </ShowroomExpertConsultationButton>
            <Link
              to="/public/showroom"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              쇼룸 홈으로
            </Link>
          </div>
        </section>
        )}

        {isHub && <ShowroomAeoGuideTeaser />}

      </main>

      {/* 상세 갤러리 모달 */}
      <Dialog open={detailOpen !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent
          className={cn(
            'max-h-[90vh] overflow-hidden flex flex-col p-0 bg-neutral-900 border-0',
            detailViewMode === 'grid'
              ? 'max-w-6xl'
              : 'max-w-4xl md:h-[96vh] md:max-h-[96vh] md:w-[min(96vw,72rem)] md:max-w-[min(96vw,72rem)]',
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
            <DialogTitle className="text-white font-semibold truncate">
              {detailDisplayTitle}
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={detailViewMode === 'image' ? '전체 사진 목록으로 돌아가기' : '사진 뷰어 닫기'}
              className="relative z-20 h-11 w-11 touch-manipulation text-neutral-400 hover:text-white hover:bg-neutral-800"
              {...bindPenSafeButtonHandlers(handleDetailHeaderDismiss)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div
            className={cn(
              'flex-1 overflow-auto p-4 min-h-0',
              detailViewMode === 'image' && 'md:overflow-hidden md:flex md:flex-col md:p-3',
            )}
          >
            {detailImages.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">사진이 없습니다.</p>
            ) : detailViewMode === 'grid' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-800/70 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {'전체 사진을 둘러보세요.'}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">사진을 한눈에 보고, 필요한 이미지만 눌러 확대하세요.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200">
                    {detailImages.length}장
                  </span>
                </div>
                <div className={detailGridClassName}>
                  {detailImages.map((image, index) => {
                    const imageUrl = image.thumbnail_url || image.cloudinary_url || ''
                    const productName = image.product_name?.trim() || `사진 ${index + 1}`
                    const colorName = image.color_name?.trim()
                    return (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800 text-left transition hover:-translate-y-0.5 hover:border-neutral-500 hover:shadow-lg"
                      >
                        <button
                          type="button"
                          className="block w-full touch-manipulation text-left"
                          {...bindPenSafeButtonHandlers(() => openDetailImage(index))}
                        >
                          <div className={cn('relative bg-neutral-900', detailThumbAspectClassName)}>
                            <img
                              src={imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2 py-2 text-white">
                              <p className="truncate text-[11px] font-semibold leading-tight">{productName}</p>
                              {colorName && <p className="mt-0.5 truncate text-[10px] leading-tight text-white/75">{colorName}</p>}
                            </div>
                            {image.before_after_role && (
                              <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white">
                                {image.before_after_role === 'before' ? 'Before' : 'After'}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1 rounded-full bg-neutral-800/90 p-1 text-white">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-9 rounded-full text-white hover:bg-neutral-700"
                      onClick={zoomDetailOut}
                      disabled={detailZoom <= DETAIL_ZOOM_MIN}
                      aria-label="사진 축소"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="min-w-12 text-center text-xs font-semibold text-neutral-200">
                      {Math.round(detailZoom * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-9 rounded-full text-white hover:bg-neutral-700"
                      onClick={zoomDetailIn}
                      disabled={detailZoom >= DETAIL_ZOOM_MAX}
                      aria-label="사진 확대"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-9 rounded-full text-white hover:bg-neutral-700"
                      onClick={resetDetailZoom}
                      disabled={detailZoom <= DETAIL_ZOOM_MIN}
                      aria-label="확대 초기화"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-xs text-neutral-400">
                      {lightboxIndex + 1} / {detailImages.length}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 border-neutral-700 text-white hover:bg-neutral-800 touch-manipulation"
                      {...bindPenSafeButtonHandlers(returnDetailToGrid)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      전체 사진으로 돌아가기
                    </Button>
                  </div>
                </div>
                <div
                  className="relative flex flex-1 items-center justify-center min-h-[60vh] md:min-h-0 overflow-hidden rounded-lg"
                  style={{ touchAction: 'none' }}
                >
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                    aria-label="이전"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div
                    className={cn(
                      'relative inline-block max-w-full',
                      detailZoom > DETAIL_ZOOM_MIN ? 'cursor-move' : 'cursor-grab active:cursor-grabbing',
                    )}
                    onPointerDown={handleDetailPointerDown}
                    onPointerMove={handleDetailPointerMove}
                    onPointerUp={handleDetailPointerUp}
                    onPointerCancel={handleDetailPointerCancel}
                    onDoubleClick={() => {
                      if (detailZoom > DETAIL_ZOOM_MIN) resetDetailZoom()
                      else updateDetailZoom(2)
                    }}
                    style={{ touchAction: 'none' }}
                    ref={detailImageFrameRef}
                  >
                    <div
                      className="inline-block will-change-transform"
                      style={{
                        transform: `translate3d(${detailPan.x}px, ${detailPan.y}px, 0) scale(${detailZoom})`,
                        transformOrigin: 'center center',
                      }}
                    >
                      <ShowroomLightboxSlide
                        key={detailImages[lightboxIndex]?.id ?? lightboxIndex}
                        image={detailImages[lightboxIndex]}
                        className="max-h-[70vh] md:max-h-[calc(96vh-13rem)] md:max-w-full"
                      />
                    </div>
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
              </div>
            )}
          </div>
          {detailImages.length > 0 && detailViewMode === 'image' && (
            <div className="px-4 py-2 border-t border-neutral-700 text-center text-neutral-500 text-sm">
              {lightboxIndex + 1} / {detailImages.length}
            </div>
          )}
          <div className="px-4 pb-4 pt-3 border-t border-neutral-700 space-y-2">
            <button
              type="button"
              onClick={() => {
                openShowroomConsultationChat({
                  surface: 'gallery_modal',
                  concern: selectedConcernTag,
                  siteName: detailKey,
                })
              }}
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-md"
            >
              <MessageCircle className="h-4 w-4" />
              비슷한 공간 상담 문의
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ShowroomMainStickyConsultCta enabled={detailOpen === null} concern={selectedConcernTag} />
    </div>
  )
}
