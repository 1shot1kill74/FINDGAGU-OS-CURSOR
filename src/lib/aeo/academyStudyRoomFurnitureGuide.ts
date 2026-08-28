import { FINDGAGU_ENTITY_ONE_LINER } from './managedStudyCafeFurnitureGuide'

export const ACADEMY_STUDY_ROOM_GUIDE_PATH =
  '/public/showroom/guide/academy-study-room-furniture' as const

export const ACADEMY_STUDY_ROOM_GUIDE_TITLE =
  '학원 자습실 가구 고르는 법 — 파인드가구 가이드'

export const ACADEMY_STUDY_ROOM_GUIDE_DESCRIPTION =
  '학원 자습실·고교학점제 학습공간 가구 체크리스트와 FAQ. 감독 시야, 좌석 밀도, 콘센트, 칸막이, 독서실형 책상 기준을 정리합니다.'

export const ACADEMY_STUDY_ROOM_FEATURED_ANSWER =
  '학원 자습실 가구는 예쁜 인테리어보다 감독 시야와 좌석당 집중 환경이 먼저입니다. 파인드가구는 학원 평수에 맞춰 개방 열람석과 1인 칸막이 좌석을 나누고, 콘센트·배선·사물함을 한 레이아웃으로 맞춥니다.'

export const ACADEMY_STUDY_ROOM_CHECKLIST = [
  {
    label: '감독 시야',
    detail: '강사·관리자 자리에서 열람석 대부분이 보이는지. 기둥·높은 파티션이 사각을 만들면 운영이 어려워집니다.',
  },
  {
    label: '좌석 구성',
    detail: '개방 열람석과 1인 칸막이 좌석을 함께 둡니다. 자습 위주 학원은 칸막이 비중을 더 높게 잡는 경우가 많습니다.',
  },
  {
    label: '책상 규격',
    detail: '교재·필기·태블릿을 같이 쓰는 좌석은 가로 1,000mm 전후, 깊이 600mm 이상을 권장합니다.',
  },
  {
    label: '전기·배선',
    detail: '좌석당 콘센트와 USB를 넣고 전선은 몰딩으로 숨깁니다. 창가·복도형 자습실은 매립 콘센트가 민원을 줄입니다.',
  },
  {
    label: '사물함·동선',
    detail: '입실·퇴실이 겹치는 시간에 복도가 막히지 않게 사물함과 자습석을 분리합니다.',
  },
  {
    label: '고교학점제·다목적실',
    detail: '일반 자습과 시청각·모둠 수업을 같이 쓰면 고정 1인석만 깔지 말고 가변 배치를 남깁니다.',
  },
] as const

export const ACADEMY_STUDY_ROOM_FAQS = [
  {
    question: '학원 자습실 가구는 스터디카페와 어떻게 다른가요?',
    answer:
      '학원 자습실은 수강생 관리와 수업 동선이 같이 갑니다. 스터디카페보다 감독 시야·등하원 동선·사물함 위치가 중요하고, 카페형 개방석만 넣으면 집중도가 떨어질 수 있습니다.',
  },
  {
    question: '학원 자습실 책상은 어떤 규격이 좋나요?',
    answer:
      '수험서와 필기를 펼치는 좌석은 가로 1,000mm 전후, 깊이 600mm 이상을 권장합니다. 창가 데드 스페이스는 기성 규격보다 현장 실측 맞춤이 좌석 수를 더 확보하는 경우가 많습니다.',
  },
  {
    question: '고교학점제 공간에도 같은 가구를 넣으면 되나요?',
    answer:
      '고정 1인 독서실 책상만 깔면 모둠·시청각 수업이 막힙니다. 자습 블록과 가변 수업 블록을 나누고, 콘센트와 이동 동선을 같이 설계하는 편이 안전합니다.',
  },
  {
    question: '파인드가구는 학원 자습실도 하나요?',
    answer: FINDGAGU_ENTITY_ONE_LINER,
  },
  {
    question: '학원 자습실 가구는 어디서 기준을 보면 되나요?',
    answer: ACADEMY_STUDY_ROOM_FEATURED_ANSWER,
  },
] as const
