import React, { useState } from 'react'
import { FileText, Trash2, Copy, Loader2, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EstimateFilesGallery } from '@/components/estimate/EstimateFilesGallery'
import { TakeoutQuoteInboxDialog } from '@/components/estimate/TakeoutQuoteInboxDialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ConsultationEstimateFile } from '@/types/consultationEstimateFile'
import type { EstimateFormData } from '@/components/estimate/EstimateForm'
import { AutoEstimateDialog } from '@/components/Consultation/AutoEstimateDialog'

interface EstimateListItem {
  id: string
  consultation_id: string
  payload: Record<string, unknown>
  final_proposal_data: Record<string, unknown> | null
  supply_total: number
  vat: number
  grand_total: number
  approved_at: string | null
  created_at: string
}

interface SelectedLeadData {
  id: string
  company: string
  displayName: string
  contact: string
  channelChatId?: string | null
  google_chat_url?: string
  metadata?: Record<string, unknown>
  workflowStage: string
}

interface TakeoutSpaceLink {
  spaceId: string
  displayName: string
  consultationId: string
  inboundDate?: string | null
}

function parseGoogleChatSpaceId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  const direct = raw.replace(/^spaces\//i, '').trim()
  const urlMatch = direct.match(/\/room\/([^/?#]+)/i)
  return (urlMatch?.[1] ?? direct) || null
}

interface ConsultationEstimateTabProps {
  selectedLeadData: SelectedLeadData
  takeoutSpaceLinks: TakeoutSpaceLink[]
  onApplyTakeoutSearch: (payload: { query: string; consultationId?: string }) => void
  onImportTakeoutCandidate: (payload: {
    candidate: { assetUrl: string; fileName: string; spaceId: string; spaceIdNormalized: string }
    consultationId: string
  }) => Promise<void> | void
  estimateFilesList: ConsultationEstimateFile[]
  takeoutImportRequest: {
    file: File
    requestId: string
  } | null
  onTakeoutImportHandled: () => void
  onFileUploadComplete: (payload?: { estimateAmount: number }) => void
  estimateListFilter: 'all' | 'draft'
  setEstimateListFilter: (filter: 'all' | 'draft') => void
  selectedEstimateIds: string[]
  setSelectedEstimateIds: React.Dispatch<React.SetStateAction<string[]>>
  filteredEstimateList: EstimateListItem[]
  setEstimateDeleteConfirmOpen: (open: boolean) => void
  estimatesLoading: boolean
  estimateListByYear: Array<{ year: number; items: EstimateListItem[] }>
  archiveCutoff: number
  handleSetFinalEstimate: (id: string) => void | Promise<void>
  setPrintEstimateId: (id: string) => void
  setEstimateModalEditId: (id: string | null) => void
  setEstimateModalInitialData: (data: Partial<EstimateFormData> | null) => void
  setEstimateModalOpen: (open: boolean) => void
}

export function ConsultationEstimateTab({
  selectedLeadData,
  takeoutSpaceLinks,
  onApplyTakeoutSearch,
  onImportTakeoutCandidate,
  estimateFilesList,
  takeoutImportRequest,
  onTakeoutImportHandled,
  onFileUploadComplete,
  estimateListFilter,
  setEstimateListFilter,
  selectedEstimateIds,
  setSelectedEstimateIds,
  filteredEstimateList,
  setEstimateDeleteConfirmOpen,
  estimatesLoading,
  estimateListByYear,
  archiveCutoff,
  handleSetFinalEstimate,
  setPrintEstimateId,
  setEstimateModalEditId,
  setEstimateModalInitialData,
  setEstimateModalOpen,
}: ConsultationEstimateTabProps) {
  const [autoEstimateOpen, setAutoEstimateOpen] = useState(false)
  const [takeoutDialogOpen, setTakeoutDialogOpen] = useState(false)

  const currentSpaceId =
    (typeof selectedLeadData.channelChatId === 'string' && selectedLeadData.channelChatId.trim()) ||
    (typeof selectedLeadData.metadata?.space_id === 'string' && selectedLeadData.metadata.space_id.trim()) ||
    parseGoogleChatSpaceId(selectedLeadData.google_chat_url) ||
    parseGoogleChatSpaceId(selectedLeadData.metadata?.google_chat_url) ||
    null

  const handleImportTakeoutCandidate = async (candidate: {
    assetUrl: string
    fileName: string
    spaceId: string
    spaceIdNormalized: string
  }) => {
    const candidateSpaceId = parseGoogleChatSpaceId(candidate.spaceIdNormalized || candidate.spaceId)
    const matchedLink = takeoutSpaceLinks.find((link) => parseGoogleChatSpaceId(link.spaceId) === candidateSpaceId)
    const isCurrentCardSpace =
      !!candidateSpaceId &&
      !!currentSpaceId &&
      candidateSpaceId === parseGoogleChatSpaceId(currentSpaceId)

    const targetConsultationId = isCurrentCardSpace
      ? selectedLeadData.id
      : matchedLink?.consultationId

    if (!targetConsultationId) {
      toast.error('연결된 상담카드를 찾지 못했습니다. 스페이스 제목으로 카드를 먼저 찾은 뒤 다시 시도해 주세요.')
      return
    }

    setTakeoutDialogOpen(false)
    await onImportTakeoutCandidate({
      candidate,
      consultationId: targetConsultationId,
    })
  }

  return (
    <>
      <div className="mb-4 pb-4 border-b border-border">
        <EstimateFilesGallery
          consultationId={selectedLeadData.id}
          projectName={selectedLeadData.company || selectedLeadData.displayName || ''}
          files={estimateFilesList}
          onUploadComplete={onFileUploadComplete}
          externalImportRequest={takeoutImportRequest}
          onExternalImportHandled={onTakeoutImportHandled}
        />
      </div>
      {/* 견적 작성 버튼 2종 */}
      <div className="flex gap-2 mb-3">
        <Button
          type="button"
          className="flex-1 gap-2"
          onClick={() => {
            setEstimateModalEditId(null)
            setEstimateModalInitialData({
              recipientName: selectedLeadData.contact?.trim() || '',
              recipientContact: selectedLeadData.contact ?? '',
            })
            setEstimateModalOpen(true)
          }}
        >
          <FileText className="h-4 w-4" />
          신규 견적 작성
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2 shrink-0"
          onClick={() => setAutoEstimateOpen(true)}
        >
          <Calculator className="h-4 w-4" />
          자동 견적 작성
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2 shrink-0"
          onClick={() => setTakeoutDialogOpen(true)}
        >
          테이크아웃 이미지 가져오기
        </Button>
      </div>
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
      {(() => {
        const validSelectionIds = selectedEstimateIds.filter((id) => filteredEstimateList.some((e) => e.id === id))
        if (validSelectionIds.length === 0) return null
        return (
          <div className="flex items-center justify-between gap-2 mb-2 py-1.5 px-2 rounded-md bg-muted/50 text-sm">
            <span className="text-muted-foreground">{validSelectionIds.length}건 선택</span>
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
        )
      })()}
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
                  const isFinalEstimate = selectedLeadData?.metadata?.final_estimate_id === est.id
                  return (
                    <li
                      key={est.id}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-2 transition-colors',
                        isArchive
                          ? 'border-border/60 bg-slate-100/80 dark:bg-slate-800/40 text-muted-foreground'
                          : 'border-border bg-muted/30',
                        isFinalEstimate && 'ring-1 ring-primary border-primary/50'
                      )}
                    >
                      {isArchive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 shrink-0">
                          아카이브
                        </span>
                      )}
                      {isFinalEstimate && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold shrink-0" title="이 상담의 최종 견적">
                          최종
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
                        <p className="font-medium text-foreground">
                          {(() => {
                            const raw = (est.payload?.quoteDate ?? est.final_proposal_data?.quoteDate) as string | undefined
                            const quoteDateStr = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 16).replace(' ', 'T') : ''
                            const dateToShow = quoteDateStr && !Number.isNaN(Date.parse(quoteDateStr)) ? new Date(quoteDateStr) : new Date(est.created_at)
                            return dateToShow.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                          })()}
                        </p>
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
                            {!isFinalEstimate && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 text-primary border-primary/50 hover:bg-primary/10"
                                onClick={() => void handleSetFinalEstimate(est.id)}
                                title="이 견적을 상담 카드의 최종 견적가로 연결"
                              >
                                최종 견적로 지정
                              </Button>
                            )}
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
                              const p = (est.payload ?? {}) as Partial<EstimateFormData> & Record<string, unknown>
                              const fallbackDate = (est.created_at ?? est.approved_at ?? '').toString().slice(0, 16).replace('T', ' ')
                              setEstimateModalInitialData({
                                ...p,
                                quoteDate: p.quoteDate || fallbackDate,
                              } as Partial<EstimateFormData>)
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

      {/* 자동 견적 계산기 Dialog */}
      <AutoEstimateDialog
        open={autoEstimateOpen}
        onOpenChange={setAutoEstimateOpen}
        filteredEstimateList={filteredEstimateList}
      />
      <TakeoutQuoteInboxDialog
        open={takeoutDialogOpen}
        onOpenChange={setTakeoutDialogOpen}
        currentSpaceId={currentSpaceId}
        currentDisplayName={selectedLeadData.displayName}
        spaceLinks={takeoutSpaceLinks}
        onApplySearch={onApplyTakeoutSearch}
        onImportCandidate={handleImportTakeoutCandidate}
      />
    </>
  )
}
