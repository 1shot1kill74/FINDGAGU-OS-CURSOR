import { supabase } from '@/lib/supabase'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/imageAssetService'
import { getShowroomShortsWorkerUrl } from '@/lib/config'

export const SHOWROOM_SHORTS_CHANNELS = ['youtube', 'facebook', 'instagram'] as const

export type ShowroomShortsChannel = (typeof SHOWROOM_SHORTS_CHANNELS)[number]

export const SHOWROOM_SHORTS_JOB_STATUSES = [
  'draft',
  'requested',
  'generating',
  'generated',
  'composition_queued',
  'composition_processing',
  'composited',
  'ready_for_review',
  'failed',
] as const

export type ShowroomShortsJobStatus = (typeof SHOWROOM_SHORTS_JOB_STATUSES)[number]

export const SHOWROOM_SHORTS_PUBLISH_STATUSES = [
  'draft',
  'ready',
  'preparing',
  'launch_ready',
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
  external_post_url: string | null
  preparation_payload: Record<string, unknown> | null
  preparation_error: string | null
  approved_at: string | null
  prepared_at: string | null
  launch_ready_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface ShowroomShortsLogRecord {
  id: string
  shorts_job_id: string
  target_id: string | null
  stage: string
  message: string
  payload?: Record<string, unknown> | null
  created_at: string
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
  recent_logs?: ShowroomShortsLogRecord[]
}

export interface ShowroomShortsWorkerJobStatus {
  ok: boolean
  jobId: string
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed'
  jobStatus?: string
  sourceVideoUrl?: string | null
  finalVideoUrl?: string | null
  error?: string | null
  message?: string
}

export interface ShowroomShortsPublishDispatchResult {
  ok: boolean
  action: 'prepare' | 'launch'
  status: ShowroomShortsPublishStatus | 'published'
  mode?: 'mock' | 'live'
  message?: string
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

function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stripShowroomStagePrefix(value: string | null | undefined): string | null {
  const normalized = trimOrNull(value)?.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  const stripped = normalized.replace(/^(견적|완료)\s+/u, '').trim()
  return stripped || normalized
}

function getCanonicalSiteName(image: ShowroomImageAsset): string | null {
  return (
    stripShowroomStagePrefix(image.canonical_site_name) ||
    stripShowroomStagePrefix(image.site_name)
  )
}

function normalizeComparableText(value: string | null | undefined): string | null {
  const normalized = trimOrNull(value)?.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalized || null
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
  const beforeSpaceId = trimOrNull(beforeImage.space_id)
  const afterSpaceId = trimOrNull(afterImage.space_id)
  const beforeSiteName = normalizeComparableText(getCanonicalSiteName(beforeImage))
  const afterSiteName = normalizeComparableText(getCanonicalSiteName(afterImage))

  const sameGroup = !!beforeGroupKey && !!afterGroupKey && beforeGroupKey === afterGroupKey
  const sameSpace = !!beforeSpaceId && !!afterSpaceId && beforeSpaceId === afterSpaceId
  const sameSite = !!beforeSiteName && !!afterSiteName && beforeSiteName === afterSiteName

  if (!sameGroup && !sameSpace && !sameSite) {
    return {
      ok: false,
      code: 'group_mismatch',
      message: '같은 현장의 Before 1장과 After 1장을 선택해야 합니다.',
    }
  }

  const siteName = getCanonicalSiteName(beforeImage) || getCanonicalSiteName(afterImage) || '선택 현장'
  const resolvedGroupKey =
    beforeGroupKey ||
    afterGroupKey ||
    (sameSpace ? `space:${beforeSpaceId}` : null) ||
    (sameSite ? `site:${beforeSiteName}` : null)

  return {
    ok: true,
    beforeImage,
    afterImage,
    groupKey: resolvedGroupKey ?? 'site:unknown',
    message: `${siteName} Before/After 숏츠를 만들 준비가 되었습니다.`,
  }
}

function buildHashtags(images: ShowroomImageAsset[]): string[] {
  const meta = images[0]
  const industry = trimOrNull(meta?.business_type)
  const tags = ['#사무실인테리어', '#사무실가구', '#사무용가구', '#사무실꾸미기', '#파인드가구']
  
  if (industry && industry !== '기타') {
    tags.push(`#${industry.replace(/\s+/g, '')}인테리어`)
  }
  
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

    const openShowroomTitle =
      trimOrNull(selection.afterImage.external_display_name) ||
      trimOrNull(selection.beforeImage.external_display_name) ||
      siteName
    const industry = trimOrNull(selection.afterImage.business_type) || trimOrNull(selection.beforeImage.business_type)
    const industryLine = industry && industry !== '기타'
      ? `${industry} 업종 공간 구성과 사무가구 배치 아이디어가 필요하신 분들께 특히 참고가 되는 사례입니다.`
      : '사무공간은 가구 배치와 레이아웃만 달라져도 업무 몰입도와 공간 인상이 크게 달라질 수 있습니다.'

  return {
    title: `${openShowroomTitle} Before & After | 10초 숏츠`,
    description: [
      `${openShowroomTitle}의 Before & After 공간 변화입니다.`,
      '',
      '실제 현장 사진을 바탕으로 제작한 오피스 스타일링 전후 비교 사례입니다.',
      industryLine,
      '사무실 인테리어와 사무용 가구 구성이 고민되신다면 파인드가구 온라인 쇼룸에서 더 다양한 사례를 확인하실 수 있습니다.',
    ].join('\n'),
    hashtags: buildHashtags(images),
    firstComment: `${openShowroomTitle}처럼 업종에 맞는 사무공간 구성이 필요하신가요? 가장 궁금한 포인트를 댓글로 남겨주세요.`,
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
    throw new Error('생성 프롬프트를 입력하세요.')
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

/** 유튜브만 저장된 레거시 작업에 페이스북·인스타 타깃 행을 채워 3열 검수 UI가 다시 나오도록 합니다. */
export async function ensureShowroomShortsTripleTargets(jobId: string): Promise<{ inserted: number }> {
  const nowIso = new Date().toISOString()

  const { data: rows, error: targetsError } = await supabase
    .from('showroom_shorts_targets')
    .select('*')
    .eq('shorts_job_id', jobId)

  if (targetsError) {
    throw new Error(targetsError.message)
  }

  const list = (rows ?? []) as Record<string, unknown>[]
  const byChannel = new Map<ShowroomShortsChannel, Record<string, unknown>>()
  for (const row of list) {
    byChannel.set(normalizeChannel(row.channel), row)
  }

  const template =
    byChannel.get('youtube') ?? byChannel.get('facebook') ?? byChannel.get('instagram') ?? list[0]
  if (!template) {
    throw new Error('기존 타깃이 없어 채널 행을 추가할 수 없습니다.')
  }

  const title = String(template.title ?? '')
  const description = String(template.description ?? '')
  const hashtags = Array.isArray(template.hashtags) ? template.hashtags.map((item) => String(item)) : []
  const firstComment = String(template.first_comment ?? '')

  const inserts: Array<Record<string, unknown>> = []
  for (const channel of SHOWROOM_SHORTS_CHANNELS) {
    if (byChannel.has(channel)) continue
    inserts.push({
      shorts_job_id: jobId,
      channel,
      title,
      description,
      hashtags,
      first_comment: firstComment,
      publish_status: 'draft',
      updated_at: nowIso,
    })
  }

  if (inserts.length === 0) {
    return { inserted: 0 }
  }

  const { error: insertError } = await supabase.from('showroom_shorts_targets').insert(inserts)
  if (insertError) {
    throw new Error(insertError.message)
  }

  const { error: jobError } = await supabase
    .from('showroom_shorts_jobs')
    .update({
      requested_channels: [...SHOWROOM_SHORTS_CHANNELS],
      updated_at: nowIso,
    })
    .eq('id', jobId)

  if (jobError) {
    throw new Error(jobError.message)
  }

  return { inserted: inserts.length }
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
    external_post_url: trimOrNull(typeof row.external_post_url === 'string' ? row.external_post_url : null),
    preparation_payload: asJsonRecord(row.preparation_payload),
    preparation_error: trimOrNull(typeof row.preparation_error === 'string' ? row.preparation_error : null),
    approved_at: trimOrNull(typeof row.approved_at === 'string' ? row.approved_at : null),
    prepared_at: trimOrNull(typeof row.prepared_at === 'string' ? row.prepared_at : null),
    launch_ready_at: trimOrNull(typeof row.launch_ready_at === 'string' ? row.launch_ready_at : null),
    published_at: trimOrNull(typeof row.published_at === 'string' ? row.published_at : null),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapShortsLogRow(row: Record<string, unknown>): ShowroomShortsLogRecord {
  return {
    id: String(row.id ?? ''),
    shorts_job_id: String(row.shorts_job_id ?? ''),
    target_id: trimOrNull(typeof row.target_id === 'string' ? row.target_id : null),
    stage: String(row.stage ?? ''),
    message: String(row.message ?? ''),
    payload: asJsonRecord(row.payload),
    created_at: String(row.created_at ?? ''),
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
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'youtube' || raw === 'facebook' || raw === 'instagram') return raw
  return 'youtube'
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
  const [
    { data: jobs, error: jobsError },
    { data: targets, error: targetsError },
    { data: logs, error: logsError },
  ] = await Promise.all([
    supabase
      .from('showroom_shorts_jobs')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('showroom_shorts_targets')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('showroom_shorts_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (jobsError) throw new Error(jobsError.message)
  if (targetsError) throw new Error(targetsError.message)
  if (logsError) throw new Error(logsError.message)

  const targetsByJobId = new Map<string, ShowroomShortsTargetRecord[]>()
  for (const row of targets ?? []) {
    const mapped = mapShortsTargetRow(row as Record<string, unknown>)
    const bucket = targetsByJobId.get(mapped.shorts_job_id) ?? []
    bucket.push(mapped)
    targetsByJobId.set(mapped.shorts_job_id, bucket)
  }

  const logsByJobId = new Map<string, ShowroomShortsLogRecord[]>()
  for (const row of logs ?? []) {
    const mapped = mapShortsLogRow(row as Record<string, unknown>)
    const bucket = logsByJobId.get(mapped.shorts_job_id) ?? []
    if (bucket.length < 5) bucket.push(mapped)
    logsByJobId.set(mapped.shorts_job_id, bucket)
  }

  return (jobs ?? []).map((row) => {
    const mapped = mapShortsJobRow(row as Record<string, unknown>)
    return {
      ...mapped,
      targets: targetsByJobId.get(mapped.id) ?? [],
      recent_logs: logsByJobId.get(mapped.id) ?? [],
    }
  })
}

export async function requestShowroomShortsGeneration(jobId: string) {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    jobId: string
    status: string
    klingTaskId: string | null
    provider?: string
    upstreamStatus?: number
    requestBaseUrl?: string
    message?: string
  }>('showroom-shorts-create', {
    body: { jobId },
  })

  if (error) {
    const fallbackMessage = typeof error.message === 'string' ? error.message : '원본 생성 요청에 실패했습니다.'
    const detailedMessage =
      typeof error.context === 'string' && error.context.trim()
        ? (() => {
            try {
              const parsed = JSON.parse(error.context) as {
                message?: string
                provider?: string
                requestBaseUrl?: string
                upstreamStatus?: number
              }
              const parts = [parsed.message, parsed.provider ? `provider=${parsed.provider}` : null, parsed.upstreamStatus ? `status=${parsed.upstreamStatus}` : null]
                .filter(Boolean)
                .join(' | ')
              return parts || fallbackMessage
            } catch {
              return fallbackMessage
            }
          })()
        : fallbackMessage
    throw new Error(detailedMessage)
  }
  if (!data?.ok) {
    throw new Error(data?.message ?? '원본 생성 요청에 실패했습니다.')
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
    provider?: string
    upstreamStatus?: number
    requestBaseUrl?: string
    message?: string
  }>('showroom-shorts-poll', {
    body: { jobId },
  })

  if (error) {
    const fallbackMessage = typeof error.message === 'string' ? error.message : '숏츠 작업 상태 조회에 실패했습니다.'
    const detailedMessage =
      typeof error.context === 'string' && error.context.trim()
        ? (() => {
            try {
              const parsed = JSON.parse(error.context) as {
                message?: string
                provider?: string
                requestBaseUrl?: string
                upstreamStatus?: number
              }
              const parts = [parsed.message, parsed.provider ? `provider=${parsed.provider}` : null, parsed.upstreamStatus ? `status=${parsed.upstreamStatus}` : null]
                .filter(Boolean)
                .join(' | ')
              return parts || fallbackMessage
            } catch {
              return fallbackMessage
            }
          })()
        : fallbackMessage
    throw new Error(detailedMessage)
  }
  if (!data?.ok) {
    throw new Error(data?.message ?? '숏츠 작업 상태 조회에 실패했습니다.')
  }
  return data
}

async function callShowroomShortsWorker<T>(pathname: string, init?: RequestInit): Promise<T> {
  const workerUrl = getShowroomShortsWorkerUrl()
  const response = await fetch(`${workerUrl}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const data = (await response.json().catch(() => null)) as (T & { message?: string }) | null
  if (!response.ok || !data) {
    throw new Error(data?.message ?? 'Railway 워커 요청에 실패했습니다.')
  }

  return data
}

export async function requestShowroomShortsComposition(jobId: string) {
  return callShowroomShortsWorker<ShowroomShortsWorkerJobStatus>('', {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  })
}

export async function getShowroomShortsCompositionStatus(jobId: string) {
  return callShowroomShortsWorker<ShowroomShortsWorkerJobStatus>(`?jobId=${encodeURIComponent(jobId)}`, {
    method: 'GET',
  })
}

export async function requestShowroomShortsPublishPrepare(targetId: string) {
  const { data, error } = await supabase.functions.invoke<ShowroomShortsPublishDispatchResult>(
    'showroom-shorts-publish-dispatch',
    {
      body: { targetId, action: 'prepare' },
    }
  )

  if (error) {
    throw new Error(typeof error.message === 'string' ? error.message : '업로드 준비 요청에 실패했습니다.')
  }
  if (!data?.ok) {
    throw new Error(data?.message ?? '업로드 준비 요청에 실패했습니다.')
  }
  return data
}

export async function requestShowroomShortsPublishLaunch(targetId: string) {
  const { data, error } = await supabase.functions.invoke<ShowroomShortsPublishDispatchResult>(
    'showroom-shorts-publish-dispatch',
    {
      body: { targetId, action: 'launch' },
    }
  )

  if (error) {
    throw new Error(typeof error.message === 'string' ? error.message : '론칭 승인 요청에 실패했습니다.')
  }
  if (!data?.ok) {
    throw new Error(data?.message ?? '론칭 승인 요청에 실패했습니다.')
  }
  return data
}

export async function deleteShowroomShortsJob(
  job: Pick<ShowroomShortsJobRecord, 'id' | 'status' | 'targets'>
) {
  const hasActivePublish =
    (job.targets ?? []).some((target) => ['preparing', 'publishing'].includes(target.publish_status))

  if (job.status === 'composition_queued' || job.status === 'composition_processing' || hasActivePublish) {
    throw new Error('현재 진행 중인 숏츠 작업은 삭제할 수 없습니다. 먼저 작업이 끝날 때까지 기다려주세요.')
  }

  const { error: logsError } = await supabase
    .from('showroom_shorts_logs')
    .delete()
    .eq('shorts_job_id', job.id)

  if (logsError) {
    throw new Error(logsError.message)
  }

  const { error: targetsError } = await supabase
    .from('showroom_shorts_targets')
    .delete()
    .eq('shorts_job_id', job.id)

  if (targetsError) {
    throw new Error(targetsError.message)
  }

  const { error: jobError } = await supabase
    .from('showroom_shorts_jobs')
    .delete()
    .eq('id', job.id)

  if (jobError) {
    throw new Error(jobError.message)
  }
}

export async function deleteFailedShowroomShortsJob(job: Pick<ShowroomShortsJobRecord, 'id' | 'status' | 'targets'>) {
  if (job.status !== 'failed') {
    throw new Error('실패한 숏츠 작업만 삭제할 수 있습니다.')
  }

  await deleteShowroomShortsJob(job)
}

async function insertShortsTargetLog(params: {
  jobId: string
  targetId: string
  stage: string
  message: string
  payload?: Record<string, unknown>
}) {
  await supabase.from('showroom_shorts_logs').insert({
    shorts_job_id: params.jobId,
    target_id: params.targetId,
    stage: params.stage,
    message: params.message,
    payload: params.payload ?? {},
  })
}

function joinHashtags(hashtags: string[]) {
  return hashtags.join(' ').trim()
}

function pickPreparationString(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractHashtagsText(value: string | null | undefined) {
  const matches = value?.match(/#[^\s#]+/g) ?? []
  return matches.join(' ').trim()
}

export function buildShowroomShortsPublishPackage(target: ShowroomShortsTargetRecord) {
  const preparation = target.preparation_payload
  const fallbackHashtagsText = joinHashtags(target.hashtags)
  const preparedTitle =
    pickPreparationString(preparation, ['preparedTitle', 'title', 'videoTitle'])
    ?? target.title
  const preparedBody =
    pickPreparationString(preparation, ['descriptionWithHashtags', 'caption'])
    ?? [target.description.trim(), fallbackHashtagsText].filter(Boolean).join('\n\n')
  const preparedCaption =
    pickPreparationString(preparation, ['caption', 'descriptionWithHashtags'])
    ?? preparedBody
  const hashtagsText =
    pickPreparationString(preparation, ['hashtagsText'])
    ?? extractHashtagsText(preparedBody)
    ?? fallbackHashtagsText
  const preparedDescription =
    pickPreparationString(preparation, ['description', 'preparedDescription'])
    ?? target.description
  const preparedFirstComment =
    pickPreparationString(preparation, ['firstComment', 'comment'])
    ?? target.first_comment

  return {
    title: preparedTitle,
    description: preparedDescription,
    hashtagsText,
    firstComment: preparedFirstComment,
    descriptionWithHashtags: preparedBody,
    caption: preparedCaption,
  }
}

export async function markShowroomShortsTargetsReady(jobId: string) {
  const nowIso = new Date().toISOString()
  const { data: targets, error } = await supabase
    .from('showroom_shorts_targets')
    .update({
      publish_status: 'ready',
      updated_at: nowIso,
    })
    .eq('shorts_job_id', jobId)
    .in('publish_status', ['draft', 'failed'])
    .select('*')

  if (error) {
    throw new Error(error.message)
  }

  await Promise.all(
    (targets ?? []).map((target) =>
      insertShortsTargetLog({
        jobId,
        targetId: String(target.id),
        stage: 'publish_ready',
        message: '업로드 준비가 완료되었습니다.',
        payload: { channel: target.channel },
      })
    )
  )

  return (targets ?? []).map((target) => mapShortsTargetRow(target as Record<string, unknown>))
}

export async function approveShowroomShortsTarget(targetId: string) {
  const nowIso = new Date().toISOString()
  const { data: target, error } = await supabase
    .from('showroom_shorts_targets')
    .update({
      publish_status: 'approved',
      approved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !target) {
    throw new Error(error?.message ?? '업로드 승인 처리에 실패했습니다.')
  }

  const mapped = mapShortsTargetRow(target as Record<string, unknown>)
  await insertShortsTargetLog({
    jobId: mapped.shorts_job_id,
    targetId: mapped.id,
    stage: 'publish_approved',
    message: `${mapped.channel} 업로드를 승인했습니다.`,
    payload: { channel: mapped.channel },
  })

  return mapped
}

export async function updateShowroomShortsTargetPreparation(
  targetId: string,
  payload: {
    title: string
    descriptionWithHashtags: string
    firstComment: string
  }
) {
  const nowIso = new Date().toISOString()
  
  // 1. Fetch current target to get existing preparation_payload
  const { data: currentTarget, error: fetchError } = await supabase
    .from('showroom_shorts_targets')
    .select('preparation_payload')
    .eq('id', targetId)
    .single()

  if (fetchError || !currentTarget) {
    throw new Error(fetchError?.message ?? '타깃 정보를 불러오지 못했습니다.')
  }

  // 2. Merge new values into existing payload
  const existingPayload = currentTarget.preparation_payload || {}
  const hashtagsText = extractHashtagsText(payload.descriptionWithHashtags)
  const nextPayload = {
    ...existingPayload,
    title: payload.title,
    preparedTitle: payload.title,
    descriptionWithHashtags: payload.descriptionWithHashtags,
    description: payload.descriptionWithHashtags,
    caption: payload.descriptionWithHashtags, // for fb/insta
    hashtagsText,
    firstComment: payload.firstComment,
  }

  // 3. Update the target
  const { data: target, error } = await supabase
    .from('showroom_shorts_targets')
    .update({
      preparation_payload: nextPayload,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !target) {
    throw new Error(error?.message ?? '준비 내용 수정에 실패했습니다.')
  }

  const mapped = mapShortsTargetRow(target as Record<string, unknown>)
  await insertShortsTargetLog({
    jobId: mapped.shorts_job_id,
    targetId: mapped.id,
    stage: 'preparation_edited',
    message: `${mapped.channel} 업로드 준비 내용을 수동으로 수정했습니다.`,
    payload: { channel: mapped.channel },
  })

  return mapped
}

export async function markShowroomShortsTargetPublished(
  targetId: string,
  payload?: { externalPostId?: string | null; externalPostUrl?: string | null }
) {
  const nowIso = new Date().toISOString()
  const { data: target, error } = await supabase
    .from('showroom_shorts_targets')
    .update({
      publish_status: 'published',
      external_post_id: trimOrNull(payload?.externalPostId),
      external_post_url: trimOrNull(payload?.externalPostUrl),
      published_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !target) {
    throw new Error(error?.message ?? '게시 완료 처리에 실패했습니다.')
  }

  const mapped = mapShortsTargetRow(target as Record<string, unknown>)
  await insertShortsTargetLog({
    jobId: mapped.shorts_job_id,
    targetId: mapped.id,
    stage: 'publish_completed',
    message: `${mapped.channel} 게시를 완료했습니다.`,
    payload: {
      channel: mapped.channel,
      external_post_id: mapped.external_post_id,
      external_post_url: mapped.external_post_url,
    },
  })

  return mapped
}

export async function markShowroomShortsTargetFailed(targetId: string) {
  const nowIso = new Date().toISOString()
  const { data: target, error } = await supabase
    .from('showroom_shorts_targets')
    .update({
      publish_status: 'failed',
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !target) {
    throw new Error(error?.message ?? '업로드 실패 상태 저장에 실패했습니다.')
  }

  const mapped = mapShortsTargetRow(target as Record<string, unknown>)
  await insertShortsTargetLog({
    jobId: mapped.shorts_job_id,
    targetId: mapped.id,
    stage: 'publish_failed',
    message: `${mapped.channel} 업로드를 실패로 표시했습니다.`,
    payload: { channel: mapped.channel },
  })

  return mapped
}

function getShowroomShortsJobGroupKeys(job: ShowroomShortsJobRecord, assets: ShowroomImageAsset[]) {
  const keys = new Set<string>()
  if (job.before_after_group_key?.trim()) {
    keys.add(job.before_after_group_key.trim())
  }

  const beforeAsset = assets.find((asset) => asset.id === job.before_asset_id)
  const afterAsset = assets.find((asset) => asset.id === job.after_asset_id)

  const beforeKey = beforeAsset ? buildShowroomShortsGroupKey(beforeAsset) : null
  const afterKey = afterAsset ? buildShowroomShortsGroupKey(afterAsset) : null

  if (beforeKey) keys.add(beforeKey)
  if (afterKey) keys.add(afterKey)

  return {
    keys,
    beforeAsset,
    afterAsset,
    canonicalSiteNames: new Set(
      [beforeAsset, afterAsset]
        .map((asset) => (asset ? normalizeComparableText(getCanonicalSiteName(asset)) : null))
        .filter((value): value is string => Boolean(value))
    ),
  }
}

export async function listShowroomShortsReplacementCandidates(
  job: ShowroomShortsJobRecord,
  role: 'before' | 'after'
) {
  const assets = await fetchShowroomImageAssets()
  const context = getShowroomShortsJobGroupKeys(job, assets)

  const candidates = assets
    .filter((asset) => asset.before_after_role === role)
    .filter((asset) => {
      const groupKey = buildShowroomShortsGroupKey(asset)
      if (groupKey && context.keys.has(groupKey)) return true
      const canonicalSiteName = normalizeComparableText(getCanonicalSiteName(asset))
      return canonicalSiteName ? context.canonicalSiteNames.has(canonicalSiteName) : false
    })
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return bTime - aTime
    })

  return candidates
}

export async function replaceShowroomShortsJobImage(
  job: ShowroomShortsJobRecord,
  role: 'before' | 'after',
  assetId: string
) {
  const assets = await fetchShowroomImageAssets()
  const context = getShowroomShortsJobGroupKeys(job, assets)
  const replacement = assets.find((asset) => asset.id === assetId)

  if (!replacement) {
    throw new Error('선택한 이미지를 찾지 못했습니다.')
  }
  if (replacement.before_after_role !== role) {
    throw new Error(`${role === 'before' ? 'Before' : 'After'} 역할의 이미지만 선택할 수 있습니다.`)
  }

  const currentBefore = role === 'before' ? replacement : context.beforeAsset
  const currentAfter = role === 'after' ? replacement : context.afterAsset

  if (!currentBefore || !currentAfter) {
    throw new Error('현재 작업의 Before/After 이미지를 불러오지 못했습니다.')
  }

  const selection = validateBeforeAfterSelection([currentBefore, currentAfter])
  if (!selection.ok) {
    throw new Error(selection.message)
  }

  const nowIso = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('showroom_shorts_jobs')
    .update({
      before_asset_id: selection.beforeImage.id,
      after_asset_id: selection.afterImage.id,
      before_asset_url: selection.beforeImage.cloudinary_url || selection.beforeImage.thumbnail_url,
      after_asset_url: selection.afterImage.cloudinary_url || selection.afterImage.thumbnail_url,
      before_after_group_key: selection.groupKey,
      status: 'draft',
      kling_job_id: null,
      kling_status: null,
      source_video_url: null,
      final_video_url: null,
      updated_at: nowIso,
    })
    .eq('id', job.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  await supabase.from('showroom_shorts_logs').insert({
    shorts_job_id: job.id,
    stage: 'assets_replaced',
    message: `${role === 'before' ? 'Before' : 'After'} 이미지를 같은 현장 사진으로 교체했습니다.`,
    payload: {
      before_asset_id: selection.beforeImage.id,
      after_asset_id: selection.afterImage.id,
    },
  })
}
