import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
}

function readHeader(req: RequestLike, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getBearerToken(req: RequestLike) {
  const authorization = readHeader(req, 'authorization')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

function parseEmailAllowlist(...envNames: string[]) {
  const emails = new Set<string>()
  for (const name of envNames) {
    const configured = getEnv(name, false)
    if (!configured) continue
    for (const item of configured.split(',')) {
      const email = item.trim().toLowerCase()
      if (email) emails.add(email)
    }
  }
  return emails
}

/** @findgagu.com 또는 INTERNAL/EDU/SHOWROOM allowlist */
function isInternalAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  const domain = normalized.split('@')[1] || ''
  if (domain === 'findgagu.com') return true

  const allowlist = parseEmailAllowlist(
    'INTERNAL_ADMIN_ALLOWED_EMAILS',
    'EDU_OUTREACH_ALLOWED_EMAILS',
    'SHOWROOM_CASE_CONTENT_ALLOWED_EMAILS',
  )
  return allowlist.has(normalized)
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
  if (error || !data.user) {
    return { ok: false, status: 401, message: '유효하지 않은 세션입니다.' }
  }
  if (!isInternalAdminEmail(data.user.email)) {
    return { ok: false, status: 403, message: '내부 관리자 권한이 필요합니다.' }
  }
  return { ok: true, user: data.user, token }
}

const YT_ANALYTICS_SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ')

const OAUTH_ROW_ID = 'findgagu'

type YoutubeAnalyticsOauthRow = {
  id: string
  channel_id: string
  channel_title: string | null
  refresh_token_enc: string
  access_token_enc: string | null
  access_token_expires_at: string | null
  connected_by: string | null
  connected_at: string
  updated_at: string
  status: 'connected' | 'needs_reconnect'
  last_sync_at: string | null
  last_sync_error: string | null
}


function createServiceSupabase(): SupabaseClient {
  return createClient(getEnv('VITE_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

function getEncKey(): Buffer {
  const raw = getEnv('YOUTUBE_ANALYTICS_TOKEN_ENC_KEY')
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  const fromB64 = Buffer.from(raw, 'base64')
  if (fromB64.length === 32) return fromB64
  throw new Error('YOUTUBE_ANALYTICS_TOKEN_ENC_KEY는 32바이트(hex 64자 또는 base64)여야 합니다.')
}

/** AES-256-GCM. 저장 형식: iv.base64:tag.base64:cipher.base64 */
function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('암호문 형식이 올바르지 않습니다.')
  const decipher = createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function stateSecret() {
  return getEnv('YOUTUBE_ANALYTICS_TOKEN_ENC_KEY')
}

/** state = base64url(payload).sig  payload={uid,exp} */
function createOAuthState(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 15 * 60_000 }),
    'utf8',
  ).toString('base64url')
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyOAuthState(state: string): { ok: true; userId: string } | { ok: false; message: string } {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return { ok: false, message: 'state가 없습니다.' }
  const expected = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, message: 'state 서명이 올바르지 않습니다.' }
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string
      exp?: number
    }
    if (!parsed.uid || typeof parsed.exp !== 'number') {
      return { ok: false, message: 'state 페이로드가 올바르지 않습니다.' }
    }
    if (Date.now() > parsed.exp) return { ok: false, message: 'state가 만료되었습니다.' }
    return { ok: true, userId: parsed.uid }
  } catch {
    return { ok: false, message: 'state 파싱 실패' }
  }
}

function buildGoogleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getEnv('GOOGLE_YT_ANALYTICS_CLIENT_ID'),
    redirect_uri: getEnv('GOOGLE_YT_ANALYTICS_REDIRECT_URI'),
    response_type: 'code',
    scope: YT_ANALYTICS_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: getEnv('GOOGLE_YT_ANALYTICS_CLIENT_ID'),
    client_secret: getEnv('GOOGLE_YT_ANALYTICS_CLIENT_SECRET'),
    redirect_uri: getEnv('GOOGLE_YT_ANALYTICS_REDIRECT_URI'),
    grant_type: 'authorization_code',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `토큰 교환 실패 (${res.status})`)
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
  }
}

async function refreshAccessToken(refreshToken: string) {
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
  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `토큰 갱신 실패 (${res.status})`)
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  }
}

async function fetchMineChannel(accessToken: string) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'id,snippet')
  url.searchParams.set('mine', 'true')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = (await res.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>
    error?: { message?: string }
  }
  if (!res.ok) {
    throw new Error(json.error?.message || `채널 조회 실패 (${res.status})`)
  }
  const item = json.items?.[0]
  if (!item?.id) throw new Error('연결된 Google 계정에 YouTube 채널이 없습니다.')
  return {
    channelId: item.id,
    channelTitle: item.snippet?.title?.trim() || null,
  }
}

async function upsertOauthConnection(input: {
  channelId: string
  channelTitle: string | null
  refreshToken: string
  accessToken: string
  expiresIn: number
  connectedBy: string | null
}) {
  const supabase = createServiceSupabase()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + input.expiresIn * 1000).toISOString()
  const { error } = await supabase.from('youtube_analytics_oauth').upsert(
    {
      id: OAUTH_ROW_ID,
      channel_id: input.channelId,
      channel_title: input.channelTitle,
      refresh_token_enc: encryptSecret(input.refreshToken),
      access_token_enc: encryptSecret(input.accessToken),
      access_token_expires_at: expiresAt,
      connected_by: input.connectedBy,
      connected_at: now.toISOString(),
      updated_at: now.toISOString(),
      status: 'connected',
      last_sync_error: null,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

async function loadOauthRow(): Promise<YoutubeAnalyticsOauthRow | null> {
  const supabase = createServiceSupabase()
  const { data, error } = await supabase
    .from('youtube_analytics_oauth')
    .select('*')
    .eq('id', OAUTH_ROW_ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as YoutubeAnalyticsOauthRow | null) ?? null
}

async function markNeedsReconnect(message: string) {
  const supabase = createServiceSupabase()
  await supabase
    .from('youtube_analytics_oauth')
    .update({
      status: 'needs_reconnect',
      last_sync_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', OAUTH_ROW_ID)
}

/** Valid access token; refreshes if needed. */
async function getValidAccessToken(): Promise<{
  accessToken: string
  channelId: string
  channelTitle: string | null
  row: YoutubeAnalyticsOauthRow
}> {
  const row = await loadOauthRow()
  if (!row) throw new Error('YouTube Analytics가 연결되지 않았습니다.')
  if (row.status === 'needs_reconnect') {
    throw new Error('재연결이 필요합니다. 쇼츠 페이지에서 다시 연결하세요.')
  }

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0
  const skewMs = 60_000
  if (row.access_token_enc && expiresAt > Date.now() + skewMs) {
    return {
      accessToken: decryptSecret(row.access_token_enc),
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      row,
    }
  }

  let refreshToken: string
  try {
    refreshToken = decryptSecret(row.refresh_token_enc)
  } catch (error) {
    await markNeedsReconnect('refresh_token 복호화 실패')
    throw error
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken)
    const supabase = createServiceSupabase()
    const expiresIso = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
    await supabase
      .from('youtube_analytics_oauth')
      .update({
        access_token_enc: encryptSecret(refreshed.accessToken),
        access_token_expires_at: expiresIso,
        updated_at: new Date().toISOString(),
        status: 'connected',
      })
      .eq('id', OAUTH_ROW_ID)

    return {
      accessToken: refreshed.accessToken,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      row,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '토큰 갱신 실패'
    await markNeedsReconnect(message)
    throw new Error(message)
  }
}

function adminShortsRedirect(query: Record<string, string>) {
  const base = '/admin/showroom-shorts'
  const qs = new URLSearchParams(query).toString()
  return qs ? `${base}?${qs}` : base
}

function extractYoutubeVideoId(value: string | null | undefined): string | null {
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
