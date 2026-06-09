import type { ShowroomImageAsset } from '@/lib/imageAssetService'

type LightboxImage = Pick<ShowroomImageAsset, 'thumbnail_url' | 'cloudinary_url'>

const prefetchedUrls = new Set<string>()

export function resolveShowroomLightboxThumbnailUrl(image: LightboxImage | null | undefined): string {
  return image?.thumbnail_url?.trim() || image?.cloudinary_url?.trim() || ''
}

export function resolveShowroomLightboxFullUrl(image: LightboxImage | null | undefined): string {
  return image?.cloudinary_url?.trim() || image?.thumbnail_url?.trim() || ''
}

export function prefetchShowroomImageUrl(url: string | null | undefined): void {
  const normalized = url?.trim()
  if (!normalized || prefetchedUrls.has(normalized)) return
  prefetchedUrls.add(normalized)

  const img = new Image()
  img.decoding = 'async'
  img.src = normalized
}

export function prefetchShowroomLightboxImage(
  image: LightboxImage | null | undefined,
  options?: { includeFull?: boolean },
): void {
  prefetchShowroomImageUrl(resolveShowroomLightboxThumbnailUrl(image))
  if (options?.includeFull === false) return

  const thumbnailUrl = resolveShowroomLightboxThumbnailUrl(image)
  const fullUrl = resolveShowroomLightboxFullUrl(image)
  if (fullUrl && fullUrl !== thumbnailUrl) {
    prefetchShowroomImageUrl(fullUrl)
  }
}

export function prefetchShowroomLightboxThumbnails(images: LightboxImage[]): void {
  images.forEach((image) => prefetchShowroomLightboxImage(image, { includeFull: false }))
}

export function prefetchShowroomLightboxNeighbors(
  images: LightboxImage[],
  centerIndex: number,
  radius = 2,
): void {
  if (images.length === 0) return

  prefetchShowroomLightboxImage(images[centerIndex], { includeFull: true })

  for (let offset = -radius; offset <= radius; offset += 1) {
    if (offset === 0) continue
    const index = (centerIndex + offset + images.length) % images.length
    prefetchShowroomLightboxImage(images[index], { includeFull: Math.abs(offset) <= 1 })
  }
}
