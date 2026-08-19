/**
 * 쇼룸에서 빼 둘 현장. 키는 featuredKeys와 같이 현장명·표시명 haystack에 포함되면 매칭한다.
 * 사진 자산은 작업실에 남기고, 쇼룸 카드·사례 URL·사이트맵만 숨긴다.
 */
export const SHOWROOM_HIDDEN_SITE_KEYS = ['7311'] as const

function collectHaystacks(...values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter(Boolean)
}

export function matchesHiddenShowroomSite(...values: Array<string | null | undefined>): boolean {
  const haystacks = collectHaystacks(...values)
  if (haystacks.length === 0) return false

  return SHOWROOM_HIDDEN_SITE_KEYS.some((key) => {
    const needle = key.trim().toLowerCase()
    if (!needle) return false
    if (haystacks.some((haystack) => haystack.includes(needle))) return true
    const projectCode = needle.match(/\d{4}$/)?.[0]
    return Boolean(projectCode && haystacks.some((haystack) => haystack.includes(projectCode)))
  })
}

export function isHiddenShowroomAsset(asset: {
  site_name?: string | null
  raw_site_name?: string | null
  canonical_site_name?: string | null
  space_display_name?: string | null
  external_display_name?: string | null
  broad_external_display_name?: string | null
}): boolean {
  return matchesHiddenShowroomSite(
    asset.site_name,
    asset.raw_site_name,
    asset.canonical_site_name,
    asset.space_display_name,
    asset.external_display_name,
    asset.broad_external_display_name,
  )
}

export function filterVisibleShowroomAssets<T extends Parameters<typeof isHiddenShowroomAsset>[0]>(
  assets: T[],
): T[] {
  return assets.filter((asset) => !isHiddenShowroomAsset(asset))
}
