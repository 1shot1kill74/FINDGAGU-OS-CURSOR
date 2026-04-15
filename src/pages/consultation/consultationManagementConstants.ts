/** PC 사무용: 컴팩트 (48px 규칙 미적용) */
export const INPUT_CLASS = 'h-10 text-sm'
export const BUTTON_SUBMIT_CLASS = 'h-9 w-full text-sm font-semibold'

/** 인입채널 옵션(9종) — consultations.metadata.source에 저장. 기본값 채널톡으로 오입력 방지 */
export const CONSULT_SOURCES = [
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
export const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'

/** 실측(Measurement) 상태 — 해당없음이면 카드에서 배지 미표시 */
export const MEASUREMENT_STATUSES = ['실측필요', '실측완료', '실측해당없음'] as const
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number]

/** 오픈마켓 인입 채널 — 주문번호 입력·is_market_order·마켓 배지 적용 (인입채널 9종 중 네이버·쿠팡) */
export const OPEN_MARKET_SOURCES = ['네이버', '쿠팡'] as const

/** 마켓/채널별 배지 스타일 (1행 좌측). 기존 데이터 호환용 네이버 스토어 등 유지 */
export const MARKET_BADGE_STYLE: Record<string, { label: string; className: string }> = {
  '네이버': { label: '네이버', className: 'bg-[#03C75A]/20 text-[#03C75A] dark:bg-[#03C75A]/25 dark:text-[#03C75A] ring-1 ring-[#03C75A]/40' },
  '쿠팡': { label: '쿠팡', className: 'bg-red-500/20 text-red-600 dark:bg-red-400/90 ring-1 ring-red-500/40' },
  '네이버 스토어': { label: '네이버스토어', className: 'bg-[#03C75A]/20 text-[#03C75A] dark:bg-[#03C75A]/25 dark:text-[#03C75A] ring-1 ring-[#03C75A]/40' },
  '오늘의집': { label: '오늘의집', className: 'bg-teal-500/20 text-teal-700 dark:text-teal-400 ring-1 ring-teal-500/40' },
  '자사몰': { label: '자사몰', className: 'bg-violet-500/20 text-violet-700 dark:text-violet-400 ring-1 ring-violet-500/40' },
}

export const CUSTOMER_TIERS = [
  { value: '신규', label: '신규' },
  { value: '단골', label: '단골' },
  { value: '파트너', label: '파트너' },
  { value: '조심', label: '조심' },
  { value: '미지정', label: '미지정 (검토 필요)' },
] as const
export type CustomerTier = (typeof CUSTOMER_TIERS)[number]['value']

export const CUSTOMER_TIER_VALUES: CustomerTier[] = CUSTOMER_TIERS.map((t) => t.value)

/** 등급 우선순위 (높을수록 상위) — 동일 연락처 동기화 시 하향 조정 금지 */
export const CUSTOMER_TIER_RANK: Record<CustomerTier, number> = {
  미지정: 0,
  신규: 1,
  조심: 2,
  단골: 3,
  파트너: 4,
}

/** 상담 4단계 워크플로우 (표준) — 현장실측 제거 */
export const CONSULTATION_STAGES = ['상담접수', '견적중', '계약완료', '시공완료'] as const
export type ConsultationStage = (typeof CONSULTATION_STAGES)[number]

/** status → workflow_stage 매핑 (metadata.workflow_stage 없을 때) */
export const STATUS_TO_STAGE: Record<string, ConsultationStage> = {
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

export const LIST_PAGE_SIZE = 40

/** 업무 단계별 탭 — 영업 사원 우선순위 파악용 */
export type ListTab = '전체' | '미처리' | '견적중' | '진행중' | '종료' | '거절' | '무효'
export type DateRangeKey = 'all' | 'thisMonth' | '1m' | '3m' | '6m' | '1y'
export type CustomDateTarget = 'inbound' | 'update'

export const DATE_RANGE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: '전체 기간' },
  { value: 'thisMonth', label: '이번달' },
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '6m', label: '최근 6개월' },
  { value: '1y', label: '최근 1년' },
]

export const REACTIVATION_WINDOW_DAYS = 7

/** 인입채널 배지 공통 스타일 — 2행 맨 앞 고정, 오픈마켓/일반 통일(동일 크기·라운드·링) */
export const INFLOW_BADGE_BASE = 'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-black/10 dark:ring-white/10'

/** 업체명 첫 글자 → 컬러 이니셜 아바타용 배경 클래스 */
export const INITIAL_AVATAR_COLORS = [
  'bg-blue-500 text-white',
  'bg-emerald-500 text-white',
  'bg-violet-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-cyan-500 text-white',
] as const

/** 상태 바 7종 — 접수|견적|계약(실행/진행중)|완료|AS|무효|거절. 활성 버튼 눈에 띄게 강조 */
export type StageBarValue = '상담접수' | '견적중' | '계약완료' | '시공완료' | 'AS' | '무효' | '거절'

export const STAGE_BAR_OPTIONS: Array<{
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

export const MOBILE_BREAK = 768
