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
          <p className="text-sm leading-snug text-neutral-700">
            고객님의 업종·평수·운영 방식에 맞는 최적 레이아웃을 제안합니다.
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500">
            <ShieldCheck className="h-3 w-3 shrink-0 text-[#5f7058]" aria-hidden />
            현장 맞춤 1차 레이아웃 · 채팅 상담
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
