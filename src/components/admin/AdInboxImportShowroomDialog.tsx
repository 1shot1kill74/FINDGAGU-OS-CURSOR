import { useEffect, useMemo, useState } from 'react'
import { Eraser, FolderInput, Loader2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShowroomImagePreviewUrl, type ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import {
  applyCleanupToShowroomOriginal,
  createAdInboxTimelapseJobFromShowroom,
  listShowroomBaGroupsForImport,
  runAdInboxPeopleCleanup,
  type ShowroomBaImportGroup,
} from '@/lib/adInboxStudio'
import AdInboxImportPagination, { paginateItems } from '@/components/admin/AdInboxImportPagination'

export type AdInboxImportShowroomResult = {
  jobId: string
  siteId: string
  siteBatchKey: string
  shortName: string
}

type CleanupOverride = {
  cloudinary_url: string
  thumbnail_url: string | null
  public_id: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (result: AdInboxImportShowroomResult) => void
}

function withCleanupOverride(
  asset: ShowroomImageAsset,
  overrides: Record<string, CleanupOverride>,
): ShowroomImageAsset {
  const override = overrides[asset.id]
  if (!override) return asset
  return {
    ...asset,
    cloudinary_url: override.cloudinary_url,
    thumbnail_url: override.thumbnail_url,
  }
}

function AssetPickCard({
  asset,
  active,
  activeTone,
  cleaned,
  replaced,
  cleaning,
  replacing,
  disabled,
  onSelect,
  onCleanup,
  onReplaceOriginal,
}: {
  asset: ShowroomImageAsset
  active: boolean
  activeTone: 'before' | 'after'
  cleaned: boolean
  replaced: boolean
  cleaning: boolean
  replacing: boolean
  disabled: boolean
  onSelect: () => void
  onCleanup: () => void
  onReplaceOriginal: () => void
}) {
  const preview = getShowroomImagePreviewUrl(asset)
  const ring =
    activeTone === 'before'
      ? 'border-amber-500 ring-2 ring-amber-200'
      : 'border-emerald-500 ring-2 ring-emerald-200'

  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        active ? ring : 'border-neutral-200'
      }`}
    >
      <button type="button" className="block w-full" onClick={onSelect} disabled={disabled}>
        <div className="relative aspect-[4/3] bg-neutral-200">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : null}
          {replaced ? (
            <span className="absolute left-1 top-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-medium text-white">
              원본반영
            </span>
          ) : cleaned ? (
            <span className="absolute left-1 top-1 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              보정됨
            </span>
          ) : null}
        </div>
      </button>
      <div className="space-y-1 p-1.5">
        <button
          type="button"
          disabled={disabled || cleaning || replacing}
          className="w-full rounded-md bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-900 disabled:opacity-50"
          onClick={(e) => {
            e.stopPropagation()
            onCleanup()
          }}
        >
          {cleaning ? '보정중…' : '사람제거'}
        </button>
        {cleaned && !replaced ? (
          <button
            type="button"
            disabled={disabled || cleaning || replacing}
            className="w-full rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation()
              onReplaceOriginal()
            }}
          >
            {replacing ? '교체중…' : '원본 교체'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function AdInboxImportShowroomDialog({ open, onOpenChange, onCreated }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cleaningId, setCleaningId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [cleanupOverrides, setCleanupOverrides] = useState<Record<string, CleanupOverride>>({})
  const [replacedIds, setReplacedIds] = useState<Record<string, true>>({})
  const [groups, setGroups] = useState<ShowroomBaImportGroup[]>([])
  const [page, setPage] = useState(1)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)

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
      setBeforeId(null)
      setAfterId(null)
      setCleanupOverrides({})
      setReplacedIds({})
      setCleaningId(null)
      setReplacingId(null)
      setLoading(false)
      setCreating(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setPage(1)
    void listShowroomBaGroupsForImport(debouncedQuery || undefined)
      .then((rows) => {
        if (cancelled) return
        setGroups(rows)
        if (rows.length === 0) {
          setSelectedKey(null)
          setBeforeId(null)
          setAfterId(null)
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
        toast.error(error instanceof Error ? error.message : '쇼룸 BA 그룹을 불러오지 못했습니다.')
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
    }
  }

  useEffect(() => {
    if (!selectedGroup) {
      setBeforeId(null)
      setAfterId(null)
      return
    }
    setBeforeId(selectedGroup.beforeAssets[0]?.id ?? null)
    setAfterId(selectedGroup.afterAssets[0]?.id ?? null)
  }, [selectedGroup?.key])

  const beforeAssetRaw = selectedGroup?.beforeAssets.find((a) => a.id === beforeId) ?? null
  const afterAssetRaw = selectedGroup?.afterAssets.find((a) => a.id === afterId) ?? null
  const beforeAsset = beforeAssetRaw ? withCleanupOverride(beforeAssetRaw, cleanupOverrides) : null
  const afterAsset = afterAssetRaw ? withCleanupOverride(afterAssetRaw, cleanupOverrides) : null

  const busy = creating || cleaningId !== null || replacingId !== null
  const canCreate = Boolean(beforeAsset && afterAsset && !busy)

  const patchGroupAssetUrls = (
    assetId: string,
    urls: { cloudinary_url: string; thumbnail_url: string | null },
  ) => {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        beforeAssets: group.beforeAssets.map((asset) =>
          asset.id === assetId
            ? { ...asset, cloudinary_url: urls.cloudinary_url, thumbnail_url: urls.thumbnail_url }
            : asset,
        ),
        afterAssets: group.afterAssets.map((asset) =>
          asset.id === assetId
            ? { ...asset, cloudinary_url: urls.cloudinary_url, thumbnail_url: urls.thumbnail_url }
            : asset,
        ),
      })),
    )
  }

  const handleCleanup = async (asset: ShowroomImageAsset) => {
    const current = withCleanupOverride(asset, cleanupOverrides)
    const imageUrl = current.cloudinary_url?.trim() || current.thumbnail_url?.trim()
    if (!imageUrl) {
      toast.error('보정할 이미지 URL이 없습니다.')
      return
    }
    setCleaningId(asset.id)
    try {
      const cleaned = await runAdInboxPeopleCleanup(imageUrl)
      setCleanupOverrides((prev) => ({
        ...prev,
        [asset.id]: {
          cloudinary_url: cleaned.cloudinary_url,
          thumbnail_url: cleaned.thumbnail_url,
          public_id: cleaned.public_id,
        },
      }))
      setReplacedIds((prev) => {
        const next = { ...prev }
        delete next[asset.id]
        return next
      })
      toast.success('사람 제거 보정을 적용했습니다. 원본 교체로 쇼룸에도 반영할 수 있습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '사람 제거 보정에 실패했습니다.')
    } finally {
      setCleaningId(null)
    }
  }

  const handleReplaceOriginal = async (asset: ShowroomImageAsset) => {
    const override = cleanupOverrides[asset.id]
    if (!override) {
      toast.error('먼저 사람 제거 보정을 하세요.')
      return
    }
    const ok = window.confirm(
      '보정본으로 쇼룸 원본 사진을 교체할까요? 오픈쇼룸에도 바로 반영됩니다. (이전 URL은 메타데이터에 보관)',
    )
    if (!ok) return

    setReplacingId(asset.id)
    try {
      await applyCleanupToShowroomOriginal({
        assetId: asset.id,
        cloudinary_url: override.cloudinary_url,
        thumbnail_url: override.thumbnail_url,
        public_id: override.public_id,
      })
      patchGroupAssetUrls(asset.id, {
        cloudinary_url: override.cloudinary_url,
        thumbnail_url: override.thumbnail_url,
      })
      setCleanupOverrides((prev) => {
        const next = { ...prev }
        delete next[asset.id]
        return next
      })
      setReplacedIds((prev) => ({ ...prev, [asset.id]: true }))
      toast.success('쇼룸 원본을 보정본으로 교체했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '원본 교체에 실패했습니다.')
    } finally {
      setReplacingId(null)
    }
  }

  const handleCreate = async () => {
    if (!beforeAsset || !afterAsset || !selectedGroup) {
      toast.error('Before와 After를 각각 1장씩 선택하세요.')
      return
    }
    if (selectedGroup.hasExistingJob) {
      const ok = window.confirm(
        '이 그룹의 Before/After로 이미 제작된 타임랩스가 있을 수 있습니다. 다시 만들까요?',
      )
      if (!ok) return
    }

    setCreating(true)
    try {
      const result = await createAdInboxTimelapseJobFromShowroom({
        before: beforeAsset,
        after: afterAsset,
        siteName: selectedGroup.siteName,
      })
      toast.success(`「${result.shortName}」 카드를 만들고 타임랩스를 시작했습니다.`)
      onCreated(result)
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
            BA 있는 쇼룸 가져오기
          </DialogTitle>
          <DialogDescription>
            Before·After가 둘 다 있는 쇼룸 페어를 고르면 같은 현장명으로 새 대기실 카드를 만들고
            타임랩스를 시작합니다. 사람 제거 후 「원본 교체」를 누르면 오픈쇼룸 사진도 보정본으로
            바뀝니다.
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
              쇼룸 BA 그룹 불러오는 중…
            </div>
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
              BA 태그가 있는 쇼룸 그룹이 없습니다. 자산관리에서 Before/After를 지정하세요.
            </p>
          ) : (
            <div className="space-y-3">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
                {pageGroups.map((group) => {
                  const selected = group.key === selectedKey
                  const beforePreview = getShowroomImagePreviewUrl(
                    withCleanupOverride(group.beforeAssets[0], cleanupOverrides),
                  )
                  const afterPreview = getShowroomImagePreviewUrl(
                    withCleanupOverride(group.afterAssets[0], cleanupOverrides),
                  )
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
                        <div className="flex shrink-0 gap-0.5">
                          <div className="h-9 w-9 overflow-hidden rounded bg-neutral-200">
                            {beforePreview ? (
                              <img src={beforePreview} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="h-9 w-9 overflow-hidden rounded bg-neutral-200">
                            {afterPreview ? (
                              <img src={afterPreview} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium leading-snug">{group.siteName}</div>
                          <div
                            className={`mt-1 flex flex-wrap items-center gap-1 text-[11px] ${
                              selected ? 'text-neutral-300' : 'text-neutral-500'
                            }`}
                          >
                            <span>
                              B{group.beforeAssets.length} · A{group.afterAssets.length}
                            </span>
                            {group.hasExistingJob ? (
                              <span
                                className={`rounded px-1.5 py-0.5 font-semibold ${
                                  selected
                                    ? 'bg-white/15 text-white'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                제작됨
                              </span>
                            ) : null}
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
                    <p className="mb-2 text-xs font-medium text-amber-800">Before · 1장 선택</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedGroup.beforeAssets.map((asset) => {
                        const display = withCleanupOverride(asset, cleanupOverrides)
                        return (
                          <AssetPickCard
                            key={asset.id}
                            asset={display}
                            active={beforeId === asset.id}
                            activeTone="before"
                            cleaned={Boolean(cleanupOverrides[asset.id])}
                            replaced={Boolean(replacedIds[asset.id])}
                            cleaning={cleaningId === asset.id}
                            replacing={replacingId === asset.id}
                            disabled={busy}
                            onSelect={() => setBeforeId(asset.id)}
                            onCleanup={() => void handleCleanup(asset)}
                            onReplaceOriginal={() => void handleReplaceOriginal(asset)}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-emerald-800">After · 1장 선택</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedGroup.afterAssets.map((asset) => {
                        const display = withCleanupOverride(asset, cleanupOverrides)
                        return (
                          <AssetPickCard
                            key={asset.id}
                            asset={display}
                            active={afterId === asset.id}
                            activeTone="after"
                            cleaned={Boolean(cleanupOverrides[asset.id])}
                            replaced={Boolean(replacedIds[asset.id])}
                            cleaning={cleaningId === asset.id}
                            replacing={replacingId === asset.id}
                            disabled={busy}
                            onSelect={() => setAfterId(asset.id)}
                            onCleanup={() => void handleCleanup(asset)}
                            onReplaceOriginal={() => void handleReplaceOriginal(asset)}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!beforeAsset || busy}
                    onClick={() => beforeAssetRaw && void handleCleanup(beforeAssetRaw)}
                  >
                    {cleaningId && beforeId && cleaningId === beforeId ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eraser className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    선택 Before 사람 제거
                  </Button>
                  {selectedGroup.hasExistingJob ? (
                    <p className="text-xs text-amber-700">
                      이 그룹에 이미 제작된 타임랩스가 있을 수 있습니다. 만들면 확인창이 뜹니다.
                    </p>
                  ) : null}
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
          <Button type="button" onClick={() => void handleCreate()} disabled={!canCreate}>
            {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Video className="mr-1.5 h-4 w-4" />}
            새 카드 만들고 타임랩스 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
