import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  EMPTY_IMAGE_ASSET_COMMON_META,
  ImageAssetCommonMetaFields,
  type ImageAssetCommonMetaValue,
} from '@/components/image/ImageAssetCommonMetaFields'
import { getShowroomImagePreviewUrl } from '@/lib/imageAssetShowroom'
import {
  promoteAdInboxAssetsToShowroom,
  updateAdInboxSiteStatus,
  type AdInboxAsset,
  type AdInboxBatch,
  type PromoteAdInboxResult,
} from '@/lib/adInboxStudio'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  batch: AdInboxBatch | null
  onPromoted: (result: PromoteAdInboxResult) => void
}

export default function AdInboxPromoteToShowroomDialog({
  open,
  onOpenChange,
  batch,
  onPromoted,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mainAssetId, setMainAssetId] = useState<string | null>(null)
  const [justPromotedIds, setJustPromotedIds] = useState<Set<string>>(new Set())
  const [meta, setMeta] = useState<ImageAssetCommonMetaValue>({
    ...EMPTY_IMAGE_ASSET_COMMON_META,
  })
  const [submitting, setSubmitting] = useState(false)
  const [markingDone, setMarkingDone] = useState(false)

  const isPromotedAsset = (asset: AdInboxAsset) =>
    Boolean(asset.is_consultation) || justPromotedIds.has(asset.id)

  const waitingAssets = useMemo(
    () => (batch?.assets ?? []).filter((asset) => !isPromotedAsset(asset)),
    [batch, justPromotedIds],
  )
  const promotedAssets = useMemo(
    () => (batch?.assets ?? []).filter((asset) => isPromotedAsset(asset)),
    [batch, justPromotedIds],
  )

  useEffect(() => {
    if (!open || !batch) return
    setSelectedIds(new Set())
    setMainAssetId(null)
    setJustPromotedIds(new Set())
    // 대기실 임시 이름은 현장명에 넣지 않음 — 상담카드 목록에서 골라야 함
    setMeta({
      ...EMPTY_IMAGE_ASSET_COMMON_META,
      site_name: '',
      selectedSpaceOption: null,
      photo_date: batch.photoDate && batch.photoDate !== '날짜미상' ? batch.photoDate : '',
    })
  }, [open, batch?.key, batch?.photoDate])

  const toggleSelect = (asset: AdInboxAsset) => {
    if (isPromotedAsset(asset)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(asset.id)) {
        next.delete(asset.id)
        if (mainAssetId === asset.id) setMainAssetId(null)
      } else {
        next.add(asset.id)
      }
      return next
    })
  }

  const selectAllWaiting = () => {
    setSelectedIds(new Set(waitingAssets.map((asset) => asset.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setMainAssetId(null)
  }

  const handlePromote = async () => {
    if (!batch) return
    if (selectedIds.size === 0) {
      toast.error('승격할 사진을 선택해 주세요.')
      return
    }
    if (!meta.selectedSpaceOption?.consultation_id) {
      toast.error('상담카드 현장명을 검색한 뒤 목록에서 선택해 주세요. 대기실 임시 이름과는 별개입니다.')
      return
    }
    if (!meta.site_name.trim()) {
      toast.error('상담카드 현장명을 선택해 주세요.')
      return
    }
    if (!meta.product_name.trim()) {
      toast.error('제품명을 입력해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      const result = await promoteAdInboxAssetsToShowroom({
        siteId: batch.siteId,
        assetIds: [...selectedIds],
        mainAssetId,
        meta: {
          site_name: meta.site_name,
          selectedSpaceOption: meta.selectedSpaceOption,
          photo_date: meta.photo_date,
          location: meta.location,
          business_type: meta.business_type,
          product_category: meta.category,
          product_name: meta.product_name,
          color_name: meta.color_name,
          memo: meta.memo,
          before_after_role: meta.beforeAfterRole,
        },
      })
      const remainHint =
        result.remaining > 0
          ? ` 남은 ${result.remaining}장으로 제품 추가 가능`
          : ' 대기실 사진 전부 쇼룸 등록됨'
      toast.success(`${result.promoted}장 쇼룸 등록.${remainHint}`)
      setJustPromotedIds((prev) => new Set([...prev, ...selectedIds]))
      setSelectedIds(new Set())
      setMainAssetId(null)
      onPromoted(result)
      if (result.remaining === 0) {
        onOpenChange(false)
      } else {
        setMeta((prev) => ({
          ...prev,
          product_name: '',
          color_name: '',
          memo: '',
          category: '책상',
        }))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '쇼룸 승격에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkSiteDone = async () => {
    if (!batch) return
    setMarkingDone(true)
    try {
      await updateAdInboxSiteStatus(batch.siteId, 'promoted')
      toast.success('현장 카드를 대기실 완료(promoted)로 표시했습니다.')
      onPromoted({
        promoted: 0,
        remaining: waitingAssets.length,
        siteStatus: 'promoted',
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '상태 변경에 실패했습니다.')
    } finally {
      setMarkingDone(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>쇼룸으로 보내기</DialogTitle>
          <DialogDescription>
            대기실 임시 이름이 아니라 상담카드 스페이스와 매칭해야 쇼룸에 올바르게 묶입니다. 파일
            재업로드는 없고, 같은 상담 현장으로 제품별 패스를 여러 번 보낼 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {!batch ? (
          <p className="text-sm text-muted-foreground">현장 카드를 선택해 주세요.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {batch.shortName} · 쇼룸 {promotedAssets.length}장 / 대기 {waitingAssets.length}장
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={selectAllWaiting}
                  disabled={waitingAssets.length === 0 || submitting}
                >
                  대기 전체 선택
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0 || submitting}
                >
                  선택 해제
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {(batch.assets ?? []).map((asset) => {
                const preview = getShowroomImagePreviewUrl(asset)
                const promoted = isPromotedAsset(asset)
                const selected = selectedIds.has(asset.id)
                const isMain = mainAssetId === asset.id
                return (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={promoted || submitting}
                    onClick={() => toggleSelect(asset)}
                    className={`relative overflow-hidden rounded-lg border text-left transition ${
                      promoted
                        ? 'border-emerald-200 bg-emerald-50/40 opacity-70'
                        : selected
                          ? 'border-neutral-900 ring-2 ring-neutral-300'
                          : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <div className="aspect-square bg-neutral-100">
                      {preview ? (
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    {promoted ? (
                      <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        <Check className="h-3 w-3" />
                        쇼룸 등록됨
                      </span>
                    ) : selected ? (
                      <span className="absolute left-1 top-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        선택
                      </span>
                    ) : null}
                    {selected && !promoted ? (
                      <label
                        className="absolute bottom-1 left-1 right-1 flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-[10px] text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isMain}
                          onChange={() =>
                            setMainAssetId((prev) => (prev === asset.id ? null : asset.id))
                          }
                          className="rounded border-white/40"
                        />
                        대표
                      </label>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {waitingAssets.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                이 카드의 사진은 모두 쇼룸에 등록되었습니다.
              </p>
            ) : (
              <ImageAssetCommonMetaFields
                value={meta}
                onChange={(patch) => setMeta((prev) => ({ ...prev, ...patch }))}
                showRecommendedHints
                requireSpaceSelection
                siteNameHint={batch.shortName || undefined}
                beforeAfterRoleHint="이번 패스에서 선택한 사진 전체에 동일하게 적용됩니다. 제품이 섞인 장면은 사진을 나눠 여러 번 보내세요."
              />
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={!batch || markingDone || submitting || batch?.status === 'promoted'}
            onClick={() => void handleMarkSiteDone()}
          >
            {markingDone ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            대기실에서 완료
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              닫기
            </Button>
            <Button
              type="button"
              onClick={() => void handlePromote()}
              disabled={!batch || submitting || selectedIds.size === 0 || waitingAssets.length === 0}
            >
              {submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {selectedIds.size}장 이 패스 승격
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
