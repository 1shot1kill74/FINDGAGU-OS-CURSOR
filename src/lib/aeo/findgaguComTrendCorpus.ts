/**
 * www.findgagu.com 트랜드 분석 → AEO 인용용 코퍼스
 * Source: 공개 /forum/view/* (meta description 본문) · 수집 2026-08-02
 *
 * 용도:
 * - 공개 쇼룸 FAQ / featured answer 보강
 * - 사례 스튜디오 structured 필드 재활용
 * - 「가구업체 소개」류 답변엔진 슬롯용 팩트
 */

export type FindgaguComTrendFaq = {
  question: string
  answer: string
}

export type FindgaguComTrendEntry = {
  id: string
  url: string
  title: string
  /** 답변엔진용 핵심 답변 60~220자 */
  featuredAnswer: string
  faqs: FindgaguComTrendFaq[]
  /** 원문 키워드(사이트 meta) */
  keywords: string[]
}

const SHARED_KEYWORDS = [
  '관리형스터디카페가구',
  '관리형독서실가구',
  '스터디카페가구',
  '독서실책상',
  '파인드가구',
] as const

export const FINDGAGU_COM_TREND_CORPUS: FindgaguComTrendEntry[] = [
  {
    id: '1393916',
    url: 'https://www.findgagu.com/forum/view/1393916',
    title: '망해가는 스터디카페, 무조건 리모델링이 답일까? (현실적인 관리형 전환 & 엑시트 전략)',
    featuredAnswer:
      '일반 스터디카페는 공간 대여이고 관리형은 학습 성과 관리입니다. 가구만 바꾼다고 관리형이 되지 않으며, 상담실·테스트룸·관리 동선이 핵심입니다. 직접 운영이 어렵다면 관리형 인수가 가능한 하드웨어로 맞춰 매각 가치를 올리는 엑시트 리모델링이 대안입니다.',
    faqs: [
      {
        question: '매출이 안 나오는데 리모델링 투자를 해야 하나요?',
        answer:
          '무조건 리모델링을 하라는 뜻이 아닙니다. 입지와 조건이 맞아 투자 대비 효과가 확실한 매장에만 전환·리뉴얼을 제안합니다.',
      },
      {
        question: '리모델링하면 매출이 바로 오르나요?',
        answer:
          '시설만으로 끝나지 않고 관리자 역량과 시너지가 필요합니다. 매출 회복에는 보통 약 6개월이 걸리며, 차별화된 가구로 고정석 고객을 먼저 확보하는 것이 중요합니다.',
      },
      {
        question: '관리형 전환은 누구나 가능한가요?',
        answer:
          '아닙니다. 무인(오토) 운영을 원하면 관리형은 맞지 않습니다. 매출 상한은 높을 수 있지만 쉽게 돈을 버는 업이 아니며, 학원가 수요가 있는 입지에서 구조 문제가 매출을 막는 경우에 효과가 큽니다.',
      },
      {
        question: '일반 스터디카페와 관리형의 공간 차이는 무엇인가요?',
        answer:
          '일반 스카는 좌석·대여 중심이고, 관리형은 휴대폰 통제·상주 관리 등 학습 성과 관리가 본질입니다. 상담실·테스트룸·관리자 동선이 매출과 직결됩니다.',
      },
    ],
    keywords: [...SHARED_KEYWORDS],
  },
  {
    id: '847829',
    url: 'https://www.findgagu.com/forum/view/847829',
    title: '관리형 독서실 가구 디자인할 때 주의할 점',
    featuredAnswer:
      '관리형 독서실 가구는 모양 복제보다 타겟(재학생·재수생·성인) 분리가 먼저입니다. 이용 패턴·시간이 달라 레이아웃과 디자인을 맞춰야 하며, 남녀 분리·좌석 밀도·화장실·대기·스탠딩 공간까지 함께 봐야 이중 투자를 줄입니다.',
    faqs: [
      {
        question: '관리형 독서실 가구를 고를 때 가장 먼저 볼 것은?',
        answer:
          '타겟 고객이 재학생인지, 독학재수·관리형 독서실인지, 성인인지입니다. 결이 다른 고객을 한 디자인으로 섞으면 불편과 재투자가 생깁니다.',
      },
      {
        question: '관리형 독서실에서 남녀 분리는 어떻게 하나요?',
        answer:
          '독서실은 규정상 남녀 분리가 필요하고, 스터디카페는 규정이 달라도 여성 이용자가 쪽잠 등에서 시선을 부담스러워하는 경우가 있습니다. 공간 분리와 가구(파티션) 분리 중 면적에 맞는 방식을 고릅니다.',
      },
      {
        question: '좌석을 최대한 많이 넣는 게 좋을까요?',
        answer:
          '수익과 직결되지만 모든 현장에 해당하지는 않습니다. 타겟 고객·체류 시간·대기·스탠딩·화장실 동선을 본 뒤에 밀도를 정하는 것이 맞습니다.',
      },
    ],
    keywords: [...SHARED_KEYWORDS],
  },
  {
    id: '764452',
    url: 'https://www.findgagu.com/forum/view/764452',
    title: '관리형 독서실 및 스터디카페용 가구 올데이 시리즈 론칭합니다.',
    featuredAnswer:
      '파인드가구 올데이 시리즈는 관리형 독서실·관리형 스터디카페에 특화된 맞춤 학습 가구 라인입니다.',
    faqs: [
      {
        question: '올데이 시리즈는 어떤 공간용인가요?',
        answer:
          '관리형 독서실과 관리형 스터디카페처럼 장시간 몰입·수납·독립성이 필요한 학습 공간용으로 설계된 파인드가구 시리즈입니다.',
      },
    ],
    keywords: [...SHARED_KEYWORDS, '올데이'],
  },
  {
    id: '741503',
    url: 'https://www.findgagu.com/forum/view/741503',
    title: '스터디카페 인수할 때 절대 손해보지 않는 법',
    featuredAnswer:
      '스터디카페 인수는 입지·경쟁강도·내부 구조·인수가를 함께 봅니다. 4주권 약 8만 원대 지역은 경쟁이 과열인 경우가 많고, 책상 높이(예: 760mm는 여성 이용에 불리)·동선·프라이버시·의자까지 점검한 뒤 인수+리뉴얼(대략 1,000~3,000만 원대) 회수 기간을 계산해야 합니다.',
    faqs: [
      {
        question: '스터디카페 인수 시 입지에서 뭘 보나요?',
        answer:
          '관리 가능한 지역뿐 아니라 주변 스터디카페 수와 이용 단가를 봅니다. 4주권이 약 8만 원까지 떨어진 지역은 경쟁이 치열해 가격 정상화가 어렵습니다.',
      },
      {
        question: '인수 전 내부에서 꼭 확인할 항목은?',
        answer:
          '키오스크, 동선, 좌석 다양성, 소음존 분리, 책상 크기·높이, 프라이버시, 채광, 의자입니다. 책상 높이 760mm처럼 높은 상판은 키 작은 여성 이용자가 이탈하는 원인이 될 수 있습니다.',
      },
      {
        question: '인수 후 리뉴얼 비용은 어느 정도인가요?',
        answer:
          '부분·전체 리뉴얼에 따라 다르지만 철거·가구·전기·의자 등을 합치면 최소 약 1,000~3,000만 원대를 보는 경우가 많습니다. 인수가에 리뉴얼·홍보비를 더한 총투자로 회수 기간을 계산해야 합니다.',
      },
    ],
    keywords: [...SHARED_KEYWORDS],
  },
  {
    id: '739572',
    url: 'https://www.findgagu.com/forum/view/739572',
    title: '관리형 스터디카페 해도 될까요?',
    featuredAnswer:
      '관리형 스터디카페·관리형 독서실은 일반 스터디카페보다 독학재수학원에 가깝습니다. 교시제·휴대폰·순찰·수면·Q&A·안전에 더해 자체 콘텐츠(입시·면접 컨설팅 등)가 차별화 핵심이며, 학원 내부생과 외부인을 한 공간에 섞는 운영은 실패 사례가 많습니다.',
    faqs: [
      {
        question: '관리형 스터디카페는 누구나 창업할 수 있나요?',
        answer:
          '학원업 경험이 있는 쪽이 접근이 수월합니다. 일반 창업자가 무인 스터디카페 감각으로 접근하면 관리·인건비·콘텐츠 장벽에 막히기 쉽습니다.',
      },
      {
        question: '관리형 스터디카페의 기본 시스템은 무엇인가요?',
        answer:
          '교시제 학습, 휴대폰 관리, 상시 순찰, 수면 관리, 질문·답변, 안전관리가 흔히 말하는 여섯 가지입니다. 잘 되는 곳은 여기에 자체 콘텐츠(컨설팅 등)라는 일곱 번째 요소가 있습니다.',
      },
      {
        question: '관리형 요금제는 어떻게 나뉘나요?',
        answer:
          '기본(휴대폰·교시제·수면 등), 중간(진도·Q&A 추가), 고급(컨설팅·과외 연계)처럼 단계로 나누는 경우가 많고, 요금은 대치·분당·목동·지방 교육열 지역마다 수용 가능한 수준이 다릅니다.',
      },
      {
        question: '학원생과 외부인을 같이 받아도 되나요?',
        answer:
          '권장하지 않습니다. 외부인이 학원생 때문에 이탈하는 케이스가 많아, 수익형인지 마케팅(내부생)형인지 목적을 먼저 정하는 것이 맞습니다.',
      },
    ],
    keywords: [...SHARED_KEYWORDS],
  },
]

/** 코퍼스 FAQ를 질문 중복 없이 평탄화 (허브 JSON-LD·패널용) */
export function flattenFindgaguComTrendFaqs(limit = 12): FindgaguComTrendFaq[] {
  const seen = new Set<string>()
  const out: FindgaguComTrendFaq[] = []
  for (const entry of FINDGAGU_COM_TREND_CORPUS) {
    for (const faq of entry.faqs) {
      const key = faq.question.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(faq)
      if (out.length >= limit) return out
    }
  }
  return out
}

export function getFindgaguComTrendById(id: string): FindgaguComTrendEntry | undefined {
  return FINDGAGU_COM_TREND_CORPUS.find((e) => e.id === id)
}
