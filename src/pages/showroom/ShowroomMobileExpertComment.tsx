import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ShowroomMobileExpertCommentProps = {
  children: ReactNode
}

export function ShowroomMobileExpertComment({ children }: ShowroomMobileExpertCommentProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div
        className={cn(
          'text-slate-600 text-sm leading-relaxed space-y-3',
          !expanded && '[&_p:nth-child(n+2)]:hidden md:[&_p:nth-child(n+2)]:block',
        )}
      >
        {children}
      </div>
      <button
        type="button"
        className="mt-2 text-xs font-semibold text-emerald-700 md:hidden"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? '코멘트 접기' : '코멘트 더 보기'}
      </button>
    </div>
  )
}
