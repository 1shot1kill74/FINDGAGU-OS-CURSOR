import { assertInternalAdmin } from './_lib/internalAdminAuth'
import {
  createServiceSupabase,
  extractYoutubeVideoId,
  getValidAccessToken,
  OAUTH_ROW_ID,
} from './_lib/youtubeAnalyticsAuth'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

type TargetRow = {
  title: string | null
  external_post_id: string | null
  external_post_url: string | null
  published_at: string | null
}

type MetricRow = {
  video_id: string
  title: string | null
  views: number
  engaged_views: number
  avg_view_percentage: number | null
  avg_view_duration_sec: number | null
  likes: number
  comments: number
  shares: number
  period_start: string
  period_end: string
  synced_at: string
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function numAt(row: unknown[], idx: number): number {
  const v = row[idx]
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim()) return Number(v)
  return 0
}

async function fetchVideoTitles(accessToken: string, videoIds: string[]) {
  const titles = new Map<string, string>()
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50)
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('id', chunk.join(','))
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const json = (await res.json()) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>
    }
    if (!res.ok) continue
    for (const item of json.items ?? []) {
      if (item.id && item.snippet?.title) titles.set(item.id, item.snippet.title)
    }
  }
  return titles
}

async function queryAnalyticsByVideo(input: {
  accessToken: string
  channelId: string
  videoIds: string[]
  startDate: string
  endDate: string
}) {
  const metrics =
    'views,engagedViews,averageViewPercentage,averageViewDuration,likes,comments,shares'
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', `channel==${input.channelId}`)
  url.searchParams.set('startDate', input.startDate)
  url.searchParams.set('endDate', input.endDate)
  url.searchParams.set('metrics', metrics)
  url.searchParams.set('dimensions', 'video')
  url.searchParams.set('filters', `video==${input.videoIds.join(',')}`)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  })
  const json = (await res.json()) as {
    columnHeaders?: Array<{ name?: string }>
    rows?: unknown[][]
    error?: { message?: string }
  }

  if (!res.ok) {
    // Fallback without engagedViews if API rejects the metric set
    if (String(json.error?.message ?? '').toLowerCase().includes('engaged')) {
      return queryAnalyticsByVideoLegacy(input)
    }
    throw new Error(json.error?.message || `Analytics 조회 실패 (${res.status})`)
  }

  const headers = (json.columnHeaders ?? []).map((h) => h.name ?? '')
  const idx = (name: string) => headers.indexOf(name)

  return (json.rows ?? []).map((row) => {
    const videoId = String(row[idx('video')] ?? '')
    return {
      videoId,
      views: numAt(row, idx('views')),
      engagedViews: numAt(row, idx('engagedViews')),
      avgViewPercentage: idx('averageViewPercentage') >= 0 ? numAt(row, idx('averageViewPercentage')) : null,
      avgViewDurationSec: idx('averageViewDuration') >= 0 ? numAt(row, idx('averageViewDuration')) : null,
      likes: idx('likes') >= 0 ? numAt(row, idx('likes')) : 0,
      comments: idx('comments') >= 0 ? numAt(row, idx('comments')) : 0,
      shares: idx('shares') >= 0 ? numAt(row, idx('shares')) : 0,
    }
  })
}

async function queryAnalyticsByVideoLegacy(input: {
  accessToken: string
  channelId: string
  videoIds: string[]
  startDate: string
  endDate: string
}) {
  const metrics = 'views,averageViewPercentage,averageViewDuration,likes,comments,shares'
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', `channel==${input.channelId}`)
  url.searchParams.set('startDate', input.startDate)
  url.searchParams.set('endDate', input.endDate)
  url.searchParams.set('metrics', metrics)
  url.searchParams.set('dimensions', 'video')
  url.searchParams.set('filters', `video==${input.videoIds.join(',')}`)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  })
  const json = (await res.json()) as {
    columnHeaders?: Array<{ name?: string }>
    rows?: unknown[][]
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(json.error?.message || `Analytics 조회 실패 (${res.status})`)
  }
  const headers = (json.columnHeaders ?? []).map((h) => h.name ?? '')
  const idx = (name: string) => headers.indexOf(name)
  return (json.rows ?? []).map((row) => {
    const videoId = String(row[idx('video')] ?? '')
    return {
      videoId,
      views: numAt(row, idx('views')),
      engagedViews: 0,
      avgViewPercentage: idx('averageViewPercentage') >= 0 ? numAt(row, idx('averageViewPercentage')) : null,
      avgViewDurationSec: idx('averageViewDuration') >= 0 ? numAt(row, idx('averageViewDuration')) : null,
      likes: idx('likes') >= 0 ? numAt(row, idx('likes')) : 0,
      comments: idx('comments') >= 0 ? numAt(row, idx('comments')) : 0,
      shares: idx('shares') >= 0 ? numAt(row, idx('shares')) : 0,
    }
  })
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'POST only' })
    return
  }

  const supabase = createServiceSupabase()
  try {
    const auth = await assertInternalAdmin(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as {
      days?: number
    }
    const days = Math.min(Math.max(Number(body.days) || 90, 7), 365)

    const { accessToken, channelId } = await getValidAccessToken()

    const { data: targets, error: targetsError } = await supabase
      .from('showroom_shorts_targets')
      .select('title, external_post_id, external_post_url, published_at')
      .eq('channel', 'youtube')
      .eq('publish_status', 'published')
      .order('published_at', { ascending: false })
      .limit(40)

    if (targetsError) throw new Error(targetsError.message)

    const titleById = new Map<string, string>()
    const videoIds: string[] = []
    for (const row of (targets ?? []) as TargetRow[]) {
      const id =
        extractYoutubeVideoId(row.external_post_id) || extractYoutubeVideoId(row.external_post_url)
      if (!id || videoIds.includes(id)) continue
      videoIds.push(id)
      if (row.title?.trim()) titleById.set(id, row.title.trim())
    }

    if (videoIds.length === 0) {
      res.status(200).json({
        ok: true,
        synced: 0,
        message: '발행된 유튜브 쇼츠 video_id가 없습니다.',
        rows: [],
      })
      return
    }

    const end = new Date()
    const start = new Date()
    start.setUTCDate(start.getUTCDate() - days)
    const periodStart = isoDate(start)
    const periodEnd = isoDate(end)

    const apiTitles = await fetchVideoTitles(accessToken, videoIds)
    for (const [id, title] of apiTitles) {
      if (!titleById.has(id)) titleById.set(id, title)
    }

    // Analytics filters allow limited video list; chunk by 20
    const metrics: Awaited<ReturnType<typeof queryAnalyticsByVideo>> = []
    for (let i = 0; i < videoIds.length; i += 20) {
      const chunk = videoIds.slice(i, i + 20)
      const part = await queryAnalyticsByVideo({
        accessToken,
        channelId,
        videoIds: chunk,
        startDate: periodStart,
        endDate: periodEnd,
      })
      metrics.push(...part)
    }

    const byId = new Map(metrics.map((m) => [m.videoId, m]))
    const syncedAt = new Date().toISOString()
    const upserts: MetricRow[] = videoIds.map((videoId) => {
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

    const { error: upsertError } = await supabase
      .from('youtube_shorts_analytics')
      .upsert(upserts, { onConflict: 'video_id' })
    if (upsertError) throw new Error(upsertError.message)

    await supabase
      .from('youtube_analytics_oauth')
      .update({
        last_sync_at: syncedAt,
        last_sync_error: null,
        updated_at: syncedAt,
      })
      .eq('id', OAUTH_ROW_ID)

    res.status(200).json({
      ok: true,
      synced: upserts.length,
      periodStart,
      periodEnd,
      rows: upserts.map((row) => ({
        ...row,
        engaged_pct:
          row.views > 0 ? Math.round((1000 * row.engaged_views) / row.views) / 10 : null,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync 실패'
    try {
      await supabase
        .from('youtube_analytics_oauth')
        .update({
          last_sync_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', OAUTH_ROW_ID)
    } catch {
      /* ignore */
    }
    res.status(500).json({ ok: false, message })
  }
}
