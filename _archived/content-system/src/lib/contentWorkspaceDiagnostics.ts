import type { ContentSourceCoverage, ContentWorkspaceSnapshot } from '@/lib/contentWorkspaceService'

export type ContentDiagnosticSeverity = 'critical' | 'warning' | 'info'

export type ContentDiagnosticIssue = {
  id: string
  severity: ContentDiagnosticSeverity
  title: string
  description: string
  href: string
}

export type ContentDiagnosticSummary = {
  criticalCount: number
  warningCount: number
  infoCount: number
  issues: ContentDiagnosticIssue[]
}

export type ContentVerificationCheck = {
  id: string
  title: string
  status: 'pass' | 'attention'
  description: string
  href: string
}

export type ContentVerificationSummary = {
  overallStatus: 'ready' | 'attention'
  passCount: number
  attentionCount: number
  checks: ContentVerificationCheck[]
}

type ContentVerificationOptions = {
  sourceCoverageByContent?: Record<string, ContentSourceCoverage>
}

export function buildContentDiagnosticSummary(
  snapshot: ContentWorkspaceSnapshot
): ContentDiagnosticSummary {
  const issues: ContentDiagnosticIssue[] = []

  for (const item of snapshot.items) {
    const itemDistributions = snapshot.distributions.filter((entry) => entry.contentItemId === item.id)
    const itemJobs = snapshot.jobs.filter((entry) => entry.contentItemId === item.id)
    const itemDerivatives = snapshot.derivatives.filter((entry) => entry.contentItemId === item.id)

    if (item.status === 'published' && itemDistributions.every((entry) => entry.status !== 'published')) {
      issues.push({
        id: `published-without-channel-${item.id}`,
        severity: 'critical',
        title: `${item.siteName} published 상태 불일치`,
        description: '콘텐츠는 published 상태인데 실제 발행 완료 채널이 없습니다.',
        href: `/content/${encodeURIComponent(item.id)}?tab=distribution`,
      })
    }

    if (item.status === 'approved' && itemJobs.some((entry) => entry.status === 'failed')) {
      issues.push({
        id: `approved-with-failed-job-${item.id}`,
        severity: 'warning',
        title: `${item.siteName} 승인 상태 재검토 필요`,
        description: '콘텐츠는 approved인데 연결된 자동화 실패 작업이 남아 있습니다.',
        href: `/content/automation?contentId=${encodeURIComponent(item.id)}`,
      })
    }

    if (itemDistributions.length === 0) {
      issues.push({
        id: `missing-distribution-${item.id}`,
        severity: 'warning',
        title: `${item.siteName} 배포 채널 누락`,
        description: '콘텐츠 후보에 연결된 배포 채널이 없습니다.',
        href: `/content/${encodeURIComponent(item.id)}?tab=distribution`,
      })
    }

    if (itemDerivatives.length === 0) {
      issues.push({
        id: `missing-derivative-${item.id}`,
        severity: 'info',
        title: `${item.siteName} 파생 초안 없음`,
        description: '이 콘텐츠에는 연결된 파생 초안이 아직 없습니다.',
        href: `/content/${encodeURIComponent(item.id)}?tab=derivatives`,
      })
    }
  }

  for (const distribution of snapshot.distributions) {
    if (distribution.status === 'published' && !distribution.publishUrl) {
      issues.push({
        id: `published-no-url-${distribution.id}`,
        severity: 'critical',
        title: `${distribution.channel} 발행 URL 누락`,
        description: '채널 상태는 published인데 publish URL 이 비어 있습니다.',
        href: `/content/distribution?distributionId=${encodeURIComponent(distribution.id)}&contentId=${encodeURIComponent(distribution.contentItemId)}&channel=${encodeURIComponent(distribution.channel)}`,
      })
    }

    if (distribution.status === 'error') {
      const hasFailedJob = snapshot.jobs.some(
        (entry) => entry.contentItemId === distribution.contentItemId && entry.channel === distribution.channel && entry.status === 'failed'
      )
      if (!hasFailedJob) {
        issues.push({
          id: `distribution-error-no-job-${distribution.id}`,
          severity: 'warning',
          title: `${distribution.channel} 오류 근거 부족`,
          description: '배포 오류 상태인데 연결된 failed 작업 이력이 없습니다.',
          href: `/content/distribution?distributionId=${encodeURIComponent(distribution.id)}&contentId=${encodeURIComponent(distribution.contentItemId)}&channel=${encodeURIComponent(distribution.channel)}`,
        })
      }
    }
  }

  for (const job of snapshot.jobs) {
    if (job.status === 'failed' && !job.errorMessage?.trim()) {
      issues.push({
        id: `failed-job-no-message-${job.id}`,
        severity: 'warning',
        title: `${job.channel} 실패 사유 누락`,
        description: 'failed 상태인데 에러 메시지가 비어 있습니다.',
        href: `/content/automation?jobId=${encodeURIComponent(job.id)}&contentId=${encodeURIComponent(job.contentItemId)}&channel=${encodeURIComponent(job.channel)}`,
      })
    }

    if (job.status === 'completed') {
      const relatedDistribution = snapshot.distributions.find(
        (entry) => entry.contentItemId === job.contentItemId && entry.channel === job.channel
      )
      if (!relatedDistribution || (relatedDistribution.status !== 'scheduled' && relatedDistribution.status !== 'published')) {
        issues.push({
          id: `completed-job-out-of-sync-${job.id}`,
          severity: 'critical',
          title: `${job.channel} 완료 후 채널 상태 불일치`,
          description: '자동화 작업은 completed인데 채널 상태가 scheduled/published 로 맞춰지지 않았습니다.',
          href: `/content/automation?jobId=${encodeURIComponent(job.id)}&contentId=${encodeURIComponent(job.contentItemId)}&channel=${encodeURIComponent(job.channel)}`,
        })
      }
    }
  }

  return {
    criticalCount: issues.filter((item) => item.severity === 'critical').length,
    warningCount: issues.filter((item) => item.severity === 'warning').length,
    infoCount: issues.filter((item) => item.severity === 'info').length,
    issues,
  }
}

export function buildContentVerificationSummary(
  snapshot: ContentWorkspaceSnapshot,
  options: ContentVerificationOptions = {}
): ContentVerificationSummary {
  const diagnostics = buildContentDiagnosticSummary(snapshot)
  const sourceCoverageByContent = options.sourceCoverageByContent ?? {}
  const publishedWithUrl = snapshot.distributions.filter((item) => item.status === 'published' && Boolean(item.publishUrl))
  const completedJobsInSync = snapshot.jobs.filter((job) =>
    job.status === 'completed'
    && snapshot.distributions.some(
      (distribution) =>
        distribution.contentItemId === job.contentItemId
        && distribution.channel === job.channel
        && (distribution.status === 'scheduled' || distribution.status === 'published')
    )
  )
  const sourceLinkedItems = snapshot.items.filter((item) => {
    const coverage = sourceCoverageByContent[item.id]
    return coverage?.hasTraceableSource ?? false
  })
  const missingSourceItems = snapshot.items.filter((item) => {
    const coverage = sourceCoverageByContent[item.id]
    return !(coverage?.hasTraceableSource ?? false)
  })
  const traceableItems = snapshot.items.filter((item) => {
    const hasDistribution = snapshot.distributions.some((distribution) => distribution.contentItemId === item.id)
    const hasDerivative = snapshot.derivatives.some((derivative) => derivative.contentItemId === item.id)
    const hasActivity = snapshot.activityLogs.some((log) => log.contentItemId === item.id)
    const hasSource = sourceCoverageByContent[item.id]?.hasTraceableSource ?? true
    return hasDistribution && hasDerivative && hasActivity && hasSource
  })
  const incompleteTraceabilityItems = snapshot.items.filter((item) => {
    const hasDistribution = snapshot.distributions.some((distribution) => distribution.contentItemId === item.id)
    const hasDerivative = snapshot.derivatives.some((derivative) => derivative.contentItemId === item.id)
    const hasActivity = snapshot.activityLogs.some((log) => log.contentItemId === item.id)
    const hasSource = sourceCoverageByContent[item.id]?.hasTraceableSource ?? true
    return !(hasDistribution && hasDerivative && hasActivity && hasSource)
  })
  const failedJobs = snapshot.jobs.filter((item) => item.status === 'failed')

  const checks: ContentVerificationCheck[] = [
    {
      id: 'critical-diagnostics',
      title: 'critical 진단 없음',
      status: diagnostics.criticalCount === 0 ? 'pass' : 'attention',
      description:
        diagnostics.criticalCount === 0
          ? '현재 자동 진단 기준으로 즉시 막히는 critical 이슈가 없습니다.'
          : `critical ${diagnostics.criticalCount}건이 남아 있어 먼저 해소해야 합니다.`,
      href: '/content',
    },
    {
      id: 'published-url',
      title: '실발행 URL 확보',
      status: publishedWithUrl.length > 0 ? 'pass' : 'attention',
      description:
        publishedWithUrl.length > 0
          ? `${publishedWithUrl.length}개 채널에서 발행 완료와 URL 반영이 함께 확인됩니다.`
          : 'published 상태와 URL 반영이 함께 확인된 채널이 아직 없습니다.',
      href: '/content/distribution',
    },
    {
      id: 'completed-job-sync',
      title: '자동화 완료 흐름 확인',
      status: completedJobsInSync.length > 0 ? 'pass' : 'attention',
      description:
        completedJobsInSync.length > 0
          ? `${completedJobsInSync.length}개 작업이 completed 이후 채널 상태와 함께 정렬되었습니다.`
          : 'completed 작업과 채널 상태가 함께 맞물린 사례가 아직 없습니다.',
      href: '/content/automation',
    },
    {
      id: 'source-traceability',
      title: '원천 연결 확보',
      status: missingSourceItems.length === 0 ? 'pass' : 'attention',
      description:
        missingSourceItems.length === 0
          ? `${sourceLinkedItems.length}개 콘텐츠에서 쇼룸 그룹 또는 이미지 자산 원천 연결이 확인됩니다.`
          : `${missingSourceItems.length}개 콘텐츠는 아직 원천 연결이 비어 있습니다.`,
      href: '/content?preset=missing-source',
    },
    {
      id: 'traceable-item',
      title: '운영 이력+원천 추적 가능',
      status: incompleteTraceabilityItems.length === 0 ? 'pass' : 'attention',
      description:
        incompleteTraceabilityItems.length === 0
          ? `${traceableItems.length}개 콘텐츠에서 채널, 파생 초안, 활동 로그, 원천 연결이 모두 확보되어 있습니다.`
          : `${incompleteTraceabilityItems.length}개 콘텐츠는 아직 운영 이력 또는 원천 연결이 덜 채워져 있습니다.`,
      href: '/content?preset=incomplete-traceability',
    },
    {
      id: 'failed-jobs',
      title: '잔여 실패 작업 정리',
      status: failedJobs.length === 0 ? 'pass' : 'attention',
      description:
        failedJobs.length === 0
          ? '현재 failed 상태 작업이 남아 있지 않습니다.'
          : `failed 작업 ${failedJobs.length}건이 남아 있어 재요청 또는 원인 정리가 필요합니다.`,
      href: '/content/automation',
    },
  ]

  const passCount = checks.filter((item) => item.status === 'pass').length
  const attentionCount = checks.length - passCount

  return {
    overallStatus: attentionCount === 0 ? 'ready' : 'attention',
    passCount,
    attentionCount,
    checks,
  }
}
