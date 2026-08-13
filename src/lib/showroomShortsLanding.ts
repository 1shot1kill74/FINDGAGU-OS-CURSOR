import { supabase } from '@/lib/supabase'
import { stripLeadingSiteNumericCode } from '@/lib/showroomShorts'
import { normalizeShowroomShortsSiteName } from '@/lib/showroomShortsVariants'

/** 랜딩 표시명은 공개 화면이라 내부 상태·상담 메모를 걷어낸 뒤 앞 숫자 코드까지 뗀다. */
function toLandingDisplayName(value: string | null | undefined): string | null {
  return stripLeadingSiteNumericCode(normalizeShowroomShortsSiteName(value))
}

export type PublicShowroomShortsGalleryItem = {
  id: string
  url: string
  role: 'before' | 'after' | 'photo' | string
}

export type PublicShowroomShortsLanding = {
  jobId: string
  shortName: string
  displayName: string
  beforeAssetUrl: string
  afterAssetUrl: string
  finalVideoUrl: string | null
  gallery: PublicShowroomShortsGalleryItem[]
}

/** 광고 대기실 group key → 짧은 이름. 예: before-after:ad:2026-07-23:2607 압구정 관리형 */
export function parseAdInboxShortNameFromGroupKey(groupKey: string | null | undefined): string | null {
  const key = (groupKey ?? '').trim()
  if (!key) return null
  // before-after:ad_site:{uuid} 는 RPC/테이블에서 ad_inbox_sites.short_name으로 해석. 키 자체는 노출하지 않음.
  if (/ad_site:[0-9a-f-]{36}/i.test(key)) return null
  const match = key.match(/^before-after:ad:\d{4}-\d{2}-\d{2}:(.+)$/)
  const name = match?.[1]?.trim()
  return name || null
}

/** before-after:ad_site:{uuid} → site id. 레거시 키는 null */
export function parseAdInboxSiteIdFromGroupKey(groupKey: string | null | undefined): string | null {
  const key = (groupKey ?? '').trim()
  if (!key) return null
  const match = key.match(/ad_site:([0-9a-f-]{36})/i)
  return match?.[1]?.toLowerCase() ?? null
}

function looksLikeTechnicalGroupKey(value: string | null | undefined): boolean {
  const text = (value ?? '').trim()
  return /^before-after:/i.test(text) || /ad_site:[0-9a-f-]{36}/i.test(text)
}

function parseGallery(value: unknown): PublicShowroomShortsGalleryItem[] {
  if (!Array.isArray(value)) return []
  const items: PublicShowroomShortsGalleryItem[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const url = String(row.url ?? '').trim()
    if (!url) continue
    items.push({
      id: String(row.id ?? url),
      url,
      role: String(row.role ?? 'photo'),
    })
  }
  return items
}

function fallbackGallery(beforeUrl: string, afterUrl: string): PublicShowroomShortsGalleryItem[] {
  return [
    { id: 'before', url: beforeUrl, role: 'before' },
    { id: 'after', url: afterUrl, role: 'after' },
  ]
}

/** 영상 Before 1장 + After 전부. 그 외 Before는 제외 */
export function arrangeShortsLandingGallery(
  gallery: PublicShowroomShortsGalleryItem[],
  videoBeforeUrl: string,
  videoAfterUrl: string,
): PublicShowroomShortsGalleryItem[] {
  const before =
    gallery.find((item) => item.role === 'before' && item.url === videoBeforeUrl)
    ?? gallery.find((item) => item.role === 'before')
    ?? { id: 'before', url: videoBeforeUrl, role: 'before' as const }

  const afters = gallery.filter((item) => item.role === 'after')
  const orderedAfters = [
    ...afters.filter((item) => item.url === videoAfterUrl),
    ...afters.filter((item) => item.url !== videoAfterUrl),
  ]

  const uniqueAfters: PublicShowroomShortsGalleryItem[] = []
  const seen = new Set<string>()
  for (const item of orderedAfters) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    uniqueAfters.push(item)
  }

  if (uniqueAfters.length === 0 && videoAfterUrl) {
    uniqueAfters.push({ id: 'after', url: videoAfterUrl, role: 'after' })
  }

  return [before, ...uniqueAfters]
}

export async function fetchPublicShowroomShortsLanding(
  jobId: string,
): Promise<PublicShowroomShortsLanding | null> {
  const id = jobId.trim()
  if (!id) return null

  const { data, error } = await supabase.rpc('get_public_showroom_shorts_landing', {
    p_job_id: id,
  })

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    if (row && typeof row === 'object') {
      const mapped = mapLandingRow(row as Record<string, unknown>)
      if (mapped) return mapped
    }
  }

  // Local admin fallback when RPC is unavailable
  const { data: job, error: jobError } = await supabase
    .from('showroom_shorts_jobs')
    .select('id, before_after_group_key, before_asset_url, after_asset_url, final_video_url, before_asset_id, after_asset_id')
    .eq('id', id)
    .maybeSingle()

  if (jobError || !job) return null

  let shortName = parseAdInboxShortNameFromGroupKey(job.before_after_group_key) ?? '시공 사례'
  const beforeUrl = String(job.before_asset_url ?? '')
  const afterUrl = String(job.after_asset_url ?? '')
  let gallery = fallbackGallery(beforeUrl, afterUrl)

  const assetIds = [job.after_asset_id, job.before_asset_id].filter(Boolean)
  if (assetIds.length > 0) {
    const { data: seedRows } = await supabase
      .from('image_assets')
      .select('id, site_name, metadata')
      .in('id', assetIds)

    const seed = (seedRows ?? [])[0] as Record<string, unknown> | undefined
    const meta = seed?.metadata && typeof seed.metadata === 'object' && !Array.isArray(seed.metadata)
      ? (seed.metadata as Record<string, unknown>)
      : null
    const siteId = typeof meta?.ad_inbox_site_id === 'string' ? meta.ad_inbox_site_id : null
    const siteName = seed?.site_name != null ? String(seed.site_name).trim() : null
    if (siteName && (shortName === '시공 사례' || looksLikeTechnicalGroupKey(shortName))) {
      shortName = siteName
    }

    if (siteId || siteName) {
      let query = supabase
        .from('image_assets')
        .select('id, cloudinary_url, thumbnail_url, metadata, created_at')
        .eq('category', 'ad_inbox')
        .limit(40)

      if (siteName) query = query.eq('site_name', siteName)

      const { data: galleryRows } = await query
      const parsed = (galleryRows ?? [])
        .map((row) => {
          const rowMeta =
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : null
          if (siteId && rowMeta?.ad_inbox_site_id !== siteId && siteName && row) {
            // keep site_name filter results
          }
          const url = String(row.cloudinary_url || row.thumbnail_url || '').trim()
          if (!url) return null
          if (siteId && rowMeta?.ad_inbox_site_id && rowMeta.ad_inbox_site_id !== siteId) return null
          return {
            id: String(row.id),
            url,
            role: String(rowMeta?.before_after_role ?? 'photo'),
          } satisfies PublicShowroomShortsGalleryItem
        })
        .filter((item): item is PublicShowroomShortsGalleryItem => Boolean(item))

      if (parsed.length > 0) gallery = parsed
    }
  }

  return mapLandingRow({
    job_id: job.id,
    short_name: shortName,
    display_name: toLandingDisplayName(shortName) || '시공 사례',
    before_asset_url: beforeUrl,
    after_asset_url: afterUrl,
    final_video_url: job.final_video_url,
    gallery,
  })
}

function mapLandingRow(row: Record<string, unknown>): PublicShowroomShortsLanding | null {
  const jobId = String(row.job_id ?? '').trim()
  const beforeAssetUrl = String(row.before_asset_url ?? '').trim()
  const afterAssetUrl = String(row.after_asset_url ?? '').trim()
  if (!jobId || !beforeAssetUrl || !afterAssetUrl) return null

  const rawShort = String(row.short_name ?? '').trim()
  const rawDisplay = String(row.display_name ?? '').trim()
  const shortName =
    (!looksLikeTechnicalGroupKey(rawShort) && rawShort) || '시공 사례'
  const displayName =
    (!looksLikeTechnicalGroupKey(rawDisplay) && toLandingDisplayName(rawDisplay))
    || toLandingDisplayName(shortName)
    || shortName

  const gallery = parseGallery(row.gallery)
  const arranged = arrangeShortsLandingGallery(
    gallery.length > 0 ? gallery : fallbackGallery(beforeAssetUrl, afterAssetUrl),
    beforeAssetUrl,
    afterAssetUrl,
  )
  return {
    jobId,
    shortName,
    displayName,
    beforeAssetUrl,
    afterAssetUrl,
    finalVideoUrl: typeof row.final_video_url === 'string' && row.final_video_url.trim()
      ? row.final_video_url.trim()
      : null,
    gallery: arranged,
  }
}
