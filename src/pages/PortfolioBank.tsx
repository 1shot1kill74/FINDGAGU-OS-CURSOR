/**
 * 시공 사례 뱅크 (Sales/Front-end)
 * 영업용: 업종/필터, 현장별·사진별 토글, 사진 선택, 카톡 공유 링크 생성.
 * ImageAssetViewer(관리자 창고)와 분리된 전용 페이지.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, Link2, X, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  fetchApprovedProjectAssets,
  getBaseAltText,
} from '@/lib/imageAssetService'
import { shareGalleryKakao } from '@/lib/kakaoShare'
import type { ProjectImageAsset } from '@/types/projectImage'

const PAGE_SIZE = 24

/** 주력 업종 — 상단에 항상 노출해 영업 사원이 바로 필터 선택 가능 */
const FIXED_INDUSTRIES = ['학원', '관리형스터디카페', '스터디카페', '학교', '아파트', '기타'] as const

function filterBySearch(assets: ProjectImageAsset[], query: string): ProjectImageAsset[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return assets
  return assets.filter((a) => {
    const tags = (a.productTags ?? []).map((t) => t.toLowerCase())
    const color = (a.color ?? '').toLowerCase()
    const site = (a.projectTitle ?? '').toLowerCase()
    const industry = (a.industry ?? '').toLowerCase()
    const match = (term: string) =>
      tags.some((t) => t.includes(term)) ||
      color.includes(term) ||
      site.includes(term) ||
      industry.includes(term)
    return terms.every(match)
  })
}

export default function PortfolioBank() {
  const [assets, setAssets] = useState<ProjectImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [bankViewMode, setBankViewMode] = useState<'by_site' | 'by_photo'>('by_photo')
  const [searchQuery, setSearchQuery] = useState('')
  const [industryFilter, setIndustryFilter] = useState<string | null>(null)
  const [shareCartIds, setShareCartIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [lightboxAsset, setLightboxAsset] = useState<ProjectImageAsset | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollToSiteKeyRef = useRef<string | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const setTop = () => {
      document.documentElement.style.setProperty('--portfolio-header-h', `${el.offsetHeight}px`)
    }
    setTop()
    const ro = new ResizeObserver(setTop)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, industryFilter, searchQuery, assets.length])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchApprovedProjectAssets().then((list) => {
      if (!cancelled) {
        setAssets(list)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const searchFiltered = useMemo(
    () => filterBySearch(assets, searchQuery),
    [assets, searchQuery]
  )
  const industryFiltered = useMemo(() => {
    if (!industryFilter) return searchFiltered
    return searchFiltered.filter(
      (a) => (a.industry ?? '').trim().toLowerCase() === industryFilter.toLowerCase()
    )
  }, [searchFiltered, industryFilter])

  const sorted = useMemo(
    () => [...industryFiltered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [industryFiltered]
  )

  const bankGrouped = useMemo(() => {
    if (bankViewMode !== 'by_site') return null
    const map = new Map<string, ProjectImageAsset[]>()
    for (const a of sorted) {
      const key = (a.projectTitle || a.consultationId || '미분류').trim() || '미분류'
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))
  }, [sorted, bankViewMode])

  const bankFlat = useMemo(
    () => (bankGrouped ? bankGrouped.flatMap(([, list]) => list) : sorted),
    [bankGrouped, sorted]
  )
  const bankPaginated = useMemo(
    () => bankFlat.slice(0, (page + 1) * PAGE_SIZE),
    [bankFlat, page]
  )
  const hasMore = bankPaginated.length < bankFlat.length

  const distinctIndustries = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((a) => {
      const v = (a.industry ?? '').trim()
      if (v) set.add(v)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [assets])
  /** 고정 6개 + DB에서만 있는 업종(고정에 없는 것) */
  const industryButtons = useMemo(() => {
    const fixedSet = new Set<string>(FIXED_INDUSTRIES)
    const rest = distinctIndustries.filter((ind) => !fixedSet.has(ind))
    return [...FIXED_INDUSTRIES, ...rest]
  }, [distinctIndustries])

  const shareGalleryUrl = useMemo(() => {
    if (shareCartIds.size === 0) return ''
    const ids = Array.from(shareCartIds).join(',')
    return `${window.location.origin}/share?ids=${encodeURIComponent(ids)}`
  }, [shareCartIds])

  const toggleShareCart = useCallback((id: string) => {
    setShareCartIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const copyShareLink = useCallback(() => {
    if (!shareGalleryUrl) return
    navigator.clipboard.writeText(shareGalleryUrl).then(() =>
      toast.success('링크가 복사되었습니다. 카톡에 붙여넣으세요!')
    )
  }, [shareGalleryUrl])

  const openLightboxAt = useCallback((asset: ProjectImageAsset) => {
    const idx = bankFlat.findIndex((a) => a.id === asset.id)
    setLightboxAsset(asset)
    setLightboxIndex(idx >= 0 ? idx : null)
  }, [bankFlat])

  useEffect(() => {
    const key = scrollToSiteKeyRef.current
    if (!key || bankViewMode !== 'by_site') return
    scrollToSiteKeyRef.current = null
    const el = document.querySelector(`[data-site-key="${key}"]`)
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }, [bankViewMode, bankGrouped])

  const sameSiteCount = lightboxAsset?.projectTitle
    ? bankFlat.filter((a) => (a.projectTitle || '').trim() === (lightboxAsset.projectTitle || '').trim()).length
    : 0

  return (
    <div className="min-h-screen bg-background">
      <header
        ref={headerRef}
        id="portfolio-bank-header"
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link to="/consultation" className="text-sm text-muted-foreground hover:text-foreground">
              ← 상담 관리
            </Link>
            <h1 className="text-lg font-bold text-foreground">시공 사례 뱅크</h1>
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30" role="group" aria-label="보기 모드">
              <button
                type="button"
                onClick={() => { setBankViewMode('by_site'); setPage(0) }}
                className={`rounded-md px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-sm font-medium transition-colors touch-manipulation ${
                  bankViewMode === 'by_site' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                현장별(그룹화)
              </button>
              <button
                type="button"
                onClick={() => { setBankViewMode('by_photo'); setPage(0) }}
                className={`rounded-md px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-sm font-medium transition-colors touch-manipulation ${
                  bankViewMode === 'by_photo' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                사진별(낱개)
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xl flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="제품명, 색상, 현장명 검색"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">업종:</span>
            <button
              type="button"
              onClick={() => { setIndustryFilter(null); setPage(0) }}
              className={`rounded-md px-2.5 py-1.5 min-h-[36px] sm:min-h-0 text-sm border touch-manipulation ${
                !industryFilter ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
              }`}
            >
              전체
            </button>
            {industryButtons.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => { setIndustryFilter(ind); setPage(0) }}
                className={`rounded-md px-2.5 py-1.5 min-h-[36px] sm:min-h-0 text-sm border touch-manipulation ${
                  industryFilter === ind ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 카톡 공유 바 (Multi-Select 플로팅) — 선택 시 상단 고정 */}
      {shareCartIds.size > 0 && (
        <div
          className="sticky z-10 border-b border-border bg-primary/10 backdrop-blur px-4 py-3 flex items-center gap-2 sm:gap-3 flex-wrap min-h-[52px] sm:min-h-0"
          style={{ top: 'var(--portfolio-header-h, 0)' }}
          role="region"
          aria-label="공유 선택 바"
        >
          <span className="text-sm font-medium text-foreground shrink-0">{shareCartIds.size}장 선택 · 공유</span>
          <Button variant="default" size="sm" className="gap-1.5 min-h-[44px] touch-manipulation shrink-0" onClick={copyShareLink}>
            <Link2 className="h-4 w-4" />
            공유 링크 복사
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 min-h-[44px] touch-manipulation shrink-0"
            onClick={() =>
              shareGalleryKakao(shareGalleryUrl, '시공 사례 갤러리', '파인드가구 시공 사례를 확인해 보세요.', () =>
                toast.success('링크가 복사되었습니다. 카톡에 붙여 넣어 공유하세요.')
              )
            }
          >
            카톡으로 공유
          </Button>
          <Button variant="ghost" size="sm" className="min-h-[44px] touch-manipulation shrink-0" onClick={() => setShareCartIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      <main className="p-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground mb-4">새로운 상담 사진을 업로드해주세요</p>
            <Link to="/image-assets/upload">
              <Button variant="default" size="sm" className="gap-2">
                <Upload className="h-4 w-4" />
                사진 업로드
              </Button>
            </Link>
          </div>
        ) : bankGrouped ? (
          <>
            {bankGrouped.map(([groupKey, list]) => (
              <section key={groupKey} className="mb-8" data-site-key={groupKey}>
                <h2 className="text-sm font-semibold text-foreground mb-3 px-1 flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5">{groupKey}</span>
                  <span className="text-muted-foreground font-normal">({list.length}건)</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {list.map((asset) => (
                    <div
                      key={asset.id}
                      className="relative rounded-lg border border-border overflow-hidden bg-muted/30 hover:border-primary/50 transition-colors"
                    >
                      <div
                        className="absolute top-1 left-1 z-10 flex items-center justify-center w-6 h-6 rounded border bg-background/90 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); toggleShareCart(asset.id) }}
                        role="button"
                        aria-label="공유 담기"
                      >
                        <input
                          type="checkbox"
                          checked={shareCartIds.has(asset.id)}
                          onChange={() => toggleShareCart(asset.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => openLightboxAt(asset)}
                        className="w-full text-left"
                      >
                        <div className="aspect-[4/3] relative bg-muted">
                          <img
                            src={asset.thumbnailUrl || asset.url}
                            alt={getBaseAltText(asset)}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-1.5">
                          <p className="text-xs font-medium truncate">{asset.projectTitle || '—'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{asset.industry || '—'}</p>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {bankPaginated.map((asset) => (
                <div
                  key={asset.id}
                  className="relative rounded-lg border border-border overflow-hidden bg-muted/30 hover:border-primary/50 transition-colors"
                >
                  <div
                    className="absolute top-1 left-1 z-10 flex items-center justify-center w-6 h-6 rounded border bg-background/90 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); toggleShareCart(asset.id) }}
                    role="button"
                    aria-label="공유 담기"
                  >
                    <input
                      type="checkbox"
                      checked={shareCartIds.has(asset.id)}
                      onChange={() => toggleShareCart(asset.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => openLightboxAt(asset)}
                    className="w-full text-left"
                  >
                    <div className="aspect-[4/3] relative bg-muted">
                      <img
                        src={asset.thumbnailUrl || asset.url}
                        alt={getBaseAltText(asset)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-1.5">
                      <p className="text-xs font-medium truncate">{asset.projectTitle || '—'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{asset.industry || '—'}</p>
                    </div>
                  </button>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                  더 보기
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 라이트박스 */}
      <Dialog
        open={!!lightboxAsset}
        onOpenChange={(open) => {
          if (!open) { setLightboxAsset(null); setLightboxIndex(null) }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {lightboxAsset && (() => {
            const idx = lightboxIndex ?? bankFlat.findIndex((a) => a.id === lightboxAsset.id)
            const prevAsset = idx > 0 ? bankFlat[idx - 1] : null
            const nextAsset = idx >= 0 && idx < bankFlat.length - 1 ? bankFlat[idx + 1] : null
            return (
              <>
                <DialogHeader className="px-4 py-2 border-b shrink-0 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    {prevAsset && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => { setLightboxAsset(prevAsset); setLightboxIndex(idx - 1) }}
                        aria-label="이전 사진"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <DialogTitle className="text-sm truncate">{lightboxAsset.projectTitle || '시공 이미지'}</DialogTitle>
                    {nextAsset && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => { setLightboxAsset(nextAsset); setLightboxIndex(idx + 1) }}
                        aria-label="다음 사진"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setLightboxAsset(null); setLightboxIndex(null) }}>
                    <X className="h-4 w-4" />
                  </Button>
                </DialogHeader>
                <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-muted/30">
                  <img
                    src={lightboxAsset.url}
                    alt={getBaseAltText(lightboxAsset)}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                </div>
                <div className="px-4 py-3 border-t shrink-0 flex flex-wrap items-center gap-2">
                  {lightboxAsset.projectTitle && sameSiteCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        scrollToSiteKeyRef.current = (lightboxAsset.projectTitle || '').trim() || null
                        setLightboxAsset(null)
                        setLightboxIndex(null)
                        setBankViewMode('by_site')
                        setPage(0)
                      }}
                    >
                      이 현장 앨범 보기 ({sameSiteCount}장)
                    </Button>
                  )}
                  <Link
                    to="/image-assets"
                    state={{ focusAssetId: lightboxAsset.id }}
                    className="text-primary font-medium hover:underline text-sm"
                    onClick={() => { setLightboxAsset(null); setLightboxIndex(null) }}
                  >
                    관리 페이지에서 수정하기 →
                  </Link>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
