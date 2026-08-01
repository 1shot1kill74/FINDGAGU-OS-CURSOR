import { parseBeforeAfterMeta, parseImageAssetMeta } from '@/lib/imageAssetMeta'

export interface ShowroomImageAsset {
  id: string
  cloudinary_url: string
  thumbnail_url: string | null
  public_watermark_status?: string | null
  raw_site_name?: string | null
  site_name: string | null
  public_group_key?: string | null
  industry_site_order?: number | null
  before_after_site_order?: number | null
  canonical_site_name?: string | null
  space_display_name?: string | null
  external_display_name?: string | null
  broad_external_display_name?: string | null
  space_id?: string | null
  location: string | null
  business_type: string | null
  color_name: string | null
  product_name: string | null
  is_main: boolean
  created_at: string | null
  view_count: number
  share_count: number
  internal_score: number | null
  before_after_role?: 'before' | 'after' | null
  before_after_group_id?: string | null
}

export interface ShowroomSiteOverride {
  id: string
  site_name: string
  industry_label: string
  section_key: 'industry' | 'before_after'
  manual_priority: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export type ShowroomSiteOverrideSectionKey = ShowroomSiteOverride['section_key']

export function getShowroomAssetGroupKey(asset: ShowroomImageAsset): string {
  const publicGroupKey = asset.public_group_key?.trim()
  if (publicGroupKey) return publicGroupKey
  const spaceId = asset.space_id?.trim()
  if (spaceId) return `space:${spaceId}`
  const beforeAfterGroupId = asset.before_after_group_id?.trim()
  if (beforeAfterGroupId) return `before-after:${beforeAfterGroupId}`
  const canonicalSiteName = asset.canonical_site_name?.trim()
  if (canonicalSiteName) return `site:${canonicalSiteName}`
  const rawSiteName = asset.raw_site_name?.trim()
  if (rawSiteName) return `site:${rawSiteName}`
  const siteName = asset.site_name?.trim()
  if (siteName) return `site:${siteName}`
  return 'site:미지정'
}

export function getShowroomImagePreviewUrl(asset: ShowroomImageAsset): string {
  return (asset.thumbnail_url?.trim() || asset.cloudinary_url?.trim() || '').trim()
}

export function mapPublicShowroomRpcRowToShowroomAsset(r: Record<string, unknown>): ShowroomImageAsset {
  const beforeAfter = parseBeforeAfterMeta(r.metadata)
  const meta = parseImageAssetMeta(r.metadata)
  const beforeAfterRole =
    r.before_after_role === 'before' || r.before_after_role === 'after'
      ? r.before_after_role
      : beforeAfter.role
  const industrySiteOrder = typeof r.industry_site_order === 'number'
    ? r.industry_site_order
    : typeof r.industry_site_order === 'string' && /^\d+$/.test(r.industry_site_order)
      ? Number(r.industry_site_order)
      : null
  const beforeAfterSiteOrder = typeof r.before_after_site_order === 'number'
    ? r.before_after_site_order
    : typeof r.before_after_site_order === 'string' && /^\d+$/.test(r.before_after_site_order)
      ? Number(r.before_after_site_order)
      : null
  const publicSiteName = r.site_name != null ? String(r.site_name).trim() : ''
  const sourceSiteName = r.source_site_name != null ? String(r.source_site_name).trim() : ''
  const internalSiteName = sourceSiteName || publicSiteName || null
  const externalFromMeta = meta.externalDisplayName?.trim() || null
  const externalDisplayName =
    externalFromMeta
    || (publicSiteName && internalSiteName && publicSiteName !== internalSiteName ? publicSiteName : null)

  return {
    before_after_role: beforeAfterRole,
    before_after_group_id: beforeAfter.groupId,
    before_after_site_order: beforeAfterSiteOrder,
    raw_site_name: internalSiteName,
    canonical_site_name: meta.canonicalSiteName,
    space_display_name: meta.spaceDisplayName,
    external_display_name: externalDisplayName,
    broad_external_display_name: meta.broadExternalDisplayName,
    space_id: meta.spaceId,
    id: String(r.id),
    cloudinary_url: String(r.cloudinary_url ?? ''),
    industry_site_order: industrySiteOrder,
    public_watermark_status:
      typeof r.public_watermark_status === 'string' && r.public_watermark_status.trim()
        ? r.public_watermark_status.trim()
        : null,
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    site_name: internalSiteName,
    public_group_key: r.public_group_key != null ? String(r.public_group_key) : null,
    location: r.location != null ? String(r.location) : null,
    business_type: r.business_type != null ? String(r.business_type) : null,
    color_name: r.color_name != null ? String(r.color_name) : null,
    product_name: r.product_name != null ? String(r.product_name) : null,
    is_main: Boolean(r.is_main),
    created_at: r.created_at != null ? String(r.created_at) : null,
    view_count: Number(r.view_count ?? 0),
    share_count: Number(r.share_count ?? 0),
    internal_score: typeof r.internal_score === 'number' ? r.internal_score : null,
  }
}

export async function fetchShowroomImageAssets(): Promise<ShowroomImageAsset[]> {
  throw new Error('공개 쇼룸 빌드에서는 내부 image_assets 직접 조회를 사용할 수 없습니다.')
}

export async function fetchShowroomSiteOverrides(): Promise<ShowroomSiteOverride[]> {
  return []
}

export async function incrementImageAssetViewCount(): Promise<void> {
  return
}

export async function incrementImageAssetShareCount(): Promise<void> {
  return
}
