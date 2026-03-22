/**
 * 이미지 내부 스코어링 서비스
 * - 1단계: 기술 점수 (파일 크기, 해상도, 확장자)
 * - 2단계: 활동 점수 (조회수, 공유 횟수, 대표 추천 is_main)
 * - 3단계: AI 품질 점수는 서버사이드 이전 전까지 비활성화
 * - 4단계: DB internal_score·ai_score 실시간 반영
 */
import { supabase } from '@/lib/supabase'

/** 스코어 계산에 필요한 image_assets 행 필드 (메타데이터는 JSON) */
export interface ImageAssetForScoring {
  id: string
  view_count: number
  share_count?: number
  is_main?: boolean
  metadata?: {
    file_size?: number
    original_name?: string
    width?: number
    height?: number
  } | null
}

const OPTIMAL_FILE_SIZE_MIN = 100 * 1024       // 100KB
const OPTIMAL_FILE_SIZE_MAX = 3 * 1024 * 1024  // 3MB
const MIN_RESOLUTION_GOOD = 1200
const MIN_RESOLUTION_OK = 800

const EXT_SCORE: Record<string, number> = {
  jpg: 1,
  jpeg: 1,
  png: 1,
  webp: 1,
  heic: 0.85,
}

/**
 * 1단계 — 기술 점수 (0~1)
 * 파일 크기, 해상도(있으면), 확장자 기준
 */
export function getTechnicalScore(asset: ImageAssetForScoring): number {
  const meta = asset.metadata ?? {}
  const fileSize = typeof meta.file_size === 'number' ? meta.file_size : 0
  const originalName = typeof meta.original_name === 'string' ? meta.original_name : ''
  const width = typeof meta.width === 'number' ? meta.width : 0
  const height = typeof meta.height === 'number' ? meta.height : 0

  let sizeScore = 0.5
  if (fileSize > 0) {
    if (fileSize >= OPTIMAL_FILE_SIZE_MIN && fileSize <= OPTIMAL_FILE_SIZE_MAX) sizeScore = 1
    else if (fileSize < 50 * 1024) sizeScore = 0.3
    else if (fileSize <= OPTIMAL_FILE_SIZE_MIN) sizeScore = 0.4 + (0.6 * fileSize) / OPTIMAL_FILE_SIZE_MIN
    else if (fileSize <= 10 * 1024 * 1024) sizeScore = 0.9 - (0.2 * (fileSize - OPTIMAL_FILE_SIZE_MAX)) / (10 * 1024 * 1024 - OPTIMAL_FILE_SIZE_MAX)
    else sizeScore = 0.6
  }

  const ext = (originalName.split('.').pop() ?? '').toLowerCase()
  const extScore = EXT_SCORE[ext] ?? 0.5

  let resolutionScore = 0.5
  if (width > 0 && height > 0) {
    const minSide = Math.min(width, height)
    if (minSide >= MIN_RESOLUTION_GOOD) resolutionScore = 1
    else if (minSide >= MIN_RESOLUTION_OK) resolutionScore = 0.7
    else resolutionScore = 0.3 + (0.4 * minSide) / MIN_RESOLUTION_OK
  }

  const hasResolution = width > 0 && height > 0
  const technical = hasResolution
    ? sizeScore * 0.35 + extScore * 0.25 + resolutionScore * 0.4
    : sizeScore * 0.5 + extScore * 0.5
  return Math.min(1, Math.max(0, technical))
}

/**
 * 2단계 — 활동 점수 (0~1)
 * 조회수, 공유 횟수, 대표 추천(is_main) 조합
 */
export function getActivityScore(asset: ImageAssetForScoring): number {
  const views = Math.max(0, Number(asset.view_count ?? 0))
  const shares = Math.max(0, Number(asset.share_count ?? 0))
  const isMain = Boolean(asset.is_main)

  const viewScore = views === 0 ? 0 : Math.min(0.5, Math.log10(views + 1) / 2.5)
  const shareScore = shares === 0 ? 0 : Math.min(0.3, Math.log10(shares + 1) / 2)
  const mainBonus = isMain ? 0.2 : 0

  return Math.min(1, viewScore + shareScore + mainBonus)
}

export async function getAIScoreForImage(imageUrl: string): Promise<number | null> {
  if (import.meta.env.DEV) {
    console.warn(`AI 이미지 스코어링은 클라이언트에서 비활성화되었습니다: ${imageUrl}`)
  }
  return null
}

/**
 * 기술 + 활동 + (선택) AI 점수를 합쳐 최종 내부 점수 (0~1)
 * AI 있음: 기술 25%, 활동 35%, AI 40%
 * AI 없음: 기술 40%, 활동 60%
 */
export function getInternalScore(
  asset: ImageAssetForScoring,
  aiScore?: number | null
): number {
  const technical = getTechnicalScore(asset)
  const activity = getActivityScore(asset)
  const score =
    aiScore != null && Number.isFinite(aiScore)
      ? technical * 0.25 + activity * 0.35 + aiScore * 0.4
      : technical * 0.4 + activity * 0.6
  return Math.min(1, Math.max(0, Math.round(score * 1000) / 1000))
}

/**
 * 단일 자산 internal_score 계산 후 DB 업데이트 (기존 ai_score 있으면 반영)
 */
export async function updateInternalScoreForAsset(assetId: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from('image_assets')
    .select('id, view_count, share_count, is_main, metadata, ai_score')
    .eq('id', assetId)
    .single()
  if (fetchError || !row) return
  const asset: ImageAssetForScoring = {
    id: row.id,
    view_count: Number(row.view_count ?? 0),
    share_count: Number((row as { share_count?: number }).share_count ?? 0),
    is_main: Boolean(row.is_main),
    metadata: (row.metadata as ImageAssetForScoring['metadata']) ?? undefined,
  }
  const ai = (row as { ai_score?: number | null }).ai_score
  const internal_score = getInternalScore(asset, ai)
  await supabase.from('image_assets').update({ internal_score }).eq('id', assetId)
}

export type UpdateInternalScoresOptions = {
  /** AI 품질 점수(Gemini)를 적용할 최대 건수. 0이면 미적용. 권장 5~10(할당량 고려) */
  aiLimit?: number
}

/**
 * 여러 자산 일괄 internal_score(·ai_score) 계산 후 DB 업데이트
 * aiLimit > 0 이더라도 현재는 클라이언트에서 AI 품질 점수를 계산하지 않는다.
 */
export async function updateInternalScoresBatch(
  limit = 200,
  options: UpdateInternalScoresOptions = {}
): Promise<{ updated: number; total: number; aiApplied: number }> {
  const aiLimit = Math.max(0, options.aiLimit ?? 0)
  const { data: rows, error: fetchError } = await supabase
    .from('image_assets')
    .select('id, view_count, share_count, is_main, metadata, ai_score, thumbnail_url')
    .limit(limit)
  if (fetchError || !rows?.length) return { updated: 0, total: 0, aiApplied: 0 }
  let updated = 0
  let aiApplied = 0
  for (const row of rows) {
    const asset: ImageAssetForScoring = {
      id: row.id,
      view_count: Number(row.view_count ?? 0),
      share_count: Number((row as { share_count?: number }).share_count ?? 0),
      is_main: Boolean((row as { is_main?: boolean }).is_main),
      metadata: (row.metadata as ImageAssetForScoring['metadata']) ?? undefined,
    }
    let aiScore: number | null = (row as { ai_score?: number | null }).ai_score ?? null
    const thumbnailUrl = (row as { thumbnail_url?: string | null }).thumbnail_url

    if (aiLimit > 0 && aiApplied < aiLimit && thumbnailUrl && aiScore == null) {
      const ai = await getAIScoreForImage(thumbnailUrl)
      if (ai != null) {
        aiScore = ai
        aiApplied++
        await supabase.from('image_assets').update({ ai_score: ai }).eq('id', row.id)
      }
    }

    const internal_score = getInternalScore(asset, aiScore)
    const { error: updateError } = await supabase.from('image_assets').update({ internal_score }).eq('id', row.id)
    if (!updateError) updated++
  }
  return { updated, total: rows.length, aiApplied }
}
