import { createClient, type User } from '@supabase/supabase-js'

type RequestLike = {
  headers: Record<string, string | string[] | undefined>
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

export function getBearerToken(req: RequestLike) {
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
export function isInternalAdminEmail(email: string | undefined | null): boolean {
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

export async function assertInternalAdmin(req: RequestLike): Promise<
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
