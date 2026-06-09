import {
  fetchShowroomImageAssets,
  fetchShowroomSiteOverrides,
  type ShowroomImageAsset,
  type ShowroomSiteOverride,
} from '@/lib/imageAssetService'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'

/** 내부 쇼룸(컨텐츠 공장): image_assets + site override 전체 */
export async function loadInternalShowroomDataset(): Promise<{
  assets: ShowroomImageAsset[]
  siteOverrides: ShowroomSiteOverride[]
}> {
  const [assets, siteOverrides] = await Promise.all([
    fetchShowroomImageAssets(),
    fetchShowroomSiteOverrides(),
  ])
  return { assets, siteOverrides }
}

/**
 * 공개 쇼룸: Supabase RPC `get_public_showroom_assets`
 * - 내부에서 편집한 consultation 이미지·외부 표시명·노출 순서가 반영됨
 * - 별도 "배포" 없이 DB/RPC 기준으로 자동 동기화
 */
export async function loadPublicShowroomDataset(): Promise<{
  assets: ShowroomImageAsset[]
  siteOverrides: ShowroomSiteOverride[]
}> {
  const assets = await fetchPublicShowroomAssets()
  return { assets, siteOverrides: [] }
}

export type ShowroomDatasetSource = 'internal' | 'public'

export async function loadShowroomDataset(source: ShowroomDatasetSource) {
  return source === 'internal' ? loadInternalShowroomDataset() : loadPublicShowroomDataset()
}
