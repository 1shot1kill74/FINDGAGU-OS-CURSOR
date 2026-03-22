/**
 * 레거시 경로: /share/gallery?t=... → /public/share 로 리다이렉트
 * 공개 갤러리는 PublicGalleryView(/public/share) 사용
 */
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function ShareGalleryPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  useEffect(() => {
    const token = searchParams.get('t')
    if (token?.trim()) {
      navigate(`/public/share?t=${encodeURIComponent(token.trim())}`, { replace: true })
      return
    }
    navigate('/public/share', { replace: true })
  }, [searchParams, navigate])
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">이동 중…</p>
    </div>
  )
}
