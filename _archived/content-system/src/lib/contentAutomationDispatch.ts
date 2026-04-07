import type { ContentWorkspaceSnapshot } from '@/lib/contentWorkspaceService'
import { supabase } from '@/lib/supabase'
import type { MockAutomationJob } from '@/pages/content/mockContentData'

export type ContentAutomationDispatchPayload = {
  job: {
    id: string
    type: string
    status: string
    requestedAt: string
    reflectedAt: string | null
  }
  content: {
    id: string
    siteName: string
    businessType: string
    region: string
    revealLevel: string
    priorityReason: string
    blogTitle: string
    seoDescription: string
    ctaText: string
    faqTopics: string[]
    derivativeHook: string
    tags: string[]
  }
  distribution: {
    id: string
    channel: string
    status: string
    webhookStatus: string
    publishUrl: string | null
    updatedAt: string
  } | null
  derivatives: Array<{
    id: string
    type: string
    title: string
    hookText: string
    outline: string
    status: string
  }>
  activityContext: Array<{
    actionType: string
    channel: string | null
    message: string
    createdAt: string
  }>
  readiness: Array<{
    label: string
    passed: boolean
    hint: string
  }>
}

export type ContentAutomationDispatchResult = {
  accepted: boolean
  status: 'processing' | 'completed'
  mode: 'mock' | 'live'
  endpointLabel: string
  webhookStatus: 'mock 연결' | '실URL 연결'
  publishUrl: string | null
  completedAt: string | null
  externalRequestId: string | null
  message: string
}

type DispatchResponse = {
  accepted?: boolean
  status?: string
  mode?: string
  endpointLabel?: string
  webhookStatus?: string
  publishUrl?: string | null
  publish_url?: string | null
  completedAt?: string | null
  completed_at?: string | null
  externalRequestId?: string | null
  external_request_id?: string | null
  message?: string
  error?: string
}

export function buildContentAutomationPayload(
  snapshot: ContentWorkspaceSnapshot,
  job: MockAutomationJob
): ContentAutomationDispatchPayload | null {
  const content = snapshot.items.find((item) => item.id === job.contentItemId) ?? null
  if (!content) return null
  const distribution = snapshot.distributions.find(
    (item) => item.contentItemId === job.contentItemId && item.channel === job.channel
  ) ?? null
  const derivatives = snapshot.derivatives.filter(
    (item) => item.contentItemId === job.contentItemId && item.channel === job.channel
  )
  const activityContext = snapshot.activityLogs
    .filter((item) => item.contentItemId === job.contentItemId)
    .slice(0, 4)

  const readiness = [
    {
      label: '콘텐츠 제목',
      passed: Boolean(content.blogTitle.trim()),
      hint: content.blogTitle.trim() ? content.blogTitle : '블로그 제목이 비어 있습니다.',
    },
    {
      label: 'SEO 설명',
      passed: Boolean(content.seoDescription.trim()),
      hint: content.seoDescription.trim() ? '설명이 준비되어 있습니다.' : 'SEO 설명이 비어 있습니다.',
    },
    {
      label: 'CTA',
      passed: Boolean(content.ctaText.trim()),
      hint: content.ctaText.trim() ? content.ctaText : 'CTA가 비어 있습니다.',
    },
    {
      label: 'FAQ / 개요',
      passed: content.faqTopics.length > 0,
      hint: content.faqTopics.length > 0 ? `${content.faqTopics.length}개 질문 준비` : 'FAQ 토픽이 없습니다.',
    },
    {
      label: '채널 배포 레코드',
      passed: Boolean(distribution),
      hint: distribution ? `${distribution.status} · ${distribution.webhookStatus}` : '채널별 배포 레코드가 없습니다.',
    },
    {
      label: '채널 파생 초안',
      passed: derivatives.length > 0,
      hint: derivatives.length > 0 ? `${derivatives.length}개 초안 연결` : '선택 채널 파생 초안이 없습니다.',
    },
  ]

  return {
    job: {
      id: job.id,
      type: job.jobType,
      status: job.status,
      requestedAt: job.updatedAt,
      reflectedAt: job.reflectedAt,
    },
    content: {
      id: content.id,
      siteName: content.siteName,
      businessType: content.businessType,
      region: content.region,
      revealLevel: content.revealLevel,
      priorityReason: content.priorityReason,
      blogTitle: content.blogTitle,
      seoDescription: content.seoDescription,
      ctaText: content.ctaText,
      faqTopics: content.faqTopics,
      derivativeHook: content.derivativeHook,
      tags: content.tags,
    },
    distribution: distribution
      ? {
          id: distribution.id,
          channel: distribution.channel,
          status: distribution.status,
          webhookStatus: distribution.webhookStatus,
          publishUrl: distribution.publishUrl,
          updatedAt: distribution.updatedAt,
        }
      : null,
    derivatives: derivatives.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      hookText: item.hookText,
      outline: item.outline,
      status: item.status,
    })),
    activityContext: activityContext.map((item) => ({
      actionType: item.actionType,
      channel: item.channel,
      message: item.message,
      createdAt: item.createdAt,
    })),
    readiness,
  }
}

function normalizeDispatchResult(data: DispatchResponse): ContentAutomationDispatchResult {
  if (data.accepted === false) {
    throw new Error(data.error || data.message || '자동화 요청이 거절되었습니다.')
  }

  const status = data.status === 'completed' ? 'completed' : 'processing'
  const mode = data.mode === 'live' ? 'live' : 'mock'
  const publishUrl = data.publishUrl ?? data.publish_url ?? null
  const completedAt = data.completedAt ?? data.completed_at ?? null
  const externalRequestId = data.externalRequestId ?? data.external_request_id ?? null
  const webhookStatus =
    data.webhookStatus === '실URL 연결'
      ? '실URL 연결'
      : mode === 'live'
        ? '실URL 연결'
        : 'mock 연결'

  return {
    accepted: true,
    status,
    mode,
    endpointLabel: data.endpointLabel?.trim() || 'content-automation-dispatch',
    webhookStatus,
    publishUrl,
    completedAt,
    externalRequestId,
    message: data.message?.trim() || '자동화 요청이 접수되었습니다.',
  }
}

export async function dispatchContentAutomation(
  payload: ContentAutomationDispatchPayload
): Promise<ContentAutomationDispatchResult> {
  const { data, error } = await supabase.functions.invoke<DispatchResponse>(
    'content-automation-dispatch',
    {
      body: payload,
    }
  )

  if (error) {
    throw new Error(error.message || '자동화 디스패치 Edge Function 호출 실패')
  }

  if (!data) {
    throw new Error('자동화 디스패치 응답이 비어 있습니다.')
  }

  return normalizeDispatchResult(data)
}
