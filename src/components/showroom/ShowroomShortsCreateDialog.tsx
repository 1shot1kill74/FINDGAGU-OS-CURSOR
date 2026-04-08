import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import {
  SHOWROOM_SHORTS_CHANNELS,
  buildShowroomShortsDraft,
  createShowroomShortsJob,
  validateBeforeAfterSelection,
  type ShowroomShortsChannel,
} from '@/lib/showroomShorts'
import { Loader2, Video, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedImages: ShowroomImageAsset[]
}

const DEFAULT_PROMPT = `Create a realistic 10-second renovation timelapse video using exactly two reference images.
The first image is the BEFORE state of the space.
The second image is the final AFTER state of the same space.
You must clearly preserve this order: start from the first image, end at the second image, and never treat the second image as the starting point.

The location is a managed study cafe / educational learning space.
Start from the exact layout, furniture arrangement, wall condition, lighting direction, and camera framing of the first image.
End with the exact completed interior, furniture arrangement, and final styling shown in the second image.

Show a believable renovation timeline in this order:
1. the original before space,
2. workers entering,
3. dismantling and demolition of the old desks, partitions, shelves, and furniture,
4. removal and cleaning,
5. installation and assembly of the new furniture and layout,
6. final cleanup,
7. reveal of the completed after space matching the second image.

Important:
- major visual changes must happen only while workers are visibly present and actively working
- do not skip directly from before to after
- do not blend the two images together
- do not start from the after image
- do not use only one image as the basis for the whole video
- do not let furniture, walls, partitions, fixtures, desks, or shelves morph, teleport, slide, disappear, or appear on their own
- no magical transition, no instant replacement, no floating objects, no warped geometry
- the transformation must be driven by visible human labor: lifting, carrying, drilling, assembling, installing, dismantling, and cleaning

Use a fixed wide camera angle, realistic indoor lighting, photorealistic construction details, smooth timelapse pacing, natural worker motion, and a clean final reveal.
Keep the room structure consistent with the source images unless workers are visibly modifying it.
The final frame must match the second image as closely as possible.

Negative prompt:
furniture morphing, empty room transformation, magical remodeling, floating furniture, disappearing objects, surreal motion, warped walls, unstable geometry, random layout change, melting objects, ghost workers, duplicated workers, broken hands, distorted tools, flickering furniture, unrealistic construction, sudden scene jump, after image used as start frame, before and after blended together, single-image interpretation`

function channelLabel(channel: ShowroomShortsChannel) {
  if (channel === 'youtube') return 'YouTube Shorts'
  if (channel === 'facebook') return 'Facebook Reels'
  return 'Instagram Reels'
}

export default function ShowroomShortsCreateDialog({ open, onOpenChange, selectedImages }: Props) {
  const selection = useMemo(() => validateBeforeAfterSelection(selectedImages), [selectedImages])
  const [promptText, setPromptText] = useState(DEFAULT_PROMPT)
  const [channels, setChannels] = useState<ShowroomShortsChannel[]>(['youtube'])
  const [loading, setLoading] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setCreatedJobId(null)
      setLoading(false)
    }
  }, [open])

  const draft = useMemo(() => {
    if (!selection.ok) return null
    return buildShowroomShortsDraft(selectedImages)
  }, [selection, selectedImages])

  const handleToggleChannel = (channel: ShowroomShortsChannel) => {
    setChannels((prev) => {
      if (prev.includes(channel)) {
        if (prev.length === 1) return prev
        return prev.filter((item) => item !== channel)
      }
      return [...prev, channel]
    })
  }

  const handleCreate = async () => {
    if (!selection.ok) {
      toast.error(selection.message)
      return
    }
    setLoading(true)
    try {
      const result = await createShowroomShortsJob({
        promptText,
        channels,
        images: selectedImages,
      })
      setCreatedJobId(result.job.id)
      toast.success('숏츠 작업을 저장했습니다. 원본 생성 요청은 서버 함수 배포 후 바로 동작합니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '숏츠 작업 저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const beforeImage = selection.ok ? selection.beforeImage : null
  const afterImage = selection.ok ? selection.afterImage : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            내부 쇼룸 숏츠 만들기
          </DialogTitle>
          <DialogDescription>
            Before 1장 + After 1장을 기준으로 원본 영상(16:9, 10초, 무음)을 만들고, 최종 YouTube Shorts용 9:16 템플릿 합성본을 준비합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 text-sm ${selection.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {selection.message}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-medium">Before</p>
              {beforeImage ? (
                <img
                  src={beforeImage.thumbnail_url || beforeImage.cloudinary_url}
                  alt="before"
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                  Before 이미지를 선택하세요
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-medium">After</p>
              {afterImage ? (
                <img
                  src={afterImage.thumbnail_url || afterImage.cloudinary_url}
                  alt="after"
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                  After 이미지를 선택하세요
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">고정 생성 옵션</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>내부 생성 엔진</li>
                <li>길이 10초</li>
                <li>원본 비율 16:9</li>
                <li>최종본 비율 9:16</li>
                <li>무음</li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">배포 채널</p>
              <div className="mt-3 space-y-2">
                {SHOWROOM_SHORTS_CHANNELS.map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={channels.includes(channel)}
                      onChange={() => handleToggleChannel(channel)}
                      className="rounded border-border"
                    />
                    {channelLabel(channel)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <label className="block text-sm font-medium">
              생성 프롬프트
              <textarea
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                rows={6}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="생성 엔진에 전달할 프롬프트를 입력하세요."
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              기본값은 현재 확정된 managed study cafe Before/After renovation timelapse 프롬프트입니다.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">자동 생성 메타데이터 초안</p>
            {draft ? (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">제목</p>
                  <Input value={draft.title} readOnly className="mt-1" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">설명</p>
                  <textarea
                    value={draft.description}
                    readOnly
                    rows={4}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">해시태그</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {draft.hashtags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">유효한 Before/After 조합을 선택하면 메타데이터 초안이 표시됩니다.</p>
            )}
          </div>

          {createdJobId ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">숏츠 작업 초안이 생성되었습니다.</p>
                  <p className="mt-1">현재 DB 저장과 원본 생성 호출 구조까지 준비되었습니다. 서버 함수 배포 후 원본 생성과 상태 조회가 연결됩니다.</p>
                  <Link to="/admin/showroom-shorts" className="mt-2 inline-block font-medium underline underline-offset-4">
                    검수 대기 화면 열기
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            닫기
          </Button>
          <Button type="button" onClick={handleCreate} disabled={loading || !selection.ok}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            숏츠 작업 초안 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
