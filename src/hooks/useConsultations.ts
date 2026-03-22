/**
 * 상담 목록 조회 — is_visible 필터로 리스트/통계용 vs 아카이브용 분리
 * - visibleOnly: true → 메인 리스트·대시보드·통계(이번 달 실적, 골든타임 등)에 사용
 * - visibleOnly: false → 관리자 아카이브(숨겨진 데이터만)
 *
 * 직관적 식별자: DB project_name(구글 시트 A열) → company_name으로 매핑하여 0.5초 만에 카드 매칭.
 *
 * Realtime: 구글 시트 onEdit / syncAllDataBatch → consultations INSERT·UPDATE 시
 * 새로고침 없이 상담 카드가 갱신되도록 postgres_changes 구독.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface ConsultationRow {
  id: string
  company_name: string
  manager_name: string
  contact: string
  created_at: string | null
  start_date: string | null
  update_date: string | null
  expected_revenue: number | null
  status: string | null
  is_test: boolean
  is_visible: boolean
  metadata: Record<string, unknown> | null
  last_viewed_at: string | null
}

/** DB row → ConsultationRow. project_name(시트 식별자) → company_name으로 매핑하여 UI·아카이브 호환 */
function mapDbRowToConsultationRow(row: Record<string, unknown>): ConsultationRow {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {}
  return {
    id: String(row.id ?? ''),
    company_name:
      (typeof row.project_name === 'string' && row.project_name.trim() ? row.project_name.trim() : null) ??
      (typeof row.company_name === 'string' ? row.company_name : '') ??
      '',
    manager_name:
      (typeof row.manager_name === 'string' ? row.manager_name : null) ??
      (typeof meta.manager_name === 'string' ? meta.manager_name : '') ??
      '',
    contact:
      (typeof row.customer_phone === 'string' ? row.customer_phone : null) ??
      (typeof row.contact === 'string' ? row.contact : '') ??
      '',
    created_at: row.created_at != null ? String(row.created_at) : null,
    start_date: row.start_date != null ? String(row.start_date) : null,
    update_date: row.update_date != null ? String(row.update_date) : null,
    expected_revenue:
      typeof row.estimate_amount === 'number'
        ? row.estimate_amount
        : typeof row.expected_revenue === 'number'
          ? row.expected_revenue
          : null,
    status: typeof row.status === 'string' ? row.status : null,
    is_test: Boolean(row.is_test),
    is_visible: row.is_visible !== false,
    metadata: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null,
    last_viewed_at: row.last_viewed_at != null ? String(row.last_viewed_at) : null,
  }
}

export function useConsultations(visibleOnly: boolean) {
  const [data, setData] = useState<ConsultationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('consultations')
        .select('*')
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (visibleOnly) {
        query = query.or('is_visible.eq.true,is_visible.is.null')
      } else {
        query = query.eq('is_visible', false)
      }
      const { data: rows, error: err } = await query
      if (err) throw err
      const raw = (rows ?? []) as Array<Record<string, unknown>>
      const mapped = raw.map((r) => mapDbRowToConsultationRow(r))
      setData(mapped)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [visibleOnly])

  refetchRef.current = refetch

  useEffect(() => {
    refetch()
  }, [refetch])

  // Realtime: 구글 시트 → RPC upsert 시 INSERT/UPDATE 발생 → 목록 자동 갱신 (데이터 일원화)
  useEffect(() => {
    const channelName = `consultations-realtime-${visibleOnly ? 'visible' : 'archive'}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'consultations' },
        (payload) => {
          console.log('[Realtime] INSERT event received', payload)
          refetchRef.current()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'consultations' },
        (payload) => {
          console.log('[Realtime] UPDATE event received', payload)
          refetchRef.current()
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] ✅ 구독 성공: ${channelName}`)
        } else if (status === 'TIMED_OUT') {
          console.warn(`[Realtime] ⏱ 구독 타임아웃: ${channelName}`, err)
        } else if (status === 'CLOSED') {
          console.warn(`[Realtime] 🔌 채널 닫힘: ${channelName}`, err)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[Realtime] ❌ 채널 오류: ${channelName}`, err)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [visibleOnly])

  return { consultations: data, loading, error, refetch }
}
