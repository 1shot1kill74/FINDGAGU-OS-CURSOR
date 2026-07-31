import { useEffect, useMemo, useState } from 'react'
import { FolderInput, Loader2, Sparkles, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShowroomImagePreviewUrl, type ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import {
  createAdInboxTimelapseFromAfterOnly,
  listShowroomAfterOnlyGroupsForImport,
  synthesizeBeforeFromAfterImage,
  type ShowroomBaImportGroup,
} from '@/lib/adInboxStudio'
import type { AdInboxImportShowroomResult } from '@/components/admin/AdInboxImportShowroomDialog'
import AdInboxImportPagination, { paginateItems } from '@/components/admin/AdInboxImportPagination'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (result: AdInboxImportShowroomResult) => void
}

type SynthResult = {
  cloudinary_url: string
  thumbnail_url: string | null
  public_id: string | null
}

export default function AdInboxImportShowroomAfterOnlyDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [groups, setGroups] = useState<ShowroomBaImportGroup[]>([])
  const [page, setPage] = useState(1)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)
  const [synth, setSynth] = useState<SynthResult | null>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
      setGroups([])
      setPage(1)
      setSelectedKey(null)
      setAfterId(null)
      setSynth(null)
      setLoading(false)
      setSynthesizing(false)
      setCreating(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setPage(1)
    void listShowroomAfterOnlyGroupsForImport(debouncedQuery || undefined)
      .then((rows) => {
        if (cancelled) return
        setGroups(rows)
        if (rows.length === 0) {
          setSelectedKey(null)
          setAfterId(null)
          setSynth(null)
          return
        }
        const firstPage = paginateItems(rows, 1)
        setSelectedKey((prev) => {
          if (prev && rows.some((g) => g.key === prev)) return prev
          return firstPage[0]?.key ?? null
        })
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : 'After만 있는 그룹을 불러오지 못했습니다.')
        setGroups([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, debouncedQuery])

  const pageGroups = useMemo(() => paginateItems(groups, page), [groups, page])

  const selectedGroup = useMemo(
    () => groups.find((g) => g.key === selectedKey) ?? null,
    [groups, selectedKey],
  )

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage)
    const nextItems = paginateItems(groups, nextPage)
    if (nextItems.length === 0) return
    if (!selectedKey || !nextItems.some((g) => g.key === selectedKey)) {
      setSelectedKey(nextItems[0].key)
      setSynth(null)
    }
  }

  useEffect(() => {
    if (!selectedGroup) {
      setAfterId(null)
      setSynth(null)
      return
    }
    setAfterId(selectedGroup.afterAssets[0]?.id ?? null)
    setSynth(null)
  }, [selectedGroup?.key])

  const afterAsset: ShowroomImageAsset | null =
    selectedGroup?.afterAssets.find((a) => a.id === afterId) ?? null

  const busy = synthesizing || creating

  const handleSynthesize = async () => {
    if (!afterAsset) {
      toast.error('After 사진을 선택하세요.')
      return
    }
    const imageUrl = afterAsset.cloudinary_url?.trim() || afterAsset.thumbnail_url?.trim()
    if (!imageUrl) {
      toast.error('After 이미지 URL이 없습니다.')
      return
    }
    setSynthesizing(true)
    try {
      const result = await synthesizeBeforeFromAfterImage(imageUrl)
      setSynth(result)
      toast.success('Before 합성이 끝났습니다. 확인 후 타임랩스를 시작하세요.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Before 합성에 실패했습니다.')
    } finally {
      setSynthesizing(false)
    }
  }

  const handleCreate = async () => {
    if (!afterAsset || !selectedGroup || !synth) {
      toast.error('After 선택 후 Before를 먼저 합성하세요.')
      return
    }
    setCreating(true)
    try {
      const result = await createAdInboxTimelapseFromAfterOnly({
        after: afterAsset,
        synthesizedBefore: synth,
        siteName: selectedGroup.siteName,
      })
      toast.success(
        `「${result.shortName}」에 Before 합성·대기실 입고·타임랩스를 시작했습니다. 이어서 쇼룸으로 보내 주세요.`,
      )
      onCreated({
        jobId: result.jobId,
        siteId: result.siteId,
        siteBatchKey: result.siteBatchKey,
        shortName: result.shortName,
        beforeAssetId: result.beforeAssetId,
        afterAssetId: result.afterAssetId,
        openPromote: true,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '타임랩스 생성에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-5 w-5" />
            Before 없는 After
          </DialogTitle>
          <DialogDescription>
            After만 있는 쇼룸 컷을 고르면 Before를 합성해 대기실 카드에 넣고 타임랩스를 시작합니다.
            작업이 끝나면 「쇼룸으로 보내기」로 합성 Before를 내부/공개 쇼룸·블로그에 연결하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="현장명으로 검색…"
            autoFocus
          />

          {selectedGroup ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              새 카드명:{' '}
              <span className="font-semibold text-neutral-900">{selectedGroup.siteName}</span>
            </p>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              After만 있는 그룹 불러오는 중…
            </div>
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
              Before 없이 After만 있는 쇼룸 그룹이 없습니다. 현장명 검색을 바꿔 보세요.
            </p>
          ) : (
            <div className="space-y-3">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
                {pageGroups.map((group) => {
                  const selected = group.key === selectedKey
                  const afterPreview = getShowroomImagePreviewUrl(group.afterAssets[0])
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setSelectedKey(group.key)}
                      className={`w-full rounded-xl border px-2.5 py-2 text-left text-sm ${
                        selected
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-200">
                          {afterPreview ? (
                            <img src={afterPreview} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium leading-snug">{group.siteName}</div>
                          <div
                            className={`mt-1 text-[11px] ${
                              selected ? 'text-neutral-300' : 'text-neutral-500'
                            }`}
                          >
                            After {group.afterAssets.length}장 · Before 없음
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedGroup ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-emerald-800">After · 1장 선택</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedGroup.afterAssets.map((asset) => {
                        const preview = getShowroomImagePreviewUrl(asset)
                        const active = afterId === asset.id
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setAfterId(asset.id)
                              setSynth(null)
                            }}
                            className={`overflow-hidden rounded-lg border ${
                              active
                                ? 'border-emerald-500 ring-2 ring-emerald-200'
                                : 'border-neutral-200'
                            }`}
                          >
                            <div className="aspect-[4/3] bg-neutral-200">
                              {preview ? (
                                <img src={preview} alt="" className="h-full w-full object-cover" />
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-neutral-200 p-3">
                      <p className="mb-2 text-xs font-medium text-neutral-600">선택 After</p>
                      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-neutral-200">
                        {afterAsset ? (
                          <img
                            src={getShowroomImagePreviewUrl(afterAsset)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                      <p className="mb-2 text-xs font-medium text-amber-900">합성 Before</p>
                      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-neutral-200">
                        {synth ? (
                          <img
                            src={synth.thumbnail_url || synth.cloudinary_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-neutral-500">
                            After를 고른 뒤 「Before 합성」을 누르세요
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!afterAsset || busy}
                    onClick={() => void handleSynthesize()}
                  >
                    {synthesizing ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    {synth ? 'Before 다시 합성' : 'Before 합성'}
                  </Button>
                </div>
              ) : null}
            </div>
            <AdInboxImportPagination
              page={page}
              totalItems={groups.length}
              onChange={handlePageChange}
              disabled={busy}
            />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            취소
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={!synth || !afterAsset || busy}>
            {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Video className="mr-1.5 h-4 w-4" />}
            새 카드 만들고 타임랩스 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
