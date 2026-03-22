import { supabase } from '@/lib/supabase'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import type { ProjectImageAsset } from '@/types/projectImage'

export interface SharedGalleryAssetSnapshot {
  id: string
  sourceTable: 'project_images' | 'image_assets'
  url: string
  thumbnailUrl: string
  projectTitle: string | null
  productTags: string[]
  color: string | null
  isConsultation?: boolean
}

type CreateSharedGalleryInput = {
  items: SharedGalleryAssetSnapshot[]
  title?: string
  description?: string
  source?: string
  expiresAt?: string | null
}

export type ResolvedSharedGallery = {
  token: string
  title: string
  description: string
  items: SharedGalleryAssetSnapshot[]
  created_at: string | null
  expires_at: string | null
}

function createShareToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}

export function buildSharedGalleryUrl(token: string): string {
  return `${window.location.origin}/share?t=${encodeURIComponent(token)}`
}

export function snapshotProjectImageAsset(asset: ProjectImageAsset): SharedGalleryAssetSnapshot {
  return {
    id: asset.id,
    sourceTable: asset.sourceTable === 'image_assets' ? 'image_assets' : 'project_images',
    url: asset.url,
    thumbnailUrl: asset.thumbnailUrl || asset.url,
    projectTitle: asset.externalDisplayName || asset.projectTitle || asset.siteName || null,
    productTags: Array.isArray(asset.productTags) ? asset.productTags.filter(Boolean) : [],
    color: asset.color?.trim() || null,
    isConsultation: asset.isConsultation === true,
  }
}

export function snapshotShowroomImageAsset(asset: ShowroomImageAsset): SharedGalleryAssetSnapshot {
  return {
    id: asset.id,
    sourceTable: 'image_assets',
    url: asset.cloudinary_url,
    thumbnailUrl: asset.thumbnail_url?.trim() || asset.cloudinary_url,
    projectTitle: asset.external_display_name?.trim() || asset.canonical_site_name?.trim() || asset.site_name?.trim() || null,
    productTags: asset.product_name?.trim() ? [asset.product_name.trim()] : [],
    color: asset.color_name?.trim() || null,
    isConsultation: true,
  }
}

export async function createSharedGallery(input: CreateSharedGalleryInput): Promise<{ token: string; url: string }> {
  if (input.items.length === 0) {
    throw new Error('공유할 이미지가 없습니다.')
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createShareToken()
    const { error } = await (supabase as any).from('shared_gallery_links').insert({
      token,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      items: input.items,
      source: input.source?.trim() || null,
      expires_at: input.expiresAt ?? null,
    })

    if (!error) {
      return { token, url: buildSharedGalleryUrl(token) }
    }

    if (!String(error.message).toLowerCase().includes('duplicate')) {
      throw new Error(error.message)
    }
  }

  throw new Error('공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.')
}

export async function resolveSharedGallery(token: string): Promise<ResolvedSharedGallery | null> {
  const trimmed = token.trim()
  if (!trimmed) return null

  const { data, error } = await (supabase as any).rpc('resolve_shared_gallery', { share_token: trimmed })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const record = data as Record<string, unknown>
  const rawItems = Array.isArray(record.items) ? record.items : []
  const items: SharedGalleryAssetSnapshot[] = rawItems
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: String(item.id ?? ''),
      sourceTable: (item.sourceTable === 'project_images' ? 'project_images' : 'image_assets') as 'project_images' | 'image_assets',
      url: String(item.url ?? ''),
      thumbnailUrl: String(item.thumbnailUrl ?? item.url ?? ''),
      projectTitle: typeof item.projectTitle === 'string' && item.projectTitle.trim() ? item.projectTitle.trim() : null,
      productTags: Array.isArray(item.productTags) ? item.productTags.filter((tag): tag is string => typeof tag === 'string') : [],
      color: typeof item.color === 'string' && item.color.trim() ? item.color.trim() : null,
      isConsultation: item.isConsultation === true,
    }))
    .filter((item) => item.id && item.url)

  return {
    token: String(record.token ?? trimmed),
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '선별 시공 사례',
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : '담당자가 고른 참고 사진입니다.',
    items,
    created_at: typeof record.created_at === 'string' ? record.created_at : null,
    expires_at: typeof record.expires_at === 'string' ? record.expires_at : null,
  }
}
