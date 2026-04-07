import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import ContentWorkspaceShell from '@/components/content/ContentWorkspaceShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/imageAssetService'
import {
  buildContentDiagnosticSummary,
  buildContentVerificationSummary,
} from '@/lib/contentWorkspaceDiagnostics'
import { buildFreshnessHint } from '@/lib/contentWorkspaceFreshness'
import {
  getContentWorkspaceService,
  type ContentSourceCoverage,
  type ContentSourceRecord,
} from '@/lib/contentWorkspaceService'
import { formatMockDate, type MockContentItem } from './mockContentData'
import { readContentQueuePrefs, writeContentQueuePrefs } from './contentPrefs'

type QueuePreset = 'all' | 'missing-source' | 'incomplete-traceability'
type ShowroomPreviewGroup = {
  key: string
  siteName: string
  displayName: string
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  allImages: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  latestCreatedAt: string | null
  imageCount: number
  metaCompletion: number
  recommendationScore: number
}
type ContentQueueIssue = {
  id: string
  label: string
  description: string
  actionLabel: string
  href: string
  tone: 'rose' | 'amber' | 'sky' | 'emerald'
}
type ContentCtaOption = {
  id: string
  label: string
  description: string
  value: string
}

const CONTENT_QUEUE_WEBHOOK_STORAGE_KEY = 'content-queue-google-blog-webhook-url'
const CONTENT_QUEUE_RECOMMENDED_LIMIT = 8
const DEFAULT_GOOGLE_BLOG_WEBHOOK_URL = 'https://findgagu.app.n8n.cloud/webhook/findgagu-showroom-google-blog'

function formatBusinessTypeLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return '미지정'
  return normalized === '관리형' ? '관리형 스터디카페' : normalized
}

function readInitialShowroomWebhookUrl() {
  const configured =
    (import.meta.env.VITE_CONTENT_AUTOMATION_GOOGLE_BLOG_WEBHOOK_URL ?? DEFAULT_GOOGLE_BLOG_WEBHOOK_URL)
      .toString()
      .trim()

  if (typeof window === 'undefined') return configured

  return window.localStorage.getItem(CONTENT_QUEUE_WEBHOOK_STORAGE_KEY) ?? configured
}

export default function ContentQueuePage() {
  const { user } = useAuth()
  const workspaceService = getContentWorkspaceService()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSnapshot = workspaceService.readSnapshot()
  const [query, setQuery] = useState(() => readContentQueuePrefs().query)
  const [items, setItems] = useState<MockContentItem[]>(() => initialSnapshot.items)
  const [selectedItemId, setSelectedItemId] = useState(() => initialSnapshot.items[0]?.id ?? '')
  const [lastLoadedAt, setLastLoadedAt] = useState(() => workspaceService.now())
  const [lastHealthCheckedAt, setLastHealthCheckedAt] = useState(() => workspaceService.now())
  const [selectedSourceLinks, setSelectedSourceLinks] = useState<ContentSourceRecord[]>([])
  const [selectedSourcesLoading, setSelectedSourcesLoading] = useState(true)
  const [sourceCoverageByContent, setSourceCoverageByContent] = useState<Record<string, ContentSourceCoverage>>({})
  const [sourceCoverageLoading, setSourceCoverageLoading] = useState(true)
  const [showroomAssets, setShowroomAssets] = useState<ShowroomImageAsset[]>([])
  const [, setShowroomAssetsLoading] = useState(true)
  const [showroomWebhookUrl, setShowroomWebhookUrl] = useState(() => readInitialShowroomWebhookUrl())
  const [showroomGenerating, setShowroomGenerating] = useState(false)
  const [ctaDraft, setCtaDraft] = useState('')
  const [selectedCtaOptionId, setSelectedCtaOptionId] = useState<string | null>(null)
  const [ctaSaving, setCtaSaving] = useState(false)
  const snapshot = workspaceService.readSnapshot()

  const loadShowroomAssets = useCallback(async () => {
    setShowroomAssetsLoading(true)
    try {
      const nextAssets = await fetchShowroomImageAssets()
      setShowroomAssets(nextAssets)
    } finally {
      setShowroomAssetsLoading(false)
    }
  }, [])

  const loadItems = useCallback(async () => {
    const snapshot = await workspaceService.refreshSnapshot()
    const nextItems = snapshot.items
    setItems(nextItems)
    setSelectedItemId((current) => current || nextItems[0]?.id || '')
  }, [workspaceService])

  useEffect(() => {
    void loadItems()
    void loadShowroomAssets()
  }, [loadItems, loadShowroomAssets])

  useEffect(() => {
    writeContentQueuePrefs(query)
  }, [query])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CONTENT_QUEUE_WEBHOOK_STORAGE_KEY, showroomWebhookUrl)
  }, [showroomWebhookUrl])

  useEffect(() => {
    if (items.length === 0 && snapshot.items.length > 0) {
      setItems(snapshot.items)
      setSelectedItemId((current) => current || snapshot.items[0]?.id || '')
    }
  }, [items.length, snapshot.items])

  const activePreset: QueuePreset = useMemo(() => {
    const value = searchParams.get('preset')
    if (value === 'missing-source' || value === 'incomplete-traceability') return value
    return 'all'
  }, [searchParams])
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const queryFiltered = !normalized
      ? items
      : items.filter((item) =>
          [item.siteName, item.businessType, item.region, item.priorityReason, item.tags.join(' ')].join(' ').toLowerCase().includes(normalized)
        )
    if (activePreset === 'missing-source') {
      return queryFiltered.filter((item) => !sourceCoverageByContent[item.id]?.hasTraceableSource)
    }
    if (activePreset === 'incomplete-traceability') {
      return queryFiltered.filter((item) => {
        const hasDistribution = snapshot.distributions.some((distribution) => distribution.contentItemId === item.id)
        const hasDerivative = snapshot.derivatives.some((derivative) => derivative.contentItemId === item.id)
        const hasActivity = snapshot.activityLogs.some((log) => log.contentItemId === item.id)
        const hasSource = sourceCoverageByContent[item.id]?.hasTraceableSource ?? false
        return !(hasDistribution && hasDerivative && hasActivity && hasSource)
      })
    }
    return queryFiltered
  }, [activePreset, items, query, snapshot.activityLogs, snapshot.derivatives, snapshot.distributions, sourceCoverageByContent])
  const selectedItem = filteredItems.find((item) => item.id === selectedItemId) ?? filteredItems[0] ?? null
  const selectedItemJobs = selectedItem
    ? snapshot.jobs.filter((job) => job.contentItemId === selectedItem.id)
    : []
  const selectedItemDistributions = selectedItem
    ? snapshot.distributions.filter((distribution) => distribution.contentItemId === selectedItem.id)
    : []
  const selectedItemDerivatives = selectedItem
    ? snapshot.derivatives.filter((derivative) => derivative.contentItemId === selectedItem.id)
    : []
  const selectedItemLogs = selectedItem
    ? snapshot.activityLogs.filter((log) => log.contentItemId === selectedItem.id).slice(0, 4)
    : []
  const diagnostics = useMemo(() => buildContentDiagnosticSummary(snapshot), [snapshot])
  const verificationSummary = useMemo(
    () => buildContentVerificationSummary(snapshot, { sourceCoverageByContent }),
    [snapshot, sourceCoverageByContent]
  )
  const selectedSourceSummary = useMemo(() => {
    const showroomGroup = selectedSourceLinks.find((source) => source.sourceKind === 'showroom_group') ?? null
    const imageAssetCount = selectedSourceLinks.filter((source) => source.sourceKind === 'image_asset').length
    const sampleAssets = selectedSourceLinks.filter((source) => source.sourceKind === 'image_asset').slice(0, 3)
    return {
      showroomGroup,
      imageAssetCount,
      sampleAssets,
    }
  }, [selectedSourceLinks])
  const showroomPreviewGroups = useMemo(
    () => buildShowroomPreviewGroups(showroomAssets),
    [showroomAssets]
  )
  const showroomPreviewLookup = useMemo(() => {
    const next = new Map<string, ShowroomPreviewGroup>()
    showroomPreviewGroups.forEach((group) => {
      next.set(group.key, group)
      next.set(`showroom:site:${slugifyShowroomValue(group.siteName)}`, group)
      next.set(group.siteName.trim().toLowerCase(), group)
    })
    return next
  }, [showroomPreviewGroups])
  const selectedPreviewGroup = useMemo(
    () => selectedItem
      ? findShowroomPreviewGroupForItem(selectedItem, showroomPreviewLookup, selectedSourceSummary.showroomGroup?.showroomGroupKey ?? null)
      : null,
    [selectedItem, selectedSourceSummary.showroomGroup?.showroomGroupKey, showroomPreviewLookup]
  )
  const visibleCreationCandidates = useMemo(
    () => (query.trim() ? filteredItems.slice(0, 12) : filteredItems.slice(0, CONTENT_QUEUE_RECOMMENDED_LIMIT))
      .map((item) => ({
        item,
        previewGroup: findShowroomPreviewGroupForItem(item, showroomPreviewLookup, null),
      })),
    [filteredItems, query, showroomPreviewLookup]
  )
  const freshnessHint = useMemo(
    () =>
      buildFreshnessHint([
        { label: '목록', actionLabel: '목록 새로고침', at: lastLoadedAt },
        { label: '연동 상태', actionLabel: '연동 상태 새로고침', at: lastHealthCheckedAt },
      ]),
    [lastHealthCheckedAt, lastLoadedAt]
  )

  const kpis = useMemo(
    () => {
      const sourceLinkedCount = items.filter((item) => sourceCoverageByContent[item.id]?.hasTraceableSource).length
      return {
        total: items.length,
        integrationAttention: items.filter((item) => item.priorityReason === '연동 보완').length,
        automationAttention: items.filter((item) => item.priorityReason === '자동화 확인').length,
        templateAttention: items.filter((item) => item.priorityReason === '템플릿 보완').length,
        failedJobs: snapshot.jobs.filter((item) => item.status === 'failed').length,
        distributionErrors: snapshot.distributions.filter((item) => item.status === 'error').length,
        sourceLinked: sourceLinkedCount,
      }
    },
    [items, snapshot.distributions, snapshot.jobs, sourceCoverageByContent]
  )
  const itemIssueMap = useMemo(() => {
    const next = new Map<string, ContentQueueIssue[]>()
    items.forEach((item) => {
      const itemDistributions = snapshot.distributions.filter((distribution) => distribution.contentItemId === item.id)
      const itemJobs = snapshot.jobs.filter((job) => job.contentItemId === item.id)
      const itemDerivatives = snapshot.derivatives.filter((derivative) => derivative.contentItemId === item.id)
      const issues = buildContentQueueIssues(
        item,
        itemDistributions,
        itemJobs,
        itemDerivatives,
        sourceCoverageByContent[item.id]?.hasTraceableSource ?? false
      )
      next.set(item.id, issues)
    })
    return next
  }, [items, snapshot.derivatives, snapshot.distributions, snapshot.jobs, sourceCoverageByContent])
  const selectedItemIssues = useMemo(
    () => (selectedItem ? itemIssueMap.get(selectedItem.id) ?? [] : []),
    [itemIssueMap, selectedItem]
  )

  const todayActionLines = useMemo(() => {
    if (filteredItems.length === 0) {
      return [
        '1. 현재 필터 기준으로 처리할 콘텐츠가 없습니다.',
        '2. 검색어를 지우거나 쇼룸에서 동기화를 다시 실행해 주세요.',
        '3. 목록 갱신 후 우선순위 대상을 다시 확인합니다.',
      ]
    }

    const topItem = filteredItems[0]
    const sourceIssueItem = filteredItems.find((item) =>
      (itemIssueMap.get(item.id) ?? []).some((issue) => issue.id === 'missing-source')
    )
    const automationItem = filteredItems.find((item) =>
      (itemIssueMap.get(item.id) ?? []).some((issue) => issue.id === 'failed-job' || issue.id === 'distribution-error' || issue.id === 'missing-google-blog')
    )
    const templateItem = filteredItems.find((item) =>
      (itemIssueMap.get(item.id) ?? []).some((issue) => issue.id === 'missing-blog-title' || issue.id === 'missing-tags' || issue.id === 'missing-cta')
    )

    return [
      sourceIssueItem
        ? `1. ${sourceIssueItem.siteName}은 원천 연결 또는 메타 연결을 먼저 확인합니다.`
        : `1. 연동 보완 대기 건은 현재 ${kpis.integrationAttention}건이며, 우선 대상은 ${topItem.siteName} 입니다.`,
      automationItem
        ? `2. ${automationItem.siteName}은 자동화/배포 상태를 먼저 점검합니다.`
        : `2. 자동화 확인 대기 건은 현재 ${kpis.automationAttention}건이며, 즉시 요청 가능한 대상을 선별합니다.`,
      templateItem
        ? `3. ${templateItem.siteName}은 제목, CTA, 태그 같은 원문 입력값을 먼저 보완합니다.`
        : `3. 현재 추천 대상은 ${topItem.siteName} 이며, 상세 화면에서 원문과 파생콘텐츠를 이어서 확인합니다.`,
    ]
  }, [filteredItems, itemIssueMap, kpis.automationAttention, kpis.integrationAttention])
  const selectedItemSummary = useMemo(() => {
    if (!selectedItem) return null
    const effectiveCtaText = getEffectiveCtaText(selectedItem)
    const failedJobs = selectedItemJobs.filter((job) => job.status === 'failed')
    const distributionErrors = selectedItemDistributions.filter((distribution) => distribution.status === 'error')
    const notGenerated = selectedItemDistributions.filter((distribution) => distribution.status === 'not_generated')
    const publishedChannels = selectedItemDistributions.filter((distribution) => distribution.status === 'published').length
    const sourceImageAssetCount = selectedSourceSummary.imageAssetCount
    const readinessChecks = [
      {
        label: '콘텐츠 제목',
        passed: Boolean(selectedItem.blogTitle.trim()),
        hint: selectedItem.blogTitle.trim() ? selectedItem.blogTitle : '블로그 제목이 비어 있습니다.',
      },
      {
        label: 'SEO 설명',
        passed: Boolean(selectedItem.seoDescription.trim()),
        hint: selectedItem.seoDescription.trim() ? '설명이 준비되어 있습니다.' : 'SEO 설명이 비어 있습니다.',
      },
      {
        label: 'CTA',
        passed: Boolean(effectiveCtaText),
        hint: selectedItem.ctaText.trim() ? selectedItem.ctaText : `기본 CTA 적용 예정 · ${effectiveCtaText}`,
      },
      {
        label: '배포 채널',
        passed: selectedItemDistributions.length > 0,
        hint: selectedItemDistributions.length > 0 ? `${selectedItemDistributions.length}개 채널 연결` : '배포 채널이 아직 없습니다.',
      },
      {
        label: '파생 초안',
        passed: selectedItemDerivatives.length > 0,
        hint: selectedItemDerivatives.length > 0 ? `${selectedItemDerivatives.length}개 초안 준비` : '파생 초안이 없습니다.',
      },
      {
        label: '원천 연결',
        passed: sourceImageAssetCount > 0,
        hint: sourceImageAssetCount > 0
          ? `쇼룸 그룹 ${selectedSourceSummary.showroomGroup ? '연결됨' : '미연결'} · 자산 ${sourceImageAssetCount}건`
          : '연결된 image asset source가 없습니다.',
      },
    ]
    const blockers = [
      ...(sourceImageAssetCount === 0
        ? [{
            label: '원천 자산 연결 없음',
            href: `/content/${encodeURIComponent(selectedItem.id)}?tab=basic`,
          }]
        : []),
      ...failedJobs.map((job) => ({
        label: `${job.channel} ${job.jobType} 실패${job.errorMessage ? ` · ${job.errorMessage}` : ''}`,
        href: `/content/automation?jobId=${encodeURIComponent(job.id)}&contentId=${encodeURIComponent(selectedItem.id)}&channel=${encodeURIComponent(job.channel)}`,
      })),
      ...distributionErrors.map((distribution) => ({
        label: `${distribution.channel} 배포 오류 상태`,
        href: `/content/distribution?distributionId=${encodeURIComponent(distribution.id)}&contentId=${encodeURIComponent(selectedItem.id)}&channel=${encodeURIComponent(distribution.channel)}`,
      })),
      ...notGenerated.map((distribution) => ({
        label: `${distribution.channel} 채널이 아직 미생성 상태`,
        href: `/content/${encodeURIComponent(selectedItem.id)}?tab=distribution&channel=${encodeURIComponent(distribution.channel)}`,
      })),
    ]
    const nextAction = selectedItemIssues[0]?.description
      ?? (
        publishedChannels > 0
          ? '발행된 채널과 아직 미완료 채널의 간격을 비교해 후속 발행 대상을 정합니다.'
          : '콘텐츠 상세에서 원문과 배포 상태를 확인한 뒤 자동화 요청 생성으로 넘깁니다.'
      )

    return {
      readinessChecks,
      blockers,
      nextAction,
      publishedChannels,
      failedJobs: failedJobs.length,
      distributionErrors: distributionErrors.length,
    }
  }, [selectedItem, selectedItemDerivatives.length, selectedItemDistributions, selectedItemIssues, selectedItemJobs, selectedSourceSummary])
  const derivativeControlSummary = useMemo(() => {
    if (!selectedItem) return null
    const googleBlogDistribution = selectedItemDistributions.find((distribution) => distribution.channel === 'Google Blog') ?? null
    const naverBlogDistribution = selectedItemDistributions.find((distribution) => distribution.channel === 'Naver Blog') ?? null
    const blogServiceDerivative = selectedItemDerivatives.find((derivative) => derivative.type === 'shorts_blog_service') ?? null
    const blogServiceDistribution = selectedItemDistributions.find((distribution) => distribution.channel === 'Instagram Reels' || distribution.channel === 'Facebook Video') ?? null
    const youtubeEngineDerivative = selectedItemDerivatives.find((derivative) => derivative.type === 'shorts_youtube_engine') ?? null
    const youtubeEngineDistribution = selectedItemDistributions.find((distribution) => distribution.channel === 'YouTube Shorts') ?? null

    return [
      {
        id: 'google-blog',
        title: 'Google Blog 원본',
        description: googleBlogDistribution
          ? `${googleBlogDistribution.status} · 웹훅 ${googleBlogDistribution.webhookStatus}`
          : '아직 원본 배포 레코드가 없습니다.',
        primaryActionLabel: '원본 상세',
        primaryHref: buildQueueDetailHref(selectedItem),
        secondaryActionLabel: '배포 상태',
        secondaryHref: buildQueueDistributionHref(selectedItem, 'Google Blog'),
      },
      {
        id: 'naver-blog',
        title: 'Naver Blog 발행',
        description: naverBlogDistribution
          ? `${naverBlogDistribution.status} · 웹훅 ${naverBlogDistribution.webhookStatus}`
          : '네이버 블로그 배포 레코드가 아직 없습니다.',
        primaryActionLabel: '원본 상세',
        primaryHref: buildQueueDetailHref(selectedItem),
        secondaryActionLabel: '배포 상태',
        secondaryHref: buildQueueDistributionHref(selectedItem, 'Naver Blog'),
      },
      {
        id: 'shorts-blog-service',
        title: '숏츠(블로그 기반)',
        description: blogServiceDerivative
          ? `${blogServiceDerivative.status} · ${blogServiceDistribution?.channel ?? '배포 채널 준비 중'}`
          : '블로그 기반 숏츠 초안이 아직 없습니다.',
        primaryActionLabel: '파생 확인',
        primaryHref: `${buildQueueDetailHref(selectedItem)}&focus=shorts-blog-service`,
        secondaryActionLabel: '배포 상태',
        secondaryHref: buildQueueDistributionHref(selectedItem, blogServiceDistribution?.channel ?? 'Instagram Reels'),
      },
      {
        id: 'shorts-youtube-engine',
        title: '숏츠(유튜브 엔진)',
        description: youtubeEngineDerivative
          ? `${youtubeEngineDerivative.status} · ${youtubeEngineDistribution?.channel ?? '배포 채널 준비 중'}`
          : '유튜브 자동화 숏츠 초안이 아직 없습니다.',
        primaryActionLabel: '파생 확인',
        primaryHref: `${buildQueueDetailHref(selectedItem)}&focus=shorts-youtube-engine`,
        secondaryActionLabel: '자동화 큐',
        secondaryHref: buildQueueAutomationHref(selectedItem, undefined, youtubeEngineDistribution?.channel ?? 'YouTube Shorts'),
      },
    ]
  }, [selectedItem, selectedItemDerivatives, selectedItemDistributions])
  const ctaOptions = useMemo(
    () => (selectedItem ? buildCtaOptions(selectedItem) : []),
    [selectedItem]
  )
  const lastPersistence = workspaceService.getLastPersistence()

  useEffect(() => {
    if (!filteredItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(filteredItems[0]?.id ?? '')
    }
  }, [filteredItems, selectedItemId])

  useEffect(() => {
    if (!selectedItem) {
      setCtaDraft('')
      setSelectedCtaOptionId(null)
      return
    }
    const effectiveCtaText = getEffectiveCtaText(selectedItem)
    setCtaDraft(effectiveCtaText)
    const matched = buildCtaOptions(selectedItem).find((option) => option.value === effectiveCtaText)?.id ?? null
    setSelectedCtaOptionId(matched)
  }, [selectedItem])

  useEffect(() => {
    let cancelled = false
    const currentItemId = selectedItem?.id ?? ''
    if (!currentItemId) {
      setSelectedSourceLinks([])
      setSelectedSourcesLoading(false)
      return
    }
    setSelectedSourcesLoading(true)
    async function loadSources() {
      const next = await workspaceService.listSourcesByContent(currentItemId)
      if (cancelled) return
      setSelectedSourceLinks(next)
      setSelectedSourcesLoading(false)
    }
    void loadSources()
    return () => {
      cancelled = true
    }
  }, [lastLoadedAt, selectedItem?.id, workspaceService])

  useEffect(() => {
    let cancelled = false
    setSourceCoverageLoading(true)
    async function loadCoverage() {
      const next = await workspaceService.listSourceCoverage()
      if (cancelled) return
      setSourceCoverageByContent(next)
      setSourceCoverageLoading(false)
    }
    void loadCoverage()
    return () => {
      cancelled = true
    }
  }, [lastHealthCheckedAt, lastLoadedAt, workspaceService])

  async function handleRefreshQueue() {
    await loadItems()
    await loadShowroomAssets()
    const next = workspaceService.now()
    setLastLoadedAt(next)
    toast.success('발행 큐 목록을 새로고침했습니다.')
  }

  async function handleRefreshHealth() {
    const nextSnapshot = await workspaceService.refreshSnapshot()
    setItems(nextSnapshot.items)
    setSelectedItemId((current) => current || nextSnapshot.items[0]?.id || '')
    await loadShowroomAssets()
    setLastHealthCheckedAt(workspaceService.now())
    toast.success('연동 상태와 콘텐츠 기준을 다시 확인했습니다.')
  }

  async function handleCopySummary() {
    const summary = [
      `전체 콘텐츠 ${kpis.total}건`,
      `연동 보완 ${kpis.integrationAttention}건 / 자동화 확인 ${kpis.automationAttention}건 / 템플릿 보완 ${kpis.templateAttention}건`,
      `실패 작업 ${kpis.failedJobs}건 / 배포 오류 ${kpis.distributionErrors}건`,
      `원천 연결 확보 ${kpis.sourceLinked}건`,
      `현재 추천 대상 ${filteredItems[0]?.siteName ?? '없음'}`,
      '',
      ...todayActionLines,
    ].join('\n')
    await navigator.clipboard.writeText(summary)
    toast.success('공유용 요약을 복사했습니다.')
  }

  function handlePresetChange(preset: QueuePreset) {
    const next = new URLSearchParams(searchParams)
    if (preset === 'all') next.delete('preset')
    else next.set('preset', preset)
    setSearchParams(next)
  }

  async function handleCopyVerificationSummary() {
    const summary = [
      `실운영 최종 점검`,
      `상태 ${verificationSummary.overallStatus === 'ready' ? '운영 시작 가능' : '보완 필요'}`,
      `pass ${verificationSummary.passCount}건 / attention ${verificationSummary.attentionCount}건`,
      '',
      ...verificationSummary.checks.map(
        (item, index) => `${index + 1}. [${item.status === 'pass' ? 'PASS' : 'ATTN'}] ${item.title} - ${item.description}`
      ),
    ].join('\n')
    await navigator.clipboard.writeText(summary)
    toast.success('최종 점검 요약을 복사했습니다.')
  }

  function handleExportBackup() {
    const json = workspaceService.exportSnapshot()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `content-workspace-backup-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('콘텐츠 워크스페이스 백업을 내보냈습니다.')
  }

  function handleResetWorkspace() {
    const next = workspaceService.resetSampleData()
    setItems(next.items)
    setLastLoadedAt(workspaceService.now())
    setLastHealthCheckedAt(workspaceService.now())
    toast.success('샘플 데이터 상태를 초기값으로 되돌렸습니다.')
  }

  async function handleSyncFromShowroom() {
    try {
      const { state, added, updated } = await workspaceService.syncFromShowroom()
      setItems(state.items)
      await loadShowroomAssets()
      setLastLoadedAt(workspaceService.now())
      toast.success(`쇼룸에서 콘텐츠 후보를 동기화했습니다. 신규 ${added}건, 갱신 ${updated}건`)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : '쇼룸 동기화에 실패했습니다.')
    }
  }

  async function handleGenerateGoogleBlog() {
    if (!selectedItem) {
      toast.error('먼저 생성할 콘텐츠를 선택해주세요.')
      return
    }

    const webhookUrl = showroomWebhookUrl.trim()
    if (!webhookUrl) {
      toast.error('n8n 웹훅 URL을 입력해주세요.')
      return
    }

    if (!selectedPreviewGroup || selectedPreviewGroup.images.length === 0) {
      toast.error('이 콘텐츠에 연결된 쇼룸 이미지가 없습니다.')
      return
    }

    let jobId: string | null = null
    setShowroomGenerating(true)
    try {
      const created = await workspaceService.createAutomationRequest(selectedItem.id, 'Google Blog')
      jobId = created.entity?.id ?? null
      if (jobId) {
        await workspaceService.persistJob(jobId, {
          status: 'processing',
          reflectedAt: null,
          errorMessage: null,
        })
      }

      const payload = buildShowroomBlogWebhookPayload(
        selectedItem,
        selectedPreviewGroup,
        user?.email ?? 'admin@findgagu.com',
        ctaDraft.trim() || getEffectiveCtaText(selectedItem)
      )
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const responseText = await response.text()
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('n8n 웹훅 경로를 찾을 수 없습니다. 워크플로우 활성화 또는 프로덕션 웹훅 URL을 확인해주세요.')
        }
        throw new Error(responseText || `웹훅 호출 실패 (${response.status})`)
      }

      const nextSnapshot = await workspaceService.refreshSnapshot()
      const googleBlogDistribution = nextSnapshot.distributions.find(
        (distribution) => distribution.contentItemId === selectedItem.id && distribution.channel === 'Google Blog'
      )
      if (googleBlogDistribution) {
        await workspaceService.persistDistribution(googleBlogDistribution.id, {
          status: 'review_pending',
          webhookStatus: '실URL 연결',
        })
      }

      await loadItems()
      setLastLoadedAt(workspaceService.now())
      setLastHealthCheckedAt(workspaceService.now())
      toast.success(`${selectedItem.siteName} Google Blog 생성 요청을 전송했습니다.`)
    } catch (error) {
      console.error(error)
      if (jobId) {
        await workspaceService.persistJob(jobId, {
          status: 'failed',
          reflectedAt: workspaceService.now(),
          errorMessage: error instanceof Error ? error.message : 'n8n 전송 실패',
        })
      }
      toast.error(error instanceof Error ? error.message : 'Google Blog 생성 요청에 실패했습니다.')
    } finally {
      setShowroomGenerating(false)
    }
  }

  async function handleSelectCtaOption(option: ContentCtaOption) {
    if (!selectedItem) return
    setSelectedCtaOptionId(option.id)
    setCtaDraft(option.value)
  }

  async function handleSaveCta() {
    if (!selectedItem) return
    setCtaSaving(true)
    try {
      const result = await workspaceService.persistItem(selectedItem.id, {
        ctaText: ctaDraft.trim(),
      })
      setItems(result.state.items)
      setLastLoadedAt(workspaceService.now())
      setLastHealthCheckedAt(workspaceService.now())
      toast.success('CTA 문구를 저장했습니다.')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'CTA 저장에 실패했습니다.')
    } finally {
      setCtaSaving(false)
    }
  }

  return (
    <ContentWorkspaceShell
      title="발행 큐"
      description="오늘 처리할 콘텐츠 후보를 정리하고, 준비도와 연동 상태를 한 화면에서 빠르게 확인하는 운영 화면입니다."
      actions={
        <>
          <Button variant="outline" onClick={() => void handleCopySummary()}>공유용 요약</Button>
          <Button variant="outline" onClick={() => void handleCopyVerificationSummary()}>최종 점검 요약</Button>
          <Button variant="outline" onClick={handleExportBackup}>백업 내보내기</Button>
          <Button variant="outline" onClick={handleResetWorkspace}>샘플 초기화</Button>
          <Button variant="outline" onClick={() => void handleSyncFromShowroom()}>쇼룸에서 동기화</Button>
          <Button variant="outline" onClick={() => void handleRefreshQueue()}>
            <RefreshCw className="h-4 w-4" />
            목록 새로고침
          </Button>
          <Button variant="outline" onClick={handleRefreshHealth}>연동 상태 새로고침</Button>
        </>
      }
    >
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">콘텐츠 생성 대시보드</h2>
            <p className="mt-1 text-sm text-slate-500">추천 현장을 고르고, 원본 생성과 파생 제어를 같은 화면에서 이어서 처리합니다.</p>
          </div>
          <div className="text-xs text-slate-400">
            추천 {Math.min(filteredItems.length, CONTENT_QUEUE_RECOMMENDED_LIMIT)}건
            {query.trim() ? ` · 검색 결과 ${filteredItems.length}건` : ` · 전체 후보 ${filteredItems.length}건`}
          </div>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.96fr)]">
          <div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="현장명, 업종, 지역, 제품명 검색" className="h-8 border-0 p-0 shadow-none focus-visible:ring-0" />
            </div>
            <div className="mt-4 space-y-3">
              {visibleCreationCandidates.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  조건에 맞는 생성 후보가 없습니다. 쇼룸 동기화나 검색어를 다시 확인해주세요.
                </p>
              ) : (
                visibleCreationCandidates.map(({ item, previewGroup }) => {
                  const active = item.id === selectedItem?.id
                  const issues = itemIssueMap.get(item.id) ?? []
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className={[
                        'flex w-full items-start gap-4 rounded-2xl border p-3 text-left transition',
                        active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        {previewGroup?.mainImage?.thumbnail_url || previewGroup?.mainImage?.cloudinary_url ? (
                          <img
                            src={previewGroup.mainImage.thumbnail_url ?? previewGroup.mainImage.cloudinary_url}
                            alt={item.siteName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-500">이미지 없음</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{formatBusinessTypeLabel(item.businessType)}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">사진 {previewGroup?.imageCount ?? 0}장</span>
                          {(issues.length > 0 ? issues.slice(0, 2) : [{
                            id: 'ready',
                            label: '생성 준비 양호',
                            tone: 'emerald' as const,
                          }]).map((issue) => (
                            <span key={issue.id} className={buildIssueBadgeClass(issue.tone)}>
                              {issue.label}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 truncate text-base font-semibold text-slate-900">{previewGroup?.displayName ?? item.siteName}</p>
                        {previewGroup?.displayName && previewGroup.displayName !== item.siteName ? (
                          <p className="mt-1 text-xs text-slate-400">내부 현장명 {item.siteName}</p>
                        ) : null}
                        <p className="mt-1 text-sm text-slate-500">{item.region} · 준비도 {item.readinessScore}% · 자동화 {item.automationScore}%</p>
                        <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                          제품 {previewGroup?.products.slice(0, 3).join(', ') || item.tags.slice(0, 3).join(', ') || '미기재'} · 색상 {previewGroup?.colors.slice(0, 3).join(', ') || '미기재'}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            {selectedItem ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">원본 생성 제어</p>
                      <p className="mt-1 text-sm text-slate-500">선택 현장의 메타와 CTA를 점검한 뒤 블로그 원본 생성을 요청합니다.</p>
                    </div>
                    <Link to={buildQueueDetailHref(selectedItem)} className="text-sm font-medium text-slate-700 hover:text-slate-900">
                      상세 열기
                    </Link>
                  </div>
                  <p className="text-lg font-semibold text-slate-900">{selectedPreviewGroup?.displayName ?? selectedItem.siteName}</p>
                  {selectedPreviewGroup?.displayName && selectedPreviewGroup.displayName !== selectedItem.siteName ? (
                    <p className="mt-1 text-xs text-slate-400">내부 현장명 {selectedItem.siteName}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-500">{formatBusinessTypeLabel(selectedItem.businessType)} · {selectedItem.region}</p>
                  <p className="mt-3 text-sm text-slate-600">원본 제목 {selectedItem.blogTitle}</p>
                  <p className="mt-1 text-sm text-slate-600">CTA {selectedItem.ctaText.trim() ? selectedItem.ctaText : `기본값 · ${getEffectiveCtaText(selectedItem)}`}</p>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-900">CTA 결정</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ctaOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => void handleSelectCtaOption(option)}
                        className={[
                          'rounded-full px-3 py-1.5 text-xs transition',
                          selectedCtaOptionId === option.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {selectedCtaOptionId ? (
                    <p className="mt-3 text-xs text-slate-500">
                      {ctaOptions.find((option) => option.id === selectedCtaOptionId)?.description}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">상황에 맞는 CTA 타입을 고르거나 아래 문구를 직접 입력하세요.</p>
                  )}
                  <textarea
                    value={ctaDraft}
                    onChange={(event) => setCtaDraft(event.target.value)}
                    placeholder="이 콘텐츠의 CTA 문구를 입력하세요."
                    className="mt-3 min-h-[96px] w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" onClick={() => void handleSaveCta()} disabled={ctaSaving}>
                      {ctaSaving ? 'CTA 저장 중…' : 'CTA 저장'}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <label htmlFor="content-queue-webhook-url" className="text-sm font-medium text-slate-900">n8n Webhook URL</label>
                  <Input
                    id="content-queue-webhook-url"
                    className="mt-2"
                    value={showroomWebhookUrl}
                    onChange={(event) => setShowroomWebhookUrl(event.target.value)}
                    placeholder="https://your-n8n-host/webhook/findgagu-showroom-google-blog"
                  />
                  <p className="mt-2 text-xs text-slate-400">기존 n8n 임포트 워크플로우 주소를 넣으면 이 현장 메타와 이미지 URL을 바로 전송합니다.</p>
                  <Button className="mt-4 w-full gap-2" onClick={() => void handleGenerateGoogleBlog()} disabled={showroomGenerating}>
                    <ArrowRight className="h-4 w-4" />
                    {showroomGenerating ? '블로그 원본 생성 요청 전송 중…' : '블로그 원본 생성'}
                  </Button>
                </div>

                {derivativeControlSummary ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {derivativeControlSummary.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                        <p className="mt-2 min-h-[3rem] text-sm leading-6 text-slate-600">{entry.description}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" asChild>
                            <Link to={entry.primaryHref}>{entry.primaryActionLabel}</Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={entry.secondaryHref}>{entry.secondaryActionLabel}</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-sm text-slate-500">
                왼쪽 후보에서 현장을 선택하면 이곳에서 이미지 확인과 원본 생성이 가능합니다.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard label="전체 콘텐츠" value={`${kpis.total}건`} tone="slate" />
        <KpiCard label="연동 보완" value={`${kpis.integrationAttention}건`} tone="amber" />
        <KpiCard label="자동화 확인" value={`${kpis.automationAttention}건`} tone="sky" />
        <KpiCard label="템플릿 보완" value={`${kpis.templateAttention}건`} tone="rose" />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">운영 주의 신호</p>
          <p className="mt-2 text-2xl font-semibold text-amber-900">실패 작업 {kpis.failedJobs}건</p>
          <p className="mt-2 text-sm text-amber-800">자동화 큐에서 실패 사유와 재요청 필요 여부를 먼저 점검합니다.</p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm text-rose-700">배포 오류 신호</p>
          <p className="mt-2 text-2xl font-semibold text-rose-900">배포 오류 {kpis.distributionErrors}건</p>
          <p className="mt-2 text-sm text-rose-800">배포 관리에서 오류 채널 상태와 URL 반영 여부를 같이 확인합니다.</p>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">운영 진단</h2>
            <p className="mt-1 text-sm text-slate-500">상태 불일치, URL 누락, 실패 사유 누락 같은 신호를 자동으로 추려줍니다.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">critical {diagnostics.criticalCount}건</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">warning {diagnostics.warningCount}건</span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">info {diagnostics.infoCount}건</span>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {diagnostics.issues.slice(0, 6).map((issue) => (
            <Link
              key={issue.id}
              to={issue.href}
              className="block rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <p className={`text-xs font-medium ${issue.severity === 'critical' ? 'text-rose-700' : issue.severity === 'warning' ? 'text-amber-700' : 'text-sky-700'}`}>
                {issue.severity.toUpperCase()}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{issue.title}</p>
              <p className="mt-1 text-sm text-slate-600">{issue.description}</p>
            </Link>
          ))}
          {diagnostics.issues.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">현재 자동 진단 기준으로 큰 이상 신호는 없습니다.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">실운영 최종 점검</h2>
            <p className="mt-1 text-sm text-slate-500">외부 연동 직전 또는 실URL 전환 직후, 지금 바로 운영 시작해도 되는지 빠르게 판단합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 ${verificationSummary.overallStatus === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {verificationSummary.overallStatus === 'ready' ? '운영 시작 가능' : '보완 필요'}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">pass {verificationSummary.passCount}건</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">attention {verificationSummary.attentionCount}건</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              원천 연결 {sourceCoverageLoading ? '확인 중' : `${kpis.sourceLinked}건`}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {verificationSummary.checks.map((check) => (
            <Link
              key={check.id}
              to={check.href}
              className="rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <p className={`text-xs font-medium ${check.status === 'pass' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {check.status === 'pass' ? 'PASS' : 'ATTENTION'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{check.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{check.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">오늘 할 일 3줄</h2>
            <p className="mt-1 text-sm text-slate-500">운영자가 바로 복사해서 공유 메시지로 쓸 수 있는 요약입니다.</p>
            <p className="mt-2 text-xs text-slate-400">데이터 원천 {workspaceService.getRuntime().label}</p>
            {lastPersistence ? (
              <p className={`mt-2 text-xs ${lastPersistence.source === 'local_fallback' ? 'text-amber-700' : 'text-slate-400'}`}>
                마지막 저장 {lastPersistence.source === 'supabase' ? 'Supabase' : lastPersistence.source === 'local_fallback' ? '로컬 fallback' : '로컬'} · {formatMockDate(lastPersistence.at)}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-500">
            <Search className="h-4 w-4" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="현장명, 업종, 우선 분류 검색" className="h-8 border-0 p-0 shadow-none focus-visible:ring-0" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { id: 'all', label: '전체 보기' },
            { id: 'missing-source', label: '원천 연결 부족' },
            { id: 'incomplete-traceability', label: '이력/원천 미완료' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetChange(preset.id as QueuePreset)}
              className={[
                'rounded-full px-3 py-1 text-xs transition',
                activePreset === preset.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
          {todayActionLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          마지막 목록 갱신 {formatMockDate(lastLoadedAt)} · 연동 상태 확인 {formatMockDate(lastHealthCheckedAt)}
        </p>
        <p className={`mt-1 text-xs ${freshnessHint.tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{freshnessHint.message}</p>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">콘텐츠 목록</h2>
            <p className="mt-1 text-sm text-slate-500">준비도와 우선 분류를 기준으로 오늘 처리할 대상을 빠르게 고릅니다.</p>
            {activePreset !== 'all' ? (
              <p className="mt-2 text-xs text-amber-700">
                현재 프리셋 {activePreset === 'missing-source' ? '원천 연결 부족' : '이력/원천 미완료'} 대상만 보고 있습니다.
              </p>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">총 {filteredItems.length}건</p>
          </div>

          <div className="mt-4 space-y-3">
          {filteredItems.map((item) => {
            const itemJobs = snapshot.jobs.filter((job) => job.contentItemId === item.id)
            const itemDistributions = snapshot.distributions.filter((distribution) => distribution.contentItemId === item.id)
            const itemDerivatives = snapshot.derivatives.filter((derivative) => derivative.contentItemId === item.id)
            const itemIssues = itemIssueMap.get(item.id) ?? []
            const failedJobs = itemJobs.filter((job) => job.status === 'failed').length
            const distributionErrors = itemDistributions.filter((distribution) => distribution.status === 'error').length
            const publishedChannels = itemDistributions.filter((distribution) => distribution.status === 'published').length
            const nextActionLabel = itemIssues[0]?.actionLabel ?? '상세 검토'
            const active = item.id === selectedItem?.id

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={[
                  'block w-full rounded-2xl border p-4 text-left transition',
                  active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{formatBusinessTypeLabel(item.businessType)}</span>
                      {itemIssues.slice(0, 3).map((issue) => (
                        <span key={issue.id} className={buildIssueBadgeClass(issue.tone)}>
                          {issue.label}
                        </span>
                      ))}
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{item.integrationStatus}</span>
                      {failedJobs > 0 ? <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs text-rose-700">실패 작업 {failedJobs}건</span> : null}
                      {distributionErrors > 0 ? <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs text-orange-700">배포 오류 {distributionErrors}건</span> : null}
                      {publishedChannels > 0 ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-700">발행 완료 {publishedChannels}건</span> : null}
                    </div>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{item.siteName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.region} · 공개 수준 {item.revealLevel} · 마지막 갱신 {formatMockDate(item.updatedAt)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      다음 액션 {nextActionLabel} · 채널 {itemDistributions.length}개 · 파생 초안 {itemDerivatives.length}개
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-6">
                    <ScoreBadge label="콘텐츠" value={item.readinessScore} />
                    <ScoreBadge label="자동화" value={item.automationScore} />
                    <ArrowRight className="h-5 w-5 text-slate-400" />
                  </div>
                </div>
              </button>
            )
          })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">선택 항목 운영 패널</h2>
          {selectedItem && selectedItemSummary ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">{selectedItem.siteName}</p>
                <p className="mt-2">{formatBusinessTypeLabel(selectedItem.businessType)} · {selectedItem.region}</p>
                <p>우선 분류 {selectedItem.priorityReason} · 공개 수준 {selectedItem.revealLevel}</p>
                <p>작업 {selectedItemJobs.length}건 · 채널 {selectedItemDistributions.length}건 · 파생 초안 {selectedItemDerivatives.length}건</p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">정확한 확인 포인트</p>
                {selectedItemIssues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {selectedItemIssues.map((issue) => (
                      <Link key={issue.id} to={issue.href} className="block rounded-xl bg-slate-50 px-3 py-3 hover:bg-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={buildIssueBadgeClass(issue.tone)}>{issue.label}</span>
                          <span className="text-xs text-slate-400">{issue.actionLabel}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{issue.description}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selectedItemSummary.nextAction}</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">원천 연결 요약</p>
                {selectedSourcesLoading ? (
                  <p className="mt-2 text-sm text-slate-500">원천 연결을 불러오는 중입니다.</p>
                ) : (
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>쇼룸 그룹 {selectedSourceSummary.showroomGroup ? '연결됨' : '미연결'}</p>
                    <p>연결 자산 {selectedSourceSummary.imageAssetCount}건</p>
                    <p>space id {selectedSourceSummary.showroomGroup?.spaceId ?? 'site_name 기준 연결'}</p>
                    <p>그룹 키 {selectedSourceSummary.showroomGroup?.showroomGroupKey ?? '미지정'}</p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">준비 체크</p>
                <div className="mt-3 space-y-2">
                  {selectedItemSummary.readinessChecks.map((item) => (
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
                <p className="text-sm font-medium text-slate-900">원천 자산 샘플</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {selectedSourcesLoading ? (
                    <p>원천 자산을 불러오는 중입니다.</p>
                  ) : selectedSourceSummary.sampleAssets.length > 0 ? (
                    selectedSourceSummary.sampleAssets.map((source) => (
                      <Link
                        key={source.id}
                        to={buildImageAssetFocusHref(source.imageAssetId)}
                        className="block rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100"
                      >
                        {source.productName ?? '제품 미지정'} · {source.colorName ?? '색상 미지정'} · 자산 ID {source.imageAssetId ?? '미지정'}
                      </Link>
                    ))
                  ) : (
                    <p>표시할 원천 자산이 없습니다.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                <p className="text-sm font-medium text-slate-900">막힘 신호</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {selectedItemSummary.blockers.length > 0 ? (
                    selectedItemSummary.blockers.map((blocker) => (
                      <Link key={blocker.label} to={blocker.href} className="block rounded-xl bg-slate-50 px-3 py-2 hover:bg-slate-100">
                        {blocker.label}
                      </Link>
                    ))
                  ) : (
                    <p>현재 큰 차단 신호는 없습니다.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                <p className="text-sm font-medium text-slate-900">최근 활동</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {selectedItemLogs.length > 0 ? (
                    selectedItemLogs.map((log) => (
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

              {derivativeControlSummary ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                  <p className="text-sm font-medium text-slate-900">원본 / 파생 제어</p>
                  <div className="mt-3 space-y-2">
                    {derivativeControlSummary.map((entry) => (
                      <div key={entry.id} className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{entry.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" asChild>
                            <Link to={entry.primaryHref}>{entry.primaryActionLabel}</Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={entry.secondaryHref}>{entry.secondaryActionLabel}</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={buildQueueDetailHref(selectedItem)}>콘텐츠 상세로 이동</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={buildQueueDistributionHref(selectedItem, selectedItemDistributions[0]?.channel)}>배포 관리</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={buildQueueAutomationHref(selectedItem, selectedItemJobs[0]?.id, selectedItemJobs[0]?.channel)}>자동화 큐</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">선택한 콘텐츠가 없습니다.</p>
          )}
        </div>
      </section>
    </ContentWorkspaceShell>
  )
}

function buildQueueDetailHref(item: MockContentItem) {
  const tab =
    item.priorityReason === '자동화 확인' || item.priorityReason === '연동 보완'
      ? 'distribution'
      : item.priorityReason === '템플릿 보완'
        ? 'blog'
        : 'basic'
  return `/content/${encodeURIComponent(item.id)}?tab=${encodeURIComponent(tab)}`
}

function buildQueueDistributionHref(item: MockContentItem, channel?: string) {
  const params = new URLSearchParams({ contentId: item.id })
  if (channel) params.set('channel', channel)
  return `/content/distribution?${params.toString()}`
}

function buildQueueAutomationHref(item: MockContentItem, jobId?: string, channel?: string) {
  const params = new URLSearchParams({ contentId: item.id })
  if (jobId) params.set('jobId', jobId)
  if (channel) params.set('channel', channel)
  return `/content/automation?${params.toString()}`
}

function buildImageAssetFocusHref(assetId: string | null) {
  if (!assetId) return '/image-assets'
  return `/image-assets?assetId=${encodeURIComponent(assetId)}`
}

function slugifyShowroomValue(value: string) {
  return encodeURIComponent(value.trim().toLowerCase()).replace(/%/g, '')
}

function buildShowroomPreviewGroupKey(siteName: string, images: ShowroomImageAsset[]) {
  const spaceId = images.find((image) => image.space_id?.trim())?.space_id?.trim()
  if (spaceId) return `showroom:space:${spaceId}`
  return `showroom:site:${slugifyShowroomValue(siteName)}`
}

function buildShowroomPreviewGroups(assets: ShowroomImageAsset[]): ShowroomPreviewGroup[] {
  const grouped = new Map<string, ShowroomImageAsset[]>()

  assets.forEach((asset) => {
    const siteName = asset.canonical_site_name?.trim() || asset.site_name?.trim() || '미지정 현장'
    const key = asset.space_id?.trim() ? `space:${asset.space_id.trim()}` : `site:${slugifyShowroomValue(siteName)}`
    const current = grouped.get(key) ?? []
    current.push(asset)
    grouped.set(key, current)
  })

  return Array.from(grouped.values())
    .map((images) => {
      const sortedImages = [...images].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
      const visibleImages = sortedImages.filter((image) => image.before_after_role !== 'before')
      const siteName = visibleImages.find((image) => image.canonical_site_name?.trim())?.canonical_site_name?.trim()
        || visibleImages.find((image) => image.site_name?.trim())?.site_name?.trim()
        || sortedImages.find((image) => image.canonical_site_name?.trim())?.canonical_site_name?.trim()
        || sortedImages.find((image) => image.site_name?.trim())?.site_name?.trim()
        || '미지정 현장'
      const displayName = visibleImages.find((image) => image.external_display_name?.trim())?.external_display_name?.trim()
        || visibleImages.find((image) => image.canonical_site_name?.trim())?.canonical_site_name?.trim()
        || visibleImages.find((image) => image.site_name?.trim())?.site_name?.trim()
        || sortedImages.find((image) => image.external_display_name?.trim())?.external_display_name?.trim()
        || sortedImages.find((image) => image.canonical_site_name?.trim())?.canonical_site_name?.trim()
        || sortedImages.find((image) => image.site_name?.trim())?.site_name?.trim()
        || '미지정 현장'
      const products = Array.from(new Set(visibleImages.map((image) => image.product_name?.trim()).filter(Boolean) as string[]))
      const colors = Array.from(new Set(visibleImages.map((image) => image.color_name?.trim()).filter(Boolean) as string[]))
      const businessTypes = Array.from(new Set(visibleImages.map((image) => image.business_type?.trim()).filter(Boolean) as string[]))
      const locations = Array.from(new Set(visibleImages.map((image) => image.location?.trim()).filter(Boolean) as string[]))
      const mainImage = visibleImages.find((image) => image.is_main) ?? visibleImages[0] ?? sortedImages[0] ?? null
      const latestCreatedAt = visibleImages.find((image) => image.created_at)?.created_at ?? sortedImages.find((image) => image.created_at)?.created_at ?? null
      const metaCompletion =
        (locations[0] ? 1 : 0)
        + (businessTypes.length > 0 ? 1 : 0)
        + (products.length > 0 ? 1 : 0)
        + (colors.length > 0 ? 1 : 0)

      return {
        key: buildShowroomPreviewGroupKey(siteName, sortedImages),
        siteName,
        displayName,
        location: locations[0] ?? '지역 미지정',
        businessTypes,
        products,
        colors,
        images: visibleImages,
        allImages: sortedImages,
        mainImage,
        latestCreatedAt,
        imageCount: visibleImages.length,
        metaCompletion,
        recommendationScore: visibleImages.length * 10 + products.length * 4 + colors.length * 2 + businessTypes.length * 5,
      }
    })
    .sort((a, b) => {
      if (b.recommendationScore !== a.recommendationScore) return b.recommendationScore - a.recommendationScore
      const aTime = a.latestCreatedAt ? new Date(a.latestCreatedAt).getTime() : 0
      const bTime = b.latestCreatedAt ? new Date(b.latestCreatedAt).getTime() : 0
      return bTime - aTime
    })
}

function findShowroomPreviewGroupForItem(
  item: MockContentItem,
  previewLookup: Map<string, ShowroomPreviewGroup>,
  explicitGroupKey: string | null
) {
  if (explicitGroupKey && previewLookup.has(explicitGroupKey)) return previewLookup.get(explicitGroupKey) ?? null
  return previewLookup.get(`showroom:site:${slugifyShowroomValue(item.siteName)}`)
    ?? previewLookup.get(item.siteName.trim().toLowerCase())
    ?? null
}

function buildShowroomBlogWebhookPayload(
  item: MockContentItem,
  previewGroup: ShowroomPreviewGroup,
  reviewEmail: string,
  ctaTextOverride?: string
) {
  const publicDisplayName = previewGroup.displayName?.trim() || item.siteName
  const effectiveCtaText = getEffectiveCtaText(item, ctaTextOverride)
  const beforeImages = previewGroup.allImages
    .filter((image) => image.before_after_role === 'before')
    .slice(0, 4)
  const afterImages = previewGroup.allImages
    .filter((image) => image.before_after_role !== 'before')
    .slice(0, 8)

  return {
    content_item_id: item.id,
    showroom_group_key: previewGroup.key,
    site_name: publicDisplayName,
    internal_site_name: item.siteName,
    title_hint: `${publicDisplayName} 사례 콘텐츠`,
    location_kr: previewGroup.location || item.region,
    business_type_kr: formatBusinessTypeLabel(previewGroup.businessTypes[0] ?? item.businessType),
    primary_keyword: previewGroup.products[0] ?? item.tags[0] ?? formatBusinessTypeLabel(item.businessType),
    product_names: previewGroup.products.length > 0 ? previewGroup.products : item.tags,
    color_names: previewGroup.colors,
    seo_description: item.seoDescription,
    faq_topics: item.faqTopics,
    cta_text: effectiveCtaText,
    review_email: reviewEmail,
    quality_threshold: 85,
    max_images: 8,
    before_after_available: beforeImages.length > 0 && afterImages.length > 0,
    comparison_focus: ['공간 구성 변화', '동선 변화', '분위기 변화'],
    before_images: beforeImages.map((image, index) => ({
      id: image.id,
      url: image.cloudinary_url,
      pair_id: image.before_after_group_id ?? '',
      caption: `${item.siteName} 비포어 이미지 ${index + 1}`,
    })),
    after_images: afterImages.map((image, index) => ({
      id: image.id,
      url: image.cloudinary_url,
      pair_id: image.before_after_group_id ?? '',
      product_name: image.product_name ?? '',
      color_name: image.color_name ?? '',
      caption: `${item.siteName} 애프터 이미지 ${index + 1}`,
    })),
    representative_images: afterImages.map((image, index) => ({
      id: image.id,
      url: image.cloudinary_url,
      product_name: image.product_name ?? '',
      color_name: image.color_name ?? '',
      caption: `${item.siteName} 이미지 ${index + 1}`,
    })),
    derivative_generation: {
      enabled: true,
      based_on: 'blog_original',
      channels: ['instagram_reels', 'facebook_video', 'youtube_shorts'],
      shorts: {
        enabled: true,
        strategies: ['blog_service', 'youtube_engine'],
        distribution_goal: 'showroom_entry',
        output_schema: {
          blog_service: {
            hook: '',
            summary: '',
            cta: '',
            recommended_channels: ['Instagram Reels', 'Facebook Video'],
          },
          youtube_engine: {
            hook: '',
            scene_notes: ['before', 'transition', 'after'],
            cta: '',
            recommended_channels: ['YouTube Shorts'],
          },
        },
      },
    },
  }
}

function buildIssueBadgeClass(tone: ContentQueueIssue['tone']) {
  if (tone === 'rose') return 'rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700'
  if (tone === 'amber') return 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800'
  if (tone === 'emerald') return 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700'
  return 'rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700'
}

function buildCtaOptions(item: MockContentItem): ContentCtaOption[] {
  return [
    {
      id: 'showroom',
      label: '쇼룸 방문',
      description: '직접 공간 차이를 체감하도록 유도하는 기본 CTA입니다.',
      value: '직접 보면 왜 다른지 더 분명합니다. 쇼룸 방문으로 확인해보세요.',
    },
    {
      id: 'compare',
      label: '사례 비교',
      description: '업종과 지역이 비슷한 사례를 더 비교하게 하는 CTA입니다.',
      value: `${item.region} · ${formatBusinessTypeLabel(item.businessType)}와 비슷한 사례를 더 비교해보고 우리 공간에 맞는 방향을 찾아보세요.`,
    },
    {
      id: 'homepage',
      label: '홈페이지 방문',
      description: '온라인 쇼룸 외에도 전체 정보 탐색으로 보내는 CTA입니다.',
      value: `더 많은 사례와 서비스 안내가 궁금하면 파인드가구 홈페이지에서 전체 내용을 확인해보세요.`,
    },
    {
      id: 'estimate',
      label: '견적 문의',
      description: '비교를 마친 뒤 바로 문의로 이어지게 하는 강한 CTA입니다.',
      value: `우리 공간에 맞는 구성과 견적이 궁금하면 상담을 통해 맞춤 제안을 받아보세요.`,
    },
    {
      id: 'consultation',
      label: '상담 유도',
      description: '바로 상담 문의로 이어지게 하는 CTA입니다.',
      value: `${item.businessType ? formatBusinessTypeLabel(item.businessType) : '공간'} 사례가 더 궁금하면 파인드가구에 상담을 요청해보세요.`,
    },
  ]
}

function getDefaultCtaOption(item: MockContentItem) {
  return buildCtaOptions(item).find((option) => option.id === 'showroom') ?? buildCtaOptions(item)[0] ?? null
}

function getEffectiveCtaText(item: MockContentItem, override?: string | null) {
  const overrideText = String(override ?? '').trim()
  if (overrideText) return overrideText

  const savedText = String(item.ctaText ?? '').trim()
  if (savedText) return savedText

  return getDefaultCtaOption(item)?.value ?? ''
}

function buildContentQueueIssues(
  item: MockContentItem,
  distributions: Array<{ id: string; channel: string; status: string; webhookStatus: string }>,
  jobs: Array<{ id: string; channel: string; status: string; errorMessage: string | null }>,
  derivatives: Array<{ channel: string; type: string }>,
  hasTraceableSource: boolean
): ContentQueueIssue[] {
  const issues: ContentQueueIssue[] = []
  const googleBlogDistribution = distributions.find((distribution) => distribution.channel === 'Google Blog') ?? null
  const failedJobs = jobs.filter((job) => job.status === 'failed')
  const erroredDistributions = distributions.filter((distribution) => distribution.status === 'error')
  const hasShortsBlogService = derivatives.some((derivative) => derivative.type === 'shorts_blog_service')
  const hasShortsYoutubeEngine = derivatives.some((derivative) => derivative.type === 'shorts_youtube_engine')

  if (!hasTraceableSource) {
    issues.push({
      id: 'missing-source',
      label: '원천 이미지 연결 없음',
      description: '쇼룸 원천 이미지가 연결되지 않아 생성 품질을 보장하기 어렵습니다. 먼저 원천 연결부터 확인하세요.',
      actionLabel: '원천 연결',
      href: buildQueueDetailHref(item),
      tone: 'rose',
    })
  }

  if (!item.businessType || item.businessType === '기타') {
    issues.push({
      id: 'missing-business-type',
      label: '업종 미지정',
      description: '업종 정보가 비어 있거나 기타로 남아 있어 생성 톤과 키워드가 흐려질 수 있습니다.',
      actionLabel: '메타 보완',
      href: buildQueueDetailHref(item),
      tone: 'amber',
    })
  }

  if (!item.blogTitle.trim()) {
    issues.push({
      id: 'missing-blog-title',
      label: '원본 제목 없음',
      description: '블로그 원본 제목이 비어 있습니다. 생성 전 제목 방향을 먼저 잡아야 합니다.',
      actionLabel: '제목 작성',
      href: buildQueueDetailHref(item),
      tone: 'amber',
    })
  }

  if (item.tags.length < 2) {
    issues.push({
      id: 'missing-tags',
      label: '태그 부족',
      description: '제품/키워드 태그가 부족해 블로그와 파생 콘텐츠 방향이 모호합니다.',
      actionLabel: '태그 보완',
      href: buildQueueDetailHref(item),
      tone: 'amber',
    })
  }

  if (!getEffectiveCtaText(item)) {
    issues.push({
      id: 'missing-cta',
      label: 'CTA 없음',
      description: '상담 유도 문구가 비어 있어 원본 글과 파생 콘텐츠의 마무리 액션이 약합니다.',
      actionLabel: 'CTA 보완',
      href: buildQueueDetailHref(item),
      tone: 'amber',
    })
  }

  if (!googleBlogDistribution) {
    issues.push({
      id: 'missing-google-blog',
      label: 'Google Blog 미생성',
      description: '원본 채널인 Google Blog 배포 레코드가 아직 없습니다. 원본 생성부터 시작해야 합니다.',
      actionLabel: '원본 생성',
      href: buildQueueDistributionHref(item, 'Google Blog'),
      tone: 'sky',
    })
  } else if (googleBlogDistribution.webhookStatus === '연동 미설정') {
    issues.push({
      id: 'google-blog-webhook-missing',
      label: 'Google Blog 웹훅 미설정',
      description: 'Google Blog 채널이 있지만 웹훅이 연결되지 않아 자동화가 바로 실행되지 않습니다.',
      actionLabel: '웹훅 연결',
      href: buildQueueDistributionHref(item, 'Google Blog'),
      tone: 'amber',
    })
  }

  if (failedJobs.length > 0) {
    issues.push({
      id: 'failed-job',
      label: `실패 작업 ${failedJobs.length}건`,
      description: failedJobs[0]?.errorMessage
        ? `최근 실패 사유: ${failedJobs[0].errorMessage}`
        : '자동화 작업 실패 이력이 있어 재요청 전 원인을 확인해야 합니다.',
      actionLabel: '실패 점검',
      href: buildQueueAutomationHref(item, failedJobs[0]?.id, failedJobs[0]?.channel),
      tone: 'rose',
    })
  }

  if (erroredDistributions.length > 0) {
    issues.push({
      id: 'distribution-error',
      label: `배포 오류 ${erroredDistributions.length}건`,
      description: `${erroredDistributions[0]?.channel ?? '채널'} 배포 상태에 오류가 남아 있습니다.`,
      actionLabel: '배포 점검',
      href: buildQueueDistributionHref(item, erroredDistributions[0]?.channel),
      tone: 'rose',
    })
  }

  if (!hasShortsBlogService) {
    issues.push({
      id: 'missing-shorts-blog-service',
      label: '블로그 기반 숏츠 없음',
      description: '블로그를 바탕으로 한 릴스/페이스북 영상 파생 흐름이 아직 준비되지 않았습니다.',
      actionLabel: '파생 준비',
      href: buildQueueDetailHref(item),
      tone: 'sky',
    })
  }

  if (!hasShortsYoutubeEngine) {
    issues.push({
      id: 'missing-shorts-youtube-engine',
      label: '유튜브 엔진 숏츠 없음',
      description: '비포어/애프터 기반 유튜브 자동화 숏츠 흐름이 아직 준비되지 않았습니다.',
      actionLabel: '파생 준비',
      href: buildQueueDetailHref(item),
      tone: 'sky',
    })
  }

  return issues
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'amber' | 'sky' | 'rose' }) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-900'
      : tone === 'sky'
        ? 'bg-sky-50 text-sky-900'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-900'
          : 'bg-slate-900 text-white'

  return (
    <div className={`rounded-3xl p-5 shadow-sm ${toneClass}`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 px-3 py-2 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}%</p>
    </div>
  )
}
