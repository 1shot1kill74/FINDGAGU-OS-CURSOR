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

export async function fetchYoutubeAnalyticsStatus(): Promise<YoutubeAnalyticsStatus> {
  const headers = await authHeaders()
  const res = await fetch('/api/youtube-analytics-status', { headers })
  const json = (await res.json()) as YoutubeAnalyticsStatus
  if (!res.ok || !json.ok) {
    throw new Error(json.message || `status 실패 (${res.status})`)
  }
  return json
}

export async function startYoutubeAnalyticsOAuth(): Promise<string> {
  const headers = await authHeaders()
  const res = await fetch('/api/youtube-analytics-oauth-start', {
    method: 'POST',
    headers,
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
