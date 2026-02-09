/**
 * 상담 목록 조회 — is_visible 필터로 리스트/통계용 vs 아카이브용 분리
 * - visibleOnly: true → 메인 리스트·대시보드·통계(이번 달 실적, 골든타임 등)에 사용
 * - visibleOnly: false → 관리자 아카이브(숨겨진 데이터만)
 */
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface ConsultationRow {
  id: string
  company_name: string
  manager_name: string
  contact: string
  created_at: string | null
  expected_revenue: number | null
  status: string | null
  is_test: boolean
  is_visible: boolean
  metadata: Record<string, unknown> | null
  last_viewed_at: string | null
}

export function useConsultations(visibleOnly: boolean) {
  const [data, setData] = useState<ConsultationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('consultations')
        .select('id, company_name, manager_name, contact, created_at, expected_revenue, status, is_test, is_visible, metadata, last_viewed_at')
        .order('created_at', { ascending: false })
      if (visibleOnly) {
        query = query.eq('is_visible', true)
      } else {
        query = query.eq('is_visible', false)
      }
      const { data: rows, error: err } = await query
      if (err) throw err
      setData((rows ?? []) as ConsultationRow[])
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [visibleOnly])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { consultations: data, loading, error, refetch }
}
