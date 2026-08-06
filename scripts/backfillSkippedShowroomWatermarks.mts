/**
 * skipped → ready 워터마크 URL 백필 (Cloudinary transform URL 생성 + DB 갱신)
 *
 * Usage:
 *   npx tsx scripts/backfillSkippedShowroomWatermarks.mts
 *   npx tsx scripts/backfillSkippedShowroomWatermarks.mts --consultation-only
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  buildOpenShowroomDisplayName,
  buildOpenShowroomWatermarkedUrls,
  OPEN_SHOWROOM_WATERMARK_VERSION,
} from '../src/lib/openShowroomWatermark'

function loadDotEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      let v = m[2]
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  } catch {
    /* optional */
  }
}

function getServiceRoleKey(): string {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (fromEnv) return fromEnv

  const raw = execSync(
    'supabase projects api-keys --project-ref sxxnshvidfwuemgbyuqz',
    { encoding: 'utf8' },
  )
  const match = raw.match(/service_role\s*\|\s*(eyJ[A-Za-z0-9._-]+)/)
  if (!match?.[1]) throw new Error('service_role key not found')
  return match[1]
}

function parseMeta(metadata: unknown): {
  externalDisplayName?: string | null
  broadExternalDisplayName?: string | null
} {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const m = metadata as Record<string, unknown>
  return {
    externalDisplayName:
      typeof m.external_display_name === 'string' ? m.external_display_name : null,
    broadExternalDisplayName:
      typeof m.broad_external_display_name === 'string'
        ? m.broad_external_display_name
        : null,
  }
}

loadDotEnv()

const consultationOnly = process.argv.includes('--consultation-only')
const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim()
if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL missing')

const supabase = createClient(supabaseUrl, getServiceRoleKey(), {
  auth: { persistSession: false },
})

const PAGE = 500
type Row = {
  id: string
  cloudinary_url: string | null
  thumbnail_url: string | null
  site_name: string | null
  business_type: string | null
  location: string | null
  created_at: string | null
  metadata: unknown
  is_consultation: boolean | null
}

async function fetchSkipped(): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('image_assets')
      .select(
        'id, cloudinary_url, thumbnail_url, site_name, business_type, location, created_at, metadata, is_consultation',
      )
      .eq('public_watermark_status', 'skipped')
      .not('cloudinary_url', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)

    if (consultationOnly) q = q.eq('is_consultation', true)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
  }
  return rows
}

async function main() {
  const rows = await fetchSkipped()
  console.log(
    `skipped targets: ${rows.length}` +
      (consultationOnly ? ' (consultation only)' : ' (all)'),
  )

  let updated = 0
  let failed = 0
  const failedIds: string[] = []

  for (const row of rows) {
    const meta = parseMeta(row.metadata)
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
          public_watermark_version: OPEN_SHOWROOM_WATERMARK_VERSION,
          public_watermark_updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) throw new Error(`${row.id}: ${error.message}`)
      failed += 1
      failedIds.push(row.id)
      continue
    }

    const { error } = await supabase
      .from('image_assets')
      .update({
        public_watermarked_url: watermark.fullUrl,
        public_watermarked_thumbnail_url: watermark.thumbnailUrl,
        public_watermark_status: 'ready',
        public_watermark_version: OPEN_SHOWROOM_WATERMARK_VERSION,
        public_watermark_updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (error) throw new Error(`${row.id}: ${error.message}`)
    updated += 1
    if (updated % 50 === 0) console.log(`… updated ${updated}/${rows.length}`)
  }

  console.log(
    JSON.stringify(
      {
        updated,
        failed,
        failedIds: failedIds.slice(0, 20),
        version: OPEN_SHOWROOM_WATERMARK_VERSION,
      },
      null,
      2,
    ),
  )
}

await main()
