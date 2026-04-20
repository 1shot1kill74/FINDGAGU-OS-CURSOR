import type { ShowroomImageAsset, ShowroomSiteOverride, ShowroomSiteOverrideSectionKey } from '@/lib/imageAssetService'
import { getShowroomAssetGroupKey } from '@/lib/imageAssetService'
import { broadenPublicDisplayName } from '@/lib/showroomShareService'
import { CONCERN_CARDS, INDUSTRY_PREFERRED_ORDER } from '@/pages/showroom/showroomPageConstants'
import type { ColorGroup, ProductGroup, SiteGroup } from '@/pages/showroom/showroomPageTypes'

export function getPublicCardNewsHref(siteKey: string) {
  return `/public/showroom/cardnews/${encodeURIComponent(siteKey)}`
}

export function getPrimaryIndustryLabel(businessTypes: string[]): string {
  const normalized = businessTypes.map((type) => type.trim()).filter(Boolean)
  if (normalized.length === 0) return '기타'

  for (const preferred of INDUSTRY_PREFERRED_ORDER) {
    if (normalized.some((type) => type === preferred || type.includes(preferred))) {
      return preferred
    }
  }

  return '기타'
}

export function buildShowroomSiteKey(
  sectionKey: ShowroomSiteOverrideSectionKey,
  industryLabel: string,
  siteName: string
): string {
  return `${sectionKey}::${industryLabel}::${siteName}`
}


export function getPreferredShowroomSiteName(images: ShowroomImageAsset[]): string {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const canonical = image.canonical_site_name?.trim()
    if (canonical) return canonical
    const siteName = image.raw_site_name?.trim() || image.space_display_name?.trim() || image.site_name?.trim()
    if (siteName) return siteName
  }
  return '미지정'
}

export function getPreferredExternalDisplayName(images: ShowroomImageAsset[]): string | null {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const externalDisplayName = image.broad_external_display_name?.trim()
      || broadenPublicDisplayName(image.external_display_name?.trim() ?? null)
    if (externalDisplayName) return externalDisplayName
  }
  return null
}

export function resolveShowroomSiteOverride(
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

export function parseProductSeries(productName: string): {
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

export function compareSeriesSuffix(a: string | null, b: string | null): number {
  if (a && !b) return -1
  if (!a && b) return 1
  if (!a && !b) return 0
  return a!.localeCompare(b!, 'en', { numeric: true })
}

export function sortBeforeAfterImages(images: ShowroomImageAsset[]): ShowroomImageAsset[] {
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

export function getLatestCreatedAt(images: ShowroomImageAsset[]): string | null {
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

export function getRecencyScore(latestCreatedAt: string | null): number {
  if (!latestCreatedAt) return 0
  const ageMs = Date.now() - new Date(latestCreatedAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays <= 30) return 12
  if (ageDays <= 90) return 8
  if (ageDays <= 180) return 4
  return 0
}

export function getRepresentativeScore(
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

export function getSiteYearMonthSortValue(siteName: string): number {
  const matches = siteName.match(/\d{4}/g) ?? []

  for (const token of matches) {
    const month = Number(token.slice(2, 4))
    if (month >= 1 && month <= 12) return Number(token)
  }

  return 0
}

export function compareSiteGroups(a: SiteGroup, b: SiteGroup): number {
  const aHasDisplayOrder = a.displayOrder != null
  const bHasDisplayOrder = b.displayOrder != null
  if (aHasDisplayOrder && !bHasDisplayOrder) return -1
  if (!aHasDisplayOrder && bHasDisplayOrder) return 1
  if (aHasDisplayOrder && bHasDisplayOrder && a.displayOrder !== b.displayOrder) {
    return (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
  }

  const aHasManual = a.manualPriority != null
  const bHasManual = b.manualPriority != null
  if (aHasManual && !bHasManual) return -1
  if (!aHasManual && bHasManual) return 1
  if (aHasManual && bHasManual && a.manualPriority !== b.manualPriority) {
    return (a.manualPriority ?? Number.MAX_SAFE_INTEGER) - (b.manualPriority ?? Number.MAX_SAFE_INTEGER)
  }
  const aYearMonth = getSiteYearMonthSortValue(a.siteName)
  const bYearMonth = getSiteYearMonthSortValue(b.siteName)
  if (aYearMonth !== bYearMonth) return bYearMonth - aYearMonth

  return a.siteName.localeCompare(b.siteName, 'ko')
}

export function getPublicSectionDisplayOrder(
  images: ShowroomImageAsset[],
  sectionKey: ShowroomSiteOverrideSectionKey
): number | null {
  const orders = images
    .map((image) => sectionKey === 'before_after' ? image.before_after_site_order : image.industry_site_order)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (orders.length === 0) return null
  return Math.min(...orders)
}

export function buildSiteGroups(
  assets: ShowroomImageAsset[],
  overrideMap: Map<string, ShowroomSiteOverride> = new Map(),
  sectionKey: ShowroomSiteOverrideSectionKey = 'industry'
): SiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()
  for (const a of assets) {
    const siteKey = getShowroomAssetGroupKey(a)
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
      displayOrder: getPublicSectionDisplayOrder(images, sectionKey),
      manualPriority: override?.manual_priority ?? null,
    })
  }
  return groups.sort(compareSiteGroups)
}

export function buildProductGroups(assets: ShowroomImageAsset[]): ProductGroup[] {
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

export function buildColorGroups(assets: ShowroomImageAsset[]): ColorGroup[] {
  const byColor = new Map<string, ShowroomImageAsset[]>()
  for (const asset of assets) {
    const color = (asset.color_name ?? '').trim() || '미지정'
    const list = byColor.get(color) ?? []
    list.push(asset)
    byColor.set(color, list)
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

export function buildShowroomContactUrl(params: {
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

export function summarizeTopLabels(values: Array<string | null | undefined>, limit = 2): string[] {
  const counts = new Map<string, number>()
  values.forEach((value) => {
    const normalized = (value ?? '').trim()
    if (!normalized) return
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  })
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([label]) => label)
}

export function collectUniqueLabels(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    const normalized = (value ?? '').trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })
  return result
}

export function getBroadPublicLabel(siteName: string | null | undefined, externalDisplayName?: string | null): string {
  const external = externalDisplayName?.trim() ?? ''
  const broadExternal = broadenPublicDisplayName(external)
  if (broadExternal) return broadExternal
  if (external) return external
  const normalizedSiteName = siteName?.trim() ?? ''
  return broadenPublicDisplayName(normalizedSiteName) ?? normalizedSiteName
}

export function getGroupPublicLabel(group: Pick<SiteGroup, 'siteName' | 'externalDisplayName'>): string {
  return getBroadPublicLabel(group.siteName, group.externalDisplayName)
}

export function getPublicLabelsFromImages(images: ShowroomImageAsset[]): string[] {
  return collectUniqueLabels(
    images.map((image) => getBroadPublicLabel(image.site_name, image.external_display_name))
  )
}

export function buildColorNarrative(labels: string[]): string {
  if (labels.length === 0) return '정돈된 톤의 공간'
  if (labels.length === 1) return `${labels[0]} 톤의 공간`
  return `${labels.join(', ')} 조합으로 정리한 공간`
}

export function buildBasicShortsPlan(images: ShowroomImageAsset[]) {
  const orderedImages = [...images].sort((a, b) => {
    const scoreA = (a.is_main ? 1000 : 0) + (a.internal_score ?? 0) + (a.view_count ?? 0) * 0.01
    const scoreB = (b.is_main ? 1000 : 0) + (b.internal_score ?? 0) + (b.view_count ?? 0) * 0.01
    if (scoreA !== scoreB) return scoreB - scoreA
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })

  const first = orderedImages[0] ?? null
  const externalDisplayNames = collectUniqueLabels(orderedImages.map((image) => image.external_display_name))
  const displayName =
    externalDisplayNames[0] ||
    first?.canonical_site_name?.trim() ||
    first?.site_name?.trim() ||
    '대표 공간 사례'
  const industry = first?.business_type?.trim() || summarizeTopLabels(orderedImages.map((image) => image.business_type), 1)[0] || '공간'
  const productLabels = collectUniqueLabels(orderedImages.map((image) => image.product_name))
  const colorLabels = summarizeTopLabels(orderedImages.map((image) => image.color_name), 2)
  const productSummary = productLabels.length > 0 ? productLabels.join(', ') : '맞춤 가구 구성'
  const colorSummary = colorLabels.length > 0 ? colorLabels.join(', ') : '미지정'
  const colorNarrative = buildColorNarrative(colorLabels)

  return {
    orderedImages,
    displayName,
    industry,
    productSummary,
    colorSummary,
    heroLine: '이 공간이 좋아 보이시나요?',
    detailLine: '교육 공간에 맞춘 배치와 구성으로',
    detailLine2: '집중감과 완성도를 잡았습니다.',
    closingLine: '이런 구성을 우리 공간에도 적용하고 싶다면',
    endingTitle: '파인드가구',
    endingSubtitle: '성공한 공간은 디테일이 다릅니다',
  }
}

export function orderImagesByIdList(images: ShowroomImageAsset[], orderedIds: string[]) {
  const rank = new Map(orderedIds.map((id, index) => [id, index]))
  return [...images].sort((a, b) => {
    const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aRank - bRank
  })
}

export function moveIdBefore(ids: string[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return ids
  const withoutDragged = ids.filter((id) => id !== draggedId)
  const targetIndex = withoutDragged.indexOf(targetId)
  if (targetIndex === -1) return ids
  withoutDragged.splice(targetIndex, 0, draggedId)
  return withoutDragged
}

export function moveIdByOffset(ids: string[], targetId: string, direction: -1 | 1) {
  const currentIndex = ids.indexOf(targetId)
  if (currentIndex === -1) return ids
  const nextIndex = currentIndex + direction
  if (nextIndex < 0 || nextIndex >= ids.length) return ids
  const next = [...ids]
  const [item] = next.splice(currentIndex, 1)
  next.splice(nextIndex, 0, item)
  return next
}

export function isConcernTag(value: string | null | undefined): value is string {
  if (!value) return false
  return CONCERN_CARDS.some((card) => card.tag === value)
}
