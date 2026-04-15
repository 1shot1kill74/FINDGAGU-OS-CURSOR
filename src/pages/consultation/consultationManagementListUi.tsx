import type { MouseEvent } from 'react'
import { Copy, Images, Loader2, MessageCircle, Pencil, Pin, Star, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  INFLOW_BADGE_BASE,
  MARKET_BADGE_STYLE,
  STAGE_BAR_OPTIONS,
  type ConsultationStage,
  type CustomerTier,
  type StageBarValue,
} from '@/pages/consultation/consultationManagementConstants'
import type { LastActivityMessage, Lead } from '@/pages/consultation/consultationManagementTypes'
import {
  formatContact,
  getNeglectDDisplay,
  getReactivationSignal,
} from '@/pages/consultation/consultationManagementLeadUtils'
import { isMarketSource } from '@/pages/consultation/consultationManagementUtils'

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

/** 리스트 카드: Composite Header(이니셜·업체명·상태/지역/예산 칩) + 마지막 활동 + 기존 2~4행 */
export function ConsultationListItem({
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
  onCopyContact: (e: MouseEvent, tel: string) => void
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

  /** 방치 방지: update_date 기준 D-Day */
  const showNeglectIndicator = item.status !== '거절' && item.status !== '무효'
  const neglectD = showNeglectIndicator ? getNeglectDDisplay(item.updateDate) : null
  const reactivationSignal = getReactivationSignal(item.status, item.workflowStage, item.updateDate)
  /** 2행 맨 오른쪽: 최종 견적가. 실제 소스 1개만 — DB(consultations.estimate_amount → expectedRevenue). pending은 견적서로 저장 직후 낙관적 표시용 */
  const pendingAmount = getPendingEstimateAmount?.(item.id)
  const amountToShow =
    (pendingAmount != null && pendingAmount > 0 ? pendingAmount : null) ?? (item.expectedRevenue > 0 ? item.expectedRevenue : 0)
  const finalAmountDisplay = amountToShow > 0 ? `${Number(amountToShow).toLocaleString()}원` : '견적 미정'
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
