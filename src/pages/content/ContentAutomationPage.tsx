import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import ContentWorkspaceShell from '@/components/content/ContentWorkspaceShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildContentAutomationPayload, dispatchContentAutomation } from '@/lib/contentAutomationDispatch'
import { buildContentDiagnosticSummary } from '@/lib/contentWorkspaceDiagnostics'
import { buildFreshnessHint } from '@/lib/contentWorkspaceFreshness'
import { getContentWorkspaceService } from '@/lib/contentWorkspaceService'
import { formatMockDate, type MockAutomationJob } from './mockContentData'
import { readContentAutomationPrefs, writeContentAutomationPrefs } from './contentPrefs'

export default function ContentAutomationPage() {
  const workspaceService = getContentWorkspaceService()
  const initialSnapshot = workspaceService.readSnapshot()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => readContentAutomationPrefs().query)
  const [items, setItems] = useState<MockAutomationJob[]>(() => initialSnapshot.jobs)
  const [selectedJobId, setSelectedJobId] = useState(
    () => readContentAutomationPrefs().selectedJobId || initialSnapshot.jobs[0]?.id || ''
  )
  const [lastLoadedAt, setLastLoadedAt] = useState(() => workspaceService.now())
  const [lastHealthCheckedAt, setLastHealthCheckedAt] = useState(() => workspaceService.now())
  const snapshot = workspaceService.readSnapshot()

  const loadItems = useCallback(async () => {
    const snapshot = await workspaceService.refreshSnapshot()
    const jobs = snapshot.jobs
    setItems(jobs)
    setSelectedJobId((current) => current || jobs[0]?.id || '')
  }, [workspaceService])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    writeContentAutomationPrefs(query, selectedJobId)
  }, [query, selectedJobId])

  useEffect(() => {
    if (items.length === 0 && snapshot.jobs.length > 0) {
      setItems(snapshot.jobs)
      setSelectedJobId((current) => current || snapshot.jobs[0]?.id || '')
    }
  }, [items.length, snapshot.jobs])

  useEffect(() => {
    const requestedJobId = searchParams.get('jobId')
    const requestedContentId = searchParams.get('contentId')
    const requestedChannel = searchParams.get('channel')
    if (requestedJobId && items.some((item) => item.id === requestedJobId)) {
      setSelectedJobId(requestedJobId)
      return
    }
    if (requestedContentId || requestedChannel) {
      const matched = items.find((item) =>
        (!requestedContentId || item.contentItemId === requestedContentId)
        && (!requestedChannel || item.channel === requestedChannel)
      )
      if (matched) setSelectedJobId(matched.id)
    }
  }, [items, searchParams])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) => {
      const content = snapshot.items.find((entry) => entry.id === item.contentItemId) ?? null
      return [
        item.id,
        item.contentItemId,
        item.channel,
        item.jobType,
        item.status,
        content?.siteName ?? '',
      ].join(' ').toLowerCase().includes(normalized)
    })
  }, [items, query, snapshot.items])
  const failedFilteredCount = useMemo(
    () => filteredItems.filter((item) => item.status === 'failed').length,
    [filteredItems]
  )

  const selectedJob = filteredItems.find((item) => item.id === selectedJobId) ?? filteredItems[0] ?? null
  const selectedContent = selectedJob
    ? snapshot.items.find((item) => item.id === selectedJob.contentItemId) ?? null
    : null
  const selectedDistribution = selectedJob
    ? snapshot.distributions.find((item) => item.contentItemId === selectedJob.contentItemId && item.channel === selectedJob.channel) ?? null
    : null
  const selectedDerivatives = selectedJob
    ? snapshot.derivatives.filter((item) => item.contentItemId === selectedJob.contentItemId && item.channel === selectedJob.channel)
    : []
  const selectedActivityLogs = selectedJob
    ? snapshot.activityLogs.filter((item) => item.contentItemId === selectedJob.contentItemId).slice(0, 4)
    : []
  const diagnostics = useMemo(() => buildContentDiagnosticSummary(snapshot), [snapshot])
  const freshnessHint = useMemo(
    () =>
      buildFreshnessHint([
        { label: '연동 준비 상태', actionLabel: '상태 새로고침', at: lastHealthCheckedAt },
        { label: '목록', actionLabel: '새로고침', at: lastLoadedAt },
      ]),
    [lastHealthCheckedAt, lastLoadedAt]
  )
  const healthCards = useMemo(() => {
    const blogCount = snapshot.distributions.filter((item) => item.channel.toLowerCase().includes('blog')).length
    const blogServiceCount = snapshot.jobs.filter((item) => item.jobType === 'shorts_blog_service').length
    const youtubeEngineCount = snapshot.jobs.filter((item) => item.jobType === 'shorts_youtube_engine').length
    const failedCount = snapshot.jobs.filter((item) => item.status === 'failed').length
    return [
      { label: '블로그 발행', value: blogCount > 0 ? `${blogCount}건 연결` : '준비 필요' },
      { label: '숏츠(블로그 기반)', value: blogServiceCount > 0 ? `${blogServiceCount}건 대기/처리` : '준비 필요' },
      { label: '숏츠(유튜브 엔진)', value: youtubeEngineCount > 0 ? `${youtubeEngineCount}건 대기/처리` : '준비 필요' },
      { label: '실패 작업', value: failedCount > 0 ? `${failedCount}건 확인 필요` : '정상' },
    ]
  }, [snapshot.distributions, snapshot.jobs])
  const integrationReadiness = useMemo(() => {
    const channelStatusMap = new Map<string, '연동 미설정' | 'mock 연결' | '실URL 연결'>()

    for (const distribution of snapshot.distributions) {
      const previous = channelStatusMap.get(distribution.channel)
      if (distribution.webhookStatus === '실URL 연결') {
        channelStatusMap.set(distribution.channel, '실URL 연결')
        continue
      }
      if (distribution.webhookStatus === 'mock 연결' && previous !== '실URL 연결') {
        channelStatusMap.set(distribution.channel, 'mock 연결')
        continue
      }
      if (!previous) {
        channelStatusMap.set(distribution.channel, distribution.webhookStatus)
      }
    }

    const statuses = Array.from(channelStatusMap.values())
    const realCount = statuses.filter((item) => item === '실URL 연결').length
    const mockCount = statuses.filter((item) => item === 'mock 연결').length
    const missingCount = statuses.filter((item) => item === '연동 미설정').length
    const channelCount = statuses.length

    const status =
      channelCount === 0 || (realCount === 0 && mockCount === 0)
        ? '미설정'
        : realCount > 0 && mockCount === 0 && missingCount === 0
          ? '운영 시작 가능'
          : realCount > 0
            ? '부분 준비'
            : 'mock 단계'

    const message =
      status === '운영 시작 가능'
        ? `현재 워크스페이스 기준 ${realCount}개 채널이 실URL 연결 상태입니다. 실제 secret/권한만 확인되면 운영 검증을 이어갈 수 있습니다.`
        : status === '부분 준비'
          ? `실URL 연결 ${realCount}개, mock 연결 ${mockCount}개, 미설정 ${missingCount}개 채널이 섞여 있습니다. 실발행 대상 채널부터 우선 정리해야 합니다.`
          : status === 'mock 단계'
            ? `현재 채널 ${mockCount}개가 mock 연결 상태입니다. 내부 검증은 가능하지만 실운영 시작 상태로 보기는 어렵습니다.`
            : '채널별 연동 상태가 아직 준비되지 않았습니다. URL 또는 연결 조건부터 먼저 점검해야 합니다.'

    return {
      status,
      channelCount,
      realCount,
      mockCount,
      missingCount,
      message,
    }
  }, [snapshot.distributions])
  const channelReadinessCards = useMemo(() => {
    const channelMap = new Map<
      string,
      {
        statuses: Set<'연동 미설정' | 'mock 연결' | '실URL 연결'>
        distributionCount: number
        jobCount: number
        failedJobs: number
        itemCount: number
      }
    >()

    for (const distribution of snapshot.distributions) {
      const current = channelMap.get(distribution.channel) ?? {
        statuses: new Set<'연동 미설정' | 'mock 연결' | '실URL 연결'>(),
        distributionCount: 0,
        jobCount: 0,
        failedJobs: 0,
        itemCount: 0,
      }
      current.statuses.add(distribution.webhookStatus)
      current.distributionCount += 1
      channelMap.set(distribution.channel, current)
    }

    for (const [channel, current] of channelMap.entries()) {
      const jobs = snapshot.jobs.filter((item) => item.channel === channel)
      const contentIds = new Set(
        snapshot.distributions
          .filter((item) => item.channel === channel)
          .map((item) => item.contentItemId)
      )
      current.jobCount = jobs.length
      current.failedJobs = jobs.filter((item) => item.status === 'failed').length
      current.itemCount = contentIds.size
      channelMap.set(channel, current)
    }

    return Array.from(channelMap.entries())
      .map(([channel, current]) => {
        const hasReal = current.statuses.has('실URL 연결')
        const hasMock = current.statuses.has('mock 연결')
        const hasMissing = current.statuses.has('연동 미설정')
        const status =
          hasReal && !hasMock && !hasMissing
            ? '운영 시작 가능'
            : hasReal
              ? '부분 준비'
              : hasMock
                ? 'mock 단계'
                : '미설정'

        const description =
          status === '운영 시작 가능'
            ? '실URL 연결 상태로만 구성되어 있습니다.'
            : status === '부분 준비'
              ? '실URL과 mock/미설정 상태가 함께 있어 채널 기준 정리가 더 필요합니다.'
              : status === 'mock 단계'
                ? '현재는 mock 연결만 있어 내부 검증 단계로 보는 편이 안전합니다.'
                : '연동 미설정 상태가 남아 있어 요청 생성 전 보완이 필요합니다.'

        return {
          channel,
          status,
          description,
          distributionCount: current.distributionCount,
          itemCount: current.itemCount,
          jobCount: current.jobCount,
          failedJobs: current.failedJobs,
        }
      })
      .sort((a, b) => {
        const rank = (value: string) =>
          value === '미설정' ? 0 : value === 'mock 단계' ? 1 : value === '부분 준비' ? 2 : 3
        return rank(a.status) - rank(b.status) || a.channel.localeCompare(b.channel, 'ko')
      })
  }, [snapshot.distributions, snapshot.jobs])
  const payloadPreview = useMemo(() => {
    if (!selectedJob) return null
    return buildContentAutomationPayload(snapshot, selectedJob)
  }, [selectedJob, snapshot])
  const readinessChecks = payloadPreview?.readiness ?? []
  const dispatchPlan = useMemo(() => {
    if (!selectedJob) return { disabled: true, nextStatus: null as MockAutomationJob['status'] | null, label: '웹훅 호출', hint: '선택한 작업이 없습니다.' }
    if (selectedJob.status === 'completed') {
      return { disabled: true, nextStatus: null as MockAutomationJob['status'] | null, label: '완료됨', hint: '이미 완료된 작업입니다.' }
    }
    if (selectedJob.status === 'failed') {
      return { disabled: true, nextStatus: null as MockAutomationJob['status'] | null, label: '재요청 필요', hint: '실패 항목은 재요청으로 새 작업을 생성합니다.' }
    }
    if (selectedJob.status === 'processing') {
      return { disabled: false, nextStatus: 'completed' as const, label: '완료 처리', hint: '처리 중 작업을 완료 상태로 반영합니다.' }
    }
    return { disabled: false, nextStatus: 'processing' as const, label: '웹훅 호출', hint: 'queued 작업을 processing 상태로 전환합니다.' }
  }, [selectedJob])
  const cascadeSummary = useMemo(() => {
    if (!selectedJob || !selectedContent) return null
    const approvedDerivatives = selectedDerivatives.filter((item) => item.status === 'approved').length
    const summary =
      selectedJob.status === 'failed'
        ? '실패 작업은 연결 채널을 오류 상태로 보고 재요청 대상으로 유지합니다.'
        : selectedJob.status === 'completed'
          ? '완료 작업은 연결 채널을 예약 또는 발행 완료 상태로 끌어올리고, 콘텐츠 상태도 승인 이상으로 맞춥니다.'
          : selectedJob.status === 'processing'
            ? '처리 중 작업은 연결 채널을 검수 대기 흐름으로 맞추고, 콘텐츠 상태를 review 기준으로 유지합니다.'
            : '대기 작업은 연결 채널 초안 상태와 콘텐츠 준비 흐름을 함께 유지합니다.'
    return {
      contentStatus: selectedContent.status,
      distributionStatus: selectedDistribution?.status ?? '없음',
      derivativeSummary: `${approvedDerivatives}/${selectedDerivatives.length} 승인`,
      summary,
    }
  }, [selectedContent, selectedDerivatives, selectedDistribution?.status, selectedJob])
  const lastPersistence = workspaceService.getLastPersistence()

  async function handleRefresh() {
    await loadItems()
    setLastLoadedAt(workspaceService.now())
    toast.success('자동화 큐를 새로고침했습니다.')
  }

  async function handleRefreshHealth() {
    const nextSnapshot = await workspaceService.refreshSnapshot()
    setItems(nextSnapshot.jobs)
    setSelectedJobId((current) => current || nextSnapshot.jobs[0]?.id || '')
    setLastHealthCheckedAt(workspaceService.now())
    toast.success('자동화 준비 상태와 요청 목록을 다시 확인했습니다.')
  }

  async function handleDispatch() {
    if (!selectedJob || !dispatchPlan.nextStatus) return
    if (selectedJob.status === 'queued') {
      if (!payloadPreview) {
        toast.error('디스패치할 payload를 만들 수 없습니다.')
        return
      }

      try {
        const dispatchResult = await dispatchContentAutomation(payloadPreview)
        const reflectedAt = dispatchResult.status === 'completed'
          ? dispatchResult.completedAt ?? workspaceService.now()
          : null

        if (selectedDistribution) {
          await workspaceService.persistDistribution(selectedDistribution.id, {
            webhookStatus: dispatchResult.webhookStatus,
            publishUrl: dispatchResult.publishUrl ?? selectedDistribution.publishUrl,
            updatedAt: workspaceService.now(),
          })
        }

        const result = await workspaceService.persistJob(selectedJob.id, {
          status: dispatchResult.status,
          reflectedAt,
          errorMessage: null,
        })
        const jobs = result.state.jobs
        setItems(jobs)
        setSelectedJobId((current) => current || jobs[0]?.id || '')
        setLastLoadedAt(workspaceService.now())
        setLastHealthCheckedAt(workspaceService.now())
        toast.success(
          `${dispatchResult.message} (${dispatchResult.mode === 'live' ? '실연동' : 'mock'} · ${dispatchResult.endpointLabel})`
        )
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : '자동화 디스패치 실패'
        const failed = await workspaceService.persistJob(selectedJob.id, {
          status: 'failed',
          reflectedAt: null,
          errorMessage: message,
        })
        setItems(failed.state.jobs)
        setSelectedJobId((current) => current || failed.state.jobs[0]?.id || '')
        setLastLoadedAt(workspaceService.now())
        toast.error(`웹훅 호출 실패: ${message}`)
        return
      }
    }

    const result = await workspaceService.persistJob(selectedJob.id, {
      status: dispatchPlan.nextStatus,
      reflectedAt: dispatchPlan.nextStatus === 'completed' ? workspaceService.now() : null,
      errorMessage: null,
    })
    const jobs = result.state.jobs
    setItems(jobs)
    setSelectedJobId((current) => current || jobs[0]?.id || '')
    setLastLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success(`${dispatchPlan.label} 결과를 Supabase 상태와 함께 반영했습니다.`)
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 반영했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success(`${dispatchPlan.label} 결과를 로컬 상태에 반영했습니다.`)
    }
  }

  async function handleRetry() {
    if (!selectedJob) return
    const result = await workspaceService.retryAutomationRequest(selectedJob.id)
    setItems(result.state.jobs)
    if (result.entity) setSelectedJobId(result.entity.id)
    setLastLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success('자동화 요청을 Supabase 큐에 다시 적재했습니다.')
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 재적재했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success('자동화 요청을 로컬 큐에 다시 적재했습니다.')
    }
  }

  async function handleRetryFailedBatch() {
    const failedTargets = filteredItems.filter((item) => item.status === 'failed')
    if (failedTargets.length === 0) {
      toast.message('현재 필터 기준으로 재요청할 실패 항목이 없습니다.')
      return
    }

    let lastState = workspaceService.readSnapshot()
    let createdCount = 0
    let fallbackCount = 0
    let failedCount = 0
    let firstCreatedJobId = ''

    for (const target of failedTargets) {
      const result = await workspaceService.retryAutomationRequest(target.id)
      lastState = result.state
      if (result.entity && !firstCreatedJobId) firstCreatedJobId = result.entity.id
      if (result.entity) createdCount += 1
      if (result.source === 'local_fallback') fallbackCount += 1
      if (!result.entity) failedCount += 1
    }

    setItems(lastState.jobs)
    if (firstCreatedJobId) setSelectedJobId(firstCreatedJobId)
    setLastLoadedAt(workspaceService.now())

    if (failedCount > 0) {
      toast.warning(`일괄 재요청 중 ${failedCount}건은 생성하지 못했습니다.`)
      return
    }
    if (fallbackCount > 0) {
      toast.warning(`실패 항목 ${createdCount}건을 재요청했지만 일부는 로컬 fallback 으로만 반영되었습니다.`)
      return
    }
    toast.success(`실패 항목 ${createdCount}건을 일괄 재요청했습니다.`)
  }

  async function handleCopyPayload() {
    if (!payloadPreview) return
    const payload = JSON.stringify(payloadPreview, null, 2)
    await navigator.clipboard.writeText(payload)
    toast.success('payload를 복사했습니다.')
  }

  async function handleCopyOpsSummary() {
    const queued = items.filter((item) => item.status === 'queued').length
    const processing = items.filter((item) => item.status === 'processing').length
    const failed = items.filter((item) => item.status === 'failed').length
    const urgent = items.find((item) => item.status === 'failed') ?? items.find((item) => item.status === 'queued') ?? null
    const blogServiceCount = items.filter((item) => item.jobType === 'shorts_blog_service').length
    const youtubeEngineCount = items.filter((item) => item.jobType === 'shorts_youtube_engine').length
    const summary = [
      `자동화 큐 요약`,
      `queued ${queued}건 / processing ${processing}건 / failed ${failed}건`,
      `블로그 기반 숏츠 ${blogServiceCount}건 / 유튜브 엔진 숏츠 ${youtubeEngineCount}건`,
      `현재 선택 ${selectedContent?.siteName ?? '없음'} · ${selectedJob?.channel ?? '-'}`,
      `우선 확인 ${urgent ? `${urgent.channel} · ${urgent.jobType} · ${urgent.status}` : '없음'}`,
    ].join('\n')
    await navigator.clipboard.writeText(summary)
    toast.success('자동화 운영 요약을 복사했습니다.')
  }

  function handleExportBackup() {
    const json = workspaceService.exportSnapshot()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `content-automation-backup-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('자동화 상태 백업을 내보냈습니다.')
  }

  return (
    <ContentWorkspaceShell
      title="자동화 큐"
      description="자동화 요청 상태, payload 검토, 재요청, 수동 디스패치를 한 화면에서 관리합니다."
      actions={
        <>
          <Button variant="outline" onClick={() => void handleCopyOpsSummary()}>운영 요약</Button>
          <Button variant="outline" onClick={handleExportBackup}>백업 내보내기</Button>
          <Button variant="outline" onClick={() => void handleRefresh()}>
            <RefreshCw className="h-4 w-4" />
            새로고침
          </Button>
          <Button variant="outline" onClick={handleRefreshHealth}>상태 새로고침</Button>
          <Button onClick={() => void handleRetryFailedBatch()}>
            실패 항목 일괄 재요청 {failedFilteredCount > 0 ? `(${failedFilteredCount})` : ''}
          </Button>
        </>
      }
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">연동 준비 상태</h2>
        <p className="mt-1 text-sm text-slate-500">현재 워크스페이스 기준 채널별 웹훅 연결 상태와 자동화 처리 가능 여부를 요약합니다.</p>
        <p className="mt-2 text-xs text-slate-400">데이터 원천 {workspaceService.getRuntime().label}</p>
        {lastPersistence ? (
          <p className={`mt-2 text-xs ${lastPersistence.source === 'local_fallback' ? 'text-amber-700' : 'text-slate-400'}`}>
            마지막 저장 {lastPersistence.source === 'supabase' ? 'Supabase' : lastPersistence.source === 'local_fallback' ? '로컬 fallback' : '로컬'} · {formatMockDate(lastPersistence.at)}
          </p>
        ) : null}
        <div className={`mt-4 rounded-2xl border p-4 ${
          integrationReadiness.status === '운영 시작 가능'
            ? 'border-emerald-200 bg-emerald-50'
            : integrationReadiness.status === '부분 준비'
              ? 'border-amber-200 bg-amber-50'
              : integrationReadiness.status === 'mock 단계'
                ? 'border-sky-200 bg-sky-50'
                : 'border-slate-200 bg-slate-50'
        }`}>
          <p className="text-sm font-semibold text-slate-900">실운영 준비도 · {integrationReadiness.status}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{integrationReadiness.message}</p>
          <p className="mt-2 text-xs text-slate-500">
            채널 {integrationReadiness.channelCount}개 · 실URL {integrationReadiness.realCount}개 · mock {integrationReadiness.mockCount}개 · 미설정 {integrationReadiness.missingCount}개
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {healthCards.map((card) => (
            <StatusCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {channelReadinessCards.map((item) => (
            <Link
              key={item.channel}
              to={`/content/distribution?channel=${encodeURIComponent(item.channel)}`}
              className="rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{item.channel}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs ${
                  item.status === '운영 시작 가능'
                    ? 'bg-emerald-100 text-emerald-700'
                    : item.status === '부분 준비'
                      ? 'bg-amber-100 text-amber-700'
                      : item.status === 'mock 단계'
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-slate-100 text-slate-600'
                }`}>
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                콘텐츠 {item.itemCount}건 · 배포 {item.distributionCount}건 · 작업 {item.jobCount}건
                {item.failedJobs > 0 ? ` · 실패 ${item.failedJobs}건` : ''}
              </p>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          확인 시각 {formatMockDate(lastHealthCheckedAt)} · 마지막 목록 갱신 {formatMockDate(lastLoadedAt)}
        </p>
        <p className={`mt-1 text-xs ${freshnessHint.tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{freshnessHint.message}</p>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">운영 요약 미리보기</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            queued {items.filter((item) => item.status === 'queued').length}건 / processing {items.filter((item) => item.status === 'processing').length}건 / failed {items.filter((item) => item.status === 'failed').length}건
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            블로그 기반 숏츠 {items.filter((item) => item.jobType === 'shorts_blog_service').length}건 / 유튜브 엔진 숏츠 {items.filter((item) => item.jobType === 'shorts_youtube_engine').length}건
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            우선 확인 대상 {items.find((item) => item.status === 'failed')?.channel ?? items.find((item) => item.status === 'queued')?.channel ?? '없음'}
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">자동 진단 요약</p>
          <p className="mt-2 text-sm text-slate-700">
            critical {diagnostics.criticalCount}건 / warning {diagnostics.warningCount}건 / info {diagnostics.infoCount}건
          </p>
          {diagnostics.issues[0] ? (
            <Link to={diagnostics.issues[0].href} className="mt-2 block text-sm text-sky-700 underline underline-offset-4">
              우선 진단: {diagnostics.issues[0].title}
            </Link>
          ) : (
            <p className="mt-2 text-sm text-slate-500">현재 자동 진단 기준으로 큰 이상 신호는 없습니다.</p>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">요청 목록</h2>
              <p className="mt-1 text-sm text-slate-500">처리 중, 실패, 재요청 대상까지 한 번에 관리합니다.</p>
            </div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="현장명, 채널, 작업유형 검색"
              className="w-full lg:max-w-xs"
            />
          </div>

          <div className="mt-4 space-y-3">
            {filteredItems.map((item) => {
              const content = workspaceService.readSnapshot().items.find((entry) => entry.id === item.contentItemId) ?? null
              const active = item.id === selectedJob?.id
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedJobId(item.id)}
                  className={[
                    'w-full rounded-2xl border p-4 text-left transition',
                    active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">{item.channel}</p>
                      <p className="mt-1 font-semibold text-slate-900">{content?.siteName ?? '미지정 콘텐츠'}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {item.jobType} · {formatMockDate(item.updatedAt)}
                  </p>
                  {item.errorMessage ? <p className="mt-2 text-sm text-rose-600">{item.errorMessage}</p> : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">요청 상세</h2>
          {selectedJob && selectedContent ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">{selectedContent.siteName}</p>
                <p className="mt-2">채널 {selectedJob.channel}</p>
                <p>작업유형 {selectedJob.jobType}</p>
                <p>상태 {selectedJob.status}</p>
                <p>최근 반영 {formatMockDate(selectedJob.reflectedAt)}</p>
                <p className="mt-2 text-xs text-slate-500">다음 액션 {dispatchPlan.label} · {dispatchPlan.hint}</p>
              </div>

              {cascadeSummary ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-900">상태 자동 반영 결과</p>
                  <p className="mt-2 text-sm text-slate-700">
                    콘텐츠 {cascadeSummary.contentStatus} · 채널 {cascadeSummary.distributionStatus} · 파생 초안 {cascadeSummary.derivativeSummary}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{cascadeSummary.summary}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">전송 준비 체크</p>
                <div className="mt-3 space-y-2">
                  {readinessChecks.map((item) => (
                    <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className={`text-sm font-medium ${item.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {item.passed ? '준비됨' : '확인 필요'} · {item.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">Payload 미리보기</p>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{JSON.stringify(payloadPreview, null, 2)}</pre>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleDispatch()} disabled={dispatchPlan.disabled}>
                  <Play className="h-4 w-4" />
                  {dispatchPlan.label}
                </Button>
                <Button variant="outline" onClick={() => void handleRetry()}>
                  <RefreshCw className="h-4 w-4" />
                  재요청
                </Button>
                <Button variant="outline" onClick={() => void handleCopyPayload()}>
                  <Copy className="h-4 w-4" />
                  payload 복사
                </Button>
                {selectedDistribution ? (
                  <Button variant="outline" asChild>
                    <Link
                      to={`/content/distribution?distributionId=${encodeURIComponent(selectedDistribution.id)}&contentId=${encodeURIComponent(selectedJob.contentItemId)}&channel=${encodeURIComponent(selectedJob.channel)}`}
                    >
                      배포 관리
                    </Link>
                  </Button>
                ) : null}
                <Button variant="outline" asChild>
                  <Link to={`/content/${encodeURIComponent(selectedJob.contentItemId)}?tab=distribution&channel=${encodeURIComponent(selectedJob.channel)}`}>콘텐츠 상세</Link>
                </Button>
              </div>

              {selectedJob.errorMessage ? <p className="text-sm text-rose-600">실패 사유: {selectedJob.errorMessage}</p> : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">선택한 요청이 없습니다.</p>
          )}
        </div>
      </section>
    </ContentWorkspaceShell>
  )
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
