/**
 * 앱 전역 상수 — 매직 스트링·중복 리터럴의 단일 소스.
 * Phase 2: ConsultationManagement.tsx의 인라인 select 문자열을 이 파일로 이전 예정.
 */

// ─── Cloudinary ───────────────────────────────────────────────────────────────

/** 시공 사례 이미지의 Cloudinary 업로드 폴더 경로 */
export const CLOUDINARY_UPLOAD_FOLDER = 'assets/projects'

/**
 * 관리자 목록 썸네일 변환 파라미터 (w_800 리사이즈 + 보정·포맷 최적화).
 * imageAssetUploadService.ts 와 imageAssetService.ts 에서 공통 사용.
 */
export const CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS = 'w_800,c_scale,e_improve,e_sharpen,f_auto,q_auto'

// ─── Supabase SELECT 컬럼 목록 ──────────────────────────────────────────────
// 현재 ConsultationManagement.tsx에 인라인으로 반복 정의되어 있음.
// Phase 2에서 해당 파일의 .select() 호출에 아래 상수를 적용 예정.

/** estimates 행 조회 공통 컬럼 목록 */
export const ESTIMATES_SELECT_COLUMNS =
  'id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at'

/** consultation_estimate_files 행 조회 공통 컬럼 목록 */
export const ESTIMATE_FILES_SELECT_COLUMNS =
  'id, consultation_id, project_name, storage_path, file_name, file_type, created_at, upload_type, quote_date'
