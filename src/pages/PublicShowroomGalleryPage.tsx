/**
 * 공개 쇼룸 — 시공사례 사진 더보기 (탐색 전용)
 */
import { useMemo } from 'react'
import PublicShowroomExperience from '@/pages/PublicShowroomExperience'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'
import { usePageHead } from '@/lib/usePageHead'
import {
  PUBLIC_SHOWROOM_GALLERY_DESCRIPTION,
  PUBLIC_SHOWROOM_GALLERY_PATH,
  PUBLIC_SHOWROOM_GALLERY_TITLE,
  buildPublicShowroomBasicMetas,
  getPublicShowroomCanonicalUrl,
} from '@/lib/publicShowroomSeo'

export default function PublicShowroomGalleryPage() {
  usePublicShowroomChannelTalk()

  const metas = useMemo(
    () =>
      buildPublicShowroomBasicMetas({
        title: PUBLIC_SHOWROOM_GALLERY_TITLE,
        description: PUBLIC_SHOWROOM_GALLERY_DESCRIPTION,
        canonicalPath: PUBLIC_SHOWROOM_GALLERY_PATH,
      }),
    [],
  )

  usePageHead({
    title: PUBLIC_SHOWROOM_GALLERY_TITLE,
    metas,
    canonicalUrl: getPublicShowroomCanonicalUrl(PUBLIC_SHOWROOM_GALLERY_PATH),
  })

  return <PublicShowroomExperience surface="gallery" />
}
