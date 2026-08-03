/**
 * 광고 대기실(덧붙임) — 기존 쇼룸/케이스 스튜디오와 분리.
 * 현장 카드 → 사진 입고 → BA 페어 → 클링 숏츠 job 연결.
 */
import { supabase } from '@/lib/supabase'
import { uploadEngine } from '@/lib/uploadEngine'
import { insertImageAsset, setImageAssetMain } from '@/lib/imageAssetUploadService'
import { isCloudinaryConfigured } from '@/lib/imageAssetCloudinary'
import {
  buildBroadExternalDisplayName,
  buildExternalDisplayName,
  parseBeforeAfterMeta,
  parseImageAssetMeta,
} from '@/lib/imageAssetMeta'
import type { SpaceDisplayNameOption } from '@/lib/imageAssetUploadService'
import type { Json } from '@/types/database'
import {
  fetchShowroomImageAssets,
  replaceShowroomAssetImageUrls,
  type ShowroomImageAsset,
} from '@/lib/imageAssetShowroom'
import {
  SHOWROOM_SHORTS_CHANNELS,
  createShowroomShortsJob,
  getShowroomShortsJob,
  listShowroomShortsJobsByAssetIds,
  listShowroomShortsJobsByBeforeAssetIds,
  listShowroomShortsJobsForGroupKey,
  validateBeforeAfterSelection,
  type ShowroomShortsChannel,
  type ShowroomShortsJobRecord,
  type ShowroomShortsPublishStatus,
  type ShowroomShortsTargetRecord,
} from '@/lib/showroomShorts'
import {
  SHOWROOM_SHORTS_EMPTY_ROOM_TIMELAPSE_PROMPT,
  SHOWROOM_SHORTS_TIMELAPSE_PROMPT,
} from '@/lib/showroomShortsTimelapsePrompt'

export type { ShowroomShortsJobRecord as AdInboxTimelapseJob }

export const AD_INBOX_SOURCE = 'ad_inbox'
export const AD_INBOX_CATEGORY = 'ad_inbox'

/** @deprecated 공통 프롬프트로 통일 — SHOWROOM_SHORTS_TIMELAPSE_PROMPT 사용 */
export const AD_INBOX_DEFAULT_PROMPT = SHOWROOM_SHORTS_TIMELAPSE_PROMPT

export type AdInboxRole = 'before' | 'after' | 'unset'
export type AdInboxSiteStatus = 'open' | 'promoted' | 'archived'

/** 현장 카드 작업 진행: 사진만 → 릴스 제작 → 합성(최종 MP4) 완료 */
export type AdInboxWorkProgress = 'waiting' | 'working' | 'done'

export type AdInboxChannelPublishState = {
  channel: ShowroomShortsChannel
  /** 타깃 없음이면 none */
  status: ShowroomShortsPublishStatus | 'none'
  externalPostUrl: string | null
  publishedAt: string | null
  /** 발행예정 시각 (ISO). scheduled 상태일 때 */
  scheduledAt: string | null
}

export type AdInboxBatchWorkState = {
  progress: AdInboxWorkProgress
  /** 합성(최종 MP4) 완료 시각 — job.updated_at 기준 */
  completedAt: string | null
  /** 채널 업로드 완료일 — 세 채널 published_at 중 가장 늦은 시각 */
  uploadedAt: string | null
  /** 카드에 걸린 발행예정 시각 — 채널 scheduled_at 중 가장 이른 것 */
  scheduledAt: string | null
  /** 채널별 업로드(게시) 상태 — 카드 버튼용 */
  channels: AdInboxChannelPublishState[]
}

export type AdInboxAsset = ShowroomImageAsset & {
  photo_date: string | null
  ad_inbox: true
  original_name?: string | null
  ad_inbox_site_id?: string | null
  /** 외부 쇼룸 승격 여부 (is_consultation) */
  is_consultation?: boolean
  promoted_at?: string | null
  /**
   * BA 쇼룸 가져오기 등으로 job에만 연결된 쇼룸 원본.
   * 대기실 그리드에 빌려 보여 주며, BA 메타/삭제는 쓰지 않는다.
   */
  linked_from_showroom_job?: boolean
}

export type AdInboxSite = {
  id: string
  short_name: string
  photo_date: string | null
  status: AdInboxSiteStatus
  created_at: string
  updated_at: string
}

/** UI용: 현장 카드 + 소속 사진 */
export type AdInboxBatch = {
  key: string
  siteId: string
  label: string
  photoDate: string
  shortName: string
  assets: AdInboxAsset[]
  beforeCount: number
  afterCount: number
  unsetCount: number
  /** 외부 쇼룸 승격 완료 장수 */
  promotedCount: number
  /** 아직 쇼룸 미승격 장수 */
  waitingPromoteCount: number
  status: AdInboxSiteStatus
}

export function formatAdInboxWorkCompletedDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  })
}

export function adInboxWorkProgressLabel(
  progress: AdInboxWorkProgress,
  completedAt?: string | null,
): string {
  if (progress === 'working') return '작업중'
  if (progress === 'done') {
    const date = formatAdInboxWorkCompletedDate(completedAt)
    return date ? `작업완료 ${date}` : '작업완료'
  }
  return '대기중'
}

export function adInboxChannelShortLabel(channel: ShowroomShortsChannel): string {
  if (channel === 'youtube') return 'YT'
  if (channel === 'facebook') return 'FB'
  return 'IG'
}

export function adInboxWorkProgressBadgeClass(progress: AdInboxWorkProgress): string {
  if (progress === 'working') return 'bg-sky-50 text-sky-800'
  if (progress === 'done') return 'bg-emerald-50 text-emerald-800'
  return 'bg-neutral-100 text-neutral-600'
}

function adInboxChannelPublishTone(
  status: AdInboxChannelPublishState['status'],
): 'idle' | 'active' | 'done' | 'failed' {
  if (status === 'published') return 'done'
  if (status === 'failed') return 'failed'
  if (
    ['preparing', 'launch_ready', 'approved', 'scheduled', 'publishing', 'ready'].includes(status)
  ) {
    return 'active'
  }
  return 'idle'
}

export function adInboxChannelPublishButtonClass(
  status: AdInboxChannelPublishState['status'],
): string {
  const tone = adInboxChannelPublishTone(status)
  if (tone === 'done') return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
  if (tone === 'failed') return 'bg-red-50 text-red-700 ring-1 ring-red-200'
  if (tone === 'active') return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
  return 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200'
}

export function adInboxChannelPublishTitle(state: AdInboxChannelPublishState): string {
  const label =
    state.channel === 'youtube'
      ? 'YouTube'
      : state.channel === 'facebook'
        ? 'Facebook'
        : 'Instagram'
  if (state.status === 'published') {
    return state.externalPostUrl
      ? `${label} 게시물 열기`
      : `${label} 게시 완료 (공개 링크 없음)`
  }
  if (state.status === 'failed') return `${label} 실패`
  if (state.status === 'scheduled') {
    const when = formatAdInboxScheduledDateTime(state.scheduledAt)
    return when ? `${label} 발행예정 ${when}` : `${label} 발행예정`
  }
  if (adInboxChannelPublishTone(state.status) === 'active') return `${label} 업로드 진행 중`
  return `${label} 대기`
}

/** Instagram Graph media id(숫자)를 /p|/reel 경로에 넣은 URL은 공개 웹에서 열리지 않음 */
function isBrokenInstagramMediaIdWebUrl(url: string): boolean {
  return /(?:www\.)?instagram\.com\/(?:p|reel|tv)\/\d+\/?(?:\?.*)?$/i.test(url.trim())
}

/** n8n 실패 시 placeholder로 남은 youtube-{timestamp} 형태는 공개 URL로 쓸 수 없음 */
function isPlaceholderYoutubeId(id: string): boolean {
  return /^youtube-\d+$/i.test(id.trim())
}

function normalizeFacebookPostUrl(url: string): string {
  const trimmed = url.trim()
  const bareId = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?facebook\.com\/(\d+)\/?(?:\?.*)?$/i)
  if (bareId?.[1]) return `https://www.facebook.com/watch/?v=${bareId[1]}`
  return trimmed
}

function buildChannelPostUrl(channel: ShowroomShortsChannel, id: string): string | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  if (channel === 'youtube') {
    if (isPlaceholderYoutubeId(trimmed)) return null
    return `https://www.youtube.com/shorts/${trimmed}`
  }
  if (channel === 'facebook') {
    if (!/^\d+$/.test(trimmed)) return null
    return `https://www.facebook.com/watch/?v=${trimmed}`
  }
  // Graph media id(숫자)로는 공개 URL을 만들 수 없음. shortcode/permalink만 사용.
  if (/^\d+$/.test(trimmed)) return null
  return `https://www.instagram.com/reel/${trimmed}/`
}

/** 콜백 URL이 비어도 channel+id로 열 수 있는 주소 추정 */
export function resolveAdInboxChannelPostUrl(
  target: Pick<ShowroomShortsTargetRecord, 'channel' | 'external_post_id' | 'external_post_url'>,
): string | null {
  const direct = target.external_post_url?.trim()
  if (direct) {
    // Make가 media id를 그대로 URL에 넣은 경우 — 깨진 링크 노출 방지
    if (target.channel === 'instagram' && isBrokenInstagramMediaIdWebUrl(direct)) {
      return null
    }
    if (target.channel === 'youtube') {
      const fromUrl =
        direct.match(/(?:youtube\.com\/(?:shorts|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i)?.[1] ??
        null
      if (fromUrl && !isPlaceholderYoutubeId(fromUrl)) {
        return `https://www.youtube.com/shorts/${fromUrl}`
      }
      // placeholder URL이면 id로 재시도
    } else if (target.channel === 'facebook') {
      return normalizeFacebookPostUrl(direct)
    } else {
      return direct
    }
  }
  const id = target.external_post_id?.trim()
  if (!id) return null
  return buildChannelPostUrl(target.channel, id)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** publish_completed 로그에서 공개로 열 수 있는 원본 링크 추출 */
function extractPostUrlFromPublishLogPayload(
  channel: ShowroomShortsChannel,
  payload: unknown,
): { externalPostId: string | null; externalPostUrl: string | null } {
  const root = asRecord(payload)
  const nested = asRecord(root?.payload)
  const youtubeResponse = asRecord(nested?.youtubeResponse) ?? asRecord(root?.youtubeResponse)

  const uploadId =
    pickString(youtubeResponse, ['uploadId', 'id']) ||
    pickString(asRecord(youtubeResponse?.snippet), ['videoId'])

  const firstCommentUrl = pickString(nested, ['firstCommentUrl']) ?? pickString(root, ['firstCommentUrl'])
  const firstCommentVideoId = firstCommentUrl
    ? firstCommentUrl.match(/(?:[?&]v=|shorts\/)([A-Za-z0-9_-]{6,})/i)?.[1] ?? null
    : null

  const rawId =
    (channel === 'youtube' ? uploadId || firstCommentVideoId : null) ||
    pickString(root, ['external_post_id', 'externalPostId']) ||
    pickString(nested, ['external_post_id', 'externalPostId'])

  const rawUrl =
    pickString(root, ['external_post_url', 'externalPostUrl']) ||
    pickString(nested, ['external_post_url', 'externalPostUrl', 'permalink']) ||
    (channel === 'youtube' && uploadId ? `https://www.youtube.com/shorts/${uploadId}` : null) ||
    (channel === 'youtube' && firstCommentUrl
      ? firstCommentUrl.replace(/\?lc=[^&#]+/i, '').replace(/&lc=[^&#]+/i, '')
      : null)

  const resolved = resolveAdInboxChannelPostUrl({
    channel,
    external_post_id: rawId,
    external_post_url: rawUrl,
  })

  return {
    externalPostId: rawId && !isPlaceholderYoutubeId(rawId) ? rawId : uploadId || firstCommentVideoId,
    externalPostUrl: resolved,
  }
}

/**
 * 게시 완료인데 URL이 비었거나(유튜브 콜백 덮어쓰기) 깨진 경우,
 * publish_completed 로그에서 원본 링크를 복구해 메모리·DB에 반영합니다.
 */
async function recoverPublishedPostUrlsForJobs(
  jobs: ShowroomShortsJobRecord[],
): Promise<ShowroomShortsJobRecord[]> {
  if (jobs.length === 0) return jobs

  const missingTargets = jobs.flatMap((job) =>
    (job.targets ?? []).filter(
      (target) => target.publish_status === 'published' && !resolveAdInboxChannelPostUrl(target),
    ),
  )
  if (missingTargets.length === 0) return jobs

  const jobIds = [...new Set(missingTargets.map((target) => target.shorts_job_id))]
  const { data, error } = await supabase
    .from('showroom_shorts_logs')
    .select('shorts_job_id, target_id, payload, created_at')
    .in('shorts_job_id', jobIds)
    .eq('stage', 'publish_completed')
    .order('created_at', { ascending: false })

  if (error || !data?.length) return jobs

  const bestByTargetId = new Map<string, { externalPostId: string | null; externalPostUrl: string }>()
  for (const row of data) {
    const targetId = typeof row.target_id === 'string' ? row.target_id : null
    const jobId = String(row.shorts_job_id ?? '')
    const matching =
      (targetId ? missingTargets.find((target) => target.id === targetId) : null) ||
      missingTargets.find((target) => {
        if (target.shorts_job_id !== jobId) return false
        const channel = pickString(asRecord(row.payload), ['channel'])
        return channel === target.channel
      })
    if (!matching || bestByTargetId.has(matching.id)) continue

    const extracted = extractPostUrlFromPublishLogPayload(matching.channel, row.payload)
    if (!extracted.externalPostUrl) continue
    bestByTargetId.set(matching.id, {
      externalPostId: extracted.externalPostId,
      externalPostUrl: extracted.externalPostUrl,
    })
  }

  if (bestByTargetId.size === 0) return jobs

  const nowIso = new Date().toISOString()
  await Promise.all(
    [...bestByTargetId.entries()].map(async ([targetId, recovered]) => {
      const { error: updateError } = await supabase
        .from('showroom_shorts_targets')
        .update({
          external_post_id: recovered.externalPostId,
          external_post_url: recovered.externalPostUrl,
          updated_at: nowIso,
        })
        .eq('id', targetId)
      if (updateError) {
        console.warn('[ad-inbox] failed to persist recovered post url', targetId, updateError.message)
      }
    }),
  )

  return jobs.map((job) => ({
    ...job,
    targets: (job.targets ?? []).map((target) => {
      const recovered = bestByTargetId.get(target.id)
      if (!recovered) return target
      return {
        ...target,
        external_post_id: recovered.externalPostId ?? target.external_post_id,
        external_post_url: recovered.externalPostUrl,
      }
    }),
  }))
}

function emptyAdInboxChannelStates(): AdInboxChannelPublishState[] {
  return SHOWROOM_SHORTS_CHANNELS.map((channel) => ({
    channel,
    status: 'none',
    externalPostUrl: null,
    publishedAt: null,
    scheduledAt: null,
  }))
}

function deriveAdInboxChannelStates(
  targets: ShowroomShortsTargetRecord[] | undefined,
): AdInboxChannelPublishState[] {
  const byChannel = new Map((targets ?? []).map((target) => [target.channel, target]))
  return SHOWROOM_SHORTS_CHANNELS.map((channel) => {
    const target = byChannel.get(channel)
    if (!target) {
      return {
        channel,
        status: 'none',
        externalPostUrl: null,
        publishedAt: null,
        scheduledAt: null,
      }
    }
    return {
      channel,
      status: target.publish_status,
      externalPostUrl: resolveAdInboxChannelPostUrl(target),
      publishedAt: target.published_at,
      scheduledAt: target.publish_status === 'scheduled' ? target.scheduled_at : null,
    }
  })
}

/** 채널 scheduled_at 중 가장 이른 시각 */
export function deriveAdInboxScheduledAt(
  channels: AdInboxChannelPublishState[],
): string | null {
  let earliestMs = Number.POSITIVE_INFINITY
  let earliestIso: string | null = null
  for (const channel of channels) {
    if (channel.status !== 'scheduled') continue
    const raw = channel.scheduledAt?.trim()
    if (!raw) continue
    const ms = new Date(raw).getTime()
    if (Number.isNaN(ms)) continue
    if (ms < earliestMs) {
      earliestMs = ms
      earliestIso = raw
    }
  }
  return earliestIso
}

export function formatAdInboxScheduledDateTime(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString('ko-KR', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 세 채널 published_at 중 가장 늦은 시각. 없으면 null */
export function deriveAdInboxUploadedAt(
  channels: AdInboxChannelPublishState[],
): string | null {
  let latestMs = Number.NEGATIVE_INFINITY
  let latestIso: string | null = null
  for (const channel of channels) {
    const raw = channel.publishedAt?.trim()
    if (!raw) continue
    const ms = new Date(raw).getTime()
    if (Number.isNaN(ms)) continue
    if (ms >= latestMs) {
      latestMs = ms
      latestIso = raw
    }
  }
  return latestIso
}

function isAdInboxJobFailed(job: ShowroomShortsJobRecord): boolean {
  return job.status === 'failed' || job.kling_status === 'request_failed'
}

function isAdInboxCompositionDone(job: ShowroomShortsJobRecord): boolean {
  if (job.final_video_url?.trim()) return true
  return job.status === 'composited' || job.status === 'ready_for_review'
}

/**
 * 대기중: 사진만(또는 실패만) / 작업중: 클링·합성 진행 / 작업완료: 합성(최종 MP4) 완료
 * 채널 업로드는 channels[]로 따로 본다.
 */
export function deriveAdInboxWorkProgress(jobs: ShowroomShortsJobRecord[]): AdInboxWorkProgress {
  return deriveAdInboxBatchWorkState(jobs).progress
}

/** 작업완료일: 합성 완료 시점(job.updated_at) */
export function deriveAdInboxWorkCompletedAt(jobs: ShowroomShortsJobRecord[]): string | null {
  return deriveAdInboxBatchWorkState(jobs).completedAt
}

export function deriveAdInboxBatchWorkState(jobs: ShowroomShortsJobRecord[]): AdInboxBatchWorkState {
  const latest = jobs.find((job) => !isAdInboxJobFailed(job))
  if (!latest) {
    const channels = emptyAdInboxChannelStates()
    return {
      progress: 'waiting',
      completedAt: null,
      uploadedAt: null,
      scheduledAt: null,
      channels,
    }
  }

  const channels = deriveAdInboxChannelStates(latest.targets)
  const uploadedAt = deriveAdInboxUploadedAt(channels)
  const scheduledAt = deriveAdInboxScheduledAt(channels)
  if (isAdInboxCompositionDone(latest)) {
    return {
      progress: 'done',
      completedAt: latest.updated_at?.trim() || latest.created_at?.trim() || null,
      uploadedAt,
      scheduledAt,
      channels,
    }
  }

  return { progress: 'working', completedAt: null, uploadedAt, scheduledAt, channels }
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

export function buildAdInboxSiteGroupId(siteId: string): string {
  return `ad_site:${siteId.trim()}`
}

/** @deprecated 레거시 날짜+이름 그룹. 신규는 buildAdInboxSiteGroupId 사용 */
export function buildAdInboxGroupId(photoDate: string, shortName: string): string {
  const date = photoDate.trim() || new Date().toISOString().slice(0, 10)
  const name = shortName.trim().replace(/\s+/g, ' ')
  return `ad:${date}:${name.toLowerCase()}`
}

export function buildAdInboxBatchKey(photoDate: string, shortName: string): string {
  return buildAdInboxGroupId(photoDate, shortName)
}

function mapSiteRow(row: Record<string, unknown>): AdInboxSite {
  const statusRaw = String(row.status ?? 'open')
  const status: AdInboxSiteStatus =
    statusRaw === 'promoted' || statusRaw === 'archived' ? statusRaw : 'open'
  return {
    id: String(row.id),
    short_name: String(row.short_name ?? ''),
    photo_date: row.photo_date != null ? String(row.photo_date).slice(0, 10) : null,
    status,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function rowToAdInboxAsset(row: Record<string, unknown>): AdInboxAsset | null {
  const meta = row.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const raw = meta as Record<string, unknown>
  if (raw.source !== AD_INBOX_SOURCE && raw.ad_inbox !== true) return null

  const beforeAfter = parseBeforeAfterMeta(meta)
  const siteName = row.site_name != null ? String(row.site_name) : null
  const photoDate = row.photo_date != null ? String(row.photo_date).slice(0, 10) : null
  const siteId =
    typeof raw.ad_inbox_site_id === 'string' && raw.ad_inbox_site_id.trim()
      ? raw.ad_inbox_site_id.trim()
      : null

  const promotedAt =
    typeof raw.promoted_at === 'string' && raw.promoted_at.trim() ? raw.promoted_at.trim() : null

  return {
    id: String(row.id),
    cloudinary_url: String(row.cloudinary_url ?? ''),
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    site_name: siteName,
    raw_site_name: siteName,
    canonical_site_name: siteName,
    location: row.location != null ? String(row.location) : null,
    business_type: row.business_type != null ? String(row.business_type) : null,
    color_name: row.color_name != null ? String(row.color_name) : null,
    product_name: row.product_name != null ? String(row.product_name) : null,
    is_main: Boolean(row.is_main),
    created_at: row.created_at != null ? String(row.created_at) : null,
    view_count: Number(row.view_count ?? 0),
    share_count: Number(row.share_count ?? 0),
    internal_score: typeof row.internal_score === 'number' ? row.internal_score : null,
    before_after_role: beforeAfter.role,
    before_after_group_id: beforeAfter.groupId,
    photo_date: photoDate,
    ad_inbox: true,
    original_name: typeof raw.original_name === 'string' ? raw.original_name : null,
    ad_inbox_site_id: siteId,
    is_consultation: row.is_consultation === true || Boolean(promotedAt),
    promoted_at: promotedAt,
  }
}

export async function listAdInboxAssets(): Promise<AdInboxAsset[]> {
  const { data, error } = await supabase
    .from('image_assets')
    .select(
      'id, cloudinary_url, thumbnail_url, site_name, photo_date, location, business_type, color_name, product_name, is_main, is_consultation, created_at, view_count, share_count, internal_score, category, metadata',
    )
    .eq('category', AD_INBOX_CATEGORY)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(error.message || '광고 대기실 사진을 불러오지 못했습니다.')
  }

  return (data ?? [])
    .map((row) => rowToAdInboxAsset(row as Record<string, unknown>))
    .filter((row): row is AdInboxAsset => !!row)
}

export async function listAdInboxSites(): Promise<AdInboxSite[]> {
  const { data, error } = await supabase
    .from('ad_inbox_sites')
    .select('id, short_name, photo_date, status, created_at, updated_at')
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(error.message || '현장 카드를 불러오지 못했습니다.')
  }

  return (data ?? []).map((row) => mapSiteRow(row as Record<string, unknown>))
}

export async function createAdInboxSite(input: {
  shortName: string
  photoDate?: string | null
}): Promise<AdInboxSite> {
  const shortName = trimOrNull(input.shortName)
  if (!shortName) {
    throw new Error('현장 카드 이름(짧은 이름)을 입력하세요.')
  }
  const photoDate = trimOrNull(input.photoDate) || null
  const { data: authData } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('ad_inbox_sites')
    .insert({
      short_name: shortName,
      photo_date: photoDate,
      status: 'open',
      created_by: authData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('id, short_name, photo_date, status, created_at, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message || '현장 카드 생성에 실패했습니다.')
  }

  return mapSiteRow(data as Record<string, unknown>)
}

export async function touchAdInboxSite(siteId: string): Promise<void> {
  await supabase
    .from('ad_inbox_sites')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', siteId)
}

/** 레거시 날짜+이름 그룹을 현장 카드로 승격(백필) */
export async function ensureAdInboxSitesFromLegacyAssets(): Promise<{ created: number; linked: number }> {
  const assets = await listAdInboxAssets()
  const sites = await listAdInboxSites()
  const siteById = new Map(sites.map((site) => [site.id, site]))

  const legacyGroups = new Map<string, AdInboxAsset[]>()
  for (const asset of assets) {
    if (asset.ad_inbox_site_id && siteById.has(asset.ad_inbox_site_id)) continue
    const legacyKey =
      asset.before_after_group_id?.trim() ||
      buildAdInboxGroupId(
        asset.photo_date || (asset.created_at ? asset.created_at.slice(0, 10) : '날짜미상'),
        asset.site_name?.trim() || '이름미상',
      )
    const list = legacyGroups.get(legacyKey) ?? []
    list.push(asset)
    legacyGroups.set(legacyKey, list)
  }

  let created = 0
  let linked = 0

  for (const [legacyKey, groupAssets] of legacyGroups) {
    const sample = groupAssets[0]
    const shortName = sample.site_name?.trim() || '이름미상'
    const photoDate =
      sample.photo_date || (sample.created_at ? sample.created_at.slice(0, 10) : null)

    // 같은 짧은 이름의 open 카드가 있으면 재사용
    let site =
      sites.find(
        (row) =>
          row.status === 'open' &&
          row.short_name.trim().toLowerCase() === shortName.toLowerCase(),
      ) ?? null

    if (!site) {
      site = await createAdInboxSite({ shortName, photoDate })
      sites.push(site)
      siteById.set(site.id, site)
      created += 1
    }

    const groupId = buildAdInboxSiteGroupId(site.id)
    for (const asset of groupAssets) {
      const { data, error } = await supabase
        .from('image_assets')
        .select('metadata')
        .eq('id', asset.id)
        .maybeSingle()
      if (error || !data) continue

      const prev =
        data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      prev.source = AD_INBOX_SOURCE
      prev.ad_inbox = true
      prev.ad_inbox_site_id = site.id
      prev.before_after_group_id = groupId
      prev.ad_inbox_label = `${site.photo_date || photoDate || ''} ${site.short_name}`.trim()
      prev.legacy_group_key = legacyKey

      const { error: updateError } = await supabase
        .from('image_assets')
        .update({
          site_name: site.short_name,
          photo_date: site.photo_date || photoDate,
          metadata: prev,
        })
        .eq('id', asset.id)

      if (!updateError) linked += 1
    }
  }

  return { created, linked }
}

export function groupAdInboxBatches(
  assets: AdInboxAsset[],
  sites: AdInboxSite[] = [],
): AdInboxBatch[] {
  const siteById = new Map(sites.map((site) => [site.id, site]))
  const map = new Map<string, AdInboxBatch>()

  for (const asset of assets) {
    const siteId = asset.ad_inbox_site_id?.trim() || null
    const site = siteId ? siteById.get(siteId) : null
    const photoDate =
      site?.photo_date ||
      asset.photo_date ||
      (asset.created_at ? asset.created_at.slice(0, 10) : '날짜미상')
    const shortName = site?.short_name?.trim() || asset.site_name?.trim() || '이름미상'
    const key = siteId
      ? buildAdInboxSiteGroupId(siteId)
      : asset.before_after_group_id?.trim() || buildAdInboxBatchKey(photoDate, shortName)

    const existing = map.get(key)
    if (existing) {
      existing.assets.push(asset)
    } else {
      map.set(key, {
        key,
        siteId: siteId || key,
        label: shortName,
        photoDate,
        shortName,
        assets: [asset],
        beforeCount: 0,
        afterCount: 0,
        unsetCount: 0,
        promotedCount: 0,
        waitingPromoteCount: 0,
        status: site?.status ?? 'open',
      })
    }
  }

  // 사진 없는 현장 카드도 목록에 표시
  for (const site of sites) {
    const key = buildAdInboxSiteGroupId(site.id)
    if (map.has(key)) continue
    map.set(key, {
      key,
      siteId: site.id,
      label: site.short_name,
      photoDate: site.photo_date || '날짜미상',
      shortName: site.short_name,
      assets: [],
      beforeCount: 0,
      afterCount: 0,
      unsetCount: 0,
      promotedCount: 0,
      waitingPromoteCount: 0,
      status: site.status,
    })
  }

  const batches = Array.from(map.values()).map((batch) => {
    let beforeCount = 0
    let afterCount = 0
    let unsetCount = 0
    let promotedCount = 0
    let waitingPromoteCount = 0
    for (const asset of batch.assets) {
      if (asset.before_after_role === 'before') beforeCount += 1
      else if (asset.before_after_role === 'after') afterCount += 1
      else unsetCount += 1
      if (asset.is_consultation) promotedCount += 1
      else waitingPromoteCount += 1
    }
    batch.assets.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })
    return { ...batch, beforeCount, afterCount, unsetCount, promotedCount, waitingPromoteCount }
  })

  batches.sort((a, b) => {
    const siteA = siteById.get(a.siteId)
    const siteB = siteById.get(b.siteId)
    const ua = siteA?.updated_at || a.assets[0]?.created_at || ''
    const ub = siteB?.updated_at || b.assets[0]?.created_at || ''
    if (ua !== ub) return ua < ub ? 1 : -1
    return a.shortName.localeCompare(b.shortName, 'ko')
  })

  return batches
}

export async function uploadAdInboxPhotos(input: {
  siteId: string
  files: File[]
  role: AdInboxRole
  /** 업로드 시각 기록용(카드 날짜와 달라도 됨) */
  photoDate?: string | null
}): Promise<{ ok: number; fail: number; errors: string[]; siteId: string }> {
  const siteId = trimOrNull(input.siteId)
  if (!siteId) {
    throw new Error('현장 카드를 선택하세요.')
  }
  if (!input.files.length) {
    throw new Error('사진을 선택하세요.')
  }
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary 설정이 없습니다. .env를 확인하세요.')
  }

  const { data: siteRow, error: siteError } = await supabase
    .from('ad_inbox_sites')
    .select('id, short_name, photo_date, status, created_at, updated_at')
    .eq('id', siteId)
    .maybeSingle()

  if (siteError || !siteRow) {
    throw new Error(siteError?.message || '현장 카드를 찾지 못했습니다.')
  }

  const site = mapSiteRow(siteRow as Record<string, unknown>)
  const shortName = site.short_name
  const photoDate =
    trimOrNull(input.photoDate) ||
    site.photo_date ||
    new Date().toISOString().slice(0, 10)
  const groupId = buildAdInboxSiteGroupId(site.id)
  const role = input.role === 'before' || input.role === 'after' ? input.role : null
  let ok = 0
  let fail = 0
  const errors: string[] = []

  for (const file of input.files) {
    try {
      const uploadResult = await uploadEngine(file, {
        customer_name: shortName,
        project_id: groupId,
        category: AD_INBOX_CATEGORY,
        upload_date: photoDate,
        source: AD_INBOX_SOURCE,
        before_after_role: role ?? undefined,
      })

      const result = await insertImageAsset({
        cloudinary_url: uploadResult.cloudinary_url,
        thumbnail_url: uploadResult.thumbnail_url,
        public_watermark_status: 'skipped',
        site_name: shortName,
        photo_date: photoDate,
        category: AD_INBOX_CATEGORY,
        is_main: false,
        is_consultation: false,
        storage_type: uploadResult.storage_type,
        storage_path: uploadResult.storage_path ?? null,
        memo: '광고 대기실 (분류 전)',
        metadata: {
          source: AD_INBOX_SOURCE,
          ad_inbox: true,
          ad_inbox_site_id: site.id,
          original_name: file.name,
          file_size: file.size,
          public_id: uploadResult.public_id ?? undefined,
          before_after_role: role ?? undefined,
          before_after_group_id: groupId,
          ad_inbox_label: shortName,
        },
      })

      if ('error' in result) {
        fail += 1
        errors.push(`${file.name}: ${result.error.message}`)
      } else {
        ok += 1
      }
    } catch (error) {
      fail += 1
      errors.push(`${file.name}: ${error instanceof Error ? error.message : '업로드 실패'}`)
    }
  }

  if (ok > 0) {
    await touchAdInboxSite(site.id)
  }

  return { ok, fail, errors, siteId: site.id }
}

/** 광고 대기실에 올린 사진만 DB에서 제거합니다. (쇼룸/케이스 자산은 건드리지 않음) */
export async function deleteAdInboxAsset(assetId: string): Promise<void> {
  const id = assetId.trim()
  if (!id) throw new Error('삭제할 사진 ID가 없습니다.')

  const { data, error } = await supabase
    .from('image_assets')
    .select('id, category, metadata')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || '사진을 찾지 못했습니다.')
  }
  if (!data) {
    throw new Error('사진을 찾지 못했습니다.')
  }

  const meta =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null
  const isAdInbox =
    data.category === AD_INBOX_CATEGORY || meta?.source === AD_INBOX_SOURCE || meta?.ad_inbox === true
  if (!isAdInbox) {
    throw new Error('광고 대기실 사진만 삭제할 수 있습니다.')
  }

  const { error: deleteError } = await supabase.from('image_assets').delete().eq('id', id)
  if (deleteError) {
    throw new Error(deleteError.message || '사진 삭제에 실패했습니다.')
  }
}

export async function updateAdInboxAssetRole(
  assetId: string,
  role: AdInboxRole,
): Promise<void> {
  const { data, error } = await supabase
    .from('image_assets')
    .select('metadata')
    .eq('id', assetId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || '사진을 찾지 못했습니다.')
  }

  const prev =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}

  if (role === 'unset') {
    delete prev.before_after_role
  } else {
    prev.before_after_role = role
  }
  prev.source = AD_INBOX_SOURCE
  prev.ad_inbox = true

  const { error: updateError } = await supabase
    .from('image_assets')
    .update({ metadata: prev })
    .eq('id', assetId)

  if (updateError) {
    throw new Error(updateError.message || 'BA 태그 저장에 실패했습니다.')
  }
}

/** 쇼룸 숏츠 job의 before_after_group_key 형식 */
export function buildAdInboxShortsGroupKey(batchKey: string): string {
  return `before-after:${batchKey.trim()}`
}

function mapRowToShowroomImageAsset(r: Record<string, unknown>): ShowroomImageAsset {
  const beforeAfter = parseBeforeAfterMeta(r.metadata)
  const meta = parseImageAssetMeta(r.metadata)
  return {
    before_after_role: beforeAfter.role,
    before_after_group_id: beforeAfter.groupId,
    raw_site_name: r.site_name != null ? String(r.site_name) : null,
    canonical_site_name: meta.canonicalSiteName,
    space_display_name: meta.spaceDisplayName,
    external_display_name: meta.externalDisplayName,
    broad_external_display_name: meta.broadExternalDisplayName,
    space_id: meta.spaceId,
    id: String(r.id),
    cloudinary_url: String(r.cloudinary_url ?? ''),
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    site_name: r.site_name != null ? String(r.site_name) : null,
    location: r.location != null ? String(r.location) : null,
    business_type: r.business_type != null ? String(r.business_type) : null,
    color_name: r.color_name != null ? String(r.color_name) : null,
    product_name: r.product_name != null ? String(r.product_name) : null,
    is_main: Boolean(r.is_main),
    created_at: r.created_at != null ? String(r.created_at) : null,
    view_count: Number(r.view_count ?? 0),
    share_count: Number(r.share_count ?? 0),
    internal_score: typeof r.internal_score === 'number' ? r.internal_score : null,
  }
}

export async function fetchImageAssetsByIds(ids: string[]): Promise<ShowroomImageAsset[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []

  const { data, error } = await supabase
    .from('image_assets')
    .select(
      'id, cloudinary_url, thumbnail_url, site_name, location, business_type, color_name, product_name, is_main, created_at, view_count, share_count, internal_score, category, metadata',
    )
    .in('id', unique)

  if (error) {
    throw new Error(error.message || '연결 사진을 불러오지 못했습니다.')
  }

  return (data ?? []).map((row) => mapRowToShowroomImageAsset(row as Record<string, unknown>))
}

function showroomAssetAsJobLinkedPreview(
  asset: ShowroomImageAsset,
  siteId: string,
  role: 'before' | 'after',
): AdInboxAsset {
  return {
    ...asset,
    before_after_role: role,
    photo_date: asset.created_at ? asset.created_at.slice(0, 10) : null,
    ad_inbox: true,
    ad_inbox_site_id: siteId,
    is_consultation: true,
    linked_from_showroom_job: true,
  }
}

function urlFallbackJobLinkedPreview(input: {
  id: string
  url: string
  siteId: string
  siteName: string
  role: 'before' | 'after'
}): AdInboxAsset {
  return {
    id: input.id,
    cloudinary_url: input.url,
    thumbnail_url: input.url,
    site_name: input.siteName,
    raw_site_name: input.siteName,
    canonical_site_name: input.siteName,
    location: null,
    business_type: null,
    color_name: null,
    product_name: null,
    is_main: false,
    created_at: null,
    view_count: 0,
    share_count: 0,
    internal_score: null,
    before_after_role: input.role,
    before_after_group_id: null,
    photo_date: null,
    ad_inbox: true,
    ad_inbox_site_id: input.siteId,
    is_consultation: true,
    linked_from_showroom_job: true,
  }
}

/**
 * BA 쇼룸 가져오기 카드처럼 대기실 사진이 없을 때,
 * job의 Before/After를 그리드·확대용으로 빌려온다.
 */
export async function listAdInboxJobLinkedAssets(
  job: ShowroomShortsJobRecord,
  siteId: string,
  siteName = '쇼룸 BA',
): Promise<AdInboxAsset[]> {
  const beforeId = job.before_asset_id?.trim() || ''
  const afterId = job.after_asset_id?.trim() || ''
  const ids = [beforeId, afterId].filter(Boolean)
  const fetched = ids.length > 0 ? await fetchImageAssetsByIds(ids) : []
  const byId = new Map(fetched.map((asset) => [asset.id, asset]))
  const out: AdInboxAsset[] = []

  if (beforeId && byId.has(beforeId)) {
    out.push(showroomAssetAsJobLinkedPreview(byId.get(beforeId)!, siteId, 'before'))
  } else if (job.before_asset_url?.trim()) {
    out.push(
      urlFallbackJobLinkedPreview({
        id: beforeId || `job-before:${job.id}`,
        url: job.before_asset_url.trim(),
        siteId,
        siteName,
        role: 'before',
      }),
    )
  }

  if (afterId && byId.has(afterId)) {
    out.push(showroomAssetAsJobLinkedPreview(byId.get(afterId)!, siteId, 'after'))
  } else if (job.after_asset_url?.trim()) {
    out.push(
      urlFallbackJobLinkedPreview({
        id: afterId || `job-after:${job.id}`,
        url: job.after_asset_url.trim(),
        siteId,
        siteName,
        role: 'after',
      }),
    )
  }

  return out
}

/**
 * 합성 완료 job에 채널 타깃이 비어 있으면(재합성 등) 같은 카드의 이전 job 타깃을 복사한다.
 * 복사본은 final이 있으면 ready — 카드 YT/FB/IG가 draft/none으로 회색 되는 것을 막는다.
 */
async function healCompositionJobMissingTargets(
  jobs: ShowroomShortsJobRecord[],
): Promise<ShowroomShortsJobRecord[]> {
  if (jobs.length === 0) return jobs

  const primary =
    jobs.find((job) => Boolean(job.final_video_url?.trim())) ||
    jobs.find((job) => job.status === 'composited' || job.status === 'ready_for_review') ||
    null
  if (!primary) return jobs
  if ((primary.targets ?? []).length > 0) return jobs

  const donor = jobs.find((job) => job.id !== primary.id && (job.targets ?? []).length > 0)
  if (!donor?.targets?.length) return jobs

  const nowIso = new Date().toISOString()
  const publishStatus = primary.final_video_url?.trim() ? 'ready' : 'draft'
  const inserts = donor.targets.map((target) => ({
    shorts_job_id: primary.id,
    channel: target.channel,
    title: target.title,
    description: target.description,
    hashtags: target.hashtags,
    first_comment: target.first_comment,
    publish_status: publishStatus,
    final_video_url: primary.final_video_url,
    preparation_payload: target.preparation_payload ?? {},
    prepared_at: publishStatus === 'ready' ? target.prepared_at : null,
    launch_ready_at: null,
    scheduled_at: null,
    updated_at: nowIso,
  }))

  const { error } = await supabase.from('showroom_shorts_targets').insert(inserts)
  if (error) {
    console.warn('[ad-inbox] heal composition targets failed', primary.id, error.message)
    return jobs
  }

  // 최신 타깃을 다시 붙여 반환
  const healed = await listShowroomShortsJobsForGroupKey(primary.before_after_group_key ?? '')
  if (healed.length > 0) return healed
  return jobs
}

export async function listAdInboxTimelapseJobsForBatch(batch: AdInboxBatch): Promise<ShowroomShortsJobRecord[]> {
  const byGroup = await listShowroomShortsJobsForGroupKey(buildAdInboxShortsGroupKey(batch.key))
  if (byGroup.length > 0) {
    const healed = await healCompositionJobMissingTargets(byGroup)
    return recoverPublishedPostUrlsForJobs(healed)
  }

  const assetIds = batch.assets.map((asset) => asset.id)
  if (assetIds.length === 0) return []

  const assetSet = new Set(assetIds)
  const byAssets = await listShowroomShortsJobsByBeforeAssetIds(assetIds)
  const filtered = byAssets.filter(
    (job) => assetSet.has(job.before_asset_id) && assetSet.has(job.after_asset_id),
  )
  const healed = await healCompositionJobMissingTargets(filtered)
  return recoverPublishedPostUrlsForJobs(healed)
}

/** 현장 카드 목록용: 배치별 진행상태·작업완료일 (최신 job 기준) */
export async function listAdInboxWorkProgressByBatches(
  batches: AdInboxBatch[],
): Promise<Record<string, AdInboxBatchWorkState>> {
  if (batches.length === 0) return {}
  const entries = await Promise.all(
    batches.map(async (batch) => {
      const jobs = await listAdInboxTimelapseJobsForBatch(batch)
      return [batch.key, deriveAdInboxBatchWorkState(jobs)] as const
    }),
  )
  return Object.fromEntries(entries)
}

export async function getAdInboxTimelapseJob(jobId: string): Promise<ShowroomShortsJobRecord | null> {
  const job = await getShowroomShortsJob(jobId)
  if (!job) return null
  const [recovered] = await recoverPublishedPostUrlsForJobs([job])
  return recovered ?? job
}

export async function createAdInboxTimelapseJob(input: {
  before: AdInboxAsset
  after: AdInboxAsset
  channels?: ShowroomShortsChannel[]
  promptText?: string
  /** empty_room: 구도 맞춤 + 설치만 (철거 없음) */
  mode?: 'standard' | 'empty_room'
}): Promise<{ jobId: string }> {
  const images: ShowroomImageAsset[] = [input.before, input.after]
  const selection = validateBeforeAfterSelection(images)
  if (!selection.ok) {
    throw new Error(selection.message)
  }

  const emptyRoom = input.mode === 'empty_room'
  const promptText = (
    input.promptText ||
    (emptyRoom ? SHOWROOM_SHORTS_EMPTY_ROOM_TIMELAPSE_PROMPT : AD_INBOX_DEFAULT_PROMPT)
  ).trim()

  const created = await createShowroomShortsJob({
    promptText,
    channels: input.channels?.length ? input.channels : [...SHOWROOM_SHORTS_CHANNELS],
    images,
    timelapseMode: emptyRoom ? 'empty_room' : 'standard',
  })

  return { jobId: created.job.id }
}

/** 오픈쇼룸 BA 그룹 — 대기실「쇼룸에서 가져오기」용 */
export type ShowroomBaImportGroup = {
  key: string
  siteName: string
  beforeAssets: ShowroomImageAsset[]
  afterAssets: ShowroomImageAsset[]
  newestAt: string | null
  /** 이 그룹 before/after 조합으로 이미 job이 있는지 */
  hasExistingJob: boolean
}

/** 가져오기 다이얼로그 페이지당 그룹 수 */
export const SHOWROOM_IMPORT_PAGE_SIZE = 40

function normalizeImportSearchText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildShowroomBaImportGroupKey(asset: ShowroomImageAsset): string {
  const groupId = asset.before_after_group_id?.trim()
  if (groupId) return groupId
  const site =
    asset.canonical_site_name?.trim() ||
    asset.site_name?.trim() ||
    asset.raw_site_name?.trim() ||
    ''
  if (site) return `site:${normalizeImportSearchText(site)}`
  return `asset:${asset.id}`
}

/**
 * 상담용(오픈쇼룸) 자산 중 Before+After가 모두 있는 그룹만 반환.
 * 쇼룸 asset은 수정하지 않음.
 */
export async function listShowroomBaGroupsForImport(query?: string): Promise<ShowroomBaImportGroup[]> {
  const assets = await fetchShowroomImageAssets()
  const q = normalizeImportSearchText(query)

  const map = new Map<
    string,
    {
      siteName: string
      beforeAssets: ShowroomImageAsset[]
      afterAssets: ShowroomImageAsset[]
      newestAt: string | null
    }
  >()

  for (const asset of assets) {
    const role = asset.before_after_role
    if (role !== 'before' && role !== 'after') continue

    const key = buildShowroomBaImportGroupKey(asset)
    const siteName =
      asset.canonical_site_name?.trim() ||
      asset.site_name?.trim() ||
      asset.raw_site_name?.trim() ||
      asset.external_display_name?.trim() ||
      '이름미상'

    let bucket = map.get(key)
    if (!bucket) {
      bucket = { siteName, beforeAssets: [], afterAssets: [], newestAt: asset.created_at }
      map.set(key, bucket)
    } else if (siteName && bucket.siteName === '이름미상') {
      bucket.siteName = siteName
    }

    if (role === 'before') bucket.beforeAssets.push(asset)
    else bucket.afterAssets.push(asset)

    if (asset.created_at && (!bucket.newestAt || asset.created_at > bucket.newestAt)) {
      bucket.newestAt = asset.created_at
    }
  }

  let groups: ShowroomBaImportGroup[] = Array.from(map.entries())
    .filter(([, g]) => g.beforeAssets.length > 0 && g.afterAssets.length > 0)
    .map(([key, g]) => ({
      key,
      siteName: g.siteName,
      beforeAssets: g.beforeAssets,
      afterAssets: g.afterAssets,
      newestAt: g.newestAt,
      hasExistingJob: false,
    }))

  if (q) {
    groups = groups.filter((g) => {
      const hay = `${normalizeImportSearchText(g.siteName)} ${normalizeImportSearchText(g.key)}`
      return hay.includes(q)
    })
  }

  groups.sort((a, b) => {
    const at = a.newestAt ?? ''
    const bt = b.newestAt ?? ''
    return bt.localeCompare(at)
  })

  const beforeIds = [...new Set(groups.flatMap((g) => g.beforeAssets.map((a) => a.id)))]
  const pairKeys = await listExistingShowroomShortsPairKeys(beforeIds)

  return groups.map((g) => {
    const hasExistingJob = g.beforeAssets.some((before) =>
      g.afterAssets.some((after) => pairKeys.has(showroomBaReelPairKey(before.id, after.id))),
    )
    return { ...g, hasExistingJob }
  })
}

/** 쇼룸 BA before/after 자산 쌍이 이미 릴스(숏츠) job에 있는지 판별용 키 */
export function showroomBaReelPairKey(beforeAssetId: string, afterAssetId: string): string {
  return `${beforeAssetId.trim()}:${afterAssetId.trim()}`
}

/**
 * before_asset_id 기준으로 이미 존재하는 릴스 job의 before:after 쌍 키 집합.
 * 광고대기실 가져오기·오픈쇼룸 카드의「릴스 반영」표시에 공통 사용.
 */
export async function listExistingShowroomShortsPairKeys(
  beforeAssetIds: string[],
): Promise<Set<string>> {
  const beforeIds = [...new Set(beforeAssetIds.map((id) => id.trim()).filter(Boolean))]
  const pairKeys = new Set<string>()
  if (beforeIds.length === 0) return pairKeys

  // supabase .in() 한도·응답 크기 대비 청크
  const chunkSize = 80
  for (let i = 0; i < beforeIds.length; i += chunkSize) {
    const chunk = beforeIds.slice(i, i + chunkSize)
    const { data: existingRows, error: existingError } = await supabase
      .from('showroom_shorts_jobs')
      .select('before_asset_id, after_asset_id')
      .in('before_asset_id', chunk)
      .limit(400)
    if (existingError) throw new Error(existingError.message)
    for (const row of existingRows ?? []) {
      const beforeId = typeof row.before_asset_id === 'string' ? row.before_asset_id : ''
      const afterId = typeof row.after_asset_id === 'string' ? row.after_asset_id : ''
      if (beforeId && afterId) pairKeys.add(showroomBaReelPairKey(beforeId, afterId))
    }
  }
  return pairKeys
}

/**
 * After 자산이 이미 릴스 job에 쓰였는지 (After-only · 합성 Before 경로 포함).
 */
export async function listExistingShowroomShortsAfterAssetIds(
  afterAssetIds: string[],
): Promise<Set<string>> {
  const afterIds = [...new Set(afterAssetIds.map((id) => id.trim()).filter(Boolean))]
  const found = new Set<string>()
  if (afterIds.length === 0) return found

  const chunkSize = 80
  for (let i = 0; i < afterIds.length; i += chunkSize) {
    const chunk = afterIds.slice(i, i + chunkSize)
    const { data: existingRows, error: existingError } = await supabase
      .from('showroom_shorts_jobs')
      .select('after_asset_id')
      .in('after_asset_id', chunk)
      .limit(400)
    if (existingError) throw new Error(existingError.message)
    for (const row of existingRows ?? []) {
      const afterId = typeof row.after_asset_id === 'string' ? row.after_asset_id.trim() : ''
      if (afterId) found.add(afterId)
    }
  }
  return found
}

export type ShowroomBaReelSource = 'none' | 'ad_inbox' | 'showroom'

export type ShowroomBaCardPublishStatus = {
  inAdInbox: boolean
  adInboxSiteId: string | null
  reelSource: ShowroomBaReelSource
  work: AdInboxBatchWorkState
}

export type ShowroomBaCardPublishIndex = {
  /** 쇼룸 원본 asset id → 대기실 복사본 */
  inboxByShowroomAssetId: Map<string, { adInboxAssetId: string; siteId: string | null }>
  jobs: ShowroomShortsJobRecord[]
}

/** 대기실 숏츠 group key: before-after:ad_site:… 또는 레거시 before-after:ad:… */
export function isAdInboxShortsGroupKey(groupKey: string | null | undefined): boolean {
  const key = groupKey?.trim() ?? ''
  if (!key) return false
  return key.includes('ad_site:') || key.includes('before-after:ad:')
}

function emptyShowroomBaCardPublishStatus(): ShowroomBaCardPublishStatus {
  return {
    inAdInbox: false,
    adInboxSiteId: null,
    reelSource: 'none',
    work: deriveAdInboxBatchWorkState([]),
  }
}

async function listAdInboxImportsForShowroomAssetIds(
  showroomAssetIds: string[],
): Promise<Map<string, { adInboxAssetId: string; siteId: string | null }>> {
  const ids = [...new Set(showroomAssetIds.map((id) => id.trim()).filter(Boolean))]
  const out = new Map<string, { adInboxAssetId: string; siteId: string | null }>()
  if (ids.length === 0) return out

  const idSet = new Set(ids)
  const chunkSize = 40
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const orFilter = chunk
      .map((id) => `metadata->>imported_from_showroom_asset_id.eq.${id}`)
      .join(',')
    const { data, error } = await supabase
      .from('image_assets')
      .select('id, metadata')
      .eq('category', AD_INBOX_CATEGORY)
      .or(orFilter)
      .limit(400)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const meta = row.metadata
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue
      const raw = meta as Record<string, unknown>
      const imported =
        typeof raw.imported_from_showroom_asset_id === 'string'
          ? raw.imported_from_showroom_asset_id.trim()
          : ''
      if (!imported || !idSet.has(imported) || out.has(imported)) continue
      const siteId =
        typeof raw.ad_inbox_site_id === 'string' && raw.ad_inbox_site_id.trim()
          ? raw.ad_inbox_site_id.trim()
          : null
      out.set(imported, { adInboxAssetId: String(row.id), siteId })
    }
  }
  return out
}

/**
 * 쇼룸 BA 카드용: 대기실 입고·릴스 출처·채널 상태를 한 번에 로드.
 */
export async function loadShowroomBaCardPublishIndex(
  showroomAssetIds: string[],
): Promise<ShowroomBaCardPublishIndex> {
  const inboxByShowroomAssetId = await listAdInboxImportsForShowroomAssetIds(showroomAssetIds)
  const candidateIds = [
    ...new Set([
      ...showroomAssetIds.map((id) => id.trim()).filter(Boolean),
      ...[...inboxByShowroomAssetId.values()].map((row) => row.adInboxAssetId),
    ]),
  ]
  const jobs = await listShowroomShortsJobsByAssetIds(candidateIds)
  return { inboxByShowroomAssetId, jobs }
}

function jobRecencyKey(job: ShowroomShortsJobRecord): string {
  return job.updated_at?.trim() || job.created_at?.trim() || ''
}

/**
 * 현장 그룹(SiteGroup)의 before/after 자산으로 대기실·릴스·채널 상태를 해석.
 */
export function resolveShowroomBaCardPublishStatus(
  group: {
    images: Array<{ id: string; before_after_role?: string | null }>
  },
  index: ShowroomBaCardPublishIndex | null | undefined,
): ShowroomBaCardPublishStatus {
  if (!index) return emptyShowroomBaCardPublishStatus()

  const beforeIds = group.images
    .filter((image) => image.before_after_role === 'before')
    .map((image) => image.id.trim())
    .filter(Boolean)
  const afterIds = group.images
    .filter((image) => image.before_after_role === 'after')
    .map((image) => image.id.trim())
    .filter(Boolean)
  const showroomIds = [...new Set([...beforeIds, ...afterIds])]

  let adInboxSiteId: string | null = null
  let linkedImport = false
  for (const id of showroomIds) {
    const link = index.inboxByShowroomAssetId.get(id)
    if (!link) continue
    linkedImport = true
    if (!adInboxSiteId && link.siteId) adInboxSiteId = link.siteId
  }

  const expand = (ids: string[]) => {
    const set = new Set(ids)
    for (const id of ids) {
      const link = index.inboxByShowroomAssetId.get(id)
      if (link?.adInboxAssetId) set.add(link.adInboxAssetId)
    }
    return set
  }
  const expandedBefore = expand(beforeIds)
  const expandedAfter = expand(afterIds)

  const matching = index.jobs.filter((job) => {
    const beforeId = job.before_asset_id?.trim() ?? ''
    const afterId = job.after_asset_id?.trim() ?? ''
    if (beforeIds.length > 0 && afterIds.length > 0) {
      return expandedBefore.has(beforeId) && expandedAfter.has(afterId)
    }
    if (afterIds.length > 0) {
      return expandedAfter.has(afterId)
    }
    return false
  })

  matching.sort((a, b) => jobRecencyKey(b).localeCompare(jobRecencyKey(a)))
  const latest = matching.find((job) => !isAdInboxJobFailed(job)) ?? null

  let reelSource: ShowroomBaReelSource = 'none'
  if (latest) {
    reelSource = isAdInboxShortsGroupKey(latest.before_after_group_key) ? 'ad_inbox' : 'showroom'
    if (reelSource === 'ad_inbox' && !adInboxSiteId) {
      const key = latest.before_after_group_key?.trim() ?? ''
      const match = key.match(/ad_site:([0-9a-f-]{36})/i)
      if (match?.[1]) adInboxSiteId = match[1]
    }
  }

  const inAdInbox = linkedImport || reelSource === 'ad_inbox'
  const work = deriveAdInboxBatchWorkState(latest ? [latest] : [])

  return { inAdInbox, adInboxSiteId, reelSource, work }
}

/**
 * Before가 없고 After만 있는 쇼룸 그룹.
 * 「Before 없는 After」입구용 — BA 준비 그룹과 분리해 후보 폭발을 막음.
 */
export async function listShowroomAfterOnlyGroupsForImport(
  query?: string,
): Promise<ShowroomBaImportGroup[]> {
  const assets = await fetchShowroomImageAssets()
  const q = normalizeImportSearchText(query)

  const map = new Map<
    string,
    {
      siteName: string
      beforeAssets: ShowroomImageAsset[]
      afterAssets: ShowroomImageAsset[]
      newestAt: string | null
    }
  >()

  for (const asset of assets) {
    const role = asset.before_after_role
    if (role !== 'before' && role !== 'after') continue

    const key = buildShowroomBaImportGroupKey(asset)
    const siteName =
      asset.canonical_site_name?.trim() ||
      asset.site_name?.trim() ||
      asset.raw_site_name?.trim() ||
      asset.external_display_name?.trim() ||
      '이름미상'

    let bucket = map.get(key)
    if (!bucket) {
      bucket = { siteName, beforeAssets: [], afterAssets: [], newestAt: asset.created_at }
      map.set(key, bucket)
    } else if (siteName && bucket.siteName === '이름미상') {
      bucket.siteName = siteName
    }

    if (role === 'before') bucket.beforeAssets.push(asset)
    else bucket.afterAssets.push(asset)

    if (asset.created_at && (!bucket.newestAt || asset.created_at > bucket.newestAt)) {
      bucket.newestAt = asset.created_at
    }
  }

  let groups: ShowroomBaImportGroup[] = Array.from(map.entries())
    .filter(([, g]) => g.beforeAssets.length === 0 && g.afterAssets.length > 0)
    .map(([key, g]) => ({
      key,
      siteName: g.siteName,
      beforeAssets: [],
      afterAssets: g.afterAssets,
      newestAt: g.newestAt,
      hasExistingJob: false,
    }))

  if (q) {
    groups = groups.filter((g) => {
      const hay = `${normalizeImportSearchText(g.siteName)} ${normalizeImportSearchText(g.key)}`
      return hay.includes(q)
    })
  }

  groups.sort((a, b) => {
    const at = a.newestAt ?? ''
    const bt = b.newestAt ?? ''
    return bt.localeCompare(at)
  })

  return groups
}

/**
 * 기존 대기실 카드에 쇼룸 사진을 추가합니다.
 * 쇼룸 원본은 건드리지 않고, 같은 Cloudinary URL로 ad_inbox 자산을 만듭니다.
 */
export async function addShowroomPhotosToAdInboxSite(input: {
  siteId: string
  images: ShowroomImageAsset[]
}): Promise<{
  siteId: string
  siteBatchKey: string
  shortName: string
  assetCount: number
  createdAssetIds: string[]
  createdBySourceId: Record<string, string>
}> {
  const siteId = trimOrNull(input.siteId)
  if (!siteId) {
    throw new Error('대기실 카드를 선택하세요.')
  }

  const images = input.images.filter((image) => Boolean(image?.id && (image.cloudinary_url || image.thumbnail_url)))
  if (images.length === 0) {
    throw new Error('보낼 사진을 선택하세요.')
  }

  const { data: siteRow, error: siteError } = await supabase
    .from('ad_inbox_sites')
    .select('id, short_name, photo_date, status, created_at, updated_at')
    .eq('id', siteId)
    .maybeSingle()

  if (siteError || !siteRow) {
    throw new Error(siteError?.message || '대기실 카드를 찾을 수 없습니다.')
  }

  const site = mapSiteRow(siteRow as Record<string, unknown>)
  const shortName = site.short_name
  const siteBatchKey = buildAdInboxSiteGroupId(site.id)
  const photoDate =
    site.photo_date ||
    images
      .map((image) => (image.created_at ? image.created_at.slice(0, 10) : null))
      .find((value) => Boolean(value)) ||
    null

  const createdAssetIds: string[] = []
  const createdBySourceId: Record<string, string> = {}
  const errors: string[] = []

  for (const image of images) {
    const url = (image.cloudinary_url || image.thumbnail_url || '').trim()
    if (!url) {
      errors.push(`${image.id}: 이미지 URL이 없습니다.`)
      continue
    }
    const role =
      image.before_after_role === 'before' || image.before_after_role === 'after'
        ? image.before_after_role
        : undefined

    const result = await insertImageAsset({
      cloudinary_url: url,
      thumbnail_url: image.thumbnail_url || url,
      public_watermark_status: 'skipped',
      site_name: shortName,
      photo_date: photoDate || (image.created_at ? image.created_at.slice(0, 10) : null),
      location: image.location,
      business_type: image.business_type,
      color_name: image.color_name,
      product_name: image.product_name,
      category: AD_INBOX_CATEGORY,
      is_main: false,
      is_consultation: false,
      storage_type: 'cloudinary',
      memo: '광고 대기실 · 쇼룸에서 선택 입고',
      metadata: {
        source: AD_INBOX_SOURCE,
        ad_inbox: true,
        ad_inbox_site_id: site.id,
        before_after_role: role,
        before_after_group_id: siteBatchKey,
        ad_inbox_label: shortName,
        imported_from_showroom_asset_id: image.id,
        original_name: `showroom-${image.id}.jpg`,
      },
    })

    if ('error' in result) {
      errors.push(`${image.id}: ${result.error.message}`)
      continue
    }
    createdAssetIds.push(result.id)
    createdBySourceId[image.id] = result.id
  }

  if (createdAssetIds.length === 0) {
    throw new Error(errors[0] || '대기실로 사진을 보내지 못했습니다.')
  }

  await touchAdInboxSite(site.id)

  return {
    siteId: site.id,
    siteBatchKey,
    shortName: site.short_name,
    assetCount: createdAssetIds.length,
    createdAssetIds,
    createdBySourceId,
  }
}

/**
 * 내부 쇼룸에서 고른 사진을 새 대기실 카드로 보냅니다.
 * 기존 카드에 붙이려면 {@link addShowroomPhotosToAdInboxSite}를 사용하세요.
 */
export async function createAdInboxSiteFromShowroomPhotos(input: {
  images: ShowroomImageAsset[]
  /** 대기실 카드명. 없으면 첫 사진 현장명 */
  siteName?: string | null
}): Promise<{ siteId: string; siteBatchKey: string; shortName: string; assetCount: number }> {
  const images = input.images.filter((image) => Boolean(image?.id && (image.cloudinary_url || image.thumbnail_url)))
  if (images.length === 0) {
    throw new Error('보낼 사진을 선택하세요.')
  }

  const seed = images[0]
  const shortName =
    trimOrNull(input.siteName) ||
    trimOrNull(seed.canonical_site_name) ||
    trimOrNull(seed.site_name) ||
    trimOrNull(seed.raw_site_name) ||
    trimOrNull(seed.external_display_name) ||
    '이름미상'

  const photoDate =
    images
      .map((image) => (image.created_at ? image.created_at.slice(0, 10) : null))
      .find((value) => Boolean(value)) || null

  const site = await createAdInboxSite({ shortName, photoDate })
  return addShowroomPhotosToAdInboxSite({ siteId: site.id, images })
}

/** 쇼룸 현장명·사진 메타로 대기실 카드 자동 추천 (견적번호·부분 문자열) */
export function suggestAdInboxSiteForShowroom(input: {
  sites: AdInboxSite[]
  siteName?: string | null
  images?: Array<Pick<ShowroomImageAsset, 'site_name' | 'canonical_site_name' | 'raw_site_name' | 'external_display_name'>>
}): AdInboxSite | null {
  if (input.sites.length === 0) return null

  const needles = new Set<string>()
  const push = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim().toLowerCase()
    if (trimmed) needles.add(trimmed)
  }
  push(input.siteName)
  input.images?.forEach((image) => {
    push(image.site_name)
    push(image.canonical_site_name)
    push(image.raw_site_name)
    push(image.external_display_name)
  })

  const quoteDigits = new Set<string>()
  needles.forEach((needle) => {
    const matches = needle.match(/\d{4}/g) ?? []
    matches.forEach((digits) => quoteDigits.add(digits))
  })

  let best: { site: AdInboxSite; score: number } | null = null
  for (const site of input.sites) {
    const name = site.short_name.trim().toLowerCase()
    if (!name) continue
    let score = 0
    for (const needle of needles) {
      if (name === needle) score += 100
      else if (name.includes(needle) || needle.includes(name)) score += 40
    }
    for (const digits of quoteDigits) {
      if (name.includes(digits)) score += 60
    }
    if (!best || score > best.score) best = { site, score }
  }

  if (best && best.score > 0) return best.site
  return null
}

/** 오픈쇼룸 BA → 쇼룸 현장명으로 새 대기실 카드 생성 후 job 연결 (사진 복사/승격 없음) */
export async function createAdInboxTimelapseJobFromShowroom(input: {
  before: ShowroomImageAsset
  after: ShowroomImageAsset
  /** 대기실 카드명. 없으면 쇼룸 현장명 사용 */
  siteName?: string | null
  channels?: ShowroomShortsChannel[]
  promptText?: string
}): Promise<{ jobId: string; siteId: string; siteBatchKey: string; shortName: string }> {
  const images: ShowroomImageAsset[] = [input.before, input.after]
  const selection = validateBeforeAfterSelection(images)
  if (!selection.ok) {
    throw new Error(selection.message)
  }

  const shortName =
    trimOrNull(input.siteName) ||
    trimOrNull(input.after.canonical_site_name) ||
    trimOrNull(input.after.site_name) ||
    trimOrNull(input.before.canonical_site_name) ||
    trimOrNull(input.before.site_name) ||
    trimOrNull(input.after.external_display_name) ||
    trimOrNull(input.before.external_display_name) ||
    '이름미상'

  const photoDate =
    (input.after.created_at ? input.after.created_at.slice(0, 10) : null) ||
    (input.before.created_at ? input.before.created_at.slice(0, 10) : null)

  const site = await createAdInboxSite({ shortName, photoDate })
  const siteBatchKey = buildAdInboxSiteGroupId(site.id)

  const created = await createShowroomShortsJob({
    promptText: (input.promptText || AD_INBOX_DEFAULT_PROMPT).trim(),
    channels: input.channels?.length ? input.channels : [...SHOWROOM_SHORTS_CHANNELS],
    images,
    beforeAfterGroupKey: buildAdInboxShortsGroupKey(siteBatchKey),
  })

  return {
    jobId: created.job.id,
    siteId: site.id,
    siteBatchKey,
    shortName: site.short_name,
  }
}

/** 타임랩스 전 AI 보정본을 같은 현장 카드에 Before로 추가 */
export async function insertAdInboxCleanupAsset(input: {
  source: AdInboxAsset
  cloudinary_url: string
  thumbnail_url: string | null
  public_id?: string | null
}): Promise<{ id: string }> {
  const photoDate =
    input.source.photo_date ||
    (input.source.created_at ? input.source.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const shortName = input.source.site_name?.trim() || '이름미상'
  const siteId = input.source.ad_inbox_site_id?.trim() || null
  const groupId =
    (siteId ? buildAdInboxSiteGroupId(siteId) : null) ||
    input.source.before_after_group_id?.trim() ||
    buildAdInboxGroupId(photoDate, shortName)

  const result = await insertImageAsset({
    cloudinary_url: input.cloudinary_url,
    thumbnail_url: input.thumbnail_url,
    public_watermark_status: 'skipped',
    site_name: shortName,
    photo_date: photoDate,
    category: AD_INBOX_CATEGORY,
    is_main: false,
    is_consultation: false,
    storage_type: 'cloudinary',
    memo: '광고 대기실 · AI 사람 제거 보정',
    metadata: {
      source: AD_INBOX_SOURCE,
      ad_inbox: true,
      ad_inbox_site_id: siteId ?? undefined,
      before_after_role: 'before',
      before_after_group_id: groupId,
      ad_inbox_label: shortName,
      edited_from: input.source.id,
      cleanup: 'people_removed',
      public_id: input.public_id ?? undefined,
      original_name: `cleanup-${input.source.original_name || input.source.id}.jpg`,
    },
  })

  if ('error' in result) {
    throw result.error
  }
  if (siteId) {
    await touchAdInboxSite(siteId)
  }
  return { id: result.id }
}

type AdInboxImageEditOptions = {
  prompt?: string
  promptFirst?: boolean
  model?: string
  temperature?: number
}

/** Before 합성 전용 — 구조(문/창) 유지에 유리한 최신 Flash Image */
const SYNTHESIZE_BEFORE_IMAGE_MODEL = 'gemini-3.1-flash-image'

/** Gemini 이미지 편집 API (사람 제거 / Before 합성 등). DB insert 없음. */
export async function runAdInboxImageEdit(
  imageUrl: string,
  promptOrOptions?: string | AdInboxImageEditOptions,
): Promise<{
  cloudinary_url: string
  thumbnail_url: string | null
  public_id: string | null
}> {
  const url = imageUrl.trim()
  if (!url) {
    throw new Error('보정할 이미지 URL이 없습니다.')
  }

  const options: AdInboxImageEditOptions =
    typeof promptOrOptions === 'string'
      ? { prompt: promptOrOptions }
      : promptOrOptions ?? {}

  const { data: auth } = await supabase.auth.getSession()
  const token = auth.session?.access_token
  const res = await fetch('/api/ad-inbox-cleanup-people', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      imageUrl: url,
      ...(options.prompt?.trim() ? { prompt: options.prompt.trim() } : {}),
      ...(options.promptFirst ? { promptFirst: true } : {}),
      ...(options.model?.trim() ? { model: options.model.trim() } : {}),
      ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
    }),
  })
  const json = (await res.json()) as {
    ok?: boolean
    message?: string
    cloudinary_url?: string
    thumbnail_url?: string | null
    public_id?: string | null
  }
  if (!res.ok || !json.ok || !json.cloudinary_url) {
    throw new Error(json.message || '이미지 보정에 실패했습니다.')
  }

  return {
    cloudinary_url: json.cloudinary_url,
    thumbnail_url: json.thumbnail_url ?? null,
    public_id: json.public_id ?? null,
  }
}

/** 사람 제거 API만 호출 (DB insert 없음). 쇼룸 가져오기 등에서 URL 교체용 */
export async function runAdInboxPeopleCleanup(imageUrl: string): Promise<{
  cloudinary_url: string
  thumbnail_url: string | null
  public_id: string | null
}> {
  return runAdInboxImageEdit(imageUrl)
}

/** 1단계: 가구 전량 제거 (사람 제거 프롬프트처럼 짧게·강하게) */
const SYNTHESIZE_BEFORE_STRIP_FURNITURE_PROMPT = `Edit this interior photo into a completely EMPTY room.

STRICT removals — delete ALL of these with zero leftovers:
desks, chairs, stools, shelves, bookcases, partition walls/counters, cabinets, wardrobes, tables, sofas, benches, plants, monitors, TVs, lamps, lights on stands, rugs, curtains if freestanding décor, posters, banners, hanging banners (현수막), wall signs, stickers, logos, lettering, printed text of any language (especially Korean/Hangul), signage, decor, boxes, clutter — including large foreground units.

Fill every removed area with continuous empty floor and plain blank walls only. Do NOT invent replacement furniture, built-ins, or storage.

Text / Hangul ban (critical — garbled Korean looks fake):
- Completely REMOVE all readable text, Hangul, banners, and signs. Replace with plain wall/floor matching nearby texture.
- Do NOT redraw, regenerate, translate, or invent any Korean/Hangul characters, English letters, numbers on walls, or banner text.
- Never leave broken, melted, or nonsense glyphs. If unsure, erase the whole sign into blank wall.

Architecture lock (critical):
- Keep the EXACT same camera angle, room shape, ceiling, and wall layout.
- Keep ONLY the windows and doors that already exist in the source photo — same count, same positions, same sizes, same frames.
- Do NOT add, invent, move, or duplicate any door, doorway, window, window frame, glass panel, or opening that is not clearly visible in the original.
- Do NOT turn wall areas into new doors/windows. If a wall was blank, keep it blank.

No people. Photorealistic empty room — nothing to sit on, nothing to store things in, no text anywhere.
Output the edited image only.`

/** 2단계: 빈 방을 공사 전(Before) 분위기로 */
const SYNTHESIZE_BEFORE_CONSTRUCTION_PROMPT = `Edit this already-empty room photo into a realistic BEFORE renovation / construction state (raw unfinished space).

Allowed: bare/unfinished floor, unfinished or plastered walls, construction dust feel, temporary protective film, exposed concrete look — still EMPTY.

STRICT bans:
- Do NOT add any furniture, fixtures for seating/storage, desks, chairs, shelves, cabinets, partitions, plants, décor, or appliances.
- Do NOT add, invent, move, or duplicate any door, doorway, window, window frame, or opening. Keep ONLY openings already in this photo (same count/positions/sizes).
- Do NOT invent new wall openings. Blank walls stay blank.
- Do NOT add or redraw any banners, signs, Hangul/Korean text, logos, or lettering. No garbled glyphs. Walls stay text-free.

Keep the exact same camera and room geometry.
No people. Photorealistic empty construction-before room with no text.
Output the edited image only.`

/**
 * construction: 가구 제거 → 공사 전 분위기 (기존 2패스)
 * empty_room: 가구만 제거한 빈 방 (빈 방 타임랩스용)
 */
export type SynthesizeBeforeMode = 'construction' | 'empty_room'

/** After 사진으로 Before 합성. 쇼룸 원본은 수정하지 않음 */
export async function synthesizeBeforeFromAfterImage(
  imageUrl: string,
  mode: SynthesizeBeforeMode = 'construction',
): Promise<{
  cloudinary_url: string
  thumbnail_url: string | null
  public_id: string | null
}> {
  const stripped = await runAdInboxImageEdit(imageUrl, {
    prompt: SYNTHESIZE_BEFORE_STRIP_FURNITURE_PROMPT,
    promptFirst: true,
    temperature: 0.1,
    model: SYNTHESIZE_BEFORE_IMAGE_MODEL,
  })

  if (mode === 'empty_room') {
    return stripped
  }

  try {
    return await runAdInboxImageEdit(stripped.cloudinary_url, {
      prompt: SYNTHESIZE_BEFORE_CONSTRUCTION_PROMPT,
      promptFirst: true,
      temperature: 0.1,
      model: SYNTHESIZE_BEFORE_IMAGE_MODEL,
    })
  } catch {
    // 2패스 실패 시 1패스(빈 방) 결과라도 반환
    return stripped
  }
}

/**
 * After만 있는 쇼룸 컷 → 합성 Before를 **쇼룸 정본**으로 저장한 뒤
 * 대기실 카드에 BA를 복사 입고하고 타임랩스 job을 시작합니다.
 */
export async function createAdInboxTimelapseFromAfterOnly(input: {
  after: ShowroomImageAsset
  synthesizedBefore: {
    cloudinary_url: string
    thumbnail_url: string | null
    public_id?: string | null
  }
  siteName?: string | null
  /** empty_room 합성 Before면 빈 방 타임랩스(구도+설치)로 시작 */
  synthesizeMode?: SynthesizeBeforeMode
}): Promise<{
  jobId: string
  siteId: string
  siteBatchKey: string
  shortName: string
  /** 대기실 합성 Before (승격 대상) */
  beforeAssetId: string
  /** 대기실 After 복사본 */
  afterAssetId: string
  /** 쇼룸 After 원본 — 승격 시 그룹 연결용 */
  sourceAfterAssetId: string
  inboxAssetCount: number
}> {
  const after = input.after
  const synthesizeMode: SynthesizeBeforeMode = input.synthesizeMode ?? 'construction'
  const emptyRoom = synthesizeMode === 'empty_room'
  const siteName =
    trimOrNull(input.siteName) ||
    trimOrNull(after.canonical_site_name) ||
    trimOrNull(after.site_name) ||
    trimOrNull(after.raw_site_name) ||
    trimOrNull(after.external_display_name) ||
    '이름미상'

  const photoDate = after.created_at ? after.created_at.slice(0, 10) : null
  const site = await createAdInboxSite({ shortName: siteName, photoDate })
  const siteBatchKey = buildAdInboxSiteGroupId(site.id)

  const beforeInsert = await insertImageAsset({
    cloudinary_url: input.synthesizedBefore.cloudinary_url,
    thumbnail_url: input.synthesizedBefore.thumbnail_url,
    public_watermark_status: 'skipped',
    site_name: site.short_name,
    photo_date: photoDate,
    location: after.location,
    business_type: after.business_type,
    color_name: after.color_name,
    product_name: after.product_name,
    category: AD_INBOX_CATEGORY,
    is_main: false,
    is_consultation: false,
    storage_type: 'cloudinary',
    memo: emptyRoom
      ? '광고 대기실 · After 기반 빈 방 Before 합성'
      : '광고 대기실 · After 기반 Before 합성',
    metadata: {
      source: AD_INBOX_SOURCE,
      ad_inbox: true,
      ad_inbox_site_id: site.id,
      before_after_role: 'before',
      before_after_group_id: siteBatchKey,
      ad_inbox_label: site.short_name,
      synthesized_from_after_id: after.id,
      synthesized_before: true,
      synthesize_before_mode: synthesizeMode,
      public_id: input.synthesizedBefore.public_id ?? undefined,
      original_name: `synth-before-${after.id}.jpg`,
    },
  })

  if ('error' in beforeInsert) {
    throw beforeInsert.error
  }

  const afterForInbox: ShowroomImageAsset = {
    ...after,
    before_after_role: 'after',
    before_after_group_id: siteBatchKey,
  }

  const copied = await addShowroomPhotosToAdInboxSite({
    siteId: site.id,
    images: [afterForInbox],
  })

  const afterAssetId = copied.createdBySourceId[after.id] ?? copied.createdAssetIds[0]
  if (!afterAssetId) {
    throw new Error('대기실 After 복사본을 만들지 못했습니다.')
  }

  const beforeForJob: ShowroomImageAsset = {
    ...after,
    id: beforeInsert.id,
    cloudinary_url: input.synthesizedBefore.cloudinary_url,
    thumbnail_url: input.synthesizedBefore.thumbnail_url,
    site_name: site.short_name,
    before_after_role: 'before',
    before_after_group_id: siteBatchKey,
    is_main: false,
  }

  const afterForJob: ShowroomImageAsset = {
    ...after,
    id: afterAssetId,
    before_after_role: 'after',
    before_after_group_id: siteBatchKey,
  }

  const created = await createShowroomShortsJob({
    promptText: (emptyRoom ? SHOWROOM_SHORTS_EMPTY_ROOM_TIMELAPSE_PROMPT : AD_INBOX_DEFAULT_PROMPT).trim(),
    channels: [...SHOWROOM_SHORTS_CHANNELS],
    images: [beforeForJob, afterForJob],
    beforeAfterGroupKey: buildAdInboxShortsGroupKey(siteBatchKey),
    timelapseMode: emptyRoom ? 'empty_room' : 'standard',
  })

  return {
    jobId: created.job.id,
    siteId: site.id,
    siteBatchKey,
    shortName: site.short_name,
    beforeAssetId: beforeInsert.id,
    afterAssetId,
    sourceAfterAssetId: after.id,
    inboxAssetCount: 1 + copied.assetCount,
  }
}

/**
 * 이미 대기실에 있는 After(쇼룸에서 보낸 After-only 포함)로
 * 합성 Before를 같은 카드에 첨부합니다. 타임랩스는 시작하지 않습니다.
 */
export async function attachSynthesizedBeforeToAdInboxSite(input: {
  siteId: string
  after: AdInboxAsset | ShowroomImageAsset
  synthesizedBefore: {
    cloudinary_url: string
    thumbnail_url: string | null
    public_id?: string | null
  }
  synthesizeMode?: SynthesizeBeforeMode
}): Promise<{
  beforeAssetId: string
  siteId: string
  siteBatchKey: string
  shortName: string
  /** 승격·정규화용 After 원본(가능하면 쇼룸 id) */
  sourceAfterAssetId: string
  synthesizeMode: SynthesizeBeforeMode
}> {
  const siteId = trimOrNull(input.siteId)
  if (!siteId) {
    throw new Error('대기실 카드를 선택하세요.')
  }

  const after = input.after
  if (!after?.id) {
    throw new Error('After 사진을 선택하세요.')
  }
  if (!input.synthesizedBefore.cloudinary_url?.trim()) {
    throw new Error('합성 Before 이미지가 없습니다.')
  }

  const { data: siteRow, error: siteError } = await supabase
    .from('ad_inbox_sites')
    .select('id, short_name, photo_date, status, created_at, updated_at')
    .eq('id', siteId)
    .maybeSingle()

  if (siteError || !siteRow) {
    throw new Error(siteError?.message || '대기실 카드를 찾을 수 없습니다.')
  }

  const site = mapSiteRow(siteRow as Record<string, unknown>)
  const siteBatchKey = buildAdInboxSiteGroupId(site.id)
  const synthesizeMode: SynthesizeBeforeMode = input.synthesizeMode ?? 'construction'
  const emptyRoom = synthesizeMode === 'empty_room'
  const photoDate =
    site.photo_date ||
    ('photo_date' in after && typeof after.photo_date === 'string' ? after.photo_date.slice(0, 10) : null) ||
    (after.created_at ? after.created_at.slice(0, 10) : null)

  // 쇼룸에서 복사 입고된 After면 원본 id를 승격 링크로 쓴다.
  let sourceAfterAssetId = after.id
  const { data: afterRow } = await supabase
    .from('image_assets')
    .select('id, metadata')
    .eq('id', after.id)
    .maybeSingle()
  if (afterRow?.metadata && typeof afterRow.metadata === 'object' && !Array.isArray(afterRow.metadata)) {
    const meta = afterRow.metadata as Record<string, unknown>
    if (
      typeof meta.imported_from_showroom_asset_id === 'string' &&
      meta.imported_from_showroom_asset_id.trim()
    ) {
      sourceAfterAssetId = meta.imported_from_showroom_asset_id.trim()
    }
  }

  const beforeInsert = await insertImageAsset({
    cloudinary_url: input.synthesizedBefore.cloudinary_url,
    thumbnail_url: input.synthesizedBefore.thumbnail_url,
    public_watermark_status: 'skipped',
    site_name: site.short_name,
    photo_date: photoDate,
    location: after.location,
    business_type: after.business_type,
    color_name: after.color_name,
    product_name: after.product_name,
    category: AD_INBOX_CATEGORY,
    is_main: false,
    is_consultation: false,
    storage_type: 'cloudinary',
    memo: emptyRoom
      ? '광고 대기실 · After 기반 빈 방 Before 합성'
      : '광고 대기실 · After 기반 Before 합성',
    metadata: {
      source: AD_INBOX_SOURCE,
      ad_inbox: true,
      ad_inbox_site_id: site.id,
      before_after_role: 'before',
      before_after_group_id: siteBatchKey,
      ad_inbox_label: site.short_name,
      synthesized_from_after_id: sourceAfterAssetId,
      synthesized_before: true,
      synthesize_before_mode: synthesizeMode,
      public_id: input.synthesizedBefore.public_id ?? undefined,
      original_name: `synth-before-${after.id}.jpg`,
    },
  })

  if ('error' in beforeInsert) {
    throw beforeInsert.error
  }

  // After 역할이 비어 있으면 after로 고정해 둔다.
  if (after.before_after_role !== 'after') {
    try {
      await updateAdInboxAssetRole(after.id, 'after')
    } catch {
      // 역할 저장 실패해도 Before 첨부는 유지
    }
  }

  return {
    beforeAssetId: beforeInsert.id,
    siteId: site.id,
    siteBatchKey,
    shortName: site.short_name,
    sourceAfterAssetId,
    synthesizeMode,
  }
}

/**
 * 고아 합성 Before(ad_inbox 전용·카테고리 누락 등)를 쇼룸 정본으로 정규화하고
 * 대기실 카드에 Before 복사본이 없으면 추가합니다.
 */
export async function normalizeSynthesizedBeforeToShowroom(beforeAssetId: string): Promise<{
  beforeAssetId: string
  afterAssetId: string | null
  showroomCategory: string | null
  inboxCopied: boolean
}> {
  const id = beforeAssetId.trim()
  if (!id) throw new Error('Before 자산 ID가 없습니다.')

  const { data: beforeRow, error: beforeError } = await supabase
    .from('image_assets')
    .select(
      'id, category, site_name, location, business_type, color_name, product_name, memo, metadata, cloudinary_url, thumbnail_url, created_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (beforeError || !beforeRow) {
    throw new Error(beforeError?.message || '합성 Before를 찾지 못했습니다.')
  }

  const beforeMeta =
    beforeRow.metadata && typeof beforeRow.metadata === 'object' && !Array.isArray(beforeRow.metadata)
      ? { ...(beforeRow.metadata as Record<string, unknown>) }
      : {}

  if (beforeMeta.synthesized_before !== true && beforeMeta.synthesized_before !== 'true') {
    throw new Error('합성 Before 자산이 아닙니다.')
  }

  const afterId =
    typeof beforeMeta.synthesized_from_after_id === 'string'
      ? beforeMeta.synthesized_from_after_id.trim()
      : ''

  let afterCategory: string | null = null
  let afterSiteName: string | null =
    typeof beforeRow.site_name === 'string' ? beforeRow.site_name.trim() : null
  let groupId =
    typeof beforeMeta.before_after_group_id === 'string' && beforeMeta.before_after_group_id.trim()
      ? beforeMeta.before_after_group_id.trim()
      : afterId
        ? `synth-ba:${afterId}`
        : `synth-ba:${id}`

  const inboxSiteId =
    typeof beforeMeta.ad_inbox_site_id === 'string' && beforeMeta.ad_inbox_site_id.trim()
      ? beforeMeta.ad_inbox_site_id.trim()
      : null

  if (afterId) {
    const { data: afterRow } = await supabase
      .from('image_assets')
      .select('id, category, site_name, product_name, photo_date, metadata, is_consultation')
      .eq('id', afterId)
      .maybeSingle()
    if (afterRow) {
      afterCategory =
        typeof afterRow.category === 'string' &&
        afterRow.category.trim() &&
        afterRow.category !== AD_INBOX_CATEGORY
          ? afterRow.category.trim()
          : null
      afterSiteName =
        (typeof afterRow.site_name === 'string' && afterRow.site_name.trim()) || afterSiteName
      const afterMeta =
        afterRow.metadata && typeof afterRow.metadata === 'object' && !Array.isArray(afterRow.metadata)
          ? { ...(afterRow.metadata as Record<string, unknown>) }
          : {}
      if (typeof afterMeta.before_after_group_id === 'string' && afterMeta.before_after_group_id.trim()) {
        groupId = afterMeta.before_after_group_id.trim()
      }
      afterMeta.before_after_role = afterMeta.before_after_role || 'after'
      afterMeta.before_after_group_id = groupId
      await supabase
        .from('image_assets')
        .update({
          metadata: afterMeta,
          ...(afterRow.is_consultation === true ? {} : { is_consultation: true }),
        })
        .eq('id', afterId)

      // 쇼룸 그룹 키는 space_id가 before_after_group_id보다 우선이므로 After 상담 메타를 복사
      if (typeof afterMeta.space_id === 'string' && afterMeta.space_id.trim()) {
        beforeMeta.space_id = afterMeta.space_id.trim()
      }
      if (typeof afterMeta.consultation_id === 'string' && afterMeta.consultation_id.trim()) {
        beforeMeta.consultation_id = afterMeta.consultation_id.trim()
      }
      if (typeof afterMeta.space_display_name === 'string' && afterMeta.space_display_name.trim()) {
        beforeMeta.space_display_name = afterMeta.space_display_name.trim()
      }
      if (typeof afterMeta.external_display_name === 'string' && afterMeta.external_display_name.trim()) {
        beforeMeta.external_display_name = afterMeta.external_display_name.trim()
      }
      if (
        typeof afterMeta.broad_external_display_name === 'string' &&
        afterMeta.broad_external_display_name.trim()
      ) {
        beforeMeta.broad_external_display_name = afterMeta.broad_external_display_name.trim()
      }
      if (typeof afterMeta.canonical_site_name === 'string' && afterMeta.canonical_site_name.trim()) {
        beforeMeta.canonical_site_name = afterMeta.canonical_site_name.trim()
      } else if (afterSiteName) {
        beforeMeta.canonical_site_name = afterSiteName
      }
      if (
        (!beforeRow.product_name || !String(beforeRow.product_name).trim()) &&
        typeof afterRow.product_name === 'string' &&
        afterRow.product_name.trim()
      ) {
        beforeMeta.product_name = afterRow.product_name.trim()
      }
    }
  }

  const showroomMeta: Record<string, unknown> = {
    ...beforeMeta,
    before_after_role: 'before',
    before_after_group_id: groupId,
    synthesized_before: true,
  }
  if (afterId) showroomMeta.synthesized_from_after_id = afterId
  delete showroomMeta.source
  delete showroomMeta.ad_inbox
  delete showroomMeta.ad_inbox_site_id
  delete showroomMeta.ad_inbox_label
  delete showroomMeta.restored_at
  delete showroomMeta.restored_reason

  const afterProductName =
    typeof beforeMeta.product_name === 'string' && beforeMeta.product_name.trim()
      ? beforeMeta.product_name.trim()
      : null

  const { error: updateError } = await supabase
    .from('image_assets')
    .update({
      category: afterCategory,
      site_name: afterSiteName,
      is_consultation: true,
      memo: '쇼룸 · After 기반 Before 합성',
      ...(afterProductName && !String(beforeRow.product_name ?? '').trim()
        ? { product_name: afterProductName }
        : {}),
      metadata: showroomMeta,
    })
    .eq('id', id)

  if (updateError) {
    throw new Error(updateError.message || '쇼룸 정본 정규화에 실패했습니다.')
  }

  let inboxCopied = false
  if (inboxSiteId) {
    const { data: inboxRows } = await supabase
      .from('image_assets')
      .select('id, metadata')
      .eq('category', AD_INBOX_CATEGORY)
      .filter('metadata->>ad_inbox_site_id', 'eq', inboxSiteId)
      .limit(100)

    const hasInboxBeforeCopy = (inboxRows ?? []).some((row) => {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null
      return meta?.imported_from_showroom_asset_id === id
    })

    if (!hasInboxBeforeCopy) {
      const beforeAsset: ShowroomImageAsset = {
        id,
        cloudinary_url: String(beforeRow.cloudinary_url ?? ''),
        thumbnail_url: beforeRow.thumbnail_url != null ? String(beforeRow.thumbnail_url) : null,
        site_name: afterSiteName,
        location: beforeRow.location != null ? String(beforeRow.location) : null,
        business_type: beforeRow.business_type != null ? String(beforeRow.business_type) : null,
        color_name: beforeRow.color_name != null ? String(beforeRow.color_name) : null,
        product_name: beforeRow.product_name != null ? String(beforeRow.product_name) : null,
        is_main: false,
        created_at: beforeRow.created_at != null ? String(beforeRow.created_at) : null,
        view_count: 0,
        share_count: 0,
        internal_score: null,
        before_after_role: 'before',
        before_after_group_id: groupId,
      }
      await addShowroomPhotosToAdInboxSite({ siteId: inboxSiteId, images: [beforeAsset] })
      inboxCopied = true
    }
  }

  return {
    beforeAssetId: id,
    afterAssetId: afterId || null,
    showroomCategory: afterCategory,
    inboxCopied,
  }
}

/** 보정본 URL로 쇼룸 원본 교체 (확인 후 호출) */
export async function applyCleanupToShowroomOriginal(input: {
  assetId: string
  cloudinary_url: string
  thumbnail_url?: string | null
  public_id?: string | null
}): Promise<void> {
  const { error } = await replaceShowroomAssetImageUrls(input)
  if (error) throw error
}

export type PromoteAdInboxMeta = {
  site_name: string
  selectedSpaceOption?: SpaceDisplayNameOption | null
  photo_date?: string | null
  location?: string | null
  business_type?: string | null
  /** 제품 카테고리(책상 등). category 컬럼은 ad_inbox 유지, metadata.category에 저장 */
  product_category: string
  product_name: string
  color_name?: string | null
  memo?: string | null
  before_after_role: 'before' | 'after'
}

export type PromoteAdInboxResult = {
  promoted: number
  remaining: number
  siteStatus: AdInboxSiteStatus
  /** 이미 쇼룸에 있는 After 원본과만 연결하고 복제 승격은 생략한 장수 */
  linkedExisting?: number
}

export async function updateAdInboxSiteStatus(
  siteId: string,
  status: AdInboxSiteStatus,
): Promise<AdInboxSite> {
  const id = siteId.trim()
  if (!id) throw new Error('현장 카드 ID가 없습니다.')

  const { data, error } = await supabase
    .from('ad_inbox_sites')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, short_name, photo_date, status, created_at, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message || '현장 카드 상태 변경에 실패했습니다.')
  }

  return mapSiteRow(data as Record<string, unknown>)
}

/**
 * 현장 카드를 대기실에서 제거합니다(archived).
 * - 미승격 대기실 사진은 DB에서 삭제
 * - 이미 쇼룸 승격된 사진은 카드 연결만 끊음(쇼룸 자산 유지)
 */
export async function deleteAdInboxSite(siteId: string): Promise<void> {
  const id = siteId.trim()
  if (!id) throw new Error('현장 카드 ID가 없습니다.')

  const { data: site, error: siteError } = await supabase
    .from('ad_inbox_sites')
    .select('id, short_name, status')
    .eq('id', id)
    .maybeSingle()

  if (siteError) {
    throw new Error(siteError.message || '현장 카드를 찾지 못했습니다.')
  }
  if (!site) {
    throw new Error('현장 카드를 찾지 못했습니다.')
  }
  if (site.status === 'archived') {
    return
  }

  const assets = (await listAdInboxAssets()).filter((asset) => asset.ad_inbox_site_id === id)
  for (const asset of assets) {
    if (asset.is_consultation) {
      const { data: row, error: readError } = await supabase
        .from('image_assets')
        .select('metadata')
        .eq('id', asset.id)
        .single()
      if (readError || !row) {
        throw new Error(readError?.message || '승격된 사진 연결을 끊지 못했습니다.')
      }
      const prev =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {}
      delete prev.ad_inbox_site_id
      const { error: unlinkError } = await supabase
        .from('image_assets')
        .update({ metadata: prev })
        .eq('id', asset.id)
      if (unlinkError) {
        throw new Error(unlinkError.message || '승격된 사진 연결을 끊지 못했습니다.')
      }
    } else {
      await deleteAdInboxAsset(asset.id)
    }
  }

  await updateAdInboxSiteStatus(id, 'archived')
}

/**
 * 대기실 사진을 재업로드 없이 외부 쇼룸으로 승격.
 * - is_consultation=true, 메타 채움
 * - category=ad_inbox 유지 (대기실 목록·계보)
 * - 남은 미승격이 0이면 site status=promoted
 */
export async function promoteAdInboxAssetsToShowroom(input: {
  siteId: string
  assetIds: string[]
  meta: PromoteAdInboxMeta
  mainAssetId?: string | null
  perAssetRoles?: Record<string, 'before' | 'after'>
}): Promise<PromoteAdInboxResult> {
  const siteId = input.siteId.trim()
  if (!siteId) throw new Error('현장 카드 ID가 없습니다.')

  const assetIds = [...new Set(input.assetIds.map((id) => id.trim()).filter(Boolean))]
  if (assetIds.length === 0) throw new Error('승격할 사진을 선택해 주세요.')

  const space = input.meta.selectedSpaceOption ?? null
  const siteTrim = (input.meta.site_name || space?.display_name || '').trim()
  if (!siteTrim) {
    throw new Error('현장명이 없습니다. 대기실 임시 이름을 확인해 주세요.')
  }
  const productName = input.meta.product_name.trim()
  if (!productName) throw new Error('제품명을 입력해 주세요.')
  const productCategory = input.meta.product_category.trim() || '책상'

  // 상담카드 선택은 선택 사항. 있으면 사용하고, 없으면 원본 쇼룸 자산 메타에서 복구.
  const preferredConsultationId = space?.consultation_id?.trim() || ''
  const preferredSpaceId = space?.space_id?.trim() || null
  const location = trimOrNull(input.meta.location)
  const businessType = trimOrNull(input.meta.business_type)
  const photoDate = trimOrNull(input.meta.photo_date)
  const colorName = trimOrNull(input.meta.color_name)
  const memo = trimOrNull(input.meta.memo)
  const defaultRole = input.meta.before_after_role === 'before' ? 'before' : 'after'
  const promotedAt = new Date().toISOString()

  const externalDisplayName = space
    ? buildExternalDisplayName({
        requestDate: space.request_date,
        startDate: space.start_date,
        createdAt: space.created_at,
        region: location,
        siteName: siteTrim,
        industry: businessType,
        customerPhone: space.customer_phone,
      })
    : null
  const broadExternalDisplayName = buildBroadExternalDisplayName(externalDisplayName)

  const { data: rows, error: fetchError } = await supabase
    .from('image_assets')
    .select('id, category, metadata, is_consultation')
    .in('id', assetIds)

  if (fetchError) {
    throw new Error(fetchError.message || '승격 대상 사진을 불러오지 못했습니다.')
  }

  const byId = new Map((rows ?? []).map((row) => [String(row.id), row as Record<string, unknown>]))
  let promoted = 0
  let linkedExisting = 0

  const readMetaString = (meta: Record<string, unknown>, key: string): string => {
    const value = meta[key]
    return typeof value === 'string' && value.trim() ? value.trim() : ''
  }

  const resolveSourceShowroomMeta = async (
    prevMeta: Record<string, unknown>,
  ): Promise<{
    consultation_id?: string
    space_id?: string
    external_display_name?: string
    broad_external_display_name?: string
    canonical_site_name?: string
  }> => {
    const sourceId =
      readMetaString(prevMeta, 'imported_from_showroom_asset_id') ||
      readMetaString(prevMeta, 'synthesized_from_after_id')
    if (!sourceId) return {}

    const { data: sourceRow } = await supabase
      .from('image_assets')
      .select('id, metadata')
      .eq('id', sourceId)
      .maybeSingle()
    if (!sourceRow?.metadata || typeof sourceRow.metadata !== 'object' || Array.isArray(sourceRow.metadata)) {
      return {}
    }
    const sourceMeta = sourceRow.metadata as Record<string, unknown>
    return {
      consultation_id: readMetaString(sourceMeta, 'consultation_id') || undefined,
      space_id: readMetaString(sourceMeta, 'space_id') || undefined,
      external_display_name: readMetaString(sourceMeta, 'external_display_name') || undefined,
      broad_external_display_name: readMetaString(sourceMeta, 'broad_external_display_name') || undefined,
      canonical_site_name: readMetaString(sourceMeta, 'canonical_site_name') || undefined,
    }
  }

  const linkShowroomAfterGroup = async (sourceAfterId: string, groupId: string) => {
    const { data: afterRow, error: afterError } = await supabase
      .from('image_assets')
      .select('id, metadata, is_consultation')
      .eq('id', sourceAfterId)
      .maybeSingle()
    if (afterError || !afterRow) return null

    const afterMeta =
      afterRow.metadata && typeof afterRow.metadata === 'object' && !Array.isArray(afterRow.metadata)
        ? { ...(afterRow.metadata as Record<string, unknown>) }
        : {}
    afterMeta.before_after_role = afterMeta.before_after_role || 'after'
    afterMeta.before_after_group_id = groupId

    await supabase
      .from('image_assets')
      .update({
        metadata: afterMeta as Json,
        ...(afterRow.is_consultation === true ? {} : { is_consultation: true }),
      })
      .eq('id', sourceAfterId)

    return afterMeta
  }

  for (const assetId of assetIds) {
    const row = byId.get(assetId)
    if (!row) {
      throw new Error(`사진을 찾지 못했습니다: ${assetId}`)
    }

    const prevMeta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}

    const isAdInbox =
      row.category === AD_INBOX_CATEGORY ||
      prevMeta.source === AD_INBOX_SOURCE ||
      prevMeta.ad_inbox === true
    if (!isAdInbox) {
      throw new Error('광고 대기실 사진만 쇼룸으로 보낼 수 있습니다.')
    }

    const role = input.perAssetRoles?.[assetId] ?? defaultRole

    // 쇼룸 After 원본이 이미 있으면 대기실 복사본은 승격하지 않고 그룹만 맞춤
    const importedFrom =
      typeof prevMeta.imported_from_showroom_asset_id === 'string'
        ? prevMeta.imported_from_showroom_asset_id.trim()
        : ''
    if (importedFrom && role === 'after') {
      const { data: sourceRow } = await supabase
        .from('image_assets')
        .select('id, is_consultation, metadata')
        .eq('id', importedFrom)
        .maybeSingle()
      if (sourceRow?.is_consultation === true) {
        const groupId =
          (typeof prevMeta.before_after_group_id === 'string' && prevMeta.before_after_group_id.trim()) ||
          `synth-ba:${importedFrom}`
        await linkShowroomAfterGroup(importedFrom, groupId)
        linkedExisting += 1
        continue
      }
    }

    const snapshot = {
      site_name: prevMeta.space_display_name ?? null,
      product_name: prevMeta.product_name ?? null,
      category: prevMeta.category ?? null,
      before_after_role: prevMeta.before_after_role ?? null,
      snapped_at: promotedAt,
    }

    const sourceAfterId =
      typeof prevMeta.synthesized_from_after_id === 'string'
        ? prevMeta.synthesized_from_after_id.trim()
        : ''
    const groupId =
      (typeof prevMeta.before_after_group_id === 'string' && prevMeta.before_after_group_id.trim()) ||
      (sourceAfterId ? `synth-ba:${sourceAfterId}` : undefined)

    const sourceLink = await resolveSourceShowroomMeta(prevMeta)
    const consultationId =
      preferredConsultationId ||
      readMetaString(prevMeta, 'consultation_id') ||
      sourceLink.consultation_id ||
      ''
    const spaceId =
      preferredSpaceId ||
      readMetaString(prevMeta, 'space_id') ||
      sourceLink.space_id ||
      null

    const nextMeta: Record<string, unknown> = {
      ...prevMeta,
      source: AD_INBOX_SOURCE,
      ad_inbox: true,
      ad_inbox_site_id: siteId,
      promoted_at: promotedAt,
      promoted_from: 'ad_inbox',
      pre_promote_snapshot: snapshot,
      consultation_id: consultationId || undefined,
      space_id: spaceId || undefined,
      space_display_name: siteTrim,
      category: productCategory,
      before_after_role: role,
      external_display_name:
        externalDisplayName ||
        sourceLink.external_display_name ||
        readMetaString(prevMeta, 'external_display_name') ||
        undefined,
      broad_external_display_name:
        broadExternalDisplayName ||
        sourceLink.broad_external_display_name ||
        readMetaString(prevMeta, 'broad_external_display_name') ||
        undefined,
      ...(sourceLink.canonical_site_name
        ? { canonical_site_name: sourceLink.canonical_site_name }
        : {}),
      ...(groupId ? { before_after_group_id: groupId } : {}),
    }

    if (role === 'before' && sourceAfterId) {
      const afterMeta = await linkShowroomAfterGroup(sourceAfterId, groupId || `synth-ba:${sourceAfterId}`)
      if (afterMeta) {
        // After가 space_id로 묶여 있으면 Before도 같은 키로 맞춰야 전후 카드에 같이 보임
        if (typeof afterMeta.space_id === 'string' && afterMeta.space_id.trim()) {
          nextMeta.space_id = afterMeta.space_id.trim()
        }
        if (typeof afterMeta.consultation_id === 'string' && afterMeta.consultation_id.trim()) {
          nextMeta.consultation_id = afterMeta.consultation_id.trim()
        }
        if (typeof afterMeta.external_display_name === 'string' && afterMeta.external_display_name.trim()) {
          nextMeta.external_display_name = afterMeta.external_display_name.trim()
        }
        if (
          typeof afterMeta.broad_external_display_name === 'string' &&
          afterMeta.broad_external_display_name.trim()
        ) {
          nextMeta.broad_external_display_name = afterMeta.broad_external_display_name.trim()
        }
        if (typeof afterMeta.canonical_site_name === 'string' && afterMeta.canonical_site_name.trim()) {
          nextMeta.canonical_site_name = afterMeta.canonical_site_name.trim()
        }
      }
    }

    const { error: updateError } = await supabase
      .from('image_assets')
      .update({
        site_name: siteTrim,
        photo_date: photoDate,
        location,
        business_type: businessType,
        product_name: productName,
        color_name: colorName,
        memo,
        is_consultation: true,
        // category 컬럼은 ad_inbox 유지 — 대기실 필터·계보
        category: AD_INBOX_CATEGORY,
        metadata: nextMeta as Json,
      })
      .eq('id', assetId)

    if (updateError) {
      throw new Error(updateError.message || '쇼룸 승격 저장에 실패했습니다.')
    }

    promoted += 1
  }

  if (promoted === 0 && linkedExisting === 0) {
    throw new Error('승격할 대기실 사진이 없습니다.')
  }

  const mainAssetId = input.mainAssetId?.trim()
    || Object.entries(input.perAssetRoles ?? {})
      .find(([assetId, role]) => role === 'after' && assetIds.includes(assetId))?.[0]
    || null
  if (mainAssetId && assetIds.includes(mainAssetId)) {
    const { error: mainError } = await setImageAssetMain(mainAssetId, siteTrim)
    if (mainError) {
      throw mainError
    }
  }

  await touchAdInboxSite(siteId)

  const siteAssets = await listAdInboxAssets()
  const onSite = siteAssets.filter((asset) => asset.ad_inbox_site_id === siteId)
  const remaining = onSite.filter((asset) => !asset.is_consultation).length

  let siteStatus: AdInboxSiteStatus = 'open'
  if (remaining === 0 && onSite.length > 0) {
    const updated = await updateAdInboxSiteStatus(siteId, 'promoted')
    siteStatus = updated.status
  } else {
    const sites = await listAdInboxSites()
    siteStatus = sites.find((site) => site.id === siteId)?.status ?? 'open'
  }

  return { promoted, remaining, siteStatus, linkedExisting }
}

export async function cleanupPeopleFromAdInboxAsset(asset: AdInboxAsset): Promise<{ id: string }> {
  const imageUrl = asset.cloudinary_url?.trim() || asset.thumbnail_url?.trim()
  if (!imageUrl) {
    throw new Error('보정할 이미지 URL이 없습니다.')
  }

  const cleaned = await runAdInboxPeopleCleanup(imageUrl)

  return insertAdInboxCleanupAsset({
    source: asset,
    cloudinary_url: cleaned.cloudinary_url,
    thumbnail_url: cleaned.thumbnail_url,
    public_id: cleaned.public_id,
  })
}
