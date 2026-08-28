import { Link } from 'react-router-dom'
import { SHOWROOM_GUIDES } from '@/lib/aeo/showroomGuides'

/**
 * 쇼룸 허브용 짧은 진입 — 긴 FAQ는 가이드 정본 페이지에만 둔다.
 */
export default function ShowroomAeoGuideTeaser() {
  return (
    <aside className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-sm font-semibold text-slate-900">공간별 가구 가이드</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        관리형 스터디카페·관리형 독서실·학원 자습실·아파트 커뮤니티 체크리스트와 FAQ입니다.
      </p>
      <ul className="mt-3 space-y-2">
        {SHOWROOM_GUIDES.map((guide) => (
          <li key={guide.slug}>
            <Link
              to={guide.path}
              className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              {guide.teaserLabel}
            </Link>
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
              {guide.featuredAnswer}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  )
}
