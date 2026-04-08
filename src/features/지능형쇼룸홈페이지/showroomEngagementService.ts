import { supabase } from '@/lib/supabase'

export type ShowroomEventName =
  | 'showroom_open'
  | 'showroom_view_case'
  | 'showroom_view_before_after'
  | 'showroom_reply_intent'

type ShowroomEventRecord = {
  sessionKey: string
  eventName: ShowroomEventName
  sourceSurface: 'homepage' | 'public_showroom'
  siteName?: string | null
  industry?: string | null
  beforeAfter?: boolean
  createdAt: string
}

const SESSION_KEY = 'findgagu_showroom_session_key'
const EVENT_KEY = 'findgagu_showroom_events'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getShowroomSessionKey(): string {
  if (!canUseStorage()) return 'server-render'
  const existing = window.localStorage.getItem(SESSION_KEY)?.trim()
  if (existing) return existing
  const next = `showroom-${crypto.randomUUID()}`
  window.localStorage.setItem(SESSION_KEY, next)
  return next
}

function readStoredEvents(): ShowroomEventRecord[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(EVENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ShowroomEventRecord[]) : []
  } catch {
    return []
  }
}

function writeStoredEvents(events: ShowroomEventRecord[]): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(-40)))
}

export async function trackShowroomEvent(input: {
  eventName: ShowroomEventName
  sourceSurface: 'homepage' | 'public_showroom'
  siteName?: string | null
  industry?: string | null
  beforeAfter?: boolean
  metadata?: Record<string, unknown>
}): Promise<void> {
  const record: ShowroomEventRecord = {
    sessionKey: getShowroomSessionKey(),
    eventName: input.eventName,
    sourceSurface: input.sourceSurface,
    siteName: input.siteName?.trim() || null,
    industry: input.industry?.trim() || null,
    beforeAfter: Boolean(input.beforeAfter),
    createdAt: new Date().toISOString(),
  }

  const nextEvents = [...readStoredEvents(), record]
  writeStoredEvents(nextEvents)

  try {
    await (supabase as any).from('showroom_engagement_events').insert({
      session_key: record.sessionKey,
      event_name: record.eventName,
      source_surface: record.sourceSurface,
      site_name: record.siteName,
      industry: record.industry,
      before_after: record.beforeAfter,
      metadata: input.metadata ?? {},
    })
  } catch {
    // Public browsing should continue even if tracking storage is not yet provisioned.
  }
}

export function getRecentInterestSites(limit = 3): string[] {
  const unique: string[] = []
  const seen = new Set<string>()
  const events = readStoredEvents().slice().reverse()
  for (const event of events) {
    if (event.eventName !== 'showroom_view_case' || !event.siteName) continue
    if (seen.has(event.siteName)) continue
    unique.push(event.siteName)
    seen.add(event.siteName)
    if (unique.length >= limit) break
  }
  return unique
}

export function buildShowroomContextParams(input: {
  sourceSurface: 'homepage' | 'public_showroom'
  siteName: string
  followupSummary: string
}): URLSearchParams {
  const query = new URLSearchParams()
  query.set('showroom_source', input.sourceSurface)
  query.set('showroom_interest_site', input.siteName)
  query.set('showroom_session_key', getShowroomSessionKey())
  query.set('showroom_last_cases', getRecentInterestSites().join(' | '))
  query.set('showroom_followup_summary', input.followupSummary)
  return query
}
