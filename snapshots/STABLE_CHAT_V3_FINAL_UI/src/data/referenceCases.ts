/**
 * reference_cases + project_images 관계형 구조 지원
 * industry 컬럼: 아래 6가지 표준 태그만 허용 (DB 제약 권장)
 */
export type IndustryTag = '학원' | '관리형' | '스터디카페' | '학교' | '아파트' | '기타'

export interface ReferenceCase {
  id: string
  title: string
  /** 표준 6가지 중 하나 */
  industry: IndustryTag
  space_size: number
  images: string[]
  items_used: string[]
}

export interface ProjectImageRow {
  project_id: string
  image_url: string
  sort_order: number
}

/** 업종 필터: 전체 + 표준 6가지 (학교 등 파편화된 분류 통합) */
export const INDUSTRY_OPTIONS = [
  { value: '전체', label: '전체' },
  { value: '학원', label: '학원' },
  { value: '관리형', label: '관리형' },
  { value: '스터디카페', label: '스터디카페' },
  { value: '학교', label: '학교' },
  { value: '아파트', label: '아파트' },
  { value: '기타', label: '기타' },
] as const

/** 상담 등록 폼용 업종 옵션 (전체 제외, 6가지 표준 분류) — metadata.industry 저장값과 동일 */
export const CONSULTATION_INDUSTRY_OPTIONS: { value: IndustryTag; label: string }[] = [
  { value: '학원', label: '학원' },
  { value: '관리형', label: '관리형' },
  { value: '스터디카페', label: '스터디카페' },
  { value: '학교', label: '학교' },
  { value: '아파트', label: '아파트' },
  { value: '기타', label: '기타' },
]

/** 검색 확장: 사용자 입력(예: 대학교) → 해당 업종(학교) 결과 포함 */
export const INDUSTRY_SEARCH_KEYWORDS: Record<IndustryTag, string[]> = {
  학교: ['학교', '대학교', '초등학교', '중학교', '고등학교', '초등', '중등', '고등', '초중고', '대학'],
  학원: ['학원', '입시', '독서실', '교습소'],
  스터디카페: ['스터디카페', '스터디', '카페', '공부카페'],
  관리형: ['관리형', '오피스', '사무실', '회의실'],
  아파트: ['아파트', '아파트형', '주거'],
  기타: ['기타', '식당', '음식점', '매장'],
}

export const SPACE_SIZE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'under10', label: '10평 미만' },
  { value: '20s', label: '20평대' },
  { value: '30s', label: '30평대' },
  { value: '50plus', label: '50평 이상' },
] as const

/** Mock: industry는 표준 6가지만 사용 */
export const MOCK_REFERENCE_CASES: ReferenceCase[] = [
  { id: '1', title: '강남 스터디카페 카운터·테이블', industry: '스터디카페', space_size: 15, images: ['https://picsum.photos/320/200?random=1', 'https://picsum.photos/320/200?random=1b', 'https://picsum.photos/320/200?random=1c'], items_used: ['카운터', '테이블', '의자'] },
  { id: '2', title: '역삼 오피스 책상 50조', industry: '관리형', space_size: 55, images: ['https://picsum.photos/320/200?random=2', 'https://picsum.photos/320/200?random=2b'], items_used: ['책상', '서랍장', '의자'] },
  { id: '3', title: '방배 학원 교탁·책걸상', industry: '학원', space_size: 28, images: ['https://picsum.photos/320/200?random=3', 'https://picsum.photos/320/200?random=3b', 'https://picsum.photos/320/200?random=3c', 'https://picsum.photos/320/200?random=3d'], items_used: ['교탁', '책걸상', '책장'] },
  { id: '4', title: '홍대 대학교 학생라운지', industry: '학교', space_size: 22, images: ['https://picsum.photos/320/200?random=4', 'https://picsum.photos/320/200?random=4b'], items_used: ['바테이블', '의자'] },
  { id: '5', title: '서초 스터디카페 야외 테라스', industry: '스터디카페', space_size: 8, images: ['https://picsum.photos/320/200?random=5'], items_used: ['테이블', '파라솔'] },
  { id: '6', title: '판교 오피스 미팅룸', industry: '관리형', space_size: 35, images: ['https://picsum.photos/320/200?random=6', 'https://picsum.photos/320/200?random=6b', 'https://picsum.photos/320/200?random=6c'], items_used: ['회의테이블', '의자'] },
  { id: '7', title: '대치 입시학원 독서실', industry: '학원', space_size: 48, images: ['https://picsum.photos/320/200?random=7', 'https://picsum.photos/320/200?random=7b'], items_used: ['책상', '책장', '파티션'] },
  { id: '8', title: '이태원 아파트 홈오피스', industry: '아파트', space_size: 18, images: ['https://picsum.photos/320/200?random=8', 'https://picsum.photos/320/200?random=8b', 'https://picsum.photos/320/200?random=8c'], items_used: ['책상', '선반'] },
  { id: '9', title: '성수 스터디카페 브루잉 스페이스', industry: '스터디카페', space_size: 32, images: ['https://picsum.photos/320/200?random=9', 'https://picsum.photos/320/200?random=9b'], items_used: ['카운터', '선반', '테이블'] },
  { id: '10', title: '여의도 오피스 80평', industry: '관리형', space_size: 80, images: ['https://picsum.photos/320/200?random=10', 'https://picsum.photos/320/200?random=10b', 'https://picsum.photos/320/200?random=10c', 'https://picsum.photos/320/200?random=10d'], items_used: ['책상', '회의테이블', '수납장'] },
  { id: '11', title: '서울대학교 도서관 리모델링', industry: '학교', space_size: 120, images: ['https://picsum.photos/320/200?random=11'], items_used: ['책상', '책장', '파티션'] },
  { id: '12', title: '강남 아파트 거실 인테리어', industry: '아파트', space_size: 25, images: ['https://picsum.photos/320/200?random=12', 'https://picsum.photos/320/200?random=12b'], items_used: ['TV장', '소파'] },
]
