/**
 * 공개 쇼룸 — 고객 ABM / 상담 전용
 *
 * - 데이터: loadPublicShowroomDataset() → get_public_showroom_assets RPC
 * - 내부 쇼룸에서 편집한 자산이 RPC를 통해 자동 반영 (별도 배포 불필요)
 * - UI: PublicShowroomExperience에서 내부 쇼룸과 독립 운영
 */
import { useMemo } from 'react'
import PublicShowroomExperience from '@/pages/PublicShowroomExperience'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'
import { usePageHead } from '@/lib/usePageHead'
import {
  PUBLIC_SHOWROOM_HUB_DESCRIPTION,
  PUBLIC_SHOWROOM_HUB_PATH,
  PUBLIC_SHOWROOM_HUB_TITLE,
  buildHubFaqJsonLd,
  buildOrganizationJsonLd,
  buildPublicShowroomBasicMetas,
  buildWebSiteJsonLd,
  getPublicShowroomCanonicalUrl,
} from '@/lib/publicShowroomSeo'

export default function PublicShowroomPage() {
  usePublicShowroomChannelTalk()

  const metas = useMemo(
    () =>
      buildPublicShowroomBasicMetas({
        title: PUBLIC_SHOWROOM_HUB_TITLE,
        description: PUBLIC_SHOWROOM_HUB_DESCRIPTION,
        canonicalPath: PUBLIC_SHOWROOM_HUB_PATH,
      }),
    [],
  )
  const jsonLd = useMemo(
    () => [buildOrganizationJsonLd(), buildWebSiteJsonLd(), buildHubFaqJsonLd()],
    [],
  )

  usePageHead({
    title: PUBLIC_SHOWROOM_HUB_TITLE,
    metas,
    canonicalUrl: getPublicShowroomCanonicalUrl(PUBLIC_SHOWROOM_HUB_PATH),
    jsonLd,
  })

  return <PublicShowroomExperience />
}
