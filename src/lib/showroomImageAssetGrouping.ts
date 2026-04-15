/**
 * 비포/애프터 그룹핑 — getShowroomAssetGroupKey(imageAssetService)와 동일 규칙.
 */
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { getShowroomAssetGroupKey } from '@/lib/imageAssetService'

export function groupBeforeAfterAssets(assets: ShowroomImageAsset[]): Map<string, ShowroomImageAsset[]> {
  const ba = assets.filter((a) => a.before_after_role === 'before' || a.before_after_role === 'after')
  const m = new Map<string, ShowroomImageAsset[]>()
  for (const a of ba) {
    const k = getShowroomAssetGroupKey(a)
    const list = m.get(k) ?? []
    list.push(a)
    m.set(k, list)
  }
  return m
}
