import React, { useState, useEffect, useMemo, useRef, useCallback, Component, type ErrorInfo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Calculator, RefreshCw, Zap, Phone, Copy, User, Images, MessageCircle, Pencil, Loader2, Search, FileText, CheckCircle, Ruler, Trash2, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getGoldenTimeState, type GoldenTimeTier } from '@/utils/dateUtils'

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
import { subMonths, startOfMonth, startOfDay } from 'date-fns'
import { EstimateForm, type EstimateFormData, type EstimateFormHandle, ProposalPreviewContent, FinalEstimatePreviewContent, computeProposalTotals, computeFinalTotals, createEmptyRow } from '@/components/estimate/EstimateForm'
import { ConsultationChat, type ConsultationMessage } from '@/components/chat/ConsultationChat'
import { OrderDocumentsGallery } from '@/components/order/OrderDocumentsGallery'
import { insertSystemLog } from '@/lib/activityLog'
import { getVendorPriceRecommendation } from '@/lib/estimateRecommendationService'
import { getDataByProductTags } from '@/lib/productDataMatching'
import { exportEstimateToPdf, exportEstimateToImage, buildEstimateImageFilename, buildEstimatePdfFilename } from '@/lib/estimatePdfExport'
import { isValidUUID } from '@/lib/uuid'
import type { OrderDocument } from '@/types/orderDocument'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

/** 채팅 UI 오류 시 화이트 스크린 방지 — 에러 시 폴백만 표시 */
class ChatErrorBoundary extends Component<{ children: React.ReactNode; fallback?: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ConsultationChat]', error, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground border border-border rounded-lg bg-muted/30">
          채팅을 불러올 수 없습니다. 새로고침 후 다시 시도해 주세요.
        </div>
      )
    }
    return this.props.children
  }
}

// PC 사무용: 컴팩트 (48px 규칙 미적용)
const INPUT_CLASS = 'h-10 text-sm'
const BUTTON_SUBMIT_CLASS = 'h-9 w-full text-sm font-semibold'

/** 인입채널 옵션(9종) — consultations.metadata.source에 저장. 기본값 채널톡으로 오입력 방지 */
const CONSULT_SOURCES = [
  { value: '채널톡', label: '채널톡' },
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
type ListTab = '전체' | '미처리' | '진행중' | 'AS대기' | '종료' | '캔슬'
type DateRangeKey = 'all' | 'thisMonth' | '1m' | '3m' | '6m' | '1y'

/** 시공완료 또는 거절(캔슬) — 활성 리스트(전체 등)에서 제외. [종료]=시공완료만, [캔슬]=거절만 (DB status '거절') */
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
  /** 골든타임 3단계: D+0~7 urgent, D+8~20 progress, D+21~30 deadline, 30일 초과 시 null */
  goldenTimeTier?: GoldenTimeTier
  /** D+27(종료 3일 전) 시 담당자 알림 트리거용 */
  goldenTimeDeadlineSoon?: boolean
  /** created_at 기준 경과 일수 */
  goldenTimeElapsedDays?: number
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
  /** 확정견적 금액(VAT 포함). FINAL 견적서가 있을 때만 설정, ReadOnly·견적 확정으로만 변경 */
  finalAmount: number | null
  interestLevel: 'High' | 'Medium' | 'Low'
  marketingStatus: boolean
  /** 구글챗 스타일 식별자: [YYMM] [상호/성함] [연락처 뒷4자리] (metadata.display_name 또는 자동 계산) */
  displayName: string
  /** 마지막 확인 시각(ISO); 읽지 않은 새 메시지 알람 판단용 */
  lastViewedAt?: string | null
}

/** 상담 식별자 자동 생성: [YYMM] [상호/성함] [연락처 뒷4자리]. refDate는 상담 생성일(YYMM 고정용). */
function computeDisplayName(companyOrName: string, contact: string, refDate: Date): string {
  const yymm = `${refDate.getFullYear().toString().slice(-2)}${String(refDate.getMonth() + 1).padStart(2, '0')}`
  const digits = (contact || '').replace(/\D/g, '')
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0').slice(-4) || '0000'
  const namePart = (companyOrName || '').trim() || '상담'
  return `${yymm} ${namePart} ${last4}`
}

/** consultations 테이블 row → Lead 매핑 (fetch 및 Real-time 업데이트 공용) */
function mapConsultationRowToLead(item: Record<string, unknown>): Lead {
  const created = (item.created_at as string) || new Date().toISOString()
  const meta = (item.metadata as Record<string, unknown> | null) ?? null
  const company = pickDisplayName(item.company_name as string | null, meta, 'company_name', '(업체명 없음)')
  const name = pickDisplayName(item.manager_name as string | null, meta, 'manager_name', '(고객명 없음)')
  const contactStr = String(item.contact ?? '')
  const displayName =
    (meta && typeof meta.display_name === 'string' && meta.display_name.trim())
      ? meta.display_name.trim()
      : computeDisplayName(company, contactStr, new Date(created))
  const goldenTime = getGoldenTimeState(created)
  const isGoldenTime = goldenTime.isGoldenTime
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
    contact: String(item.contact ?? ''),
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
    finalAmount,
    interestLevel: 'Medium',
    marketingStatus: false,
    lastViewedAt: (item.last_viewed_at as string | null) ?? null,
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

/** 상태 바 버튼 6종 — 표시: 접수|견적|계약|완료|AS|캔슬. 기본 회색, 활성 시에만 고유 색상. 고정 너비로 레이아웃 유지. */
const STAGE_BAR_OPTIONS = [
  { key: '상담접수' as const, label: '접수', activeClass: 'text-blue-600 dark:text-blue-400' },
  { key: '견적중' as const, label: '견적', activeClass: 'text-orange-500 dark:text-orange-400' },
  { key: '계약완료' as const, label: '계약', activeClass: 'text-green-600 dark:text-green-400' },
  { key: '시공완료' as const, label: '완료', activeClass: 'text-purple-500 dark:text-purple-400' },
  { key: 'AS' as const, label: 'AS', activeClass: 'text-red-500 dark:text-red-400' },
  { key: '캔슬' as const, label: '캔슬', activeClass: 'text-slate-600 dark:text-slate-400' },
] as const
export type StageBarValue = (typeof STAGE_BAR_OPTIONS)[number]['key']

/** 현재 활성 상태 바 값 — DB status·metadata.workflow_stage와 1:1: AS_WAITING→AS, 거절→캔슬, 그 외 workflowStage 그대로 */
function getStageBarValue(item: Lead): StageBarValue {
  if (item.status === 'AS_WAITING') return 'AS'
  if (item.status === '거절') return '캔슬'
  return item.workflowStage
}

/** 6개 텍스트 버튼 상태 바 — 기본 text-gray-400, 활성 시에만 고유 색상 + transition-colors */
function StageProgressBar({
  item,
  onStageChange,
  onAsClick,
  onCancelClick,
}: {
  item: Lead
  onStageChange: (stage: ConsultationStage) => void
  onAsClick: () => void
  onCancelClick: () => void
}) {
  const current = getStageBarValue(item)

  return (
    <div className="inline-flex items-center gap-0.5 shrink-0 flex-nowrap" onClick={(e) => e.stopPropagation()}>
      {STAGE_BAR_OPTIONS.map(({ key, label, activeClass }) => {
        const isActive = current === key
        return (
          <button
            key={key}
            type="button"
            title={key}
            onClick={(e) => {
              e.stopPropagation()
              if (key === '캔슬') onCancelClick()
              else if (key === 'AS') onAsClick()
              else onStageChange(key as ConsultationStage)
            }}
            className={cn(
              'inline-flex items-center justify-center min-w-[2rem] rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-200 hover:opacity-90',
              'text-gray-400 dark:text-gray-500',
              isActive && activeClass,
              isActive && 'font-semibold'
            )}
          >
            {label}
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
  onCancelClick,
  onEditClick,
  lastMessage,
}: {
  item: Lead
  isSelected: boolean
  isHighlighted?: boolean
  onSelect: () => void
  onCopyContact: (e: React.MouseEvent, tel: string) => void
  onStageChange: (leadId: string, stage: ConsultationStage) => void
  onAsClick: (leadId: string) => void
  onCancelClick: (leadId: string) => void
  onEditClick: (leadId: string) => void
  lastMessage?: LastActivityMessage | null
}) {
  const painText = item.painPoint?.trim() || '(요청사항 없음)'
  const contactDisplay = item.contact ? formatContact(item.contact) : ''
  const telHref = item.contact ? `tel:${item.contact.replace(/\D/g, '')}` : '#'
  const lastTime = lastMessage?.created_at ? formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true, locale: ko }) : ''
  const lastMessageAt = lastMessage?.created_at ? new Date(lastMessage.created_at).getTime() : 0
  const lastViewedAtMs = item.lastViewedAt ? new Date(item.lastViewedAt).getTime() : 0
  const hasUnread = lastMessageAt > 0 && lastMessageAt > lastViewedAtMs
  /** 완료(시공완료)·캔슬(거절)이 아닐 때 31일 초과 = 장기 미체결 → 카드 투명도 낮춤 */
  const isLongTermUnresolved =
    (item.goldenTimeElapsedDays ?? 0) > 30 && item.status !== '거절' && item.workflowStage !== '시공완료'
  /** 골든타임/상태 배지 표시 여부 — 완료·캔슬·AS요청이면 숨김 */
  const showStateBadge = item.status !== '거절' && item.status !== 'AS_WAITING' && item.workflowStage !== '시공완료'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative w-full text-left rounded-md border transition-colors flex flex-col gap-1 px-2 py-1.5 min-h-0',
        isSelected ? 'bg-primary/10 border-primary' : 'bg-card border-border hover:bg-muted/50',
        isHighlighted && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background bg-amber-100/90 dark:bg-amber-500/25 dark:ring-amber-400 animate-pulse',
        isLongTermUnresolved && 'opacity-70'
      )}
    >
      {/* 읽지 않은 새 메시지 알람: 마지막 메시지 시각이 last_viewed_at보다 이후일 때 */}
      {hasUnread && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" title="읽지 않은 새 메시지" aria-hidden />
      )}
      {/* 1행: 등급배지 · 업체명 · AS요청 · 확정견적 | 우측 진행/편집/복사 (골든타임 배지는 2행 최좌측) */}
      <div className="flex flex-row items-center justify-between gap-1.5 min-h-[20px]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden flex-wrap">
          <CustomerTierBadge tier={item.customerTier} />
          <span className="font-semibold text-foreground text-[13px] leading-tight truncate" title={item.displayName}>
            {item.displayName}
          </span>
          {(item.asRequested || item.status === 'AS_WAITING') && (
            <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-700 dark:text-red-400 ring-1 ring-red-500/30">
              AS 요청
            </span>
          )}
          {item.finalAmount != null && item.finalAmount > 0 && (
            <span className="shrink-0 text-[11px] font-medium text-primary">
              확정견적 {item.finalAmount.toLocaleString()}원
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <StageProgressBar
            item={item}
            onStageChange={(stage) => onStageChange(item.id, stage)}
            onAsClick={() => onAsClick(item.id)}
            onCancelClick={() => onCancelClick(item.id)}
          />
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
      {/* 2행: [골든/상태 배지] · 인입채널 · 지역 · 업종 · 전화번호 · (주문번호) · 인입날짜 · 요청날짜 */}
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-h-[16px] flex-wrap">
        {showStateBadge && item.workflowStage === '계약완료' && (
          <>
            <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-blue-500 text-white" title="계약완료">
              🏗️ 진행중
            </span>
            <span className="text-border shrink-0">·</span>
          </>
        )}
        {showStateBadge && item.workflowStage !== '계약완료' && item.goldenTimeTier === 'urgent' && (
          <>
            <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-orange-500 text-white" title="D+0~7 Hot">
              ⚡ 골든타임
            </span>
            <span className="text-border shrink-0">·</span>
          </>
        )}
        {showStateBadge && item.workflowStage !== '계약완료' && item.goldenTimeTier === 'progress' && (
          <>
            <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-green-600 text-white" title="D+8~20 Active">
              🌿 집중상담
            </span>
            <span className="text-border shrink-0">·</span>
          </>
        )}
        {showStateBadge && item.workflowStage !== '계약완료' && item.goldenTimeTier === 'deadline' && (
          <>
            <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 bg-yellow-500 text-yellow-950 dark:text-yellow-950" title="D+21~30 Warning">
              🔔 이탈경고
            </span>
            <span className="text-border shrink-0">·</span>
          </>
        )}
        <SourceChannelBadge source={item.source} />
        {item.source?.trim() && <span className="text-border shrink-0">·</span>}
        <span>{item.region || '—'}</span>
        <span className="text-border">·</span>
        <span>{item.industry || '—'}</span>
        <span className="text-border">·</span>
        {contactDisplay ? (
          <a href={telHref} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline truncate max-w-[90px]" title="전화 걸기">
            {contactDisplay}
          </a>
        ) : (
          <span>—</span>
        )}
        {item.orderNumber && (
          <>
            <span className="text-border">·</span>
            <span className="font-mono truncate max-w-[72px]" title="주문번호">{item.orderNumber}</span>
          </>
        )}
        <span className="text-border">·</span>
        {item.inboundDate ? <span>인입 {item.inboundDate}</span> : <span>인입 —</span>}
        <span className="text-border">·</span>
        <span>요청 {item.requiredDate || '미정'}</span>
      </div>
      {/* 3행: 구글챗 버튼 등 */}
      <div className="flex items-center justify-between gap-2 min-h-[16px]">
        <div className="min-w-0 flex-1" />
        <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
          {item.google_chat_url ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); window.open(item.google_chat_url!, '_blank') }}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-[#00A862]/15 text-[#00875A] hover:bg-[#00A862]/25 dark:bg-[#00A862]/20 dark:text-emerald-400 border border-[#00A862]/30"
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
      {/* 4행: 요청사항(페인포인트) — 연한 배경, 한 줄 요약 */}
      <div className="min-h-[14px]">
        <p className="text-[11px] text-foreground bg-muted/60 dark:bg-muted/50 rounded px-1.5 py-0.5 w-full min-w-0 break-words line-clamp-2">
          {painText}
        </p>
      </div>
      {/* 카드 하단: 마지막 활동 경과 시간 */}
      {lastMessage?.created_at && (
        <div className="flex justify-end min-h-[12px]">
          <span className="text-[10px] text-muted-foreground" title={new Date(lastMessage.created_at).toLocaleString('ko-KR')}>
            {lastTime}
          </span>
        </div>
      )}
    </button>
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
  const [isPortfolioBankOpen, setIsPortfolioBankOpen] = useState(false)
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
  /** 시스템 로그 딥링크 시 하이라이트할 메시지 id */
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  /** 상담 배지 클릭 시 리스트 스크롤 타깃 (효과 후 클리어) */
  const [scrollToLeadId, setScrollToLeadId] = useState<string | null>(null)
  /** 상담 배지 클릭 후 해당 카드 강조 (반짝 효과용) */
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null)
  /** 카드별 마지막 활동 1건 (consultation_id → LastActivityMessage) */
  const [lastMessagesByConsultationId, setLastMessagesByConsultationId] = useState<Record<string, LastActivityMessage>>({})
  /** 견적서 풀스크린 모달: 열림 여부, 수정 시 estimate id, 편집 시 초기 데이터 */
  const [estimateModalOpen, setEstimateModalOpen] = useState(false)
  const [estimateModalEditId, setEstimateModalEditId] = useState<string | null>(null)
  const [estimateModalInitialData, setEstimateModalInitialData] = useState<Partial<EstimateFormData> | null>(null)
  const estimateFormRef = useRef<EstimateFormHandle>(null)
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
  /** 예산 기획안 발행 전 관리자 미리보기 팝업 */
  const [adminPreviewOpen, setAdminPreviewOpen] = useState(false)
  const [adminPreviewData, setAdminPreviewData] = useState<(EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) | null>(null)
  /** PDF 인쇄용 모달 (승인된 기획안) */
  const [printEstimateId, setPrintEstimateId] = useState<string | null>(null)
  /** 원가표 원본 이미지 라이트박스 (AI 추천 가이드 [원본보기]) */
  const [priceBookImageUrl, setPriceBookImageUrl] = useState<string | null>(null)
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
    source: '',
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
  const [listPage, setListPage] = useState(0)
  /** admin 권한 — 시스템 메시지 영구 삭제 버튼 노출. localStorage 'findgagu-role' === 'admin' 또는 URL ?admin=1 */
  const isAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false
    if (localStorage.getItem('findgagu-role') === 'admin') return true
    if (new URLSearchParams(window.location.search).get('admin') === '1') return true
    return false
  }, [])

  /** 탭별 개수 (숫자 표시용) */
  const tabCounts = useMemo(() => {
    const now = Date.now()
    const cutThisMonth = startOfMonth(new Date()).getTime()
    const cut1m = subMonths(new Date(now), 1).getTime()
    const cut3m = subMonths(new Date(now), 3).getTime()
    const cut6m = subMonths(new Date(now), 6).getTime()
    const cut1y = subMonths(new Date(now), 12).getTime()
    const inRange = (lead: Lead) => {
      const t = new Date(lead.createdAt).getTime()
      if (dateRange === 'thisMonth') return t >= cutThisMonth && t <= now
      if (dateRange === '1m') return t >= cut1m
      if (dateRange === '3m') return t >= cut3m
      if (dateRange === '6m') return t >= cut6m
      if (dateRange === '1y') return t >= cut1y
      return true
    }
    const q = searchQuery.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const matchSearch = (l: Lead) =>
      !q ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.displayName || '').toLowerCase().includes(q) ||
      (l.contact || '').replace(/\D/g, '').includes(qDigits) ||
      (qDigits.length === 4 && (l.contact || '').replace(/\D/g, '').endsWith(qDigits))
    const base = leads.filter((l) => inRange(l) && matchSearch(l))
    const ended = base.filter(isEnded)
    const active = base.filter((l) => !isEnded(l))
    const completedCount = base.filter((l) => l.workflowStage === '시공완료').length
    const cancelCount = base.filter((l) => l.status === '거절').length
    return {
      전체: active.length,
      미처리: active.filter((l) => l.workflowStage === '상담접수').length,
      진행중: active.filter((l) => l.workflowStage === '견적중' || l.workflowStage === '계약완료').length,
      AS대기: active.filter((l) => l.status === 'AS_WAITING').length,
      종료: completedCount,
      캔슬: cancelCount,
    }
  }, [leads, searchQuery, dateRange])

  /** 필터+정렬된 리스트 (최신 업데이트 순 = createdAt desc) */
  const filteredLeads = useMemo(() => {
    const now = Date.now()
    const cutThisMonth = startOfMonth(new Date()).getTime()
    const cut1m = subMonths(new Date(now), 1).getTime()
    const cut3m = subMonths(new Date(now), 3).getTime()
    const cut6m = subMonths(new Date(now), 6).getTime()
    const cut1y = subMonths(new Date(now), 12).getTime()
    const inRange = (lead: Lead) => {
      const t = new Date(lead.createdAt).getTime()
      if (dateRange === 'thisMonth') return t >= cutThisMonth && t <= now
      if (dateRange === '1m') return t >= cut1m
      if (dateRange === '3m') return t >= cut3m
      if (dateRange === '6m') return t >= cut6m
      if (dateRange === '1y') return t >= cut1y
      return true
    }
    const q = searchQuery.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const matchSearch = (l: Lead) =>
      !q ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.displayName || '').toLowerCase().includes(q) ||
      (l.contact || '').replace(/\D/g, '').includes(qDigits) ||
      (qDigits.length === 4 && (l.contact || '').replace(/\D/g, '').endsWith(qDigits))
    let list = leads.filter((l) => inRange(l) && matchSearch(l))
    if (listTab === '종료') list = list.filter((l) => l.workflowStage === '시공완료')
    else if (listTab === '캔슬') list = list.filter((l) => l.status === '거절')
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
    ;(async () => {
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
        status: '상담중',
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
      // metadata 포함하려면 consultations 테이블 직접 조회 (뷰에는 metadata 없음)
      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .eq('is_visible', true)
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

  /** 상담 카드 선택 시 선택 상태 반영 + last_viewed_at 갱신(읽음 처리) — 왼쪽 카드 활성화·우측 상세 로딩과 동기화 */
  const handleSelectLead = useCallback((leadId: string) => {
    setSelectedLead(leadId)
    const now = new Date().toISOString()
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, lastViewedAt: now } : l))
    )
    supabase
      .from('consultations')
      .update({ last_viewed_at: now })
      .eq('id', leadId)
      .then(({ error }) => {
        if (error) console.warn('last_viewed_at 갱신 실패:', error)
      })
  }, [])

  /** 상담 배지 클릭 시: 카드 클릭과 동일하게 handleSelectLead 호출 + 필터 해제(필요 시) + 히스토리 탭 + 스크롤·노란 강조. 종료/캔슬 건은 해당 탭으로 전환 */
  const handleFocusConsultation = useCallback((consultationId: string) => {
    if (!filteredLeads.some((l) => l.id === consultationId)) {
      const lead = leads.find((l) => l.id === consultationId)
      if (lead) {
        if (lead.status === '거절') setListTab('캔슬')
        else if (isEnded(lead)) setListTab('종료')
        else setListTab('전체')
      }
    }
    handleSelectLead(consultationId)
    setDetailPanelTab('history')
    setScrollToLeadId(consultationId)
    setHighlightedLeadId(consultationId)
    setTimeout(() => setHighlightedLeadId(null), 1500)
  }, [filteredLeads, leads, handleSelectLead])

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

  /** AS 요청/해제 토글 — 즉시 뱃지 반영(낙관적 업데이트) + DB status·metadata.as_requested 동기화 */
  const handleToggleAs = async (leadId: string, requested: boolean, reason?: string) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return
    const nextMeta = { ...(lead.metadata ?? {}), as_requested: requested, as_reason: reason ?? (lead.metadata?.as_reason as string) ?? '' }
    if (!requested) delete (nextMeta as Record<string, unknown>).as_reason
    const nextStatus: Lead['status'] = requested ? 'AS_WAITING' : '휴식기'

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
        setListTab('AS대기')
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

  /** 캔슬 사유 저장 — metadata.cancel_reason + status 거절(DB consultation_status), 히스토리 시스템 메시지 */
  const handleCancelSubmit = async () => {
    if (!cancelModalLeadId) return
    const lead = leads.find((l) => l.id === cancelModalLeadId)
    if (!lead) return
    const reason = cancelReasonDraft.trim()
    const nextMeta = { ...(lead.metadata ?? {}), cancel_reason: reason || undefined }
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
      toast.success('캔슬 처리되었습니다.')
      setListTab('캔슬')
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
      source: lead.source?.trim() || '채널톡',
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
    const sourceVal = editForm.source.trim() || null
    const nextMeta = {
      ...(lead.metadata ?? {}),
      company_name: company || null,
      manager_name: name || null,
      region: region || null,
      industry: industry || null,
      source: sourceVal,
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
          metadata: nextMeta as Json,
        })
        .eq('id', editModalLeadId)
      if (error) throw error

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
        .update({ metadata: nextMeta as Json, expected_revenue: displayAmount })
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
    /** DB status 컬럼(consultation_status) 매핑: 상담접수→상담중, 견적중→견적발송, 계약완료→계약완료, 시공완료→휴식기 */
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
          metadata: nextMeta as Json,
          status: nextStatus,
        })
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
      // 상단 탭 연동: 진행중(견적중|계약완료), 종료(시공완료|거절), 미처리(상담접수)
      if (stage === '계약완료' || stage === '시공완료') setListTab('종료')
      else if (stage === '상담접수') setListTab('미처리')
      else if (stage === '견적중') setListTab('진행중')
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

  /** 현재 상담 건의 발주서 목록 조회 (order_documents) — 실측·갤러리 탭용 */
  useEffect(() => {
    if (!selectedLead) {
      setOrderDocumentsList([])
      return
    }
    let cancelled = false
    supabase
      .from('order_documents')
      .select('id, consultation_id, storage_path, file_name, file_type, thumbnail_path, product_tags, created_at')
      .eq('consultation_id', selectedLead)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setOrderDocumentsList([])
          return
        }
        setOrderDocumentsList(
          (data ?? []).map((r) => ({
            id: r.id,
            consultation_id: r.consultation_id,
            storage_path: r.storage_path,
            file_name: r.file_name,
            file_type: r.file_type as OrderDocument['file_type'],
            thumbnail_path: r.thumbnail_path,
            product_tags: Array.isArray(r.product_tags) ? (r.product_tags as string[]) : [],
            created_at: r.created_at,
          }))
        )
      })
    return () => {
      cancelled = true
    }
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
  }, [selectedLead, detailPanelTab])

  /** AI 추천 가이드용 과거 견적 로드 (견적 모달 오픈 시 최근 80건) */
  useEffect(() => {
    if (!estimateModalOpen) return
    let cancelled = false
    supabase
      .from('estimates')
      .select('id, consultation_id, payload, final_proposal_data, approved_at, created_at')
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(80)
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

  /** 최근 12개월 내 저장된 견적 — 통계용(현재 시세 파악). 날짜는 startOfDay로 느슨하게 */
  const estimatesLast12Months = useMemo(() => {
    const cutoff = startOfDay(subMonths(new Date(), 12)).toISOString()
    return estimatesList.filter((e) => e.created_at >= cutoff)
  }, [estimatesList])

  /** 최근 1년 통계: 최대·최소·중간값 + 각 estimate_id 매핑. 현재 시세 파악용 */
  const estimateStats = useMemo(() => {
    const list = estimatesLast12Months
    if (list.length === 0) return null
    const sorted = [...list].sort((a, b) => Number(a.grand_total) - Number(b.grand_total))
    const maxEst = sorted[sorted.length - 1]
    const minEst = sorted[0]
    const midIdx = Math.floor(sorted.length / 2)
    const medianValue = sorted.length % 2 === 1
      ? Number(sorted[midIdx].grand_total)
      : (Number(sorted[midIdx - 1].grand_total) + Number(sorted[midIdx].grand_total)) / 2
    const medianEst = sorted.reduce((best, cur) => {
      const curVal = Number(cur.grand_total)
      const curDiff = Math.abs(curVal - medianValue)
      const bestDiff = Math.abs(Number(best.grand_total) - medianValue)
      return curDiff < bestDiff ? cur : best
    })
    return {
      max: { value: Number(maxEst.grand_total), estimateId: maxEst.id },
      min: { value: Number(minEst.grand_total), estimateId: minEst.id },
      median: { value: Math.round(Number(medianEst.grand_total)), estimateId: medianEst.id },
    }
  }, [estimatesLast12Months])

  /** 원가 합계 — 가장 최근 견적(12개월 내)의 품목 기준 vendor_price_book/products 조회 */
  const [costSum, setCostSum] = useState<number | null>(null)
  useEffect(() => {
    if (!selectedLead || !estimatesLast12Months.length) {
      setCostSum(null)
      return
    }
    let cancelled = false
    const latest = [...estimatesLast12Months].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    const data = (latest.final_proposal_data ?? latest.payload) as { rows?: Array<{ name?: string; qty?: string }> } | undefined
    const rows = data?.rows ?? []
    if (rows.length === 0) {
      setCostSum(null)
      return
    }
    const run = async () => {
      let sum = 0
      for (const r of rows) {
        const name = (r.name ?? '').trim()
        const qty = Math.max(0, parseFloat(String(r.qty ?? '0').replace(/,/g, '')) || 0)
        if (!name || qty <= 0) continue
        const rec = await getVendorPriceRecommendation(supabase, name)
        if (rec && !cancelled) sum += rec.cost * qty
      }
      if (!cancelled) setCostSum(sum)
    }
    void run()
    return () => { cancelled = true }
  }, [selectedLead, estimatesLast12Months, supabase])

  /** 상세 패널 금액: 실제 유효 견적(estimatesList)이 있으면 그 합계로 검증, 없으면 카드 저장값 사용 */
  const validatedDisplayAmount = useMemo(() => {
    if (!selectedLeadData || selectedLead !== selectedLeadData.id) return null
    const approved = estimatesList.filter((e) => e.approved_at != null)
    if (approved.length === 0) return 0
    const sorted = [...approved].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return Number(sorted[0].grand_total ?? 0)
  }, [selectedLeadData, selectedLead, estimatesList])

  /** 선택한 견적 물리 삭제 후 상담 카드 금액/상태 동기화 */
  const handleDeleteSelectedEstimates = useCallback(async () => {
    if (!selectedLeadData || selectedEstimateIds.length === 0) return
    const consultationId = selectedLeadData.id
    setEstimateDeleting(true)
    try {
      const { error } = await supabase.from('estimates').delete().in('id', selectedEstimateIds)
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
      const deletedFinal = hadFinalId && selectedEstimateIds.includes(hadFinalId)
      if (deletedFinal) {
        delete (newMeta as Record<string, unknown>).final_amount
        delete (newMeta as Record<string, unknown>).final_estimate_id
      }
      const updatePayload: { metadata: Json; expected_revenue?: number; status?: Lead['status'] } = { metadata: newMeta as unknown as Json, expected_revenue: newDisplayAmount }
      if (list.length === 0) updatePayload.status = '상담중'

      const { error: updateError } = await supabase.from('consultations').update(updatePayload).eq('id', consultationId)
      if (updateError) throw updateError

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
                ...(list.length === 0 ? { status: '상담중' as const } : {}),
                ...(deletedFinal ? { finalAmount: null } : {}),
              }
        )
      )
      setSelectedEstimateIds([])
      setEstimateDeleteConfirmOpen(false)
      toast.success(`${selectedEstimateIds.length}건의 견적이 삭제되었습니다.`)
    } catch (err) {
      console.error(err)
      toast.error('견적 삭제에 실패했습니다.')
    } finally {
      setEstimateDeleting(false)
    }
  }, [selectedLeadData, selectedEstimateIds])

  /** 견적서 승인 시 estimates 테이블 저장 + metadata.estimate_history 동기화 + 시스템 로그 (스냅샷 보존, approved_at, 공유 링크용) */
  const handleEstimateApproved = async (consultationId: string, data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) => {
    const lead = leads.find((l) => l.id === consultationId)
    if (!lead) return
    if (!isValidUUID(consultationId)) {
      toast.error('유효한 상담 ID가 아닙니다.')
      return
    }
    try {
      const approvedAt = new Date().toISOString()
      const snapshot = { ...data, mode: 'FINAL' as const } as EstimateFormData
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
      const { data: list } = await supabase.from('estimates').select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at').eq('consultation_id', consultationId).eq('is_visible', true).order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
      await supabase.from('consultation_messages').insert({
        consultation_id: consultationId,
        sender_id: 'system',
        content: '확정 견적서가 발행되었습니다.',
        message_type: 'SYSTEM',
        metadata: { type: 'estimate_issued', estimate_id: insertedEst?.id },
      })
      setEstimateModalOpen(false)
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: consultationId,
        event_type: 'estimate_issued',
        actor_name: actor,
        detail: '확정 견적서 발행',
        metadata: { type: 'estimate_issued', estimate_id: insertedEst?.id },
      })
      setAdminPreviewOpen(false)
      setAdminPreviewData(null)
      toast.success('확정 견적서가 발행되었습니다. 견적 관리에서 링크 복사 및 PDF 다운로드를 이용하세요.')
    } catch (err) {
      console.error(err)
      toast.error('견적서 저장에 실패했습니다.')
    }
  }

  /** 예산 기획안 최종 발행: APPROVED 저장 + 채팅 알림 + 모달 닫기 */
  const handleProposalFinalPublish = async (consultationId: string, data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) => {
    const lead = leads.find((l) => l.id === consultationId)
    if (!lead) return
    if (!isValidUUID(consultationId)) {
      toast.error('유효한 상담 ID가 아닙니다.')
      return
    }
    try {
      const approvedAt = new Date().toISOString()
      const snapshot = { ...data, mode: 'PROPOSAL' as const } as EstimateFormData
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
        metadata: { type: 'proposal_issued', estimate_id: insertedEst?.id },
      })

      setAdminPreviewOpen(false)
      setAdminPreviewData(null)
      setEstimateModalOpen(false)
      const actor = (lead.name || '직원').trim() || '직원'
      await insertSystemLog(supabase, {
        consultation_id: consultationId,
        event_type: 'estimate_issued',
        actor_name: actor,
        detail: '예산 기획안 발행',
        metadata: { type: 'estimate_issued', estimate_id: insertedEst?.id },
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

        {/* 캔슬 사유 입력 모달 — 저장 시 metadata.cancel_reason + status 거절 */}
        <Dialog open={!!cancelModalLeadId} onOpenChange={(open) => { if (!open) { setCancelModalLeadId(null); setCancelReasonDraft('') } }}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>캔슬 사유 입력</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-sm font-medium block mb-1">캔슬 사유</label>
                <Input
                  value={cancelReasonDraft}
                  onChange={(e) => setCancelReasonDraft(e.target.value)}
                  placeholder="사유를 입력하세요 (선택)"
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
                  <select value={editForm.industry} onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))} className={`w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">인입일</label>
                  <Input type="date" value={editForm.inboundDate} onChange={(e) => setEditForm((f) => ({ ...f, inboundDate: e.target.value }))} className={INPUT_CLASS} />
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

        {/* 좌측: 검색·기간·탭·리스트(35%) | 우측: 채팅 메인(65%+) — PC 고밀도 / 모바일: 선택 시 목록 숨김 */}
        <div className="grid grid-cols-[minmax(0,35%)_1fr] gap-4 flex-1 min-h-0">
          <div className={`min-w-0 flex flex-col gap-2 ${isMobile && selectedLead ? 'hidden' : ''}`}>
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
                <option value="thisMonth">이번달</option>
                <option value="1m">최근 1개월</option>
                <option value="3m">최근 3개월</option>
                <option value="6m">최근 6개월</option>
                <option value="1y">최근 1년</option>
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
                      {(['전체', '미처리', '진행중', 'AS대기', '종료', '캔슬'] as const).map((tab) => (
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
                          <li key={lead.id} data-lead-id={lead.id}>
                            <ConsultationListItem
                              item={lead}
                              isSelected={selectedLead === lead.id}
                              isHighlighted={highlightedLeadId === lead.id}
                              onSelect={() => handleSelectLead(lead.id)}
                              onCopyContact={handleCopyContact}
                              onStageChange={handleStageChange}
                              onAsClick={handleAsClick}
                              onCancelClick={(leadId) => { setCancelModalLeadId(leadId); setCancelReasonDraft('') }}
                              onEditClick={handleEditClick}
                              lastMessage={lastMessagesByConsultationId[lead.id] ?? null}
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
            className={`flex flex-col border border-border rounded-xl bg-card overflow-hidden transition-[opacity] duration-200 min-w-0 ${
              selectedLeadData
                ? (isMobile ? 'w-full opacity-100' : 'flex-1 opacity-100')
                : 'w-0 min-w-0 opacity-0 pointer-events-none overflow-hidden border-0'
            }`}
          >
            {selectedLeadData && (
              <Tabs value={detailPanelTab} onValueChange={(v) => { setDetailPanelTab(v as 'history' | 'measurement' | 'estimate'); setHighlightMessageId(null) }} className="flex flex-col h-full">
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
                  <TabsTrigger value="measurement" className="text-xs rounded-none">실측 자료</TabsTrigger>
                  <TabsTrigger value="estimate" className="text-xs rounded-none">견적 관리</TabsTrigger>
                </TabsList>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {/* 탭 1: 상담 히스토리 — 채팅형 UI */}
                  <div className={detailPanelTab === 'history' ? 'p-4 flex flex-col min-h-0 h-full' : 'hidden'}>
                    <div className="space-y-2 text-sm shrink-0 mb-2">
                      <p className="font-semibold text-foreground">{selectedLeadData.displayName || selectedLeadData.company || '(업체명 없음)'}</p>
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
                        {(validatedDisplayAmount !== null ? validatedDisplayAmount : selectedLeadData.displayAmount) > 0 && (
                          <span className="ml-auto font-semibold text-primary">{(validatedDisplayAmount !== null ? validatedDisplayAmount : selectedLeadData.displayAmount).toLocaleString()}원</span>
                        )}
                      </button>
                      {isAdmin && (
                        <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-muted-foreground hover:text-destructive hover:border-destructive" onClick={() => setHideConfirmLeadId(selectedLeadData.id)}>
                          <EyeOff className="h-4 w-4 shrink-0" />
                          이 상담 숨기기
                        </Button>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 border border-border rounded-lg p-2 bg-muted/20">
                      <ChatErrorBoundary>
                        {selectedLeadData?.id ? (
                        <ConsultationChat
                          consultationId={selectedLeadData.id}
                          contact={selectedLeadData.contact ?? ''}
                          companyName={selectedLeadData.displayName || selectedLeadData.company || '(업체명 없음)'}
                          isAdmin={isAdmin}
                          googleChatWebhookUrl={
                            (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_CHAT as string | undefined) ||
                            (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_ANNOUNCEMENT as string | undefined) ||
                            null
                          }
                          highlightMessageId={selectedLeadData.id === selectedLead ? highlightMessageId : null}
                          onSystemLogClick={async (msg: ConsultationMessage) => {
                            const meta = msg.metadata
                            if (!meta) return
                            if (meta.estimate_id) {
                              setDetailPanelTab('estimate')
                              setHighlightMessageId(null)
                              const { data: est } = await supabase.from('estimates').select('id, payload').eq('id', meta.estimate_id).single()
                              setEstimateModalEditId(meta.estimate_id)
                              setEstimateModalInitialData((est?.payload ?? null) as Partial<EstimateFormData> | null)
                              setEstimateModalOpen(true)
                            } else if (meta.message_id) {
                              setDetailPanelTab('history')
                              setHighlightMessageId(meta.message_id)
                              setTimeout(() => setHighlightMessageId(null), 4000)
                            }
                          }}
                          onFocusConsultation={handleFocusConsultation}
                        />
                        ) : (
                          <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">상담을 선택해 주세요.</div>
                        )}
                      </ChatErrorBoundary>
                    </div>
                  </div>
                  {/* 탭 2: 실측·발주서 — BLUEPRINT Supabase Storage 기반 비주얼 갤러리(파일 리스트 아님), 퀵뷰 라이트박스 */}
                  <div className={detailPanelTab === 'measurement' ? 'p-4 space-y-4' : 'hidden'}>
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">실측 · 발주서 (갤러리)</h3>
                    </div>
                    <OrderDocumentsGallery
                      consultationId={selectedLeadData.id}
                      consultationDisplayName={selectedLeadData.displayName || selectedLeadData.company || ''}
                      measurementDrawingPath={selectedLeadData.measurementDrawingPath}
                      orderDocuments={orderDocumentsList}
                      onUploadComplete={() => {
                        supabase
                          .from('order_documents')
                          .select('id, consultation_id, storage_path, file_name, file_type, thumbnail_path, product_tags, created_at')
                          .eq('consultation_id', selectedLeadData.id)
                          .order('created_at', { ascending: false })
                          .then(({ data }) => {
                            if (data) setOrderDocumentsList(data as OrderDocument[])
                          })
                      }}
                    />
                    <Link to={`/measurement/upload?consultationId=${selectedLeadData.id}`} className="block pt-2 border-t border-border">
                      <Button type="button" variant="outline" size="sm" className="w-full gap-2">
                        <Ruler className="h-3.5 w-3.5" />
                        실측 정보 입력 페이지로 이동
                      </Button>
                    </Link>
                  </div>
                  {/* 탭 3: 견적 관리 — 리스트, 필터, 선택 삭제 */}
                  <div className={detailPanelTab === 'estimate' ? 'p-4 flex flex-col min-h-0' : 'hidden'}>
                    <Button
                      type="button"
                      className="w-full gap-2 mb-3"
                      onClick={() => {
                        setEstimateModalEditId(null)
                        setEstimateModalInitialData({
                          recipientName: selectedLeadData.company?.trim() || '(업체명 없음)',
                          recipientContact: selectedLeadData.contact ?? '',
                        })
                        setEstimateModalOpen(true)
                      }}
                    >
                      <FileText className="h-4 w-4" />
                      신규 견적 작성
                    </Button>
                    {/* 필터: 전체 / 임시 저장만 */}
                    <div className="flex gap-1 mb-2">
                      <button
                        type="button"
                        onClick={() => { setEstimateListFilter('all'); setSelectedEstimateIds([]) }}
                        className={cn('px-2.5 py-1 text-xs font-medium rounded-md', estimateListFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEstimateListFilter('draft'); setSelectedEstimateIds([]) }}
                        className={cn('px-2.5 py-1 text-xs font-medium rounded-md', estimateListFilter === 'draft' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                      >
                        임시 저장만
                      </button>
                    </div>
                    {selectedEstimateIds.length > 0 && (
                      <div className="flex items-center justify-between gap-2 mb-2 py-1.5 px-2 rounded-md bg-muted/50 text-sm">
                        <span className="text-muted-foreground">{selectedEstimateIds.length}건 선택</span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="gap-1"
                          onClick={() => setEstimateDeleteConfirmOpen(true)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          선택 삭제
                        </Button>
                      </div>
                    )}
                    {estimateStats && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 py-2 px-3 rounded-lg border border-border bg-muted/30 text-sm">
                        <span className="text-muted-foreground shrink-0">최근 1년 시세:</span>
                        <button
                          type="button"
                          title="해당 견적서 보기"
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => setPrintEstimateId(estimateStats.max.estimateId)}
                        >
                          최대: {estimateStats.max.value.toLocaleString()}원
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <button
                          type="button"
                          title="해당 견적서 보기"
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => setPrintEstimateId(estimateStats.median.estimateId)}
                        >
                          중간: {estimateStats.median.value.toLocaleString()}원
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <button
                          type="button"
                          title="해당 견적서 보기"
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => setPrintEstimateId(estimateStats.min.estimateId)}
                        >
                          최소: {estimateStats.min.value.toLocaleString()}원
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-muted-foreground">
                          원가: {costSum != null ? costSum.toLocaleString() : '-'}원
                        </span>
                      </div>
                    )}
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2">기존 견적 이력</h3>
                    {estimatesLoading ? (
                      <p className="text-sm text-muted-foreground">불러오는 중…</p>
                    ) : filteredEstimateList.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {estimateListFilter === 'draft' ? '임시 저장된 견적이 없습니다.' : '저장된 견적서가 없습니다. 위에서 신규 견적을 작성해 보세요.'}
                      </p>
                    ) : (
                      <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
                        {estimateListByYear.map(({ year, items }) => (
                          <div key={year}>
                            <div className="text-xs font-semibold text-muted-foreground py-1.5 border-b border-border/80 mb-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                              {year}년
                            </div>
                            <ul className="space-y-2">
                              {items.map((est) => {
                                const payload = est.payload as { draft?: boolean } & Record<string, unknown>
                                const status = payload?.draft ? '임시저장' : (est.approved_at ? '발행됨' : '발행')
                                const isApproved = !!est.approved_at
                                const isSelected = selectedEstimateIds.includes(est.id)
                                const isArchive = new Date(est.created_at).getTime() < archiveCutoff
                                return (
                                  <li
                                    key={est.id}
                                    className={cn(
                                      'rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-2 transition-colors',
                                      isArchive
                                        ? 'border-border/60 bg-slate-100/80 dark:bg-slate-800/40 text-muted-foreground'
                                        : 'border-border bg-muted/30'
                                    )}
                                  >
                                    {isArchive && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 shrink-0">
                                        아카이브
                                      </span>
                                    )}
                                    <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                          setSelectedEstimateIds((prev) =>
                                            prev.includes(est.id) ? prev.filter((id) => id !== est.id) : [...prev, est.id]
                                          )
                                        }}
                                        className="rounded border-border"
                                      />
                                      <span className="sr-only">선택</span>
                                    </label>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-foreground">{new Date(est.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                      <button
                                        type="button"
                                        className="text-muted-foreground cursor-pointer hover:text-primary hover:underline text-left"
                                        title="해당 견적서 보기"
                                        onClick={() => setPrintEstimateId(est.id)}
                                      >
                                        총액 {Number(est.grand_total).toLocaleString()}원 · {status}
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {isApproved ? (
                                        <>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1"
                                            onClick={async () => {
                                              const url = `${window.location.origin}/p/estimate/${est.id}`
                                              await navigator.clipboard.writeText(url)
                                              toast.success('공유 링크가 복사되었습니다.')
                                            }}
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                            링크 복사
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1"
                                            onClick={() => setPrintEstimateId(est.id)}
                                          >
                                            <FileText className="h-3.5 w-3.5" />
                                            PDF
                                          </Button>
                                        </>
                                      ) : (
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
                                      )}
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => {
                                          setSelectedEstimateIds((prev) => (prev.includes(est.id) ? prev : [...prev, est.id]))
                                          setEstimateDeleteConfirmOpen(true)
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        삭제
                                      </Button>
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
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
        <Dialog open={adminPreviewOpen} onOpenChange={(open) => { if (!open) { setAdminPreviewOpen(false); setAdminPreviewData(null) } }}>
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
                  ? <ProposalPreviewContent data={data} totals={computeProposalTotals(data)} />
                  : <FinalEstimatePreviewContent data={data} totals={computeFinalTotals(data)} />
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
                      void handleProposalFinalPublish(selectedLeadData.id, adminPreviewData)
                    } else {
                      void handleEstimateApproved(selectedLeadData.id, adminPreviewData)
                    }
                  }
                }}
              >
                최종 발행
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* PDF 인쇄 (승인된 예산 기획안 / 확정 견적서) — 브라우저 인쇄 → PDF 저장 */}
        <Dialog open={!!printEstimateId} onOpenChange={(open) => { if (!open) setPrintEstimateId(null) }}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 print:max-h-none">
            <DialogHeader className="sticky top-0 z-10 shrink-0 px-4 py-3 border-b border-border bg-card flex flex-row items-center justify-between gap-2 print:hidden flex-wrap">
              <DialogTitle>PDF / 이미지 저장</DialogTitle>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setPrintEstimateId(null)}>닫기</Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const el = document.querySelector('[data-estimate-print-area]')
                    if (el instanceof HTMLElement && printEstimateId) {
                      const est = estimatesList.find((e) => e.id === printEstimateId)
                      const rawData = (est?.approved_at && est?.final_proposal_data ? est.final_proposal_data : est?.payload) as EstimateFormData | undefined
                      const filename = buildEstimateImageFilename(rawData?.quoteDate, rawData?.recipientName)
                      try {
                        await exportEstimateToImage(el, filename)
                        toast.success('이미지가 저장되었습니다.')
                      } catch (err) {
                        console.error(err)
                        toast.error('이미지 저장에 실패했습니다.')
                      }
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
                    if (el instanceof HTMLElement && printEstimateId) {
                      const est = estimatesList.find((e) => e.id === printEstimateId)
                      const rawData = (est?.approved_at && est?.final_proposal_data ? est.final_proposal_data : est?.payload) as EstimateFormData | undefined
                      const filename = buildEstimatePdfFilename(rawData?.recipientName)
                      try {
                        await exportEstimateToPdf(el, filename)
                        toast.success('PDF가 저장되었습니다.')
                      } catch (err) {
                        console.error(err)
                        toast.error('PDF 저장에 실패했습니다.')
                      }
                    }
                    setPrintEstimateId(null)
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
                    if (!est) return
                    const consultationId = est.consultation_id
                    const grandTotal = Number(est.grand_total ?? 0)
                    try {
                      if (!est.approved_at) {
                        const rawData = (est.final_proposal_data ?? est.payload) as unknown as EstimateFormData
                        const snapshot = { ...rawData, mode: 'FINAL' as const } as EstimateFormData
                        const { error: estErr } = await supabase
                          .from('estimates')
                          .update({
                            final_proposal_data: snapshot as unknown as Json,
                            approved_at: new Date().toISOString(),
                            supply_total: est.supply_total,
                            vat: est.vat,
                            grand_total: est.grand_total,
                          })
                          .eq('id', est.id)
                        if (estErr) throw estErr
                        setEstimatesList((prev) =>
                          prev.map((e) => (e.id !== est.id ? e : { ...e, final_proposal_data: snapshot as unknown as Record<string, unknown>, approved_at: new Date().toISOString() }))
                        )
                      }
                      const lead = leads.find((l) => l.id === consultationId)
                      const nextMeta = { ...(lead?.metadata ?? {}), final_amount: grandTotal, final_estimate_id: printEstimateId } as Record<string, unknown>
                      const { error: updateErr } = await supabase
                        .from('consultations')
                        .update({
                          status: '계약완료',
                          expected_revenue: grandTotal,
                          metadata: nextMeta as unknown as Json,
                        })
                        .eq('id', consultationId)
                      if (updateErr) throw updateErr
                      setLeads((prev) =>
                        prev.map((l) =>
                          l.id !== consultationId
                            ? l
                            : { ...l, status: '계약완료', metadata: nextMeta, displayAmount: grandTotal, expectedRevenue: grandTotal, finalAmount: grandTotal }
                        )
                      )
                      toast.success('계약이 확정되었습니다. 상담 상태가 "계약완료"로 변경되었습니다.')
                      setPrintEstimateId(null)
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
                const data = { ...rawData, rows: paddedRows }
                return data.mode === 'PROPOSAL'
                  ? <ProposalPreviewContent data={data} totals={computeProposalTotals(data)} />
                  : <FinalEstimatePreviewContent data={data} totals={computeFinalTotals(data)} />
              })()}
            </div>
          </DialogContent>
        </Dialog>

        {/* 원가표 원본 이미지 라이트박스 (AI 추천 가이드 [원본보기]) */}
        <Dialog open={!!priceBookImageUrl} onOpenChange={(open) => { if (!open) setPriceBookImageUrl(null) }}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>원가표 원본</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto min-h-0 flex items-center justify-center bg-muted/30 rounded-md">
              {priceBookImageUrl && (
                <img src={priceBookImageUrl} alt="원가표 원본" className="max-w-full max-h-[70vh] object-contain" />
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => setPriceBookImageUrl(null)}>닫기</Button>
          </DialogContent>
        </Dialog>

        {/* 견적서 전용 풀스크린 모달 — 블러 배경, [임시저장][발행승인][닫기] 고정 */}
        <Dialog
          open={estimateModalOpen}
          onOpenChange={(open) => {
            setEstimateModalOpen(open)
            if (!open) setEstimateModalInitialData(null)
          }}
        >
          <DialogContent
            overlayClassName="bg-black/40 backdrop-blur-md"
            className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 flex flex-col gap-0"
          >
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
                    const map = await getDataByProductTags(names)
                    const ids = new Set<string>()
                    map.forEach((res) => res.images.forEach((img) => ids.add(img.id)))
                    if (ids.size === 0) {
                      toast.warning('해당 품목과 매칭되는 시공 사진이 없습니다.')
                      return
                    }
                    const url = `${window.location.origin}/public/share?ids=${[...ids].join(',')}`
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
                  onClick={() => {
                    const data = estimateFormRef.current?.getCurrentData()
                    if (data) {
                      setAdminPreviewData(data)
                      setAdminPreviewOpen(true)
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
                <EstimateForm
                  key={estimateModalEditId ?? 'new'}
                  ref={estimateFormRef}
                  initialData={
                    estimateModalInitialData
                      ? {
                          ...(selectedLeadData && {
                            recipientName: selectedLeadData.company?.trim() || '(업체명 없음)',
                            recipientContact: selectedLeadData.contact ?? '',
                          }),
                          ...estimateModalInitialData,
                        }
                      : {
                          recipientName: selectedLeadData?.company?.trim() || '(업체명 없음)',
                          recipientContact: selectedLeadData?.contact ?? '',
                        }
                  }
                  pastEstimates={selectedLeadData ? mergedPastEstimatesForGuide : []}
                  onApproved={selectedLeadData ? (data) => void handleEstimateApproved(selectedLeadData.id, data) : undefined}
                  onRequestEstimatePreview={(_consultationId, estimateId) => setPrintEstimateId(estimateId)}
                  onRequestPriceBookImage={(url) => setPriceBookImageUrl(url)}
                  hideInternalActions
                  showProfitabilityPanel
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
