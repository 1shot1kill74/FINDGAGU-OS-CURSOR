import type { ShowroomImageAsset, ShowroomSiteOverrideSectionKey } from '@/lib/imageAssetService'

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
  cardNewsPublication: {
    isPublished: boolean
    siteKey: string | null
  }
}

export type ShowroomPageProps = {
  mode?: 'internal' | 'public'
}
