import React, { Suspense, lazy } from 'react'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { OrderDocument } from '@/types/orderDocument'
import type { ConsultationEstimateFile } from '@/types/consultationEstimateFile'
import type { EstimateFormData } from '@/components/estimate/EstimateForm'
import type { DetailPanelTab, Lead } from '@/pages/consultation/consultationManagementTypes'

const ConsultationHistoryTab = lazy(async () => ({
  default: (await import('@/components/Consultation/ConsultationHistoryTab')).ConsultationHistoryTab as React.ComponentType<any>,
}))
const ConsultationMeasurementTab = lazy(async () => ({
  default: (await import('@/components/Consultation/ConsultationMeasurementTab')).ConsultationMeasurementTab as React.ComponentType<any>,
}))
const ConsultationEstimateTab = lazy(async () => ({
  default: (await import('@/components/Consultation/ConsultationEstimateTab')).ConsultationEstimateTab as React.ComponentType<any>,
}))

function LazySectionFallback({ label = '화면을 불러오는 중...' }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {label}
    </div>
  )
}

type EstimateRow = {
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

export type ConsultationManagementDetailPanelProps = {
  isMobile: boolean
  selectedLeadData: Lead | null
  detailPanelTab: DetailPanelTab
  onDetailPanelTabChange: (tab: DetailPanelTab) => void
  onMobileBack: () => void
  samePhoneConsultations: Array<{
    id: string
    project_name: string | null
    created_at: string
    status: string | null
    estimate_amount: number | null
  }>
  estimateCountByConsultationId: Record<string, number>
  validatedDisplayAmount: number | null
  isAdmin: boolean
  onOpenEstimateModal: () => void
  handleSetPartnerGrade: (id: string) => void | Promise<void>
  handleSelectLead: (id: string) => void
  setHideConfirmLeadId: (id: string) => void
  refetchImageCountForConsultation: (id: string) => void
  takeoutSpaceLinks: Array<{
    spaceId: string
    displayName: string
    consultationId: string
    inboundDate?: string | null
    updateDate?: string | null
  }>
  onApplyTakeoutSearch: (payload: { query: string; consultationId?: string }) => void
  onImportTakeoutCandidate: (payload: {
    candidate: { assetUrl: string; fileName: string; spaceId: string; spaceIdNormalized: string }
    consultationId: string
  }) => Promise<void> | void
  estimateFilesList: ConsultationEstimateFile[]
  takeoutImportRequest: { file: File; requestId: string } | null
  onTakeoutImportHandled: () => void
  onFileUploadComplete: (payload?: { estimateAmount: number }) => void
  estimateListFilter: 'all' | 'draft'
  setEstimateListFilter: (filter: 'all' | 'draft') => void
  selectedEstimateIds: string[]
  setSelectedEstimateIds: React.Dispatch<React.SetStateAction<string[]>>
  filteredEstimateList: EstimateRow[]
  setEstimateDeleteConfirmOpen: (open: boolean) => void
  estimatesLoading: boolean
  estimateListByYear: Array<{ year: number; items: EstimateRow[] }>
  archiveCutoff: number
  handleSetFinalEstimate: (id: string) => void | Promise<void>
  setPrintEstimateId: (id: string) => void
  setEstimateModalEditId: (id: string | null) => void
  setEstimateModalInitialData: (data: Partial<EstimateFormData> | null) => void
  setEstimateModalOpen: (open: boolean) => void
  orderDocumentsList: OrderDocument[]
  /** MeasurementSection → 상담 패널: 발주서 목록 동기화 */
  onMeasurementOrderDocumentsChange: (data: OrderDocument[] | null) => void
  estimateDeleteConfirmOpen: boolean
  estimateDeleting: boolean
  onDeleteSelectedEstimates: () => void | Promise<void>
}

export function ConsultationManagementDetailPanel({
  isMobile,
  selectedLeadData,
  detailPanelTab,
  onDetailPanelTabChange,
  onMobileBack,
  samePhoneConsultations,
  estimateCountByConsultationId,
  validatedDisplayAmount,
  isAdmin,
  onOpenEstimateModal,
  handleSetPartnerGrade,
  handleSelectLead,
  setHideConfirmLeadId,
  refetchImageCountForConsultation,
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
  orderDocumentsList,
  onMeasurementOrderDocumentsChange,
  estimateDeleteConfirmOpen,
  estimateDeleting,
  onDeleteSelectedEstimates,
}: ConsultationManagementDetailPanelProps) {
  return (
    <aside
      className={`flex flex-col border border-border rounded-xl bg-card overflow-hidden transition-[opacity] duration-200 min-w-0 ${selectedLeadData
        ? (isMobile ? 'w-full opacity-100' : 'sticky top-6 h-[calc(100vh-8rem)] opacity-100')
        : 'w-0 min-w-0 opacity-0 pointer-events-none overflow-hidden border-0'
        }`}
    >
      {selectedLeadData && (
        <Tabs
          value={detailPanelTab}
          onValueChange={(v) => onDetailPanelTabChange(v as DetailPanelTab)}
          className="flex flex-col h-full"
        >
          {isMobile && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 -ml-1" onClick={onMobileBack}>
                <ChevronLeft className="h-4 w-4" />
                목록
              </Button>
            </div>
          )}
          <TabsList className="w-full grid grid-cols-3 rounded-none border-b border-border bg-muted/50 h-10">
            <TabsTrigger value="history" className="text-xs rounded-none">
              상담 히스토리
            </TabsTrigger>
            <TabsTrigger value="estimate" className="text-xs rounded-none">
              견적 관리
            </TabsTrigger>
            <TabsTrigger value="measurement" className="text-xs rounded-none">
              배치도&발주서
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className={detailPanelTab === 'history' ? 'p-4 flex flex-col min-h-0 h-full overflow-hidden' : 'hidden'}>
              <Suspense fallback={<LazySectionFallback label="상담 히스토리를 불러오는 중..." />}>
                <ConsultationHistoryTab
                  selectedLeadData={selectedLeadData}
                  samePhoneConsultations={samePhoneConsultations}
                  estimateCountByConsultationId={estimateCountByConsultationId}
                  validatedDisplayAmount={validatedDisplayAmount}
                  isAdmin={isAdmin}
                  onOpenEstimateModal={onOpenEstimateModal}
                  handleSetPartnerGrade={handleSetPartnerGrade}
                  handleSelectLead={handleSelectLead}
                  setHideConfirmLeadId={setHideConfirmLeadId}
                  refetchImageCountForConsultation={refetchImageCountForConsultation}
                />
              </Suspense>
            </div>
            <div className={detailPanelTab === 'estimate' ? 'p-4 flex flex-col min-h-0' : 'hidden'}>
              <Suspense fallback={<LazySectionFallback label="견적 관리를 불러오는 중..." />}>
                <ConsultationEstimateTab
                  selectedLeadData={selectedLeadData}
                  takeoutSpaceLinks={takeoutSpaceLinks}
                  onApplyTakeoutSearch={onApplyTakeoutSearch}
                  onImportTakeoutCandidate={onImportTakeoutCandidate}
                  estimateFilesList={estimateFilesList}
                  takeoutImportRequest={takeoutImportRequest}
                  onTakeoutImportHandled={onTakeoutImportHandled}
                  onFileUploadComplete={onFileUploadComplete}
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
            <div className={detailPanelTab === 'measurement' ? 'p-4 space-y-4' : 'hidden'}>
              <Suspense fallback={<LazySectionFallback label="배치도와 발주서를 불러오는 중..." />}>
                <ConsultationMeasurementTab
                  consultationId={selectedLeadData.id}
                  projectName={selectedLeadData.company || selectedLeadData.displayName || ''}
                  orderDocuments={orderDocumentsList}
                  measurementDrawingPath={selectedLeadData.measurementDrawingPath}
                  onOrderDocumentsChange={onMeasurementOrderDocumentsChange}
                />
              </Suspense>
            </div>
          </div>
        </Tabs>
      )}

      <Dialog open={estimateDeleteConfirmOpen} onOpenChange={setEstimateDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>견적 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">정말 삭제하시겠습니까? 복구할 수 없습니다.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEstimateDeleteConfirmOpen(false)} disabled={estimateDeleting}>
              취소
            </Button>
            <Button type="button" variant="destructive" onClick={() => void onDeleteSelectedEstimates()} disabled={estimateDeleting}>
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
  )
}
