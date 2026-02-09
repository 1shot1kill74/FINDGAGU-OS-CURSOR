/**
 * 관리자 전용 아카이브 — 숨겨진 상담(is_visible: false)만 모아보기
 * - 복구: is_visible true로 복원 → 리스트/통계 재포함
 * - 영구 삭제: 연동 견적(estimates) 포함 삭제
 * - 필터: [TEST] 접두사 업체명만 보기
 */
import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Archive, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useConsultations } from '@/hooks/useConsultations'

export default function ArchivePage() {
  const { consultations, loading, error, refetch } = useConsultations(false)
  const [testOnly, setTestOnly] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!testOnly) return consultations
    return consultations.filter((c) => (c.company_name || '').startsWith('[TEST]'))
  }, [consultations, testOnly])

  const handleRestore = async (id: string) => {
    setRestoringId(id)
    try {
      const { error: err } = await supabase.from('consultations').update({ is_visible: true }).eq('id', id)
      if (err) throw err
      toast.success('복구되었습니다. 상담 리스트에 다시 표시됩니다.')
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '복구 실패')
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (id: string) => {
    if (!confirm('이 상담과 연결된 견적 이력을 모두 영구 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return
    setDeletingId(id)
    try {
      const { error: estErr } = await supabase.from('estimates').delete().eq('consultation_id', id)
      if (estErr) throw estErr
      const { error: consultErr } = await supabase.from('consultations').delete().eq('id', id)
      if (consultErr) throw consultErr
      toast.success('영구 삭제되었습니다.')
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  const displayName = (c: { company_name: string; metadata: Record<string, unknown> | null }) => {
    const meta = c.metadata ?? {}
    const dn = typeof meta.display_name === 'string' && meta.display_name.trim() ? meta.display_name.trim() : c.company_name || '(업체명 없음)'
    return dn
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">← 홈</Link>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Archive className="h-6 w-6" />
              숨긴 상담 아카이브
            </h1>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={testOnly} onChange={(e) => setTestOnly(e.target.checked)} className="rounded border-border" />
            <span className="text-muted-foreground">[TEST] 데이터만 보기</span>
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-muted-foreground">
            {consultations.length === 0 ? '숨겨진 상담이 없습니다.' : '필터에 맞는 항목이 없습니다.'}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{displayName(c)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.contact || '—'} · {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '—'}
                    {c.is_test && <span className="ml-1 text-amber-600 dark:text-amber-400">[테스트]</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={restoringId !== null || deletingId !== null}
                    onClick={() => handleRestore(c.id)}
                  >
                    {restoringId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    복구
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1"
                    disabled={restoringId !== null || deletingId !== null}
                    onClick={() => handlePermanentDelete(c.id)}
                  >
                    {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    영구 삭제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          복구 시 상담 관리 리스트와 통계(이번 달 실적, 골든타임 등)에 다시 포함됩니다.
        </p>
      </div>
    </div>
  )
}
