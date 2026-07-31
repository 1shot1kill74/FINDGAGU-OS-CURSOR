/**
 * 내부 쇼룸 → 광고 대기실: 사진 선택 후 기존/새 카드에 입고 (릴스 자동 생성 없음)
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getShowroomImagePreviewUrl, type ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import {
  addShowroomPhotosToAdInboxSite,
  createAdInboxSiteFromShowroomPhotos,
  listAdInboxSites,
  suggestAdInboxSiteForShowroom,
  type AdInboxSite,
} from '@/lib/adInboxStudio'
import type { SiteGroup } from '@/pages/showroom/showroomPageTypes'

type Props = {
  open: boolean
  group: SiteGroup | null
  onOpenChange: (open: boolean) => void
  onSent: (result: { siteId: string; shortName: string; assetCount: number }) => void
}

type TargetMode = 'existing' | 'new'

function roleLabel(role: ShowroomImageAsset['before_after_role']): string | null {
  if (role === 'before') return 'Before'
  if (role === 'after') return 'After'
  return null
}

export default function ShowroomSendToAdInboxDialog({ open, group, onOpenChange, onSent }: Props) {
  const images = group?.images ?? []
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sending, setSending] = useState(false)
  const [sites, setSites] = useState<AdInboxSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [targetMode, setTargetMode] = useState<TargetMode>('existing')
  const [targetSiteId, setTargetSiteId] = useState('')

  useEffect(() => {
    if (!open || !group) {
      setSelectedIds(new Set())
      setTargetMode('existing')
      setTargetSiteId('')
      setSites([])
      return
    }
    const before = group.images.find((image) => image.before_after_role === 'before')
    const after =
      group.images.find((image) => image.before_after_role === 'after' && image.is_main) ??
      group.images.find((image) => image.before_after_role === 'after')
    const initial = [before?.id, after?.id].filter((id): id is string => Boolean(id))
    setSelectedIds(new Set(initial))

    let cancelled = false
    setSitesLoading(true)
    void listAdInboxSites()
      .then((rows) => {
        if (cancelled) return
        setSites(rows)
        if (rows.length === 0) {
          setTargetMode('new')
          setTargetSiteId('')
          return
        }
        setTargetMode('existing')
        const suggested = suggestAdInboxSiteForShowroom({
          sites: rows,
          siteName: group.siteName,
          images: group.images,
        })
        setTargetSiteId(suggested?.id ?? '')
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : '대기실 카드를 불러오지 못했습니다.')
        setSites([])
        setTargetMode('new')
      })
      .finally(() => {
        if (!cancelled) setSitesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, group])

  const selectedImages = useMemo(
    () => images.filter((image) => selectedIds.has(image.id)),
    [images, selectedIds],
  )

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === targetSiteId) ?? null,
    [sites, targetSiteId],
  )

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(images.map((image) => image.id)))
  const clearAll = () => setSelectedIds(new Set())

  const handleSend = async () => {
    if (!group) return
    if (selectedImages.length === 0) {
      toast.error('보낼 사진을 한 장 이상 선택하세요.')
      return
    }
    if (targetMode === 'existing' && !targetSiteId) {
      toast.error('추가할 대기실 카드를 선택하세요.')
      return
    }
    setSending(true)
    try {
      const result =
        targetMode === 'existing'
          ? await addShowroomPhotosToAdInboxSite({
              siteId: targetSiteId,
              images: selectedImages,
            })
          : await createAdInboxSiteFromShowroomPhotos({
              images: selectedImages,
              siteName: group.siteName,
            })
      toast.success(
        targetMode === 'existing'
          ? `「${result.shortName}」에 사진 ${result.assetCount}장을 추가했습니다.`
          : `「${result.shortName}」에 사진 ${result.assetCount}장을 대기실로 보냈습니다.`,
      )
      onSent(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '대기실로 보내지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const canSend =
    selectedIds.size > 0 &&
    !sending &&
    !sitesLoading &&
    (targetMode === 'new' || Boolean(targetSiteId))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            광고대기실로 보내기
          </DialogTitle>
          <DialogDescription>
            중간 랜딩·작업에 쓸 사진을 고른 뒤 대기실 카드로만 보냅니다. 릴스(타임랩스)는 대기실에서
            Before/After를 고른 뒤 만드세요.
          </DialogDescription>
        </DialogHeader>

        {group ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
              <p className="text-xs font-medium text-neutral-600">보낼 대상</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ['existing', '기존 카드에 추가'],
                    ['new', '새 카드 만들기'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={sending || sitesLoading || (value === 'existing' && sites.length === 0)}
                    onClick={() => setTargetMode(value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      targetMode === value
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {targetMode === 'existing' ? (
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-neutral-600">대기실 작업카드</span>
                  {sitesLoading ? (
                    <p className="flex items-center gap-2 text-xs text-neutral-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      카드 목록 불러오는 중…
                    </p>
                  ) : sites.length === 0 ? (
                    <p className="text-xs text-amber-700">
                      대기실에 카드가 없습니다. 「새 카드 만들기」를 선택하세요.
                    </p>
                  ) : (
                    <>
                      <select
                        value={targetSiteId}
                        onChange={(e) => setTargetSiteId(e.target.value)}
                        disabled={sending}
                        className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
                      >
                        <option value="">카드를 선택하세요</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.short_name}
                            {site.photo_date ? ` · ${site.photo_date}` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedSite ? (
                        <p className="mt-1.5 text-xs text-neutral-500">
                          선택됨: <span className="font-medium text-neutral-800">{selectedSite.short_name}</span>
                        </p>
                      ) : null}
                    </>
                  )}
                </label>
              ) : (
                <p className="mt-3 text-sm text-neutral-700">
                  새 카드명{' '}
                  <span className="font-semibold text-neutral-900">{group.siteName}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-sm text-neutral-700">
                쇼룸 현장{' '}
                <span className="font-semibold text-neutral-900">{group.siteName}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  {selectedIds.size}/{images.length}장 선택
                </span>
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={sending}>
                  전체 선택
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={sending}>
                  선택 해제
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((image) => {
                const selected = selectedIds.has(image.id)
                const label = roleLabel(image.before_after_role)
                return (
                  <button
                    key={image.id}
                    type="button"
                    disabled={sending}
                    onClick={() => toggle(image.id)}
                    className={`overflow-hidden rounded-xl border bg-white text-left transition ${
                      selected
                        ? 'border-sky-500 ring-2 ring-sky-200'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-neutral-100">
                      <img
                        src={getShowroomImagePreviewUrl(image)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      {label ? (
                        <span
                          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${
                            image.before_after_role === 'after' ? 'bg-emerald-600/90' : 'bg-black/75'
                          }`}
                        >
                          {label}
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="absolute right-2 top-2 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          선택
                        </span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            취소
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {targetMode === 'existing' ? '선택한 카드에 추가' : '새 카드로 보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
