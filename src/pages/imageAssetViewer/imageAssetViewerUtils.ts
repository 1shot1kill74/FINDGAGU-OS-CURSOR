import { supabase } from '@/lib/supabase'
import { getSyncStatus } from '@/lib/imageAssetService'
import type { ProjectImageAsset, UsageType } from '@/types/projectImage'
import { BUCKET } from './imageAssetViewerConstants'

/** construction_images 레거시 행 → ProjectImageAsset (cloudinary 없으면 storage_only) */
export function legacyRowToAsset(row: {
  id: string
  storage_path: string
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  is_marketing_ready: boolean
  view_count: number
  created_at: string
}): ProjectImageAsset {
  const storagePath = row.storage_path?.trim() || null
  const cloudinaryPublicId = '' // 레거시: Cloudinary ID 없음
  const usageType: UsageType = row.is_marketing_ready ? 'Marketing' : 'Archive'
  const url = storagePath
    ? supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
    : ''
  return {
    id: row.id,
    cloudinaryPublicId: cloudinaryPublicId,
    usageType,
    displayName: null,
    url,
    thumbnailUrl: row.thumbnail_path
      ? supabase.storage.from(BUCKET).getPublicUrl(row.thumbnail_path).data.publicUrl
      : url,
    storagePath,
    consultationId: row.consultation_id,
    projectTitle: row.project_title,
    industry: row.industry,
    viewCount: Number(row.view_count ?? 0),
    createdAt: row.created_at,
    syncStatus: getSyncStatus({ cloudinaryPublicId, storagePath, usageType }),
  }
}

/** 통합 검색: 검색어를 공백으로 나눈 각 단어가 모두 포함된 자산만 노출 (제품명·색상·현장명 동시 검색) */
export function filterByUnifiedSearch(assets: ProjectImageAsset[], query: string): ProjectImageAsset[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return assets
  return assets.filter((a) => {
    const searchableTags = (a.productTags ?? []).map((t) => t.toLowerCase())
    const searchableColor = (a.color ?? '').toLowerCase()
    const searchableSite = (a.projectTitle ?? '').toLowerCase()
    const metadataSpaceId = typeof a.metadata?.space_id === 'string' ? a.metadata.space_id.toLowerCase() : ''
    const searchableSpaceId = (a.spaceId ?? metadataSpaceId).toLowerCase()
    const match = (term: string) =>
      searchableTags.some((t) => t.includes(term)) ||
      searchableColor.includes(term) ||
      searchableSite.includes(term) ||
      searchableSpaceId.includes(term)
    return terms.every(match)
  })
}

export function getAssetSpaceId(asset: ProjectImageAsset): string | null {
  if (asset.spaceId?.trim()) return asset.spaceId.trim()
  const raw = asset.metadata?.space_id
  if (typeof raw !== 'string' || !raw.trim()) return null
  const normalized = raw.trim()
  return normalized.startsWith('spaces/') ? (normalized.slice('spaces/'.length) || null) : normalized
}

export function getAssetSiteLabel(asset: ProjectImageAsset): string {
  const canonical = asset.metadata?.canonical_site_name
  if (typeof canonical === 'string' && canonical.trim()) return canonical.trim()
  const fallback = (asset.siteName ?? asset.projectTitle ?? asset.consultationId ?? '미분류').trim()
  return fallback || '미분류'
}

export function getAssetSiteFilterValue(asset: ProjectImageAsset): string {
  const spaceId = getAssetSpaceId(asset)
  return spaceId ? `space:${spaceId}` : `name:${getAssetSiteLabel(asset)}`
}

export function getAssetSiteDisplayLabel(asset: ProjectImageAsset): string {
  const label = getAssetSiteLabel(asset)
  const spaceId = getAssetSpaceId(asset)
  return spaceId ? `${label} · ${spaceId}` : label
}
