import dns from 'node:dns/promises'
import net from 'node:net'

const BLOCKED_HOST_SNIPPETS = [
  'news.google.',
  'accounts.google.',
] as const

function isGoogleBlockedHost(hostname: string) {
  const host = hostname.toLowerCase()
  return (
    host.includes('news.google.') ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host.includes('accounts.google.') ||
    BLOCKED_HOST_SNIPPETS.some((s) => host.includes(s))
  )
}

function normalizeIp(ip: string) {
  const trimmed = ip.trim().toLowerCase()
  if (trimmed.startsWith('::ffff:')) {
    const mapped = trimmed.slice('::ffff:'.length)
    if (net.isIPv4(mapped)) return mapped
  }
  return trimmed
}

/** RFC1918 / loopback / link-local / CGNAT / ULA 등 비공개·특수 IP */
export function isPrivateOrSpecialIp(ip: string): boolean {
  const value = normalizeIp(ip)
  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map((part) => Number(part))
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    return false
  }
  if (net.isIPv6(value)) {
    if (value === '::' || value === '::1') return true
    if (value.startsWith('fc') || value.startsWith('fd')) return true
    if (value.startsWith('fe80')) return true
    if (value.startsWith('ff')) return true
    return false
  }
  return true
}

export function isBlockedFetchHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return true
  }
  if (isGoogleBlockedHost(host)) return true
  if (net.isIP(host) && isPrivateOrSpecialIp(host)) return true
  return false
}

export async function assertSafePublicHttpUrl(raw: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('유효하지 않은 URL입니다.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('http/https URL만 지원합니다.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('인증 정보가 포함된 URL은 허용되지 않습니다.')
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  if (isBlockedFetchHost(hostname)) {
    throw new Error('이 호스트로의 요청은 차단되었습니다.')
  }

  if (!net.isIP(hostname)) {
    let records: Array<{ address: string }>
    try {
      records = await dns.lookup(hostname, { all: true, verbatim: true })
    } catch {
      throw new Error('URL 호스트를 확인할 수 없습니다.')
    }
    if (!records.length) throw new Error('URL 호스트를 확인할 수 없습니다.')
    for (const record of records) {
      if (isPrivateOrSpecialIp(record.address)) {
        throw new Error('사설/내부망 주소로의 요청은 차단되었습니다.')
      }
    }
  }

  return parsed
}

export async function fetchHtmlFollowingRedirectsSafely(
  url: string,
  opts?: { maxRedirects?: number; headers?: Record<string, string> },
): Promise<{ html: string; finalUrl: string }> {
  const maxRedirects = opts?.maxRedirects ?? 5
  let current = await assertSafePublicHttpUrl(url)

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafePublicHttpUrl(current.toString())
    const res = await fetch(current.toString(), {
      redirect: 'manual',
      headers: opts?.headers ?? {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error(`원문 페이지 리다이렉트 실패 (${res.status})`)
      current = new URL(location, current)
      continue
    }

    if (!res.ok) throw new Error(`원문 페이지 요청 실패 (${res.status})`)
    return { html: await res.text(), finalUrl: current.toString() }
  }

  throw new Error('리다이렉트가 너무 많습니다.')
}

export function isGoogleNewsHost(hostname: string) {
  return isGoogleBlockedHost(hostname)
}
