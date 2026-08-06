/**
 * One-off: sync YouTube Shorts analytics using production OAuth + env.
 * Usage: npx tsx scripts/runYoutubeAnalyticsSyncOnce.mts
 * Loads .tmp/yt-analytics.env (from `vfg env pull`).
 */
import { readFileSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.tmp/yt-analytics.env', 'utf8').split(/\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (!m) continue
  let v = m[2]
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  process.env[m[1]] = v
}

function getEnv(name: string) {
  const v = process.env[name]?.trim() || ''
  if (!v) throw new Error(`${name} missing`)
  return v
}

function getEncKey() {
  const raw = getEnv('YOUTUBE_ANALYTICS_TOKEN_ENC_KEY')
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  const b = Buffer.from(raw, 'base64')
  if (b.length === 32) return b
  throw new Error('bad enc key')
}

function decryptSecret(payload: string) {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(ivB64!, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

function extractId(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
  try {
    const url = new URL(raw)
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace(/^\//, '').slice(0, 11)
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
    }
    const shorts = url.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/)
    if (shorts?.[1]) return shorts[1]
    const v = url.searchParams.get('v')
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
  } catch {
    /* ignore */
  }
  return null
}

const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const { data: row, error } = await supabase
  .from('youtube_analytics_oauth')
  .select('*')
  .eq('id', 'findgagu')
  .maybeSingle()
if (error || !row) throw new Error(error?.message || 'no oauth')

async function refresh(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: getEnv('GOOGLE_YT_ANALYTICS_CLIENT_ID'),
    client_secret: getEnv('GOOGLE_YT_ANALYTICS_CLIENT_SECRET'),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'refresh failed')
  }
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in || 3600) }
}

let accessToken = ''
const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0
if (row.access_token_enc && expiresAt > Date.now() + 60_000) {
  accessToken = decryptSecret(row.access_token_enc)
} else {
  const refreshed = await refresh(decryptSecret(row.refresh_token_enc))
  accessToken = refreshed.accessToken
  await supabase
    .from('youtube_analytics_oauth')
    .update({
      access_token_enc: encryptSecret(accessToken),
      access_token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      status: 'connected',
    })
    .eq('id', 'findgagu')
}

const channelId = String(row.channel_id)
const { data: targets, error: tErr } = await supabase
  .from('showroom_shorts_targets')
  .select('title, external_post_id, external_post_url, published_at')
  .eq('channel', 'youtube')
  .eq('publish_status', 'published')
  .order('published_at', { ascending: false })
  .limit(40)
if (tErr) throw new Error(tErr.message)

const titleById = new Map<string, string>()
const videoIds: string[] = []
for (const t of targets ?? []) {
  const id = extractId(t.external_post_id) || extractId(t.external_post_url)
  if (!id || videoIds.includes(id)) continue
  videoIds.push(id)
  if (t.title?.trim()) titleById.set(id, t.title.trim())
}
console.log('videoIds', videoIds.length)

const end = new Date()
const start = new Date()
start.setUTCDate(start.getUTCDate() - 90)
const periodStart = start.toISOString().slice(0, 10)
const periodEnd = end.toISOString().slice(0, 10)

async function queryChunk(ids: string[]) {
  const metrics =
    'views,engagedViews,averageViewPercentage,averageViewDuration,likes,comments,shares'
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', `channel==${channelId}`)
  url.searchParams.set('startDate', periodStart)
  url.searchParams.set('endDate', periodEnd)
  url.searchParams.set('metrics', metrics)
  url.searchParams.set('dimensions', 'video')
  url.searchParams.set('filters', `video==${ids.join(',')}`)
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = (await res.json()) as {
    columnHeaders?: Array<{ name?: string }>
    rows?: unknown[][]
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(json.error?.message || `analytics ${res.status}`)
  const headers = (json.columnHeaders ?? []).map((h) => h.name ?? '')
  const idx = (n: string) => headers.indexOf(n)
  const num = (r: unknown[], i: number) => Number(r[i] ?? 0) || 0
  return (json.rows ?? []).map((r) => ({
    videoId: String(r[idx('video')] ?? ''),
    views: num(r, idx('views')),
    engagedViews: num(r, idx('engagedViews')),
    avgViewPercentage: idx('averageViewPercentage') >= 0 ? num(r, idx('averageViewPercentage')) : null,
    avgViewDurationSec: idx('averageViewDuration') >= 0 ? num(r, idx('averageViewDuration')) : null,
    likes: idx('likes') >= 0 ? num(r, idx('likes')) : 0,
    comments: idx('comments') >= 0 ? num(r, idx('comments')) : 0,
    shares: idx('shares') >= 0 ? num(r, idx('shares')) : 0,
  }))
}

const metrics: Awaited<ReturnType<typeof queryChunk>> = []
for (let i = 0; i < videoIds.length; i += 20) {
  metrics.push(...(await queryChunk(videoIds.slice(i, i + 20))))
}
const byId = new Map(metrics.map((m) => [m.videoId, m]))
const syncedAt = new Date().toISOString()
const upserts = videoIds.map((videoId) => {
  const m = byId.get(videoId)
  return {
    video_id: videoId,
    title: titleById.get(videoId) ?? null,
    views: m?.views ?? 0,
    engaged_views: m?.engagedViews ?? 0,
    avg_view_percentage: m?.avgViewPercentage ?? null,
    avg_view_duration_sec: m?.avgViewDurationSec ?? null,
    likes: m?.likes ?? 0,
    comments: m?.comments ?? 0,
    shares: m?.shares ?? 0,
    period_start: periodStart,
    period_end: periodEnd,
    synced_at: syncedAt,
  }
})

const { error: uErr } = await supabase.from('youtube_shorts_analytics').upsert(upserts, {
  onConflict: 'video_id',
})
if (uErr) throw new Error(uErr.message)
await supabase
  .from('youtube_analytics_oauth')
  .update({ last_sync_at: syncedAt, last_sync_error: null, updated_at: syncedAt })
  .eq('id', 'findgagu')

for (const row of [...upserts].sort((a, b) => b.views - a.views)) {
  const ep = row.views > 0 ? Math.round((1000 * row.engaged_views) / row.views) / 10 : null
  console.log(`${row.views}\tengaged=${ep}%\t${(row.title || row.video_id).slice(0, 50)}`)
}
console.log('synced', upserts.length, periodStart, periodEnd)
