/**
 * 내부 쇼룸 → 광고 대기실: 사진 선택 후 카드 입고만 수행 (릴스 자동 생성 없음)
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getShowroomImagePreviewUrl, type ShowroomImageAsset } from '@/lib/imageAssetShowroom'
import { createAdInboxSiteFromShowroomPhotos } from '@/lib/adInboxStudio'
import type { SiteGroup } from '@/pages/showroom/showroomPageTypes'

type Props = {
  open: boolean
  group: SiteGroup | null
  onOpenChange: (open: boolean) => void
  onSent: (result: { siteId: string; shortName: string; assetCount: number }) => void
}

function roleLabel(role: ShowroomImageAsset['before_after_role']): string | null {
  if (role === 'before') return 'Before'
  if (role === 'after') return 'After'
  return null
}

export default function ShowroomSendToAdInboxDialog({ open, group, onOpenChange, onSent }: Props) {
  const images = group?.images ?? []
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || !group) {
      setSelectedIds(new Set())
      return
    }
    const before = group.images.find((image) => image.before_after_role === 'before')
    const after =
      group.images.find((image) => image.before_after_role === 'after' && image.is_main) ??
      group.images.find((image) => image.before_after_role === 'after')
    const initial = [before?.id, after?.id].filter((id): id is string => Boolean(id))
    setSelectedIds(new Set(initial))
  }, [open, group])

  const selectedImages = useMemo(
    () => images.filter((image) => selectedIds.has(image.id)),
    [images, selectedIds],
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
    setSending(true)
    try {
      const result = await createAdInboxSiteFromShowroomPhotos({
        images: selectedImages,
        siteName: group.siteName,
      })
      toast.success(`「${result.shortName}」에 사진 ${result.assetCount}장을 대기실로 보냈습니다.`)
      onSent(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '대기실로 보내지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-sm text-neutral-700">
                카드명{' '}
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
          <Button type="button" onClick={() => void handleSend()} disabled={sending || selectedIds.size === 0}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            선택 사진 대기실로 보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
