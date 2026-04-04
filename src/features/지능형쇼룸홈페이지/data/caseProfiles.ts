export interface ShowroomCaseProfile {
  seatCountBand: string
  seatCountNote: string
  areaPyeongBand: string
  budgetBand: string
  painPoint: string
  solutionPoint: string
  operatorReview: string
  recommendedFor: string
  channelFollowupSummary: string
  channelFollowupPrompt: string
}

export type CaseProfilePreset = Omit<ShowroomCaseProfile, 'channelFollowupSummary' | 'channelFollowupPrompt'>

export const INDUSTRY_PRESETS: Record<string, CaseProfilePreset> = {
  관리형: {
    seatCountBand: '40~80석',
    seatCountNote: '운영 효율과 좌석 밀도를 함께 본 관리형 기준입니다.',
    areaPyeongBand: '30~60평',
    budgetBand: '중상 예산대',
    painPoint: '관리 동선이 꼬이고, 좌석 구성이 애매해 보이는 것이 가장 큰 고민이었습니다.',
    solutionPoint: '좌석 존 분리와 시선 정돈, 운영 동선 정리로 관리형다운 인상을 먼저 만들었습니다.',
    operatorReview: '공간 설명이 쉬워지고, 관리 포인트가 정리돼 상담 전환이 더 자연스러워졌다는 반응이 많았습니다.',
    recommendedFor: '관리형 창업, 스터디카페에서 관리형 전환, 프리미엄 자습실 기획',
  },
  학원: {
    seatCountBand: '30~70석',
    seatCountNote: '수업실보다 자습실 완성도가 중요한 학원 자습 환경 기준입니다.',
    areaPyeongBand: '20~45평',
    budgetBand: '중간 예산대',
    painPoint: '학생 몰입감이 약하고, 기존 자습실이 학원다운 장점 없이 평범해 보이는 문제가 있었습니다.',
    solutionPoint: '집중 좌석과 오픈 좌석을 나누고, 학습 흐름이 보이는 톤으로 공간을 정리했습니다.',
    operatorReview: '학부모 설명이 쉬워지고, 자습실 경쟁력이 한눈에 보인다는 피드백이 많았습니다.',
    recommendedFor: '학원 자습실 신설, 기존 자습실 리뉴얼, 프리미엄 학습 공간 강화',
  },
  스터디카페: {
    seatCountBand: '50~100석',
    seatCountNote: '회전율과 체류 만족도를 함께 고려한 기준입니다.',
    areaPyeongBand: '35~70평',
    budgetBand: '중상 예산대',
    painPoint: '예쁘기만 하고 차별점이 부족해, 경쟁 매장과 비교될 때 설득 포인트가 약했습니다.',
    solutionPoint: '좌석 유형을 명확히 나누고, 집중감이 드러나는 분위기로 리뉴얼 포인트를 만들었습니다.',
    operatorReview: '리뉴얼 이유를 사진으로 설명하기 쉬워지고, 방문 상담 때 반응이 빨라졌다는 평가가 있었습니다.',
    recommendedFor: '스터디카페 리뉴얼, 관리형 스타일 전환, 상권 내 차별화가 필요한 현장',
  },
  학교: {
    seatCountBand: '25~60석',
    seatCountNote: '공공 공간 특성상 규격과 운영 기준을 함께 보는 유형입니다.',
    areaPyeongBand: '25~50평',
    budgetBand: '프로젝트 예산형',
    painPoint: '예산 안에서 공공성, 내구성, 학습 몰입을 동시에 맞춰야 하는 점이 가장 어려웠습니다.',
    solutionPoint: '기본 규격 안정성과 공간 톤 정리를 함께 잡아 교육 현장에 맞는 설득 포인트를 만들었습니다.',
    operatorReview: '학교 담당자 입장에서 규격과 분위기를 함께 설명할 수 있어 제안서 설득이 쉬워졌습니다.',
    recommendedFor: '학교 자습공간, 고교학점제 공간, 공공 학습 라운지 구축',
  },
  아파트: {
    seatCountBand: '20~50석',
    seatCountNote: '커뮤니티 시설 특성상 체류 만족과 유지 관리 기준을 함께 봅니다.',
    areaPyeongBand: '15~35평',
    budgetBand: '중간 예산대',
    painPoint: '기존 시설이 노후돼 보이거나 입주민이 잘 찾지 않는 공간으로 인식되는 문제가 있었습니다.',
    solutionPoint: '커뮤니티 공간다운 밝기와 정돈감을 살리고, 이용 장면이 바로 상상되는 구성을 만들었습니다.',
    operatorReview: '입주민 설명 자료로 쓰기 좋고, 리뉴얼 필요성을 주민에게 보여주기 편했다는 반응이 있었습니다.',
    recommendedFor: '아파트 독서실 리뉴얼, 커뮤니티 라운지 개선, 입주민 만족도 제고',
  },
  기타: {
    seatCountBand: '규모별 맞춤',
    seatCountNote: '정확한 규모는 현장 조건과 운영 방식에 따라 조정됩니다.',
    areaPyeongBand: '현장별 상이',
    budgetBand: '현장별 협의',
    painPoint: '공간은 있는데 어떤 결과를 만들어야 하는지 설명하기 어려운 상태인 경우가 많습니다.',
    solutionPoint: '먼저 기준 사례를 잡고, 그 사례를 바탕으로 동선과 분위기, 기능을 함께 정리합니다.',
    operatorReview: '원하는 방향이 막연했던 고객도 사례를 보고 나면 질문이 구체적으로 바뀌는 경우가 많습니다.',
    recommendedFor: '초기 방향 설정이 필요한 신규 프로젝트, 업종 전환 검토 현장',
  },
}

export const SITE_OVERRIDES: Record<string, Partial<ShowroomCaseProfile>> = {
  '2512 서울 목동 관리형 9242': {
    seatCountBand: '60석 내외',
    areaPyeongBand: '40평대',
    budgetBand: '중상 예산대',
    painPoint: '관리형다운 밀도와 완성도를 보여줘야 했고, 상담 시 첫인상 차별화가 중요했습니다.',
    solutionPoint: '집중 좌석과 브랜딩 톤을 함께 잡아 관리형 프리미엄 이미지를 명확히 만들었습니다.',
  },
}
