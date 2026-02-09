/**
 * Cloudinary-Supabase 하이브리드 이미지 서비스
 * - getAssetUrl(id, type): 용도별 최적화 URL (marketing = Cloudinary 고화질, mobile = Storage 또는 Cloudinary 저용량)
 * - 블로그용 마크다운은 무조건 Cloudinary URL 파라미터 포함
 * - base_alt_text: display_name에서 도출한 {date}_{company}_{space} — 싱글 소스, 외부 AI는 이를 접두어로 사용
 */
import { supabase } from '@/lib/supabase'
import type { ProjectImageAsset, SyncStatus } from '@/types/projectImage'
import { USAGE_TYPES, REVIEW_STATUSES, type UsageType, type ReviewStatus } from '@/types/projectImage'
import type { ImageAssetExportItem } from '@/types/imageExport'
import { ALT_TEXT_PROMPT_GUIDE } from '@/types/imageExport'

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

function getCloudinaryCloudName(): string {
  const name = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  return typeof name === 'string' && name.trim() ? name.trim() : 'demo'
}

function getCloudinaryUploadPreset(): string | null {
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  return typeof preset === 'string' && preset.trim() ? preset.trim() : null
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

/**
 * Cloudinary URL 생성 (변환 파라미터 포함)
 * - marketing: 고화질/자동 포맷 (블로그용)
 * - mobile: 저용량 최적화
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
  return `${base}/f_auto,q_auto,w_600/${publicId}`
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
  }
}

/** 이미지 자산 관리 전용: 전체 project_images 조회 (상태/용도 무관). 뱅크·견적 매칭과 동일 소스. */
export async function fetchAllProjectAssets(): Promise<ProjectImageAsset[]> {
  const { data, error } = await supabase
    .from('project_images')
    .select('*')
    .order('created_at', { ascending: false })
  if (error || !data?.length) return []
  return data.map((r: Parameters<typeof rowToProjectAsset>[0]) => rowToProjectAsset(r))
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
