/**
 * 파인드가구 랜딩 ABM — 타겟 4세그먼트 (30~50대)
 * - 학원 원장 / 관리형 스터디카페 창업주 / 학교 담당자 / 아파트 담당자
 * - 자극: 개선된 랜딩 (문제→사례→상담) + 쇼룸 연결
 */

export type LandingTargetSegment =
  | 'academy_director'
  | 'managed_study_cafe'
  | 'school_officer'
  | 'apartment_officer'

export type LandingAbmUxVariant = 'before' | 'after'

export type LandingAbmAgent = {
  id: string
  segment: LandingTargetSegment
  age: number
  intentScore: number
  riskAversion: number
  /** 의사결정 속도 (높을수록 상담까지 빠름) */
  decisionSpeed: number
}

export type LandingAbmFunnelCounts = {
  agents: number
  entered: number
  heroUnderstood: number
  painMatched: number
  caseBrowsed: number
  consultClicked: number
}

export type LandingAbmSegmentStats = {
  segment: LandingTargetSegment
  label: string
  agents: number
  funnel: LandingAbmFunnelCounts
  rates: {
    heroUnderstandRate: number
    painMatchRate: number
    caseBrowseRate: number
    consultRate: number
    consultGivenCase: number
  }
  topFriction: string
}

export type LandingAbmSimulationResult = {
  variant: LandingAbmUxVariant
  agents: LandingAbmAgent[]
  funnel: LandingAbmFunnelCounts
  bySegment: LandingAbmSegmentStats[]
  rates: {
    heroUnderstandRate: number
    painMatchRate: number
    caseBrowseRate: number
    consultRate: number
  }
}

export type LandingAbmComparison = {
  agentCount: number
  seed: number
  before: LandingAbmSimulationResult
  after: LandingAbmSimulationResult
  lift: {
    heroUnderstandRate: number
    painMatchRate: number
    caseBrowseRate: number
    consultRate: number
  }
}

export const LANDING_SEGMENT_META: Record<
  LandingTargetSegment,
  {
    label: string
    weight: number
    ageMin: number
    ageMax: number
    /** 의도 베이스 (0~1) */
    intentBase: number
    riskBase: number
    speedBase: number
    painFit: number
    frictionNote: string
  }
> = {
  managed_study_cafe: {
    label: '관리형 스터디카페 창업주',
    weight: 0.3,
    ageMin: 32,
    ageMax: 48,
    intentBase: 0.62,
    riskBase: 0.42,
    speedBase: 0.68,
    painFit: 0.88,
    frictionNote: 'ROI·회수기간이 안 보이면 사례만 보고 이탈',
  },
  academy_director: {
    label: '학원 원장',
    weight: 0.28,
    ageMin: 35,
    ageMax: 52,
    intentBase: 0.55,
    riskBase: 0.48,
    speedBase: 0.58,
    painFit: 0.82,
    frictionNote: '자습실 유출 공포는 크지만 예산·학부모 설득 근거가 약하면 보류',
  },
  school_officer: {
    label: '학교 담당자',
    weight: 0.22,
    ageMin: 33,
    ageMax: 55,
    intentBase: 0.4,
    riskBase: 0.72,
    speedBase: 0.32,
    painFit: 0.7,
    frictionNote: '행정·입찰·내부 보고용 근거가 부족하면 상담 클릭을 미룸',
  },
  apartment_officer: {
    label: '아파트 담당자',
    weight: 0.2,
    ageMin: 34,
    ageMax: 55,
    intentBase: 0.38,
    riskBase: 0.78,
    speedBase: 0.28,
    painFit: 0.66,
    frictionNote: '입대의·주민 민원 리스크로 혼자 상담하기 부담',
  },
}

type VariantConfig = {
  heroUnderstandBase: number
  painMatchBase: number
  caseBrowseBase: number
  consultBase: number
}

/** 이전 랜딩: 제품/회사 소개 비중 큼 */
const BEFORE_CONFIG: VariantConfig = {
  heroUnderstandBase: 0.48,
  painMatchBase: 0.36,
  caseBrowseBase: 0.52,
  consultBase: 0.09,
}

/** 개선 랜딩: 문제 선택 → 사례 → 상담 */
const AFTER_CONFIG: VariantConfig = {
  heroUnderstandBase: 0.72,
  painMatchBase: 0.61,
  caseBrowseBase: 0.68,
  consultBase: 0.16,
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

function chance(rng: () => number, probability: number): boolean {
  return rng() < Math.max(0, Math.min(1, probability))
}

function pickSegment(rng: () => number): LandingTargetSegment {
  const entries = Object.entries(LANDING_SEGMENT_META) as Array<
    [LandingTargetSegment, (typeof LANDING_SEGMENT_META)[LandingTargetSegment]]
  >
  const total = entries.reduce((sum, [, meta]) => sum + meta.weight, 0)
  let roll = rng() * total
  for (const [segment, meta] of entries) {
    roll -= meta.weight
    if (roll <= 0) return segment
  }
  return 'managed_study_cafe'
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function createLandingAbmAgents(count: number, seed = 20260806): LandingAbmAgent[] {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, (_, index) => {
    const segment = pickSegment(rng)
    const meta = LANDING_SEGMENT_META[segment]
    const age = meta.ageMin + Math.floor(rng() * (meta.ageMax - meta.ageMin + 1))
    const ageMid = (meta.ageMin + meta.ageMax) / 2
    const ageShift = (age - ageMid) / 20
    return {
      id: `agent-${String(index + 1).padStart(4, '0')}`,
      segment,
      age,
      intentScore: clamp01(meta.intentBase + (rng() - 0.5) * 0.35 - ageShift * 0.05),
      riskAversion: clamp01(meta.riskBase + (rng() - 0.5) * 0.25 + ageShift * 0.08),
      decisionSpeed: clamp01(meta.speedBase + (rng() - 0.5) * 0.3 - ageShift * 0.06),
    }
  })
}

function emptyFunnel(agentCount: number): LandingAbmFunnelCounts {
  return {
    agents: agentCount,
    entered: 0,
    heroUnderstood: 0,
    painMatched: 0,
    caseBrowsed: 0,
    consultClicked: 0,
  }
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function relativeLift(before: number, after: number): number {
  if (before <= 0) return after > 0 ? 100 : 0
  return ((after - before) / before) * 100
}

export function formatPercent(value: number, digits = 1): number {
  return Number((value * 100).toFixed(digits))
}

export function formatPercentLabel(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatLiftLabel(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function segmentTopFriction(stats: Omit<LandingAbmSegmentStats, 'topFriction' | 'label'>): string {
  const meta = LANDING_SEGMENT_META[stats.segment]
  const drops = [
    {
      label: '히어로 이해',
      drop: stats.funnel.entered - stats.funnel.heroUnderstood,
      rate: 1 - rate(stats.funnel.heroUnderstood, stats.funnel.entered),
    },
    {
      label: '페인 매칭',
      drop: stats.funnel.heroUnderstood - stats.funnel.painMatched,
      rate: 1 - rate(stats.funnel.painMatched, stats.funnel.heroUnderstood),
    },
    {
      label: '사례 탐색',
      drop: stats.funnel.painMatched - stats.funnel.caseBrowsed,
      rate: 1 - rate(stats.funnel.caseBrowsed, stats.funnel.painMatched),
    },
    {
      label: '상담 클릭',
      drop: stats.funnel.caseBrowsed - stats.funnel.consultClicked,
      rate: 1 - rate(stats.funnel.consultClicked, stats.funnel.caseBrowsed),
    },
  ].filter((item) => item.drop > 0)

  drops.sort((a, b) => b.rate - a.rate || b.drop - a.drop)
  const top = drops[0]
  if (!top) return meta.frictionNote
  return `${top.label}에서 ${formatPercentLabel(top.rate)} 이탈 — ${meta.frictionNote}`
}

export function simulateLandingAbmVariant(
  agents: LandingAbmAgent[],
  variant: LandingAbmUxVariant,
  seed = 20260806,
): LandingAbmSimulationResult {
  const config = variant === 'before' ? BEFORE_CONFIG : AFTER_CONFIG
  const rng = mulberry32(seed + (variant === 'before' ? 17 : 41))
  const funnel = emptyFunnel(agents.length)

  const segmentBuckets = new Map<LandingTargetSegment, LandingAbmFunnelCounts>()
  for (const key of Object.keys(LANDING_SEGMENT_META) as LandingTargetSegment[]) {
    segmentBuckets.set(key, emptyFunnel(0))
  }

  for (const agent of agents) {
    const meta = LANDING_SEGMENT_META[agent.segment]
    const bucket = segmentBuckets.get(agent.segment)!
    bucket.agents += 1
    bucket.entered += 1
    funnel.entered += 1

    const heroP =
      config.heroUnderstandBase *
      (0.85 + agent.intentScore * 0.3) *
      (variant === 'after' ? 0.95 + meta.painFit * 0.1 : 0.9)
    if (!chance(rng, heroP)) continue
    funnel.heroUnderstood += 1
    bucket.heroUnderstood += 1

    const painP =
      config.painMatchBase *
      meta.painFit *
      (0.8 + agent.intentScore * 0.4) *
      (1 - agent.riskAversion * 0.15)
    if (!chance(rng, painP)) continue
    funnel.painMatched += 1
    bucket.painMatched += 1

    const caseP =
      config.caseBrowseBase *
      (0.75 + agent.intentScore * 0.45) *
      (variant === 'after' ? 1.08 : 1)
    if (!chance(rng, caseP)) continue
    funnel.caseBrowsed += 1
    bucket.caseBrowsed += 1

    const consultP =
      config.consultBase *
      (0.55 + agent.intentScore * 0.7) *
      (0.55 + agent.decisionSpeed * 0.7) *
      (1 - agent.riskAversion * 0.55) *
      (variant === 'after' ? 1.12 : 1)
    if (!chance(rng, consultP)) continue
    funnel.consultClicked += 1
    bucket.consultClicked += 1
  }

  const bySegment: LandingAbmSegmentStats[] = (Object.keys(LANDING_SEGMENT_META) as LandingTargetSegment[]).map(
    (segment) => {
      const sFunnel = segmentBuckets.get(segment)!
      const statsBase = {
        segment,
        agents: sFunnel.agents,
        funnel: sFunnel,
        rates: {
          heroUnderstandRate: rate(sFunnel.heroUnderstood, sFunnel.entered),
          painMatchRate: rate(sFunnel.painMatched, sFunnel.entered),
          caseBrowseRate: rate(sFunnel.caseBrowsed, sFunnel.entered),
          consultRate: rate(sFunnel.consultClicked, sFunnel.entered),
          consultGivenCase: rate(sFunnel.consultClicked, sFunnel.caseBrowsed),
        },
      }
      return {
        ...statsBase,
        label: LANDING_SEGMENT_META[segment].label,
        topFriction: segmentTopFriction(statsBase),
      }
    },
  )

  return {
    variant,
    agents,
    funnel,
    bySegment,
    rates: {
      heroUnderstandRate: rate(funnel.heroUnderstood, funnel.entered),
      painMatchRate: rate(funnel.painMatched, funnel.entered),
      caseBrowseRate: rate(funnel.caseBrowsed, funnel.entered),
      consultRate: rate(funnel.consultClicked, funnel.entered),
    },
  }
}

export function compareLandingAbmVariants(agentCount = 1000, seed = 20260806): LandingAbmComparison {
  const agents = createLandingAbmAgents(agentCount, seed)
  const before = simulateLandingAbmVariant(agents, 'before', seed)
  const after = simulateLandingAbmVariant(agents, 'after', seed)
  return {
    agentCount,
    seed,
    before,
    after,
    lift: {
      heroUnderstandRate: relativeLift(before.rates.heroUnderstandRate, after.rates.heroUnderstandRate),
      painMatchRate: relativeLift(before.rates.painMatchRate, after.rates.painMatchRate),
      caseBrowseRate: relativeLift(before.rates.caseBrowseRate, after.rates.caseBrowseRate),
      consultRate: relativeLift(before.rates.consultRate, after.rates.consultRate),
    },
  }
}

export function buildLandingAbmReport(comparison: LandingAbmComparison): string {
  const { before, after, lift, agentCount } = comparison
  const lines = [
    `# Landing ABM Agent Simulation (${agentCount} agents)`,
    '',
    '타겟: 30~50대 학원 원장 · 관리형 스터디카페 창업주 · 학교 담당자 · 아파트 담당자',
    '자극: 파인드가구 랜딩 before(제품/소개 중심) vs after(문제→사례→상담)',
    '⚠️ 확률 모델 추정치입니다. 실측은 `/admin/showroom-abm` 및 홈 퍼널 이벤트로 교차하세요.',
    '',
    '## 핵심 지표',
    '',
    '| 지표 | Before | After | Lift |',
    '|------|--------|-------|------|',
    `| 히어로 이해율 | ${formatPercentLabel(before.rates.heroUnderstandRate)} | ${formatPercentLabel(after.rates.heroUnderstandRate)} | ${formatLiftLabel(lift.heroUnderstandRate)} |`,
    `| 페인 매칭률 | ${formatPercentLabel(before.rates.painMatchRate)} | ${formatPercentLabel(after.rates.painMatchRate)} | ${formatLiftLabel(lift.painMatchRate)} |`,
    `| 사례 탐색률 | ${formatPercentLabel(before.rates.caseBrowseRate)} | ${formatPercentLabel(after.rates.caseBrowseRate)} | ${formatLiftLabel(lift.caseBrowseRate)} |`,
    `| 상담 클릭률 (방문 대비) | ${formatPercentLabel(before.rates.consultRate)} | ${formatPercentLabel(after.rates.consultRate)} | ${formatLiftLabel(lift.consultRate)} |`,
    '',
    '## After 퍼널 절대 수',
    '',
    `- 진입: ${after.funnel.entered}`,
    `- 히어로 이해: ${after.funnel.heroUnderstood}`,
    `- 페인 매칭: ${after.funnel.painMatched}`,
    `- 사례 탐색: ${after.funnel.caseBrowsed}`,
    `- 상담 클릭: ${after.funnel.consultClicked}`,
    '',
    '## 세그먼트별 After (방문 대비)',
    '',
    '| 세그먼트 | n | 이해 | 페인매칭 | 사례 | 상담 | 사례→상담 |',
    '|----------|---|------|----------|------|------|-----------|',
    ...after.bySegment.map((s) =>
      `| ${s.label} | ${s.agents} | ${formatPercentLabel(s.rates.heroUnderstandRate)} | ${formatPercentLabel(s.rates.painMatchRate)} | ${formatPercentLabel(s.rates.caseBrowseRate)} | ${formatPercentLabel(s.rates.consultRate)} | ${formatPercentLabel(s.rates.consultGivenCase)} |`,
    ),
    '',
    '## 세그먼트별 Before 상담률 vs After',
    '',
    '| 세그먼트 | Before 상담 | After 상담 | Lift |',
    '|----------|-------------|------------|------|',
    ...after.bySegment.map((s) => {
      const b = before.bySegment.find((x) => x.segment === s.segment)!
      const segLift = relativeLift(b.rates.consultRate, s.rates.consultRate)
      return `| ${s.label} | ${formatPercentLabel(b.rates.consultRate)} | ${formatPercentLabel(s.rates.consultRate)} | ${formatLiftLabel(segLift)} |`
    }),
    '',
    '## 세그먼트별 핵심 마찰 (After)',
    '',
    ...after.bySegment.map((s) => `- **${s.label}**: ${s.topFriction}`),
    '',
    '## 해석 메모',
    '',
    '- 랜딩 개선의 1차 이득은 **상담 직전**보다 **이해→페인 매칭**에서 크게 납니다.',
    '- 관리형·학원(민간 의사결정)은 상담까지 상대적으로 잘 갑니다.',
    '- 학교·아파트는 사례는 보지만 **사회적 리스크**로 상담 클릭이 막힙니다. CTA를 “상담”이 아니라 “내부 보고용 사례 정리 / 행정 체크리스트”로 바꾸면 마찰이 줄 수 있습니다.',
    '',
  ]
  return lines.join('\n')
}

/** JSON 직렬화용 요약 (캔버스·대시보드) */
export function landingAbmComparisonToJson(comparison: LandingAbmComparison) {
  return {
    agentCount: comparison.agentCount,
    seed: comparison.seed,
    overall: {
      before: {
        hero: formatPercent(comparison.before.rates.heroUnderstandRate),
        pain: formatPercent(comparison.before.rates.painMatchRate),
        case: formatPercent(comparison.before.rates.caseBrowseRate),
        consult: formatPercent(comparison.before.rates.consultRate),
      },
      after: {
        hero: formatPercent(comparison.after.rates.heroUnderstandRate),
        pain: formatPercent(comparison.after.rates.painMatchRate),
        case: formatPercent(comparison.after.rates.caseBrowseRate),
        consult: formatPercent(comparison.after.rates.consultRate),
      },
      lift: {
        hero: Number(comparison.lift.heroUnderstandRate.toFixed(1)),
        pain: Number(comparison.lift.painMatchRate.toFixed(1)),
        case: Number(comparison.lift.caseBrowseRate.toFixed(1)),
        consult: Number(comparison.lift.consultRate.toFixed(1)),
      },
    },
    funnelAfter: comparison.after.funnel,
    segments: comparison.after.bySegment.map((s) => {
      const b = comparison.before.bySegment.find((x) => x.segment === s.segment)!
      return {
        id: s.segment,
        label: s.label,
        n: s.agents,
        after: {
          hero: formatPercent(s.rates.heroUnderstandRate),
          pain: formatPercent(s.rates.painMatchRate),
          case: formatPercent(s.rates.caseBrowseRate),
          consult: formatPercent(s.rates.consultRate),
          consultGivenCase: formatPercent(s.rates.consultGivenCase),
        },
        beforeConsult: formatPercent(b.rates.consultRate),
        consultLift: Number(relativeLift(b.rates.consultRate, s.rates.consultRate).toFixed(1)),
        topFriction: s.topFriction,
        funnel: s.funnel,
      }
    }),
  }
}
