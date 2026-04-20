/**
 * 고객용 시공사례 쇼룸
 * - image_assets 기준, 현장(site_name) 또는 제품(product_name) 그룹
 * - 핀터레스트 스타일 그리드, 쇼룸 비주얼
 * - 카드 클릭 시 해당 현장/제품 사진 갤러리 (모달)
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
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
import { useColorChips } from '@/hooks/useColorChips'
import { cn } from '@/lib/utils'
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Package, Images, Sparkles, FileText, MousePointerClick, MessageCircle, FileCheck, Users, Wrench, ClipboardCheck, ArrowRight, ArrowLeft, Copy, Check, Video, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { shareGalleryKakao } from '@/lib/kakaoShare'
import { createSharedGallery, snapshotShowroomImageAsset } from '@/lib/sharedGalleryService'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'
import { parseShowroomCtaAttribution, trackShowroomCtaVisit } from '@/lib/showroomCtaTracking'
import ShowroomShortsCreateDialog from '@/components/showroom/ShowroomShortsCreateDialog'
import {
  getShowroomBasicShortsDraftById,
  listShowroomBasicShortsDrafts,
  requestShowroomBasicShortsRender,
  requestShowroomBasicShortsDraftProduction,
  saveShowroomBasicShortsDraft,
  type ShowroomBasicShortsDraftRecord,
} from '@/lib/showroomBasicShortsDrafts'
import { formatShowroomCardTextForDisplay } from '@/lib/showroomCaseContentPackage'
import { openShowroomBlogTeaserLine } from '@/lib/showroomCaseCanonicalBlog'
import { fetchShowroomCaseProfileDrafts } from '@/lib/showroomCaseProfileService'
import { validateBeforeAfterSelection } from '@/lib/showroomShorts'

import {
  CONCERN_CARDS,
  INDUSTRY_PAGE_SIZE,
  INDUSTRY_PREFERRED_ORDER,
  SWIPE_THRESHOLD_PX,
} from '@/pages/showroom/showroomPageConstants'
import { highlightKeywords } from '@/pages/showroom/showroomHighlightKeywords'
import {
  buildBasicShortsPlan,
  buildColorGroups,
  buildProductGroups,
  buildShowroomContactUrl,
  buildShowroomSiteKey,
  buildSiteGroups,
  collectUniqueLabels,
  getBroadPublicLabel,
  getGroupPublicLabel,
  getPreferredExternalDisplayName,
  getPreferredShowroomSiteName,
  getPrimaryIndustryLabel,
  getPublicCardNewsHref,
  getPublicLabelsFromImages,
  isConcernTag,
  moveIdBefore,
  moveIdByOffset,
  orderImagesByIdList,
  parseProductSeries,
  compareSeriesSuffix,
  sortBeforeAfterImages,
  summarizeTopLabels,
} from '@/pages/showroom/showroomPageGrouping'
import type {
  ColorGroup,
  IndustrySection,
  PaginatedIndustrySection,
  ProductGroup,
  ShowroomCaseProfileDraftState,
  ShowroomPageProps,
  SiteGroup,
  ViewMode,
} from '@/pages/showroom/showroomPageTypes'

export default function ShowroomPage({ mode = 'internal' }: ShowroomPageProps) {
  const showInternalControls = mode === 'internal'
  const headerRef = useRef<HTMLElement | null>(null)
  const selectionBarRef = useRef<HTMLDivElement | null>(null)
  const { chips: colorChips, isLoading: colorLoading } = useColorChips()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [siteOverrides, setSiteOverrides] = useState<ShowroomSiteOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('industry')
  const [selectedProductSeries, setSelectedProductSeries] = useState<string | null>(null)
  const [selectedProductFilter, setSelectedProductFilter] = useState<string | null>(null)
  const [selectedColorFilter, setSelectedColorFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [selectedConcernTag, setSelectedConcernTag] = useState<string | null>(() => {
    const concern = searchParams.get('concern')
    if (isConcernTag(concern)) return concern
    const legacyTag = searchParams.get('tag')
    return isConcernTag(legacyTag) ? legacyTag : null
  })
  const [detailOpen, setDetailOpen] = useState<'site' | 'product' | 'color' | 'beforeAfter' | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [internalDetailViewMode, setInternalDetailViewMode] = useState<'grid' | 'image'>('grid')
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [industryPageBySection, setIndustryPageBySection] = useState<Record<string, number>>({})
  const [beforeAfterPage, setBeforeAfterPage] = useState(1)
  const [priorityInputByKey, setPriorityInputByKey] = useState<Record<string, string>>({})
  const [savingPriorityByKey, setSavingPriorityByKey] = useState<Record<string, boolean>>({})
  const [priorityEditorOpenByKey, setPriorityEditorOpenByKey] = useState<Record<string, boolean>>({})
  const [caseProfileDraftBySite, setCaseProfileDraftBySite] = useState<Record<string, ShowroomCaseProfileDraftState>>({})
  const [shortsDialogOpen, setShortsDialogOpen] = useState(false)
  const [basicShortsDialogOpen, setBasicShortsDialogOpen] = useState(false)
  const [basicShortsImageOrder, setBasicShortsImageOrder] = useState<string[]>([])
  const [draggingBasicShortsImageId, setDraggingBasicShortsImageId] = useState<string | null>(null)
  const [basicShortsScriptDraft, setBasicShortsScriptDraft] = useState({
    heroLine: '',
    detailLine: '',
    detailLine2: '',
    closingLine: '',
    endingTitle: '',
    endingSubtitle: '',
  })
  const [basicShortsSavedAt, setBasicShortsSavedAt] = useState<string | null>(null)
  const [basicShortsSavedDrafts, setBasicShortsSavedDrafts] = useState<ShowroomBasicShortsDraftRecord[]>([])
  const [basicShortsDraftsLoading, setBasicShortsDraftsLoading] = useState(false)
  const [basicShortsRequesting, setBasicShortsRequesting] = useState(false)
  const [basicShortsHydratingDraft, setBasicShortsHydratingDraft] = useState(false)
  const mountedRef = useRef(true)
  const refreshInFlightRef = useRef(false)
  const lastAutoRefreshAtRef = useRef(0)
  const priorityEditorOpenByKeyRef = useRef(priorityEditorOpenByKey)
  const trackedPublicEntryRef = useRef(false)
  const originalArchivePath = showInternalControls ? '/showroom/original' : '/public/showroom/original'

  priorityEditorOpenByKeyRef.current = priorityEditorOpenByKey

  // 딥링크: URL ?q, ?concern 변경 시(뒤로가기 등) 상태 동기화. 레거시 ?tag도 지원.
  useEffect(() => {
    const q = searchParams.get('q')
    const concern = searchParams.get('concern')
    const legacyTag = searchParams.get('tag')
    setSearchQuery(q ?? (isConcernTag(legacyTag) ? '' : (legacyTag ?? '')))
    setSelectedConcernTag(isConcernTag(concern) ? concern : (isConcernTag(legacyTag) ? legacyTag : null))
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

  const loadShowroomData = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (refreshInFlightRef.current) return

    refreshInFlightRef.current = true
    if (!background) setLoading(true)

    try {
      const [list, overrides] = await Promise.all(
        showInternalControls
          ? [fetchShowroomImageAssets(), fetchShowroomSiteOverrides()]
          : [fetchPublicShowroomAssets(), Promise.resolve([] as ShowroomSiteOverride[])]
      )
      if (!mountedRef.current) return

      setAssets(list)
      setSiteOverrides(overrides)
      setPriorityInputByKey((prev) => {
        const next = background ? { ...prev } : {}
        overrides.forEach((override) => {
          const key = buildShowroomSiteKey(override.section_key, override.industry_label, override.site_name)
          const nextValue = override.manual_priority != null ? String(override.manual_priority) : ''
          if (!background || priorityEditorOpenByKeyRef.current[key] !== true || !(key in next)) {
            next[key] = nextValue
          }
        })
        return next
      })
    } catch (error) {
      if (!background) {
        toast.error(error instanceof Error ? error.message : '쇼룸 데이터를 불러오지 못했습니다.')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
      refreshInFlightRef.current = false
    }
  }, [showInternalControls])

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
  const industryFilterForTag = useMemo<string | null>(() => null, [])

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
    if (showInternalControls) return detailKey

    if (detailOpen === 'site') {
      const group = siteGroups.find((item) => item.siteName === detailKey)
      return group ? getGroupPublicLabel(group) : detailKey
    }
    if (detailOpen === 'beforeAfter') {
      const group = beforeAfterGroups.find((item) => item.siteName === detailKey)
      return group ? getGroupPublicLabel(group) : detailKey
    }
    return detailKey
  }, [beforeAfterGroups, detailKey, detailOpen, showInternalControls, siteGroups])

  useEffect(() => {
    const siteNames = beforeAfterGroups.map((group) => group.siteName)
    if (siteNames.length === 0) return

    let cancelled = false
    void fetchShowroomCaseProfileDrafts(siteNames)
      .then((rows) => {
        if (cancelled) return
        setCaseProfileDraftBySite((prev) => {
          const next = { ...prev }
          rows.forEach((row) => {
            const keys = Array.from(new Set([
              row.siteName.trim(),
              row.canonicalSiteName?.trim() ?? '',
            ].filter(Boolean)))
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
  }, [beforeAfterGroups])
  const detailImageFrameRef = useRef<HTMLDivElement | null>(null)
  const detailAnimatedImageIdRef = useRef<string | null>(null)
  const detailTransitionDirectionRef = useRef<'next' | 'prev'>('next')

  const openDetail = (mode: 'site' | 'product' | 'color' | 'beforeAfter', key: string) => {
    detailAnimatedImageIdRef.current = null
    detailTransitionDirectionRef.current = 'next'
    setSelectedImageIds(new Set())
    setDetailOpen(mode)
    setDetailKey(key)
    setLightboxIndex(0)
    setInternalDetailViewMode('grid')
  }

  const closeDetail = useCallback(() => {
    setDetailOpen(null)
    setInternalDetailViewMode('grid')
  }, [])

  const openInternalDetailImage = useCallback((index: number) => {
    setLightboxIndex(index)
    setInternalDetailViewMode('image')
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
  const handleDetailPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) {
      detailPointerStartRef.current = null
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    detailPointerStartRef.current = { x: event.clientX, y: event.clientY }
  }, [])
  const handleDetailPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = detailPointerStartRef.current
    detailPointerStartRef.current = null
    if (!start || detailImages.length <= 1) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return
    if (deltaX < 0) goNext()
    else goPrev()
  }, [detailImages.length, goNext, goPrev])
  const handleDetailPointerCancel = useCallback(() => {
    detailPointerStartRef.current = null
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
    if (detailOpen === null) {
      setInternalDetailViewMode('grid')
    }
  }, [detailOpen])

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

  const selectAllDetailImages = useCallback(() => {
    if (detailImages.length === 0) return
    setSelectedImageIds((prev) => {
      const next = new Set(prev)
      detailImages.forEach((image) => next.add(image.id))
      return next
    })
  }, [detailImages])

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

  const selectedImages = useMemo(
    () => Array.from(selectedImageIds)
      .map((id) => assets.find((asset) => asset.id === id))
      .filter((asset): asset is ShowroomImageAsset => asset != null),
    [selectedImageIds, assets]
  )

  const detailStoryHref = useMemo(() => {
    if (detailImages.length === 0) return null
    const siteName = getPreferredShowroomSiteName(detailImages).trim()
    if (!siteName || siteName === '미지정') return null
    return `/public/showroom/case/${encodeURIComponent(siteName)}`
  }, [detailImages])

  const shortsSelection = useMemo(
    () => validateBeforeAfterSelection(selectedImages),
    [selectedImages]
  )

  const basicShortsPlan = useMemo(
    () => buildBasicShortsPlan(selectedImages),
    [selectedImages]
  )

  const orderedBasicShortsImages = useMemo(
    () => orderImagesByIdList(basicShortsPlan.orderedImages, basicShortsImageOrder),
    [basicShortsPlan.orderedImages, basicShortsImageOrder]
  )

  useEffect(() => {
    setBasicShortsImageOrder(basicShortsPlan.orderedImages.map((image) => image.id))
  }, [basicShortsPlan.orderedImages])

  useEffect(() => {
    setBasicShortsScriptDraft({
      heroLine: basicShortsPlan.heroLine,
      detailLine: basicShortsPlan.detailLine,
      detailLine2: basicShortsPlan.detailLine2,
      closingLine: basicShortsPlan.closingLine,
      endingTitle: basicShortsPlan.endingTitle,
      endingSubtitle: basicShortsPlan.endingSubtitle,
    })
  }, [basicShortsPlan.heroLine, basicShortsPlan.detailLine, basicShortsPlan.detailLine2, basicShortsPlan.closingLine, basicShortsPlan.endingTitle, basicShortsPlan.endingSubtitle])

  const resetBasicShortsImageOrder = useCallback(() => {
    setBasicShortsImageOrder(basicShortsPlan.orderedImages.map((image) => image.id))
  }, [basicShortsPlan.orderedImages])

  const resetBasicShortsScriptDraft = useCallback(() => {
    setBasicShortsScriptDraft({
      heroLine: basicShortsPlan.heroLine,
      detailLine: basicShortsPlan.detailLine,
      detailLine2: basicShortsPlan.detailLine2,
      closingLine: basicShortsPlan.closingLine,
      endingTitle: basicShortsPlan.endingTitle,
      endingSubtitle: basicShortsPlan.endingSubtitle,
    })
  }, [basicShortsPlan.heroLine, basicShortsPlan.detailLine, basicShortsPlan.detailLine2, basicShortsPlan.closingLine, basicShortsPlan.endingTitle, basicShortsPlan.endingSubtitle])

  const handleBasicShortsDrop = useCallback((targetId: string) => {
    setBasicShortsImageOrder((prev) => {
      if (!draggingBasicShortsImageId) return prev
      return moveIdBefore(prev, draggingBasicShortsImageId, targetId)
    })
    setDraggingBasicShortsImageId(null)
  }, [draggingBasicShortsImageId])

  const moveBasicShortsImage = useCallback((targetId: string, direction: -1 | 1) => {
    setBasicShortsImageOrder((prev) => moveIdByOffset(prev, targetId, direction))
  }, [])

  const autoBasicShortsDurationSeconds = useMemo(() => {
    const imageCount = Math.max(orderedBasicShortsImages.length, selectedImages.length, 1)
    return imageCount * 2.5 + 2
  }, [orderedBasicShortsImages.length, selectedImages.length])

  const basicShortsPackageText = useMemo(() => {
    const orderedLines = orderedBasicShortsImages.map((image, index) => {
      const title = image.product_name?.trim() || image.site_name?.trim() || `사진 ${index + 1}`
      const meta = [image.color_name?.trim(), image.business_type?.trim()].filter(Boolean).join(' / ')
      return `${index + 1}. ${title}${meta ? ` (${meta})` : ''}`
    })

    return [
      '[기본 쇼츠 제작 패키지]',
      `현장명: ${basicShortsPlan.displayName}`,
      `업종: ${basicShortsPlan.industry}`,
      `적용 제품: ${basicShortsPlan.productSummary}`,
      `주요 색상: ${basicShortsPlan.colorSummary}`,
      `길이: ${autoBasicShortsDurationSeconds}초`,
      '포맷: 9:16 기본 쇼츠',
      '',
      '[스크립트]',
      `첫 문장: ${basicShortsScriptDraft.heroLine}`,
      `두번째 문장 1: ${basicShortsScriptDraft.detailLine}`,
      `두번째 문장 2: ${basicShortsScriptDraft.detailLine2}`,
      `마지막 문장: ${basicShortsScriptDraft.closingLine}`,
      `엔딩 1: ${basicShortsScriptDraft.endingTitle}`,
      `엔딩 2: ${basicShortsScriptDraft.endingSubtitle}`,
      '',
      '[사진 순서]',
      ...orderedLines,
    ].join('\n')
  }, [
    orderedBasicShortsImages,
    basicShortsPlan.displayName,
    basicShortsPlan.industry,
    basicShortsPlan.productSummary,
    basicShortsPlan.colorSummary,
    basicShortsScriptDraft.heroLine,
    basicShortsScriptDraft.detailLine,
    basicShortsScriptDraft.detailLine2,
    basicShortsScriptDraft.closingLine,
    basicShortsScriptDraft.endingTitle,
    basicShortsScriptDraft.endingSubtitle,
    autoBasicShortsDurationSeconds,
  ])

  const copyBasicShortsPackage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(basicShortsPackageText)
      toast.success('기본 쇼츠 제작 패키지를 복사했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '기본 쇼츠 제작 패키지 복사에 실패했습니다.')
    }
  }, [basicShortsPackageText])

  const saveBasicShortsDraft = useCallback(() => {
    return saveShowroomBasicShortsDraft({
      displayName: basicShortsPlan.displayName,
      industry: basicShortsPlan.industry,
      productSummary: basicShortsPlan.productSummary,
      colorSummary: basicShortsPlan.colorSummary,
      durationSeconds: autoBasicShortsDurationSeconds,
      selectedImageIds: selectedImages.map((image) => image.id),
      imageOrder: basicShortsImageOrder,
      script: basicShortsScriptDraft,
      packageText: basicShortsPackageText,
    })
      .then((result) => {
        const savedAt = result.updatedAt
      setBasicShortsSavedAt(savedAt)
      toast.success('기본 쇼츠 초안을 저장했습니다.')
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : '기본 쇼츠 초안 저장에 실패했습니다.')
      })
  }, [
    selectedImages,
    basicShortsPackageText,
    basicShortsImageOrder,
    basicShortsScriptDraft,
    basicShortsPlan.displayName,
    basicShortsPlan.industry,
    basicShortsPlan.productSummary,
    basicShortsPlan.colorSummary,
    autoBasicShortsDurationSeconds,
  ])

  useEffect(() => {
    if (!basicShortsDialogOpen) return
    setBasicShortsSavedAt(null)
  }, [basicShortsDialogOpen])

  useEffect(() => {
    if (!basicShortsDialogOpen) return
    let cancelled = false
    setBasicShortsDraftsLoading(true)
    void listShowroomBasicShortsDrafts(basicShortsPlan.displayName)
      .then((rows) => {
        if (cancelled) return
        setBasicShortsSavedDrafts(rows)
      })
      .catch(() => {
        if (cancelled) return
        setBasicShortsSavedDrafts([])
      })
      .finally(() => {
        if (cancelled) return
        setBasicShortsDraftsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [basicShortsDialogOpen, basicShortsPlan.displayName])

  const applyBasicShortsSavedDraft = useCallback((draft: ShowroomBasicShortsDraftRecord) => {
    setBasicShortsImageOrder(draft.imageOrder)
    setBasicShortsScriptDraft({
      heroLine: draft.script.heroLine,
      detailLine: draft.script.detailLine,
      detailLine2: draft.script.detailLine2,
      closingLine: draft.script.closingLine,
      endingTitle: draft.script.endingTitle,
      endingSubtitle: draft.script.endingSubtitle,
    })
    setBasicShortsSavedAt(draft.updatedAt)
    toast.success('저장된 기본 쇼츠 초안을 불러왔습니다.')
  }, [])

  useEffect(() => {
    const draftId = searchParams.get('basicShortsDraftId')?.trim()
    if (!draftId || assets.length === 0 || basicShortsHydratingDraft) return

    let cancelled = false
    setBasicShortsHydratingDraft(true)

    void getShowroomBasicShortsDraftById(draftId)
      .then((draft) => {
        if (cancelled) return

        const matchedImages = draft.selectedImageIds
          .map((id) => assets.find((asset) => asset.id === id))
          .filter((asset): asset is ShowroomImageAsset => asset != null)

        if (matchedImages.length === 0) {
          throw new Error('선택 이미지 정보를 찾지 못했습니다. 이미지 자산 상태를 확인해 주세요.')
        }

        const firstImage = matchedImages[0]
        const siteName = firstImage.site_name?.trim() || firstImage.canonical_site_name?.trim()
        if (siteName) {
          openDetail('site', siteName)
        }

        setSelectedImageIds(new Set(draft.selectedImageIds))
        setBasicShortsImageOrder(draft.imageOrder)
        setBasicShortsScriptDraft({
          heroLine: draft.script.heroLine,
          detailLine: draft.script.detailLine,
          detailLine2: draft.script.detailLine2,
          closingLine: draft.script.closingLine,
          endingTitle: draft.script.endingTitle,
          endingSubtitle: draft.script.endingSubtitle,
        })
        setBasicShortsSavedAt(draft.updatedAt)
        setBasicShortsDialogOpen(true)

        const params = new URLSearchParams(searchParams)
        params.delete('basicShortsDraftId')
        setSearchParams(params, { replace: true })

        toast.success('기본 쇼츠 수정 화면으로 초안을 불러왔습니다.')
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : '기본 쇼츠 초안 불러오기에 실패했습니다.')
      })
      .finally(() => {
        if (cancelled) return
        setBasicShortsHydratingDraft(false)
      })

    return () => {
      cancelled = true
    }
  }, [assets, basicShortsHydratingDraft, openDetail, searchParams, setSearchParams])

  const requestBasicShortsProduction = useCallback(() => {
    if (selectedImages.length === 0) {
      toast.error('먼저 기본 쇼츠에 사용할 이미지를 선택하세요.')
      return
    }

    setBasicShortsRequesting(true)
    void requestShowroomBasicShortsDraftProduction({
      displayName: basicShortsPlan.displayName,
      industry: basicShortsPlan.industry,
      productSummary: basicShortsPlan.productSummary,
      colorSummary: basicShortsPlan.colorSummary,
      durationSeconds: autoBasicShortsDurationSeconds,
      selectedImageIds: selectedImages.map((image) => image.id),
      imageOrder: basicShortsImageOrder,
      script: basicShortsScriptDraft,
      packageText: basicShortsPackageText,
    })
      .then(async (result) => {
        setBasicShortsSavedAt(result.updatedAt)
        try {
          await requestShowroomBasicShortsRender(result.id)
          toast.success('기본 쇼츠 제작 요청을 저장했고 자동 렌더링을 시작했습니다.')
        } catch (renderError) {
          console.error('[showroom-basic-shorts] auto render start failed', renderError)
          toast.success('기본 쇼츠 제작 요청은 저장했습니다. 렌더링 상태는 작업대기 화면에서 확인하세요.')
        }
        setBasicShortsDialogOpen(false)
        navigate('/admin/showroom-basic-shorts')
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : '기본 쇼츠 제작 요청 저장에 실패했습니다.')
      })
      .finally(() => {
        setBasicShortsRequesting(false)
      })
  }, [
    selectedImages,
    basicShortsPlan.displayName,
    basicShortsPlan.industry,
    basicShortsPlan.productSummary,
    basicShortsPlan.colorSummary,
    basicShortsImageOrder,
    basicShortsScriptDraft,
    basicShortsPackageText,
    autoBasicShortsDurationSeconds,
    navigate,
  ])

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

  const getBeforeAfterProfileDraft = useCallback((group: SiteGroup): ShowroomCaseProfileDraftState => {
    return caseProfileDraftBySite[group.siteName] ?? {
      painPoint: '',
      headlineHook: '',
      cardNewsPublication: {
        isPublished: false,
        siteKey: null,
      },
      blogTeaserLine: null,
    }
  }, [caseProfileDraftBySite])

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
              alt={showInternalControls ? group.siteName : publicLabel}
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
              <h3 className="font-semibold text-neutral-900 truncate">{showInternalControls ? group.siteName : publicLabel}</h3>
              {showInternalControls && group.externalDisplayName && group.externalDisplayName !== group.siteName && (
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
        {showInternalControls && (
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
    const caseProfileDraft = getBeforeAfterProfileDraft(group)
    const publicLabel = getGroupPublicLabel(group)
    const cardNewsStudioHref = `/admin/showroom-case-studio?site=${encodeURIComponent(group.siteName)}&focus=cardnews`
    const blogStudioHref = `/admin/showroom-case-studio?site=${encodeURIComponent(group.siteName)}&focus=blog`
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
                alt={`${showInternalControls ? group.siteName : publicLabel} before`}
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
                alt={`${showInternalControls ? group.siteName : publicLabel} after`}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
                After
              </span>
            </div>
          </div>
          <div className="p-4">
            <h4 className="font-semibold text-neutral-900">{showInternalControls ? group.siteName : publicLabel}</h4>
            {showInternalControls && group.externalDisplayName && group.externalDisplayName !== group.siteName && (
              <div className="mt-1 flex items-center gap-2 min-w-0">
                {group.businessTypes[0] && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                    {group.businessTypes[0]}
                  </span>
                )}
                <p className="min-w-0 truncate text-[12px] leading-tight text-amber-600">{group.externalDisplayName}</p>
              </div>
            )}
            {!!caseProfileDraft.painPoint?.trim() && (
              <div className="mt-2 space-y-1.5 text-sm text-neutral-600">
                <p className="whitespace-pre-wrap leading-relaxed">
                  {formatShowroomCardTextForDisplay({
                    text: caseProfileDraft.painPoint,
                    role: 'problem',
                  })}
                </p>
              </div>
            )}
          </div>
        </button>
        <div className="border-t border-emerald-100 bg-emerald-50/50 px-3 py-2">
          <div className="flex flex-col gap-2">
            {!showInternalControls && (
              <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-emerald-200/90">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  {caseProfileDraft.blogTeaserLine?.trim() ? '블로그 소개' : '카드뉴스 제목'}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {(caseProfileDraft.blogTeaserLine ?? '').trim()
                    || (caseProfileDraft.headlineHook ?? '').trim()
                    || (caseProfileDraft.painPoint ?? '').trim()
                    || publicLabel}
                </p>
              </div>
            )}
            {!showInternalControls && caseProfileDraft.cardNewsPublication.isPublished && (
              <Link
                to={getPublicCardNewsHref(caseProfileDraft.cardNewsPublication.siteKey || group.siteName)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
                onClick={(e) => e.stopPropagation()}
              >
                카드뉴스 보기
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            )}
          </div>
        </div>
        {showInternalControls && (
          <div className="space-y-3 border-t border-neutral-100 bg-neutral-50/50 p-3">
            <p className="text-xs text-neutral-500">
              이 쇼룸은 직원과 고객이 같은 화면으로 사례를 설명하는 용도입니다. 콘텐츠 작성·수정은 케이스 작업실에서 진행하세요.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Link to={cardNewsStudioHref}>
                <Button type="button" variant="outline" className="h-10 w-full gap-1.5 text-sm">
                  <FileText className="h-4 w-4" />
                  카드뉴스 제작
                </Button>
              </Link>
              <Link to={blogStudioHref}>
                <Button type="button" variant="outline" className="h-10 w-full gap-1.5 text-sm">
                  <FileCheck className="h-4 w-4" />
                  블로그 제작
                </Button>
              </Link>
            </div>
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
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 tracking-tight">
                {showInternalControls ? '내부용 시공사례 쇼룸' : '시공사례 쇼룸'}
              </h1>
              {showInternalControls && (
                <Link
                  to={originalArchivePath}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 transition hover:text-amber-800"
                >
                  원자료 보기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            {!showInternalControls && (
              <div className="flex items-center gap-2">
                <Link to="/public/showroom/cardnews">
                  <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                    <FileText className="h-4 w-4" />
                    카드뉴스 모아보기
                  </Button>
                </Link>
              </div>
            )}
            {showInternalControls && (
              <div className="flex items-center gap-2">
                <Link to={originalArchivePath}>
                  <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                    <Images className="h-4 w-4" />
                    원자료 보기
                  </Button>
                </Link>
                <Link to="/admin/showroom-ads">
                  <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                    <BarChart3 className="h-4 w-4" />
                    광고 대시보드
                  </Button>
                </Link>
                <Link to="/admin/showroom-shorts">
                  <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                    <Video className="h-4 w-4" />
                    B/A 검수 대기
                  </Button>
                </Link>
                <Link to="/admin/showroom-basic-shorts">
                  <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                    <Images className="h-4 w-4" />
                    기본 쇼츠 대기
                  </Button>
                </Link>
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
            )}
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
              <button
                type="button"
                onClick={() => setViewMode('color')}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'color' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                색상별로 보기
              </button>
            </div>
            <div className="relative flex-1 max-w-md">
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
              {visibleBeforeAfterGroups.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0 rounded-full"
                    onClick={scrollToBeforeAfterSection}
                    aria-label="전후 비교와 문제·솔루션 사례 섹션으로 이동"
                  >
                    <FileCheck className="h-4 w-4" />
                    전후·솔루션
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {showInternalControls && selectedImageIds.size > 0 && (
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
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setBasicShortsDialogOpen(true)
                }}
              >
                <Images className="h-4 w-4" />
                기본 쇼츠
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!shortsSelection.ok}
                onClick={() => {
                  if (!shortsSelection.ok) {
                    toast.error(shortsSelection.message)
                    return
                  }
                  setShortsDialogOpen(true)
                }}
              >
                <Video className="h-4 w-4" />
                비포어/애프터 숏츠
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
            {showInternalControls ? (
              <>
                고객과 함께 보며 <span className="text-amber-600">설명하고 전송하는</span> 내부용 쇼룸
              </>
            ) : (
              <>
                실패하지 않는 공간 기획, 그 차이는 <span className="text-amber-600">디테일</span>에 있습니다.
              </>
            )}
          </h1>
          {showInternalControls ? (
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
                내부 직원과 같은 흐름으로 시공사례를 탐색할 수 있는 공통 쇼룸입니다. 필요한 정보는 하단 채널톡이나 문의 흐름으로 이어서 안내받으실 수 있습니다.
              </p>
            </>
          )}
        </section>

        {viewMode === 'industry' && featuredBeforeAfterGroups.length > 0 && (
          <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">대표 Before/After 사례</h2>
                <p className="text-sm text-neutral-600">
                  전후 컷과 함께, 현장 과제(문제 제기)와 적용 방향(해결)을 한 세트로 보여줍니다. 더 많은 사례는 아래 전후·솔루션 섹션으로 이동하세요.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2 shrink-0"
                onClick={scrollToBeforeAfterSection}
                aria-label="전체 전후 비교 및 문제·솔루션 사례 섹션으로 이동"
              >
                <FileCheck className="h-4 w-4" />
                전후·솔루션 전체 보기
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {featuredBeforeAfterGroups.map((group) => renderBeforeAfterCard(group))}
            </div>
          </section>
        )}

        {/* 전문가가 먼저 질문하는 공감 카드: 말풍선 + 핵심어 하이라이트 + 성공 사례 보기 CTA */}
        {false && (
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
        {false && selectedConcernTag === '관리형 창업 또는 전환' && (
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
        {false && selectedConcernTag === '매출 향상 스터디카페 리뉴얼' && (
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
        {false && selectedConcernTag === '스터디카페를 관리형 스타일로' && (
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
        {false && selectedConcernTag === '스터디카페 같은 학원 자습실' && (
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

        {false && selectedConcernTag === '고교학점제 자습공간 구축' && (
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

        {false && selectedConcernTag === '아파트 독서실 리뉴얼' && (
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
              const visibleSiteLabels = showInternalControls ? group.siteNames : getPublicLabelsFromImages(group.images)
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
                  {showInternalControls && (
                    <div className="p-3 border-t border-neutral-100 bg-neutral-50/50 text-xs text-neutral-500">
                      관련 제품 이미지를 열어 필요한 컷을 선별하세요.
                    </div>
                  )}
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
              const visibleSiteLabels = showInternalControls ? group.siteNames : getPublicLabelsFromImages(group.images)
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
                  {showInternalControls && (
                    <div className="p-3 border-t border-neutral-100 bg-neutral-50/50 text-xs text-neutral-500">
                      같은 색상 계열의 사례를 모아 비교하고 필요한 컷을 선별하세요.
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
                      전후 비교 · 문제와 솔루션
                    </h3>
                    <p className="text-sm text-neutral-600">
                      리뉴얼 전후를 비교하고, 등록된 현장은 과제(문제)와 적용 방향(솔루션) 요약을 함께 확인할 수 있습니다. 카드를 열면 상세 사진과 설명을 이어갈 수 있습니다.
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
            internalDetailViewMode === 'grid' ? 'max-w-6xl' : 'max-w-4xl'
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
            <DialogTitle className="text-white font-semibold truncate">
              {detailDisplayTitle}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              onClick={closeDetail}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {detailImages.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">사진이 없습니다.</p>
            ) : internalDetailViewMode === 'grid' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-800/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {showInternalControls ? '전체 사진을 먼저 보고 선택하세요.' : '전체 사진을 둘러보세요.'}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      썸네일을 누르면 확대해서 확인할 수 있고, 닫으면 다시 전체 목록으로 돌아옵니다.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200">
                    {detailImages.length}장
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {detailImages.map((image, index) => {
                    const imageUrl = image.thumbnail_url || image.cloudinary_url || ''
                    const isSelected = selectedImageIds.has(image.id)
                    return (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-800 text-left transition hover:-translate-y-0.5 hover:border-neutral-500 hover:shadow-lg"
                      >
                        <button
                          type="button"
                          onClick={() => openInternalDetailImage(index)}
                          className="block w-full text-left"
                        >
                          <div className="relative aspect-[4/3] bg-neutral-900">
                            <img
                              src={imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            {image.before_after_role && (
                              <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                                {image.before_after_role === 'before' ? 'Before' : 'After'}
                              </span>
                            )}
                            {showInternalControls && isSelected && (
                              <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white">
                                선택됨
                              </span>
                            )}
                          </div>
                        </button>
                        <div className="p-3">
                          <div className="space-y-1">
                            <p className="truncate text-sm font-medium text-white">
                              {image.product_name?.trim() || `사진 ${index + 1}`}
                            </p>
                            <p className="truncate text-xs text-neutral-400">
                              {image.color_name?.trim()
                                || (showInternalControls
                                  ? image.site_name?.trim()
                                  : getBroadPublicLabel(image.site_name, image.external_display_name))
                                || detailDisplayTitle}
                            </p>
                          </div>
                          {showInternalControls && (
                            <label className="mt-2 flex items-center gap-2 text-xs text-neutral-300">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectedImage(image.id)}
                                className="rounded border-neutral-500 bg-neutral-900"
                              />
                              이 사진 선택
                            </label>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-end gap-3">
                  <span className="text-xs text-neutral-400">
                    {lightboxIndex + 1} / {detailImages.length}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-neutral-700 text-white hover:bg-neutral-800"
                    onClick={() => setInternalDetailViewMode('grid')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    전체 사진으로 돌아가기
                  </Button>
                </div>
                <div
                  className="relative flex items-center justify-center min-h-[60vh]"
                  style={{ touchAction: 'pan-y' }}
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
                    className="relative inline-block max-w-full cursor-grab active:cursor-grabbing"
                    onPointerDown={handleDetailPointerDown}
                    onPointerUp={handleDetailPointerUp}
                    onPointerCancel={handleDetailPointerCancel}
                    style={{ touchAction: 'pan-y' }}
                    ref={detailImageFrameRef}
                  >
                    <img
                      src={detailImages[lightboxIndex]?.cloudinary_url ?? detailImages[lightboxIndex]?.thumbnail_url ?? ''}
                      alt=""
                      className="max-w-full max-h-[70vh] object-contain rounded-lg block"
                      draggable={false}
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
              </>
            )}
          </div>
          {detailImages.length > 0 && internalDetailViewMode === 'image' && (
            <div className="px-4 py-2 border-t border-neutral-700 text-center text-neutral-500 text-sm">
              {lightboxIndex + 1} / {detailImages.length}
            </div>
          )}
          <div className="px-4 pb-4 pt-3 border-t border-neutral-700 space-y-2">
            {showInternalControls && internalDetailViewMode === 'grid' ? (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-neutral-300">{selectedImageIds.size}장 선택됨</p>
                    <p className="mt-1 text-xs text-neutral-500">{shortsSelection.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailImages.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-neutral-400 hover:text-white hover:bg-neutral-800"
                        onClick={selectAllDetailImages}
                      >
                        전체 선택
                      </Button>
                    ) : null}
                    {selectedImageIds.size > 0 ? (
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-neutral-400 hover:text-white hover:bg-neutral-800" onClick={() => setSelectedImageIds(new Set())}>
                        선택 비우기
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 gap-2 border-neutral-600 text-white hover:bg-neutral-800" onClick={copyShareLink}>
                    <Copy className="h-4 w-4" />
                    링크 복사
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 border-neutral-600 text-white hover:bg-neutral-800"
                    onClick={() => {
                      setBasicShortsDialogOpen(true)
                    }}
                  >
                    <Images className="h-4 w-4" />
                    기본 쇼츠
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 border-neutral-600 text-white hover:bg-neutral-800"
                    disabled={!shortsSelection.ok}
                    onClick={() => {
                      if (!shortsSelection.ok) {
                        toast.error(shortsSelection.message)
                        return
                      }
                      setShortsDialogOpen(true)
                    }}
                  >
                    <Video className="h-4 w-4" />
                    비포어/애프터 숏츠
                  </Button>
                </div>
              </>
            ) : !showInternalControls ? (
              detailStoryHref ? (
                <Link
                  to={detailStoryHref}
                  className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 bg-amber-500 hover:bg-amber-600 text-neutral-900 font-semibold text-sm transition-colors shadow-md"
                >
                  <Sparkles className="h-4 w-4" />
                  이 현장의 이야기 보기
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 bg-neutral-700 text-neutral-300 font-semibold text-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  이 현장의 이야기 준비 중
                </button>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <ShowroomShortsCreateDialog
        open={shortsDialogOpen}
        onOpenChange={setShortsDialogOpen}
        selectedImages={selectedImages}
      />
      <Dialog open={basicShortsDialogOpen} onOpenChange={setBasicShortsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <div className="space-y-5">
            <div className="space-y-2">
              <DialogTitle className="flex items-center gap-2">
                <Images className="h-5 w-5" />
                기본 쇼츠 초안
              </DialogTitle>
              <p className="text-sm text-neutral-600">
                내부 쇼룸에서 선택한 사진 메타데이터를 바탕으로 추천 순서와 스크립트 초안을 먼저 확인하는 단계입니다.
              </p>
              {basicShortsSavedAt ? (
                <p className="text-xs text-neutral-500">
                  최근 저장: {new Date(basicShortsSavedAt).toLocaleString('ko-KR')}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">추천 구성</p>
                <div className="mt-3 space-y-2 text-sm text-neutral-600">
                  <p>선택 사진 {selectedImages.length}장</p>
                  <p>대표 현장 {basicShortsPlan.displayName}</p>
                  <p>업종 {basicShortsPlan.industry}</p>
                  <p>적용 제품 {basicShortsPlan.productSummary}</p>
                  <p>주요 색상 {basicShortsPlan.colorSummary}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">고정 브랜드 시그니처</p>
                <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="text-base font-semibold text-neutral-950">{basicShortsPlan.endingTitle}</p>
                  <p className="mt-1 text-sm text-neutral-700">{basicShortsPlan.endingSubtitle}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-900">저장된 초안</p>
                <span className="text-xs text-neutral-500">현재 현장명 기준 최근 5개</span>
              </div>
              <div className="mt-3 space-y-2">
                {basicShortsDraftsLoading ? (
                  <p className="text-sm text-neutral-500">불러오는 중...</p>
                ) : basicShortsSavedDrafts.length === 0 ? (
                  <p className="text-sm text-neutral-500">아직 저장된 기본 쇼츠 초안이 없습니다.</p>
                ) : (
                  basicShortsSavedDrafts.map((draft) => (
                    <button
                      key={draft.id}
                      type="button"
                      onClick={() => applyBasicShortsSavedDraft(draft)}
                      className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left transition hover:border-neutral-300 hover:bg-white"
                    >
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{draft.displayName}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          자동 계산 {draft.durationSeconds}초 · {new Date(draft.updatedAt).toLocaleString('ko-KR')}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-neutral-600">불러오기</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-1">
              <div className="rounded-2xl border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-neutral-900">기본 제작 설정</p>
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                    <p className="text-xs font-medium text-neutral-500">자동 계산 길이</p>
                    <p className="mt-2 font-medium text-neutral-900">{autoBasicShortsDurationSeconds}초</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      사진당 2.5초 + 엔딩 2초 기준으로 자동 계산됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-900">자동 스크립트 초안</p>
                <Button type="button" variant="outline" size="sm" onClick={resetBasicShortsScriptDraft}>
                  추천 문구로 되돌리기
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                  <span className="text-xs font-medium text-neutral-500">첫 문장</span>
                  <Input
                    value={basicShortsScriptDraft.heroLine}
                    onChange={(event) => setBasicShortsScriptDraft((prev) => ({ ...prev, heroLine: event.target.value }))}
                    className="bg-white"
                  />
                </label>
                <label className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                  <span className="text-xs font-medium text-neutral-500">두번째 문장 1</span>
                  <Input
                    value={basicShortsScriptDraft.detailLine}
                    onChange={(event) => setBasicShortsScriptDraft((prev) => ({ ...prev, detailLine: event.target.value }))}
                    className="bg-white"
                  />
                </label>
                <label className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                  <span className="text-xs font-medium text-neutral-500">두번째 문장 2</span>
                  <Input
                    value={basicShortsScriptDraft.detailLine2}
                    onChange={(event) => setBasicShortsScriptDraft((prev) => ({ ...prev, detailLine2: event.target.value }))}
                    className="bg-white"
                  />
                </label>
                <label className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                  <span className="text-xs font-medium text-neutral-500">마지막 문장</span>
                  <Input
                    value={basicShortsScriptDraft.closingLine}
                    onChange={(event) => setBasicShortsScriptDraft((prev) => ({ ...prev, closingLine: event.target.value }))}
                    className="bg-white"
                  />
                </label>
                <label className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                  <span className="text-xs font-medium text-neutral-500">브랜드 엔딩 1</span>
                  <Input
                    value={basicShortsScriptDraft.endingTitle}
                    onChange={(event) => setBasicShortsScriptDraft((prev) => ({ ...prev, endingTitle: event.target.value }))}
                    className="bg-white"
                  />
                </label>
                <label className="space-y-2 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
                  <span className="text-xs font-medium text-neutral-500">브랜드 엔딩 2</span>
                  <Input
                    value={basicShortsScriptDraft.endingSubtitle}
                    onChange={(event) => setBasicShortsScriptDraft((prev) => ({ ...prev, endingSubtitle: event.target.value }))}
                    className="bg-white"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">추천 사진 순서</p>
                  <p className="mt-1 text-xs text-neutral-500">드래그로 위치를 바꾸면 기본 쇼츠 흐름을 직접 조정할 수 있습니다.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={resetBasicShortsImageOrder}>
                  추천 순서로 되돌리기
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {orderedBasicShortsImages.map((image, index) => (
                  <div
                    key={image.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggingBasicShortsImageId(image.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.dropEffect = 'move'
                      event.dataTransfer.setData('text/plain', image.id)
                    }}
                    onDragEnd={() => setDraggingBasicShortsImageId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={(event) => event.preventDefault()}
                    onDrop={() => handleBasicShortsDrop(image.id)}
                    className={cn(
                      'overflow-hidden rounded-2xl border border-neutral-200 bg-white cursor-move transition',
                      draggingBasicShortsImageId === image.id ? 'opacity-50 ring-2 ring-neutral-300' : 'hover:-translate-y-0.5 hover:shadow-md'
                    )}
                  >
                    <div className="relative aspect-[4/3] bg-neutral-100">
                      <img
                        src={image.thumbnail_url || image.cloudinary_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                        {index + 1}컷
                      </span>
                      <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-1 text-[11px] font-medium text-neutral-800 shadow-sm">
                        드래그 이동
                      </span>
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {image.product_name?.trim() || image.site_name?.trim() || `사진 ${index + 1}`}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {image.color_name?.trim() || image.business_type?.trim() || basicShortsPlan.displayName}
                      </p>
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 rounded-full p-0"
                          disabled={index === 0}
                          onClick={() => moveBasicShortsImage(image.id, -1)}
                          aria-label="앞으로 이동"
                          title="앞으로 이동"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 rounded-full p-0"
                          disabled={index === orderedBasicShortsImages.length - 1}
                          onClick={() => moveBasicShortsImage(image.id, 1)}
                          aria-label="뒤로 이동"
                          title="뒤로 이동"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              이 단계는 내부 쇼룸에서 기본 쇼츠 제작 설정을 확정하는 단계입니다. 초안 저장으로 임시 보관할 수 있고, 제작 요청을 누르면 현재 선택 이미지와 스크립트 기준으로 제작 대기 상태를 남길 수 있습니다.
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={saveBasicShortsDraft}>
                <Check className="h-4 w-4" />
                초안 저장
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={requestBasicShortsProduction} disabled={basicShortsRequesting}>
                <Video className="h-4 w-4" />
                제작 요청
              </Button>
              <Button type="button" className="gap-2" onClick={copyBasicShortsPackage}>
                <FileText className="h-4 w-4" />
                제작 패키지 복사
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
