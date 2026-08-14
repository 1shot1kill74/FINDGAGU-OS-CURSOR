import { Link } from 'react-router-dom'
import type { PublicShowroomHubCaseLink } from '@/lib/publicShowroomSeo'

export default function ShowroomHubCaseIndex({ cases }: { cases: PublicShowroomHubCaseLink[] }) {
  if (cases.length === 0) return null

  return (
    <nav className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-4" aria-labelledby="showroom-case-index">
      <h2 id="showroom-case-index" className="text-sm font-semibold text-slate-900">
        시공 사례
      </h2>
      <ol className="mt-3 space-y-2">
        {cases.map((item) => (
          <li key={item.siteName}>
            <Link
              to={item.path}
              className="text-sm leading-relaxed text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
