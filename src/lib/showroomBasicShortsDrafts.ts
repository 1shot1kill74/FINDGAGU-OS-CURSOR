import { supabase } from '@/lib/supabase'
import { broadenPublicDisplayName } from '@/lib/showroomShareService'

export const SHOWROOM_BASIC_SHORTS_CHANNELS = ['youtube', 'facebook', 'instagram'] as const
export type ShowroomBasicShortsChannel = (typeof SHOWROOM_BASIC_SHORTS_CHANNELS)[number]

export const SHOWROOM_BASIC_SHORTS_PUBLISH_STATUSES = [
  'draft',
  'ready',
  'preparing',
  'launch_ready',
  'approved',
  'publishing',
  'published',
  'failed',
] as const

export type ShowroomBasicShortsPublishStatus = (typeof SHOWROOM_BASIC_SHORTS_PUBLISH_STATUSES)[number]

export type ShowroomBasicShortsPublishDispatchResult = {
  ok: boolean
  action: 'prepare' | 'launch'
  status: ShowroomBasicShortsPublishStatus | 'published'
  mode?: 'mock' | 'live'
  message?: string
}

export type ShowroomBasicShortsDraftPayload = {
  displayName: string
  industry: string | null
  productSummary: string | null
  colorSummary: string | null
  durationSeconds: number
  selectedImageIds: string[]
  imageOrder: string[]
  script: {
    heroLine: string
    detailLine: string
    detailLine2: string
    closingLine: string
    endingTitle: string
    endingSubtitle: string
  }
  packageText: string
}

export type ShowroomBasicShortsDraftRecord = {
  id: string
  status: string
  displayName: string
  industry: string | null
  productSummary: string | null
  colorSummary: string | null
  durationSeconds: number
  selectedImageIds: string[]
  imageOrder: string[]
  script: {
    heroLine: string
    detailLine: string
    detailLine2: string
    closingLine: string
    endingTitle: string
    endingSubtitle: string
  }
  packageText: string
  finalVideoUrl: string | null
  renderError: string | null
  createdAt: string
  updatedAt: string
}

export type ShowroomBasicShortsTargetRecord = {
  id: string
  basicShortsDraftId: string
  channel: ShowroomBasicShortsChannel
  title: string
  description: string
  hashtags: string[]
  firstComment: string
  publishStatus: ShowroomBasicShortsPublishStatus
  externalPostId: string | null
  externalPostUrl: string | null
  preparationPayload: Record<string, unknown> | null
  preparationError: string | null
  approvedAt: string | null
  preparedAt: string | null
  launchReadyAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ShowroomBasicShortsLogRecord = {
  id: string
  basicShortsDraftId: string
  targetId: string | null
  stage: string
  message: string
  payload: Record<string, unknown> | null
  createdAt: string
}

type ShowroomBasicShortsPackageSeed = {
  displayName: string
  selectedImageIds?: string[]
  industry: string | null
  productSummary: string | null
  colorSummary?: string | null
  script: {
    heroLine: string
    detailLine: string
    detailLine2: string
    closingLine: string
    endingTitle?: string
    endingSubtitle?: string
  }
}

function mapShowroomBasicShortsDraftRow(row: {
  id: unknown
  status: unknown
  display_name: unknown
  industry: unknown
  product_summary: unknown
  color_summary: unknown
  duration_seconds: unknown
  selected_image_ids: unknown
  image_order: unknown
  script: unknown
  package_text: unknown
  final_video_url: unknown
  render_error: unknown
  created_at: unknown
  updated_at: unknown
}): ShowroomBasicShortsDraftRecord {
  const scriptRecord =
    row.script && typeof row.script === 'object' && !Array.isArray(row.script)
      ? (row.script as Record<string, unknown>)
      : null

  return {
    id: String(row.id ?? ''),
    status: String(row.status ?? 'draft'),
    displayName: String(row.display_name ?? ''),
    industry: typeof row.industry === 'string' ? row.industry : null,
    productSummary: typeof row.product_summary === 'string' ? row.product_summary : null,
    colorSummary: typeof row.color_summary === 'string' ? row.color_summary : null,
    durationSeconds: Number(row.duration_seconds ?? 10),
    selectedImageIds: Array.isArray(row.selected_image_ids) ? row.selected_image_ids.map((item: unknown) => String(item)) : [],
    imageOrder: Array.isArray(row.image_order) ? row.image_order.map((item: unknown) => String(item)) : [],
    script: scriptRecord
      ? {
          heroLine: typeof scriptRecord.heroLine === 'string' ? scriptRecord.heroLine : '',
          detailLine: typeof scriptRecord.detailLine === 'string' ? scriptRecord.detailLine : '',
          detailLine2: typeof scriptRecord.detailLine2 === 'string' ? scriptRecord.detailLine2 : '',
          closingLine: typeof scriptRecord.closingLine === 'string' ? scriptRecord.closingLine : '',
          endingTitle: typeof scriptRecord.endingTitle === 'string' ? scriptRecord.endingTitle : '',
          endingSubtitle: typeof scriptRecord.endingSubtitle === 'string' ? scriptRecord.endingSubtitle : '',
        }
      : {
          heroLine: '',
          detailLine: '',
          detailLine2: '',
          closingLine: '',
          endingTitle: '',
          endingSubtitle: '',
        },
    packageText: typeof row.package_text === 'string' ? row.package_text : '',
    finalVideoUrl: typeof row.final_video_url === 'string' ? row.final_video_url : null,
    renderError: typeof row.render_error === 'string' ? row.render_error : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeBasicShortsChannel(value: unknown): ShowroomBasicShortsChannel {
  return SHOWROOM_BASIC_SHORTS_CHANNELS.includes(value as ShowroomBasicShortsChannel)
    ? (value as ShowroomBasicShortsChannel)
    : 'youtube'
}

function normalizeBasicShortsPublishStatus(value: unknown): ShowroomBasicShortsPublishStatus {
  return SHOWROOM_BASIC_SHORTS_PUBLISH_STATUSES.includes(value as ShowroomBasicShortsPublishStatus)
    ? (value as ShowroomBasicShortsPublishStatus)
    : 'draft'
}

function mapShowroomBasicShortsTargetRow(row: Record<string, unknown>): ShowroomBasicShortsTargetRecord {
  return {
    id: String(row.id ?? ''),
    basicShortsDraftId: String(row.basic_shorts_draft_id ?? ''),
    channel: normalizeBasicShortsChannel(row.channel),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags.map((item) => String(item)) : [],
    firstComment: String(row.first_comment ?? ''),
    publishStatus: normalizeBasicShortsPublishStatus(row.publish_status),
    externalPostId: typeof row.external_post_id === 'string' ? row.external_post_id : null,
    externalPostUrl: typeof row.external_post_url === 'string' ? row.external_post_url : null,
    preparationPayload: asJsonRecord(row.preparation_payload),
    preparationError: typeof row.preparation_error === 'string' ? row.preparation_error : null,
    approvedAt: typeof row.approved_at === 'string' ? row.approved_at : null,
    preparedAt: typeof row.prepared_at === 'string' ? row.prepared_at : null,
    launchReadyAt: typeof row.launch_ready_at === 'string' ? row.launch_ready_at : null,
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function mapShowroomBasicShortsLogRow(row: Record<string, unknown>): ShowroomBasicShortsLogRecord {
  return {
    id: String(row.id ?? ''),
    basicShortsDraftId: String(row.basic_shorts_draft_id ?? ''),
    targetId: typeof row.target_id === 'string' ? row.target_id : null,
    stage: String(row.stage ?? ''),
    message: String(row.message ?? ''),
    payload: asJsonRecord(row.payload),
    createdAt: String(row.created_at ?? ''),
  }
}

function pickPreparationString(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function joinHashtags(hashtags: string[]) {
  return hashtags.join(' ').trim()
}

function extractHashtagsText(value: string | null | undefined) {
  const matches = value?.match(/#[^\s#]+/g) ?? []
  return matches.join(' ').trim()
}

function compactText(parts: Array<string | null | undefined>) {
  return parts.map((part) => (typeof part === 'string' ? part.trim() : '')).filter(Boolean)
}

function toHashtagToken(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `#${token}`)
}

function parseImageAssetMetaNames(metadata: unknown) {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}

  return {
    canonicalSiteName: typeof record.canonical_site_name === 'string' && record.canonical_site_name.trim()
      ? record.canonical_site_name.trim()
      : null,
    externalDisplayName: typeof record.external_display_name === 'string' && record.external_display_name.trim()
      ? record.external_display_name.trim()
      : null,
  }
}

async function resolveShowroomBasicShortsRepresentativeSiteName(selectedImageIds: string[] | undefined, fallbackDisplayName: string) {
  const normalizedIds = (selectedImageIds ?? []).map((id) => id.trim()).filter(Boolean)
  if (normalizedIds.length === 0) {
    return broadenPublicDisplayName(fallbackDisplayName) ?? fallbackDisplayName
  }

  const { data, error } = await supabase
    .from('image_assets')
    .select('id, site_name, created_at, metadata')
    .in('id', normalizedIds)

  if (error) {
    throw new Error(error.message)
  }

  const rows = [...(data ?? [])].sort((a, b) => {
    const aTime = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : 0
    const bTime = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })

  for (const row of rows) {
    const meta = parseImageAssetMetaNames(row.metadata)
    const publicName =
      broadenPublicDisplayName(meta.externalDisplayName)
      ?? broadenPublicDisplayName(meta.canonicalSiteName)
      ?? broadenPublicDisplayName(typeof row.site_name === 'string' ? row.site_name : null)
    if (publicName) return publicName
  }

  return broadenPublicDisplayName(fallbackDisplayName) ?? fallbackDisplayName
}

export function buildShowroomBasicShortsCaptionFromScript(seed: ShowroomBasicShortsPackageSeed['script']) {
  return compactText([
    seed.heroLine,
    seed.detailLine,
    seed.detailLine2,
    seed.closingLine,
  ]).join('\n')
}

export function buildShowroomBasicShortsDescriptionCaption(seed: ShowroomBasicShortsPackageSeed) {
  const cleanDisplayName = seed.displayName.trim()
  const cleanIndustry = seed.industry?.trim() || ''
  const cleanProductSummary = seed.productSummary?.trim() || ''
  const cleanColorSummary = seed.colorSummary?.trim() || ''

  const line1 = compactText([
    cleanDisplayName ? `${cleanDisplayName} 사례입니다.` : '교육 공간 사례입니다.',
    cleanIndustry ? `${cleanIndustry} 공간에 맞춘 배치와 구성으로 집중감과 완성도를 높였습니다.` : '공간에 맞춘 배치와 구성으로 집중감과 완성도를 높였습니다.',
  ]).join(' ')

  const line2 = compactText([
    cleanProductSummary ? `적용 제품은 ${cleanProductSummary}입니다.` : '',
    cleanColorSummary ? `${cleanColorSummary} 톤으로 공간 분위기를 정리했습니다.` : '',
  ]).join(' ')

  const line3 = '이런 구성을 우리 공간에도 적용하고 싶다면 파인드가구 온라인 쇼룸에서 더 자세히 확인해보세요.'

  return compactText([line1, line2, line3]).join('\n')
}

export function buildShowroomBasicShortsAutoPublishFields(seed: ShowroomBasicShortsPackageSeed) {
  const cleanDisplayName = seed.displayName.trim()
  const cleanIndustry = seed.industry?.trim() || ''
  const cleanProductSummary = seed.productSummary?.trim() || ''
  const title = cleanDisplayName || '대표 공간 사례'
  const description = buildShowroomBasicShortsDescriptionCaption(seed)

  const hashtagSet = new Set<string>([
    '#파인드가구',
    '#교육공간',
    '#공간구성',
  ])
  compactText([cleanIndustry, cleanProductSummary, cleanDisplayName]).forEach((value) => {
    toHashtagToken(value).slice(0, 3).forEach((token) => hashtagSet.add(token))
  })

  const hashtags = Array.from(hashtagSet)

  return {
    title,
    description,
    hashtags,
    firstComment: '',
  }
}

export function buildShowroomBasicShortsPublishPackage(target: ShowroomBasicShortsTargetRecord) {
  const preparation = target.preparationPayload
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
    ?? target.firstComment

  return {
    title: preparedTitle,
    description: preparedDescription,
    hashtagsText,
    firstComment: preparedFirstComment,
    descriptionWithHashtags: preparedBody,
    caption: preparedCaption,
  }
}

export async function saveShowroomBasicShortsDraft(payload: ShowroomBasicShortsDraftPayload) {
  const nowIso = new Date().toISOString()
  const { data: authData } = await supabase.auth.getUser()
  const createdBy = authData.user?.id ?? null

  const { data, error } = await supabase
    .from('showroom_basic_shorts_drafts')
    .insert({
      status: 'draft',
      display_name: payload.displayName,
      industry: payload.industry,
      product_summary: payload.productSummary,
      color_summary: payload.colorSummary,
      duration_seconds: payload.durationSeconds,
      selected_image_ids: payload.selectedImageIds,
      image_order: payload.imageOrder,
      script: payload.script,
      package_text: payload.packageText,
      created_by: createdBy,
      updated_at: nowIso,
    })
    .select('id, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '기본 쇼츠 초안 저장에 실패했습니다.')
  }

  return {
    id: String(data.id),
    updatedAt: String(data.updated_at ?? nowIso),
  }
}

export async function requestShowroomBasicShortsDraftProduction(payload: ShowroomBasicShortsDraftPayload) {
  const nowIso = new Date().toISOString()
  const { data: authData } = await supabase.auth.getUser()
  const createdBy = authData.user?.id ?? null

  const { data, error } = await supabase
    .from('showroom_basic_shorts_drafts')
    .insert({
      status: 'requested',
      display_name: payload.displayName,
      industry: payload.industry,
      product_summary: payload.productSummary,
      color_summary: payload.colorSummary,
      duration_seconds: payload.durationSeconds,
      selected_image_ids: payload.selectedImageIds,
      image_order: payload.imageOrder,
      script: payload.script,
      package_text: payload.packageText,
      final_video_url: null,
      render_error: null,
      created_by: createdBy,
      updated_at: nowIso,
    })
    .select('id, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '기본 쇼츠 제작 요청 저장에 실패했습니다.')
  }

  return {
    id: String(data.id),
    updatedAt: String(data.updated_at ?? nowIso),
  }
}

export type ShowroomBasicShortsRenderJobStatus = {
  ok: boolean
  draftId: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'idle'
  finalVideoUrl?: string | null
  error?: string | null
  message?: string
}

export async function listShowroomBasicShortsDrafts(displayName: string) {
  const normalized = displayName.trim()
  if (!normalized) return []

  const { data, error } = await supabase
    .from('showroom_basic_shorts_drafts')
    .select('*')
    .eq('display_name', normalized)
    .order('updated_at', { ascending: false })
    .limit(5)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapShowroomBasicShortsDraftRow(row))
}

export async function listRequestedShowroomBasicShortsDrafts() {
  const { data, error } = await supabase
    .from('showroom_basic_shorts_drafts')
    .select('*')
    .in('status', ['requested', 'render_queued', 'render_processing', 'render_completed', 'render_failed'])
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapShowroomBasicShortsDraftRow(row))
}

export async function listShowroomBasicShortsTargets(draftId: string) {
  const normalized = draftId.trim()
  if (!normalized) return []

  const { data, error } = await supabase
    .from('showroom_basic_shorts_targets')
    .select('*')
    .eq('basic_shorts_draft_id', normalized)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapShowroomBasicShortsTargetRow(row as Record<string, unknown>))
}

export async function listShowroomBasicShortsLogs(draftId: string) {
  const normalized = draftId.trim()
  if (!normalized) return []

  const { data, error } = await supabase
    .from('showroom_basic_shorts_logs')
    .select('*')
    .eq('basic_shorts_draft_id', normalized)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapShowroomBasicShortsLogRow(row as Record<string, unknown>))
}

export async function ensureShowroomBasicShortsTargets(
  draft: Pick<ShowroomBasicShortsDraftRecord, 'id' | 'displayName' | 'selectedImageIds' | 'industry' | 'productSummary' | 'colorSummary' | 'script'>
) {
  const representativeSiteName = await resolveShowroomBasicShortsRepresentativeSiteName(draft.selectedImageIds, draft.displayName)
  const autoPackage = buildShowroomBasicShortsAutoPublishFields({
    displayName: representativeSiteName,
    selectedImageIds: draft.selectedImageIds,
    industry: draft.industry,
    productSummary: draft.productSummary,
    colorSummary: draft.colorSummary,
    script: draft.script,
  })
  const rows = SHOWROOM_BASIC_SHORTS_CHANNELS.map((channel) => ({
    basic_shorts_draft_id: draft.id,
    channel,
    title: autoPackage.title,
    description: autoPackage.description,
    hashtags: autoPackage.hashtags,
    first_comment: '',
    publish_status: 'ready',
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('showroom_basic_shorts_targets')
    .upsert(rows, { onConflict: 'basic_shorts_draft_id,channel' })
    .select('*')

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapShowroomBasicShortsTargetRow(row as Record<string, unknown>))
}

export async function requestShowroomBasicShortsPublishPrepare(targetId: string) {
  const { data, error } = await supabase.functions.invoke<ShowroomBasicShortsPublishDispatchResult>(
    'showroom-shorts-publish-dispatch',
    {
      body: { targetId, action: 'prepare', sourceType: 'basic_shorts' },
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

export async function requestShowroomBasicShortsPublishLaunch(targetId: string) {
  const { data, error } = await supabase.functions.invoke<ShowroomBasicShortsPublishDispatchResult>(
    'showroom-shorts-publish-dispatch',
    {
      body: { targetId, action: 'launch', sourceType: 'basic_shorts' },
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

export async function updateShowroomBasicShortsTargetPreparation(
  targetId: string,
  payload: {
    title: string
    caption: string
  }
) {
  const nowIso = new Date().toISOString()
  const { data: currentTarget, error: fetchError } = await supabase
    .from('showroom_basic_shorts_targets')
    .select('preparation_payload, hashtags')
    .eq('id', targetId)
    .single()

  if (fetchError || !currentTarget) {
    throw new Error(fetchError?.message ?? '타깃 정보를 불러오지 못했습니다.')
  }

  const existingPayload = asJsonRecord(currentTarget.preparation_payload) ?? {}
  const hashtagsText = Array.isArray(currentTarget.hashtags)
    ? currentTarget.hashtags.map((item: unknown) => String(item)).join(' ').trim()
    : ''
  const descriptionWithHashtags = [payload.caption.trim(), hashtagsText].filter(Boolean).join('\n\n')
  const nextPayload = {
    ...existingPayload,
    title: payload.title,
    preparedTitle: payload.title,
    descriptionWithHashtags,
    description: payload.caption.trim(),
    caption: payload.caption.trim(),
    hashtagsText,
    firstComment: '',
  }

  const { data, error } = await supabase
    .from('showroom_basic_shorts_targets')
    .update({
      preparation_payload: nextPayload,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '준비 내용 수정에 실패했습니다.')
  }

  return mapShowroomBasicShortsTargetRow(data as Record<string, unknown>)
}

export async function markShowroomBasicShortsTargetPublished(
  targetId: string,
  payload?: { externalPostId?: string | null; externalPostUrl?: string | null }
) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('showroom_basic_shorts_targets')
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

  if (error || !data) {
    throw new Error(error?.message ?? '게시 완료 처리에 실패했습니다.')
  }

  return mapShowroomBasicShortsTargetRow(data as Record<string, unknown>)
}

export async function markShowroomBasicShortsTargetFailed(targetId: string) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('showroom_basic_shorts_targets')
    .update({
      publish_status: 'failed',
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '업로드 실패 상태 저장에 실패했습니다.')
  }

  return mapShowroomBasicShortsTargetRow(data as Record<string, unknown>)
}

export async function resetShowroomBasicShortsTargetLaunchState(targetId: string) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('showroom_basic_shorts_targets')
    .update({
      publish_status: 'launch_ready',
      approved_at: null,
      published_at: null,
      external_post_id: null,
      external_post_url: null,
      preparation_error: null,
      updated_at: nowIso,
    })
    .eq('id', targetId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '게시 상태 복구에 실패했습니다.')
  }

  return mapShowroomBasicShortsTargetRow(data as Record<string, unknown>)
}

export async function getShowroomBasicShortsDraftById(id: string) {
  const normalized = id.trim()
  if (!normalized) {
    throw new Error('기본 쇼츠 초안 ID가 없습니다.')
  }

  const { data, error } = await supabase
    .from('showroom_basic_shorts_drafts')
    .select('*')
    .eq('id', normalized)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '기본 쇼츠 초안을 찾지 못했습니다.')
  }

  return mapShowroomBasicShortsDraftRow(data)
}

export async function deleteShowroomBasicShortsDraft(id: string) {
  const normalized = id.trim()
  if (!normalized) {
    throw new Error('삭제할 기본 쇼츠 초안 ID가 없습니다.')
  }

  const { data: current, error: fetchError } = await supabase
    .from('showroom_basic_shorts_drafts')
    .select('id, status')
    .eq('id', normalized)
    .single()

  if (fetchError || !current) {
    throw new Error(fetchError?.message ?? '삭제할 기본 쇼츠 요청을 찾지 못했습니다.')
  }

  if (String(current.status ?? '') !== 'requested') {
    throw new Error('현재는 requested 상태의 기본 쇼츠 요청만 삭제할 수 있습니다.')
  }

  const { error } = await supabase
    .from('showroom_basic_shorts_drafts')
    .delete()
    .eq('id', normalized)

  if (error) {
    throw new Error(error.message)
  }
}

function getShowroomShortsWorkerUrl() {
  const configuredUrl = (import.meta.env.VITE_SHOWROOM_SHORTS_WORKER_URL ?? '').toString().trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/showroom-shorts-worker`
  }

  throw new Error('쇼룸 숏츠 워커 URL을 확인할 수 없습니다.')
}

async function callShowroomBasicShortsWorker<T>(pathname: string, init?: RequestInit): Promise<T> {
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
    throw new Error(data?.message ?? '기본 쇼츠 워커 요청에 실패했습니다.')
  }

  return data
}

export async function requestShowroomBasicShortsRender(draftId: string) {
  return callShowroomBasicShortsWorker<ShowroomBasicShortsRenderJobStatus>('/basic', {
    method: 'POST',
    body: JSON.stringify({ draftId }),
  })
}

export async function getShowroomBasicShortsRenderStatus(draftId: string) {
  return callShowroomBasicShortsWorker<ShowroomBasicShortsRenderJobStatus>(`/basic?draftId=${encodeURIComponent(draftId)}`, {
    method: 'GET',
  })
}
