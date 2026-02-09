import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ruler, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'
const MEASUREMENT_STATUSES = ['실측필요', '실측완료', '실측해당없음'] as const
type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number]

interface ConsultationOption {
  id: string
  company: string
  managerName: string
}

/** 실측 완료 시 구글챗 스페이스로 PDF·요약 전송 (Webhook) */
function notifyMeasurementComplete(
  companyName: string,
  pdfPath: string | null,
  summaryMemo: string
): void {
  const text = `[실측 완료] ${companyName}\n${pdfPath ? 'PDF 도면 업로드됨.\n' : ''}${summaryMemo ? `요약: ${summaryMemo.slice(0, 200)}${summaryMemo.length > 200 ? '…' : ''}` : ''}`
  const webhookUrl =
    (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_MEASUREMENT_REMINDER as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_ANNOUNCEMENT as string | undefined)
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) return
  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch((err) => console.warn('구글챗 실측 완료 전송 실패:', err))
}

export default function MeasurementUpload() {
  const [searchParams] = useSearchParams()
  const consultationIdFromQuery = searchParams.get('consultationId')
  const [consultations, setConsultations] = useState<ConsultationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [consultationId, setConsultationId] = useState(consultationIdFromQuery || '')
  const [status, setStatus] = useState<MeasurementStatus | ''>('')
  const [assignee, setAssignee] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [dimensionMemo, setDimensionMemo] = useState('')
  const [constructionNotes, setConstructionNotes] = useState('')
  const [photosText, setPhotosText] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('consultations').select('id, company_name, manager_name, metadata').order('created_at', { ascending: false })
      if (error) {
        toast.error('상담 목록을 불러오지 못했습니다.')
        return
      }
      const list: ConsultationOption[] = (data || []).map((row: Record<string, unknown>) => {
        const meta = (row.metadata as Record<string, unknown>) || {}
        const company = (meta.company_name as string) || (row.company_name as string) || '(업체명 없음)'
        const managerName = (meta.manager_name as string) || (row.manager_name as string) || ''
        return { id: String(row.id), company, managerName }
      })
      setConsultations(list)
      if (consultationIdFromQuery && list.some((c) => c.id === consultationIdFromQuery)) {
        setConsultationId(consultationIdFromQuery)
      } else if (list.length > 0 && !consultationId) {
        setConsultationId(list[0].id)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (consultationIdFromQuery) setConsultationId(consultationIdFromQuery)
  }, [consultationIdFromQuery])

  useEffect(() => {
    if (!consultationId) return
    const loadMeta = async () => {
      const { data } = await supabase.from('consultations').select('metadata').eq('id', consultationId).single()
      const meta = (data?.metadata as Record<string, unknown>) || {}
      setStatus((meta.measurement_status as MeasurementStatus) ?? '')
      setAssignee(String(meta.measurement_assignee ?? ''))
      setScheduledDate(String((meta.measurement_scheduled_date as string) ?? '').slice(0, 10))
      setDimensionMemo(String(meta.measurement_dimension_memo ?? ''))
      setConstructionNotes(String(meta.measurement_construction_notes ?? ''))
      const photos = meta.measurement_photos as string[] | undefined
      setPhotosText(Array.isArray(photos) ? photos.join('\n') : '')
    }
    loadMeta()
  }, [consultationId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consultationId) {
      toast.error('상담을 선택하세요.')
      return
    }
    setSaving(true)
    try {
      const { data: row } = await supabase.from('consultations').select('metadata, company_name').eq('id', consultationId).single()
      const meta = (row?.metadata as Record<string, unknown>) || {}
      const companyName = (meta.company_name as string) || (row?.company_name as string) || ''

      let storagePath: string | null = (meta.measurement_drawing_path as string) || null
      if (pdfFile && pdfFile.type === 'application/pdf') {
        const timestamp = Date.now()
        storagePath = `${consultationId}/${timestamp}_실측도면.pdf`
        const { error: uploadError } = await supabase.storage
          .from(MEASUREMENT_DRAWINGS_BUCKET)
          .upload(storagePath, pdfFile, { contentType: 'application/pdf', upsert: true })
        if (uploadError) throw uploadError
      }

      const nextMeta = {
        ...meta,
        measurement_status: status || null,
        measurement_assignee: assignee.trim() || null,
        measurement_scheduled_date: scheduledDate.trim().slice(0, 10) || null,
        measurement_dimension_memo: dimensionMemo.trim() || null,
        measurement_construction_notes: constructionNotes.trim() || null,
        measurement_photos: photosText.trim() ? photosText.trim().split(/\r?\n/).filter(Boolean) : [],
        measurement_drawing_path: storagePath,
      }
      const { error: updateError } = await supabase.from('consultations').update({ metadata: nextMeta }).eq('id', consultationId)
      if (updateError) throw updateError

      const summaryMemo = [dimensionMemo.trim(), constructionNotes.trim()].filter(Boolean).join(' / ')
      notifyMeasurementComplete(companyName, storagePath, summaryMemo)

      toast.success('실측 정보가 저장되었습니다.')
      setPdfFile(null)
    } catch (err) {
      console.error(err)
      toast.error('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/measurement" className="text-sm text-muted-foreground hover:text-foreground">
            ← 실측 관리
          </Link>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            실측 정보 입력
          </h1>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">상담(프로젝트) 선택</label>
            <select
              value={consultationId}
              onChange={(e) => setConsultationId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              <option value="">선택</option>
              {consultations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company} {c.managerName ? `(${c.managerName})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MeasurementStatus | '')}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">선택</option>
              {MEASUREMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">실측 담당자</label>
              <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="담당자명" className="h-10 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">실측 예정일</label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="h-10 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">실측 도면 PDF</label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted-foreground mt-1">Supabase Storage(measurement-drawings)에 저장됩니다.</p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">현장 치수 메모</label>
            <textarea
              value={dimensionMemo}
              onChange={(e) => setDimensionMemo(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="치수·현장 메모"
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">실측 사진 URL (한 줄에 하나)</label>
            <textarea
              value={photosText}
              onChange={(e) => setPhotosText(e.target.value)}
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y font-mono text-xs"
              placeholder="https://..."
              rows={2}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">시공 유의사항</label>
            <textarea
              value={constructionNotes}
              onChange={(e) => setConstructionNotes(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="시공 시 주의사항"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              저장 (실측 완료 시 구글챗 알림 전송)
            </Button>
            <Link to="/measurement">
              <Button type="button" variant="outline">목록으로</Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}
