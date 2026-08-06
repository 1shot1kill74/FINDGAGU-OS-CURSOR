import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

type ShowroomBeforeAfterTapPreviewProps = {
  beforeSrc: string
  afterSrc: string
  altLabel: string
  /** 기본 4/3. compact 카드는 16/10 등 */
  aspectClassName?: string
  className?: string
  /**
   * 사진 영역 클릭 시 이동할 경로.
   * 있으면 사진=사례 더보기, 하단 버튼만 전후 토글.
   * 없으면 사진·버튼 모두 전후 토글.
   */
  imageHref?: string | null
  /** imageHref 이동 시 트래킹 등 */
  onImageActivate?: () => void
}

/**
 * Before/After 클릭 토글 프리뷰.
 * 스크롤을 막는 드래그 슬라이더 대신, 탭으로 Before ↔ After를 전환한다.
 */
export function ShowroomBeforeAfterTapPreview({
  beforeSrc,
  afterSrc,
  altLabel,
  aspectClassName = 'aspect-[4/3]',
  className,
  imageHref,
  onImageActivate,
}: ShowroomBeforeAfterTapPreviewProps) {
  const [showAfter, setShowAfter] = useState(true)
  const src = showAfter ? afterSrc : beforeSrc
  const sideLabel = showAfter ? 'After' : 'Before'

  const toggle = (event?: React.SyntheticEvent) => {
    event?.preventDefault()
    event?.stopPropagation()
    setShowAfter((prev) => !prev)
  }

  const media = (
    <img
      src={src}
      alt={`${altLabel} ${sideLabel}`}
      className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )

  return (
    <div
      className={cn(
        'relative w-full select-none overflow-hidden bg-neutral-100',
        aspectClassName,
        className,
      )}
    >
      {imageHref ? (
        <Link
          to={imageHref}
          className="absolute inset-0 block"
          aria-label={`${altLabel} 사례 이야기·사진 더 보기`}
          onClick={() => onImageActivate?.()}
        >
          {media}
        </Link>
      ) : (
        <button
          type="button"
          className="absolute inset-0 block cursor-pointer"
          aria-label={`${altLabel} 전후 비교 전환. 현재 ${sideLabel}`}
          onClick={toggle}
        >
          {media}
        </button>
      )}

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
