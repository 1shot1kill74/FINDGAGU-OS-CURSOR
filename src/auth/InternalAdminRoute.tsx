import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { isInternalAdminEmail } from '@/lib/internalAdmin'
import { describeInternalRoute } from '@/lib/internalRouteLabel'

/** 로그인 + @findgagu.com(또는 allowlist) 내부 관리자만 통과 */
export default function InternalAdminRoute() {
  const location = useLocation()
  const { user, loading } = useAuth()
  const nextPath = `${location.pathname}${location.search}${location.hash}`
  const nextLabel = describeInternalRoute(location.pathname)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-500 shadow-sm">
          <p className="font-medium text-neutral-800">권한을 확인하는 중…</p>
          <p className="mt-2 leading-6">
            이동 대상 <span className="font-semibold text-neutral-800">{nextLabel}</span>
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />
  }

  if (!isInternalAdminEmail(user.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-600 shadow-sm">
          <p className="font-medium text-neutral-900">접근 권한이 없습니다</p>
          <p className="mt-2 leading-6">
            이 페이지는 파인드가구 내부 관리자(@findgagu.com)만 사용할 수 있습니다.
          </p>
          <a href="/dashboard" className="mt-4 inline-block text-sm font-medium text-slate-900 underline">
            대시보드로 돌아가기
          </a>
        </div>
      </div>
    )
  }

  return <Outlet />
}
