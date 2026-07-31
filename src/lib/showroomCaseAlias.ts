import type { ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import { broadenPublicDisplayName } from '@/lib/showroomPublicDisplayName'

function pushAlias(target: Set<string>, value: string | null | undefined): void {
  const normalized = (value ?? '').trim()
  if (!normalized) return
  target.add(normalized)
}

export function collectShowroomAliasNamesFromImageAsset(asset: Pick<
  ShowroomImageAsset,
  | 'raw_site_name'
  | 'site_name'
  | 'canonical_site_name'
  | 'space_display_name'
  | 'external_display_name'
  | 'broad_external_display_name'
>): string[] {
  const values = new Set<string>()
  pushAlias(values, asset.raw_site_name)
  pushAlias(values, asset.site_name)
  pushAlias(values, asset.canonical_site_name)
  pushAlias(values, asset.space_display_name)
  pushAlias(values, asset.external_display_name)
  pushAlias(values, asset.broad_external_display_name)
  pushAlias(values, broadenPublicDisplayName(asset.raw_site_name ?? null))
  pushAlias(values, broadenPublicDisplayName(asset.site_name ?? null))
  pushAlias(values, broadenPublicDisplayName(asset.space_display_name ?? null))
  pushAlias(values, broadenPublicDisplayName(asset.external_display_name ?? null))
  return Array.from(values)
}

export function collectShowroomAliasNamesFromImages(images: Array<Pick<
  ShowroomImageAsset,
  | 'raw_site_name'
  | 'site_name'
  | 'canonical_site_name'
  | 'space_display_name'
  | 'external_display_name'
  | 'broad_external_display_name'
>>): string[] {
  const values = new Set<string>()
  images.forEach((image) => {
    collectShowroomAliasNamesFromImageAsset(image).forEach((value) => values.add(value))
  })
  return Array.from(values)
}

const REGION_TOKEN_MAP: Record<string, string> = {
  서울: '서울권',
  서울권: '서울권',
  경기: '경기권',
  경기권: '경기권',
  인천: '경기권',
  부산: '부산권',
  부산권: '부산권',
  대구: '대구권',
  대구권: '대구권',
  광주: '광주권',
  광주권: '광주권',
  대전: '대전권',
  대전권: '대전권',
  울산: '울산권',
  울산권: '울산권',
  세종: '충청권',
  충북: '충청권',
  충남: '충청권',
  충청권: '충청권',
  강원: '강원권',
  강원권: '강원권',
  전북: '전북권',
  전북권: '전북권',
  전남: '전남권',
  전남권: '전남권',
  경북: '경북권',
  경북권: '경북권',
  경남: '경남권',
  경남권: '경남권',
  제주: '제주권',
  제주권: '제주권',
}

const REGION_CITY_PREFIXES: Array<[string, string]> = [
  ['남양주', '경기권'],
  ['평택', '경기권'],
  ['고양', '경기권'],
  ['일산', '경기권'],
  ['정발산', '경기권'],
  ['수원', '경기권'],
  ['성남', '경기권'],
  ['용인', '경기권'],
  ['부천', '경기권'],
  ['안산', '경기권'],
  ['안양', '경기권'],
  ['화성', '경기권'],
  ['파주', '경기권'],
  ['김포', '경기권'],
  ['전주', '전북권'],
  ['군산', '전북권'],
  ['청주', '충청권'],
  ['천안', '충청권'],
  ['아산', '충청권'],
  ['춘천', '강원권'],
  ['강릉', '강원권'],
  ['원주', '강원권'],
  ['압구정', '서울권'],
  ['대치', '서울권'],
  ['강남', '서울권'],
]

function extractTrailingFourDigits(value: string): string | null {
  const normalized = value.trim()
  const match = normalized.match(/(\d{4})(?!.*\d)/)
  return match?.[1] ?? null
}

/** 견적번호(예: 견적 2604_…, 2604 경기 …) — 레거시 익스터널 URL 연결용 */
function extractQuoteFourDigits(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  const fromEstimate = normalized.match(/견적\s*(\d{4})\b/)
  if (fromEstimate?.[1]) return fromEstimate[1]
  const leading = normalized.match(/^(\d{4})(?:[\s_]|$)/)
  if (leading?.[1]) return leading[1]
  const underscored = normalized.match(/(?:^|[_\s])(\d{4})(?=_)/)
  if (underscored?.[1]) return underscored[1]
  return null
}

function extractBroadRegion(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  const tokens = normalized.split(' ')
  for (const token of tokens) {
    const exact = REGION_TOKEN_MAP[token]
    if (exact) return exact
  }
  for (const [prefix, broad] of REGION_CITY_PREFIXES) {
    if (normalized.includes(prefix)) return broad
  }
  const broadened = broadenPublicDisplayName(normalized)
  if (broadened && broadened !== normalized) {
    const broadTokens = broadened.split(' ')
    for (const token of broadTokens) {
      const exact = REGION_TOKEN_MAP[token]
      if (exact) return exact
    }
  }
  return null
}

/**
 * 현장 교차 식별용 강한 키만 반환한다.
 * - region-suffix:권역:끝4자리 (공개 표시명·전화 끝자리)
 * - quote:YYYY 는 같은 견적월에 여러 현장이 있어 블로그/사례가 섞이므로 제외
 */
export function collectShowroomIdentityKeys(values: Array<string | null | undefined>): string[] {
  const keys = new Set<string>()
  values.forEach((value) => {
    const normalized = (value ?? '').trim()
    if (!normalized) return
    const suffix = extractTrailingFourDigits(normalized)
    const region = extractBroadRegion(normalized)
    if (suffix && region) keys.add(`region-suffix:${region}:${suffix}`)
  })
  return Array.from(keys)
}

/**
 * 견적번호(월) 키. 단독 매칭에 쓰면 안 되며, 후보가 1개일 때만 레거시 연결용으로 쓴다.
 */
export function collectShowroomQuoteKeys(values: Array<string | null | undefined>): string[] {
  const keys = new Set<string>()
  values.forEach((value) => {
    const normalized = (value ?? '').trim()
    if (!normalized) return
    const quote = extractQuoteFourDigits(normalized)
    if (quote) keys.add(`quote:${quote}`)
  })
  return Array.from(keys)
}

/** quote 키가 유일 후보일 때만 매칭에 쓸 수 있는지 */
export function findUniqueProfileByQuoteKey<T>(
  candidates: T[],
  lookupValues: Array<string | null | undefined>,
  getAliases: (item: T) => string[],
): T | null {
  const lookupQuotes = new Set(collectShowroomQuoteKeys(lookupValues))
  if (lookupQuotes.size === 0) return null

  const matched = candidates.filter((item) => {
    const itemQuotes = new Set(collectShowroomQuoteKeys(getAliases(item)))
    return [...lookupQuotes].some((key) => itemQuotes.has(key))
  })
  return matched.length === 1 ? matched[0] : null
}
