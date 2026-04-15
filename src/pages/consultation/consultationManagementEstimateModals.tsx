import React, { Suspense, lazy } from 'react'
import { Images, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EstimateFormProps } from '@/components/estimate/EstimateForm'
import {
  computeProposalTotals,
  computeFinalTotals,
  createEmptyRow,
  type EstimateFormData,
  type EstimateFormHandle,
} from '@/components/estimate/estimateFormShared'
import type { Lead } from '@/pages/consultation/consultationManagementTypes'

const EstimateForm = lazy(async () => ({ default: (await import('@/components/estimate/EstimateForm')).EstimateForm })) as unknown as React.ForwardRefExoticComponent<
  EstimateFormProps & React.RefAttributes<EstimateFormHandle>
>
const ProposalPreviewContent = lazy(async () => ({
  default: (await import('@/components/estimate/EstimateForm')).ProposalPreviewContent as React.ComponentType<any>,
}))
const FinalEstimatePreviewContent = lazy(async () => ({
  default: (await import('@/components/estimate/EstimateForm')).FinalEstimatePreviewContent as React.ComponentType<any>,
}))

function LazySectionFallback({ label = '화면을 불러오는 중...' }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {label}
    </div>
  )
}

export type ConsultationEstimateRow = {
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

export type ConsultationManagementEstimateModalsProps = {
  adminPreviewOpen: boolean
  onAdminPreviewOpenChange: (open: boolean) => void
  adminPreviewData: (EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) | null
  selectedLeadData: Lead | null
  onAdminPreviewCancel: () => void
  onAdminPreviewPublish: () => void
  printEstimateId: string | null
  onPrintDialogOpenChange: (open: boolean) => void
  estimatesList: ConsultationEstimateRow[]
  estimatesLoading: boolean
  onPrintSavePng: () => void | Promise<void>
  onPrintSavePdf: () => void | Promise<void>
  onPrintFinalize: () => void | Promise<void>
  priceBookImageUrl: string | null
  priceBookImageDisplayUrl: string | null
  onPriceBookOpenChange: (open: boolean) => void
  estimateModalOpen: boolean
  onEstimateModalOpenChange: (open: boolean) => void
  estimateModalEditId: string | null
  estimateModalInitialData: Partial<EstimateFormData> | null
  mergedPastEstimatesForGuide: Array<{
    id: string
    consultation_id: string
    payload: Record<string, unknown>
    final_proposal_data: Record<string, unknown> | null
    approved_at: string | null
    created_at: string
  }>
  estimateFormRef: React.RefObject<EstimateFormHandle | null> | React.MutableRefObject<EstimateFormHandle | null>
  onEstimateApproved: (data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) => void | Promise<void>
  onRequestEstimatePreview: (consultationId: string, estimateId: string) => void
  onRequestPriceBookImage: (url: string) => void
  onShareProductPhotos: () => void | Promise<void>
  onEstimateSaveDraft: (consultationId: string) => void | Promise<void>
  onPublishApproveFromModal: () => void | Promise<void>
}

export function ConsultationManagementEstimateModals({
  adminPreviewOpen,
  onAdminPreviewOpenChange,
  adminPreviewData,
  selectedLeadData,
  onAdminPreviewCancel,
  onAdminPreviewPublish,
  printEstimateId,
  onPrintDialogOpenChange,
  estimatesList,
  estimatesLoading,
  onPrintSavePng,
  onPrintSavePdf,
  onPrintFinalize,
  priceBookImageUrl,
  priceBookImageDisplayUrl,
  onPriceBookOpenChange,
  estimateModalOpen,
  onEstimateModalOpenChange,
  estimateModalEditId,
  estimateModalInitialData,
  mergedPastEstimatesForGuide,
  estimateFormRef,
  onEstimateApproved,
  onRequestEstimatePreview,
  onRequestPriceBookImage,
  onShareProductPhotos,
  onEstimateSaveDraft,
  onPublishApproveFromModal,
}: ConsultationManagementEstimateModalsProps) {
  return (
    <>
      <Dialog open={adminPreviewOpen} onOpenChange={onAdminPreviewOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-4 py-3 border-b border-border">
            <DialogTitle>
              {adminPreviewData?.mode === 'PROPOSAL' ? '예산 기획안' : '확정 견적서'} 미리보기 (고객에게 보여질 화면)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 min-h-0">
            {adminPreviewData && (() => {
              const rawRows = adminPreviewData.rows ?? []
              const paddedRows =
                rawRows.length >= 20
                  ? rawRows.slice(0, 20)
                  : [...rawRows, ...Array.from({ length: 20 - rawRows.length }, (_, i) => createEmptyRow(rawRows.length + i))]
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
            <Button type="button" variant="outline" onClick={onAdminPreviewCancel}>
              취소
            </Button>
            <Button type="button" onClick={onAdminPreviewPublish}>
              최종 발행
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!printEstimateId}
        onOpenChange={onPrintDialogOpenChange}
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
              <Button type="button" variant="outline" size="sm" onClick={() => void onPrintSavePng()}>
                PNG 저장
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void onPrintSavePdf()}>
                PDF 저장
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-semibold"
                onClick={() => void onPrintFinalize()}
              >
                최종 확정
              </Button>
            </div>
          </DialogHeader>
          <div
            className="print-container flex-1 min-h-0 overflow-y-auto p-4 pb-10 print:max-h-none print:p-6 print:pb-6"
            data-estimate-print-area
            style={{ maxHeight: 'calc(90vh - 56px)' }}
          >
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
              const paddedRows =
                rawRows.length >= 20
                  ? rawRows.slice(0, 20)
                  : [...rawRows, ...Array.from({ length: 20 - rawRows.length }, (_, i) => createEmptyRow(rawRows.length + i))]
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

      <Dialog open={!!priceBookImageUrl} onOpenChange={onPriceBookOpenChange}>
        <DialogContent overlayClassName="z-[100]" className="z-[100] max-w-4xl max-h-[90vh] flex flex-col">
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
          <Button type="button" variant="outline" onClick={() => onPriceBookOpenChange(false)}>
            닫기
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={estimateModalOpen}
        onOpenChange={onEstimateModalOpenChange}
      >
        <DialogContent
          overlayClassName="bg-black/40 backdrop-blur-md"
          className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 flex flex-col gap-0"
        >
          <DialogTitle className="sr-only">견적 작성</DialogTitle>
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card flex-wrap">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void onShareProductPhotos()}>
              <Images className="h-3.5 w-3.5" />
              이 품목 사진들 공유하기
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => selectedLeadData && void onEstimateSaveDraft(selectedLeadData.id)}
              >
                임시저장
              </Button>
              <Button type="button" size="sm" onClick={() => void onPublishApproveFromModal()}>
                발행승인
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onEstimateModalOpenChange(false)}>
                닫기
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto min-h-0 p-4">
            {(selectedLeadData || (estimateModalInitialData?.rows?.length ?? 0) > 0) && (
              <Suspense fallback={<LazySectionFallback label="견적 폼을 불러오는 중..." />}>
                <EstimateForm
                  key={estimateModalEditId ?? 'new'}
                  ref={estimateFormRef as React.LegacyRef<EstimateFormHandle>}
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
                  onApproved={selectedLeadData ? (data) => void onEstimateApproved(data) : undefined}
                  onRequestEstimatePreview={onRequestEstimatePreview}
                  onRequestPriceBookImage={onRequestPriceBookImage}
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
    </>
  )
}
