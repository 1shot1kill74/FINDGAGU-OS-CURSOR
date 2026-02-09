import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, Copy, Link2, X, ChevronLeft, ChevronRight, CheckSquare, Square, FileDown, Image as ImageIcon } from 'lucide-react'
import JSZip from 'jszip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MOCK_REFERENCE_CASES,
  INDUSTRY_OPTIONS,
  SPACE_SIZE_OPTIONS,
  INDUSTRY_SEARCH_KEYWORDS,
  type ReferenceCase,
} from '@/data/referenceCases'
import { toast } from 'sonner'

interface PortfolioBankModalProps {
  onClose: () => void
  onAttachToConsult?: (imageUrl: string) => void
}

/** 선택된 카드에서 이미지 URL + 라벨 목록 추출 */
function getSelectedImages(
  cases: ReferenceCase[],
  selectedIds: Set<string>
): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = []
  cases.forEach((c) => {
    if (!selectedIds.has(c.id) || !c.images?.length) return
    c.images.forEach((url, i) => {
      out.push({ url, label: `${c.title} ${i + 1}` })
    })
  })
  return out
}

export function PortfolioBankModal({ onClose, onAttachToConsult }: PortfolioBankModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [industryFilter, setIndustryFilter] = useState<string>('전체')
  const [spaceFilter, setSpaceFilter] = useState<string>('all')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set())

  const filteredCases = useMemo(() => {
    let list = MOCK_REFERENCE_CASES
    if (industryFilter && industryFilter !== '전체') list = list.filter((c) => c.industry === industryFilter)
    if (spaceFilter && spaceFilter !== 'all') {
      list = list.filter((c) => {
        if (spaceFilter === 'under10') return c.space_size < 10
        if (spaceFilter === '20s') return c.space_size >= 20 && c.space_size < 30
        if (spaceFilter === '30s') return c.space_size >= 30 && c.space_size < 50
        if (spaceFilter === '50plus') return c.space_size >= 50
        return true
      })
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => {
        const titleMatch = c.title.toLowerCase().includes(q)
        const industryMatch = c.industry.toLowerCase().includes(q)
        const tagsMatch = c.items_used.some((i) => i.toLowerCase().includes(q))
        const industryKeywordMatch = INDUSTRY_SEARCH_KEYWORDS[c.industry]?.some(
          (kw) => q.includes(kw.toLowerCase()) || kw.toLowerCase().includes(q)
        )
        return titleMatch || industryMatch || tagsMatch || industryKeywordMatch === true
      })
    }
    return list
  }, [searchQuery, industryFilter, spaceFilter])

  const selectedCase = selectedCardId ? MOCK_REFERENCE_CASES.find((c) => c.id === selectedCardId) : null

  const handleCopyUrl = useCallback((url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      toast.success('이미지 URL이 복사되었습니다.')
    })
  }, [])

  const selectedImages = useMemo(
    () => getSelectedImages(filteredCases, selectedCardIds),
    [filteredCases, selectedCardIds]
  )
  const selectedCount = selectedImages.length

  const toggleCardSelection = useCallback((id: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const copyUrlsToClipboard = useCallback(() => {
    const text = selectedImages.map((x) => x.url).join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      toast.success(`선택한 ${selectedCount}개 이미지 URL을 클립보드에 복사했습니다.`)
    })
  }, [selectedImages, selectedCount])

  const copyMarkdownToClipboard = useCallback(() => {
    const lines = selectedImages.map((x) => `![${x.label}](${x.url})`)
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success(`선택한 ${selectedCount}개 이미지 Markdown을 클립보드에 복사했습니다.`)
    })
  }, [selectedImages, selectedCount])

  const downloadAsZip = useCallback(async () => {
    if (selectedCount === 0) return
    const zip = new JSZip()
    const folder = zip.folder('시공이미지')
    if (!folder) return
    toast.info('ZIP 생성 중… (외부 이미지는 실패할 수 있습니다)')
    let ok = 0
    await Promise.all(
      selectedImages.map(async (img, i) => {
        try {
          const res = await fetch(img.url, { mode: 'cors' })
          const blob = await res.blob()
          const ext = (blob.type || 'image/jpeg').split('/')[1] || 'jpg'
          folder.file(`${String(i + 1).padStart(2, '0')}_${img.label.replace(/[/\\?*]/g, '_')}.${ext}`, blob)
          ok += 1
        } catch {
          // CORS 등으로 실패 시 URL 텍스트라도 넣기
          folder.file(`${String(i + 1).padStart(2, '0')}_${img.label.replace(/[/\\?*]/g, '_')}.url.txt`, img.url)
        }
      })
    )
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `시공이미지_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(`ZIP 다운로드 완료 (${ok}/${selectedCount}장 포함)`)
  }, [selectedImages, selectedCount])

  return (
    <DialogContent
      className="max-w-6xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0"
      onPointerDownOutside={() => setSelectedCardId(null)}
    >
      <DialogHeader className="px-4 py-3 border-b border-border shrink-0 flex flex-row items-center justify-between gap-2">
        <DialogTitle className="text-base">시공 사례 뱅크</DialogTitle>
        <div className="flex items-center gap-2">
          <Button
            variant={selectionMode ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              setSelectionMode((v) => !v)
              if (selectionMode) setSelectedCardIds(new Set())
              if (selectionMode) setSelectedCardId(null)
            }}
          >
            {selectionMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            이미지 선택 모드
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>

      {selectionMode && selectedCount > 0 && (
        <div className="px-4 py-2 border-b border-border shrink-0 flex flex-wrap items-center gap-2 bg-muted/40">
          <span className="text-xs font-medium text-foreground">선택 {selectedCount}장</span>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={copyUrlsToClipboard}>
            <Copy className="h-3.5 w-3.5" />
            URL 클립보드 복사
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={copyMarkdownToClipboard}>
            <ImageIcon className="h-3.5 w-3.5" />
            Markdown 태그 생성
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={downloadAsZip}>
            <FileDown className="h-3.5 w-3.5" />
            한꺼번에 다운로드(ZIP)
          </Button>
        </div>
      )}

      <div className="px-4 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="태그·업종·제목 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-40 shrink-0 border-r border-border p-2 space-y-3 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">업종</p>
            <ul className="space-y-0.5">
              {INDUSTRY_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button type="button" onClick={() => setIndustryFilter(opt.value)} className={`w-full text-left text-xs px-2 py-1 rounded truncate block ${industryFilter === opt.value ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted'}`}>{opt.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">평수</p>
            <ul className="space-y-0.5">
              {SPACE_SIZE_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button type="button" onClick={() => setSpaceFilter(opt.value)} className={`w-full text-left text-xs px-2 py-1 rounded truncate block ${spaceFilter === opt.value ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted'}`}>{opt.label}</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {selectedCase ? (
            <ProjectDetail
              project={selectedCase}
              onClose={() => setSelectedCardId(null)}
              onCopyUrl={handleCopyUrl}
              onAttachToConsult={onAttachToConsult}
            />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 min-w-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {filteredCases.map((item) => (
                    <ProjectCard
                      key={item.id}
                      item={item}
                      isSelected={selectedCardIds.has(item.id)}
                      onSelect={() => {
                        if (selectionMode) toggleCardSelection(item.id)
                        else setSelectedCardId(item.id)
                      }}
                      showCheckbox={selectionMode}
                    />
                  ))}
                </div>
                {filteredCases.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">조건에 맞는 시공 사례가 없습니다.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DialogContent>
  )
}

/** 카드: 사진 개수 뱃지 + 호버 시 페이드인 슬라이드 프리뷰 · 선택 모드 시 체크박스 */
function ProjectCard({
  item,
  isSelected,
  onSelect,
  showCheckbox,
}: {
  item: ReferenceCase
  isSelected: boolean
  onSelect: () => void
  showCheckbox?: boolean
}) {
  const images = item.images?.length ? item.images : []
  const [hoverIndex, setHoverIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    if (!isHovering || images.length <= 1) return
    const t = setInterval(() => setHoverIndex((i) => (i + 1) % images.length), 2000)
    return () => clearInterval(t)
  }, [isHovering, images.length])

  const currentImg = images[hoverIndex]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' ? onSelect() : null)}
      onMouseEnter={() => { setIsHovering(true); setHoverIndex(0) }}
      onMouseLeave={() => { setIsHovering(false); setHoverIndex(0) }}
      className={`rounded-lg border overflow-hidden text-left transition-colors ${isSelected ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-muted-foreground/30'}`}
    >
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {showCheckbox && (
          <span className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center w-5 h-5 rounded border-2 bg-background/90 border-primary text-primary">
            {isSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
          </span>
        )}
        {images.length > 0 && (
          <>
            {images.map((src, i) => (
              <img
                key={src + i}
                src={src}
                alt={`${item.title} ${i + 1}`}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                style={{ opacity: currentImg === src ? 1 : 0, zIndex: currentImg === src ? 1 : 0 }}
                loading="lazy"
              />
            ))}
            <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 z-10">
              {images.length}장
            </span>
          </>
        )}
        {images.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">시공 사진</div>
        )}
      </div>
      <div className="p-1.5 space-y-1">
        <p className="text-xs font-medium text-foreground truncate leading-tight">{item.title}</p>
        <div className="flex flex-wrap gap-1">
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">{item.industry}</span>
          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">{item.space_size}평</span>
          {item.items_used.slice(0, 2).map((x) => (
            <span key={x} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-muted/80 text-foreground">{x}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 상세 뷰: 캐러셀 + 썸네일 + 이미지 URL 복사 / 상담 로그 첨부 */
function ProjectDetail({
  project,
  onClose,
  onCopyUrl,
  onAttachToConsult,
}: {
  project: ReferenceCase
  onClose: () => void
  onCopyUrl: (url: string) => void
  onAttachToConsult?: (imageUrl: string) => void
}) {
  const images = project.images?.length ? project.images : []
  const [index, setIndex] = useState(0)
  const currentUrl = images[index] ?? ''

  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(images.length - 1, i + delta)))

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold truncate">{project.title}</h3>
        <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={onClose}>목록으로</Button>
      </div>

      {/* 메인 캐러셀 */}
      <div className="flex-1 min-h-0 flex flex-col p-3">
        <div className="relative flex-1 min-h-[200px] rounded-lg overflow-hidden bg-muted flex items-center justify-center">
          {images.length > 0 ? (
            <>
              <img
                key={currentUrl}
                src={currentUrl}
                alt={`${project.title} ${index + 1}`}
                className="w-full h-full object-contain"
                loading="lazy"
              />
              {images.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} disabled={index <= 0} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white p-1.5 disabled:opacity-30 hover:bg-black/70" aria-label="이전">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => go(1)} disabled={index >= images.length - 1} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white p-1.5 disabled:opacity-30 hover:bg-black/70" aria-label="다음">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">등록된 사진 없음</span>
          )}
        </div>

        {/* 썸네일 스트립 */}
        {images.length > 1 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 shrink-0">
            {images.map((url, i) => (
              <button
                key={url + i}
                type="button"
                onClick={() => setIndex(i)}
                className={`shrink-0 w-14 h-14 rounded border-2 overflow-hidden transition-colors ${index === i ? 'border-primary' : 'border-transparent hover:border-muted-foreground/50'}`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {/* 액션: 현재 이미지 기준 */}
        <div className="flex flex-wrap items-center gap-2 mt-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => onCopyUrl(currentUrl)} disabled={!currentUrl}>
            <Copy className="h-3.5 w-3.5" />
            이미지 URL 복사
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => { onAttachToConsult?.(currentUrl); toast.success('상담 로그에 첨부할 수 있도록 준비되었습니다.') }}
            disabled={!currentUrl}
          >
            <Link2 className="h-3.5 w-3.5" />
            상담 로그에 첨부
          </Button>
        </div>
      </div>
    </div>
  )
}
