import { supabase } from '@/lib/supabase'

export type HomepagePainCtaType = 'case' | 'consult' | 'consult_soft'

const SESSION_KEY = 'findgagu_showroom_session_key'

function getSessionKey(): string {
  if (typeof window === 'undefined') return 'server-render'
  try {
    const existing = window.localStorage.getItem(SESSION_KEY)?.trim()
    if (existing) return existing
    const next = `showroom-${crypto.randomUUID()}`
    window.localStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return `showroom-${Date.now()}`
  }
}

/** 홈 페인 카드 → pain_click (+ 문의 CTA면 consult_click) */
export function trackHomepagePainClick(input: {
  segment: string
  concern: string
  ctaType: HomepagePainCtaType
}): void {
  const sessionKey = getSessionKey()
  const base = {
    session_key: sessionKey,
    source_surface: 'homepage',
    industry: input.segment,
    before_after: false,
  }

  void (async () => {
    try {
      await (supabase as any).from('showroom_engagement_events').insert({
        ...base,
        event_name: 'abm_pain_click',
        site_name: null,
        metadata: {
          segment: input.segment,
          concern: input.concern,
          ctaType: input.ctaType,
          surface: 'homepage_pain',
        },
      })
      if (input.ctaType === 'consult' || input.ctaType === 'consult_soft') {
        await (supabase as any).from('showroom_engagement_events').insert({
          ...base,
          event_name: 'abm_consultation_click',
          site_name: null,
          metadata: {
            segment: input.segment,
            concern: input.concern,
            ctaType: input.ctaType,
            surface: 'homepage_pain',
          },
        })
      }
    } catch {
      // Public browsing continues if tracking is unavailable.
    }
  })()
}
