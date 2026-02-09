/**
 * Cloudinary-Supabase 하이브리드 이미지 서비스
 * - getAssetUrl(id, type): 용도별 최적화 URL (marketing = Cloudinary 고화질, mobile = Storage 또는 Cloudinary 저용량)
 * - 블로그용 마크다운은 무조건 Cloudinary URL 파라미터 포함
 * - base_alt_text: display_name에서 도출한 {date}_{company}_{space} — 싱글 소스, 외부 AI는 이를 접두어로 사용
 */
import { supabase } from '@/lib/supabase'
import type { ProjectImageAsset, SyncStatus } from '@/types/projectImage'
import type { ImageAssetExportItem } from '@/types/imageExport'
import { ALT_TEXT_PROMPT_GUIDE } from '@/types/imageExport'

/** 이미지 추출 도구에서 텍스트(업체명, 날짜 등) 합성 파라미터를 받을 때 사용. (추후 구현) */
export type { ImageExportOptions, ImageAssetExportItem } from '@/types/imageExport'

export { generateFileName, getBaseAltTextFromDisplayName } from '@/lib/imageNaming'
import { getBaseAltTextFromDisplayName } from '@/lib/imageNaming'
export type { ProjectDataForFileName } from '@/lib/imageNaming'

const BUCKET = 'construction-assets'

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

/**
 * 용도별 이미지 URL 반환
 * - marketing: Cloudinary 고화질/변환 URL (블로그용, 파라미터 포함)
 * - mobile: Supabase Storage 최적화 URL 또는 Cloudinary 저용량 URL
 */
export function getAssetUrl(
  asset: { cloudinaryPublicId: string; storagePath?: string | null },
  type: 'marketing' | 'mobile'
): string {
  if (type === 'marketing') {
    return buildCloudinaryUrl(asset.cloudinaryPublicId, 'marketing')
  }
  if (asset.storagePath && asset.storagePath.trim()) {
    return supabase.storage.from(BUCKET).getPublicUrl(asset.storagePath).data.publicUrl
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
