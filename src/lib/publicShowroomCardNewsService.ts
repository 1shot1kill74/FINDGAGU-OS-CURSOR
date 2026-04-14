import { type ShowroomImageAsset } from '@/lib/imageAssetService'
import {
  buildShowroomAssetUrlByIdMap,
  buildShowroomCaseCardNewsPackage,
  parseCardNewsSlidesFromStoredResponse,
  resolveCardNewsSlideImageUrl,
} from '@/lib/showroomCaseContentPackage'
import {
  fetchPublishedShowroomCaseProfileDrafts,
  type ShowroomCaseProfileDraft,
} from '@/lib/showroomCaseProfileService'
import { broadenPublicDisplayName, fetchPublicShowroomAssets } from '@/lib/showroomShareService'

export type PublicShowroomCardNewsListItem = {
  siteName: string
  canonicalSiteName: string | null
  siteKey: string
  slug: string | null
  displayName: string
  externalLabel: string | null
  industry: string | null
  hook: string
  summary: string
  coverImageUrl: string | null
  publishedAt: string | null
}

type ShowroomCardNewsPublicContext = {
  siteName: string
  externalLabel: string | null
  beforeImage: ShowroomImageAsset | null
  afterImage: ShowroomImageAsset | null
  businessTypes: string[]
  images: ShowroomImageAsset[]
}

function getShowroomGroupKey(asset: ShowroomImageAsset): string {
  const publicGroupKey = asset.public_group_key?.trim()
  if (publicGroupKey) return publicGroupKey
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

function getPreferredExternalLabel(images: ShowroomImageAsset[]): string | null {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const externalLabel = image.broad_external_display_name?.trim()
      || broadenPublicDisplayName(image.external_display_name?.trim() ?? null)
    if (externalLabel) return externalLabel
  }
  return null
}

function groupBeforeAfterAssets(assets: ShowroomImageAsset[]): Map<string, ShowroomImageAsset[]> {
  const grouped = new Map<string, ShowroomImageAsset[]>()
  assets
    .filter((asset) => asset.before_after_role === 'before' || asset.before_after_role === 'after')
    .forEach((asset) => {
      const key = getShowroomGroupKey(asset)
      const list = grouped.get(key) ?? []
      list.push(asset)
      grouped.set(key, list)
    })
  return grouped
}

function pickBeforeAfterPair(images: ShowroomImageAsset[]) {
  const before = images.find((image) => image.before_after_role === 'before') ?? null
  const after = images.find((image) => image.before_after_role === 'after' && image.is_main)
    ?? images.find((image) => image.before_after_role === 'after')
    ?? null
  return { before, after }
}

function profileLookupKeys(profile: ShowroomCaseProfileDraft): string[] {
  return Array.from(new Set([
    profile.siteName.trim(),
    profile.canonicalSiteName?.trim() ?? '',
    profile.cardNewsPublication.siteKey?.trim() ?? '',
    profile.cardNewsPublication.slug?.trim() ?? '',
  ].filter(Boolean)))
}

function findPublicContext(
  profile: ShowroomCaseProfileDraft,
  groupedAssets: Map<string, ShowroomImageAsset[]>,
): ShowroomCardNewsPublicContext {
  const lookup = new Set(profileLookupKeys(profile))

  for (const [, images] of groupedAssets) {
    const preferredSiteName = getPreferredShowroomSiteName(images)
    const preferredExternalLabel = getPreferredExternalLabel(images)
    const matches = lookup.has(preferredSiteName)
      || (preferredExternalLabel ? lookup.has(preferredExternalLabel) : false)
      || images.some((image) => {
        const values = [
          image.site_name?.trim(),
          image.canonical_site_name?.trim(),
          image.external_display_name?.trim(),
          image.broad_external_display_name?.trim(),
          broadenPublicDisplayName(image.external_display_name?.trim() ?? null),
        ].filter(Boolean)
        return values.some((value) => lookup.has(value as string))
      })
    if (!matches) continue

    const { before, after } = pickBeforeAfterPair(images)
    return {
      siteName: preferredSiteName,
      externalLabel: preferredExternalLabel,
      beforeImage: before,
      afterImage: after,
      businessTypes: Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[])),
      images,
    }
  }

  return {
    siteName: profile.siteName,
    externalLabel: buildPublicDisplayName({
      siteName: profile.siteName,
      externalLabel: broadenPublicDisplayName(profile.siteName),
      industry: profile.industry,
    }),
    beforeImage: null,
    afterImage: null,
    businessTypes: profile.industry?.trim() ? [profile.industry.trim()] : [],
    images: [],
  }
}

function buildFallbackSlides(profile: ShowroomCaseProfileDraft) {
  return buildShowroomCaseCardNewsPackage({
    siteName: profile.siteName,
    externalLabel: buildPublicDisplayName({
      siteName: profile.siteName,
      externalLabel: broadenPublicDisplayName(profile.siteName),
      industry: profile.industry,
    }),
    industry: profile.industry,
    headlineHook: profile.headlineHook ?? '',
    painPoint: profile.painPoint ?? '',
    problemDetail: profile.problemDetail ?? '',
    solutionPoint: profile.solutionPoint ?? '',
    solutionDetail: profile.solutionDetail ?? '',
    evidencePoints: profile.evidencePoints ?? [],
  }).slides
}

function resolvePublishedSlides(profile: ShowroomCaseProfileDraft, context: ShowroomCardNewsPublicContext) {
  const storedSlides = parseCardNewsSlidesFromStoredResponse(profile.cardNewsGeneration.response)
  const fallbackSlides = buildFallbackSlides(profile)
  const slides = storedSlides && storedSlides.length > 0 ? storedSlides : fallbackSlides
  const assetUrlById = buildShowroomAssetUrlByIdMap(context.images)
  const beforeUrl = context.beforeImage?.thumbnail_url || context.beforeImage?.cloudinary_url || ''
  const afterUrl = context.afterImage?.thumbnail_url || context.afterImage?.cloudinary_url || ''

  return slides.map((slide) => ({
    ...slide,
    imageUrl: resolveCardNewsSlideImageUrl({
      role: slide.key,
      imageRef: slide.imageRef,
      imageUrl: slide.imageUrl,
      beforeUrl,
      afterUrl,
      assetUrlById,
    }) || slide.imageUrl || null,
  }))
}

function buildSummary(profile: ShowroomCaseProfileDraft): string {
  return profile.painPoint?.trim()
    || profile.problemDetail?.trim()
    || profile.headlineHook?.trim()
    || '현장 문제와 해결 접근을 카드뉴스로 정리했습니다.'
}

function buildHook(profile: ShowroomCaseProfileDraft, slides: Array<{ body: string }>): string {
  return profile.headlineHook?.trim()
    || slides[0]?.body?.trim()
    || profile.painPoint?.trim()
    || '이 공간은 무엇이 달라졌을까요?'
}

const DISPLAY_NAME_INDUSTRY_TOKENS = ['관리형', '학원', '스터디카페', '학교', '아파트', '기타'] as const

function applyIndustryToDisplayName(baseDisplayName: string, industry: string | null | undefined): string {
  const base = baseDisplayName.trim()
  const normalizedIndustry = industry?.trim() ?? ''
  if (!base || !normalizedIndustry) return base
  if (base.includes(normalizedIndustry)) return base

  for (const token of DISPLAY_NAME_INDUSTRY_TOKENS) {
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
}

function buildPublicDisplayName(params: {
  siteName: string
  externalLabel?: string | null
  industry?: string | null
}) {
  const base = params.externalLabel?.trim()
    || broadenPublicDisplayName(params.siteName)
    || params.siteName
  return applyIndustryToDisplayName(base, params.industry)
}

export async function fetchPublicShowroomCardNewsListItems(): Promise<PublicShowroomCardNewsListItem[]> {
  const [profiles, publicAssets] = await Promise.all([
    fetchPublishedShowroomCaseProfileDrafts(),
    fetchPublicShowroomAssets(),
  ])
  const groupedAssets = groupBeforeAfterAssets(publicAssets)

  return profiles.map((profile) => {
    const context = findPublicContext(profile, groupedAssets)
    const slides = resolvePublishedSlides(profile, context)
    const coverImageUrl = slides.find((slide) => slide.imageUrl?.trim())?.imageUrl?.trim()
      || context.afterImage?.thumbnail_url
      || context.afterImage?.cloudinary_url
      || context.beforeImage?.thumbnail_url
      || context.beforeImage?.cloudinary_url
      || null

    return {
      siteName: profile.siteName,
      canonicalSiteName: profile.canonicalSiteName,
      siteKey: profile.cardNewsPublication.siteKey?.trim() || profile.siteName,
      slug: profile.cardNewsPublication.slug,
      displayName: buildPublicDisplayName({
        siteName: context.siteName || profile.siteName,
        externalLabel: context.externalLabel,
        industry: context.businessTypes[0] ?? profile.industry,
      }),
      externalLabel: buildPublicDisplayName({
        siteName: context.siteName || profile.siteName,
        externalLabel: context.externalLabel,
        industry: context.businessTypes[0] ?? profile.industry,
      }),
      industry: context.businessTypes[0] ?? profile.industry,
      hook: buildHook(profile, slides),
      summary: buildSummary(profile),
      coverImageUrl,
      publishedAt: profile.cardNewsPublication.publishedAt,
    }
  })
}

export async function loadPublicShowroomCardNewsBundle(siteKeyParam: string): Promise<{
  ok: true
  data: {
    siteName: string
    externalLabel: string | null
    businessTypes: string[]
    beforeImage: ShowroomImageAsset | null
    afterImage: ShowroomImageAsset | null
    profile: ShowroomCaseProfileDraft
  }
} | {
  ok: false
  reason: 'not_found' | 'error'
  message?: string
}> {
  let decoded = siteKeyParam
  try {
    decoded = decodeURIComponent(siteKeyParam)
  } catch {
    decoded = siteKeyParam
  }
  const query = decoded.trim()
  if (!query) return { ok: false, reason: 'not_found' }

  try {
    const [profiles, publicAssets] = await Promise.all([
      fetchPublishedShowroomCaseProfileDrafts(),
      fetchPublicShowroomAssets(),
    ])
    const match = profiles.find((profile) =>
      profile.cardNewsPublication.siteKey?.trim() === query
      || profile.cardNewsPublication.slug?.trim() === query
      || profile.siteName.trim() === query
      || profile.canonicalSiteName?.trim() === query
    )
    if (!match) return { ok: false, reason: 'not_found' }

    const context = findPublicContext(match, groupBeforeAfterAssets(publicAssets))

    return {
      ok: true,
      data: {
        siteName: context.siteName || match.siteName,
        externalLabel: buildPublicDisplayName({
          siteName: context.siteName || match.siteName,
          externalLabel: context.externalLabel,
          industry: context.businessTypes[0] ?? match.industry,
        }),
        businessTypes: context.businessTypes.length > 0 ? context.businessTypes : (match.industry ? [match.industry] : []),
        beforeImage: context.beforeImage,
        afterImage: context.afterImage,
        profile: match,
      },
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : '알 수 없는 오류',
    }
  }
}
