import { trackShowroomEvent, type ShowroomEventName } from '@/lib/showroomEngagementService'
import {
  captureShowroomAbmAttribution,
  getShowroomAbmTrackingContext,
} from '@/lib/showroomAbmTraffic'

export type ShowroomAbmEventName = Extract<
  ShowroomEventName,
  | 'abm_showroom_enter'
  | 'abm_pain_click'
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
  | 'hub_insight'
  | 'case_sticky'
  | 'case_inline'
  | 'gallery_modal'
  | 'gallery_browse_header'
  | 'gallery_close'
  | 'shorts_landing'
  | 'guide_page'
  | 'homepage_pain'

export type ShowroomAbmPainCtaType = 'case' | 'consult' | 'consult_soft'

export type ShowroomAbmHeaderNavTarget = 'before_after' | 'expert_recommend' | 'gallery_more'

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

/** 랜딩 페인 카드 클릭 — 세그먼트별 pain_click → case_view → consult_click 검증용 */
export function trackShowroomAbmPainClick(input: {
  segment: string
  concern: string
  ctaType: ShowroomAbmPainCtaType
}): void {
  trackShowroomAbmEvent({
    eventName: 'abm_pain_click',
    concern: input.concern,
    industry: input.segment,
    metadata: {
      segment: input.segment,
      ctaType: input.ctaType,
      surface: 'homepage_pain',
    },
  })
  if (input.ctaType === 'consult' || input.ctaType === 'consult_soft') {
    trackShowroomAbmConsultationClick({
      surface: 'homepage_pain',
      concern: input.concern,
    })
  }
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
  const jobId = captureShowroomAbmAttribution({ jobId: input.jobId }) ?? input.jobId.trim()
  trackShowroomAbmEvent({
    eventName: 'abm_shorts_landing_enter',
    siteName: input.siteName,
    metadata: {
      jobId,
      entry: 'shorts',
    },
  })
}

export function trackShowroomAbmShortsMoreSitesClick(input: {
  jobId: string
  siteName?: string | null
}): void {
  const jobId = captureShowroomAbmAttribution({ jobId: input.jobId }) ?? input.jobId.trim()
  trackShowroomAbmEvent({
    eventName: 'abm_shorts_more_sites_click',
    siteName: input.siteName,
    metadata: {
      jobId,
      entry: 'shorts',
    },
  })
}
