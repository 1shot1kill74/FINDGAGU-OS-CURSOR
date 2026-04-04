import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileCheck, Images, Package, Search, X } from 'lucide-react'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/publicData'

const INDUSTRY_PREFERRED_ORDER = ['관리형', '학원', '스터디카페', '학교', '아파트', '기타'] as const
const INDUSTRY_PAGE_SIZE = 6

type ViewMode = 'product' | 'industry' | 'color'
type DetailMode = 'site' | 'product' | 'color' | 'beforeAfter'

interface SiteGroup {
  siteName: string
  externalDisplayName: string | null
  industryLabel: string
  displayYearMonthSort: number
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  hasBeforeAfter: boolean
  latestCreatedAt: string | null
  representativeScore: number
}

interface ProductGroup {
  productName: string
  siteNames: string[]
  externalDisplayNames: string[]
  displayYearMonthSort: number
  latestCreatedAt: string | null
  locations: string[]
  businessTypes: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
}

interface ColorGroup {
  colorName: string
  siteNames: string[]
  externalDisplayNames: string[]
  locations: string[]
  businessTypes: string[]
  products: string[]
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

  return '기타'
}

function getShowroomGroupKey(asset: ShowroomImageAsset): string {
  const externalDisplayName = asset.external_display_name?.trim()
  if (externalDisplayName) return `public:${externalDisplayName}`

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

function getDisplayYearMonthSortValue(value: string | null | undefined): number {
  const normalized = (value ?? '').trim()
  if (!normalized) return 0

  const match = normalized.match(/(?:^|\s)(\d{2})(\d{2})(?=\s|$)/)
  if (!match) return 0

  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0

  return (2000 + year) * 100 + month
}

function getLatestDisplayYearMonth(images: ShowroomImageAsset[]): number {
  return images.reduce((latest, image) => {
    const value = getDisplayYearMonthSortValue(image.external_display_name)
    return value > latest ? value : latest
  }, 0)
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

function sortBeforeAfterImages(images: ShowroomImageAsset[]): ShowroomImageAsset[] {
  return [...images].sort((a, b) => {
    const order = (role: string | null | undefined) => {
      if (role === 'before') return 0
      if (role === 'after') return 1
      return 2
    }

    const roleDiff = order(a.before_after_role) - order(b.before_after_role)
    if (roleDiff !== 0) return roleDiff

    const aMain = a.is_main ? 1 : 0
    const bMain = b.is_main ? 1 : 0
    if (aMain !== bMain) return bMain - aMain

    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return aTime - bTime
  })
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
  const recencyScore = getRecencyScore(latestCreatedAt)

  return Math.round((photoScore + beforeAfterScore + mainBonus + productVarietyScore + colorVarietyScore + recencyScore) * 10) / 10
}

function compareSiteGroups(a: SiteGroup, b: SiteGroup): number {
  if (a.displayYearMonthSort !== b.displayYearMonthSort) return b.displayYearMonthSort - a.displayYearMonthSort
  if (a.representativeScore !== b.representativeScore) return b.representativeScore - a.representativeScore

  const aTime = a.latestCreatedAt ? new Date(a.latestCreatedAt).getTime() : 0
  const bTime = b.latestCreatedAt ? new Date(b.latestCreatedAt).getTime() : 0
  if (aTime !== bTime) return bTime - aTime

  return a.siteName.localeCompare(b.siteName, 'ko')
}

function buildSiteGroups(assets: ShowroomImageAsset[]): SiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()

  for (const asset of assets) {
    const siteKey = getShowroomGroupKey(asset)
    const list = bySite.get(siteKey) ?? []
    list.push(asset)
    bySite.set(siteKey, list)
  }

  const groups: SiteGroup[] = []

  for (const [, images] of bySite) {
    const siteName = getPreferredShowroomSiteName(images)
    const externalDisplayName = getPreferredExternalDisplayName(images)
    const sortedImages = [...images].sort((a, b) => {
      const aMain = a.is_main ? 1 : 0
      const bMain = b.is_main ? 1 : 0
      if (aMain !== bMain) return bMain - aMain

      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })
    const businessTypes = Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[]))
    const products = Array.from(new Set(images.map((image) => image.product_name?.trim()).filter(Boolean) as string[]))
    const colors = Array.from(new Set(images.map((image) => image.color_name?.trim()).filter(Boolean) as string[]))
    const hasBefore = images.some((image) => image.before_after_role === 'before')
    const hasAfter = images.some((image) => image.before_after_role === 'after')
    const latestCreatedAt = getLatestCreatedAt(images)
    const displayYearMonthSort = getLatestDisplayYearMonth(images)
    const mainImage = sortedImages.find((image) => image.before_after_role !== 'before') ?? sortedImages[0] ?? null

    groups.push({
      siteName,
      externalDisplayName,
      industryLabel: getPrimaryIndustryLabel(businessTypes),
      displayYearMonthSort,
      location: images[0]?.location?.trim() ?? '',
      businessTypes,
      products,
      colors,
      images,
      mainImage,
      hasBeforeAfter: hasBefore && hasAfter,
      latestCreatedAt,
      representativeScore: getRepresentativeScore(images, products, colors, hasBefore && hasAfter, latestCreatedAt),
    })
  }

  return groups.sort(compareSiteGroups)
}

function buildProductGroups(assets: ShowroomImageAsset[]): ProductGroup[] {
  const byProduct = new Map<string, ShowroomImageAsset[]>()

  for (const asset of assets) {
    const product = (asset.product_name ?? '').trim() || '미지정'
    const list = byProduct.get(product) ?? []
    list.push(asset)
    byProduct.set(product, list)
  }

  return Array.from(byProduct.entries())
    .map(([productName, images]) => {
      const sortedImages = [...images].sort((a, b) => {
        const aMain = a.is_main ? 1 : 0
        const bMain = b.is_main ? 1 : 0
        if (aMain !== bMain) return bMain - aMain

        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })

      return {
        productName,
        siteNames: Array.from(new Set(images.map((image) => image.site_name?.trim()).filter(Boolean) as string[])),
        externalDisplayNames: Array.from(new Set(images.map((image) => image.external_display_name?.trim()).filter(Boolean) as string[])),
        displayYearMonthSort: getLatestDisplayYearMonth(images),
        latestCreatedAt: getLatestCreatedAt(images),
        locations: Array.from(new Set(images.map((image) => image.location?.trim()).filter(Boolean) as string[])),
        businessTypes: Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[])),
        colors: Array.from(new Set(images.map((image) => image.color_name?.trim()).filter(Boolean) as string[])),
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

      if (a.displayYearMonthSort !== b.displayYearMonthSort) return b.displayYearMonthSort - a.displayYearMonthSort

      const aTime = a.latestCreatedAt ? new Date(a.latestCreatedAt).getTime() : 0
      const bTime = b.latestCreatedAt ? new Date(b.latestCreatedAt).getTime() : 0
      if (aTime !== bTime) return bTime - aTime

      if (a.siteNames.length !== b.siteNames.length) return b.siteNames.length - a.siteNames.length
      if (a.images.length !== b.images.length) return b.images.length - a.images.length

      return aSeries.normalizedName.localeCompare(bSeries.normalizedName, 'ko')
    })
}

function buildIndustrySections(groups: SiteGroup[]): IndustrySection[] {
  const grouped = new Map<string, SiteGroup[]>()

  groups.forEach((group) => {
    const industry = getPrimaryIndustryLabel(group.businessTypes)
    const list = grouped.get(industry) ?? []
    list.push(group)
    grouped.set(industry, list)
  })

  const labels = Array.from(grouped.keys())
  const orderedLabels = [
    ...INDUSTRY_PREFERRED_ORDER.filter((industry) => labels.includes(industry)),
    ...labels
      .filter((industry) => !INDUSTRY_PREFERRED_ORDER.includes(industry as (typeof INDUSTRY_PREFERRED_ORDER)[number]))
      .sort((a, b) => a.localeCompare(b, 'ko')),
  ]

  return orderedLabels.map((industry) => {
    const sectionGroups = grouped.get(industry) ?? []

    return {
      industry,
      groups: sectionGroups,
      siteCount: sectionGroups.length,
      photoCount: sectionGroups.reduce((total, group) => total + group.images.length, 0),
    }
  })
}

function buildColorGroups(assets: ShowroomImageAsset[]): ColorGroup[] {
  const byColor = new Map<string, ShowroomImageAsset[]>()

  for (const asset of assets) {
    const colorName = (asset.color_name ?? '').trim() || '미지정'
    const list = byColor.get(colorName) ?? []
    list.push(asset)
    byColor.set(colorName, list)
  }

  return Array.from(byColor.entries())
    .map(([colorName, images]) => {
      const sortedImages = [...images].sort((a, b) => {
        const aMain = a.is_main ? 1 : 0
        const bMain = b.is_main ? 1 : 0
        if (aMain !== bMain) return bMain - aMain

        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })

      return {
        colorName,
        siteNames: Array.from(new Set(images.map((image) => image.site_name?.trim()).filter(Boolean) as string[])),
        externalDisplayNames: Array.from(new Set(images.map((image) => image.external_display_name?.trim()).filter(Boolean) as string[])),
        locations: Array.from(new Set(images.map((image) => image.location?.trim()).filter(Boolean) as string[])),
        businessTypes: Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[])),
        products: Array.from(new Set(images.map((image) => image.product_name?.trim()).filter(Boolean) as string[])),
        images: sortedImages,
        mainImage: sortedImages[0] ?? null,
      }
    })
    .sort((a, b) => {
      if (a.siteNames.length !== b.siteNames.length) return b.siteNames.length - a.siteNames.length
      if (a.images.length !== b.images.length) return b.images.length - a.images.length
      return a.colorName.localeCompare(b.colorName, 'ko')
    })
}

function WatermarkBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-white shadow-lg backdrop-blur-sm ${className}`}
    >
      FINDGAGU.COM
    </div>
  )
}

function formatExpiryLabel(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function ShowroomPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<ShowroomImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('industry')
  const [selectedProductSeries, setSelectedProductSeries] = useState<string | null>(null)
  const [selectedProductFilter, setSelectedProductFilter] = useState<string | null>(null)
  const [selectedColorFilter, setSelectedColorFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [detailOpen, setDetailOpen] = useState<DetailMode | null>(null)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [detailTitle, setDetailTitle] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [industryPageBySection, setIndustryPageBySection] = useState<Record<string, number>>({})
  const [beforeAfterPage, setBeforeAfterPage] = useState(1)

  useEffect(() => {
    let cancelled = false

    setLoading(true)

    ;(async () => {
      try {
        const list = await fetchShowroomImageAssets()
        if (!cancelled) {
          setAssets(list)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setAssets([])
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSearchQuery(searchParams.get('q') ?? '')
  }, [searchParams])

  const setSearchQueryAndUrl = (value: string) => {
    setSearchQuery(value)

    const params = new URLSearchParams(searchParams)
    if (value.trim()) params.set('q', value.trim())
    else params.delete('q')
    setSearchParams(params)
  }

  const showroomAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role !== 'before'),
    [assets]
  )
  const beforeAfterAssets = useMemo(
    () => assets.filter((asset) => asset.before_after_role === 'before' || asset.before_after_role === 'after'),
    [assets]
  )

  const siteGroups = useMemo(() => buildSiteGroups(showroomAssets), [showroomAssets])
  const productGroups = useMemo(() => buildProductGroups(showroomAssets), [showroomAssets])
  const colorGroups = useMemo(() => buildColorGroups(showroomAssets), [showroomAssets])
  const beforeAfterGroups = useMemo(
    () => buildSiteGroups(beforeAfterAssets).filter((group) => group.hasBeforeAfter),
    [beforeAfterAssets]
  )

  const productOptions = useMemo(
    () => productGroups.map((group) => group.productName),
    [productGroups]
  )
  const colorOptions = useMemo(
    () => colorGroups.map((group) => group.colorName),
    [colorGroups]
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

  const filteredSiteGroups = useMemo(() => {
    if (!searchTrim) return siteGroups

    return siteGroups.filter(
      (group) =>
        group.siteName.toLowerCase().includes(searchLower) ||
        (group.externalDisplayName ?? '').toLowerCase().includes(searchLower) ||
        group.location.toLowerCase().includes(searchLower) ||
        group.businessTypes.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.products.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.colors.some((value) => value.toLowerCase().includes(searchLower))
    )
  }, [searchLower, searchTrim, siteGroups])

  const filteredProductGroups = useMemo(() => {
    if (!searchTrim) return productGroups

    return productGroups.filter(
      (group) =>
        group.productName.toLowerCase().includes(searchLower) ||
        group.siteNames.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.externalDisplayNames.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.locations.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.businessTypes.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.colors.some((value) => value.toLowerCase().includes(searchLower))
    )
  }, [productGroups, searchLower, searchTrim])

  const filteredColorGroups = useMemo(() => {
    if (!searchTrim) return colorGroups

    return colorGroups.filter(
      (group) =>
        group.colorName.toLowerCase().includes(searchLower) ||
        group.siteNames.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.externalDisplayNames.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.locations.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.businessTypes.some((value) => value.toLowerCase().includes(searchLower)) ||
        group.products.some((value) => value.toLowerCase().includes(searchLower))
    )
  }, [colorGroups, searchLower, searchTrim])

  const productFilteredGroups = useMemo(() => {
    if (selectedProductSeries) {
      const seriesGroups = selectedProductSeries === '기타'
        ? filteredProductGroups.filter((group) => !parseProductSeries(group.productName).seriesSuffix)
        : filteredProductGroups.filter((group) => parseProductSeries(group.productName).baseName === selectedProductSeries)

      if (!selectedProductFilter) return seriesGroups
      return seriesGroups.filter((group) => group.productName === selectedProductFilter)
    }

    if (!selectedProductFilter) return filteredProductGroups
    return filteredProductGroups.filter((group) => group.productName === selectedProductFilter)
  }, [filteredProductGroups, selectedProductFilter, selectedProductSeries])

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
  }, [currentSeriesProducts, productOptions, selectedProductFilter, selectedProductSeries])

  useEffect(() => {
    if (!selectedColorFilter) return
    if (!colorOptions.includes(selectedColorFilter)) {
      setSelectedColorFilter(null)
    }
  }, [colorOptions, selectedColorFilter])

  const industrySections = useMemo(() => buildIndustrySections(filteredSiteGroups), [filteredSiteGroups])
  const paginatedIndustrySections = useMemo<PaginatedIndustrySection[]>(() => {
    return industrySections.map((section) => {
      const totalPages = Math.max(1, Math.ceil(section.groups.length / INDUSTRY_PAGE_SIZE))
      const currentPage = Math.min(Math.max(industryPageBySection[section.industry] ?? 1, 1), totalPages)
      const startIndex = (currentPage - 1) * INDUSTRY_PAGE_SIZE

      return {
        ...section,
        currentPage,
        totalPages,
        pagedGroups: section.groups.slice(startIndex, startIndex + INDUSTRY_PAGE_SIZE),
      }
    })
  }, [industryPageBySection, industrySections])

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
  }, [currentBeforeAfterPage, visibleBeforeAfterGroups])

  useEffect(() => {
    if (beforeAfterPage > beforeAfterTotalPages) {
      setBeforeAfterPage(beforeAfterTotalPages)
    }
  }, [beforeAfterPage, beforeAfterTotalPages])

  const detailImages = useMemo(() => {
    if (!detailKey || detailOpen === null) return []
    if (detailOpen === 'site') return siteGroups.find((group) => group.siteName === detailKey)?.images ?? []
    if (detailOpen === 'beforeAfter') {
      const group = beforeAfterGroups.find((item) => item.siteName === detailKey)
      return group ? sortBeforeAfterImages(group.images) : []
    }
    if (detailOpen === 'color') return colorGroups.find((group) => group.colorName === detailKey)?.images ?? []
    return productGroups.find((group) => group.productName === detailKey)?.images ?? []
  }, [beforeAfterGroups, colorGroups, detailKey, detailOpen, productGroups, siteGroups])

  const openDetail = (mode: DetailMode, key: string, title?: string) => {
    setDetailOpen(mode)
    setDetailKey(key)
    setDetailTitle(title ?? key)
    setLightboxIndex(0)
  }

  const goPrev = useCallback(() => {
    setLightboxIndex((index) => (index <= 0 ? detailImages.length - 1 : index - 1))
  }, [detailImages.length])

  const goNext = useCallback(() => {
    setLightboxIndex((index) => (index >= detailImages.length - 1 ? 0 : index + 1))
  }, [detailImages.length])

  const moveIndustryPage = useCallback((industry: string, nextPage: number) => {
    setIndustryPageBySection((prev) => ({
      ...prev,
      [industry]: nextPage,
    }))
  }, [])

  const scrollToSection = useCallback((elementId: string) => {
    document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const renderSiteGroupCard = (group: SiteGroup) => {
    const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''
    const displayLabel = group.externalDisplayName ?? group.siteName

    return (
      <div
        key={group.siteName}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
      >
        <button
          type="button"
          onClick={() => openDetail('site', group.siteName, displayLabel)}
          className="group flex min-h-0 flex-1 flex-col text-left"
        >
          <div className="relative aspect-[4/3] shrink-0 overflow-hidden rounded-t-2xl bg-neutral-100">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={group.siteName}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">대표 이미지 없음</div>
            )}
            {group.hasBeforeAfter && (
              <span className="absolute right-2 top-2 rounded-full bg-black/85 px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] text-white shadow-xl">
                Before/After
              </span>
            )}
            <WatermarkBadge />
            {group.images.length > 1 && (
              <div className="absolute bottom-2 right-2 flex gap-0.5" aria-hidden>
                {group.images.slice(1, 4).map((image, index) => (
                  <div
                    key={image.id}
                    className="h-10 w-10 overflow-hidden rounded-md border-2 border-white bg-neutral-200 shadow-md"
                    style={{ transform: `translateY(${index * 2}px) rotate(${index * 3 - 2}deg)` }}
                  >
                    <img
                      src={image.thumbnail_url || image.cloudinary_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="flex min-w-0 items-center gap-2">
              {group.businessTypes.length > 0 && (
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                  {getPrimaryIndustryLabel(group.businessTypes)}
                </span>
              )}
              <p className="min-w-0 truncate text-[13px] font-medium leading-tight text-amber-600">{displayLabel}</p>
            </div>
            <dl className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
              {group.location && (
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-neutral-400">지역</span>
                  <span>{group.location}</span>
                </div>
              )}
              {group.businessTypes.length > 0 && (
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-neutral-400">업종</span>
                  <span>{group.businessTypes.slice(0, 3).join(', ')}</span>
                </div>
              )}
              {group.products.length > 0 && (
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-neutral-400">제품명</span>
                  <span className="truncate">{group.products.slice(0, 3).join(', ')}</span>
                </div>
              )}
              {group.colors.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 text-neutral-400">색상</span>
                  <span>{group.colors.slice(0, 4).join(', ')}</span>
                </div>
              )}
            </dl>
            <p className="mt-2 flex items-center gap-1.5 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
              <Images className="h-3.5 w-3.5 shrink-0" />
              <span>사진 {group.images.length}장</span>
            </p>
          </div>
        </button>
      </div>
    )
  }

  const renderBeforeAfterCard = (group: SiteGroup) => {
    const beforeImages = group.images.filter((image) => image.before_after_role === 'before')
    const afterImages = group.images.filter((image) => image.before_after_role === 'after')
    const beforeImage = beforeImages[0] ?? null
    const afterImage = afterImages.find((image) => image.is_main) ?? afterImages[0] ?? null
    const displayLabel = group.externalDisplayName ?? group.siteName

    if (!beforeImage || !afterImage) return null

    return (
      <div
        key={`before-after-${group.siteName}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <button
          type="button"
          onClick={() => openDetail('beforeAfter', group.siteName, displayLabel)}
          className="w-full flex-1 text-left"
        >
          <div className="grid grid-cols-2">
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img
                src={beforeImage.thumbnail_url || beforeImage.cloudinary_url}
                alt={`${group.siteName} before`}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/85 px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] text-white shadow-xl">
                Before
              </span>
              <WatermarkBadge className="bottom-2 left-2" />
            </div>
            <div className="relative aspect-[4/3] bg-neutral-100">
              <img
                src={afterImage.thumbnail_url || afterImage.cloudinary_url}
                alt={`${group.siteName} after`}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] text-white shadow-xl">
                After
              </span>
              <WatermarkBadge className="bottom-2 left-2" />
            </div>
          </div>
          <div className="p-4">
            <div className="flex min-w-0 items-center gap-2">
              {group.businessTypes[0] && (
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                  {group.businessTypes[0]}
                </span>
              )}
              <p className="min-w-0 truncate text-[13px] font-medium leading-tight text-amber-600">{displayLabel}</p>
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              전후 비교가 가능한 리뉴얼 사례입니다. 눌러서 전체 사진을 확인해 보세요.
            </p>
          </div>
        </button>
      </div>
    )
  }

  const renderColorGroupCard = (group: ColorGroup) => {
    const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''

    return (
      <div
        key={group.colorName}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
      >
        <button
          type="button"
          onClick={() => openDetail('color', group.colorName)}
          className="group flex h-full w-full flex-col text-left"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={group.colorName}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">대표 이미지 없음</div>
            )}
            <WatermarkBadge />
            {group.images.length > 1 && (
              <div className="absolute bottom-2 right-2 flex gap-0.5" aria-hidden>
                {group.images.slice(1, 4).map((image, index) => (
                  <div
                    key={image.id}
                    className="h-10 w-10 overflow-hidden rounded-md border-2 border-white bg-neutral-200 shadow-md"
                    style={{ transform: `translateY(${index * 2}px) rotate(${index * 3 - 2}deg)` }}
                  >
                    <img
                      src={image.thumbnail_url || image.cloudinary_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <h3 className="leading-snug font-semibold text-neutral-900">{group.colorName}</h3>
            <dl className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
              {group.products.length > 0 && (
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-neutral-400">제품명</span>
                  <span className="truncate">{group.products.slice(0, 3).join(', ')}</span>
                </div>
              )}
              {group.siteNames.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="shrink-0 text-neutral-400">현장명</span>
                  <span>{group.siteNames.slice(0, 3).join(', ')}</span>
                </div>
              )}
              {group.businessTypes.length > 0 && (
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-neutral-400">업종</span>
                  <span>{group.businessTypes.slice(0, 3).join(', ')}</span>
                </div>
              )}
              {group.locations.length > 0 && (
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-neutral-400">지역</span>
                  <span>{group.locations.slice(0, 3).join(', ')}</span>
                </div>
              )}
            </dl>
            <p className="mt-2 flex items-center gap-1.5 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
              <Images className="h-3.5 w-3.5 shrink-0" />
              <span>사진 {group.images.length}장</span>
            </p>
          </div>
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900 md:text-2xl">시공사례 쇼룸</h1>
            <p className="text-base text-neutral-600 md:text-lg">업종별, 제품별로 사례를 탐색하고 전체 사진을 확인하세요.</p>
            <p className="text-xs text-neutral-500 md:text-sm">
              내부 직원과 고객이 같은 구조로 보고 대화할 수 있도록 정리한 공통 시공사례 쇼룸입니다.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-lg border border-neutral-200 bg-neutral-100/80 p-0.5">
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
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                placeholder={
                  viewMode === 'product'
                    ? '제품명 검색 (예: 아카시아, 원목)'
                    : viewMode === 'color'
                      ? '색상명, 제품명, 현장명 검색'
                      : '업종, 현장명, 지역, 제품명 검색'
                }
                value={searchQuery}
                onChange={(event) => setSearchQueryAndUrl(event.target.value)}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-4 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400"
              />
            </div>
          </div>

          {viewMode === 'product' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs text-neutral-500">시리즈 선택</span>
              <div className="w-full sm:w-56">
                <select
                  value={selectedProductSeries ?? ''}
                  onChange={(event) => {
                    setSelectedProductSeries(event.target.value || null)
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
              <span className="shrink-0 text-xs text-neutral-500">세부 제품</span>
              <div className="w-full sm:w-80">
                <select
                  value={selectedProductFilter ?? ''}
                  onChange={(event) => setSelectedProductFilter(event.target.value || null)}
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
              <span className="shrink-0 text-xs text-neutral-500">색상 선택</span>
              <div className="w-full sm:w-80">
                <select
                  value={selectedColorFilter ?? ''}
                  onChange={(event) => setSelectedColorFilter(event.target.value || null)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400"
                >
                  <option value="">전체 색상</option>
                  {colorOptions.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {viewMode === 'industry' && paginatedIndustrySections.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {paginatedIndustrySections.map((section) => (
                  <button
                    key={`industry-nav-${section.industry}`}
                    type="button"
                    className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900"
                    onClick={() => scrollToSection(`showroom-industry-${section.industry}`)}
                  >
                    {section.industry}
                  </button>
                ))}
              </div>
              {visibleBeforeAfterGroups.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900"
                    onClick={() => scrollToSection('showroom-before-after-section')}
                  >
                    <FileCheck className="h-4 w-4" />
                    Before/After
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        {viewMode === 'industry' && featuredBeforeAfterGroups.length > 0 && (
          <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">대표 Before/After 사례</h2>
                <p className="text-sm text-neutral-600">
                  변화 폭이 큰 전후 비교 사례 3개를 먼저 보여드립니다. 더 보고 싶으면 아래 전체 전후 비교 섹션으로 이동하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('showroom-before-after-section')}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                <FileCheck className="h-4 w-4" />
                전체 Before/After 보기
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {featuredBeforeAfterGroups.map((group) => renderBeforeAfterCard(group))}
            </div>
          </section>
        )}

        {viewMode === 'product' && productFilteredGroups.length === 0 && (
          <p className="py-12 text-center text-neutral-500">검색 결과가 없습니다.</p>
        )}
        {viewMode === 'color' && colorFilteredGroups.length === 0 && (
          <p className="py-12 text-center text-neutral-500">검색 결과가 없습니다.</p>
        )}
        {viewMode === 'industry' && paginatedIndustrySections.length === 0 && (
          <p className="py-12 text-center text-neutral-500">검색 결과가 없습니다.</p>
        )}

        {viewMode === 'product' && productFilteredGroups.length > 0 && (
          <div className="grid grid-cols-2 items-stretch gap-6 lg:grid-cols-3">
            {productFilteredGroups.map((group) => {
              const imageUrl = group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || ''

              return (
                <div
                  key={group.productName}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => openDetail('product', group.productName)}
                    className="group flex h-full w-full flex-col text-left"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={group.productName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-400">대표 이미지 없음</div>
                      )}
                      <WatermarkBadge />
                      {group.images.length > 1 && (
                        <div className="absolute bottom-2 right-2 flex gap-0.5" aria-hidden>
                          {group.images.slice(1, 4).map((image, index) => (
                            <div
                              key={image.id}
                              className="h-10 w-10 overflow-hidden rounded-md border-2 border-white bg-neutral-200 shadow-md"
                              style={{ transform: `translateY(${index * 2}px) rotate(${index * 3 - 2}deg)` }}
                            >
                              <img
                                src={image.thumbnail_url || image.cloudinary_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col p-4">
                      <h3 className="leading-snug font-semibold text-neutral-900">{group.productName}</h3>
                      <dl className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
                        {group.siteNames.length > 0 && (
                          <div className="flex items-start gap-1.5">
                            <span className="shrink-0 text-neutral-400">현장명</span>
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
                            <span className="shrink-0 text-neutral-400">지역</span>
                            <span>{group.locations.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.businessTypes.length > 0 && (
                          <div className="flex gap-1.5">
                            <span className="shrink-0 text-neutral-400">업종</span>
                            <span>{group.businessTypes.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {group.colors.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="shrink-0 text-neutral-400">색상</span>
                            <span>{group.colors.slice(0, 4).join(', ')}</span>
                          </div>
                        )}
                      </dl>
                      <p className="mt-2 flex items-center gap-1.5 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
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

        {viewMode === 'color' && colorFilteredGroups.length > 0 && (
          <div className="grid grid-cols-2 items-stretch gap-6 lg:grid-cols-3">
            {colorFilteredGroups.map((group) => renderColorGroupCard(group))}
          </div>
        )}

        {viewMode === 'industry' && (
          <>
            <div id="showroom-gallery" className="space-y-10">
              {paginatedIndustrySections.map((section, index) => (
                <section
                  key={section.industry}
                  id={`showroom-industry-${section.industry}`}
                  className={`scroll-mt-28 space-y-4 ${index > 0 ? 'border-t-4 border-neutral-300 pt-8' : ''}`}
                >
                  <div className="flex flex-col gap-1 border-b border-neutral-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-neutral-900">{section.industry}</h2>
                      <p className="text-sm text-neutral-500">
                        {section.siteCount}개 현장 · 사진 {section.photoCount}장
                      </p>
                    </div>
                    <p className="text-xs text-neutral-400">비슷한 업종 사례를 위에서 아래로 비교해 보세요.</p>
                  </div>
                  <div className="grid grid-cols-2 items-stretch gap-6 lg:grid-cols-3">
                    {section.pagedGroups.map((group) => renderSiteGroupCard(group))}
                  </div>
                  {section.totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                        disabled={section.currentPage <= 1}
                        onClick={() => moveIndustryPage(section.industry, section.currentPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        이전
                      </button>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {Array.from({ length: section.totalPages }, (_, index) => {
                          const pageNumber = index + 1
                          const isCurrent = pageNumber === section.currentPage
                          return (
                            <button
                              key={`${section.industry}-page-${pageNumber}`}
                              type="button"
                              className={`min-w-9 rounded-xl px-3 py-2 text-sm ${
                                isCurrent ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-700'
                              }`}
                              onClick={() => moveIndustryPage(section.industry, pageNumber)}
                            >
                              {pageNumber}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                        disabled={section.currentPage >= section.totalPages}
                        onClick={() => moveIndustryPage(section.industry, section.currentPage + 1)}
                      >
                        다음
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </section>
              ))}
            </div>

            {visibleBeforeAfterGroups.length > 0 && (
              <section
                id="showroom-before-after-section"
                className="mt-10 scroll-mt-28 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:p-5"
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-neutral-900">전후 비교 사례</h3>
                    <p className="text-sm text-neutral-600">
                      리뉴얼 전후 변화를 한눈에 비교할 수 있는 현장들입니다.
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500">{visibleBeforeAfterGroups.length}개 현장</p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {pagedBeforeAfterGroups.map((group) => renderBeforeAfterCard(group))}
                </div>
                {beforeAfterTotalPages > 1 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                      disabled={currentBeforeAfterPage <= 1}
                      onClick={() => setBeforeAfterPage(currentBeforeAfterPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </button>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {Array.from({ length: beforeAfterTotalPages }, (_, index) => {
                        const pageNumber = index + 1
                        const isCurrent = pageNumber === currentBeforeAfterPage
                        return (
                          <button
                            key={`before-after-page-${pageNumber}`}
                            type="button"
                            className={`min-w-9 rounded-xl px-3 py-2 text-sm ${
                              isCurrent ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-700'
                            }`}
                            onClick={() => setBeforeAfterPage(pageNumber)}
                          >
                            {pageNumber}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
                      disabled={currentBeforeAfterPage >= beforeAfterTotalPages}
                      onClick={() => setBeforeAfterPage(currentBeforeAfterPage + 1)}
                    >
                      다음
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4">
          <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-2xl border-0 bg-neutral-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
              <h3 className="truncate font-semibold text-white">{detailTitle ?? detailKey}</h3>
              <button
                type="button"
                onClick={() => setDetailOpen(null)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {detailImages.length === 0 ? (
                <p className="py-8 text-center text-neutral-500">사진이 없습니다.</p>
              ) : (
                <div className="relative flex min-h-[60vh] items-center justify-center">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    aria-label="이전"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="relative inline-block max-w-full">
                    <img
                      src={detailImages[lightboxIndex]?.cloudinary_url || detailImages[lightboxIndex]?.thumbnail_url || ''}
                      alt=""
                      className="block max-h-[70vh] max-w-full rounded-lg object-contain"
                    />
                    {(() => {
                      const current = detailImages[lightboxIndex]
                      const productName = current?.product_name?.trim()
                      const colorName = current?.color_name?.trim()
                      const beforeAfterRole = current?.before_after_role
                      if (!productName && !colorName && !beforeAfterRole) return null

                      return (
                        <div className="absolute right-2 top-2 z-10 rounded-lg bg-black/70 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm">
                          {beforeAfterRole && (
                            <div className="mb-1">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${
                                  beforeAfterRole === 'before' ? 'bg-black/85' : 'bg-emerald-600'
                                }`}
                              >
                                {beforeAfterRole === 'before' ? 'Before' : 'After'}
                              </span>
                            </div>
                          )}
                          {productName && <div className="font-medium">제품명 {productName}</div>}
                          {colorName && <div className="mt-0.5 text-xs text-neutral-200">색상 {colorName}</div>}
                        </div>
                      )
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    aria-label="다음"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
              )}
            </div>
            {detailImages.length > 0 && (
              <div className="border-t border-neutral-700 px-4 py-2 text-center text-sm text-neutral-500">
                {lightboxIndex + 1} / {detailImages.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
