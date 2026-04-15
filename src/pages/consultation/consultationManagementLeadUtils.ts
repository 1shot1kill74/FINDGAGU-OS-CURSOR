import { formatDistanceToNow, startOfDay, startOfMonth, subMonths } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getGoldenTimeState } from '@/lib/utils/dateUtils'
import {
  CONSULTATION_STAGES,
  CUSTOMER_TIER_RANK,
  CUSTOMER_TIER_VALUES,
  MEASUREMENT_STATUSES,
  REACTIVATION_WINDOW_DAYS,
  STATUS_TO_STAGE,
  type ConsultationStage,
  type CustomerTier,
  type DateRangeKey,
  type MeasurementStatus,
} from './consultationManagementConstants'
import type { EstimateHistoryItem, Lead } from './consultationManagementTypes'
import { isMarketSource } from './consultationManagementUtils'

/** 여러 등급 중 가장 높은 등급 반환 (동일 연락처 동기화용) */
export function getHighestTier(tiers: CustomerTier[]): CustomerTier {
  if (tiers.length === 0) return '신규'
  return tiers.reduce((a, b) => (CUSTOMER_TIER_RANK[a] >= CUSTOMER_TIER_RANK[b] ? a : b))
}

/** 연락처 비교용 정규화 — 숫자만 추출 (동일인 판별) */
export function normalizeContactForSync(contact: string): string {
  return (contact || '').replace(/\D/g, '')
}

/** 동일 고객으로 묶을 수 있는 연락처인지 — 연락처없음/빈 값은 서로 다른 고객으로 취급 */
export function isValidContactForSameCustomer(contact: string): boolean {
  const digits = normalizeContactForSync(contact)
  return digits.length >= 9
}

/** DB/입력값을 Enum으로 검증 — 정의되지 않은 값은 '미지정'으로 통일 (검토 필요 분류) */
export function getValidCustomerTier(value: unknown): CustomerTier {
  if (typeof value === 'string' && CUSTOMER_TIER_VALUES.includes(value as CustomerTier)) {
    return value as CustomerTier
  }
  return '미지정'
}

export function parseEstimateHistory(meta: Record<string, unknown> | null | undefined): EstimateHistoryItem[] {
  const raw = meta?.estimate_history
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => e != null && typeof e === 'object')
    .map((e) => ({
      version: typeof e.version === 'number' ? e.version : 0,
      issued_at: typeof e.issued_at === 'string' ? e.issued_at : new Date().toISOString().slice(0, 10),
      amount: typeof e.amount === 'number' ? e.amount : Number(e.amount) || 0,
      summary: typeof e.summary === 'string' ? e.summary : undefined,
      is_final: e.is_final === true,
    }))
    .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
}

/** 대표 금액: 확정 견적 우선, 없으면 최신 견적, 없으면 expected_revenue */
export function getDisplayAmount(history: EstimateHistoryItem[], fallbackRevenue: number): number {
  const final = history.find((e) => e.is_final)
  if (final) return final.amount
  if (history.length > 0) return history[0].amount
  return fallbackRevenue
}

export function getDateRangeStarts(now: number) {
  return {
    thisMonth: startOfMonth(new Date(now)).getTime(),
    '1m': startOfDay(subMonths(new Date(now), 1)).getTime(),
    '3m': startOfDay(subMonths(new Date(now), 3)).getTime(),
    '6m': startOfDay(subMonths(new Date(now), 6)).getTime(),
    '1y': startOfDay(subMonths(new Date(now), 12)).getTime(),
  } as const
}

export function getComparableDateValue(dateString?: string | null, fallbackDate?: string | null): number | null {
  const primary = typeof dateString === 'string' && dateString.trim() ? dateString.trim() : null
  const fallback = typeof fallbackDate === 'string' && fallbackDate.trim() ? fallbackDate.trim() : null
  const source = primary ?? fallback
  if (!source) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(source) ? `${source}T12:00:00.000Z` : source
  const value = new Date(normalized).getTime()
  return Number.isNaN(value) ? null : value
}

export function matchesDateRange(
  value: number | null,
  range: DateRangeKey,
  now: number,
  starts: ReturnType<typeof getDateRangeStarts>,
): boolean {
  if (range === 'all') return true
  if (value == null) return false
  if (range === 'thisMonth') return value >= starts.thisMonth && value <= now
  return value >= starts[range]
}

export function parseDateInputValue(dateString: string | null | undefined, mode: 'start' | 'end'): number | null {
  const trimmed = typeof dateString === 'string' ? dateString.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const suffix = mode === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
  const value = new Date(`${trimmed}${suffix}`).getTime()
  return Number.isNaN(value) ? null : value
}

export function matchesCustomDateRange(
  value: number | null,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  if (!startDate && !endDate) return true
  if (value == null) return false
  const startValue = parseDateInputValue(startDate, 'start')
  const endValue = parseDateInputValue(endDate, 'end')
  if (startValue != null && value < startValue) return false
  if (endValue != null && value > endValue) return false
  return true
}

/** 시공완료·거절·무효 — 활성 리스트에서 제외. 무효=통계 제외, 거절=사유 보존 */
export function isEnded(lead: Lead): boolean {
  if (lead.status === 'AS') return false
  return lead.workflowStage === '시공완료' || lead.status === '거절' || lead.status === '무효'
}

export function normalizeDateSearchQuery(rawQuery: string): string | null {
  const trimmed = rawQuery.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/[./]/g, '-').replace(/\s+/g, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized
  const digits = normalized.replace(/\D/g, '')
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  if (/^\d{6}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`
  return null
}

export function matchesLeadSearch(lead: Lead, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const qDigits = q.replace(/\D/g, '')
  const company = (lead.company ?? '').toLowerCase()
  const displayName = (lead.displayName ?? '').toLowerCase()
  const name = (lead.name ?? '').toLowerCase()
  const projectName = (lead.projectName ?? '').toLowerCase()
  const contactDigits = (lead.contact ?? '').replace(/\D/g, '')
  const normalizedDateQuery = normalizeDateSearchQuery(rawQuery)
  const inboundDate = (lead.inboundDate ?? '').trim().slice(0, 10)
  const updateDate = (lead.updateDate ?? '').trim().slice(0, 10)

  return (
    company.includes(q) ||
    displayName.includes(q) ||
    name.includes(q) ||
    projectName.includes(q) ||
    (qDigits.length > 0 && contactDigits.includes(qDigits)) ||
    (qDigits.length === 4 && contactDigits.endsWith(qDigits)) ||
    (normalizedDateQuery != null &&
      ((inboundDate !== '' && inboundDate.startsWith(normalizedDateQuery)) ||
        (updateDate !== '' && updateDate.startsWith(normalizedDateQuery))))
  )
}

/** 상담 식별자 자동 생성: [YYMM] [상호/성함] [연락처 뒷4자리]. refDate는 상담 생성일(YYMM 고정용). */
export function computeDisplayName(companyOrName: string, contact: string, refDate: Date): string {
  const yymm = `${refDate.getFullYear().toString().slice(-2)}${String(refDate.getMonth() + 1).padStart(2, '0')}`
  const digits = (contact || '').replace(/\D/g, '')
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0').slice(-4) || '0000'
  const namePart = (companyOrName || '').trim() || '상담'
  return `${yymm} ${namePart} ${last4}`
}

export function parseGoogleChatSpaceId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const raw = value.trim()
  const direct = raw.replace(/^spaces\//i, '').trim()
  const urlMatch = direct.match(/\/room\/([^/?#]+)/i)
  const extracted = urlMatch?.[1] ?? direct
  return extracted || undefined
}

/** null·형식 깨짐 방지 — Provider Error 회피 (Supabase 응답 보강) */
export function sanitizeConsultationRow(item: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...item }
  if (typeof safe.id !== 'string') safe.id = safe.id != null ? String(safe.id) : ''
  if (safe.project_name != null && typeof safe.project_name !== 'string') safe.project_name = String(safe.project_name)
  if (safe.created_at != null && typeof safe.created_at !== 'string') {
    const d = safe.created_at
    safe.created_at = (typeof (d as Date)?.toISOString === 'function' ? (d as Date).toISOString() : String(d)) as string
  }
  if (safe.metadata != null && (typeof safe.metadata !== 'object' || Array.isArray(safe.metadata))) safe.metadata = null
  return safe
}

/** metadata 내 company_name, manager_name 우선 → 일반 필드 비어있어도 리스트에 표시 */
export function pickDisplayName(
  topLevel: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  key: 'company_name' | 'manager_name',
  fallback: string,
): string {
  const fromMeta = metadata && typeof metadata[key] === 'string' ? (metadata[key] as string) : ''
  const fromTop = typeof topLevel === 'string' && topLevel.trim() ? topLevel.trim() : ''
  return fromMeta || fromTop || fallback
}

/** consultations 테이블 row → Lead 매핑 (fetch 및 Real-time 업데이트 공용) */
export function mapConsultationRowToLead(item: Record<string, unknown>): Lead {
  const created = (item.created_at as string) || new Date().toISOString()
  const meta = (item.metadata as Record<string, unknown> | null) ?? null
  /** A열(프로젝트명/업체명) → project_name 우선. 구글 시트 구조 매핑 */
  const projectName = typeof item.project_name === 'string' && item.project_name.trim() ? item.project_name.trim() : ''
  const company =
    projectName ||
    pickDisplayName(item.company_name as string | null, meta, 'company_name', '(업체명 없음)')
  const name = pickDisplayName(item.manager_name as string | null, meta, 'manager_name', '(고객명 없음)')
  const contactStr = String(item.contact ?? item.customer_phone ?? '')
  const displayName =
    projectName ||
    (meta && typeof meta.display_name === 'string' && meta.display_name.trim() ? meta.display_name.trim() : '') ||
    computeDisplayName(company, contactStr, new Date(created))
  const goldenTime = getGoldenTimeState(created)
  const isGoldenTime = goldenTime.isGoldenTime
  const regionFromMeta =
    (typeof item.region === 'string' && item.region.trim() ? item.region.trim() : null) ||
    (meta && typeof meta.region === 'string' && meta.region.trim() ? meta.region.trim() : null) ||
    '현장 확인 중'
  const industryFromMeta =
    (meta && typeof meta.industry === 'string' && meta.industry.trim() ? meta.industry.trim() : null) ||
    (typeof item.industry === 'string' && item.industry.trim() ? item.industry.trim() : null) ||
    '기타'
  const painPointFromMeta = meta && typeof meta.pain_point === 'string' ? meta.pain_point : ''
  const requiredDateRaw = meta?.required_date
  const requiredDateDisplay =
    typeof requiredDateRaw === 'string' && requiredDateRaw ? requiredDateRaw.slice(0, 10) : ''
  const customerTierFromMeta = getValidCustomerTier(item.customer_grade ?? meta?.customer_tier)
  const rawStatus = typeof item.status === 'string' ? item.status.trim() : ''
  const statusVal = (rawStatus ? (item.status as Lead['status']) : '접수') ?? '접수'
  const rawStage = meta && typeof meta.workflow_stage === 'string' ? meta.workflow_stage : null
  const workflowStageFromMeta =
    rawStage && CONSULTATION_STAGES.includes(rawStage as ConsultationStage)
      ? (rawStage as ConsultationStage)
      : rawStage === '현장실측'
        ? '견적중'
        : STATUS_TO_STAGE[statusVal] ?? '상담접수'
  const consultationNotes = meta && typeof meta.consultation_notes === 'string' ? meta.consultation_notes.trim() : undefined
  const asRequested =
    (meta && typeof meta.as_requested === 'boolean' ? meta.as_requested : false) ||
    statusVal === 'AS'
  const googleChatUrl =
    (meta && typeof meta.google_chat_url === 'string' && meta.google_chat_url.trim()
      ? meta.google_chat_url.trim()
      : undefined) || (typeof item.link === 'string' && item.link.trim() ? item.link.trim() : undefined)
  const channelChatId =
    (typeof item.channel_chat_id === 'string' && item.channel_chat_id.trim() ? item.channel_chat_id.trim() : undefined) ||
    (meta && typeof meta.space_id === 'string' && meta.space_id.trim() ? meta.space_id.trim() : undefined) ||
    parseGoogleChatSpaceId(googleChatUrl)
  const googleChatPending = meta && typeof meta.google_chat_pending === 'boolean' ? meta.google_chat_pending : false
  const historySummary =
    meta && typeof meta.history_summary === 'string' && meta.history_summary.trim()
      ? meta.history_summary.trim()
      : undefined
  // 인입일: start_date(구글시트 시작일) 우선, YYYY-MM-DD 형식
  const rawStart = item.start_date
  const startDateStr =
    rawStart != null && typeof rawStart === 'string' && rawStart.trim()
      ? rawStart.trim().slice(0, 10)
      : null
  const isMigrationRecord =
    meta != null && typeof meta.source === 'string' && meta.source.startsWith('google_chat')
  const inboundDate =
    startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)
      ? startDateStr
      : (meta && typeof meta.inbound_date === 'string' && meta.inbound_date.trim())
        ? meta.inbound_date.trim().slice(0, 10)
        : isMigrationRecord
          ? null
          : created.slice(0, 10)
  const estimateHistory = parseEstimateHistory(meta)
  const expectedRevenueNum = Number(item.estimate_amount ?? item.expected_revenue ?? 0)
  const displayAmount = getDisplayAmount(estimateHistory, expectedRevenueNum)
  const finalAmount =
    meta != null && typeof meta.final_amount === 'number' && meta.final_amount > 0 ? meta.final_amount : null
  const source = meta && typeof meta.source === 'string' ? meta.source : undefined
  const orderNumber = meta && typeof meta.order_number === 'string' ? meta.order_number : undefined
  const isMarketOrder =
    meta && typeof meta.is_market_order === 'boolean'
      ? meta.is_market_order
      : source ? isMarketSource(source) : false
  const measurementStatus = meta && MEASUREMENT_STATUSES.includes(meta.measurement_status as MeasurementStatus)
    ? (meta.measurement_status as MeasurementStatus)
    : undefined
  const measurementAssignee = meta && typeof meta.measurement_assignee === 'string' ? meta.measurement_assignee : undefined
  const measurementScheduledDate = meta && typeof meta.measurement_scheduled_date === 'string' ? meta.measurement_scheduled_date.slice(0, 10) : undefined
  const measurementDimensionMemo = meta && typeof meta.measurement_dimension_memo === 'string' ? meta.measurement_dimension_memo : undefined
  const measurementPhotos = meta && Array.isArray(meta.measurement_photos)
    ? (meta.measurement_photos as unknown[]).filter((u): u is string => typeof u === 'string')
    : undefined
  const measurementConstructionNotes = meta && typeof meta.measurement_construction_notes === 'string' ? meta.measurement_construction_notes : undefined
  const measurementDrawingPath = meta && typeof meta.measurement_drawing_path === 'string' ? meta.measurement_drawing_path : undefined
  const rawAi = meta?.ai_suggestions
  const aiSuggestions =
    rawAi && typeof rawAi === 'object' && !Array.isArray(rawAi)
      ? {
        company_name: typeof (rawAi as Record<string, unknown>).company_name === 'string' ? (rawAi as Record<string, unknown>).company_name as string : undefined,
        space_size: typeof (rawAi as Record<string, unknown>).space_size === 'number' ? (rawAi as Record<string, unknown>).space_size as number : undefined,
        industry: typeof (rawAi as Record<string, unknown>).industry === 'string' ? (rawAi as Record<string, unknown>).industry as string : undefined,
      }
      : undefined
  const hasAiSuggestions = aiSuggestions && (aiSuggestions.company_name ?? aiSuggestions.space_size ?? aiSuggestions.industry)
  const showroomImageUrl = meta && typeof meta.showroom_image_url === 'string' && meta.showroom_image_url.trim() ? meta.showroom_image_url.trim() : undefined
  const showroomSiteName = meta && typeof meta.showroom_site_name === 'string' ? meta.showroom_site_name : undefined
  const showroomCategory = meta && typeof meta.showroom_category === 'string' ? meta.showroom_category : undefined
  const showroomContext = meta && typeof meta.showroom_context === 'string' && meta.showroom_context.trim() ? meta.showroom_context.trim() : undefined
  const showroomEntryLabel = meta && typeof meta.showroom_entry_label === 'string' && meta.showroom_entry_label.trim() ? meta.showroom_entry_label.trim() : undefined
  const rawUpdate = item.update_date
  const updateDate =
    rawUpdate == null
      ? null
      : typeof rawUpdate === 'string' && rawUpdate.trim()
        ? rawUpdate.trim().slice(0, 10)
        : typeof (rawUpdate as Date)?.toISOString === 'function'
          ? (rawUpdate as Date).toISOString().slice(0, 10)
          : null
  const updateDateNorm = updateDate && /^\d{4}-\d{2}-\d{2}$/.test(updateDate) ? updateDate : null
  return {
    id: String(item.id ?? ''),
    name,
    company,
    displayName,
    industry: industryFromMeta,
    industryType: 'other',
    area: typeof meta?.area_sqm === 'number' ? meta.area_sqm : 0,
    region: regionFromMeta,
    requiredDate: requiredDateDisplay,
    painPoint: painPointFromMeta,
    contact: String(item.contact ?? item.customer_phone ?? ''),
    customerTier: customerTierFromMeta,
    priority: 'medium',
    priorityScore: 50,
    time: formatDistanceToNow(new Date(created), { addSuffix: true, locale: ko }),
    createdAt: created,
    isGoldenTime,
    goldenTimeTier: goldenTime.tier,
    goldenTimeDeadlineSoon: goldenTime.isDeadlineSoon,
    goldenTimeElapsedDays: goldenTime.elapsedDays,
    status: statusVal,
    workflowStage: workflowStageFromMeta,
    asRequested,
    google_chat_url: googleChatUrl,
    channelChatId,
    consultation_notes: consultationNotes,
    google_chat_pending: googleChatPending,
    history_summary: historySummary,
    inboundDate,
    updateDate: updateDateNorm,
    projectName: projectName || undefined,
    source,
    orderNumber,
    isMarketOrder,
    measurementStatus,
    measurementAssignee,
    measurementScheduledDate,
    measurementDimensionMemo,
    measurementPhotos,
    measurementConstructionNotes,
    measurementDrawingPath,
    pinned: meta && meta.pinned === true ? true : undefined,
    metadata: meta ?? undefined,
    aiSuggestions: hasAiSuggestions ? aiSuggestions : undefined,
    showroomImageUrl,
    showroomSiteName,
    showroomCategory,
    showroomContext,
    showroomEntryLabel,
    expectedRevenue: expectedRevenueNum,
    estimateHistory,
    displayAmount,
    finalAmount,
    interestLevel: 'Medium',
    marketingStatus: false,
    lastViewedAt: (item.last_viewed_at as string | null) ?? null,
  }
}

/** 최종업데이트일 표시: update_date → '오늘'|'어제'|'n일 전'|YYYY-MM-DD */
export function formatUpdateDateDisplay(updateDate: string | null | undefined): string {
  if (!updateDate || typeof updateDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updateDate.trim().slice(0, 10))) return '—'
  const d = updateDate.trim().slice(0, 10)
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  if (d === todayStr) return '오늘'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  if (d === yesterdayStr) return '어제'
  const updMs = new Date(d + 'T12:00:00.000Z').getTime()
  const diffDays = Math.floor((Date.now() - updMs) / 86400000)
  if (diffDays >= 2 && diffDays <= 30) return `${diffDays}일 전`
  return d
}

/** 방치 일수 계산: 오늘 - update_date (일 단위). update_date 없으면 -1 */
export function getNeglectDays(updateDate: string | null | undefined): number {
  if (!updateDate || typeof updateDate !== 'string') return -1
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const update = new Date(updateDate.slice(0, 10))
  update.setHours(0, 0, 0, 0)
  const ms = today.getTime() - update.getTime()
  return ms < 0 ? 0 : Math.floor(ms / 86400000)
}

/** 방치 D-Day 표시: update_date 기준. 0이면 '오늘 업데이트', 1일 이상이면 'D+n' (실무자 즉각 대응용) */
export function getNeglectDDisplay(updateDate: string | null | undefined): { text: string; days: number } | null {
  const days = getNeglectDays(updateDate)
  if (days < 0) return null
  return {
    text: days === 0 ? '오늘 업데이트' : `D+${days}`,
    days,
  }
}

export function getReactivationSignal(
  status: Lead['status'],
  workflowStage: ConsultationStage,
  updateDate: string | null | undefined,
): { days: number; label: string; title: string } | null {
  const days = getNeglectDays(updateDate)
  if (days < 0 || days > REACTIVATION_WINDOW_DAYS) return null
  if (status === '완료' && workflowStage === '시공완료') {
    return {
      days,
      label: days === 0 ? '오늘 재활동' : '종료 후 활동',
      title:
        days === 0
          ? '완료 카드에서 오늘 새 활동이 감지되었습니다. 상태 변경 필요 여부를 확인하세요.'
          : `완료 카드에서 최근 ${days}일 내 활동이 감지되었습니다. 상태 변경 필요 여부를 확인하세요.`,
    }
  }
  if (status === '거절') {
    return {
      days,
      label: days === 0 ? '오늘 재문의' : '거절 후 재문의',
      title:
        days === 0
          ? '거절 카드에서 오늘 새 활동이 감지되었습니다. 새 상담 재개 여부를 확인하세요.'
          : `거절 카드에서 최근 ${days}일 내 활동이 감지되었습니다. 같은 채팅방 재문의인지 확인하세요.`,
    }
  }
  return null
}

/** 연락처 표시: 010-1234-5678 전체 노출 (실전에서 바로 전화) */
export function formatContact(contact: string): string {
  const digits = contact.replace(/\D/g, '')
  if (digits.length < 8) return contact
  if (digits.length >= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  return `${digits.slice(0, 3)}-${digits.slice(3)}`
}

/** 연락처 입력용 자동 하이픈 포맷 — 숫자만 허용, 최대 11자리 → 010-1234-5678(13자) */
export function formatContactInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

/**
 * 오픈마켓 신규 주문 알림은 서버사이드에서만 전송해야 한다.
 * 웹훅 URL을 브라우저에 두지 않도록 프론트에서는 비활성화한다.
 */
export function notifyMarketOrderRegistered(
  _source: string,
  _companyName?: string,
  _orderNumber?: string
): void {
  if (import.meta.env.DEV) {
    console.warn('오픈마켓 주문 알림은 클라이언트에서 비활성화되었습니다. 서버사이드 웹훅 릴레이가 필요합니다.')
  }
}
