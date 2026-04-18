import { supabase } from '@/lib/supabase'
import { BUCKET } from '@/lib/imageAssetConstants'
import { getAssetUrl, getSyncStatus } from '@/lib/imageAssetCloudinary'
import { parseBeforeAfterMeta, parseImageAssetMeta } from '@/lib/imageAssetMeta'
import { readStoredPrivacyScan } from '@/lib/imagePrivacyService'
import type { ProjectImageAsset } from '@/types/projectImage'
import { USAGE_TYPES, REVIEW_STATUSES, type UsageType, type ReviewStatus } from '@/types/projectImage'

/** project_images 행 → ProjectImageAsset (관리·뱅크 공통) */
export function rowToProjectAsset(row: {
  id: string
  cloudinary_public_id: string
  usage_type: string
  display_name: string | null
  storage_path: string | null
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  view_count: number
  created_at: string
  product_tags?: unknown
  color?: string | null
  status?: string | null
  content_hash?: string | null
}): ProjectImageAsset {
  const usageType = USAGE_TYPES.includes(row.usage_type as UsageType) ? (row.usage_type as UsageType) : 'Marketing'
  const storagePath = row.storage_path?.trim() || null
  const productTags: string[] | null = Array.isArray(row.product_tags) ? (row.product_tags as string[]) : null
  const status: ReviewStatus = REVIEW_STATUSES.includes(row.status as ReviewStatus) ? (row.status as ReviewStatus) : 'pending'
  return {
    id: row.id,
    cloudinaryPublicId: row.cloudinary_public_id,
    usageType,
    displayName: row.display_name?.trim() || null,
    url: getAssetUrl({ cloudinaryPublicId: row.cloudinary_public_id, storagePath }, 'marketing'),
    thumbnailUrl: storagePath
      ? supabase.storage.from(BUCKET).getPublicUrl(row.thumbnail_path || row.storage_path || '').data.publicUrl
      : getAssetUrl({ cloudinaryPublicId: row.cloudinary_public_id, storagePath }, 'mobile'),
    storagePath,
    consultationId: row.consultation_id,
    projectTitle: row.project_title,
    industry: row.industry,
    viewCount: Number(row.view_count ?? 0),
    createdAt: row.created_at,
    syncStatus: getSyncStatus({ cloudinaryPublicId: row.cloudinary_public_id, storagePath, usageType }),
    productTags: productTags ?? undefined,
    color: row.color?.trim() || undefined,
    status,
    contentHash: row.content_hash?.trim() || undefined,
    isMain: false,
    sourceTable: 'project_images',
  }
}

/** image_assets 행(스마트 업로드) → ProjectImageAsset — barrel에서는 노출하지 않음. */
export function rowImageAssetToProjectAsset(row: {
  id: string
  created_at: string | null
  cloudinary_url: string
  thumbnail_url: string | null
  site_name: string | null
  is_main: boolean
  product_name: string | null
  color_name: string | null
  location: string | null
  business_type: string | null
  category: string | null
  ai_score: number | null
  view_count: number | null
  internal_score?: number | null
  share_count?: number | null
  is_consultation?: boolean | null
  metadata?: unknown
}): ProjectImageAsset {
  const url = row.cloudinary_url?.trim() || ''
  const thumbnailUrl = row.thumbnail_url?.trim() || null
  const match = url.match(/\/upload\/(.+)$/)
  const cloudinaryPublicId = match ? match[1] : `image_asset_${row.id}`
  const beforeAfter = parseBeforeAfterMeta(row.metadata)
  const meta = parseImageAssetMeta(row.metadata)
  const privacyScan = readStoredPrivacyScan(row.metadata)
  const canonicalSiteName =
    meta.canonicalSiteName ||
    row.site_name?.trim() ||
    meta.spaceDisplayName ||
    row.location?.trim() ||
    null
  return {
    id: row.id,
    cloudinaryPublicId,
    usageType: 'Marketing',
    displayName: row.product_name?.trim() || null,
    url,
    thumbnailUrl,
    storagePath: null,
    consultationId: meta.consultationId,
    projectTitle: canonicalSiteName,
    siteName: canonicalSiteName,
    externalDisplayName: meta.externalDisplayName,
    location: row.location?.trim() || null,
    industry: row.business_type?.trim() || null,
    viewCount: Number(row.view_count ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
    syncStatus: 'cloudinary_only',
    productTags: row.product_name?.trim() ? [row.product_name.trim()] : (row.category?.trim() ? [row.category.trim()] : undefined),
    category: row.category?.trim() || undefined,
    color: row.color_name?.trim() || undefined,
    status: 'approved',
    isMain: row.is_main ?? false,
    sourceTable: 'image_assets',
    aiScore: row.ai_score != null ? row.ai_score : null,
    internalScore: row.internal_score != null ? row.internal_score : null,
    shareCount: row.share_count != null ? Number(row.share_count) : 0,
    isConsultation: row.is_consultation === true,
    beforeAfterRole: beforeAfter.role,
    beforeAfterGroupId: beforeAfter.groupId,
    metadata: meta.raw,
    spaceId: meta.spaceId,
    privacyScan,
  }
}
