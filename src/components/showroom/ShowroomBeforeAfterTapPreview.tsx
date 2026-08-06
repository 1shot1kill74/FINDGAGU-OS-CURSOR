import { useCallback, useRef, useState } from 'react'
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
 * Before/After 좌우 비교 슬라이더.
 * After가 바닥, Before는 왼쪽부터 보이며 핸들 드래그로 영역이 바뀐다.
 * 탭 전환 대신 “한 장 안에서 변화를 훑는” 행동에 맞춤.
 */
export function ShowroomBeforeAfterTapPreview({
  beforeSrc,
  afterSrc,
  altLabel,
  aspectClassName = 'aspect-[4/3]',
  className,
}: ShowroomBeforeAfterTapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const [position, setPosition] = useState(50)

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(92, Math.max(8, next)))
  }, [])

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full touch-none select-none overflow-hidden bg-neutral-100',
        aspectClassName,
        className,
      )}
      role="slider"
      aria-label={`${altLabel} Before/After 비교 슬라이더`}
      aria-valuemin={8}
      aria-valuemax={92}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`Before ${Math.round(position)}%, After ${Math.round(100 - position)}%`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setPosition((prev) => Math.max(8, prev - 4))
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          setPosition((prev) => Math.min(92, prev + 4))
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        draggingRef.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        updateFromClientX(event.clientX)
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return
        event.preventDefault()
        event.stopPropagation()
        updateFromClientX(event.clientX)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <img
        src={afterSrc}
        alt={`${altLabel} After`}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        draggable={false}
      />

      <img
        src={beforeSrc}
        alt={`${altLabel} Before`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />

      <div
        className="pointer-events-none absolute inset-y-0 z-10"
        style={{ left: `${position}%` }}
      >
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
        <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-neutral-900/80 text-white">
          <span className="text-[10px] font-bold tracking-tighter" aria-hidden>
            {'<'}|{'>'}
          </span>
        </div>
      </div>

      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white">
        Before
      </span>
      <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
        After
      </span>
      <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
        밀어서 전후 비교
      </span>
    </div>
  )
}
