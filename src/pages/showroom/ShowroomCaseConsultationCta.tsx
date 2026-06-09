import { MessageCircle, ShieldCheck } from 'lucide-react'
import { openShowroomConsultationChat, resolveShowroomCaseConsultationCopy } from '@/pages/showroom/showroomStoryCta'
import type { ShowroomAbmConsultationSurface } from '@/lib/showroomAbmTracking'

type ShowroomCaseConsultationCtaProps = {
  concern: string | null
  siteDisplayName?: string | null
  siteName?: string | null
  surface: Extract<ShowroomAbmConsultationSurface, 'case_inline' | 'case_sticky'>
}

export function ShowroomCaseConsultationCta({
  concern,
  siteDisplayName,
  siteName,
  surface,
}: ShowroomCaseConsultationCtaProps) {
  const copy = resolveShowroomCaseConsultationCopy({ concern, siteDisplayName })

  return (
    <section
      className="rounded-2xl border border-[#455240]/20 bg-gradient-to-b from-[#f6f8f4] to-white p-5 shadow-sm"
      aria-label="상담 안내"
    >
      <h3 className="text-base font-semibold leading-snug text-neutral-900">{copy.inlineTitle}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{copy.inlineBody}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-neutral-500">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#5f7058]" aria-hidden />
        {copy.trustLine}
      </p>
      <button
        type="button"
        onClick={() => {
          openShowroomConsultationChat({ surface, concern, siteName: siteName ?? siteDisplayName ?? null })
        }}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5f7058] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4a5744] sm:w-auto sm:min-w-[220px]"
      >
        <MessageCircle className="h-4 w-4 shrink-0" />
        {copy.buttonLabel}
      </button>
    </section>
  )
}
