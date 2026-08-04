import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

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

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
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

const YT_ANALYTICS_RETURN_PATHS = ['/admin/ad-inbox', '/admin/showroom-shorts'] as const
type YoutubeAnalyticsReturnTo = (typeof YT_ANALYTICS_RETURN_PATHS)[number]
const DEFAULT_YT_ANALYTICS_RETURN_TO: YoutubeAnalyticsReturnTo = '/admin/ad-inbox'

function normalizeYoutubeAnalyticsReturnTo(value: unknown): YoutubeAnalyticsReturnTo {
  if (typeof value === 'string' && (YT_ANALYTICS_RETURN_PATHS as readonly string[]).includes(value)) {
    return value as YoutubeAnalyticsReturnTo
  }
  return DEFAULT_YT_ANALYTICS_RETURN_TO
}

/** state = base64url(payload).sig  payload={uid,exp,ret?} */
function createOAuthState(userId: string, returnTo?: string): string {
  const ret = normalizeYoutubeAnalyticsReturnTo(returnTo)
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 15 * 60_000, ret }),
    'utf8',
  ).toString('base64url')
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyOAuthState(
  state: string,
):
  | { ok: true; userId: string; returnTo: YoutubeAnalyticsReturnTo }
  | { ok: false; message: string } {
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
      ret?: string
    }
    if (!parsed.uid || typeof parsed.exp !== 'number') {
      return { ok: false, message: 'state 페이로드가 올바르지 않습니다.' }
    }
    if (Date.now() > parsed.exp) return { ok: false, message: 'state가 만료되었습니다.' }
    return {
      ok: true,
      userId: parsed.uid,
      returnTo: normalizeYoutubeAnalyticsReturnTo(parsed.ret),
    }
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

function adminAnalyticsRedirect(
  query: Record<string, string>,
  returnTo: string = DEFAULT_YT_ANALYTICS_RETURN_TO,
) {
  const base = normalizeYoutubeAnalyticsReturnTo(returnTo)
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

function redirect(res: ResponseLike, location: string) {
  res.setHeader('Location', location)
  res.status(302).send('')
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json')
    res.status(405).json({ ok: false, message: 'GET only' })
    return
  }

  const errorParam = q(req.query.error)
  if (errorParam) {
    redirect(
      res,
      adminAnalyticsRedirect({
        yt_analytics: 'error',
        message: q(req.query.error_description) || errorParam,
      }),
    )
    return
  }

  const code = q(req.query.code)
  const state = q(req.query.state)
  if (!code || !state) {
    redirect(res, adminAnalyticsRedirect({ yt_analytics: 'error', message: 'code_or_state_missing' }))
    return
  }

  const verified = verifyOAuthState(state)
  if (!verified.ok) {
    redirect(res, adminAnalyticsRedirect({ yt_analytics: 'error', message: verified.message }))
    return
  }

  const returnTo = verified.returnTo

  try {
    const tokens = await exchangeCodeForTokens(code)
    const channel = await fetchMineChannel(tokens.accessToken)

    let refreshToken = tokens.refreshToken
    if (!refreshToken) {
      const existing = await loadOauthRow()
      if (existing?.refresh_token_enc) {
        refreshToken = decryptSecret(existing.refresh_token_enc)
      }
    }
    if (!refreshToken) {
      redirect(
        res,
        adminAnalyticsRedirect(
          {
            yt_analytics: 'error',
            message: 'refresh_token_missing_retry_consent',
          },
          returnTo,
        ),
      )
      return
    }

    await upsertOauthConnection({
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      refreshToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      connectedBy: verified.userId,
    })

    redirect(res, adminAnalyticsRedirect({ yt_analytics: 'connected' }, returnTo))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth_callback_failed'
    redirect(
      res,
      adminAnalyticsRedirect({ yt_analytics: 'error', message: message.slice(0, 180) }, returnTo),
    )
  }
}
