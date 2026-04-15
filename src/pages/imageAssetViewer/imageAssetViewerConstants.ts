import type { SyncStatus } from '@/types/projectImage'

/** 자주 쓰는 색상 퀵 태깅 */
export const COLOR_QUICK = ['화이트', '오크', '블랙', '그레이', '네이비', '월넛'] as const
export const SWIPE_THRESHOLD_PX = 50

/** 업종 인라인 편집 기본 옵션 */
export const SECTOR_OPTIONS = ['학원', '관리형', '스터디카페', '학교', '아파트', '기타'] as const

export const BUCKET = 'construction-assets'
export const PAGE_SIZE = 24

export const SYNC_LABEL: Record<SyncStatus, string> = {
  synced: 'Cloudinary 연동',
  cloudinary_only: 'Cloudinary만',
  storage_only: 'Storage만',
  missing: '미연동',
}
