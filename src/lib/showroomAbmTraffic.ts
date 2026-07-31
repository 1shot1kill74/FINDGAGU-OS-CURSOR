import { DEFAULT_PUBLIC_SHOWROOM_ORIGIN } from '@/lib/showroomShareService'

export type ShowroomAbmTrafficFilter = 'production' | 'exclude_local' | 'all'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const PUBLIC_SHOWROOM_LANDING_HOSTS = new Set(['findgagu.co.kr', 'www.findgagu.co.kr'])
const ABM_JOB_ID_STORAGE_KEY = 'findgagu_showroom_abm_job_id'
const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export function isValidShowroomAbmJobId(value: string | null | undefined): boolean {
  if (!value?.trim()) return false
  return JOB_ID_PATTERN.test(value.trim())
}

export function normalizeShowroomAbmJobId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!isValidShowroomAbmJobId(trimmed)) return null
  return trimmed.toLowerCase()
}

/** URL path/query에서 jobId를 읽어 sessionStorage에 1회 귀속. 이후 ABM 이벤트 metadata에 포함된다. */
export function captureShowroomAbmAttribution(input?: {
  pathname?: string
  search?: string
  jobId?: string | null
}): string | null {
  if (typeof window === 'undefined') return null

  const existing = readStoredShowroomAbmJobId()
  if (existing) return existing

  const pathname = input?.pathname ?? window.location.pathname
  const search = input?.search ?? window.location.search
  const fromInput = normalizeShowroomAbmJobId(input?.jobId)
  const fromPath = extractJobIdFromPathname(pathname)
  const fromQuery = normalizeShowroomAbmJobId(new URLSearchParams(search).get('jobId'))
  const resolved = fromInput ?? fromPath ?? fromQuery

  if (!resolved) return null

  try {
    window.sessionStorage.setItem(ABM_JOB_ID_STORAGE_KEY, resolved)
  } catch {
    // private mode 등
  }
  return resolved
}

export function readStoredShowroomAbmJobId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeShowroomAbmJobId(window.sessionStorage.getItem(ABM_JOB_ID_STORAGE_KEY))
  } catch {
    return null
  }
}

export function extractJobIdFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const shortsMatch = pathname.match(/^\/public\/showroom\/shorts\/([^/]+)\/?$/i)
  if (shortsMatch?.[1]) return normalizeShowroomAbmJobId(decodeURIComponent(shortsMatch[1]))

  const redirectMatch = pathname.match(/^\/r\/[^/]+\/([^/]+)\/?$/i)
  if (redirectMatch?.[1]) return normalizeShowroomAbmJobId(decodeURIComponent(redirectMatch[1]))

  return null
}

export function readAbmEventJobId(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  return normalizeShowroomAbmJobId(
    typeof metadata.jobId === 'string'
      ? metadata.jobId
      : typeof metadata.job_id === 'string'
        ? metadata.job_id
        : null
  )
}

export function getShowroomAbmTrackingContext(): Record<string, string | boolean> {
  if (typeof window === 'undefined') return {}

  const hostname = window.location.hostname.trim().toLowerCase()
  const params = new URLSearchParams(window.location.search)
  const utmSource = params.get('utm_source')?.trim()
  const utmMedium = params.get('utm_medium')?.trim()
  const utmCampaign = params.get('utm_campaign')?.trim()
  const entry = params.get('entry')?.trim()
  const jobId = captureShowroomAbmAttribution()

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
    ...(jobId ? { jobId } : {}),
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
