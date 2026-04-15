import { supabase } from '@/lib/supabase'
import { IMAGE_ASSET_PAGE_SIZE } from '@/lib/imageAssetConstants'
import { parseBeforeAfterMeta, parseImageAssetMeta } from '@/lib/imageAssetMeta'
import type { Json } from '@/types/database'

/** 고객용 시공사례 쇼룸: image_assets 전체 조회 (현장/제품 그룹화용) */
export interface ShowroomImageAsset {
  id: string
  cloudinary_url: string
  thumbnail_url: string | null
  site_name: string | null
  public_group_key?: string | null
  industry_site_order?: number | null
  before_after_site_order?: number | null
  canonical_site_name?: string | null
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

/** 비포어·애프터 그룹핑·동일 현장 사진 묶기에 공통 사용 */
export function getShowroomAssetGroupKey(asset: ShowroomImageAsset): string {
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

export function getShowroomImagePreviewUrl(asset: ShowroomImageAsset): string {
  return (asset.thumbnail_url?.trim() || asset.cloudinary_url?.trim() || '').trim()
}

/**
 * 동일 현장(그룹 키 일치 + 현장명 일치) 상담 이미지 전체 — 카드뉴스 등에서 한 현장의 모든 컷 선택 가능하게.
 */
export function collectConsultationImagesForSiteRow(
  siteName: string,
  anchorAsset: ShowroomImageAsset | null,
  allAssets: ShowroomImageAsset[],
): ShowroomImageAsset[] {
  const map = new Map<string, ShowroomImageAsset>()
  const push = (a: ShowroomImageAsset) => map.set(a.id, a)
  if (anchorAsset) {
    const gk = getShowroomAssetGroupKey(anchorAsset)
    for (const a of allAssets) {
      if (getShowroomAssetGroupKey(a) === gk) push(a)
    }
  }
  const label = (a: ShowroomImageAsset) => a.canonical_site_name?.trim() || a.site_name?.trim() || ''
  for (const a of allAssets) {
    if (label(a) === siteName) push(a)
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })
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

/** RPC `get_public_showroom_assets_by_share_token` 한 행 → 쇼룸 카드용 자산 */
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
  return {
    before_after_role: beforeAfterRole,
    before_after_group_id: beforeAfter.groupId,
    before_after_site_order: beforeAfterSiteOrder,
    canonical_site_name: meta.canonicalSiteName,
    external_display_name: meta.externalDisplayName,
    broad_external_display_name: meta.broadExternalDisplayName,
    space_id: meta.spaceId,
    id: String(r.id),
    cloudinary_url: String(r.cloudinary_url ?? ''),
    industry_site_order: industrySiteOrder,
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    site_name: r.site_name != null ? String(r.site_name) : null,
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
  const rows: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('image_assets')
      .select('id, cloudinary_url, thumbnail_url, site_name, location, business_type, color_name, product_name, is_main, created_at, view_count, share_count, internal_score, category, metadata')
      .eq('is_consultation', true)
      .not('category', 'in', '("purchase_order","floor_plan")')
      .order('created_at', { ascending: false })
      .range(from, from + IMAGE_ASSET_PAGE_SIZE - 1)

    if (error || !data?.length) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
    from += IMAGE_ASSET_PAGE_SIZE
  }

  return rows.map((r: Record<string, unknown>) => ({
    ...(() => {
      const beforeAfter = parseBeforeAfterMeta(r.metadata)
      const meta = parseImageAssetMeta(r.metadata)
      return {
        before_after_role: beforeAfter.role,
        before_after_group_id: beforeAfter.groupId,
        canonical_site_name: meta.canonicalSiteName,
        external_display_name: meta.externalDisplayName,
        broad_external_display_name: meta.broadExternalDisplayName,
        space_id: meta.spaceId,
      }
    })(),
    id: String(r.id),
    cloudinary_url: String(r.cloudinary_url ?? ''),
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    site_name: r.site_name != null ? String(r.site_name) : null,
    location: r.location != null ? String(r.location) : null,
    business_type: r.business_type != null ? String(r.business_type) : null,
    color_name: r.color_name != null ? String(r.color_name) : null,
    product_name: r.product_name != null ? String(r.product_name) : null,
    is_main: Boolean(r.is_main),
    created_at: r.created_at != null ? String(r.created_at) : null,
    view_count: Number(r.view_count ?? 0),
    share_count: Number(r.share_count ?? 0),
    internal_score: typeof r.internal_score === 'number' ? r.internal_score : null,
  }))
}

export async function fetchShowroomSiteOverrides(): Promise<ShowroomSiteOverride[]> {
  const { data, error } = await supabase
    .from('showroom_site_overrides')
    .select('*')
    .order('manual_priority', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })

  if (error) return []

  const rows = (data ?? []) as unknown as Record<string, unknown>[]

  return rows.map((row) => ({
    id: String(row.id),
    site_name: String(row.site_name),
    industry_label: String(row.industry_label),
    section_key: row.section_key === 'before_after' ? 'before_after' : 'industry',
    manual_priority: typeof row.manual_priority === 'number' ? row.manual_priority : null,
    note: row.note != null ? String(row.note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }))
}

export async function saveShowroomSiteOverride(
  siteName: string,
  industryLabel: string,
  manualPriority: number | null,
  sectionKey: ShowroomSiteOverrideSectionKey = 'industry'
): Promise<{ error: Error | null }> {
  const normalizedSiteName = siteName.trim()
  const normalizedIndustryLabel = industryLabel.trim()

  if (!normalizedSiteName || !normalizedIndustryLabel) {
    return { error: new Error('현장명 또는 업종이 비어 있어 우선순위를 저장할 수 없습니다.') }
  }

  if (manualPriority == null) {
    const { error } = await supabase
      .from('showroom_site_overrides')
      .delete()
      .eq('site_name', normalizedSiteName)
      .eq('industry_label', normalizedIndustryLabel)
      .eq('section_key', sectionKey)
    return { error: error ?? null }
  }

  const { error } = await supabase
    .from('showroom_site_overrides')
    .upsert(
      {
        site_name: normalizedSiteName,
        industry_label: normalizedIndustryLabel,
        section_key: sectionKey,
        manual_priority: manualPriority,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'site_name,industry_label,section_key', ignoreDuplicates: false }
    )

  return { error: error ?? null }
}

/** image_assets is_consultation 토글 — 상담용 전용 필터·공유 바구니 정렬용 */
export async function updateImageAssetConsultation(assetId: string, isConsultation: boolean): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('image_assets').update({ is_consultation: isConsultation }).eq('id', assetId)
  return { error: error ?? null }
}

export async function updateImageAssetBeforeAfter(
  assetId: string,
  currentMetadata: Record<string, unknown> | null | undefined,
  patch: { role: 'before' | 'after' | null; groupId: string | null }
): Promise<{ error: Error | null }> {
  const nextMetadata: Record<string, unknown> = { ...(currentMetadata ?? {}) }
  if (patch.role) nextMetadata.before_after_role = patch.role
  else delete nextMetadata.before_after_role
  if (patch.groupId) nextMetadata.before_after_group_id = patch.groupId
  else delete nextMetadata.before_after_group_id
  const { error } = await supabase.from('image_assets').update({ metadata: nextMetadata as Json }).eq('id', assetId)
  return { error: error ?? null }
}

/** image_assets 업종 수정 — 잘못 분류된 업종만 최소 수정 */
export async function updateImageAssetIndustry(
  assetId: string,
  industry: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('image_assets')
    .update({ business_type: industry?.trim() || null })
    .eq('id', assetId)
  return { error: error ?? null }
}

/** image_assets 지역 수정 — 업로드 시 누락된 location만 최소 수정 */
export async function updateImageAssetLocation(
  assetId: string,
  location: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('image_assets')
    .update({ location: location?.trim() || null })
    .eq('id', assetId)
  return { error: error ?? null }
}

/** image_assets 제품명·색상 수정 — 기존 업로드 사진의 인라인 편집 저장용 */
export async function updateImageAssetTagColor(
  assetId: string,
  patch: { productName?: string | null; colorName?: string | null }
): Promise<{ error: Error | null }> {
  const dbPayload: Record<string, unknown> = {}
  if (patch.productName !== undefined) dbPayload.product_name = patch.productName?.trim() || null
  if (patch.colorName !== undefined) dbPayload.color_name = patch.colorName?.trim() || null
  if (Object.keys(dbPayload).length === 0) return { error: null }
  const { error } = await supabase.from('image_assets').update(dbPayload).eq('id', assetId)
  return { error: error ?? null }
}

/** image_assets 상세 보기/공유 링크 조회 시 view_count 1 증가. RPC 호출(원자적). */
export async function incrementImageAssetViewCount(assetId: string): Promise<void> {
  await supabase.rpc('increment_image_asset_view_count', { asset_id: assetId })
}

/** image_assets 공유 링크 복사/공유 시 share_count 1 증가. RPC 호출(원자적). */
export async function incrementImageAssetShareCount(assetId: string): Promise<void> {
  await supabase.rpc('increment_image_asset_share_count', { asset_id: assetId })
}

/**
 * 앱 내 스코어링: view_count(조회수) 기반으로 ai_score(0~1) 계산 후 image_assets 업데이트.
 */
export function computeAiScoreFromEngagement(viewCount: number): number {
  if (viewCount <= 0) return 0
  return Math.min(1, Math.log10(viewCount + 1) / 2.5)
}

export async function computeAndUpdateAiScores(limit = 100): Promise<{ updated: number; total: number }> {
  const { data: rows, error: fetchError } = await supabase
    .from('image_assets')
    .select('id, view_count')
    .limit(limit)
  if (fetchError) throw new Error(fetchError.message)
  if (!rows?.length) return { updated: 0, total: 0 }
  let updated = 0
  for (const row of rows) {
    const viewCount = Number(row.view_count ?? 0)
    const ai_score = computeAiScoreFromEngagement(viewCount)
    const { error: updateError } = await supabase.from('image_assets').update({ ai_score }).eq('id', row.id)
    if (!updateError) updated++
  }
  return { updated, total: rows.length }
}
