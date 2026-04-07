import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import ContentWorkspaceShell from '@/components/content/ContentWorkspaceShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildContentDiagnosticSummary } from '@/lib/contentWorkspaceDiagnostics'
import { buildFreshnessHint } from '@/lib/contentWorkspaceFreshness'
import { getContentWorkspaceService } from '@/lib/contentWorkspaceService'
import { formatMockDate, type MockDistribution } from './mockContentData'
import { readContentDistributionPrefs, writeContentDistributionPrefs } from './contentPrefs'

export default function ContentDistributionPage() {
  const workspaceService = getContentWorkspaceService()
  const initialSnapshot = workspaceService.readSnapshot()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => readContentDistributionPrefs().query)
  const [items, setItems] = useState<MockDistribution[]>(() => initialSnapshot.distributions)
  const [selectedDistributionId, setSelectedDistributionId] = useState(
    () => initialSnapshot.distributions[0]?.id ?? ''
  )
  const [lastLoadedAt, setLastLoadedAt] = useState(() => workspaceService.now())
  const [lastHealthCheckedAt, setLastHealthCheckedAt] = useState(() => workspaceService.now())
  const snapshot = workspaceService.readSnapshot()

  const loadItems = useCallback(async () => {
    const snapshot = await workspaceService.refreshSnapshot()
    const nextItems = snapshot.distributions
    setItems(nextItems)
    setSelectedDistributionId((current) => current || nextItems[0]?.id || '')
  }, [workspaceService])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    writeContentDistributionPrefs(query)
  }, [query])

  useEffect(() => {
    if (items.length === 0 && snapshot.distributions.length > 0) {
      setItems(snapshot.distributions)
      setSelectedDistributionId((current) => current || snapshot.distributions[0]?.id || '')
    }
  }, [items.length, snapshot.distributions])

  useEffect(() => {
    const requestedDistributionId = searchParams.get('distributionId')
    const requestedContentId = searchParams.get('contentId')
    const requestedChannel = searchParams.get('channel')
    if (requestedDistributionId && items.some((item) => item.id === requestedDistributionId)) {
      setSelectedDistributionId(requestedDistributionId)
      return
    }
    if (requestedContentId || requestedChannel) {
      const matched = items.find((item) =>
        (!requestedContentId || item.contentItemId === requestedContentId)
        && (!requestedChannel || item.channel === requestedChannel)
      )
      if (matched) setSelectedDistributionId(matched.id)
    }
  }, [items, searchParams])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) => {
      const content = snapshot.items.find((entry) => entry.id === item.contentItemId) ?? null
      return [item.channel, item.status, content?.siteName ?? ''].join(' ').toLowerCase().includes(normalized)
    })
  }, [items, query, snapshot.items])
  const selectedDistribution = filteredItems.find((item) => item.id === selectedDistributionId) ?? filteredItems[0] ?? null
  const selectedContent = selectedDistribution
    ? snapshot.items.find((item) => item.id === selectedDistribution.contentItemId) ?? null
    : null
  const selectedJobs = selectedDistribution
    ? snapshot.jobs.filter((item) => item.contentItemId === selectedDistribution.contentItemId && item.channel === selectedDistribution.channel)
    : []
  const selectedDerivatives = selectedDistribution
    ? snapshot.derivatives.filter((item) => item.contentItemId === selectedDistribution.contentItemId && item.channel === selectedDistribution.channel)
    : []
  const selectedActivityLogs = selectedDistribution
    ? snapshot.activityLogs.filter((item) => item.contentItemId === selectedDistribution.contentItemId).slice(0, 4)
    : []
  const diagnostics = useMemo(() => buildContentDiagnosticSummary(snapshot), [snapshot])
  const freshnessHint = useMemo(
    () =>
      buildFreshnessHint([
        { label: '목록', actionLabel: '목록 새로고침', at: lastLoadedAt },
        { label: '연동 상태', actionLabel: '연동 상태 새로고침', at: lastHealthCheckedAt },
      ]),
    [lastHealthCheckedAt, lastLoadedAt]
  )
  const distributionSummary = useMemo(() => {
    const publishedCount = items.filter((item) => item.status === 'published').length
    const scheduledCount = items.filter((item) => item.status === 'scheduled').length
    const errorCount = items.filter((item) => item.status === 'error').length
    const blogCount = items.filter((item) => item.channel.toLowerCase().includes('blog')).length
    const shortsCount = items.filter((item) => item.channel.toLowerCase().includes('shorts') || item.channel.toLowerCase().includes('reels') || item.channel.toLowerCase().includes('video')).length
    const topAttention = items.find((item) => item.status === 'error' || item.status === 'review_pending' || item.status === 'not_generated')
    return [
      `배포 채널 ${items.length}건`,
      `블로그 ${blogCount}건 / 숏폼 ${shortsCount}건`,
      `발행 완료 ${publishedCount}건 / 예약 ${scheduledCount}건 / 오류 ${errorCount}건`,
      `우선 확인 대상 ${topAttention?.channel ?? '없음'}${topAttention ? ` · ${topAttention.contentItemId}` : ''}`,
    ].join('\n')
  }, [items])
  const readinessChecks = useMemo(() => {
    if (!selectedDistribution || !selectedContent) return []
    return [
      {
        label: '콘텐츠 제목',
        passed: Boolean(selectedContent.blogTitle.trim()),
        hint: selectedContent.blogTitle.trim() ? selectedContent.blogTitle : '콘텐츠 제목이 비어 있습니다.',
      },
      {
        label: 'SEO 설명',
        passed: Boolean(selectedContent.seoDescription.trim()),
        hint: selectedContent.seoDescription.trim() ? '설명이 준비되어 있습니다.' : 'SEO 설명이 비어 있습니다.',
      },
      {
        label: 'CTA',
        passed: Boolean(selectedContent.ctaText.trim()),
        hint: selectedContent.ctaText.trim() ? selectedContent.ctaText : 'CTA가 비어 있습니다.',
      },
      {
        label: '웹훅 상태',
        passed: selectedDistribution.webhookStatus !== '연동 미설정',
        hint: `${selectedDistribution.webhookStatus} · ${selectedDistribution.status}`,
      },
      {
        label: '파생 초안',
        passed: selectedDerivatives.length > 0,
        hint: selectedDerivatives.length > 0 ? `${selectedDerivatives.length}개 초안 연결` : '선택 채널의 파생 초안이 없습니다.',
      },
      {
        label: '최근 작업 맥락',
        passed: selectedJobs.length > 0,
        hint: selectedJobs.length > 0 ? `${selectedJobs.length}개 자동화 작업이 연결됨` : '연결된 자동화 작업이 없습니다.',
      },
    ]
  }, [selectedContent, selectedDerivatives.length, selectedDistribution, selectedJobs.length])
  const statusPlan = useMemo(() => {
    if (!selectedDistribution) {
      return { disabled: true, label: '발행 완료', hint: '선택한 배포 항목이 없습니다.' }
    }
    if (selectedDistribution.status === 'published') {
      return { disabled: true, label: '발행 완료됨', hint: '이미 발행 완료 상태입니다.' }
    }
    if (selectedDistribution.webhookStatus === '연동 미설정') {
      return { disabled: true, label: '연동 필요', hint: '연동 상태가 준비되지 않아 먼저 설정 확인이 필요합니다.' }
    }
    return { disabled: false, label: '발행 완료', hint: '채널 URL이 준비되면 발행 완료로 반영합니다.' }
  }, [selectedDistribution])
  const cascadeSummary = useMemo(() => {
    if (!selectedDistribution || !selectedContent) return null
    const failedJobs = selectedJobs.filter((item) => item.status === 'failed').length
    const approvedDerivatives = selectedDerivatives.filter((item) => item.status === 'approved').length
    const summary =
      selectedDistribution.status === 'published'
        ? '발행 완료 채널은 콘텐츠 전체 상태를 published 해석으로 끌어올릴 수 있습니다.'
        : selectedDistribution.status === 'error'
          ? '오류 채널은 자동화 실패와 함께 review 재정비 대상으로 해석합니다.'
          : selectedDistribution.status === 'scheduled'
            ? '예약 채널은 콘텐츠 상태를 승인 흐름으로 유지하고, 최종 URL 반영만 남긴 상태입니다.'
            : '초안/검수 단계 채널은 콘텐츠 상태와 자동화 상태를 함께 보며 다음 작업을 결정합니다.'
    return {
      contentStatus: selectedContent.status,
      failedJobs,
      derivativeSummary: `${approvedDerivatives}/${selectedDerivatives.length} 승인`,
      summary,
    }
  }, [selectedContent, selectedDerivatives, selectedDistribution, selectedJobs])
  const lastPersistence = workspaceService.getLastPersistence()

  useEffect(() => {
    if (!filteredItems.some((item) => item.id === selectedDistributionId)) {
      setSelectedDistributionId(filteredItems[0]?.id ?? '')
    }
  }, [filteredItems, selectedDistributionId])

  async function handleRefresh() {
    await loadItems()
    setLastLoadedAt(workspaceService.now())
    toast.success('배포 목록을 새로고침했습니다.')
  }

  async function handleRefreshHealth() {
    const nextSnapshot = await workspaceService.refreshSnapshot()
    setItems(nextSnapshot.distributions)
    setSelectedDistributionId((current) => current || nextSnapshot.distributions[0]?.id || '')
    setLastHealthCheckedAt(workspaceService.now())
    toast.success('배포 연동 상태와 채널 목록을 다시 확인했습니다.')
  }

  async function handleMarkPublished(item: MockDistribution) {
    const result = await workspaceService.persistDistribution(item.id, {
      status: 'published',
      publishUrl: item.publishUrl || `https://example.com/published/${item.contentItemId}`,
    })
    setItems(result.state.distributions)
    setLastLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success(`${item.channel} 상태를 Supabase에 발행 완료로 저장했습니다.`)
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 반영했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success(`${item.channel} 상태를 로컬에 저장했습니다.`)
    }
  }

  async function handleCopyDistributionSummary() {
    await navigator.clipboard.writeText(distributionSummary)
    toast.success('배포 운영 요약을 복사했습니다.')
  }

  return (
    <ContentWorkspaceShell
      title="배포 관리"
      description="채널별 상태, 발행 URL, 연동 준비 상태를 한 번에 보는 운영 보드입니다."
      actions={
        <>
          <Button variant="outline" onClick={() => void handleCopyDistributionSummary()}>
            <Copy className="h-4 w-4" />
            운영 요약
          </Button>
          <Button variant="outline" onClick={() => void handleRefresh()}>
            <RefreshCw className="h-4 w-4" />
            목록 새로고침
          </Button>
          <Button variant="outline" onClick={handleRefreshHealth}>연동 상태 새로고침</Button>
        </>
      }
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">채널 상태 보드</h2>
            <p className="mt-1 text-sm text-slate-500">배포 상태와 연동 차단 신호를 함께 확인합니다.</p>
            <p className="mt-2 text-xs text-slate-400">데이터 원천 {workspaceService.getRuntime().label}</p>
            {lastPersistence ? (
              <p className={`mt-2 text-xs ${lastPersistence.source === 'local_fallback' ? 'text-amber-700' : 'text-slate-400'}`}>
                마지막 저장 {lastPersistence.source === 'supabase' ? 'Supabase' : lastPersistence.source === 'local_fallback' ? '로컬 fallback' : '로컬'} · {formatMockDate(lastPersistence.at)}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-400">
              마지막 목록 갱신 {formatMockDate(lastLoadedAt)} · 연동 상태 확인 {formatMockDate(lastHealthCheckedAt)}
            </p>
            <p className={`mt-1 text-xs ${freshnessHint.tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{freshnessHint.message}</p>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="현장명, 채널, 상태 검색"
            className="w-full lg:max-w-xs"
          />
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">운영 요약</p>
          <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{distributionSummary}</pre>
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

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">채널 목록</h2>
              <p className="mt-1 text-sm text-slate-500">배포 대상 채널을 선택하고 현재 상태를 비교합니다.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{filteredItems.length}건</span>
          </div>

          <div className="mt-4 space-y-3">
          {filteredItems.map((item) => {
            const content = snapshot.items.find((entry) => entry.id === item.contentItemId) ?? null
            const itemJobs = snapshot.jobs.filter((entry) => entry.contentItemId === item.contentItemId && entry.channel === item.channel)
            const itemDerivatives = snapshot.derivatives.filter((entry) => entry.contentItemId === item.contentItemId && entry.channel === item.channel)
            const active = item.id === selectedDistribution?.id
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedDistributionId(item.id)}
                className={[
                  'w-full rounded-2xl border p-4 text-left transition',
                  active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
                ].join(' ')}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{item.channel}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{content?.siteName ?? '미지정 콘텐츠'}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      상태 {item.status} · 웹훅 {item.webhookStatus} · 마지막 갱신 {formatMockDate(item.updatedAt)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      작업 {itemJobs.length}건 · 파생 초안 {itemDerivatives.length}건
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs ${distributionStatusTone(item.status)}`}>{item.status}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  발행 URL: {item.publishUrl ? item.publishUrl : '아직 반영되지 않았습니다.'}
                </p>
              </button>
            )
          })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">배포 상세</h2>
          {selectedDistribution && selectedContent ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">{selectedContent.siteName}</p>
                <p className="mt-2">채널 {selectedDistribution.channel}</p>
                <p>현재 상태 {selectedDistribution.status}</p>
                <p>웹훅 상태 {selectedDistribution.webhookStatus}</p>
                <p>마지막 갱신 {formatMockDate(selectedDistribution.updatedAt)}</p>
                <p className="mt-2 text-xs text-slate-500">다음 액션 {statusPlan.label} · {statusPlan.hint}</p>
              </div>

              {cascadeSummary ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-900">상태 자동 반영 결과</p>
                  <p className="mt-2 text-sm text-slate-700">
                    콘텐츠 {cascadeSummary.contentStatus} · 실패 작업 {cascadeSummary.failedJobs}건 · 파생 초안 {cascadeSummary.derivativeSummary}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{cascadeSummary.summary}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">발행 준비 체크</p>
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
                <p className="text-sm font-medium text-slate-900">연결 맥락</p>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">콘텐츠 정보</p>
                    <p className="mt-2">{selectedContent.blogTitle}</p>
                    <p className="mt-1 text-xs text-slate-500">공개 수준 {selectedContent.revealLevel} · 우선 분류 {selectedContent.priorityReason}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">채널 파생 초안</p>
                    {selectedDerivatives.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {selectedDerivatives.map((item) => (
                          <p key={item.id} className="text-xs leading-5 text-slate-600">
                            {item.type} · {item.status} · {item.title}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">연결된 파생 초안이 없습니다.</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">최근 자동화 작업</p>
                    {selectedJobs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {selectedJobs.map((item) => (
                          <p key={item.id} className="text-xs leading-5 text-slate-600">
                            {item.jobType} · {item.status} · {formatMockDate(item.updatedAt)}
                            {item.errorMessage ? ` · ${item.errorMessage}` : ''}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">자동화 작업 이력이 없습니다.</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">최근 활동</p>
                    {selectedActivityLogs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {selectedActivityLogs.map((item) => (
                          <p key={item.id} className="text-xs leading-5 text-slate-600">
                            {item.message} · {formatMockDate(item.createdAt)}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">최근 활동 로그가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleMarkPublished(selectedDistribution)} disabled={statusPlan.disabled}>
                  {statusPlan.label}
                </Button>
                {selectedJobs[0] ? (
                  <Button variant="outline" asChild>
                    <Link
                      to={`/content/automation?jobId=${encodeURIComponent(selectedJobs[0].id)}&contentId=${encodeURIComponent(selectedDistribution.contentItemId)}&channel=${encodeURIComponent(selectedDistribution.channel)}`}
                    >
                      자동화 큐
                    </Link>
                  </Button>
                ) : null}
                <Button variant="outline" asChild>
                  <Link to={`/content/${encodeURIComponent(selectedDistribution.contentItemId)}?tab=distribution&channel=${encodeURIComponent(selectedDistribution.channel)}`}>콘텐츠 상세</Link>
                </Button>
              </div>

              <p className="text-sm text-slate-600">
                발행 URL: {selectedDistribution.publishUrl ? selectedDistribution.publishUrl : '아직 반영되지 않았습니다.'}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">선택한 배포 항목이 없습니다.</p>
          )}
        </div>
      </section>
    </ContentWorkspaceShell>
  )
}

function distributionStatusTone(status: MockDistribution['status']) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-700'
  if (status === 'error') return 'bg-rose-100 text-rose-700'
  if (status === 'scheduled') return 'bg-sky-100 text-sky-700'
  if (status === 'review_pending') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}
