import { createClient } from '@supabase/supabase-js'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  }
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

function getSupabaseAuthClient() {
  const url = getEnv('VITE_SUPABASE_URL')
  const publishableKey = getEnv('VITE_SUPABASE_ANON_KEY')
  return createClient(url, publishableKey, { auth: { persistSession: false } })
}

function isAllowedAdminEmail(email: string | undefined) {
  const configured = getEnv('SHOWROOM_CASE_CONTENT_ALLOWED_EMAILS', false)
  if (!configured) return true

  const allowed = configured
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  return Boolean(email && allowed.includes(email.trim().toLowerCase()))
}

async function assertAuthenticatedInternalUser(req: RequestLike) {
  const token = getBearerToken(req)
  if (!token) {
    return { ok: false as const, status: 401, message: '로그인이 필요합니다.' }
  }

  const supabase = getSupabaseAuthClient()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return { ok: false as const, status: 401, message: '유효하지 않은 로그인 세션입니다.' }
  }

  if (!isAllowedAdminEmail(data.user.email)) {
    return { ok: false as const, status: 403, message: '콘텐츠 생성 권한이 없습니다.' }
  }

  return { ok: true as const, userEmail: data.user.email ?? null }
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'POST,OPTIONS')
      res.status(200).send('ok')
      return
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST,OPTIONS')
      res.status(405).json({ ok: false, message: 'POST 요청만 지원합니다.' })
      return
    }

    const auth = await assertAuthenticatedInternalUser(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const webhookUrl = getEnv('SHOWROOM_CASE_CONTENT_WEBHOOK_URL')
    const webhookSecret = getEnv('SHOWROOM_CASE_CONTENT_WEBHOOK_SECRET', false)
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'X-Showroom-Case-Content-Secret': webhookSecret } : {}),
      },
      body: JSON.stringify({
        ...(req.body && typeof req.body === 'object' ? req.body : {}),
        requestedBy: auth.userEmail,
      }),
    })

    const contentType = response.headers.get('content-type') || 'application/json'
    const payload = await response.text()
    res.setHeader('Content-Type', contentType)
    res.status(response.status).send(payload)
  } catch (error) {
    console.error('[showroom-case-content] proxy failed', error)
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '콘텐츠 생성 프록시 요청 중 오류가 발생했습니다.',
    })
  }
}
