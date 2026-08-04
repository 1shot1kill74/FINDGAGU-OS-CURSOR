import { assertInternalAdmin } from './_lib/internalAdminAuth'
import { createServiceSupabase, loadOauthRow } from './_lib/youtubeAnalyticsAuth'

type RequestLike = {
  method?: string
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

function q(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, message: 'GET only' })
    return
  }

  try {
    const auth = await assertInternalAdmin(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const limit = Math.min(Math.max(Number(q(req.query.limit)) || 30, 1), 100)
    const oauth = await loadOauthRow()
    const supabase = createServiceSupabase()
    const { data, error } = await supabase
      .from('youtube_shorts_analytics')
      .select('*')
      .order('synced_at', { ascending: false })
      .order('views', { ascending: false })
      .limit(limit)

    if (error) throw new Error(error.message)

    const rows = (data ?? []).map((row) => {
      const views = Number(row.views ?? 0)
      const engaged = Number(row.engaged_views ?? 0)
      return {
        ...row,
        engaged_pct: views > 0 ? Math.round((1000 * engaged) / views) / 10 : null,
      }
    })

    res.status(200).json({
      ok: true,
      connected: oauth?.status === 'connected',
      status: oauth?.status ?? null,
      channelId: oauth?.channel_id ?? null,
      channelTitle: oauth?.channel_title ?? null,
      lastSyncAt: oauth?.last_sync_at ?? null,
      lastSyncError: oauth?.last_sync_error ?? null,
      note: '시청함 vs 넘김은 Studio 전용. engaged_pct(engagedViews/views)를 대리지표로 사용.',
      rows,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'report 조회 실패',
    })
  }
}
