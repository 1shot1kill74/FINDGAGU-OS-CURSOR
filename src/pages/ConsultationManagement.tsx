import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RefreshCw, Zap, Phone, User, Images, MessageCircle, Loader2, Search, EyeOff, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

import { CONSULTATION_INDUSTRY_OPTIONS } from '@/data/referenceCases'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subMonths, startOfDay } from 'date-fns'
import { type EstimateFormData, type EstimateFormHandle } from '@/components/estimate/estimateFormShared'
import { insertSystemLog } from '@/lib/activityLog'
import { isValidUUID } from '@/lib/uuid'
import type { OrderDocument } from '@/types/orderDocument'
import type { ConsultationEstimateFile } from '@/types/consultationEstimateFile'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'
import {
  DATE_RANGE_OPTIONS,
  LIST_PAGE_SIZE,
  MEASUREMENT_DRAWINGS_BUCKET,
  MOBILE_BREAK,
  REACTIVATION_WINDOW_DAYS,
  type ConsultationStage,
  type CustomDateTarget,
  type CustomerTier,
  type DateRangeKey,
  type ListTab,
} from '@/pages/consultation/consultationManagementConstants'
import type { EstimateHistoryItem, LastActivityMessage, Lead } from '@/pages/consultation/consultationManagementTypes'
import {
  computeDisplayName,
  formatUpdateDateDisplay,
  getComparableDateValue,
  getDateRangeStarts,
  getDisplayAmount,
  getHighestTier,
  getReactivationSignal,
  getValidCustomerTier,
  isEnded,
  isValidContactForSameCustomer,
  mapConsultationRowToLead,
  matchesCustomDateRange,
  matchesDateRange,
  matchesLeadSearch,
  normalizeContactForSync,
  normalizeDateSearchQuery,
  notifyMarketOrderRegistered,
  parseDateInputValue,
  parseEstimateHistory,
  pickDisplayName,
  sanitizeConsultationRow,
} from '@/pages/consultation/consultationManagementLeadUtils'
import { isMarketSource } from '@/pages/consultation/consultationManagementUtils'
import { ConsultationManagementDialogs } from '@/pages/consultation/consultationManagementDialogs'
import { ConsultationManagementEstimateModals } from '@/pages/consultation/consultationManagementEstimateModals'
import { ConsultationManagementDetailPanel } from '@/pages/consultation/consultationManagementDetailPanel'
import { ConsultationListItem } from '@/pages/consultation/consultationManagementListUi'
import { useConsultationDetailPanelTab } from '@/pages/consultation/useConsultationDetailPanelTab'

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

export type { EstimateHistoryItem, LastActivityMessage, Lead } from '@/pages/consultation/consultationManagementTypes'
export { suggestCategory } from '@/pages/consultation/consultationManagementUtils'
export type {
  ConsultationStage,
  CustomerTier,
  MeasurementStatus,
  StageBarValue,
} from '@/pages/consultation/consultationManagementConstants'
export { CONSULTATION_STAGES } from '@/pages/consultation/consultationManagementConstants'

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
  const { detailPanelTab, setDetailPanelTab, openEstimateTab } = useConsultationDetailPanelTab()
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
        openEstimateTab()
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
      openEstimateTab()
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

  const selectedLeadData = selectedLead ? (leads.find((l) => l.id === selectedLead) ?? null) : null

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
    openEstimateTab()
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

  /** PDF 미리보기 다이얼로그: PNG 저장 */
  const handlePrintEstimateSavePng = useCallback(async () => {
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
  }, [printEstimateId, estimatesList])

  /** PDF 미리보기 다이얼로그: PDF 저장 */
  const handlePrintEstimateSavePdf = useCallback(async () => {
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
  }, [printEstimateId, estimatesList])

  /** PDF 미리보기 다이얼로그: 최종 확정 (DB·상담 단계·히스토리 반영) */
  const handlePrintEstimateFinalize = useCallback(async () => {
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
      const others = estimatesList.filter((e) => e.consultation_id === consultationId && e.id !== est.id && e.approved_at != null)
      if (others.length > 0) {
        const { error: clearErr } = await supabase
          .from('estimates')
          .update({ approved_at: null })
          .eq('consultation_id', consultationId)
          .neq('id', est.id)
        if (clearErr) throw clearErr
      }
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
      const { data: list } = await supabase
        .from('estimates')
        .select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at')
        .eq('consultation_id', consultationId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
      setEstimatesList((list ?? []) as Array<{ id: string; consultation_id: string; payload: Record<string, unknown>; final_proposal_data: Record<string, unknown> | null; supply_total: number; vat: number; grand_total: number; approved_at: string | null; created_at: string }>)
      setEstimateListRefreshKey((k) => k + 1)
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
  }, [printEstimateId, estimatesList, leads])

  /** 풀스크린 견적 모달: 발행승인 → 임시저장 후 관리자 미리보기 오픈 */
  const handlePublishApproveFromEstimateModal = useCallback(async () => {
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
      const { data: list } = await supabase
        .from('estimates')
        .select('id, consultation_id, payload, final_proposal_data, supply_total, vat, grand_total, approved_at, created_at')
        .eq('consultation_id', consultationId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
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
  }, [selectedLeadData, estimateModalEditId])

  const handleShareEstimateProductPhotos = useCallback(async () => {
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
  }, [])

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

        <ConsultationManagementDialogs
          isCreateDialogOpen={isCreateDialogOpen}
          setIsCreateDialogOpen={setIsCreateDialogOpen}
          handleSubmitConsultation={handleSubmitConsultation}
          form={form}
          setFormField={setFormField}
          setForm={setForm}
          isSubmitting={isSubmitting}
          asModalLeadId={asModalLeadId}
          setAsModalLeadId={setAsModalLeadId}
          asReason={asReason}
          setAsReason={setAsReason}
          handleToggleAs={handleToggleAs}
          cancelModalLeadId={cancelModalLeadId}
          setCancelModalLeadId={setCancelModalLeadId}
          cancelReasonDraft={cancelReasonDraft}
          setCancelReasonDraft={setCancelReasonDraft}
          handleCancelSubmit={handleCancelSubmit}
          hideConfirmLeadId={hideConfirmLeadId}
          setHideConfirmLeadId={setHideConfirmLeadId}
          handleHideLead={handleHideLead}
          measurementModalOpen={measurementModalOpen}
          setMeasurementModalOpen={setMeasurementModalOpen}
          selectedLeadData={selectedLeadData}
          openMeasurementDrawingPreview={openMeasurementDrawingPreview}
          estimateModalLeadId={estimateModalLeadId}
          setEstimateModalLeadId={setEstimateModalLeadId}
          setNewEstimateForm={setNewEstimateForm}
          newEstimateForm={newEstimateForm}
          leads={leads}
          selectedLead={selectedLead}
          estimatesList={estimatesList}
          handleSetEstimateFinalByEstimateId={handleSetEstimateFinalByEstimateId}
          handleSetEstimateFinal={handleSetEstimateFinal}
          handleAddEstimate={handleAddEstimate}
          editModalLeadId={editModalLeadId}
          setEditModalLeadId={setEditModalLeadId}
          editForm={editForm}
          setEditForm={setEditForm}
          handleEditSave={handleEditSave}
        />

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

          <ConsultationManagementDetailPanel
            isMobile={isMobile}
            selectedLeadData={selectedLeadData}
            detailPanelTab={detailPanelTab}
            onDetailPanelTabChange={setDetailPanelTab}
            onMobileBack={() => setSelectedLead(null)}
            samePhoneConsultations={samePhoneConsultations}
            estimateCountByConsultationId={estimateCountByConsultationId}
            validatedDisplayAmount={validatedDisplayAmount}
            isAdmin={isAdmin}
            onOpenEstimateModal={() => {
              if (!selectedLeadData) return
              setEstimateModalLeadId(selectedLeadData.id)
              setNewEstimateForm({ amount: '', summary: '' })
            }}
            handleSetPartnerGrade={handleSetPartnerGrade}
            handleSelectLead={handleSelectLead}
            setHideConfirmLeadId={setHideConfirmLeadId}
            refetchImageCountForConsultation={refetchImageCountForConsultation}
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
              selectedLeadData && pendingTakeoutImport?.consultationId === selectedLeadData.id
                ? { file: pendingTakeoutImport.file, requestId: pendingTakeoutImport.requestId }
                : null
            }
            onTakeoutImportHandled={() => {
              if (!selectedLeadData) return
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
            orderDocumentsList={orderDocumentsList}
            onMeasurementOrderDocumentsChange={(data: OrderDocument[] | null) => setOrderDocumentsList(data ?? [])}
            estimateDeleteConfirmOpen={estimateDeleteConfirmOpen}
            estimateDeleting={estimateDeleting}
            onDeleteSelectedEstimates={handleDeleteSelectedEstimates}
          />

          <ConsultationManagementEstimateModals
            adminPreviewOpen={adminPreviewOpen}
            onAdminPreviewOpenChange={(open) => {
              if (!open) {
                setAdminPreviewOpen(false)
                setAdminPreviewData(null)
                setAdminPreviewEstimateId(null)
              }
            }}
            adminPreviewData={adminPreviewData}
            selectedLeadData={selectedLeadData}
            onAdminPreviewCancel={() => {
              setAdminPreviewOpen(false)
              setAdminPreviewData(null)
            }}
            onAdminPreviewPublish={() => {
              if (selectedLeadData && adminPreviewData) {
                if (adminPreviewData.mode === 'PROPOSAL') {
                  void handleProposalFinalPublish(selectedLeadData.id, adminPreviewData, adminPreviewEstimateId ?? undefined)
                } else {
                  void handleEstimateApproved(selectedLeadData.id, adminPreviewData, adminPreviewEstimateId ?? undefined)
                }
              }
            }}
            printEstimateId={printEstimateId}
            onPrintDialogOpenChange={(open) => {
              if (!open) {
                justClosedPreviewRef.current = true
                setPrintEstimateId(null)
                setTimeout(() => {
                  justClosedPreviewRef.current = false
                }, 300)
              }
            }}
            estimatesList={estimatesList}
            estimatesLoading={estimatesLoading}
            onPrintSavePng={handlePrintEstimateSavePng}
            onPrintSavePdf={handlePrintEstimateSavePdf}
            onPrintFinalize={handlePrintEstimateFinalize}
            priceBookImageUrl={priceBookImageUrl}
            priceBookImageDisplayUrl={priceBookImageDisplayUrl}
            onPriceBookOpenChange={(open) => {
              if (!open) setPriceBookImageUrl(null)
            }}
            estimateModalOpen={estimateModalOpen}
            onEstimateModalOpenChange={(open) => {
              if (!open && (printEstimateId || justClosedPreviewRef.current)) return
              setEstimateModalOpen(open)
              if (!open) setEstimateModalInitialData(null)
            }}
            estimateModalEditId={estimateModalEditId}
            estimateModalInitialData={estimateModalInitialData}
            mergedPastEstimatesForGuide={mergedPastEstimatesForGuide}
            estimateFormRef={estimateFormRef}
            onEstimateApproved={(data) => {
              if (selectedLeadData) void handleEstimateApproved(selectedLeadData.id, data)
            }}
            onRequestEstimatePreview={(consultationId, estimateId) => {
              if (selectedLead !== consultationId) {
                setSelectedLead(consultationId)
                openEstimateTab()
              }
              setPrintEstimateId(estimateId)
            }}
            onRequestPriceBookImage={(url) => setPriceBookImageUrl(url)}
            onShareProductPhotos={handleShareEstimateProductPhotos}
            onEstimateSaveDraft={handleEstimateSaveDraft}
            onPublishApproveFromModal={handlePublishApproveFromEstimateModal}
          />

        </div>
      </main>
    </div>
  )
}
