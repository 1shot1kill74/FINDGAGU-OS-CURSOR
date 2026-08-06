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
 * Before/After 클릭 토글 프리뷰.
 * 사진(또는 안내 버튼)을 누르면 Before ↔ After를 전환한다.
 * 사례 블로그 이동은 카드 하단 CTA에서 처리한다.
 */
export function ShowroomBeforeAfterTapPreview({
  beforeSrc,
  afterSrc,
  altLabel,
  aspectClassName = 'aspect-[4/3]',
  className,
}: ShowroomBeforeAfterTapPreviewProps) {
  const [showAfter, setShowAfter] = useState(true)
  const src = showAfter ? afterSrc : beforeSrc
  const sideLabel = showAfter ? 'After' : 'Before'

  const toggle = (event?: React.SyntheticEvent) => {
    event?.preventDefault()
    event?.stopPropagation()
    setShowAfter((prev) => !prev)
  }

  return (
    <div
      className={cn(
        'relative w-full select-none overflow-hidden bg-neutral-100',
        aspectClassName,
        className,
      )}
    >
      <button
        type="button"
        className="absolute inset-0 block cursor-pointer"
        aria-label={`${altLabel} 전후 비교 전환. 현재 ${sideLabel}`}
        onClick={toggle}
      >
        <img
          src={src}
          alt={`${altLabel} ${sideLabel}`}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </button>

      <span
        className={cn(
          'pointer-events-none absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white',
          showAfter ? 'bg-emerald-600/90' : 'bg-black/75',
        )}
      >
        {sideLabel}
      </span>

      <button
        type="button"
        className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/75 active:bg-black/80"
        aria-label={`전후 비교 전환. 현재 ${sideLabel}`}
        onClick={toggle}
      >
        클릭해서 전후 비교
      </button>
    </div>
  )
}
