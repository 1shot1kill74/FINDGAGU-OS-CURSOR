import { assertInternalAdmin } from './_lib/internalAdminAuth'
import { loadOauthRow } from './_lib/youtubeAnalyticsAuth'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
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

    const row = await loadOauthRow()
    if (!row) {
      res.status(200).json({
        ok: true,
        connected: false,
        status: null,
        channelId: null,
        channelTitle: null,
        connectedAt: null,
        lastSyncAt: null,
        lastSyncError: null,
      })
      return
    }

    res.status(200).json({
      ok: true,
      connected: row.status === 'connected',
      status: row.status,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      connectedAt: row.connected_at,
      lastSyncAt: row.last_sync_at,
      lastSyncError: row.last_sync_error,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'status 조회 실패',
    })
  }
}
