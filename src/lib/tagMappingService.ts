/**
 * 제품 DB 품명(스마트A, 모번 등) ↔ Cloudinary 이미지 태그 1:N 매칭
 * tag_mappings 테이블: 하나의 제품이 여러 cloudinary_tag를 가질 수 있음
 */
import { supabase } from '@/lib/supabase'

export interface TagMappingRow {
  id: string
  product_name: string
  cloudinary_tag: string
  display_order: number
  created_at: string
  updated_at: string
}

let cache: TagMappingRow[] | null = null

async function fetchMappings(): Promise<TagMappingRow[]> {
  const { data, error } = await supabase
    .from('tag_mappings')
    .select('*')
    .order('display_order', { ascending: true })
    .order('product_name', { ascending: true })
  if (error) return []
  return (data ?? []) as TagMappingRow[]
}

/** 매핑 목록 조회 (캐시 사용, 갱신 시 invalidate 호출) */
export async function getTagMappings(): Promise<TagMappingRow[]> {
  if (cache) return cache
  cache = await fetchMappings()
  return cache
}

export function invalidateTagMappingCache(): void {
  cache = null
}

/** 우리 품명 → Cloudinary 태그 배열 (1:N). 없으면 [품명]만 반환(폴백) */
export async function getCloudinaryTags(productName: string): Promise<string[]> {
  const name = productName.trim()
  if (!name) return []
  const mappings = await getTagMappings()
  const found = mappings.filter(
    (m) => m.product_name.toLowerCase() === name.toLowerCase()
  )
  if (found.length === 0) return [name]
  return found.map((m) => m.cloudinary_tag)
}

/** 우리 품명 → Cloudinary 태그 첫 번째 (하위 호환) */
export async function getCloudinaryTag(productName: string): Promise<string> {
  const tags = await getCloudinaryTags(productName)
  return tags[0] ?? productName.trim()
}

/** Cloudinary 태그 → 우리 품명. 없으면 태그 그대로 반환 */
export async function getProductName(cloudinaryTag: string): Promise<string> {
  const tag = cloudinaryTag.trim()
  if (!tag) return ''
  const mappings = await getTagMappings()
  const found = mappings.find(
    (m) => m.cloudinary_tag.toLowerCase() === tag.toLowerCase()
  )
  return found ? found.product_name : tag
}

/** 품명으로 매핑 존재 여부 */
export async function hasMapping(productName: string): Promise<boolean> {
  const mappings = await getTagMappings()
  return mappings.some(
    (m) => m.product_name.toLowerCase() === productName.trim().toLowerCase()
  )
}
