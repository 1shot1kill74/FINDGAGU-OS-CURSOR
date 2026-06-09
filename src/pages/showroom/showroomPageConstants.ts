export const INDUSTRY_PREFERRED_ORDER = ['관리형', '학원', '스터디카페', '학교', '아파트', '기타'] as const
export const INDUSTRY_PAGE_SIZE = 6
export const SWIPE_THRESHOLD_PX = 50

/** 제품별 보기 — 시리즈 표시 순서 및 한 줄 설명 */
export const SHOWROOM_PRODUCT_SERIES = [
  { seriesName: '올데이', description: '관리형/러셀형책상' },
  { seriesName: '스마트', description: '스터디카페형 칸막이 책상' },
  { seriesName: '클래식', description: '낮은칸막이 책상' },
  { seriesName: '베이직', description: '학원 인강·개인자습용 책상' },
  { seriesName: '프라이버시', description: '독서실형 높은칸막이 책상' },
  { seriesName: '커뮤니티', description: '스터디카페형 대형책상' },
  { seriesName: '심플', description: '유리칸막이 책상' },
  { seriesName: '어드밴스', description: '연장형 유리칸막이 책상' },
  { seriesName: '스퀘어', description: '사다리꼴 유리칸막이 책상' },
  { seriesName: '와이드', description: '확장형 강의실 책상' },
  { seriesName: '아카데미', description: '반박스형 낮은 칸막이 책상' },
  { seriesName: '기타', description: '' },
] as const

export const SHOWROOM_PRODUCT_SERIES_ORDER = SHOWROOM_PRODUCT_SERIES.map((item) => item.seriesName)

export function getShowroomProductSeriesDescription(seriesName: string): string | null {
  const match = SHOWROOM_PRODUCT_SERIES.find((item) => item.seriesName === seriesName)
  if (!match?.description) return null
  return match.description
}

export function formatShowroomProductSeriesOptionLabel(seriesName: string): string {
  const description = getShowroomProductSeriesDescription(seriesName)
  return description ? `${seriesName} — ${description}` : seriesName
}

export function getShowroomProductSeriesSortIndex(seriesName: string): number {
  const index = SHOWROOM_PRODUCT_SERIES_ORDER.indexOf(seriesName as (typeof SHOWROOM_PRODUCT_SERIES_ORDER)[number])
  if (index >= 0) return index
  const etcIndex = SHOWROOM_PRODUCT_SERIES_ORDER.indexOf('기타')
  return etcIndex >= 0 ? etcIndex : SHOWROOM_PRODUCT_SERIES_ORDER.length
}

export function compareShowroomProductSeriesNames(a: string, b: string): number {
  const indexDiff = getShowroomProductSeriesSortIndex(a) - getShowroomProductSeriesSortIndex(b)
  if (indexDiff !== 0) return indexDiff
  return a.localeCompare(b, 'ko')
}

/** 말풍선 문구에서 하이라이트할 핵심 단어 (주황/브랜드 강조색) */
export const HIGHLIGHT_KEYWORDS = ['실패', '매출', '디테일', '통제력', '점유율', '프리미엄', '원스톱', '품격', '인건비']

/** 전문가가 먼저 질문하는 형태의 공감 카드: 필터 태그 + 업종 키워드 + 말풍선 메시지 */
export const CONCERN_CARDS: { tag: string; industryFilter: string; emoji: string; message: string; imageSrc?: string }[] = [
  { tag: '관리형 창업 또는 전환', industryFilter: '관리형', emoji: '💼', message: '관리형 오픈한다고 만석이 되는 시기는 끝났습니다. 수익률을 가르는 건 화려함이 아니라, \'실패 없는 관리 동선\'의 디테일입니다. 확인해 보시겠습니까? 📋', imageSrc: '/showroom-concern-management.png' },
  { tag: '스터디카페를 관리형으로 전환', industryFilter: '관리형전환', emoji: '🎯', message: '기존 스터디카페 운영을 그대로 두기엔 경쟁이 어렵습니다. 관리형 구조로 전환하면 차별화와 엑시트 전략까지 함께 준비할 수 있습니다. 🧭' },
  { tag: '스터디카페 같은 학원 자습실', industryFilter: '학원', emoji: '😭', message: '공간만 만든다고 애들이 남을까요? 스터디카페로 유출되는 아이들을 붙잡는 건 \'공부하고 싶게 만드는\' 한 끗 차이의 가구 배치입니다. 🏫', imageSrc: '/showroom-concern-academy-study.png' },
  { tag: '고교학점제 자습공간 구축', industryFilter: '학교', emoji: '📚', message: '고교학점제 교실 리뉴얼 고민 중이신가요? 실제 교육 현장에서 아이들의 학습 몰입도가 검증된 \'성공적인 학교 공간\'의 표준을 제안드립니다.', imageSrc: '/showroom-concern-highschool-credit.png' },
  { tag: '아파트 독서실 리뉴얼', industryFilter: '아파트', emoji: '🏠', message: '입주민들이 찾지 않는 무늬만 독서실인가요? 우리 아파트 가치를 높이고 아이들이 먼저 찾는 \'성공적인 커뮤니티\'의 디테일을 담았습니다. ✨', imageSrc: '/showroom-concern-apartment-reading.png' },
  { tag: '매출 향상 스터디카페 리뉴얼', industryFilter: '스터디카페', emoji: '📈', message: '무작정 예쁘게만 바꾼다고 매출이 오를까요? 잘되는 곳은 \'좌석 회전율\'을 설계합니다. 매출이 좋은 곳들은 그 디테일이 다릅니다. 📈', imageSrc: '/showroom-concern-studycafe-sales.png' },
]

/** 고민 카드별 Before/After 지정 성공사례 (공개 표시명·프로젝트 코드로 매칭) */
export const CONCERN_FEATURED_BEFORE_AFTER_SITES: Record<string, readonly string[]> = {
  '스터디카페를 관리형으로 전환': [
    '2505 경기권 관리형 6888',
    '2512 전북권 관리형 8450',
  ],
}
