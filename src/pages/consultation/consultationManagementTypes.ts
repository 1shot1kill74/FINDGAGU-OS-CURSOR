import type { GoldenTimeTier } from '@/lib/utils/dateUtils'
import type { ConsultationStage, CustomerTier, MeasurementStatus } from './consultationManagementConstants'

/** 견적 이력 한 건 — metadata.estimate_history[] 항목 */
export interface EstimateHistoryItem {
  version: number
  issued_at: string // ISO
  amount: number
  summary?: string
  is_final: boolean
}

/** 마지막 활동 1건 (상담 히스토리 요약·경과 시간·활동 아이콘용) */
export interface LastActivityMessage {
  sender_id: string
  content: string
  created_at: string
  message_type?: 'TEXT' | 'FILE' | 'SYSTEM'
}

/** 상담 카드/패널 공용 모델 — consultations + metadata 병합 */
export interface Lead {
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

/** 우측 상세 패널 탭 — 상담 히스토리 | 견적 관리 | 배치도&발주서 */
export type DetailPanelTab = 'history' | 'measurement' | 'estimate'
