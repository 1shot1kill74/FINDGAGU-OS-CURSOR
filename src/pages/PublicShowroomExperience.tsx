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
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Package, Images, FileText, MousePointerClick, MessageCircle, FileCheck, Users, Wrench, ClipboardCheck, ArrowRight, ArrowLeft, Copy, Check, Video, BarChart3, Building2, Palette, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { parseShowroomCtaAttribution, trackShowroomCtaVisit } from '@/lib/showroomCtaTracking'
import { openShowroomBlogTeaserLine } from '@/lib/showroomCaseCanonicalBlog'
import {
  fetchApprovedBlogShowroomCaseProfileDrafts,
  fetchPublishedShowroomCaseProfileDrafts,
  fetchShowroomCaseProfileDrafts,
} from '@/lib/showroomCaseProfileService'
import { collectShowroomAliasNamesFromImages, collectShowroomIdentityKeys } from '@/lib/showroomCaseAlias'
import { appendShowroomConcernQuery, openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'
import { trackShowroomAbmEvent } from '@/lib/showroomAbmTracking'

import {
  CONCERN_CARDS,
  formatShowroomProductSeriesOptionLabel,
  getShowroomProductSeriesDescription,
  compareShowroomProductSeriesNames,
  INDUSTRY_PAGE_SIZE,
  INDUSTRY_PREFERRED_ORDER,
  SWIPE_THRESHOLD_PX,
} from '@/pages/showroom/showroomPageConstants'
import { highlightKeywords } from '@/pages/showroom/showroomHighlightKeywords'
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
  getConcernIndustryDisplayLabel,
  getConcernIndustryFilter,
  getGroupPublicLabel,
  getPreferredExternalDisplayName,
  resolveConcernBeforeAfterGroups,
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
import { loadShowroomDataset } from '@/pages/showroom/showroomDataset'
import type {
  ColorGroup,
  IndustrySection,
  PaginatedIndustrySection,
  ProductGroup,
  ShowroomCaseProfileDraftState,
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

export default function PublicShowroomExperience() {
  const mode = 'public' as const
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
  const [beforeAfterPage, setBeforeAfterPage] = useState(1)
  const [caseProfileDraftBySite, setCaseProfileDraftBySite] = useState<Record<string, ShowroomCaseProfileDraftState>>({})
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
    setSelectedConcernTag(normalizeConcernTag(concern) ?? normalizeConcernTag(legacyTag))
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
    if (mode !== 'public' || trackedAbmEnterRef.current) return
    trackedAbmEnterRef.current = true

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

  const setConcernTagAndUrl = (value: string | null) => {
    setSelectedConcernTag(value)
    updateShowroomParams({ concern: value })
    if (mode === 'public' && value) {
      trackShowroomAbmEvent({
        eventName: 'abm_concern_select',
        concern: value,
      })
    }
  }

  const buildIndustryAwareDisplayName = useCallback((siteName: string | null | undefined, industry: string | null | undefined) => {
    const base = getBroadPublicLabel(siteName, null).trim()
    const normalizedIndustry = (industry ?? '').trim()
    if (!base || !normalizedIndustry) return base
    if (base.includes(normalizedIndustry)) return base

    const displayIndustryTokens = ['관리형', '학원', '스터디카페', '학교', '아파트', '기타']
    for (const token of displayIndustryTokens) {
      if (token !== normalizedIndustry && base.includes(token)) {
        return base.replace(token, normalizedIndustry)
      }
    }

    const parts = base.split(' ')
    const last = parts.length > 0 ? parts[parts.length - 1] ?? '' : ''
    if (/^\d{4}$/.test(last) && parts.length >= 2) {
      return [...parts.slice(0, -1), normalizedIndustry, last].join(' ')
    }
    return `${base} ${normalizedIndustry}`.trim()
  }, [])

  const readGeneratedDisplayName = useCallback((response: unknown): string | null => {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return null
    const record = response as Record<string, unknown>
    const direct = typeof record.displayName === 'string' ? record.displayName.trim() : ''
    if (direct) return direct
    const request = record.request
    if (!request || typeof request !== 'object' || Array.isArray(request)) return null
    const nested = typeof (request as Record<string, unknown>).displayName === 'string'
      ? ((request as Record<string, unknown>).displayName as string).trim()
      : ''
    return nested || null
  }, [])

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

  const visibleBeforeAfterGroups = useMemo(() => beforeAfterGroups, [beforeAfterGroups])
  const concernBeforeAfterGroups = useMemo(
    () => resolveConcernBeforeAfterGroups(beforeAfterGroups, selectedConcernTag, concernIndustryFilter),
    [beforeAfterGroups, concernIndustryFilter, selectedConcernTag]
  )
  const featuredBeforeAfterGroups = useMemo(
    () => visibleBeforeAfterGroups.slice(0, 3),
    [visibleBeforeAfterGroups]
  )
  const concernBeforeAfterTotalPages = useMemo(
    () => Math.max(1, Math.ceil(concernBeforeAfterGroups.length / INDUSTRY_PAGE_SIZE)),
    [concernBeforeAfterGroups.length]
  )
  const currentConcernBeforeAfterPage = Math.min(
    Math.max(beforeAfterPage, 1),
    concernBeforeAfterTotalPages
  )
  const pagedConcernBeforeAfterGroups = useMemo(() => {
    const startIndex = (currentConcernBeforeAfterPage - 1) * INDUSTRY_PAGE_SIZE
    return concernBeforeAfterGroups.slice(startIndex, startIndex + INDUSTRY_PAGE_SIZE)
  }, [concernBeforeAfterGroups, currentConcernBeforeAfterPage])
  const beforeAfterTotalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleBeforeAfterGroups.length / INDUSTRY_PAGE_SIZE)),
    [visibleBeforeAfterGroups.length]
  )
  const currentBeforeAfterPage = Math.min(Math.max(beforeAfterPage, 1), beforeAfterTotalPages)
  const pagedBeforeAfterGroups = useMemo(() => {
    const startIndex = (currentBeforeAfterPage - 1) * INDUSTRY_PAGE_SIZE
    return visibleBeforeAfterGroups.slice(startIndex, startIndex + INDUSTRY_PAGE_SIZE)
  }, [visibleBeforeAfterGroups, currentBeforeAfterPage])
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
    if (detailImages.length <= 8) return 'grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
    return 'grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-6'
  }, [detailImages.length])
  const detailThumbAspectClassName = detailImages.length > 8 ? 'aspect-[5/3] md:aspect-[4/3]' : 'aspect-[4/3] md:aspect-[5/4]'

  useEffect(() => {
    if (detailOpen === null || detailImages.length === 0) return
    prefetchShowroomLightboxThumbnails(detailImages)
  }, [detailOpen, detailKey, detailImages])

  useEffect(() => {
    if (detailOpen === null || detailViewMode !== 'image' || detailImages.length === 0) return
    prefetchShowroomLightboxNeighbors(detailImages, lightboxIndex, 2)
  }, [detailOpen, detailImages, detailViewMode, lightboxIndex])

  useEffect(() => {
    const siteNames = Array.from(new Set(
      beforeAfterGroups.flatMap((group) => collectShowroomAliasNamesFromImages(group.images))
    ))
    if (siteNames.length === 0) return

    let cancelled = false
    void Promise.all([
      fetchShowroomCaseProfileDrafts(siteNames),
      fetchPublishedShowroomCaseProfileDrafts(),
      fetchApprovedBlogShowroomCaseProfileDrafts(),
    ])
      .then(([exactRows, publishedRows, approvedBlogRows]) => {
        if (cancelled) return
        setCaseProfileDraftBySite((prev) => {
          const next = { ...prev }
          const mergedRows = new Map<string, typeof exactRows[number]>()
          ;[...exactRows, ...publishedRows, ...approvedBlogRows].forEach((row) => {
            const siteName = row.siteName.trim()
            if (!siteName) return
            const existing = mergedRows.get(siteName)
            if (!existing) {
              mergedRows.set(siteName, row)
              return
            }
            mergedRows.set(siteName, {
              ...existing,
              painPoint: existing.painPoint ?? row.painPoint,
              headlineHook: existing.headlineHook ?? row.headlineHook,
              cardNewsPublication: row.cardNewsPublication.isPublished
                ? row.cardNewsPublication
                : existing.cardNewsPublication,
              canonicalBlogPost: existing.canonicalBlogPost ?? row.canonicalBlogPost,
            })
          })

          mergedRows.forEach((row) => {
            const publicSiteName = getBroadPublicLabel(row.siteName, null)
            const publicCanonicalSiteName = getBroadPublicLabel(row.canonicalSiteName, null)
            const industryAwareSiteName = buildIndustryAwareDisplayName(row.siteName, row.industry)
            const industryAwareCanonicalSiteName = buildIndustryAwareDisplayName(row.canonicalSiteName, row.industry)
            const canonicalBlogTitle = row.canonicalBlogPost?.title?.trim() ?? ''
            const canonicalBlogSeoTitle = row.canonicalBlogPost?.seo.title?.trim() ?? ''
            const cardNewsDisplayName = readGeneratedDisplayName(row.cardNewsGeneration.response)
            const blogDisplayName = readGeneratedDisplayName(row.blogGeneration.response)
            const aliasKeys = [
              row.siteName.trim(),
              row.canonicalSiteName?.trim() ?? '',
              publicSiteName,
              publicCanonicalSiteName,
              industryAwareSiteName,
              industryAwareCanonicalSiteName,
              canonicalBlogTitle,
              canonicalBlogSeoTitle,
              cardNewsDisplayName ?? '',
              blogDisplayName ?? '',
            ].filter(Boolean)
            const identityKeys = collectShowroomIdentityKeys(aliasKeys)
            const keys = Array.from(new Set([
              ...aliasKeys,
              ...identityKeys,
            ]))
            const value = {
              painPoint: row.painPoint ?? '',
              headlineHook: row.headlineHook ?? '',
              cardNewsPublication: {
                isPublished: row.cardNewsPublication.isPublished,
                siteKey: row.cardNewsPublication.siteKey,
              },
              blogTeaserLine: openShowroomBlogTeaserLine(row.canonicalBlogPost),
            }
            keys.forEach((key) => {
              next[key] = value
            })
          })
          return next
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [beforeAfterGroups, buildIndustryAwareDisplayName, readGeneratedDisplayName])
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

  const getBeforeAfterProfileDraft = useCallback((group: SiteGroup): ShowroomCaseProfileDraftState => {
    const publicLabel = getGroupPublicLabel(group)
    const imageAliases = collectShowroomAliasNamesFromImages(group.images)
    const aliases = Array.from(new Set([
      group.siteName,
      publicLabel,
      group.externalDisplayName ?? '',
      ...imageAliases,
      ...collectShowroomIdentityKeys([
        group.siteName,
        publicLabel,
        group.externalDisplayName ?? '',
        ...imageAliases,
      ]),
    ].filter(Boolean)))
    const matched = aliases
      .map((key) => caseProfileDraftBySite[key])
      .find(Boolean)
    return matched
      ?? caseProfileDraftBySite[group.siteName]
      ?? (group.externalDisplayName ? caseProfileDraftBySite[group.externalDisplayName] : undefined)
      ?? (publicLabel ? caseProfileDraftBySite[publicLabel] : undefined)
      ?? {
      painPoint: '',
      headlineHook: '',
      cardNewsPublication: {
        isPublished: false,
        siteKey: null,
      },
      blogTeaserLine: null,
    }
  }, [caseProfileDraftBySite])

  const getBeforeAfterStoryHref = useCallback((group: SiteGroup) => {
    const candidates = [
      getPreferredShowroomSiteName(group.images).trim(),
      getGroupPublicLabel(group),
      group.siteName.trim(),
      group.externalDisplayName?.trim(),
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

  const jumpToGalleryView = useCallback((mode: ViewMode) => {
    trackShowroomAbmEvent({
      eventName: 'abm_gallery_browse',
      concern: selectedConcernTag,
      metadata: { viewMode: mode },
    })
    setViewMode(mode)
    requestAnimationFrame(() => {
      scrollToSectionWithOffset('showroom-gallery-browse')
    })
  }, [scrollToSectionWithOffset, selectedConcernTag])

  useEffect(() => {
    setBeforeAfterPage(1)
  }, [selectedConcernTag])

  useEffect(() => {
    if (beforeAfterPage > beforeAfterTotalPages) {
      setBeforeAfterPage(beforeAfterTotalPages)
    }
  }, [beforeAfterPage, beforeAfterTotalPages])

  useEffect(() => {
    if (beforeAfterPage > concernBeforeAfterTotalPages) {
      setBeforeAfterPage(concernBeforeAfterTotalPages)
    }
  }, [beforeAfterPage, concernBeforeAfterTotalPages])

  const scrollToBeforeAfterSection = useCallback(() => {
    setViewMode('industry')
    navigate({ pathname: location.pathname, search: location.search, hash: 'showroom-before-after-section' }, { replace: true })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToSectionWithOffset('showroom-before-after-section')
      })
    })
  }, [navigate, scrollToSectionWithOffset, location.pathname, location.search])

  /** URL 해시(#showroom-before-after-section)로 진입 시 업종 뷰로 맞춘 뒤 해당 섹션으로 스크롤 */
  useEffect(() => {
    if (location.hash !== '#showroom-before-after-section') return
    if (loading) return
    setViewMode('industry')
    const t = window.setTimeout(() => {
      scrollToSectionWithOffset('showroom-before-after-section')
    }, 280)
    return () => window.clearTimeout(t)
  }, [location.hash, loading, scrollToSectionWithOffset])

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

  const renderBeforeAfterCard = (group: SiteGroup, options?: { linkToStory?: boolean }) => {
    const beforeImages = group.images.filter((image) => image.before_after_role === 'before')
    const afterImages = group.images.filter((image) => image.before_after_role === 'after')
    const beforeImage = beforeImages[0] ?? null
    const afterImage = afterImages.find((image) => image.is_main) ?? afterImages[0] ?? null
    const caseProfileDraft = getBeforeAfterProfileDraft(group)
    const publicLabel = getGroupPublicLabel(group)
    const storyHref = options?.linkToStory ? getBeforeAfterStoryHref(group) : null
    if (!beforeImage || !afterImage) return null

    const beforeAfterPreview = (
      <>
        <div className="grid grid-cols-2">
          <div className="relative aspect-[4/3] bg-neutral-100">
            <img
              src={beforeImage.thumbnail_url || beforeImage.cloudinary_url}
              alt={`${publicLabel} before`}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
              Before
            </span>
          </div>
          <div className="relative aspect-[4/3] bg-neutral-100">
            <img
              src={afterImage.thumbnail_url || afterImage.cloudinary_url}
              alt={`${publicLabel} after`}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
              After
            </span>
          </div>
        </div>
        <div className={'flex min-h-[5.5rem] items-start p-4'}>
          <h4 className="font-semibold leading-snug text-neutral-900">{publicLabel}</h4>
          
        </div>
      </>
    )

    const publicBlogTeaser = (
      <div className="border-t border-emerald-100 bg-emerald-50/50 px-3 py-2">
        <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-emerald-200/90">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">블로그 소개</p>
          <p className="mt-1 min-h-[7.5rem] text-sm leading-relaxed text-slate-600 line-clamp-4">
            {(caseProfileDraft.blogTeaserLine ?? '').trim()}
          </p>
          {storyHref && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              블로그·카드뉴스에서 자세히 보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </p>
          )}
        </div>
      </div>
    )

    return (
      <div
        key={`before-after-${group.siteName}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        {storyHref ? (
          <Link
            to={storyHref}
            className="flex w-full flex-1 flex-col text-left"
            onClick={() => {
              trackShowroomAbmEvent({
                eventName: 'abm_ba_story_click',
                concern: selectedConcernTag,
                siteName: group.siteName,
                industry: group.businessTypes[0] ?? null,
              })
            }}
          >
            {beforeAfterPreview}
            {publicBlogTeaser}
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openDetail('beforeAfter', group.siteName)}
              className="flex w-full flex-1 flex-col text-left"
            >
              {beforeAfterPreview}
            </button>
            {publicBlogTeaser}
          </>
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

  const gallerySegmentPillClass = cn(
    'pointer-events-none absolute top-1 bottom-1 left-1 rounded-lg transition-transform duration-200 ease-out',
    mugwortSelectedFillClass,
  )

  const galleryViewModeIndex = viewMode === 'industry' ? 0 : viewMode === 'product' ? 1 : 2

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
        variant="ghost"
        role="tab"
        aria-selected={isActive}
        className={cn(
          'relative z-10 h-10 min-w-0 flex-1 gap-2 rounded-lg border-0 bg-transparent px-3 shadow-none sm:px-4',
          'hover:bg-transparent hover:shadow-none focus-visible:ring-[#5f7058]/35',
          isActive ? 'font-semibold text-white' : 'text-neutral-600 hover:text-neutral-900',
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
            className="relative inline-flex w-full max-w-2xl rounded-xl border border-neutral-200/80 bg-gradient-to-b from-slate-50 to-slate-100/90 p-1 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]"
            role="tablist"
            aria-label="사례 사진 보기 기준"
          >
            <span
              aria-hidden
              className={gallerySegmentPillClass}
              style={{
                width: 'calc((100% - 8px) / 3)',
                transform: `translateX(calc(${galleryViewModeIndex} * 100%))`,
              }}
            />
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
          </div>
          
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

      <main className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        {/* 메인 카피: 강렬한 헤드라인 */}
        <section className="mb-8" aria-labelledby="showroom-main-heading">
          <h1 id="showroom-main-heading" className="text-2xl md:text-3xl font-bold text-neutral-900 leading-tight mb-1">
            실패하지 않는 공간 기획, 그 차이는 <span className="text-amber-600">디테일</span>에 있습니다.
          </h1>
          <p className="text-neutral-600 text-base md:text-lg">대표님의 공간, 어떤 변화가 필요하신가요?</p>
          <p className="text-xs md:text-sm text-neutral-500 mt-2">
            실제 시공 사례와 Before/After를 고민별로 안내해 드립니다. 궁금한 점은 화면 하단 상담 버튼으로 바로 문의하실 수 있습니다.
          </p>
        </section>

        {/* 전문가가 먼저 질문하는 공감 카드: 말풍선 + 핵심어 하이라이트 + 성공 사례 보기 CTA */}
        <section className="mb-8" aria-labelledby="showroom-concern-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="showroom-concern-heading" className="text-lg font-semibold text-neutral-900">
                고민별로 맞춤 사례 보기
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                우리 상황에 가까운 질문을 고르면 전문가 코멘트와 Before/After 사례를 이어서 보여 드립니다.
              </p>
            </div>
            <div
              className="shrink-0 w-full sm:max-w-sm rounded-xl border border-amber-200/90 bg-amber-50 p-3.5 shadow-sm ring-1 ring-amber-100/80"
              aria-label="사례 사진 바로 탐색"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200/80 bg-white text-amber-700">
                  <Images className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">설명 없이 사례 사진만 보기</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {siteGroups.length}개 현장 · 사진{' '}
                    {siteGroups.reduce((total, group) => total + group.images.length, 0)}장 바로 탐색
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-amber-200/80 bg-white/95 px-3 text-xs hover:bg-amber-100/60 hover:text-amber-950"
                  onClick={() => jumpToGalleryView('industry')}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  업종별
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-amber-200/80 bg-white/95 px-3 text-xs hover:bg-amber-100/60 hover:text-amber-950"
                  onClick={() => jumpToGalleryView('product')}
                >
                  <Package className="h-3.5 w-3.5" />
                  제품별
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-amber-200/80 bg-white/95 px-3 text-xs hover:bg-amber-100/60 hover:text-amber-950"
                  onClick={() => jumpToGalleryView('color')}
                >
                  <Palette className="h-3.5 w-3.5" />
                  색상별
                </Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CONCERN_CARDS.map((card) => {
              const isSelected = selectedConcernTag === card.tag
              const handleCardClick = () => {
                if (selectedConcernTag !== card.tag) {
                  setConcernTagAndUrl(card.tag)
                }
                requestAnimationFrame(() => {
                  document.getElementById('showroom-concern-result-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }
              return (
                <button
                  key={card.tag}
                  type="button"
                  onClick={handleCardClick}
                  className="group flex flex-col gap-3 text-left rounded-2xl p-4 bg-white border-2 border-neutral-200 shadow-sm hover:shadow-xl hover:border-amber-300 hover:-translate-y-1 active:scale-[0.99] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 min-h-[88px] cursor-pointer"
                >
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
                      <span className="inline-flex flex-col items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold leading-tight text-slate-700 ring-1 ring-slate-200">
                        {card.industryFilter === '관리형전환' ? (
                          <>
                            <span>스터디카페의</span>
                            <span>관리형전환</span>
                          </>
                        ) : (
                          getConcernIndustryDisplayLabel(card.industryFilter)
                        )}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`rounded-xl rounded-tl-none px-4 py-3 border border-neutral-100 group-hover:bg-amber-50/50 group-hover:border-amber-100 transition-colors ${
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
                  <span className="inline-flex items-center gap-1 self-end rounded-full bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 shadow-md">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    성공 사례 보기
                  </span>
                </button>
              )
            })}
          </div>
        </section>
        <div id="showroom-concern-result-anchor" className="h-px scroll-mt-28 md:scroll-mt-32" aria-hidden />
        {/* 전문가 코멘트: 해당 카드 클릭 시에만 표시 — 왼쪽 코멘트, 오른쪽 전문가 이미지(답하는 느낌) */}
        { selectedConcernTag === '관리형 창업 또는 전환' && (
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
                <ShowroomExpertConsultationButton concern={selectedConcernTag}>
                  관리형 맞춤형 레이아웃 상담하기
                </ShowroomExpertConsultationButton>
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
        { selectedConcernTag === '매출 향상 스터디카페 리뉴얼' && (
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
                <ShowroomExpertConsultationButton concern={selectedConcernTag}>
                  스터디카페 리뉴얼 맞춤형 상담하기
                </ShowroomExpertConsultationButton>
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
        { selectedConcernTag === '스터디카페를 관리형으로 전환' && (
          <section className="my-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
            <div className="flex-1 min-w-0 py-5 px-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">전문가 코멘트</h3>
              <p className="text-slate-700 text-sm font-medium mb-3">같은 스터디카페처럼 보여서는 나중에 프리미엄을 받기 어렵습니다.</p>
              <div className="text-slate-600 text-sm leading-relaxed space-y-3">
                <p>
                  지금 운영 중인 스터디카페라도, 공간·동선·운영 구조를 <span className="font-bold text-slate-800">관리형으로 전환</span>하면 기존 매장과의 차별화가 훨씬 선명해집니다.
                </p>
                <p>
                  이것은 단순히 예쁘게 바꾸는 리뉴얼이 아닙니다. 고객이 느끼는 프리미엄을 높이고, 향후 관리형 오픈을 고민하는 인수자에게도 <span className="font-bold text-slate-800">더 설득력 있는 매장 자산</span>으로 보이게 만드는 전략입니다.
                </p>
                <p>
                  결국 잘된 전환은 현재의 경쟁력을 만들고, 나중의 엑시트 가능성까지 바꿉니다. 파인드가구는 그 흐름까지 고려해 공간을 제안합니다.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <ShowroomExpertConsultationButton concern={selectedConcernTag}>
                  스터디카페를 관리형으로 전환 상담하기
                </ShowroomExpertConsultationButton>
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
        { selectedConcernTag === '스터디카페 같은 학원 자습실' && (
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
                <ShowroomExpertConsultationButton concern={selectedConcernTag}>
                  우리 학원 맞춤형 자습실 예산 상담하기
                </ShowroomExpertConsultationButton>
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

        { selectedConcernTag === '고교학점제 자습공간 구축' && (
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
                <ShowroomExpertConsultationButton concern={selectedConcernTag}>
                  우리 학교 맞춤형 제안서 및 견적 상담하기
                </ShowroomExpertConsultationButton>
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

        { selectedConcernTag === '아파트 독서실 리뉴얼' && (
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
                <ShowroomExpertConsultationButton concern={selectedConcernTag}>
                  우리 아파트 맞춤형 리뉴얼 제안서 요청하기
                </ShowroomExpertConsultationButton>
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

        { selectedConcernTag && (
          <section
            id="showroom-concern-before-after-section"
            className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:p-5 scroll-mt-28"
          >
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  {getConcernIndustryDisplayLabel(concernIndustryFilter)} Before/After 사례
                </h2>
                <p className="text-sm text-neutral-600">
                  선택하신 고민과 같은 업종의 전후 비교 사례입니다. 카드를 누르면 블로그·카드뉴스에서 사례 스토리와 사진을 이어서 볼 수 있습니다.
                </p>
              </div>
              {concernBeforeAfterGroups.length > 0 && (
                <p className="text-xs text-neutral-500">{concernBeforeAfterGroups.length}개 현장</p>
              )}
            </div>
            {concernBeforeAfterGroups.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">
                이 고민에 맞는 전후 비교 사례를 준비 중입니다. 아래 시공사례 갤러리에서 비슷한 업종 사례를 먼저 확인해 보세요.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pagedConcernBeforeAfterGroups.map((group) => renderBeforeAfterCard(group, { linkToStory: true }))}
                </div>
                {concernBeforeAfterTotalPages > 1 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={currentConcernBeforeAfterPage <= 1}
                      onClick={() => setBeforeAfterPage(currentConcernBeforeAfterPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </Button>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {Array.from({ length: concernBeforeAfterTotalPages }, (_, index) => {
                        const pageNumber = index + 1
                        const isCurrent = pageNumber === currentConcernBeforeAfterPage
                        return (
                          <Button
                            key={`concern-before-after-page-${pageNumber}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn('min-w-9 px-0', isCurrent && selectedBrowseButtonClass)}
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
                      disabled={currentConcernBeforeAfterPage >= concernBeforeAfterTotalPages}
                      onClick={() => setBeforeAfterPage(currentConcernBeforeAfterPage + 1)}
                    >
                      다음
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        

          <section
            id="showroom-gallery-browse"
            className="mt-12 border-t border-neutral-200 pt-10 scroll-mt-24 md:scroll-mt-28"
            aria-labelledby="showroom-gallery-browse-heading"
          >
            <div className="mb-6">
              <h2 id="showroom-gallery-browse-heading" className="text-lg font-semibold text-neutral-900">
                시공 사례 사진 바로 찾기
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                고민 선택 없이 업종 · 제품 · 색상 기준으로 사례 사진을 둘러보실 수 있습니다.
              </p>
            </div>
            <div className="mb-8 flex flex-col gap-4 md:mb-10">{renderGalleryBrowseControls()}</div>
          </section>

        {viewMode === 'product' && (
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

        {viewMode === 'color' && (
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
                              variant="outline"
                              size="sm"
                              className={cn('min-w-9 px-0', isCurrent && selectedBrowseButtonClass)}
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

            
          </>
        )}

        {viewMode === 'product' && productFilteredGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
        {viewMode === 'color' && colorFilteredGroups.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
        {viewMode === 'industry' && paginatedIndustrySections.length === 0 && (
          <p className="text-center text-neutral-500 py-12">검색 결과가 없습니다.</p>
        )}
      </main>

      {/* 상세 갤러리 모달 */}
      <Dialog open={detailOpen !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent
          className={cn(
            'max-h-[90vh] overflow-hidden flex flex-col p-0 bg-neutral-900 border-0',
            detailViewMode === 'grid'
              ? 'max-w-6xl md:h-[96vh] md:max-h-[96vh] md:w-[min(96vw,72rem)] md:max-w-[min(96vw,72rem)]'
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
              detailViewMode === 'grid' && 'md:flex md:flex-col md:p-3',
            )}
          >
            {detailImages.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">사진이 없습니다.</p>
            ) : detailViewMode === 'grid' ? (
              <div className="space-y-3 md:flex md:min-h-0 md:flex-1 md:flex-col">
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
                <div className={cn(detailGridClassName, 'md:flex-1 md:gap-3')}>
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
                          onClick={() => openDetailImage(index)}
                          className="block w-full text-left"
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
    </div>
  )
}
