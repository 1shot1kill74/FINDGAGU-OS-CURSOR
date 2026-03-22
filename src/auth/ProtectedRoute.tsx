import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'

export default function ProtectedRoute() {
  const location = useLocation()
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-500 shadow-sm">
          로그인 상태를 확인하는 중…
        </div>
      </div>
    )
  }

  if (!user) {
    const nextPath = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />
  }

  return <Outlet />
}
