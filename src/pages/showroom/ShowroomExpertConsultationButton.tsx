import type { ReactNode } from 'react'
import { openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'
import type { ShowroomAbmConsultationSurface } from '@/lib/showroomAbmTracking'

type ShowroomExpertConsultationButtonProps = {
  children: ReactNode
  concern?: string | null
  surface?: ShowroomAbmConsultationSurface
}

export function ShowroomExpertConsultationButton({
  children,
  concern = null,
  surface = 'expert_comment',
}: ShowroomExpertConsultationButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        openShowroomConsultationChat({ surface, concern })
      }}
      className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
    >
      {children}
    </button>
  )
}
