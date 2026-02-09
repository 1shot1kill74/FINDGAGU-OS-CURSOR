/**
 * 시공 사진 파일명 생성 규칙 (비즈니스 규칙)
 * 형식: [인입날짜(YYMMDD)]_[업체명]_[공간구분]_[순번]
 * 예: 260206_목동학원_강의실_01
 * - 공백 → 언더스코어, 한글 포함 가능 (Cloudinary public_id는 UTF-8 지원)
 */
export interface ProjectDataForFileName {
  /** 인입/촬영일 YYYY-MM-DD (없으면 당일) */
  inboundDate?: string
  /** 업체/프로젝트명 */
  companyName: string
  /** 공간 구분 (예: 강의실, 카운터, 독서실) */
  spaceType: string
}

const SPACE_REPLACE = /[\s]+/g

function toYymmdd(dateStr: string | undefined): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date()
    return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  }
  const [y, m, d] = dateStr.split('-')
  return `${y.slice(-2)}${m}${d}`
}

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(SPACE_REPLACE, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || '미지정'
}

/**
 * 시공 사진용 파일명(및 Cloudinary public_id) 생성
 * @param projectData 인입일, 업체명, 공간구분
 * @param index 순번 (1-based, 01, 02, ...)
 * @returns 예: 260206_목동학원_강의실_01 (공백→_, 한글 유지)
 */
export function generateFileName(
  projectData: ProjectDataForFileName,
  index: number
): string {
  const yymmdd = toYymmdd(projectData.inboundDate)
  const company = normalizeSegment(projectData.companyName || '업체명없음')
  const space = normalizeSegment(projectData.spaceType || '공간미지정')
  const seq = String(Math.max(1, Math.floor(index))).padStart(2, '0')
  return `${yymmdd}_${company}_${space}_${seq}`
}

/**
 * display_name(또는 public_id)에서 base_alt_text 도출 — {date}_{company}_{space} 포맷.
 * 싱글 소스: display_name 한 곳만 수정하면 파일명·알트 텍스트가 동기화됨.
 * 순번(_01, _02)을 제거한 접두어를 반환하여, 외부 AI가 보강 시 이 값을 접두어로 사용.
 */
export function getBaseAltTextFromDisplayName(displayNameOrPublicId: string): string {
  const s = displayNameOrPublicId.trim()
  if (!s) return s
  const withoutSeq = s.replace(/_\d{2}$/, '')
  return withoutSeq !== s ? withoutSeq : s
}
