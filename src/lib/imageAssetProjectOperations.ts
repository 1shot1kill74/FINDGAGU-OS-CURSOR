import { supabase } from '@/lib/supabase'
import {
  IMAGE_ASSET_MANAGEMENT_CATEGORIES,
  IMAGE_ASSET_MANAGEMENT_SELECT,
  IMAGE_ASSET_PAGE_SIZE,
} from '@/lib/imageAssetConstants'
import { getAssetUrl } from '@/lib/imageAssetCloudinary'
import { rowImageAssetToProjectAsset, rowToProjectAsset } from '@/lib/imageAssetProjectRows'
import { getBaseAltTextFromDisplayName } from '@/lib/imageNaming'
import type { ImageAssetExportItem } from '@/types/imageExport'
import { ALT_TEXT_PROMPT_GUIDE } from '@/types/imageExport'
import type { ProjectImageAsset } from '@/types/projectImage'
import type { UsageType, ReviewStatus } from '@/types/projectImage'

/** 이미지 자산 관리 전용: project_images + image_assets(스마트 업로드) 통합 조회. */
export async function fetchAllProjectAssets(): Promise<ProjectImageAsset[]> {
  const [projResult, assetResult] = await Promise.all([
    supabase.from('project_images').select('*').order('created_at', { ascending: false }),
    supabase.from('image_assets').select(IMAGE_ASSET_MANAGEMENT_SELECT).in('category', [...IMAGE_ASSET_MANAGEMENT_CATEGORIES]).order('created_at', { ascending: false }),
  ])
  const fromProject = (projResult.data ?? []).map((r: Parameters<typeof rowToProjectAsset>[0]) => rowToProjectAsset(r))
  const fromAssets = (assetResult.data ?? []).map((r: Parameters<typeof rowImageAssetToProjectAsset>[0]) => rowImageAssetToProjectAsset(r))
  const merged = [...fromProject, ...fromAssets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return merged
}

/** 이미지 자산 관리 전용: 특정 업종 image_assets를 페이지 단위로 끝까지 조회 */
export async function fetchImageAssetsByBusinessType(businessType: string): Promise<ProjectImageAsset[]> {
  const sector = businessType.trim()
  if (!sector) return []

  const rows: Parameters<typeof rowImageAssetToProjectAsset>[0][] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('image_assets')
      .select(IMAGE_ASSET_MANAGEMENT_SELECT)
      .eq('business_type', sector)
      .in('category', [...IMAGE_ASSET_MANAGEMENT_CATEGORIES])
      .order('created_at', { ascending: false })
      .range(from, from + IMAGE_ASSET_PAGE_SIZE - 1)

    if (error || !data?.length) break
    rows.push(...(data as Parameters<typeof rowImageAssetToProjectAsset>[0][]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
    from += IMAGE_ASSET_PAGE_SIZE
  }

  return rows.map((row) => rowImageAssetToProjectAsset(row))
}

/** image_assets 테이블 기반 [연도 > 지역 > 현장명] + 업종 + 제품명 트리 데이터. */
export type ImageAssetTreeYear = { year: string; regions: ImageAssetTreeRegion[] }
export type ImageAssetTreeRegion = { region: string; sites: { site: string; count: number }[] }
export type ImageAssetTreeMeta = {
  years: ImageAssetTreeYear[]
  industries: { name: string; count: number }[]
  products: { name: string; count: number }[]
}

export async function fetchImageAssetTreeData(): Promise<ImageAssetTreeMeta> {
  const { data, error } = await supabase
    .from('image_assets')
    .select('created_at, photo_date, location, site_name, business_type, product_name')
    .order('created_at', { ascending: false })
  if (error || !data?.length) {
    return { years: [], industries: [], products: [] }
  }

  const yearMap = new Map<string, Map<string, Map<string, number>>>()
  const industryMap = new Map<string, number>()
  const productMap = new Map<string, number>()

  for (const row of data) {
    const dateStr = row.created_at ?? row.photo_date ?? ''
    const year = dateStr ? String(new Date(dateStr).getFullYear()) : '미지정'
    const region = (row.location ?? '').trim() || '미지정'
    const site = (row.site_name ?? '').trim() || '미지정'
    const industry = (row.business_type ?? '').trim() || '미지정'
    const product = (row.product_name ?? '').trim() || '미지정'

    let regionMap = yearMap.get(year)
    if (!regionMap) {
      regionMap = new Map()
      yearMap.set(year, regionMap)
    }
    let siteMap = regionMap.get(region)
    if (!siteMap) {
      siteMap = new Map()
      regionMap.set(region, siteMap)
    }
    siteMap.set(site, (siteMap.get(site) ?? 0) + 1)

    industryMap.set(industry, (industryMap.get(industry) ?? 0) + 1)
    productMap.set(product, (productMap.get(product) ?? 0) + 1)
  }

  const years: ImageAssetTreeYear[] = []
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => {
    if (a === '미지정') return 1
    if (b === '미지정') return -1
    return b.localeCompare(a)
  })
  for (const year of sortedYears) {
    const regionMap = yearMap.get(year)!
    const regions: ImageAssetTreeRegion[] = []
    const sortedRegions = Array.from(regionMap.keys()).sort((a, b) => a.localeCompare(b, 'ko'))
    for (const region of sortedRegions) {
      const siteMap = regionMap.get(region)!
      const sites = Array.from(siteMap.entries())
        .map(([site, count]) => ({ site, count }))
        .sort((a, b) => a.site.localeCompare(b.site, 'ko'))
      regions.push({ region, sites })
    }
    years.push({ year, regions })
  }

  const industries = Array.from(industryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const products = Array.from(productMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return { years, industries, products }
}

/** 시공 사례 뱅크 전용: approved + 영업용(Marketing) project_images만 조회 */
export async function fetchApprovedProjectAssets(): Promise<ProjectImageAsset[]> {
  const { data, error } = await supabase
    .from('project_images')
    .select('*')
    .eq('status', 'approved')
    .eq('usage_type', 'Marketing')
    .order('created_at', { ascending: false })
  if (error || !data?.length) return []
  return data.map((r: Parameters<typeof rowToProjectAsset>[0]) => rowToProjectAsset(r))
}

/** 단일 자산 메타 수정 — 태그·용도·승인·현장명 등. */
export type ProjectAssetUpdatePatch = {
  product_tags?: string[] | null
  color?: string | null
  usage_type?: UsageType
  status?: ReviewStatus
  project_title?: string | null
  industry?: string | null
  display_name?: string | null
}

export async function updateProjectAsset(
  id: string,
  patch: ProjectAssetUpdatePatch
): Promise<{ error: Error | null }> {
  const dbPayload: Record<string, unknown> = {}
  if (patch.product_tags !== undefined) dbPayload.product_tags = patch.product_tags
  if (patch.color !== undefined) dbPayload.color = patch.color?.trim() || null
  if (patch.usage_type !== undefined) dbPayload.usage_type = patch.usage_type
  if (patch.status !== undefined) dbPayload.status = patch.status
  if (patch.project_title !== undefined) dbPayload.project_title = patch.project_title?.trim() || null
  if (patch.industry !== undefined) dbPayload.industry = patch.industry?.trim() || null
  if (patch.display_name !== undefined) dbPayload.display_name = patch.display_name?.trim() || null
  if (Object.keys(dbPayload).length === 0) return { error: null }
  const { error } = await supabase.from('project_images').update(dbPayload).eq('id', id)
  return { error: error ?? null }
}

/** 다중 자산 일괄 수정 — 검수 승인·태그 등. */
export async function updateProjectAssets(
  ids: string[],
  patch: ProjectAssetUpdatePatch
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null }
  const dbPayload: Record<string, unknown> = {}
  if (patch.product_tags !== undefined) dbPayload.product_tags = patch.product_tags
  if (patch.color !== undefined) dbPayload.color = patch.color?.trim() || null
  if (patch.usage_type !== undefined) dbPayload.usage_type = patch.usage_type
  if (patch.status !== undefined) dbPayload.status = patch.status
  if (patch.project_title !== undefined) dbPayload.project_title = patch.project_title?.trim() || null
  if (patch.industry !== undefined) dbPayload.industry = patch.industry?.trim() || null
  if (patch.display_name !== undefined) dbPayload.display_name = patch.display_name?.trim() || null
  if (Object.keys(dbPayload).length === 0) return { error: null }
  const { error } = await supabase.from('project_images').update(dbPayload).in('id', ids)
  return { error: error ?? null }
}

/** 자산의 확정 알트 텍스트 — display_name(파일명)과 동일 소스 */
export function getBaseAltText(asset: ProjectImageAsset): string {
  const src = asset.displayName || asset.cloudinaryPublicId || ''
  return getBaseAltTextFromDisplayName(src) || asset.projectTitle || '시공 이미지'
}

/**
 * 블로그용 마크다운 이미지 문자열 — 무조건 Cloudinary URL, alt는 시스템 확정 base_alt_text 우선
 */
export function toMarkdownImageLine(asset: ProjectImageAsset, alt?: string): string {
  const url = getAssetUrl(
    { cloudinaryPublicId: asset.cloudinaryPublicId, storagePath: asset.storagePath },
    'marketing'
  )
  const label = alt ?? getBaseAltText(asset)
  return `![${label}](${url})`
}

/**
 * 외부 자동화(n8n, Python)용 JSON 페이로드 — base_alt_text 고정, AI 프롬프트 가이드 포함
 */
export function buildImageExportPayload(assets: ProjectImageAsset[]): {
  items: ImageAssetExportItem[]
  prompt_guide: string
} {
  const items: ImageAssetExportItem[] = assets.map((asset) => {
    const displayName = asset.displayName?.trim() || null
    const src = displayName || asset.cloudinaryPublicId
    const base_alt_text = getBaseAltTextFromDisplayName(src) || asset.projectTitle || '시공 이미지'
    return {
      id: asset.id,
      url: asset.url,
      base_alt_text,
      display_name: displayName,
      cloudinary_public_id: asset.cloudinaryPublicId,
      alt_text_prompt_guide: ALT_TEXT_PROMPT_GUIDE,
    }
  })
  return { items, prompt_guide: ALT_TEXT_PROMPT_GUIDE }
}

export function ensureCanDelete(asset: ProjectImageAsset): { ok: boolean; reason?: string } {
  if (!asset.cloudinaryPublicId?.trim()) {
    return { ok: false, reason: 'Cloudinary ID가 없어 삭제 대상을 식별할 수 없습니다.' }
  }
  return { ok: true }
}

export function ensureCanUpdate(
  before: ProjectImageAsset,
  patch: Partial<Pick<ProjectImageAsset, 'cloudinaryPublicId' | 'storagePath' | 'usageType'>>
): { ok: boolean; reason?: string } {
  const nextId = patch.cloudinaryPublicId ?? before.cloudinaryPublicId
  if (!nextId?.trim()) {
    return { ok: false, reason: 'Cloudinary ID는 비울 수 없습니다.' }
  }
  return { ok: true }
}

export function getDeleteSteps(asset: ProjectImageAsset): { ok: boolean; reason?: string; steps: string[] } {
  const check = ensureCanDelete(asset)
  if (!check.ok) return { ...check, steps: [] }
  const steps: string[] = ['1. Cloudinary에서 public_id로 삭제']
  if (asset.storagePath?.trim()) steps.push('2. Supabase Storage에서 storage_path 객체 삭제')
  steps.push('3. project_images 행 삭제')
  return { ok: true, steps }
}
