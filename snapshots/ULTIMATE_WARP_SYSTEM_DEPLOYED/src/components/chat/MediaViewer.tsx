/**
 * 인앱 전체 화면 이미지 뷰어 — 확대/축소/회전/다운로드/슬라이드 (새 탭 없음)
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, ZoomIn, ZoomOut, RotateCw, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const STEP = 0.25

export interface MediaViewerProps {
  /** 이미지 URL 목록 (슬라이드용) */
  urls: string[]
  /** 현재 표시할 인덱스 */
  currentIndex: number
  onClose: () => void
  /** 다운로드 시 사용할 파일명 (선택) */
  fileNames?: string[]
}

export function MediaViewer({ urls, currentIndex: initialIndex, onClose, fileNames = [] }: MediaViewerProps) {
  const [index, setIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)

  const url = urls[index] ?? null
  const hasMultiple = urls.length > 1

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? urls.length - 1 : i - 1))
    setScale(1)
    setRotate(0)
  }, [urls.length])

  const goNext = useCallback(() => {
    setIndex((i) => (i >= urls.length - 1 ? 0 : i + 1))
    setScale(1)
    setRotate(0)
  }, [urls.length])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, goPrev, goNext])

  const handleDownload = useCallback(() => {
    if (!url) return
    const name = fileNames[index] ?? `image-${index + 1}.jpg`
    fetch(url, { mode: 'cors' })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch(() => {})
  }, [url, index, fileNames])

  if (!url) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white">
      {/* 상단 바: 닫기 + 확대/축소/회전/다운로드 */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-white/20">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s - STEP))}
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="min-w-[3rem] text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s + STEP))}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setRotate((r) => (r + 90) % 360)}
          >
            <RotateCw className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleDownload}>
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 이미지 영역 + 슬라이드 좌우 */}
      <div className="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden">
        {hasMultiple && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 h-12 w-12 rounded-full"
            onClick={goPrev}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}
        <div
          className="flex items-center justify-center w-full h-full overflow-auto p-4"
          style={{ transform: `rotate(${rotate}deg)` }}
        >
          <img
            src={url}
            alt=""
            className="max-w-full max-h-full object-contain select-none"
            style={{ transform: `scale(${scale})` }}
            draggable={false}
          />
        </div>
        {hasMultiple && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 h-12 w-12 rounded-full"
            onClick={goNext}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}
      </div>

      {hasMultiple && (
        <div className="shrink-0 py-2 text-center text-sm text-white/80">
          {index + 1} / {urls.length}
        </div>
      )}
    </div>
  )
}

export default MediaViewer
