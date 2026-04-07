import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Video, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  listShowroomShortsJobs,
  pollShowroomShortsJob,
  requestShowroomShortsGeneration,
  type ShowroomShortsJobRecord,
} from '@/lib/showroomShorts'
import { toast } from 'sonner'

export default function ShowroomShortsPage() {
  const [jobs, setJobs] = useState<ShowroomShortsJobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actingJobId, setActingJobId] = useState<string | null>(null)

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
      toast.success(result.message ?? 'Kling 생성 요청을 전달했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kling 생성 요청에 실패했습니다.')
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
          현재 단계는 초안 저장, Kling 생성 요청/상태 조회, 검수 대기 관리입니다. 9:16 템플릿 합성과 채널 퍼블리시는 다음 단계에서 연결됩니다.
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
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Kling {job.kling_status ?? '대기'}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{job.duration_seconds}초</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{job.source_aspect_ratio} → {job.final_aspect_ratio}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{job.is_muted ? '무음' : '오디오 포함'}</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Before</p>
                        {job.before_asset_url ? (
                          <img src={job.before_asset_url} alt="before" className="aspect-[4/3] w-full rounded-lg object-cover" />
                        ) : null}
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">After</p>
                        {job.after_asset_url ? (
                          <img src={job.after_asset_url} alt="after" className="aspect-[4/3] w-full rounded-lg object-cover" />
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">프롬프트</p>
                      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{job.prompt_text}</p>
                    </div>
                  </div>

                  <div className="w-full max-w-md space-y-3">
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-sm font-medium">배포 타깃</p>
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
                    </div>

                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      Kling 원본 생성과 상태 조회까지 연결되었습니다. 9:16 템플릿 합성과 YouTube/Facebook/Instagram 퍼블리시는 다음 단계에서 붙입니다.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={actingJobId === job.id}
                        onClick={() => void handleRequestGeneration(job.id)}
                      >
                        {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Kling 생성 요청
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={actingJobId === job.id}
                        onClick={() => void handlePoll(job.id)}
                      >
                        {actingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        상태 갱신
                      </Button>
                    </div>

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
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
