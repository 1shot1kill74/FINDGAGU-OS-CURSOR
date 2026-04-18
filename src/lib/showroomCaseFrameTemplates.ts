export type ShowroomCaseFrameTemplate = {
  id: string
  label: string
  body: string
}

export type ShowroomCaseFrameTemplateType = 'problem' | 'specific-problem' | 'solution' | 'evidence'

export const DEFAULT_PROBLEM_FRAME_TEMPLATES: ShowroomCaseFrameTemplate[] = [
  {
    id: 'problem-owner-without-interior',
    label: '인테리어 업체 없이 점주가 직접 진행',
    body: '전체 인테리어 설계 파트너 없이 점주가 직접 진행하다 보니 공간 방향, 가구 배치, 우선순위를 스스로 정리해야 하는 상황이었습니다.',
  },
  {
    id: 'problem-owner-furniture-only',
    label: '가구만 점주가 직접 진행',
    body: '인테리어 공사는 별도로 진행되지만 가구 선정과 배치만큼은 점주가 직접 챙겨야 해서 공간 완성도와 운영 효율 사이의 균형이 중요한 상황이었습니다.',
  },
  {
    id: 'problem-interior-company-with-furniture',
    label: '인테리어 업체가 가구까지 함께 진행',
    body: '인테리어 업체가 가구까지 함께 제안하는 흐름 안에서, 현장 컨셉에 맞으면서도 실제 운영에 맞는 제품 구성이 필요한 상황이었습니다.',
  },
  {
    id: 'problem-acquisition-remodeling',
    label: '스터디카페 인수 후 예상보다 낮은 매출로 리모델링 결심',
    body: '스터디카페를 인수했지만 기대한 만큼 매출이 나오지 않아, 공간 인상과 좌석 경험을 다시 정비해 매출 반등의 계기를 만들 필요가 있는 상황이었습니다.',
  },
  {
    id: 'problem-managed-conversion',
    label: '관리형으로 업종 전환',
    body: '무인이나 일반 학습 공간에서 관리형 운영으로 업종을 전환하면서, 체류 경험과 상담 동선, 좌석 구성까지 새롭게 설계해야 하는 상황이었습니다.',
  },
]

export const DEFAULT_SOLUTION_FRAME_TEMPLATES: ShowroomCaseFrameTemplate[] = [
  {
    id: 'solution-purpose-first-profit',
    label: '수익형 공간 목적을 먼저 정리하고 좌석 효율 중심으로 레이아웃 제안',
    body: '공간을 순수 수익형으로 볼 것인지 먼저 정리한 뒤, 필요한 동선과 좌석 수를 기준으로 레이아웃을 잡아 수익 효율이 나오는 구조를 제안했습니다.',
  },
  {
    id: 'solution-purpose-first-low-profit',
    label: '신규 학생 유치 목적에 맞춰 저수익형 공간 전략으로 접근',
    body: '직접 매출보다 학원 신규 유치와 브랜드 경험이 더 중요한 공간으로 보고, 상담 연결과 체험 인상을 강화하는 방향으로 레이아웃을 제안했습니다.',
  },
  {
    id: 'solution-request-reflection',
    label: '요청 콘셉트를 적극 반영하되 운영에 맞게 레이아웃 구체화',
    body: '독서실처럼, 스터디카페처럼 같은 요청을 그대로 듣고 끝내지 않고 실제 운영과 좌석 흐름에 맞게 공간 레이아웃으로 구체화했습니다.',
  },
  {
    id: 'solution-full-layout-proposal',
    label: '전체 레이아웃 제안부터 실행까지 한 번에 설계',
    body: '학교나 대형 현장처럼 전체 레이아웃 제안이 필요한 경우, 필요한 동선과 좌석 구성을 먼저 정리하고 실행까지 이어지는 설계안으로 접근했습니다.',
  },
  {
    id: 'solution-layout-led',
    label: '점주가 판단하기 어려운 동선과 좌석 기준을 대신 정리해 레이아웃 제안',
    body: '대부분의 점주는 필요한 동선 폭이나 좌석 비율을 직접 판단하기 어렵기 때문에, 운영 방식에 맞는 기준을 먼저 세우고 그에 맞춰 레이아웃을 설계했습니다.',
  },
  {
    id: 'solution-differentiation-exit',
    label: '경쟁사와 차별화되고 엑시트까지 고려한 공간 전략으로 접근',
    body: '단순히 예쁜 공간이 아니라 주변 경쟁 매장과 어떻게 다른 인상을 줄지, 이후 매각이나 양도 시에도 강점이 될 수 있을지를 함께 고려해 레이아웃과 구성 방향을 제안했습니다.',
  },
  {
    id: 'solution-interior-order-as-baseline',
    label: '인테리어 업체 오더를 기준으로 가구 스펙·수량 확정',
    body: '인테리어 업체에서 내려온 오더(도면·수량·마감 조건)를 기준으로 가구 규격·재질·색상·옵션을 확정하고, 제작 착수 전에 합의된 스펙으로 고정했습니다.',
  },
  {
    id: 'solution-field-measure-to-shop-order',
    label: '실측 반영 후 가구 제작용 오더로 정리',
    body: '현장 실측으로 확정한 치수·간섭을 반영한 뒤, 공장·제작에 넘길 수 있는 단위·부위별 오더로 정리해 인테리어 일정과 맞춰 진행했습니다.',
  },
  {
    id: 'solution-mfg-schedule-with-interior',
    label: '인테리어 공정·입고 일정에 맞춘 제작·납품',
    body: '바닥·벽·전기 마감 등 인테리어 공정 순서에 맞춰 가구 제작 리드타임과 납품·조립 시점을 조율해, 현장 훼손 없이 맞물리게 했습니다.',
  },
  {
    id: 'solution-finish-spec-to-product',
    label: '업체 마감·전기 스펙에 맞춘 제품·부속 선정',
    body: '몰딩·걸레받이·콘센트 위치·바닥 두께 등 인테리어 측에서 정한 조건에 맞게 하부 구조·다리·철물·연장 전선 등을 선정·반영했습니다.',
  },
  {
    id: 'solution-order-revision-gate',
    label: '오더 확정 후 변경은 합의·리드타임 기준으로만',
    body: '제작 착수 전 오더를 확정하고, 이후 변경은 인테리어 업체·현장과 일정·비용 영향을 공유한 뒤에만 반영하도록 게이트를 두었습니다.',
  },
  {
    id: 'solution-custom-furniture-to-contract',
    label: '계약 스펙에 맞춘 맞춤 제작·검수',
    body: '인테리어 계약서·시방에 명시된 규격과 허용 오차 범위 안에서 제작하고, 납품 시 현장·업체 기준에 맞춰 검수 포인트를 함께 정리했습니다.',
  },
]

export const DEFAULT_SPECIFIC_PROBLEM_FRAME_TEMPLATES: ShowroomCaseFrameTemplate[] = [
  {
    id: 'specific-problem-dark-mood',
    label: '전체적으로 어두운 분위기',
    body: '전체 조도와 색감이 무겁게 느껴져 처음 들어왔을 때 공간 인상이 답답하고 활기 없이 전달되는 문제가 있었습니다.',
  },
  {
    id: 'specific-problem-lack-of-privacy',
    label: '프라이버시 확보 부족',
    body: '좌석 간 시야 차단과 구획감이 충분하지 않아 고객이 오래 머물기엔 심리적 안정감이 부족한 상태였습니다.',
  },
  {
    id: 'specific-problem-desk-height',
    label: '잘못된 책상 높이로 고객이 불편',
    body: '책상 높이와 좌석 밸런스가 맞지 않아 장시간 이용 시 어깨와 팔의 피로가 커질 수 있는 불편이 있었습니다.',
  },
  {
    id: 'specific-problem-lack-of-circulation',
    label: '동선 공간 부족',
    body: '이동 통로 폭과 회전 공간이 넉넉하지 않아 이용자와 운영자 모두 답답하게 움직여야 하는 구조였습니다.',
  },
  {
    id: 'specific-problem-narrow-seating',
    label: '좌석 공간이 좁아 고객이 불편',
    body: '실제 착석 공간이 좁고 여유 폭이 부족해 고객이 장시간 머물기엔 체감 불편이 큰 좌석 구성이었습니다.',
  },
  {
    id: 'specific-problem-noise-insulation',
    label: '소음차단 구조 부족',
    body: '집중이 필요한 공간인데도 좌석 주변 차음과 구획 구조가 약해 소음 간섭이 쉽게 발생하는 상태였습니다.',
  },
  {
    id: 'specific-problem-site-measure-baseline',
    label: '실측으로 확정하는 현장 기준',
    body: '도면은 의도를 공유하는 출발점이고, 벽·바닥·수직·기존 마감·배관·동선은 현장에서만 정확히 잡힙니다. 실측으로 치수와 간섭을 확정한 뒤에야 가구를 그 환경에 맞출 수 있는 과제였습니다.',
  },
  {
    id: 'specific-problem-finish-line-fit',
    label: '인테리어 마감 라인에 맞춘 가구',
    body: '업체가 정한 몰딩·걸레받이·전기 포인트·바닥 마감 두께·실링 라인에 맞춰 가구 하부·틀·분할을 조정해야 했습니다. 도면이 틀린 문제라기보다, 합의된 마감 요구에 맞춰 맞춤하는 것이 핵심이었습니다.',
  },
  {
    id: 'specific-problem-environment-not-drawing',
    label: '도면이 아니라 ‘환경’에 맞추는 일',
    body: '이슈의 본질은 도면 오류 수정이 아니라, 완공 편차와 실제 사용 조건이 반영된 환경에 가구·설치를 맞추는 일이었습니다. 실측은 측정을 넘어, 그 공간에 맞게 구성을 확정하는 단계였습니다.',
  },
  {
    id: 'specific-problem-clearance-after-measure',
    label: '실측 후에야 잡히는 설치·간섭',
    body: '장막·파티션·수납·선반 등은 실측으로 회전·개폐·고정 공간을 확인한 뒤에야 배치와 부착 방식을 확정할 수 있는 상황이었습니다.',
  },
  {
    id: 'specific-problem-interior-sequence',
    label: '인테리어 공정·일정과 맞춘 조립',
    body: '마감 시점·바닥·벽면 보호와 공정 순서에 맞춰 가구 입고·조립 시점을 조율하지 않으면 흠·단차가 생길 수 있어, 현장 일정과 조건에 맞춰 진행해야 했습니다.',
  },
  {
    id: 'specific-problem-joint-to-spec',
    label: '요청 마감 품질에 맞춘 이음·단차',
    body: '코킹·단차·면 맞춤 등 업체에서 요구한 마감 기준에 맞춰 가구 면과의 이음을 맞추는 것이 과제였습니다.',
  },
]

export const DEFAULT_EVIDENCE_FRAME_TEMPLATES: ShowroomCaseFrameTemplate[] = [
  {
    id: 'evidence-zone-planning',
    label: '업종별로 반드시 필요한 구역별 계획 수립',
    body: '업종 특성에 따라 꼭 필요한 구역을 먼저 정의하고, 그 구역이 자연스럽게 작동하도록 공간 계획을 세웠습니다.',
  },
  {
    id: 'evidence-electrical-coordination',
    label: '가구 전기 연결을 위한 사전 전기 배선 인테리어와 협의',
    body: '가구 사용 방식에 맞는 전기 포인트가 필요해 공사 전에 전기 배선 계획을 인테리어 팀과 함께 조율했습니다.',
  },
  {
    id: 'evidence-ux-furniture',
    label: '동선과 고객 UX를 감안한 가구 디자인',
    body: '보여지는 형태만이 아니라 이동 흐름과 사용 감각까지 고려해 가구 디자인과 배치를 함께 정리했습니다.',
  },
  {
    id: 'evidence-lighting-plan',
    label: '공간 첫인상 개선을 위한 밝기 및 조명 계획 협의',
    body: '처음 들어왔을 때 받는 인상을 바꾸기 위해 밝기와 조명 방향을 인테리어 팀과 함께 조율했습니다.',
  },
  {
    id: 'evidence-sales-ops-advice',
    label: '입지에 따른 예상 매출 및 운영 방안 조언',
    body: '입지와 주변 수요를 기준으로 예상 매출 흐름과 운영 전략까지 함께 조언해 공간 방향을 정리했습니다.',
  },
  {
    id: 'evidence-exit-strategy',
    label: '엑시트 전략 제안',
    body: '현재 운영뿐 아니라 이후 매각이나 양도 시에도 강점이 될 수 있도록 공간 구성과 전략 포인트를 함께 제안했습니다.',
  },
  {
    id: 'evidence-measured-custom-installed',
    label: '실측 반영 맞춤 제작 가구 납품·설치 완료',
    body: '현장 실측으로 확정한 치수·간섭에 맞춰 제작한 가구가 납품·조립까지 반영되어, 도면만으로는 보이지 않던 맞춤이 눈에 띄게 정리되었습니다.',
  },
  {
    id: 'evidence-finish-line-visual',
    label: '인테리어 마감 라인과 맞춘 가구 이음·하부 정리',
    body: '몰딩·걸레받이·바닥 마감과의 단차·면 맞춤이 정리되어, 가구와 인테리어가 한 줄로 이어지는 인상으로 바뀌었습니다.',
  },
  {
    id: 'evidence-order-spec-verified',
    label: '오더·계약 스펙대로 제작·현장 검수 반영',
    body: '합의된 규격·재질·색상·옵션이 제작물에 그대로 반영되었고, 현장·인테리어 측과 함께 검수 포인트를 맞춰 확인했습니다.',
  },
  {
    id: 'evidence-schedule-clean-delivery',
    label: '인테리어 공정에 맞춘 무훼손 입고·조립',
    body: '마감 보호와 공정 순서에 맞춘 입고·조립으로 바닥·벽면 손상 없이 설치가 끝나, 개장 전 공간 상태가 안정적으로 유지되었습니다.',
  },
  {
    id: 'evidence-electrical-furniture-fit',
    label: '전기 포인트·가구 사용 동선이 맞물린 사용감',
    body: '콘센트·배선 위치와 가구 배치가 맞춰져 케이블 정리와 실사용 동선이 한결 자연스러워졌습니다.',
  },
  {
    id: 'evidence-site-vs-drawing-clarity',
    label: '현장 기준으로 확정된 배치·여유 공간',
    body: '실측 후 조정한 배치 덕분에 개폐·통로·착석 여유가 실제 이용 기준에서 확인 가능해져, 도면 대비 현장 완성도가 분명해졌습니다.',
  },
]

const STORAGE_KEY = 'findgagu-showroom-case-frame-templates-v1'

type StoredTemplates = {
  problem: ShowroomCaseFrameTemplate[]
  'specific-problem': ShowroomCaseFrameTemplate[]
  solution: ShowroomCaseFrameTemplate[]
  evidence: ShowroomCaseFrameTemplate[]
}

function normalizeTemplate(template: ShowroomCaseFrameTemplate): ShowroomCaseFrameTemplate | null {
  const id = template.id.trim()
  const label = template.label.trim()
  const body = template.body.trim()
  if (!id || !label) return null
  return { id, label, body }
}

export function createFrameTemplateId(type: ShowroomCaseFrameTemplateType): string {
  return `${type}-${crypto.randomUUID()}`
}

export function getDefaultFrameTemplates(type: ShowroomCaseFrameTemplateType): ShowroomCaseFrameTemplate[] {
  if (type === 'problem') return DEFAULT_PROBLEM_FRAME_TEMPLATES
  if (type === 'specific-problem') return DEFAULT_SPECIFIC_PROBLEM_FRAME_TEMPLATES
  if (type === 'solution') return DEFAULT_SOLUTION_FRAME_TEMPLATES
  return DEFAULT_EVIDENCE_FRAME_TEMPLATES
}

export function loadShowroomCaseFrameTemplates(type: ShowroomCaseFrameTemplateType): ShowroomCaseFrameTemplate[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return getDefaultFrameTemplates(type)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultFrameTemplates(type)
    const parsed = JSON.parse(raw) as Partial<StoredTemplates>
    const list = Array.isArray(parsed[type]) ? parsed[type] : []
    const normalized = list
      .map((item) => (item && typeof item === 'object' ? normalizeTemplate(item as ShowroomCaseFrameTemplate) : null))
      .filter((item): item is ShowroomCaseFrameTemplate => item != null)
    if (type === 'problem') {
      const defaultIds = new Set(DEFAULT_PROBLEM_FRAME_TEMPLATES.map((item) => item.id))
      const normalizedIds = new Set(normalized.map((item) => item.id))
      const isOutdatedProblemSet =
        normalized.length === 0
        || normalized.length !== DEFAULT_PROBLEM_FRAME_TEMPLATES.length
        || Array.from(defaultIds).some((id) => !normalizedIds.has(id))
      if (isOutdatedProblemSet) return DEFAULT_PROBLEM_FRAME_TEMPLATES
    }
    if (type === 'solution') {
      const defaultIds = new Set(DEFAULT_SOLUTION_FRAME_TEMPLATES.map((item) => item.id))
      const normalizedIds = new Set(normalized.map((item) => item.id))
      const isOutdatedSolutionSet =
        normalized.length === 0
        || normalized.length !== DEFAULT_SOLUTION_FRAME_TEMPLATES.length
        || Array.from(defaultIds).some((id) => !normalizedIds.has(id))
      if (isOutdatedSolutionSet) return DEFAULT_SOLUTION_FRAME_TEMPLATES
    }
    if (type === 'specific-problem') {
      const defaultIds = new Set(DEFAULT_SPECIFIC_PROBLEM_FRAME_TEMPLATES.map((item) => item.id))
      const normalizedIds = new Set(normalized.map((item) => item.id))
      const isOutdatedSpecificProblemSet =
        normalized.length === 0
        || normalized.length !== DEFAULT_SPECIFIC_PROBLEM_FRAME_TEMPLATES.length
        || Array.from(defaultIds).some((id) => !normalizedIds.has(id))
      if (isOutdatedSpecificProblemSet) return DEFAULT_SPECIFIC_PROBLEM_FRAME_TEMPLATES
    }
    if (type === 'evidence') {
      const defaultIds = new Set(DEFAULT_EVIDENCE_FRAME_TEMPLATES.map((item) => item.id))
      const normalizedIds = new Set(normalized.map((item) => item.id))
      const isOutdatedEvidenceSet =
        normalized.length === 0
        || normalized.length !== DEFAULT_EVIDENCE_FRAME_TEMPLATES.length
        || Array.from(defaultIds).some((id) => !normalizedIds.has(id))
      if (isOutdatedEvidenceSet) return DEFAULT_EVIDENCE_FRAME_TEMPLATES
    }
    return normalized.length > 0 ? normalized : getDefaultFrameTemplates(type)
  } catch {
    return getDefaultFrameTemplates(type)
  }
}

export function saveShowroomCaseFrameTemplates(
  type: ShowroomCaseFrameTemplateType,
  templates: ShowroomCaseFrameTemplate[],
): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return
  const normalized = templates
    .map(normalizeTemplate)
    .filter((item): item is ShowroomCaseFrameTemplate => item != null)
  const currentProblem = type === 'problem' ? normalized : loadShowroomCaseFrameTemplates('problem')
  const currentSpecificProblem = type === 'specific-problem' ? normalized : loadShowroomCaseFrameTemplates('specific-problem')
  const currentSolution = type === 'solution' ? normalized : loadShowroomCaseFrameTemplates('solution')
  const currentEvidence = type === 'evidence' ? normalized : loadShowroomCaseFrameTemplates('evidence')
  const payload: StoredTemplates = {
    problem: currentProblem,
    'specific-problem': currentSpecificProblem,
    solution: currentSolution,
    evidence: currentEvidence,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}
