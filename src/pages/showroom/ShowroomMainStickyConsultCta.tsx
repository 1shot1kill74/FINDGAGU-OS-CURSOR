import { useEffect, useState } from 'react'
import { MessageCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'

const STICKY_REVEAL_SCROLL_Y = 320

type ShowroomMainStickyConsultCtaProps = {
  enabled: boolean
  concern?: string | null
}

export function ShowroomMainStickyConsultCta({
  enabled,
  concern = null,
}: ShowroomMainStickyConsultCtaProps) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!enabled) return

    const onScroll = () => {
      setRevealed(window.scrollY >= STICKY_REVEAL_SCROLL_Y)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-[#455240]/15 bg-white/95 px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] backdrop-blur-sm pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] transition-transform duration-300 ease-out',
        revealed ? 'translate-y-0' : 'translate-y-full pointer-events-none',
      )}
      role="region"
      aria-label="상담 문의"
      aria-hidden={!revealed}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-snug text-neutral-700">
            시공 사례를 보시다가 궁금한 점이 있으시면 채팅으로 편하게 문의하세요.
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <ShieldCheck className="h-3 w-3 shrink-0 text-[#5f7058]" aria-hidden />
            전화 영업 없음 · 1차 방향·레이아웃 제안
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            openShowroomConsultationChat({ surface: 'gallery_browse_header', concern })
          }}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 sm:w-auto sm:min-w-[180px]"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          비슷한 공간 상담 문의
        </button>
      </div>
    </div>
  )
}
