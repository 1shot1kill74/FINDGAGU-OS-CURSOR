import { supabase } from '@/lib/supabase'
import {
  CANONICAL_BLOG_METADATA_KEY,
  hydrateCanonicalBlogPostFromGenerationResponse,
  parseCanonicalBlogPostFromMetadata,
  serializeCanonicalBlogPost,
  type ShowroomCaseCanonicalBlogPost,
} from '@/lib/showroomCaseCanonicalBlog'
import {
  buildShowroomFollowupSummary,
  resolveShowroomCaseProfile,
  type ShowroomCaseProfile,
} from '@/features/지능형쇼룸홈페이지/showroomCaseProfileService'

export {
  buildShowroomFollowupSummary,
  resolveShowroomCaseProfile,
  type ShowroomCaseProfile,
}

export type ShowroomCaseProfileDraft = {
  siteName: string
  canonicalSiteName: string | null
  industry: string | null
  problemCode: string | null
  solutionCode: string | null
  problemFrameLabel: string | null
  solutionFrameLabel: string | null
  painPoint: string | null
  solutionPoint: string | null
  headlineHook: string | null
  problemDetail: string | null
  solutionDetail: string | null
  evidencePoints: string[]
  consultationCardDraft: ShowroomCaseConsultationCardDraft | null
  cardNewsGeneration: ShowroomCaseGenerationState
  blogGeneration: ShowroomCaseGenerationState
  cardNewsPublication: ShowroomCaseCardNewsPublication
  /** Google/네이버/내부 쇼룸 공통 블로그 정본. 미저장 시 `null`. */
  canonicalBlogPost: ShowroomCaseCanonicalBlogPost | null
}

export type ShowroomCaseCardNewsPublication = {
  isPublished: boolean
  publishedAt: string | null
  slug: string | null
  siteKey: string | null
}

export type ShowroomCaseConsultationCardDraftSlide = {
  key: 'hook' | 'problem' | 'specific-problem' | 'solution' | 'evidence' | 'cta'
  title: string
  body: string
  imageRef: string | null
  imageUrl: string | null
}

export type ShowroomCaseConsultationCardDraft = {
  headlineHook: string | null
  problemCode: string | null
  solutionCode: string | null
  problemFrameLabel: string | null
  solutionFrameLabel: string | null
  problemDetail: string | null
  solutionDetail: string | null
  evidencePoints: string[]
  cardNewsSlides: ShowroomCaseConsultationCardDraftSlide[]
  savedAt: string | null
}

export type ShowroomCaseGenerationStatus = 'idle' | 'processing' | 'completed' | 'failed'

export type ShowroomCaseGenerationState = {
  status: ShowroomCaseGenerationStatus
  requestedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  response: unknown | null
}

function createEmptyGenerationState(): ShowroomCaseGenerationState {
  return {
    status: 'idle',
    requestedAt: null,
    completedAt: null,
    errorMessage: null,
    response: null,
  }
}

function parseOutlineMeta(metadata: unknown): {
  problemCode: string | null
  solutionCode: string | null
  problemFrameLabel: string | null
  solutionFrameLabel: string | null
  headlineHook: string | null
  problemDetail: string | null
  solutionDetail: string | null
  evidencePoints: string[]
} {
  const raw = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const outline = raw.content_outline && typeof raw.content_outline === 'object' && !Array.isArray(raw.content_outline)
    ? raw.content_outline as Record<string, unknown>
    : {}
  const evidencePoints = Array.isArray(outline.evidence_points)
    ? outline.evidence_points.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
  return {
    problemCode: typeof outline.problem_code === 'string' && outline.problem_code.trim()
      ? outline.problem_code.trim()
      : null,
    solutionCode: typeof outline.solution_code === 'string' && outline.solution_code.trim()
      ? outline.solution_code.trim()
      : null,
    problemFrameLabel: typeof outline.problem_frame_label === 'string' && outline.problem_frame_label.trim()
      ? outline.problem_frame_label.trim()
      : null,
    solutionFrameLabel: typeof outline.solution_frame_label === 'string' && outline.solution_frame_label.trim()
      ? outline.solution_frame_label.trim()
      : null,
    headlineHook: typeof outline.headline_hook === 'string' && outline.headline_hook.trim()
      ? outline.headline_hook.trim()
      : null,
    problemDetail: typeof outline.problem_detail === 'string' && outline.problem_detail.trim()
      ? outline.problem_detail.trim()
      : null,
    solutionDetail: typeof outline.solution_detail === 'string' && outline.solution_detail.trim()
      ? outline.solution_detail.trim()
      : null,
    evidencePoints,
  }
}

function parseGenerationState(value: unknown): ShowroomCaseGenerationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyGenerationState()
  }

  const record = value as Record<string, unknown>
  const status = typeof record.status === 'string' && ['idle', 'processing', 'completed', 'failed'].includes(record.status)
    ? record.status as ShowroomCaseGenerationStatus
    : 'idle'

  return {
    status,
    requestedAt: typeof record.requested_at === 'string' && record.requested_at.trim() ? record.requested_at.trim() : null,
    completedAt: typeof record.completed_at === 'string' && record.completed_at.trim() ? record.completed_at.trim() : null,
    errorMessage: typeof record.error_message === 'string' && record.error_message.trim() ? record.error_message.trim() : null,
    response: record.response ?? null,
  }
}

function parseGenerationMeta(metadata: unknown): {
  cardNewsGeneration: ShowroomCaseGenerationState
  blogGeneration: ShowroomCaseGenerationState
} {
  const raw = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const generation = raw.content_generation && typeof raw.content_generation === 'object' && !Array.isArray(raw.content_generation)
    ? raw.content_generation as Record<string, unknown>
    : {}

  return {
    cardNewsGeneration: parseGenerationState(generation.cardnews),
    blogGeneration: parseGenerationState(generation.blog),
  }
}

function createEmptyPublicationState(): ShowroomCaseCardNewsPublication {
  return {
    isPublished: false,
    publishedAt: null,
    slug: null,
    siteKey: null,
  }
}

function parsePublicationMeta(metadata: unknown): ShowroomCaseCardNewsPublication {
  const raw = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const publication = raw.cardnews_publication && typeof raw.cardnews_publication === 'object' && !Array.isArray(raw.cardnews_publication)
    ? raw.cardnews_publication as Record<string, unknown>
    : null
  if (!publication) return createEmptyPublicationState()

  return {
    isPublished: publication.is_published === true,
    publishedAt: typeof publication.published_at === 'string' && publication.published_at.trim()
      ? publication.published_at.trim()
      : null,
    slug: typeof publication.slug === 'string' && publication.slug.trim()
      ? publication.slug.trim()
      : null,
    siteKey: typeof publication.site_key === 'string' && publication.site_key.trim()
      ? publication.site_key.trim()
      : null,
  }
}

function normalizeConsultationCardSlideKey(value: unknown): ShowroomCaseConsultationCardDraftSlide['key'] | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'specific_problem' || normalized === 'specificproblem' || normalized === 'problem-detail' || normalized === 'detail-problem') {
    return 'specific-problem'
  }
  if (normalized === 'hook' || normalized === 'problem' || normalized === 'specific-problem' || normalized === 'solution' || normalized === 'evidence' || normalized === 'cta') {
    return normalized
  }
  return null
}

function parseConsultationCardDraft(metadata: unknown): ShowroomCaseConsultationCardDraft | null {
  const raw = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const draft = raw.consultation_card_draft && typeof raw.consultation_card_draft === 'object' && !Array.isArray(raw.consultation_card_draft)
    ? raw.consultation_card_draft as Record<string, unknown>
    : null
  if (!draft) return null
  const slides = Array.isArray(draft.card_news_slides)
    ? draft.card_news_slides
      .flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const slide = item as Record<string, unknown>
        const key = normalizeConsultationCardSlideKey(slide.key)
        if (!key) return []
        return [{
          key,
          title: typeof slide.title === 'string' ? slide.title.trim() : '',
          body: typeof slide.body === 'string' ? slide.body.trim() : '',
          imageRef: typeof slide.image_ref === 'string' && slide.image_ref.trim() ? slide.image_ref.trim() : null,
          imageUrl: typeof slide.image_url === 'string' && slide.image_url.trim() ? slide.image_url.trim() : null,
        }]
      })
    : []
  return {
    headlineHook: typeof draft.headline_hook === 'string' && draft.headline_hook.trim() ? draft.headline_hook.trim() : null,
    problemCode: typeof draft.problem_code === 'string' && draft.problem_code.trim() ? draft.problem_code.trim() : null,
    solutionCode: typeof draft.solution_code === 'string' && draft.solution_code.trim() ? draft.solution_code.trim() : null,
    problemFrameLabel: typeof draft.problem_frame_label === 'string' && draft.problem_frame_label.trim() ? draft.problem_frame_label.trim() : null,
    solutionFrameLabel: typeof draft.solution_frame_label === 'string' && draft.solution_frame_label.trim() ? draft.solution_frame_label.trim() : null,
    problemDetail: typeof draft.problem_detail === 'string' && draft.problem_detail.trim() ? draft.problem_detail.trim() : null,
    solutionDetail: typeof draft.solution_detail === 'string' && draft.solution_detail.trim() ? draft.solution_detail.trim() : null,
    evidencePoints: Array.isArray(draft.evidence_points)
      ? draft.evidence_points.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [],
    cardNewsSlides: slides,
    savedAt: typeof draft.saved_at === 'string' && draft.saved_at.trim() ? draft.saved_at.trim() : null,
  }
}

async function readExistingMetadata(siteName: string): Promise<Record<string, unknown>> {
  const { data: existingRow } = await (supabase as any)
    .from('showroom_case_profiles')
    .select('metadata')
    .eq('site_name', siteName)
    .maybeSingle()

  return existingRow?.metadata && typeof existingRow.metadata === 'object' && !Array.isArray(existingRow.metadata)
    ? { ...(existingRow.metadata as Record<string, unknown>) }
    : {}
}

export async function fetchShowroomCaseProfileDrafts(siteNames: string[]): Promise<ShowroomCaseProfileDraft[]> {
  const normalized = Array.from(new Set(siteNames.map((siteName) => siteName.trim()).filter(Boolean)))
  if (normalized.length === 0) return []

  const [siteNameResult, canonicalNameResult] = await Promise.all([
    (supabase as any)
      .from('showroom_case_profiles')
      .select('site_name, canonical_site_name, industry, pain_point, solution_point, metadata')
      .in('site_name', normalized),
    (supabase as any)
      .from('showroom_case_profiles')
      .select('site_name, canonical_site_name, industry, pain_point, solution_point, metadata')
      .in('canonical_site_name', normalized),
  ])

  if (siteNameResult.error) throw new Error(siteNameResult.error.message)
  if (canonicalNameResult.error) throw new Error(canonicalNameResult.error.message)

  const seen = new Set<string>()
  const rows = [...(siteNameResult.data ?? []), ...(canonicalNameResult.data ?? [])] as Array<Record<string, unknown>>

  return rows.flatMap((row) => {
    const siteName = String(row.site_name ?? '').trim()
    if (!siteName || seen.has(siteName)) return []
    seen.add(siteName)
    const outline = parseOutlineMeta(row.metadata)
    const generation = parseGenerationMeta(row.metadata)
    const consultationCardDraft = parseConsultationCardDraft(row.metadata)
    const publication = parsePublicationMeta(row.metadata)
    const canonicalBlogPost = hydrateCanonicalBlogPostFromGenerationResponse(
      parseCanonicalBlogPostFromMetadata(row.metadata),
      generation.blogGeneration.response,
    )
    return [{
      siteName,
      canonicalSiteName: typeof row.canonical_site_name === 'string' && row.canonical_site_name.trim()
        ? row.canonical_site_name.trim()
        : null,
      industry: typeof row.industry === 'string' && row.industry.trim()
        ? row.industry.trim()
        : null,
      problemCode: outline.problemCode,
      solutionCode: outline.solutionCode,
      problemFrameLabel: outline.problemFrameLabel,
      solutionFrameLabel: outline.solutionFrameLabel,
      painPoint: typeof row.pain_point === 'string' ? row.pain_point : null,
      solutionPoint: typeof row.solution_point === 'string' ? row.solution_point : null,
      headlineHook: outline.headlineHook,
      problemDetail: outline.problemDetail,
      solutionDetail: outline.solutionDetail,
      evidencePoints: outline.evidencePoints,
      consultationCardDraft,
      cardNewsGeneration: generation.cardNewsGeneration,
      blogGeneration: generation.blogGeneration,
      cardNewsPublication: publication,
      canonicalBlogPost,
    }]
  })
}

export async function fetchPublishedShowroomCaseProfileDrafts(): Promise<ShowroomCaseProfileDraft[]> {
  const { data, error } = await (supabase as any)
    .from('showroom_case_profiles')
    .select('site_name, canonical_site_name, industry, pain_point, solution_point, metadata')

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<Record<string, unknown>>
  return rows.flatMap((row) => {
    const siteName = typeof row.site_name === 'string' ? row.site_name.trim() : ''
    if (!siteName) return []

    const publication = parsePublicationMeta(row.metadata)
    if (!publication.isPublished) return []

    const outline = parseOutlineMeta(row.metadata)
    const generation = parseGenerationMeta(row.metadata)
    const consultationCardDraft = parseConsultationCardDraft(row.metadata)
    const canonicalBlogPost = hydrateCanonicalBlogPostFromGenerationResponse(
      parseCanonicalBlogPostFromMetadata(row.metadata),
      generation.blogGeneration.response,
    )

    return [{
      siteName,
      canonicalSiteName: typeof row.canonical_site_name === 'string' && row.canonical_site_name.trim()
        ? row.canonical_site_name.trim()
        : null,
      industry: typeof row.industry === 'string' && row.industry.trim()
        ? row.industry.trim()
        : null,
      problemCode: outline.problemCode,
      solutionCode: outline.solutionCode,
      problemFrameLabel: outline.problemFrameLabel,
      solutionFrameLabel: outline.solutionFrameLabel,
      painPoint: typeof row.pain_point === 'string' ? row.pain_point : null,
      solutionPoint: typeof row.solution_point === 'string' ? row.solution_point : null,
      headlineHook: outline.headlineHook,
      problemDetail: outline.problemDetail,
      solutionDetail: outline.solutionDetail,
      evidencePoints: outline.evidencePoints,
      consultationCardDraft,
      cardNewsGeneration: generation.cardNewsGeneration,
      blogGeneration: generation.blogGeneration,
      cardNewsPublication: publication,
      canonicalBlogPost,
    }]
  }).sort((a, b) => {
    const at = a.cardNewsPublication.publishedAt ? new Date(a.cardNewsPublication.publishedAt).getTime() : 0
    const bt = b.cardNewsPublication.publishedAt ? new Date(b.cardNewsPublication.publishedAt).getTime() : 0
    return bt - at
  })
}

export async function saveShowroomCaseProfileDraft(input: {
  siteName: string
  canonicalSiteName?: string | null
  industry?: string | null
  problemCode?: string | null
  solutionCode?: string | null
  problemFrameLabel?: string | null
  solutionFrameLabel?: string | null
  painPoint: string | null
  solutionPoint: string | null
  headlineHook?: string | null
  problemDetail?: string | null
  solutionDetail?: string | null
  evidencePoints?: string[]
}): Promise<{ error: Error | null }> {
  const siteName = input.siteName.trim()
  if (!siteName) {
    return { error: new Error('현장명이 비어 있어 사례 설명을 저장할 수 없습니다.') }
  }

  const existingMeta = await readExistingMetadata(siteName)
  const nextMeta = {
    ...existingMeta,
    content_outline: {
      ...(existingMeta.content_outline && typeof existingMeta.content_outline === 'object' && !Array.isArray(existingMeta.content_outline)
        ? existingMeta.content_outline as Record<string, unknown>
        : {}),
      problem_code: input.problemCode?.trim() || null,
      solution_code: input.solutionCode?.trim() || null,
      problem_frame_label: input.problemFrameLabel?.trim() || null,
      solution_frame_label: input.solutionFrameLabel?.trim() || null,
      headline_hook: input.headlineHook?.trim() || null,
      problem_detail: input.problemDetail?.trim() || null,
      solution_detail: input.solutionDetail?.trim() || null,
      evidence_points: (input.evidencePoints ?? []).map((item) => item.trim()).filter(Boolean),
    },
  }

  const payload = {
    site_name: siteName,
    canonical_site_name: input.canonicalSiteName?.trim() || null,
    industry: input.industry?.trim() || null,
    pain_point: input.painPoint?.trim() || null,
    solution_point: input.solutionPoint?.trim() || null,
    metadata: nextMeta,
    updated_at: new Date().toISOString(),
  }

  const { error } = await (supabase as any)
    .from('showroom_case_profiles')
    .upsert(payload, { onConflict: 'site_name', ignoreDuplicates: false })

  return { error: error ?? null }
}

export async function saveShowroomCaseGenerationState(input: {
  siteName: string
  channel: 'cardnews' | 'blog'
  status: Exclude<ShowroomCaseGenerationStatus, 'idle'>
  response?: unknown
  errorMessage?: string | null
}): Promise<{ error: Error | null }> {
  const siteName = input.siteName.trim()
  if (!siteName) {
    return { error: new Error('현장명이 비어 있어 생성 상태를 저장할 수 없습니다.') }
  }

  const existingMeta = await readExistingMetadata(siteName)
  const generation = existingMeta.content_generation && typeof existingMeta.content_generation === 'object' && !Array.isArray(existingMeta.content_generation)
    ? existingMeta.content_generation as Record<string, unknown>
    : {}
  const existingChannel = generation[input.channel] && typeof generation[input.channel] === 'object' && !Array.isArray(generation[input.channel])
    ? generation[input.channel] as Record<string, unknown>
    : {}
  const now = new Date().toISOString()

  const nextChannel = {
    ...existingChannel,
    status: input.status,
    requested_at: input.status === 'processing'
      ? now
      : (typeof existingChannel.requested_at === 'string' ? existingChannel.requested_at : now),
    completed_at: input.status === 'completed' || input.status === 'failed' ? now : null,
    error_message: input.status === 'failed' ? input.errorMessage?.trim() || '생성 요청이 실패했습니다.' : null,
    response: input.response === undefined ? (existingChannel.response ?? null) : input.response,
  }

  const nextMeta = {
    ...existingMeta,
    content_generation: {
      ...generation,
      [input.channel]: nextChannel,
    },
  }

  const { error } = await (supabase as any)
    .from('showroom_case_profiles')
    .upsert({
      site_name: siteName,
      metadata: nextMeta,
      updated_at: now,
    }, { onConflict: 'site_name', ignoreDuplicates: false })

  return { error: error ?? null }
}

/** Google/네이버/내부 쇼룸이 공유하는 블로그 정본을 `metadata.canonical_blog_post`에 저장합니다. */
export async function saveShowroomCaseCanonicalBlogPost(input: {
  siteName: string
  post: ShowroomCaseCanonicalBlogPost
}): Promise<{ error: Error | null }> {
  const siteName = input.siteName.trim()
  if (!siteName) {
    return { error: new Error('현장명이 비어 있어 블로그 정본을 저장할 수 없습니다.') }
  }
  if (input.post.siteName.trim() !== siteName) {
    return { error: new Error('블로그 정본의 siteName이 현장명과 일치하지 않습니다.') }
  }

  const existingMeta = await readExistingMetadata(siteName)
  const now = new Date().toISOString()
  const nextPost: ShowroomCaseCanonicalBlogPost = {
    ...input.post,
    updatedAt: now,
  }
  const nextMeta = {
    ...existingMeta,
    [CANONICAL_BLOG_METADATA_KEY]: serializeCanonicalBlogPost(nextPost),
  }

  const { error } = await (supabase as any)
    .from('showroom_case_profiles')
    .upsert({
      site_name: siteName,
      metadata: nextMeta,
      updated_at: now,
    }, { onConflict: 'site_name', ignoreDuplicates: false })

  return { error: error ?? null }
}

export async function saveShowroomCaseConsultationCardDraft(input: {
  siteName: string
  headlineHook?: string | null
  problemCode?: string | null
  solutionCode?: string | null
  problemFrameLabel?: string | null
  solutionFrameLabel?: string | null
  problemDetail?: string | null
  solutionDetail?: string | null
  evidencePoints?: string[]
  cardNewsSlides: ShowroomCaseConsultationCardDraftSlide[]
}): Promise<{ error: Error | null }> {
  const siteName = input.siteName.trim()
  if (!siteName) {
    return { error: new Error('현장명이 비어 있어 상담카드 드래프트를 저장할 수 없습니다.') }
  }

  const existingMeta = await readExistingMetadata(siteName)
  const now = new Date().toISOString()
  const nextMeta = {
    ...existingMeta,
    consultation_card_draft: {
      headline_hook: input.headlineHook?.trim() || null,
      problem_code: input.problemCode?.trim() || null,
      solution_code: input.solutionCode?.trim() || null,
      problem_frame_label: input.problemFrameLabel?.trim() || null,
      solution_frame_label: input.solutionFrameLabel?.trim() || null,
      problem_detail: input.problemDetail?.trim() || null,
      solution_detail: input.solutionDetail?.trim() || null,
      evidence_points: (input.evidencePoints ?? []).map((item) => item.trim()).filter(Boolean),
      card_news_slides: input.cardNewsSlides.map((slide) => ({
        key: slide.key,
        title: slide.title.trim(),
        body: slide.body.trim(),
        image_ref: slide.imageRef?.trim() || null,
        image_url: slide.imageUrl?.trim() || null,
      })),
      saved_at: now,
    },
  }

  const { error } = await (supabase as any)
    .from('showroom_case_profiles')
    .upsert({
      site_name: siteName,
      metadata: nextMeta,
      updated_at: now,
    }, { onConflict: 'site_name', ignoreDuplicates: false })

  return { error: error ?? null }
}

export async function saveShowroomCaseCardNewsPublication(input: {
  siteName: string
  isPublished: boolean
  siteKey?: string | null
  slug?: string | null
}): Promise<{ error: Error | null; publication: ShowroomCaseCardNewsPublication | null }> {
  const siteName = input.siteName.trim()
  if (!siteName) {
    return {
      error: new Error('현장명이 비어 있어 카드뉴스 공개 상태를 저장할 수 없습니다.'),
      publication: null,
    }
  }

  const existingMeta = await readExistingMetadata(siteName)
  const existingPublication = parsePublicationMeta(existingMeta)
  const now = new Date().toISOString()
  const nextPublication = {
    is_published: input.isPublished,
    published_at: input.isPublished ? now : null,
    slug: input.slug?.trim() || existingPublication.slug || null,
    site_key: input.siteKey?.trim() || existingPublication.siteKey || siteName,
  }
  const nextMeta = {
    ...existingMeta,
    cardnews_publication: nextPublication,
  }

  const { error } = await (supabase as any)
    .from('showroom_case_profiles')
    .upsert({
      site_name: siteName,
      metadata: nextMeta,
      updated_at: now,
    }, { onConflict: 'site_name', ignoreDuplicates: false })

  return {
    error: error ?? null,
    publication: error
      ? null
      : {
          isPublished: nextPublication.is_published,
          publishedAt: nextPublication.published_at,
          slug: nextPublication.slug,
          siteKey: nextPublication.site_key,
        },
  }
}
