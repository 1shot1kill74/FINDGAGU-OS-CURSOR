import { Link } from 'react-router-dom'
import {
  MANAGED_STUDY_CAFE_FEATURED_ANSWER,
  MANAGED_STUDY_CAFE_GUIDE_PATH,
} from '@/lib/aeo/managedStudyCafeFurnitureGuide'

/**
 * 쇼룸 허브용 짧은 진입 — 긴 FAQ는 가이드 정본 페이지에만 둔다.
 */
export default function ShowroomAeoGuideTeaser() {
  return (
    <aside className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-sm font-semibold text-slate-900">관리형 스터디카페 가구 가이드</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-2">
        {MANAGED_STUDY_CAFE_FEATURED_ANSWER}
      </p>
      <Link
        to={MANAGED_STUDY_CAFE_GUIDE_PATH}
        className="mt-3 inline-flex text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
      >
        체크리스트·FAQ 전체 보기
      </Link>
    </aside>
  )
}
