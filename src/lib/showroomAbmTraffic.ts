import { DEFAULT_PUBLIC_SHOWROOM_ORIGIN } from '@/lib/showroomShareService'

export type ShowroomAbmTrafficFilter = 'production' | 'exclude_local' | 'all'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const PUBLIC_SHOWROOM_LANDING_HOSTS = new Set(['findgagu.co.kr', 'www.findgagu.co.kr'])

function normalizeHostname(hostname: string | null | undefined): string {
  return hostname?.trim().toLowerCase() ?? ''
}

function addHostnameFromUrl(hosts: Set<string>, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) return

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    hosts.add(parsed.hostname.trim().toLowerCase())
  } catch {
    // ignore invalid env
  }
}

export function getShowroomAbmTrackingContext(): Record<string, string | boolean> {
  if (typeof window === 'undefined') return {}

  const hostname = window.location.hostname.trim().toLowerCase()
  const params = new URLSearchParams(window.location.search)
  const utmSource = params.get('utm_source')?.trim()
  const utmMedium = params.get('utm_medium')?.trim()
  const utmCampaign = params.get('utm_campaign')?.trim()
  const entry = params.get('entry')?.trim()

  return {
    page_hostname: hostname,
    page_origin: window.location.origin,
    page_path: window.location.pathname,
    page_search: window.location.search,
    is_localhost: LOCAL_HOSTNAMES.has(hostname),
    is_production_host: isShowroomAbmProductionHost(hostname),
    ...(utmSource ? { utm_source: utmSource } : {}),
    ...(utmMedium ? { utm_medium: utmMedium } : {}),
    ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
    ...(entry ? { entry } : {}),
  }
}

export function getPublicShowroomLandingHostnames(): string[] {
  const hosts = new Set<string>(PUBLIC_SHOWROOM_LANDING_HOSTS)
  addHostnameFromUrl(hosts, (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString())
  return [...hosts]
}

export function isPublicShowroomLandingHost(hostname: string | null | undefined): boolean {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return false
  return getPublicShowroomLandingHostnames().includes(normalized)
}

export function getShowroomAbmProductionHostnames(): string[] {
  const hosts = new Set<string>(getPublicShowroomLandingHostnames())

  try {
    hosts.add(new URL(DEFAULT_PUBLIC_SHOWROOM_ORIGIN).hostname.trim().toLowerCase())
  } catch {
    hosts.add('findgagu-os-cursor.vercel.app')
  }

  addHostnameFromUrl(hosts, (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString())

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
