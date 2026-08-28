import { FINDGAGU_ENTITY_ONE_LINER } from './managedStudyCafeFurnitureGuide'

export const MANAGED_READING_ROOM_GUIDE_PATH =
  '/public/showroom/guide/managed-reading-room-furniture' as const

export const MANAGED_READING_ROOM_GUIDE_TITLE =
  '관리형 독서실 가구 고르는 법 — 파인드가구 가이드'

export const MANAGED_READING_ROOM_GUIDE_DESCRIPTION =
  '관리형 독서실·독학관 가구 체크리스트와 FAQ. 장시간 좌석, 사물함, 교시 동선, 관리자 시야, 1인 몰입석 기준을 정리합니다.'

export const MANAGED_READING_ROOM_FEATURED_ANSWER =
  '관리형 독서실 가구는 카페형 개방석보다 장시간 1인 몰입과 사물함·교시 동선이 핵심입니다. 파인드가구는 상부장 일체형 좌석 비중을 높게 잡고, 관리자가 딴짓·수면을 볼 수 있는 시야와 이동 동선까지 같이 맞춥니다.'

export const MANAGED_READING_ROOM_CHECKLIST = [
  {
    label: '1인 몰입석',
    detail: '상부장(키·비밀번호) 포함 1인석 비중을 스터디카페보다 높게 잡습니다. 장시간 수험이 목적인 공간이 많습니다.',
  },
  {
    label: '책상 규격',
    detail: '가로 1,000~1,200mm · 깊이 600~700mm 이상. 수험서 여러 권과 노트북을 같이 두는 좌석이 기본입니다.',
  },
  {
    label: '의자',
    detail: '하루 8시간 이상 앉는 전제입니다. 장시간용으로 검증된 의자가 재등록에 직접 영향을 줍니다.',
  },
  {
    label: '사물함·교시',
    detail: '교시 교체 때 복도가 막히지 않게 사물함과 좌석을 분리하고, 개인 짐을 좌석에 쌓지 않게 합니다.',
  },
  {
    label: '관리 시야',
    detail: '관리자 자리에서 수면·휴대폰 사용이 보이는지 확인합니다. 완전 밀폐형만 깔면 관리형이 성립하지 않습니다.',
  },
  {
    label: '조명·피로',
    detail: '균일한 조도와 눈부심이 없는 상판이 이탈을 줄입니다. 과도한 상판 높이(예: 760mm)는 실측 후 조정합니다.',
  },
] as const

export const MANAGED_READING_ROOM_FAQS = [
  {
    question: '관리형 독서실과 관리형 스터디카페 가구는 다른가요?',
    answer:
      '둘 다 관리 시야가 필요하지만, 독서실·독학관은 체류 시간이 더 길고 사물함·교시 동선 비중이 큽니다. 카페형 개방석 위주 구성은 관리형 독서실에 잘 안 맞습니다.',
  },
  {
    question: '관리형 독서실 책상은 어떤 규격이 좋나요?',
    answer:
      '수험서와 노트북을 함께 두는 좌석은 가로 1,000~1,200mm, 깊이 600~700mm 이상을 권장합니다. 상부장이 붙은 1인 몰입석 비중을 높게 잡는 구성이 많습니다.',
  },
  {
    question: '기존 독서실을 관리형으로 바꿀 때 가구만 교체하면 되나요?',
    answer:
      '가구만 바꾸면 시야와 동선이 그대로인 경우가 많습니다. 관리자 위치, 사물함, 교시 이동부터 다시 보고 좌석 형태를 정하는 편이 안전합니다.',
  },
  {
    question: '파인드가구는 관리형 독서실도 하나요?',
    answer: FINDGAGU_ENTITY_ONE_LINER,
  },
  {
    question: '관리형 독서실 가구는 어디서 기준을 보면 되나요?',
    answer: MANAGED_READING_ROOM_FEATURED_ANSWER,
  },
] as const
