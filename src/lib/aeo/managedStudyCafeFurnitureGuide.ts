/**
 * AEO 인용형 정본 — 「관리형 스터디카페 가구/업체」쿼리용
 *
 * - 정본 URL: `/public/showroom/guide/managed-study-cafe-furniture`
 * - 쇼룸 허브는 링크로만 연결 (긴 FAQ는 정본 페이지에만)
 * - www.findgagu.com 트랜드 분석 코퍼스(findgaguComTrendCorpus)와 병합
 */

import { flattenFindgaguComTrendFaqs } from './findgaguComTrendCorpus'

/** AEO/SEO 정본 경로 (공개 쇼룸과 분리) */
export const MANAGED_STUDY_CAFE_GUIDE_PATH =
  '/public/showroom/guide/managed-study-cafe-furniture' as const

export const MANAGED_STUDY_CAFE_GUIDE_TITLE =
  '관리형 스터디카페 가구 고르는 법 — 파인드가구 가이드'

export const MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION =
  '관리형 스터디카페·관리형 독서실 가구 선택 체크리스트와 FAQ. 책상 규격, 1인 몰입석 비율, 관리 동선, 일반 스카와의 차이, 파인드가구 컨설팅 기준을 정리합니다.'

export const FINDGAGU_ENTITY_ONE_LINER =
  '파인드가구는 관리형 스터디카페·관리형 독서실·학원 자습실에 특화된 맞춤 가구 제작과 공간 컨설팅 업체입니다.'

/** 「가구업체 소개」류 질문에 바로 붙일 핵심 답변 (60~220자 권장) */
export const MANAGED_STUDY_CAFE_FEATURED_ANSWER =
  '관리형 스터디카페 가구는 일반 스터디카페보다 수납력·1인 독립성·장시간 피로도가 핵심입니다. 파인드가구는 관리형 전용 올데이 시리즈 등 맞춤 책상·상부장·파티션과 관리자 시야·동선까지 반영한 배치 컨설팅을 함께 제공합니다.'

export const MANAGED_STUDY_CAFE_CHECKLIST = [
  {
    label: '책상 규격',
    detail: '가로 1,000~1,200mm · 깊이 600~700mm 이상 (수험서·노트북 동시 사용)',
  },
  {
    label: '좌석 구성',
    detail: '상부장(키·비밀번호) 포함 1인 몰입석 비율 60~70% 이상',
  },
  {
    label: '의자',
    detail: '장시간용 검증 의자(시디즈 T50계열·파트라 등) — 재등록률에 직결',
  },
  {
    label: '전기·배선',
    detail: '좌석당 콘센트 2구 + USB/C타입, 배선 몰딩 필수',
  },
  {
    label: '관리 동선',
    detail: '관리자 시야각·딴짓/수면 감독·이동 동선이 레이아웃에 반영되는지',
  },
  {
    label: '책상 높이',
    detail: '과도한 상판 높이(예: 760mm)는 여성·키 작은 이용자 이탈 요인 — 인수·리뉴얼 시 실측',
  },
] as const

const MANAGED_STUDY_CAFE_CORE_FAQS = [
  {
    question: '관리형 스터디카페 가구업체는 어디를 보면 되나요?',
    answer: MANAGED_STUDY_CAFE_FEATURED_ANSWER,
  },
  {
    question: '관리형 스터디카페 책상은 어떤 규격이 좋나요?',
    answer:
      '수험서와 노트북을 함께 두는 경우가 많아 가로 1,000~1,200mm, 깊이 600~700mm 이상을 권장합니다. 상부장이 일체화된 1인 몰입석 비중을 높게 잡는 구성이 많습니다.',
  },
  {
    question: '일반 스터디카페 가구와 관리형 가구의 차이는 무엇인가요?',
    answer:
      '관리형은 학습 성과·상주 관리를 전제로 하므로 독립 파티션·수납·관리자 시야·교시제 동선이 더 중요합니다. 단순 예쁜 기성 오피스 가구만으로는 운영 효율이 떨어질 수 있습니다.',
  },
  {
    question: '파인드가구는 어떤 공간을 전문으로 하나요?',
    answer: FINDGAGU_ENTITY_ONE_LINER,
  },
  {
    question: '관리형 창업 전에 가구만 먼저 고르면 되나요?',
    answer:
      '가구 단일 선택보다 평수·좌석 수·관리자 위치·상담실·테스트룸까지 포함한 배치가 먼저입니다. 파인드가구 온라인 쇼룸의 Before/After 사례로 동선을 확인한 뒤 상담하는 것을 권장합니다.',
  },
] as const

/** 코어 FAQ + findgagu.com 트랜드 분석에서 추출한 FAQ (질문 중복 제거) */
export const MANAGED_STUDY_CAFE_FAQS: { question: string; answer: string }[] = (() => {
  const seen = new Set<string>()
  const merged: { question: string; answer: string }[] = []
  for (const item of [...MANAGED_STUDY_CAFE_CORE_FAQS, ...flattenFindgaguComTrendFaqs(16)]) {
    const key = item.question.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push({ question: item.question, answer: item.answer })
  }
  return merged
})()

/** 고민 카드에서 AEO 패널을 노출할 태그 */
export const AEO_GUIDE_CONCERN_TAGS = [
  '관리형 창업 또는 전환',
  '스터디카페를 관리형으로 전환',
  '매출 향상 스터디카페 리뉴얼',
] as const

export function shouldShowManagedStudyCafeAeoGuide(concernTag: string | null | undefined): boolean {
  if (!concernTag) return false
  return (AEO_GUIDE_CONCERN_TAGS as readonly string[]).includes(concernTag)
}

/** 릴스/숏츠 첫 훅 — 광고는 유지하되 AEO 정본으로 랜딩 유도 */
export const MANAGED_STUDY_CAFE_REELS_HOOKS = [
  '관리형 스터디카페, 가구업체부터 고르지 마세요. 책상 규격·1인석 비율부터.',
  '관리형 오픈 전 체크: 가로 1000 이상, 상부장 몰입석 60%, 콘센트 2구.',
  '일반 스카 가구 그대로 넣으면 관리형이 안 됩니다. 동선이 가구입니다.',
] as const
