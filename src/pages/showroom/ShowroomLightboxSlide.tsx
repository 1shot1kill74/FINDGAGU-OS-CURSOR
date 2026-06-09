import { useEffect, useState } from 'react'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { cn } from '@/lib/utils'
import {
  resolveShowroomLightboxFullUrl,
  resolveShowroomLightboxThumbnailUrl,
} from '@/pages/showroom/showroomLightboxImages'

type ShowroomLightboxSlideProps = {
  image: Pick<ShowroomImageAsset, 'id' | 'thumbnail_url' | 'cloudinary_url'> | null | undefined
  className?: string
}

export function ShowroomLightboxSlide({ image, className }: ShowroomLightboxSlideProps) {
  const thumbnailUrl = resolveShowroomLightboxThumbnailUrl(image)
  const fullUrl = resolveShowroomLightboxFullUrl(image)
  const shouldUpgrade = Boolean(thumbnailUrl && fullUrl && fullUrl !== thumbnailUrl)
  const [displayUrl, setDisplayUrl] = useState(thumbnailUrl)
  const [isSharp, setIsSharp] = useState(!shouldUpgrade)

  useEffect(() => {
    setDisplayUrl(thumbnailUrl)
    if (!shouldUpgrade) {
      setIsSharp(true)
      return
    }

    setIsSharp(false)
    let cancelled = false
    const loader = new Image()
    loader.decoding = 'async'
    loader.onload = () => {
      if (cancelled) return
      setDisplayUrl(fullUrl)
      setIsSharp(true)
    }
    loader.onerror = () => {
      if (cancelled) return
      setIsSharp(true)
    }
    loader.src = fullUrl

    return () => {
      cancelled = true
    }
  }, [fullUrl, shouldUpgrade, thumbnailUrl, image?.id])

  if (!thumbnailUrl) return null

  return (
    <img
      src={displayUrl}
      alt=""
      decoding="async"
      fetchPriority="high"
      draggable={false}
      className={cn(
        'max-w-full max-h-[70vh] object-contain rounded-lg block transition-[filter,opacity] duration-300',
        !isSharp && shouldUpgrade && 'blur-[2px] brightness-95',
        className,
      )}
    />
  )
}
