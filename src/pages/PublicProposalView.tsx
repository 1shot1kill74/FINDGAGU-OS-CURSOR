/**
 * 견적서 공유 링크 공개 페이지 — /p/estimate/:id
 * 예산 기획안(PROPOSAL) 및 확정 견적서(FINAL) 모두 지원. 읽기 전용 + 인쇄(PDF 저장) 가능.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ProposalPreviewContent, FinalEstimatePreviewContent, computeProposalTotals, computeFinalTotals } from '@/components/estimate/EstimateForm'
import type { EstimateFormData } from '@/components/estimate/EstimateForm'
import { Button } from '@/components/ui/button'

export default function PublicProposalView() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<EstimateFormData | null>(null)

  useEffect(() => {
    if (!id) {
      setError('잘못된 링크입니다.')
      setLoading(false)
      return
    }
    let cancelled = false
    supabase
      .from('estimates')
      .select('payload, final_proposal_data, approved_at')
      .eq('id', id)
      .eq('is_visible', true)
      .maybeSingle()
      .then(({ data: row, error: err }) => {
        if (cancelled) return
        setLoading(false)
        if (err) {
          setError('문서를 불러올 수 없습니다.')
          return
        }
        const raw = row as { payload?: unknown; final_proposal_data?: unknown; approved_at?: string | null } | null
        if (!raw) {
          setError('문서를 찾을 수 없습니다.')
          return
        }
        const payload = (raw.approved_at && raw.final_proposal_data ? raw.final_proposal_data : raw.payload) as EstimateFormData
        if (!payload || (payload.mode !== 'PROPOSAL' && payload.mode !== 'FINAL')) {
          setError('승인된 견적서만 공유할 수 있습니다.')
          return
        }
        setData(payload)
      })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-muted-foreground">불러오는 중…</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <p className="text-destructive">{error ?? '문서를 찾을 수 없습니다.'}</p>
      </div>
    )
  }

  const isProposal = data.mode === 'PROPOSAL'
  const previewContent = isProposal
    ? <ProposalPreviewContent data={data} totals={computeProposalTotals(data)} />
    : <FinalEstimatePreviewContent data={data} totals={computeFinalTotals(data)} />

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="sticky top-0 z-10 flex justify-end gap-2 p-4 bg-background/95 backdrop-blur border-b border-border print:hidden">
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          인쇄 (PDF 저장)
        </Button>
      </div>
      <div className="max-w-4xl mx-auto p-4 print:p-6">
        {previewContent}
      </div>
    </div>
  )
}
