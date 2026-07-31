import type { EduOutreachIndustry, EduOutreachScoreJson } from '@/lib/eduOutreachTypes'

const DEFAULT_CTA = 'https://www.findgagu.co.kr/public/showroom'

const EXCLUDE_PATTERNS = [
  /가정집|아파트\s*인테리어(?!\s*(커뮤니티|독서|스터디))|호텔|병원|카페\s*인테리어(?!\s*스터디)|일반\s*카페(?!\s*스터디)|펜션|모텔|미용실|치킨|배달/,
]

const INDUSTRY_RULES: Array<{ industry: EduOutreachIndustry; patterns: RegExp[]; boost: number }> = [
  {
    industry: 'academy',
    patterns: [/학원/, /입시/, /보습/, /예체능\s*학원/, /어학원/, /교습소/],
    boost: 28,
  },
  {
    industry: 'study_cafe',
    patterns: [/스터디\s*카페/, /스터디카페/, /무인\s*독서/, /24시\s*스터디/],
    boost: 26,
  },
  {
    industry: 'managed_reading_room',
    patterns: [/관리형\s*독서실/, /독서실/, /열람실/],
    boost: 24,
  },
  {
    industry: 'school',
    patterns: [/학교/, /교실/, /특별실/, /기숙사/, /기자재/, /교육청/],
    boost: 22,
  },
  {
    industry: 'apartment_community',
    patterns: [/아파트\s*커뮤니티/, /커뮤니티\s*(독서|스터디)/, /입주자대표/, /위탁관리/, /관리단/, /스터디룸/],
    boost: 20,
  },
  {
    industry: 'military',
    patterns: [/군부대/, /사단/, /여단/, /나라장터/, /조달청/, /부대\s*(교육|독서|생활관)/],
    boost: 16,
  },
]

const INTENT_PATTERNS: Array<{ intent: string; patterns: RegExp[]; boost: number }> = [
  { intent: 'open', patterns: [/개원/, /오픈/, /신규\s*개점/, /그랜드\s*오픈/], boost: 22 },
  { intent: 'relocate', patterns: [/이전/, /확장/, /증설/], boost: 20 },
  { intent: 'renewal', patterns: [/리뉴얼/, /리모델링/, /인테리어\s*공사/, /전면\s*교체/], boost: 18 },
  { intent: 'furniture_replace', patterns: [/책상\s*교체/, /가구\s*교체/, /좌석\s*교체/, /의자\s*교체/], boost: 24 },
  { intent: 'procurement', patterns: [/입찰/, /수의계약/, /구매\s*공고/, /조달/, /기자재\s*구매/], boost: 20 },
  { intent: 'fitout', patterns: [/조성/, /구축/, /세팅/, /공간\s*마련/], boost: 14 },
]

function clip(text: string, max = 220) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function detectIndustry(blob: string): { industry: EduOutreachIndustry; boost: number } {
  for (const rule of INDUSTRY_RULES) {
    if (rule.patterns.some((re) => re.test(blob))) {
      return { industry: rule.industry, boost: rule.boost }
    }
  }
  return { industry: 'unknown', boost: 0 }
}

function detectIntent(blob: string): { intent: string; boost: number } {
  for (const rule of INTENT_PATTERNS) {
    if (rule.patterns.some((re) => re.test(blob))) {
      return { intent: rule.intent, boost: rule.boost }
    }
  }
  return { intent: 'unknown', boost: 0 }
}

function detectRegion(blob: string): string {
  const match = blob.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,]{0,12}/,
  )
  return match?.[0]?.trim() || '미상'
}

function extractOrgName(title: string): string {
  const cleaned = title
    .replace(/[\[\(].*?[\]\)]/g, ' ')
    .replace(/개원|오픈|이전|리모델링|리뉴얼|인테리어|공고|입찰/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clip(cleaned, 60) || '미상 기관'
}

function buildDraft(args: {
  orgName: string
  industry: EduOutreachIndustry
  intent: string
  region: string
  ctaUrl: string
}): string {
  const industryLabel =
    args.industry === 'academy'
      ? '학원'
      : args.industry === 'school'
        ? '학교'
        : args.industry === 'study_cafe'
          ? '스터디카페'
          : args.industry === 'managed_reading_room'
            ? '독서실'
            : args.industry === 'apartment_community'
              ? '커뮤니티 학습공간'
              : args.industry === 'military'
                ? '교육/학습 시설'
                : '학습 공간'

  const intentHint =
    args.intent === 'furniture_replace'
      ? '책상·좌석 교체'
      : args.intent === 'renewal'
        ? '리뉴얼'
        : args.intent === 'open'
          ? '신규 오픈'
          : args.intent === 'procurement'
            ? '구매/입찰'
            : args.intent === 'directory'
              ? '학습공간 운영'
              : '공간 세팅'

  if (args.industry === 'military') {
    return clip(
      `[공식 문의] ${args.orgName} ${industryLabel} ${intentHint} 관련, 교육용 가구 납품·쇼룸 사례를 공식 채널로 안내드립니다. 전후비교 사례: ${args.ctaUrl}`,
      280,
    )
  }

  return clip(
    `${args.orgName} ${args.region !== '미상' ? `(${args.region})` : ''} ${industryLabel} ${intentHint} 준비 중이시라면, 파인드가구 교육공간 쇼룸 사례(전후비교)와 견적 가이드를 남겨드립니다. ${args.ctaUrl} · 편하신 점심/저녁 시간대에 회신 주시면 상담 일정 잡겠습니다.`,
    320,
  )
}

export function scoreEduOutreachSignal(input: {
  title?: string | null
  body?: string | null
  sourceUrl?: string | null
  regionHint?: string | null
  industryHint?: string | null
  intentHint?: string | null
  ctaBaseUrl?: string | null
}): EduOutreachScoreJson {
  const title = (input.title ?? '').trim()
  const body = (input.body ?? '').trim()
  const blob = `${title}\n${body}\n${input.sourceUrl ?? ''}`
  const sourceUrl = (input.sourceUrl ?? '').trim()
  const ctaUrl = `${(input.ctaBaseUrl || DEFAULT_CTA).replace(/\/$/, '')}?utm_source=edu_outreach&utm_medium=manual`
  const isDirectory = (input.intentHint || '').trim() === 'directory'

  if (EXCLUDE_PATTERNS.some((re) => re.test(blob)) && !/스터디|독서|학원|학교|커뮤니티/.test(blob)) {
    return {
      fit_score: 5,
      industry: 'excluded',
      intent: 'excluded',
      region: input.regionHint || detectRegion(blob),
      why: '교육·학습 공간과 무관한 일반 인테리어/업종으로 판단되어 제외',
      outreach_angle: 'none',
      draft_message: '',
      cta_url: ctaUrl,
      source_url: sourceUrl,
      evidence_quote: clip(title || body, 120),
    }
  }

  const industryDetected = detectIndustry(blob)
  const industry =
    (input.industryHint as EduOutreachIndustry | undefined) &&
    input.industryHint !== 'unknown'
      ? (input.industryHint as EduOutreachIndustry)
      : industryDetected.industry

  const intentDetected = isDirectory
    ? { intent: 'directory', boost: 8 }
    : detectIntent(blob)
  const region = (input.regionHint || '').trim() || detectRegion(blob)
  const orgName = extractOrgName(title || body)

  let fit = isDirectory
    ? 42 + Math.round(industryDetected.boost * 0.7) + intentDetected.boost
    : 35 + industryDetected.boost + intentDetected.boost
  if (/책상|가구|좌석|의자|학습\s*공간/.test(blob)) fit += 12
  if (/입찰|나라장터|조달/.test(blob) && industry === 'military') fit += 8
  if (industry === 'unknown') fit -= 15
  if (!isDirectory && intentDetected.intent === 'unknown') fit -= 8
  if (isDirectory && industry !== 'unknown') fit += 6
  fit = Math.max(0, Math.min(100, fit))

  const whyParts = [
    industry !== 'unknown' ? `업종=${industry}` : '업종 불명확',
    intentDetected.intent !== 'unknown' ? `의도=${intentDetected.intent}` : '의도 불명확',
    region !== '미상' ? `지역=${region}` : null,
    isDirectory ? '네이버 지역 디렉터리(의도 이벤트 아님)' : null,
  ].filter(Boolean)

  const outreachAngle =
    industry === 'military'
      ? 'official_bid_channel'
      : isDirectory
        ? 'cold_showroom_intro'
        : intentDetected.intent === 'furniture_replace'
          ? 'desk_replacement_ba_case'
          : intentDetected.intent === 'open' || intentDetected.intent === 'renewal'
            ? 'ba_shorts_showroom'
            : 'showroom_consult'

  const draft = buildDraft({
    orgName,
    industry,
    intent: intentDetected.intent,
    region,
    ctaUrl,
  })

  return {
    fit_score: Number(fit.toFixed(1)),
    industry,
    intent: intentDetected.intent,
    region,
    why: whyParts.join(' · '),
    outreach_angle: outreachAngle,
    draft_message: draft,
    cta_url: ctaUrl,
    source_url: sourceUrl,
    evidence_quote: clip(title || body, 160),
  }
}

export function preferredWindowForIndustry(industry: EduOutreachIndustry): string {
  if (industry === 'military' || industry === 'school') return 'official_channel_only'
  return 'lunch_or_late_evening'
}

export function orgNameFromScore(title: string | null | undefined, body?: string | null) {
  return extractOrgName((title || body || '').trim() || '미상 기관')
}
