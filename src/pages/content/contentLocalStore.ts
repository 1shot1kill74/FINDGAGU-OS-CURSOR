import {
  mockActivityLogs,
  mockAutomationJobs,
  mockContentItems,
  mockDerivatives,
  mockDistributions,
  mockTemplates,
  type MockActivityLog,
  type MockAutomationJob,
  type MockContentItem,
  type MockDerivative,
  type MockDistribution,
  type MockTemplate,
} from './mockContentData'

type ContentWorkspaceState = {
  items: MockContentItem[]
  distributions: MockDistribution[]
  jobs: MockAutomationJob[]
  templates: MockTemplate[]
  derivatives: MockDerivative[]
  activityLogs: MockActivityLog[]
}

const STORAGE_KEY = 'content-workspace-state-v2'
const DEFAULT_DERIVATIVE_BLUEPRINTS: Array<{
  type: MockDerivative['type']
  channel: string
  titleSuffix: string
  bodyPrefix: string
}> = [
  { type: 'shorts_blog_service', channel: 'Instagram Reels', titleSuffix: '블로그 기반 숏츠 초안', bodyPrefix: '블로그 기반 숏츠 스크립트 초안' },
  { type: 'shorts_youtube_engine', channel: 'YouTube Shorts', titleSuffix: '유튜브 자동화 쇼츠 초안', bodyPrefix: '비포어/애프터 영상 엔진 초안' },
  { type: 'social_caption', channel: 'Facebook Video', titleSuffix: '페이스북 영상 캡션 초안', bodyPrefix: '영상 게시용 캡션 초안' },
]

function createDistributionId(contentItemId: string, channel: string) {
  return `dist-${contentItemId}-${channel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function getDefaultState(): ContentWorkspaceState {
  return {
    items: structuredClone(mockContentItems),
    distributions: structuredClone(mockDistributions),
    jobs: structuredClone(mockAutomationJobs),
    templates: structuredClone(mockTemplates),
    derivatives: structuredClone(mockDerivatives),
    activityLogs: structuredClone(mockActivityLogs),
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendActivityLog(
  state: ContentWorkspaceState,
  input: Omit<MockActivityLog, 'id' | 'createdAt'> & { createdAt?: string }
) {
  const nextLog: MockActivityLog = {
    id: createId('log'),
    contentItemId: input.contentItemId,
    actionType: input.actionType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    channel: input.channel,
    message: input.message,
    createdAt: input.createdAt ?? nowIso(),
  }
  state.activityLogs = [nextLog, ...state.activityLogs].slice(0, 200)
}

function ensureDefaultDerivativesForItem(
  state: ContentWorkspaceState,
  item: MockContentItem
) {
  const existingKeys = new Set(
    state.derivatives
      .filter((derivative) => derivative.contentItemId === item.id)
      .map((derivative) => `${derivative.type}::${derivative.channel}`)
  )

  const createdAt = item.updatedAt || nowIso()
  const nextDerivatives = DEFAULT_DERIVATIVE_BLUEPRINTS
    .filter((blueprint) => !existingKeys.has(`${blueprint.type}::${blueprint.channel}`))
    .map((blueprint) => ({
      id: createId('drv'),
      contentItemId: item.id,
      type: blueprint.type,
      channel: blueprint.channel,
      title: `${item.siteName} ${blueprint.titleSuffix}`,
      body: `${blueprint.bodyPrefix}: ${item.ctaText || item.seoDescription || item.blogTitle}`,
      hookText: item.derivativeHook || item.blogTitle,
      outline: item.faqTopics.length > 0 ? item.faqTopics.join(' / ') : item.tags.join(' / '),
      status: 'draft_ready' as const,
      updatedAt: createdAt,
    }))

  if (nextDerivatives.length > 0) {
    state.derivatives = [...nextDerivatives, ...state.derivatives]
  }
}

function inferIntegrationStatus(distributions: MockDistribution[]): MockContentItem['integrationStatus'] {
  if (distributions.some((item) => item.webhookStatus === '실URL 연결')) return '실URL 연결'
  if (distributions.some((item) => item.webhookStatus === 'mock 연결')) return 'mock 연결'
  return '미설정'
}

function computeAutomationScore(
  distributions: MockDistribution[],
  jobs: MockAutomationJob[]
) {
  let score = 30
  score += Math.min(distributions.length * 10, 40)
  score += Math.min(jobs.length * 5, 20)
  if (jobs.some((job) => job.status === 'completed')) score += 10
  if (jobs.some((job) => job.status === 'failed')) score -= 10
  return Math.max(10, Math.min(score, 95))
}

function deriveContentStatus(
  previousStatus: MockContentItem['status'],
  distributions: MockDistribution[],
  jobs: MockAutomationJob[]
): MockContentItem['status'] {
  if (distributions.some((item) => item.status === 'published')) return 'published'
  if (jobs.some((item) => item.status === 'failed') || distributions.some((item) => item.status === 'error')) return 'review'
  if (jobs.some((item) => item.status === 'processing') || distributions.some((item) => item.status === 'review_pending')) return 'review'
  if (jobs.some((item) => item.status === 'completed') || distributions.some((item) => item.status === 'scheduled')) return 'approved'
  if (jobs.some((item) => item.status === 'queued') || distributions.some((item) => item.status === 'draft_ready')) return 'draft'
  return previousStatus
}

function deriveDistributionStatusFromJob(
  jobStatus: MockAutomationJob['status'],
  currentStatus: MockDistribution['status'],
  publishUrl: string | null
): MockDistribution['status'] {
  if (currentStatus === 'published') return 'published'
  if (jobStatus === 'failed') return 'error'
  if (jobStatus === 'completed') return publishUrl ? 'published' : 'scheduled'
  if (jobStatus === 'processing') return 'review_pending'
  if (jobStatus === 'queued') return 'draft_ready'
  return currentStatus
}

function deriveDerivativeStatusFromJob(
  jobStatus: MockAutomationJob['status'],
  currentStatus: MockDerivative['status']
): MockDerivative['status'] {
  if (jobStatus === 'completed') return 'approved'
  if (jobStatus === 'processing') return 'review_pending'
  if (jobStatus === 'failed') return currentStatus === 'approved' ? 'review_pending' : 'draft_ready'
  return currentStatus
}

function ensureDistributionForChannel(
  state: ContentWorkspaceState,
  contentItemId: string,
  channel: string,
  updatedAt: string
) {
  const existing = state.distributions.find((item) => item.contentItemId === contentItemId && item.channel === channel)
  if (existing) return existing
  const next: MockDistribution = {
    id: createDistributionId(contentItemId, channel),
    contentItemId,
    channel,
    status: 'draft_ready',
    publishUrl: null,
    webhookStatus: 'mock 연결',
    updatedAt,
  }
  state.distributions = [next, ...state.distributions]
  return next
}

function syncJobEffects(
  state: ContentWorkspaceState,
  job: MockAutomationJob,
  updatedAt: string
) {
  const distribution = ensureDistributionForChannel(state, job.contentItemId, job.channel, updatedAt)
  const nextDistributionStatus = deriveDistributionStatusFromJob(job.status, distribution.status, distribution.publishUrl)
  state.distributions = state.distributions.map((item) =>
    item.id === distribution.id
      ? {
          ...item,
          status: nextDistributionStatus,
          webhookStatus: item.webhookStatus,
          updatedAt,
        }
      : item
  )

  state.derivatives = state.derivatives.map((item) =>
    item.contentItemId === job.contentItemId && item.channel === job.channel
      ? {
          ...item,
          status: deriveDerivativeStatusFromJob(job.status, item.status),
          updatedAt,
        }
      : item
  )
}

function syncItemFromRelations(
  state: ContentWorkspaceState,
  contentItemId: string,
  updatedAt: string
) {
  const previous = state.items.find((item) => item.id === contentItemId) ?? null
  if (!previous) return
  const distributions = state.distributions.filter((item) => item.contentItemId === contentItemId)
  const jobs = state.jobs.filter((item) => item.contentItemId === contentItemId)
  const nextStatus = deriveContentStatus(previous.status, distributions, jobs)
  const nextIntegrationStatus = inferIntegrationStatus(distributions)
  const nextAutomationScore = computeAutomationScore(distributions, jobs)

  state.items = state.items.map((item) =>
    item.id === contentItemId
      ? {
          ...item,
          status: nextStatus,
          integrationStatus: nextIntegrationStatus,
          automationScore: nextAutomationScore,
          updatedAt,
        }
      : item
  )

  if (previous.status !== nextStatus) {
    appendActivityLog(state, {
      contentItemId,
      actionType: 'content_status_sync',
      fromStatus: previous.status,
      toStatus: nextStatus,
      channel: null,
      message: `연결된 자동화/배포 상태에 따라 콘텐츠 상태가 ${previous.status} -> ${nextStatus} 로 자동 반영되었습니다.`,
      createdAt: updatedAt,
    })
  }
}

export function nowIso() {
  return new Date().toISOString()
}

export function readContentWorkspaceState(): ContentWorkspaceState {
  if (typeof window === 'undefined') return getDefaultState()
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return getDefaultState()

  try {
    const parsed = JSON.parse(raw) as Partial<ContentWorkspaceState>
    return {
      items: Array.isArray(parsed.items) ? parsed.items : structuredClone(mockContentItems),
      distributions: Array.isArray(parsed.distributions) ? parsed.distributions : structuredClone(mockDistributions),
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : structuredClone(mockAutomationJobs),
      templates: Array.isArray(parsed.templates) ? parsed.templates : structuredClone(mockTemplates),
      derivatives: Array.isArray(parsed.derivatives) ? parsed.derivatives : structuredClone(mockDerivatives),
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : structuredClone(mockActivityLogs),
    }
  } catch {
    return getDefaultState()
  }
}

export function writeContentWorkspaceState(state: ContentWorkspaceState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetContentWorkspaceState() {
  const next = getDefaultState()
  writeContentWorkspaceState(next)
  return next
}

export function exportContentWorkspaceState() {
  return JSON.stringify(readContentWorkspaceState(), null, 2)
}

export function getStoredContentItem(itemId: string) {
  return readContentWorkspaceState().items.find((item) => item.id === itemId) ?? null
}

export function getStoredContentJobs(contentItemId: string) {
  return readContentWorkspaceState().jobs.filter((item) => item.contentItemId === contentItemId)
}

export function getStoredContentDistributions(contentItemId: string) {
  return readContentWorkspaceState().distributions.filter((item) => item.contentItemId === contentItemId)
}

export function getStoredTemplates() {
  return readContentWorkspaceState().templates
}

export function getStoredDerivatives(contentItemId: string) {
  return readContentWorkspaceState().derivatives.filter((item) => item.contentItemId === contentItemId)
}

export function updateDerivative(derivativeId: string, patch: Partial<MockDerivative>) {
  const state = readContentWorkspaceState()
  const updatedAt = patch.updatedAt ?? nowIso()
  const target = state.derivatives.find((item) => item.id === derivativeId) ?? null
  const nextDerivative = target ? { ...target, ...patch, updatedAt } : null

  if (nextDerivative) {
    state.derivatives = state.derivatives.map((item) => (item.id === derivativeId ? nextDerivative : item))
    state.items = state.items.map((item) =>
      item.id === nextDerivative.contentItemId ? { ...item, updatedAt } : item
    )
    appendActivityLog(state, {
      contentItemId: nextDerivative.contentItemId,
      actionType: 'derivative_update',
      fromStatus: null,
      toStatus: nextDerivative.status,
      channel: nextDerivative.channel,
      message: `${nextDerivative.channel} ${nextDerivative.type} 초안이 저장되었습니다.`,
      createdAt: updatedAt,
    })
  }

  writeContentWorkspaceState(state)
  return state
}

export function getStoredActivityLogs(contentItemId: string) {
  return readContentWorkspaceState().activityLogs.filter((item) => item.contentItemId === contentItemId)
}

export function updateContentItem(itemId: string, patch: Partial<MockContentItem>) {
  const state = readContentWorkspaceState()
  const updatedAt = patch.updatedAt ?? nowIso()
  const previous = state.items.find((item) => item.id === itemId) ?? null
  const nextItem = previous ? { ...previous, ...patch, updatedAt } : null
  if (nextItem) {
    state.items = state.items.map((item) => (item.id === itemId ? nextItem : item))
  }
  if (nextItem) {
    ensureDefaultDerivativesForItem(state, nextItem)
    appendActivityLog(state, {
      contentItemId: nextItem.id,
      actionType: 'content_update',
      fromStatus: previous?.status ?? null,
      toStatus: nextItem.status,
      channel: null,
      message: `콘텐츠 기본 정보가 저장되었습니다. 공개 수준 ${nextItem.revealLevel}, 우선 분류 ${nextItem.priorityReason}`,
      createdAt: updatedAt,
    })
  }
  writeContentWorkspaceState(state)
  return state
}

export function updateDistribution(distributionId: string, patch: Partial<MockDistribution>) {
  const state = readContentWorkspaceState()
  const updatedAt = patch.updatedAt ?? nowIso()
  const target = state.distributions.find((item) => item.id === distributionId) ?? null
  const nextDistribution = target ? { ...target, ...patch, updatedAt } : null
  if (nextDistribution) {
    state.distributions = state.distributions.map((item) => (item.id === distributionId ? nextDistribution : item))
  }
  if (target) {
    state.items = state.items.map((item) =>
      item.id === target.contentItemId ? { ...item, updatedAt } : item
    )
  }
  if (target && nextDistribution) {
    state.distributions = state.distributions.map((item) =>
      item.id === distributionId ? nextDistribution : item
    )
    appendActivityLog(state, {
      contentItemId: target.contentItemId,
      actionType: 'distribution_update',
      fromStatus: null,
      toStatus: null,
      channel: nextDistribution.channel,
      message: `${nextDistribution.channel} 배포 상태가 ${target.status} -> ${nextDistribution.status} 로 변경되었습니다.`,
      createdAt: updatedAt,
    })
    syncItemFromRelations(state, target.contentItemId, updatedAt)
  }
  writeContentWorkspaceState(state)
  return state
}

export function createAutomationJob(contentItemId: string, channel: string) {
  const state = readContentWorkspaceState()
  const createdAt = nowIso()
  const job: MockAutomationJob = {
    id: createId('job'),
    contentItemId,
    channel,
    jobType: channel.toLowerCase().includes('blog')
      ? 'blog_publish'
      : channel.toLowerCase().includes('youtube')
        ? 'shorts_youtube_engine'
        : 'shorts_blog_service',
    status: 'queued',
    updatedAt: createdAt,
    reflectedAt: null,
    errorMessage: null,
  }
  state.jobs = [job, ...state.jobs]
  syncJobEffects(state, job, createdAt)
  state.items = state.items.map((item) =>
    item.id === contentItemId ? { ...item, updatedAt: createdAt } : item
  )
  appendActivityLog(state, {
    contentItemId,
    actionType: 'automation_request',
    fromStatus: null,
    toStatus: null,
    channel,
    message: `${channel} 자동화 요청이 생성되었습니다.`,
    createdAt,
  })
  syncItemFromRelations(state, contentItemId, createdAt)
  writeContentWorkspaceState(state)
  return { state, job }
}

export function updateAutomationJob(jobId: string, patch: Partial<MockAutomationJob>) {
  const state = readContentWorkspaceState()
  const updatedAt = patch.updatedAt ?? nowIso()
  const target = state.jobs.find((job) => job.id === jobId) ?? null
  state.jobs = state.jobs.map((job) => (job.id === jobId ? { ...job, ...patch, updatedAt } : job))
  if (target) {
    state.items = state.items.map((item) =>
      item.id === target.contentItemId ? { ...item, updatedAt } : item
    )
    const nextJob = state.jobs.find((job) => job.id === jobId) ?? null
    if (nextJob) {
      syncJobEffects(state, nextJob, updatedAt)
      appendActivityLog(state, {
        contentItemId: target.contentItemId,
        actionType: 'automation_update',
        fromStatus: null,
        toStatus: null,
        channel: nextJob.channel,
        message: `${nextJob.channel} 자동화 작업 상태가 ${target.status} -> ${nextJob.status} 로 변경되었습니다.`,
        createdAt: updatedAt,
      })
      syncItemFromRelations(state, target.contentItemId, updatedAt)
    }
  }
  writeContentWorkspaceState(state)
  return state
}

export function retryAutomationJob(jobId: string) {
  const state = readContentWorkspaceState()
  const existing = state.jobs.find((job) => job.id === jobId)
  if (!existing) return { state, job: null }
  const createdAt = nowIso()
  const nextJob: MockAutomationJob = {
    ...existing,
    id: createId('job'),
    status: 'queued',
    updatedAt: createdAt,
    reflectedAt: null,
    errorMessage: null,
  }
  state.jobs = [nextJob, ...state.jobs]
  syncJobEffects(state, nextJob, createdAt)
  state.items = state.items.map((item) =>
    item.id === existing.contentItemId ? { ...item, updatedAt: createdAt } : item
  )
  appendActivityLog(state, {
    contentItemId: existing.contentItemId,
    actionType: 'automation_retry',
    fromStatus: null,
    toStatus: null,
    channel: existing.channel,
    message: `${existing.channel} 자동화 요청이 재적재되었습니다.`,
    createdAt,
  })
  syncItemFromRelations(state, existing.contentItemId, createdAt)
  writeContentWorkspaceState(state)
  return { state, job: nextJob }
}

export function saveTemplate(template: MockTemplate) {
  const state = readContentWorkspaceState()
  const exists = state.templates.some((item) => item.id === template.id)
  state.templates = exists
    ? state.templates.map((item) => (item.id === template.id ? { ...template } : item))
    : [{ ...template }, ...state.templates]
  writeContentWorkspaceState(state)
  return state
}

export function duplicateTemplate(templateId: string) {
  const state = readContentWorkspaceState()
  const existing = state.templates.find((item) => item.id === templateId)
  if (!existing) return { state, template: null }
  const nextTemplate: MockTemplate = {
    ...existing,
    id: createId('tpl'),
    name: `${existing.name} 복제본`,
  }
  state.templates = [nextTemplate, ...state.templates]
  writeContentWorkspaceState(state)
  return { state, template: nextTemplate }
}
