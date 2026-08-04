import { createClient, type User } from '@supabase/supabase-js'

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

function getBearerToken(req: RequestLike) {
  const value = req.headers.authorization ?? req.headers.Authorization
  const raw = Array.isArray(value) ? value[0] ?? '' : value ?? ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

function isInternalAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  const domain = normalized.split('@')[1] || ''
  if (domain === 'findgagu.com') return true
  const allow = [
    process.env.INTERNAL_ADMIN_ALLOWED_EMAILS,
    process.env.EDU_OUTREACH_ALLOWED_EMAILS,
    process.env.SHOWROOM_CASE_CONTENT_ALLOWED_EMAILS,
  ]
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return allow.includes(normalized)
}

async function assertInternalAdmin(req: RequestLike): Promise<
  | { ok: true; user: User; token: string }
  | { ok: false; status: 401 | 403; message: string }
> {
  const token = getBearerToken(req)
  if (!token) return { ok: false, status: 401, message: '로그인이 필요합니다.' }
  const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { ok: false, status: 401, message: '유효하지 않은 세션입니다.' }
  if (!isInternalAdminEmail(data.user.email)) {
    return { ok: false, status: 403, message: '내부 관리자 권한이 필요합니다.' }
  }
  return { ok: true, user: data.user, token }
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
