import { DEFAULT_PUBLIC_SHOWROOM_ORIGIN } from '@/lib/showroomShareService'

export type ShowroomAbmTrafficFilter = 'production' | 'exclude_local' | 'all'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export function getShowroomAbmTrackingContext(): Record<string, string | boolean> {
  if (typeof window === 'undefined') return {}

  const hostname = window.location.hostname.trim().toLowerCase()
  return {
    page_hostname: hostname,
    page_origin: window.location.origin,
    page_path: window.location.pathname,
    is_localhost: LOCAL_HOSTNAMES.has(hostname),
    is_production_host: isShowroomAbmProductionHost(hostname),
  }
}

export function getShowroomAbmProductionHostnames(): string[] {
  const hosts = new Set<string>()

  try {
    hosts.add(new URL(DEFAULT_PUBLIC_SHOWROOM_ORIGIN).hostname.trim().toLowerCase())
  } catch {
    hosts.add('findgagu-os-cursor.vercel.app')
  }

  const configured = (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString().trim()
  if (configured) {
    try {
      const parsed = new URL(configured.includes('://') ? configured : `https://${configured}`)
      hosts.add(parsed.hostname.trim().toLowerCase())
    } catch {
      // ignore invalid env
    }
  }

  return [...hosts]
}

export function isShowroomAbmLocalHost(hostname: string | null | undefined): boolean {
  if (!hostname?.trim()) return false
  return LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase())
}

export function isShowroomAbmProductionHost(hostname: string | null | undefined): boolean {
  if (!hostname?.trim()) return false
  return getShowroomAbmProductionHostnames().includes(hostname.trim().toLowerCase())
}

export function readAbmEventHostname(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = metadata.page_hostname
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
}

export function getAbmTrafficFilterLabel(filter: ShowroomAbmTrafficFilter): string {
  if (filter === 'production') return '프로덕션만'
  if (filter === 'exclude_local') return '로컬 제외'
  return '전체'
}

export function matchesShowroomAbmTrafficFilter(
  metadata: Record<string, unknown> | null | undefined,
  filter: ShowroomAbmTrafficFilter
): boolean {
  if (filter === 'all') return true

  const hostname = readAbmEventHostname(metadata)
  if (!hostname) return false

  if (filter === 'exclude_local') return !isShowroomAbmLocalHost(hostname)
  return isShowroomAbmProductionHost(hostname)
}

export function formatAbmHostnameLabel(hostname: string | null): string {
  if (!hostname) return '호스트 미기록(구 데이터)'
  if (isShowroomAbmLocalHost(hostname)) return `${hostname} · 로컬`
  if (isShowroomAbmProductionHost(hostname)) return `${hostname} · 프로덕션`
  if (hostname.endsWith('.vercel.app')) return `${hostname} · Vercel 프리뷰`
  return hostname
}
