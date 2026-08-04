import { createClient } from '@supabase/supabase-js'
import { assertInternalAdmin } from '../server/internalAdminAuth'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
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

    const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    })
    const { data, error } = await supabase
      .from('youtube_analytics_oauth')
      .select('channel_id, channel_title, connected_at, status, last_sync_at, last_sync_error')
      .eq('id', 'findgagu')
      .maybeSingle()

    if (error) throw new Error(error.message)

    if (!data) {
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
      connected: data.status === 'connected',
      status: data.status,
      channelId: data.channel_id,
      channelTitle: data.channel_title,
      connectedAt: data.connected_at,
      lastSyncAt: data.last_sync_at,
      lastSyncError: data.last_sync_error,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'status 조회 실패',
    })
  }
}
