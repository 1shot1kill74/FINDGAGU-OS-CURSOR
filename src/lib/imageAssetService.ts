/**
 * Cloudinary-Supabase 하이브리드 이미지 서비스
 * - getAssetUrl(id, type): 용도별 최적화 URL (marketing = Cloudinary 고화질, mobile = Storage 또는 Cloudinary 저용량)
 * - 블로그용 마크다운은 무조건 Cloudinary URL 파라미터 포함
 * - base_alt_text: display_name에서 도출한 {date}_{company}_{space} — 싱글 소스, 외부 AI는 이를 접두어로 사용
 */
import { supabase } from '@/lib/supabase'
import { getCloudinaryCloudName, getCloudinaryUploadPreset } from '@/lib/config'
import { CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS } from '@/lib/constants'
import type { ProjectImageAsset, SyncStatus } from '@/types/projectImage'
import { USAGE_TYPES, REVIEW_STATUSES, type UsageType, type ReviewStatus } from '@/types/projectImage'
import type { ImageAssetExportItem } from '@/types/imageExport'
import { ALT_TEXT_PROMPT_GUIDE } from '@/types/imageExport'
import type { Json } from '@/types/database'

/** 이미지 추출 도구에서 텍스트(업체명, 날짜 등) 합성 파라미터를 받을 때 사용. (추후 구현) */
export type { ImageExportOptions, ImageAssetExportItem } from '@/types/imageExport'

export { generateFileName, getBaseAltTextFromDisplayName } from '@/lib/imageNaming'
import { getBaseAltTextFromDisplayName } from '@/lib/imageNaming'
export type { ProjectDataForFileName } from '@/lib/imageNaming'

const BUCKET = 'construction-assets'

/**
 * 파일 SHA-256 해시 (중복 업로드 감지용)
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 동일 content_hash가 이미 project_images에 있으면 true (중복 업로드 차단)
 */
export async function checkDuplicateByHash(contentHash: string): Promise<boolean> {
  const { data } = await supabase
    .from('project_images')
    .select('id')
    .eq('content_hash', contentHash)
    .maybeSingle()
  return data != null
}

/**
 * Cloudinary 업로드 시 사용할 옵션 — 생성된 파일명을 public_id로 노출
 * use_filename: true, unique_filename: false → URL에 우리 규칙의 파일명이 그대로 노출
 */
export function getCloudinaryUploadOptions(publicId: string): {
  public_id: string
  use_filename: boolean
  unique_filename: boolean
} {
  return {
    public_id: publicId,
    use_filename: true,
    unique_filename: false,
  }
}


/** API 키가 설정되어 있으면 true. 업로드 창에서 테스트 모드 안내 표시용 */
export function isCloudinaryConfigured(): boolean {
  const name = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  return name !== 'demo' && preset != null
}

const MOCK_PUBLIC_ID_PREFIX = 'mock_'
/** 목업 업로드로 생성된 public_id인지 (DEV에서 로컬 미리보기용 URL 치환) */
export function isMockPublicId(publicId: string | null | undefined): boolean {
  return Boolean(publicId && publicId.startsWith(MOCK_PUBLIC_ID_PREFIX))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseBeforeAfterMeta(metadata: unknown): {
  role: 'before' | 'after' | null
  groupId: string | null
  raw: Record<string, unknown> | null
} {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { role: null, groupId: null, raw: null }
  }
  const raw = metadata as Record<string, unknown>
  const role = raw.before_after_role === 'before' || raw.before_after_role === 'after'
    ? raw.before_after_role
    : null
  const groupId = typeof raw.before_after_group_id === 'string' && raw.before_after_group_id.trim()
    ? raw.before_after_group_id.trim()
    : null
  return { role, groupId, raw }
}

function parseStoredSpaceId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  if (raw.startsWith('spaces/')) return raw.slice('spaces/'.length) || null
  const roomMatch = raw.match(/\/room\/([A-Za-z0-9_-]+)/)
  if (roomMatch?.[1]) return roomMatch[1]
  return raw
}

function normalizeConsultationName(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized
    .replace(/^(상담접수|견적중|계약완료|시공완료|접수|견적|진행|완료|거절|무효|AS)\s+/i, '')
    .trim()
    .toLowerCase()
}

function normalizeDisplayToken(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ')
  return normalized || fallback
}

function formatExternalDisplayNameMonth(...dateCandidates: Array<string | null | undefined>): string | null {
  for (const candidate of dateCandidates) {
    const raw = (candidate ?? '').trim()
    if (!raw) continue
    const parsed = new Date(raw)
    const time = parsed.getTime()
    if (!Number.isFinite(time)) continue
    const year = String(parsed.getFullYear()).slice(-2)
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    return `${year}${month}`
  }
  return null
}

function getExternalDisplayNamePhoneSuffix(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : '0000'
}

export function buildExternalDisplayName(params: {
  requestDate?: string | null
  startDate?: string | null
  createdAt?: string | null
  region?: string | null
  industry?: string | null
  customerPhone?: string | null
}): string | null {
  const monthCode = formatExternalDisplayNameMonth(params.requestDate, params.startDate, params.createdAt)
  if (!monthCode) return null
  const region = normalizeDisplayToken(params.region, '미지정')
  const industry = normalizeDisplayToken(params.industry, '기타')
  const phoneSuffix = getExternalDisplayNamePhoneSuffix(params.customerPhone)
  return `${monthCode} ${region} ${industry} ${phoneSuffix}`
}

function parseImageAssetMeta(metadata: unknown): {
  raw: Record<string, unknown>
  spaceId: string | null
  consultationId: string | null
  canonicalSiteName: string | null
  legacySiteName: string | null
  spaceDisplayName: string | null
  externalDisplayName: string | null
} {
  const raw = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {}
  const consultationId = typeof raw.consultation_id === 'string' && raw.consultation_id.trim()
    ? raw.consultation_id.trim()
    : null
  const canonicalSiteName = typeof raw.canonical_site_name === 'string' && raw.canonical_site_name.trim()
    ? raw.canonical_site_name.trim()
    : null
  const legacySiteName = typeof raw.legacy_site_name === 'string' && raw.legacy_site_name.trim()
    ? raw.legacy_site_name.trim()
    : null
  const spaceDisplayName = typeof raw.space_display_name === 'string' && raw.space_display_name.trim()
    ? raw.space_display_name.trim()
    : null
  const externalDisplayName = typeof raw.external_display_name === 'string' && raw.external_display_name.trim()
    ? raw.external_display_name.trim()
    : null
  return {
    raw,
    spaceId: parseStoredSpaceId(raw.space_id),
    consultationId,
    canonicalSiteName,
    legacySiteName,
    spaceDisplayName,
    externalDisplayName,
  }
}

export function getExternalDisplayNameFromImageAssetMeta(metadata: unknown): string | null {
  return parseImageAssetMeta(metadata).externalDisplayName
}

const IMAGE_ASSET_MANAGEMENT_SELECT =
  'id, created_at, cloudinary_url, thumbnail_url, site_name, is_main, product_name, color_name, location, business_type, category, ai_score, view_count, internal_score, share_count, is_consultation, metadata'
const IMAGE_ASSET_MANAGEMENT_CATEGORIES = ['책상', '의자', '책장', '사물함', '상담/실측', '기타'] as const
const IMAGE_ASSET_PAGE_SIZE = 500

/**
 * BLUEPRINT 이미지 이원화: 시공 사진 업로드는 반드시 Cloudinary(고화질) + Supabase(썸네일) 분기.
 * DEV 환경에서는 Cloudinary 호출 생략, 3초 대기 후 Supabase만 업로드해 DB 기록·수정/공유 테스트 가능.
 */
export async function uploadConstructionImageDual(
  file: File,
  publicId: string
): Promise<{ cloudinaryPublicId: string; storagePath: string; thumbnailPath: string }> {
  if (import.meta.env.DEV) {
    if (!isCloudinaryConfigured()) {
      console.info('현재 테스트 모드입니다. 실전 업로드를 원하시면 .env 설정을 확인하세요.')
    }
    await delay(3000)
    const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
    const { error: storageError } = await supabase.storage.from(BUCKET).upload(thumbPath, file, {
      contentType: file.type,
      upsert: false,
    })
    if (storageError) throw new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`)
    return {
      cloudinaryPublicId: `${MOCK_PUBLIC_ID_PREFIX}${publicId}_${Date.now()}`,
      storagePath: thumbPath,
      thumbnailPath: thumbPath,
    }
  }

  const cloudName = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  if (!preset || cloudName === 'demo') {
    throw new Error(
      'BLUEPRINT: 시공 사진은 Cloudinary(고화질) 업로드가 필수입니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET(unsigned)을 설정하세요.'
    )
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', preset)
  formData.append('public_id', publicId)
  const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!cloudRes.ok) {
    const err = await cloudRes.text()
    throw new Error(`Cloudinary 업로드 실패: ${err}`)
  }
  const cloudJson = (await cloudRes.json()) as { public_id: string }
  const cloudinaryPublicId = cloudJson.public_id ?? publicId

  const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(thumbPath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (storageError) {
    throw new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`)
  }
  return {
    cloudinaryPublicId,
    storagePath: thumbPath,
    thumbnailPath: thumbPath,
  }
}

/**
 * 이원화 업로드 + Cloudinary 업로드 진행률 콜백 (Progress Bar용)
 * DEV: Cloudinary 스킵, 약 3초 진행률 시뮬레이션 후 Supabase만 업로드 → DB 기록으로 수정/공유 테스트 가능.
 */
export function uploadConstructionImageDualWithProgress(
  file: File,
  publicId: string,
  onProgress: (percent: number) => void
): Promise<{ cloudinaryPublicId: string; storagePath: string; thumbnailPath: string }> {
  if (import.meta.env.DEV) {
    if (!isCloudinaryConfigured()) {
      console.info('현재 테스트 모드입니다. 실전 업로드를 원하시면 .env 설정을 확인하세요.')
    }
    const totalMs = 3000
    const stepMs = 200
    let p = 0
    return new Promise((resolve, reject) => {
      const tick = () => {
        p = Math.min(99, p + (100 * stepMs) / totalMs)
        onProgress(Math.round(p))
        if (p < 99) setTimeout(tick, stepMs)
        else {
          onProgress(100)
          const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
          supabase.storage
            .from(BUCKET)
            .upload(thumbPath, file, { contentType: file.type, upsert: false })
            .then(({ error: storageError }) => {
              if (storageError) {
                reject(new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`))
                return
              }
              resolve({
                cloudinaryPublicId: `${MOCK_PUBLIC_ID_PREFIX}${publicId}_${Date.now()}`,
                storagePath: thumbPath,
                thumbnailPath: thumbPath,
              })
            })
            .catch(reject)
        }
      }
      setTimeout(tick, stepMs)
    })
  }

  const cloudName = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  if (!preset || cloudName === 'demo') {
    return Promise.reject(
      new Error(
        'BLUEPRINT: 시공 사진은 Cloudinary(고화질) 업로드가 필수입니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET(unsigned)을 설정하세요.'
      )
    )
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', preset)
  formData.append('public_id', publicId)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
        onProgress(percent)
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Cloudinary 업로드 실패: ${xhr.status} ${xhr.responseText}`))
        return
      }
      try {
        const json = JSON.parse(xhr.responseText) as { public_id?: string }
        const cloudinaryPublicId = json.public_id ?? publicId
        onProgress(100)
        const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
        supabase.storage
          .from(BUCKET)
          .upload(thumbPath, file, {
            contentType: file.type,
            upsert: false,
          })
          .then(({ error: storageError }) => {
            if (storageError) {
              reject(new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`))
              return
            }
            resolve({
              cloudinaryPublicId,
              storagePath: thumbPath,
              thumbnailPath: thumbPath,
            })
          })
          .catch(reject)
      } catch {
        reject(new Error('Cloudinary 응답 파싱 실패'))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Cloudinary 네트워크 오류')))
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.send(formData)
  })
}

/** 관리자 목록용 표준 썸네일 변환 파라미터 — src/lib/constants.ts 의 CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS 사용 */

/**
 * Cloudinary URL 생성 (변환 파라미터 포함)
 * - marketing: 고화질/자동 포맷 (블로그용)
 * - mobile: 관리자 목록 로딩용 표준 썸네일 (w_800, e_improve, e_sharpen, f_auto, q_auto)
 */
export function buildCloudinaryUrl(
  publicId: string,
  type: 'marketing' | 'mobile'
): string {
  const cloudName = getCloudinaryCloudName()
  const base = `https://res.cloudinary.com/${cloudName}/image/upload`
  if (type === 'marketing') {
    return `${base}/f_auto,q_auto,w_1200/${publicId}`
  }
  return `${base}/${CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS}/${publicId}`
}

/** 상담 타임라인 등에서 사용할 Cloudinary 변환 URL (이미지 자산 관리와 동일 규격 활용) */
export const CLOUDINARY_CHAT_THUMB = 'w_200,h_200,c_fill,f_auto,q_auto'

/**
 * 지정한 변환으로 Cloudinary URL 생성 (상담 히스토리 썸네일/라이트박스용)
 * @param publicId - Cloudinary public_id
 * @param transformation - 예: w_200,h_200,c_fill (썸네일), f_auto,q_auto,w_1200 (상세)
 * @param cloudName - 생략 시 env 기준
 */
export function buildCloudinaryUrlWithTransformation(
  publicId: string,
  transformation: string,
  cloudName?: string
): string {
  const name = cloudName ?? getCloudinaryCloudName()
  return `https://res.cloudinary.com/${name}/image/upload/${transformation}/${publicId}`
}

/** 시드 데이터: cloudinary_public_id가 seed_N 형태면 항상 실제 이미지가 나오는 샘플 URL 사용 */
function getSeedImageUrl(publicId: string, type: 'marketing' | 'mobile'): string | null {
  const m = /^seed_(\d+)$/.exec(publicId.trim())
  if (!m) return null
  const num = m[1]
  const w = type === 'marketing' ? 1200 : 600
  return `https://picsum.photos/seed/${num}/${w}/400`
}

/**
 * 용도별 이미지 URL 반환
 * - marketing: Cloudinary 고화질/변환 URL (블로그용). DEV 목업(mock_)은 Supabase 로컬 미리보기.
 * - seed_N: 시드 데이터용 picsum.photos 샘플 URL
 * - mobile: Supabase Storage 또는 Cloudinary 저용량 URL
 */
export function getAssetUrl(
  asset: { cloudinaryPublicId: string; storagePath?: string | null },
  type: 'marketing' | 'mobile'
): string {
  const seedUrl = getSeedImageUrl(asset.cloudinaryPublicId, type)
  if (seedUrl) return seedUrl
  const useStorage = asset.storagePath && asset.storagePath.trim()
  if (import.meta.env.DEV && isMockPublicId(asset.cloudinaryPublicId) && useStorage) {
    return supabase.storage.from(BUCKET).getPublicUrl(asset.storagePath!).data.publicUrl
  }
  if (type === 'marketing') {
    return buildCloudinaryUrl(asset.cloudinaryPublicId, 'marketing')
  }
  if (useStorage) {
    return supabase.storage.from(BUCKET).getPublicUrl(asset.storagePath!).data.publicUrl
  }
  return buildCloudinaryUrl(asset.cloudinaryPublicId, 'mobile')
}

/**
 * Sync Status: Cloudinary·Storage 매칭 여부
 * - synced: Cloudinary ID 있음 + (Storage 경로 있음 또는 Mobile_Only 아님)
 * - cloudinary_only: Cloudinary만 있음 (Marketing용으로 충분)
 * - storage_only: Cloudinary ID 없음 (레거시, 등록 불가 정책 위반)
 * - missing: ID 없음
 */
export function getSyncStatus(asset: {
  cloudinaryPublicId: string
  storagePath?: string | null
  usageType?: string
}): SyncStatus {
  const hasCloudinary = Boolean(asset.cloudinaryPublicId && asset.cloudinaryPublicId.trim())
  const hasStorage = Boolean(asset.storagePath && asset.storagePath.trim())
  if (!hasCloudinary) return hasStorage ? 'storage_only' : 'missing'
  if (asset.usageType === 'Mobile_Only' && !hasStorage) return 'cloudinary_only'
  return hasStorage ? 'synced' : 'cloudinary_only'
}

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

/** image_assets 행(스마트 업로드) → ProjectImageAsset. site_name → projectTitle로 현장별 그룹화. */
function rowImageAssetToProjectAsset(row: {
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
  }
}

type ConsultationSpaceRow = {
  id: string
  project_name: string | null
  channel_chat_id: string | null
  request_date: string | null
  start_date: string | null
  created_at: string | null
  region: string | null
  industry: string | null
  customer_phone: string | null
  metadata?: Record<string, unknown> | null
}

type ImageAssetMigrationRow = {
  id: string
  site_name: string | null
  business_type: string | null
  location: string | null
  metadata?: Record<string, unknown> | null
}

export type ImageAssetSpaceBackfillResult = {
  updated: number
  matchedByConsultationId: number
  matchedBySpaceId: number
  matchedByName: number
  skippedUnmatched: number
  skippedAmbiguous: number
}

export async function backfillImageAssetSpaceMetadata(): Promise<ImageAssetSpaceBackfillResult> {
  const consultations: ConsultationSpaceRow[] = []
  for (let from = 0; ; from += IMAGE_ASSET_PAGE_SIZE) {
    const to = from + IMAGE_ASSET_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('consultations')
      .select('id, project_name, channel_chat_id, request_date, start_date, created_at, region, industry, customer_phone, metadata')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    consultations.push(...(data as unknown as ConsultationSpaceRow[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
  }

  const imageAssets: ImageAssetMigrationRow[] = []
  for (let from = 0; ; from += IMAGE_ASSET_PAGE_SIZE) {
    const to = from + IMAGE_ASSET_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('image_assets')
      .select('id, site_name, business_type, location, metadata')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    imageAssets.push(...(data as ImageAssetMigrationRow[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
  }

  const consultationsById = new Map<string, ConsultationSpaceRow>()
  const consultationsBySpaceId = new Map<string, ConsultationSpaceRow>()
  const consultationsByNormalizedName = new Map<string, ConsultationSpaceRow[]>()

  consultations.forEach((row) => {
    consultationsById.set(row.id, row)
    const metaSpaceId = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? parseStoredSpaceId((row.metadata as Record<string, unknown>).space_id)
      : null
    const spaceId = metaSpaceId || parseStoredSpaceId(row.channel_chat_id)
    if (spaceId && !consultationsBySpaceId.has(spaceId)) consultationsBySpaceId.set(spaceId, row)
    const normalizedName = normalizeConsultationName(row.project_name)
    if (!normalizedName) return
    const list = consultationsByNormalizedName.get(normalizedName) ?? []
    list.push(row)
    consultationsByNormalizedName.set(normalizedName, list)
  })

  let updated = 0
  let matchedByConsultationId = 0
  let matchedBySpaceId = 0
  let matchedByName = 0
  let skippedUnmatched = 0
  let skippedAmbiguous = 0

  for (const row of imageAssets) {
    const meta = parseImageAssetMeta(row.metadata)
    let matched: ConsultationSpaceRow | null = null
    let matchSource: 'consultation' | 'space' | 'name' | null = null

    if (meta.consultationId && consultationsById.has(meta.consultationId)) {
      matched = consultationsById.get(meta.consultationId) ?? null
      matchSource = 'consultation'
    } else if (meta.spaceId && consultationsBySpaceId.has(meta.spaceId)) {
      matched = consultationsBySpaceId.get(meta.spaceId) ?? null
      matchSource = 'space'
    } else {
      const normalizedSiteName = normalizeConsultationName(
        meta.canonicalSiteName || row.site_name || meta.spaceDisplayName || meta.legacySiteName
      )
      const nameMatches = normalizedSiteName ? (consultationsByNormalizedName.get(normalizedSiteName) ?? []) : []
      if (nameMatches.length === 1) {
        matched = nameMatches[0]
        matchSource = 'name'
      } else if (nameMatches.length > 1) {
        skippedAmbiguous += 1
        continue
      }
    }

    if (!matched) {
      skippedUnmatched += 1
      continue
    }

    const matchedMeta = matched.metadata && typeof matched.metadata === 'object' && !Array.isArray(matched.metadata)
      ? (matched.metadata as Record<string, unknown>)
      : {}
    const matchedSpaceId = parseStoredSpaceId(matchedMeta.space_id) || parseStoredSpaceId(matched.channel_chat_id)
    const canonicalSiteName = matched.project_name?.trim() || meta.canonicalSiteName || row.site_name?.trim() || meta.spaceDisplayName
    const externalDisplayName = buildExternalDisplayName({
      requestDate: matched.request_date,
      startDate: matched.start_date,
      createdAt: matched.created_at,
      region: row.location?.trim() || null,
      industry: row.business_type?.trim() || null,
      customerPhone: matched.customer_phone,
    })
    const currentSiteName = row.site_name?.trim() || null
    const nextMetadata: Record<string, unknown> = { ...meta.raw }
    let changed = false

    if (matched.id && nextMetadata.consultation_id !== matched.id) {
      nextMetadata.consultation_id = matched.id
      changed = true
    }
    if (matchedSpaceId && parseStoredSpaceId(nextMetadata.space_id) !== matchedSpaceId) {
      nextMetadata.space_id = matchedSpaceId
      changed = true
    }
    if (canonicalSiteName && nextMetadata.canonical_site_name !== canonicalSiteName) {
      nextMetadata.canonical_site_name = canonicalSiteName
      changed = true
    }
    if (currentSiteName && canonicalSiteName && currentSiteName !== canonicalSiteName && !nextMetadata.legacy_site_name) {
      nextMetadata.legacy_site_name = currentSiteName
      changed = true
    }
    if (canonicalSiteName && nextMetadata.space_display_name !== canonicalSiteName) {
      nextMetadata.space_display_name = canonicalSiteName
      changed = true
    }
    if (externalDisplayName && nextMetadata.external_display_name !== externalDisplayName) {
      nextMetadata.external_display_name = externalDisplayName
      changed = true
    }

    const nextSiteName = canonicalSiteName || currentSiteName
    if (!changed && nextSiteName === currentSiteName) continue

    const { error } = await supabase
      .from('image_assets')
      .update({
        site_name: nextSiteName ?? null,
        metadata: nextMetadata as Json,
      })
      .eq('id', row.id)
    if (error) throw new Error(error.message)

    updated += 1
    if (matchSource === 'consultation') matchedByConsultationId += 1
    else if (matchSource === 'space') matchedBySpaceId += 1
    else if (matchSource === 'name') matchedByName += 1
  }

  return {
    updated,
    matchedByConsultationId,
    matchedBySpaceId,
    matchedByName,
    skippedUnmatched,
    skippedAmbiguous,
  }
}

/** 이미지 자산 관리 전용: project_images + image_assets(스마트 업로드) 통합 조회. 썸네일은 DB 저장값 사용(즉시 표시). */
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

    // [연도 > 지역 > 현장명]
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

    // 업종
    industryMap.set(industry, (industryMap.get(industry) ?? 0) + 1)
    // 제품명
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

/** 고객용 시공사례 쇼룸: image_assets 전체 조회 (현장/제품 그룹화용) */
export interface ShowroomImageAsset {
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
  view_count: number
  share_count: number
  internal_score: number | null
  before_after_role?: 'before' | 'after' | null
  before_after_group_id?: string | null
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
 * (레거시·AI 추천 배지용. 내부 스코어는 imageScoringService.updateInternalScoresBatch 사용)
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

/** 단일 자산 메타 수정 — 태그·용도·승인·현장명 등. 수정 시 뱅크·견적에 즉시 반영. */
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

/** 자산의 확정 알트 텍스트 — display_name(파일명)과 동일 소스, 수정 시 양쪽 동기화 */
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

/**
 * 안전 장치: 삭제/수정 시 Cloudinary ↔ Supabase 양쪽 일관성 유지
 * - 삭제: Cloudinary ID로 대상 식별 → (실제 구현 시) 1. Cloudinary에서 삭제 2. Storage 객체 삭제 3. project_images 행 삭제
 * - 수정: Cloudinary ID 비우기 불가 (제약) → (실제 구현 시) ID 변경 시 양쪽 갱신
 * - 로컬 Mock: 코드 수준 검증만 수행 (ensureCanDelete / ensureCanUpdate)
 */
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

/** 삭제 시 양쪽 체크 후 수행할 단계 (설계용 — 실제 Cloudinary/Storage API 호출은 호출부에서) */
export function getDeleteSteps(asset: ProjectImageAsset): { ok: boolean; reason?: string; steps: string[] } {
  const check = ensureCanDelete(asset)
  if (!check.ok) return { ...check, steps: [] }
  const steps: string[] = ['1. Cloudinary에서 public_id로 삭제']
  if (asset.storagePath?.trim()) steps.push('2. Supabase Storage에서 storage_path 객체 삭제')
  steps.push('3. project_images 행 삭제')
  return { ok: true, steps }
}
