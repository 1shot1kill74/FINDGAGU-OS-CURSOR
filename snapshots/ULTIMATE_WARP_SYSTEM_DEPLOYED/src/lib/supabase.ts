import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase URL/Key가 없습니다. .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정하세요.'
    )
  }
  return { url, key }
}

let _client: SupabaseClient<Database> | null = null

/**
 * 브라우저용 Supabase 클라이언트 (Auth, DB, Storage).
 * BLUEPRINT: RBAC는 RLS로 제어. 권한별로 admin / sales / technician 분리.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!_client) {
    const { url, key } = getSupabaseConfig()
    _client = createClient<Database>(url, key)
  }
  return _client
}

/** 동일 클라이언트 단일 인스턴스. 사용처에서는 getSupabase() 또는 supabase 셋 중 하나로 통일 권장. */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return getSupabase()[prop as keyof SupabaseClient<Database>]
  },
})
