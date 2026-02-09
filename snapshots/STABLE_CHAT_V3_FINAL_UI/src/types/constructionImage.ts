/** 시공 이미지 photo_type (업로드 폼·표시용) */
export const PHOTO_TYPES = ['전경', '디테일', '가구 위주'] as const
export type PhotoType = (typeof PHOTO_TYPES)[number]

/** construction_images 테이블 Row (Supabase) */
export interface ConstructionImageRow {
  id: string
  storage_path: string
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  is_marketing_ready: boolean
  photo_type: PhotoType | null
  view_count: number
  created_at: string
}

/** 갤러리/뷰어용 플랫 이미지 아이템 (URL 해석 후) */
export interface ConstructionImageAsset {
  id: string
  url: string
  thumbnailUrl: string | null
  consultationId: string | null
  projectTitle: string | null
  industry: string | null
  isMarketingReady: boolean
  photoType: PhotoType | null
  viewCount: number
  createdAt: string
}
