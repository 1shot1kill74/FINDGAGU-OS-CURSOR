/**
 * image_assets 스마트 업로드: Cloudinary 원본 업로드 후 Supabase에 메타 저장
 */
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

function getCloudinaryCloudName(): string {
  const name = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  return typeof name === 'string' && name.trim() ? name.trim() : 'demo'
}

function getCloudinaryUploadPreset(): string | null {
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  return typeof preset === 'string' && preset.trim() ? preset.trim() : null
}

/** 관리자 목록용 표준 썸네일 변환 옵션 (upload/ 바로 뒤 삽입). 가로 800px, 보정·포맷 최적화 */
export const CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS = 'w_800,c_scale,e_improve,e_sharpen,f_auto,q_auto'

/** Cloudinary 썸네일 URL: w_800 리사이즈 + e_improve/e_sharpen 보정 + f_auto,q_auto. Supabase thumbnail_url 저장용 */
export function buildCloudinaryThumbnailUrl(cloudName: string, publicId: string): string {
  const base = `https://res.cloudinary.com/${cloudName}/image/upload`
  return `${base}/${CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS}/${publicId}`
}

/** Cloudinary 원본 URL (secure_url과 동일 형식) */
export function buildCloudinaryOriginalUrl(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`
}

export interface UploadToCloudinaryResult {
  cloudinary_url: string
  thumbnail_url: string
  public_id: string
}

/**
 * 이미지 파일을 Cloudinary에 업로드하고 원본 URL·썸네일 URL 반환
 * @param publicId - 생략 시 Cloudinary 자동 생성 ID 사용 (일괄 업로드 권장)
 */
export async function uploadImageToCloudinary(
  file: File,
  publicId?: string
): Promise<UploadToCloudinaryResult> {
  const cloudName = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  if (!preset || cloudName === 'demo') {
    throw new Error('Cloudinary 설정이 없습니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET을 설정하세요.')
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', preset)
  if (publicId != null && publicId !== '') {
    formData.append('public_id', publicId)
  }
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cloudinary 업로드 실패: ${err}`)
  }
  const json = (await res.json()) as { secure_url?: string; public_id?: string }
  const pid = json.public_id ?? ''
  if (!pid) throw new Error('Cloudinary가 public_id를 반환하지 않았습니다.')
  const cloudinary_url = json.secure_url ?? buildCloudinaryOriginalUrl(cloudName, pid)
  const thumbnail_url = buildCloudinaryThumbnailUrl(cloudName, pid)
  return { cloudinary_url, thumbnail_url, public_id: pid }
}

export type StorageType = 'cloudinary' | 'supabase'

export interface ImageAssetInsertPayload {
  cloudinary_url: string
  thumbnail_url?: string | null
  site_name?: string | null
  photo_date?: string | null
  location?: string | null
  business_type?: string | null
  category?: string | null
  product_name?: string | null
  color_name?: string | null
  is_main?: boolean
  memo?: string | null
  metadata?: Record<string, unknown> | null
  /** cloudinary | supabase. default 'cloudinary' */
  storage_type?: StorageType
  /** storage_type=supabase일 때 documents 버킷 내 경로 */
  storage_path?: string | null
  /** 앱 내 스코어링으로 채움. 업로드 시에는 null */
  ai_score?: number | null
}

/**
 * image_assets 테이블에 1건 Insert.
 * is_main=true이고 site_name이 있으면, 같은 현장의 기존 대표 이미지는 모두 is_main=false로 해제한 뒤 넣어서 현장당 대표는 1개만 유지.
 */
export async function insertImageAsset(payload: ImageAssetInsertPayload): Promise<{ id: string } | { error: Error }> {
  const siteName = payload.site_name?.trim() || null
  if (payload.is_main && siteName) {
    await supabase
      .from('image_assets')
      .update({ is_main: false })
      .eq('site_name', siteName)
  }
  const { error, data } = await supabase
    .from('image_assets')
    .insert({
      cloudinary_url: payload.cloudinary_url,
      thumbnail_url: payload.thumbnail_url ?? null,
      site_name: payload.site_name ?? null,
      photo_date: payload.photo_date ?? null,
      location: payload.location ?? null,
      business_type: payload.business_type ?? null,
      category: payload.category ?? null,
      product_name: payload.product_name ?? null,
      color_name: payload.color_name ?? null,
      is_main: payload.is_main ?? false,
      memo: payload.memo ?? null,
      metadata: (payload.metadata ?? {}) as Json,
      storage_type: payload.storage_type ?? 'cloudinary',
      storage_path: payload.storage_path ?? null,
      ai_score: payload.ai_score != null ? payload.ai_score : null,
    })
    .select('id')
    .single()
  if (error) return { error: new Error(error.message) }
  return { id: (data as { id: string }).id }
}

/** 중복 체크용: 이미 등록된 파일 지문(파일명+사이즈). metadata.original_name, metadata.file_size 기준 */
export interface ExistingFingerprint {
  original_name: string
  file_size: number
}

export async function getExistingImageFingerprints(): Promise<ExistingFingerprint[]> {
  const { data, error } = await supabase
    .from('image_assets')
    .select('metadata')
    .limit(1000)
  if (error) return []
  const out: ExistingFingerprint[] = []
  for (const row of data ?? []) {
    const meta = row?.metadata as Record<string, unknown> | null
    const name = meta?.original_name
    const size = meta?.file_size
    if (typeof name === 'string' && typeof size === 'number') {
      out.push({ original_name: name, file_size: size })
    }
  }
  return out
}

/**
 * 이미지 자산 관리에서 "대표로 지정" 시 호출. 해당 현장(site_name)의 기존 대표는 해제하고 이 이미지만 대표로 설정.
 */
export async function setImageAssetMain(assetId: string, siteName: string): Promise<{ error: Error | null }> {
  const site = siteName?.trim()
  if (!site) return { error: new Error('현장명이 없습니다.') }
  const { error: updateOthers } = await supabase
    .from('image_assets')
    .update({ is_main: false })
    .eq('site_name', site)
  if (updateOthers) return { error: new Error(updateOthers.message) }
  const { error: updateThis } = await supabase
    .from('image_assets')
    .update({ is_main: true })
    .eq('id', assetId)
    .eq('site_name', site)
  if (updateThis) return { error: new Error(updateThis.message) }
  return { error: null }
}

/** 현장명 자동완성: 등록된 site_name 목록 (공백 제거 후 유니크, 정렬) */
export async function getExistingSiteNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('image_assets')
    .select('site_name')
    .not('site_name', 'is', null)
  if (error) return []
  const set = new Set<string>()
  for (const row of data ?? []) {
    const name = (row?.site_name as string)?.trim()
    if (name) set.add(name)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
}
