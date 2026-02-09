/**
 * /share?ids=... → /public/share?ids=... 리다이렉트
 * 영업용 공유 링크 단축 URL 지원
 */
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function ShareRedirect() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  useEffect(() => {
    const ids = searchParams.get('ids')
    if (ids?.trim()) {
      navigate(`/public/share?ids=${encodeURIComponent(ids.trim())}`, { replace: true })
    } else {
      navigate('/public/share', { replace: true })
    }
  }, [searchParams, navigate])
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">공유 페이지로 이동 중…</p>
    </div>
  )
}
