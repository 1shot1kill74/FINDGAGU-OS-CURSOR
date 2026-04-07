import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { describeInternalRoute } from '@/lib/internalRouteLabel'

export default function ProtectedRoute() {
  const location = useLocation()
  const { user, loading } = useAuth()
  const nextPath = `${location.pathname}${location.search}${location.hash}`
  const nextLabel = describeInternalRoute(location.pathname)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-500 shadow-sm">
          <p className="font-medium text-neutral-800">로그인 상태를 확인하는 중…</p>
          <p className="mt-2 leading-6">
            이동 대상 <span className="font-semibold text-neutral-800">{nextLabel}</span>
            {' '}· <span className="font-mono text-[11px]">{nextPath}</span>
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />
  }

  return <Outlet />
}
