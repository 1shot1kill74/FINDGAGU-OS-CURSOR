import { supabase } from '@/lib/supabase'
import { getShowroomImagePreviewUrl } from '@/lib/imageAssetShowroom'
import type { AdInboxAsset, AdInboxBatch } from '@/lib/adInboxStudio'

export type AdInboxPairRecommendation = {
  beforeId: string
  afterId: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
  engine: 'ai' | 'heuristic'
}

function keywordRole(asset: AdInboxAsset): 'before' | 'after' | null {
  const blob = `${asset.site_name ?? ''} ${asset.original_name ?? ''}`.toLowerCase()
  if (/before|비포|시공전|공사전|철거전/.test(blob)) return 'before'
  if (/after|애프터|시공후|완료|세팅/.test(blob)) return 'after'
  return null
}

/** API 없이 바로 쓰는 규칙 기반 추천 */
export function recommendAdInboxPairHeuristic(batch: AdInboxBatch): AdInboxPairRecommendation | null {
  const assets = batch.assets
  if (assets.length < 2) return null

  const taggedBefore = assets.filter((a) => a.before_after_role === 'before')
  const taggedAfter = assets.filter((a) => a.before_after_role === 'after')

  if (taggedBefore.length === 1 && taggedAfter.length === 1 && taggedBefore[0].id !== taggedAfter[0].id) {
    return {
      beforeId: taggedBefore[0].id,
      afterId: taggedAfter[0].id,
      confidence: 'high',
      reason: '이미 Before/After 태그가 하나씩 있어 그대로 추천합니다.',
      engine: 'heuristic',
    }
  }

  const sorted = [...assets].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta - tb
  })

  const before =
    taggedBefore[0] ??
    assets.find((a) => keywordRole(a) === 'before') ??
    sorted[0]

  let after: AdInboxAsset | undefined =
    taggedAfter[0] ?? assets.find((a) => keywordRole(a) === 'after' && a.id !== before?.id)

  if (!after && sorted.length >= 2) {
    // 업로드가 나중에 온 쪽을 After로 가정
    const latest = sorted[sorted.length - 1]
    after = latest.id !== before?.id ? latest : sorted[sorted.length - 2]
  }

  if (!before || !after || before.id === after.id) return null

  return {
    beforeId: before.id,
    afterId: after.id,
    confidence: taggedBefore.length || taggedAfter.length ? 'medium' : 'low',
    reason:
      '규칙 기반: 태그·파일명 힌트가 있으면 활용하고, 없으면 같은 배치에서 먼저 올린 컷≈Before / 나중 컷≈After로 제안합니다. 눈으로 확인 후 적용하세요.',
    engine: 'heuristic',
  }
}

type ApiRecommendResponse = {
  ok: boolean
  beforeId?: string
  afterId?: string
  confidence?: 'high' | 'medium' | 'low'
  reason?: string
  message?: string
}

/** AI 추천 시도 → 실패 시 휴리스틱 */
export async function recommendAdInboxPair(batch: AdInboxBatch): Promise<AdInboxPairRecommendation> {
  const fallback = recommendAdInboxPairHeuristic(batch)
  if (!fallback) {
    throw new Error('이 배치에 사진이 2장 미만이라 추천할 수 없습니다.')
  }

  const candidates = batch.assets.slice(0, 8).map((asset) => ({
    id: asset.id,
    role: asset.before_after_role ?? null,
    url: getShowroomImagePreviewUrl(asset) || asset.cloudinary_url,
  }))

  if (candidates.some((c) => !c.url)) {
    return fallback
  }

  try {
    const { data: auth } = await supabase.auth.getSession()
    const token = auth.session?.access_token
    const res = await fetch('/api/ad-inbox-pair-recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        batchLabel: batch.label,
        candidates,
      }),
    })

    const json = (await res.json()) as ApiRecommendResponse
    if (!res.ok || !json.ok || !json.beforeId || !json.afterId) {
      return {
        ...fallback,
        reason: `${fallback.reason} (AI 미사용: ${json.message || res.status})`,
      }
    }

    const ids = new Set(batch.assets.map((a) => a.id))
    if (!ids.has(json.beforeId) || !ids.has(json.afterId) || json.beforeId === json.afterId) {
      return fallback
    }

    return {
      beforeId: json.beforeId,
      afterId: json.afterId,
      confidence: json.confidence ?? 'medium',
      reason: json.reason?.trim() || '비전 모델이 Before/After 페어를 제안했습니다.',
      engine: 'ai',
    }
  } catch {
    return fallback
  }
}

export function resolveAssetsFromRecommendation(
  batch: AdInboxBatch,
  rec: AdInboxPairRecommendation,
): { before: AdInboxAsset; after: AdInboxAsset } | null {
  const before = batch.assets.find((a) => a.id === rec.beforeId)
  const after = batch.assets.find((a) => a.id === rec.afterId)
  if (!before || !after) return null
  return { before, after }
}
