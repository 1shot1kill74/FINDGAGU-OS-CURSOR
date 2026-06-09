/**
 * 공개 쇼룸 — 고객 ABM / 상담 전용
 *
 * - 데이터: loadPublicShowroomDataset() → get_public_showroom_assets RPC
 * - 내부 쇼룸에서 편집한 자산이 RPC를 통해 자동 반영 (별도 배포 불필요)
 * - UI: PublicShowroomExperience에서 내부 쇼룸과 독립 운영
 */
import PublicShowroomExperience from '@/pages/PublicShowroomExperience'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'

export default function PublicShowroomPage() {
  usePublicShowroomChannelTalk()

  return <PublicShowroomExperience />
}
