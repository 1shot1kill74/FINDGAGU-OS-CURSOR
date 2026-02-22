/**
 * Admin용: 이미지 자산 시스템 완전 초기화
 *
 * 1. image_assets, project_images 테이블 전체 행 삭제
 * 2. consultation_messages 이미지 참조(file_url, file_name, metadata) null 초기화
 *
 * Cloudinary assets/projects 폴더는 사용자가 콘솔에서 직접 비움.
 */
import { supabase } from '@/lib/supabase'

const SUCCESS_LOG = '성공적으로 DB 이미지가 초기화되었습니다.'

function isImageMessage(row: { file_url?: string | null; metadata?: unknown }): boolean {
  const url = row.file_url?.trim()
  const meta = row.metadata as { public_id?: string } | null | undefined
  return (url?.startsWith('http') ?? false) || !!(meta?.public_id)
}

/**
 * 이미지 자산 시스템 완전 초기화
 * - image_assets, project_images 전체 삭제
 * - consultation_messages 이미지 필드만 null로 초기화 (텍스트 히스토리 유지)
 */
export async function resetImageAssetSystem(): Promise<{
  imageAssetsDeleted: number
  projectImagesDeleted: number
  consultationMessagesReset: number
  error?: string
}> {
  let imageAssetsDeleted = 0
  let projectImagesDeleted = 0
  let consultationMessagesReset = 0

  try {
    // 1. image_assets 전체 삭제
    const { data: assetRows, error: assetSelectErr } = await supabase
      .from('image_assets')
      .select('id')
    if (assetSelectErr) {
      console.error('image_assets 조회 실패:', assetSelectErr)
      return { imageAssetsDeleted: 0, projectImagesDeleted: 0, consultationMessagesReset: 0, error: assetSelectErr.message }
    }
    const assetIds = (assetRows ?? []).map((r) => r.id)
    const BATCH = 100
    for (let i = 0; i < assetIds.length; i += BATCH) {
      const chunk = assetIds.slice(i, i + BATCH)
      const { error: assetDelErr } = await supabase.from('image_assets').delete().in('id', chunk)
      if (assetDelErr) {
        console.error('image_assets 삭제 실패:', assetDelErr)
        return { imageAssetsDeleted, projectImagesDeleted: 0, consultationMessagesReset: 0, error: assetDelErr.message }
      }
      imageAssetsDeleted += chunk.length
    }

    // 2. project_images 전체 삭제
    const { data: projRows, error: projSelectErr } = await supabase
      .from('project_images')
      .select('id')
    if (projSelectErr) {
      console.error('project_images 조회 실패:', projSelectErr)
      return { imageAssetsDeleted, projectImagesDeleted: 0, consultationMessagesReset: 0, error: projSelectErr.message }
    }
    const projIds = (projRows ?? []).map((r) => r.id)
    for (let i = 0; i < projIds.length; i += BATCH) {
      const chunk = projIds.slice(i, i + BATCH)
      const { error: projDelErr } = await supabase.from('project_images').delete().in('id', chunk)
      if (projDelErr) {
        console.error('project_images 삭제 실패:', projDelErr)
        return { imageAssetsDeleted, projectImagesDeleted, consultationMessagesReset: 0, error: projDelErr.message }
      }
      projectImagesDeleted += chunk.length
    }

    // 3. consultation_messages 이미지 참조 null 초기화
    const { data: msgRows, error: msgSelectErr } = await supabase
      .from('consultation_messages')
      .select('id, file_url, metadata')
    if (msgSelectErr) {
      console.error('consultation_messages 조회 실패:', msgSelectErr)
      return { imageAssetsDeleted, projectImagesDeleted, consultationMessagesReset: 0, error: msgSelectErr.message }
    }
    const imageMsgIds = (msgRows ?? []).filter(isImageMessage).map((r) => r.id)
    for (const id of imageMsgIds) {
      const { error: msgUpdErr } = await supabase
        .from('consultation_messages')
        .update({ file_url: null, file_name: null, metadata: null })
        .eq('id', id)
      if (msgUpdErr) {
        console.error(`consultation_messages id=${id} 업데이트 실패:`, msgUpdErr)
        return { imageAssetsDeleted, projectImagesDeleted, consultationMessagesReset, error: msgUpdErr.message }
      }
      consultationMessagesReset++
    }

    console.log(SUCCESS_LOG)
    return { imageAssetsDeleted, projectImagesDeleted, consultationMessagesReset }
  } catch (err) {
    const msg = (err as Error).message
    console.error('이미지 자산 시스템 초기화 실패:', err)
    return {
      imageAssetsDeleted,
      projectImagesDeleted,
      consultationMessagesReset,
      error: msg,
    }
  }
}
