import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Video, ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SHOWROOM_SHORTS_CHANNELS,
  buildShowroomShortsPublishPackage,
  deleteShowroomShortsJob,
  deleteFailedShowroomShortsJob,
  ensureShowroomShortsTripleTargets,
  getShowroomShortsCompositionStatus,
  listShowroomShortsReplacementCandidates,
  listShowroomShortsJobs,
  markShowroomShortsTargetFailed,
  markShowroomShortsTargetPublished,
  pollShowroomShortsJob,
  requestShowroomShortsPublishLaunch,
  requestShowroomShortsPublishPrepare,
  requestShowroomShortsComposition,
  replaceShowroomShortsJobImage,
  requestShowroomShortsGeneration,
  updateShowroomShortsTargetPreparation,
  type ShowroomShortsJobRecord,
  type ShowroomShortsTargetRecord,
} from '@/lib/showroomShorts'
import { downloadShowroomShortsFinalAsMp4 } from '@/lib/showroomShortsComposer'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { toast } from 'sonner'

function getProgressSteps(job: ShowroomShortsJobRecord) {
  const hasRequested = !!job.kling_job_id || ['generating', 'generated', 'composition_queued', 'composition_processing', 'composited', 'ready_for_review'].includes(job.status)
  const hasGenerated = ['generated', 'composition_queued', 'composition_processing', 'composited', 'ready_for_review'].includes(job.status)
  const hasSourceStored = !!job.source_video_url
  const hasComposited = job.status === 'composited' || job.status === 'ready_for_review' || !!job.final_video_url
  const isCompositing = job.status === 'composition_queued' || job.status === 'composition_processing'
  const hasReviewReady = job.status === 'ready_for_review'

  return [
    { label: '초안 저장', done: true, current: job.status === 'draft' },
    { label: '원본 생성 요청', done: hasRequested, current: hasRequested && !hasGenerated },
    { label: '원본 생성', done: hasGenerated, current: job.status === 'generating' || job.kling_status === 'submitted' || job.kling_status === 'processing' },
    { label: '원본 저장', done: hasSourceStored, current: hasGenerated && !hasSourceStored },
    { label: '9:16 합성', done: hasComposited, current: isCompositing },
    { label: '검수 준비', done: hasReviewReady, current: hasComposited && !hasReviewReady },
  ]
}

function getGenerationButtonLabel(job: ShowroomShortsJobRecord) {
  if (job.kling_job_id || job.source_video_url || job.final_video_url) {
    return '원본 다시 생성'
  }
  return '원본 생성 요청'
}

function hasActivePublish(job: ShowroomShortsJobRecord) {
  return (job.targets ?? []).some((target) => ['preparing', 'publishing'].includes(target.publish_status))
}

function pickPreparationString(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function getPreparationChecklist(target: ShowroomShortsTargetRecord) {
  const raw = target.preparation_payload?.checklist
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function formatDateTime(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ko-KR')
}

function getChannelLabel(channel: string) {
  if (channel === 'youtube') return 'YouTube'
  if (channel === 'facebook') return 'Facebook'
  if (channel === 'instagram') return 'Instagram'
  return channel
}

function getPublishStatusGuide(status: string) {
  if (status === 'ready') return '최종 MP4가 준비되어 있으며 업로드 준비를 시작할 수 있습니다.'
  if (status === 'preparing') return 'n8n이 채널별 업로드 준비를 진행 중입니다.'
  if (status === 'launch_ready') return '업로드 준비가 끝났습니다. 패키지를 확인한 뒤 론칭 승인하세요.'
  if (status === 'publishing') return '실제 퍼블리싱이 진행 중이며 callback 결과를 기다리는 상태입니다.'
  if (status === 'published') return '실제 퍼블리싱이 완료되었습니다.'
  if (status === 'failed') return '준비 또는 론칭 단계에서 실패했습니다. 오류를 확인한 뒤 재시도하세요.'
  if (status === 'approved') return '론칭 승인이 완료되어 실제 게시를 시작할 수 있습니다.'
  return `현재 상태: ${status}`
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
  
  // Package editing state
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editComment, setEditComment] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const nextJobs = await listShowroomShortsJobs()
      setJobs(nextJobs)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '숏츠 작업 목록을 불러오지 못했습니다.')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  useEffect(() => {
    void load(true)
  }, [])

  useEffect(() => {
    const hasActiveWork = jobs.some((job) =>
      job.status === 'composition_queued'
      || job.status === 'composition_processing'
      || hasActivePublish(job)
    )
    if (!hasActiveWork) return

    const timer = window.setInterval(() => {
      void load(false)
    }, 8_000)

    return () => window.clearInterval(timer)
  }, [jobs])

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
      const result = await requestShowroomShortsComposition(job.id)
      toast.success(result.message ?? 'Railway 워커 합성 요청을 등록했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Railway 워커 합성 요청에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleComposePoll = async (jobId: string) => {
    setActingJobId(jobId)
    try {
      const result = await getShowroomShortsCompositionStatus(jobId)
      const statusMessage =
        result.message ??
        (result.status === 'completed'
          ? 'Railway 워커 합성이 완료되었습니다.'
          : result.status === 'failed'
            ? result.error || 'Railway 워커 합성이 실패했습니다.'
            : `Railway 워커 상태: ${result.status}`)
      toast.success(statusMessage)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '합성 상태 확인에 실패했습니다.')
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

  const handlePrepareTarget = async (target: ShowroomShortsTargetRecord) => {
    setActingJobId(target.shorts_job_id)
    try {
      const result = await requestShowroomShortsPublishPrepare(target.id)
      toast.success(result.message ?? 'n8n 업로드 준비 요청을 전달했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '업로드 준비 요청에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleLaunchTarget = async (target: ShowroomShortsTargetRecord) => {
    const confirmed = window.confirm(`${target.channel} 채널에 실제 론칭을 시작할까요?`)
    if (!confirmed) return

    setActingJobId(target.shorts_job_id)
    try {
      const result = await requestShowroomShortsPublishLaunch(target.id)
      toast.success(result.message ?? '론칭 승인 요청을 전달했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '론칭 승인 요청에 실패했습니다.')
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

  const handleDeleteFailedJob = async (job: ShowroomShortsJobRecord) => {
    const confirmed = window.confirm('실패한 숏츠 작업을 삭제할까요? 관련 로그와 업로드 타깃도 함께 삭제됩니다.')
    if (!confirmed) return

    setActingJobId(job.id)
    try {
      await deleteFailedShowroomShortsJob(job)
      toast.success('실패한 숏츠 작업을 삭제했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '실패한 숏츠 작업 삭제에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleDeleteJob = async (job: ShowroomShortsJobRecord) => {
    const confirmed = window.confirm(
      '이 숏츠 작업을 삭제할까요?\n관련 로그와 업로드 타깃도 함께 삭제되며, 이미 외부 채널에 게시된 글은 자동으로 내려가지 않습니다.'
    )
    if (!confirmed) return

    setActingJobId(job.id)
    try {
      await deleteShowroomShortsJob(job)
      toast.success('숏츠 작업을 삭제했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '숏츠 작업 삭제에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleStartEditPackage = (targetId: string, title: string, body: string, comment: string) => {
    setEditingTargetId(targetId)
    setEditTitle(title)
    setEditBody(body)
    setEditComment(comment)
  }

  const handleCancelEditPackage = () => {
    setEditingTargetId(null)
    setEditTitle('')
    setEditBody('')
    setEditComment('')
  }

  const handleEnsureTripleTargets = async (job: ShowroomShortsJobRecord) => {
    setActingJobId(job.id)
    try {
      const result = await ensureShowroomShortsTripleTargets(job.id)
      toast.success(
        result.inserted > 0
          ? `페이스북·인스타 타깃 ${result.inserted}건을 추가했습니다.`
          : '이미 3채널 타깃이 모두 있습니다.'
      )
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '채널 타깃 추가에 실패했습니다.')
    } finally {
      setActingJobId(null)
    }
  }

  const handleSaveEditPackage = async (target: ShowroomShortsTargetRecord) => {
    if (!editTitle.trim()) {
      toast.error('제목을 입력해주세요.')
      return
    }
    
    setEditSaving(true)
    setActingJobId(target.shorts_job_id)
    try {
      await updateShowroomShortsTargetPreparation(target.id, {
        title: editTitle.trim(),
        descriptionWithHashtags: editBody.trim(),
        firstComment: editComment.trim(),
      })
      toast.success('업로드 준비 내용을 수정했습니다.')
      setEditingTargetId(null)
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내용 수정에 실패했습니다.')
    } finally {
      setEditSaving(false)
      setActingJobId(null)
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
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" asChild>
              <a href="/admin/showroom-shorts" target="_blank" rel="noopener noreferrer">
                외부 브라우저로 열기
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={() => void load(true)}>
              새로고침
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          현재 단계는 원본 생성 완료 후 Railway 워커로 최종 MP4를 만들고, n8n이 채널별 업로드 준비를 끝낸 뒤 관리자 승인을 통해 실제 론칭하는 흐름입니다.
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
            {jobs.map((job) => {
              const orderedTargets = [...(job.targets ?? [])].sort((a, b) => {
                const channelOrder = ['youtube', 'facebook', 'instagram']
                return channelOrder.indexOf(a.channel) - channelOrder.indexOf(b.channel)
              })
              const hasFailedTargets = orderedTargets.some((target) => target.publish_status === 'failed')
              const hasActiveJobWork = job.status === 'composition_queued' || job.status === 'composition_processing'
              const hasActiveTargetWork = orderedTargets.some((target) =>
                ['preparing', 'publishing'].includes(target.publish_status)
              )
              const deleteDisabled = actingJobId === job.id || hasActiveJobWork || hasActiveTargetWork

              return (
                <div key={job.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="space-y-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
                      </div>
                      <div className="flex flex-col items-start gap-2 xl:items-end">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deleteDisabled}
                          onClick={() => void handleDeleteJob(job)}
                        >
                          {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          작업 삭제
                        </Button>
                        <p className="max-w-xs text-right text-[11px] text-muted-foreground">
                          진행 중 작업은 삭제할 수 없으며, 이미 외부 채널에 게시된 글은 별도로 내려가야 합니다.
                        </p>
                        {job.status === 'failed' || hasFailedTargets ? (
                          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 xl:max-w-sm">
                            <p className="text-sm font-medium text-foreground">실패 작업 정리</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              실패한 작업은 검수 목록에서 삭제할 수 있습니다. 삭제 시 관련 로그와 배포 타깃도 함께 정리됩니다.
                            </p>
                            <Button
                              type="button"
                              variant="destructive"
                              className="mt-3"
                              disabled={actingJobId === job.id}
                              onClick={() => void handleDeleteFailedJob(job)}
                            >
                              {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              실패 작업 삭제
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_320px]">
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">진행 상태</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
                          <div className="rounded-2xl border border-border bg-muted/20 p-3">
                            <p className="mb-2 text-xs text-muted-foreground">Before</p>
                            {job.before_asset_url ? (
                              <img src={job.before_asset_url} alt="before" className="aspect-[4/3] w-full rounded-xl object-cover" />
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-3 w-full"
                              disabled={actingJobId === job.id}
                              onClick={() => void handleOpenReplacementPicker(job, 'before')}
                            >
                              Before 사진 바꾸기
                            </Button>
                          </div>

                          <div className="rounded-2xl border border-border bg-muted/20 p-3">
                            <p className="mb-2 text-xs text-muted-foreground">After</p>
                            {job.after_asset_url ? (
                              <img src={job.after_asset_url} alt="after" className="aspect-[4/3] w-full rounded-xl object-cover" />
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-3 w-full"
                              disabled={actingJobId === job.id}
                              onClick={() => void handleOpenReplacementPicker(job, 'after')}
                            >
                              After 사진 바꾸기
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">1. 원본 확인</p>
                          <p className="mt-1 text-xs text-muted-foreground">원본 영상 열기</p>
                          {job.source_video_url ? (
                            <a
                              href={job.source_video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                            >
                              원본 영상 열기
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <p className="mt-3 text-xs text-muted-foreground">아직 원본 영상이 없습니다.</p>
                          )}
                        </div>

                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">2. 원본 재생성 또는 상태 확인</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={actingJobId === job.id}
                              onClick={() => void handleRequestGeneration(job.id)}
                            >
                              {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {getGenerationButtonLabel(job)}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={actingJobId === job.id}
                              onClick={() => void handlePoll(job.id)}
                            >
                              {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              생성 상태 확인
                            </Button>
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">
                            원본 생성이 끝났는지 백그라운드 상태를 다시 불러옵니다.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">3. 합성</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={actingJobId === job.id || !job.source_video_url}
                              onClick={() => void handleCompose(job)}
                            >
                              {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {job.final_video_url ? '워커 합성 다시하기' : '워커 합성 요청'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={actingJobId === job.id}
                              onClick={() => void handleComposePoll(job.id)}
                            >
                              {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              합성 상태 확인
                            </Button>
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">
                            합성 요청 후에는 워커가 최종 MP4를 생성합니다.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border bg-muted/20 p-4">
                          <p className="text-sm font-medium text-foreground">4. 최종 확인</p>
                          <p className="mt-1 text-xs text-muted-foreground">최종 영상 확인</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {job.final_video_url ? (
                              <a
                                href={job.final_video_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                              >
                                최종 영상 열기
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <p className="text-xs text-muted-foreground">아직 최종 MP4가 없습니다.</p>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!job.final_video_url || downloadingMp4JobId === job.id}
                              onClick={() => void handleDownloadMp4(job)}
                            >
                              {downloadingMp4JobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              MP4 다운로드
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {job.final_video_url ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">채널별 승인형 퍼블리싱</p>
                          <p className="text-xs text-muted-foreground">업로드 준비 확인 후 채널별로 론칭 승인하세요.</p>
                        </div>
                        {orderedTargets.length < SHOWROOM_SHORTS_CHANNELS.length ? (
                          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-foreground">
                              DB에 저장된 퍼블리시 타깃이 {orderedTargets.length}개뿐입니다. 예전처럼 3열(유튜브·페이스북·인스타)로 검수하려면 타깃 행을 맞춰 주세요.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="shrink-0"
                              disabled={actingJobId === job.id}
                              onClick={() => void handleEnsureTripleTargets(job)}
                            >
                              {actingJobId === job.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              3채널 타깃 맞추기
                            </Button>
                          </div>
                        ) : null}
                        <div className="grid gap-4 xl:grid-cols-3">
                          {orderedTargets.map((target) => {
                            const publishPackage = buildShowroomShortsPublishPackage(target)
                            const canPrepare = ['ready', 'failed', 'launch_ready', 'approved'].includes(target.publish_status)
                            const canLaunch = ['launch_ready', 'approved'].includes(target.publish_status)
                            const canEditPackage = !['preparing', 'publishing'].includes(target.publish_status)
                            const isPreparing = target.publish_status === 'preparing'
                            const isPublishing = target.publish_status === 'publishing'
                            const preparedTitle =
                              pickPreparationString(target.preparation_payload, ['preparedTitle', 'title', 'videoTitle'])
                              ?? publishPackage.title
                            const preparedBody =
                              pickPreparationString(
                                target.preparation_payload,
                                target.channel === 'youtube'
                                  ? ['descriptionWithHashtags', 'description', 'caption']
                                  : ['caption', 'description', 'descriptionWithHashtags']
                              )
                              ?? (target.channel === 'youtube' ? publishPackage.descriptionWithHashtags : publishPackage.caption)
                            const preparedFirstComment =
                              pickPreparationString(target.preparation_payload, ['firstComment', 'comment'])
                              ?? publishPackage.firstComment
                            const preparedPreviewUrl = pickPreparationString(
                              target.preparation_payload,
                              ['previewUrl', 'draftUrl', 'platformDraftUrl', 'uploadUrl']
                            )
                            const preparationChecklist = getPreparationChecklist(target)

                            return (
                              <div key={target.id} className="flex h-full flex-col rounded-2xl border border-border bg-muted/20 p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-lg font-semibold text-foreground">{getChannelLabel(target.channel)}</p>
                                  <span className="rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground">
                                    {target.publish_status}
                                  </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!canPrepare || actingJobId === job.id}
                                    onClick={() => void handlePrepareTarget(target)}
                                  >
                                    {actingJobId === job.id && isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    {target.publish_status === 'launch_ready' ? '업로드 준비 다시 요청' : '업로드 준비 요청'}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={!canLaunch || actingJobId === job.id}
                                    onClick={() => void handleLaunchTarget(target)}
                                  >
                                    {actingJobId === job.id && isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    론칭 승인
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

                                <div className="mt-4 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                                  <p>{getPublishStatusGuide(target.publish_status)}</p>
                                  <div className="mt-3 grid gap-1">
                                    {target.prepared_at ? <p>준비 완료 시각: {formatDateTime(target.prepared_at)}</p> : null}
                                    {target.launch_ready_at ? <p>승인 대기 시각: {formatDateTime(target.launch_ready_at)}</p> : null}
                                    {target.published_at ? <p>게시 완료 시각: {formatDateTime(target.published_at)}</p> : null}
                                  </div>
                                </div>

                                {target.preparation_error ? (
                                  <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                                    준비/론칭 오류: {target.preparation_error}
                                  </div>
                                ) : null}

                                <details className="mt-4 rounded-xl border border-border bg-card p-3">
                                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                                    업로드 준비 패키지 보기
                                  </summary>
                                  {editingTargetId === target.id ? (
                                    <div className="mt-3 space-y-4 text-sm">
                                      <div>
                                        <p className="mb-1 text-xs text-muted-foreground">제목</p>
                                        <input
                                          type="text"
                                          value={editTitle}
                                          onChange={(e) => setEditTitle(e.target.value)}
                                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                                        />
                                      </div>
                                      <div>
                                        <p className="mb-1 text-xs text-muted-foreground">{target.channel === 'youtube' ? '설명 + 해시태그' : '캡션'}</p>
                                        <textarea
                                          value={editBody}
                                          onChange={(e) => setEditBody(e.target.value)}
                                          rows={5}
                                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                                        />
                                      </div>
                                      <div>
                                        <p className="mb-1 text-xs text-muted-foreground">첫 댓글</p>
                                        <textarea
                                          value={editComment}
                                          onChange={(e) => setEditComment(e.target.value)}
                                          rows={2}
                                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2 pt-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={editSaving}
                                          onClick={handleCancelEditPackage}
                                        >
                                          취소
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={editSaving}
                                          onClick={() => void handleSaveEditPackage(target)}
                                        >
                                          {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                          저장
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 space-y-3 text-sm">
                                      <div className="flex justify-end">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          disabled={!canEditPackage || actingJobId === job.id}
                                          onClick={() => handleStartEditPackage(target.id, preparedTitle, preparedBody, preparedFirstComment)}
                                        >
                                          내용 수정
                                        </Button>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">제목</p>
                                        <p className="mt-1 whitespace-pre-wrap text-foreground">{preparedTitle}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">{target.channel === 'youtube' ? '설명 + 해시태그' : '캡션'}</p>
                                        <p className="mt-1 whitespace-pre-wrap text-foreground">{preparedBody}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">첫 댓글</p>
                                        <p className="mt-1 whitespace-pre-wrap text-foreground">{preparedFirstComment}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">최종 영상</p>
                                        <a
                                          href={job.final_video_url ?? ''}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
                                        >
                                          최종 영상 열기
                                          <ExternalLink className="h-4 w-4" />
                                        </a>
                                      </div>
                                      {preparedPreviewUrl ? (
                                        <div>
                                          <p className="text-xs text-muted-foreground">n8n 준비 결과 링크</p>
                                          <a
                                            href={preparedPreviewUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
                                          >
                                            준비 결과 열기
                                            <ExternalLink className="h-4 w-4" />
                                          </a>
                                        </div>
                                      ) : null}
                                      {preparationChecklist.length > 0 ? (
                                        <div>
                                          <p className="text-xs text-muted-foreground">체크리스트</p>
                                          <div className="mt-1 space-y-1">
                                            {preparationChecklist.map((item) => (
                                              <p key={item} className="text-foreground">- {item}</p>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </details>

                                <div className="mt-4 space-y-2">
                                  <label className="block text-xs text-muted-foreground">
                                    수동 보정용 게시 링크 또는 게시 ID
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
                                      disabled={actingJobId === job.id}
                                      onClick={() => void handleMarkPublished(target)}
                                    >
                                      수동 게시 완료
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={actingJobId === job.id}
                                      onClick={() => void handleMarkFailed(target)}
                                    >
                                      수동 실패 처리
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

                    <details className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      <summary className="cursor-pointer list-none font-medium text-foreground">
                        안내문 보기
                      </summary>
                      <p className="mt-3">
                        원본 영상을 먼저 확인하고, 원하는 결과가 나왔을 때만 `워커 합성 요청`으로 최종 MP4를 만듭니다. 이후 각 채널별 `업로드 준비 요청`은 n8n이 처리하고, 준비가 끝난 타깃만 `론칭 승인`으로 실제 게시를 시작합니다.
                      </p>
                    </details>
                  </div>
                </div>
              )
            })}
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
