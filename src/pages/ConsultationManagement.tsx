import React, { Suspense, lazy, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { RefreshCw, Zap, Phone, Copy, User, Images, MessageCircle, Pencil, Loader2, Search, FileText, CheckCircle, Ruler, Trash2, EyeOff, Star, Pin, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getGoldenTimeState, getElapsedDays, type GoldenTimeTier } from '@/lib/utils/dateUtils'

// 팝업(Dialog) — JOURNAL: 팝업 버그 해결용 open/onOpenChange 단일 연동
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CONSULTATION_INDUSTRY_OPTIONS } from '@/data/referenceCases'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subMonths, startOfMonth, startOfDay } from 'date-fns'
import type { EstimateFormProps } from '@/components/estimate/EstimateForm'
import { computeProposalTotals, computeFinalTotals, createEmptyRow, type EstimateFormData, type EstimateFormHandle } from '@/components/estimate/estimateFormShared'
import { insertSystemLog } from '@/lib/activityLog'
import { isValidUUID } from '@/lib/uuid'
import type { OrderDocument } from '@/types/orderDocument'
import type { ConsultationEstimateFile } from '@/types/consultationEstimateFile'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

const EstimateForm = lazy(async () => ({ default: (await import('@/components/estimate/EstimateForm')).EstimateForm })) as unknown as React.ForwardRefExoticComponent<
  EstimateFormProps & React.RefAttributes<EstimateFormHandle>
>
const ProposalPreviewContent = lazy(async () => ({ default: (await import('@/components/estimate/EstimateForm')).ProposalPreviewContent as React.ComponentType<any> }))
const FinalEstimatePreviewContent = lazy(async () => ({ default: (await import('@/components/estimate/EstimateForm')).FinalEstimatePreviewContent as React.ComponentType<any> }))
const ConsultationHistoryTab = lazy(async () => ({ default: (await import('@/components/Consultation/ConsultationHistoryTab')).ConsultationHistoryTab as React.ComponentType<any> }))
const ConsultationMeasurementTab = lazy(async () => ({ default: (await import('@/components/Consultation/ConsultationMeasurementTab')).ConsultationMeasurementTab as React.ComponentType<any> }))
const ConsultationEstimateTab = lazy(async () => ({ default: (await import('@/components/Consultation/ConsultationEstimateTab')).ConsultationEstimateTab as React.ComponentType<any> }))

// PC 사무용: 컴팩트 (48px 규칙 미적용)
const INPUT_CLASS = 'h-10 text-sm'
const BUTTON_SUBMIT_CLASS = 'h-9 w-full text-sm font-semibold'

function LazySectionFallback({ label = '화면을 불러오는 중...' }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {label}
    </div>
  )
}

/** 인입채널 옵션(9종) — consultations.metadata.source에 저장. 기본값 채널톡으로 오입력 방지 */
const CONSULT_SOURCES = [
  { value: '채널톡', label: '채널톡' },
  { value: '쇼룸', label: '쇼룸' },
  { value: '전화', label: '전화' },
  { value: '소개', label: '소개' },
  { value: '네이버', label: '네이버' },
  { value: '쿠팡', label: '쿠팡' },
  { value: '유튜브', label: '유튜브' },
  { value: '블로그', label: '블로그' },
  { value: 'SNS', label: 'SNS' },
  { value: '기타', label: '기타' },
] as const

/** 실측 PDF 도면 전용 Storage 버킷 (시공사례 뱅크·Cloudinary와 격리) */
const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'

/** 실측(Measurement) 상태 — 해당없음이면 카드에서 배지 미표시 */
const MEASUREMENT_STATUSES = ['실측필요', '실측완료', '실측해당없음'] as const
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number]

/** 오픈마켓 인입 채널 — 주문번호 입력·is_market_order·마켓 배지 적용 (인입채널 9종 중 네이버·쿠팡) */
const OPEN_MARKET_SOURCES = ['네이버', '쿠팡'] as const
function isMarketSource(source: string): boolean {
  return OPEN_MARKET_SOURCES.includes(source as (typeof OPEN_MARKET_SOURCES)[number])
}

/** 마켓/채널별 배지 스타일 (1행 좌측). 기존 데이터 호환용 네이버 스토어 등 유지 */
const MARKET_BADGE_STYLE: Record<string, { label: string; className: string }> = {
  '네이버': { label: '네이버', className: 'bg-[#03C75A]/20 text-[#03C75A] dark:bg-[#03C75A]/25 dark:text-[#03C75A] ring-1 ring-[#03C75A]/40' },
  '쿠팡': { label: '쿠팡', className: 'bg-red-500/20 text-red-600 dark:bg-red-400/90 ring-1 ring-red-500/40' },
  '네이버 스토어': { label: '네이버스토어', className: 'bg-[#03C75A]/20 text-[#03C75A] dark:bg-[#03C75A]/25 dark:text-[#03C75A] ring-1 ring-[#03C75A]/40' },
  '오늘의집': { label: '오늘의집', className: 'bg-teal-500/20 text-teal-700 dark:text-teal-400 ring-1 ring-teal-500/40' },
  '자사몰': { label: '자사몰', className: 'bg-violet-500/20 text-violet-700 dark:text-violet-400 ring-1 ring-violet-500/40' },
}

const CUSTOMER_TIERS = [
  { value: '신규', label: '신규' },
  { value: '단골', label: '단골' },
  { value: '파트너', label: '파트너' },
  { value: '조심', label: '조심' },
  { value: '미지정', label: '미지정 (검토 필요)' },
] as const
export type CustomerTier = (typeof CUSTOMER_TIERS)[number]['value']

const CUSTOMER_TIER_VALUES: CustomerTier[] = CUSTOMER_TIERS.map((t) => t.value)

/** 등급 우선순위 (높을수록 상위) — 동일 연락처 동기화 시 하향 조정 금지 */
const CUSTOMER_TIER_RANK: Record<CustomerTier, number> = {
  미지정: 0,
  신규: 1,
  조심: 2,
  단골: 3,
  파트너: 4,
}

/** 여러 등급 중 가장 높은 등급 반환 (동일 연락처 동기화용) */
function getHighestTier(tiers: CustomerTier[]): CustomerTier {
  if (tiers.length === 0) return '신규'
  return tiers.reduce((a, b) => (CUSTOMER_TIER_RANK[a] >= CUSTOMER_TIER_RANK[b] ? a : b))
}

/** 연락처 비교용 정규화 — 숫자만 추출 (동일인 판별) */
function normalizeContactForSync(contact: string): string {
  return (contact || '').replace(/\D/g, '')
}

/** 동일 고객으로 묶을 수 있는 연락처인지 — 연락처없음/빈 값은 서로 다른 고객으로 취급 */
function isValidContactForSameCustomer(contact: string): boolean {
  const digits = normalizeContactForSync(contact)
  return digits.length >= 9
}

/** DB/입력값을 Enum으로 검증 — 정의되지 않은 값은 '미지정'으로 통일 (검토 필요 분류) */
function getValidCustomerTier(value: unknown): CustomerTier {
  if (typeof value === 'string' && CUSTOMER_TIER_VALUES.includes(value as CustomerTier)) {
    return value as CustomerTier
  }
  return '미지정'
}

/**
 * 지능형 등급 제안 (Mock) — 업체명·메모 키워드로 적절한 등급 추천.
 * 신규 등록·마이그레이션 시 추천용. 예: '초등학교' 포함 → 교육기관 성격으로 신규 제안.
 */
export function suggestCategory(companyName: string, painPoint?: string): CustomerTier {
  const text = `${companyName ?? ''} ${painPoint ?? ''}`.toLowerCase()
  if (/조심|주의|이슈/.test(text)) return '조심'
  if (/파트너|제휴|협력/.test(text)) return '파트너'
  if (/단골|재계약|재방문/.test(text)) return '단골'
  if (/초등학교|중학교|고등학교|학원|학교|교육|대학|교습소|독서실/.test(text)) return '신규'
  return '미지정'
}

/** 상담 4단계 워크플로우 (표준) — 현장실측 제거 */
export const CONSULTATION_STAGES = ['상담접수', '견적중', '계약완료', '시공완료'] as const
export type ConsultationStage = (typeof CONSULTATION_STAGES)[number]

/** 견적 이력 한 건 — metadata.estimate_history[] 항목 */
export interface EstimateHistoryItem {
  version: number
  issued_at: string // ISO
  amount: number
  summary?: string
  is_final: boolean
}

function parseEstimateHistory(meta: Record<string, unknown> | null | undefined): EstimateHistoryItem[] {
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
function getDisplayAmount(history: EstimateHistoryItem[], fallbackRevenue: number): number {
  const final = history.find((e) => e.is_final)
  if (final) return final.amount
  if (history.length > 0) return history[0].amount
  return fallbackRevenue
}

/** status → workflow_stage 매핑 (metadata.workflow_stage 없을 때) */
const STATUS_TO_STAGE: Record<string, ConsultationStage> = {
  접수: '상담접수',
  견적: '견적중',
  진행: '계약완료',
  완료: '시공완료',
  AS: '시공완료',
  거절: '시공완료',
  무효: '시공완료',
  // 레거시 값 호환 (DB 마이그레이션 전 데이터)
  상담중: '상담접수',
  견적발송: '견적중',
  계약완료: '계약완료',
  휴식기: '시공완료',
  시공완료: '시공완료',
  AS_WAITING: '시공완료',
  신규: '상담접수',
}

const LIST_PAGE_SIZE = 40
/** 업무 단계별 탭 — 영업 사원 우선순위 파악용 */
type ListTab = '전체' | '미처리' | '견적중' | '진행중' | '종료' | '거절' | '무효'
type DateRangeKey = 'all' | 'thisMonth' | '1m' | '3m' | '6m' | '1y'
type CustomDateTarget = 'inbound' | 'update'

const DATE_RANGE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: '전체 기간' },
  { value: 'thisMonth', label: '이번달' },
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '6m', label: '최근 6개월' },
  { value: '1y', label: '최근 1년' },
]

function getDateRangeStarts(now: number) {
  return {
    thisMonth: startOfMonth(new Date(now)).getTime(),
    '1m': startOfDay(subMonths(new Date(now), 1)).getTime(),
    '3m': startOfDay(subMonths(new Date(now), 3)).getTime(),
    '6m': startOfDay(subMonths(new Date(now), 6)).getTime(),
    '1y': startOfDay(subMonths(new Date(now), 12)).getTime(),
  } as const
}

function getComparableDateValue(dateString?: string | null, fallbackDate?: string | null): number | null {
  const primary = typeof dateString === 'string' && dateString.trim() ? dateString.trim() : null
  const fallback = typeof fallbackDate === 'string' && fallbackDate.trim() ? fallbackDate.trim() : null
  const source = primary ?? fallback
  if (!source) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(source) ? `${source}T12:00:00.000Z` : source
  const value = new Date(normalized).getTime()
  return Number.isNaN(value) ? null : value
}

function matchesDateRange(
  value: number | null,
  range: DateRangeKey,
  now: number,
  starts: ReturnType<typeof getDateRangeStarts>
): boolean {
  if (range === 'all') return true
  if (value == null) return false
  if (range === 'thisMonth') return value >= starts.thisMonth && value <= now
  return value >= starts[range]
}

function parseDateInputValue(dateString: string | null | undefined, mode: 'start' | 'end'): number | null {
  const trimmed = typeof dateString === 'string' ? dateString.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const suffix = mode === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
  const value = new Date(`${trimmed}${suffix}`).getTime()
  return Number.isNaN(value) ? null : value
}

function matchesCustomDateRange(
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
function isEnded(lead: Lead): boolean {
  if (lead.status === 'AS') return false
  return lead.workflowStage === '시공완료' || lead.status === '거절' || lead.status === '무효'
}

interface Lead {
  id: string
  name: string
  company: string
  industry: string
  industryType: 'school' | 'academy' | 'cafe' | 'office' | 'other'
  area: number
  region: string
  requiredDate: string
  painPoint: string
  contact: string // 010-1234-5678 등
  customerTier: CustomerTier
  priority: 'high' | 'medium' | 'low'
  priorityScore: number
  time: string
  createdAt: string // ISO, 타임라인용
  isGoldenTime: boolean
  /** 골든타임 3단계: D+0~7 urgent, D+8~20 progress, D+21~30 deadline, 30일 초과 시 null */
  goldenTimeTier?: GoldenTimeTier
  /** D+27(종료 3일 전) 시 담당자 알림 트리거용 */
  goldenTimeDeadlineSoon?: boolean
  /** created_at 기준 경과 일수 */
  goldenTimeElapsedDays?: number
  status: '접수' | '견적' | '진행' | '완료' | 'AS' | '거절' | '무효'
  /** 4단계 상담 흐름 (카드 프로그레스 바용) */
  workflowStage: ConsultationStage
  /** AS 요청 여부 (metadata.as_requested 또는 로컬 표시용) */
  asRequested?: boolean
  /** 구글챗 스페이스 대화방 URL (metadata.google_chat_url). 예: https://chat.google.com/room/AAAA... */
  google_chat_url?: string
  /** consultations.channel_chat_id 또는 구글챗 URL에서 파싱한 스페이스 ID */
  channelChatId?: string
  /** 상담 메모 (metadata.consultation_notes) — 핵심 내용·AI 요약 보관 */
  consultation_notes?: string
  /** 구글챗 스페이스 생성 대기 중 (metadata.google_chat_pending). URL 없을 때만 상태 C 표시 */
  google_chat_pending?: boolean
  /** AI 히스토리 요약 (metadata.history_summary). 구글챗 분석 결과, Read-only·AI 전용 업데이트 */
  history_summary?: string
  /** 인입일 YYYY-MM-DD (start_date 기반, 표시용). 마이그레이션 레코드 등 인입일 미설정 시 null */
  inboundDate: string | null
  /** 업데이트일 YYYY-MM-DD (update_date, 방치 기간 계산용) */
  updateDate?: string | null
  /** 인입 채널 (metadata.source). 오픈마켓 시 마켓 배지 표시 */
  source?: string
  /** 오픈마켓 주문번호 (metadata.order_number) */
  orderNumber?: string
  /** 오픈마켓 주문 여부 — 마켓 수수료 제외 정산 계산 등 마케팅 자동화용 */
  isMarketOrder?: boolean
  /** 실측 상태 (metadata.measurement_status). 해당없음이면 UI 강조 안 함 */
  measurementStatus?: MeasurementStatus
  /** 실측 담당자 (metadata.measurement_assignee) */
  measurementAssignee?: string
  /** 실측 예정일 YYYY-MM-DD (metadata.measurement_scheduled_date) */
  measurementScheduledDate?: string
  /** 현장 치수 메모 (metadata.measurement_dimension_memo) */
  measurementDimensionMemo?: string
  /** 실측 사진 URL 목록 (metadata.measurement_photos) */
  measurementPhotos?: string[]
  /** 시공 유의사항 (metadata.measurement_construction_notes) */
  measurementConstructionNotes?: string
  /** 실측 PDF 도면 Storage 경로 (metadata.measurement_drawing_path) — 내부용, Signed URL로만 노출 */
  measurementDrawingPath?: string
  /** 상단 고정 여부 (metadata.pinned) */
  pinned?: boolean
  /** Supabase metadata 병합용 (단계 변경 시 업데이트) */
  metadata?: Record<string, unknown>
  expectedRevenue: number
  /** 견적 이력 (버전·발행일·금액·요약·확정여부) — metadata.estimate_history */
  estimateHistory: EstimateHistoryItem[]
  /** 카드/패널 대표 금액: 확정 견적 → 최신 견적 → expected_revenue */
  displayAmount: number
  /** 확정견적 금액(VAT 포함). FINAL 견적서가 있을 때만 설정, ReadOnly·견적 확정으로만 변경 */
  finalAmount: number | null
  interestLevel: 'High' | 'Medium' | 'Low'
  marketingStatus: boolean
  /** 구글챗 스타일 식별자: [YYMM] [상호/성함] [연락처 뒷4자리] (metadata.display_name 또는 자동 계산) */
  displayName: string
  /** 구글 시트 연동용: consultations.project_name (업체명). 최종 확정 시 시트 행 갱신에 사용 */
  projectName?: string
  /** AI가 대화에서 추출한 제안 — 수동 승인 후에만 실제 필드에 반영 (metadata.ai_suggestions) */
  aiSuggestions?: { company_name?: string; space_size?: number; industry?: string }
  /** 마지막 확인 시각(ISO); 읽지 않은 새 메시지 알람 판단용 */
  lastViewedAt?: string | null
  /** 쇼룸 시공사례에서 문의 시 저장 — 관리자 문의 확인 시 어떤 사진 보고 들어왔는지 표시 */
  showroomImageUrl?: string
  showroomSiteName?: string
  showroomCategory?: string
  showroomContext?: string
  showroomEntryLabel?: string
}

function normalizeDateSearchQuery(rawQuery: string): string | null {
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

function matchesLeadSearch(lead: Lead, rawQuery: string): boolean {
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
function computeDisplayName(companyOrName: string, contact: string, refDate: Date): string {
  const yymm = `${refDate.getFullYear().toString().slice(-2)}${String(refDate.getMonth() + 1).padStart(2, '0')}`
  const digits = (contact || '').replace(/\D/g, '')
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0').slice(-4) || '0000'
  const namePart = (companyOrName || '').trim() || '상담'
  return `${yymm} ${namePart} ${last4}`
}

function parseGoogleChatSpaceId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const raw = value.trim()
  const direct = raw.replace(/^spaces\//i, '').trim()
  const urlMatch = direct.match(/\/room\/([^/?#]+)/i)
  const extracted = urlMatch?.[1] ?? direct
  return extracted || undefined
}

/** null·형식 깨짐 방지 — Provider Error 회피 (Supabase 응답 보강) */
function sanitizeConsultationRow(item: Record<string, unknown>): Record<string, unknown> {
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

/** consultations 테이블 row → Lead 매핑 (fetch 및 Real-time 업데이트 공용) */
function mapConsultationRowToLead(item: Record<string, unknown>): Lead {
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
function formatUpdateDateDisplay(updateDate: string | null | undefined): string {
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
function getNeglectDays(updateDate: string | null | undefined): number {
  if (!updateDate || typeof updateDate !== 'string') return -1
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const update = new Date(updateDate.slice(0, 10))
  update.setHours(0, 0, 0, 0)
  const ms = today.getTime() - update.getTime()
  return ms < 0 ? 0 : Math.floor(ms / 86400000)
}

/** 방치 D-Day 표시: update_date 기준. 0이면 '오늘 업데이트', 1일 이상이면 'D+n' (실무자 즉각 대응용) */
function getNeglectDDisplay(updateDate: string | null | undefined): { text: string; days: number } | null {
  const days = getNeglectDays(updateDate)
  if (days < 0) return null
  return {
    text: days === 0 ? '오늘 업데이트' : `D+${days}`,
    days,
  }
}

const REACTIVATION_WINDOW_DAYS = 7

function getReactivationSignal(
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
function formatContact(contact: string): string {
  const digits = contact.replace(/\D/g, '')
  if (digits.length < 8) return contact
  if (digits.length >= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  return `${digits.slice(0, 3)}-${digits.slice(3)}`
}

/** 연락처 입력용 자동 하이픈 포맷 — 숫자만 허용, 최대 11자리 → 010-1234-5678(13자) */
function formatContactInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

/** metadata 내 company_name, manager_name 우선 → 일반 필드 비어있어도 리스트에 표시 */
function pickDisplayName(
  topLevel: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  key: 'company_name' | 'manager_name',
  fallback: string
): string {
  const fromMeta = metadata && typeof metadata[key] === 'string' ? (metadata[key] as string) : ''
  const fromTop = typeof topLevel === 'string' && topLevel.trim() ? topLevel.trim() : ''
  return fromMeta || fromTop || fallback
}

/**
 * 오픈마켓 신규 주문 알림은 서버사이드에서만 전송해야 한다.
 * 웹훅 URL을 브라우저에 두지 않도록 프론트에서는 비활성화한다.
 */
function notifyMarketOrderRegistered(
  _source: string,
  _companyName?: string,
  _orderNumber?: string
): void {
  if (import.meta.env.DEV) {
    console.warn('오픈마켓 주문 알림은 클라이언트에서 비활성화되었습니다. 서버사이드 웹훅 릴레이가 필요합니다.')
  }
}

/**
 * 실측 리마인더는 서버사이드 스케줄러에서 전송해야 한다.
 * 클라이언트에 웹훅 URL을 두지 않도록 프론트에서는 no-op 처리한다.
 */
export function notifyMeasurementReminder(
  _companyName: string,
  _assignee?: string,
  _scheduledDate?: string
): void {
  if (import.meta.env.DEV) {
    console.warn('실측 리마인더는 클라이언트에서 비활성화되었습니다. 서버사이드 스케줄러가 필요합니다.')
  }
}

/** 인입채널 배지 공통 스타일 — 2행 맨 앞 고정, 오픈마켓/일반 통일(동일 크기·라운드·링) */
const INFLOW_BADGE_BASE = 'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-black/10 dark:ring-white/10'

function MarketSourceBadge({ source }: { source: string }) {
  const style = MARKET_BADGE_STYLE[source]
  if (!style) return null
  return (
    <span className={`${INFLOW_BADGE_BASE} ${style.className}`} title={`인입: ${source}`}>
      {style.label}
    </span>
  )
}

/** 인입채널 배지 — 2행 가장 왼쪽에 단일 배지로 표시. 오픈마켓=마켓 색상, 그 외=중립 배지(시각 통일) */
function SourceChannelBadge({ source }: { source?: string }) {
  if (!source || !source.trim()) return null
  if (isMarketSource(source)) return <MarketSourceBadge source={source} />
  return (
    <span className={`${INFLOW_BADGE_BASE} bg-slate-200/80 text-slate-700 dark:bg-slate-600/50 dark:text-slate-300`} title={`인입: ${source}`}>
      {source}
    </span>
  )
}

/** 실측 상태 배지 — 실측필요(주황) / 실측완료(녹색). 실측해당없음이면 미표시 */
function _MeasurementStatusBadge({ status }: { status: MeasurementStatus }) {
  if (status === '실측해당없음') return null
  const isDone = status === '실측완료'
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${isDone ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-amber-500/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40'
        }`}
      title={isDone ? '실측 완료' : '실측 필요'}
    >
      <Ruler className="h-2.5 w-2.5" />
      {isDone ? '실측완료' : '실측필요'}
    </span>
  )
}

/** 고객 등급 뱃지 — 조심 빨강, 미지정(검토 필요) 주황 강조 (PC 컴팩트) */
function CustomerTierBadge({ tier }: { tier: CustomerTier }) {
  const isCaution = tier === '조심'
  const needsReview = tier === '미지정'
  return (
    <span
      className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold shrink-0 ${isCaution
        ? 'bg-red-500/25 text-red-700 dark:text-red-400 ring-1 ring-red-500/40'
        : needsReview
          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30'
          : tier === '파트너'
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
            : tier === '단골'
              ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
              : 'bg-muted text-muted-foreground'
        }`}
    >
      {tier}
    </span>
  )
}

/** 업체명 첫 글자 → 컬러 이니셜 아바타용 배경 클래스 */
const INITIAL_AVATAR_COLORS = [
  'bg-blue-500 text-white',
  'bg-emerald-500 text-white',
  'bg-violet-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-cyan-500 text-white',
] as const
function _initialAvatarClass(companyName: string): string {
  if (!companyName || companyName === '(업체명 없음)') return 'bg-muted text-muted-foreground'
  const n = companyName.charCodeAt(0) + (companyName.length * 7)
  return INITIAL_AVATAR_COLORS[Math.abs(n) % INITIAL_AVATAR_COLORS.length]
}

/** 상담 카드용 상태 칩 — 실측대기(주황), 견적완료(초록), 계약(파랑) 등 */
function _StatusStageChip({ item }: { item: Lead }) {
  const measurementWaiting = item.measurementStatus === '실측필요'
  const stage = item.workflowStage
  if (measurementWaiting) {
    return (
      <span className="shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30">
        실측대기
      </span>
    )
  }
  const config: Record<ConsultationStage, { label: string; className: string }> = {
    상담접수: { label: '상담접수', className: 'bg-muted text-muted-foreground' },
    견적중: { label: '견적중', className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30' },
    계약완료: { label: '계약', className: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30' },
    시공완료: { label: '시공완료', className: 'bg-violet-500/20 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30' },
  }
  const { label, className } = config[stage]
  return (
    <span className={cn('shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium', className)}>
      {label}
    </span>
  )
}

/** 상태 바 7종 — 접수|견적|계약(실행/진행중)|완료|AS|무효|거절. 활성 버튼 눈에 띄게 강조 */
export type StageBarValue = '상담접수' | '견적중' | '계약완료' | '시공완료' | 'AS' | '무효' | '거절'
const STAGE_BAR_OPTIONS: Array<{
  key: StageBarValue
  label: string
  activeClass: string
  title?: string
}> = [
    { key: '상담접수', label: '접수', activeClass: 'bg-blue-500/20 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300 ring-1 ring-blue-500/40' },
    { key: '견적중', label: '견적', activeClass: 'bg-orange-500/20 text-orange-700 dark:bg-orange-500/25 dark:text-orange-300 ring-1 ring-orange-500/40' },
    { key: '계약완료', label: '진행', activeClass: 'bg-green-500/20 text-green-700 dark:bg-green-500/25 dark:text-green-300 ring-1 ring-green-500/40', title: '실행/진행중 (프로젝트 공식 시작)' },
    { key: '시공완료', label: '완료', activeClass: 'bg-purple-500/20 text-purple-700 dark:bg-purple-500/25 dark:text-purple-300 ring-1 ring-purple-500/40' },
    { key: 'AS', label: 'AS', activeClass: 'bg-red-500/20 text-red-700 dark:bg-red-500/25 dark:text-red-300 ring-1 ring-red-500/40' },
    { key: '무효', label: '무효', activeClass: 'bg-gray-500/20 text-gray-700 dark:bg-gray-500/25 dark:text-gray-300 ring-1 ring-gray-500/40' },
    { key: '거절', label: '거절', activeClass: 'bg-slate-500/20 text-slate-700 dark:bg-slate-500/25 dark:text-slate-300 ring-1 ring-slate-500/40' },
  ]

/** 현재 활성 상태 바 값 — AS, 거절/무효 그대로, 그 외 workflowStage */
function getStageBarValue(item: Lead): StageBarValue {
  if (item.status === 'AS') return 'AS'
  if (item.status === '거절') return '거절'
  if (item.status === '무효') return '무효'
  return item.workflowStage
}

/** 7개 텍스트 버튼 상태 바 — 무효/거절 클릭 시 각각 onInvalidClick / onCancelClick */
function StageProgressBar({
  item,
  onStageChange,
  onAsClick,
  onInvalidClick,
  onCancelClick,
  showReactivationSignal = false,
}: {
  item: Lead
  onStageChange: (stage: ConsultationStage) => void
  onAsClick: () => void
  onInvalidClick: () => void
  onCancelClick: () => void
  showReactivationSignal?: boolean
}) {
  const current = getStageBarValue(item)

  return (
    <div className="inline-flex items-center gap-0.5 shrink-0 flex-nowrap" onClick={(e) => e.stopPropagation()}>
      {STAGE_BAR_OPTIONS.map(({ key, label, activeClass, title }) => {
        const isActive = current === key
        return (
          <button
            key={key}
            type="button"
            title={showReactivationSignal && isActive && (key === '시공완료' || key === '거절') ? '최근 재활동이 감지되었습니다.' : (title ?? key)}
            onClick={(e) => {
              e.stopPropagation()
              if (key === '무효') onInvalidClick()
              else if (key === '거절') onCancelClick()
              else if (key === 'AS') onAsClick()
              else onStageChange(key as ConsultationStage)
            }}
            className={cn(
              'inline-flex items-center justify-center min-w-[2rem] rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200 hover:opacity-90',
              isActive ? activeClass : 'text-gray-400 dark:text-gray-500',
              isActive && 'font-semibold'
            )}
          >
            <span className="inline-flex items-center gap-1">
              {label}
              {showReactivationSignal && isActive && (key === '시공완료' || key === '거절') && (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 마지막 활동 1건 (상담 히스토리 요약·경과 시간·활동 아이콘용) */
export interface LastActivityMessage {
  sender_id: string
  content: string
  created_at: string
  message_type?: 'TEXT' | 'FILE' | 'SYSTEM'
}

/** 리스트 카드: Composite Header(이니셜·업체명·상태/지역/예산 칩) + 마지막 활동 + 기존 2~4행 */
function ConsultationListItem({
  item,
  isSelected,
  isHighlighted,
  onSelect,
  onCopyContact,
  onStageChange,
  onAsClick,
  onInvalidClick,
  onCancelClick,
  onEditClick,
  onDeleteClick,
  onPinClick,
  lastMessage,
  /** 견적서로 저장 직후 카드 2행 즉시 반영용 — 그 외에는 DB(consultations.estimate_amount) 단일 소스만 사용 */
  getPendingEstimateAmount,
  imageCount = 0,
}: {
  item: Lead
  isSelected: boolean
  isHighlighted?: boolean
  onSelect: () => void
  onCopyContact: (e: React.MouseEvent, tel: string) => void
  onStageChange: (leadId: string, stage: ConsultationStage) => void
  onAsClick: (leadId: string) => void
  onInvalidClick: (leadId: string) => void
  onCancelClick: (leadId: string) => void
  onEditClick: (leadId: string) => void
  onDeleteClick: (leadId: string) => void
  onPinClick: (leadId: string) => void
  lastMessage?: LastActivityMessage | null
  getPendingEstimateAmount?: (consultationId: string) => number | undefined
  /** consultation_messages 내 이미지(FILE+Cloudinary) 개수. 구글챗 버튼 왼쪽 인디케이터용 */
  imageCount?: number
}) {
  const painText = item.painPoint?.trim() || '(요청사항 없음)'
  const contactDisplay = item.contact ? formatContact(item.contact) : ''
  const telHref = item.contact ? `tel:${item.contact.replace(/\D/g, '')}` : '#'
  const lastTime = lastMessage?.created_at ? formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true, locale: ko }) : ''
  const lastMessageAt = lastMessage?.created_at ? new Date(lastMessage.created_at).getTime() : 0
  const lastViewedAtMs = item.lastViewedAt ? new Date(item.lastViewedAt).getTime() : 0
  const hasUnread = lastMessageAt > 0 && lastMessageAt > lastViewedAtMs
  /** 완료·거절·무효가 아닐 때 31일 초과 = 장기 미체결 → 카드 투명도 낮춤 */
  const isLongTermUnresolved =
    (item.goldenTimeElapsedDays ?? 0) > 30 && item.status !== '거절' && item.status !== '무효' && item.workflowStage !== '시공완료'
  /** 골든타임/상태 배지 표시 여부 — 완료·거절·무효·AS요청이면 숨김 */
  const showStateBadge = item.status !== '거절' && item.status !== '무효' && item.status !== 'AS' && item.workflowStage !== '시공완료'

  const cancelReason = item.status === '거절' && item.metadata && typeof (item.metadata as Record<string, unknown>).cancel_reason === 'string'
    ? (item.metadata as Record<string, unknown>).cancel_reason as string
    : ''
  const isInvalid = item.status === '무효'

  const isPartner = item.customerTier === '파트너'

  const elapsedDays = item.goldenTimeElapsedDays ?? (item.inboundDate ? getElapsedDays(new Date(item.inboundDate + 'T12:00:00.000Z')) : -1)
  const isD7OrMore = elapsedDays >= 7
  /** 방치 방지: update_date 기준 D-Day */
  const showNeglectIndicator = item.status !== '거절' && item.status !== '무효'
  const neglectD = showNeglectIndicator ? getNeglectDDisplay(item.updateDate) : null
  const reactivationSignal = getReactivationSignal(item.status, item.workflowStage, item.updateDate)
  /** 2행 맨 오른쪽: 최종 견적가. 실제 소스 1개만 — DB(consultations.estimate_amount → expectedRevenue). pending은 견적서로 저장 직후 낙관적 표시용 */
  const pendingAmount = getPendingEstimateAmount?.(item.id)
  const amountToShow =
    (pendingAmount != null && pendingAmount > 0 ? pendingAmount : null) ?? (item.expectedRevenue > 0 ? item.expectedRevenue : 0)
  const finalAmountDisplay = amountToShow > 0 ? `${Number(amountToShow).toLocaleString()}원` : '견적 미정'
  const requiredDateDisplay = item.requiredDate && /^\d{4}-\d{2}-\d{2}$/.test(item.requiredDate) ? item.requiredDate : '미정'
  const showroomIntentLabel = item.showroomEntryLabel?.trim() || item.showroomCategory?.trim() || ''

  return (
    // [DOM 수정] button→div: 내부에 StageProgressBar·편집·삭제 button이 있어 button-in-button 금지 위반 방지
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={cn(
        'relative w-full text-left rounded-md border flex flex-col gap-1.5 px-2 py-1.5 min-h-0 transition-all duration-200 ease-in-out cursor-pointer',
        isSelected
          ? 'relative z-10 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-600 ring-2 ring-amber-400/30 scale-[1.02] -translate-y-1 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.2)]'
          : 'bg-card border border-border hover:bg-muted/50 shadow-sm',
        isPartner && 'border-amber-400/80 dark:border-amber-500/70 ring-1 ring-amber-400/30',
        isHighlighted && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background bg-amber-100/90 dark:bg-amber-500/25 dark:ring-amber-400 animate-pulse',
        isLongTermUnresolved && 'opacity-70',
        isInvalid && 'opacity-60 text-muted-foreground'
      )}
    >
      {hasUnread && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" title="읽지 않은 새 메시지" aria-hidden />
      )}

      {/* 1행: [스페이스 이름] 메인 타이틀 | 진행상태 버튼 + 수정/삭제/복사 */}
      <div className="flex flex-row items-center justify-between gap-1.5 min-h-[20px]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span className="font-semibold text-foreground text-[13px] leading-tight truncate flex items-center gap-1" title={item.displayName}>
            {item.displayName}
            {isPartner && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="파트너" />}
          </span>
          {(item.asRequested || item.status === 'AS') && (
            <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-700 dark:text-red-400 ring-1 ring-red-500/30">
              AS 요청
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <StageProgressBar
            item={item}
            onStageChange={(stage) => onStageChange(item.id, stage)}
            onAsClick={() => onAsClick(item.id)}
            onInvalidClick={() => onInvalidClick(item.id)}
            onCancelClick={() => onCancelClick(item.id)}
            showReactivationSignal={!!reactivationSignal}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPinClick(item.id) }}
            className={cn('p-0.5 rounded shrink-0', item.pinned ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
            title={item.pinned ? '상단 고정 해제' : '상단 고정'}
          >
            <Pin className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditClick(item.id) }}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            title="상담 정보 수정"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteClick(item.id) }}
            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
            title="상담 삭제"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {contactDisplay && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCopyContact(e, item.contact) }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="전화번호 복사"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {item.status === '거절' && cancelReason && (
        <p className="text-[11px] text-destructive/90 font-medium truncate" title={cancelReason}>
          거절 사유: {cancelReason}
        </p>
      )}
      {item.source === '쇼룸' && showroomIntentLabel && (
        <div className="flex items-center gap-1.5 min-h-[16px] flex-wrap">
          <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-500/25 dark:text-violet-300">
            쇼룸 문맥
          </span>
          <span
            className="text-[11px] text-violet-700/90 dark:text-violet-300/90 truncate"
            title={item.showroomContext?.trim() || showroomIntentLabel}
          >
            {showroomIntentLabel}
          </span>
        </div>
      )}

      {/* 2행: 고객등급 | 인입채널 | 업종 | 지역 | 전화번호 | 최종견적 */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-h-[16px] flex-wrap">
        <CustomerTierBadge tier={item.customerTier} />
        <span className="text-border shrink-0 mx-0.5">|</span>
        {item.source?.trim() ? <SourceChannelBadge source={item.source} /> : <span>—</span>}
        <span className="text-border shrink-0 mx-0.5">|</span>
        <span>{item.industry || '—'}</span>
        <span className="text-border shrink-0 mx-0.5">|</span>
        <span>{item.region || '—'}</span>
        <span className="text-border shrink-0 mx-0.5">|</span>
        {contactDisplay ? (
          <a href={telHref} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline truncate max-w-[90px]" title="전화 걸기">
            {contactDisplay}
          </a>
        ) : (
          <span>—</span>
        )}
        <span className="text-border shrink-0 mx-0.5">|</span>
        <span className={amountToShow > 0 ? 'font-semibold text-primary' : ''} data-final-estimate data-consultation-id={item.id} title={amountToShow > 0 ? '최종 견적가' : '견적 미정'}>{finalAmountDisplay}</span>
      </div>

      {/* 3행: [골든타임 배지] | [인입일] | [미갱신 D+n] | [요청일자] — 슬림 한 줄, 방치 기간 강조 */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground min-h-[16px] flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {showStateBadge && item.workflowStage === '계약완료' && (
            <>
              <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-blue-500 text-white" title="계약완료">
                🏗️ 진행중
              </span>
              <span className="text-border shrink-0 mx-0.5">|</span>
            </>
          )}
          {showStateBadge && item.workflowStage !== '계약완료' && item.goldenTimeTier === 'urgent' && (
            <>
              <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-orange-500 text-white" title="D+0~7 Hot">
                ⚡ 골든타임
              </span>
              <span className="text-border shrink-0 mx-0.5">|</span>
            </>
          )}
          {showStateBadge && item.workflowStage !== '계약완료' && item.goldenTimeTier === 'progress' && (
            <>
              <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-green-600 text-white" title="D+8~20 Active">
                🌿 집중상담
              </span>
              <span className="text-border shrink-0 mx-0.5">|</span>
            </>
          )}
          {showStateBadge && item.workflowStage !== '계약완료' && item.goldenTimeTier === 'deadline' && (
            <>
              <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-yellow-500 text-yellow-950 dark:text-yellow-950" title="D+21~30 Warning">
                🔔 이탈경고
              </span>
              <span className="text-border shrink-0 mx-0.5">|</span>
            </>
          )}
          {reactivationSignal && (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ring-1',
                  reactivationSignal.days === 0
                    ? 'bg-amber-500 text-white ring-amber-500/50'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30'
                )}
                title={reactivationSignal.title}
              >
                {reactivationSignal.label}
              </span>
              <span className="text-border shrink-0 mx-0.5">|</span>
            </>
          )}
          <span className="shrink-0">{item.inboundDate ? `인입 ${item.inboundDate}` : '인입 —'}</span>
          {showNeglectIndicator && (
            <>
              <span className="text-border shrink-0 mx-0.5">|</span>
              {neglectD ? (
                <>
                  <span
                    title={neglectD.days === 0 ? '오늘 갱신됨' : `마지막 업데이트 ${(item.updateDate)?.toString().slice(0, 10) ?? '—'}로부터 ${neglectD.days}일 경과 — 방치 주의`}
                    className={cn(
                      'font-medium shrink-0 text-[11px] inline-flex items-center gap-0.5',
                      reactivationSignal && 'rounded-md px-1.5 py-0.5 bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-1 ring-amber-500/20'
                    )}
                  >
                    <span className={cn(reactivationSignal ? 'text-current' : 'text-muted-foreground')}>
                      마지막 업데이트 {(item.updateDate)?.toString().slice(0, 10) ?? '—'}
                    </span>
                    <span className={cn(
                      neglectD.days === 0 && (reactivationSignal ? 'text-current' : 'text-muted-foreground'),
                      neglectD.days >= 3 && neglectD.days < 7 && 'text-orange-600 dark:text-orange-400 font-semibold',
                      neglectD.days >= 7 && 'text-red-600 dark:text-red-400 font-semibold'
                    )}>+{neglectD.days}일</span>
                  </span>
                  <span className="text-border shrink-0 mx-0.5">|</span>
                </>
              ) : (
                <>
                  <span className="shrink-0 text-muted-foreground/80">미갱신 —</span>
                  <span className="text-border shrink-0 mx-0.5">|</span>
                </>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {imageCount > 0 ? (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30"
              title="시공 사진 포함"
            >
              <Images className="h-2.5 w-2.5 shrink-0" />
              {imageCount}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 shrink-0" title="사진 없음">(사진 없음)</span>
          )}
          {item.google_chat_url ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); window.open(item.google_chat_url!, '_blank') }}
              className="inline-flex items-center gap-0.5 px-1 py-2 rounded text-[10px] font-medium bg-[#00A862]/15 text-[#00875A] hover:bg-[#00A862]/25 dark:bg-[#00A862]/20 dark:text-emerald-400 border border-[#00A862]/30"
              title="구글챗 스페이스 입장"
            >
              <MessageCircle className="h-2.5 w-2.5" />
              구글챗
            </button>
          ) : item.google_chat_pending ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-muted-foreground bg-muted/80" title="스페이스 생성 중">
              <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toast.info('연결된 스페이스가 없습니다.') }}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-muted-foreground bg-muted/80 border border-border"
              title="구글챗"
            >
              <MessageCircle className="h-2.5 w-2.5 opacity-60" />
            </button>
          )}
        </div>
      </div>

      {/* 4행: 요청사항(페인포인트) */}
      <div className="min-h-[14px]">
        <p className="text-[11px] text-foreground bg-muted/60 dark:bg-muted/50 rounded px-1.5 py-0.5 w-full min-w-0 break-words line-clamp-2">
          {painText}
        </p>
      </div>

      {lastMessage?.created_at && (
        <div className="flex justify-end min-h-[12px]">
          <span className="text-[10px] text-muted-foreground" title={new Date(lastMessage.created_at).toLocaleString('ko-KR')}>
            {lastTime}
          </span>
        </div>
      )}
    </div>
  )
}

const MOBILE_BREAK = 768
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAK}px)`).matches)
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${MOBILE_BREAK}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    m.addEventListener('change', handler)
    setIsMobile(m.matches)
    return () => m.removeEventListener('change', handler)
  }, [])
  return isMobile
}

export default function ConsultationManagement() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [selectedLead, setSelectedLead] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [asModalLeadId, setAsModalLeadId] = useState<string | null>(null)
  const [asReason, setAsReason] = useState('')
  const [cancelModalLeadId, setCancelModalLeadId] = useState<string | null>(null)
  const [cancelReasonDraft, setCancelReasonDraft] = useState('')
  /** 상담 숨기기 확인 모달 — 네이티브 confirm 대신 Dialog 사용 */
  const [hideConfirmLeadId, setHideConfirmLeadId] = useState<string | null>(null)
  const [editModalLeadId, setEditModalLeadId] = useState<string | null>(null)
  const [estimateModalLeadId, setEstimateModalLeadId] = useState<string | null>(null)
  const [newEstimateForm, setNewEstimateForm] = useState({ amount: '', summary: '' })
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false)
  /** 상담 상세 패널 탭: 상담 히스토리 | 실측 자료 | 견적 관리 */
  const [detailPanelTab, setDetailPanelTab] = useState<'history' | 'measurement' | 'estimate'>('history')
  /** 상담 배지 클릭 시 리스트 스크롤 타깃 (효과 후 클리어) */
  const [scrollToLeadId, setScrollToLeadId] = useState<string | null>(null)
  /** 상담 배지 클릭 후 해당 카드 강조 (반짝 효과용) */
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null)
  /** 카드별 마지막 활동 1건 (consultation_id → LastActivityMessage) */
  const [lastMessagesByConsultationId, setLastMessagesByConsultationId] = useState<Record<string, LastActivityMessage>>({})
  /** 카드별 이미지 첨부 개수 (consultation_id → count). consultation_messages 중 FILE 타입 + 이미지(Cloudinary URL 또는 metadata.public_id) */
  const [imageCountByConsultationId, setImageCountByConsultationId] = useState<Record<string, number>>({})
  /** 견적서 풀스크린 모달: 열림 여부, 수정 시 estimate id, 편집 시 초기 데이터 */
  const [estimateModalOpen, setEstimateModalOpen] = useState(false)
  const [estimateModalEditId, setEstimateModalEditId] = useState<string | null>(null)
  const [estimateModalInitialData, setEstimateModalInitialData] = useState<Partial<EstimateFormData> | null>(null)
  const estimateFormRef = useRef<EstimateFormHandle>(null)
  /** 참고 견적서 미리보기 방금 닫음(타이머로 리셋) — 견적 작성 모달이 같이 닫히는 것 방지 */
  const justClosedPreviewRef = useRef(false)
  /** 견적서로 저장 직후 fetchLeads가 서버 반영 전 응답으로 덮어쓸 때를 대비 — 상담 ID별 확정 금액 보존 */
  const pendingEstimateAmountRef = useRef<Record<string, number>>({})
  /** 현재 상담 건의 견적서 목록 (estimates 테이블) */
  const [estimatesList, setEstimatesList] = useState<Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>>([])
  /** AI 추천 가이드용 과거 견적 (전체 상담 기반, 최근 80건) */
  const [pastEstimatesForGuide, setPastEstimatesForGuide] = useState<Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; approved_at: string | null; created_at: string }>>([])
  const [estimatesLoading, setEstimatesLoading] = useState(false)
  /** 견적 목록 필터: 전체 / 임시 저장만 */
  const [estimateListFilter, setEstimateListFilter] = useState<'all' | 'draft'>('all')
  /** 선택 삭제용 체크된 견적 id 목록 */
  const [selectedEstimateIds, setSelectedEstimateIds] = useState<string[]>([])
  /** 삭제 확인 모달 */
  const [estimateDeleteConfirmOpen, setEstimateDeleteConfirmOpen] = useState(false)
  const [estimateDeleting, setEstimateDeleting] = useState(false)
  /** 현재 상담 건의 발주서(PPT/PDF) 목록 — 갤러리·퀵뷰용 */
  const [orderDocumentsList, setOrderDocumentsList] = useState<OrderDocument[]>([])
  const [estimateFilesList, setEstimateFilesList] = useState<ConsultationEstimateFile[]>([])
  const [pendingTakeoutImport, setPendingTakeoutImport] = useState<{
    consultationId: string
    file: File
    requestId: string
  } | null>(null)
  /** 업로드 견적서 AI 분석 저장 시 견적 목록 새로고침용 */
  const [estimateListRefreshKey, setEstimateListRefreshKey] = useState(0)
  /** 상담 ID별 견적 건수 (estimates 테이블 기준) — 카드 "견적 이력 N건" 표시용 */
  const [estimateCountByConsultationId, setEstimateCountByConsultationId] = useState<Record<string, number>>({})
  /** 동일 전화번호 과거 상담 목록 — 상담 히스토리 탭 통합 표시용 */
  const [samePhoneConsultations, setSamePhoneConsultations] = useState<Array<{ id: string; project_name: string | null; created_at: string; status: string | null; estimate_amount: number | null }>>([])
  /** 예산 기획안 발행 전 관리자 미리보기 팝업 */
  const [adminPreviewOpen, setAdminPreviewOpen] = useState(false)
  const [adminPreviewData, setAdminPreviewData] = useState<(EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) | null>(null)
  /** 발행승인 시 임시저장한 견적 ID — 미리보기에서 최종 발행 시 이 행을 확정함 */
  const [adminPreviewEstimateId, setAdminPreviewEstimateId] = useState<string | null>(null)
  /** PDF 인쇄용 모달 (승인된 기획안) */
  const [printEstimateId, setPrintEstimateId] = useState<string | null>(null)
  /** 원가표 원본 이미지 라이트박스 (AI 추천 가이드 [원본보기]) */
  const [priceBookImageUrl, setPriceBookImageUrl] = useState<string | null>(null)
  /** 원가표 이미지 실제 표시 URL (Supabase 비공개 버킷이면 Signed URL로 변환) */
  const [priceBookImageDisplayUrl, setPriceBookImageDisplayUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!priceBookImageUrl) {
      setPriceBookImageDisplayUrl(null)
      return
    }
    const match = priceBookImageUrl.match(/\/object\/public\/vendor-assets\/(.+)$/)
    if (match) {
      const path = decodeURIComponent(match[1]!)
      supabase.storage
        .from('vendor-assets')
        .createSignedUrl(path, 3600)
        .then(({ data, error }) => {
          if (!error && data?.signedUrl) setPriceBookImageDisplayUrl(data.signedUrl)
          else setPriceBookImageDisplayUrl(priceBookImageUrl)
        })
    } else {
      setPriceBookImageDisplayUrl(priceBookImageUrl)
    }
  }, [priceBookImageUrl])
  useEffect(() => {
    if (printEstimateId) document.body.classList.add('print-estimate-pdf')
    else document.body.classList.remove('print-estimate-pdf')
    return () => document.body.classList.remove('print-estimate-pdf')
  }, [printEstimateId])
  const [editForm, setEditForm] = useState<{
    company: string
    name: string
    region: string
    industry: string
    contact: string
    source: string
    google_chat_url: string
    inboundDate: string | null
    requiredDate: string
    painPoint: string
    customerTier: CustomerTier
  }>({
    company: '',
    name: '',
    region: '',
    industry: '',
    contact: '',
    source: '',
    google_chat_url: '',
    inboundDate: '',
    requiredDate: '',
    painPoint: '',
    customerTier: '미지정',
  })
  // 상담 등록 폼 (CONTEXT: 실용 데이터, 업체명·지역·업종 우선)
  const [form, setForm] = useState({
    companyName: '',
    region: '',
    industry: '',
    managerName: '',
    contact: '',
    source: '채널톡',
    orderNumber: '',
    areaSqm: '',
    requiredDate: '',
    painPoint: '',
    customerTier: '신규' as CustomerTier,
  })

  const setFormField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** 마이그레이션/미분류 데이터 — 등급 '미지정'인 건을 검토 필요 리스트로 분류 */
  const leadsNeedingReview = useMemo(
    () => leads.filter((l) => l.customerTier === '미지정'),
    [leads]
  )

  const [listTab, setListTab] = useState<ListTab>('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRangeKey>('all')
  const [updateDateRange, setUpdateDateRange] = useState<DateRangeKey>('1m')
  const [customDateTarget, setCustomDateTarget] = useState<CustomDateTarget>('inbound')
  const [customDateStart, setCustomDateStart] = useState('')
  const [customDateEnd, setCustomDateEnd] = useState('')
  const [listPage, setListPage] = useState(0)
  const [sortByNeglect, setSortByNeglect] = useState(true)
  const consumedDashboardFocusKeyRef = useRef<string | null>(null)
  /** admin 권한 — 시스템 메시지 영구 삭제 버튼 노출. localStorage 'findgagu-role' === 'admin' 또는 URL ?admin=1 */
  const isAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false
    if (localStorage.getItem('findgagu-role') === 'admin') return true
    if (new URLSearchParams(window.location.search).get('admin') === '1') return true
    return false
  }, [])

  const getListTabForLead = useCallback((lead: Lead): ListTab => {
    if (lead.status === '거절') return '거절'
    if (lead.status === '무효') return '무효'
    if (lead.workflowStage === '시공완료') return '종료'
    if (lead.workflowStage === '상담접수') return '미처리'
    if (lead.workflowStage === '견적중') return '견적중'
    if (lead.workflowStage === '계약완료') return '진행중'
    return '전체'
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const focusLeadId = params.get('leadId')?.trim() || null
    if (!focusLeadId || leads.length === 0) return

    const focusKey = `${location.search}:${focusLeadId}`
    if (consumedDashboardFocusKeyRef.current === focusKey) return

    const targetLead = leads.find((lead) => lead.id === focusLeadId)
    if (!targetLead) return

    consumedDashboardFocusKeyRef.current = focusKey
    const nextTab = getListTabForLead(targetLead)
    if (listTab !== nextTab) setListTab(nextTab)
    setSelectedLead(focusLeadId)
    setScrollToLeadId(focusLeadId)
    setHighlightedLeadId(focusLeadId)
    const timer = setTimeout(() => {
      setHighlightedLeadId((current) => (current === focusLeadId ? null : current))
    }, 2200)
    return () => clearTimeout(timer)
  }, [location.search, leads, getListTabForLead, listTab])

  const matchesLeadDateFilters = useCallback((lead: Lead, now: number, starts: ReturnType<typeof getDateRangeStarts>) => {
    const inboundValue = getComparableDateValue(lead.inboundDate, lead.createdAt)
    const updateValue = getComparableDateValue(lead.updateDate)
    const customDateValue = customDateTarget === 'inbound' ? inboundValue : updateValue
    return (
      matchesDateRange(inboundValue, dateRange, now, starts) &&
      matchesDateRange(updateValue, updateDateRange, now, starts) &&
      matchesCustomDateRange(customDateValue, customDateStart, customDateEnd)
    )
  }, [dateRange, updateDateRange, customDateTarget, customDateStart, customDateEnd])

  /** KPI: 무효 제외 유효 상담 수, 성공률 = 계약완료(시공완료) / 유효 상담. 무효는 분모에서 제외. 필터와 동일한 inRange 사용 */
  const kpi = useMemo(() => {
    const now = Date.now()
    const starts = getDateRangeStarts(now)
    const base = leads.filter((l) => matchesLeadDateFilters(l, now, starts) && matchesLeadSearch(l, searchQuery))
    const totalValid = base.filter((l) => l.status !== '무효').length
    const successCount = base.filter((l) => l.workflowStage === '시공완료' && l.status !== '거절' && l.status !== '무효').length
    const successRate = totalValid > 0 ? Math.round((successCount / totalValid) * 100) : 0
    return { totalValid, successCount, successRate }
  }, [leads, searchQuery, matchesLeadDateFilters])

  /** 탭별 개수 (숫자 표시용). 필터와 동일한 inRange 사용 */
  const tabCounts = useMemo(() => {
    const now = Date.now()
    const starts = getDateRangeStarts(now)
    const base = leads.filter((l) => matchesLeadDateFilters(l, now, starts) && matchesLeadSearch(l, searchQuery))
    const active = base.filter((l) => !isEnded(l))
    const completedCount = base.filter((l) => l.workflowStage === '시공완료' && l.status !== '거절' && l.status !== '무효').length
    const completedReactivatedCount = base.filter((l) => l.status === '완료' && l.workflowStage === '시공완료' && !!getReactivationSignal(l.status, l.workflowStage, l.updateDate)).length
    const rejectedReactivatedCount = base.filter((l) => l.status === '거절' && !!getReactivationSignal(l.status, l.workflowStage, l.updateDate)).length
    const rejectCount = base.filter((l) => l.status === '거절').length
    const invalidCount = base.filter((l) => l.status === '무효').length
    return {
      전체: active.length,
      미처리: active.filter((l) => l.workflowStage === '상담접수').length,
      견적중: active.filter((l) => l.workflowStage === '견적중').length,
      진행중: active.filter((l) => l.workflowStage === '계약완료').length,
      종료: completedCount,
      종료재활동: completedReactivatedCount,
      거절재활동: rejectedReactivatedCount,
      거절: rejectCount,
      무효: invalidCount,
    }
  }, [leads, searchQuery, matchesLeadDateFilters])

  /** 필터+정렬된 리스트 (최신 순 = start_date/inboundDate desc) */
  const filteredLeads = useMemo(() => {
    const now = Date.now()
    const starts = getDateRangeStarts(now)
    let list = leads.filter((l) => matchesLeadDateFilters(l, now, starts) && matchesLeadSearch(l, searchQuery))
    if (listTab === '종료') list = list.filter((l) => l.workflowStage === '시공완료' && l.status !== '거절' && l.status !== '무효')
    else if (listTab === '거절') list = list.filter((l) => l.status === '거절')
    else if (listTab === '무효') list = list.filter((l) => l.status === '무효')
    else {
      list = list.filter((l) => !isEnded(l))
      if (listTab === '미처리') list = list.filter((l) => l.workflowStage === '상담접수')
      else if (listTab === '견적중') list = list.filter((l) => l.workflowStage === '견적중')
      else if (listTab === '진행중') list = list.filter((l) => l.workflowStage === '계약완료')
      // 전체: 활성 전부(미처리+견적중+진행중+AS대기 등) 그대로
    }
    if (sortByNeglect) {
      // 수파베이스 최신 업데이트일(update_date) 기준 내림차순 정렬. null이면 인입일(inboundDate) 대체
      return [...list].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        const da = new Date(a.updateDate ?? a.inboundDate ?? a.createdAt).getTime()
        const db = new Date(b.updateDate ?? b.inboundDate ?? b.createdAt).getTime()
        return db - da
      })
    }
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      const da = a.inboundDate ? new Date(a.inboundDate).getTime() : new Date(a.createdAt).getTime()
      const db = b.inboundDate ? new Date(b.inboundDate).getTime() : new Date(b.createdAt).getTime()
      return db - da
    })
  }, [leads, listTab, searchQuery, sortByNeglect, matchesLeadDateFilters])

  const searchMatchedTabCounts = useMemo(() => {
    const empty: Record<ListTab, number> = {
      전체: 0,
      미처리: 0,
      견적중: 0,
      진행중: 0,
      종료: 0,
      거절: 0,
      무효: 0,
    }
    const now = Date.now()
    const starts = getDateRangeStarts(now)
    const q = (searchQuery ?? '').trim().toLowerCase()
    if (!q) return empty
    for (const lead of leads) {
      if (!matchesLeadDateFilters(lead, now, starts) || !matchesLeadSearch(lead, searchQuery)) continue
      empty[getListTabForLead(lead)] += 1
    }
    return empty
  }, [leads, searchQuery, getListTabForLead, matchesLeadDateFilters])

  const searchFocusLead = useMemo(() => {
    const now = Date.now()
    const starts = getDateRangeStarts(now)
    const q = (searchQuery ?? '').trim().toLowerCase()
    if (!q) return null
    const matches = leads.filter((lead) => matchesLeadDateFilters(lead, now, starts) && matchesLeadSearch(lead, searchQuery))
    if (matches.length === 0) return null
    return [...matches].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (sortByNeglect) {
        const da = new Date(a.updateDate ?? a.inboundDate ?? a.createdAt).getTime()
        const db = new Date(b.updateDate ?? b.inboundDate ?? b.createdAt).getTime()
        return db - da
      }
      const da = a.inboundDate ? new Date(a.inboundDate).getTime() : new Date(a.createdAt).getTime()
      const db = b.inboundDate ? new Date(b.inboundDate).getTime() : new Date(b.createdAt).getTime()
      return db - da
    })[0]
  }, [leads, searchQuery, sortByNeglect, matchesLeadDateFilters])

  /** 검색/기간 필터 변경 시: 현재 선택이 필터 결과에 없으면 첫 번째 결과로 선택 (검색 시 우측 패널이 결과와 맞도록) */
  useEffect(() => {
    setSelectedLead((current) => {
      if (!current) return filteredLeads.length > 0 ? filteredLeads[0].id : null
      const inList = filteredLeads.some((l) => l.id === current)
      if (inList) return current
      return filteredLeads.length > 0 ? filteredLeads[0].id : null
    })
  }, [filteredLeads])

  const lastAutoSearchFocusKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const q = (searchQuery ?? '').trim().toLowerCase()
    if (!q) {
      lastAutoSearchFocusKeyRef.current = null
      return
    }
    if (!searchFocusLead) return
    const nextTab = getListTabForLead(searchFocusLead)
    const focusKey = `${q}:${searchFocusLead.id}:${nextTab}`
    if (lastAutoSearchFocusKeyRef.current === focusKey) return
    lastAutoSearchFocusKeyRef.current = focusKey
    if (listTab !== nextTab) setListTab(nextTab)
    setSelectedLead(searchFocusLead.id)
    setScrollToLeadId(searchFocusLead.id)
    setHighlightedLeadId(searchFocusLead.id)
    const t = setTimeout(() => {
      setHighlightedLeadId((current) => (current === searchFocusLead.id ? null : current))
    }, 2200)
    return () => clearTimeout(t)
  }, [searchQuery, searchFocusLead, getListTabForLead, listTab])

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / LIST_PAGE_SIZE))
  const paginatedLeads = useMemo(
    () => filteredLeads.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
    [filteredLeads, listPage]
  )

  useEffect(() => {
    if (listPage >= totalPages) setListPage(Math.max(0, totalPages - 1))
  }, [listPage, totalPages])

  /** scrollToLeadId 설정 후: 해당 카드가 현재 필터에 있으면 listPage 보정 → 스크롤. 필터에 없으면 아무것도 안 하고 유지(필터 전환 후 재실행) */
  useEffect(() => {
    if (!scrollToLeadId) return
    const id = scrollToLeadId
    const index = filteredLeads.findIndex((l) => l.id === id)
    if (index < 0) return
    setListPage(Math.floor(index / LIST_PAGE_SIZE))
    const t = setTimeout(() => {
      try {
        const el = document.querySelector(`[data-lead-id="${id}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      } catch (_) {
        /* noop — 리스트에 없거나 DOM 오류 시 화이트아웃 방지 */
      }
      setScrollToLeadId(null)
    }, 250)
    return () => clearTimeout(t)
  }, [scrollToLeadId, filteredLeads])

  /** 현재 페이지 리스트 기준으로 카드별 마지막 활동 1건 조회 */
  useEffect(() => {
    const ids = paginatedLeads.map((l) => l.id)
    if (ids.length === 0) {
      setLastMessagesByConsultationId({})
      return
    }
    let cancelled = false
      ; (async () => {
        const { data: rows } = await supabase
          .from('consultation_messages')
          .select('consultation_id, sender_id, content, created_at, message_type')
          .in('consultation_id', ids)
          .order('created_at', { ascending: false })
          .limit(Math.min(300, ids.length * 15))
        if (cancelled) return
        const byId: Record<string, LastActivityMessage> = {}
        for (const row of rows ?? []) {
          const r = row as { consultation_id: string; sender_id: string; content: string; created_at: string; message_type?: string }
          const cid = r.consultation_id
          if (!byId[cid]) {
            byId[cid] = {
              sender_id: r.sender_id,
              content: r.content ?? '',
              created_at: r.created_at,
              message_type: (r.message_type === 'FILE' || r.message_type === 'SYSTEM' || r.message_type === 'TEXT') ? r.message_type : undefined,
            }
          }
        }
        setLastMessagesByConsultationId(byId)
      })()
    return () => { cancelled = true }
  }, [paginatedLeads])

  const loadImageCountsForConsultations = useCallback(async (consultationIds: string[]) => {
    if (consultationIds.length === 0) return {}
    const wantedIds = new Set(consultationIds)
    const { data: rows } = await supabase.from('image_assets').select('metadata')
    const byId: Record<string, number> = {}
    for (const row of rows ?? []) {
      const metadata = (row as { metadata?: Record<string, unknown> | null }).metadata
      const consultationId =
        typeof metadata?.consultation_id === 'string' && metadata.consultation_id.trim()
          ? metadata.consultation_id.trim()
          : ''
      if (!consultationId || !wantedIds.has(consultationId)) continue
      byId[consultationId] = (byId[consultationId] ?? 0) + 1
    }
    return byId
  }, [])

  /** 카드별 이미지 첨부 개수 조회 — image_assets.metadata.consultation_id 기준 */
  useEffect(() => {
    const ids = paginatedLeads.map((l) => l.id)
    if (ids.length === 0) {
      setImageCountByConsultationId({})
      return
    }
    let cancelled = false
      ; (async () => {
        const byId = await loadImageCountsForConsultations(ids)
        if (cancelled) return
        setImageCountByConsultationId(byId)
      })()
    return () => { cancelled = true }
  }, [paginatedLeads, loadImageCountsForConsultations])

  /** 특정 상담의 이미지 개수만 재조회 후 state 반영 (image_assets 기준) */
  const refetchImageCountForConsultation = useCallback(async (consultationId: string) => {
    const byId = await loadImageCountsForConsultations([consultationId])
    const count = byId[consultationId] ?? 0
    setImageCountByConsultationId((prev) => ({ ...prev, [consultationId]: count }))
  }, [loadImageCountsForConsultations])

  const handleSubmitConsultation = async (e: React.FormEvent) => {
    e.preventDefault()
    const contact = form.contact.trim()
    if (!form.companyName.trim() || !form.managerName.trim() || !contact) {
      toast.error('업체명, 고객명, 연락처는 필수입니다.')
      return
    }
    setIsSubmitting(true)
    try {
      const normalizedContact = normalizeContactForSync(contact)
      const sameContactLeads = isValidContactForSameCustomer(contact)
        ? leads.filter((l) => normalizeContactForSync(l.contact) === normalizedContact)
        : []
      const formTier = getValidCustomerTier(form.customerTier)
      const resolvedTier =
        sameContactLeads.length > 0
          ? getHighestTier([...sameContactLeads.map((l) => l.customerTier), formTier])
          : formTier
      const tierWasSynced = sameContactLeads.length > 0 && resolvedTier !== formTier

      const isMarket = isMarketSource(form.source)
      const metadata: Record<string, unknown> = {
        source: form.source || null,
        industry: form.industry || null,
        region: form.region.trim() || null,
        area_sqm: form.areaSqm ? Number(form.areaSqm) : null,
        required_date: form.requiredDate || null,
        pain_point: form.painPoint.trim() || null,
        customer_tier: resolvedTier,
        // [YYMM] [상호] [뒷4자리] 식별자 자동 생성 — DB 트리거(trigger_set_consultation_display_name)에서도 동일 규칙 적용
        display_name: computeDisplayName(form.companyName.trim(), contact, new Date()),
      }
      if (isMarket) {
        metadata.is_market_order = true
        if (form.orderNumber.trim()) metadata.order_number = form.orderNumber.trim()
      }

      const { error } = await supabase.from('consultations').insert({
        company_name: form.companyName.trim(),
        manager_name: form.managerName.trim(),
        contact,
        status: '접수',
        metadata: metadata as Json,
        is_visible: true,
      })
      if (error) throw error
      // 자동화 확인: insert 성공 시 metadata.display_name 저장됨(클라이언트 전송값 + DB 트리거 보정)

      if (isMarket) {
        notifyMarketOrderRegistered(form.source, form.companyName.trim(), form.orderNumber.trim() || undefined)
      }
      if (tierWasSynced) {
        toast.success(`이전 상담 이력이 있는 고객입니다. 등급이 '${resolvedTier}'로 자동 설정되었습니다.`)
      }
      toast.success('상담이 등록되었습니다.')
      setIsCreateDialogOpen(false)
      setForm({
        companyName: '',
        region: '',
        industry: '',
        managerName: '',
        contact: '',
        source: '채널톡',
        orderNumber: '',
        areaSqm: '',
        requiredDate: '',
        painPoint: '',
        customerTier: '신규',
      })
      fetchLeads()
    } catch (err: unknown) {
      console.error(err)
      toast.error('등록에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fetchLeads = async () => {
    setIsLoading(true)
    try {
      const allData: any[] = []
      let from = 0
      const PAGE_SIZE = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('consultations')
          .select('*')
          .or('is_visible.eq.true,is_visible.is.null')
          .order('start_date', { ascending: false, nullsFirst: false })
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error
        if (!data || data.length === 0) {
          hasMore = false
        } else {
          allData.push(...data)
          if (data.length < PAGE_SIZE) {
            hasMore = false
          } else {
            from += PAGE_SIZE
          }
        }
      }

      const raw = allData as Array<Record<string, unknown>>
      const mappedLeads: Lead[] = []
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        try {
          const lead = mapConsultationRowToLead(sanitizeConsultationRow(item))
          mappedLeads.push(lead)
        } catch (e) {
          console.warn('mapConsultationRowToLead skip:', item?.id, e)
        }
      }
      // 견적서로 저장 직후 fetch 시 서버에 아직 estimate_amount가 반영되지 않았을 수 있음 → 보존해 둔 금액으로 2행 표시
      const mergedLeads = mappedLeads.map((l) => {
        const pending = pendingEstimateAmountRef.current[l.id]
        if (pending != null) {
          const useAmount = l.displayAmount > 0 ? l.displayAmount : pending
          if (l.displayAmount > 0) delete pendingEstimateAmountRef.current[l.id]
          return { ...l, displayAmount: useAmount, expectedRevenue: useAmount }
        }
        return l
      })
      setLeads(mergedLeads)
      if (mappedLeads.length > 0 && !selectedLead) {
        setSelectedLead(mappedLeads[0].id)
      }
    } catch (err: unknown) {
      console.error('Error:', err)
      toast.error('상담 내역을 불러오지 못했습니다.')
      setLeads([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyContact = (e: React.MouseEvent, tel: string) => {
    e.stopPropagation()
    if (!tel) return
    const normalized = tel.replace(/\D/g, '').replace(/^(\d{2,3})(\d{4})(\d{4})$/, '$1-$2-$3')
    void navigator.clipboard.writeText(normalized).then(() => toast.success('전화번호가 복사되었습니다.'))
  }

  /** 상담 카드 선택 시 선택 상태 반영 — 왼쪽 카드 활성화·우측 상세 로딩과 동기화
   * [DISABLED: PGRST204] last_viewed_at 컬럼 미존재로 DB 갱신 일시 중단. 로컬 state만 갱신. */
  const handleSelectLead = useCallback((leadId: string) => {
    setSelectedLead(leadId)
    const now = new Date().toISOString()
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, lastViewedAt: now } : l))
    )
    // [DISABLED: PGRST204 — consultations 테이블에 last_viewed_at 컬럼 없음]
    // supabase
    //   .from('consultations')
    //   .update({ last_viewed_at: now })
    //   .eq('id', leadId)
    //   .then(({ error }) => {
    //     if (error) console.warn('last_viewed_at 갱신 실패:', error)
    //   })
  }, [])

  /** 파트너 수동 지정 — customer_grade를 '파트너'로 고정. 자동 단골 판정보다 우선. 관리자 전용 */
  const handleSetPartnerGrade = useCallback(async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, customerTier: '파트너' as const } : l)))
    try {
      const { error } = await supabase.from('consultations').update({ customer_grade: '파트너' } as Record<string, unknown>).eq('id', leadId)
      if (error) throw error
      toast.success('파트너로 지정되었습니다. 자동 등급 변경보다 우선 적용됩니다.')
    } catch (err) {
      console.error(err)
      toast.error('저장에 실패했습니다.')
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, customerTier: lead.customerTier } : l)))
    }
  }, [leads])

  /** 이 상담 숨기기(Soft Delete): is_visible false → 리스트/통계에서 제외, 아카이브에서만 노출. 확인 모달에서 [숨기기] 클릭 시 호출 */
  const handleHideLead = useCallback(async (leadId: string) => {
    setHideConfirmLeadId(null)
    const { error } = await supabase.from('consultations').update({ is_visible: false }).eq('id', leadId)
    if (error) {
      toast.error('숨기기 실패')
      return
    }
    setLeads((prev) => prev.filter((l) => l.id !== leadId))
    if (selectedLead === leadId) {
      const rest = leads.filter((l) => l.id !== leadId)
      setSelectedLead(rest.length > 0 ? rest[0].id : null)
    }
    toast.success('상담이 숨겨졌습니다. 아카이브에서 복구할 수 있습니다.')
  }, [selectedLead, leads])

  /** 상담 영구 삭제: 확인 후 DB에서 삭제하고 목록에서 즉시 제거 */
  const handleDeleteLead = useCallback(async (leadId: string) => {
    if (!window.confirm('이 상담 내역을 영구 삭제할까요?')) return
    const { error } = await supabase.from('consultations').delete().eq('id', leadId)
    if (error) {
      toast.error('삭제에 실패했습니다.')
      return
    }
    setLeads((prev) => prev.filter((l) => l.id !== leadId))
    if (selectedLead === leadId) {
      const rest = leads.filter((l) => l.id !== leadId)
      setSelectedLead(rest.length > 0 ? rest[0].id : null)
    }
    toast.success('상담 내역이 삭제되었습니다.')
  }, [selectedLead, leads])

  /** AS 요청/해제 토글 — 즉시 뱃지 반영(낙관적 업데이트) + DB status·metadata.as_requested 동기화 */
  const handleToggleAs = async (leadId: string, requested: boolean, reason?: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const nextMeta = { ...(lead.metadata ?? {}), as_requested: requested, as_reason: reason ?? (lead.metadata?.as_reason as string) ?? '' }
    if (!requested) delete (nextMeta as Record<string, unknown>).as_reason
    const nextStatus: Lead['status'] = requested ? 'AS' : '완료'

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, asRequested: requested, status: nextStatus, metadata: nextMeta } : l
      )
    )
    setAsModalLeadId(null)
    setAsReason('')
    try {
      const { error } = await supabase
        .from('consultations')
        .update({ metadata: nextMeta as Json, status: nextStatus })
        .eq('id', leadId)
      if (error) throw error
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: leadId,
        event_type: 'status_change',
        actor_name: actor,
        detail: requested ? '상태가 [AS]로 변경되었습니다' : 'AS 요청이 해제되었습니다.',
        metadata: { type: 'status_change', from_stage: lead.workflowStage, to_stage: requested ? 'AS' : lead.workflowStage },
      })
      if (requested) {
        toast.success('AS 대기 목록으로 이동되었습니다.')
        setListTab('전체')
      } else {
        toast.success('AS 완료 처리했습니다.')
      }
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, asRequested: lead.asRequested, status: lead.status, metadata: lead.metadata } : l
        )
      )
      toast.error('저장에 실패했습니다.')
    }
  }

  /** 거절 사유 저장 — 반드시 사유 입력 후 metadata.cancel_reason + status 거절, 히스토리 시스템 메시지 */
  const handleCancelSubmit = async () => {
    if (!cancelModalLeadId) return
    const lead = leads.find((l) => l.id === cancelModalLeadId)
    if (!lead) return
    const reason = cancelReasonDraft.trim()
    if (!reason) {
      toast.error('거절 사유를 입력해 주세요.')
      return
    }
    const nextMeta = { ...(lead.metadata ?? {}), cancel_reason: reason }
    setLeads((prev) =>
      prev.map((l) =>
        l.id === cancelModalLeadId ? { ...l, status: '거절' as const, metadata: nextMeta } : l
      )
    )
    setCancelModalLeadId(null)
    setCancelReasonDraft('')
    try {
      const { error } = await supabase
        .from('consultations')
        .update({ metadata: nextMeta as Json, status: '거절' })
        .eq('id', cancelModalLeadId)
      if (error) throw error
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: cancelModalLeadId,
        event_type: 'status_change',
        actor_name: actor,
        detail: '상태가 [캔슬]로 변경되었습니다',
        metadata: { type: 'status_change', from_stage: lead.workflowStage, to_stage: '캔슬' },
      })
      toast.success('거절 처리되었습니다.')
      setListTab('거절')
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === cancelModalLeadId ? { ...l, status: lead.status, metadata: lead.metadata } : l
        )
      )
      toast.error('저장에 실패했습니다.')
    }
  }

  /** 상단 고정 토글 — metadata.pinned 반전 후 Supabase 저장 */
  const handlePin = async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const nextPinned = !lead.pinned
    const nextMeta = { ...(lead.metadata ?? {}), pinned: nextPinned }
    if (!nextPinned) delete (nextMeta as Record<string, unknown>).pinned
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pinned: nextPinned || undefined, metadata: nextMeta } : l)))
    await supabase.from('consultations').update({ metadata: nextMeta as Json }).eq('id', leadId)
  }

  /** 무효 처리 — 팝업 없이 즉시 status '무효' 저장 후 종료/캔슬 탭(무효건)으로 이동. 통계에서 제외 */
  const handleInvalidLead = async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || isEnded(lead)) return
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: '무효' as const } : l)))
    setListTab('무효')
    try {
      const { error } = await supabase.from('consultations').update({ status: '무효' }).eq('id', leadId)
      if (error) throw error
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: leadId,
        event_type: 'status_change',
        actor_name: actor,
        detail: '상태가 [무효]로 변경되었습니다',
        metadata: { type: 'status_change', from_stage: lead.workflowStage, to_stage: '무효' },
      })
      toast.success('무효 처리되었습니다.')
    } catch (err) {
      console.error(err)
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l)))
      toast.error('저장에 실패했습니다.')
    }
  }

  const handleAsClick = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    if (lead.asRequested || lead.status === 'AS') {
      handleToggleAs(leadId, false)
    } else {
      setAsModalLeadId(leadId)
      setAsReason('')
    }
  }

  const validIndustryValues = CONSULTATION_INDUSTRY_OPTIONS.map((o) => o.value)
  const handleEditClick = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const industryVal = lead.industry && validIndustryValues.includes(lead.industry as (typeof validIndustryValues)[number]) ? lead.industry : '기타'
    setEditForm({
      company: lead.company || '',
      name: lead.name || '',
      region: lead.region || '',
      industry: industryVal,
      contact: lead.contact || '',
      source: lead.source?.trim() || '채널톡',
      google_chat_url: lead.google_chat_url?.trim() ?? '',
      inboundDate: lead.inboundDate || '',
      requiredDate: lead.requiredDate || '',
      painPoint: lead.painPoint || '',
      customerTier: getValidCustomerTier(lead.customerTier),
    })
    setEditModalLeadId(leadId)
  }

  const handleEditSave = async () => {
    if (!editModalLeadId) return
    const lead = leads.find((l) => l.id === editModalLeadId)
    if (!lead) return
    // 업체명 수정 시: 새 시공 사진 업로드에는 수정된 업체명이 반영됨(파일명 규칙). 기존 이미지 display_name은 변경하지 않음.
    const company = editForm.company.trim()
    const name = editForm.name.trim()
    const contact = editForm.contact.trim()
    const region = editForm.region.trim()
    const industry = (editForm.industry && validIndustryValues.includes(editForm.industry as (typeof validIndustryValues)[number]) ? editForm.industry : '기타').trim()
    const inboundDate = (editForm.inboundDate ?? '').trim().slice(0, 10)
    const requiredDate = editForm.requiredDate.trim().slice(0, 10)
    const painPoint = editForm.painPoint.trim()
    const customerTier = getValidCustomerTier(editForm.customerTier)
    const sourceVal = editForm.source.trim() || null
    const googleChatUrlVal = editForm.google_chat_url.trim() || null
    const nextMeta = {
      ...(lead.metadata ?? {}),
      company_name: company || null,
      manager_name: name || null,
      region: region || null,
      industry: industry || null,
      source: sourceVal,
      google_chat_url: googleChatUrlVal,
      google_chat_pending: false,
      inbound_date: inboundDate || null,
      required_date: requiredDate || null,
      pain_point: painPoint || null,
      customer_tier: customerTier,
      display_name: computeDisplayName(company, contact, new Date(lead.createdAt)),
    }
    const updatedLead: Lead = {
      ...lead,
      company: company || lead.company,
      displayName: computeDisplayName(company, contact, new Date(lead.createdAt)),
      name: name || lead.name,
      contact,
      source: sourceVal ?? lead.source ?? undefined,
      region: region || lead.region,
      industry: industry || lead.industry,
      inboundDate: inboundDate || lead.inboundDate,
      requiredDate: requiredDate || lead.requiredDate,
      painPoint: painPoint || lead.painPoint,
      customerTier,
      metadata: nextMeta,
      google_chat_url: googleChatUrlVal ?? undefined,
      google_chat_pending: false,
    }
    const normalizedContact = normalizeContactForSync(contact)
    const sameContactLeadIds = isValidContactForSameCustomer(contact)
      ? leads
        .filter(
          (l) =>
            l.id !== editModalLeadId &&
            isValidContactForSameCustomer(l.contact) &&
            normalizeContactForSync(l.contact) === normalizedContact
        )
        .map((l) => l.id)
      : []
    const originalSameContactLeads = sameContactLeadIds.map((id) => leads.find((l) => l.id === id)!)

    setLeads((prev) =>
      prev.map((l) =>
        l.id === editModalLeadId
          ? updatedLead
          : sameContactLeadIds.includes(l.id)
            ? { ...l, customerTier, metadata: { ...(l.metadata ?? {}), customer_tier: customerTier } }
            : l
      )
    )
    setEditModalLeadId(null)
    try {
      // consultations 테이블 실제 컬럼에 맞춤. update_date는 시트/구글챗 기준이라 앱에서 갱신하지 않음.
      const updatePayload: Record<string, unknown> = {
        project_name: (company || lead.company || '(업체명 없음)').trim() || '(업체명 없음)',
        customer_phone: contact || null,
        customer_grade: customerTier,
        region: region || null,
        industry: industry || null,
        start_date: inboundDate && /^\d{4}-\d{2}-\d{2}$/.test(inboundDate) ? inboundDate : null,
        metadata: nextMeta as Json,
      }
      if (googleChatUrlVal) updatePayload.link = googleChatUrlVal
      const { error } = await supabase
        .from('consultations')
        .update(updatePayload as Record<string, Json | string | null>)
        .eq('id', editModalLeadId)
      if (error) throw error

      await fetchLeads()

      for (const otherId of sameContactLeadIds) {
        const other = leads.find((l) => l.id === otherId)
        if (!other) continue
        const otherMeta = { ...(other.metadata ?? {}), customer_tier: customerTier }
        await supabase.from('consultations').update({ metadata: otherMeta as Json }).eq('id', otherId)
      }

      toast.success('상담 정보를 수정했습니다.')
      if (sameContactLeadIds.length > 0) {
        toast.success(`동일 연락처 ${sameContactLeadIds.length}건의 등급이 '${customerTier}'로 일괄 반영되었습니다.`)
      }
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === editModalLeadId
            ? lead
            : sameContactLeadIds.includes(l.id)
              ? originalSameContactLeads.find((o) => o.id === l.id)!
              : l
        )
      )
      toast.error('수정에 실패했습니다.')
    }
  }

  /** 견적 확정 — 해당 버전만 is_final=true, 나머지 false, expected_revenue 동기화 */
  const handleSetEstimateFinal = async (leadId: string, version: number) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const history = [...lead.estimateHistory]
    const target = history.find((e) => e.version === version)
    if (!target) return
    const nextHistory = history.map((e) => ({ ...e, is_final: e.version === version }))
    const nextMeta = { ...(lead.metadata ?? {}), estimate_history: nextHistory }
    const displayAmount = target.amount

    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l
        const next = parseEstimateHistory(nextMeta as Record<string, unknown>)
        return {
          ...l,
          metadata: nextMeta,
          estimateHistory: next,
          displayAmount: getDisplayAmount(next, l.expectedRevenue),
          expectedRevenue: displayAmount,
        }
      })
    )
    try {
      const { error } = await supabase
        .from('consultations')
        .update({ metadata: nextMeta as Json, estimate_amount: displayAmount })
        .eq('id', leadId)
      if (error) throw error
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: leadId,
        event_type: 'estimate_approved',
        actor_name: actor,
        detail: `버전 ${version} 견적을 확정함`,
        metadata: { type: 'estimate_approved', version },
      })
      toast.success('해당 견적을 확정했습니다.')
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, metadata: lead.metadata, estimateHistory: lead.estimateHistory, displayAmount: lead.displayAmount, expectedRevenue: lead.expectedRevenue } : l))
      )
      toast.error('확정 처리에 실패했습니다.')
    }
  }

  /** 견적 확정 (estimates 테이블 행 기준) — approved_at 갱신, consultations.estimate_amount·status 견적·카드 금액 즉시 반영 */
  const handleSetEstimateFinalByEstimateId = async (leadId: string, estimateId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    const est = estimatesList.find((e) => e.id === estimateId && e.consultation_id === leadId)
    if (!lead || !est) return
    const approvedAt = new Date().toISOString()
    const grandTotal = Number(est.grand_total)
    setEstimatesList((prev) => prev.map((e) => (e.id === estimateId ? { ...e, approved_at: approvedAt } : e)))
    setLeads((prev) =>
      prev.map((l) => (l.id !== leadId ? l : { ...l, expectedRevenue: grandTotal, displayAmount: grandTotal, status: '견적' }))
    )
    try {
      const { error: estErr } = await supabase.from('estimates').update({ approved_at: approvedAt }).eq('id', estimateId)
      if (estErr) throw estErr
      const { error: conErr } = await supabase
        .from('consultations')
        .update({
          estimate_amount: grandTotal,
          status: '견적',
        })
        .eq('id', leadId)
      if (conErr) throw conErr
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: leadId,
        event_type: 'estimate_approved',
        actor_name: actor,
        detail: '업로드/저장 견적서를 확정함',
        metadata: { type: 'estimate_approved', estimate_id: estimateId },
      })
      toast.success('해당 견적을 확정했습니다.')
    } catch (err) {
      console.error(err)
      setEstimatesList((prev) => prev.map((e) => (e.id === estimateId ? { ...e, approved_at: est.approved_at } : e)))
      setLeads((prev) =>
        prev.map((l) =>
          l.id !== leadId ? l : { ...l, expectedRevenue: lead.expectedRevenue, displayAmount: lead.displayAmount, status: lead.status }
        )
      )
      toast.error('확정 처리에 실패했습니다.')
    }
  }

  /** 견적 추가 — version=기존 max+1, 발행일=오늘, is_final=false */
  const handleAddEstimate = async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const amount = Number(newEstimateForm.amount.replace(/\D/g, '')) || 0
    if (amount <= 0) {
      toast.error('금액을 입력해 주세요.')
      return
    }
    const maxVersion = lead.estimateHistory.length > 0 ? Math.max(...lead.estimateHistory.map((e) => e.version)) : 0
    const newItem: EstimateHistoryItem = {
      version: maxVersion + 1,
      issued_at: new Date().toISOString().slice(0, 10),
      amount,
      summary: newEstimateForm.summary.trim() || undefined,
      is_final: false,
    }
    const nextHistory = [...lead.estimateHistory, newItem].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
    const nextMeta = { ...(lead.metadata ?? {}), estimate_history: nextHistory }

    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l
        return {
          ...l,
          metadata: nextMeta,
          estimateHistory: nextHistory,
          displayAmount: getDisplayAmount(nextHistory, l.expectedRevenue),
        }
      })
    )
    setNewEstimateForm({ amount: '', summary: '' })
    try {
      const { error } = await supabase.from('consultations').update({ metadata: nextMeta as unknown as Json }).eq('id', leadId)
      if (error) throw error
      toast.success('견적을 추가했습니다.')
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, metadata: lead.metadata, estimateHistory: lead.estimateHistory, displayAmount: lead.displayAmount } : l))
      )
      toast.error('견적 추가에 실패했습니다.')
    }
  }

  /** 4단계 상담 단계 변경 — 낙관적 업데이트 후 metadata.workflow_stage + status 반영. DB consultation_status enum과 1:1 매핑. */
  const handleStageChange = async (leadId: string, stage: ConsultationStage) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const prevStage = lead.workflowStage
    const nextMeta = { ...(lead.metadata ?? {}), workflow_stage: stage }
    /** DB status 컬럼 매핑: 상담접수→접수, 견적중→견적, 계약완료→진행, 시공완료→완료 */
    const stageToStatus: Record<ConsultationStage, Lead['status']> = {
      상담접수: '접수',
      견적중: '견적',
      계약완료: '진행',
      시공완료: '완료',
    }
    const nextStatus = stageToStatus[stage]

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, workflowStage: stage, status: nextStatus } : l
      )
    )

    try {
      // update_date는 시트/구글챗 기준이라 앱에서 변경하지 않음
      const updatePayload: Record<string, unknown> = {
        metadata: nextMeta as Json,
        status: nextStatus,
      }
      const { error } = await supabase
        .from('consultations')
        .update(updatePayload)
        .eq('id', leadId)
      if (error) throw error
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: leadId,
        event_type: 'status_change',
        actor_name: actor,
        detail: `상태가 [${stage}]로 변경되었습니다`,
        metadata: { type: 'status_change', from_stage: prevStage, to_stage: stage },
      })
      setSelectedLead(leadId)
      setScrollToLeadId(leadId)
      if (stage === '시공완료') setListTab('종료')
      else if (stage === '상담접수') setListTab('미처리')
      else if (stage === '견적중') setListTab('견적중')
      else if (stage === '계약완료') setListTab('진행중')
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, workflowStage: prevStage, status: lead.status } : l
        )
      )
      toast.error('단계 변경에 실패했습니다.')
    }
  }

  /** 실측 도면 PDF 일시적 Signed URL로 미리보기 (모달·아카이브에서 사용) */
  const openMeasurementDrawingPreview = async (storagePath: string) => {
    const EXPIRES_IN = 300
    const { data, error } = await supabase.storage
      .from(MEASUREMENT_DRAWINGS_BUCKET)
      .createSignedUrl(storagePath, EXPIRES_IN)
    if (error) {
      toast.error('미리보기를 불러올 수 없습니다.')
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const fetchLeadsRef = useRef(fetchLeads)
  fetchLeadsRef.current = fetchLeads

  useEffect(() => {
    fetchLeads()
  }, [])

  // 구글 시트 → Supabase 반영 후 앱 캐시 무효화: 탭 전환 시 상담 리스트 재조회
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchLeadsRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /** 동일 location 재진입 시 역방향 견적 모달 중복 오픈 방지 (무한 루프·이중 실행 차단) */
  const lastLocationKeyRef = useRef<string | null>(null)

  /** 제품별 시공 현장·시공 사례 뱅크 등에서 링크로 진입 시 해당 상담 자동 선택 + 역방향 견적(제품 담기) */
  useEffect(() => {
    const state = location.state as {
      focusConsultationId?: string
      addEstimateProductName?: string
      openEstimateTab?: boolean
      openEstimateId?: string
    } | null
    const focusId =
      (state?.focusConsultationId != null ? String(state.focusConsultationId).trim() : null) ??
      (typeof location.search === 'string' ? new URLSearchParams(location.search).get('focus') : null) ??
      null
    const addProduct =
      state?.addEstimateProductName != null ? String(state.addEstimateProductName).trim() : ''
    const openEstimateId = state?.openEstimateId != null ? String(state.openEstimateId).trim() : null

    if (focusId && focusId.length > 0) {
      setSelectedLead(focusId)
      setScrollToLeadId(focusId)
      setHighlightedLeadId(focusId)
      setTimeout(() => setHighlightedLeadId(null), 2000)
      // 마이그레이션 등에서 openEstimateTab 요청 시 견적 탭으로 전환 → estimatesList 즉시 로드
      if (state?.openEstimateTab) {
        setDetailPanelTab('estimate')
      }
      // 마이그레이션 업로드 목록에서 행 클릭 시 견적 상세 팝업 오픈
      if (openEstimateId && openEstimateId.length > 0) {
        setPrintEstimateId(openEstimateId)
      }
    }

    if (addProduct.length > 0) {
      const locationKey =
        (location as { key?: string }).key ?? `${String(location.search)}-${addProduct}`
      if (lastLocationKeyRef.current === locationKey) return
      lastLocationKeyRef.current = locationKey

      setEstimateModalInitialData({
        rows: [
          {
            no: '1',
            name: addProduct,
            spec: '',
            qty: '1',
            unit: 'EA',
            unitPrice: '',
            costPrice: '',
            color: '',
          },
        ],
      })
      setEstimateModalOpen(true)
      setDetailPanelTab('estimate')
    }
  }, [location.state, location.search])

  // [DISABLED: 시스템 안정화] Real-time 구독 일시 중단 — 채널 오류로 인한 콘솔 에러 방지.
  // 재활성화 시 아래 주석 해제.
  // useEffect(() => {
  //   const channel = supabase
  //     .channel('consultations-realtime')
  //     .on(
  //       'postgres_changes',
  //       { event: 'INSERT', schema: 'public', table: 'consultations' },
  //       (payload) => {
  //         console.log('[Realtime] INSERT event received', payload)
  //         fetchLeadsRef.current()
  //       }
  //     )
  //     .on(
  //       'postgres_changes',
  //       { event: 'UPDATE', schema: 'public', table: 'consultations' },
  //       (payload) => {
  //         console.log('[Realtime] UPDATE event received', payload)
  //         fetchLeadsRef.current()
  //       }
  //     )
  //     .subscribe((status, err) => {
  //       if (status === 'SUBSCRIBED') {
  //         console.log('[Realtime] ✅ 구독 성공: consultations-realtime')
  //       } else if (status === 'TIMED_OUT') {
  //         console.warn('[Realtime] ⏱ 구독 타임아웃: consultations-realtime', err)
  //       } else if (status === 'CLOSED') {
  //         console.warn('[Realtime] 🔌 채널 닫힘: consultations-realtime', err)
  //       } else if (status === 'CHANNEL_ERROR') {
  //         console.error('[Realtime] ❌ 채널 오류: consultations-realtime', err)
  //       }
  //     })
  //   return () => {
  //     void supabase.removeChannel(channel)
  //   }
  // }, [])

  const selectedLeadData = selectedLead ? leads.find((l) => l.id === selectedLead) : null

  /** 상담 건 변경 시 견적서 모달 닫기 */
  useEffect(() => {
    setEstimateModalOpen(false)
  }, [selectedLead])

  /** 기존 마이그레이션 상담 동기화: metadata.estimate_history 비어있는데 estimates 있으면 보정 */
  useEffect(() => {
    if (!selectedLeadData?.id) return
    const meta = selectedLeadData.metadata ?? {}
    const isMigration =
      meta.migration_tag === '과거데이터' || meta.source === '마이그레이션'
    if (!isMigration || selectedLeadData.estimateHistory.length > 0) return

    let cancelled = false
    const consultationId = selectedLeadData.id
    const companyName = selectedLeadData.company || selectedLeadData.displayName || '마이그레이션'

    supabase
      .from('estimates')
      .select('id, grand_total, created_at, payload')
      .eq('consultation_id', consultationId)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .then(async ({ data: estList, error: estErr }) => {
        if (cancelled || estErr || !estList?.length) return

        const history = estList.map((e, i) => {
          const payload = (e.payload as Record<string, unknown>) ?? {}
          const issuedAt =
            (payload.quoteDate as string) ??
            (payload.estimateDate as string) ??
            (payload.quote_date as string) ??
            (e.created_at as string) ??
            new Date().toISOString()
          return {
            version: i + 1,
            issued_at: String(issuedAt).slice(0, 10),
            amount: Number(e.grand_total) || 0,
            summary: undefined,
            is_final: true,
          } as EstimateHistoryItem
        })
        const nextHistory = history.sort(
          (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
        )
        const nextMeta = {
          ...meta,
          estimate_history: nextHistory,
        } as unknown as Json

        const { error: updateErr } = await supabase
          .from('consultations')
          .update({ metadata: nextMeta })
          .eq('id', consultationId)
        if (updateErr) {
          console.error('[마이그레이션 동기화] metadata 업데이트 실패:', updateErr)
          return
        }

        const { data: existingMsgs } = await supabase
          .from('consultation_messages')
          .select('id, metadata')
          .eq('consultation_id', consultationId)
          .eq('message_type', 'SYSTEM')
        const loggedEstIds = new Set(
          (existingMsgs ?? [])
            .map((m) => (m.metadata as Record<string, unknown>)?.estimate_id as string)
            .filter(Boolean)
        )

        for (const e of estList) {
          if (loggedEstIds.has(e.id)) continue
          await insertSystemLog(supabase, {
            consultation_id: consultationId,
            event_type: 'estimate_issued',
            actor_name: companyName,
            detail: '견적서가 등록되었습니다. (마이그레이션)',
            metadata: { type: 'estimate_issued', estimate_id: e.id },
          })
        }

        if (cancelled) return
        setLeads((prev) =>
          prev.map((l) =>
            l.id !== consultationId
              ? l
              : {
                ...l,
                metadata: nextMeta as Record<string, unknown>,
                estimateHistory: nextHistory,
                displayAmount: getDisplayAmount(nextHistory, l.expectedRevenue),
              }
          )
        )
        toast.success('마이그레이션 견적 이력이 동기화되었습니다.')
      })

    return () => { cancelled = true }
  }, [selectedLeadData])

  /** [DISABLED: 400 에러] order_documents 테이블 조회 일시 중단 — 테이블 미존재 또는 스키마 불일치.
   * 재활성화 시 아래 주석 해제. */
  useEffect(() => {
    setOrderDocumentsList([])
  }, [selectedLead])
  // useEffect(() => {
  //   if (!selectedLead) {
  //     setOrderDocumentsList([])
  //     return
  //   }
  //   let cancelled = false
  //   supabase
  //     .from('order_documents')
  //     .select('id, consultation_id, storage_path, file_name, file_type, thumbnail_path, product_tags, document_category, created_at')
  //     .eq('consultation_id', selectedLead)
  //     .order('created_at', { ascending: false })
  //     .then(({ data, error }) => {
  //       if (cancelled) return
  //       if (error) {
  //         setOrderDocumentsList([])
  //         return
  //       }
  //       setOrderDocumentsList(
  //         (data ?? []).map((r) => ({
  //           id: r.id,
  //           consultation_id: r.consultation_id,
  //           storage_path: r.storage_path,
  //           file_name: r.file_name,
  //           file_type: r.file_type as OrderDocument['file_type'],
  //           thumbnail_path: r.thumbnail_path,
  //           product_tags: Array.isArray(r.product_tags) ? (r.product_tags as string[]) : [],
  //           document_category: ((r as { document_category?: string }).document_category ?? 'purchase_order') as OrderDocumentCategory,
  //           created_at: r.created_at,
  //         }))
  //       )
  //     })
  //   return () => {
  //     cancelled = true
  //   }
  // }, [selectedLead])

  /** 업로드 견적서(consultation_estimate_files) — AI 참조용 */
  useEffect(() => {
    if (!selectedLead) {
      setEstimateFilesList([])
      return
    }
    let cancelled = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- consultation_estimate_files 신규 테이블
      ; (supabase as any)
        .from('consultation_estimate_files')
        .select('id, consultation_id, project_name, storage_path, file_name, file_type, created_at, upload_type, quote_date')
        .eq('consultation_id', selectedLead)
        .order('created_at', { ascending: false })
        .then(({ data, error }: { data: ConsultationEstimateFile[] | null; error: Error | null }) => {
          if (cancelled) return
          if (error) {
            setEstimateFilesList([])
            return
          }
          setEstimateFilesList((data ?? []) as ConsultationEstimateFile[])
        })
    return () => { cancelled = true }
  }, [selectedLead])

  /** 상담 전환 시 견적 선택 초기화 — 다른 상담에서 선택한 ID가 남아 있으면 "저장된 견적서 없음"인데 "1건 선택"으로 삭제 시도 시 실패함 */
  useEffect(() => {
    setSelectedEstimateIds([])
  }, [selectedLead])

  /** 현재 상담 건의 견적서 목록 조회 (estimates 테이블) — 상담 선택 시 항상 로드해 견적 이력 N건/다이얼로그에 반영 */
  useEffect(() => {
    if (!selectedLead) {
      setEstimatesList([])
      return
    }
    let cancelled = false
    setEstimatesLoading(true)
    supabase
      .from('estimates')
      .select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at')
      .eq('consultation_id', selectedLead)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setEstimatesLoading(false)
        if (error) {
          console.error(error)
          setEstimatesList([])
          return
        }
        setEstimatesList((data ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
      })
    return () => { cancelled = true }
  }, [selectedLead, estimateListRefreshKey])

  const leadIds = useMemo(() => leads.map((l) => l.id), [leads])
  /** 카드별 견적 이력 N건 — estimates 테이블 consultation_id별 행 개수 (DB 일원화) */
  useEffect(() => {
    if (leadIds.length === 0) {
      setEstimateCountByConsultationId({})
      return
    }
    let cancelled = false
    supabase
      .from('estimates')
      .select('consultation_id')
      .eq('is_visible', true)
      .in('consultation_id', leadIds)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setEstimateCountByConsultationId({})
          return
        }
        const countMap: Record<string, number> = {}
        for (const row of data ?? []) {
          const cid = (row as { consultation_id: string }).consultation_id
          if (cid) countMap[cid] = (countMap[cid] ?? 0) + 1
        }
        setEstimateCountByConsultationId(countMap)
      })
    return () => { cancelled = true }
  }, [leadIds.join(','), estimateListRefreshKey])

  /** 동일 전화번호 과거 상담 조회 — 상담 히스토리 탭 통합 표시 */
  useEffect(() => {
    const phone = selectedLeadData?.contact?.trim()
    if (!phone) {
      setSamePhoneConsultations([])
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (!isValidContactForSameCustomer(phone)) {
      setSamePhoneConsultations([])
      return
    }
    let cancelled = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC get_consultations_by_phone 미생성 타입
      ; (supabase as any)
        .rpc('get_consultations_by_phone', { phone_digits: digits })
        .then(({ data, error }: { data: Array<{ id: string; project_name: string | null; created_at: string; status: string | null; estimate_amount: number | null }> | null; error: Error | null }) => {
          if (cancelled) return
          if (error) {
            setSamePhoneConsultations([])
            return
          }
          setSamePhoneConsultations(data ?? [])
        })
    return () => { cancelled = true }
  }, [selectedLeadData?.id, selectedLeadData?.contact])

  /** AI 추천 가이드용 과거 견적 로드 (견적 모달 오픈 시 최근 200건 — 마이그레이션·과거 이력 포함) */
  useEffect(() => {
    if (!estimateModalOpen) return
    let cancelled = false
    supabase
      .from('estimates')
      .select('id, consultation_id, payload, final_proposal_data, approved_at, created_at')
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled || error) return
        setPastEstimatesForGuide((data ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; approved_at: string | null; created_at: string }>)
      })
    return () => { cancelled = true }
  }, [estimateModalOpen])

  /** AI 추천용 과거 견적 (전체 상담 80건 + 현재 상담 견적 병합) */
  const mergedPastEstimatesForGuide = useMemo(() => {
    const byId = new Map<string, typeof pastEstimatesForGuide[0]>()
    for (const e of pastEstimatesForGuide) byId.set(e.id, e)
    for (const e of estimatesList) {
      if (!byId.has(e.id)) byId.set(e.id, { id: e.id, consultation_id: e.consultation_id, payload: e.payload, final_proposal_data: e.final_proposal_data, approved_at: e.approved_at, created_at: e.created_at })
    }
    return Array.from(byId.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [pastEstimatesForGuide, estimatesList])

  /** 필터 적용 견적 목록 (전체 / 임시 저장만) — 기간 제한 없이 해당 고객의 모든 과거 견적. 최신순 정렬 */
  const filteredEstimateList = useMemo(() => {
    const base = estimateListFilter === 'draft' ? estimatesList.filter((e) => !e.approved_at) : estimatesList
    return [...base].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [estimatesList, estimateListFilter])

  /** 현재 목록에 없는 선택 ID 제거 (상담 전환·필터 변경 시 스테일 선택 방지) */
  useEffect(() => {
    const validIds = new Set(filteredEstimateList.map((e) => e.id))
    setSelectedEstimateIds((prev) => (prev.some((id) => !validIds.has(id)) ? prev.filter((id) => validIds.has(id)) : prev))
  }, [filteredEstimateList])

  /** 연도별 그룹 — 리스트 렌더링용. { year: number, items: [] }[] 형태 */
  const estimateListByYear = useMemo(() => {
    const groups = new Map<number, typeof filteredEstimateList>()
    for (const est of filteredEstimateList) {
      const y = new Date(est.created_at).getFullYear()
      if (!groups.has(y)) groups.set(y, [])
      groups.get(y)!.push(est)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, items]) => ({ year, items }))
  }, [filteredEstimateList])

  /** 1년 경과 여부 — 아카이브 스타일용 (created_at 기준) */
  const archiveCutoff = useMemo(() => startOfDay(subMonths(new Date(), 12)).getTime(), [])

  /** 상세 패널 금액: 발행(approved_at)된 견적이 있으면 최신 건 금액 표시. 업로드 저장=곧바로 확정 반영, 시스템 내 작성=최종 승인 시 확정 */
  const validatedDisplayAmount = useMemo(() => {
    if (!selectedLeadData || selectedLead !== selectedLeadData.id) return null
    const approved = estimatesList.filter((e) => e.approved_at != null)
    if (approved.length === 0) return 0
    const sorted = [...approved].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return Number(sorted[0].grand_total ?? 0)
  }, [selectedLeadData, selectedLead, estimatesList])

  /** 견적 파일 업로드 완료 핸들러 — ConsultationEstimateTab으로 전달 */
  const handleEstimateFileUploadComplete = useCallback((payload?: { estimateAmount: number }) => {
    if (!selectedLeadData) return
    if (payload?.estimateAmount != null) {
      pendingEstimateAmountRef.current[selectedLeadData.id] = payload.estimateAmount
      setLeads((prev) =>
        prev.map((l) =>
          l.id !== selectedLeadData.id
            ? l
            : {
              ...l,
              displayAmount: payload.estimateAmount,
              expectedRevenue: payload.estimateAmount,
              status: '견적',
            }
        )
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- consultation_estimate_files 신규 테이블
    ; (supabase as any)
      .from('consultation_estimate_files')
      .select('id, consultation_id, project_name, storage_path, file_name, file_type, created_at, upload_type, quote_date')
      .eq('consultation_id', selectedLeadData.id)
      .order('created_at', { ascending: false })
      .then(({ data }: { data: ConsultationEstimateFile[] | null }) => {
        if (data) setEstimateFilesList(data)
      })
    setEstimateListRefreshKey((k) => k + 1)
    if (selectedLeadData.workflowStage !== '견적중') {
      handleStageChange(selectedLeadData.id, '견적중')
    }
    void fetchLeads()
  }, [selectedLeadData, pendingEstimateAmountRef, setLeads, setEstimateFilesList, setEstimateListRefreshKey, handleStageChange, fetchLeads])

  const handleTakeoutImportToConsultation = useCallback(async (payload: {
    candidate: { assetUrl: string; fileName: string; spaceId: string; spaceIdNormalized: string }
    consultationId: string
  }) => {
    const response = await fetch(payload.candidate.assetUrl)
    if (!response.ok) throw new Error('선택한 이미지를 불러오지 못했습니다.')
    const blob = await response.blob()
    const file = new File([blob], payload.candidate.fileName, {
      type: blob.type || 'image/png',
      lastModified: Date.now(),
    })

    setSelectedLead(payload.consultationId)
    setDetailPanelTab('estimate')
    setPendingTakeoutImport({
      consultationId: payload.consultationId,
      file,
      requestId: `${payload.consultationId}-${payload.candidate.fileName}-${Date.now()}`,
    })

    const targetLead = leads.find((lead) => lead.id === payload.consultationId)
    const targetName = targetLead?.displayName || targetLead?.company || '해당 상담카드'
    toast.success(`${targetName}의 AI 검수 미리보기로 이미지를 불러왔습니다.`)
  }, [leads])

  /** 선택한 견적 물리 삭제 후 상담 카드 금액/상태 동기화 */
  const handleDeleteSelectedEstimates = useCallback(async () => {
    if (!selectedLeadData || selectedEstimateIds.length === 0) return
    const consultationId = selectedLeadData.id
    const currentIds = new Set(estimatesList.map((e) => e.id))
    const idsToDelete = selectedEstimateIds.filter((id) => currentIds.has(id))
    if (idsToDelete.length === 0) {
      setSelectedEstimateIds([])
      setEstimateDeleteConfirmOpen(false)
      toast.warning('선택한 견적이 현재 목록에 없습니다. 이미 삭제되었을 수 있어 목록을 갱신합니다.')
      // 이미 삭제된 상태일 수 있으므로 남은 견적 기준으로 DB·카드 금액 동기화
      try {
        const { data: remaining } = await supabase
          .from('estimates')
          .select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at')
          .eq('consultation_id', consultationId)
          .eq('is_visible', true)
          .order('created_at', { ascending: false })
        const list = (remaining ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>
        setEstimatesList(list)
        const approvedOnly = list.filter((e) => e.approved_at != null).sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())
        const newHistory: EstimateHistoryItem[] = approvedOnly.map((e, i) => ({
          version: i + 1,
          issued_at: (e.approved_at ?? e.created_at).toString().slice(0, 10),
          amount: Number(e.grand_total ?? 0),
          summary: undefined,
          is_final: i === 0,
        }))
        const newDisplayAmount = getDisplayAmount(newHistory, 0)
        const newMeta = { ...(selectedLeadData.metadata ?? {}), estimate_history: newHistory }
        if (list.length === 0) {
          delete (newMeta as Record<string, unknown>).final_amount
          delete (newMeta as Record<string, unknown>).final_estimate_id
            ; (newMeta as Record<string, unknown>).workflow_stage = '상담접수'
        }
        const updatePayload: { metadata: Json; estimate_amount: number; status?: Lead['status'] } = { metadata: newMeta as unknown as Json, estimate_amount: newDisplayAmount }
        if (list.length === 0) updatePayload.status = '접수'
        await supabase.from('consultations').update(updatePayload).eq('id', consultationId)
        delete pendingEstimateAmountRef.current[consultationId]
        setLeads((prev) =>
          prev.map((l) =>
            l.id !== consultationId
              ? l
              : {
                ...l,
                metadata: newMeta,
                estimateHistory: newHistory,
                displayAmount: newDisplayAmount,
                expectedRevenue: newDisplayAmount,
                finalAmount: approvedOnly.length > 0 ? newDisplayAmount : null,
                ...(list.length === 0 ? { status: '접수' as const, workflowStage: '상담접수' as const } : {}),
              }
          )
        )
      } catch (_e) {
        // 동기화 실패해도 무시
      }
      return
    }
    setEstimateDeleting(true)
    try {
      const { error } = await supabase.from('estimates').delete().in('id', idsToDelete)
      if (error) throw error

      const { data: remaining } = await supabase
        .from('estimates')
        .select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at')
        .eq('consultation_id', consultationId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })

      const list = (remaining ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>
      setEstimatesList(list)

      const approvedOnly = list
        .filter((e) => e.approved_at != null)
        .sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())
      const newHistory: EstimateHistoryItem[] = approvedOnly.map((e, i) => ({
        version: i + 1,
        issued_at: (e.approved_at ?? e.created_at).toString().slice(0, 10),
        amount: Number(e.grand_total ?? 0),
        summary: undefined,
        is_final: i === 0,
      }))
      const newDisplayAmount = getDisplayAmount(newHistory, 0)
      const newMeta = { ...(selectedLeadData.metadata ?? {}), estimate_history: newHistory }
      const hadFinalId = selectedLeadData.metadata?.final_estimate_id as string | undefined
      const deletedFinal = hadFinalId && idsToDelete.includes(hadFinalId)
      if (deletedFinal || list.length === 0) {
        delete (newMeta as Record<string, unknown>).final_amount
        delete (newMeta as Record<string, unknown>).final_estimate_id
      }
      if (list.length === 0) {
        (newMeta as Record<string, unknown>).workflow_stage = '상담접수'
      }

      delete pendingEstimateAmountRef.current[consultationId]
      setLeads((prev) =>
        prev.map((l) =>
          l.id !== consultationId
            ? l
            : {
              ...l,
              metadata: newMeta,
              estimateHistory: newHistory,
              displayAmount: newDisplayAmount,
              expectedRevenue: newDisplayAmount,
              ...(list.length === 0 ? { status: '접수' as const, workflowStage: '상담접수' as const } : {}),
              ...(deletedFinal || list.length === 0 ? { finalAmount: null } : {}),
            }
        )
      )
      setSelectedEstimateIds([])
      setEstimateDeleteConfirmOpen(false)

      const updatePayload: { metadata: Json; estimate_amount: number; status?: Lead['status'] } = {
        metadata: newMeta as unknown as Json,
        estimate_amount: newDisplayAmount,
      }
      if (list.length === 0) updatePayload.status = '접수'

      const { error: updateError } = await supabase.from('consultations').update(updatePayload).eq('id', consultationId)
      if (updateError) {
        console.error('견적 삭제 후 consultations 갱신 실패:', updateError)
        toast.warning('견적은 삭제되었으나 카드 금액 갱신에 실패했습니다. 새로고침해 주세요.')
      } else {
        toast.success(`${idsToDelete.length}건의 견적이 삭제되었습니다.`)
      }
    } catch (err) {
      console.error('견적 삭제 실패:', err)
      toast.error('견적 삭제에 실패했습니다.')
    } finally {
      setEstimateDeleting(false)
    }
  }, [selectedLeadData, selectedEstimateIds, estimatesList])

  /** 기존 견적 이력에서 선택한 견적을 이 상담의 최종 견적로 연결 — 카드 최종 견적가에 반영 */
  const handleSetFinalEstimate = useCallback(
    async (estimateId: string) => {
      if (!selectedLeadData) return
      const consultationId = selectedLeadData.id
      const est = estimatesList.find((e) => e.id === estimateId && e.consultation_id === consultationId)
      if (!est) {
        toast.error('해당 견적을 찾을 수 없습니다.')
        return
      }
      const grandTotal = Number(est.grand_total ?? 0)
      const approvedOnly = estimatesList
        .filter((e) => e.approved_at != null)
        .sort((a, b) => new Date(b.approved_at ?? b.created_at).getTime() - new Date(a.approved_at ?? a.created_at).getTime())
      const newHistory: EstimateHistoryItem[] = approvedOnly.map((e, i) => ({
        version: i + 1,
        issued_at: (e.approved_at ?? e.created_at).toString().slice(0, 10),
        amount: Number(e.grand_total ?? 0),
        summary: undefined,
        is_final: e.id === estimateId,
      }))
      const newMeta = {
        ...(selectedLeadData.metadata ?? {}),
        final_estimate_id: estimateId,
        final_amount: grandTotal,
        estimate_history: newHistory,
      } as Record<string, unknown>
      try {
        const { error } = await supabase
          .from('consultations')
          .update({
            metadata: newMeta as unknown as Json,
            estimate_amount: grandTotal,
          })
          .eq('id', consultationId)
        if (error) throw error
        setLeads((prev) =>
          prev.map((l) =>
            l.id !== consultationId
              ? l
              : {
                ...l,
                metadata: newMeta,
                estimateHistory: newHistory,
                displayAmount: grandTotal,
                expectedRevenue: grandTotal,
                finalAmount: grandTotal,
              }
          )
        )
        delete pendingEstimateAmountRef.current[consultationId]
        toast.success(`해당 견적을 최종 견적로 지정했습니다. (${grandTotal.toLocaleString()}원)`)
      } catch (err) {
        console.error('최종 견적 지정 실패:', err)
        toast.error('최종 견적 지정에 실패했습니다.')
      }
    },
    [selectedLeadData, estimatesList]
  )

  /** 견적서 승인 시 estimates 테이블 저장 + metadata.estimate_history 동기화 + 시스템 로그. existingEstimateId 있으면 해당 행을 확정(update), 없으면 insert */
  const handleEstimateApproved = async (
    consultationId: string,
    data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number },
    existingEstimateId?: string
  ) => {
    const lead = leads.find((l) => l.id === consultationId)
    if (!lead) return
    if (!isValidUUID(consultationId)) {
      toast.error('유효한 상담 ID가 아닙니다.')
      return
    }
    try {
      const approvedAt = new Date().toISOString()
      const snapshot = { ...data, mode: 'FINAL' as const } as EstimateFormData
      let estimateId: string
      if (existingEstimateId) {
        const { error: updateError } = await supabase
          .from('estimates')
          .update({
            payload: data as unknown as Json,
            final_proposal_data: snapshot as unknown as Json,
            supply_total: data.supplyTotal,
            vat: data.vat,
            grand_total: data.grandTotal,
            approved_at: approvedAt,
          })
          .eq('id', existingEstimateId)
        if (updateError) throw updateError
        estimateId = existingEstimateId
      } else {
        const { data: insertedEst, error: insertError } = await supabase
          .from('estimates')
          .insert({
            consultation_id: consultationId,
            payload: data as unknown as Json,
            final_proposal_data: snapshot as unknown as Json,
            supply_total: data.supplyTotal,
            vat: data.vat,
            grand_total: data.grandTotal,
            approved_at: approvedAt,
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        estimateId = insertedEst?.id ?? ''
      }

      const maxVersion = lead.estimateHistory.length > 0 ? Math.max(...lead.estimateHistory.map((e) => e.version)) : 0
      const newItem: EstimateHistoryItem = {
        version: maxVersion + 1,
        issued_at: new Date().toISOString().slice(0, 10),
        amount: data.grandTotal,
        summary: undefined,
        is_final: false,
      }
      const nextHistory = [...lead.estimateHistory, newItem].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
      const nextMeta = { ...(lead.metadata ?? {}), estimate_history: nextHistory }

      const updatePayload: { metadata: Json; status?: Lead['status'] } = { metadata: nextMeta as unknown as Json }
      if (data.mode !== 'PROPOSAL') updatePayload.status = '견적'

      const { error: updateError } = await supabase.from('consultations').update(updatePayload).eq('id', consultationId)
      if (updateError) throw updateError

      setLeads((prev) =>
        prev.map((l) =>
          l.id !== consultationId
            ? l
            : {
              ...l,
              metadata: nextMeta,
              estimateHistory: nextHistory,
              displayAmount: getDisplayAmount(nextHistory, l.expectedRevenue),
              ...(data.mode === 'FINAL' ? { status: '견적' as const } : {}),
            }
        )
      )
      const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).eq('is_visible', true).order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
      await supabase.from('consultation_messages').insert({
        consultation_id: consultationId,
        sender_id: 'system',
        content: '확정 견적서가 발행되었습니다.',
        message_type: 'SYSTEM',
        metadata: { type: 'estimate_issued', estimate_id: estimateId },
      })
      setEstimateModalOpen(false)
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: consultationId,
        event_type: 'estimate_issued',
        actor_name: actor,
        detail: '확정 견적서 발행',
        metadata: { type: 'estimate_issued', estimate_id: estimateId },
      })
      setAdminPreviewOpen(false)
      setAdminPreviewData(null)
      setAdminPreviewEstimateId(null)
      toast.success('확정 견적서가 발행되었습니다. 견적 관리에서 링크 복사 및 PDF 다운로드를 이용하세요.')
    } catch (err) {
      console.error(err)
      toast.error('견적서 저장에 실패했습니다.')
    }
  }

  /** 예산 기획안 최종 발행: APPROVED 저장 + 채팅 알림 + 모달 닫기. existingEstimateId 있으면 해당 행 확정(update), 없으면 insert */
  const handleProposalFinalPublish = async (
    consultationId: string,
    data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number },
    existingEstimateId?: string
  ) => {
    const lead = leads.find((l) => l.id === consultationId)
    if (!lead) return
    if (!isValidUUID(consultationId)) {
      toast.error('유효한 상담 ID가 아닙니다.')
      return
    }
    try {
      const approvedAt = new Date().toISOString()
      const snapshot = { ...data, mode: 'PROPOSAL' as const } as EstimateFormData
      let estimateId: string
      if (existingEstimateId) {
        const { error: updateError } = await supabase
          .from('estimates')
          .update({
            payload: data as unknown as Json,
            final_proposal_data: snapshot as unknown as Json,
            supply_total: data.supplyTotal,
            vat: data.vat,
            grand_total: data.grandTotal,
            approved_at: approvedAt,
          })
          .eq('id', existingEstimateId)
        if (updateError) throw updateError
        estimateId = existingEstimateId
      } else {
        const { data: insertedEst, error: insertError } = await supabase
          .from('estimates')
          .insert({
            consultation_id: consultationId,
            payload: data as unknown as Json,
            final_proposal_data: snapshot as unknown as Json,
            supply_total: data.supplyTotal,
            vat: data.vat,
            grand_total: data.grandTotal,
            approved_at: approvedAt,
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        estimateId = insertedEst?.id ?? ''
      }

      const maxVersion = lead.estimateHistory.length > 0 ? Math.max(...lead.estimateHistory.map((e) => e.version)) : 0
      const newItem: EstimateHistoryItem = {
        version: maxVersion + 1,
        issued_at: approvedAt.slice(0, 10),
        amount: data.grandTotal,
        summary: undefined,
        is_final: false,
      }
      const nextHistory = [...lead.estimateHistory, newItem].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
      const nextMeta = { ...(lead.metadata ?? {}), estimate_history: nextHistory }
      const { error: updateError } = await supabase.from('consultations').update({ metadata: nextMeta as unknown as Json }).eq('id', consultationId)
      if (updateError) throw updateError

      setLeads((prev) =>
        prev.map((l) =>
          l.id !== consultationId ? l : { ...l, metadata: nextMeta, estimateHistory: nextHistory, displayAmount: getDisplayAmount(nextHistory, l.expectedRevenue) }
        )
      )
      const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).eq('is_visible', true).order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)

      await supabase.from('consultation_messages').insert({
        consultation_id: consultationId,
        sender_id: 'system',
        content: '기획안이 발행되었습니다.',
        message_type: 'SYSTEM',
        metadata: { type: 'proposal_issued', estimate_id: estimateId },
      })

      setAdminPreviewOpen(false)
      setAdminPreviewData(null)
      setAdminPreviewEstimateId(null)
      setEstimateModalOpen(false)
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: consultationId,
        event_type: 'estimate_issued',
        actor_name: actor,
        detail: '예산 기획안 발행',
        metadata: { type: 'estimate_issued', estimate_id: estimateId },
      })
      toast.success('예산 기획안이 발행되었습니다. 견적 관리에서 링크 복사 및 PDF 다운로드를 이용하세요.')
    } catch (err) {
      console.error(err)
      toast.error('예산 기획안 발행에 실패했습니다.')
    }
  }

  /** 견적서 임시저장 — payload에 draft: true, DB에만 반영. 저장 = 확정이므로 approved_at 자동 설정 */
  const handleEstimateSaveDraft = async (consultationId: string) => {
    const formHandle = estimateFormRef.current
    if (!formHandle) return
    const data = formHandle.getCurrentData()
    const payload = { ...data, draft: true } as unknown as Record<string, unknown>
    const approvedAt = new Date().toISOString()
    try {
      if (estimateModalEditId) {
        const { error } = await supabase
          .from('estimates')
          .update({
            payload: payload as Json,
            supply_total: data.supplyTotal,
            vat: data.vat,
            grand_total: data.grandTotal,
            approved_at: approvedAt,
          })
          .eq('id', estimateModalEditId)
        if (error) throw error
        toast.success('임시저장되었습니다.')
      } else {
        if (!isValidUUID(consultationId)) {
          toast.error('유효한 상담 ID가 아닙니다.')
          return
        }
        const { error } = await supabase.from('estimates').insert({
          consultation_id: consultationId,
          payload: payload as Json,
          supply_total: data.supplyTotal,
          vat: data.vat,
          grand_total: data.grandTotal,
          approved_at: approvedAt,
        })
        if (error) throw error
        toast.success('임시저장되었습니다.')
      }
      const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).eq('is_visible', true).order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
    } catch (err) {
      console.error(err)
      toast.error('임시저장에 실패했습니다.')
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <main className="flex-1 min-w-0 flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">상담 관리</h1>
          <div className="flex items-center gap-2">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>새로운 상담 등록</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitConsultation} className="space-y-4">
                  {/* 1. 업체명 (가장 먼저) */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      업체명 <span className="text-destructive">*</span>
                    </label>
                    <Input
                      className={INPUT_CLASS}
                      placeholder="예: OO학원"
                      value={form.companyName}
                      onChange={(e) => setFormField('companyName', e.target.value)}
                      required
                    />
                  </div>
                  {/* 2. 지역 · 3. 업종 (업체명 다음) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">지역</label>
                      <Input
                        className={INPUT_CLASS}
                        placeholder="예: 서울 강남구"
                        value={form.region}
                        onChange={(e) => setFormField('region', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">업종</label>
                      <select
                        className={`w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-relaxed ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[2.5rem] [&>option]:py-2`}
                        value={form.industry}
                        onChange={(e) => setFormField('industry', e.target.value)}
                      >
                        <option value="">선택</option>
                        {CONSULTATION_INDUSTRY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} className="py-2">
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* 4. 고객명(직함) */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      고객명(직함) <span className="text-destructive">*</span>
                    </label>
                    <Input
                      className={INPUT_CLASS}
                      placeholder="예: 김담당(원장)"
                      value={form.managerName}
                      onChange={(e) => setFormField('managerName', e.target.value)}
                      required
                    />
                  </div>
                  {/* 5. 연락처 — 단일 필드, 자동 하이픈(010-1234-5678) */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      연락처 <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      className={INPUT_CLASS}
                      placeholder="010-1234-5678"
                      value={form.contact}
                      onChange={(e) => setFormField('contact', formatContactInput(e.target.value))}
                      maxLength={13}
                      required
                    />
                  </div>
                  {/* 6. 인입채널 — consultations.metadata.source에 저장, 기본값 채널톡 */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">인입채널(상담경로)</label>
                    <select
                      className={`w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}
                      value={form.source || '채널톡'}
                      onChange={(e) => {
                        const v = e.target.value
                        setForm((prev) => ({ ...prev, source: v, orderNumber: isMarketSource(v) ? prev.orderNumber : '' }))
                      }}
                    >
                      {CONSULT_SOURCES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* 6-1. 오픈마켓 선택 시 주문번호 */}
                  {isMarketSource(form.source) && (
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">주문번호</label>
                      <Input
                        className={INPUT_CLASS}
                        placeholder="마켓에서 발급한 주문번호 입력"
                        value={form.orderNumber}
                        onChange={(e) => setFormField('orderNumber', e.target.value)}
                      />
                    </div>
                  )}
                  {/* 7. 평수 · 8. 필요날짜 (견적 핵심, 입력 편하게) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">평수</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className={INPUT_CLASS}
                        placeholder="예: 50"
                        value={form.areaSqm}
                        onChange={(e) => setFormField('areaSqm', e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">필요날짜</label>
                      <Input
                        type="date"
                        className={INPUT_CLASS}
                        value={form.requiredDate}
                        onChange={(e) => setFormField('requiredDate', e.target.value)}
                      />
                    </div>
                  </div>
                  {/* 9. 페인포인트(요청사항) — metadata.pain_point */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      페인포인트(요청사항)
                    </label>
                    <textarea
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-3 text-base leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 resize-y"
                      placeholder="예: 예산 내에 학원 책상 50조 교체 희망, 3월 개강 전 완료 원함"
                      value={form.painPoint}
                      onChange={(e) => setFormField('painPoint', e.target.value)}
                      rows={4}
                    />
                  </div>
                  {/* 10. 고객 등급(성격) — metadata.customer_tier, 키워드 기반 추천(Mock) */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">고객 등급</label>
                    <select
                      className={`w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}
                      value={form.customerTier}
                      onChange={(e) => setFormField('customerTier', getValidCustomerTier(e.target.value))}
                    >
                      {CUSTOMER_TIERS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {(() => {
                      const suggested = suggestCategory(form.companyName, form.painPoint)
                      if (suggested === form.customerTier) return null
                      return (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">키워드 추천: {suggested}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFormField('customerTier', suggested)}>추천 적용</Button>
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={BUTTON_SUBMIT_CLASS}
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      취소
                    </Button>
                    <Button type="submit" className={BUTTON_SUBMIT_CLASS} disabled={isSubmitting}>
                      {isSubmitting ? '등록 중…' : '등록하기'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Link to="/dashboard">
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1.5 px-4 text-sm"
              >
                <LayoutDashboard className="h-4 w-4" />
                대시보드
              </Button>
            </Link>
            <Link to="/showroom">
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1.5 px-4 text-sm"
              >
                <Images className="h-4 w-4" />
                시공사례 쇼룸
              </Button>
            </Link>
            <Link to="/image-assets">
              <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                이미지 자산 관리
              </Button>
            </Link>
          </div>
        </div>

        {/* AS 요청 모달 — 최소 입력(AS 사유 한 줄) 후 바로 저장 */}
        <Dialog open={!!asModalLeadId} onOpenChange={(open) => !open && setAsModalLeadId(null)}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>AS 요청</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-sm font-medium block mb-1">AS 사유 (선택)</label>
                <Input
                  value={asReason}
                  onChange={(e) => setAsReason(e.target.value)}
                  placeholder="한 줄로 입력"
                  className="h-9 text-sm"
                  maxLength={120}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="h-9" onClick={() => { setAsModalLeadId(null); setAsReason('') }}>
                  취소
                </Button>
                <Button size="sm" className="h-9" onClick={() => asModalLeadId && handleToggleAs(asModalLeadId, true, asReason.trim() || undefined)}>
                  저장
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 거절 사유 입력 모달 — 반드시 사유 입력 후 저장, metadata.cancel_reason + status 거절 */}
        <Dialog open={!!cancelModalLeadId} onOpenChange={(open) => { if (!open) { setCancelModalLeadId(null); setCancelReasonDraft('') } }}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>거절 사유 입력</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-sm font-medium block mb-1">거절 사유</label>
                <Input
                  value={cancelReasonDraft}
                  onChange={(e) => setCancelReasonDraft(e.target.value)}
                  placeholder="사유를 입력하세요 (필수)"
                  className="h-9 text-sm"
                  maxLength={300}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="h-9" onClick={() => { setCancelModalLeadId(null); setCancelReasonDraft('') }}>
                  취소
                </Button>
                <Button size="sm" className="h-9" onClick={handleCancelSubmit}>
                  저장
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 상담 숨기기 확인 — 네이티브 confirm 대신 앱 내 Dialog로 표시 */}
        <Dialog open={!!hideConfirmLeadId} onOpenChange={(open) => { if (!open) setHideConfirmLeadId(null) }}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>이 상담 숨기기</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground pt-1">
              이 상담을 숨깁니다. 리스트와 통계에서 제외되며, 관리자 아카이브에서만 볼 수 있습니다. 계속할까요?
            </p>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" size="sm" onClick={() => setHideConfirmLeadId(null)}>
                취소
              </Button>
              <Button size="sm" variant="destructive" onClick={() => hideConfirmLeadId && handleHideLead(hideConfirmLeadId)}>
                숨기기
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 상담 정보 수정 모달 — 업체명·지역·업종·전화·인입일·필요일·요청사항 */}
        {/* 실측 자료(PDF) — legacy 실측 도면 미리보기용 모달 */}
        <Dialog open={measurementModalOpen && !!selectedLeadData} onOpenChange={(open) => !open && setMeasurementModalOpen(false)}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                실측 자료
              </DialogTitle>
            </DialogHeader>
            {selectedLeadData && (
              <div className="space-y-4 pt-1">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedLeadData.company || '(업체명 없음)'}</span> — 발주서·배치도는 실측 탭에서 업로드합니다.
                </p>
                {selectedLeadData.measurementDrawingPath ? (
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => openMeasurementDrawingPreview(selectedLeadData.measurementDrawingPath!)}>
                    <FileText className="h-4 w-4" />
                    PDF 미리보기 (일시적 링크)
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">실측 도면 PDF가 없습니다.</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* 견적 이력 팝업 — 발행 목록 + 확정하기 + 견적 추가 */}
        <Dialog open={!!estimateModalLeadId} onOpenChange={(open) => { if (!open) { setEstimateModalLeadId(null); setNewEstimateForm({ amount: '', summary: '' }) } }}>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>견적 이력</DialogTitle>
            </DialogHeader>
            {estimateModalLeadId && (() => {
              const lead = leads.find((l) => l.id === estimateModalLeadId)
              if (!lead) return null
              const fromEstimates =
                lead.id === selectedLead
                  ? estimatesList.map((e, i) => ({
                    estimateId: e.id,
                    version: i + 1,
                    issued_at: e.created_at.slice(0, 10),
                    amount: e.grand_total,
                    summary: (e.payload?.summary as string) || undefined,
                    is_final: !!e.approved_at,
                  }))
                  : []
              const fromMeta = [...lead.estimateHistory].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
              const list =
                fromEstimates.length > 0
                  ? fromEstimates
                  : fromMeta.map((e) => ({ ...e, estimateId: undefined as string | undefined }))
              return (
                <div className="space-y-4 pt-1">
                  <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                    {list.length === 0 ? (
                      <li className="text-sm text-muted-foreground py-4 text-center">발행된 견적이 없습니다. 아래에서 추가해 주세요.</li>
                    ) : (
                      list.map((e) => (
                        <li key={e.estimateId ?? `v${e.version}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 bg-muted/30">
                          <span className="text-xs font-mono text-muted-foreground">v{e.version}</span>
                          <span className="text-xs text-muted-foreground">{e.issued_at}</span>
                          <span className="font-semibold text-foreground">{e.amount.toLocaleString()}원</span>
                          {e.summary && <span className="text-sm text-muted-foreground truncate max-w-[180px]" title={e.summary}>{e.summary}</span>}
                          {e.is_final && (
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium bg-primary/20 text-primary">
                              <CheckCircle className="h-3 w-3" /> 확정
                            </span>
                          )}
                          {!e.is_final && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs ml-auto"
                              onClick={() =>
                                e.estimateId
                                  ? void handleSetEstimateFinalByEstimateId(lead.id, e.estimateId)
                                  : void handleSetEstimateFinal(lead.id, e.version)
                              }
                            >
                              확정하기
                            </Button>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="border-t border-border pt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">견적 추가</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="금액 (숫자)"
                        value={newEstimateForm.amount}
                        onChange={(e) => setNewEstimateForm((f) => ({ ...f, amount: e.target.value }))}
                        className="h-9 text-sm"
                      />
                      <Input
                        placeholder="주요 내용 (선택)"
                        value={newEstimateForm.summary}
                        onChange={(e) => setNewEstimateForm((f) => ({ ...f, summary: e.target.value }))}
                        className="h-9 text-sm"
                      />
                    </div>
                    <Button type="button" size="sm" className="h-9" onClick={() => void handleAddEstimate(lead.id)}>
                      견적 추가
                    </Button>
                  </div>
                </div>
              )
            })()}
          </DialogContent>
        </Dialog>

        <Dialog open={!!editModalLeadId} onOpenChange={(open) => !open && setEditModalLeadId(null)}>
          <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>상담 정보 수정</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 pt-1">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">업체명</label>
                <Input value={editForm.company} onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))} className={INPUT_CLASS} placeholder="업체/학교/학원명" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">고객명</label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={INPUT_CLASS} placeholder="담당자명" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">지역</label>
                  <Input value={editForm.region} onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))} className={INPUT_CLASS} placeholder="예: 서울 강남" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">업종</label>
                  <select value={editForm.industry && validIndustryValues.includes(editForm.industry as (typeof validIndustryValues)[number]) ? editForm.industry : '기타'} onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))} className={`w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}>
                    {CONSULTATION_INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">전화번호</label>
                <Input type="tel" inputMode="numeric" autoComplete="tel" value={editForm.contact} onChange={(e) => setEditForm((f) => ({ ...f, contact: formatContactInput(e.target.value) }))} className={INPUT_CLASS} placeholder="010-1234-5678" maxLength={13} />
              </div>
              {/* 인입채널 — 신규 폼과 동일 9종, metadata.source 저장/업데이트, 기본값 채널톡 */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">인입채널(Source)</label>
                <select
                  value={editForm.source || '채널톡'}
                  onChange={(e) => setEditForm((f) => ({ ...f, source: e.target.value }))}
                  className={`w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}
                >
                  {CONSULT_SOURCES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">구글챗 링크</label>
                <Input
                  type="url"
                  inputMode="url"
                  value={editForm.google_chat_url}
                  onChange={(e) => setEditForm((f) => ({ ...f, google_chat_url: e.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="https://chat.google.com/room/..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">인입일</label>
                  <Input type="date" value={editForm.inboundDate ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, inboundDate: e.target.value }))} className={INPUT_CLASS} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">필요일</label>
                  <Input type="date" value={editForm.requiredDate} onChange={(e) => setEditForm((f) => ({ ...f, requiredDate: e.target.value }))} className={INPUT_CLASS} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">요청사항</label>
                <Input value={editForm.painPoint} onChange={(e) => setEditForm((f) => ({ ...f, painPoint: e.target.value }))} className={INPUT_CLASS} placeholder="페인포인트·요청사항" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">고객 등급</label>
                <select value={editForm.customerTier} onChange={(e) => setEditForm((f) => ({ ...f, customerTier: getValidCustomerTier(e.target.value) }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {CUSTOMER_TIERS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" className="h-9" onClick={() => setEditModalLeadId(null)}>취소</Button>
                <Button size="sm" className="h-9" onClick={() => void handleEditSave()}>저장</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 상담 관리 전용: 우측 상세 패널은 데스크톱에서 고정해 좌측 탐색 중에도 기준 화면을 유지 */}
        <div className="grid grid-cols-2 items-start gap-4 flex-1 min-h-0">
          <div className={`min-w-0 flex flex-col gap-2 ${isMobile && selectedLead ? 'hidden' : ''}`}>
            {/* 검색 + 기간 필터 — 상단 고정 */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="업체명, 전화번호, 날짜 검색 (예: 2026-03-16)"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setListPage(0) }}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">인입일</span>
                <select
                  value={dateRange}
                  onChange={(e) => { setDateRange(e.target.value as DateRangeKey); setListPage(0) }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="인입일 기준 기간 필터"
                  title="인입일 기준 기간 필터"
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={`inbound-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">업데이트일</span>
                <select
                  value={updateDateRange}
                  onChange={(e) => { setUpdateDateRange(e.target.value as DateRangeKey); setListPage(0) }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="최신업데이트일 기준 기간 필터"
                  title="최신업데이트일 기준 기간 필터"
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={`update-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <Button
                variant={sortByNeglect ? 'secondary' : 'outline'}
                size="sm"
                className="h-9 text-xs shrink-0"
                onClick={() => { setSortByNeglect((v) => !v); setListPage(0) }}
              >
                {sortByNeglect ? '최근업데이트순' : '인입일순'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">직접기간</span>
                <select
                  value={customDateTarget}
                  onChange={(e) => { setCustomDateTarget(e.target.value as CustomDateTarget); setListPage(0) }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="직접기간 대상 선택"
                  title="직접기간 대상 선택"
                >
                  <option value="inbound">인입일</option>
                  <option value="update">업데이트일</option>
                </select>
                <Input
                  type="date"
                  value={customDateStart}
                  onChange={(e) => { setCustomDateStart(e.target.value); setListPage(0) }}
                  className="h-9 w-[150px] text-sm"
                  aria-label="직접기간 시작일"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={customDateEnd}
                  onChange={(e) => { setCustomDateEnd(e.target.value); setListPage(0) }}
                  className="h-9 w-[150px] text-sm"
                  aria-label="직접기간 종료일"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs shrink-0"
                onClick={() => {
                  setCustomDateTarget('inbound')
                  setCustomDateStart('')
                  setCustomDateEnd('')
                  setListPage(0)
                }}
              >
                직접기간 초기화
              </Button>
            </div>

            <div className="glass-card rounded-xl border border-border overflow-hidden flex flex-col flex-1 min-h-0">
              {isLoading ? (
                <div className="p-6 flex items-center justify-center text-muted-foreground text-sm">
                  <RefreshCw className="animate-spin h-6 w-6" />
                </div>
              ) : leads.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  등록된 상담이 없습니다. 신규 등록으로 추가해 보세요.
                </div>
              ) : (
                <>
                  {leadsNeedingReview.length > 0 && (
                    <div className="px-3 py-1.5 border-b border-border bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs font-medium shrink-0">
                      검토 필요: {leadsNeedingReview.length}건 (등급 미지정)
                    </div>
                  )}
                  <div className="px-3 py-1 border-b border-border/60 bg-muted/20 text-[11px] text-muted-foreground shrink-0">
                    유효 상담 <span className="font-medium text-foreground">{kpi.totalValid}</span>건
                    <span className="mx-1.5">·</span>
                    성공률 <span className="font-medium text-foreground">{kpi.successRate}%</span>
                    <span className="text-muted-foreground/80"> (무효 제외)</span>
                  </div>
                  <Tabs value={listTab} onValueChange={(v) => { setListTab(v as ListTab); setListPage(0) }} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="w-full justify-start gap-2 rounded-none border-b border-border bg-muted/20 px-2 py-2 h-auto shrink-0 flex-wrap">
                      {(['전체', '미처리', '견적중', '진행중', '종료', '거절', '무효'] as const).map((tab) => (
                        <TabsTrigger
                          key={tab}
                          value={tab}
                          className={cn(
                            'rounded-xl border border-transparent bg-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-150 sm:px-3 sm:py-2 sm:text-sm data-[state=active]:-translate-y-0.5 data-[state=active]:border-primary/30 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[0_8px_20px_rgba(0,0,0,0.12)] data-[state=active]:ring-1 data-[state=active]:ring-primary/15',
                            listTab === tab && 'px-3 py-2 text-sm sm:px-4 sm:py-2.5 sm:text-base',
                            searchQuery.trim() &&
                              searchMatchedTabCounts[tab] > 0 &&
                              'bg-amber-500/10 text-amber-800 dark:text-amber-200',
                            searchQuery.trim() &&
                              searchFocusLead &&
                              getListTabForLead(searchFocusLead) === tab &&
                              'border-amber-500 data-[state=active]:border-amber-500 data-[state=active]:ring-amber-500/20'
                          )}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn(
                              listTab === tab && 'font-semibold tracking-tight',
                              searchQuery.trim() && searchMatchedTabCounts[tab] > 0 && 'font-semibold'
                            )}>{tab} {tabCounts[tab]}</span>
                            {tab === '종료' && tabCounts.종료재활동 > 0 && (
                              <span
                                className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30"
                                title={`종료 카드 중 최근 ${REACTIVATION_WINDOW_DAYS}일 내 다시 활동한 상담 ${tabCounts.종료재활동}건`}
                              >
                                활동 {tabCounts.종료재활동}
                              </span>
                            )}
                            {tab === '거절' && tabCounts.거절재활동 > 0 && (
                              <span
                                className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30"
                                title={`거절 카드 중 최근 ${REACTIVATION_WINDOW_DAYS}일 내 다시 활동한 상담 ${tabCounts.거절재활동}건`}
                              >
                                활동 {tabCounts.거절재활동}
                              </span>
                            )}
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <ul className="flex flex-col gap-1 p-2 overflow-y-auto flex-1 min-h-0">
                      {paginatedLeads.length === 0 ? (
                        <li className="p-4 text-center text-sm text-muted-foreground">
                          {filteredLeads.length === 0 ? '조건에 맞는 상담이 없습니다.' : '이 페이지에 표시할 항목이 없습니다.'}
                        </li>
                      ) : (
                        paginatedLeads.map((lead) => (
                          <li key={lead.id} data-lead-id={lead.id}>
                            <ConsultationListItem
                              item={lead}
                              isSelected={selectedLead === lead.id}
                              isHighlighted={highlightedLeadId === lead.id}
                              onSelect={() => handleSelectLead(lead.id)}
                              onCopyContact={handleCopyContact}
                              onStageChange={handleStageChange}
                              onAsClick={handleAsClick}
                              onInvalidClick={handleInvalidLead}
                              onCancelClick={(leadId) => { setCancelModalLeadId(leadId); setCancelReasonDraft('') }}
                              onEditClick={handleEditClick}
                              onDeleteClick={handleDeleteLead}
                              onPinClick={handlePin}
                              lastMessage={lastMessagesByConsultationId[lead.id] ?? null}
                              getPendingEstimateAmount={(id) => pendingEstimateAmountRef.current[id]}
                              imageCount={imageCountByConsultationId[lead.id] ?? 0}
                            />
                          </li>
                        ))
                      )}
                    </ul>
                    {totalPages > 1 && filteredLeads.length > 0 && (
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-border shrink-0 text-xs text-muted-foreground">
                        <span>
                          {(listPage * LIST_PAGE_SIZE) + 1}–{Math.min((listPage + 1) * LIST_PAGE_SIZE, filteredLeads.length)} / {filteredLeads.length}
                        </span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2" disabled={listPage === 0} onClick={() => setListPage((p) => Math.max(0, p - 1))}>
                            이전
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" disabled={listPage >= totalPages - 1} onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}>
                            다음
                          </Button>
                        </div>
                      </div>
                    )}
                  </Tabs>
                </>
              )}
            </div>
          </div>

          {/* 우측: 상담 상세 패널(채팅 메인) — [상담 히스토리 | 실측 자료 | 견적 관리] 탭 / 모바일: 풀폭 + 목록으로 버튼 */}
          <aside
            className={`flex flex-col border border-border rounded-xl bg-card overflow-hidden transition-[opacity] duration-200 min-w-0 ${selectedLeadData
              ? (isMobile ? 'w-full opacity-100' : 'sticky top-6 h-[calc(100vh-8rem)] opacity-100')
              : 'w-0 min-w-0 opacity-0 pointer-events-none overflow-hidden border-0'
              }`}
          >
            {selectedLeadData && (
              <Tabs value={detailPanelTab} onValueChange={(v) => setDetailPanelTab(v as 'history' | 'measurement' | 'estimate')} className="flex flex-col h-full">
                {isMobile && (
                  <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 -ml-1" onClick={() => setSelectedLead(null)}>
                      <ChevronLeft className="h-4 w-4" />
                      목록
                    </Button>
                  </div>
                )}
                <TabsList className="w-full grid grid-cols-3 rounded-none border-b border-border bg-muted/50 h-10">
                  <TabsTrigger value="history" className="text-xs rounded-none">상담 히스토리</TabsTrigger>
                  <TabsTrigger value="estimate" className="text-xs rounded-none">견적 관리</TabsTrigger>
                  <TabsTrigger value="measurement" className="text-xs rounded-none">배치도&발주서</TabsTrigger>
                </TabsList>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {/* 탭 1: 상담 히스토리 */}
                  <div className={detailPanelTab === 'history' ? 'p-4 flex flex-col min-h-0 h-full overflow-hidden' : 'hidden'}>
                    <Suspense fallback={<LazySectionFallback label="상담 히스토리를 불러오는 중..." />}>
                      <ConsultationHistoryTab
                        selectedLeadData={selectedLeadData}
                        samePhoneConsultations={samePhoneConsultations}
                        estimateCountByConsultationId={estimateCountByConsultationId}
                        validatedDisplayAmount={validatedDisplayAmount}
                        isAdmin={isAdmin}
                        onOpenEstimateModal={() => { setEstimateModalLeadId(selectedLeadData.id); setNewEstimateForm({ amount: '', summary: '' }) }}
                        handleSetPartnerGrade={handleSetPartnerGrade}
                        handleSelectLead={handleSelectLead}
                        setHideConfirmLeadId={setHideConfirmLeadId}
                        refetchImageCountForConsultation={refetchImageCountForConsultation}
                      />
                    </Suspense>
                  </div>
                  {/* 탭 2: 견적 관리 */}
                  <div className={detailPanelTab === 'estimate' ? 'p-4 flex flex-col min-h-0' : 'hidden'}>
                    <Suspense fallback={<LazySectionFallback label="견적 관리를 불러오는 중..." />}>
                      <ConsultationEstimateTab
                        selectedLeadData={selectedLeadData}
                        takeoutSpaceLinks={leads
                          .map((lead) => ({
                            spaceId: lead.channelChatId || lead.google_chat_url || '',
                            displayName: lead.displayName || lead.company || '',
                            consultationId: lead.id,
                            inboundDate: lead.inboundDate ?? null,
                            updateDate: lead.updateDate ?? null,
                          }))
                          .filter((item) => item.spaceId)}
                        onApplyTakeoutSearch={({ query, consultationId }: { query: string; consultationId?: string }) => {
                          const targetLead = consultationId ? leads.find((lead) => lead.id === consultationId) : null
                          let nextTab: ListTab = '전체'
                          if (targetLead?.status === '거절') nextTab = '거절'
                          else if (targetLead?.status === '무효') nextTab = '무효'
                          else if (targetLead?.workflowStage === '시공완료') nextTab = '종료'
                          else if (targetLead?.workflowStage === '상담접수') nextTab = '미처리'
                          else if (targetLead?.workflowStage === '견적중') nextTab = '견적중'
                          else if (targetLead?.workflowStage === '계약완료') nextTab = '진행중'

                          setSelectedLead(null)
                          setListPage(0)
                          setListTab(nextTab)
                          setSearchQuery(query)
                        }}
                        onImportTakeoutCandidate={handleTakeoutImportToConsultation}
                        estimateFilesList={estimateFilesList}
                        takeoutImportRequest={
                          pendingTakeoutImport?.consultationId === selectedLeadData.id
                            ? {
                              file: pendingTakeoutImport.file,
                              requestId: pendingTakeoutImport.requestId,
                            }
                            : null
                        }
                        onTakeoutImportHandled={() => {
                          setPendingTakeoutImport((current) =>
                            current?.consultationId === selectedLeadData.id ? null : current
                          )
                        }}
                        onFileUploadComplete={handleEstimateFileUploadComplete}
                        estimateListFilter={estimateListFilter}
                        setEstimateListFilter={setEstimateListFilter}
                        selectedEstimateIds={selectedEstimateIds}
                        setSelectedEstimateIds={setSelectedEstimateIds}
                        filteredEstimateList={filteredEstimateList}
                        setEstimateDeleteConfirmOpen={setEstimateDeleteConfirmOpen}
                        estimatesLoading={estimatesLoading}
                        estimateListByYear={estimateListByYear}
                        archiveCutoff={archiveCutoff}
                        handleSetFinalEstimate={handleSetFinalEstimate}
                        setPrintEstimateId={setPrintEstimateId}
                        setEstimateModalEditId={setEstimateModalEditId}
                        setEstimateModalInitialData={setEstimateModalInitialData}
                        setEstimateModalOpen={setEstimateModalOpen}
                      />
                    </Suspense>
                  </div>
                  {/* 탭 3: 실측·발주서 — BLUEPRINT Supabase Storage 기반 비주얼 갤러리(파일 리스트 아님), 퀵뷰 라이트박스 */}
                  <div className={detailPanelTab === 'measurement' ? 'p-4 space-y-4' : 'hidden'}>
                    <Suspense fallback={<LazySectionFallback label="배치도와 발주서를 불러오는 중..." />}>
                      <ConsultationMeasurementTab
                        consultationId={selectedLeadData.id}
                        projectName={selectedLeadData.company || selectedLeadData.displayName || ''}
                        orderDocuments={orderDocumentsList}
                        measurementDrawingPath={selectedLeadData.measurementDrawingPath}
                        onOrderDocumentsChange={(data: OrderDocument[] | null) => setOrderDocumentsList(data ?? [])}
                      />
                    </Suspense>
                  </div>
                </div>
              </Tabs>
            )}

            {/* 견적 선택 삭제 확인 모달 */}
            <Dialog open={estimateDeleteConfirmOpen} onOpenChange={setEstimateDeleteConfirmOpen}>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>견적 삭제</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  정말 삭제하시겠습니까? 복구할 수 없습니다.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEstimateDeleteConfirmOpen(false)} disabled={estimateDeleting}>
                    취소
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void handleDeleteSelectedEstimates()} disabled={estimateDeleting}>
                    {estimateDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        삭제 중…
                      </>
                    ) : (
                      '삭제'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </aside>

          {/* 발행승인 전 관리자 미리보기 (예산 기획안 / 확정 견적서 공통) */}
          <Dialog open={adminPreviewOpen} onOpenChange={(open) => { if (!open) { setAdminPreviewOpen(false); setAdminPreviewData(null); setAdminPreviewEstimateId(null) } }}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
              <DialogHeader className="shrink-0 px-4 py-3 border-b border-border">
                <DialogTitle>
                  {adminPreviewData?.mode === 'PROPOSAL' ? '예산 기획안' : '확정 견적서'} 미리보기 (고객에게 보여질 화면)
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto p-4 min-h-0">
                {adminPreviewData && (() => {
                  const rawRows = adminPreviewData.rows ?? []
                  const paddedRows = rawRows.length >= 20 ? rawRows.slice(0, 20) : [...rawRows, ...Array.from({ length: 20 - rawRows.length }, (_, i) => createEmptyRow(rawRows.length + i))]
                  const data = { ...adminPreviewData, rows: paddedRows }
                  return data.mode === 'PROPOSAL'
                    ? (
                      <Suspense fallback={<LazySectionFallback label="예산 기획안 미리보기를 불러오는 중..." />}>
                        <ProposalPreviewContent data={data} totals={computeProposalTotals(data)} />
                      </Suspense>
                    )
                    : (
                      <Suspense fallback={<LazySectionFallback label="확정 견적서 미리보기를 불러오는 중..." />}>
                        <FinalEstimatePreviewContent data={data} totals={computeFinalTotals(data)} />
                      </Suspense>
                    )
                })()}
              </div>
              <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
                <Button type="button" variant="outline" onClick={() => { setAdminPreviewOpen(false); setAdminPreviewData(null) }}>
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (selectedLeadData && adminPreviewData) {
                      if (adminPreviewData.mode === 'PROPOSAL') {
                        void handleProposalFinalPublish(selectedLeadData.id, adminPreviewData, adminPreviewEstimateId ?? undefined)
                      } else {
                        void handleEstimateApproved(selectedLeadData.id, adminPreviewData, adminPreviewEstimateId ?? undefined)
                      }
                    }
                  }}
                >
                  최종 발행
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* PDF 인쇄 (참고 견적서) — 견적 작성 모달 위에 확실히 표시(z-[200]), 클릭이 아래 모달로 전달되지 않도록 캡처 */}
          <Dialog
            open={!!printEstimateId}
            onOpenChange={(open) => {
              if (!open) {
                justClosedPreviewRef.current = true
                setPrintEstimateId(null)
                setTimeout(() => { justClosedPreviewRef.current = false }, 300)
              }
            }}
          >
            <DialogContent
              overlayClassName="z-[200]"
              className="z-[200] max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 print:max-h-none"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClickCapture={(e) => e.stopPropagation()}
            >
              <DialogHeader className="sticky top-0 z-10 shrink-0 px-4 py-3 border-b border-border bg-card flex flex-row items-center justify-between gap-2 print:hidden flex-wrap">
                <DialogTitle>PDF / 이미지 저장</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const el = document.querySelector('[data-estimate-print-area]')
                      if (!(el instanceof HTMLElement)) {
                        toast.error('저장할 영역을 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.')
                        return
                      }
                      if (!printEstimateId) return
                      const est = estimatesList.find((e) => e.id === printEstimateId)
                      if (!est) {
                        toast.error('견적 데이터를 찾을 수 없습니다. 견적 목록을 새로고침해 주세요.')
                        return
                      }
                      const rawData = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as unknown as EstimateFormData | undefined
                      try {
                        const { exportEstimateToImage, buildEstimateImageFilename } = await import('@/lib/estimatePdfExport')
                        const filename = buildEstimateImageFilename(rawData?.quoteDate, rawData?.recipientName)
                        await exportEstimateToImage(el, filename)
                        toast.success('이미지가 저장되었습니다.')
                      } catch (err) {
                        console.error(err)
                        toast.error('이미지 저장에 실패했습니다.')
                      }
                    }}
                  >
                    PNG 저장
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const el = document.querySelector('[data-estimate-print-area]')
                      if (!(el instanceof HTMLElement)) {
                        toast.error('저장할 영역을 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.')
                        return
                      }
                      if (!printEstimateId) return
                      const est = estimatesList.find((e) => e.id === printEstimateId)
                      if (!est) {
                        toast.error('견적 데이터를 찾을 수 없습니다. 견적 목록을 새로고침해 주세요.')
                        return
                      }
                      const rawData = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as unknown as EstimateFormData | undefined
                      try {
                        const { exportEstimateToPdf, buildEstimatePdfFilename } = await import('@/lib/estimatePdfExport')
                        const filename = buildEstimatePdfFilename(rawData?.recipientName)
                        await exportEstimateToPdf(el, filename)
                        toast.success('PDF가 저장되었습니다.')
                        setPrintEstimateId(null)
                      } catch (err) {
                        console.error(err)
                        toast.error('PDF 저장에 실패했습니다.')
                      }
                    }}
                  >
                    PDF 저장
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-semibold"
                    onClick={async () => {
                      if (!printEstimateId) return
                      const est = estimatesList.find((e) => e.id === printEstimateId)
                      if (!est) {
                        toast.error('견적 데이터를 찾을 수 없습니다. 견적 목록을 새로고침한 뒤 다시 시도해 주세요.')
                        return
                      }
                      const consultationId = est.consultation_id
                      const grandTotal = Number(est.grand_total ?? 0)
                      const nowIso = new Date().toISOString()
                      const lead = leads.find((l) => l.id === consultationId)
                      try {
                        // 1. 해당 상담의 나머지 견적은 모두 임시저장(approved_at = null)으로 되돌림
                        const others = estimatesList.filter((e) => e.consultation_id === consultationId && e.id !== est.id && e.approved_at != null)
                        if (others.length > 0) {
                          const { error: clearErr } = await supabase
                            .from('estimates')
                            .update({ approved_at: null })
                            .eq('consultation_id', consultationId)
                            .neq('id', est.id)
                          if (clearErr) throw clearErr
                        }
                        // 2. 선택한 견적만 확정: approved_at + final_proposal_data 스냅샷
                        if (!est.approved_at) {
                          const rawData = (est.final_proposal_data ?? est.payload) as unknown as EstimateFormData
                          const snapshot = { ...rawData, mode: 'FINAL' as const } as EstimateFormData
                          const { error: estErr } = await supabase
                            .from('estimates')
                            .update({
                              final_proposal_data: snapshot as unknown as Json,
                              approved_at: nowIso,
                              supply_total: est.supply_total,
                              vat: est.vat,
                              grand_total: est.grand_total,
                            })
                            .eq('id', est.id)
                          if (estErr) throw estErr
                        }
                        // 3. 상담 카드·DB 반영: 견적 확정 = 견적 단계(status 견적). 계약 단계는 입금 확인 후 직원이 계약 버튼으로 별도 전환.
                        const newHistory: EstimateHistoryItem[] = [
                          {
                            version: 1,
                            issued_at: nowIso.slice(0, 10),
                            amount: grandTotal,
                            summary: undefined,
                            is_final: true,
                          },
                        ]
                        const nextMeta = {
                          ...(lead?.metadata ?? {}),
                          final_amount: grandTotal,
                          final_estimate_id: printEstimateId,
                          estimate_history: newHistory,
                        } as Record<string, unknown>
                        const { error: updateErr } = await supabase
                          .from('consultations')
                          .update({
                            status: '견적',
                            estimate_amount: grandTotal,
                            metadata: nextMeta as unknown as Json,
                          })
                          .eq('id', consultationId)
                        if (updateErr) throw updateErr
                        const parsedHistory = parseEstimateHistory(nextMeta as Record<string, unknown>)
                        setLeads((prev) =>
                          prev.map((l) =>
                            l.id !== consultationId
                              ? l
                              : {
                                ...l,
                                status: '견적',
                                metadata: nextMeta,
                                estimateHistory: parsedHistory,
                                displayAmount: grandTotal,
                                expectedRevenue: grandTotal,
                                finalAmount: grandTotal,
                              }
                          )
                        )
                        // 4. 견적 목록 갱신: 나머지는 임시저장, 선택한 건만 확정
                        const { data: list } = await supabase
                          .from('estimates')
                          .select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at')
                          .eq('consultation_id', consultationId)
                          .eq('is_visible', true)
                          .order('created_at', { ascending: false })
                        setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
                        setEstimateListRefreshKey((k) => k + 1)
                        // 5. 상담 히스토리(타임라인)에 최종 확정 시스템 메시지 반영
                        await supabase.from('consultation_messages').insert({
                          consultation_id: consultationId,
                          sender_id: 'system',
                          content: `최종 확정되었습니다. 견적가 ${grandTotal.toLocaleString()}원.`,
                          message_type: 'SYSTEM',
                          metadata: { type: 'estimate_approved', estimate_id: est.id },
                        })
                        const actor = (lead?.name || '직원').trim() || '직원'
                        await insertSystemLog(supabase, {
                          consultation_id: consultationId,
                          event_type: 'estimate_approved',
                          actor_name: actor,
                          detail: '최종 확정',
                          metadata: { type: 'estimate_approved', estimate_id: est.id },
                        })
                        toast.success('견적이 확정되었습니다. 상담이 견적 단계로 변경되었습니다.')
                        setPrintEstimateId(null)
                        if (import.meta.env.DEV && lead?.projectName) {
                          console.warn('구글 시트 동기화는 클라이언트에서 비활성화되었습니다. 서버사이드 동기화 엔드포인트로 이전이 필요합니다.', lead.projectName)
                        }
                      } catch (err) {
                        console.error(err)
                        toast.error('확정 처리에 실패했습니다.')
                      }
                    }}
                  >
                    최종 확정
                  </Button>
                </div>
              </DialogHeader>
              <div className="print-container flex-1 min-h-0 overflow-y-auto p-4 pb-10 print:max-h-none print:p-6 print:pb-6" data-estimate-print-area style={{ maxHeight: 'calc(90vh - 56px)' }}>
                {printEstimateId && (() => {
                  const est = estimatesList.find((e) => e.id === printEstimateId)
                  if (!est) {
                    return estimatesLoading ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        불러오는 중…
                      </div>
                    ) : null
                  }
                  const rawData = (est.approved_at && est.final_proposal_data ? est.final_proposal_data : est.payload) as unknown as EstimateFormData
                  const rawRows = rawData.rows ?? []
                  const paddedRows = rawRows.length >= 20 ? rawRows.slice(0, 20) : [...rawRows, ...Array.from({ length: 20 - rawRows.length }, (_, i) => createEmptyRow(rawRows.length + i))]
                  const fallbackQuoteDate = (est.created_at ?? est.approved_at ?? '').toString().slice(0, 16).replace('T', ' ')
                  const data = { ...rawData, rows: paddedRows, quoteDate: rawData?.quoteDate || fallbackQuoteDate }
                  return data.mode === 'PROPOSAL'
                    ? (
                      <Suspense fallback={<LazySectionFallback label="예산 기획안 미리보기를 불러오는 중..." />}>
                        <ProposalPreviewContent data={data} totals={computeProposalTotals(data)} />
                      </Suspense>
                    )
                    : (
                      <Suspense fallback={<LazySectionFallback label="확정 견적서 미리보기를 불러오는 중..." />}>
                        <FinalEstimatePreviewContent data={data} totals={computeFinalTotals(data)} />
                      </Suspense>
                    )
                })()}
              </div>
            </DialogContent>
          </Dialog>

          {/* 원가표 원본 이미지 라이트박스 (AI 추천 가이드 [원본보기]) — Signed URL로 표시해 비공개 버킷에서도 로드 */}
          <Dialog open={!!priceBookImageUrl} onOpenChange={(open) => { if (!open) setPriceBookImageUrl(null) }}>
            <DialogContent
              overlayClassName="z-[100]"
              className="z-[100] max-w-4xl max-h-[90vh] flex flex-col"
            >
              <DialogHeader>
                <DialogTitle>원가표 원본</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto min-h-0 flex items-center justify-center bg-muted/30 rounded-md min-h-[200px]">
                {priceBookImageUrl && !priceBookImageDisplayUrl && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">이미지 불러오는 중…</span>
                  </div>
                )}
                {priceBookImageDisplayUrl && (
                  <img src={priceBookImageDisplayUrl} alt="원가표 원본" className="max-w-full max-h-[70vh] object-contain" />
                )}
              </div>
              <Button type="button" variant="outline" onClick={() => setPriceBookImageUrl(null)}>닫기</Button>
            </DialogContent>
          </Dialog>

          {/* 견적서 전용 풀스크린 모달 — 블러 배경, [임시저장][발행승인][닫기] 고정 */}
          <Dialog
            open={estimateModalOpen}
            onOpenChange={(open) => {
              if (!open && (printEstimateId || justClosedPreviewRef.current)) return
              setEstimateModalOpen(open)
              if (!open) setEstimateModalInitialData(null)
            }}
          >
            <DialogContent
              overlayClassName="bg-black/40 backdrop-blur-md"
              className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 flex flex-col gap-0"
            >
              <DialogTitle className="sr-only">견적 작성</DialogTitle>
              <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    const data = estimateFormRef.current?.getCurrentData()
                    const rows = data?.rows ?? []
                    const names = [...new Set(rows.map((r) => String(r?.name ?? '').trim()).filter(Boolean))]
                    if (names.length === 0) {
                      toast.error('품명이 있는 품목을 먼저 추가하세요.')
                      return
                    }
                    try {
                      const [{ getDataByProductTags }, { createSharedGallery }] = await Promise.all([
                        import('@/lib/productDataMatching'),
                        import('@/lib/sharedGalleryService'),
                      ])
                      const map = await getDataByProductTags(names)
                      const ids = new Set<string>()
                      map.forEach((res) => res.images.forEach((img) => ids.add(img.id)))
                      if (ids.size === 0) {
                        toast.warning('해당 품목과 매칭되는 시공 사진이 없습니다.')
                        return
                      }
                      const snapshots = Array.from(map.values()).flatMap((res) =>
                        res.images.map((image) => ({
                          id: image.id,
                          sourceTable: 'project_images' as const,
                          url: image.marketingUrl,
                          thumbnailUrl: image.mobileUrl || image.marketingUrl,
                          projectTitle: image.projectTitle?.trim() || image.displayName?.trim() || null,
                          productTags: [],
                          color: null,
                        }))
                      )
                      const { url } = await createSharedGallery({
                        items: snapshots,
                        title: '품목 시공 사진',
                        description: '상담 품목과 연결된 시공 사례입니다.',
                        source: 'consultation-product-share',
                      })
                      await navigator.clipboard.writeText(url)
                      toast.success(`품목 시공 사진 갤러리 링크를 복사했습니다. (${ids.size}장)`)
                    } catch {
                      toast.error('시공 사진 조회에 실패했습니다.')
                    }
                  }}
                >
                  <Images className="h-3.5 w-3.5" />
                  이 품목 사진들 공유하기
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectedLeadData && handleEstimateSaveDraft(selectedLeadData.id)}
                  >
                    임시저장
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      const data = estimateFormRef.current?.getCurrentData()
                      if (!data || !selectedLeadData) return
                      const consultationId = selectedLeadData.id
                      const payload = { ...data, draft: true } as unknown as Record<string, unknown>
                      try {
                        let estimateId: string
                        if (estimateModalEditId) {
                          const { error } = await supabase
                            .from('estimates')
                            .update({
                              payload: payload as Json,
                              supply_total: data.supplyTotal,
                              vat: data.vat,
                              grand_total: data.grandTotal,
                              approved_at: null,
                            })
                            .eq('id', estimateModalEditId)
                            .select('id')
                            .single()
                          if (error) throw error
                          estimateId = estimateModalEditId
                        } else {
                          const { data: inserted, error } = await supabase
                            .from('estimates')
                            .insert({
                              consultation_id: consultationId,
                              payload: payload as Json,
                              supply_total: data.supplyTotal,
                              vat: data.vat,
                              grand_total: data.grandTotal,
                              approved_at: null,
                            })
                            .select('id')
                            .single()
                          if (error) throw error
                          estimateId = (inserted as { id: string }).id
                        }
                        const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).eq('is_visible', true).order('created_at', { ascending: false })
                        setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
                        setEstimateListRefreshKey((k) => k + 1)
                        setAdminPreviewEstimateId(estimateId)
                        setAdminPreviewData(data)
                        setAdminPreviewOpen(true)
                        toast.success('임시저장되었습니다. 미리보기에서 최종 발행 시 확정됩니다.')
                      } catch (err) {
                        console.error(err)
                        toast.error('임시저장에 실패했습니다.')
                      }
                    }}
                  >
                    발행승인
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEstimateModalOpen(false)}>
                    닫기
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0 p-4">
                {(selectedLeadData || (estimateModalInitialData?.rows?.length ?? 0) > 0) && (
                  <Suspense fallback={<LazySectionFallback label="견적 폼을 불러오는 중..." />}>
                    <EstimateForm
                      key={estimateModalEditId ?? 'new'}
                      ref={estimateFormRef}
                      initialData={
                        estimateModalInitialData
                          ? {
                            ...(selectedLeadData && {
                              recipientName: selectedLeadData.contact?.trim() || '',
                              recipientContact: selectedLeadData.contact ?? '',
                            }),
                            ...estimateModalInitialData,
                          }
                          : {
                            recipientName: selectedLeadData?.contact?.trim() || '',
                            recipientContact: selectedLeadData?.contact ?? '',
                          }
                      }
                      pastEstimates={selectedLeadData ? mergedPastEstimatesForGuide : []}
                      onApproved={selectedLeadData ? (data) => void handleEstimateApproved(selectedLeadData.id, data) : undefined}
                      onRequestEstimatePreview={(consultationId, estimateId) => {
                        if (selectedLead !== consultationId) {
                          setSelectedLead(consultationId)
                          setDetailPanelTab('estimate')
                        }
                        setPrintEstimateId(estimateId)
                      }}
                      onRequestPriceBookImage={(url) => setPriceBookImageUrl(url)}
                      modalOpen={estimateModalOpen}
                      hideInternalActions
                      showProfitabilityPanel
                      className="max-w-5xl mx-auto"
                    />
                  </Suspense>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  )
}
