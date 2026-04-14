import { supabase } from '@/lib/supabase'
import { DEFAULT_PUBLIC_SHOWROOM_ORIGIN, DEFAULT_PUBLIC_SHOWROOM_PATH } from '@/lib/showroomShareService'
import type { Database } from '@/types/database'

export const SHOWROOM_CTA_CHANNELS = ['youtube', 'facebook', 'instagram'] as const
export const SHOWROOM_CTA_TYPES = [
  'yt_comment',
  'yt_profile',
  'fb_caption',
  'fb_profile',
  'ig_caption',
  'ig_profile',
] as const

const VISITOR_KEY_STORAGE_KEY = 'findgagu_showroom_visitor_key'
const SESSION_KEY_STORAGE_KEY = 'findgagu_showroom_session_id'

export type ShowroomCtaChannel = (typeof SHOWROOM_CTA_CHANNELS)[number]
export type ShowroomCtaType = (typeof SHOWROOM_CTA_TYPES)[number]
export type ShowroomCtaVisitRow = Database['public']['Tables']['showroom_cta_visits']['Row']

export type ShowroomCtaAttribution = {
  source: string | null
  channel: ShowroomCtaChannel
  cta: ShowroomCtaType
  contentJobId: string | null
  targetId: string | null
}

export function getPublicShowroomUrl() {
  const configured = (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString().trim()
  if (!configured) return `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${DEFAULT_PUBLIC_SHOWROOM_PATH}`

  try {
    const parsed = new URL(configured.includes('://') ? configured : `https://${configured}`)
    const path = parsed.pathname.replace(/\/+$/, '') || ''
    if (!path || path === '/' || path === '/showroom' || !path.includes('public/showroom')) {
      return `${parsed.origin}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
    }
    return `${parsed.origin}${path}`
  } catch {
    return `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
  }
}

export function buildTrackedShowroomUrl(input: {
  channel: ShowroomCtaChannel
  cta: ShowroomCtaType
  jobId?: string | null
  targetId?: string | null
  source?: string | null
  extraParams?: Record<string, string | null | undefined>
}) {
  const url = new URL(getPublicShowroomUrl())
  url.searchParams.set('channel', input.channel)
  url.searchParams.set('cta', input.cta)
  if (input.jobId?.trim()) url.searchParams.set('jobId', input.jobId.trim())
  if (input.targetId?.trim()) url.searchParams.set('targetId', input.targetId.trim())
  if (input.source?.trim()) url.searchParams.set('src', input.source.trim())
  for (const [key, value] of Object.entries(input.extraParams ?? {})) {
    if (value?.trim()) url.searchParams.set(key, value.trim())
  }
  return url.toString()
}

export function parseShowroomCtaAttribution(searchParams: URLSearchParams): ShowroomCtaAttribution | null {
  const channel = searchParams.get('channel')?.trim().toLowerCase()
  const cta = searchParams.get('cta')?.trim().toLowerCase()
  if (!channel || !cta) return null
  if (!isShowroomCtaChannel(channel) || !isShowroomCtaType(cta)) return null

  return {
    source: searchParams.get('src')?.trim() || null,
    channel,
    cta,
    contentJobId: searchParams.get('jobId')?.trim() || null,
    targetId: searchParams.get('targetId')?.trim() || null,
  }
}

export async function trackShowroomCtaVisit(input: {
  attribution: ShowroomCtaAttribution
  landingPath?: string
  landingQuery?: string
}) {
  if (typeof window === 'undefined') return

  const visitorKey = getOrCreateStorageValue(VISITOR_KEY_STORAGE_KEY)
  const sessionId = getOrCreateSessionValue(SESSION_KEY_STORAGE_KEY)
  const referrerHost = getReferrerHost()

  const { error } = await supabase.from('showroom_cta_visits').insert({
    visitor_key: visitorKey,
    session_id: sessionId,
    source: input.attribution.source,
    channel: input.attribution.channel,
    cta: input.attribution.cta,
    content_job_id: input.attribution.contentJobId,
    target_id: input.attribution.targetId,
    landing_path: input.landingPath || window.location.pathname || DEFAULT_PUBLIC_SHOWROOM_PATH,
    landing_query: input.landingQuery || window.location.search || null,
    referrer_host: referrerHost,
    user_agent: window.navigator.userAgent || null,
    metadata: {},
  })

  if (error) {
    throw error
  }
}

function isShowroomCtaChannel(value: string): value is ShowroomCtaChannel {
  return (SHOWROOM_CTA_CHANNELS as readonly string[]).includes(value)
}

function isShowroomCtaType(value: string): value is ShowroomCtaType {
  return (SHOWROOM_CTA_TYPES as readonly string[]).includes(value)
}

function getOrCreateStorageValue(key: string) {
  const existing = window.localStorage.getItem(key)?.trim()
  if (existing) return existing
  const next = crypto.randomUUID()
  window.localStorage.setItem(key, next)
  return next
}

function getOrCreateSessionValue(key: string) {
  const existing = window.sessionStorage.getItem(key)?.trim()
  if (existing) return existing
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(key, next)
  return next
}

function getReferrerHost() {
  const raw = document.referrer?.trim()
  if (!raw) return null
  try {
    return new URL(raw).hostname || null
  } catch {
    return null
  }
}
