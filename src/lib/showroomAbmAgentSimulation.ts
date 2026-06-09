import { CONCERN_CARDS } from '@/pages/showroom/showroomPageConstants'

export type ShowroomAbmUxVariant = 'before' | 'after'

export type ShowroomAbmAgentRoute = 'story' | 'photo'

export type ShowroomAbmAgent = {
  id: string
  route: ShowroomAbmAgentRoute
  concern: string | null
  industry: string
  intentScore: number
}

export type ShowroomAbmFunnelStep = {
  key: string
  label: string
  count: number
  rateFromPrevious: number | null
  rateFromEnter: number
  dropFromPrevious: number | null
  dropCountFromPrevious: number | null
}

export type ShowroomAbmFrictionReport = {
  variant: ShowroomAbmUxVariant
  storySteps: ShowroomAbmFunnelStep[]
  photoSteps: ShowroomAbmFunnelStep[]
  topDropoffs: Array<{ label: string; dropRate: number; dropCount: number }>
  frictionNotes: string[]
}

export type ShowroomAbmFunnelCounts = {
  agents: number
  storyAgents: number
  photoAgents: number
  entered: number
  concernSelected: number
  beforeAfterViewed: number
  storyOpened: number
  caseLoaded: number
  consultationMoment: number
  consultationClicked: number
  photoGalleryOpened: number
  photoConsultationClicked: number
}

export type ShowroomAbmSimulationResult = {
  variant: ShowroomAbmUxVariant
  agents: ShowroomAbmAgent[]
  funnel: ShowroomAbmFunnelCounts
  rates: {
    concernSelectRate: number
    storyOpenRate: number
    caseLoadRate: number
    storyConsultationRate: number
    photoConsultationRate: number
    overallConsultationRate: number
  }
}

export type ShowroomAbmComparison = {
  agentCount: number
  before: ShowroomAbmSimulationResult
  after: ShowroomAbmSimulationResult
  lift: {
    storyConsultationRate: number
    photoConsultationRate: number
    overallConsultationRate: number
  }
}

type VariantConfig = {
  concernSelectBase: number
  beforeAfterViewRate: number
  storyClickRate: number
  caseLoadSuccessRate: number
  consultationMomentRate: number
  storyConsultationClickRate: number
  photoGalleryOpenRate: number
  photoConsultationClickRate: number
}

const VARIANT_CONFIG: Record<ShowroomAbmUxVariant, VariantConfig> = {
  before: {
    concernSelectBase: 0.52,
    beforeAfterViewRate: 0.72,
    storyClickRate: 0.38,
    caseLoadSuccessRate: 0.52,
    consultationMomentRate: 0.58,
    storyConsultationClickRate: 0.09,
    photoGalleryOpenRate: 0.36,
    photoConsultationClickRate: 0.035,
  },
  after: {
    concernSelectBase: 0.58,
    beforeAfterViewRate: 0.82,
    storyClickRate: 0.51,
    caseLoadSuccessRate: 0.89,
    consultationMomentRate: 0.74,
    storyConsultationClickRate: 0.16,
    photoGalleryOpenRate: 0.41,
    photoConsultationClickRate: 0.11,
  },
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickConcern(rng: () => number): string {
  const index = Math.floor(rng() * CONCERN_CARDS.length)
  return CONCERN_CARDS[index]?.tag ?? CONCERN_CARDS[0].tag
}

function intentModifier(intentScore: number): number {
  return 0.72 + intentScore * 0.56
}

function chance(rng: () => number, probability: number): boolean {
  return rng() < Math.max(0, Math.min(1, probability))
}

export function createShowroomAbmAgents(count: number, seed = 20260609): ShowroomAbmAgent[] {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, (_, index) => {
    const route: ShowroomAbmAgentRoute = rng() < 0.68 ? 'story' : 'photo'
    const concern = route === 'story' ? pickConcern(rng) : null
    const card = concern ? CONCERN_CARDS.find((item) => item.tag === concern) : null
    return {
      id: `agent-${String(index + 1).padStart(4, '0')}`,
      route,
      concern,
      industry: card?.industryFilter ?? '기타',
      intentScore: rng(),
    }
  })
}

function emptyFunnel(agentCount: number): ShowroomAbmFunnelCounts {
  return {
    agents: agentCount,
    storyAgents: 0,
    photoAgents: 0,
    entered: 0,
    concernSelected: 0,
    beforeAfterViewed: 0,
    storyOpened: 0,
    caseLoaded: 0,
    consultationMoment: 0,
    consultationClicked: 0,
    photoGalleryOpened: 0,
    photoConsultationClicked: 0,
  }
}

export function simulateShowroomAbmVariant(
  agents: ShowroomAbmAgent[],
  variant: ShowroomAbmUxVariant,
  seed = 20260609,
): ShowroomAbmSimulationResult {
  const config = VARIANT_CONFIG[variant]
  const rng = mulberry32(seed + (variant === 'before' ? 11 : 29))
  const funnel = emptyFunnel(agents.length)

  for (const agent of agents) {
    funnel.entered += 1

    if (agent.route === 'photo') {
      funnel.photoAgents += 1
      if (chance(rng, config.photoGalleryOpenRate * intentModifier(agent.intentScore))) {
        funnel.photoGalleryOpened += 1
        if (chance(rng, config.photoConsultationClickRate * intentModifier(agent.intentScore))) {
          funnel.photoConsultationClicked += 1
        }
      }
      continue
    }

    funnel.storyAgents += 1
    if (!chance(rng, config.concernSelectBase * intentModifier(agent.intentScore))) continue
    funnel.concernSelected += 1

    if (!chance(rng, config.beforeAfterViewRate)) continue
    funnel.beforeAfterViewed += 1

    if (!chance(rng, config.storyClickRate * intentModifier(agent.intentScore))) continue
    funnel.storyOpened += 1

    if (!chance(rng, config.caseLoadSuccessRate)) continue
    funnel.caseLoaded += 1

    if (!chance(rng, config.consultationMomentRate * intentModifier(agent.intentScore))) continue
    funnel.consultationMoment += 1

    if (chance(rng, config.storyConsultationClickRate * intentModifier(agent.intentScore))) {
      funnel.consultationClicked += 1
    }
  }

  const storyConsultationRate = funnel.entered > 0 ? funnel.consultationClicked / funnel.entered : 0
  const photoConsultationRate = funnel.entered > 0 ? funnel.photoConsultationClicked / funnel.entered : 0

  return {
    variant,
    agents,
    funnel,
    rates: {
      concernSelectRate: rate(funnel.concernSelected, funnel.entered),
      storyOpenRate: rate(funnel.storyOpened, funnel.concernSelected),
      caseLoadRate: rate(funnel.caseLoaded, funnel.storyOpened),
      storyConsultationRate,
      photoConsultationRate,
      overallConsultationRate: storyConsultationRate + photoConsultationRate,
    },
  }
}

export function compareShowroomAbmVariants(
  agentCount = 1000,
  seed = 20260609,
): ShowroomAbmComparison {
  const agents = createShowroomAbmAgents(agentCount, seed)
  const before = simulateShowroomAbmVariant(agents, 'before', seed)
  const after = simulateShowroomAbmVariant(agents, 'after', seed)

  return {
    agentCount,
    before,
    after,
    lift: {
      storyConsultationRate: relativeLift(before.rates.storyConsultationRate, after.rates.storyConsultationRate),
      photoConsultationRate: relativeLift(before.rates.photoConsultationRate, after.rates.photoConsultationRate),
      overallConsultationRate: relativeLift(before.rates.overallConsultationRate, after.rates.overallConsultationRate),
    },
  }
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function formatLiftCell(before: number, after: number): string {
  if (before <= 0 && after <= 0) return '0.0%'
  if (before <= 0) return `신규 ${formatPercent(after)}`
  return formatLift(relativeLift(before, after))
}

function relativeLift(before: number, after: number): number {
  if (before <= 0) return after > 0 ? 100 : 0
  return ((after - before) / before) * 100
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatLift(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function buildFunnelSteps(
  steps: Array<{ key: string; label: string; count: number }>,
  enterCount: number,
): ShowroomAbmFunnelStep[] {
  let previous = enterCount

  return steps.map((step) => {
    const rateFromPrevious = previous > 0 ? step.count / previous : null
    const dropFromPrevious = rateFromPrevious == null ? null : 1 - rateFromPrevious
    const dropCountFromPrevious = previous > 0 ? previous - step.count : null
    const result: ShowroomAbmFunnelStep = {
      key: step.key,
      label: step.label,
      count: step.count,
      rateFromPrevious,
      rateFromEnter: enterCount > 0 ? step.count / enterCount : 0,
      dropFromPrevious,
      dropCountFromPrevious,
    }
    previous = step.count
    return result
  })
}

export function buildShowroomAbmFrictionReport(result: ShowroomAbmSimulationResult): ShowroomAbmFrictionReport {
  const { funnel } = result

  const storySteps = buildFunnelSteps(
    [
      { key: 'concern', label: '고민 카드 선택', count: funnel.concernSelected },
      { key: 'before_after', label: 'B/A 섹션 확인', count: funnel.beforeAfterViewed },
      { key: 'story_open', label: 'B/A → 사례 페이지 열기', count: funnel.storyOpened },
      { key: 'case_loaded', label: '사례 페이지 로드 성공', count: funnel.caseLoaded },
      { key: 'consult_moment', label: '상담 CTA 노출 구간 도달', count: funnel.consultationMoment },
      { key: 'consult_click', label: '상담 클릭', count: funnel.consultationClicked },
    ],
    funnel.storyAgents,
  )

  const photoSteps = buildFunnelSteps(
    [
      { key: 'gallery_open', label: '갤러리/사진 탐색 진입', count: funnel.photoGalleryOpened },
      { key: 'consult_click', label: '갤러리 상담 클릭', count: funnel.photoConsultationClicked },
    ],
    funnel.photoAgents,
  )

  const dropCandidates = [...storySteps, ...photoSteps]
    .filter((step) => step.dropFromPrevious != null && step.dropCountFromPrevious != null && step.dropCountFromPrevious > 0)
    .map((step) => ({
      label: step.label,
      dropRate: step.dropFromPrevious ?? 0,
      dropCount: step.dropCountFromPrevious ?? 0,
    }))
    .sort((a, b) => b.dropRate - a.dropRate || b.dropCount - a.dropCount)

  const topDropoffs = dropCandidates.slice(0, 4)
  const frictionNotes = buildFrictionNotes(result, topDropoffs)

  return {
    variant: result.variant,
    storySteps,
    photoSteps,
    topDropoffs,
    frictionNotes,
  }
}

function buildFrictionNotes(
  result: ShowroomAbmSimulationResult,
  topDropoffs: ShowroomAbmFrictionReport['topDropoffs'],
): string[] {
  const notes: string[] = []
  const { funnel, rates } = result

  if (topDropoffs[0]) {
    notes.push(`가장 큰 이탈: **${topDropoffs[0].label}** 직전 구간 (${formatPercent(topDropoffs[0].dropRate)} 이탈, 약 ${topDropoffs[0].dropCount}명).`)
  }

  const concernDrop = funnel.storyAgents - funnel.concernSelected
  if (concernDrop > funnel.storyAgents * 0.4) {
    notes.push('고민 카드까지 오지만 선택하지 않는 비율이 높습니다. 카드 카피·스크롤 위치·「성공 사례 보기」 인지도를 점검하세요.')
  }

  const baToStoryDrop = funnel.beforeAfterViewed - funnel.storyOpened
  if (baToStoryDrop > funnel.beforeAfterViewed * 0.35) {
    notes.push('B/A는 보지만 사례 페이지로 넘어가지 않습니다. 블로그 티저·「자세히 보기」 CTA가 약해 보일 수 있습니다.')
  }

  const caseFailEstimate = funnel.storyOpened - funnel.caseLoaded
  if (caseFailEstimate > funnel.storyOpened * 0.08) {
    notes.push(`사례 열기 후 로드 실패/미완성 추정 ${caseFailEstimate}건. case 링크·콘텐츠 완성도를 실측(abm_case_open_fail)으로 확인하세요.`)
  }

  const momentToClickDrop = funnel.consultationMoment - funnel.consultationClicked
  if (momentToClickDrop > funnel.consultationMoment * 0.6) {
    notes.push('사례까지 본 사람 중 상담 클릭 전환은 여전히 낮습니다. Sticky CTA 카피·노출 타이밍·채널톡 오픈 신뢰도가 병목일 수 있습니다.')
  }

  const photoOpenRate = rate(funnel.photoGalleryOpened, funnel.photoAgents)
  if (photoOpenRate < 0.5) {
    notes.push('사진 루트는 갤러리 진입 자체가 어렵습니다. 「시공 사례 사진 바로 찾기」 섹션 가시성·탭(업종/제품/색상) 발견성을 확인하세요.')
  }

  if (rates.overallConsultationRate < 0.05) {
    notes.push('전체 방문 대비 상담 클릭은 아직 낮은 편입니다. 시뮬 추정치이므로 **실측 ABM 대시보드**(`/admin/showroom-abm`)로 교차 검증하세요.')
  } else {
    notes.push('개선 후에도 상담까지 가는 사람은 소수입니다. 퍼널 상단(고민→B/A)보다 **상담 CTA 구간**이 다음 레버일 가능성이 큽니다.')
  }

  return notes
}

export function buildShowroomAbmFrictionMarkdown(
  comparison: ShowroomAbmComparison,
  focusVariant: ShowroomAbmUxVariant = 'after',
): string {
  const result = focusVariant === 'before' ? comparison.before : comparison.after
  const friction = buildShowroomAbmFrictionReport(result)
  const routeSplit = result.agents.length > 0
    ? `${result.funnel.storyAgents} story / ${result.funnel.photoAgents} photo`
    : '-'

  const formatStepRow = (step: ShowroomAbmFunnelStep) => {
    const prev = step.rateFromPrevious == null ? '-' : formatPercent(step.rateFromPrevious)
    const drop = step.dropFromPrevious == null ? '-' : formatPercent(step.dropFromPrevious)
    return `| ${step.label} | ${step.count} | ${formatPercent(step.rateFromEnter)} | ${prev} | ${drop} |`
  }

  const lines = [
    `## 현재 UX 불편·이탈 진단 (${focusVariant}, ${comparison.agentCount} agents)`,
    '',
    `- 루트 분포: ${routeSplit}`,
    `- 전체 상담 클릭률(방문 대비): ${formatPercent(result.rates.overallConsultationRate)}`,
    '',
    '### 스토리 루트 — 단계별 이탈',
    '',
    '| 단계 | 도달 수 | 진입 대비 | 이전 대비 전환 | 이전 대비 이탈 |',
    '|------|---------|-----------|----------------|----------------|',
    ...friction.storySteps.map(formatStepRow),
    '',
    '### 사진 루트 — 단계별 이탈',
    '',
    '| 단계 | 도달 수 | 진입 대비 | 이전 대비 전환 | 이전 대비 이탈 |',
    '|------|---------|-----------|----------------|----------------|',
    ...friction.photoSteps.map(formatStepRow),
    '',
    '### 이탈 TOP (이전 단계 대비)',
    '',
    ...friction.topDropoffs.map(
      (item, index) => `${index + 1}. **${item.label}** — 이탈 ${formatPercent(item.dropRate)} (약 ${item.dropCount}명)`,
    ),
    '',
    '### 에이전트 관찰 메모 (개선 레버)',
    '',
    ...friction.frictionNotes.map((note) => `- ${note}`),
    '',
    '> ⚠️ 확률 모델 기반 추정입니다. 실제 병목은 `/admin/showroom-abm` 실측 이벤트로 확인하세요.',
  ]

  return lines.join('\n')
}

export function buildShowroomAbmComparisonReport(comparison: ShowroomAbmComparison): string {
  const lines = [
    `# Showroom ABM Agent Simulation (${comparison.agentCount} agents)`,
    '',
    '동일 1000명 페르소나를 before/after UX 가정으로 각각 시뮬레이션한 결과입니다.',
    '실제 라이브 데이터가 쌓이기 전, 이번 개선의 방향성을 검증하는 **모델 추정치**입니다.',
    '',
    '## 핵심 반응 지표',
    '',
    '| 지표 | Before | After | Lift |',
    '|------|--------|-------|------|',
    `| 스토리 루트 상담 클릭률 (방문 대비) | ${formatPercent(comparison.before.rates.storyConsultationRate)} | ${formatPercent(comparison.after.rates.storyConsultationRate)} | ${formatLiftCell(comparison.before.rates.storyConsultationRate, comparison.after.rates.storyConsultationRate)} |`,
    `| 사진 루트 상담 클릭률 (방문 대비) | ${formatPercent(comparison.before.rates.photoConsultationRate)} | ${formatPercent(comparison.after.rates.photoConsultationRate)} | ${formatLiftCell(comparison.before.rates.photoConsultationRate, comparison.after.rates.photoConsultationRate)} |`,
    `| 전체 상담 클릭률 (방문 대비) | ${formatPercent(comparison.before.rates.overallConsultationRate)} | ${formatPercent(comparison.after.rates.overallConsultationRate)} | ${formatLiftCell(comparison.before.rates.overallConsultationRate, comparison.after.rates.overallConsultationRate)} |`,
    '',
    '## 스토리 루트 퍼널',
    '',
    '| 단계 | Before | After |',
    '|------|--------|-------|',
    `| 고민 선택률 | ${formatPercent(comparison.before.rates.concernSelectRate)} | ${formatPercent(comparison.after.rates.concernSelectRate)} |`,
    `| B/A → 사례 열기 (고민 선택 대비) | ${formatPercent(comparison.before.rates.storyOpenRate)} | ${formatPercent(comparison.after.rates.storyOpenRate)} |`,
    `| 사례 로드 성공 (사례 열기 대비) | ${formatPercent(comparison.before.rates.caseLoadRate)} | ${formatPercent(comparison.after.rates.caseLoadRate)} |`,
    '',
    '## After 퍼널 절대 수 (1000명)',
    '',
    `- 진입: ${comparison.after.funnel.entered}`,
    `- 고민 선택: ${comparison.after.funnel.concernSelected}`,
    `- B/A 확인: ${comparison.after.funnel.beforeAfterViewed}`,
    `- 사례 열기: ${comparison.after.funnel.storyOpened}`,
    `- 사례 로드 성공: ${comparison.after.funnel.caseLoaded}`,
    `- 상담 시점 도달: ${comparison.after.funnel.consultationMoment}`,
    `- 스토리 상담 클릭: ${comparison.after.funnel.consultationClicked}`,
    `- 사진 갤러리 진입: ${comparison.after.funnel.photoGalleryOpened}`,
    `- 사진 상담 클릭: ${comparison.after.funnel.photoConsultationClicked}`,
    '',
    '## Before 퍼널 절대 수 (1000명)',
    '',
    `- 스토리 상담 클릭: ${comparison.before.funnel.consultationClicked}`,
    `- 사진 상담 클릭: ${comparison.before.funnel.photoConsultationClicked}`,
    `- 사례 로드 성공: ${comparison.before.funnel.caseLoaded}`,
    '',
    buildShowroomAbmFrictionMarkdown(comparison, 'after'),
  ]
  return lines.join('\n')
}
