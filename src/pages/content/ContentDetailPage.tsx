import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import ContentWorkspaceShell from '@/components/content/ContentWorkspaceShell'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildFreshnessHint } from '@/lib/contentWorkspaceFreshness'
import { getContentWorkspaceService, type ContentSourceRecord } from '@/lib/contentWorkspaceService'
import {
  formatMockDate,
  type MockActivityLog,
  type MockContentItem,
  type MockDerivative,
  type MockDistribution,
} from './mockContentData'
import { readContentDetailPrefs, writeContentDetailPrefs } from './contentPrefs'

export default function ContentDetailPage() {
  const workspaceService = getContentWorkspaceService()
  const { id: rawId = '' } = useParams()
  const id = decodeURIComponent(rawId)
  const [searchParams] = useSearchParams()
  const item = workspaceService.getItem(id)
  const [draft, setDraft] = useState<MockContentItem | null>(item)
  const [lastHealthCheckedAt, setLastHealthCheckedAt] = useState(() => workspaceService.now())
  const [lastJobsLoadedAt, setLastJobsLoadedAt] = useState(() => workspaceService.now())
  const [activeTab, setActiveTab] = useState(() => readContentDetailPrefs(id).activeTab)
  const [selectedChannel, setSelectedChannel] = useState(() => readContentDetailPrefs(id).selectedChannel)
  const [sourceLinks, setSourceLinks] = useState<ContentSourceRecord[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)

  useEffect(() => {
    setDraft(workspaceService.getItem(id))
  }, [id, workspaceService])

  useEffect(() => {
    let cancelled = false
    async function refreshFromSource() {
      await workspaceService.refreshSnapshot()
      if (cancelled) return
      setDraft(workspaceService.getItem(id))
      setLastJobsLoadedAt(workspaceService.now())
    }
    void refreshFromSource()
    return () => {
      cancelled = true
    }
  }, [id, workspaceService])

  useEffect(() => {
    const saved = readContentDetailPrefs(id)
    setActiveTab(saved.activeTab)
    setSelectedChannel(saved.selectedChannel)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setSourcesLoading(true)
    async function loadSources() {
      const next = await workspaceService.listSourcesByContent(id)
      if (cancelled) return
      setSourceLinks(next)
      setSourcesLoading(false)
    }
    void loadSources()
    return () => {
      cancelled = true
    }
  }, [id, lastJobsLoadedAt, workspaceService])

  useEffect(() => {
    const nextTab = searchParams.get('tab')
    const nextChannel = searchParams.get('channel')
    if (nextTab) setActiveTab(nextTab)
    if (nextChannel) setSelectedChannel(nextChannel)
  }, [searchParams])

  useEffect(() => {
    writeContentDetailPrefs(id, activeTab, selectedChannel)
  }, [activeTab, id, selectedChannel])

  const jobs = useMemo(() => workspaceService.listJobsByContent(id), [id, lastJobsLoadedAt, draft?.updatedAt, workspaceService])
  const derivatives = useMemo(
    () => workspaceService.listDerivativesByContent(id),
    [id, lastJobsLoadedAt, draft?.updatedAt, workspaceService]
  )
  const activityLogs = useMemo(
    () => workspaceService.listActivityLogsByContent(id),
    [id, lastJobsLoadedAt, draft?.updatedAt, workspaceService]
  )
  const distributions = useMemo(() => {
    const items = workspaceService.listDistributionsByContent(id)
    if (!selectedChannel) return items
    return [...items].sort((a, b) => {
      if (a.channel === selectedChannel) return -1
      if (b.channel === selectedChannel) return 1
      return a.channel.localeCompare(b.channel, 'ko')
    })
  }, [id, lastJobsLoadedAt, draft?.updatedAt, selectedChannel, workspaceService])
  const operationsBrief = useMemo(() => {
    if (!draft) return '콘텐츠를 불러오는 중입니다.'
    const topDistribution = distributions[0]
    const failedJob = jobs.find((job) => job.status === 'failed')
    const latestDerivative = derivatives[0]
    const latestLog = activityLogs[0]

    return [
      `${draft.siteName} · ${draft.businessType} · ${draft.region}`,
      `현재 상태는 ${draft.status}, 공개 수준은 ${draft.revealLevel}, 우선 분류는 ${draft.priorityReason} 입니다.`,
      topDistribution
        ? `우선 확인 채널은 ${topDistribution.channel}이며 현재 상태는 ${topDistribution.status} 입니다.`
        : '우선 확인할 배포 채널이 아직 없습니다.',
      failedJob
        ? `자동화 이슈는 ${failedJob.channel} ${failedJob.jobType}의 실패 건이며, 사유는 ${failedJob.errorMessage ?? '미확인'} 입니다.`
        : '현재 확인된 자동화 실패 건은 없습니다.',
      latestDerivative
        ? `가장 최근 파생 초안은 ${latestDerivative.channel}용 ${latestDerivative.title} 입니다.`
        : `현재 대표 후킹은 ${draft.derivativeHook} 입니다.`,
      latestLog
        ? `최근 활동은 ${formatMockDate(latestLog.createdAt)} 기준 ${latestLog.message}`
        : '최근 활동 로그는 아직 없습니다.',
    ].join('\n')
  }, [activityLogs, derivatives, distributions, draft, jobs])
  const lastPersistence = workspaceService.getLastPersistence()
  const recommendedActions = useMemo(() => {
    if (!draft) {
      return [
        {
          title: '콘텐츠 로딩 중',
          tone: 'slate' as const,
          body: '콘텐츠 정보를 불러온 뒤 추천 액션을 계산합니다.',
        },
      ]
    }
    const actions: Array<{ title: string; tone: 'amber' | 'sky' | 'rose' | 'slate'; body: string }> = []
    const failedJob = jobs.find((job) => job.status === 'failed')
    const notGeneratedDistribution = distributions.find((distribution) => distribution.status === 'not_generated')
    const errorDistribution = distributions.find((distribution) => distribution.status === 'error')

    if (failedJob) {
      actions.push({
        title: '자동화 실패 우선 확인',
        tone: 'rose',
        body: `${failedJob.channel} ${failedJob.jobType} 실패 사유를 확인하고 재요청 여부를 결정합니다.`,
      })
    }
    if (errorDistribution) {
      actions.push({
        title: '배포 오류 정리 필요',
        tone: 'amber',
        body: `${errorDistribution.channel} 채널의 오류 상태와 발행 URL 반영 여부를 다시 점검합니다.`,
      })
    }
    if (draft.faqTopics.length < 3 || !draft.derivativeHook.trim()) {
      actions.push({
        title: '원문/후킹 보강',
        tone: 'sky',
        body: 'FAQ 토픽과 파생 후킹을 보강해 블로그 원문과 숏츠 연결도를 높입니다.',
      })
    }
    if (notGeneratedDistribution) {
      actions.push({
        title: '채널 생성 진행',
        tone: 'slate',
        body: `${notGeneratedDistribution.channel} 채널 초안을 생성해 배포 준비도를 올립니다.`,
      })
    }
    if (actions.length === 0) {
      actions.push({
        title: '운영 상태 양호',
        tone: 'slate',
        body: '현재 기준으로 큰 차단 신호는 없습니다. 발행 또는 검수 단계로 넘어가도 됩니다.',
      })
    }
    return actions.slice(0, 3)
  }, [distributions, draft, jobs])
  const channelOverview = useMemo(() => {
    return distributions.map((distribution) => {
      const channelJobs = jobs.filter((job) => job.channel === distribution.channel)
      const channelDerivatives = derivatives.filter((derivative) => derivative.channel === distribution.channel)
      return {
        channel: distribution.channel,
        status: distribution.status,
        jobCount: channelJobs.length,
        derivativeCount: channelDerivatives.length,
        hasFailure: channelJobs.some((job) => job.status === 'failed') || distribution.status === 'error',
      }
    })
  }, [derivatives, distributions, jobs])
  const selectedDistribution = useMemo(
    () => distributions.find((distribution) => distribution.channel === selectedChannel) ?? distributions[0] ?? null,
    [distributions, selectedChannel]
  )
  const selectedChannelJobs = useMemo(
    () => jobs.filter((job) => job.channel === selectedDistribution?.channel),
    [jobs, selectedDistribution?.channel]
  )
  const selectedChannelDerivatives = useMemo(
    () => derivatives.filter((derivative) => derivative.channel === selectedDistribution?.channel),
    [derivatives, selectedDistribution?.channel]
  )
  const selectedChannelActivityLogs = useMemo(
    () => activityLogs
      .filter((log) => !selectedDistribution?.channel || log.channel === null || log.channel === selectedDistribution.channel)
      .slice(0, 4),
    [activityLogs, selectedDistribution?.channel]
  )
  const distributionReadinessChecks = useMemo(() => {
    if (!draft || !selectedDistribution) return []
    return [
      {
        label: '콘텐츠 제목',
        passed: Boolean(draft.blogTitle.trim()),
        hint: draft.blogTitle.trim() ? draft.blogTitle : '블로그 제목이 비어 있습니다.',
      },
      {
        label: 'SEO 설명',
        passed: Boolean(draft.seoDescription.trim()),
        hint: draft.seoDescription.trim() ? '설명이 준비되어 있습니다.' : 'SEO 설명이 비어 있습니다.',
      },
      {
        label: 'CTA',
        passed: Boolean(draft.ctaText.trim()),
        hint: draft.ctaText.trim() ? draft.ctaText : 'CTA가 비어 있습니다.',
      },
      {
        label: '웹훅 상태',
        passed: selectedDistribution.webhookStatus !== '연동 미설정',
        hint: `${selectedDistribution.webhookStatus} · ${selectedDistribution.status}`,
      },
      {
        label: '채널 파생 초안',
        passed: selectedChannelDerivatives.length > 0,
        hint: selectedChannelDerivatives.length > 0 ? `${selectedChannelDerivatives.length}개 초안 연결` : '선택 채널 파생 초안이 없습니다.',
      },
      {
        label: '최근 작업 맥락',
        passed: selectedChannelJobs.length > 0,
        hint: selectedChannelJobs.length > 0 ? `${selectedChannelJobs.length}개 작업 연결` : '선택 채널 작업 이력이 없습니다.',
      },
    ]
  }, [draft, selectedChannelDerivatives.length, selectedChannelJobs.length, selectedDistribution])
  const distributionActionPlan = useMemo(() => {
    if (!selectedDistribution) {
      return { disabled: true, label: '발행 완료', hint: '선택한 배포 채널이 없습니다.' }
    }
    if (selectedDistribution.status === 'published') {
      return { disabled: true, label: '발행 완료됨', hint: '이미 발행 완료 상태입니다.' }
    }
    if (selectedDistribution.webhookStatus === '연동 미설정') {
      return { disabled: true, label: '연동 필요', hint: '연동 준비가 먼저 필요합니다.' }
    }
    return { disabled: false, label: '발행 완료', hint: '최종 URL 확인 후 발행 완료로 반영합니다.' }
  }, [selectedDistribution])
  const contentDiagnostics = useMemo(() => {
    if (!draft) return []
    const issues: Array<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string; href: string }> = []
    const publishedDistributions = distributions.filter((distribution) => distribution.status === 'published')
    const failedJobs = jobs.filter((job) => job.status === 'failed')
    const errorDistributions = distributions.filter((distribution) => distribution.status === 'error')
    const missingUrlDistributions = publishedDistributions.filter((distribution) => !distribution.publishUrl)

    if (draft.status === 'published' && publishedDistributions.length === 0) {
      issues.push({
        id: `detail-published-mismatch-${draft.id}`,
        severity: 'critical',
        title: '콘텐츠 published 상태 불일치',
        description: '콘텐츠는 published 상태인데 실제 발행 완료 채널이 없습니다.',
        href: `/content/${encodeURIComponent(draft.id)}?tab=distribution`,
      })
    }
    for (const distribution of missingUrlDistributions) {
      issues.push({
        id: `detail-published-no-url-${distribution.id}`,
        severity: 'critical',
        title: `${distribution.channel} 발행 URL 누락`,
        description: '채널은 published 상태인데 publish URL 이 비어 있습니다.',
        href: `/content/${encodeURIComponent(draft.id)}?tab=distribution&channel=${encodeURIComponent(distribution.channel)}`,
      })
    }
    for (const job of failedJobs) {
      issues.push({
        id: `detail-failed-job-${job.id}`,
        severity: 'warning',
        title: `${job.channel} 자동화 실패`,
        description: job.errorMessage ?? '실패 사유가 비어 있습니다.',
        href: `/content/automation?jobId=${encodeURIComponent(job.id)}&contentId=${encodeURIComponent(draft.id)}&channel=${encodeURIComponent(job.channel)}`,
      })
    }
    for (const distribution of errorDistributions) {
      issues.push({
        id: `detail-distribution-error-${distribution.id}`,
        severity: 'warning',
        title: `${distribution.channel} 배포 오류`,
        description: '배포 상태가 error 이므로 채널 상태와 최근 작업을 재확인해야 합니다.',
        href: `/content/distribution?distributionId=${encodeURIComponent(distribution.id)}&contentId=${encodeURIComponent(draft.id)}&channel=${encodeURIComponent(distribution.channel)}`,
      })
    }
    if (derivatives.length === 0) {
      issues.push({
        id: `detail-no-derivatives-${draft.id}`,
        severity: 'info',
        title: '파생 초안 없음',
        description: '연결된 파생 초안이 없어 파생 콘텐츠 탭 점검이 필요합니다.',
        href: `/content/${encodeURIComponent(draft.id)}?tab=derivatives`,
      })
    }
    return issues.slice(0, 6)
  }, [derivatives.length, distributions, draft, jobs])
  const freshnessHint = useMemo(
    () =>
      buildFreshnessHint([
        { label: '콘텐츠 상세', actionLabel: '콘텐츠 새로고침', at: draft?.updatedAt ?? lastJobsLoadedAt },
        { label: '연동 상태', actionLabel: '연동 상태 새로고침', at: lastHealthCheckedAt },
        { label: '작업 목록', actionLabel: '작업 새로고침', at: lastJobsLoadedAt },
      ]),
    [draft?.updatedAt, lastHealthCheckedAt, lastJobsLoadedAt]
  )
  const sourceSummary = useMemo(() => {
    const showroomGroup = sourceLinks.find((source) => source.sourceKind === 'showroom_group') ?? null
    const imageAssets = sourceLinks.filter((source) => source.sourceKind === 'image_asset')
    const representativeAssets = imageAssets.slice(0, 4)
    return {
      showroomGroup,
      imageAssets,
      representativeAssets,
      showroomGroupCount: showroomGroup ? 1 : 0,
      imageAssetCount: imageAssets.length,
      totalCount: sourceLinks.length,
      spaceId: showroomGroup?.spaceId ?? representativeAssets[0]?.spaceId ?? null,
    }
  }, [sourceLinks])

  useEffect(() => {
    if (!selectedChannel && distributions[0]?.channel) {
      setSelectedChannel(distributions[0].channel)
      return
    }
    if (selectedChannel && !distributions.some((distribution) => distribution.channel === selectedChannel)) {
      setSelectedChannel(distributions[0]?.channel ?? '')
    }
  }, [distributions, selectedChannel])

  if (!draft) {
    return (
      <ContentWorkspaceShell title="콘텐츠 상세" description="선택한 콘텐츠를 찾을 수 없습니다.">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">존재하지 않는 콘텐츠입니다. 발행 큐에서 다시 선택해 주세요.</p>
          <Button asChild className="mt-4">
            <Link to="/content">발행 큐로 돌아가기</Link>
          </Button>
        </section>
      </ContentWorkspaceShell>
    )
  }

  async function refreshDetail() {
    await workspaceService.refreshSnapshot()
    setDraft(workspaceService.getItem(id))
    setSourcesLoading(true)
    setSourceLinks(await workspaceService.listSourcesByContent(id))
    setSourcesLoading(false)
    setLastJobsLoadedAt(workspaceService.now())
    toast.success('콘텐츠 상세를 새로고침했습니다.')
  }

  async function handleSaveBasic() {
    if (!draft) return
    const result = await workspaceService.persistItem(draft.id, draft)
    const nextDraft = result.state.items.find((entry) => entry.id === draft.id) ?? { ...draft, updatedAt: workspaceService.now() }
    setDraft(nextDraft)
    setLastJobsLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success('기본 정보를 Supabase에 저장했습니다.')
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 저장했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success('기본 정보를 로컬 워크스페이스에 저장했습니다.')
    }
  }

  async function handleRefreshHealth() {
    await workspaceService.refreshSnapshot()
    setDraft(workspaceService.getItem(id))
    setSourcesLoading(true)
    setSourceLinks(await workspaceService.listSourcesByContent(id))
    setSourcesLoading(false)
    setLastHealthCheckedAt(workspaceService.now())
    toast.success('연동 상태와 콘텐츠 기준을 다시 확인했습니다.')
  }

  async function handleRefreshJobs() {
    await workspaceService.refreshSnapshot()
    setDraft(workspaceService.getItem(id))
    setLastJobsLoadedAt(workspaceService.now())
    toast.success('최근 자동화 작업과 배포 상태를 새로고침했습니다.')
  }

  async function handleCreateAutomationRequest() {
    if (!draft || distributions.length === 0) return
    const result = await workspaceService.createAutomationRequest(draft.id, distributions[0].channel)
    if (result.entity) {
      setLastJobsLoadedAt(workspaceService.now())
      if (result.source === 'supabase') {
        toast.success(`${result.entity.channel} 자동화 요청을 Supabase에 생성했습니다.`)
      } else if (result.source === 'local_fallback') {
        toast.warning(`로컬에만 요청을 생성했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
      } else {
        toast.success(`${result.entity.channel} 자동화 요청을 로컬에 생성했습니다.`)
      }
    }
  }

  async function handleMarkPublished(distribution: MockDistribution) {
    const result = await workspaceService.persistDistribution(distribution.id, {
      status: 'published',
      publishUrl: distribution.publishUrl || `https://example.com/published/${distribution.contentItemId}`,
    })
    setLastJobsLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success(`${distribution.channel} 상태를 Supabase에 발행 완료로 저장했습니다.`)
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 반영했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success(`${distribution.channel} 상태를 로컬에 저장했습니다.`)
    }
  }

  async function handleCopyOperationsBrief() {
    await navigator.clipboard.writeText(operationsBrief)
    toast.success('운영 브리프를 복사했습니다.')
  }

  return (
    <ContentWorkspaceShell
      title={draft.siteName}
      description="기본 정보, 블로그 원문, 파생 콘텐츠, 배포 상태를 한 화면에서 점검하는 상세 화면입니다."
      actions={
        <>
          <Button variant="outline" asChild>
            <Link to="/content">
              <ArrowLeft className="h-4 w-4" />
              발행 큐
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void refreshDetail()}>
            <RefreshCw className="h-4 w-4" />
            콘텐츠 새로고침
          </Button>
          <Button variant="outline" onClick={() => void handleCopyOperationsBrief()}>
            <Copy className="h-4 w-4" />
            운영 브리프
          </Button>
          <Button onClick={() => void handleCreateAutomationRequest()}>자동화 요청 생성</Button>
        </>
      }
    >
      <section className="grid gap-4 lg:grid-cols-4">
        <InfoCard label="콘텐츠 준비도" value={`${draft.readinessScore}%`} />
        <InfoCard label="자동화 준비도" value={`${draft.automationScore}%`} />
        <InfoCard label="웹훅 준비" value={draft.integrationStatus} />
        <InfoCard label="마지막 콘텐츠 갱신" value={formatMockDate(draft.updatedAt)} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <InfoCard label="원천 그룹" value={sourcesLoading ? '불러오는 중' : `${sourceSummary.showroomGroupCount}건`} />
        <InfoCard label="연결 자산" value={sourcesLoading ? '불러오는 중' : `${sourceSummary.imageAssetCount}건`} />
        <InfoCard label="원천 식별" value={sourcesLoading ? '불러오는 중' : sourceSummary.spaceId ?? 'site_name 기준 연결'} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">추천 액션</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {recommendedActions.map((action) => (
              <ActionCard key={action.title} title={action.title} body={action.body} tone={action.tone} />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">채널 요약</h2>
          <div className="mt-4 space-y-3">
            {channelOverview.map((item) => (
              <div key={item.channel} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{item.channel}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${item.hasFailure ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  작업 {item.jobCount}건 · 파생 초안 {item.derivativeCount}건 {item.hasFailure ? '· 확인 필요' : '· 정상 흐름'}
                </p>
              </div>
            ))}
            {channelOverview.length === 0 ? <p className="text-sm text-slate-500">채널 요약 정보가 없습니다.</p> : null}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">원천 연결</h2>
            <p className="mt-1 text-sm text-slate-500">이 콘텐츠가 어떤 쇼룸 그룹과 이미지 자산 묶음에서 올라왔는지 보여줍니다.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            총 {sourcesLoading ? '...' : `${sourceSummary.totalCount}건`}
          </span>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">대표 원천</p>
            {sourceSummary.showroomGroup ? (
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>그룹 키 {sourceSummary.showroomGroup.showroomGroupKey ?? '미지정'}</p>
                <p>space id {sourceSummary.showroomGroup.spaceId ?? '미지정'}</p>
                <p>연결 자산 {sourceSummary.imageAssetCount}건</p>
                <p>업종 {sourceSummary.showroomGroup.businessType ?? draft.businessType}</p>
                <p>지역 {sourceSummary.showroomGroup.region ?? draft.region}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {sourcesLoading ? '원천 연결을 불러오는 중입니다.' : '아직 기록된 원천 그룹이 없습니다.'}
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 p-4">
            <p className="text-sm font-medium text-slate-900">연결된 이미지 자산 샘플</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {sourcesLoading ? (
                <p>원천 자산을 불러오는 중입니다.</p>
              ) : sourceSummary.representativeAssets.length > 0 ? (
                sourceSummary.representativeAssets.map((source) => (
                  <Link
                    key={source.id}
                    to={buildImageAssetFocusHref(source.imageAssetId)}
                    className="block rounded-xl bg-slate-50 px-3 py-3 transition hover:bg-slate-100"
                  >
                    <p className="font-medium text-slate-900">
                      {source.productName ?? '제품 미지정'} · {source.colorName ?? '색상 미지정'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      자산 ID {source.imageAssetId ?? '미지정'} · 업종 {source.businessType ?? '미지정'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      space id {source.spaceId ?? '미지정'} · 생성 {formatSourceDate(source.createdAt)}
                    </p>
                  </Link>
                ))
              ) : (
                <p>연결된 이미지 자산이 아직 없습니다.</p>
              )}
            </div>
            {sourceSummary.representativeAssets.length > 0 ? (
              <div className="mt-3">
                <Button variant="outline" asChild>
                  <Link to={buildImageAssetFocusHref(sourceSummary.representativeAssets[0]?.imageAssetId)}>
                    대표 자산 관리 열기
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span>데이터 원천 {workspaceService.getRuntime().label}</span>
          <span>·</span>
          {lastPersistence ? (
            <>
              <span>
                마지막 저장 {lastPersistence.source === 'supabase' ? 'Supabase' : lastPersistence.source === 'local_fallback' ? '로컬 fallback' : '로컬'} · {formatMockDate(lastPersistence.at)}
              </span>
              <span>·</span>
            </>
          ) : null}
          <span>연동 상태 확인 {formatMockDate(lastHealthCheckedAt)}</span>
          <span>·</span>
          <span>마지막 작업 목록 갱신 {formatMockDate(lastJobsLoadedAt)}</span>
        </div>
        {lastPersistence ? (
          <p className={`mt-2 text-xs ${lastPersistence.source === 'local_fallback' ? 'text-amber-700' : 'text-slate-500'}`}>
            {lastPersistence.message}{lastPersistence.remoteError ? ` · ${lastPersistence.remoteError}` : ''}
          </p>
        ) : null}
        <p className={`mt-2 text-xs ${freshnessHint.tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{freshnessHint.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefreshHealth}>연동 상태 새로고침</Button>
          <Button variant="outline" onClick={handleRefreshJobs}>작업 새로고침</Button>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">운영 브리프</p>
              <p className="mt-1 text-xs text-slate-500">상태 공유나 메신저 보고용으로 바로 복사해서 쓸 수 있는 자동 요약입니다.</p>
            </div>
            <Button variant="outline" onClick={() => void handleCopyOperationsBrief()}>
              <Copy className="h-4 w-4" />
              복사
            </Button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{operationsBrief}</pre>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">콘텐츠 진단</p>
              <p className="mt-1 text-xs text-slate-500">현재 콘텐츠 기준 상태 불일치와 누락 신호를 자동으로 보여줍니다.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{contentDiagnostics.length}건</span>
          </div>
          <div className="mt-3 space-y-2">
            {contentDiagnostics.length > 0 ? (
              contentDiagnostics.map((issue) => (
                <Link key={issue.id} to={issue.href} className="block rounded-xl bg-slate-50 px-3 py-3 hover:bg-slate-100">
                  <p className={`text-xs font-medium ${issue.severity === 'critical' ? 'text-rose-700' : issue.severity === 'warning' ? 'text-amber-700' : 'text-sky-700'}`}>
                    {issue.severity.toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{issue.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{issue.description}</p>
                </Link>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">현재 콘텐츠 기준으로 큰 진단 이슈는 없습니다.</p>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">기본 정보</TabsTrigger>
            <TabsTrigger value="blog">블로그 원문</TabsTrigger>
            <TabsTrigger value="derivatives">파생 콘텐츠</TabsTrigger>
            <TabsTrigger value="distribution">배포 상태</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Panel title="기본 정보" description="콘텐츠의 현재 운영 기준과 준비 상태입니다.">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  우선 분류
                  <input
                    value={draft.priorityReason}
                    onChange={(event) => setDraft({ ...draft, priorityReason: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  공개 수준
                  <select
                    value={draft.revealLevel}
                    onChange={(event) => setDraft({ ...draft, revealLevel: event.target.value as MockContentItem['revealLevel'] })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="teaser">teaser</option>
                    <option value="summary">summary</option>
                    <option value="detail">detail</option>
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  상태
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value as MockContentItem['status'] })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="idea">idea</option>
                    <option value="queued">queued</option>
                    <option value="draft">draft</option>
                    <option value="review">review</option>
                    <option value="approved">approved</option>
                    <option value="published">published</option>
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  태그
                  <input
                    value={draft.tags.join(', ')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        tags: event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <Button className="mt-4" onClick={() => void handleSaveBasic()}>기본 정보 저장</Button>
            </Panel>
          </TabsContent>

          <TabsContent value="blog">
            <Panel title="블로그 원문" description="SEO/AEO 기준의 메인 스토리 초안 영역입니다.">
              <div className="space-y-4">
                <label className="block text-sm text-slate-600">
                  제목
                  <input
                    value={draft.blogTitle}
                    onChange={(event) => setDraft({ ...draft, blogTitle: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  메타 설명
                  <textarea
                    value={draft.seoDescription}
                    onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })}
                    className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  CTA
                  <textarea
                    value={draft.ctaText}
                    onChange={(event) => setDraft({ ...draft, ctaText: event.target.value })}
                    className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  FAQ 토픽
                  <input
                    value={draft.faqTopics.join(', ')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        faqTopics: event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  파생 후킹
                  <textarea
                    value={draft.derivativeHook}
                    onChange={(event) => setDraft({ ...draft, derivativeHook: event.target.value })}
                    className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <Button onClick={() => void handleSaveBasic()}>원문 저장</Button>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="derivatives">
            <Panel title="파생 콘텐츠" description="숏츠 2경로와 채널별 영상 캡션으로 재가공하는 영역입니다.">
              {derivatives.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {derivatives.map((derivative) => (
                    <DerivativeCard key={derivative.id} derivative={derivative} />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  <MiniCard title="숏츠(블로그 기반)" body={draft.derivativeHook} />
                  <MiniCard title="숏츠(유튜브 엔진)" body="비포어/애프터 또는 시공사례 장면 순서와 CTA를 정리합니다." />
                  <MiniCard title="영상 캡션" body={draft.ctaText} />
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="distribution">
            <Panel title="배포 상태" description="채널별 상태와 최근 자동화 작업을 함께 확인합니다.">
              <div className="mb-4 flex flex-wrap gap-2">
                {distributions.map((distribution) => (
                  <button
                    key={`${distribution.id}-chip`}
                    type="button"
                    onClick={() => setSelectedChannel(distribution.channel)}
                    className={[
                      'rounded-full px-3 py-1 text-xs transition',
                      selectedChannel === distribution.channel
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    {distribution.channel}
                  </button>
                ))}
              </div>
              {selectedDistribution ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
                  <div className="space-y-3">
                    {distributions.map((distribution) => {
                      const isActive = distribution.id === selectedDistribution.id
                      const itemJobs = jobs.filter((job) => job.channel === distribution.channel)
                      const itemDerivatives = derivatives.filter((derivative) => derivative.channel === distribution.channel)
                      return (
                        <button
                          type="button"
                          key={distribution.id}
                          onClick={() => setSelectedChannel(distribution.channel)}
                          className={[
                            'w-full rounded-2xl border p-4 text-left transition',
                            isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
                          ].join(' ')}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-slate-900">{distribution.channel}</p>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${distributionStatusTone(distribution.status)}`}>
                              {distribution.status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            웹훅 상태 {distribution.webhookStatus} · 마지막 갱신 {formatMockDate(distribution.updatedAt)}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            작업 {itemJobs.length}건 · 파생 초안 {itemDerivatives.length}건
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">{selectedDistribution.channel}</p>
                      <p className="mt-2">현재 상태 {selectedDistribution.status}</p>
                      <p>웹훅 상태 {selectedDistribution.webhookStatus}</p>
                      <p>마지막 갱신 {formatMockDate(selectedDistribution.updatedAt)}</p>
                      <p className="mt-2 text-xs text-slate-500">다음 액션 {distributionActionPlan.label} · {distributionActionPlan.hint}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-medium text-slate-900">발행 준비 체크</p>
                      <div className="mt-3 space-y-2">
                        {distributionReadinessChecks.map((item) => (
                          <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className={`text-sm font-medium ${item.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {item.passed ? '준비됨' : '확인 필요'} · {item.label}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                      <p className="text-sm font-medium text-slate-900">채널 파생 초안</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedChannelDerivatives.length > 0 ? (
                          selectedChannelDerivatives.map((derivative) => (
                            <p key={derivative.id}>
                              {derivative.type} · {derivative.status} · {derivative.title}
                            </p>
                          ))
                        ) : (
                          <p>선택 채널 파생 초안이 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                      <p className="text-sm font-medium text-slate-900">최근 자동화 작업</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedChannelJobs.length > 0 ? (
                          selectedChannelJobs.map((job) => (
                            <p key={job.id}>
                              {job.channel} · {job.jobType} · {job.status} · {formatMockDate(job.updatedAt)}
                              {job.errorMessage ? ` · ${job.errorMessage}` : ''}
                            </p>
                          ))
                        ) : (
                          <p>선택 채널의 최근 자동화 작업이 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                      <p className="text-sm font-medium text-slate-900">최근 활동 로그</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedChannelActivityLogs.length > 0 ? (
                          selectedChannelActivityLogs.map((log) => (
                            <p key={log.id}>
                              {formatMockDate(log.createdAt)} · {log.channel ? `${log.channel} · ` : ''}
                              {log.message}
                            </p>
                          ))
                        ) : (
                          <p>최근 활동 로그가 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void handleMarkPublished(selectedDistribution)}
                        disabled={distributionActionPlan.disabled}
                      >
                        {distributionActionPlan.label}
                      </Button>
                      <Button variant="outline" asChild>
                        <Link to={`/content/distribution`}>배포 관리</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">배포 채널 정보가 없습니다.</p>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      </section>
    </ContentWorkspaceShell>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function MiniCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  )
}

function DerivativeCard({ derivative }: { derivative: MockDerivative }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{derivative.channel}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{derivative.title}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">{derivative.status}</span>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">후킹</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{derivative.hookText || '후킹 문구 없음'}</p>
      <p className="mt-3 text-xs font-medium text-slate-500">개요</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{derivative.outline || derivative.body || '본문 없음'}</p>
      <p className="mt-3 text-xs text-slate-400">마지막 갱신 {formatMockDate(derivative.updatedAt)}</p>
    </div>
  )
}

function ActionCard({
  title,
  body,
  tone,
}: {
  title: string
  body: string
  tone: 'amber' | 'sky' | 'rose' | 'slate'
}) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'sky'
          ? 'border-sky-200 bg-sky-50'
          : 'border-slate-200 bg-slate-50'

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  )
}

function distributionStatusTone(status: MockDistribution['status']) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-700'
  if (status === 'error') return 'bg-rose-100 text-rose-700'
  if (status === 'scheduled') return 'bg-sky-100 text-sky-700'
  if (status === 'review_pending') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function formatSourceDate(value: string | null) {
  if (!value) return '미지정'
  return formatMockDate(value)
}

function buildImageAssetFocusHref(assetId: string | null) {
  if (!assetId) return '/image-assets'
  return `/image-assets?assetId=${encodeURIComponent(assetId)}`
}
