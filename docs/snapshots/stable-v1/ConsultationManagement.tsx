import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Calculator, RefreshCw, Zap, Phone, Copy, User, Calendar, Images, Check, MessageCircle, Pencil, Loader2, Search, FileText, CheckCircle, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

// 팝업(Dialog) — JOURNAL: 팝업 버그 해결용 open/onOpenChange 단일 연동
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PortfolioBankModal } from '@/components/portfolio/PortfolioBankModal'
import { CONSULTATION_INDUSTRY_OPTIONS } from '@/data/referenceCases'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subMonths } from 'date-fns'
import { EstimateForm, type EstimateFormData, type EstimateFormHandle } from '@/components/estimate/EstimateForm'

// PC 사무용: 컴팩트 (48px 규칙 미적용)
const INPUT_CLASS = 'h-10 text-sm'
const BUTTON_SUBMIT_CLASS = 'h-9 w-full text-sm font-semibold'

const CONSULT_SOURCES = [
  { value: '인스타그램', label: '인스타그램' },
  { value: '네이버', label: '네이버' },
  { value: '지인소개', label: '지인소개' },
  { value: '전화문의', label: '전화문의' },
  { value: '방문', label: '방문' },
  { value: '네이버 스토어', label: '네이버 스토어' },
  { value: '쿠팡', label: '쿠팡' },
  { value: '오늘의집', label: '오늘의집' },
  { value: '자사몰', label: '자사몰' },
  { value: '기타', label: '기타' },
] as const

/** 실측 PDF 도면 전용 Storage 버킷 (시공사례 뱅크·Cloudinary와 격리) */
const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'

/** 실측(Measurement) 상태 — 해당없음이면 카드에서 배지 미표시 */
const MEASUREMENT_STATUSES = ['실측필요', '실측완료', '실측해당없음'] as const
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number]

/** 오픈마켓 인입 채널 — 주문번호 입력·is_market_order·마켓 배지 적용 */
const OPEN_MARKET_SOURCES = ['네이버 스토어', '쿠팡', '오늘의집', '자사몰'] as const
function isMarketSource(source: string): boolean {
  return OPEN_MARKET_SOURCES.includes(source as (typeof OPEN_MARKET_SOURCES)[number])
}

/** 마켓별 배지 스타일 (1행 좌측) */
const MARKET_BADGE_STYLE: Record<string, { label: string; className: string }> = {
  '네이버 스토어': { label: '네이버스토어', className: 'bg-[#03C75A]/20 text-[#03C75A] dark:bg-[#03C75A]/25 dark:text-[#03C75A] ring-1 ring-[#03C75A]/40' },
  '쿠팡': { label: '쿠팡', className: 'bg-red-500/20 text-red-600 dark:bg-red-400/90 ring-1 ring-red-500/40' },
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
  상담중: '상담접수',
  견적발송: '견적중',
  계약완료: '계약완료',
  휴식기: '시공완료',
  거절: '시공완료',
  AS_WAITING: '시공완료',
}

const LIST_PAGE_SIZE = 20
type ListTab = '전체' | '미처리' | '진행중' | 'AS대기' | '종료'
type DateRangeKey = 'all' | '1m' | '3m'

/** 시공완료·상담종료(거절) — [종료] 탭에서만 노출. AS 대기(status=AS_WAITING)는 종료에 노출하지 않음 */
function isEnded(lead: Lead): boolean {
  if (lead.status === 'AS_WAITING') return false
  return lead.workflowStage === '시공완료' || lead.status === '거절'
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
  status: '상담중' | '견적발송' | '계약완료' | '휴식기' | '거절' | 'AS_WAITING'
  /** 4단계 상담 흐름 (카드 프로그레스 바용) */
  workflowStage: ConsultationStage
  /** AS 요청 여부 (metadata.as_requested 또는 로컬 표시용) */
  asRequested?: boolean
  /** 구글챗 스페이스 대화방 URL (metadata.google_chat_url). 예: https://chat.google.com/room/AAAA... */
  google_chat_url?: string
  /** 구글챗 스페이스 생성 대기 중 (metadata.google_chat_pending). URL 없을 때만 상태 C 표시 */
  google_chat_pending?: boolean
  /** AI 히스토리 요약 (metadata.history_summary). 구글챗 분석 결과, Read-only·AI 전용 업데이트 */
  history_summary?: string
  /** 인입일 YYYY-MM-DD (createdAt 기반, 표시용) */
  inboundDate: string
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
  /** Supabase metadata 병합용 (단계 변경 시 업데이트) */
  metadata?: Record<string, unknown>
  expectedRevenue: number
  /** 견적 이력 (버전·발행일·금액·요약·확정여부) — metadata.estimate_history */
  estimateHistory: EstimateHistoryItem[]
  /** 카드/패널 대표 금액: 확정 견적 → 최신 견적 → expected_revenue */
  displayAmount: number
  interestLevel: 'High' | 'Medium' | 'Low'
  marketingStatus: boolean
}

/** consultations 테이블 row → Lead 매핑 (fetch 및 Real-time 업데이트 공용) */
function mapConsultationRowToLead(item: Record<string, unknown>): Lead {
  const created = (item.created_at as string) || new Date().toISOString()
  const meta = (item.metadata as Record<string, unknown> | null) ?? null
  const company = pickDisplayName(item.company_name as string | null, meta, 'company_name', '(업체명 없음)')
  const name = pickDisplayName(item.manager_name as string | null, meta, 'manager_name', '(고객명 없음)')
  const now = Date.now()
  const createdMs = new Date(created).getTime()
  const isGoldenTime = (now - createdMs) / (24 * 60 * 60 * 1000) <= 30
  const regionFromMeta = meta && typeof meta.region === 'string' ? meta.region : '현장 확인 중'
  const industryFromMeta = meta && typeof meta.industry === 'string' ? meta.industry : '기타'
  const painPointFromMeta = meta && typeof meta.pain_point === 'string' ? meta.pain_point : ''
  const requiredDateRaw = meta?.required_date
  const requiredDateDisplay =
    typeof requiredDateRaw === 'string' && requiredDateRaw ? requiredDateRaw.slice(0, 10) : ''
  const customerTierFromMeta = getValidCustomerTier(meta?.customer_tier)
  const statusVal = (item.status as Lead['status']) ?? '상담중'
  const rawStage = meta && typeof meta.workflow_stage === 'string' ? meta.workflow_stage : null
  const workflowStageFromMeta =
    rawStage && CONSULTATION_STAGES.includes(rawStage as ConsultationStage)
      ? (rawStage as ConsultationStage)
      : rawStage === '현장실측'
        ? '견적중'
        : STATUS_TO_STAGE[statusVal] ?? '상담접수'
  const asRequested =
    (meta && typeof meta.as_requested === 'boolean' ? meta.as_requested : false) ||
    statusVal === 'AS_WAITING'
  const googleChatUrl =
    meta && typeof meta.google_chat_url === 'string' && meta.google_chat_url.trim()
      ? meta.google_chat_url.trim()
      : undefined
  const googleChatPending = meta && typeof meta.google_chat_pending === 'boolean' ? meta.google_chat_pending : false
  const historySummary =
    meta && typeof meta.history_summary === 'string' && meta.history_summary.trim()
      ? meta.history_summary.trim()
      : undefined
  const inboundDate =
    (meta && typeof meta.inbound_date === 'string' && meta.inbound_date.trim())
      ? meta.inbound_date.trim().slice(0, 10)
      : created.slice(0, 10)
  const estimateHistory = parseEstimateHistory(meta)
  const expectedRevenueNum = Number(item.expected_revenue ?? 0)
  const displayAmount = getDisplayAmount(estimateHistory, expectedRevenueNum)
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
  return {
    id: String(item.id ?? ''),
    name,
    company,
    industry: industryFromMeta,
    industryType: 'other',
    area: typeof meta?.area_sqm === 'number' ? meta.area_sqm : 0,
    region: regionFromMeta,
    requiredDate: requiredDateDisplay,
    painPoint: painPointFromMeta,
    contact: String(item.contact ?? ''),
    customerTier: customerTierFromMeta,
    priority: 'medium',
    priorityScore: 50,
    time: formatDistanceToNow(new Date(created), { addSuffix: true, locale: ko }),
    createdAt: created,
    isGoldenTime,
    status: statusVal,
    workflowStage: workflowStageFromMeta,
    asRequested,
    google_chat_url: googleChatUrl,
    google_chat_pending: googleChatPending,
    history_summary: historySummary,
    inboundDate,
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
    metadata: meta ?? undefined,
    expectedRevenue: expectedRevenueNum,
    estimateHistory,
    displayAmount,
    interestLevel: 'Medium',
    marketingStatus: false,
  }
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
 * 오픈마켓 신규 주문 등록 시 구글챗 공지방 알림 인터페이스.
 * VITE_GOOGLE_CHAT_WEBHOOK_ANNOUNCEMENT 에 Webhook URL 설정 시 POST로 메시지 전송.
 * 미설정 시 no-op (추후 백엔드/Edge Function 연동 시 교체 가능).
 */
function notifyMarketOrderRegistered(
  source: string,
  companyName?: string,
  orderNumber?: string
): void {
  const text = `[${source}] 신규 주문이 들어왔습니다. 해피콜이 필요합니다.${companyName ? ` (${companyName})` : ''}${orderNumber ? ` 주문번호: ${orderNumber}` : ''}`
  const webhookUrl = import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_ANNOUNCEMENT as string | undefined
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return
  }
  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch((err) => console.warn('구글챗 공지 알림 전송 실패:', err))
}

/**
 * 실측 예정일 당일 아침 담당자 구글챗 알림 인터페이스.
 * cron/Edge Function 등에서 예정일 당일 호출 시 "오늘 [업체명] 실측 일정입니다. 체크리스트를 확인하세요" 전송.
 * VITE_GOOGLE_CHAT_WEBHOOK_MEASUREMENT_REMINDER 또는 VITE_GOOGLE_CHAT_WEBHOOK_ANNOUNCEMENT 사용.
 */
export function notifyMeasurementReminder(
  companyName: string,
  assignee?: string,
  _scheduledDate?: string
): void {
  const text = `오늘 [${companyName}] 실측 일정입니다. 체크리스트를 확인하세요.${assignee ? ` (담당: ${assignee})` : ''}`
  const webhookUrl =
    (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_MEASUREMENT_REMINDER as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_ANNOUNCEMENT as string | undefined)
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return
  }
  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch((err) => console.warn('구글챗 실측 리마인더 전송 실패:', err))
}

/** 오픈마켓 인입 채널 배지 — 1행 좌측, 마켓별 색상 */
function MarketSourceBadge({ source }: { source: string }) {
  const style = MARKET_BADGE_STYLE[source]
  if (!style) return null
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${style.className}`} title={`인입: ${source}`}>
      {style.label}
    </span>
  )
}

/** 실측 상태 배지 — 실측필요(주황) / 실측완료(녹색). 실측해당없음이면 미표시 */
function MeasurementStatusBadge({ status }: { status: MeasurementStatus }) {
  if (status === '실측해당없음') return null
  const isDone = status === '실측완료'
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        isDone ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-amber-500/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40'
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
      className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold shrink-0 ${
        isCaution
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

/** 4단계 상담 프로그레스 바 — 도트 + 고정 너비 텍스트 영역 (현재 단계만 강조) */
function StageProgressBar({
  currentStage,
  onStageChange,
}: {
  currentStage: ConsultationStage
  onStageChange: (stage: ConsultationStage) => void
}) {
  const currentIndex = CONSULTATION_STAGES.indexOf(currentStage)

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <div className="inline-flex items-center gap-0.5 h-4">
        {CONSULTATION_STAGES.map((stage, i) => {
          const isCompleted = i < currentIndex
          const isCurrent = i === currentIndex
          return (
            <button
              key={stage}
              type="button"
              title={stage}
              onClick={(e) => {
                e.stopPropagation()
                onStageChange(stage)
              }}
              className={`inline-flex items-center justify-center rounded-full transition-colors hover:opacity-90 ${
                isCompleted
                  ? 'bg-primary/80 text-primary-foreground w-4 h-4'
                  : isCurrent
                    ? 'bg-primary text-primary-foreground w-4 h-4 text-[10px] font-semibold'
                    : 'bg-muted text-muted-foreground w-3 h-3'
              }`}
            >
              {isCompleted ? <Check className="h-2.5 w-2.5" /> : isCurrent ? (i + 1) : null}
            </button>
          )
        })}
      </div>
      <div className="w-[168px] flex items-center justify-between text-[11px] shrink-0">
        {CONSULTATION_STAGES.map((stage, i) => {
          const isCurrent = i === currentIndex
          return (
            <span
              key={stage}
              className={isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}
            >
              {stage}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** 리스트 카드: PC 3줄 타이트 — 1행 우측 프로그레스+단계텍스트 고정, [AS 관리] | 전화번호 복사 */
function ConsultationListItem({
  item,
  isSelected,
  onSelect,
  onCopyContact,
  onStageChange,
  onAsClick,
  onEditClick,
}: {
  item: Lead
  isSelected: boolean
  onSelect: () => void
  onCopyContact: (e: React.MouseEvent, tel: string) => void
  onStageChange: (leadId: string, stage: ConsultationStage) => void
  onAsClick: (leadId: string) => void
  onEditClick: (leadId: string) => void
}) {
  const painText = item.painPoint?.trim() || '(요청사항 없음)'
  const contactDisplay = item.contact ? formatContact(item.contact) : ''
  const telHref = item.contact ? `tel:${item.contact.replace(/\D/g, '')}` : '#'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-md border transition-colors flex flex-col gap-0.5 px-2 py-1.5 min-h-0 ${isSelected ? 'bg-primary/10 border-primary' : 'bg-card border-border hover:bg-muted/50'}`}
    >
      {/* 1행: 좌측 [마켓배지] [고객분류] 업체명 [AS 요청 배지] [골든타임] · 우측 고정: 프로그레스+단계텍스트 | [AS 관리] | 전화번호 복사 */}
      <div className="flex flex-row items-center justify-between gap-2 min-h-[20px]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          {item.source && isMarketSource(item.source) && <MarketSourceBadge source={item.source} />}
          {item.measurementStatus && item.measurementStatus !== '실측해당없음' && (
            <MeasurementStatusBadge status={item.measurementStatus} />
          )}
          <CustomerTierBadge tier={item.customerTier} />
          <span className="font-bold text-foreground text-[13px] leading-tight truncate">
            {item.company || '(업체명 없음)'}
          </span>
          {(item.asRequested || item.status === 'AS_WAITING') && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-red-500/20 text-red-700 dark:text-red-400 ring-1 ring-red-500/30">
              AS 요청
            </span>
          )}
          {item.isGoldenTime && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1 py-0.5 text-[11px] font-semibold shrink-0">
              <Zap className="h-2.5 w-2.5" />
              골든타임
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <StageProgressBar
            currentStage={item.workflowStage}
            onStageChange={(stage) => onStageChange(item.id, stage)}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAsClick(item.id) }}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 ${(item.asRequested || item.status === 'AS_WAITING') ? 'bg-red-500/20 text-red-700 dark:text-red-400' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            title={item.asRequested || item.status === 'AS_WAITING' ? 'AS 완료 처리' : 'AS 요청'}
          >
            AS 관리
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditClick(item.id) }}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            title="상담 정보 수정"
          >
            <Pencil className="h-3 w-3" />
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
      {/* 2행: [주문번호] 지역 | 업종 | 전화번호 | 인입 | 필요 · 우측 고정폭 구글챗 버튼(3단계) */}
      <div className="flex items-center gap-1.5 text-[12px] min-h-[18px] flex-wrap">
        {item.orderNumber && (
          <>
            <span className="text-muted-foreground font-mono" title="주문번호">{item.orderNumber}</span>
            <span className="text-border">|</span>
          </>
        )}
        <span className="text-muted-foreground">{item.region || '—'}</span>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">{item.industry || '—'}</span>
        <span className="text-border">|</span>
        {contactDisplay ? (
          <a
            href={telHref}
            onClick={(e) => e.stopPropagation()}
            className="text-primary font-medium hover:underline"
            title="전화 걸기"
          >
            {contactDisplay}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <span className="text-border">|</span>
        <span className="text-muted-foreground">{item.inboundDate ? `인입: ${item.inboundDate}` : '인입: —'}</span>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">{item.requiredDate ? `필요: ${item.requiredDate}` : '필요: —'}</span>
        {item.displayAmount > 0 && (
          <>
            <span className="text-border">|</span>
            <span className="font-medium text-primary">{item.displayAmount.toLocaleString()}원</span>
          </>
        )}
        {/* 2행 우측 끝 고정: 구글챗 버튼 — A 연결됨 / B 연결 안 됨 / C 생성 대기 */}
        <div className="w-[106px] shrink-0 flex justify-end ml-auto" onClick={(e) => e.stopPropagation()}>
          {item.google_chat_url ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); window.open(item.google_chat_url!, '_blank') }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#00A862]/15 text-[#00875A] hover:bg-[#00A862]/25 dark:bg-[#00A862]/20 dark:text-emerald-400 dark:hover:bg-[#00A862]/30 border border-[#00A862]/30"
              title="프로젝트 전용 스페이스가 생성되었습니다. 실명 이력 유지를 위해 클릭하여 입장하세요."
            >
              <MessageCircle className="h-3 w-3" />
              구글챗 입장
            </button>
          ) : item.google_chat_pending ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground bg-muted/80" title="스페이스 생성 중">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              스페이스 생성 중…
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toast.info('연결된 스페이스가 없습니다.')
              }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#F1F3F4] text-muted-foreground hover:bg-[#E8EAED] dark:bg-muted dark:hover:bg-muted/80 border border-border"
              title="추후 스페이스 생성 시 활성화됩니다"
            >
              <MessageCircle className="h-3 w-3 opacity-60" />
              구글챗 입장
            </button>
          )}
        </div>
      </div>
      {/* 3행: 요청사항(페인포인트) — 연한 배경, 넓게 표시 */}
      <div className="min-h-[20px]">
        <p className="text-[13px] text-foreground bg-muted/60 dark:bg-muted/50 rounded px-2 py-1 w-full min-w-0 break-words">
          {painText}
        </p>
      </div>
      {/* 4행: 최근 히스토리 요약 — Read-only, 구글챗 분석 AI만 업데이트 */}
      <div className="min-h-[20px]" aria-readonly="true" title="구글챗 분석 AI 전용 · 사용자 수정 불가">
        <p className="text-[11px] font-medium text-muted-foreground mb-0.5">최근 히스토리 요약</p>
        <p className="text-[12px] text-foreground bg-muted/40 dark:bg-muted/30 rounded px-2 py-1 w-full min-w-0 break-words line-clamp-3">
          {item.history_summary || '실시간 상담 진행 중...'}
        </p>
        <p className="text-[10px] text-muted-foreground/80 mt-0.5">AI 분석 전용 · 수정 불가</p>
      </div>
    </button>
  )
}

export default function ConsultationManagement() {
  const [selectedLead, setSelectedLead] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isPortfolioBankOpen, setIsPortfolioBankOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [asModalLeadId, setAsModalLeadId] = useState<string | null>(null)
  const [asReason, setAsReason] = useState('')
  const [editModalLeadId, setEditModalLeadId] = useState<string | null>(null)
  const [estimateModalLeadId, setEstimateModalLeadId] = useState<string | null>(null)
  const [newEstimateForm, setNewEstimateForm] = useState({ amount: '', summary: '' })
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false)
  /** 상담 상세 패널 탭: 상담 히스토리 | 실측 자료 | 견적 관리 */
  const [detailPanelTab, setDetailPanelTab] = useState<'history' | 'measurement' | 'estimate'>('history')
  /** 견적서 풀스크린 모달: 열림 여부, 수정 시 estimate id, 편집 시 초기 데이터 */
  const [estimateModalOpen, setEstimateModalOpen] = useState(false)
  const [estimateModalEditId, setEstimateModalEditId] = useState<string | null>(null)
  const [estimateModalInitialData, setEstimateModalInitialData] = useState<Partial<EstimateFormData> | null>(null)
  const estimateFormRef = useRef<EstimateFormHandle>(null)
  /** 현재 상담 건의 견적서 목록 (estimates 테이블) */
  const [estimatesList, setEstimatesList] = useState<Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>>([])
  const [estimatesLoading, setEstimatesLoading] = useState(false)
  const [editForm, setEditForm] = useState<{
    company: string
    name: string
    region: string
    industry: string
    contact: string
    inboundDate: string
    requiredDate: string
    painPoint: string
    customerTier: CustomerTier
  }>({
    company: '',
    name: '',
    region: '',
    industry: '',
    contact: '',
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
    source: '',
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
  const [listPage, setListPage] = useState(0)

  /** 탭별 개수 (숫자 표시용) */
  const tabCounts = useMemo(() => {
    const now = Date.now()
    const cut1m = subMonths(now, 1).getTime()
    const cut3m = subMonths(now, 3).getTime()
    const inRange = (lead: Lead) => {
      const t = new Date(lead.createdAt).getTime()
      if (dateRange === '1m') return t >= cut1m
      if (dateRange === '3m') return t >= cut3m
      return true
    }
    const q = searchQuery.trim().toLowerCase()
    const matchSearch = (l: Lead) =>
      !q ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.contact || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    const base = leads.filter((l) => inRange(l) && matchSearch(l))
    const ended = base.filter(isEnded)
    const active = base.filter((l) => !isEnded(l))
    return {
      전체: active.length,
      미처리: active.filter((l) => l.workflowStage === '상담접수').length,
      진행중: active.filter((l) => l.workflowStage === '견적중' || l.workflowStage === '계약완료').length,
      AS대기: active.filter((l) => l.status === 'AS_WAITING').length,
      종료: ended.length,
    }
  }, [leads, searchQuery, dateRange])

  /** 필터+정렬된 리스트 (최신 업데이트 순 = createdAt desc) */
  const filteredLeads = useMemo(() => {
    const now = Date.now()
    const cut1m = subMonths(now, 1).getTime()
    const cut3m = subMonths(now, 3).getTime()
    const inRange = (lead: Lead) => {
      const t = new Date(lead.createdAt).getTime()
      if (dateRange === '1m') return t >= cut1m
      if (dateRange === '3m') return t >= cut3m
      return true
    }
    const q = searchQuery.trim().toLowerCase()
    const matchSearch = (l: Lead) =>
      !q ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.contact || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    let list = leads.filter((l) => inRange(l) && matchSearch(l))
    if (listTab === '종료') list = list.filter(isEnded)
    else {
      list = list.filter((l) => !isEnded(l))
      if (listTab === '미처리') list = list.filter((l) => l.workflowStage === '상담접수')
      else if (listTab === '진행중') list = list.filter((l) => l.workflowStage === '견적중' || l.workflowStage === '계약완료')
      else if (listTab === 'AS대기') list = list.filter((l) => l.status === 'AS_WAITING')
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [leads, listTab, searchQuery, dateRange])

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / LIST_PAGE_SIZE))
  const paginatedLeads = useMemo(
    () => filteredLeads.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
    [filteredLeads, listPage]
  )

  useEffect(() => {
    if (listPage >= totalPages) setListPage(Math.max(0, totalPages - 1))
  }, [listPage, totalPages])

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
      const sameContactLeads = leads.filter(
        (l) => normalizeContactForSync(l.contact) === normalizedContact
      )
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
      }
      if (isMarket) {
        metadata.is_market_order = true
        if (form.orderNumber.trim()) metadata.order_number = form.orderNumber.trim()
      }

      const { error } = await supabase.from('consultations').insert({
        company_name: form.companyName.trim(),
        manager_name: form.managerName.trim(),
        contact,
        status: '상담중',
        metadata,
      })
      if (error) throw error

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
        source: '',
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
      // metadata 포함하려면 consultations 테이블 직접 조회 (뷰에는 metadata 없음)
      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const raw = (data || []) as Array<Record<string, unknown>>
      const mappedLeads: Lead[] = raw.map(mapConsultationRowToLead)
      setLeads(mappedLeads)
      if (mappedLeads.length > 0 && !selectedLead) {
        setSelectedLead(mappedLeads[0].id)
      }
    } catch (err: unknown) {
      console.error('Error:', err)
      toast.error('상담 내역을 불러오지 못했습니다.')
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

  /** AS 요청/해제 토글 — status 강제 전환(AS_WAITING/휴식기) + metadata.as_requested 반영 */
  const handleToggleAs = async (leadId: string, requested: boolean, reason?: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const nextMeta = { ...(lead.metadata ?? {}), as_requested: requested, as_reason: reason ?? (lead.metadata?.as_reason as string) ?? '' }
    if (!requested) delete (nextMeta as Record<string, unknown>).as_reason
    const nextStatus: Lead['status'] = requested ? 'AS_WAITING' : '휴식기'

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, asRequested: requested, status: nextStatus } : l
      )
    )
    setAsModalLeadId(null)
    setAsReason('')
    try {
      const { error } = await supabase
        .from('consultations')
        .update({ metadata: nextMeta, status: nextStatus })
        .eq('id', leadId)
      if (error) throw error
      if (requested) toast.success('AS 대기 목록으로 이동되었습니다.')
      else toast.success('AS 완료 처리했습니다.')
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, asRequested: lead.asRequested, status: lead.status } : l
        )
      )
      toast.error('저장에 실패했습니다.')
    }
  }

  const handleAsClick = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    if (lead.asRequested || lead.status === 'AS_WAITING') {
      handleToggleAs(leadId, false)
    } else {
      setAsModalLeadId(leadId)
      setAsReason('')
    }
  }

  const handleEditClick = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    setEditForm({
      company: lead.company || '',
      name: lead.name || '',
      region: lead.region || '',
      industry: lead.industry || '',
      contact: lead.contact || '',
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
    const industry = editForm.industry || ''
    const inboundDate = editForm.inboundDate.trim().slice(0, 10)
    const requiredDate = editForm.requiredDate.trim().slice(0, 10)
    const painPoint = editForm.painPoint.trim()
    const customerTier = getValidCustomerTier(editForm.customerTier)
    const nextMeta = {
      ...(lead.metadata ?? {}),
      company_name: company || null,
      manager_name: name || null,
      region: region || null,
      industry: industry || null,
      inbound_date: inboundDate || null,
      required_date: requiredDate || null,
      pain_point: painPoint || null,
      customer_tier: customerTier,
    }
    const updatedLead: Lead = {
      ...lead,
      company: company || lead.company,
      name: name || lead.name,
      contact,
      region: region || lead.region,
      industry: industry || lead.industry,
      inboundDate: inboundDate || lead.inboundDate,
      requiredDate: requiredDate || lead.requiredDate,
      painPoint: painPoint || lead.painPoint,
      customerTier,
      metadata: nextMeta,
    }
    const normalizedContact = normalizeContactForSync(contact)
    const sameContactLeadIds = leads
      .filter(
        (l) => l.id !== editModalLeadId && normalizeContactForSync(l.contact) === normalizedContact
      )
      .map((l) => l.id)
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
      const { error } = await supabase
        .from('consultations')
        .update({
          company_name: company || '',
          manager_name: name || '',
          contact: contact || '',
          metadata: nextMeta,
        })
        .eq('id', editModalLeadId)
      if (error) throw error

      for (const otherId of sameContactLeadIds) {
        const other = leads.find((l) => l.id === otherId)
        if (!other) continue
        const otherMeta = { ...(other.metadata ?? {}), customer_tier: customerTier }
        await supabase.from('consultations').update({ metadata: otherMeta }).eq('id', otherId)
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
        .update({ metadata: nextMeta, expected_revenue: displayAmount })
        .eq('id', leadId)
      if (error) throw error
      toast.success('해당 견적을 확정했습니다.')
    } catch (err) {
      console.error(err)
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, metadata: lead.metadata, estimateHistory: lead.estimateHistory, displayAmount: lead.displayAmount, expectedRevenue: lead.expectedRevenue } : l))
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
      const { error } = await supabase.from('consultations').update({ metadata: nextMeta }).eq('id', leadId)
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

  /** 4단계 상담 단계 변경 — 낙관적 업데이트 후 metadata + status 반영 */
  const handleStageChange = async (leadId: string, stage: ConsultationStage) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const prevStage = lead.workflowStage
    const nextMeta = { ...(lead.metadata ?? {}), workflow_stage: stage }
    const stageToStatus: Record<ConsultationStage, Lead['status']> = {
      상담접수: '상담중',
      견적중: '견적발송',
      계약완료: '계약완료',
      시공완료: '휴식기',
    }
    const nextStatus = stageToStatus[stage]

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, workflowStage: stage, status: nextStatus } : l
      )
    )

    try {
      const { error } = await supabase
        .from('consultations')
        .update({
          metadata: nextMeta,
          status: nextStatus,
        })
        .eq('id', leadId)
      if (error) throw error
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

  useEffect(() => {
    fetchLeads()
  }, [])

  // Real-time: Backend에서 google_chat_url 등이 갱신되면 새로고침 없이 리스트 반영 (구글챗 자동 생성 연동 대비)
  useEffect(() => {
    const channel = supabase
      .channel('consultations-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'consultations' },
        (payload) => {
          const next = payload.new as Record<string, unknown>
          setLeads((prev) => {
            const updated = mapConsultationRowToLead(next)
            const idx = prev.findIndex((l) => l.id === updated.id)
            if (idx < 0) return [updated, ...prev]
            const list = [...prev]
            list[idx] = updated
            return list
          })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  const selectedLeadData = selectedLead ? leads.find((l) => l.id === selectedLead) : null

  /** 상담 건 변경 시 견적서 모달 닫기 */
  useEffect(() => {
    setEstimateModalOpen(false)
  }, [selectedLead])

  /** 현재 상담 건의 견적서 목록 조회 (estimates 테이블) */
  useEffect(() => {
    if (!selectedLead || detailPanelTab !== 'estimate') {
      setEstimatesList([])
      return
    }
    let cancelled = false
    setEstimatesLoading(true)
    supabase
      .from('estimates')
      .select('id, consultation_id, payload, supply_total, vat, grand_total, approved_at, created_at')
      .eq('consultation_id', selectedLead)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setEstimatesLoading(false)
        if (error) {
          console.error(error)
          setEstimatesList([])
          return
        }
        setEstimatesList((data ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
      })
    return () => { cancelled = true }
  }, [selectedLead, detailPanelTab])

  /** 견적서 승인 시 estimates 테이블 저장 + metadata.estimate_history 동기화 */
  const handleEstimateApproved = async (consultationId: string, data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) => {
    const lead = leads.find((l) => l.id === consultationId)
    if (!lead) return
    try {
      const { error: insertError } = await supabase.from('estimates').insert({
        consultation_id: consultationId,
        payload: data as unknown as Record<string, unknown>,
        supply_total: data.supplyTotal,
        vat: data.vat,
        grand_total: data.grandTotal,
      })
      if (insertError) throw insertError

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

      const updatePayload: { metadata: Record<string, unknown>; status?: Lead['status'] } = { metadata: nextMeta }
      if (data.mode !== 'PROPOSAL') updatePayload.status = '견적발송'

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
                ...(data.mode === 'FINAL' ? { status: '견적발송' as const } : {}),
              }
        )
      )
      const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
      setEstimateModalOpen(false)
      toast.success('견적서가 저장되었습니다.')
    } catch (err) {
      console.error(err)
      toast.error('견적서 저장에 실패했습니다.')
    }
  }

  /** 견적서 임시저장 — payload에 draft: true, DB에만 반영 */
  const handleEstimateSaveDraft = async (consultationId: string) => {
    const formHandle = estimateFormRef.current
    if (!formHandle) return
    const data = formHandle.getCurrentData()
    const payload = { ...data, draft: true } as unknown as Record<string, unknown>
    try {
      if (estimateModalEditId) {
        const { error } = await supabase
          .from('estimates')
          .update({
            payload,
            supply_total: data.supplyTotal,
            vat: data.vat,
            grand_total: data.grandTotal,
          })
          .eq('id', estimateModalEditId)
        if (error) throw error
        toast.success('임시저장되었습니다.')
      } else {
        const { error } = await supabase.from('estimates').insert({
          consultation_id: consultationId,
          payload,
          supply_total: data.supplyTotal,
          vat: data.vat,
          grand_total: data.grandTotal,
        })
        if (error) throw error
        toast.success('임시저장되었습니다.')
      }
      const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
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
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  className="gap-1.5 h-9 px-4 text-sm font-semibold bg-primary"
                >
                  <Plus className="h-4 w-4" />
                  신규 등록
                </Button>
              </DialogTrigger>
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
                  {/* 6. 상담경로 */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">상담경로</label>
                    <select
                      className={`w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}
                      value={form.source}
                      onChange={(e) => {
                      const v = e.target.value
                      setForm((prev) => ({ ...prev, source: v, orderNumber: isMarketSource(v) ? prev.orderNumber : '' }))
                    }}
                    >
                      <option value="">선택</option>
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

            <Button variant="outline" className="h-9 gap-1.5 px-4 text-sm">
              <Calculator className="h-4 w-4" />
              스마트 견적
            </Button>
            <Dialog open={isPortfolioBankOpen} onOpenChange={setIsPortfolioBankOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1.5 px-4 text-sm"
                >
                  <Images className="h-4 w-4" />
                  시공사례 뱅크
                </Button>
              </DialogTrigger>
              <PortfolioBankModal onClose={() => setIsPortfolioBankOpen(false)} />
            </Dialog>
            <Link to="/measurement">
              <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                <Ruler className="h-4 w-4" />
                실측 관리
              </Button>
            </Link>
            <Link to="/assets">
              <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                이미지 자산 뷰어
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

        {/* 상담 정보 수정 모달 — 업체명·지역·업종·전화·인입일·필요일·요청사항 */}
        {/* 실측 자료(PDF) — 전용 모듈/업로드 페이지로 이동용 모달 */}
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
                  <span className="font-medium text-foreground">{selectedLeadData.company || '(업체명 없음)'}</span> — 실측 정보 입력 페이지에서 PDF·메모를 관리합니다.
                </p>
                {selectedLeadData.measurementDrawingPath ? (
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => openMeasurementDrawingPreview(selectedLeadData.measurementDrawingPath!)}>
                    <FileText className="h-4 w-4" />
                    PDF 미리보기 (일시적 링크)
                  </Button>
                ) : null}
                <Link to={`/measurement/upload?consultationId=${selectedLeadData.id}`} className="block">
                  <Button type="button" className="w-full gap-2" size="sm">
                    <Ruler className="h-4 w-4" />
                    실측 정보 입력 페이지로 이동
                  </Button>
                </Link>
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
              const list = [...lead.estimateHistory].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
              return (
                <div className="space-y-4 pt-1">
                  <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                    {list.length === 0 ? (
                      <li className="text-sm text-muted-foreground py-4 text-center">발행된 견적이 없습니다. 아래에서 추가해 주세요.</li>
                    ) : (
                      list.map((e) => (
                        <li key={e.version} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 bg-muted/30">
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
                              onClick={() => void handleSetEstimateFinal(lead.id, e.version)}
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
                <label className="text-sm font-medium block mb-1">업체명</label>
                <Input value={editForm.company} onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))} className={INPUT_CLASS} placeholder="업체/학교/학원명" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">고객명</label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={INPUT_CLASS} placeholder="담당자명" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium block mb-1">지역</label>
                  <Input value={editForm.region} onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))} className={INPUT_CLASS} placeholder="예: 서울 강남" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">업종</label>
                  <select value={editForm.industry} onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {CONSULTATION_INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">전화번호</label>
                <Input type="tel" inputMode="numeric" autoComplete="tel" value={editForm.contact} onChange={(e) => setEditForm((f) => ({ ...f, contact: formatContactInput(e.target.value) }))} className={INPUT_CLASS} placeholder="010-1234-5678" maxLength={13} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium block mb-1">인입일</label>
                  <Input type="date" value={editForm.inboundDate} onChange={(e) => setEditForm((f) => ({ ...f, inboundDate: e.target.value }))} className={INPUT_CLASS} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">필요일</label>
                  <Input type="date" value={editForm.requiredDate} onChange={(e) => setEditForm((f) => ({ ...f, requiredDate: e.target.value }))} className={INPUT_CLASS} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">요청사항</label>
                <Input value={editForm.painPoint} onChange={(e) => setEditForm((f) => ({ ...f, painPoint: e.target.value }))} className={INPUT_CLASS} placeholder="페인포인트·요청사항" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">고객 등급</label>
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

        {/* 좌측: 검색·기간·탭·리스트 | 우측: 히스토리 패널 — PC 고밀도 */}
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* 검색 + 기간 필터 — 상단 고정 */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="업체명, 전화번호 검색"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setListPage(0) }}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <select
                value={dateRange}
                onChange={(e) => { setDateRange(e.target.value as DateRangeKey); setListPage(0) }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">전체 기간</option>
                <option value="1m">최근 1개월</option>
                <option value="3m">최근 3개월</option>
              </select>
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
                  <Tabs value={listTab} onValueChange={(v) => { setListTab(v as ListTab); setListPage(0) }} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto shrink-0">
                      {(['전체', '미처리', '진행중', 'AS대기', '종료'] as const).map((tab) => (
                        <TabsTrigger key={tab} value={tab} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-sm">
                          {tab} {tabCounts[tab]}
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
                          <li key={lead.id}>
                            <ConsultationListItem
                              item={lead}
                              isSelected={selectedLead === lead.id}
                              onSelect={() => setSelectedLead(lead.id)}
                              onCopyContact={handleCopyContact}
                              onStageChange={handleStageChange}
                              onAsClick={handleAsClick}
                              onEditClick={handleEditClick}
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

          {/* 우측: 상담 상세 패널 — [상담 히스토리 | 실측 자료 | 견적 관리] 탭 */}
          <aside
            className={`shrink-0 flex flex-col border border-border rounded-xl bg-card overflow-hidden transition-[width,opacity] duration-200 ${
              selectedLeadData ? 'w-full sm:w-[400px] md:w-[420px] opacity-100' : 'w-0 opacity-0 pointer-events-none overflow-hidden border-0'
            }`}
          >
            {selectedLeadData && (
              <Tabs value={detailPanelTab} onValueChange={(v) => setDetailPanelTab(v as 'history' | 'measurement' | 'estimate')} className="flex flex-col h-full">
                <TabsList className="w-full grid grid-cols-3 rounded-none border-b border-border bg-muted/50 h-10">
                  <TabsTrigger value="history" className="text-xs rounded-none">상담 히스토리</TabsTrigger>
                  <TabsTrigger value="measurement" className="text-xs rounded-none">실측 자료</TabsTrigger>
                  <TabsTrigger value="estimate" className="text-xs rounded-none">견적 관리</TabsTrigger>
                </TabsList>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {/* 탭 1: 상담 히스토리 */}
                  <div className={detailPanelTab === 'history' ? 'p-4 space-y-4' : 'hidden'}>
                    <div className="space-y-2 text-sm">
                      <p className="font-semibold text-foreground">{selectedLeadData.company || '(업체명 없음)'}</p>
                      <p className="text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        {selectedLeadData.name || '(고객명 없음)'}
                      </p>
                      {selectedLeadData.contact && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <a href={`tel:${selectedLeadData.contact.replace(/\D/g, '')}`} className="text-primary hover:underline">
                            {formatContact(selectedLeadData.contact)}
                          </a>
                        </p>
                      )}
                      <CustomerTierBadge tier={selectedLeadData.customerTier} />
                      <button
                        type="button"
                        onClick={() => { setEstimateModalLeadId(selectedLeadData.id); setNewEstimateForm({ amount: '', summary: '' }) }}
                        className="flex items-center gap-1.5 text-left w-full rounded-lg border border-border bg-muted/40 hover:bg-muted/70 px-3 py-2 text-sm transition-colors"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground">견적 이력</span>
                        <span className="text-muted-foreground">({selectedLeadData.estimateHistory.length}건)</span>
                        {selectedLeadData.displayAmount > 0 && (
                          <span className="ml-auto font-semibold text-primary">{selectedLeadData.displayAmount.toLocaleString()}원</span>
                        )}
                      </button>
                    </div>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2">상담 · 거래 타임라인</h3>
                    <ul className="space-y-3">
                      <li className="flex gap-2">
                        <span className="rounded-full bg-primary/20 p-1.5 shrink-0">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm">상담 등록</p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(selectedLeadData.createdAt), { addSuffix: true, locale: ko })} · {selectedLeadData.status}</p>
                        </div>
                      </li>
                      <li className="flex gap-2">
                        <div className="rounded-full bg-muted w-6 h-6 shrink-0" />
                        <div className="text-xs text-muted-foreground py-1">상담 일지·거래 이력 추후 연동</div>
                      </li>
                    </ul>
                  </div>
                  {/* 탭 2: 실측 자료 */}
                  <div className={detailPanelTab === 'measurement' ? 'p-4 space-y-4' : 'hidden'}>
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">실측 자료</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{selectedLeadData.company || '(업체명 없음)'}</span> — 실측 정보 입력 페이지에서 PDF·메모를 관리합니다.
                    </p>
                    {selectedLeadData.measurementDrawingPath ? (
                      <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => openMeasurementDrawingPreview(selectedLeadData.measurementDrawingPath!)}>
                        <FileText className="h-3.5 w-3.5" />
                        실측 PDF 미리보기
                      </Button>
                    ) : null}
                    <Link to={`/measurement/upload?consultationId=${selectedLeadData.id}`} className="block">
                      <Button type="button" variant="default" size="sm" className="w-full gap-2">
                        <Ruler className="h-3.5 w-3.5" />
                        실측 정보 입력 페이지로 이동
                      </Button>
                    </Link>
                  </div>
                  {/* 탭 3: 견적 관리 — 목록만 표시, 작성/수정은 풀스크린 모달 */}
                  <div className={detailPanelTab === 'estimate' ? 'p-4 flex flex-col min-h-0' : 'hidden'}>
                    <Button
                      type="button"
                      className="w-full gap-2 mb-3"
                      onClick={() => {
                        setEstimateModalEditId(null)
                        setEstimateModalInitialData({
                          recipientName: [selectedLeadData.company, selectedLeadData.name].filter(Boolean).join(' ') || '(수신자 없음)',
                          recipientContact: selectedLeadData.contact ?? '',
                        })
                        setEstimateModalOpen(true)
                      }}
                    >
                      <FileText className="h-4 w-4" />
                      신규 견적 작성
                    </Button>
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2">기존 견적 이력</h3>
                    {estimatesLoading ? (
                      <p className="text-sm text-muted-foreground">불러오는 중…</p>
                    ) : estimatesList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">저장된 견적서가 없습니다. 위에서 신규 견적을 작성해 보세요.</p>
                    ) : (
                      <ul className="space-y-2">
                        {estimatesList.map((est) => {
                          const payload = est.payload as { draft?: boolean } & Record<string, unknown>
                          const status = payload?.draft ? '임시저장' : '발행'
                          return (
                            <li key={est.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium text-foreground">{new Date(est.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                <p className="text-muted-foreground">총액 {Number(est.grand_total).toLocaleString()}원 · {status}</p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEstimateModalEditId(est.id)
                                  setEstimateModalInitialData((est.payload ?? {}) as Partial<EstimateFormData>)
                                  setEstimateModalOpen(true)
                                }}
                              >
                                수정
                              </Button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </Tabs>
            )}
          </aside>

        {/* 견적서 전용 풀스크린 모달 — 블러 배경, [임시저장][발행승인][닫기] 고정 */}
        <Dialog open={estimateModalOpen} onOpenChange={setEstimateModalOpen}>
          <DialogContent
            overlayClassName="bg-black/40 backdrop-blur-md"
            className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 flex flex-col gap-0"
          >
            <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-b border-border bg-card">
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
                onClick={() => estimateFormRef.current?.requestApprove()}
              >
                발행승인
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEstimateModalOpen(false)}>
                닫기
              </Button>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-4">
              {selectedLeadData && (
                <EstimateForm
                  key={estimateModalEditId ?? 'new'}
                  ref={estimateFormRef}
                  initialData={estimateModalInitialData ?? {
                    recipientName: [selectedLeadData.company, selectedLeadData.name].filter(Boolean).join(' ') || '(수신자 없음)',
                    recipientContact: selectedLeadData.contact ?? '',
                  }}
                  onApproved={(data) => void handleEstimateApproved(selectedLeadData.id, data)}
                  hideInternalActions
                  className="max-w-5xl mx-auto"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </main>
    </div>
  )
}
