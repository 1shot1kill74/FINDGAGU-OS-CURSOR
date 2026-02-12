/**
 * 이미지 내부 스코어링 서비스
 * - 1단계: 기술 점수 (파일 크기, 해상도, 확장자)
 * - 2단계: 활동 점수 (조회수, 공유 횟수, 대표 추천 is_main)
 * - 3단계: AI 품질 점수 (Gemini 비전, 선택 사용)
 * - 4단계: DB internal_score·ai_score 실시간 반영
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'

const GEMINI_API_KEY = (
  import.meta.env.VITE_GOOGLE_GEMINI_API_KEY ??
  import.meta.env.GOOGLE_GEMINI_API_KEY
) as string | undefined
const GEMINI_MODEL = 'gemini-2.0-flash'
const IMAGE_QUALITY_PROMPT = `이 이미지는 가구 시공 사례/인테리어 마케팅용 사진입니다. 화질, 구도, 조명, 전문성을 0.0~1.0 점수로만 평가하세요. 다른 설명 없이 소수점 포함 숫자 하나만 출력. 예: 0.85`

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

/**
 * 3단계 — AI 품질 점수 (0~1)
 * Gemini 비전으로 이미지 URL 분석. API 키 없거나 실패 시 null
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const mimeType = blob.type || 'image/jpeg'
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result?.split(',')[1]
        resolve(base64 ?? '')
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return data ? { data, mimeType } : null
  } catch {
    return null
  }
}

export async function getAIScoreForImage(imageUrl: string): Promise<number | null> {
  if (!GEMINI_API_KEY?.trim()) return null
  const image = await fetchImageAsBase64(imageUrl)
  if (!image?.data) return null
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { maxOutputTokens: 32 },
    })
    const result = await model.generateContent([
      IMAGE_QUALITY_PROMPT,
      { inlineData: { data: image.data, mimeType: image.mimeType } },
    ])
    const text = result.response.text?.()?.trim() ?? ''
    const num = parseFloat(text.replace(/[^\d.]/g, ''))
    if (Number.isFinite(num) && num >= 0 && num <= 1) return num
    return null
  } catch {
    return null
  }
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
 * aiLimit > 0 이면 ai_score가 비어 있는 순서대로 Gemini로 품질 점수 산출 후 반영
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

    if (aiLimit > 0 && aiApplied < aiLimit && thumbnailUrl && aiScore == null && GEMINI_API_KEY?.trim()) {
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
