/**
 * 내부 쇼룸 — 컨텐츠 공장 / 운영 전용
 *
 * - image_assets, site override, 우선순위, 쇼츠·사례 편집의 기준 화면
 * - 공개 쇼룸(/public/showroom)과 UI 분리 중 (Phase 2에서 ShowroomPage에서 public 분기 제거 예정)
 */
import ShowroomPage from '@/pages/ShowroomPage'

export default function InternalShowroomPage() {
  return <ShowroomPage mode="internal" />
}
