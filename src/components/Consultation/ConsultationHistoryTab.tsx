import React from 'react'
import { Phone, User, Star, EyeOff, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConsultationHistoryLog } from '@/components/chat/ConsultationHistoryLog'
import { cn } from '@/lib/utils'

type CustomerTier = '신규' | '단골' | '파트너' | '조심' | '미지정'

function formatContact(contact: string): string {
  const digits = contact.replace(/\D/g, '')
  if (digits.length < 8) return contact
  if (digits.length >= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  return `${digits.slice(0, 3)}-${digits.slice(3)}`
}

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

interface SelectedLeadData {
  id: string
  displayName: string
  company: string
  name: string
  contact: string
  customerTier: CustomerTier
  displayAmount: number
  google_chat_url?: string
  google_chat_pending?: boolean
}

interface SamePhoneConsultation {
  id: string
  project_name: string | null
  created_at: string
  status: string | null
  estimate_amount: number | null
}

interface ConsultationHistoryTabProps {
  selectedLeadData: SelectedLeadData
  samePhoneConsultations: SamePhoneConsultation[]
  estimateCountByConsultationId: Record<string, number>
  validatedDisplayAmount: number | null
  isAdmin: boolean
  onOpenEstimateModal: () => void
  handleSetPartnerGrade: (id: string) => void | Promise<void>
  handleSelectLead: (id: string) => void
  setHideConfirmLeadId: (id: string) => void
  refetchImageCountForConsultation: (id: string) => void
}

export function ConsultationHistoryTab({
  selectedLeadData,
  samePhoneConsultations,
  estimateCountByConsultationId,
  validatedDisplayAmount,
  isAdmin,
  onOpenEstimateModal,
  handleSetPartnerGrade,
  handleSelectLead,
  setHideConfirmLeadId,
  refetchImageCountForConsultation,
}: ConsultationHistoryTabProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <div className="flex min-h-0 flex-col lg:w-1/2">
        <div className="border border-border rounded-lg p-3 bg-muted/20 flex min-h-0 flex-col">
          {/* 좌측: 현재 상담 기본 정보 + 동일 연락처 과거 상담 */}
          <div className="shrink-0 space-y-2 mb-3 pb-3 border-b border-border">
            <p className="font-semibold text-foreground">{selectedLeadData.displayName || selectedLeadData.company || '(업체명 없음)'}</p>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <User className="h-3.5 w-3.5 shrink-0" />
              {selectedLeadData.name || '(고객명 없음)'}
            </p>
            {selectedLeadData.contact && (
              <p className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <a href={`tel:${selectedLeadData.contact.replace(/\D/g, '')}`} className="text-primary hover:underline">
                  {formatContact(selectedLeadData.contact)}
                </a>
              </p>
            )}
            <CustomerTierBadge tier={selectedLeadData.customerTier} />
            <button
              type="button"
              onClick={onOpenEstimateModal}
              className="flex items-center gap-1.5 text-left w-full rounded-lg border border-border bg-muted/40 hover:bg-muted/70 px-3 py-2 text-sm transition-colors"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">견적 이력</span>
              <span className="text-muted-foreground">({estimateCountByConsultationId[selectedLeadData?.id ?? ''] ?? 0}건)</span>
              {(validatedDisplayAmount !== null ? validatedDisplayAmount : selectedLeadData.displayAmount) > 0 && (
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-normal">견적 확정</span>
                  <span className="font-semibold text-primary">{(validatedDisplayAmount !== null ? validatedDisplayAmount : selectedLeadData.displayAmount).toLocaleString()}원</span>
                </span>
              )}
            </button>
            {isAdmin && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'w-full gap-2',
                    selectedLeadData.customerTier === '파트너'
                      ? 'border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30'
                      : 'hover:border-amber-400/60 hover:text-amber-700 dark:hover:text-amber-400'
                  )}
                  onClick={() => void handleSetPartnerGrade(selectedLeadData.id)}
                  disabled={selectedLeadData.customerTier === '파트너'}
                >
                  <Star className="h-4 w-4 shrink-0" />
                  {selectedLeadData.customerTier === '파트너' ? '파트너 지정됨' : '파트너 지정'}
                </Button>
                <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-muted-foreground hover:text-destructive hover:border-destructive" onClick={() => setHideConfirmLeadId(selectedLeadData.id)}>
                  <EyeOff className="h-4 w-4 shrink-0" />
                  이 상담 숨기기
                </Button>
              </>
            )}
          </div>

          <div className="flex-1 min-h-0">
            {/* 좌측 하단: 동일 연락처 과거 상담 */}
            {samePhoneConsultations.length > 0 ? (
              <div className="h-full min-h-0 flex flex-col">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">동일 연락처 과거 상담 ({samePhoneConsultations.length}건)</h3>
                <ul className="flex-1 min-h-0 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2 bg-background/70">
                  {samePhoneConsultations.map((c) => {
                    const isCurrent = c.id === selectedLeadData?.id
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => (isCurrent ? undefined : handleSelectLead(c.id))}
                          className={cn(
                            'w-full text-left rounded-md px-3 py-2 text-sm transition-colors',
                            isCurrent ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted/70 text-foreground'
                          )}
                        >
                          <span className="block truncate font-medium">{c.project_name || '(프로젝트명 없음)'}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'} · {c.status ?? '—'}
                            {c.estimate_amount != null && c.estimate_amount > 0 && ` · ${Number(c.estimate_amount).toLocaleString()}원`}
                          </span>
                          {isCurrent && <span className="ml-1 text-[10px] text-primary">(현재)</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
                동일 연락처 과거 상담이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 우측: 상담 히스토리 로그 */}
      <div className="flex min-h-0 flex-col lg:w-1/2">
        <div className="flex-1 min-h-0 border border-border rounded-lg p-3 bg-muted/20">
          {selectedLeadData?.id ? (
            <ConsultationHistoryLog
              consultationId={selectedLeadData.id}
              projectName={selectedLeadData.company || selectedLeadData.displayName || ''}
              onSaved={() => refetchImageCountForConsultation(selectedLeadData.id)}
            />
          ) : (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">상담을 선택해 주세요.</div>
          )}
        </div>
      </div>
    </div>
  )
}
