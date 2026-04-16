import { supabase } from '@/lib/supabase'
import {
  buildBroadExternalDisplayName,
  buildExternalDisplayName,
  normalizeConsultationName,
  parseImageAssetMeta,
  parseStoredSpaceId,
} from '@/lib/imageAssetMeta'
import { IMAGE_ASSET_PAGE_SIZE } from '@/lib/imageAssetConstants'
import {
  buildOpenShowroomDisplayName,
  buildOpenShowroomWatermarkedUrls,
  OPEN_SHOWROOM_WATERMARK_VERSION,
} from '@/lib/openShowroomWatermark'
import type { Json } from '@/types/database'

type ConsultationSpaceRow = {
  id: string
  project_name: string | null
  channel_chat_id: string | null
  request_date: string | null
  start_date: string | null
  created_at: string | null
  region: string | null
  industry: string | null
  customer_phone: string | null
  metadata?: Record<string, unknown> | null
}

type ImageAssetMigrationRow = {
  id: string
  cloudinary_url?: string | null
  thumbnail_url?: string | null
  site_name: string | null
  business_type: string | null
  location: string | null
  created_at?: string | null
  public_watermarked_url?: string | null
  public_watermarked_thumbnail_url?: string | null
  public_watermark_status?: string | null
  public_watermark_version?: number | null
  metadata?: Record<string, unknown> | null
}

export type ImageAssetSpaceBackfillResult = {
  updated: number
  matchedByConsultationId: number
  matchedBySpaceId: number
  matchedByName: number
  skippedUnmatched: number
  skippedAmbiguous: number
}

export async function backfillImageAssetSpaceMetadata(): Promise<ImageAssetSpaceBackfillResult> {
  const consultations: ConsultationSpaceRow[] = []
  for (let from = 0; ; from += IMAGE_ASSET_PAGE_SIZE) {
    const to = from + IMAGE_ASSET_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('consultations')
      .select('id, project_name, channel_chat_id, request_date, start_date, created_at, region, industry, customer_phone, metadata')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    consultations.push(...(data as unknown as ConsultationSpaceRow[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
  }

  const imageAssets: ImageAssetMigrationRow[] = []
  for (let from = 0; ; from += IMAGE_ASSET_PAGE_SIZE) {
    const to = from + IMAGE_ASSET_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('image_assets')
      .select('id, site_name, business_type, location, metadata')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    imageAssets.push(...(data as ImageAssetMigrationRow[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
  }

  const consultationsById = new Map<string, ConsultationSpaceRow>()
  const consultationsBySpaceId = new Map<string, ConsultationSpaceRow>()
  const consultationsByNormalizedName = new Map<string, ConsultationSpaceRow[]>()

  consultations.forEach((row) => {
    consultationsById.set(row.id, row)
    const metaSpaceId = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? parseStoredSpaceId((row.metadata as Record<string, unknown>).space_id)
      : null
    const spaceId = metaSpaceId || parseStoredSpaceId(row.channel_chat_id)
    if (spaceId && !consultationsBySpaceId.has(spaceId)) consultationsBySpaceId.set(spaceId, row)
    const normalizedName = normalizeConsultationName(row.project_name)
    if (!normalizedName) return
    const list = consultationsByNormalizedName.get(normalizedName) ?? []
    list.push(row)
    consultationsByNormalizedName.set(normalizedName, list)
  })

  let updated = 0
  let matchedByConsultationId = 0
  let matchedBySpaceId = 0
  let matchedByName = 0
  let skippedUnmatched = 0
  let skippedAmbiguous = 0

  for (const row of imageAssets) {
    const meta = parseImageAssetMeta(row.metadata)
    let matched: ConsultationSpaceRow | null = null
    let matchSource: 'consultation' | 'space' | 'name' | null = null

    if (meta.consultationId && consultationsById.has(meta.consultationId)) {
      matched = consultationsById.get(meta.consultationId) ?? null
      matchSource = 'consultation'
    } else if (meta.spaceId && consultationsBySpaceId.has(meta.spaceId)) {
      matched = consultationsBySpaceId.get(meta.spaceId) ?? null
      matchSource = 'space'
    } else {
      const normalizedSiteName = normalizeConsultationName(
        meta.canonicalSiteName || row.site_name || meta.spaceDisplayName || meta.legacySiteName
      )
      const nameMatches = normalizedSiteName ? (consultationsByNormalizedName.get(normalizedSiteName) ?? []) : []
      if (nameMatches.length === 1) {
        matched = nameMatches[0]
        matchSource = 'name'
      } else if (nameMatches.length > 1) {
        skippedAmbiguous += 1
        continue
      }
    }

    if (!matched) {
      skippedUnmatched += 1
      continue
    }

    const matchedMeta = matched.metadata && typeof matched.metadata === 'object' && !Array.isArray(matched.metadata)
      ? (matched.metadata as Record<string, unknown>)
      : {}
    const matchedSpaceId = parseStoredSpaceId(matchedMeta.space_id) || parseStoredSpaceId(matched.channel_chat_id)
    const canonicalSiteName = matched.project_name?.trim() || meta.canonicalSiteName || row.site_name?.trim() || meta.spaceDisplayName
    const externalDisplayName = buildExternalDisplayName({
      requestDate: matched.request_date,
      startDate: matched.start_date,
      createdAt: matched.created_at,
      region: row.location?.trim() || null,
      industry: row.business_type?.trim() || null,
      customerPhone: matched.customer_phone,
    })
    const broadExternalDisplayName = buildBroadExternalDisplayName(externalDisplayName)
    const currentSiteName = row.site_name?.trim() || null
    const nextMetadata: Record<string, unknown> = { ...meta.raw }
    let changed = false

    if (matched.id && nextMetadata.consultation_id !== matched.id) {
      nextMetadata.consultation_id = matched.id
      changed = true
    }
    if (matchedSpaceId && parseStoredSpaceId(nextMetadata.space_id) !== matchedSpaceId) {
      nextMetadata.space_id = matchedSpaceId
      changed = true
    }
    if (canonicalSiteName && nextMetadata.canonical_site_name !== canonicalSiteName) {
      nextMetadata.canonical_site_name = canonicalSiteName
      changed = true
    }
    if (currentSiteName && canonicalSiteName && currentSiteName !== canonicalSiteName && !nextMetadata.legacy_site_name) {
      nextMetadata.legacy_site_name = currentSiteName
      changed = true
    }
    if (canonicalSiteName && nextMetadata.space_display_name !== canonicalSiteName) {
      nextMetadata.space_display_name = canonicalSiteName
      changed = true
    }
    if (externalDisplayName && nextMetadata.external_display_name !== externalDisplayName) {
      nextMetadata.external_display_name = externalDisplayName
      changed = true
    }
    if (broadExternalDisplayName && nextMetadata.broad_external_display_name !== broadExternalDisplayName) {
      nextMetadata.broad_external_display_name = broadExternalDisplayName
      changed = true
    }

    const nextSiteName = canonicalSiteName || currentSiteName
    if (!changed && nextSiteName === currentSiteName) continue

    const { error } = await supabase
      .from('image_assets')
      .update({
        site_name: nextSiteName ?? null,
        metadata: nextMetadata as Json,
      })
      .eq('id', row.id)
    if (error) throw new Error(error.message)

    updated += 1
    if (matchSource === 'consultation') matchedByConsultationId += 1
    else if (matchSource === 'space') matchedBySpaceId += 1
    else if (matchSource === 'name') matchedByName += 1
  }

  return {
    updated,
    matchedByConsultationId,
    matchedBySpaceId,
    matchedByName,
    skippedUnmatched,
    skippedAmbiguous,
  }
}

export async function backfillImageAssetBroadExternalDisplayNames(): Promise<{ updated: number }> {
  const imageAssets: ImageAssetMigrationRow[] = []
  for (let from = 0; ; from += IMAGE_ASSET_PAGE_SIZE) {
    const to = from + IMAGE_ASSET_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('image_assets')
      .select('id, site_name, business_type, location, metadata')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    imageAssets.push(...(data as ImageAssetMigrationRow[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
  }

  let updated = 0

  for (const row of imageAssets) {
    const meta = parseImageAssetMeta(row.metadata)
    const currentExternal = meta.externalDisplayName?.trim() ?? ''
    const currentBroad = meta.broadExternalDisplayName?.trim() ?? ''
    const nextBroad = buildBroadExternalDisplayName(currentExternal)
      || buildBroadExternalDisplayName(row.site_name?.trim() ?? null)
      || currentBroad

    if (!nextBroad || nextBroad === currentBroad) continue

    const nextMetadata: Record<string, unknown> = {
      ...meta.raw,
      broad_external_display_name: nextBroad,
    }

    const { error } = await supabase
      .from('image_assets')
      .update({ metadata: nextMetadata as Json })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
    updated += 1
  }

  return { updated }
}

export async function backfillImageAssetPublicWatermarks(): Promise<{
  updated: number
  skippedReady: number
  skippedNoSource: number
  failed: number
}> {
  const imageAssets: ImageAssetMigrationRow[] = []
  for (let from = 0; ; from += IMAGE_ASSET_PAGE_SIZE) {
    const to = from + IMAGE_ASSET_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('image_assets')
      .select('id, cloudinary_url, thumbnail_url, site_name, business_type, location, created_at, public_watermarked_url, public_watermarked_thumbnail_url, public_watermark_status, public_watermark_version, metadata')
      .eq('is_consultation', true)
      .not('category', 'in', '("purchase_order","floor_plan")')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    imageAssets.push(...(data as ImageAssetMigrationRow[]))
    if (data.length < IMAGE_ASSET_PAGE_SIZE) break
  }

  let updated = 0
  let skippedReady = 0
  let skippedNoSource = 0
  let failed = 0

  for (const row of imageAssets) {
    const sourceUrl = row.cloudinary_url?.trim() ?? ''
    if (!sourceUrl) {
      skippedNoSource += 1
      continue
    }

    const isReady =
      row.public_watermark_status === 'ready' &&
      (row.public_watermark_version ?? 0) >= OPEN_SHOWROOM_WATERMARK_VERSION &&
      Boolean(row.public_watermarked_url?.trim()) &&
      Boolean(row.public_watermarked_thumbnail_url?.trim())

    if (isReady) {
      skippedReady += 1
      continue
    }

    const meta = parseImageAssetMeta(row.metadata)
    const displayName = buildOpenShowroomDisplayName({
      siteName: row.site_name,
      externalDisplayName: meta.externalDisplayName,
      broadExternalDisplayName: meta.broadExternalDisplayName,
      location: row.location,
      businessType: row.business_type,
      createdAt: row.created_at,
    })
    const watermark = buildOpenShowroomWatermarkedUrls({
      sourceUrl: row.cloudinary_url,
      thumbnailUrl: row.thumbnail_url,
      displayName,
    })

    if (!watermark.fullUrl || !watermark.thumbnailUrl) {
      const { error } = await supabase
        .from('image_assets')
        .update({
          public_watermark_status: 'failed',
          public_watermark_version: watermark.version,
          public_watermark_updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) throw new Error(error.message)
      failed += 1
      continue
    }

    const { error } = await supabase
      .from('image_assets')
      .update({
        public_watermarked_url: watermark.fullUrl,
        public_watermarked_thumbnail_url: watermark.thumbnailUrl,
        public_watermark_status: 'ready',
        public_watermark_version: watermark.version,
        public_watermark_updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (error) throw new Error(error.message)
    updated += 1
  }

  return {
    updated,
    skippedReady,
    skippedNoSource,
    failed,
  }
}
