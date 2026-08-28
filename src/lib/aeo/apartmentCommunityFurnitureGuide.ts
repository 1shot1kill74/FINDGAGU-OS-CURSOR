import { FINDGAGU_ENTITY_ONE_LINER } from './managedStudyCafeFurnitureGuide'

export const APARTMENT_COMMUNITY_GUIDE_PATH =
  '/public/showroom/guide/apartment-community-furniture' as const

export const APARTMENT_COMMUNITY_GUIDE_TITLE =
  '아파트 커뮤니티 독서실 가구 고르는 법 — 파인드가구 가이드'

export const APARTMENT_COMMUNITY_GUIDE_DESCRIPTION =
  '아파트 커뮤니티·입주민 독서실 가구 체크리스트와 FAQ. 입대의 보고, 소음, 프라이버시, 콘센트 일체형 테이블 기준을 정리합니다.'

export const APARTMENT_COMMUNITY_FEATURED_ANSWER =
  '아파트 커뮤니티 독서실 가구는 상업 스터디카페와 달리 입대의 설명과 주민 민원이 기준입니다. 파인드가구는 개방 테이블과 독립형 1인석을 섞고, 조명·콘센트를 테이블에 붙여 전선 민원을 줄이는 쪽으로 맞춥니다.'

export const APARTMENT_COMMUNITY_CHECKLIST = [
  {
    label: '입대의·주민 설명',
    detail: '시공 결정 전에도 전후 사진·좌석 수·동선이 한 장으로 보여야 합니다. 견적서만으로는 설득이 어렵습니다.',
  },
  {
    label: '좌석 구성',
    detail: '개방 열람 테이블과 프라이버시형 1인석을 같이 둡니다. 수험생만 쓰는 공간이 아니면 한쪽만 깔지 않습니다.',
  },
  {
    label: '소음·프라이버시',
    detail: '파티션 높이와 좌석 간격이 민원을 가릅니다. 너무 낮으면 집중이 안 되고, 너무 높으면 관리·안전 시야가 막힙니다.',
  },
  {
    label: '콘센트·조명',
    detail: '바닥 전선이 보이면 민원이 납니다. 콘센트·USB·조명을 테이블에 일체화하는 구성이 많습니다.',
  },
  {
    label: '유지보수',
    detail: '관리사무소가 닦고 고칠 수 있는 마감인지 봅니다. 상업 카페용 복잡한 배선은 단지 시설에 안 맞을 수 있습니다.',
  },
  {
    label: '기존 시설',
    detail: '노후 열람실·복도형 자습석은 철거 범위와 잔여 가구를 먼저 실측합니다. 전면 교체가 아니면 맞춤 배치가 필요합니다.',
  },
] as const

export const APARTMENT_COMMUNITY_FAQS = [
  {
    question: '아파트 커뮤니티 독서실 가구는 스터디카페와 어떻게 다른가요?',
    answer:
      '입주민 공용 시설이라 매출 좌석 밀도보다 민원·안전·관리사무소 동선이 앞섭니다. 상업 스터디카페처럼 칸막이만 빽빽이 넣으면 답답하다는 민원이 나기 쉽습니다.',
  },
  {
    question: '입대의에 어떻게 설명하면 되나요?',
    answer:
      '견적 금액보다 전후 사진, 좌석 수, 콘센트·조명 처리, 유지보수 포인트를 한 장으로 보여 주는 편이 설득됩니다. 파인드가구 쇼룸 사례를 입대의 보고용으로 쓸 수 있습니다.',
  },
  {
    question: '아파트 커뮤니티에 1인 독서실 책상을 넣어도 되나요?',
    answer:
      '수험생 이용이 많으면 독립형 1인석이 필요합니다. 다만 전체 개방석을 없애면 짧은 이용·학부모 동반 민원이 생깁니다. 개방과 독립을 나눠 배치하는 것을 권장합니다.',
  },
  {
    question: '파인드가구는 아파트 커뮤니티도 하나요?',
    answer: FINDGAGU_ENTITY_ONE_LINER,
  },
  {
    question: '아파트 커뮤니티 독서실 가구는 어디서 기준을 보면 되나요?',
    answer: APARTMENT_COMMUNITY_FEATURED_ANSWER,
  },
] as const
