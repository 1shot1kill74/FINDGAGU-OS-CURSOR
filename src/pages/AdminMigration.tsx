/**
 * 데이터 통합 관리 — 기존 견적 파일 AI 파싱 및 DB 연동 (테스트 최적화형)
 * - 멀티 파일 업로드, 파일별 상태(대기/분석중/검수대기/완료)
 * - AI 파싱 → 검수 테이블 편집 → Consultations/Estimates 생성 (is_test, 과거데이터)
 * - 테스트 모드 시 업체명 앞 [TEST] 접두사
 */
import React, { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { EstimateFormData, EstimateRow } from '@/components/estimate/EstimateForm'
import { computeFinalTotals } from '@/components/estimate/EstimateForm'
import type { Json } from '@/types/database'
import { parseEstimateFromFile, type ParsedEstimate } from '@/lib/migrationParseService'

const SUPPLIER_FIXED = {
  bizNumber: '374-81-02631',
  address: '경기도 남양주시 화도읍 가곡로 88번길 29-2, 1동',
  contact: '031-592-7981',
} as const

/** 인입일(YYYY-MM-DD) → consultations.created_at용 ISO 문자열. 골든타임 계산 기준일로 사용됨 */
function toCreatedAtISO(quoteDate: string): string {
  const trimmed = String(quoteDate || '').trim()
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return new Date().toISOString()
  return new Date(trimmed + 'T00:00:00').toISOString()
}

type FileStatus = '대기' | '분석중' | '검수대기' | '완료'

interface MigrationFile {
  id: string
  file: File
  status: FileStatus
  parsed: ParsedEstimate | null
  consultationId: string | null
  error: string | null
}

export default function AdminMigration() {
  const navigate = useNavigate()
  const [testMode, setTestMode] = useState(false)
  const [files, setFiles] = useState<MigrationFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter((f) => f.size > 0)
    const next: MigrationFile[] = list.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: '대기' as FileStatus,
      parsed: null,
      consultationId: null,
      error: null,
    }))
    setFiles((prev) => [...prev, ...next])
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const startAnalysis = useCallback(
    async (id: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: '분석중' as FileStatus, error: null } : f))
      )
      const item = files.find((f) => f.id === id)
      if (!item) return
      try {
        const parsed = await parseEstimateFromFile(item.file, testMode)
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: '검수대기' as FileStatus, parsed, error: null } : f
          )
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : '분석 실패'
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: '대기' as FileStatus, error: msg } : f))
        )
        toast.error(msg)
      }
    },
    [files, testMode]
  )

  const updateParsed = useCallback((id: string, upd: Partial<ParsedEstimate>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id && f.parsed ? { ...f, parsed: { ...f.parsed, ...upd } } : f))
    )
  }, [])

  const updateRow = useCallback((fileId: string, rowIndex: number, field: keyof EstimateRow, value: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId || !f.parsed) return f
        const rows = f.parsed.rows.map((r, i) =>
          i === rowIndex ? { ...r, [field]: value } : r
        ) as EstimateRow[]
        return { ...f, parsed: { ...f.parsed, rows } }
      })
    )
  }, [])

  const addRow = useCallback((fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId || !f.parsed) return f
        const len = f.parsed.rows.length
        const newRow: EstimateRow = {
          no: String(len + 1),
          name: '',
          spec: '',
          qty: '1',
          unit: 'EA',
          unitPrice: '',
          note: '',
        }
        return { ...f, parsed: { ...f.parsed, rows: [...f.parsed.rows, newRow] } }
      })
    )
  }, [])

  const removeRow = useCallback((fileId: string, rowIndex: number) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId || !f.parsed) return f
        const rows = f.parsed.rows.filter((_, i) => i !== rowIndex)
        rows.forEach((r, i) => {
          r.no = String(i + 1)
        })
        return { ...f, parsed: { ...f.parsed, rows } }
      })
    )
  }, [])

  /** [저장] 버튼: consultations · estimates 실제 insert, is_test: true, metadata.migration_tag: '과거데이터'. created_at은 인입일(quoteDate) 소급 적용. 완료 시 토스트 후 상담 관리로 이동 */
  const handleSave = useCallback(
    async (id: string) => {
      const item = files.find((f) => f.id === id)
      if (!item?.parsed) return
      const { recipientName, recipientContact, quoteDate, rows } = item.parsed
      const createdAt = toCreatedAtISO(quoteDate)
      const payload: EstimateFormData = {
        mode: 'FINAL',
        recipientName,
        recipientContact,
        quoteDate,
        bizNumber: SUPPLIER_FIXED.bizNumber,
        address: SUPPLIER_FIXED.address,
        supplierContact: SUPPLIER_FIXED.contact,
        sealImageUrl: '',
        rows,
        footerNotes: '과거 데이터 마이그레이션',
      }
      const { supplyTotal, vat, grandTotal } = computeFinalTotals(payload)
      try {
        const { data: consultation, error: consultErr } = await supabase
          .from('consultations')
          .insert({
            company_name: recipientName,
            manager_name: recipientName,
            contact: recipientContact || '000-0000-0000',
            status: '상담중',
            expected_revenue: grandTotal,
            created_at: createdAt,
            metadata: {
              migration_tag: '과거데이터',
              source: '마이그레이션',
            } as Json,
            is_test: true,
          })
          .select('id')
          .single()
        if (consultErr) throw consultErr
        const consultationId = consultation.id
        const { error: estErr } = await supabase.from('estimates').insert({
          consultation_id: consultationId,
          payload: payload as unknown as Json,
          supply_total: supplyTotal,
          vat,
          grand_total: grandTotal,
          approved_at: new Date().toISOString(),
          final_proposal_data: payload as unknown as Json,
          is_test: true,
        })
        if (estErr) throw estErr
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: '완료' as FileStatus, consultationId } : f
          )
        )
        toast.success('테스트 데이터가 생성되었습니다')
        navigate('/consultation')
      } catch (err) {
        console.error(err)
        toast.error(err instanceof Error ? err.message : '저장 실패')
      }
    },
    [files, navigate]
  )

  const deleteAllTestData = useCallback(async () => {
    if (!confirm('is_test: true인 모든 상담·견적 데이터를 삭제합니다. 계속할까요?')) return
    setDeleting(true)
    try {
      const { error: estErr } = await supabase.from('estimates').delete().eq('is_test', true)
      if (estErr) throw estErr
      const { error: consultErr } = await supabase.from('consultations').delete().eq('is_test', true)
      if (consultErr) throw consultErr
      toast.success('테스트 데이터가 모두 삭제되었습니다.')
      setFiles((prev) => prev.filter((f) => f.status !== '완료'))
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeleting(false)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">← 홈</Link>
            <h1 className="text-2xl font-bold text-foreground">데이터 통합 관리</h1>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm font-medium text-foreground">테스트 모드 활성화</span>
            <button
              type="button"
              role="switch"
              aria-checked={testMode}
              onClick={() => setTestMode((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${testMode ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition translate-x-0.5 ${testMode ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </label>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}
        >
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">여러 파일을 드래그하여 놓거나, 클릭하여 선택하세요.</p>
          <p className="text-xs text-muted-foreground mt-1">이미지, PDF, PPT 지원 (AI 인식 후 검수 단계 진행)</p>
          <input
            type="file"
            multiple
            accept=".pdf,.ppt,.pptx,image/*"
            className="sr-only"
            id="migration-file-input"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => document.getElementById('migration-file-input')?.click()}>
            파일 선택
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            AI API: {import.meta.env.VITE_MIGRATION_PARSE_API ? '연결됨' : 'Mock 모드 (.env에 VITE_MIGRATION_PARSE_API 설정 시 실제 API 사용)'}
          </p>
        </div>

        <ul className="space-y-4">
          {files.map((f) => (
            <li key={f.id} className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{f.file.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      f.status === '완료'
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                        : f.status === '검수대기'
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                          : f.status === '분석중'
                            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                            : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {f.status === '분석중' && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
                    {f.status}
                  </span>
                  {f.status === '대기' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => startAnalysis(f.id)}>
                      분석 시작
                    </Button>
                  )}
                  {f.status === '검수대기' && (
                    <Button type="button" size="sm" onClick={() => handleSave(f.id)}>
                      저장
                    </Button>
                  )}
                </div>
              </div>
              {f.error && (
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-destructive bg-destructive/10">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {f.error}
                </div>
              )}
              {f.status === '검수대기' && f.parsed && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">업체명</span>
                      <Input
                        value={f.parsed.recipientName}
                        onChange={(e) => updateParsed(f.id, { recipientName: e.target.value })}
                        className="h-9"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">연락처</span>
                      <Input
                        value={f.parsed.recipientContact}
                        onChange={(e) => updateParsed(f.id, { recipientContact: e.target.value })}
                        className="h-9"
                        placeholder="000-0000-0000"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted-foreground block mb-1">인입일(날짜)</span>
                      <Input
                        type="date"
                        value={f.parsed.quoteDate}
                        onChange={(e) => updateParsed(f.id, { quoteDate: e.target.value })}
                        className="h-9"
                      />
                    </label>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">최종 검수 — 품목·규격·수량·단가</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => addRow(f.id)}>
                        행 추가
                      </Button>
                    </div>
                    <div className="border border-border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="border-b border-border px-2 py-2 text-left w-8">No</th>
                            <th className="border-b border-border px-2 py-2 text-left min-w-[100px]">품목</th>
                            <th className="border-b border-border px-2 py-2 text-left min-w-[120px]">규격</th>
                            <th className="border-b border-border px-2 py-2 text-left w-16">수량</th>
                            <th className="border-b border-border px-2 py-2 text-right min-w-[90px]">단가</th>
                            <th className="border-b border-border px-2 py-2 w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {f.parsed.rows.map((row, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-2 py-1.5">{row.no}</td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.name}
                                  onChange={(e) => updateRow(f.id, i, 'name', e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.spec}
                                  onChange={(e) => updateRow(f.id, i, 'spec', e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.qty}
                                  onChange={(e) => updateRow(f.id, i, 'qty', e.target.value)}
                                  className="h-8 text-sm w-14"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <Input
                                  value={row.unitPrice}
                                  onChange={(e) => updateRow(f.id, i, 'unitPrice', e.target.value)}
                                  className="h-8 text-sm text-right"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeRow(f.id, i)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {f.status === '완료' && (
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-green-600 dark:text-green-400 bg-green-500/10">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  DB 저장 완료 {f.consultationId && `(상담 ID: ${f.consultationId.slice(0, 8)}…)`}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="pt-6 border-t border-border">
          <Button type="button" variant="destructive" onClick={deleteAllTestData} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            모든 테스트 데이터 삭제
          </Button>
          <p className="text-xs text-muted-foreground mt-2">is_test: true인 상담·견적만 삭제됩니다.</p>
        </div>
      </div>
    </div>
  )
}
