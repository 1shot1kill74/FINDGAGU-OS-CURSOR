/** 내부 관리자 — @findgagu.com 또는 VITE_INTERNAL_ADMIN_ALLOWED_EMAILS */
export function isInternalAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  const domain = normalized.split('@')[1] || ''
  if (domain === 'findgagu.com') return true

  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_INTERNAL_ADMIN_ALLOWED_EMAILS) || ''
  const allowlist = String(raw)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(normalized)
}
