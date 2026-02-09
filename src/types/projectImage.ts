/** project_images.usage_type — Cloudinary-Supabase 하이브리드 용도 구분 (DB는 영어 유지, 화면은 한글만) */
export const USAGE_TYPES = ['Marketing', 'Mobile_Only', 'Archive'] as const
export type UsageType = (typeof USAGE_TYPES)[number]

/** 화면 표시용 한글 라벨 (DB 값은 그대로 Marketing 등 사용) */
export const USAGE_TYPE_LABEL: Record<UsageType, string> = {
  Marketing: '영업용',
  Mobile_Only: '참고용',
  Archive: '보관용',
}

/** 용도별 툴팁 힌트 */
export const USAGE_TYPE_TOOLTIP: Record<UsageType, string> = {
  Marketing: '고객 공유용 A컷 · 전시관 노출',
  Mobile_Only: '현장 실사 B컷 · 디테일 확인',
  Archive: '증빙·기록 보관용',
}

export function getUsageLabel(usage: UsageType): string {
  return USAGE_TYPE_LABEL[usage] ?? usage
}

export function getUsageTooltip(usage: UsageType): string {
  return USAGE_TYPE_TOOLTIP[usage] ?? ''
}

/** project_images.status — 검수 프로세스 (pending=대기, approved=승인 후 뱅크 노출) */
export const REVIEW_STATUSES = ['pending', 'approved'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** project_images 테이블 Row (cloudinary_public_id Primary Reference) */
export interface ProjectImageRow {
  id: string
  cloudinary_public_id: string
  usage_type: UsageType
  /** generateFileName() 결과. 관리자 식별용 */
  display_name: string | null
  storage_path: string | null
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  view_count: number
  created_at: string
  /** 지능형 필터: 제품군별 */
  product_tags?: string[] | null
  /** 지능형 필터: 색상별 */
  color?: string | null
  /** 검수 상태: pending(대기), approved(승인) */
  status?: ReviewStatus
  /** 파일 SHA-256 해시; 중복 업로드 차단 */
  content_hash?: string | null
}

/** Cloudinary 연동 여부 — 자산 뷰어 Sync Status 표시용 */
export type SyncStatus = 'synced' | 'cloudinary_only' | 'storage_only' | 'missing'

/** 뷰어/서비스용 통합 자산 (URL 해석 + Sync Status) */
export interface ProjectImageAsset {
  id: string
  cloudinaryPublicId: string
  usageType: UsageType
  /** generateFileName() 결과. 파일명만 보고 어떤 사진인지 식별 */
  displayName: string | null
  /** marketing: Cloudinary 고화질 URL, mobile: Supabase 또는 Cloudinary 최적화 */
  url: string
  thumbnailUrl: string | null
  storagePath: string | null
  consultationId: string | null
  projectTitle: string | null
  industry: string | null
  viewCount: number
  createdAt: string
  syncStatus: SyncStatus
  /** 지능형 필터: 제품군별 */
  productTags?: string[] | null
  /** 지능형 필터: 색상별 */
  color?: string | null
  /** 검수 상태: pending(대기), approved(승인) — 시공 사례 뱅크는 approved만 노출 */
  status?: ReviewStatus
  contentHash?: string | null
}
