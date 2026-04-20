/**
 * 쇼룸 "기획 방식" 페이지용 — ShowroomPage의 그룹 키·현장명 규칙과 동일해야 함.
 */
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { fetchShowroomImageAssets } from '@/lib/imageAssetService'
import { loadPublicShowroomCardNewsBundle } from '@/lib/publicShowroomCardNewsService'
import { groupBeforeAfterAssets } from '@/lib/showroomImageAssetGrouping'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'
import { broadenPublicDisplayName } from '@/lib/showroomShareService'
import { fetchShowroomCaseProfileDrafts, type ShowroomCaseProfileDraft } from '@/lib/showroomCaseProfileService'

function getPreferredShowroomSiteName(images: ShowroomImageAsset[]): string {
  const sorted = [...images].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  for (const image of sorted) {
    const canonical = image.canonical_site_name?.trim()
    if (canonical) return canonical
    const sn = image.site_name?.trim()
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
  const values = new Set<string>()
  const push = (value: string | null | undefined) => {
    const normalized = value?.trim()
    if (normalized) values.add(normalized)
  }

  push(query)
  for (const image of images) {
    push(image.canonical_site_name)
    push(image.site_name)
    push(image.external_display_name)
    push(image.broad_external_display_name)
    push(broadenPublicDisplayName(image.external_display_name?.trim() ?? null))
  }

  return Array.from(values)
}

export type ShowroomCaseApproachBundle = {
  siteName: string
  externalLabel: string | null
  businessTypes: string[]
  beforeImage: ShowroomImageAsset | null
  afterImage: ShowroomImageAsset | null
  profile: ShowroomCaseProfileDraft | null
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
    const [assets, internalAssets] = source === 'public'
      ? await Promise.all([fetchPublicShowroomAssets(), fetchShowroomImageAssets()])
      : [await fetchShowroomImageAssets(), null]
    const groups = groupBeforeAfterAssets(assets)

    let matched: ShowroomImageAsset[] | null = null
    for (const [, images] of groups) {
      if (
        getPreferredShowroomSiteName(images) === query
        || getPreferredExternalLabel(images) === query
      ) {
        matched = images
        break
      }
    }
    if (!matched) {
      for (const [, images] of groups) {
        const hit = images.some(
          (i) =>
            (i.site_name?.trim() === query) ||
            (i.canonical_site_name?.trim() === query) ||
            (i.external_display_name?.trim() === query) ||
            (i.broad_external_display_name?.trim() === query) ||
            (broadenPublicDisplayName(i.external_display_name?.trim() ?? null) === query)
        )
        if (hit) {
          matched = images
          break
        }
      }
    }

    if (!matched?.length) return { ok: false, reason: 'not_found' }

    const hasBefore = matched.some((i) => i.before_after_role === 'before')
    const hasAfter = matched.some((i) => i.before_after_role === 'after')
    if (!hasBefore || !hasAfter) return { ok: false, reason: 'incomplete' }

    let draftLookupNames = getDraftLookupNames(matched, query)
    if (source === 'public' && internalAssets) {
      const internalGroups = groupBeforeAfterAssets(internalAssets)
      const publicSiteName = getPreferredShowroomSiteName(matched)
      const publicExternalLabel = getPreferredExternalLabel(matched)

      for (const [, internalImages] of internalGroups) {
        const internalSiteName = getPreferredShowroomSiteName(internalImages)
        const internalExternalLabel = getPreferredExternalLabel(internalImages)
        const matchesPublicGroup =
          internalSiteName === query
          || internalSiteName === publicSiteName
          || internalExternalLabel === query
          || internalExternalLabel === publicSiteName
          || (publicExternalLabel ? internalExternalLabel === publicExternalLabel : false)
          || internalImages.some((image) =>
            image.site_name?.trim() === query
            || image.site_name?.trim() === publicSiteName
            || image.canonical_site_name?.trim() === query
            || image.canonical_site_name?.trim() === publicSiteName
            || image.external_display_name?.trim() === query
            || image.external_display_name?.trim() === publicSiteName
            || image.broad_external_display_name?.trim() === query
            || image.broad_external_display_name?.trim() === publicSiteName
            || (publicExternalLabel ? image.external_display_name?.trim() === publicExternalLabel : false)
            || (publicExternalLabel ? image.broad_external_display_name?.trim() === publicExternalLabel : false)
            || broadenPublicDisplayName(image.site_name?.trim() ?? null) === query
            || broadenPublicDisplayName(image.site_name?.trim() ?? null) === publicSiteName
            || broadenPublicDisplayName(image.external_display_name?.trim() ?? null) === query
            || broadenPublicDisplayName(image.external_display_name?.trim() ?? null) === publicSiteName
            || (publicExternalLabel ? broadenPublicDisplayName(image.external_display_name?.trim() ?? null) === publicExternalLabel : false)
          )

        if (matchesPublicGroup) {
          draftLookupNames = getDraftLookupNames(internalImages, query)
          break
        }
      }
    }

    const siteName = getPreferredShowroomSiteName(matched)
    const { before, after } = pickBeforeAfterPair(matched)

    const businessTypes = Array.from(
      new Set(matched.map((i) => i.business_type?.trim()).filter(Boolean) as string[])
    )

    let externalLabel: string | null = null
    for (const i of matched) {
      const v = i.broad_external_display_name?.trim() || broadenPublicDisplayName(i.external_display_name?.trim() ?? null)
      if (v) {
        externalLabel = v
        break
      }
    }

    const drafts = await fetchShowroomCaseProfileDrafts(draftLookupNames)
    const profile = drafts[0] ?? null

    // 비포/애프터 메타 부착이 누락된 사례라도 approved 블로그 정본이 있으면
    // 블로그 섹션만이라도 노출되도록 fallback을 허용한다.
    const hasApprovedBlog = profile?.canonicalBlogPost?.status === 'approved'
      && (profile?.canonicalBlogPost?.bodyMarkdown?.trim().length ?? 0) > 0

    if ((!before || !after) && !hasApprovedBlog) {
      return { ok: false, reason: 'incomplete' }
    }

    return {
      ok: true,
      data: {
        siteName,
        externalLabel,
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
