import ShowroomPage from '@/pages/ShowroomPage'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'

export default function PublicShowroomPage() {
  usePublicShowroomChannelTalk()

  return <ShowroomPage mode="public" />
}
