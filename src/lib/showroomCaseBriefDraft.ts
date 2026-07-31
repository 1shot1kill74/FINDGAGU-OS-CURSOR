import { supabase } from '@/lib/supabase'
import {
  getShowroomImagePreviewUrl,
  type ShowroomImageAsset,
} from '@/lib/imageAssetService'
import { formatShowroomAssetPickerLabel } from '@/lib/showroomCaseContentPackage'

export type ShowroomCaseBriefDraftStatus = 'idle' | 'draft' | 'approved'

export type ShowroomCaseBriefReviewState = {
  status: ShowroomCaseBriefDraftStatus
  confidence: 'high' | 'medium' | 'low' | null
  notes: string
  uncertainClaims: string[]
  generatedAt: string | null
}

export type ShowroomCaseBriefDraftResult = {
  problemDetail: string
  solutionDetail: string
  headlineHook: string
  evidencePoints: string[]
  confidence: 'high' | 'medium' | 'low'
  notes: string
  uncertainClaims: string[]
  imageCount: number
}

type ApiBriefDraftResponse = {
  ok: boolean
  message?: string
  problemDetail?: string
  solutionDetail?: string
  headlineHook?: string
  evidencePoints?: string[]
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
  uncertainClaims?: string[]
  imageCount?: number
}

function pickBriefDraftImages(images: ShowroomImageAsset[], max = 4): ShowroomImageAsset[] {
  const scored = [...images].sort((a, b) => {
    const roleRank = (asset: ShowroomImageAsset) =>
      asset.before_after_role === 'before' || asset.before_after_role === 'after' ? 0 : 1
    const mainRank = (asset: ShowroomImageAsset) => (asset.is_main ? 0 : 1)
    return roleRank(a) - roleRank(b) || mainRank(a) - mainRank(b)
  })

  const befores = scored.filter((asset) => asset.before_after_role === 'before')
  const afters = scored.filter((asset) => asset.before_after_role === 'after')
  const others = scored.filter(
    (asset) => asset.before_after_role !== 'before' && asset.before_after_role !== 'after',
  )

  const half = Math.max(1, Math.floor(max / 2))
  const picked: ShowroomImageAsset[] = []
  const pushUnique = (asset: ShowroomImageAsset | undefined) => {
    if (!asset?.id) return
    if (picked.some((item) => item.id === asset.id)) return
    picked.push(asset)
  }

  for (const asset of befores.slice(0, half)) pushUnique(asset)
  for (const asset of afters.slice(0, half)) pushUnique(asset)
  for (const asset of others) {
    if (picked.length >= max) break
    pushUnique(asset)
  }
  for (const asset of scored) {
    if (picked.length >= max) break
    pushUnique(asset)
  }

  return picked.slice(0, max)
}

export function createIdleBriefReviewState(): ShowroomCaseBriefReviewState {
  return {
    status: 'idle',
    confidence: null,
    notes: '',
    uncertainClaims: [],
    generatedAt: null,
  }
}

export async function requestShowroomCaseBriefDraft(params: {
  siteName: string
  displayName?: string
  industry?: string
  projectImages: ShowroomImageAsset[]
}): Promise<ShowroomCaseBriefDraftResult> {
  const images = pickBriefDraftImages(params.projectImages)
  const payloadImages = images
    .map((asset) => {
      const url = getShowroomImagePreviewUrl(asset)?.trim()
      if (!url) return null
      return {
        id: asset.id,
        role:
          asset.before_after_role === 'before' || asset.before_after_role === 'after'
            ? asset.before_after_role
            : null,
        url,
        summaryLine: formatShowroomAssetPickerLabel(asset),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (payloadImages.length < 1) {
    throw new Error('분석할 이미지 URL을 찾을 수 없습니다.')
  }

  const { data: auth } = await supabase.auth.getSession()
  const token = auth.session?.access_token
  if (!token) {
    throw new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.')
  }

  const res = await fetch('/api/showroom-case-brief-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      siteName: params.siteName,
      displayName: params.displayName || params.siteName,
      industry: params.industry || '',
      images: payloadImages,
    }),
  })

  const json = (await res.json()) as ApiBriefDraftResponse
  if (!res.ok || !json.ok || !json.problemDetail?.trim() || !json.solutionDetail?.trim()) {
    throw new Error(json.message || '브리프 초안 생성에 실패했습니다.')
  }

  return {
    problemDetail: json.problemDetail.trim(),
    solutionDetail: json.solutionDetail.trim(),
    headlineHook: (json.headlineHook || '').trim(),
    evidencePoints: Array.isArray(json.evidencePoints)
      ? json.evidencePoints.map((item) => String(item).trim()).filter(Boolean)
      : [],
    confidence: json.confidence === 'high' || json.confidence === 'low' ? json.confidence : 'medium',
    notes: (json.notes || '').trim(),
    uncertainClaims: Array.isArray(json.uncertainClaims)
      ? json.uncertainClaims.map((item) => String(item).trim()).filter(Boolean)
      : [],
    imageCount: typeof json.imageCount === 'number' ? json.imageCount : payloadImages.length,
  }
}
