import { useEffect, useState } from 'react'
import { MessageCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openShowroomConsultationChat, resolveShowroomCaseConsultationCopy } from '@/pages/showroom/showroomStoryCta'

const STICKY_REVEAL_SCROLL_Y = 320

type ShowroomStoryStickyMiniCtaProps = {
  enabled: boolean
  concern: string | null
  siteDisplayName?: string | null
  siteName?: string | null
}

export function ShowroomStoryStickyMiniCta({
  enabled,
  concern,
  siteDisplayName,
  siteName,
}: ShowroomStoryStickyMiniCtaProps) {
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

  const copy = resolveShowroomCaseConsultationCopy({ concern, siteDisplayName })

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
          <p className="text-sm leading-snug text-neutral-700">{copy.helperLine}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500">
            <ShieldCheck className="h-3 w-3 shrink-0 text-[#5f7058]" aria-hidden />
            {copy.trustLine}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            openShowroomConsultationChat({ surface: 'case_sticky', concern, siteName: siteName ?? siteDisplayName ?? null })
          }}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5f7058] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4a5744] sm:w-auto sm:min-w-[180px]"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          {copy.stickyShortLabel}
        </button>
      </div>
    </div>
  )
}
