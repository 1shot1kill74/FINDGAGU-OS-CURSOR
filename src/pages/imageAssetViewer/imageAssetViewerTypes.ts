import type { ProjectImageAsset } from '@/types/projectImage'

export type SortKey = 'latest' | 'industry' | 'popular' | 'ai' | 'internal'

export type GroupMode = 'by_industry' | 'by_site' | 'by_product' | 'by_color'

export type SiteOption = { value: string; label: string; spaceId: string | null }

export type AssetGroup = { key: string; label: string; items: ProjectImageAsset[] }
