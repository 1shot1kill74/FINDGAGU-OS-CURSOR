export type EduOutreachIndustry =
  | 'academy'
  | 'school'
  | 'study_cafe'
  | 'managed_reading_room'
  | 'apartment_community'
  | 'military'
  | 'unknown'
  | 'excluded'

export type EduOutreachLeadStatus =
  | 'new'
  | 'scored'
  | 'queued'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'replied'
  | 'converted'
  | 'excluded'

export type EduOutreachScoreJson = {
  fit_score: number
  industry: EduOutreachIndustry
  intent: string
  region: string
  why: string
  outreach_angle: string
  draft_message: string
  cta_url: string
  source_url: string
  evidence_quote: string
}

export type EduOutreachSourceRow = {
  id: string
  slug: string
  name: string
  source_type: string
  config: Record<string, unknown>
  is_active: boolean
  last_polled_at: string | null
  last_poll_status: string | null
  last_poll_error: string | null
}

export type EduOutreachLeadRow = {
  id: string
  signal_id: string | null
  org_name: string | null
  contact_channel: string
  contact_value: string | null
  industry: EduOutreachIndustry
  intent: string | null
  region: string | null
  status: EduOutreachLeadStatus
  fit_score: number | null
  score_payload: Record<string, unknown>
  evidence_quote: string | null
  source_url: string | null
  why: string | null
  outreach_angle: string | null
  cta_url: string | null
  preferred_contact_window: string
  scored_at: string | null
  queued_at: string | null
  approved_at: string | null
  rejected_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type EduOutreachDraftRow = {
  id: string
  lead_id: string
  channel: string
  subject: string | null
  body: string
  cta_url: string | null
  engine: string
  version: number
  is_current: boolean
  created_at: string
}

export type EduOutreachSendLogRow = {
  id: string
  lead_id: string
  draft_id: string | null
  channel: string
  status: string
  destination: string | null
  message_snapshot: string | null
  error_message: string | null
  created_at: string
}

export type EduOutreachSignalRow = {
  id: string
  title: string | null
  body: string | null
  source_url: string | null
  published_at: string | null
  region_hint: string | null
  industry_hint: string | null
  raw: Record<string, unknown>
  first_seen_at: string
}

export type EduOutreachLeadWithDraft = EduOutreachLeadRow & {
  draft: EduOutreachDraftRow | null
  signal: EduOutreachSignalRow | null
}

export const EDU_INDUSTRY_LABELS: Record<EduOutreachIndustry, string> = {
  academy: '학원',
  school: '학교',
  study_cafe: '스터디카페',
  managed_reading_room: '관리형 독서실',
  apartment_community: '아파트 커뮤니티',
  military: '군부대',
  unknown: '미분류',
  excluded: '제외',
}

export const EDU_STATUS_LABELS: Record<EduOutreachLeadStatus, string> = {
  new: '신규',
  scored: '점수화',
  queued: '승인 대기',
  approved: '승인됨',
  rejected: '거절',
  sent: '발송 기록',
  replied: '회신',
  converted: '상담 전환',
  excluded: '제외',
}
