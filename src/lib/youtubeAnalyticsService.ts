import { supabase } from '@/lib/supabase'

export type YoutubeAnalyticsStatus = {
  ok: boolean
  connected: boolean
  status: 'connected' | 'needs_reconnect' | null
  channelId: string | null
  channelTitle: string | null
  connectedAt: string | null
  lastSyncAt: string | null
  lastSyncError: string | null
  message?: string
}

export type YoutubeShortsAnalyticsRow = {
  video_id: string
  title: string | null
  views: number
  engaged_views: number
  engaged_pct: number | null
  avg_view_percentage: number | null
  avg_view_duration_sec: number | null
  likes: number
  comments: number
  shares: number
  period_start: string
  period_end: string
  synced_at: string
}

export type YoutubeAnalyticsReport = {
  ok: boolean
  connected: boolean
  status: string | null
  channelId: string | null
  channelTitle: string | null
  lastSyncAt: string | null
  lastSyncError: string | null
  note?: string
  rows: YoutubeShortsAnalyticsRow[]
  message?: string
}

export type YoutubeAnalyticsReturnTo = '/admin/ad-inbox' | '/admin/showroom-shorts'

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error('로그인이 필요합니다.')
  }
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export function extractYoutubeVideoId(value: string | null | undefined): string | null {
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

/** 1.2k / 12.3만 형태 */
export function formatCompactCount(value: number): string {
  const n = Number(value) || 0
  if (n >= 100_000) return `${Math.round(n / 10_000)}만`
  if (n >= 10_000) return `${(Math.round(n / 1000) / 10).toFixed(1).replace(/\.0$/, '')}만`
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export function formatYoutubeMetricsChip(row: Pick<YoutubeShortsAnalyticsRow, 'views' | 'engaged_pct' | 'avg_view_percentage'>): {
  label: string
  title: string
} {
  const views = formatCompactCount(row.views)
  const engaged = row.engaged_pct == null ? '—' : `${row.engaged_pct}%`
  const avg =
    row.avg_view_percentage == null
      ? '—'
      : `${Math.round(Number(row.avg_view_percentage) * 10) / 10}%`
  return {
    label: `${views} · ${engaged}`,
    title: `조회 ${Number(row.views).toLocaleString()} · Engaged ${engaged} · 평균시청 ${avg}`,
  }
}

export async function fetchYoutubeAnalyticsStatus(): Promise<YoutubeAnalyticsStatus> {
  const headers = await authHeaders()
  const res = await fetch('/api/youtube-analytics-status', { headers })
  const json = (await res.json()) as YoutubeAnalyticsStatus
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `status 실패 (${res.status})`)
  }
  return json
}

export async function startYoutubeAnalyticsOAuth(options?: {
  returnTo?: YoutubeAnalyticsReturnTo
}): Promise<string> {
  const headers = await authHeaders()
  const res = await fetch('/api/youtube-analytics-oauth-start', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      returnTo: options?.returnTo ?? '/admin/ad-inbox',
    }),
  })
  const json = (await res.json()) as { ok?: boolean; authorizeUrl?: string; message?: string }
  if (!res.ok || !json.ok || !json.authorizeUrl) {
    throw new Error(json.message || `OAuth 시작 실패 (${res.status})`)
  }
  return json.authorizeUrl
}

export async function syncYoutubeAnalytics(days = 90) {
  const headers = await authHeaders()
  const res = await fetch('/api/youtube-analytics-sync', {
    method: 'POST',
    headers,
    body: JSON.stringify({ days }),
  })
  const json = (await res.json()) as {
    ok?: boolean
    synced?: number
    message?: string
    rows?: YoutubeShortsAnalyticsRow[]
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `동기화 실패 (${res.status})`)
  }
  return json
}

export async function fetchYoutubeAnalyticsReport(limit = 20): Promise<YoutubeAnalyticsReport> {
  const headers = await authHeaders()
  const res = await fetch(`/api/youtube-analytics-report?limit=${limit}`, { headers })
  const json = (await res.json()) as YoutubeAnalyticsReport
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `report 실패 (${res.status})`)
  }
  return json
}

/** 카드별 조인용 — RLS(internal)로 직접 조회 */
export async function fetchYoutubeShortsAnalyticsByVideoIds(
  videoIds: string[],
): Promise<Map<string, YoutubeShortsAnalyticsRow>> {
  const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))]
  const map = new Map<string, YoutubeShortsAnalyticsRow>()
  if (unique.length === 0) return map

  const chunkSize = 80
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('youtube_shorts_analytics')
      .select(
        'video_id, title, views, engaged_views, avg_view_percentage, avg_view_duration_sec, likes, comments, shares, period_start, period_end, synced_at',
      )
      .in('video_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const views = Number(row.views ?? 0)
      const engaged = Number(row.engaged_views ?? 0)
      map.set(row.video_id, {
        video_id: row.video_id,
        title: row.title ?? null,
        views,
        engaged_views: engaged,
        engaged_pct: views > 0 ? Math.round((1000 * engaged) / views) / 10 : null,
        avg_view_percentage:
          row.avg_view_percentage == null ? null : Number(row.avg_view_percentage),
        avg_view_duration_sec:
          row.avg_view_duration_sec == null ? null : Number(row.avg_view_duration_sec),
        likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0),
        shares: Number(row.shares ?? 0),
        period_start: String(row.period_start ?? ''),
        period_end: String(row.period_end ?? ''),
        synced_at: String(row.synced_at ?? ''),
      })
    }
  }
  return map
}
