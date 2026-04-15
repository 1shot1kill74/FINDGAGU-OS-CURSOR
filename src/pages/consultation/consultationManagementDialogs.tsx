import React from 'react'
import { FileText, CheckCircle, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CONSULTATION_INDUSTRY_OPTIONS } from '@/data/referenceCases'
import {
  BUTTON_SUBMIT_CLASS,
  CONSULT_SOURCES,
  CUSTOMER_TIERS,
  INPUT_CLASS,
  type CustomerTier,
} from '@/pages/consultation/consultationManagementConstants'
import type { Lead } from '@/pages/consultation/consultationManagementTypes'
import { formatContactInput, getValidCustomerTier } from '@/pages/consultation/consultationManagementLeadUtils'
import { isMarketSource, suggestCategory } from '@/pages/consultation/consultationManagementUtils'

export type ConsultationCreateFormState = {
  companyName: string
  region: string
  industry: string
  managerName: string
  contact: string
  source: string
  orderNumber: string
  areaSqm: string
  requiredDate: string
  painPoint: string
  customerTier: CustomerTier
}

export type ConsultationEditFormState = {
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
}

type EstimateListRow = {
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

export type ConsultationManagementDialogsProps = {
  isCreateDialogOpen: boolean
  setIsCreateDialogOpen: (open: boolean) => void
  handleSubmitConsultation: (e: React.FormEvent) => void
  form: ConsultationCreateFormState
  setFormField: (key: keyof ConsultationCreateFormState, value: string) => void
  setForm: React.Dispatch<React.SetStateAction<ConsultationCreateFormState>>
  isSubmitting: boolean
  asModalLeadId: string | null
  setAsModalLeadId: (id: string | null) => void
  asReason: string
  setAsReason: (v: string) => void
  handleToggleAs: (leadId: string, asOn: boolean, reason?: string) => void | Promise<void>
  cancelModalLeadId: string | null
  setCancelModalLeadId: (id: string | null) => void
  cancelReasonDraft: string
  setCancelReasonDraft: (v: string) => void
  handleCancelSubmit: () => void | Promise<void>
  hideConfirmLeadId: string | null
  setHideConfirmLeadId: (id: string | null) => void
  handleHideLead: (leadId: string) => void | Promise<void>
  measurementModalOpen: boolean
  setMeasurementModalOpen: (open: boolean) => void
  selectedLeadData: Lead | null
  openMeasurementDrawingPreview: (path: string) => void
  estimateModalLeadId: string | null
  setEstimateModalLeadId: (id: string | null) => void
  setNewEstimateForm: React.Dispatch<React.SetStateAction<{ amount: string; summary: string }>>
  newEstimateForm: { amount: string; summary: string }
  leads: Lead[]
  selectedLead: string | null
  estimatesList: EstimateListRow[]
  handleSetEstimateFinalByEstimateId: (consultationId: string, estimateId: string) => void | Promise<void>
  handleSetEstimateFinal: (consultationId: string, version: number) => void | Promise<void>
  handleAddEstimate: (consultationId: string) => void | Promise<void>
  editModalLeadId: string | null
  setEditModalLeadId: (id: string | null) => void
  editForm: ConsultationEditFormState
  setEditForm: React.Dispatch<React.SetStateAction<ConsultationEditFormState>>
  handleEditSave: () => void | Promise<void>
}

export function ConsultationManagementDialogs({
  isCreateDialogOpen,
  setIsCreateDialogOpen,
  handleSubmitConsultation,
  form,
  setFormField,
  setForm,
  isSubmitting,
  asModalLeadId,
  setAsModalLeadId,
  asReason,
  setAsReason,
  handleToggleAs,
  cancelModalLeadId,
  setCancelModalLeadId,
  cancelReasonDraft,
  setCancelReasonDraft,
  handleCancelSubmit,
  hideConfirmLeadId,
  setHideConfirmLeadId,
  handleHideLead,
  measurementModalOpen,
  setMeasurementModalOpen,
  selectedLeadData,
  openMeasurementDrawingPreview,
  estimateModalLeadId,
  setEstimateModalLeadId,
  setNewEstimateForm,
  newEstimateForm,
  leads,
  selectedLead,
  estimatesList,
  handleSetEstimateFinalByEstimateId,
  handleSetEstimateFinal,
  handleAddEstimate,
  editModalLeadId,
  setEditModalLeadId,
  editForm,
  setEditForm,
  handleEditSave,
}: ConsultationManagementDialogsProps) {
  const validIndustryValues = CONSULTATION_INDUSTRY_OPTIONS.map((o) => o.value)

  return (
    <>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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
    
    {/* 거절 사유 입력 모달 — 반드시 사유 입력 후 저장, metadata.cancel_reason + status 거절 */}
    <Dialog open={!!cancelModalLeadId} onOpenChange={(open) => { if (!open) { setCancelModalLeadId(null); setCancelReasonDraft('') } }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>거절 사유 입력</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-sm font-medium block mb-1">거절 사유</label>
            <Input
              value={cancelReasonDraft}
              onChange={(e) => setCancelReasonDraft(e.target.value)}
              placeholder="사유를 입력하세요 (필수)"
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
    {/* 실측 자료(PDF) — legacy 실측 도면 미리보기용 모달 */}
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
              <span className="font-medium text-foreground">{selectedLeadData.company || '(업체명 없음)'}</span> — 발주서·배치도는 실측 탭에서 업로드합니다.
            </p>
            {selectedLeadData.measurementDrawingPath ? (
              <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => openMeasurementDrawingPreview(selectedLeadData.measurementDrawingPath!)}>
                <FileText className="h-4 w-4" />
                PDF 미리보기 (일시적 링크)
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">실측 도면 PDF가 없습니다.</p>
            )}
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
          const fromEstimates =
            lead.id === selectedLead
              ? estimatesList.map((e, i) => ({
                estimateId: e.id,
                version: i + 1,
                issued_at: e.created_at.slice(0, 10),
                amount: e.grand_total,
                summary: (e.payload?.summary as string) || undefined,
                is_final: !!e.approved_at,
              }))
              : []
          const fromMeta = [...lead.estimateHistory].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
          const list =
            fromEstimates.length > 0
              ? fromEstimates
              : fromMeta.map((e) => ({ ...e, estimateId: undefined as string | undefined }))
          return (
            <div className="space-y-4 pt-1">
              <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                {list.length === 0 ? (
                  <li className="text-sm text-muted-foreground py-4 text-center">발행된 견적이 없습니다. 아래에서 추가해 주세요.</li>
                ) : (
                  list.map((e) => (
                    <li key={e.estimateId ?? `v${e.version}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 bg-muted/30">
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
                          onClick={() =>
                            e.estimateId
                              ? void handleSetEstimateFinalByEstimateId(lead.id, e.estimateId)
                              : void handleSetEstimateFinal(lead.id, e.version)
                          }
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
              <select value={editForm.industry && validIndustryValues.includes(editForm.industry as (typeof validIndustryValues)[number]) ? editForm.industry : '기타'} onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))} className={`w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${INPUT_CLASS}`}>
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
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">구글챗 링크</label>
            <Input
              type="url"
              inputMode="url"
              value={editForm.google_chat_url}
              onChange={(e) => setEditForm((f) => ({ ...f, google_chat_url: e.target.value }))}
              className={INPUT_CLASS}
              placeholder="https://chat.google.com/room/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">인입일</label>
              <Input type="date" value={editForm.inboundDate ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, inboundDate: e.target.value }))} className={INPUT_CLASS} />
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
    </>
  )
}
