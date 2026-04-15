/**
 * 업로드 단일 엔진 — 파일 확장자·카테고리별 저장소 분기
 *
 * - .jpg, .png, .webp (시공사례용) → Cloudinary
 * - .pdf, .ppt, .pptx 또는 category가 'floor_plan', 'purchase_order' → Supabase Storage (documents 버킷)
 * - image_assets에 저장 시 storage_type으로 'cloudinary' | 'supabase' 구분
 */
import { supabase } from '@/lib/supabase'
import { buildCloudinaryOriginalUrl, buildCloudinaryThumbnailUrl } from '@/lib/imageAssetUploadService'
import { getCloudinaryCloudName, getCloudinaryUploadPreset, getSupabaseUrl } from '@/lib/config'
import { CLOUDINARY_UPLOAD_FOLDER } from '@/lib/constants'

/** 업로드 시 메타데이터 (Cloudinary context·tags 또는 Supabase 경로 구성용) */
export interface UploadEngineMetadata {
  /** 업체명/고객명 */
  customer_name?: string
  /** 프로젝트 번호 (상담 ID 또는 표시용 번호) */
  project_id?: string
  /** 이미지 배치 역할 */
  before_after_role?: 'before' | 'after'
  /** 분류 (예: '상담/실측', '책상', '의자', 'floor_plan', 'purchase_order') */
  category?: string
  /** 업로드일 (yyyy-MM-dd) */
  upload_date?: string
  /** 출처 식별 (예: 'image_asset_upload', 'consultation_card') */
  source?: string
  /** floor_plan 전용: AI 참조용 평수·구조 정보 (metadata.space_info) */
  space_info?: { pyeong?: number; structure?: string; [key: string]: unknown }
}

export type StorageType = 'cloudinary' | 'supabase'

export interface UploadEngineResult {
  storage_type: StorageType
  cloudinary_url: string
  thumbnail_url: string | null
  public_id: string | null
  storage_path?: string | null
}


const DOCUMENTS_BUCKET = 'documents'

/** Supabase Storage → Supabase 문서 저장 대상 카테고리 */
const SUPABASE_CATEGORIES = ['floor_plan', 'purchase_order'] as const

/** Supabase 문서용 확장자 */
const SUPABASE_EXTENSIONS = ['pdf', 'ppt', 'pptx'] as const

/** Cloudinary 이미지용 확장자 (시공사례) */
const CLOUDINARY_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

function getFileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

/**
 * 파일 확장자·카테고리 기준으로 저장소 결정
 * - .pdf, .ppt, .pptx → Supabase
 * - category가 floor_plan 또는 purchase_order → Supabase
 * - .jpg, .png, .webp (그 외) → Cloudinary
 */
export function shouldUseSupabaseStorage(file: File, metadata: UploadEngineMetadata): boolean {
  const ext = getFileExtension(file)
  const cat = (metadata.category ?? '').toLowerCase()
  if (SUPABASE_EXTENSIONS.includes(ext as (typeof SUPABASE_EXTENSIONS)[number])) return true
  if (SUPABASE_CATEGORIES.includes(cat as (typeof SUPABASE_CATEGORIES)[number])) return true
  return false
}


function safeContextValue(s: string | undefined): string {
  return (s ?? '').replace(/\|/g, ' ').trim()
}

function buildContextString(meta: UploadEngineMetadata): string {
  const parts: string[] = []
  if (meta.customer_name != null) parts.push(`custom_name=${safeContextValue(meta.customer_name)}`)
  if (meta.project_id != null) parts.push(`project_id=${safeContextValue(meta.project_id)}`)
  if (meta.before_after_role != null) parts.push(`before_after_role=${safeContextValue(meta.before_after_role)}`)
  if (meta.category != null) parts.push(`category=${safeContextValue(meta.category)}`)
  if (meta.upload_date != null) parts.push(`upload_date=${safeContextValue(meta.upload_date)}`)
  if (meta.source != null) parts.push(`source=${safeContextValue(meta.source)}`)
  return parts.join('|')
}

function buildTagsString(meta: UploadEngineMetadata): string {
  const tags: string[] = []
  if (meta.customer_name?.trim()) tags.push(meta.customer_name.trim())
  if (meta.project_id?.trim()) tags.push(meta.project_id.trim())
  if (meta.before_after_role?.trim()) tags.push(meta.before_after_role.trim())
  if (meta.category?.trim()) tags.push(meta.category.trim())
  if (meta.source?.trim()) tags.push(meta.source.trim())
  return tags.length ? tags.join(',') : ''
}

function slugForPublicId(s: string): string {
  return s
    .replace(/\s+/g, '_')
    .replace(/[/\\?*]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'image'
}

function buildPublicId(meta: UploadEngineMetadata): string {
  const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  const customer = slugForPublicId(meta.customer_name ?? '')
  const cat = slugForPublicId(meta.category ?? 'image')
  const suffix = Date.now().toString(36)
  const seg = [yymmdd, customer || '업로드', cat, suffix].filter(Boolean).join('_')
  return `${CLOUDINARY_UPLOAD_FOLDER}/${seg}`
}

function buildSupabasePublicUrl(storagePath: string): string {
  const base = getSupabaseUrl()
  return `${base}/storage/v1/object/public/${DOCUMENTS_BUCKET}/${storagePath}`
}

/**
 * 상담 카드 입구용: 메타데이터가 비어 있으면 업로드 불가.
 */
export function validateMetadataForConsultation(meta: UploadEngineMetadata): boolean {
  const hasName = (meta.customer_name ?? '').trim().length > 0
  const hasProject = (meta.project_id ?? '').trim().length > 0
  return hasName || hasProject
}

export const CONSULTATION_UPLOAD_ERROR_MESSAGE = '상담 정보가 부족하여 업로드할 수 없습니다.'

/**
 * Supabase documents 버킷에 업로드 + PDF/PPTX 썸네일 생성
 */
async function uploadToSupabase(file: File, metadata: UploadEngineMetadata): Promise<UploadEngineResult> {
  const cat = (metadata.category ?? 'document').toLowerCase()
  const safeCat = SUPABASE_CATEGORIES.includes(cat as (typeof SUPABASE_CATEGORIES)[number]) ? cat : 'document'
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${metadata.project_id ?? 'general'}/${safeCat}/${timestamp}_${safeName}`

  const contentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, file, { contentType, upsert: false })
  if (error) throw new Error(`Supabase 업로드 실패: ${error.message}`)

  const publicUrl = buildSupabasePublicUrl(storagePath)
  let thumbnailUrl: string | null = null

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf', 'ppt', 'pptx'].includes(ext)) {
    try {
      const { generateDocumentThumbnail } = await import('@/lib/documentThumbnail')
      const thumbBlob = await generateDocumentThumbnail(file)
      if (thumbBlob) {
        const thumbPath = storagePath.replace(/\.[^.]+$/, '_thumb.jpg')
        const { error: thumbErr } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: false })
        if (!thumbErr) thumbnailUrl = buildSupabasePublicUrl(thumbPath)
      }
    } catch {
      // 썸네일 실패 시 null 유지 (아이콘 표시)
    }
  }

  return {
    storage_type: 'supabase',
    cloudinary_url: publicUrl,
    thumbnail_url: thumbnailUrl,
    public_id: null,
    storage_path: storagePath,
  }
}

/**
 * Cloudinary에 이미지 업로드
 */
async function uploadToCloudinary(file: File, metadata: UploadEngineMetadata): Promise<UploadEngineResult> {
  const cloudName = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  if (!preset || cloudName === 'demo') {
    throw new Error('Cloudinary 설정이 없습니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET을 설정하세요.')
  }

  const publicId = buildPublicId(metadata)
  const contextStr = buildContextString(metadata)
  const tagsStr = buildTagsString(metadata)

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', preset)
  formData.append('public_id', publicId)
  if (contextStr) formData.append('context', contextStr)
  if (tagsStr) formData.append('tags', tagsStr)

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
  return {
    storage_type: 'cloudinary',
    cloudinary_url,
    thumbnail_url,
    public_id: pid,
    storage_path: null,
  }
}

/**
 * 공통 업로드 엔진 — 확장자·카테고리 기준으로 Cloudinary 또는 Supabase 분기
 */
export async function uploadEngine(file: File, metadata: UploadEngineMetadata): Promise<UploadEngineResult> {
  const useSupabase = shouldUseSupabaseStorage(file, metadata)
  if (useSupabase) {
    return uploadToSupabase(file, metadata)
  }
  const ext = getFileExtension(file)
  if (!CLOUDINARY_EXTENSIONS.includes(ext as (typeof CLOUDINARY_EXTENSIONS)[number])) {
    throw new Error(`지원하지 않는 파일 형식입니다. 이미지(jpg/png/webp) 또는 문서(pdf/ppt/pptx)만 업로드할 수 있습니다.`)
  }
  return uploadToCloudinary(file, metadata)
}

/**
 * Cloudinary 원본 삭제는 서버사이드에서만 처리해야 한다.
 * 브라우저에 API secret을 두면 누구나 원본 삭제 서명을 만들 수 있으므로 프론트에서는 막는다.
 */
export async function deleteCloudinaryImage(_publicId: string): Promise<boolean> {
  if (import.meta.env.DEV) {
    console.warn('Cloudinary 원본 삭제는 클라이언트에서 비활성화되었습니다. 서버사이드 엔드포인트로 이전이 필요합니다.')
  }
  return false
}

/**
 * Supabase documents 버킷에서 파일 삭제 (썸네일 포함)
 */
export async function deleteSupabaseDocument(storagePath: string): Promise<boolean> {
  const thumbPath = storagePath.replace(/\.[^.]+$/, '_thumb.jpg')
  const paths = [storagePath]
  if (thumbPath !== storagePath) paths.push(thumbPath)
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths)
  return !error
}
