/** 브라우저/저장용 — http(s)만 허용 (javascript:/data: 차단) */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return false
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** 안전한 외부 링크 href. 아니면 undefined */
export function safeExternalHref(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || !isSafeHttpUrl(trimmed)) return undefined
  return trimmed
}

export function assertSafeHttpUrl(value: string, label = 'URL'): string {
  const trimmed = value.trim()
  if (!isSafeHttpUrl(trimmed)) {
    throw new Error(`${label}은 http/https만 허용됩니다.`)
  }
  return trimmed
}
