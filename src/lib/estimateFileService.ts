/**
 * 견적서 파일 서비스 — AI 퀵커맨드 "예전 견적 참고해서 짜줘" 연동
 * consultation_estimate_files + estimate_pdf_url → Signed URL 반환
 */
import { supabase } from '@/lib/supabase'

const ESTIMATE_FILES_BUCKET = 'estimate-files'
const SIGNED_URL_EXPIRES = 3600

export interface EstimateFileForAi {
  storagePath: string
  fileName: string
  fileType: string
  signedUrl: string
}

/**
 * 상담 ID로 업로드된 견적서 파일들의 Signed URL 목록 조회
 * AI가 "종로학원 예전 견적 참고해서 짜줘" 시 이 URL들을 참조
 */
export async function getEstimateFileUrlsForConsultation(
  consultationId: string
): Promise<EstimateFileForAi[]> {
  const { data: rows, error } = await (
    supabase as { from: (t: string) => ReturnType<typeof supabase.from> }
  ).from('consultation_estimate_files')
    .select('storage_path, file_name, file_type')
    .eq('consultation_id', consultationId)
    .order('created_at', { ascending: false })

  if (error || !rows?.length) return []

  const result: EstimateFileForAi[] = []
  const list = rows as unknown as { storage_path: string; file_name: string; file_type: string }[]
  for (const r of list) {
    const { data } = await supabase.storage
      .from(ESTIMATE_FILES_BUCKET)
      .createSignedUrl(r.storage_path, SIGNED_URL_EXPIRES)
    if (data?.signedUrl) {
      result.push({
        storagePath: r.storage_path,
        fileName: r.file_name,
        fileType: r.file_type,
        signedUrl: data.signedUrl,
      })
    }
  }
  return result
}

/**
 * project_name으로 상담 조회 후 견적서 파일 Signed URL 목록 반환
 * 퀵커맨드 "종로학원 예전 견적 참고" → project_name 매칭
 */
export async function getEstimateFileUrlsByProjectName(
  projectName: string
): Promise<{ consultationId: string; projectName: string; files: EstimateFileForAi[] } | null> {
  const { data: cons, error } = await (
    supabase as { from: (t: string) => ReturnType<typeof supabase.from> }
  ).from('consultations')
    .select('id, project_name')
    .ilike('project_name', `%${projectName.trim()}%`)
    .limit(1)
    .maybeSingle()

  if (error || !cons) return null

  const c = cons as unknown as { id: string; project_name: string | null }
  const files = await getEstimateFileUrlsForConsultation(c.id)
  return {
    consultationId: c.id,
    projectName: c.project_name ?? '',
    files,
  }
}
