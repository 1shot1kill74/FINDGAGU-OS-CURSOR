/**
 * 쇼룸 "기획 방식" 페이지용 — ShowroomPage의 그룹 키·현장명 규칙과 동일해야 함.
 */
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { fetchShowroomImageAssets } from '@/lib/imageAssetService'
import { loadPublicShowroomCardNewsBundle } from '@/lib/publicShowroomCardNewsService'
import { collectShowroomAliasNamesFromImages, collectShowroomIdentityKeys, findUniqueProfileByQuoteKey } from '@/lib/showroomCaseAlias'
import { groupBeforeAfterAssets } from '@/lib/showroomImageAssetGrouping'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'
import { broadenPublicDisplayName } from '@/lib/showroomShareService'
import {
  fetchApprovedBlogShowroomCaseProfileDrafts,
  fetchShowroomCaseProfileDrafts,
  type ShowroomCaseProfileDraft,
} from '@/lib/showroomCaseProfileService'

function getPreferredShowroomSiteName(images: ShowroomImageAsset[]): string {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const canonical = image.canonical_site_name?.trim()
    if (canonical) return canonical
    const sn = image.raw_site_name?.trim() || image.space_display_name?.trim() || image.site_name?.trim()
    if (sn) return sn
  }
  return '미지정'
}

function getPreferredExternalLabel(images: ShowroomImageAsset[]): string | null {
  for (const image of images) {
    const value = image.broad_external_display_name?.trim()
      || broadenPublicDisplayName(image.external_display_name?.trim() ?? null)
      || image.external_display_name?.trim()
    if (value) return value
  }
  return null
}

function getDraftLookupNames(images: ShowroomImageAsset[], query: string): string[] {
  // DB site_name 조회용 — 실제 현장명/표시명만. quote·region-suffix 합성키는 넣지 않는다.
  const aliases = [query.trim(), ...collectShowroomAliasNamesFromImages(images)].filter(Boolean)
  return Array.from(new Set(aliases))
}

function getProfileLookupAliases(profile: Pick<
  ShowroomCaseProfileDraft,
  'siteName' | 'canonicalSiteName' | 'cardNewsPublication' | 'canonicalBlogPost'
>): string[] {
  return Array.from(new Set([
    profile.siteName.trim(),
    profile.canonicalSiteName?.trim() ?? '',
    profile.cardNewsPublication.siteKey?.trim() ?? '',
    profile.cardNewsPublication.slug?.trim() ?? '',
    profile.canonicalBlogPost?.siteName?.trim() ?? '',
    profile.canonicalBlogPost?.title?.trim() ?? '',
    profile.canonicalBlogPost?.seo.title?.trim() ?? '',
  ].filter(Boolean)))
}

function profileMatchesLookupNames(profile: ShowroomCaseProfileDraft, lookupNames: string[]): boolean {
  const lookupAliasSet = new Set(lookupNames.map((name) => name.trim()).filter(Boolean))
  const profileAliases = getProfileLookupAliases(profile)
  if (profileAliases.some((alias) => lookupAliasSet.has(alias))) return true

  // 강한 키(권역+끝4자리)만 교차 매칭. quote:견적월 은 제외됨.
  const lookupIdentitySet = new Set(collectShowroomIdentityKeys(lookupNames))
  if (lookupIdentitySet.size === 0) return false
  return collectShowroomIdentityKeys(profileAliases).some((key) => lookupIdentitySet.has(key))
}

async function findApprovedBlogProfileByLookupNames(lookupNames: string[]): Promise<ShowroomCaseProfileDraft | null> {
  const approvedBlogProfiles = await fetchApprovedBlogShowroomCaseProfileDrafts()
  const strongMatch = approvedBlogProfiles.find((profile) => profileMatchesLookupNames(profile, lookupNames))
  if (strongMatch) return strongMatch

  // 레거시: 견적월 키가 전 승인 블로그 중 유일할 때만 허용
  return findUniqueProfileByQuoteKey(
    approvedBlogProfiles,
    lookupNames,
    (profile) => getProfileLookupAliases(profile),
  )
}

function getImageIdentityKeys(images: ShowroomImageAsset[], extraValues: string[] = []): string[] {
  return collectShowroomIdentityKeys([
    ...extraValues,
    ...collectShowroomAliasNamesFromImages(images),
    ...images.flatMap((image) => [
      image.site_name?.trim() ?? '',
      image.raw_site_name?.trim() ?? '',
      image.space_display_name?.trim() ?? '',
      image.canonical_site_name?.trim() ?? '',
      image.external_display_name?.trim() ?? '',
      image.broad_external_display_name?.trim() ?? '',
    ]),
  ])
}

export type ShowroomCaseApproachBundle = {
  siteName: string
  externalLabel: string | null
  businessTypes: string[]
  beforeImage: ShowroomImageAsset | null
  afterImage: ShowroomImageAsset | null
  profile: ShowroomCaseProfileDraft | null
}

type ShowroomCaseHrefDraft = Pick<
  ShowroomCaseProfileDraft,
  'siteName' | 'canonicalSiteName' | 'cardNewsPublication' | 'canonicalBlogPost'
>

function getDraftLookupAliases(draft: ShowroomCaseHrefDraft): string[] {
  return Array.from(new Set([
    draft.siteName.trim(),
    draft.canonicalSiteName?.trim() ?? '',
    draft.cardNewsPublication.siteKey?.trim() ?? '',
    draft.canonicalBlogPost?.siteName?.trim() ?? '',
  ].filter(Boolean)))
}

function getPublicCaseUrlKeyFromImages(images: ShowroomImageAsset[]): string | null {
  // 단일 키 = 내부 현장명 (상담카드 site_name). 익스터널 표시명은 URL에 쓰지 않는다.
  const urlKey = getPreferredShowroomSiteName(images)
  return urlKey && urlKey !== '미지정' ? urlKey : null
}

function findBeforeAfterGroupForQuery(query: string, assets: ShowroomImageAsset[]): ShowroomImageAsset[] | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  const groups = groupBeforeAfterAssets(assets)
  for (const [, images] of groups) {
    if (
      getPreferredShowroomSiteName(images) === trimmed
      || getPreferredExternalLabel(images) === trimmed
    ) {
      return images
    }
  }

  for (const [, images] of groups) {
    const hit = images.some(
      (image) =>
        image.site_name?.trim() === trimmed
        || image.canonical_site_name?.trim() === trimmed
        || image.external_display_name?.trim() === trimmed
        || image.broad_external_display_name?.trim() === trimmed
        || broadenPublicDisplayName(image.external_display_name?.trim() ?? null) === trimmed
        || broadenPublicDisplayName(image.site_name?.trim() ?? null) === trimmed
    )
    if (hit) return images
  }

  return null
}

function draftMatchesBeforeAfterGroup(draft: ShowroomCaseHrefDraft, images: ShowroomImageAsset[]): boolean {
  const draftAliases = getDraftLookupAliases(draft)
  const draftAliasSet = new Set(draftAliases)
  const imageAliases = collectShowroomAliasNamesFromImages(images)
  if (imageAliases.some((alias) => draftAliasSet.has(alias))) return true

  const draftIdentity = new Set(collectShowroomIdentityKeys(draftAliases))
  const groupIdentity = collectShowroomIdentityKeys(imageAliases)
  return groupIdentity.some((key) => draftIdentity.has(key))
}

function findPublicCaseUrlKeyForDraft(
  draft: ShowroomCaseHrefDraft,
  publicAssets: ShowroomImageAsset[],
  internalAssets: ShowroomImageAsset[] = [],
): string | null {
  const publicGroups = groupBeforeAfterAssets(publicAssets)
  const internalGroups = groupBeforeAfterAssets(internalAssets)

  for (const [, images] of publicGroups) {
    if (!draftMatchesBeforeAfterGroup(draft, images)) continue
    const urlKey = getPublicCaseUrlKeyFromImages(images)
    if (urlKey) return urlKey
  }

  for (const [, internalImages] of internalGroups) {
    if (!draftMatchesBeforeAfterGroup(draft, internalImages)) continue

    const internalIdentity = new Set(getImageIdentityKeys(internalImages, getDraftLookupAliases(draft)))
    for (const [, publicImages] of publicGroups) {
      const publicIdentity = getImageIdentityKeys(publicImages, [])
      if (!publicIdentity.some((key) => internalIdentity.has(key))) continue
      const urlKey = getPublicCaseUrlKeyFromImages(publicImages)
      if (urlKey) return urlKey
    }

    const internalKey = getPublicCaseUrlKeyFromImages(internalImages)
    if (internalKey) return internalKey
  }

  for (const candidate of getDraftLookupAliases(draft)) {
    const matched = findBeforeAfterGroupForQuery(candidate, publicAssets)
    if (!matched) continue
    const urlKey = getPublicCaseUrlKeyFromImages(matched)
    if (urlKey) return urlKey
  }

  for (const candidate of getDraftLookupAliases(draft)) {
    const matched = findBeforeAfterGroupForQuery(candidate, internalAssets)
    if (!matched) continue
    const urlKey = getPublicCaseUrlKeyFromImages(matched)
    if (urlKey) return urlKey
  }

  return null
}

/** 승인 블로그·관련 사례 카드 등에서 공개 case URL 키를 image_assets 기준으로 맞춘다. */
export function resolvePublicShowroomCaseHref(
  draft: ShowroomCaseHrefDraft,
  publicAssets: ShowroomImageAsset[],
  internalAssets: ShowroomImageAsset[] = [],
): string {
  const resolved = findPublicCaseUrlKeyForDraft(draft, publicAssets, internalAssets)
  if (resolved) {
    return `/public/showroom/case/${encodeURIComponent(resolved)}`
  }

  const fallback =
    draft.siteName.trim()
    || draft.canonicalBlogPost?.siteName?.trim()
    || draft.canonicalSiteName?.trim()
    || draft.cardNewsPublication.siteKey?.trim()
    || '미지정'
  return `/public/showroom/case/${encodeURIComponent(fallback)}`
}

function pickBeforeAfterPair(images: ShowroomImageAsset[]): {
  before: ShowroomImageAsset | null
  after: ShowroomImageAsset | null
} {
  const beforeImages = images.filter((i) => i.before_after_role === 'before')
  const afterImages = images.filter((i) => i.before_after_role === 'after')
  const before = beforeImages[0] ?? null
  const after = afterImages.find((i) => i.is_main) ?? afterImages[0] ?? null
  return { before, after }
}

function hasApprovedCanonicalBlog(profile: ShowroomCaseProfileDraft | null | undefined): boolean {
  const post = profile?.canonicalBlogPost
  if (!post || post.status !== 'approved') return false
  return Boolean(post.bodyMarkdown?.trim() || post.bodyHtml?.trim())
}

async function loadShowroomCaseApproachBundleFromProfileQuery(
  query: string,
): Promise<ShowroomCaseApproachBundle | null> {
  const drafts = await fetchShowroomCaseProfileDrafts([query])
  const profile = drafts.find(
    (draft) => draft.siteName === query || draft.canonicalSiteName === query,
  ) ?? drafts[0] ?? null
  if (!hasApprovedCanonicalBlog(profile)) return null

  return {
    siteName: profile!.siteName,
    externalLabel: null,
    businessTypes: profile!.industry?.trim() ? [profile!.industry.trim()] : [],
    beforeImage: null,
    afterImage: null,
    profile: profile!,
  }
}

/**
 * URL의 siteKey(encodeURIComponent된 현장명)에 해당하는 비포·애프터 그룹과 사례 프로필을 불러온다.
 */
export async function loadShowroomCaseApproachBundle(
  siteKeyParam: string,
  source: 'public' | 'internal' | 'published-cardnews'
): Promise<{ ok: true; data: ShowroomCaseApproachBundle } | { ok: false; reason: 'not_found' | 'incomplete' | 'error'; message?: string }> {
  if (source === 'published-cardnews') {
    return loadPublicShowroomCardNewsBundle(siteKeyParam)
  }

  let decoded = siteKeyParam
  try {
    decoded = decodeURIComponent(siteKeyParam)
  } catch {
    decoded = siteKeyParam
  }
  const query = decoded.trim()
  if (!query) return { ok: false, reason: 'not_found' }

  try {
    const assets = source === 'public'
      ? await fetchPublicShowroomAssets()
      : await fetchShowroomImageAssets()

    let matched = findBeforeAfterGroupForQuery(query, assets)

    if (!matched?.length) {
      const profileBundle = await loadShowroomCaseApproachBundleFromProfileQuery(query)
      if (profileBundle) {
        return { ok: true, data: profileBundle }
      }
      return { ok: false, reason: 'not_found' }
    }

    const siteName = getPreferredShowroomSiteName(matched)
    const draftLookupNames = getDraftLookupNames(matched, query)
    const matchNames = Array.from(new Set([siteName, query, ...draftLookupNames].filter(Boolean)))

    const drafts = await fetchShowroomCaseProfileDrafts(draftLookupNames)
    const profile =
      drafts.find((draft) => draft.siteName === siteName || draft.canonicalSiteName === siteName)
      ?? drafts.find((draft) => profileMatchesLookupNames(draft, matchNames))
      ?? await findApprovedBlogProfileByLookupNames(matchNames)

    const hasApprovedBlog = hasApprovedCanonicalBlog(profile)
    const { before, after } = pickBeforeAfterPair(matched)

    const businessTypes = Array.from(
      new Set(matched.map((i) => i.business_type?.trim()).filter(Boolean) as string[])
    )

    if ((!before || !after) && !hasApprovedBlog) {
      return { ok: false, reason: 'incomplete' }
    }

    return {
      ok: true,
      data: {
        siteName,
        externalLabel: null,
        businessTypes,
        beforeImage: before,
        afterImage: after,
        profile,
      },
    }
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : '알 수 없는 오류',
    }
  }
}
