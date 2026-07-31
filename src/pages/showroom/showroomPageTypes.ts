import type { ShowroomImageAsset, ShowroomSiteOverrideSectionKey } from '@/lib/imageAssetService'
import type {
  ShowroomCaseCanonicalBlogPost,
  ShowroomCaseCanonicalBlogStatus,
} from '@/lib/showroomCaseCanonicalBlog'

export type ViewMode = 'product' | 'industry' | 'color'

/** 현장별 그룹: 대표 이미지(is_main), 현장명, 지역, 업종, 제품명, 색상 */
export interface SiteGroup {
  siteName: string
  externalDisplayName: string | null
  industryLabel: string
  sectionKey: ShowroomSiteOverrideSectionKey
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  hasBeforeAfter: boolean
  latestCreatedAt: string | null
  representativeScore: number
  displayOrder: number | null
  manualPriority: number | null
}

/** 제품별 그룹 */
export interface ProductGroup {
  productName: string
  siteNames: string[]
  externalDisplayNames: string[]
  locations: string[]
  businessTypes: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
}

export interface ColorGroup {
  colorName: string
  siteNames: string[]
  externalDisplayNames: string[]
  locations: string[]
  businessTypes: string[]
  products: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
}

export interface IndustrySection {
  industry: string
  groups: SiteGroup[]
  siteCount: number
  photoCount: number
}

export interface PaginatedIndustrySection extends IndustrySection {
  currentPage: number
  totalPages: number
  pagedGroups: SiteGroup[]
}

export interface ShowroomCaseProfileDraftState {
  painPoint: string
  headlineHook: string
  cardNewsPublication: {
    isPublished: boolean
    siteKey: string | null
  }
  /** 블로그 정본 발행 상태. status null = 미제작 */
  blogPublication: {
    status: ShowroomCaseCanonicalBlogStatus | null
  }
  /** 승인된 블로그 정본 기준 티저 한 줄 (없으면 null) */
  blogTeaserLine: string | null
}

export const EMPTY_SHOWROOM_CASE_PROFILE_DRAFT: ShowroomCaseProfileDraftState = {
  painPoint: '',
  headlineHook: '',
  cardNewsPublication: {
    isPublished: false,
    siteKey: null,
  },
  blogPublication: {
    status: null,
  },
  blogTeaserLine: null,
}

/** 내부 쇼룸 전후비교 카드용 블로그 발행 뱃지 문구 */
export function showroomBlogPublicationLabel(
  publication: ShowroomCaseProfileDraftState['blogPublication'],
): string {
  const status = publication.status
  if (!status) return '미제작'
  if (status === 'approved') return '발행완료'
  if (status === 'scheduled') return '발행예정'
  if (status === 'archived') return '보관'
  if (status === 'review') return '검수중'
  return '초안'
}

export function showroomBlogPublicationBadgeClass(
  publication: ShowroomCaseProfileDraftState['blogPublication'],
): string {
  const status = publication.status
  if (status === 'approved') return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
  if (status === 'scheduled') return 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
  if (status === 'review') return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
  if (status === 'archived') return 'bg-neutral-100 text-neutral-600'
  if (status) return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
  return 'bg-neutral-100 text-neutral-600'
}

export function preferCanonicalBlogPost(
  a: ShowroomCaseCanonicalBlogPost | null | undefined,
  b: ShowroomCaseCanonicalBlogPost | null | undefined,
): ShowroomCaseCanonicalBlogPost | null {
  if (a?.status === 'approved') return a
  if (b?.status === 'approved') return b
  return a ?? b ?? null
}

export function blogPublicationFromPost(
  post: ShowroomCaseCanonicalBlogPost | null | undefined,
): ShowroomCaseProfileDraftState['blogPublication'] {
  return {
    status: post?.status ?? null,
  }
}

/** 블로그 발행 상태를 저장·조회할 때 쓰는 정확 키 (현장명 / canonical만) */
export function showroomCaseProfileExactSiteKeys(row: {
  siteName: string
  canonicalSiteName?: string | null
}): string[] {
  return Array.from(new Set(
    [row.siteName.trim(), (row.canonicalSiteName ?? '').trim()].filter(Boolean),
  ))
}

/**
 * 전후비교 카드용 블로그 발행 상태.
 * 지역·견적번호·공개 표시명 같은 느슨한 키는 쓰지 않고, 이미지/그룹의 실제 현장명만 본다.
 */
export function resolveShowroomBlogPublicationForSiteGroup(
  group: Pick<SiteGroup, 'siteName' | 'images'>,
  draftBySite: Record<string, ShowroomCaseProfileDraftState>,
): ShowroomCaseProfileDraftState['blogPublication'] {
  const candidates = new Set<string>()
  const push = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim()
    if (trimmed) candidates.add(trimmed)
  }
  push(group.siteName)
  group.images.forEach((image) => {
    push(image.site_name)
    push(image.canonical_site_name)
    push(image.raw_site_name)
  })
  for (const key of candidates) {
    const draft = draftBySite[key]
    if (draft) return draft.blogPublication
  }
  return { status: null }
}

export type ShowroomPageProps = {
  mode?: 'internal' | 'public'
}
