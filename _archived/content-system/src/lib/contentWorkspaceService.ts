import type {
  MockActivityLog,
  MockAutomationJob,
  MockContentItem,
  MockDerivative,
  MockDistribution,
  MockTemplate,
} from '@/pages/content/mockContentData'
import {
  createAutomationJob,
  exportContentWorkspaceState,
  getStoredActivityLogs,
  getStoredContentDistributions,
  getStoredContentItem,
  getStoredContentJobs,
  getStoredDerivatives,
  getStoredTemplates,
  nowIso,
  readContentWorkspaceState,
  resetContentWorkspaceState,
  retryAutomationJob,
  writeContentWorkspaceState,
  updateAutomationJob,
  updateContentItem,
  updateDerivative,
  updateDistribution,
  saveTemplate,
  duplicateTemplate,
} from '@/pages/content/contentLocalStore'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/imageAssetService'
import { getSupabase } from '@/lib/supabase'

export type ContentWorkspaceSnapshot = {
  items: MockContentItem[]
  distributions: MockDistribution[]
  jobs: MockAutomationJob[]
  templates: MockTemplate[]
  derivatives: MockDerivative[]
  activityLogs: MockActivityLog[]
}

export type ContentWorkspaceRuntime = {
  source: 'local' | 'supabase'
  label: string
  fallback: boolean
}

export type ContentSourceRecord = {
  id: string
  contentItemId: string
  sourceKind: 'image_asset' | 'showroom_group'
  imageAssetId: string | null
  showroomGroupKey: string | null
  isPrimary: boolean
  createdAt: string | null
  siteName: string | null
  businessType: string | null
  productName: string | null
  colorName: string | null
  region: string | null
  spaceId: string | null
  imageCount: number | null
}

export type ContentSourceCoverage = {
  contentItemId: string
  showroomGroupCount: number
  imageAssetCount: number
  totalCount: number
  hasTraceableSource: boolean
}

export type ContentPersistenceSource = 'local' | 'supabase' | 'local_fallback'

export type ContentPersistenceResult<T> = {
  state: ContentWorkspaceSnapshot
  entity: T | null
  source: ContentPersistenceSource
  remoteError?: string
}

export type ContentLastPersistence = {
  target:
    | 'item'
    | 'distribution'
    | 'job'
    | 'template'
    | 'showroom_sync'
  source: ContentPersistenceSource
  message: string
  remoteError?: string
  at: string
}

type RemoteItemIdentity = {
  displayId: string
  remoteId: string
}

export interface ContentWorkspaceService {
  now(): string
  readSnapshot(): ContentWorkspaceSnapshot
  refreshSnapshot(): Promise<ContentWorkspaceSnapshot>
  getRuntime(): ContentWorkspaceRuntime
  getLastPersistence(): ContentLastPersistence | null
  exportSnapshot(): string
  resetSampleData(): ContentWorkspaceSnapshot
  listItems(): MockContentItem[]
  getItem(itemId: string): MockContentItem | null
  updateItem(itemId: string, patch: Partial<MockContentItem>): ContentWorkspaceSnapshot
  persistItem(itemId: string, patch: Partial<MockContentItem>): Promise<ContentPersistenceResult<MockContentItem>>
  listDistributions(): MockDistribution[]
  listDistributionsByContent(contentItemId: string): MockDistribution[]
  updateDistribution(distributionId: string, patch: Partial<MockDistribution>): ContentWorkspaceSnapshot
  persistDistribution(distributionId: string, patch: Partial<MockDistribution>): Promise<ContentPersistenceResult<MockDistribution>>
  listJobs(): MockAutomationJob[]
  listJobsByContent(contentItemId: string): MockAutomationJob[]
  createJob(contentItemId: string, channel: string): { state: ContentWorkspaceSnapshot; job: MockAutomationJob }
  createAutomationRequest(contentItemId: string, channel: string): Promise<ContentPersistenceResult<MockAutomationJob>>
  updateJob(jobId: string, patch: Partial<MockAutomationJob>): ContentWorkspaceSnapshot
  persistJob(jobId: string, patch: Partial<MockAutomationJob>): Promise<ContentPersistenceResult<MockAutomationJob>>
  retryJob(jobId: string): { state: ContentWorkspaceSnapshot; job: MockAutomationJob | null }
  retryAutomationRequest(jobId: string): Promise<ContentPersistenceResult<MockAutomationJob>>
  listTemplates(): MockTemplate[]
  saveTemplate(template: MockTemplate): ContentWorkspaceSnapshot
  persistTemplate(template: MockTemplate): Promise<ContentPersistenceResult<MockTemplate>>
  duplicateTemplate(templateId: string): { state: ContentWorkspaceSnapshot; template: MockTemplate | null }
  duplicateWorkspaceTemplate(templateId: string): Promise<ContentPersistenceResult<MockTemplate>>
  listDerivativesByContent(contentItemId: string): MockDerivative[]
  updateDerivative(derivativeId: string, patch: Partial<MockDerivative>): ContentWorkspaceSnapshot
  persistDerivative(derivativeId: string, patch: Partial<MockDerivative>): Promise<ContentPersistenceResult<MockDerivative>>
  listActivityLogsByContent(contentItemId: string): MockActivityLog[]
  listSourcesByContent(contentItemId: string): Promise<ContentSourceRecord[]>
  listSourceCoverage(): Promise<Record<string, ContentSourceCoverage>>
  syncFromShowroom(): Promise<{ state: ContentWorkspaceSnapshot; added: number; updated: number }>
}

type ContentWorkspaceSourceMode = 'auto' | 'local' | 'supabase'

function createContentIdFromSiteName(siteName: string) {
  return `content-${encodeURIComponent(siteName.trim() || 'untitled').replace(/%/g, '').toLowerCase()}`
}

const DEFAULT_DISTRIBUTION_CHANNELS = ['Google Blog', 'Naver Blog', 'Instagram Reels', 'Facebook Video', 'YouTube Shorts'] as const
const DEFAULT_DERIVATIVE_CHANNELS: Array<{
  type: MockDerivative['type']
  channel: string
  titleSuffix: string
}> = [
  { type: 'shorts_blog_service', channel: 'Instagram Reels', titleSuffix: '블로그 기반 숏츠 초안' },
  { type: 'shorts_youtube_engine', channel: 'YouTube Shorts', titleSuffix: '유튜브 자동화 쇼츠 초안' },
  { type: 'social_caption', channel: 'Facebook Video', titleSuffix: '영상 캡션 초안' },
]

function createDistributionId(contentItemId: string, channel: string) {
  return `dist-${contentItemId}-${encodeURIComponent(channel).replace(/%/g, '').toLowerCase()}`
}

function createDerivativeId(contentItemId: string, type: MockDerivative['type'], channel: string) {
  return `drv-${contentItemId}-${type}-${encodeURIComponent(channel).replace(/%/g, '').toLowerCase()}`
}

function createActivityLogId(contentItemId: string, actionType: string, createdAt: string) {
  return `log-${contentItemId}-${actionType}-${createdAt.replace(/[^0-9]/g, '')}`
}

function createBlogDraftId(contentItemId: string) {
  return `draft-${contentItemId}`
}

function getDisplayItemId(row: Record<string, unknown>) {
  const contentCode = String(row.content_code ?? '').trim()
  return contentCode || String(row.id ?? '').trim()
}

let remoteItemIdByDisplayId = new Map<string, string>()
let displayIdByRemoteItemId = new Map<string, string>()
let showroomAssetCache: ShowroomImageAsset[] | null = null

function setRemoteItemIdentity(identity: RemoteItemIdentity) {
  if (!identity.displayId || !identity.remoteId) return
  remoteItemIdByDisplayId.set(identity.displayId, identity.remoteId)
  displayIdByRemoteItemId.set(identity.remoteId, identity.displayId)
}

function parseSourceSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {}
  return snapshot as Record<string, unknown>
}

function mapContentSourceRow(contentItemId: string, row: Record<string, unknown>): ContentSourceRecord {
  const snapshot = parseSourceSnapshot(row.snapshot)
  return {
    id: String(row.id ?? ''),
    contentItemId,
    sourceKind: row.source_kind === 'image_asset' ? 'image_asset' : 'showroom_group',
    imageAssetId: row.image_asset_id != null ? String(row.image_asset_id) : null,
    showroomGroupKey: row.showroom_group_key != null ? String(row.showroom_group_key) : null,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at != null ? String(row.created_at) : null,
    siteName: snapshot.siteName != null ? String(snapshot.siteName) : null,
    businessType: snapshot.businessType != null ? String(snapshot.businessType) : null,
    productName: snapshot.productName != null ? String(snapshot.productName) : null,
    colorName: snapshot.colorName != null ? String(snapshot.colorName) : null,
    region: snapshot.region != null ? String(snapshot.region) : null,
    spaceId: snapshot.spaceId != null ? String(snapshot.spaceId) : null,
    imageCount: typeof snapshot.imageCount === 'number' ? snapshot.imageCount : null,
  }
}

async function readShowroomAssets(force = false) {
  if (!force && showroomAssetCache) return showroomAssetCache
  showroomAssetCache = await fetchShowroomImageAssets()
  return showroomAssetCache
}

function buildLocalSourceRecords(item: MockContentItem, images: ShowroomImageAsset[]): ContentSourceRecord[] {
  if (images.length === 0) return []
  const showroomGroupKey = buildShowroomGroupKey(item.siteName, images)
  const groupRow: ContentSourceRecord = {
    id: `local-source-group-${item.id}`,
    contentItemId: item.id,
    sourceKind: 'showroom_group',
    imageAssetId: null,
    showroomGroupKey,
    isPrimary: true,
    createdAt: images.find((image) => image.created_at)?.created_at ?? null,
    siteName: item.siteName,
    businessType: item.businessType,
    productName: null,
    colorName: null,
    region: item.region,
    spaceId: images.find((image) => image.space_id?.trim())?.space_id?.trim() ?? null,
    imageCount: images.length,
  }
  const imageRows = [...images]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .map((image) => ({
      id: `local-source-asset-${image.id}`,
      contentItemId: item.id,
      sourceKind: 'image_asset' as const,
      imageAssetId: image.id,
      showroomGroupKey: null,
      isPrimary: false,
      createdAt: image.created_at,
      siteName: normalizeSiteName(image),
      businessType: image.business_type,
      productName: image.product_name,
      colorName: image.color_name,
      region: image.location,
      spaceId: image.space_id ?? null,
      imageCount: null,
    }))
  return [groupRow, ...imageRows]
}

function buildSourceCoverage(records: ContentSourceRecord[], contentItemId: string): ContentSourceCoverage {
  const showroomGroupCount = records.filter((source) => source.sourceKind === 'showroom_group').length
  const imageAssetCount = records.filter((source) => source.sourceKind === 'image_asset').length
  return {
    contentItemId,
    showroomGroupCount,
    imageAssetCount,
    totalCount: records.length,
    hasTraceableSource: showroomGroupCount > 0 || imageAssetCount > 0,
  }
}

function replaceRemoteItemIdentityMap(identities: RemoteItemIdentity[]) {
  remoteItemIdByDisplayId = new Map()
  displayIdByRemoteItemId = new Map()
  for (const identity of identities) setRemoteItemIdentity(identity)
}

function toWebhookStatus(
  integrationStatus: MockContentItem['integrationStatus']
): MockDistribution['webhookStatus'] {
  return integrationStatus === '미설정' ? '연동 미설정' : integrationStatus
}

function readConfiguredSource(): ContentWorkspaceSourceMode {
  const raw = String(import.meta.env.VITE_CONTENT_WORKSPACE_SOURCE ?? 'auto').trim().toLowerCase()
  if (raw === 'local' || raw === 'supabase') return raw
  return 'auto'
}

function normalizeSiteName(asset: ShowroomImageAsset) {
  return asset.canonical_site_name?.trim() || asset.site_name?.trim() || asset.external_display_name?.trim() || '미지정 현장'
}

function buildPriorityReason(assetCount: number, businessType: string, tags: string[]) {
  if (assetCount < 3) return '준비 보완'
  if (!businessType || businessType === '기타') return '연동 보완'
  if (tags.length < 2) return '템플릿 보완'
  return '자동화 확인'
}

function buildContentCandidate(images: ShowroomImageAsset[], existing?: MockContentItem): MockContentItem {
  const siteName = normalizeSiteName(images[0]!)
  const businessTypes = Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[]))
  const locations = Array.from(new Set(images.map((image) => image.location?.trim()).filter(Boolean) as string[]))
  const products = Array.from(new Set(images.map((image) => image.product_name?.trim()).filter(Boolean) as string[]))
  const colors = Array.from(new Set(images.map((image) => image.color_name?.trim()).filter(Boolean) as string[]))
  const tags = Array.from(new Set([businessTypes[0], ...products.slice(0, 2), ...colors.slice(0, 2)].filter(Boolean) as string[])).slice(0, 5)
  const readinessScore = Math.min(96, 45 + images.length * 8 + tags.length * 4)
  const automationScore = Math.min(90, 35 + products.length * 10 + colors.length * 4)
  const priorityReason = buildPriorityReason(images.length, businessTypes[0] ?? '', tags)
  const latestCreatedAtCandidates = ([...images]
    .map((image) => image.created_at)
    .filter(Boolean) as string[])
    .sort()
  const latestTimestamp = latestCreatedAtCandidates.length > 0
    ? latestCreatedAtCandidates[latestCreatedAtCandidates.length - 1]
    : null

  return {
    id: existing?.id ?? createContentIdFromSiteName(siteName),
    siteName,
    businessType: businessTypes[0] ?? existing?.businessType ?? '기타',
    region: locations[0] ?? existing?.region ?? '미지정',
    status: existing?.status ?? 'queued',
    priorityReason,
    readinessScore,
    automationScore,
    integrationStatus: existing?.integrationStatus ?? 'mock 연결',
    revealLevel: existing?.revealLevel ?? 'summary',
    updatedAt: latestTimestamp ?? nowIso(),
    tags,
    blogTitle: existing?.blogTitle ?? `${siteName} 사례로 보는 ${businessTypes[0] ?? '공간'} 설계 포인트`,
    seoDescription:
      existing?.seoDescription ??
      `${siteName} 현장의 실제 이미지 자산을 바탕으로 ${businessTypes[0] ?? '공간'} 설계 포인트를 정리한 콘텐츠 초안`,
    ctaText:
      existing?.ctaText ??
      '유사 사례를 더 보고 싶다면 쇼룸과 연결된 사례를 먼저 확인한 뒤 상담으로 넘어가세요.',
    faqTopics: existing?.faqTopics ?? ['예산', '공간 활용', '공사기간', '업종 적합성'],
    derivativeHook: existing?.derivativeHook ?? `${siteName} 공간이 달라 보이는 핵심 한 가지`,
  }
}

function normalizeStatus(value: unknown): MockContentItem['status'] {
  const normalized = String(value ?? '').trim()
  if (normalized === 'idea' || normalized === 'queued' || normalized === 'draft' || normalized === 'review' || normalized === 'approved' || normalized === 'published') {
    return normalized
  }
  return 'queued'
}

function normalizeRevealLevel(value: unknown): MockContentItem['revealLevel'] {
  const normalized = String(value ?? '').trim()
  if (normalized === 'teaser' || normalized === 'summary' || normalized === 'detail') return normalized
  return 'summary'
}

function normalizeDistributionStatus(value: unknown): MockDistribution['status'] {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'not_generated'
    || normalized === 'draft_ready'
    || normalized === 'review_pending'
    || normalized === 'scheduled'
    || normalized === 'published'
    || normalized === 'error'
  ) {
    return normalized
  }
  return 'not_generated'
}

function normalizeAutomationStatus(value: unknown): MockAutomationJob['status'] {
  const normalized = String(value ?? '').trim()
  if (normalized === 'queued' || normalized === 'processing' || normalized === 'completed' || normalized === 'failed') {
    return normalized
  }
  return 'queued'
}

function mapChannelLabel(channel: unknown): string {
  const normalized = String(channel ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'google_blog':
      return 'Google Blog'
    case 'naver_blog':
      return 'Naver Blog'
    case 'youtube_shorts':
      return 'YouTube Shorts'
    case 'youtube_long':
      return 'YouTube Longform'
    case 'instagram':
    case 'instagram_reels':
      return 'Instagram Reels'
    case 'facebook':
    case 'facebook_video':
      return 'Facebook Video'
    case 'tiktok':
      return 'TikTok'
    default:
      return String(channel ?? '미지정 채널')
  }
}

function mapChannelValue(channel: string): string {
  const normalized = channel.trim().toLowerCase()
  if (normalized.includes('google')) return 'google_blog'
  if (normalized.includes('naver')) return 'naver_blog'
  if (normalized.includes('youtube shorts')) return 'youtube_shorts'
  if (normalized.includes('youtube long')) return 'youtube_long'
  if (normalized.includes('instagram')) return 'instagram_reels'
  if (normalized.includes('facebook')) return 'facebook_video'
  if (normalized.includes('tiktok')) return 'tiktok'
  return normalized.replace(/\s+/g, '_')
}

function inferIntegrationStatus(distributions: MockDistribution[]): MockContentItem['integrationStatus'] {
  if (distributions.some((item) => item.webhookStatus === '실URL 연결')) return '실URL 연결'
  if (distributions.some((item) => item.webhookStatus === 'mock 연결')) return 'mock 연결'
  return '미설정'
}

function inferPriorityReason(item: {
  tags: string[]
  businessType: string
  distributions: MockDistribution[]
  jobs: MockAutomationJob[]
  blogTitle: string
}): string {
  if (!item.businessType || item.businessType === '기타') return '연동 보완'
  if (!item.blogTitle.trim() || item.tags.length < 2) return '템플릿 보완'
  if (item.distributions.length === 0 || item.jobs.some((job) => job.status === 'failed')) return '자동화 확인'
  return '자동화 확인'
}

function computeReadinessScore(tags: string[], blogTitle: string, seoDescription: string, faqTopics: string[]): number {
  let score = 45
  if (tags.length >= 2) score += 15
  if (blogTitle.trim()) score += 15
  if (seoDescription.trim()) score += 10
  if (faqTopics.length > 0) score += 10
  return Math.min(score, 95)
}

function computeAutomationScore(distributions: MockDistribution[], jobs: MockAutomationJob[]): number {
  let score = 30
  score += Math.min(distributions.length * 10, 40)
  score += Math.min(jobs.length * 5, 20)
  if (jobs.some((job) => job.status === 'completed')) score += 10
  return Math.min(score, 95)
}

function mapTemplatePerformanceLabel(usageCount: number, isActive: boolean) {
  if (!isActive) return '비활성'
  if (usageCount >= 15) return '안정적'
  if (usageCount >= 5) return '테스트 확대'
  return '신규'
}

function mapTemplateType(value: unknown): MockTemplate['templateType'] {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'blog'
    || normalized === 'cta'
    || normalized === 'shorts_blog_service'
    || normalized === 'shorts_youtube_engine'
    || normalized === 'long_form'
  ) {
    return normalized as MockTemplate['templateType']
  }
  if (normalized === 'shorts') return 'shorts_youtube_engine'
  return 'blog'
}

function inferSourceType(item: MockContentItem) {
  return item.id.startsWith('content-') ? 'showroom_sync' : 'manual'
}

function buildSecondaryKeywords(item: MockContentItem) {
  return Array.from(new Set([
    ...item.tags.slice(2),
    ...item.faqTopics.slice(0, 3),
    item.region,
  ].filter(Boolean)))
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : []
}

function parseFaqTopicsFromDraft(row: Record<string, unknown> | undefined) {
  if (!row) return [] as string[]
  const directQuestions = parseStringArray(row.aeo_questions)
  const faqItems = Array.isArray(row.faq_items)
    ? row.faq_items
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
        const question = (entry as Record<string, unknown>).question
        return String(question ?? '').trim()
      })
      .filter(Boolean)
    : []
  return Array.from(new Set([...directQuestions, ...faqItems]))
}

function toRemoteDerivativeType(type: MockDerivative['type']) {
  if (type === 'social_caption') return 'social_caption'
  if (type === 'shorts_blog_service' || type === 'shorts_youtube_engine' || type === 'long_form') return type
  return 'social_caption'
}

function fromRemoteDerivativeType(value: unknown): MockDerivative['type'] {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'shorts_blog_service'
    || normalized === 'shorts_youtube_engine'
    || normalized === 'long_form'
  ) return normalized
  if (normalized === 'shorts') return 'shorts_youtube_engine'
  return 'social_caption'
}

function toRemoteDerivativeStatus(status: MockDerivative['status']) {
  if (status === 'approved') return 'published'
  if (status === 'review_pending') return 'in_review'
  return 'draft_ready'
}

function fromRemoteDerivativeStatus(value: unknown): MockDerivative['status'] {
  const normalized = String(value ?? '').trim()
  if (normalized === 'published') return 'approved'
  if (normalized === 'in_review') return 'review_pending'
  return 'draft_ready'
}

function getDerivativePayloadValue(row: Record<string, unknown>, key: string) {
  const payload = row.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = (payload as Record<string, unknown>)[key]
  return value == null ? null : String(value)
}

function slugifyValue(value: string) {
  return encodeURIComponent(value.trim().toLowerCase()).replace(/%/g, '')
}

function buildShowroomGroupKey(siteName: string, images: ShowroomImageAsset[]) {
  const spaceId = images.find((image) => image.space_id?.trim())?.space_id?.trim()
  if (spaceId) return `showroom:space:${spaceId}`
  return `showroom:site:${slugifyValue(siteName)}`
}

function buildRemoteItemPayload(item: MockContentItem) {
  return {
    ...(isUuidLike(item.id) ? { id: item.id } : {}),
    content_code: item.id,
    site_name: item.siteName,
    business_type: item.businessType,
    region: item.region,
    source_type: inferSourceType(item) === 'manual' ? 'asset' : 'showroom',
    linked_asset_count: item.tags.length,
    linked_showroom_group: item.siteName,
    product_names: item.tags,
    color_names: [],
    before_after_available: false,
    status: item.status,
    pain_point: item.seoDescription,
    target_persona: `${item.businessType || '공간'} 도입을 검토하는 실무 담당자`,
    content_angle: item.derivativeHook,
    core_claim: item.derivativeHook,
    proof_points: item.faqTopics,
    cta_type: item.ctaText.trim() ? 'consultation' : null,
    primary_keyword: item.tags[0] ?? item.businessType,
    secondary_keywords: buildSecondaryKeywords(item),
    faq_topics: item.faqTopics,
    video_conversion_score: item.automationScore,
    aeo_score: item.readinessScore,
    reveal_level: item.revealLevel,
    updated_at: item.updatedAt,
  }
}

function buildRemoteBlogDraftPayload(item: MockContentItem, remoteItemId: string, remoteDraftId?: string | null) {
  return {
    ...(remoteDraftId ? { id: remoteDraftId } : {}),
    content_item_id: remoteItemId,
    version_no: 1,
    title_candidates: [item.blogTitle].filter(Boolean),
    selected_title: item.blogTitle,
    meta_description: item.seoDescription,
    aeo_questions: item.faqTopics,
    faq_items: item.faqTopics.map((topic) => ({ question: topic, answer: '' })),
    body_markdown: [item.seoDescription, '', '핵심 질문', ...item.faqTopics.map((topic) => `- ${topic}`), '', item.ctaText]
      .filter(Boolean)
      .join('\n'),
    cta_copy: item.ctaText,
    seo_score: item.readinessScore,
    aeo_score: item.automationScore,
    internal_link_suggestions: [],
    generation_source: inferSourceType(item) === 'manual' ? 'manual' : 'ai_edited',
    is_current: true,
    updated_at: item.updatedAt,
  }
}

function buildRemoteActivityLogPayload(log: MockActivityLog, remoteItemId: string) {
  return {
    id: log.id,
    content_item_id: remoteItemId,
    action_type: log.actionType,
    from_status: log.fromStatus,
    to_status: log.toStatus,
    channel: log.channel ? mapChannelValue(log.channel) : null,
    message: log.message,
    payload: {
      contentItemId: log.contentItemId,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      channel: log.channel,
      message: log.message,
    },
    created_at: log.createdAt,
  }
}

function buildRemoteDerivativePayload(
  derivative: MockDerivative,
  remoteItemId: string,
  remoteDerivativeId?: string | null
) {
  return {
    ...(remoteDerivativeId ? { id: remoteDerivativeId } : {}),
    content_item_id: remoteItemId,
    derivative_type: toRemoteDerivativeType(derivative.type),
    status: toRemoteDerivativeStatus(derivative.status),
    payload: {
      channel: mapChannelValue(derivative.channel),
      title: derivative.title,
      body: derivative.body,
      hookText: derivative.hookText,
      outline: derivative.outline,
      originalType: derivative.type,
    },
    version_no: 1,
    updated_at: derivative.updatedAt,
  }
}

function buildRemoteDistributionPayload(
  distribution: MockDistribution,
  remoteItemId: string,
  remoteDistributionId?: string | null
) {
  const nextStatus = distribution.status
  return {
    ...(remoteDistributionId ? { id: remoteDistributionId } : {}),
    content_item_id: remoteItemId,
    channel: mapChannelValue(distribution.channel),
    status: nextStatus,
    publish_url: distribution.publishUrl,
    published_at: nextStatus === 'published' ? distribution.updatedAt : null,
    last_checked_at: distribution.updatedAt,
    error_message: nextStatus === 'error' ? '운영 확인 필요' : null,
    updated_at: distribution.updatedAt,
  }
}

function buildRemoteJobPayload(
  job: MockAutomationJob,
  remoteContentItemId?: string | null,
  distributionId?: string | null
) {
  return {
    id: job.id,
    content_item_id: remoteContentItemId ?? job.contentItemId,
    distribution_id: distributionId ?? createDistributionId(job.contentItemId, job.channel),
    channel: mapChannelValue(job.channel),
    job_type: job.jobType,
    status: job.status,
    payload: {
      contentItemId: job.contentItemId,
      channel: job.channel,
      jobType: job.jobType,
      status: job.status,
    },
    error_message: job.errorMessage,
    requested_at: job.updatedAt,
    completed_at: job.reflectedAt,
    updated_at: job.updatedAt,
  }
}

function buildRemoteTemplatePayload(template: MockTemplate) {
  return {
    ...(isUuidLike(template.id) ? { id: template.id } : {}),
    template_type: template.templateType,
    name: template.name,
    description: template.description,
    structure_summary: template.description,
    body_template: `${template.name}\n\n${template.description}`,
    example_payload: {
      performanceLabel: template.performanceLabel,
      usageCount: template.usageCount,
    },
    usage_count: template.usageCount,
    is_active: template.performanceLabel !== '비활성',
    updated_at: nowIso(),
  }
}

function buildDefaultDerivatives(item: MockContentItem, existing: MockDerivative[]): MockDerivative[] {
  const existingKeys = new Set(existing.map((entry) => `${entry.type}::${entry.channel}`))
  return DEFAULT_DERIVATIVE_CHANNELS
    .filter((entry) => !existingKeys.has(`${entry.type}::${entry.channel}`))
    .map((entry) => ({
      id: createDerivativeId(item.id, entry.type, entry.channel),
      contentItemId: item.id,
      type: entry.type,
      channel: entry.channel,
      title: `${item.siteName} ${entry.titleSuffix}`,
      body: item.ctaText || item.seoDescription || item.blogTitle,
      hookText: item.derivativeHook || item.blogTitle,
      outline: item.faqTopics.length > 0 ? item.faqTopics.join(' / ') : item.tags.join(' / '),
      status: 'draft_ready',
      updatedAt: item.updatedAt,
    }))
}

function buildSyncActivityLog(item: MockContentItem, createdAt: string, isNew: boolean): MockActivityLog {
  return {
    id: createActivityLogId(item.id, isNew ? 'queue_sync_added' : 'queue_sync_updated', createdAt),
    contentItemId: item.id,
    actionType: isNew ? 'queue_sync_added' : 'queue_sync_updated',
    fromStatus: isNew ? null : item.status,
    toStatus: item.status,
    channel: null,
    message: isNew
      ? '쇼룸 원천 이미지 기준으로 신규 콘텐츠 후보가 생성되었습니다.'
      : '쇼룸 원천 이미지 기준으로 콘텐츠 후보가 다시 동기화되었습니다.',
    createdAt,
  }
}

function shouldAttemptRemotePersistence() {
  return readConfiguredSource() !== 'local'
}

function getWritableSupabase() {
  if (!shouldAttemptRemotePersistence()) return null
  try {
    return getSupabase()
  } catch {
    return null
  }
}

async function ensureRemoteItemId(item: MockContentItem) {
  const knownRemoteId = remoteItemIdByDisplayId.get(item.id)
  if (knownRemoteId) return knownRemoteId

  const supabase = getWritableSupabase()
  if (!supabase) return item.id

  if (isUuidLike(item.id)) {
    setRemoteItemIdentity({ displayId: item.id, remoteId: item.id })
    return item.id
  }

  const { data: existingByCode } = await supabase
    .from('content_items')
    .select('id, content_code')
    .eq('content_code', item.id)
    .maybeSingle()

  if (existingByCode?.id) {
    const identity = {
      displayId: String(existingByCode.content_code ?? item.id),
      remoteId: String(existingByCode.id),
    }
    setRemoteItemIdentity(identity)
    return identity.remoteId
  }

  const { data: existingBySite } = await supabase
    .from('content_items')
    .select('id, content_code')
    .eq('site_name', item.siteName)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingBySite?.id) {
    const identity = {
      displayId: String(existingBySite.content_code ?? item.id),
      remoteId: String(existingBySite.id),
    }
    setRemoteItemIdentity(identity)
    return identity.remoteId
  }

  await upsertRemoteItem(item)
  return remoteItemIdByDisplayId.get(item.id) ?? item.id
}

async function resolveRemoteItemIdForRead(contentItemId: string) {
  const knownRemoteId = remoteItemIdByDisplayId.get(contentItemId)
  if (knownRemoteId) return knownRemoteId
  if (isUuidLike(contentItemId)) return contentItemId

  const supabase = getWritableSupabase()
  const item = getStoredContentItem(contentItemId)
  if (!supabase || !item) return null

  const { data: existingByCode } = await supabase
    .from('content_items')
    .select('id, content_code')
    .eq('content_code', item.id)
    .maybeSingle()

  if (existingByCode?.id) {
    const identity = {
      displayId: String(existingByCode.content_code ?? item.id),
      remoteId: String(existingByCode.id),
    }
    setRemoteItemIdentity(identity)
    return identity.remoteId
  }

  const { data: existingBySite } = await supabase
    .from('content_items')
    .select('id, content_code')
    .eq('site_name', item.siteName)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingBySite?.id) {
    const identity = {
      displayId: String(existingBySite.content_code ?? item.id),
      remoteId: String(existingBySite.id),
    }
    setRemoteItemIdentity(identity)
    return identity.remoteId
  }

  return null
}

async function upsertBlogDraftForItem(item: MockContentItem) {
  const supabase = getWritableSupabase()
  if (!supabase) return
  const remoteItemId = await ensureRemoteItemId(item)
  const { data: existingDraft } = await supabase
    .from('content_blog_drafts')
    .select('id')
    .eq('content_item_id', remoteItemId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await supabase
    .from('content_blog_drafts')
    .upsert(buildRemoteBlogDraftPayload(item, remoteItemId, existingDraft ? String(existingDraft.id) : null))
  if (error) throw new Error(error.message)
}

async function insertRemoteActivityLog(log: MockActivityLog) {
  const supabase = getWritableSupabase()
  if (!supabase) return
  const remoteItemId = remoteItemIdByDisplayId.get(log.contentItemId) ?? log.contentItemId
  const { error } = await supabase
    .from('content_activity_logs')
    .upsert(buildRemoteActivityLogPayload(log, remoteItemId))
  if (error) throw new Error(error.message)
}

async function upsertRemoteDerivative(derivative: MockDerivative) {
  const supabase = getWritableSupabase()
  if (!supabase) return
  const remoteItemId = remoteItemIdByDisplayId.get(derivative.contentItemId) ?? derivative.contentItemId
  const remoteType = toRemoteDerivativeType(derivative.type)
  const mappedChannel = mapChannelValue(derivative.channel)
  const { data: existingRows } = await supabase
    .from('content_derivatives')
    .select('id, payload')
    .eq('content_item_id', remoteItemId)
    .eq('derivative_type', remoteType)
    .order('updated_at', { ascending: false })
    .limit(5)
  const existingId = (existingRows ?? []).find((row) => {
    const payload = row.payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
    return String((payload as Record<string, unknown>).channel ?? '') === mappedChannel
  })?.id
  const { error } = await supabase
    .from('content_derivatives')
    .upsert(buildRemoteDerivativePayload(derivative, remoteItemId, existingId ? String(existingId) : null))
  if (error) throw new Error(error.message)
}

async function upsertRemoteDerivativesForItem(
  item: MockContentItem,
  derivatives: MockDerivative[]
) {
  const relevant = derivatives.filter((entry) => entry.contentItemId === item.id)
  for (const derivative of relevant) {
    await upsertRemoteDerivative(derivative)
  }
}

async function upsertRemoteDistribution(distribution: MockDistribution) {
  const supabase = getWritableSupabase()
  if (!supabase) return
  const remoteItemId = remoteItemIdByDisplayId.get(distribution.contentItemId) ?? distribution.contentItemId
  const mappedChannel = mapChannelValue(distribution.channel)
  const { data: existingDistribution } = await supabase
    .from('content_distributions')
    .select('id')
    .eq('content_item_id', remoteItemId)
    .eq('channel', mappedChannel)
    .maybeSingle()
  const { error } = await supabase
    .from('content_distributions')
    .upsert(
      buildRemoteDistributionPayload(
        distribution,
        remoteItemId,
        existingDistribution ? String(existingDistribution.id) : null
      )
    )
  if (error) throw new Error(error.message)
}

async function upsertRemoteItem(item: MockContentItem) {
  const supabase = getWritableSupabase()
  if (!supabase) return
  const payload = buildRemoteItemPayload(item)
  const query = supabase
    .from('content_items')
    .upsert(
      payload,
      !isUuidLike(item.id)
        ? { onConflict: 'content_code' }
        : undefined
    )
    .select('id, content_code')
    .single()
  const { data, error } = await query
  if (error) throw new Error(error.message)
  setRemoteItemIdentity({
    displayId: String(data.content_code ?? item.id),
    remoteId: String(data.id),
  })
}

async function syncRemoteSourcesForItem(item: MockContentItem, images: ShowroomImageAsset[]) {
  const supabase = getWritableSupabase()
  if (!supabase || images.length === 0) return

  const remoteItemId = await ensureRemoteItemId(item)
  const showroomGroupKey = buildShowroomGroupKey(item.siteName, images)
  const imageAssetIds = images
    .map((image) => image.id)
    .filter((id) => isUuidLike(id))

  const { data: existingRows, error: existingError } = await supabase
    .from('content_sources')
    .select('id, source_kind, image_asset_id, showroom_group_key')
    .eq('content_item_id', remoteItemId)

  if (existingError) throw new Error(existingError.message)

  const existingImageAssetIds = new Set(
    (existingRows ?? [])
      .map((row) => row.image_asset_id)
      .filter(Boolean)
      .map((value) => String(value))
  )
  const hasShowroomGroup = (existingRows ?? []).some(
    (row) => row.source_kind === 'showroom_group' && String(row.showroom_group_key ?? '') === showroomGroupKey
  )

  const rowsToInsert: Array<Record<string, unknown>> = []

  if (!hasShowroomGroup) {
    rowsToInsert.push({
      content_item_id: remoteItemId,
      source_kind: 'showroom_group',
      showroom_group_key: showroomGroupKey,
      is_primary: true,
      snapshot: {
        siteName: item.siteName,
        businessType: item.businessType,
        region: item.region,
        spaceId: images.find((image) => image.space_id)?.space_id ?? null,
        imageCount: images.length,
      },
    })
  }

  for (const image of images) {
    if (!isUuidLike(image.id) || existingImageAssetIds.has(image.id)) continue
    rowsToInsert.push({
      content_item_id: remoteItemId,
      source_kind: 'image_asset',
      image_asset_id: image.id,
      is_primary: false,
      snapshot: {
        siteName: normalizeSiteName(image),
        businessType: image.business_type,
        productName: image.product_name,
        colorName: image.color_name,
        spaceId: image.space_id ?? null,
        createdAt: image.created_at,
      },
    })
  }

  if (rowsToInsert.length === 0) return

  const { error } = await supabase.from('content_sources').insert(rowsToInsert)
  if (error) throw new Error(error.message)
}

function buildPersistenceResult<T>(
  state: ContentWorkspaceSnapshot,
  entity: T | null,
  source: ContentPersistenceSource,
  remoteError?: string
): ContentPersistenceResult<T> {
  return { state, entity, source, remoteError }
}

let snapshotCache: ContentWorkspaceSnapshot = readContentWorkspaceState()
let runtimeState: ContentWorkspaceRuntime = {
  source: 'local',
  label: '로컬 워크스페이스',
  fallback: false,
}
let lastPersistenceState: ContentLastPersistence | null = null

function setLastPersistence(next: ContentLastPersistence) {
  lastPersistenceState = next
}

function setSnapshotCache(next: ContentWorkspaceSnapshot) {
  snapshotCache = next
  writeContentWorkspaceState(next)
  return next
}

function readSnapshotCache() {
  snapshotCache = readContentWorkspaceState()
  return snapshotCache
}

async function tryRefreshFromSupabase(): Promise<ContentWorkspaceSnapshot | null> {
  const configuredSource = readConfiguredSource()
  if (configuredSource === 'local') {
    runtimeState = { source: 'local', label: '로컬 워크스페이스', fallback: false }
    return readSnapshotCache()
  }

  let supabase
  try {
    supabase = getSupabase()
  } catch {
    runtimeState = {
      source: 'local',
      label: configuredSource === 'supabase' ? 'Supabase 미설정, 로컬 사용 중' : '로컬 워크스페이스',
      fallback: configuredSource === 'supabase',
    }
    return configuredSource === 'supabase' ? readSnapshotCache() : null
  }

  const [itemsResult, draftsResult, distributionsResult, jobsResult, templatesResult, derivativesResult, activityLogsResult] = await Promise.all([
    supabase.from('content_items').select('*').order('updated_at', { ascending: false }),
    supabase.from('content_blog_drafts').select('*').order('updated_at', { ascending: false }),
    supabase.from('content_distributions').select('*').order('updated_at', { ascending: false }),
    supabase.from('content_automation_jobs').select('*').order('updated_at', { ascending: false }),
    supabase.from('content_templates').select('*').order('updated_at', { ascending: false }),
    supabase.from('content_derivatives').select('*').order('updated_at', { ascending: false }),
    supabase.from('content_activity_logs').select('*').order('created_at', { ascending: false }),
  ])

  if (
    itemsResult.error
    || draftsResult.error
    || distributionsResult.error
    || jobsResult.error
    || templatesResult.error
    || derivativesResult.error
    || activityLogsResult.error
  ) {
    runtimeState = {
      source: 'local',
      label: configuredSource === 'supabase' ? 'Supabase 읽기 실패, 로컬 사용 중' : '로컬 워크스페이스',
      fallback: true,
    }
    return configuredSource === 'supabase' ? readSnapshotCache() : null
  }

  const draftRows = (draftsResult.data ?? []) as Record<string, unknown>[]
  const distributionRows = (distributionsResult.data ?? []) as Record<string, unknown>[]
  const jobRows = (jobsResult.data ?? []) as Record<string, unknown>[]
  const templateRows = (templatesResult.data ?? []) as Record<string, unknown>[]
  const derivativeRows = (derivativesResult.data ?? []) as Record<string, unknown>[]
  const activityLogRows = (activityLogsResult.data ?? []) as Record<string, unknown>[]
  const itemRows = (itemsResult.data ?? []) as Record<string, unknown>[]
  const remoteIdentities = itemRows.map((row) => ({
    displayId: getDisplayItemId(row),
    remoteId: String(row.id ?? ''),
  }))
  replaceRemoteItemIdentityMap(remoteIdentities)

  const localState = readContentWorkspaceState()
  const localItemById = new Map(localState.items.map((item) => [item.id, item] as const))
  const localDistributionByKey = new Map(
    localState.distributions.map((item) => [`${item.contentItemId}::${item.channel}`, item] as const)
  )

  const draftsByContentId = new Map<string, Record<string, unknown>>()
  for (const row of draftRows) {
    const contentItemId = String(row.content_item_id ?? '')
    if (!contentItemId || draftsByContentId.has(contentItemId)) continue
    draftsByContentId.set(contentItemId, row)
  }

  const distributions: MockDistribution[] = distributionRows.map((row) => {
    const status = normalizeDistributionStatus(row.status)
    const publishUrl = row.publish_url != null ? String(row.publish_url) : null
    const rawContentItemId = String(row.content_item_id ?? '')
    const contentItemId = displayIdByRemoteItemId.get(rawContentItemId) ?? rawContentItemId
    const channel = mapChannelLabel(row.channel)
    const localDistribution = localDistributionByKey.get(`${contentItemId}::${channel}`)
    const localItem = localItemById.get(contentItemId)
    return {
      id: String(row.id),
      contentItemId,
      channel,
      status,
      publishUrl,
      webhookStatus: localDistribution?.webhookStatus ?? (localItem ? toWebhookStatus(localItem.integrationStatus) : 'mock 연결'),
      updatedAt: String(row.updated_at ?? row.last_checked_at ?? row.published_at ?? nowIso()),
    }
  })

  const jobs: MockAutomationJob[] = jobRows.map((row) => ({
    id: String(row.id),
    contentItemId: displayIdByRemoteItemId.get(String(row.content_item_id ?? '')) ?? String(row.content_item_id ?? ''),
    channel: mapChannelLabel(row.channel),
    jobType: String(row.job_type ?? 'distribution_sync'),
    status: normalizeAutomationStatus(String(row.status) === 'cancelled' ? 'failed' : row.status),
    updatedAt: String(row.updated_at ?? row.requested_at ?? nowIso()),
    reflectedAt: row.completed_at != null ? String(row.completed_at) : null,
    errorMessage: row.error_message != null ? String(row.error_message) : String(row.status) === 'cancelled' ? '작업이 취소되었습니다.' : null,
  }))

  const templates: MockTemplate[] = templateRows.map((row) => {
    const usageCount = Number(row.usage_count ?? 0)
    const isActive = row.is_active !== false
    const payload = row.example_payload && typeof row.example_payload === 'object' && !Array.isArray(row.example_payload)
      ? row.example_payload as Record<string, unknown>
      : null
    return {
      id: String(row.id),
      templateType: mapTemplateType(row.template_type),
      name: String(row.name ?? '이름 없는 템플릿'),
      description: String(row.description ?? row.structure_summary ?? ''),
      usageCount,
      performanceLabel: String(payload?.performanceLabel ?? mapTemplatePerformanceLabel(usageCount, isActive)),
    }
  })

  const derivatives: MockDerivative[] = derivativeRows.map((row) => ({
    id: String(row.id),
    contentItemId: displayIdByRemoteItemId.get(String(row.content_item_id ?? '')) ?? String(row.content_item_id ?? ''),
    type: fromRemoteDerivativeType(
      getDerivativePayloadValue(row, 'originalType') ?? row.derivative_type
    ),
    channel: mapChannelLabel(getDerivativePayloadValue(row, 'channel') ?? 'instagram'),
    title: getDerivativePayloadValue(row, 'title') ?? '제목 없는 파생 초안',
    body: getDerivativePayloadValue(row, 'body') ?? '',
    hookText: getDerivativePayloadValue(row, 'hookText') ?? '',
    outline: getDerivativePayloadValue(row, 'outline') ?? '',
    status: fromRemoteDerivativeStatus(row.status),
    updatedAt: String(row.updated_at ?? nowIso()),
  }))

  const activityLogs: MockActivityLog[] = activityLogRows.map((row) => ({
    id: String(row.id),
    contentItemId: displayIdByRemoteItemId.get(String(row.content_item_id ?? '')) ?? String(row.content_item_id ?? ''),
    actionType: String(row.action_type ?? 'unknown'),
    fromStatus: row.from_status != null ? String(row.from_status) : null,
    toStatus: row.to_status != null ? String(row.to_status) : null,
    channel: row.channel != null ? mapChannelLabel(row.channel) : null,
    message: String(row.message ?? ''),
    createdAt: String(row.created_at ?? nowIso()),
  }))

  const nextItems: MockContentItem[] = itemRows.map((row) => {
    const remoteId = String(row.id)
    const id = getDisplayItemId(row)
    const draft = draftsByContentId.get(remoteId)
    const itemDistributions = distributions.filter((entry) => entry.contentItemId === id)
    const itemJobs = jobs.filter((entry) => entry.contentItemId === id)
    const tags = Array.from(new Set([
      String(row.primary_keyword ?? '').trim(),
      ...parseStringArray(row.product_names),
      ...parseStringArray(row.color_names),
      ...parseStringArray(row.secondary_keywords),
    ].filter(Boolean)))
    const faqTopics = Array.from(new Set([
      ...parseStringArray(row.faq_topics),
      ...parseFaqTopicsFromDraft(draft),
    ]))
    const titleCandidates = parseStringArray(draft?.title_candidates)
    const blogTitle = String(draft?.selected_title ?? titleCandidates[0] ?? `${String(row.site_name ?? '미지정 현장')} 사례 콘텐츠`)
    const seoDescription = String(draft?.meta_description ?? row.pain_point ?? '')
    const derivativeHook = String(
      row.content_angle
      ?? parseStringArray(draft?.aeo_questions)[0]
      ?? `${String(row.site_name ?? '미지정 현장')} 핵심 포인트`
    )

    return {
      id,
      siteName: String(row.site_name ?? '미지정 현장'),
      businessType: String(row.business_type ?? '기타'),
      region: String(row.region ?? '미지정'),
      status: normalizeStatus(row.status),
      priorityReason: inferPriorityReason({
        tags,
        businessType: String(row.business_type ?? ''),
        distributions: itemDistributions,
        jobs: itemJobs,
        blogTitle,
      }),
      readinessScore: computeReadinessScore(tags, blogTitle, seoDescription, faqTopics),
      automationScore: computeAutomationScore(itemDistributions, itemJobs),
      integrationStatus: inferIntegrationStatus(itemDistributions),
      revealLevel: normalizeRevealLevel(row.reveal_level),
      updatedAt: String(row.updated_at ?? nowIso()),
      tags,
      blogTitle,
      seoDescription,
      ctaText: String(draft?.cta_copy ?? ''),
      faqTopics,
      derivativeHook,
    }
  })

  const nextSnapshot: ContentWorkspaceSnapshot = {
    items: nextItems,
    distributions,
    jobs,
    templates,
    derivatives,
    activityLogs,
  }

  if (
    readConfiguredSource() === 'auto'
    && nextSnapshot.items.length === 0
    && nextSnapshot.distributions.length === 0
    && nextSnapshot.jobs.length === 0
    && nextSnapshot.templates.length === 0
  ) {
    runtimeState = {
      source: 'local',
      label: 'Supabase 비어 있음, 로컬 워크스페이스 사용 중',
      fallback: true,
    }
    return readSnapshotCache()
  }

  runtimeState = {
    source: 'supabase',
    label: 'Supabase 원천 연결',
    fallback: false,
  }

  return setSnapshotCache(nextSnapshot)
}

const localContentWorkspaceService: ContentWorkspaceService = {
  now: nowIso,
  readSnapshot: readSnapshotCache,
  refreshSnapshot: async () => {
    const configuredSource = readConfiguredSource()
    if (configuredSource === 'local') {
      runtimeState = { source: 'local', label: '로컬 워크스페이스', fallback: false }
      return readSnapshotCache()
    }
    const snapshot = await tryRefreshFromSupabase()
    return snapshot ?? readSnapshotCache()
  },
  getRuntime: () => runtimeState,
  getLastPersistence: () => lastPersistenceState,
  exportSnapshot: exportContentWorkspaceState,
  resetSampleData: resetContentWorkspaceState,
  listItems: () => readSnapshotCache().items,
  getItem: getStoredContentItem,
  updateItem: updateContentItem,
  persistItem: async (itemId, patch) => {
    const state = updateContentItem(itemId, patch)
    const item = state.items.find((entry) => entry.id === itemId) ?? null
    const supabase = getWritableSupabase()
    if (!supabase || !item) {
      setLastPersistence({
        target: 'item',
        source: 'local',
        message: '콘텐츠 저장이 로컬 워크스페이스에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, item, 'local')
    }

    try {
      await upsertRemoteItem(item)
      await upsertBlogDraftForItem(item)
      await upsertRemoteDerivativesForItem(item, state.derivatives)
      const latestLog = state.activityLogs[0] ?? null
      if (latestLog?.contentItemId === item.id) await insertRemoteActivityLog(latestLog)
      setLastPersistence({
        target: 'item',
        source: 'supabase',
        message: '콘텐츠 저장이 Supabase 원천에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, item, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 콘텐츠 저장 실패'
      setLastPersistence({
        target: 'item',
        source: 'local_fallback',
        message: '콘텐츠 저장은 로컬에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        item,
        'local_fallback',
        remoteError
      )
    }
  },
  listDistributions: () => readSnapshotCache().distributions,
  listDistributionsByContent: getStoredContentDistributions,
  updateDistribution,
  persistDistribution: async (distributionId, patch) => {
    const state = updateDistribution(distributionId, patch)
    const distribution = state.distributions.find((entry) => entry.id === distributionId) ?? null
    const item = distribution
      ? state.items.find((entry) => entry.id === distribution.contentItemId) ?? null
      : null
    const supabase = getWritableSupabase()
    if (!supabase || !distribution) {
      setLastPersistence({
        target: 'distribution',
        source: 'local',
        message: '배포 상태 저장이 로컬 워크스페이스에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, distribution, 'local')
    }

    try {
      if (item) {
        await upsertRemoteItem(item)
        await upsertBlogDraftForItem(item)
      }
      await upsertRemoteDistribution(distribution)
      const latestLog = state.activityLogs[0] ?? null
      if (latestLog?.contentItemId === distribution.contentItemId) await insertRemoteActivityLog(latestLog)
      setLastPersistence({
        target: 'distribution',
        source: 'supabase',
        message: '배포 상태가 Supabase 원천에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, distribution, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 배포 상태 저장 실패'
      setLastPersistence({
        target: 'distribution',
        source: 'local_fallback',
        message: '배포 상태는 로컬에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        distribution,
        'local_fallback',
        remoteError
      )
    }
  },
  listJobs: () => readSnapshotCache().jobs,
  listJobsByContent: getStoredContentJobs,
  createJob: createAutomationJob,
  createAutomationRequest: async (contentItemId, channel) => {
    const { state, job } = createAutomationJob(contentItemId, channel)
    const item = state.items.find((entry) => entry.id === contentItemId) ?? null
    const distribution = state.distributions.find((entry) => entry.contentItemId === contentItemId && entry.channel === channel) ?? null
    const supabase = getWritableSupabase()
    if (!supabase || !job) {
      setLastPersistence({
        target: 'job',
        source: 'local',
        message: '자동화 요청이 로컬 큐에 생성되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, job, 'local')
    }

    try {
      if (item) {
        await upsertRemoteItem(item)
        await upsertBlogDraftForItem(item)
        await upsertRemoteDerivativesForItem(item, state.derivatives)
      }
      if (distribution) await upsertRemoteDistribution(distribution)
      const remoteContentItemId = item
        ? (remoteItemIdByDisplayId.get(item.id) ?? await ensureRemoteItemId(item))
        : (remoteItemIdByDisplayId.get(job.contentItemId) ?? job.contentItemId)
      const remoteDistributionId = distribution?.id && isUuidLike(distribution.id)
        ? distribution.id
        : null
      const { error } = await supabase
        .from('content_automation_jobs')
        .insert(buildRemoteJobPayload(job, remoteContentItemId, remoteDistributionId))
      if (error) throw new Error(error.message)
      const latestLog = state.activityLogs[0] ?? null
      if (latestLog?.contentItemId === contentItemId) await insertRemoteActivityLog(latestLog)
      setLastPersistence({
        target: 'job',
        source: 'supabase',
        message: '자동화 요청이 Supabase 큐에 생성되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, job, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 자동화 요청 저장 실패'
      setLastPersistence({
        target: 'job',
        source: 'local_fallback',
        message: '자동화 요청은 로컬 큐에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        job,
        'local_fallback',
        remoteError
      )
    }
  },
  updateJob: updateAutomationJob,
  persistJob: async (jobId, patch) => {
    const state = updateAutomationJob(jobId, patch)
    const job = state.jobs.find((entry) => entry.id === jobId) ?? null
    const item = job
      ? state.items.find((entry) => entry.id === job.contentItemId) ?? null
      : null
    const distribution = job
      ? state.distributions.find((entry) => entry.contentItemId === job.contentItemId && entry.channel === job.channel) ?? null
      : null
    const supabase = getWritableSupabase()
    if (!supabase || !job) {
      setLastPersistence({
        target: 'job',
        source: 'local',
        message: '자동화 작업 상태가 로컬 큐에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, job, 'local')
    }

    try {
      if (item) {
        await upsertRemoteItem(item)
        await upsertBlogDraftForItem(item)
        await upsertRemoteDerivativesForItem(item, state.derivatives)
      }
      if (distribution) await upsertRemoteDistribution(distribution)
      const remoteContentItemId = item
        ? (remoteItemIdByDisplayId.get(item.id) ?? await ensureRemoteItemId(item))
        : (remoteItemIdByDisplayId.get(job.contentItemId) ?? job.contentItemId)
      const remoteDistributionId = distribution?.id && isUuidLike(distribution.id)
        ? distribution.id
        : null
      const { error } = await supabase
        .from('content_automation_jobs')
        .upsert(buildRemoteJobPayload(job, remoteContentItemId, remoteDistributionId))
      if (error) throw new Error(error.message)
      const latestLog = state.activityLogs[0] ?? null
      if (latestLog?.contentItemId === job.contentItemId) await insertRemoteActivityLog(latestLog)
      setLastPersistence({
        target: 'job',
        source: 'supabase',
        message: '자동화 작업 상태가 Supabase 원천에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, job, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 작업 상태 저장 실패'
      setLastPersistence({
        target: 'job',
        source: 'local_fallback',
        message: '자동화 작업 상태는 로컬 큐에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        job,
        'local_fallback',
        remoteError
      )
    }
  },
  retryJob: retryAutomationJob,
  retryAutomationRequest: async (jobId) => {
    const { state, job } = retryAutomationJob(jobId)
    const item = job
      ? state.items.find((entry) => entry.id === job.contentItemId) ?? null
      : null
    const distribution = job
      ? state.distributions.find((entry) => entry.contentItemId === job.contentItemId && entry.channel === job.channel) ?? null
      : null
    const supabase = getWritableSupabase()
    if (!supabase || !job) {
      setLastPersistence({
        target: 'job',
        source: 'local',
        message: '자동화 재요청이 로컬 큐에 적재되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, job, 'local')
    }

    try {
      if (item) {
        await upsertRemoteItem(item)
        await upsertBlogDraftForItem(item)
        await upsertRemoteDerivativesForItem(item, state.derivatives)
      }
      if (distribution) await upsertRemoteDistribution(distribution)
      const remoteContentItemId = item
        ? (remoteItemIdByDisplayId.get(item.id) ?? await ensureRemoteItemId(item))
        : (remoteItemIdByDisplayId.get(job.contentItemId) ?? job.contentItemId)
      const remoteDistributionId = distribution?.id && isUuidLike(distribution.id)
        ? distribution.id
        : null
      const { error } = await supabase
        .from('content_automation_jobs')
        .insert(buildRemoteJobPayload(job, remoteContentItemId, remoteDistributionId))
      if (error) throw new Error(error.message)
      const latestLog = state.activityLogs[0] ?? null
      if (latestLog?.contentItemId === job.contentItemId) await insertRemoteActivityLog(latestLog)
      setLastPersistence({
        target: 'job',
        source: 'supabase',
        message: '자동화 재요청이 Supabase 큐에 적재되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, job, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 재요청 저장 실패'
      setLastPersistence({
        target: 'job',
        source: 'local_fallback',
        message: '자동화 재요청은 로컬 큐에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        job,
        'local_fallback',
        remoteError
      )
    }
  },
  listTemplates: getStoredTemplates,
  saveTemplate,
  persistTemplate: async (template) => {
    const state = saveTemplate(template)
    const savedTemplate = state.templates.find((entry) => entry.id === template.id) ?? null
    const supabase = getWritableSupabase()
    if (!supabase || !savedTemplate) {
      setLastPersistence({
        target: 'template',
        source: 'local',
        message: '템플릿 저장이 로컬 워크스페이스에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, savedTemplate, 'local')
    }

    try {
      const { error } = await supabase.from('content_templates').upsert(buildRemoteTemplatePayload(savedTemplate))
      if (error) throw new Error(error.message)
      setLastPersistence({
        target: 'template',
        source: 'supabase',
        message: '템플릿 저장이 Supabase 원천에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, savedTemplate, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 템플릿 저장 실패'
      setLastPersistence({
        target: 'template',
        source: 'local_fallback',
        message: '템플릿 저장은 로컬에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        savedTemplate,
        'local_fallback',
        remoteError
      )
    }
  },
  duplicateTemplate,
  duplicateWorkspaceTemplate: async (templateId) => {
    const { state, template } = duplicateTemplate(templateId)
    const supabase = getWritableSupabase()
    if (!supabase || !template) {
      setLastPersistence({
        target: 'template',
        source: 'local',
        message: '템플릿 복제가 로컬 워크스페이스에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, template, 'local')
    }

    try {
      const { error } = await supabase.from('content_templates').insert(buildRemoteTemplatePayload(template))
      if (error) throw new Error(error.message)
      setLastPersistence({
        target: 'template',
        source: 'supabase',
        message: '템플릿 복제가 Supabase 원천에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, template, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 템플릿 복제 실패'
      setLastPersistence({
        target: 'template',
        source: 'local_fallback',
        message: '템플릿 복제는 로컬에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(
        state,
        template,
        'local_fallback',
        remoteError
      )
    }
  },
  listDerivativesByContent: getStoredDerivatives,
  updateDerivative,
  persistDerivative: async (derivativeId, patch) => {
    const state = updateDerivative(derivativeId, patch)
    const derivative = state.derivatives.find((entry) => entry.id === derivativeId) ?? null
    const item = derivative
      ? state.items.find((entry) => entry.id === derivative.contentItemId) ?? null
      : null
    const supabase = getWritableSupabase()
    if (!supabase || !derivative) {
      setLastPersistence({
        target: 'item',
        source: 'local',
        message: '파생 초안 저장이 로컬 워크스페이스에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, derivative, 'local')
    }

    try {
      if (item) {
        await upsertRemoteItem(item)
        await upsertBlogDraftForItem(item)
      }
      await upsertRemoteDerivative(derivative)
      const latestLog = state.activityLogs[0] ?? null
      if (latestLog?.contentItemId === derivative.contentItemId) await insertRemoteActivityLog(latestLog)
      setLastPersistence({
        target: 'item',
        source: 'supabase',
        message: '파생 초안 저장이 Supabase 원천에 반영되었습니다.',
        at: nowIso(),
      })
      return buildPersistenceResult(state, derivative, 'supabase')
    } catch (error) {
      const remoteError = error instanceof Error ? error.message : 'Supabase 파생 초안 저장 실패'
      setLastPersistence({
        target: 'item',
        source: 'local_fallback',
        message: '파생 초안 저장은 로컬에 유지되고, Supabase 반영은 실패했습니다.',
        remoteError,
        at: nowIso(),
      })
      return buildPersistenceResult(state, derivative, 'local_fallback', remoteError)
    }
  },
  listActivityLogsByContent: getStoredActivityLogs,
  listSourcesByContent: async (contentItemId) => {
    const item = getStoredContentItem(contentItemId)
    if (!item) return []

    const supabase = getWritableSupabase()
    if (supabase && readConfiguredSource() !== 'local') {
      try {
        const remoteItemId = await resolveRemoteItemIdForRead(contentItemId)
        if (remoteItemId) {
          const { data, error } = await supabase
            .from('content_sources')
            .select('id, source_kind, image_asset_id, showroom_group_key, is_primary, snapshot, created_at')
            .eq('content_item_id', remoteItemId)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: false })
          if (!error && data) {
            return (data as Record<string, unknown>[])
              .map((row) => mapContentSourceRow(contentItemId, row))
          }
        }
      } catch {
        // 원격 조회 실패 시 로컬 원천 데이터로 대체한다.
      }
    }

    const assets = await readShowroomAssets()
    const matchedAssets = assets.filter((asset) => {
      if (asset.before_after_role === 'before') return false
      return normalizeSiteName(asset) === item.siteName
    })
    return buildLocalSourceRecords(item, matchedAssets)
  },
  listSourceCoverage: async () => {
    const current = readSnapshotCache()
    const coverageByContentId = Object.fromEntries(
      current.items.map((item) => [
        item.id,
        {
          contentItemId: item.id,
          showroomGroupCount: 0,
          imageAssetCount: 0,
          totalCount: 0,
          hasTraceableSource: false,
        } satisfies ContentSourceCoverage,
      ])
    ) as Record<string, ContentSourceCoverage>

    const supabase = getWritableSupabase()
    if (supabase && readConfiguredSource() !== 'local') {
      try {
        const { data, error } = await supabase
          .from('content_sources')
          .select('content_item_id, source_kind')
        if (!error && data) {
          for (const row of data as Array<Record<string, unknown>>) {
            const remoteContentItemId = String(row.content_item_id ?? '')
            const displayContentItemId = displayIdByRemoteItemId.get(remoteContentItemId) ?? remoteContentItemId
            if (!coverageByContentId[displayContentItemId]) continue
            if (row.source_kind === 'showroom_group') coverageByContentId[displayContentItemId].showroomGroupCount += 1
            else coverageByContentId[displayContentItemId].imageAssetCount += 1
            coverageByContentId[displayContentItemId].totalCount += 1
          }
          for (const itemId of Object.keys(coverageByContentId)) {
            coverageByContentId[itemId].hasTraceableSource = coverageByContentId[itemId].totalCount > 0
          }
          return coverageByContentId
        }
      } catch {
        // 원격 source coverage 조회 실패 시 로컬 계산으로 대체한다.
      }
    }

    const assets = await readShowroomAssets()
    const grouped = new Map<string, ShowroomImageAsset[]>()
    for (const asset of assets) {
      if (asset.before_after_role === 'before') continue
      const siteName = normalizeSiteName(asset)
      const bucket = grouped.get(siteName) ?? []
      bucket.push(asset)
      grouped.set(siteName, bucket)
    }
    for (const item of current.items) {
      const matchedAssets = grouped.get(item.siteName) ?? []
      coverageByContentId[item.id] = buildSourceCoverage(buildLocalSourceRecords(item, matchedAssets), item.id)
    }
    return coverageByContentId
  },
  syncFromShowroom: async () => {
    const assets = await readShowroomAssets(true)
    const grouped = new Map<string, ShowroomImageAsset[]>()

    for (const asset of assets) {
      if (asset.before_after_role === 'before') continue
      const siteName = normalizeSiteName(asset)
      const bucket = grouped.get(siteName) ?? []
      bucket.push(asset)
      grouped.set(siteName, bucket)
    }

    const current = readContentWorkspaceState()
    const existingByName = new Map(current.items.map((item) => [item.siteName, item] as const))
    const existingDistributionKey = new Set(current.distributions.map((item) => `${item.contentItemId}::${item.channel}`))
    const existingDerivativeGroups = new Map<string, MockDerivative[]>(
      current.items.map((item) => [item.id, current.derivatives.filter((entry) => entry.contentItemId === item.id)])
    )
    let added = 0
    let updated = 0

    const syncedEntries = Array.from(grouped.entries()).map(([siteName, images]) => {
      const existing = existingByName.get(siteName)
      const next = buildContentCandidate(images, existing)
      if (existing) updated += 1
      else added += 1
      return { item: next, images }
    })
    const syncedItems = syncedEntries.map((entry) => entry.item)

    const remainingItems = current.items.filter((item) => !grouped.has(item.siteName))
    const syncedDistributions = syncedItems.flatMap((item) =>
      DEFAULT_DISTRIBUTION_CHANNELS
        .filter((channel) => !existingDistributionKey.has(`${item.id}::${channel}`))
        .map((channel) => ({
          id: createDistributionId(item.id, channel),
          contentItemId: item.id,
          channel,
          status: 'not_generated' as const,
          publishUrl: null,
          webhookStatus: toWebhookStatus(item.integrationStatus),
          updatedAt: item.updatedAt,
        }))
    )
    const syncedDerivatives = syncedItems.flatMap((item) =>
      buildDefaultDerivatives(item, existingDerivativeGroups.get(item.id) ?? [])
    )
    const syncActivityLogs = syncedItems.map((item) =>
      buildSyncActivityLog(item, item.updatedAt, !existingByName.has(item.siteName))
    )
    const nextState: ContentWorkspaceSnapshot = {
      ...current,
      items: [...syncedItems, ...remainingItems].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      distributions: [...syncedDistributions, ...current.distributions],
      derivatives: [...syncedDerivatives, ...current.derivatives],
      activityLogs: [...syncActivityLogs, ...current.activityLogs].slice(0, 300),
    }
    writeContentWorkspaceState(nextState)

    const supabase = getWritableSupabase()
    if (supabase) {
      try {
        for (const entry of syncedEntries) {
          await upsertRemoteItem(entry.item)
          await upsertBlogDraftForItem(entry.item)
          await syncRemoteSourcesForItem(entry.item, entry.images)
        }
        for (const distribution of syncedDistributions) {
          await upsertRemoteDistribution(distribution)
        }
        for (const derivative of syncedDerivatives) {
          await upsertRemoteDerivative(derivative)
        }
        for (const log of syncActivityLogs) {
          await insertRemoteActivityLog(log)
        }
        setLastPersistence({
          target: 'showroom_sync',
          source: 'supabase',
          message: `쇼룸 동기화가 Supabase 원천에 반영되었습니다. 신규 ${added}건, 갱신 ${updated}건`,
          at: nowIso(),
        })
      } catch (error) {
        // 로컬 동기화 결과는 유지하고, 원격 실패는 다음 새로고침/저장에서 다시 시도한다.
        const remoteError = error instanceof Error ? error.message : 'Supabase 쇼룸 동기화 실패'
        setLastPersistence({
          target: 'showroom_sync',
          source: 'local_fallback',
          message: `쇼룸 동기화는 로컬에 유지되고, Supabase 반영은 실패했습니다. 신규 ${added}건, 갱신 ${updated}건`,
          remoteError,
          at: nowIso(),
        })
      }
    } else {
      setLastPersistence({
        target: 'showroom_sync',
        source: 'local',
        message: `쇼룸 동기화가 로컬 워크스페이스에 반영되었습니다. 신규 ${added}건, 갱신 ${updated}건`,
        at: nowIso(),
      })
    }

    return { state: nextState, added, updated }
  },
}

let singletonService: ContentWorkspaceService | null = null

export function getContentWorkspaceService(): ContentWorkspaceService {
  if (!singletonService) singletonService = localContentWorkspaceService
  return singletonService
}
