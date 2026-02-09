/**
 * 상담 히스토리 자동 시스템 로그(Activity Log) — 견적서 발행/승인, 파일 업로드, 상담 상태 변경
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const SYSTEM_EVENT_LABELS: Record<SystemEventType, string> = {
  estimate_issued: '견적서 발행',
  estimate_approved: '견적서 승인',
  file_upload: '파일 업로드',
  status_change: '상담 상태 변경',
}

export type SystemEventType = 'estimate_issued' | 'estimate_approved' | 'file_upload' | 'status_change'

export interface SystemLogMetadata {
  type: SystemEventType
  estimate_id?: string
  message_id?: string
  file_url?: string
  file_name?: string
  from_stage?: string
  to_stage?: string
  version?: number
}

function hasJongseong(c: string): boolean {
  const code = c.charCodeAt(0)
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
}
function formatSystemContent(eventType: SystemEventType, actorName: string, detail: string): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const label = SYSTEM_EVENT_LABELS[eventType]
  const particle = actorName.length > 0 && hasJongseong(actorName[actorName.length - 1]) ? '이' : '가'
  return `📅 ${dateStr} - [${label}] ${actorName}${particle} ${detail}`
}

export async function insertSystemLog(
  supabase: SupabaseClient,
  params: {
    consultation_id: string
    event_type: SystemEventType
    actor_name: string
    detail: string
    metadata?: SystemLogMetadata
  }
): Promise<{ error: Error | null }> {
  const content = formatSystemContent(params.event_type, params.actor_name, params.detail)
  const { error } = await supabase.from('consultation_messages').insert({
    consultation_id: params.consultation_id,
    sender_id: 'system',
    content,
    message_type: 'SYSTEM',
    metadata: { type: params.event_type, ...params.metadata },
  })
  return { error: error ?? null }
}
