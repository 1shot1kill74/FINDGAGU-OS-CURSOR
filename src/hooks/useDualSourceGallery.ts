/**
 * 견적서에서 품명(예: 스마트A) 선택 시
 * - 썸네일: Supabase Storage
 * - 클릭 시 고화질: Cloudinary 원본
 * 이원화 호출 훅 (초안)
 */
import { useState, useEffect, useCallback } from 'react'
import { getDataByProductTag, type ProductMatchImage } from '@/lib/productDataMatching'

export interface DualSourceImageItem {
  id: string
  thumbnailUrl: string
  highResUrl: string
  displayName: string | null
  projectTitle: string | null
}

function toDualItem(img: ProductMatchImage): DualSourceImageItem {
  return {
    id: img.id,
    thumbnailUrl: img.mobileUrl,
    highResUrl: img.marketingUrl,
    displayName: img.displayName,
    projectTitle: img.projectTitle,
  }
}

export interface UseDualSourceGalleryResult {
  images: DualSourceImageItem[]
  loading: boolean
  error: string | null
  selectedImage: DualSourceImageItem | null
  openLightbox: (item: DualSourceImageItem | null) => void
}

/**
 * 품명(태그)으로 시공 이미지 목록 조회.
 * 썸네일 = Supabase(mobileUrl), 클릭 시 고화질 = Cloudinary(marketingUrl).
 */
export function useDualSourceGallery(productTag: string | null): UseDualSourceGalleryResult {
  const [images, setImages] = useState<DualSourceImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<DualSourceImageItem | null>(null)

  useEffect(() => {
    if (!productTag?.trim()) {
      setImages([])
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getDataByProductTag(productTag.trim())
      .then((res) => {
        if (cancelled) return
        setImages(res.images.map(toDualItem))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '이미지 조회 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productTag])

  const openLightbox = useCallback((item: DualSourceImageItem | null) => {
    setSelectedImage(item)
  }, [])

  return {
    images,
    loading,
    error,
    selectedImage,
    openLightbox,
  }
}
