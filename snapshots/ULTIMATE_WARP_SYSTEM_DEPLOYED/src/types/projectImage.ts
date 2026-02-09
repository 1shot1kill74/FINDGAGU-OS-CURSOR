/** project_images.usage_type — Cloudinary-Supabase 하이브리드 용도 구분 */
export const USAGE_TYPES = ['Marketing', 'Mobile_Only', 'Archive'] as const
export type UsageType = (typeof USAGE_TYPES)[number]

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
}
