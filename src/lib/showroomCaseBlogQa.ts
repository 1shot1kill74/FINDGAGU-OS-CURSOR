/**
 * 쇼룸 사례 블로그 SEO/AEO 자동 검수.
 *
 * 목표: 세세한 문장 품질이 아니라
 * - SEO 메타가 채워져 있고
 * - AEO(답변엔진)용 featured answer / FAQ / GEO가 있는지
 * 를 채점해, 기준 점수 이상이면 자동 발행한다.
 */

import type { ShowroomCaseCanonicalBlogPost } from '@/lib/showroomCaseCanonicalBlog'
import { buildPublicShowroomCasePath } from '@/lib/showroomCaseSlug'

/** 이 점수 이상이면 자동 공개(approved) */
export const SHOWROOM_BLOG_QA_AUTO_PUBLISH_THRESHOLD = 70

export type ShowroomBlogQaCheckId =
  | 'seo_title'
  | 'seo_description'
  | 'seo_keywords'
  | 'seo_og'
  | 'seo_canonical'
  | 'seo_images'
  | 'aeo_featured_answer'
  | 'aeo_faq'
  | 'aeo_geo'
  | 'body_presence'

export type ShowroomBlogQaCheck = {
  id: ShowroomBlogQaCheckId
  label: string
  maxScore: number
  score: number
  passed: boolean
  detail: string
}

export type ShowroomBlogQaReview = {
  schemaVersion: 1
  scoredAt: string
  totalScore: number
  maxScore: number
  threshold: number
  passed: boolean
  autoPublished: boolean
  checks: ShowroomBlogQaCheck[]
  /** 미달 항목을 로컬에서 보강했는지 */
  localRepairApplied?: boolean
  /** n8n 재생성 시도 횟수 (최초 생성 제외) */
  regenerateAttempts?: number
  /** UI/로그용 수정 메모 */
  revisionNotes?: string[]
}

/** 미달 시 n8n에 넘기는 수정 지시 */
export type ShowroomBlogQaRevisionPayload = {
  mode: 'seo-aeo-fix'
  attempt: number
  threshold: number
  previousScore: number
  previousMaxScore: number
  failedChecks: Array<{ id: ShowroomBlogQaCheckId; label: string; detail: string }>
  instructions: string
}

/** 최초 1회 생성 + 미달 시 최대 재생성 횟수 */
export const SHOWROOM_BLOG_QA_MAX_REGENERATE = 2

function clampScore(score: number, max: number): number {
  if (score <= 0) return 0
  if (score >= max) return max
  return Math.round(score)
}

function textLen(value: string | null | undefined): number {
  return (value ?? '').trim().length
}

/**
 * 정본 블로그를 SEO/AEO 기준으로 채점한다.
 * LLM 호출 없이 구조 필드로만 평가한다.
 */
export function scoreShowroomCaseBlogQa(
  post: ShowroomCaseCanonicalBlogPost,
  options?: { threshold?: number; scoredAt?: string },
): ShowroomBlogQaReview {
  const threshold = options?.threshold ?? SHOWROOM_BLOG_QA_AUTO_PUBLISH_THRESHOLD
  const scoredAt = options?.scoredAt ?? new Date().toISOString()
  const checks: ShowroomBlogQaCheck[] = []

  // --- SEO ---
  const titleLen = textLen(post.seo.title)
  {
    const maxScore = 12
    let score = 0
    let detail = 'SEO 제목 없음'
    if (titleLen >= 12 && titleLen <= 70) {
      score = maxScore
      detail = `제목 길이 적정 (${titleLen}자)`
    } else if (titleLen >= 8) {
      score = Math.round(maxScore * 0.6)
      detail = `제목 길이 아쉬움 (${titleLen}자, 권장 12–70)`
    } else if (titleLen > 0) {
      score = Math.round(maxScore * 0.3)
      detail = `제목 너무 짧음 (${titleLen}자)`
    }
    checks.push({
      id: 'seo_title',
      label: 'SEO 제목',
      maxScore,
      score: clampScore(score, maxScore),
      passed: score >= maxScore * 0.6,
      detail,
    })
  }

  const descLen = textLen(post.seo.seoDescription)
  {
    const maxScore = 12
    let score = 0
    let detail = 'SEO 설명 없음'
    if (descLen >= 40 && descLen <= 160) {
      score = maxScore
      detail = `설명 길이 적정 (${descLen}자)`
    } else if (descLen >= 24) {
      score = Math.round(maxScore * 0.6)
      detail = `설명 길이 아쉬움 (${descLen}자, 권장 40–160)`
    } else if (descLen > 0) {
      score = Math.round(maxScore * 0.3)
      detail = `설명 너무 짧음 (${descLen}자)`
    }
    checks.push({
      id: 'seo_description',
      label: 'SEO 설명',
      maxScore,
      score: clampScore(score, maxScore),
      passed: score >= maxScore * 0.6,
      detail,
    })
  }

  {
    const maxScore = 8
    const kw = (post.seo.keywords ?? []).filter((k) => k.trim())
    let score = 0
    let detail = '키워드 없음'
    if (kw.length >= 3) {
      score = maxScore
      detail = `키워드 ${kw.length}개`
    } else if (kw.length === 2) {
      score = Math.round(maxScore * 0.75)
      detail = '키워드 2개'
    } else if (kw.length === 1) {
      score = Math.round(maxScore * 0.4)
      detail = '키워드 1개'
    }
    checks.push({
      id: 'seo_keywords',
      label: 'SEO 키워드',
      maxScore,
      score: clampScore(score, maxScore),
      passed: kw.length >= 2,
      detail,
    })
  }

  {
    const maxScore = 8
    const hasOgTitle = textLen(post.seo.ogTitle) > 0
    const hasOgDesc = textLen(post.seo.ogDescription) > 0
    let score = 0
    if (hasOgTitle && hasOgDesc) score = maxScore
    else if (hasOgTitle || hasOgDesc) score = Math.round(maxScore * 0.5)
    checks.push({
      id: 'seo_og',
      label: 'OG 메타',
      maxScore,
      score: clampScore(score, maxScore),
      passed: hasOgTitle && hasOgDesc,
      detail:
        hasOgTitle && hasOgDesc
          ? 'ogTitle · ogDescription 있음'
          : hasOgTitle || hasOgDesc
            ? 'OG 일부만 있음'
            : 'OG 메타 없음',
    })
  }

  {
    const maxScore = 5
    const hasCanonical = textLen(post.seo.canonicalPath) > 0
    checks.push({
      id: 'seo_canonical',
      label: 'Canonical 경로',
      maxScore,
      score: hasCanonical ? maxScore : 0,
      passed: hasCanonical,
      detail: hasCanonical ? `canonical: ${post.seo.canonicalPath}` : 'canonicalPath 없음',
    })
  }

  {
    const maxScore = 5
    const withAlt = post.images.filter((img) => textLen(img.url) > 0 && textLen(img.alt) > 0)
    const score = withAlt.length >= 2 ? maxScore : withAlt.length === 1 ? Math.round(maxScore * 0.6) : 0
    checks.push({
      id: 'seo_images',
      label: '이미지·ALT',
      maxScore,
      score: clampScore(score, maxScore),
      passed: withAlt.length >= 1,
      detail: withAlt.length > 0 ? `ALT 있는 이미지 ${withAlt.length}장` : '이미지/ALT 없음',
    })
  }

  // --- AEO ---
  {
    const maxScore = 18
    const faLen = textLen(post.structured?.featuredAnswer)
    let score = 0
    let detail = '핵심 답변(featuredAnswer) 없음'
    if (faLen >= 60) {
      score = maxScore
      detail = `핵심 답변 ${faLen}자`
    } else if (faLen >= 30) {
      score = Math.round(maxScore * 0.7)
      detail = `핵심 답변 짧음 (${faLen}자)`
    } else if (faLen > 0) {
      score = Math.round(maxScore * 0.35)
      detail = `핵심 답변 매우 짧음 (${faLen}자)`
    }
    checks.push({
      id: 'aeo_featured_answer',
      label: 'AEO 핵심 답변',
      maxScore,
      score: clampScore(score, maxScore),
      passed: faLen >= 30,
      detail,
    })
  }

  {
    const maxScore = 18
    const faqs = (post.structured?.faqItems ?? []).filter(
      (item) => textLen(item.question) > 0 && textLen(item.answer) > 0,
    )
    let score = 0
    let detail = 'FAQ 없음'
    if (faqs.length >= 3) {
      score = maxScore
      detail = `FAQ ${faqs.length}개`
    } else if (faqs.length === 2) {
      score = Math.round(maxScore * 0.8)
      detail = 'FAQ 2개'
    } else if (faqs.length === 1) {
      score = Math.round(maxScore * 0.4)
      detail = 'FAQ 1개'
    }
    checks.push({
      id: 'aeo_faq',
      label: 'AEO FAQ',
      maxScore,
      score: clampScore(score, maxScore),
      passed: faqs.length >= 2,
      detail,
    })
  }

  {
    const maxScore = 9
    const geos = (post.structured?.geoPoints ?? []).filter((g) => textLen(g) > 0)
    let score = 0
    let detail = 'GEO 포인트 없음'
    if (geos.length >= 2) {
      score = maxScore
      detail = `GEO ${geos.length}개`
    } else if (geos.length === 1) {
      score = Math.round(maxScore * 0.6)
      detail = 'GEO 1개'
    }
    checks.push({
      id: 'aeo_geo',
      label: 'AEO GEO',
      maxScore,
      score: clampScore(score, maxScore),
      passed: geos.length >= 1,
      detail,
    })
  }

  // --- 운영 시그널 (본문 존재) ---
  {
    const maxScore = 5
    const bodyLen = Math.max(textLen(post.bodyMarkdown), textLen(post.bodyHtml), textLen(post.title))
    const score = bodyLen >= 200 ? maxScore : bodyLen >= 80 ? Math.round(maxScore * 0.5) : bodyLen > 0 ? 1 : 0
    checks.push({
      id: 'body_presence',
      label: '본문 존재',
      maxScore,
      score: clampScore(score, maxScore),
      passed: bodyLen >= 80,
      detail: bodyLen > 0 ? `본문 약 ${bodyLen}자` : '본문 없음',
    })
  }

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0)
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0)
  const passed = totalScore >= threshold

  return {
    schemaVersion: 1,
    scoredAt,
    totalScore,
    maxScore,
    threshold,
    passed,
    autoPublished: false,
    checks,
  }
}

export function formatShowroomBlogQaSummary(review: ShowroomBlogQaReview): string {
  return `SEO/AEO ${review.totalScore}/${review.maxScore}` + (review.passed ? ' · 통과' : ' · 미달')
}

/**
 * 검수 점수를 정본에 붙이고, 통과 시 status=approved 로 승격한다.
 */
export function applyQaReviewToCanonicalBlog(
  post: ShowroomCaseCanonicalBlogPost,
  options?: {
    threshold?: number
    scoredAt?: string
    localRepairApplied?: boolean
    regenerateAttempts?: number
    revisionNotes?: string[]
  },
): { post: ShowroomCaseCanonicalBlogPost; review: ShowroomBlogQaReview } {
  const review = scoreShowroomCaseBlogQa(post, options)
  const now = options?.scoredAt ?? review.scoredAt
  const enriched: ShowroomBlogQaReview = {
    ...review,
    localRepairApplied: Boolean(options?.localRepairApplied),
    regenerateAttempts: options?.regenerateAttempts ?? 0,
    revisionNotes: options?.revisionNotes ?? [],
  }

  if (!enriched.passed) {
    return {
      review: { ...enriched, autoPublished: false },
      post: {
        ...post,
        qaReview: { ...enriched, autoPublished: false },
        updatedAt: now,
      },
    }
  }

  const publishedReview: ShowroomBlogQaReview = { ...enriched, autoPublished: true }
  return {
    review: publishedReview,
    post: {
      ...post,
      status: 'approved',
      scheduledAt: null,
      approvedAt: now,
      approvedBy: 'auto-qa:seo-aeo',
      qaReview: publishedReview,
      updatedAt: now,
    },
  }
}

function firstPlainParagraph(markdown: string | null | undefined): string {
  if (!markdown?.trim()) return ''
  const lines = markdown
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/[*_`>#]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
  return lines.find((line) => line.length >= 24) ?? lines[0] ?? ''
}

function clampText(value: string, min: number, max: number, pad?: string): string {
  let text = value.replace(/\s+/g, ' ').trim()
  if (text.length > max) {
    text = `${text.slice(0, Math.max(0, max - 1)).trim()}…`
  }
  if (text.length < min && pad) {
    const merged = `${text}${text ? ' ' : ''}${pad}`.replace(/\s+/g, ' ').trim()
    text = merged.length > max ? `${merged.slice(0, Math.max(0, max - 1)).trim()}…` : merged
  }
  return text
}

function uniqueKeywords(values: Array<string | null | undefined>, limit = 5): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const token = (raw ?? '').replace(/\s+/g, ' ').trim()
    if (!token || token.length < 2) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(token)
    if (out.length >= limit) break
  }
  return out
}

/**
 * 미달 SEO/AEO 항목을 기존 본문·현장 메타로 보강한다 (LLM 없이).
 */
export function repairShowroomCaseBlogForQa(
  post: ShowroomCaseCanonicalBlogPost,
  context?: { industry?: string | null },
): { post: ShowroomCaseCanonicalBlogPost; repairs: string[]; changed: boolean } {
  const repairs: string[] = []
  const industry = (context?.industry ?? '').trim()
  const bodyLead = firstPlainParagraph(post.bodyMarkdown) || firstPlainParagraph(post.bodyHtml.replace(/<[^>]+>/g, ' '))
  const baseTitle = (post.seo.title || post.title || post.siteName).trim()
  const baseSummary =
    (post.seo.seoDescription || '').trim()
    || (post.structured?.featuredAnswer || '').trim()
    || bodyLead
    || `${post.siteName} 비포어/애프터 시공 사례 — 파인드가구 온라인 쇼룸`

  let seoTitle = baseTitle
  if (seoTitle.length < 12) {
    seoTitle = clampText(`${post.siteName} ${industry || '시공'} 사례`.trim(), 12, 70, '비포어 애프터 리모델링')
    repairs.push('SEO 제목 보강')
  } else if (seoTitle.length > 70) {
    seoTitle = clampText(seoTitle, 12, 70)
    repairs.push('SEO 제목 길이 조정')
  }

  let seoDescription = clampText(baseSummary, 40, 160, '현장 문제와 개선 포인트를 정리한 전문 시공 사례입니다.')
  if (seoDescription !== (post.seo.seoDescription || '').trim()) {
    repairs.push('SEO 설명 보강')
  }

  const keywords = uniqueKeywords([
    ...(post.seo.keywords ?? []),
    post.siteName,
    industry,
    '비포어애프터',
    '리모델링',
    '인테리어',
    '파인드가구',
  ])
  if (keywords.length > (post.seo.keywords ?? []).length) {
    repairs.push(`키워드 ${keywords.length}개 확보`)
  }

  const ogTitle = (post.seo.ogTitle || '').trim() || seoTitle
  const ogDescription = (post.seo.ogDescription || '').trim() || seoDescription
  if (!(post.seo.ogTitle || '').trim() || !(post.seo.ogDescription || '').trim()) {
    repairs.push('OG 메타 보강')
  }

  const canonicalPath =
    (post.seo.canonicalPath || '').trim()
    || buildPublicShowroomCasePath({
      siteName: post.siteName,
      title: post.seo.title || post.title,
      canonicalPath: post.seo.canonicalPath,
    })
  if (!(post.seo.canonicalPath || '').trim()) {
    repairs.push('canonical 경로 추가')
  }

  let featuredAnswer = (post.structured?.featuredAnswer || '').trim()
  if (featuredAnswer.length < 60) {
    featuredAnswer = clampText(
      featuredAnswer || bodyLead || seoDescription,
      60,
      220,
      `${post.siteName} 현장의 핵심 과제를 정리하고, 시공 전후 변화를 사례로 보여 줍니다.`,
    )
    repairs.push('AEO 핵심 답변 보강')
  }

  const existingFaqs = (post.structured?.faqItems ?? []).filter(
    (item) => item.question.trim() && item.answer.trim(),
  )
  const faqItems = [...existingFaqs]
  const defaultFaqs: Array<{ question: string; answer: string }> = [
    {
      question: `${post.siteName} 현장의 핵심 문제는 무엇이었나요?`,
      answer: featuredAnswer,
    },
    {
      question: '시공 전후 어떤 변화가 보이나요?',
      answer: clampText(
        bodyLead || seoDescription,
        40,
        180,
        '비포어/애프터 사진과 함께 동선·수납·마감 개선 포인트를 확인할 수 있습니다.',
      ),
    },
    {
      question: '비슷한 공간도 상담할 수 있나요?',
      answer: '네. 온라인 쇼룸 사례를 참고해 문의하시면 현장 조건에 맞는 상담을 진행합니다.',
    },
  ]
  for (const faq of defaultFaqs) {
    if (faqItems.length >= 3) break
    const dup = faqItems.some((item) => item.question === faq.question)
    if (!dup) faqItems.push(faq)
  }
  if (faqItems.length > existingFaqs.length) {
    repairs.push(`FAQ ${faqItems.length}개 확보`)
  }

  const existingGeo = (post.structured?.geoPoints ?? []).filter((g) => g.trim())
  const geoPoints = uniqueKeywords(
    [
      ...existingGeo,
      industry ? `${industry} 인테리어` : null,
      industry ? `${industry} 리모델링` : null,
      `${post.siteName} 시공 사례`,
      '비포어 애프터 인테리어',
    ],
    4,
  )
  if (geoPoints.length > existingGeo.length) {
    repairs.push(`GEO ${geoPoints.length}개 확보`)
  }

  const images = post.images.map((img, index) => {
    if (img.alt?.trim()) return img
    repairs.push('이미지 ALT 보강')
    return {
      ...img,
      alt: `${post.siteName} 시공 사진 ${index + 1}`,
    }
  })

  const changed = repairs.length > 0
  if (!changed) {
    return { post, repairs, changed: false }
  }

  return {
    changed: true,
    repairs,
    post: {
      ...post,
      images,
      seo: {
        ...post.seo,
        title: seoTitle,
        seoDescription,
        keywords,
        ogTitle,
        ogDescription,
        canonicalPath,
      },
      structured: {
        featuredAnswer,
        faqItems,
        geoPoints,
      },
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * 채점 → (미달 시) 로컬 수정 → 재채점.
 * 통과하면 자동 발행 상태로 만든다.
 */
export function scoreAndRepairShowroomCaseBlogQa(
  post: ShowroomCaseCanonicalBlogPost,
  options?: {
    industry?: string | null
    threshold?: number
    regenerateAttempts?: number
  },
): { post: ShowroomCaseCanonicalBlogPost; review: ShowroomBlogQaReview } {
  const first = scoreShowroomCaseBlogQa(post, { threshold: options?.threshold })
  if (first.passed) {
    return applyQaReviewToCanonicalBlog(post, {
      threshold: options?.threshold,
      regenerateAttempts: options?.regenerateAttempts ?? 0,
      localRepairApplied: false,
      revisionNotes: [],
    })
  }

  const repaired = repairShowroomCaseBlogForQa(post, { industry: options?.industry })
  return applyQaReviewToCanonicalBlog(repaired.post, {
    threshold: options?.threshold,
    regenerateAttempts: options?.regenerateAttempts ?? 0,
    localRepairApplied: repaired.changed,
    revisionNotes: repaired.repairs,
  })
}

export function buildShowroomBlogQaRevisionPayload(
  review: ShowroomBlogQaReview,
  attempt: number,
): ShowroomBlogQaRevisionPayload {
  const failedChecks = review.checks
    .filter((c) => !c.passed)
    .map((c) => ({ id: c.id, label: c.label, detail: c.detail }))

  const lines = failedChecks.map((c) => `- ${c.label}: ${c.detail}`)
  const instructions = [
    '이전 초안이 SEO/AEO 자동 검수에 미달했습니다. 본문 품질보다 아래 구조 항목을 반드시 채우세요.',
    `목표 점수: ${review.threshold}/${review.maxScore} 이상 (현재 ${review.totalScore}).`,
    '필수:',
    '- seo.title 12–70자, seoDescription 40–160자, keywords 3개 이상',
    '- ogTitle/ogDescription, canonicalPath',
    '- structured.featuredAnswer 60자 이상',
    '- structured.faqItems 3개 이상 (question/answer)',
    '- structured.geoPoints 2개 이상',
    '미달 항목:',
    ...lines,
  ].join('\n')

  return {
    mode: 'seo-aeo-fix',
    attempt,
    threshold: review.threshold,
    previousScore: review.totalScore,
    previousMaxScore: review.maxScore,
    failedChecks,
    instructions,
  }
}

export function parseShowroomBlogQaReview(raw: unknown): ShowroomBlogQaReview | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const schemaVersion = Number(record.schemaVersion ?? record.schema_version)
  if (schemaVersion !== 1) return null

  const totalScore = Number(record.totalScore ?? record.total_score)
  const maxScore = Number(record.maxScore ?? record.max_score)
  const threshold = Number(record.threshold)
  const scoredAt =
    (typeof record.scoredAt === 'string' && record.scoredAt) ||
    (typeof record.scored_at === 'string' && record.scored_at) ||
    null
  if (!Number.isFinite(totalScore) || !Number.isFinite(maxScore) || !Number.isFinite(threshold) || !scoredAt) {
    return null
  }

  const checksRaw = record.checks
  const checks: ShowroomBlogQaCheck[] = []
  if (Array.isArray(checksRaw)) {
    for (const item of checksRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const c = item as Record<string, unknown>
      const id = typeof c.id === 'string' ? (c.id as ShowroomBlogQaCheckId) : null
      const label = typeof c.label === 'string' ? c.label : null
      const score = Number(c.score)
      const itemMax = Number(c.maxScore ?? c.max_score)
      const detail = typeof c.detail === 'string' ? c.detail : ''
      if (!id || !label || !Number.isFinite(score) || !Number.isFinite(itemMax)) continue
      checks.push({
        id,
        label,
        maxScore: itemMax,
        score,
        passed: Boolean(c.passed),
        detail,
      })
    }
  }

  return {
    schemaVersion: 1,
    scoredAt,
    totalScore,
    maxScore,
    threshold,
    passed: Boolean(record.passed ?? totalScore >= threshold),
    autoPublished: Boolean(record.autoPublished ?? record.auto_published),
    checks,
    localRepairApplied: Boolean(record.localRepairApplied ?? record.local_repair_applied),
    regenerateAttempts: Number.isFinite(Number(record.regenerateAttempts ?? record.regenerate_attempts))
      ? Number(record.regenerateAttempts ?? record.regenerate_attempts)
      : 0,
    revisionNotes: Array.isArray(record.revisionNotes)
      ? record.revisionNotes.filter((n): n is string => typeof n === 'string')
      : Array.isArray(record.revision_notes)
        ? record.revision_notes.filter((n): n is string => typeof n === 'string')
        : [],
  }
}

export function serializeShowroomBlogQaReview(review: ShowroomBlogQaReview): Record<string, unknown> {
  return {
    schema_version: review.schemaVersion,
    schemaVersion: review.schemaVersion,
    scored_at: review.scoredAt,
    scoredAt: review.scoredAt,
    total_score: review.totalScore,
    totalScore: review.totalScore,
    max_score: review.maxScore,
    maxScore: review.maxScore,
    threshold: review.threshold,
    passed: review.passed,
    auto_published: review.autoPublished,
    autoPublished: review.autoPublished,
    local_repair_applied: Boolean(review.localRepairApplied),
    localRepairApplied: Boolean(review.localRepairApplied),
    regenerate_attempts: review.regenerateAttempts ?? 0,
    regenerateAttempts: review.regenerateAttempts ?? 0,
    revision_notes: review.revisionNotes ?? [],
    revisionNotes: review.revisionNotes ?? [],
    checks: review.checks.map((c) => ({
      id: c.id,
      label: c.label,
      max_score: c.maxScore,
      maxScore: c.maxScore,
      score: c.score,
      passed: c.passed,
      detail: c.detail,
    })),
  }
}
