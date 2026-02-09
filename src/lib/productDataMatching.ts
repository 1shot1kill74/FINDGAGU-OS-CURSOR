/**
 * BLUEPRINT: 견적서/발주서 product_name(태그) 기반으로 Supabase·Cloudinary 데이터를 정확히 호출하는 매칭 엔진.
 * - tag_mappings 1:N: 하나의 제품이 여러 Cloudinary 태그를 가질 수 있음 → 매칭 시 품명+모든 태그로 검색
 * - order_documents.product_tags ↔ 제품별 시공 현장
 * - project_images(Cloudinary public_id) ↔ 상담/현장 연동
 */
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/imageAssetService'
import { getCloudinaryTags } from '@/lib/tagMappingService'

export interface ProductMatchSite {
  consultationId: string
  companyName: string | null
}

export interface ProductMatchOrderDoc {
  id: string
  consultationId: string
  file_name: string
  file_type: string
  storage_path: string
  product_tags: string[]
}

export interface ProductMatchImage {
  id: string
  cloudinaryPublicId: string
  displayName: string | null
  marketingUrl: string
  mobileUrl: string
  consultationId: string | null
  projectTitle: string | null
}

export interface ProductMatchResult {
  productTag: string
  sites: ProductMatchSite[]
  orderDocuments: ProductMatchOrderDoc[]
  images: ProductMatchImage[]
}

/**
 * 제품명으로 조회. tag_mappings 1:N에 따라 품명 + 해당 제품의 모든 Cloudinary 태그로 매칭.
 */
export async function getDataByProductTag(productTag: string): Promise<ProductMatchResult> {
  const name = productTag.trim()
  if (!name) {
    return { productTag: '', sites: [], orderDocuments: [], images: [] }
  }

  const cloudinaryTags = await getCloudinaryTags(name)
  const tagsToMatchOriginal = [name.trim(), ...cloudinaryTags.map((t) => t.trim())].filter(Boolean)
  const tagSet = new Set(tagsToMatchOriginal.map((t) => t.toLowerCase()))

  const { data: orderDocs } = await supabase
    .from('order_documents')
    .select('id, consultation_id, file_name, file_type, storage_path, product_tags')
    .order('created_at', { ascending: false })

  const matchingDocs = (orderDocs ?? []).filter((row) => {
    const tags = Array.isArray(row.product_tags) ? (row.product_tags as string[]) : []
    return tags.some((t: string) => tagSet.has(String(t).trim().toLowerCase()))
  })
  const consultationIds = [...new Set(matchingDocs.map((d) => d.consultation_id))]

  const sites: ProductMatchSite[] = []
  if (consultationIds.length > 0) {
    const { data: cons } = await supabase
      .from('consultations')
      .select('id, company_name')
      .eq('is_visible', true)
      .in('id', consultationIds)
    sites.push(
      ...(cons ?? []).map((c) => ({
        consultationId: c.id,
        companyName: c.company_name,
      }))
    )
  }

  const orderDocuments: ProductMatchOrderDoc[] = matchingDocs.map((d) => ({
    id: d.id,
    consultationId: d.consultation_id,
    file_name: d.file_name,
    file_type: d.file_type,
    storage_path: d.storage_path,
    product_tags: (d.product_tags as string[]) ?? [],
  }))

  let images: ProductMatchImage[] = []
  if (consultationIds.length > 0) {
    const { data: projImages } = await supabase
      .from('project_images')
      .select('id, cloudinary_public_id, display_name, storage_path, consultation_id, project_title')
      .eq('status', 'approved')
      .in('consultation_id', consultationIds)
    images = (projImages ?? []).map((row) => ({
      id: row.id,
      cloudinaryPublicId: row.cloudinary_public_id,
      displayName: row.display_name,
      marketingUrl: getAssetUrl(
        { cloudinaryPublicId: row.cloudinary_public_id, storagePath: row.storage_path },
        'marketing'
      ),
      mobileUrl: getAssetUrl(
        { cloudinaryPublicId: row.cloudinary_public_id, storagePath: row.storage_path },
        'mobile'
      ),
      consultationId: row.consultation_id,
      projectTitle: row.project_title,
    }))
  }

  // 다중 매칭: product_tags(배열)에 해당 품명이 하나라도 있으면 포함. contains(@>) 연산으로 배열 내 포함 여부 검사.
  const existingIds = new Set(images.map((i) => i.id))
  for (const tag of tagsToMatchOriginal) {
    const { data: byProductTags } = await supabase
      .from('project_images')
      .select('id, cloudinary_public_id, display_name, storage_path, consultation_id, project_title')
      .eq('status', 'approved')
      .contains('product_tags', [tag])
    for (const row of byProductTags ?? []) {
      if (existingIds.has(row.id)) continue
      existingIds.add(row.id)
      images.push({
        id: row.id,
        cloudinaryPublicId: row.cloudinary_public_id,
        displayName: row.display_name,
        marketingUrl: getAssetUrl(
          { cloudinaryPublicId: row.cloudinary_public_id, storagePath: row.storage_path },
          'marketing'
        ),
        mobileUrl: getAssetUrl(
          { cloudinaryPublicId: row.cloudinary_public_id, storagePath: row.storage_path },
          'mobile'
        ),
        consultationId: row.consultation_id,
        projectTitle: row.project_title,
      })
    }
  }

  return {
    productTag: name,
    sites,
    orderDocuments,
    images,
  }
}

/**
 * 여러 태그에 대해 매칭 결과 조회 (제품별 시공 현장 리스트 등에서 사용)
 */
export async function getDataByProductTags(tags: string[]): Promise<Map<string, ProductMatchResult>> {
  const map = new Map<string, ProductMatchResult>()
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  await Promise.all(
    unique.map(async (tag) => {
      const result = await getDataByProductTag(tag)
      map.set(tag.toLowerCase(), result)
    })
  )
  return map
}
