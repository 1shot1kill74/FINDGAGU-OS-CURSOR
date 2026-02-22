/**
 * Admin용: 상담 내역(consultation_messages) 테이블의 이미지 관련 필드만 null로 초기화
 *
 * 대상 필드:
 * - file_url: 이미지 URL (Cloudinary 또는 Storage 경로)
 * - file_name: 파일명
 * - metadata: JSON (public_id, cloud_name, image_asset_id 등)
 *
 * 대상 행: 이미지 데이터가 있는 행만 (file_url이 http로 시작하거나 metadata.public_id 존재)
 * 텍스트 상담 히스토리는 건드리지 않음.
 */
import { supabase } from '@/lib/supabase'

const SUCCESS_LOG = '성공적으로 DB 이미지가 초기화되었습니다.'

function isImageMessage(row: { file_url?: string | null; metadata?: unknown }): boolean {
  const url = row.file_url?.trim()
  const meta = row.metadata as { public_id?: string } | null | undefined
  return (url?.startsWith('http') ?? false) || !!(meta?.public_id)
}

/**
 * consultation_messages 테이블에서 이미지 관련 필드(file_url, file_name, metadata)만 null로 초기화.
 * 이미지가 있는 행만 대상으로 하며, 텍스트/시스템 메시지는 유지.
 */
export async function resetConsultationImageData(): Promise<{ updated: number; error?: string }> {
  const { data: rows, error: selectError } = await supabase
    .from('consultation_messages')
    .select('id, file_url, metadata')

  if (selectError) {
    console.error('consultation_messages 조회 실패:', selectError)
    return { updated: 0, error: selectError.message }
  }

  const imageRows = (rows ?? []).filter(isImageMessage)
  if (imageRows.length === 0) {
    console.log(SUCCESS_LOG, '(초기화할 이미지 데이터 없음)')
    return { updated: 0 }
  }

  let updated = 0
  for (const row of imageRows) {
    const { error: updateError } = await supabase
      .from('consultation_messages')
      .update({ file_url: null, file_name: null, metadata: null })
      .eq('id', row.id)

    if (updateError) {
      console.error(`consultation_messages id=${row.id} 업데이트 실패:`, updateError)
      return { updated, error: updateError.message }
    }
    updated++
  }

  console.log(SUCCESS_LOG)
  return { updated }
}
