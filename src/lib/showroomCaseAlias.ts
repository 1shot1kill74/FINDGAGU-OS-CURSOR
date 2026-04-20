import type { ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import { broadenPublicDisplayName } from '@/lib/showroomPublicDisplayName'

function pushAlias(target: Set<string>, value: string | null | undefined): void {
  const normalized = (value ?? '').trim()
  if (!normalized) return
  target.add(normalized)
}

export function collectShowroomAliasNamesFromImageAsset(asset: Pick<
  ShowroomImageAsset,
  | 'raw_site_name'
  | 'site_name'
  | 'canonical_site_name'
  | 'space_display_name'
  | 'external_display_name'
  | 'broad_external_display_name'
>): string[] {
  const values = new Set<string>()
  pushAlias(values, asset.raw_site_name)
  pushAlias(values, asset.site_name)
  pushAlias(values, asset.canonical_site_name)
  pushAlias(values, asset.space_display_name)
  pushAlias(values, asset.external_display_name)
  pushAlias(values, asset.broad_external_display_name)
  pushAlias(values, broadenPublicDisplayName(asset.raw_site_name ?? null))
  pushAlias(values, broadenPublicDisplayName(asset.site_name ?? null))
  pushAlias(values, broadenPublicDisplayName(asset.space_display_name ?? null))
  pushAlias(values, broadenPublicDisplayName(asset.external_display_name ?? null))
  return Array.from(values)
}

export function collectShowroomAliasNamesFromImages(images: Array<Pick<
  ShowroomImageAsset,
  | 'raw_site_name'
  | 'site_name'
  | 'canonical_site_name'
  | 'space_display_name'
  | 'external_display_name'
  | 'broad_external_display_name'
>>): string[] {
  const values = new Set<string>()
  images.forEach((image) => {
    collectShowroomAliasNamesFromImageAsset(image).forEach((value) => values.add(value))
  })
  return Array.from(values)
}
