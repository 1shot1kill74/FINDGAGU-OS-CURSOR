import { useState } from 'react'
import { cn } from '@/lib/utils'

type ShowroomBeforeAfterTapPreviewProps = {
  beforeSrc: string
  afterSrc: string
  altLabel: string
  /** 기본 4/3. compact 카드는 16/10 등 */
  aspectClassName?: string
  className?: string
}

/**
 * 모바일: 한 슬롯에서 탭으로 Before ↔ After.
 * md 이상: 나란히 2장.
 */
export function ShowroomBeforeAfterTapPreview({
  beforeSrc,
  afterSrc,
  altLabel,
  aspectClassName = 'aspect-[4/3]',
  className,
}: ShowroomBeforeAfterTapPreviewProps) {
  const [showBefore, setShowBefore] = useState(false)
  const activeSrc = showBefore ? beforeSrc : afterSrc
  const activeRole = showBefore ? 'Before' : 'After'

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: tap toggle */}
      <button
        type="button"
        className={cn(
          'relative w-full overflow-hidden bg-neutral-100 md:hidden',
          aspectClassName,
        )}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setShowBefore((prev) => !prev)
        }}
        aria-label={`${altLabel} 전후 비교. 현재 ${activeRole}. 탭하면 ${showBefore ? 'After' : 'Before'}로 전환`}
      >
        <img
          src={activeSrc}
          alt={`${altLabel} ${activeRole}`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <span
          className={cn(
            'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white',
            showBefore ? 'bg-black/75' : 'bg-emerald-600/90',
          )}
        >
          {activeRole}
        </span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
          탭해서 {showBefore ? 'After' : 'Before'} 보기
        </span>
      </button>

      {/* Desktop: side by side */}
      <div className="hidden grid-cols-2 md:grid">
        <div className={cn('relative bg-neutral-100', aspectClassName)}>
          <img
            src={beforeSrc}
            alt={`${altLabel} Before`}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
            Before
          </span>
        </div>
        <div className={cn('relative bg-neutral-100', aspectClassName)}>
          <img
            src={afterSrc}
            alt={`${altLabel} After`}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
            After
          </span>
        </div>
      </div>
    </div>
  )
}
