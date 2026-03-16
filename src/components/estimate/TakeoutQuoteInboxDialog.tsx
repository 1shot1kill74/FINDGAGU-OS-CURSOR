import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search, ImagePlus, ExternalLink, ArrowLeft } from 'lucide-react'

type TakeoutQuoteCandidate = {
  id: string
  spaceId: string
  spaceIdNormalized: string
  fileName: string
  assetUrl: string
  matchReason: string
  sourcePath: string
  takeoutVersion: number
}

type TakeoutQuoteManifest = {
  generatedAt: string
  takeoutVersions?: number[]
  takeoutVersion: number
  total: number
  candidates: TakeoutQuoteCandidate[]
}

function normalizeSpaceId(input: string | null | undefined): string {
  const raw = String(input ?? '')
    .replace(/^spaces\//i, '')
    .replace(/^Space\s+/i, '')
    .trim()
  const urlMatch = raw.match(/\/room\/([^/?#]+)/i)
  return (urlMatch?.[1] ?? raw).trim()
}

function normalizeSearchText(input: string | null | undefined): string {
  return String(input ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
}

function normalizeDigitText(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D+/g, '')
}

function matchesSearchToken(token: string, value: string): boolean {
  if (!token) return true
  const normalizedToken = normalizeSearchText(token)
  const normalizedValue = normalizeSearchText(value)
  if (normalizedToken && normalizedValue.includes(normalizedToken)) return true

  const digitToken = normalizeDigitText(token)
  if (!digitToken) return false
  const digitValue = normalizeDigitText(value)
  if (!digitValue) return false
  return digitValue.includes(digitToken) || digitValue.endsWith(digitToken)
}

function matchesTakeoutSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  return tokens.every((token) => fields.some((field) => matchesSearchToken(token, field ?? '')))
}

interface TakeoutQuoteInboxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSpaceId?: string | null
  currentDisplayName?: string | null
  spaceLinks?: Array<{ spaceId: string; displayName: string; consultationId: string; inboundDate?: string | null; updateDate?: string | null }>
  onApplySearch?: (payload: { query: string; consultationId?: string }) => void
  onImportCandidate: (candidate: TakeoutQuoteCandidate) => Promise<void> | void
}

const WORKED_STORAGE_KEY = 'takeout-quote-worked-candidates-v1'

function getWorkedCandidateKey(candidate: Pick<TakeoutQuoteCandidate, 'takeoutVersion' | 'sourcePath' | 'assetUrl'>): string {
  const stableSource = candidate.sourcePath?.trim() || candidate.assetUrl.trim()
  return `v${candidate.takeoutVersion}:${stableSource}`
}

function parseInboundTime(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = new Date(`${value}T12:00:00.000Z`).getTime()
  return Number.isNaN(time) ? null : time
}

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function getLinkSortTime(link: { updateDate?: string | null; inboundDate?: string | null }): number | null {
  return parseInboundTime(link.updateDate) ?? parseInboundTime(link.inboundDate)
}

export function TakeoutQuoteInboxDialog({
  open,
  onOpenChange,
  currentSpaceId,
  currentDisplayName,
  spaceLinks = [],
  onApplySearch,
  onImportCandidate,
}: TakeoutQuoteInboxDialogProps) {
  const [manifest, setManifest] = useState<TakeoutQuoteManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const [showAllSpaces, setShowAllSpaces] = useState(false)
  const [previewCandidate, setPreviewCandidate] = useState<TakeoutQuoteCandidate | null>(null)
  const [workedIds, setWorkedIds] = useState<string[]>([])
  const [spacePage, setSpacePage] = useState(1)
  const [selectedTakeoutVersion, setSelectedTakeoutVersion] = useState<number | null>(null)
  const [workedIdsHydrated, setWorkedIdsHydrated] = useState(false)

  const normalizedCurrentSpaceId = normalizeSpaceId(currentSpaceId)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(WORKED_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          setWorkedIds(parsed.filter((item): item is string => typeof item === 'string'))
        }
      }
    } catch {
      setWorkedIds([])
    } finally {
      setWorkedIdsHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!workedIdsHydrated) return
    window.localStorage.setItem(WORKED_STORAGE_KEY, JSON.stringify(workedIds))
  }, [workedIds, workedIdsHydrated])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setShowAllSpaces(false)
    setSpacePage(1)
    setSelectedTakeoutVersion(null)
    fetch(`/data/takeout-quote-inbox.json?t=${Date.now()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('테이크아웃 인덱스를 찾지 못했습니다. 먼저 buildTakeoutQuoteInbox 스크립트를 실행해 주세요.')
        return res.json() as Promise<TakeoutQuoteManifest>
      })
      .then((data) => {
        if (cancelled) return
        setManifest(data)
        const versions = (data.takeoutVersions && data.takeoutVersions.length > 0)
          ? data.takeoutVersions
          : [data.takeoutVersion]
        setSelectedTakeoutVersion(versions[0] ?? data.takeoutVersion)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setManifest(null)
        setError(err instanceof Error ? err.message : '테이크아웃 인덱스를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) setPreviewCandidate(null)
  }, [open])

  const availableTakeoutVersions = useMemo(() => {
    const versions = manifest?.takeoutVersions ?? []
    if (versions.length > 0) return versions
    return manifest?.takeoutVersion ? [manifest.takeoutVersion] : []
  }, [manifest])

  const spaceLinkMap = useMemo(() => {
    const map = new Map<string, { displayName: string; consultationId: string; inboundDate?: string | null; updateDate?: string | null }>()
    spaceLinks.forEach((link) => {
      const key = normalizeSpaceId(link.spaceId)
      if (!key) return
      const nextValue = {
        displayName: link.displayName,
        consultationId: link.consultationId,
        inboundDate: link.inboundDate ?? null,
        updateDate: link.updateDate ?? null,
      }
      const existing = map.get(key)
      if (!existing) {
        map.set(key, nextValue)
        return
      }
      const existingTime = getLinkSortTime(existing)
      const nextTime = getLinkSortTime(nextValue)
      if (nextTime != null && (existingTime == null || nextTime > existingTime)) {
        map.set(key, nextValue)
        return
      }
      if (!existing.displayName && nextValue.displayName) {
        map.set(key, { ...existing, displayName: nextValue.displayName })
      }
    })
    return map
  }, [spaceLinks])
  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim()
    const candidates = (manifest?.candidates ?? []).filter((candidate) =>
      selectedTakeoutVersion == null ? true : candidate.takeoutVersion === selectedTakeoutVersion
    )
    const baseFiltered = !q
      ? candidates
      : candidates.filter((candidate) => {
        const linked = spaceLinkMap.get(normalizeSpaceId(candidate.spaceIdNormalized || candidate.spaceId))
        return matchesTakeoutSearch(q, [
          candidate.spaceId,
          candidate.spaceIdNormalized,
          candidate.fileName,
          candidate.sourcePath,
          linked?.displayName,
        ])
      })

    const filtered =
      normalizedCurrentSpaceId && !q && !showAllSpaces
        ? baseFiltered.filter((candidate) => normalizeSpaceId(candidate.spaceIdNormalized) === normalizedCurrentSpaceId)
        : baseFiltered

    return [...filtered].sort((a, b) => {
      const aCurrent = normalizeSpaceId(a.spaceIdNormalized) === normalizedCurrentSpaceId
      const bCurrent = normalizeSpaceId(b.spaceIdNormalized) === normalizedCurrentSpaceId
      if (aCurrent && !bCurrent) return -1
      if (!aCurrent && bCurrent) return 1
      if (a.spaceIdNormalized !== b.spaceIdNormalized) return a.spaceIdNormalized.localeCompare(b.spaceIdNormalized)
      return a.fileName.localeCompare(b.fileName)
    })
  }, [manifest, normalizedCurrentSpaceId, searchQuery, selectedTakeoutVersion, showAllSpaces, spaceLinkMap])
  const groupedCandidates = useMemo(() => {
    const grouped = new Map<string, TakeoutQuoteCandidate[]>()
    filteredCandidates.forEach((candidate) => {
      const key = candidate.spaceIdNormalized || candidate.spaceId
      const bucket = grouped.get(key) ?? []
      bucket.push(candidate)
      grouped.set(key, bucket)
    })
    return Array.from(grouped.entries()).sort(([a, aCandidates], [b, bCandidates]) => {
      const aNorm = normalizeSpaceId(a)
      const bNorm = normalizeSpaceId(b)
      const aUpdate = parseInboundTime(spaceLinkMap.get(aNorm)?.updateDate)
      const bUpdate = parseInboundTime(spaceLinkMap.get(bNorm)?.updateDate)
      if (aUpdate != null && bUpdate != null && aUpdate !== bUpdate) return bUpdate - aUpdate
      if (aUpdate != null && bUpdate == null) return -1
      if (aUpdate == null && bUpdate != null) return 1
      const aInbound = parseInboundTime(spaceLinkMap.get(aNorm)?.inboundDate)
      const bInbound = parseInboundTime(spaceLinkMap.get(bNorm)?.inboundDate)
      if (aInbound != null && bInbound != null && aInbound !== bInbound) return bInbound - aInbound
      if (aInbound != null && bInbound == null) return -1
      if (aInbound == null && bInbound != null) return 1
      const aLatestTakeout = Math.max(...aCandidates.map((candidate) => candidate.takeoutVersion))
      const bLatestTakeout = Math.max(...bCandidates.map((candidate) => candidate.takeoutVersion))
      if (aLatestTakeout !== bLatestTakeout) return bLatestTakeout - aLatestTakeout
      return aNorm.localeCompare(bNorm)
    })
  }, [filteredCandidates, normalizedCurrentSpaceId, spaceLinkMap])

  const spacesPerPage = 12

  const totalSpacePages = useMemo(() => {
    if (!showAllSpaces || searchQuery.trim()) return 1
    return Math.max(1, Math.ceil(groupedCandidates.length / spacesPerPage))
  }, [groupedCandidates.length, searchQuery, showAllSpaces])

  const visibleGroupedCandidates = useMemo(() => {
    if (!showAllSpaces || searchQuery.trim()) return groupedCandidates
    const start = (spacePage - 1) * spacesPerPage
    return groupedCandidates.slice(start, start + spacesPerPage)
  }, [groupedCandidates, searchQuery, showAllSpaces, spacePage])

  useEffect(() => {
    setSpacePage(1)
  }, [searchQuery, selectedTakeoutVersion, showAllSpaces])

  useEffect(() => {
    if (spacePage > totalSpacePages) {
      setSpacePage(totalSpacePages)
    }
  }, [spacePage, totalSpacePages])

  const visiblePageNumbers = useMemo(() => {
    const maxVisible = 7
    if (totalSpacePages <= maxVisible) {
      return Array.from({ length: totalSpacePages }, (_, index) => index + 1)
    }

    let start = Math.max(1, spacePage - 3)
    let end = Math.min(totalSpacePages, start + maxVisible - 1)
    start = Math.max(1, end - maxVisible + 1)

    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [spacePage, totalSpacePages])

  const currentSpaceCount = (manifest?.candidates ?? []).filter(
    (candidate) => normalizeSpaceId(candidate.spaceIdNormalized) === normalizedCurrentSpaceId
  ).length

  const workedIdSet = useMemo(() => new Set(workedIds), [workedIds])

  const toggleWorked = (candidate: TakeoutQuoteCandidate) => {
    const workedKey = getWorkedCandidateKey(candidate)
    setWorkedIds((prev) => (prev.includes(workedKey) ? prev.filter((id) => id !== workedKey) : [...prev, workedKey]))
  }

  const handleImport = async (candidate: TakeoutQuoteCandidate) => {
    setImportingId(candidate.id)
    try {
      setPreviewCandidate(null)
      await onImportCandidate(candidate)
      onOpenChange(false)
    } finally {
      setImportingId(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Takeout 견적 이미지 불러오기</DialogTitle>
          <DialogDescription>
            한 번에 하나의 Takeout만 열어서 스페이스별로 보고, 필요한 이미지를 현재 상담카드의 AI 검수 미리보기로 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pb-3">
          {availableTakeoutVersions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Takeout 선택</span>
              {availableTakeoutVersions.map((version) => (
                <Button
                  key={version}
                  type="button"
                  variant={selectedTakeoutVersion === version ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedTakeoutVersion(version)
                    setShowAllSpaces(false)
                    setSpacePage(1)
                  }}
                >
                  Takeout {version}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="스페이스 ID, 현장명, 파일명, 숫자로 검색"
              className="pl-9"
            />
          </div>
            {normalizedCurrentSpaceId && (
              <div className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                현재 카드 스페이스 {normalizedCurrentSpaceId}
                {currentDisplayName ? ` · ${currentDisplayName}` : ''}
                {currentSpaceCount > 0 ? ` · 이미지 ${currentSpaceCount}건` : ''}
              </div>
            )}
            <div className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              작업 체크 {workedIds.length}건
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAllSpaces((prev) => !prev)
                setSpacePage(1)
              }}
            >
              {showAllSpaces ? '현재 스페이스만 보기' : '전체 스페이스 보기'}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/10 p-3">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              인덱스를 불러오는 중입니다.
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : groupedCandidates.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              조건에 맞는 이미지가 없습니다.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                <span>
                  {selectedTakeoutVersion ? `Takeout ${selectedTakeoutVersion} · ` : ''}
                  스페이스 {groupedCandidates.length.toLocaleString()}개 · 이미지 {filteredCandidates.length.toLocaleString()}건
                </span>
                {showAllSpaces && !searchQuery.trim() ? (
                  <span>
                    {spacePage.toLocaleString()} / {totalSpacePages.toLocaleString()} 페이지
                  </span>
                ) : null}
              </div>

              <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                `AI 검수로 가져오기`는 바로 저장하는 기능이 아니라, 아래 업로드 영역의 확인용 미리보기로 넘겨서 검수한 뒤 저장하는 단계입니다.
              </div>

              {visibleGroupedCandidates.map(([spaceId, candidates]) => {
                const isCurrentSpace = normalizeSpaceId(spaceId) === normalizedCurrentSpaceId
                const linked = spaceLinkMap.get(normalizeSpaceId(spaceId))
                const updateDateLabel = formatDateLabel(linked?.updateDate)
                const inboundDateLabel = formatDateLabel(linked?.inboundDate)
                return (
                  <section key={spaceId} className="space-y-2">
                    <div className="flex items-center gap-2">
                      {linked ? (
                        <button
                          type="button"
                          className="text-left text-sm font-semibold text-foreground hover:text-primary hover:underline"
                          onClick={() => {
                            onApplySearch?.({
                              query: linked.displayName || spaceId,
                              consultationId: linked.consultationId,
                            })
                            onOpenChange(false)
                          }}
                          title="이 이름으로 메인 검색"
                        >
                          {spaceId}
                          {linked.displayName ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {linked.displayName}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <h4 className="text-sm font-semibold text-foreground">{spaceId}</h4>
                      )}
                      <span className="text-xs text-muted-foreground">{candidates.length}건</span>
                      {updateDateLabel ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800">
                          업데이트 {updateDateLabel}
                        </span>
                      ) : null}
                      {!updateDateLabel && inboundDateLabel ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                          인입 {inboundDateLabel}
                        </span>
                      ) : null}
                      {isCurrentSpace && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30">
                          현재 카드
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                      {candidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-lg border border-border bg-background p-2 shadow-sm">
                          <button
                            type="button"
                            className="block w-full overflow-hidden rounded-md border border-border bg-muted/20"
                            onClick={() => setPreviewCandidate(candidate)}
                            title="크게 보기"
                          >
                            <img
                              src={candidate.assetUrl}
                              alt={candidate.fileName}
                              loading="lazy"
                              className="h-40 w-full object-contain bg-black/5"
                            />
                          </button>
                          <div className="mt-2 space-y-1">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={workedIdSet.has(getWorkedCandidateKey(candidate))}
                                onChange={() => toggleWorked(candidate)}
                                className="rounded border-border"
                              />
                              작업 체크
                            </label>
                            <p className="truncate text-xs font-medium text-foreground" title={candidate.fileName}>
                              {candidate.fileName}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Takeout {candidate.takeoutVersion}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-2 w-full gap-1.5"
                            onClick={() => void handleImport(candidate)}
                            disabled={importingId === candidate.id}
                          >
                            {importingId === candidate.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImagePlus className="h-3.5 w-3.5" />
                            )}
                            AI 검수로 가져오기
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}

              {showAllSpaces && !searchQuery.trim() && totalSpacePages > 1 ? (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSpacePage((prev) => Math.max(1, prev - 1))}
                    disabled={spacePage === 1}
                  >
                    이전
                  </Button>
                  {visiblePageNumbers[0] > 1 ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSpacePage(1)}>
                        1
                      </Button>
                      {visiblePageNumbers[0] > 2 ? (
                        <span className="px-1 text-xs text-muted-foreground">...</span>
                      ) : null}
                    </>
                  ) : null}
                  {visiblePageNumbers.map((pageNumber) => (
                    <Button
                      key={pageNumber}
                      type="button"
                      variant={spacePage === pageNumber ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSpacePage(pageNumber)}
                    >
                      {pageNumber}
                    </Button>
                  ))}
                  {visiblePageNumbers[visiblePageNumbers.length - 1] < totalSpacePages ? (
                    <>
                      {visiblePageNumbers[visiblePageNumbers.length - 1] < totalSpacePages - 1 ? (
                        <span className="px-1 text-xs text-muted-foreground">...</span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSpacePage(totalSpacePages)}
                      >
                        {totalSpacePages}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSpacePage((prev) => Math.min(totalSpacePages, prev + 1))}
                    disabled={spacePage === totalSpacePages}
                  >
                    다음
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewCandidate} onOpenChange={(next) => !next && setPreviewCandidate(null)}>
        <DialogContent className="max-w-7xl h-[92vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{previewCandidate?.fileName ?? '이미지 크게 보기'}</DialogTitle>
            <DialogDescription>
              이미지를 크게 확인한 뒤 현재 상담카드의 AI 검수 미리보기로 넘길 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {previewCandidate && (
            <>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewCandidate(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  목록으로 돌아가기
                </Button>
                <span className="text-xs text-muted-foreground">
                  이 단계는 저장 전 확인용입니다.
                </span>
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-black/5">
                <Button
                  type="button"
                  variant="outline"
                  className="absolute left-3 top-3 z-10 bg-background/95 shadow-sm"
                  onClick={() => setPreviewCandidate(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  목록으로 돌아가기
                </Button>
                <img
                  src={previewCandidate.assetUrl}
                  alt={previewCandidate.fileName}
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{previewCandidate.spaceIdNormalized}</p>
                  <p className="truncate text-xs text-muted-foreground">{previewCandidate.fileName}</p>
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={workedIdSet.has(getWorkedCandidateKey(previewCandidate))}
                      onChange={() => toggleWorked(previewCandidate)}
                      className="rounded border-border"
                    />
                    작업 체크
                  </label>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPreviewCandidate(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    목록으로
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(previewCandidate.assetUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    새 탭
                  </Button>
                  <Button
                    type="button"
                    className="gap-1.5"
                    onClick={() => void handleImport(previewCandidate)}
                    disabled={importingId === previewCandidate.id}
                  >
                    {importingId === previewCandidate.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    AI 검수로 가져오기
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
