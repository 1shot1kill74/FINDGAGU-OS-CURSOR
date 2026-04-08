import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Video, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  approveShowroomShortsTarget,
  buildShowroomShortsPublishPackage,
  listShowroomShortsReplacementCandidates,
  listShowroomShortsJobs,
  markShowroomShortsTargetFailed,
  markShowroomShortsTargetPublished,
  pollShowroomShortsJob,
  replaceShowroomShortsJobImage,
  requestShowroomShortsGeneration,
  type ShowroomShortsJobRecord,
  type ShowroomShortsTargetRecord,
} from '@/lib/showroomShorts'
import { composeShowroomShortsJob, downloadShowroomShortsFinalAsMp4 } from '@/lib/showroomShortsComposer'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { toast } from 'sonner'

function getProgressSteps(job: ShowroomShortsJobRecord) {
  const hasRequested = !!job.kling_job_id || ['generating', 'generated', 'composited', 'ready_for_review'].includes(job.status)
  const hasGenerated = job.status === 'generated' || job.status === 'composited' || job.status === 'ready_for_review'
  const hasSourceStored = !!job.source_video_url
  const hasComposited = job.status === 'composited' || job.status === 'ready_for_review' || !!job.final_video_url
  const hasReviewReady = job.status === 'ready_for_review'

  return [
    { label: '초안 저장', done: true, current: job.status === 'draft' },
    { label: '원본 생성 요청', done: hasRequested, current: hasRequested && !hasGenerated },
    { label: '원본 생성', done: hasGenerated, current: job.status === 'generating' || job.kling_status === 'submitted' || job.kling_status === 'processing' },
    { label: '원본 저장', done: hasSourceStored, current: hasGenerated && !hasSourceStored },
    { label: '9:16 합성', done: hasComposited, current: false },
    { label: '검수 준비', done: hasReviewReady, current: hasComposited && !hasReviewReady },
  ]
}

function getGenerationButtonLabel(job: ShowroomShortsJobRecord) {
  if (job.kling_job_id || job.source_video_url || job.final_video_url) {
    return '원본 다시 생성'
  }
  return '원본 생성 요청'
}

export default function ShowroomShortsPage() {
  const [jobs, setJobs] = useState<ShowroomShortsJobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actingJobId, setActingJobId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerJob, setPickerJob] = useState<ShowroomShortsJobRecord | null>(null)
  const [pickerRole, setPickerRole] = useState<'before' | 'after'>('before')
  const [pickerAssets, setPickerAssets] = useState<ShowroomImageAsset[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSaving, setPickerSaving] = useState(false)
  const [selectedPickerAssetId, setSelectedPickerAssetId] = useState<string | null>(null)
  const [publishLinkInputs, setPublishLinkInputs] = useState<Record<string, string>>({})
  const [downloadingMp4JobId, setDownloadingMp4JobId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const nextJobs = await listShowroomShortsJobs()
      setJobs(nextJobs)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '숏츠 작업 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleRequestGeneration = async (jobId: string) => {
    setActingJobId(jobId)
    try {
      const result = await requestShowroomShortsGeneration(jobId)
      toast.success(result.message ?? '원본 생성 요청을 전달했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '원본 생성 요청에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handlePoll = async (jobId: string) => {
    setActingJobId(jobId)
    try {
      const result = await pollShowroomShortsJob(jobId)
      toast.success(result.message ?? '작업 상태를 갱신했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업 상태 갱신에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleCompose = async (job: ShowroomShortsJobRecord) => {
    setActingJobId(job.id)
    try {
      const result = await composeShowroomShortsJob(job)
      toast.success(result.message)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '9:16 합성에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleOpenReplacementPicker = async (job: ShowroomShortsJobRecord, role: 'before' | 'after') => {
    setPickerOpen(true)
    setPickerJob(job)
    setPickerRole(role)
    setPickerAssets([])
    setPickerLoading(true)
    setSelectedPickerAssetId(role === 'before' ? job.before_asset_id : job.after_asset_id)

    try {
      const candidates = await listShowroomShortsReplacementCandidates(job, role)
      setPickerAssets(candidates)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '같은 현장 사진을 불러오지 못했습니다.')
    } finally {
      setPickerLoading(false)
    }
  }

  const handleApplyReplacement = async () => {
    if (!pickerJob || !selectedPickerAssetId) return

    setPickerSaving(true)
    setActingJobId(pickerJob.id)
    try {
      await replaceShowroomShortsJobImage(pickerJob, pickerRole, selectedPickerAssetId)
      toast.success('이미지를 교체했습니다. 확인 후 원본 생성 요청을 다시 진행하세요.')
      setPickerOpen(false)
      setPickerJob(null)
      setPickerAssets([])
      setSelectedPickerAssetId(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '이미지 교체에 실패했습니다.')
    } finally {
      setPickerSaving(false)
      setActingJobId(null)
    }
  }

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} 복사 완료`)
    } catch {
      toast.error(`${label} 복사에 실패했습니다.`)
    }
  }

  const handleApproveTarget = async (target: ShowroomShortsTargetRecord) => {
    setActingJobId(target.shorts_job_id)
    try {
      await approveShowroomShortsTarget(target.id)
      toast.success('업로드 승인 완료')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '업로드 승인에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleMarkPublished = async (target: ShowroomShortsTargetRecord) => {
    setActingJobId(target.shorts_job_id)
    try {
      const linkValue = publishLinkInputs[target.id]?.trim() || ''
      await markShowroomShortsTargetPublished(target.id, {
        externalPostUrl: linkValue || null,
      })
      toast.success('게시 완료로 반영했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '게시 완료 처리에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleMarkFailed = async (target: ShowroomShortsTargetRecord) => {
    setActingJobId(target.shorts_job_id)
    try {
      await markShowroomShortsTargetFailed(target.id)
      toast.success('업로드 실패 상태로 반영했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '업로드 실패 처리에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleDownloadMp4 = async (job: ShowroomShortsJobRecord) => {
    if (!job.final_video_url) {
      toast.error('최종 영상이 없어 MP4 다운로드를 진행할 수 없습니다.')
      return
    }

    setDownloadingMp4JobId(job.id)
    try {
      await downloadShowroomShortsFinalAsMp4(job.final_video_url, `${job.id}-shorts-final`)
      toast.success('최종 영상 다운로드를 시작했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '최종 영상 다운로드에 실패했습니다.')
    } finally {
      setDownloadingMp4JobId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← 홈</Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Video className="h-6 w-6" />
              쇼룸 숏츠 검수 대기
            </h1>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()}>
            새로고침
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          현재 단계는 원본 생성 완료 후 원본 영상을 검수하고, 필요할 때만 9:16 합성을 수동으로 진행하는 흐름입니다.
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-10 text-center text-muted-foreground">
            아직 저장된 쇼룸 숏츠 작업이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">작업 ID</p>
                      <p className="font-mono text-xs text-foreground">{job.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">상태 {job.status}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">원본 생성 {job.kling_status ?? '대기'}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{job.duration_seconds}초</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{job.source_aspect_ratio} → {job.final_aspect_ratio}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{job.is_muted ? '무음' : '오디오 포함'}</span>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-4">
                      <p className="text-sm font-medium text-foreground">진행 상태</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {getProgressSteps(job).map((step) => (
                          <div
                            key={step.label}
                            className={[
                              'rounded-lg border px-3 py-2 text-sm',
                              step.done
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                : step.current
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                                  : 'border-border bg-card text-muted-foreground',
                            ].join(' ')}
                          >
                            {step.done ? '완료' : step.current ? '진행중' : '대기'} · {step.label}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Before</p>
                        {job.before_asset_url ? (
                          <img src={job.before_asset_url} alt="before" className="aspect-[4/3] w-full rounded-lg object-cover" />
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 w-full"
                          disabled={actingJobId === job.id}
                          onClick={() => void handleOpenReplacementPicker(job, 'before')}
                        >
                          Before 사진 바꾸기
                        </Button>
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">After</p>
                        {job.after_asset_url ? (
                          <img src={job.after_asset_url} alt="after" className="aspect-[4/3] w-full rounded-lg object-cover" />
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 w-full"
                          disabled={actingJobId === job.id}
                          onClick={() => void handleOpenReplacementPicker(job, 'after')}
                        >
                          After 사진 바꾸기
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-md space-y-3">
                    {job.source_video_url ? (
                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <p className="text-sm font-medium text-foreground">1. 원본 확인</p>
                        <a
                          href={job.source_video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                        >
                          원본 영상 열기
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-border bg-muted/20 p-4">
                      <p className="text-sm font-medium text-foreground">
                        {job.source_video_url ? '2. 원본 재생성 또는 상태 확인' : '1. 원본 생성'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={actingJobId === job.id}
                          onClick={() => void handleRequestGeneration(job.id)}
                        >
                          {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {getGenerationButtonLabel(job)}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={actingJobId === job.id}
                          onClick={() => void handlePoll(job.id)}
                        >
                          {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          생성 상태 확인
                        </Button>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        `생성 상태 확인`은 백그라운드에서 진행 중인 원본 생성 결과를 새로 불러오는 버튼입니다.
                      </p>
                    </div>

                    {job.source_video_url ? (
                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <p className="text-sm font-medium text-foreground">3. 합성</p>
                        <div className="mt-3">
                          <Button
                            type="button"
                            disabled={actingJobId === job.id}
                            onClick={() => void handleCompose(job)}
                          >
                            {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {job.final_video_url ? '합성 다시하기' : '합성 진행'}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {job.final_video_url ? (
                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <p className="text-sm font-medium text-foreground">4. 최종 확인</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            href={job.final_video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                          >
                            최종 영상 열기
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={downloadingMp4JobId === job.id}
                            onClick={() => void handleDownloadMp4(job)}
                          >
                            {downloadingMp4JobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            MP4 다운로드
                          </Button>
                        </div>
                        <div className="mt-4 space-y-3">
                          <p className="text-sm font-medium text-foreground">반자동 업로드</p>
                          {(job.targets ?? []).map((target) => {
                            const publishPackage = buildShowroomShortsPublishPackage(target)
                            const canApprove = target.publish_status === 'ready'
                            const canComplete = target.publish_status === 'approved'
                            const finalVideoUrl = job.final_video_url ?? ''

                            return (
                              <div key={target.id} className="rounded-xl border border-border bg-card p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-medium capitalize text-foreground">{target.channel}</p>
                                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                    {target.publish_status}
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canApprove || actingJobId === job.id}
                                    onClick={() => void handleApproveTarget(target)}
                                  >
                                    업로드 승인
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleCopy('제목', publishPackage.title)}
                                  >
                                    제목 복사
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleCopy('설명', target.channel === 'youtube' ? publishPackage.descriptionWithHashtags : publishPackage.caption)}
                                  >
                                    설명 복사
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleCopy('해시태그', publishPackage.hashtagsText)}
                                  >
                                    해시태그 복사
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleCopy('첫 댓글', publishPackage.firstComment)}
                                  >
                                    첫 댓글 복사
                                  </Button>
                                </div>

                                <details className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
                                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                                    업로드 준비 패키지 보기
                                  </summary>
                                  <div className="mt-3 space-y-3 text-sm">
                                    <div>
                                      <p className="text-xs text-muted-foreground">제목</p>
                                      <p className="mt-1 whitespace-pre-wrap text-foreground">{publishPackage.title}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">{target.channel === 'youtube' ? '설명 + 해시태그' : '캡션'}</p>
                                      <p className="mt-1 whitespace-pre-wrap text-foreground">
                                        {target.channel === 'youtube' ? publishPackage.descriptionWithHashtags : publishPackage.caption}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">첫 댓글</p>
                                      <p className="mt-1 whitespace-pre-wrap text-foreground">{publishPackage.firstComment}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">최종 영상</p>
                                      <a
                                        href={finalVideoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
                                      >
                                        최종 영상 열기
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    </div>
                                  </div>
                                </details>

                                <div className="mt-3 space-y-2">
                                  <label className="block text-xs text-muted-foreground">
                                    게시 링크 또는 게시 ID
                                    <input
                                      type="text"
                                      value={publishLinkInputs[target.id] ?? target.external_post_url ?? target.external_post_id ?? undefined}
                                      onChange={(event) =>
                                        setPublishLinkInputs((prev) => ({
                                          ...prev,
                                          [target.id]: event.target.value,
                                        }))
                                      }
                                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                                      placeholder="게시 링크나 플랫폼 게시 ID를 입력하세요."
                                    />
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={!canComplete || actingJobId === job.id}
                                      onClick={() => void handleMarkPublished(target)}
                                    >
                                      게시 완료
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={actingJobId === job.id}
                                      onClick={() => void handleMarkFailed(target)}
                                    >
                                      업로드 실패
                                    </Button>
                                    {target.external_post_url ? (
                                      <a
                                        href={target.external_post_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                                      >
                                        게시 링크 열기
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    <details className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      <summary className="cursor-pointer list-none font-medium text-foreground">
                        안내문 보기
                      </summary>
                      <p className="mt-3">
                        원본 영상을 먼저 확인하고, 마음에 들지 않으면 원본을 다시 생성하세요. 원하는 원본이 나왔을 때만 `합성 진행`으로 9:16 템플릿을 만들고, 마지막에 최종 영상을 확인하는 흐름입니다.
                      </p>
                    </details>

                    <details className="rounded-xl border border-border bg-muted/30 p-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                        배포 타깃 보기
                      </summary>
                      <div className="mt-3 space-y-3">
                        {(job.targets ?? []).map((target) => (
                          <div key={target.id} className="rounded-lg border border-border bg-card px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium capitalize">{target.channel}</p>
                              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {target.publish_status}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-foreground">{target.title}</p>
                            <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{target.description}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {target.hashtags.map((tag) => (
                                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{pickerRole === 'before' ? 'Before' : 'After'} 사진 바꾸기</DialogTitle>
            <DialogDescription>
              현재 작업과 같은 현장 폴더에 있는 {pickerRole === 'before' ? 'Before' : 'After'} 사진만 보여줍니다. 저장 후 `원본 생성 요청`을 다시 누르세요.
            </DialogDescription>
          </DialogHeader>
          {pickerLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : pickerAssets.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-10 text-center text-muted-foreground">
              같은 현장 폴더에서 선택할 수 있는 사진이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pickerAssets.map((asset) => {
                  const isSelected = selectedPickerAssetId === asset.id
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedPickerAssetId(asset.id)}
                      className={[
                        'overflow-hidden rounded-xl border text-left transition',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/40',
                      ].join(' ')}
                    >
                      <img
                        src={asset.thumbnail_url || asset.cloudinary_url}
                        alt={pickerRole}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <div className="space-y-1 p-3">
                        <p className="truncate text-xs font-medium text-foreground">{asset.site_name || asset.canonical_site_name || '현장명 없음'}</p>
                        <p className="truncate text-xs text-muted-foreground">{asset.product_name || asset.created_at || asset.id}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(false)}
                  disabled={pickerSaving}
                >
                  닫기
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleApplyReplacement()}
                  disabled={!selectedPickerAssetId || pickerSaving}
                >
                  {pickerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  사진 교체 저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
