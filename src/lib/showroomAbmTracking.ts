import { trackShowroomEvent, type ShowroomEventName } from '@/lib/showroomEngagementService'
import { getShowroomAbmTrackingContext } from '@/lib/showroomAbmTraffic'

export type ShowroomAbmEventName = Extract<
  ShowroomEventName,
  | 'abm_showroom_enter'
  | 'abm_concern_select'
  | 'abm_ba_story_click'
  | 'abm_case_open'
  | 'abm_case_open_fail'
  | 'abm_consultation_click'
  | 'abm_gallery_open'
  | 'abm_gallery_browse'
  | 'abm_header_nav_click'
  | 'abm_shorts_landing_enter'
  | 'abm_shorts_more_sites_click'
>

export type ShowroomAbmConsultationSurface =
  | 'expert_comment'
  | 'case_sticky'
  | 'case_inline'
  | 'gallery_modal'
  | 'gallery_browse_header'
  | 'shorts_landing'

export type ShowroomAbmHeaderNavTarget = 'before_after' | 'expert_recommend'

export type ShowroomAbmGalleryMode = 'site' | 'product' | 'color' | 'beforeAfter'

export type ShowroomAbmGalleryBrowseMode = 'industry' | 'product' | 'color'

export type ShowroomAbmCaseFailReason = 'not_found' | 'incomplete' | 'unknown'

export type ShowroomAbmTrackInput = {
  eventName: ShowroomAbmEventName
  concern?: string | null
  siteName?: string | null
  industry?: string | null
  metadata?: Record<string, unknown>
}

export function trackShowroomAbmEvent(input: ShowroomAbmTrackInput): void {
  void trackShowroomEvent({
    eventName: input.eventName,
    sourceSurface: 'public_showroom',
    siteName: input.siteName,
    industry: input.industry,
    metadata: {
      ...getShowroomAbmTrackingContext(),
      ...(input.concern ? { concern: input.concern } : {}),
      ...(input.metadata ?? {}),
    },
  })
}

export function trackShowroomAbmConsultationClick(input: {
  surface: ShowroomAbmConsultationSurface
  concern?: string | null
  siteName?: string | null
}): void {
  trackShowroomAbmEvent({
    eventName: 'abm_consultation_click',
    concern: input.concern,
    siteName: input.siteName,
    metadata: { surface: input.surface },
  })
}

export function trackShowroomAbmHeaderNavClick(input: {
  target: ShowroomAbmHeaderNavTarget
  concern?: string | null
}): void {
  trackShowroomAbmEvent({
    eventName: 'abm_header_nav_click',
    concern: input.concern,
    metadata: { navTarget: input.target },
  })
}

export function trackShowroomAbmShortsLandingEnter(input: {
  jobId: string
  siteName?: string | null
}): void {
  trackShowroomAbmEvent({
    eventName: 'abm_shorts_landing_enter',
    siteName: input.siteName,
    metadata: {
      jobId: input.jobId,
      entry: 'shorts',
    },
  })
}

export function trackShowroomAbmShortsMoreSitesClick(input: {
  jobId: string
  siteName?: string | null
}): void {
  trackShowroomAbmEvent({
    eventName: 'abm_shorts_more_sites_click',
    siteName: input.siteName,
    metadata: {
      jobId: input.jobId,
      entry: 'shorts',
    },
  })
}
