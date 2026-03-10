import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search, ImagePlus, ExternalLink } from 'lucide-react'

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
  takeoutVersion: number
  total: number
  candidates: TakeoutQuoteCandidate[]
}

function normalizeSpaceId(input: string | null | undefined): string {
  return String(input ?? '')
    .replace(/^spaces\//i, '')
    .replace(/^Space\s+/i, '')
    .trim()
}

interface TakeoutQuoteInboxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSpaceId?: string | null
  currentDisplayName?: string | null
  onImportCandidate: (candidate: TakeoutQuoteCandidate) => Promise<void> | void
}

export function TakeoutQuoteInboxDialog({
  open,
  onOpenChange,
  currentSpaceId,
  currentDisplayName,
  onImportCandidate,
}: TakeoutQuoteInboxDialogProps) {
  const [manifest, setManifest] = useState<TakeoutQuoteManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const [showAllSpaces, setShowAllSpaces] = useState(false)
  const [previewCandidate, setPreviewCandidate] = useState<TakeoutQuoteCandidate | null>(null)

  const normalizedCurrentSpaceId = normalizeSpaceId(currentSpaceId)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setShowAllSpaces(false)
    fetch(`/data/takeout-quote-inbox.json?t=${Date.now()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('테이크아웃 인덱스를 찾지 못했습니다. 먼저 buildTakeoutQuoteInbox 스크립트를 실행해 주세요.')
        return res.json() as Promise<TakeoutQuoteManifest>
      })
      .then((data) => {
        if (cancelled) return
        setManifest(data)
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

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const candidates = manifest?.candidates ?? []
    const baseFiltered = !q
      ? candidates
      : candidates.filter((candidate) =>
        candidate.spaceId.toLowerCase().includes(q) ||
        candidate.spaceIdNormalized.toLowerCase().includes(q) ||
        candidate.fileName.toLowerCase().includes(q)
      )

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
  }, [manifest, normalizedCurrentSpaceId, searchQuery, showAllSpaces])

  const groupedCandidates = useMemo(() => {
    const grouped = new Map<string, TakeoutQuoteCandidate[]>()
    filteredCandidates.forEach((candidate) => {
      const key = candidate.spaceIdNormalized || candidate.spaceId
      const bucket = grouped.get(key) ?? []
      bucket.push(candidate)
      grouped.set(key, bucket)
    })
    return Array.from(grouped.entries())
  }, [filteredCandidates])

  const currentSpaceCount = (manifest?.candidates ?? []).filter(
    (candidate) => normalizeSpaceId(candidate.spaceIdNormalized) === normalizedCurrentSpaceId
  ).length

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
            최신 Takeout 이미지 전체를 스페이스별로 보고, 필요한 이미지를 현재 상담카드의 견적 검토 흐름으로 가져옵니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="스페이스 ID 또는 파일명으로 검색"
              className="pl-9"
            />
          </div>
          {normalizedCurrentSpaceId && (
            <>
              <div className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                현재 카드 스페이스 {normalizedCurrentSpaceId}
                {currentDisplayName ? ` · ${currentDisplayName}` : ''}
                {currentSpaceCount > 0 ? ` · 이미지 ${currentSpaceCount}건` : ''}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAllSpaces((prev) => !prev)}>
                {showAllSpaces ? '현재 스페이스만 보기' : '전체 스페이스 보기'}
              </Button>
            </>
          )}
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
              {groupedCandidates.map(([spaceId, candidates]) => {
                const isCurrentSpace = normalizeSpaceId(spaceId) === normalizedCurrentSpaceId
                return (
                  <section key={spaceId} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{spaceId}</h4>
                      <span className="text-xs text-muted-foreground">{candidates.length}건</span>
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
                            <p className="truncate text-xs font-medium text-foreground" title={candidate.fileName}>
                              {candidate.fileName}
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
                            견적 검토로 가져오기
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
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
              이미지를 크게 확인한 뒤 바로 현재 상담카드의 견적 검토 흐름으로 가져올 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {previewCandidate && (
            <>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-black/5">
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
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                    견적 검토로 가져오기
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
