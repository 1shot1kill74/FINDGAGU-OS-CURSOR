import { supabase } from '@/lib/supabase'

export type ShowroomImageAsset = {
  id: string
  cloudinary_url: string
  thumbnail_url: string | null
  site_name: string | null
  canonical_site_name?: string | null
  external_display_name?: string | null
  space_id?: string | null
  location: string | null
  business_type: string | null
  color_name: string | null
  product_name: string | null
  is_main: boolean
  created_at: string | null
  before_after_role: 'before' | 'after' | null
  before_after_group_id: string | null
}

export type ProductSiteRow = {
  productTag: string
  siteNames: string[]
  businessTypes: string[]
  locations: string[]
}

export type PublicContactPayload = {
  companyName: string
  managerName: string
  contact: string
  message: string
  category: string
  siteName: string
  imageUrl: string
  showroomContext: string
  showroomEntryLabel: string
}

export type ResolvedPublicShowroomShare = {
  token: string
  title: string
  description: string
  industry_scope: string | null
  source: string | null
  created_at: string | null
  expires_at: string | null
}

type PublicShowroomAssetRow = {
  id: string
  cloudinary_url: string | null
  thumbnail_url: string | null
  site_name: string | null
  location: string | null
  business_type: string | null
  color_name: string | null
  product_name: string | null
  is_main: boolean | null
  created_at: string | null
  metadata: unknown
}

function parseStoredSpaceId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  const raw = value.trim()
  if (raw.startsWith('spaces/')) return raw.slice('spaces/'.length) || null

  const roomMatch = raw.match(/\/room\/([A-Za-z0-9_-]+)/)
  if (roomMatch?.[1]) return roomMatch[1]

  return raw
}

function parseShowroomMeta(metadata: unknown): {
  role: 'before' | 'after' | null
  groupId: string | null
  canonicalSiteName: string | null
  externalDisplayName: string | null
  spaceId: string | null
} {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      role: null,
      groupId: null,
      canonicalSiteName: null,
      externalDisplayName: null,
      spaceId: null,
    }
  }

  const raw = metadata as Record<string, unknown>
  const role = raw.before_after_role === 'before' || raw.before_after_role === 'after'
    ? raw.before_after_role
    : null
  const groupId = typeof raw.before_after_group_id === 'string' && raw.before_after_group_id.trim()
    ? raw.before_after_group_id.trim()
    : null
  const canonicalSiteName = typeof raw.canonical_site_name === 'string' && raw.canonical_site_name.trim()
    ? raw.canonical_site_name.trim()
    : null
  const externalDisplayName = typeof raw.external_display_name === 'string' && raw.external_display_name.trim()
    ? raw.external_display_name.trim()
    : null
  const spaceId = parseStoredSpaceId(raw.space_id)

  return {
    role,
    groupId,
    canonicalSiteName,
    externalDisplayName,
    spaceId,
  }
}

function mapShowroomImageAsset(row: PublicShowroomAssetRow): ShowroomImageAsset {
  const meta = parseShowroomMeta(row.metadata)
  return {
    id: String(row.id),
    cloudinary_url: String(row.cloudinary_url ?? ''),
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    site_name: row.site_name != null ? String(row.site_name) : null,
    canonical_site_name: meta.canonicalSiteName,
    external_display_name: meta.externalDisplayName,
    space_id: meta.spaceId,
    location: row.location != null ? String(row.location) : null,
    business_type: row.business_type != null ? String(row.business_type) : null,
    color_name: row.color_name != null ? String(row.color_name) : null,
    product_name: row.product_name != null ? String(row.product_name) : null,
    is_main: Boolean(row.is_main),
    created_at: row.created_at != null ? String(row.created_at) : null,
    before_after_role: meta.role,
    before_after_group_id: meta.groupId,
  }
}

export async function fetchShowroomImageAssets(): Promise<ShowroomImageAsset[]> {
  const { data, error } = await supabase.rpc('get_public_showroom_assets')

  if (error || !data) return []

  return (data as PublicShowroomAssetRow[]).map(mapShowroomImageAsset)
}

export async function fetchShowroomImageAssetsByToken(token: string): Promise<ShowroomImageAsset[]> {
  const trimmed = token.trim()
  if (!trimmed) return []

  const { data, error } = await supabase.rpc('get_public_showroom_assets_by_share_token', { share_token: trimmed })
  if (error || !data) return []

  return (data as PublicShowroomAssetRow[]).map(mapShowroomImageAsset)
}

export async function resolvePublicShowroomShare(token: string): Promise<ResolvedPublicShowroomShare | null> {
  const trimmed = token.trim()
  if (!trimmed) return null

  const { data, error } = await supabase.rpc('resolve_public_showroom_share', { share_token: trimmed })
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const record = data as Record<string, unknown>
  return {
    token: String(record.token ?? trimmed),
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '시공사례 쇼룸',
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : '담당자가 전달한 외부 쇼룸 링크입니다.',
    industry_scope: typeof record.industry_scope === 'string' && record.industry_scope.trim() ? record.industry_scope.trim() : null,
    source: typeof record.source === 'string' && record.source.trim() ? record.source.trim() : null,
    created_at: typeof record.created_at === 'string' ? record.created_at : null,
    expires_at: typeof record.expires_at === 'string' ? record.expires_at : null,
  }
}

export async function fetchPublicProductSiteRows(): Promise<ProductSiteRow[]> {
  const data = await fetchShowroomImageAssets()
  if (data.length === 0) return []

  const productMap = new Map<string, { sites: Set<string>; businessTypes: Set<string>; locations: Set<string> }>()

  data.forEach((row) => {
    const productTag = String(row.product_name ?? '').trim()
    const siteName = String(row.site_name ?? '').trim()
    if (!productTag || !siteName) return
    const entry = productMap.get(productTag) ?? {
      sites: new Set<string>(),
      businessTypes: new Set<string>(),
      locations: new Set<string>(),
    }
    entry.sites.add(siteName)
    if (typeof row.business_type === 'string' && row.business_type.trim()) entry.businessTypes.add(row.business_type.trim())
    if (typeof row.location === 'string' && row.location.trim()) entry.locations.add(row.location.trim())
    productMap.set(productTag, entry)
  })

  return Array.from(productMap.entries())
    .map(([productTag, entry]) => ({
      productTag,
      siteNames: [...entry.sites].sort((a, b) => a.localeCompare(b, 'ko')),
      businessTypes: [...entry.businessTypes].sort((a, b) => a.localeCompare(b, 'ko')),
      locations: [...entry.locations].sort((a, b) => a.localeCompare(b, 'ko')),
    }))
    .sort((a, b) => a.productTag.localeCompare(b.productTag, 'ko'))
}

export async function submitPublicContact(payload: PublicContactPayload): Promise<void> {
  const company = payload.companyName.trim()
  const name = payload.managerName.trim()
  const phone = payload.contact.trim().replace(/\s/g, '')

  const metadata = {
    source: '홈페이지',
    pain_point: payload.message.trim() || null,
    customer_tier: '신규',
    display_name: company ? `${company} ${name}` : name,
    showroom_site_name: payload.siteName || null,
    showroom_category: payload.category || null,
    showroom_image_url: payload.imageUrl || null,
    showroom_context: payload.showroomContext || null,
    showroom_entry_label: payload.showroomEntryLabel || null,
  }

  const { error } = await supabase.from('consultations').insert({
    company_name: company || '(업체명 없음)',
    manager_name: name,
    contact: phone,
    status: '접수',
    metadata,
    is_visible: true,
    expected_revenue: 0,
  })

  if (error) throw error
}
