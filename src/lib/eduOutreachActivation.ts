import type { EduOutreachIndustry, EduOutreachScoreJson } from '@/lib/eduOutreachTypes'

const DEFAULT_CTA = 'https://www.findgagu.co.kr/public/showroom'

export type EduActivationLevel = 'hot' | 'warm' | 'cool' | 'dormant'

export type EduBlogActivationScore = EduOutreachScoreJson & {
  activation_level: EduActivationLevel
  activation_score: number
  intent_score: number
  sample_post_count: number
  days_since_last_post: number | null
  last_post_date: string | null
}

const SPACE_INTENT_PATTERNS: Array<{ intent: string; patterns: RegExp[]; boost: number }> = [
  { intent: 'furniture_replace', patterns: [/책상\s*교체/, /좌석\s*교체/, /의자\s*교체/, /가구\s*교체/], boost: 28 },
  { intent: 'renewal', patterns: [/리모델링/, /리뉴얼/, /인테리어/, /전면\s*공사/], boost: 24 },
  { intent: 'open', patterns: [/개원/, /오픈/, /신규\s*(센터|지점|호점)/, /그랜드\s*오픈/], boost: 22 },
  { intent: 'relocate', patterns: [/이전/, /확장/, /증설/, /2\s*호점/, /분원/], boost: 20 },
  { intent: 'fitout', patterns: [/학습\s*공간/, /좌석\s*배치/, /공간\s*조성/, /스터디룸/], boost: 14 },
]

const INDUSTRY_PATTERNS: Array<{ industry: EduOutreachIndustry; patterns: RegExp[]; boost: number }> = [
  { industry: 'academy', patterns: [/학원/, /입시/, /보습/, /교습소/, /독학재수학원/], boost: 26 },
  {
    industry: 'study_cafe',
    patterns: [/관리형\s*스터디/, /스터디\s*카페/, /스터디카페/, /무인\s*스터디/],
    boost: 26,
  },
  {
    industry: 'managed_reading_room',
    patterns: [/관리형\s*독서실/, /독서실/, /열람실/],
    boost: 24,
  },
]

function clip(text: string, max = 220) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

/** YYYYMMDD → ISO date string (local noon) */
export function parseNaverPostdate(postdate: string | null | undefined): string | null {
  const raw = String(postdate || '').replace(/\D/g, '')
  if (raw.length !== 8) return null
  const y = Number(raw.slice(0, 4))
  const m = Number(raw.slice(4, 6))
  const d = Number(raw.slice(6, 8))
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const iso = new Date(y, m - 1, d, 12, 0, 0).toISOString()
  return iso
}

export function daysSince(isoDate: string | null | undefined, now = Date.now()): number | null {
  if (!isoDate) return null
  const t = new Date(isoDate).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)))
}

/**
 * 최근 포스팅 신선도 기반 액티베이팅 점수 (0~45)
 * - hot: 30일 이내 · warm: 90일 · cool: 180일 · dormant: 그 이상
 */
export function scoreActivationFromRecency(input: {
  lastPostDateIso: string | null
  samplePostCount: number
  now?: number
}): { level: EduActivationLevel; score: number; daysSinceLastPost: number | null } {
  const days = daysSince(input.lastPostDateIso, input.now)
  let score = 0
  let level: EduActivationLevel = 'dormant'

  if (days == null) {
    return { level: 'dormant', score: 0, daysSinceLastPost: null }
  }
  if (days <= 14) {
    level = 'hot'
    score = 40
  } else if (days <= 30) {
    level = 'hot'
    score = 34
  } else if (days <= 90) {
    level = 'warm'
    score = 24
  } else if (days <= 180) {
    level = 'cool'
    score = 12
  } else if (days <= 365) {
    level = 'dormant'
    score = 4
  } else {
    level = 'dormant'
    score = 0
  }

  if (input.samplePostCount >= 5) score += 5
  else if (input.samplePostCount >= 3) score += 3
  else if (input.samplePostCount >= 2) score += 1

  return { level, score: Math.min(45, score), daysSinceLastPost: days }
}

export function activationLevelLabel(level: EduActivationLevel | string | null | undefined): string {
  if (level === 'hot') return '활성↑ (자주 업데이트)'
  if (level === 'warm') return '활성 (최근 3개월)'
  if (level === 'cool') return '저활성 (6개월)'
  if (level === 'dormant') return '휴면/방치 가능'
  return '활성 미상'
}

function detectIndustry(blob: string, hint?: string | null): { industry: EduOutreachIndustry; boost: number } {
  if (hint && hint !== 'unknown' && hint !== 'excluded') {
    const known = INDUSTRY_PATTERNS.find((r) => r.industry === hint)
    if (known) return { industry: known.industry, boost: known.boost }
  }
  for (const rule of INDUSTRY_PATTERNS) {
    if (rule.patterns.some((re) => re.test(blob))) return { industry: rule.industry, boost: rule.boost }
  }
  return { industry: 'unknown', boost: 0 }
}

function detectIntent(blob: string): { intent: string; boost: number } {
  for (const rule of SPACE_INTENT_PATTERNS) {
    if (rule.patterns.some((re) => re.test(blob))) return { intent: rule.intent, boost: rule.boost }
  }
  return { intent: 'blog_presence', boost: 6 }
}

function detectRegion(blob: string, hint?: string | null): string {
  if (hint?.trim()) return hint.trim()
  const match = blob.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|강남|서초|송파|분당|수원|목동|노원|일산)[^\s,]{0,10}/,
  )
  return match?.[0]?.trim() || '미상'
}

function looksLikeOperatorBlog(blob: string): boolean {
  return /학원|스터디|독서실|교습|입시|보습|관리형/.test(blob)
}

/**
 * 블로그 타겟 점수 = 액티베이팅(신선도) + 공간의도 + 업종.
 * 활성만 높고 공간 키워드 없으면 fit이 중간대에 머묾.
 */
export function scoreEduBlogTarget(input: {
  orgName: string
  title?: string | null
  body?: string | null
  sourceUrl?: string | null
  regionHint?: string | null
  industryHint?: string | null
  lastPostDateIso?: string | null
  samplePostCount?: number
  ctaBaseUrl?: string | null
}): EduBlogActivationScore {
  const title = (input.title || '').trim()
  const body = (input.body || '').trim()
  const blob = `${input.orgName}\n${title}\n${body}`
  const sourceUrl = (input.sourceUrl || '').trim()
  const ctaUrl = `${(input.ctaBaseUrl || DEFAULT_CTA).replace(/\/$/, '')}?utm_source=edu_outreach&utm_medium=blog`

  const activation = scoreActivationFromRecency({
    lastPostDateIso: input.lastPostDateIso || null,
    samplePostCount: input.samplePostCount ?? 1,
  })
  const industry = detectIndustry(blob, input.industryHint)
  const intent = detectIntent(blob)
  const region = detectRegion(blob, input.regionHint)

  let fit = 28 + activation.score + Math.round(industry.boost * 0.55) + Math.round(intent.boost * 0.7)
  if (!looksLikeOperatorBlog(blob)) fit -= 18
  if (industry.industry === 'unknown') fit -= 12
  if (intent.intent === 'blog_presence' && activation.level === 'dormant') fit -= 8
  if (intent.intent !== 'blog_presence' && activation.level === 'hot') fit += 6
  fit = Math.max(0, Math.min(100, fit))

  const why = [
    `활성=${activation.level}(${activation.daysSinceLastPost ?? '?'}일전)`,
    industry.industry !== 'unknown' ? `업종=${industry.industry}` : '업종 불명확',
    `의도=${intent.intent}`,
    region !== '미상' ? `지역=${region}` : null,
    `샘플글=${input.samplePostCount ?? 1}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const outreachAngle =
    intent.intent === 'furniture_replace'
      ? 'desk_replacement_ba_case'
      : intent.intent === 'open' || intent.intent === 'renewal'
        ? 'ba_shorts_showroom'
        : activation.level === 'hot' || activation.level === 'warm'
          ? 'active_blog_showroom'
          : 'cold_showroom_intro'

  const industryLabel =
    industry.industry === 'academy'
      ? '학원'
      : industry.industry === 'study_cafe'
        ? '스터디카페'
        : industry.industry === 'managed_reading_room'
          ? '관리형 독서실'
          : '학습 공간'

  const draft = clip(
    `${input.orgName}${region !== '미상' ? ` (${region})` : ''} ${industryLabel} 운영 중이시죠. 블로그 활동 기준으로 학습공간 사례가 필요해 보여, 파인드가구 교육공간 쇼룸(전후비교) 링크 남겨드립니다. ${ctaUrl} · 편하신 점심/저녁에 회신 주시면 상담 일정 잡겠습니다.`,
    320,
  )

  return {
    fit_score: Number(fit.toFixed(1)),
    industry: industry.industry,
    intent: intent.intent,
    region,
    why,
    outreach_angle: outreachAngle,
    draft_message: draft,
    cta_url: ctaUrl,
    source_url: sourceUrl,
    evidence_quote: clip(title || body, 160),
    activation_level: activation.level,
    activation_score: activation.score,
    intent_score: intent.boost,
    sample_post_count: input.samplePostCount ?? 1,
    days_since_last_post: activation.daysSinceLastPost,
    last_post_date: input.lastPostDateIso || null,
  }
}
