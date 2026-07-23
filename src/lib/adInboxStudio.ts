/**
 * 광고 대기실(덧붙임) — 기존 쇼룸/케이스 스튜디오와 분리.
 * 분류 전 사진 입고 → BA 페어 → 기존 클링 숏츠 job 연결.
 */
import { supabase } from '@/lib/supabase'
import { uploadEngine } from '@/lib/uploadEngine'
import { insertImageAsset } from '@/lib/imageAssetUploadService'
import { isCloudinaryConfigured } from '@/lib/imageAssetCloudinary'
import { parseBeforeAfterMeta } from '@/lib/imageAssetMeta'
import type { ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import {
  SHOWROOM_SHORTS_CHANNELS,
  createShowroomShortsJob,
  getShowroomShortsJob,
  listShowroomShortsJobsByBeforeAssetIds,
  listShowroomShortsJobsForGroupKey,
  validateBeforeAfterSelection,
  type ShowroomShortsChannel,
  type ShowroomShortsJobRecord,
} from '@/lib/showroomShorts'
import { SHOWROOM_SHORTS_TIMELAPSE_PROMPT } from '@/lib/showroomShortsTimelapsePrompt'

export type { ShowroomShortsJobRecord as AdInboxTimelapseJob }

export const AD_INBOX_SOURCE = 'ad_inbox'
export const AD_INBOX_CATEGORY = 'ad_inbox'

/** @deprecated 공통 프롬프트로 통일 — SHOWROOM_SHORTS_TIMELAPSE_PROMPT 사용 */
export const AD_INBOX_DEFAULT_PROMPT = SHOWROOM_SHORTS_TIMELAPSE_PROMPT

export type AdInboxRole = 'before' | 'after' | 'unset'

export type AdInboxAsset = ShowroomImageAsset & {
  photo_date: string | null
  ad_inbox: true
  original_name?: string | null
}

export type AdInboxBatch = {
  key: string
  label: string
  photoDate: string
  shortName: string
  assets: AdInboxAsset[]
  beforeCount: number
  afterCount: number
  unsetCount: number
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

export function buildAdInboxGroupId(photoDate: string, shortName: string): string {
  const date = photoDate.trim() || new Date().toISOString().slice(0, 10)
  const name = shortName.trim().replace(/\s+/g, ' ')
  return `ad:${date}:${name.toLowerCase()}`
}

export function buildAdInboxBatchKey(photoDate: string, shortName: string): string {
  return buildAdInboxGroupId(photoDate, shortName)
}

function rowToAdInboxAsset(row: Record<string, unknown>): AdInboxAsset | null {
  const meta = row.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const raw = meta as Record<string, unknown>
  if (raw.source !== AD_INBOX_SOURCE && raw.ad_inbox !== true) return null

  const beforeAfter = parseBeforeAfterMeta(meta)
  const siteName = row.site_name != null ? String(row.site_name) : null
  const photoDate = row.photo_date != null ? String(row.photo_date).slice(0, 10) : null

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
  }
}

export async function listAdInboxAssets(): Promise<AdInboxAsset[]> {
  const { data, error } = await supabase
    .from('image_assets')
    .select(
      'id, cloudinary_url, thumbnail_url, site_name, photo_date, location, business_type, color_name, product_name, is_main, created_at, view_count, share_count, internal_score, category, metadata',
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

export function groupAdInboxBatches(assets: AdInboxAsset[]): AdInboxBatch[] {
  const map = new Map<string, AdInboxBatch>()

  for (const asset of assets) {
    const photoDate = asset.photo_date || (asset.created_at ? asset.created_at.slice(0, 10) : '날짜미상')
    const shortName = asset.site_name?.trim() || '이름미상'
    const key =
      asset.before_after_group_id?.trim() ||
      buildAdInboxBatchKey(photoDate, shortName)
    const existing = map.get(key)
    if (existing) {
      existing.assets.push(asset)
    } else {
      map.set(key, {
        key,
        label: `${photoDate} ${shortName}`,
        photoDate,
        shortName,
        assets: [asset],
        beforeCount: 0,
        afterCount: 0,
        unsetCount: 0,
      })
    }
  }

  const batches = Array.from(map.values()).map((batch) => {
    let beforeCount = 0
    let afterCount = 0
    let unsetCount = 0
    for (const asset of batch.assets) {
      if (asset.before_after_role === 'before') beforeCount += 1
      else if (asset.before_after_role === 'after') afterCount += 1
      else unsetCount += 1
    }
    batch.assets.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })
    return { ...batch, beforeCount, afterCount, unsetCount }
  })

  batches.sort((a, b) => {
    if (a.photoDate !== b.photoDate) return a.photoDate < b.photoDate ? 1 : -1
    return a.shortName.localeCompare(b.shortName, 'ko')
  })

  return batches
}

export async function uploadAdInboxPhotos(input: {
  files: File[]
  shortName: string
  photoDate: string
  role: AdInboxRole
}): Promise<{ ok: number; fail: number; errors: string[] }> {
  const shortName = trimOrNull(input.shortName)
  if (!shortName) {
    throw new Error('짧은 이름(현장 별칭)을 입력하세요.')
  }
  const photoDate = trimOrNull(input.photoDate) || new Date().toISOString().slice(0, 10)
  if (!input.files.length) {
    throw new Error('사진을 선택하세요.')
  }
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary 설정이 없습니다. .env를 확인하세요.')
  }

  const groupId = buildAdInboxGroupId(photoDate, shortName)
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
          original_name: file.name,
          file_size: file.size,
          public_id: uploadResult.public_id ?? undefined,
          before_after_role: role ?? undefined,
          before_after_group_id: groupId,
          ad_inbox_label: `${photoDate} ${shortName}`,
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

  return { ok, fail, errors }
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

export async function listAdInboxTimelapseJobsForBatch(batch: AdInboxBatch): Promise<ShowroomShortsJobRecord[]> {
  const byGroup = await listShowroomShortsJobsForGroupKey(buildAdInboxShortsGroupKey(batch.key))
  if (byGroup.length > 0) return byGroup

  const assetIds = batch.assets.map((asset) => asset.id)
  if (assetIds.length === 0) return []

  const assetSet = new Set(assetIds)
  const byAssets = await listShowroomShortsJobsByBeforeAssetIds(assetIds)
  return byAssets.filter((job) => assetSet.has(job.before_asset_id) && assetSet.has(job.after_asset_id))
}

export async function getAdInboxTimelapseJob(jobId: string): Promise<ShowroomShortsJobRecord | null> {
  return getShowroomShortsJob(jobId)
}

export async function createAdInboxTimelapseJob(input: {
  before: AdInboxAsset
  after: AdInboxAsset
  channels?: ShowroomShortsChannel[]
  promptText?: string
}): Promise<{ jobId: string }> {
  const images: ShowroomImageAsset[] = [input.before, input.after]
  const selection = validateBeforeAfterSelection(images)
  if (!selection.ok) {
    throw new Error(selection.message)
  }

  // createShowroomShortsJob 내부에서 클링 생성 요청까지 시도함
  const created = await createShowroomShortsJob({
    promptText: (input.promptText || AD_INBOX_DEFAULT_PROMPT).trim(),
    channels: input.channels?.length ? input.channels : [...SHOWROOM_SHORTS_CHANNELS],
    images,
  })

  return { jobId: created.job.id }
}

/** 타임랩스 전 AI 보정본을 같은 배치에 Before로 추가 */
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
  const groupId =
    input.source.before_after_group_id?.trim() || buildAdInboxGroupId(photoDate, shortName)

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
      before_after_role: 'before',
      before_after_group_id: groupId,
      ad_inbox_label: `${photoDate} ${shortName}`,
      edited_from: input.source.id,
      cleanup: 'people_removed',
      public_id: input.public_id ?? undefined,
      original_name: `cleanup-${input.source.original_name || input.source.id}.jpg`,
    },
  })

  if ('error' in result) {
    throw result.error
  }
  return { id: result.id }
}

export async function cleanupPeopleFromAdInboxAsset(asset: AdInboxAsset): Promise<{ id: string }> {
  const imageUrl = asset.cloudinary_url?.trim() || asset.thumbnail_url?.trim()
  if (!imageUrl) {
    throw new Error('보정할 이미지 URL이 없습니다.')
  }

  const { data: auth } = await supabase.auth.getSession()
  const token = auth.session?.access_token
  const res = await fetch('/api/ad-inbox-cleanup-people', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ imageUrl }),
  })
  const json = (await res.json()) as {
    ok?: boolean
    message?: string
    cloudinary_url?: string
    thumbnail_url?: string | null
    public_id?: string | null
  }
  if (!res.ok || !json.ok || !json.cloudinary_url) {
    throw new Error(json.message || '사람 제거 보정에 실패했습니다.')
  }

  return insertAdInboxCleanupAsset({
    source: asset,
    cloudinary_url: json.cloudinary_url,
    thumbnail_url: json.thumbnail_url ?? null,
    public_id: json.public_id ?? null,
  })
}
