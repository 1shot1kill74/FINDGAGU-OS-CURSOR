import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Chrome, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'
import { describeInternalRoute } from '@/lib/internalRouteLabel'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const { user, loading, signInWithGoogle } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const nextPath = useMemo(() => searchParams.get('next')?.trim() || '/dashboard', [searchParams])
  const nextLabel = useMemo(() => describeInternalRoute(nextPath), [nextPath])

  useEffect(() => {
    const authError = searchParams.get('error_description') || searchParams.get('error')
    if (authError) {
      toast.error(`로그인에 실패했습니다: ${authError}`)
    }
  }, [searchParams])

  if (!loading && user) {
    return <Navigate to={nextPath} replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-xl shadow-black/5">
        <div className="mb-8 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            FINDGAGU OS Internal Access
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">직원 로그인</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              내부 운영 화면은 로그인 후에만 접근할 수 있습니다. 구글 계정으로 계속 진행하세요.
            </p>
            <p className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-6 text-neutral-500">
              로그인 후 이동 대상 <span className="font-semibold text-neutral-800">{nextLabel}</span>
              {' '}· <span className="font-mono text-[11px]">{nextPath}</span>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            type="button"
            className="h-11 w-full gap-2"
            disabled={submitting || loading}
            onClick={async () => {
              try {
                setSubmitting(true)
                await signInWithGoogle(nextPath)
              } catch (error) {
                console.error(error)
                toast.error('구글 로그인 시작에 실패했습니다.')
                setSubmitting(false)
              }
            }}
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
            {loading ? '로그인 상태 확인 중…' : submitting ? '구글 로그인으로 이동 중…' : 'Google로 로그인'}
          </Button>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            <div className="flex items-center gap-2 font-medium text-neutral-800">
              <LockKeyhole className="h-4 w-4" />
              안내
            </div>
            <p className="mt-2 leading-6">
              로그인 후 원래 열려고 했던 내부 페이지로 자동 이동합니다. 공개 공유 링크와 문의 페이지는 로그인 없이 계속 접근 가능합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
