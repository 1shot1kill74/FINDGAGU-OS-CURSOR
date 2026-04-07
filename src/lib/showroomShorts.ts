import { supabase } from '@/lib/supabase'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'

export const SHOWROOM_SHORTS_CHANNELS = ['youtube', 'facebook', 'instagram'] as const

export type ShowroomShortsChannel = (typeof SHOWROOM_SHORTS_CHANNELS)[number]

export const SHOWROOM_SHORTS_JOB_STATUSES = [
  'draft',
  'requested',
  'generating',
  'generated',
  'composited',
  'ready_for_review',
  'failed',
] as const

export type ShowroomShortsJobStatus = (typeof SHOWROOM_SHORTS_JOB_STATUSES)[number]

export const SHOWROOM_SHORTS_PUBLISH_STATUSES = [
  'draft',
  'ready',
  'approved',
  'publishing',
  'published',
  'failed',
] as const

export type ShowroomShortsPublishStatus = (typeof SHOWROOM_SHORTS_PUBLISH_STATUSES)[number]

export interface ShowroomShortsTargetRecord {
  id: string
  shorts_job_id: string
  channel: ShowroomShortsChannel
  title: string
  description: string
  hashtags: string[]
  first_comment: string
  publish_status: ShowroomShortsPublishStatus
  external_post_id: string | null
  approved_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface ShowroomShortsJobRecord {
  id: string
  status: ShowroomShortsJobStatus
  prompt_text: string
  before_asset_id: string
  after_asset_id: string
  before_asset_url: string | null
  after_asset_url: string | null
  before_after_group_key: string | null
  source_video_url: string | null
  final_video_url: string | null
  requested_channels: ShowroomShortsChannel[]
  kling_job_id: string | null
  kling_status: string | null
  source_aspect_ratio: string
  final_aspect_ratio: string
  duration_seconds: number
  is_muted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  targets?: ShowroomShortsTargetRecord[]
}

export type ShowroomShortsSelectionValidation =
  | {
      ok: true
      beforeImage: ShowroomImageAsset
      afterImage: ShowroomImageAsset
      groupKey: string
      message: string
    }
  | {
      ok: false
      code:
        | 'empty'
        | 'count'
        | 'missing_before'
        | 'missing_after'
        | 'group_mismatch'
      message: string
    }

function trimOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getCanonicalSiteName(image: ShowroomImageAsset): string | null {
  return trimOrNull(image.canonical_site_name) || trimOrNull(image.site_name)
}

export function buildShowroomShortsGroupKey(image: ShowroomImageAsset): string | null {
  const beforeAfterGroupId = trimOrNull(image.before_after_group_id)
  if (beforeAfterGroupId) return `before-after:${beforeAfterGroupId}`
  const spaceId = trimOrNull(image.space_id)
  if (spaceId) return `space:${spaceId}`
  const siteName = getCanonicalSiteName(image)
  if (siteName) return `site:${siteName.toLowerCase()}`
  return null
}

export function validateBeforeAfterSelection(images: ShowroomImageAsset[]): ShowroomShortsSelectionValidation {
  if (images.length === 0) {
    return { ok: false, code: 'empty', message: '먼저 Before 1장과 After 1장을 선택하세요.' }
  }
  if (images.length !== 2) {
    return { ok: false, code: 'count', message: '숏츠 생성은 Before 1장 + After 1장, 총 2장만 선택할 수 있습니다.' }
  }

  const beforeImage = images.find((image) => image.before_after_role === 'before')
  const afterImage = images.find((image) => image.before_after_role === 'after')

  if (!beforeImage) {
    return { ok: false, code: 'missing_before', message: '선택한 이미지에 Before 컷이 없습니다.' }
  }
  if (!afterImage) {
    return { ok: false, code: 'missing_after', message: '선택한 이미지에 After 컷이 없습니다.' }
  }

  const beforeGroupKey = buildShowroomShortsGroupKey(beforeImage)
  const afterGroupKey = buildShowroomShortsGroupKey(afterImage)

  if (!beforeGroupKey || !afterGroupKey || beforeGroupKey !== afterGroupKey) {
    return {
      ok: false,
      code: 'group_mismatch',
      message: '같은 현장/같은 Before·After 묶음의 이미지 2장을 선택해야 합니다.',
    }
  }

  const siteName = getCanonicalSiteName(beforeImage) || getCanonicalSiteName(afterImage) || '선택 현장'
  return {
    ok: true,
    beforeImage,
    afterImage,
    groupKey: beforeGroupKey,
    message: `${siteName} Before/After 숏츠를 만들 준비가 되었습니다.`,
  }
}

function buildHashtags(images: ShowroomImageAsset[]): string[] {
  const siteName = getCanonicalSiteName(images[0])
  const industry = trimOrNull(images[0]?.business_type)
  const tags = ['#BeforeAfter', '#쇼츠', '#인테리어', '#파인드가구']
  if (siteName) tags.push(`#${siteName.replace(/\s+/g, '')}`)
  if (industry) tags.push(`#${industry.replace(/\s+/g, '')}`)
  return Array.from(new Set(tags))
}

export function buildShowroomShortsDraft(images: ShowroomImageAsset[]) {
  const selection = validateBeforeAfterSelection(images)
  if (!selection.ok) {
    throw new Error(selection.message)
  }

  const siteName =
    getCanonicalSiteName(selection.afterImage) ||
    getCanonicalSiteName(selection.beforeImage) ||
    '시공 사례'

  return {
    title: `${siteName} Before & After | 10초 숏츠`,
    description: [
      '잠시 후, 이 공간은 완전히 달라집니다.',
      '',
      `${siteName} 실제 사진 기반 Before & After 영상입니다.`,
      '자세한 구성은 파인드가구 온라인 쇼룸에서 확인하세요.',
    ].join('\n'),
    hashtags: buildHashtags(images),
    firstComment: `${siteName}에서 가장 달라진 포인트는 무엇인가요? 댓글로 알려주세요.`,
  }
}

export async function createShowroomShortsJob(payload: {
  promptText: string
  channels: ShowroomShortsChannel[]
  images: ShowroomImageAsset[]
}) {
  const selection = validateBeforeAfterSelection(payload.images)
  if (!selection.ok) {
    throw new Error(selection.message)
  }
  if (!payload.promptText.trim()) {
    throw new Error('Kling 프롬프트를 입력하세요.')
  }
  if (payload.channels.length === 0) {
    throw new Error('최소 1개 이상의 배포 채널을 선택하세요.')
  }

  const draft = buildShowroomShortsDraft(payload.images)
  const now = new Date().toISOString()

  const { data: authData } = await supabase.auth.getUser()
  const createdBy = authData.user?.id ?? null

  const { data: job, error: jobError } = await supabase
    .from('showroom_shorts_jobs')
    .insert({
      status: 'draft',
      prompt_text: payload.promptText.trim(),
      before_asset_id: selection.beforeImage.id,
      after_asset_id: selection.afterImage.id,
      before_asset_url: selection.beforeImage.cloudinary_url || selection.beforeImage.thumbnail_url,
      after_asset_url: selection.afterImage.cloudinary_url || selection.afterImage.thumbnail_url,
      before_after_group_key: selection.groupKey,
      requested_channels: payload.channels,
      source_aspect_ratio: '16:9',
      final_aspect_ratio: '9:16',
      duration_seconds: 10,
      is_muted: true,
      created_by: createdBy,
      updated_at: now,
    })
    .select('*')
    .single()

  if (jobError || !job) {
    throw new Error(jobError?.message ?? '숏츠 작업 저장에 실패했습니다.')
  }

  const targetRows = payload.channels.map((channel) => ({
    shorts_job_id: String(job.id),
    channel,
    title: draft.title,
    description: draft.description,
    hashtags: draft.hashtags,
    first_comment: draft.firstComment,
    publish_status: 'draft',
    updated_at: now,
  }))

  const { data: targets, error: targetError } = await supabase
    .from('showroom_shorts_targets')
    .insert(targetRows)
    .select('*')

  if (targetError) {
    throw new Error(targetError.message)
  }

  try {
    await requestShowroomShortsGeneration(String(job.id))
  } catch (error) {
    console.warn('[showroomShorts] generation request failed', error)
  }

  return {
    job: mapShortsJobRow(job),
    targets: (targets ?? []).map(mapShortsTargetRow),
  }
}

function mapShortsTargetRow(row: Record<string, unknown>): ShowroomShortsTargetRecord {
  return {
    id: String(row.id ?? ''),
    shorts_job_id: String(row.shorts_job_id ?? ''),
    channel: normalizeChannel(row.channel),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags.map((item) => String(item)) : [],
    first_comment: String(row.first_comment ?? ''),
    publish_status: normalizePublishStatus(row.publish_status),
    external_post_id: trimOrNull(typeof row.external_post_id === 'string' ? row.external_post_id : null),
    approved_at: trimOrNull(typeof row.approved_at === 'string' ? row.approved_at : null),
    published_at: trimOrNull(typeof row.published_at === 'string' ? row.published_at : null),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapShortsJobRow(row: Record<string, unknown>): ShowroomShortsJobRecord {
  return {
    id: String(row.id ?? ''),
    status: normalizeJobStatus(row.status),
    prompt_text: String(row.prompt_text ?? ''),
    before_asset_id: String(row.before_asset_id ?? ''),
    after_asset_id: String(row.after_asset_id ?? ''),
    before_asset_url: trimOrNull(typeof row.before_asset_url === 'string' ? row.before_asset_url : null),
    after_asset_url: trimOrNull(typeof row.after_asset_url === 'string' ? row.after_asset_url : null),
    before_after_group_key: trimOrNull(typeof row.before_after_group_key === 'string' ? row.before_after_group_key : null),
    source_video_url: trimOrNull(typeof row.source_video_url === 'string' ? row.source_video_url : null),
    final_video_url: trimOrNull(typeof row.final_video_url === 'string' ? row.final_video_url : null),
    requested_channels: Array.isArray(row.requested_channels)
      ? row.requested_channels.map((item) => normalizeChannel(item))
      : [],
    kling_job_id: trimOrNull(typeof row.kling_job_id === 'string' ? row.kling_job_id : null),
    kling_status: trimOrNull(typeof row.kling_status === 'string' ? row.kling_status : null),
    source_aspect_ratio: String(row.source_aspect_ratio ?? '16:9'),
    final_aspect_ratio: String(row.final_aspect_ratio ?? '9:16'),
    duration_seconds: Number(row.duration_seconds ?? 10),
    is_muted: Boolean(row.is_muted ?? true),
    created_by: trimOrNull(typeof row.created_by === 'string' ? row.created_by : null),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function normalizeChannel(value: unknown): ShowroomShortsChannel {
  return value === 'facebook' || value === 'instagram' ? value : 'youtube'
}

function normalizeJobStatus(value: unknown): ShowroomShortsJobStatus {
  return SHOWROOM_SHORTS_JOB_STATUSES.includes(value as ShowroomShortsJobStatus)
    ? (value as ShowroomShortsJobStatus)
    : 'draft'
}

function normalizePublishStatus(value: unknown): ShowroomShortsPublishStatus {
  return SHOWROOM_SHORTS_PUBLISH_STATUSES.includes(value as ShowroomShortsPublishStatus)
    ? (value as ShowroomShortsPublishStatus)
    : 'draft'
}

export async function listShowroomShortsJobs() {
  const [{ data: jobs, error: jobsError }, { data: targets, error: targetsError }] = await Promise.all([
    supabase
      .from('showroom_shorts_jobs')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('showroom_shorts_targets')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  if (jobsError) throw new Error(jobsError.message)
  if (targetsError) throw new Error(targetsError.message)

  const targetsByJobId = new Map<string, ShowroomShortsTargetRecord[]>()
  for (const row of targets ?? []) {
    const mapped = mapShortsTargetRow(row as Record<string, unknown>)
    const bucket = targetsByJobId.get(mapped.shorts_job_id) ?? []
    bucket.push(mapped)
    targetsByJobId.set(mapped.shorts_job_id, bucket)
  }

  return (jobs ?? []).map((row) => {
    const mapped = mapShortsJobRow(row as Record<string, unknown>)
    return {
      ...mapped,
      targets: targetsByJobId.get(mapped.id) ?? [],
    }
  })
}

export async function requestShowroomShortsGeneration(jobId: string) {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    jobId: string
    status: string
    klingTaskId: string | null
    message?: string
  }>('showroom-shorts-create', {
    body: { jobId },
  })

  if (error) {
    throw new Error(error.message)
  }
  if (!data?.ok) {
    throw new Error(data?.message ?? 'Kling 생성 요청에 실패했습니다.')
  }
  return data
}

export async function pollShowroomShortsJob(jobId: string) {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    jobId: string
    status: string
    klingStatus?: string | null
    sourceVideoUrl?: string | null
    finalVideoUrl?: string | null
    message?: string
  }>('showroom-shorts-poll', {
    body: { jobId },
  })

  if (error) {
    throw new Error(error.message)
  }
  if (!data?.ok) {
    throw new Error(data?.message ?? '숏츠 작업 상태 조회에 실패했습니다.')
  }
  return data
}
