import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  Columns2,
  Eraser,
  ExternalLink,
  FolderInput,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
  ZoomIn,
} from 'lucide-react'
import AdInboxImportShowroomDialog, {
  type AdInboxImportShowroomResult,
} from '@/components/admin/AdInboxImportShowroomDialog'
import AdInboxImportShowroomAfterOnlyDialog from '@/components/admin/AdInboxImportShowroomAfterOnlyDialog'
import AdInboxPromoteToShowroomDialog, {
  type AdInboxPromotePrefill,
} from '@/components/admin/AdInboxPromoteToShowroomDialog'
import AdInboxImagePreviewDialog, {
  getAdInboxFullPreviewUrl,
  prefetchAdInboxEnlarge,
  type AdInboxPreviewMode,
} from '@/components/admin/AdInboxImagePreviewDialog'
import YoutubeAnalyticsPanel from '@/components/admin/YoutubeAnalyticsPanel'
import {
  extractYoutubeVideoId,
  fetchYoutubeShortsAnalyticsByVideoIds,
  formatYoutubeMetricsChip,
  type YoutubeShortsAnalyticsRow,
} from '@/lib/youtubeAnalyticsService'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShowroomImagePreviewUrl } from '@/lib/imageAssetShowroom'
import {
  adInboxChannelShortLabel,
  adInboxWorkProgressLabel,
  attachSynthesizedBeforeToAdInboxSite,
  buildAdInboxShortsGroupKey,
  buildAdInboxSiteGroupId,
  formatAdInboxScheduledDateTime,
  formatAdInboxWorkCompletedDate,
  cleanupPeopleFromAdInboxAsset,
  createAdInboxSite,
  createAdInboxTimelapseJob,
  deleteAdInboxAsset,
  deleteAdInboxSite,
  deriveAdInboxBatchWorkState,
  ensureAdInboxSitesFromLegacyAssets,
  getAdInboxTimelapseJob,
  groupAdInboxBatches,
  listAdInboxAssets,
  listAdInboxJobLinkedAssets,
  listAdInboxSites,
  listAdInboxTimelapseJobsForBatch,
  listAdInboxWorkProgressByBatches,
  resolveAdInboxChannelPostUrl,
  synthesizeBeforeFromAfterImage,
  updateAdInboxAssetRole,
  uploadAdInboxPhotos,
  type AdInboxAsset,
  type AdInboxBatch,
  type AdInboxBatchWorkState,
  type AdInboxChannelPublishState,
  type AdInboxRole,
  type AdInboxSite,
  type AdInboxTimelapseJob,
  type AdInboxWorkProgress,
  type SynthesizeBeforeMode,
} from '@/lib/adInboxStudio'
import {
  recommendAdInboxPair,
  resolveAssetsFromRecommendation,
  type AdInboxPairRecommendation,
} from '@/lib/adInboxPairRecommend'
import { INDUSTRY_PREFERRED_ORDER } from '@/pages/showroom/showroomPageConstants'
import { getPrimaryIndustryLabel } from '@/pages/showroom/showroomPageGrouping'
import {
  SHOWROOM_SHORTS_CHANNELS,
  buildShowroomShortsPublishPackage,
  ensureShowroomShortsShortLandingLinks,
  ensureShowroomShortsTripleTargets,
  pollShowroomShortsJob,
  requestShowroomShortsComposition,
  requestShowroomShortsGeneration,
  markShowroomShortsTargetsReady,
  requestShowroomShortsPublishLaunch,
  requestShowroomShortsPublishPrepare,
  scheduleShowroomShortsTargetsLaunch,
  cancelShowroomShortsTargetsSchedule,
  fillAdInboxPublishQueue,
  getShowroomShortsCompositionStatus,
  prepareShowroomShortsJobForRecomposition,
  stitchShowroomShortsSplit,
  updateShowroomShortsCompositionConfig,
  updateShowroomShortsJobPrompt,
  updateShowroomShortsTargetPreparation,
  type ShowroomShortsTargetRecord,
} from '@/lib/showroomShorts'
import { SHOWROOM_SHORTS_TIMELAPSE_PROMPT } from '@/lib/showroomShortsTimelapsePrompt'
import {
  SHOWROOM_SHORTS_HOOK_POOL,
  SHOWROOM_SHORTS_TITLE_TEMPLATES,
  buildShowroomShortsVariantTitle,
  formatShowroomShortsBgmLabel,
  formatShowroomShortsFrameModeLabel,
  formatShowroomShortsVariantLabel,
  getShowroomShortsVariantConfig,
  type ShowroomShortsCompositionConfig,
} from '@/lib/showroomShortsVariants'

function getChannelLabel(channel: string) {
  if (channel === 'youtube') return 'YouTube'
  if (channel === 'facebook') return 'Facebook'
  if (channel === 'instagram') return 'Instagram'
  return channel
}

function titleTemplateOptions(current: string) {
  const pooled = SHOWROOM_SHORTS_TITLE_TEMPLATES as readonly string[]
  return pooled.includes(current) ? pooled : [current, ...pooled]
}

function hookLineOptions(hookLine1: string, hookLine2: string) {
  const current: readonly [string, string] = [hookLine1, hookLine2]
  const inPool = SHOWROOM_SHORTS_HOOK_POOL.some(
    ([line1, line2]) => line1 === hookLine1 && line2 === hookLine2,
  )
  return inPool ? SHOWROOM_SHORTS_HOOK_POOL : [current, ...SHOWROOM_SHORTS_HOOK_POOL]
}

function hookOptionValue(line1: string, line2: string) {
  return `${line1}\n${line2}`
}

/** ffmpeg drawtext 색(0xRRGGBB)을 CSS 색으로 바꿔 스와치에 쓴다. */
function overlayCssColor(value: string) {
  return /^0x[0-9a-f]{6}$/iu.test(value) ? `#${value.slice(2)}` : '#ffd54a'
}

function orderTargets(targets: ShowroomShortsTargetRecord[] | undefined) {
  return [...(targets ?? [])].sort((a, b) => {
    const order = SHOWROOM_SHORTS_CHANNELS as readonly string[]
    return order.indexOf(a.channel) - order.indexOf(b.channel)
  })
}

function hasActivePublish(job: AdInboxTimelapseJob) {
  return (job.targets ?? []).some((target) =>
    ['ready', 'preparing', 'publishing'].includes(target.publish_status),
  )
}

/** datetime-local 값(로컬) — ISO 저장용 */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso?.trim()) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultScheduleLocalValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  return toDatetimeLocalValue(d.toISOString())
}

function publishStatusLabel(status: string) {
  if (status === 'ready') return '업로드 준비 대기'
  if (status === 'preparing') return '업로드 준비 중'
  if (status === 'launch_ready') return '론칭 전 확인'
  if (status === 'publishing') return '게시 중'
  if (status === 'published') return '게시 완료'
  if (status === 'failed') return '실패'
  if (status === 'approved') return '승인됨'
  return status
}

function pickPrepString(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function isJobGenerating(job: AdInboxTimelapseJob) {
  if (job.source_video_url) return false
  if (job.status === 'generating') return true
  const kling = job.kling_status ?? ''
  return (
    kling === 'submitted' ||
    kling === 'processing' ||
    kling === 'segments_ready' ||
    kling.startsWith('demo:') ||
    kling.startsWith('align:')
  )
}

function jobStatusLabel(job: AdInboxTimelapseJob) {
  if (job.status === 'failed' || job.kling_status === 'request_failed') return '실패'
  if (job.kling_status === 'segments_ready') {
    const prompt = job.prompt_text ?? ''
    return prompt.includes('[empty_room_v1]')
      ? '구도 맞춤·설치 이어붙이는 중'
      : '철거·설치 이어붙이는 중'
  }
  if (isJobGenerating(job)) {
    const kling = job.kling_status ?? ''
    if (kling.startsWith('align:')) {
      if (/install:awaiting_start_frame/i.test(kling)) return '구도 맞춤 끝프레임 → 설치 시작 중'
      if (/install:pending/i.test(kling) && !/align:(succeed|completed)/i.test(kling)) {
        return '구도 맞춤 생성 중'
      }
      const alignDone = /align:(succeed|completed)/i.test(kling)
      const installDone = /install:(succeed|completed)/i.test(kling)
      if (alignDone && !installDone) return '빈 방 설치 생성 중'
      if (!alignDone) return '구도 맞춤 생성 중'
      return '구도 맞춤·설치 이어붙이는 중'
    }
    if (kling.startsWith('demo:')) {
      const emptyRoom = (job.prompt_text ?? '').includes('[empty_room_v1]')
      if (/install:awaiting_start_frame/i.test(kling)) {
        return emptyRoom ? '구도 맞춤 끝프레임 → 설치 시작 중' : '철거 끝프레임 → 설치 시작 중'
      }
      if (/install:pending/i.test(kling) && !/demo:(succeed|completed)/i.test(kling)) {
        return emptyRoom ? '구도 맞춤 생성 중' : '철거 5초 생성 중'
      }
      const demoDone = /demo:(succeed|completed)/i.test(kling)
      const installDone = /install:(succeed|completed)/i.test(kling)
      if (demoDone && !installDone) return emptyRoom ? '빈 방 설치 생성 중' : '설치 5초 생성 중'
      if (!demoDone) return emptyRoom ? '구도 맞춤 생성 중' : '철거 5초 생성 중'
      return emptyRoom ? '구도 맞춤·설치 이어붙이는 중' : '철거·설치 이어붙이는 중'
    }
    return '원본 생성 중'
  }
  if (job.source_video_url && !job.final_video_url) {
    if (job.status === 'composition_queued' || job.status === 'composition_processing') return '합성 중'
    return '원본 검수'
  }
  if (job.final_video_url || job.status === 'ready_for_review' || job.status === 'composited') {
    const targets = job.targets ?? []
    if (targets.length > 0 && targets.every((t) => t.publish_status === 'published')) return '채널 게시 완료'
    if (hasActivePublish(job)) return '채널 론칭 중'
    if (targets.some((t) => t.publish_status === 'launch_ready' || t.publish_status === 'approved')) {
      return '론칭 승인 대기'
    }
    return '채널 론칭'
  }
  return job.status
}

function workProgressBadgeClass(progress: AdInboxWorkProgress) {
  if (progress === 'working') return 'bg-sky-50 text-sky-800'
  if (progress === 'done') return 'bg-emerald-50 text-emerald-800'
  return 'bg-neutral-100 text-neutral-600'
}

function channelPublishTone(
  status: AdInboxChannelPublishState['status'],
): 'idle' | 'active' | 'done' | 'failed' {
  if (status === 'published') return 'done'
  if (status === 'failed') return 'failed'
  if (['preparing', 'launch_ready', 'approved', 'publishing', 'ready'].includes(status)) {
    return 'active'
  }
  return 'idle'
}

function channelPublishButtonClass(status: AdInboxChannelPublishState['status']): string {
  const tone = channelPublishTone(status)
  if (tone === 'done') return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
  if (tone === 'failed') return 'bg-red-50 text-red-700 ring-1 ring-red-200'
  if (tone === 'active') return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
  return 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200'
}

function channelPublishTitle(state: AdInboxChannelPublishState): string {
  const label =
    state.channel === 'youtube'
      ? 'YouTube'
      : state.channel === 'facebook'
        ? 'Facebook'
        : 'Instagram'
  if (state.status === 'published') {
    return state.externalPostUrl
      ? `${label} 게시물 열기`
      : `${label} 게시 완료 (공개 링크 없음)`
  }
  if (state.status === 'failed') return `${label} 실패`
  if (channelPublishTone(state.status) === 'active') return `${label} 업로드 진행 중`
  return `${label} 대기`
}

function getAdInboxBatchIndustryLabel(batch: AdInboxBatch): string {
  const businessTypes = batch.assets
    .map((asset) => asset.business_type?.trim() ?? '')
    .filter(Boolean)
  return getPrimaryIndustryLabel(businessTypes)
}

function industryChipClass(selected: boolean): string {
  return selected
    ? 'border-neutral-900 bg-neutral-900 text-white'
    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
}

function generatingHint(job: AdInboxTimelapseJob) {
  if (job.status === 'failed' || job.kling_status === 'request_failed') {
    return '생성에 실패했습니다. 아래에서 다시 요청하세요.'
  }
  const emptyRoom = (job.prompt_text ?? '').includes('[empty_room_v1]')
  if (job.kling_status === 'segments_ready') {
    return emptyRoom
      ? '구도 맞춤·설치 원본이 준비됐습니다. 워커가 이어붙이는 중입니다.'
      : '철거·설치 원본이 준비됐습니다. 워커가 10초로 이어붙이는 중입니다.'
  }
  if (/install:awaiting_start_frame/i.test(job.kling_status ?? '')) {
    return emptyRoom
      ? '구도 맞춤이 끝났습니다. 마지막 장면을 뽑아 설치 8초를 시작하는 중입니다.'
      : '철거가 끝났습니다. 마지막 장면을 뽑아 설치 5초를 시작하는 중입니다.'
  }
  if ((job.kling_status ?? '').startsWith('align:')) {
    return '구도 맞춤 3초 → (마지막 프레임) → 설치 8초 순서로 만들고, 끝나면 이어붙입니다.'
  }
  if ((job.kling_status ?? '').startsWith('demo:')) {
    return emptyRoom
      ? '구도 맞춤 3초 → (마지막 프레임) → 설치 8초 순서로 만들고, 끝나면 이어붙입니다.'
      : '철거 5초 → (마지막 프레임) → 설치 5초 순서로 만들고, 끝나면 이어붙입니다.'
  }
  return '원본 생성 중입니다. 자동으로 상태를 갱신합니다.'
}

export default function AdInboxStudioPage() {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [assets, setAssets] = useState<AdInboxAsset[]>([])
  const [sites, setSites] = useState<AdInboxSite[]>([])
  const [uploadMode, setUploadMode] = useState<'new' | 'existing'>('existing')
  const [shortName, setShortName] = useState('')
  const [photoDate, setPhotoDate] = useState(todayYmd())
  const [targetSiteId, setTargetSiteId] = useState<string>('')
  const [uploadRole, setUploadRole] = useState<AdInboxRole>('unset')
  const [files, setFiles] = useState<File[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)
  const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null)
  /** null = 전체. 현장 카드 목록 업종 필터 */
  const [industryFilter, setIndustryFilter] = useState<string | null>(null)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)
  const [recommending, setRecommending] = useState(false)
  const [recommendation, setRecommendation] = useState<AdInboxPairRecommendation | null>(null)
  const [cleaningId, setCleaningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<AdInboxTimelapseJob[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [actingJob, setActingJob] = useState(false)
  const [workProgressByKey, setWorkProgressByKey] = useState<Record<string, AdInboxBatchWorkState>>({})
  /** 현장 카드별 발행예정 datetime-local 초안 */
  const [scheduleDraftByKey, setScheduleDraftByKey] = useState<Record<string, string>>({})
  const [schedulingBatchKey, setSchedulingBatchKey] = useState<string | null>(null)
  const [queueFillBusy, setQueueFillBusy] = useState(false)
  const [importShowroomOpen, setImportShowroomOpen] = useState(false)
  const [importAfterOnlyOpen, setImportAfterOnlyOpen] = useState(false)
  const [synthesizingBefore, setSynthesizingBefore] = useState(false)
  const [synthesizingBeforeMode, setSynthesizingBeforeMode] = useState<SynthesizeBeforeMode | null>(
    null,
  )
  const [attachingSynthBefore, setAttachingSynthBefore] = useState(false)
  const [synthBeforeDraft, setSynthBeforeDraft] = useState<{
    cloudinary_url: string
    thumbnail_url: string | null
    public_id: string | null
    fromAfterId: string
    mode: SynthesizeBeforeMode
  } | null>(null)
  const [promoteShowroomOpen, setPromoteShowroomOpen] = useState(false)
  const [promotePrefill, setPromotePrefill] = useState<AdInboxPromotePrefill | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<AdInboxPreviewMode>('single')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [jobLinkedAssets, setJobLinkedAssets] = useState<AdInboxAsset[]>([])
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editComment, setEditComment] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [compositionDraft, setCompositionDraft] =
    useState<ShowroomShortsCompositionConfig | null>(null)
  const [ytMetricsByVideoId, setYtMetricsByVideoId] = useState<
    Map<string, YoutubeShortsAnalyticsRow>
  >(() => new Map())
  const autoPrepareKeysRef = useRef<Set<string>>(new Set())
  const youtubeCopySyncKeysRef = useRef<Set<string>>(new Set())
  const legacyBackfillDoneRef = useRef(false)

  const batches = useMemo(() => groupAdInboxBatches(assets, sites), [assets, sites])
  const visibleBatches = useMemo(() => {
    if (!industryFilter) return batches
    return batches.filter((batch) => getAdInboxBatchIndustryLabel(batch) === industryFilter)
  }, [batches, industryFilter])
  const selectedBatch: AdInboxBatch | null =
    visibleBatches.find((b) => b.key === selectedBatchKey) ?? visibleBatches[0] ?? null

  const publishedYoutubeVideoIds = useMemo(() => {
    const ids: string[] = []
    for (const state of Object.values(workProgressByKey)) {
      for (const channel of state.channels) {
        if (channel.channel !== 'youtube' || channel.status !== 'published') continue
        const id = extractYoutubeVideoId(channel.externalPostUrl)
        if (id) ids.push(id)
      }
    }
    for (const job of jobs) {
      for (const target of job.targets ?? []) {
        if (target.channel !== 'youtube' || target.publish_status !== 'published') continue
        const id =
          extractYoutubeVideoId(target.external_post_id) ||
          extractYoutubeVideoId(target.external_post_url)
        if (id) ids.push(id)
      }
    }
    return [...new Set(ids)]
  }, [workProgressByKey, jobs])

  const variantPerformance = useMemo(() => {
    const byVariant = new Map<string, { videos: number; views: number; engagedViews: number }>()
    for (const job of jobs) {
      for (const target of job.targets ?? []) {
        if (target.channel !== 'youtube' || target.publish_status !== 'published') continue
        const videoId =
          extractYoutubeVideoId(target.external_post_id) ||
          extractYoutubeVideoId(target.external_post_url)
        const metric = videoId ? ytMetricsByVideoId.get(videoId) : undefined
        const key = target.video_variant ?? 'legacy'
        const current = byVariant.get(key) ?? { videos: 0, views: 0, engagedViews: 0 }
        current.videos += 1
        current.views += metric?.views ?? 0
        current.engagedViews += metric?.engaged_views ?? 0
        byVariant.set(key, current)
      }
    }
    return [...byVariant.entries()]
      .map(([variant, value]) => ({
        variant,
        ...value,
        avgViews: value.videos ? Math.round(value.views / value.videos) : 0,
      }))
      .sort((a, b) => b.avgViews - a.avgViews)
  }, [jobs, ytMetricsByVideoId])

  const loadYtMetrics = useCallback(async () => {
    if (publishedYoutubeVideoIds.length === 0) {
      setYtMetricsByVideoId(new Map())
      return
    }
    try {
      const map = await fetchYoutubeShortsAnalyticsByVideoIds(publishedYoutubeVideoIds)
      setYtMetricsByVideoId(map)
    } catch (error) {
      console.warn('[ad-inbox youtube-analytics]', error)
    }
  }, [publishedYoutubeVideoIds])

  useEffect(() => {
    void loadYtMetrics()
  }, [loadYtMetrics])

  const [filePreviewUrls, setFilePreviewUrls] = useState<
    Array<{ name: string; url: string; index: number }>
  >([])
  useEffect(() => {
    const next = files.map((file, index) => ({
      name: file.name,
      url: URL.createObjectURL(file),
      index,
    }))
    setFilePreviewUrls(next)
    return () => {
      for (const preview of next) {
        URL.revokeObjectURL(preview.url)
      }
    }
  }, [files])

  const removeSelectedFile = useCallback((index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) setFileInputKey((key) => key + 1)
      return next
    })
  }, [])

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? jobs[0] ?? null,
    [jobs, activeJobId],
  )

  useEffect(() => {
    if (!activeJob) {
      setCompositionDraft(null)
      return
    }
    const siteName =
      selectedBatch?.shortName?.trim() ||
      selectedBatch?.label?.trim() ||
      '이 공간'
    setCompositionDraft(
      getShowroomShortsVariantConfig(activeJob.id, siteName, activeJob.composition_config),
    )
  }, [activeJob?.id, activeJob?.composition_config, selectedBatch?.shortName, selectedBatch?.label])

  /** 임시 입고 사진이 없으면 job에 묶인 쇼룸 BA를 그리드·확대에 사용 */
  const displayAssets = useMemo(() => {
    if (!selectedBatch) return [] as AdInboxAsset[]
    if (selectedBatch.assets.length > 0) return selectedBatch.assets
    return jobLinkedAssets
  }, [selectedBatch, jobLinkedAssets])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (!legacyBackfillDoneRef.current) {
        try {
          await ensureAdInboxSitesFromLegacyAssets()
        } catch {
          // 백필 실패해도 목록은 계속 로드
        }
        legacyBackfillDoneRef.current = true
      }
      const [rows, siteRows] = await Promise.all([listAdInboxAssets(), listAdInboxSites()])
      setAssets(rows)
      setSites(siteRows)
      setTargetSiteId((prev) => {
        if (prev && siteRows.some((site) => site.id === prev)) return prev
        return siteRows[0]?.id ?? ''
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '대기실을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshJobs = useCallback(async (batch: AdInboxBatch | null) => {
    if (!batch) {
      setJobs([])
      setActiveJobId(null)
      return
    }
    setJobsLoading(true)
    try {
      const rows = await listAdInboxTimelapseJobsForBatch(batch)
      setJobs(rows)
      setActiveJobId((prev) => {
        if (prev && rows.some((job) => job.id === prev)) return prev
        return rows[0]?.id ?? null
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '타임랩스 작업을 불러오지 못했습니다.')
    } finally {
      setJobsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (batches.length === 0) {
      setWorkProgressByKey({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const map = await listAdInboxWorkProgressByBatches(batches)
        if (!cancelled) setWorkProgressByKey(map)
      } catch {
        // 진행상태 실패해도 카드 목록은 유지
      }
    })()
    return () => {
      cancelled = true
    }
  }, [batches])

  useEffect(() => {
    if (!selectedBatch) return
    // 로딩 중·빈 jobs로 덮으면 채널이 회색으로 깜빡인다
    if (jobsLoading) return
    if (jobs.length === 0) return
    const expectedKey = buildAdInboxShortsGroupKey(selectedBatch.key)
    const belongs = jobs.some(
      (job) =>
        (job.before_after_group_key ?? '') === expectedKey ||
        selectedBatch.assets.some(
          (asset) => asset.id === job.before_asset_id || asset.id === job.after_asset_id,
        ),
    )
    if (!belongs) return
    setWorkProgressByKey((prev) => ({
      ...prev,
      [selectedBatch.key]: deriveAdInboxBatchWorkState(jobs),
    }))
  }, [selectedBatch, jobs, jobsLoading])

  useEffect(() => {
    if (!selectedBatch) {
      setSelectedBatchKey(null)
      return
    }
    if (selectedBatchKey !== selectedBatch.key) {
      setSelectedBatchKey(selectedBatch.key)
    }
  }, [selectedBatch, selectedBatchKey])

  useEffect(() => {
    if (!selectedBatch) {
      setBeforeId(null)
      setAfterId(null)
      setRecommendation(null)
      setJobs([])
      setActiveJobId(null)
      setJobLinkedAssets([])
      setSynthBeforeDraft(null)
      return
    }
    // 카드 전환 직후 임시값. 작업(job)이 있으면 아래에서 job BA로 덮어씀.
    const before = selectedBatch.assets.find((a) => a.before_after_role === 'before')
    const after = selectedBatch.assets.find((a) => a.before_after_role === 'after')
    setBeforeId(before?.id ?? null)
    setAfterId(after?.id ?? null)
    setRecommendation(null)
    setJobLinkedAssets([])
    setSynthBeforeDraft(null)
    // 선택한 현장 카드에 추가 입고가 기본
    if (sites.some((site) => site.id === selectedBatch.siteId)) {
      setTargetSiteId(selectedBatch.siteId)
      setUploadMode('existing')
    }
    void refreshJobs(selectedBatch)
  }, [selectedBatch?.key, selectedBatch?.siteId, sites, refreshJobs])

  /** 타임랩스 job에 묶인 BA가 있으면 그걸 선택 상태로 복원 (역할 태그 첫 장보다 우선) */
  useEffect(() => {
    if (!selectedBatch || !activeJob) return
    const beforeJobId = activeJob.before_asset_id?.trim() || null
    const afterJobId = activeJob.after_asset_id?.trim() || null
    if (!beforeJobId && !afterJobId) return
    if (beforeJobId) setBeforeId(beforeJobId)
    if (afterJobId) setAfterId(afterJobId)
  }, [selectedBatch?.key, activeJob?.id, activeJob?.before_asset_id, activeJob?.after_asset_id])

  useEffect(() => {
    if (!selectedBatch || selectedBatch.assets.length > 0) {
      setJobLinkedAssets([])
      return
    }
    if (!activeJob?.before_asset_id && !activeJob?.before_asset_url) {
      setJobLinkedAssets([])
      return
    }
    let cancelled = false
    void listAdInboxJobLinkedAssets(activeJob, selectedBatch.siteId, selectedBatch.shortName)
      .then((rows) => {
        if (cancelled) return
        setJobLinkedAssets(rows)
        const beforeJobId = activeJob.before_asset_id?.trim()
        const afterJobId = activeJob.after_asset_id?.trim()
        if (beforeJobId && rows.some((a) => a.id === beforeJobId)) {
          setBeforeId(beforeJobId)
        } else {
          const before = rows.find((a) => a.before_after_role === 'before')
          if (before) setBeforeId(before.id)
        }
        if (afterJobId && rows.some((a) => a.id === afterJobId)) {
          setAfterId(afterJobId)
        } else {
          const after = rows.find((a) => a.before_after_role === 'after')
          if (after) setAfterId(after.id)
        }
      })
      .catch(() => {
        if (!cancelled) setJobLinkedAssets([])
      })
    return () => {
      cancelled = true
    }
  }, [
    selectedBatch?.key,
    selectedBatch?.siteId,
    selectedBatch?.shortName,
    selectedBatch?.assets.length,
    activeJob?.id,
    activeJob?.before_asset_id,
    activeJob?.after_asset_id,
    activeJob?.before_asset_url,
    activeJob?.after_asset_url,
  ])

  useEffect(() => {
    if (!activeJob) return
    const generating = isJobGenerating(activeJob)
    const composing =
      activeJob.status === 'composition_queued' || activeJob.status === 'composition_processing'
    const publishing = hasActivePublish(activeJob)
    if (!generating && !composing && !publishing) return

    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          if (generating) {
            const polled = await pollShowroomShortsJob(activeJob.id)
            const needsWorkerAdvance =
              !polled.sourceVideoUrl &&
              (polled.klingStatus === 'segments_ready' ||
                /install:awaiting_start_frame/i.test(polled.klingStatus ?? ''))
            if (needsWorkerAdvance) {
              await stitchShowroomShortsSplit(activeJob.id).catch(() => undefined)
            }
          } else if (composing) {
            await getShowroomShortsCompositionStatus(activeJob.id)
          }
          if (cancelled) return
          const fresh = await getAdInboxTimelapseJob(activeJob.id)
          if (!fresh || cancelled) return
          setJobs((prev) => {
            const others = prev.filter((job) => job.id !== fresh.id)
            return [fresh, ...others]
          })
        } catch {
          // 폴링 실패는 조용히 다음 주기에 재시도
        }
      })()
    }, 8_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    activeJob?.id,
    activeJob?.status,
    activeJob?.kling_status,
    activeJob?.source_video_url,
    activeJob?.targets,
  ])

  const handleRecommendPair = async () => {
    if (!selectedBatch) return
    setRecommending(true)
    try {
      const rec = await recommendAdInboxPair(selectedBatch)
      setRecommendation(rec)
      toast.success(rec.engine === 'ai' ? 'AI 매칭 추천이 준비됐습니다.' : '규칙 기반 추천이 준비됐습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '추천 실패')
    } finally {
      setRecommending(false)
    }
  }

  const handleApplyRecommendation = async () => {
    if (!selectedBatch || !recommendation) return
    const resolved = resolveAssetsFromRecommendation(selectedBatch, recommendation)
    if (!resolved) {
      toast.error('추천 사진을 찾지 못했습니다.')
      return
    }
    setBeforeId(resolved.before.id)
    setAfterId(resolved.after.id)
    try {
      await updateAdInboxAssetRole(resolved.before.id, 'before')
      await updateAdInboxAssetRole(resolved.after.id, 'after')
      await refresh()
      toast.success('추천 페어를 적용했습니다. 확인 후 타임랩스를 만드세요.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '적용 실패')
    }
  }

  const handleCleanupPeople = async (asset: AdInboxAsset) => {
    setCleaningId(asset.id)
    try {
      const { id } = await cleanupPeopleFromAdInboxAsset(asset)
      await refresh()
      setBeforeId(id)
      toast.success('사람 제거 보정본을 같은 배치에 추가했습니다. Before로 선택해 두었습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '보정 실패')
    } finally {
      setCleaningId(null)
    }
  }

  const handleDeleteAsset = async (asset: AdInboxAsset) => {
    const label = asset.original_name?.trim() || '이 사진'
    if (!window.confirm(`「${label}」을(를) 광고 대기실에서 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)) {
      return
    }
    setDeletingId(asset.id)
    try {
      await deleteAdInboxAsset(asset.id)
      if (beforeId === asset.id) setBeforeId(null)
      if (afterId === asset.id) setAfterId(null)
      await refresh()
      toast.success('사진을 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteSite = async (batch: AdInboxBatch) => {
    const siteId = batch.siteId?.trim()
    if (!siteId || !sites.some((site) => site.id === siteId)) {
      toast.error('삭제할 현장 카드를 찾지 못했습니다.')
      return
    }
    const photoNote =
      batch.assets.length > 0
        ? `\n미승격 사진 ${batch.assets.filter((a) => !a.is_consultation).length}장도 함께 삭제됩니다.`
        : ''
    if (
      !window.confirm(
        `「${batch.shortName}」 현장 카드를 대기실에서 삭제할까요?${photoNote}\n삭제 후에는 목록에 다시 나타나지 않습니다.`,
      )
    ) {
      return
    }
    setDeletingSiteId(siteId)
    try {
      await deleteAdInboxSite(siteId)
      if (selectedBatchKey === batch.key) {
        setSelectedBatchKey(null)
        setBeforeId(null)
        setAfterId(null)
      }
      if (targetSiteId === siteId) setTargetSiteId('')
      await refresh()
      toast.success('현장 카드를 삭제했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '카드 삭제 실패')
    } finally {
      setDeletingSiteId(null)
    }
  }

  const handleUpload = async () => {
    if (!files.length) {
      toast.error('사진을 선택하세요.')
      return
    }
    setUploading(true)
    try {
      let siteId = targetSiteId
      if (uploadMode === 'new') {
        const site = await createAdInboxSite({
          shortName,
          photoDate: photoDate || null,
        })
        siteId = site.id
        setTargetSiteId(site.id)
        setUploadMode('existing')
      }
      if (!siteId) {
        throw new Error('현장 카드를 선택하거나 새로 만드세요.')
      }

      const result = await uploadAdInboxPhotos({
        siteId,
        files,
        role: uploadRole,
        photoDate: photoDate || null,
      })
      if (result.ok) {
        toast.success(`${result.ok}장 입고했습니다.`)
      }
      if (result.fail) {
        toast.error(`${result.fail}장 실패 · ${result.errors[0] ?? ''}`)
      }
      setFiles([])
      setFileInputKey((key) => key + 1)
      await refresh()
      setSelectedBatchKey(buildAdInboxSiteGroupId(result.siteId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '입고에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleSetRole = async (asset: AdInboxAsset, role: AdInboxRole) => {
    try {
      // 같은 카드에서 Before/After는 1장만 — 다른 사진의 같은 역할 태그 제거
      if ((role === 'before' || role === 'after') && selectedBatch) {
        const siblings = selectedBatch.assets.filter(
          (row) =>
            row.id !== asset.id &&
            !row.linked_from_showroom_job &&
            row.before_after_role === role,
        )
        await Promise.all(siblings.map((row) => updateAdInboxAssetRole(row.id, 'unset')))
      }
      await updateAdInboxAssetRole(asset.id, role)
      if (role === 'before') setBeforeId(asset.id)
      if (role === 'after') setAfterId(asset.id)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '태그 저장 실패')
    }
  }

  const handlePickForTimelapse = (asset: AdInboxAsset, slot: 'before' | 'after') => {
    if (slot === 'before') setBeforeId(asset.id)
    else {
      setAfterId(asset.id)
      setSynthBeforeDraft((prev) => (prev && prev.fromAfterId !== asset.id ? null : prev))
    }
    // 쇼룸 job 연결 원본은 대기실 BA 메타를 쓰지 않음 (쇼룸 메타 오염 방지)
    if (asset.linked_from_showroom_job) return
    if (asset.before_after_role !== slot) {
      void handleSetRole(asset, slot)
    }
  }

  const beforeAsset = displayAssets.find((a) => a.id === beforeId) ?? null
  const afterAsset = displayAssets.find((a) => a.id === afterId) ?? null

  const openPreviewAt = (assetId: string) => {
    const idx = displayAssets.findIndex((a) => a.id === assetId)
    if (idx < 0) return
    setPreviewMode('single')
    setPreviewIndex(idx)
    setPreviewOpen(true)
  }

  const openComparePreview = () => {
    if (!beforeAsset || !afterAsset) return
    setPreviewMode('compare')
    setPreviewOpen(true)
  }

  const adoptCreatedTimelapseJob = async (jobId: string) => {
    setActiveJobId(jobId)
    const job = await getAdInboxTimelapseJob(jobId)
    if (job) {
      setJobs((prev) => [job, ...prev.filter((row) => row.id !== job.id)])
    } else if (selectedBatch) {
      await refreshJobs(selectedBatch)
    }
  }

  const openPromoteWithBa = (beforeAssetId: string, afterAssetId?: string | null) => {
    const assetIds = [beforeAssetId]
    const perAssetRoles: Record<string, 'before' | 'after'> = { [beforeAssetId]: 'before' }
    if (afterAssetId) {
      assetIds.push(afterAssetId)
      perAssetRoles[afterAssetId] = 'after'
    }
    setPromotePrefill({ assetIds, perAssetRoles })
    setPromoteShowroomOpen(true)
  }

  const handleCreateTimelapse = async (mode: 'standard' | 'empty_room' = 'standard') => {
    if (!beforeAsset || !afterAsset) {
      toast.error('Before 1장과 After 1장을 선택하세요.')
      return
    }
    setCreating(true)
    try {
      const { jobId } = await createAdInboxTimelapseJob({
        before: beforeAsset,
        after: afterAsset,
        mode,
      })
      await adoptCreatedTimelapseJob(jobId)
      const baBeforeId = beforeAsset.id
      const baAfterId = afterAsset.id
      toast.success(
        mode === 'empty_room'
          ? '빈 방 타임랩스(구도 맞춤→설치)를 시작했습니다. 아래에서 원본을 검수하세요.'
          : '클링 생성을 시작했습니다. 아래에서 원본을 검수하세요.',
        {
          action: {
            label: '쇼룸으로',
            onClick: () => openPromoteWithBa(baBeforeId, baAfterId),
          },
        },
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '타임랩스 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  const handleSynthesizeBeforeFromAfter = async (mode: SynthesizeBeforeMode) => {
    if (!afterAsset) {
      toast.error('After 사진을 먼저 선택하세요.')
      return
    }
    if (beforeAsset) {
      toast.error('이미 Before가 선택되어 있습니다. 비운 뒤 다시 시도하세요.')
      return
    }
    const imageUrl = afterAsset.cloudinary_url?.trim() || afterAsset.thumbnail_url?.trim()
    if (!imageUrl) {
      toast.error('After 이미지 URL이 없습니다.')
      return
    }
    setSynthesizingBefore(true)
    setSynthesizingBeforeMode(mode)
    try {
      const result = await synthesizeBeforeFromAfterImage(imageUrl, mode)
      setSynthBeforeDraft({
        ...result,
        fromAfterId: afterAsset.id,
        mode,
      })
      toast.success(
        mode === 'empty_room'
          ? '빈 방 Before 합성이 끝났습니다. 확인 후 「이 Before 쓰기」→「빈 방 타임랩스」를 쓰세요.'
          : '공사 전 Before 합성이 끝났습니다. 미리보기 확인 후 「이 Before 쓰기」를 누르세요.',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Before 합성에 실패했습니다.')
    } finally {
      setSynthesizingBefore(false)
      setSynthesizingBeforeMode(null)
    }
  }

  const handleAcceptSynthesizedBefore = async () => {
    if (!selectedBatch?.siteId || !afterAsset || !synthBeforeDraft) {
      toast.error('After 선택과 합성 결과가 필요합니다.')
      return
    }
    if (synthBeforeDraft.fromAfterId !== afterAsset.id) {
      toast.error('After가 바뀌었습니다. Before를 다시 합성하세요.')
      setSynthBeforeDraft(null)
      return
    }
    setAttachingSynthBefore(true)
    try {
      const result = await attachSynthesizedBeforeToAdInboxSite({
        siteId: selectedBatch.siteId,
        after: afterAsset,
        synthesizedBefore: synthBeforeDraft,
        synthesizeMode: synthBeforeDraft.mode,
      })
      const mode = result.synthesizeMode
      setSynthBeforeDraft(null)
      await refresh()
      setBeforeId(result.beforeAssetId)
      setAfterId(afterAsset.id)
      toast.success(
        mode === 'empty_room'
          ? '빈 방 Before를 이 카드에 넣었습니다. 「빈 방 타임랩스」또는 쇼룸으로 보내세요.'
          : '합성 Before를 이 카드에 넣었습니다. 타임랩스 또는 쇼룸으로 보내세요.',
        {
          action: {
            label: '쇼룸으로',
            onClick: () => openPromoteWithBa(result.beforeAssetId, afterAsset.id),
          },
        },
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '합성 Before 저장에 실패했습니다.')
    } finally {
      setAttachingSynthBefore(false)
    }
  }

  const handleImportedFromShowroom = async (result: AdInboxImportShowroomResult) => {
    setSelectedBatchKey(result.siteBatchKey)
    await refresh()
    setActiveJobId(result.jobId)
    const job = await getAdInboxTimelapseJob(result.jobId)
    if (job) {
      setJobs((prev) => [job, ...prev.filter((row) => row.id !== job.id)])
    }
    if (result.beforeAssetId) {
      setBeforeId(result.beforeAssetId)
    }
    if (result.afterAssetId) {
      setAfterId(result.afterAssetId)
    }
    if (result.openPromote && result.beforeAssetId) {
      openPromoteWithBa(result.beforeAssetId, result.afterAssetId)
    }
  }

  const handlePollActive = async () => {
    if (!activeJob) return
    setActingJob(true)
    try {
      await pollShowroomShortsJob(activeJob.id)
      const fresh = await getAdInboxTimelapseJob(activeJob.id)
      if (fresh) {
        setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
      }
      toast.success('상태를 갱신했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '상태 확인 실패')
    } finally {
      setActingJob(false)
    }
  }

  const handleRegenerate = async () => {
    if (!activeJob) return
    setActingJob(true)
    try {
      // 짧은 대기실 프롬프트로 만들어진 job도 채널 숏츠급 프롬프트로 맞춰 재생성
      await updateShowroomShortsJobPrompt(activeJob.id, SHOWROOM_SHORTS_TIMELAPSE_PROMPT)
      await requestShowroomShortsGeneration(activeJob.id)
      const fresh = await getAdInboxTimelapseJob(activeJob.id)
      if (fresh) {
        setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
      }
      toast.success('작업자 설치 타임랩스 프롬프트로 원본을 다시 요청했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '재생성 실패')
    } finally {
      setActingJob(false)
    }
  }

  const handleCompose = async () => {
    if (!activeJob?.source_video_url) {
      toast.error('원본 영상이 있어야 합성할 수 있습니다.')
      return
    }
    const scheduledCount = (activeJob.targets ?? []).filter(
      (target) => target.publish_status === 'scheduled',
    ).length
    if (
      scheduledCount > 0 &&
      !window.confirm(
        `예약된 채널 ${scheduledCount}개를 해제하고 새 최종 영상 기준으로 업로드 준비를 다시 만들까요?`,
      )
    ) {
      return
    }
    setActingJob(true)
    try {
      if (compositionDraft) {
        await updateShowroomShortsCompositionConfig(activeJob.id, {
          ...compositionDraft,
          audioVariant: 'bgm_only',
        })
      }
      const safety = await prepareShowroomShortsJobForRecomposition(activeJob)
      await requestShowroomShortsComposition(activeJob.id)
      const fresh = await getAdInboxTimelapseJob(activeJob.id)
      if (fresh) {
        setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
      }
      toast.success(
        safety.scheduledTargetIds.length > 0
          ? `예약 ${safety.scheduledTargetIds.length}건을 해제하고 재합성을 요청했습니다.`
          : '원본은 유지한 채 재합성을 요청했습니다. 끝나면 업로드 준비까지 자동으로 진행됩니다.',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '합성 요청 실패')
    } finally {
      setActingJob(false)
    }
  }

  const handleSaveCompositionConfig = async () => {
    if (!activeJob || !compositionDraft) return
    setActingJob(true)
    try {
      await updateShowroomShortsCompositionConfig(activeJob.id, {
        ...compositionDraft,
        audioVariant: 'bgm_only',
      })
      const fresh = await getAdInboxTimelapseJob(activeJob.id)
      if (fresh) {
        setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
      }
      toast.success('포맷 설정을 저장했습니다. 「합성·업로드준비」를 누르면 이 설정으로 다시 만듭니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '포맷 설정 저장 실패')
    } finally {
      setActingJob(false)
    }
  }

  useEffect(() => {
    if (!activeJob?.final_video_url) return
    const hasDraft = (activeJob.targets ?? []).some((target) => target.publish_status === 'draft')
    if (!hasDraft) return
    let cancelled = false
    void (async () => {
      try {
        await markShowroomShortsTargetsReady(activeJob.id)
        if (cancelled) return
        const fresh = await getAdInboxTimelapseJob(activeJob.id)
        if (!fresh || cancelled) return
        setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
      } catch {
        // draft→ready 전환 실패는 사용자가 새로고침/상태확인으로 재시도
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeJob?.id, activeJob?.final_video_url, activeJob?.targets])

  // 최종 영상 준비되면 3채널 카피 통일 + 첫댓글 짧은 /r/ 링크 반영
  useEffect(() => {
    if (!activeJob?.final_video_url) return
    const key = activeJob.id
    if (youtubeCopySyncKeysRef.current.has(key)) return
    youtubeCopySyncKeysRef.current.add(key)

    let cancelled = false
    void (async () => {
      try {
        await ensureShowroomShortsTripleTargets(activeJob.id)
        await ensureShowroomShortsShortLandingLinks(activeJob.id)
        if (cancelled) return
        const fresh = await getAdInboxTimelapseJob(activeJob.id)
        if (!fresh || cancelled) return
        setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
      } catch {
        youtubeCopySyncKeysRef.current.delete(key)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeJob?.id, activeJob?.final_video_url])

  // 워커가 자동 prepare를 못 한 경우(구버전 등) UI에서 ready 타깃을 한 번 더 준비 요청
  useEffect(() => {
    if (!activeJob?.final_video_url) return
    const readyTargets = (activeJob.targets ?? []).filter((target) => target.publish_status === 'ready')
    if (readyTargets.length === 0) return
    const key = `${activeJob.id}:${readyTargets
      .map((target) => target.id)
      .sort()
      .join(',')}`
    if (autoPrepareKeysRef.current.has(key)) return
    autoPrepareKeysRef.current.add(key)

    let cancelled = false
    void (async () => {
      await Promise.allSettled(
        readyTargets.map((target) => requestShowroomShortsPublishPrepare(target.id)),
      )
      if (cancelled) return
      const fresh = await getAdInboxTimelapseJob(activeJob.id).catch(() => null)
      if (!fresh || cancelled) return
      setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
    })()

    return () => {
      cancelled = true
    }
  }, [activeJob?.id, activeJob?.final_video_url, activeJob?.targets])

  const refreshActiveJob = async () => {
    if (!activeJob) return
    const fresh = await getAdInboxTimelapseJob(activeJob.id)
    if (fresh) {
      setJobs((prev) => [fresh, ...prev.filter((job) => job.id !== fresh.id)])
    }
  }

  const handleEnsureTripleTargets = async () => {
    if (!activeJob) return
    setActingJob(true)
    try {
      const result = await ensureShowroomShortsTripleTargets(activeJob.id)
      const linkUpdated = await ensureShowroomShortsShortLandingLinks(activeJob.id)
      await refreshActiveJob()
      toast.success(
        result.inserted > 0
          ? `채널 타깃 ${result.inserted}개를 맞췄고, 짧은 /r/ 링크를 반영했습니다.`
          : result.synced > 0 || linkUpdated > 0
            ? `본문·첫댓글·짧은 링크를 채널별로 맞췄습니다.`
            : '이미 3채널 타깃과 짧은 링크가 맞춰져 있습니다.',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '채널 타깃 맞추기 실패')
    } finally {
      setActingJob(false)
    }
  }

  const handlePrepareTarget = async (target: ShowroomShortsTargetRecord) => {
    setActingJob(true)
    try {
      const result = await requestShowroomShortsPublishPrepare(target.id)
      await refreshActiveJob()
      toast.success(result.message ?? '업로드 준비 요청을 전달했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '업로드 준비 요청 실패')
    } finally {
      setActingJob(false)
    }
  }

  const refreshWorkProgress = useCallback(async () => {
    if (batches.length === 0) {
      setWorkProgressByKey({})
      return
    }
    try {
      const map = await listAdInboxWorkProgressByBatches(batches)
      setWorkProgressByKey(map)
    } catch {
      // 카드 배지 갱신 실패는 무시
    }
  }, [batches])

  const handleSchedulePublish = async (batch: AdInboxBatch) => {
    if (!activeJob || selectedBatch?.key !== batch.key) {
      toast.error('예약을 걸려면 먼저 이 카드를 선택하세요.')
      return
    }
    const draft =
      scheduleDraftByKey[batch.key]?.trim() ||
      toDatetimeLocalValue(workProgressByKey[batch.key]?.scheduledAt) ||
      defaultScheduleLocalValue()
    const when = new Date(draft)
    if (Number.isNaN(when.getTime())) {
      toast.error('예약 시각을 확인하세요.')
      return
    }
    const targetIds = (activeJob.targets ?? [])
      .filter((t) => ['launch_ready', 'approved', 'scheduled'].includes(t.publish_status))
      .map((t) => t.id)
    if (targetIds.length === 0) {
      toast.error('예약 가능한 채널이 없습니다. 업로드 준비가 끝난 뒤 예약하세요.')
      return
    }
    setSchedulingBatchKey(batch.key)
    try {
      const count = await scheduleShowroomShortsTargetsLaunch({
        targetIds,
        scheduledAt: when.toISOString(),
      })
      toast.success(`${count}개 채널 발행예정 ${formatAdInboxScheduledDateTime(when.toISOString())}`)
      await Promise.all([refreshJobs(batch), refreshWorkProgress()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '발행 예약 실패')
    } finally {
      setSchedulingBatchKey(null)
    }
  }

  const handleCancelSchedule = async (batch: AdInboxBatch) => {
    if (!activeJob || selectedBatch?.key !== batch.key) {
      toast.error('예약을 취소하려면 먼저 이 카드를 선택하세요.')
      return
    }
    const targetIds = (activeJob.targets ?? [])
      .filter((t) => t.publish_status === 'scheduled')
      .map((t) => t.id)
    if (targetIds.length === 0) {
      toast.error('취소할 발행예정이 없습니다.')
      return
    }
    setSchedulingBatchKey(batch.key)
    try {
      const count = await cancelShowroomShortsTargetsSchedule(targetIds)
      toast.success(`${count}개 채널 예약을 취소했습니다.`)
      await Promise.all([refreshJobs(batch), refreshWorkProgress()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '예약 취소 실패')
    } finally {
      setSchedulingBatchKey(null)
    }
  }

  const handleFillPublishQueue = async () => {
    setQueueFillBusy(true)
    try {
      const result = await fillAdInboxPublishQueue()
      const n = result.scheduledJobs ?? 0
      if (n === 0) {
        toast.message('줄 세울 미예약 카드가 없습니다. (업로드 준비 끝난 카드만 대상)')
      } else {
        const first = result.results?.[0]?.slotYmd
        const last = result.results?.[result.results.length - 1]?.slotYmd
        toast.success(
          first && last
            ? `${n}장 예약: ${first} ~ ${last} 격일 11:00`
            : `${n}장 격일 11시 슬롯에 줄 세워 예약했습니다.`,
        )
      }
      await refreshWorkProgress()
      if (selectedBatch) await refreshJobs(selectedBatch)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '줄서기 예약 실패')
    } finally {
      setQueueFillBusy(false)
    }
  }

  const handleLaunchTarget = async (_target: ShowroomShortsTargetRecord) => {
    if (!activeJob) return
    const launchable = (activeJob.targets ?? []).filter((t) =>
      ['launch_ready', 'approved'].includes(t.publish_status),
    )
    if (launchable.length === 0) {
      toast.error('론칭 가능한 채널이 없습니다. 발행예정인 채널은 예약 시각에 자동 발행됩니다.')
      return
    }
    const labels = launchable.map((t) => getChannelLabel(t.channel)).join(', ')
    const confirmed = window.confirm(
      launchable.length === 1
        ? `${labels} 채널에 실제 론칭을 시작할까요?`
        : `${labels} 채널을 동시에 론칭할까요?`,
    )
    if (!confirmed) return
    setActingJob(true)
    try {
      const results = await Promise.allSettled(
        launchable.map((t) => requestShowroomShortsPublishLaunch(t.id)),
      )
      await refreshActiveJob()
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const fail = results.length - ok
      if (fail === 0) {
        toast.success(
          ok === 1
            ? '론칭 승인 요청을 전달했습니다.'
            : `${ok}개 채널 론칭 승인 요청을 동시에 전달했습니다.`,
        )
      } else if (ok === 0) {
        const firstFail = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        const reason = firstFail?.reason
        toast.error(reason instanceof Error ? reason.message : '론칭 승인 요청 실패')
      } else {
        toast.warning(`${ok}개 성공 · ${fail}개 실패. 채널 상태를 확인하세요.`)
      }
    } finally {
      setActingJob(false)
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

  const handleSaveEditPackage = async (target: ShowroomShortsTargetRecord) => {
    if (!editTitle.trim()) {
      toast.error('제목을 입력해주세요.')
      return
    }

    setEditSaving(true)
    setActingJob(true)
    try {
      await updateShowroomShortsTargetPreparation(target.id, {
        title: editTitle.trim(),
        descriptionWithHashtags: editBody.trim(),
        firstComment: editComment.trim(),
      })
      toast.success('업로드 준비 내용을 수정했습니다.')
      setEditingTargetId(null)
      await refreshActiveJob()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내용 수정에 실패했습니다.')
    } finally {
      setEditSaving(false)
      setActingJob(false)
    }
  }

  const orderedTargets = useMemo(() => orderTargets(activeJob?.targets), [activeJob?.targets])

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to="/dashboard"
              className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" />
              대시보드
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">광고 대기실</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              클링 원본만 확인하면 됩니다. 합성·업로드 준비는 자동, 최종 게시 직전에 준비 패키지를 확인한 뒤
              론칭하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        <YoutubeAnalyticsPanel
          returnTo="/admin/ad-inbox"
          className="mb-8 space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
          onSynced={() => void loadYtMetrics()}
        />

        {variantPerformance.length > 0 ? (
          <section className="mb-8 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-neutral-900">포맷별 YouTube 성과</h2>
              <p className="text-xs text-neutral-500">게시된 영상 기준 · 지표 동기화 후 갱신</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {variantPerformance.map((row) => (
                <div key={row.variant} className="rounded-lg border border-violet-100 bg-white p-3">
                  <p className="text-xs font-medium text-violet-800">
                    {formatShowroomShortsVariantLabel(row.variant)}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">{row.avgViews.toLocaleString()} 조회/편</p>
                  <p className="text-xs text-neutral-500">
                    {row.videos}편 · 총 {row.views.toLocaleString()} 조회 · 참여 {row.engagedViews.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-4 w-4 text-neutral-700" />
            <h2 className="text-base font-semibold text-neutral-900">입고 입구</h2>
          </div>
          <p className="mb-3 text-xs text-neutral-500">
            현장 카드에 사진을 붙입니다. Before/After 순서는 상관없고, 같은 카드면 한 묶음입니다.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                ['existing', '기존 카드에 추가'],
                ['new', '새 현장 카드'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setUploadMode(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  uploadMode === value
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {uploadMode === 'new' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">현장 카드 이름 (필수)</span>
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="예: 2607 압구정 관리형"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">참고 날짜 (선택)</span>
                <Input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} />
              </label>
            </div>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">현장 카드 선택</span>
              <select
                value={targetSiteId}
                onChange={(e) => setTargetSiteId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
              >
                {sites.length === 0 ? (
                  <option value="">아직 카드가 없습니다 · 새 현장 카드를 만드세요</option>
                ) : (
                  sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.short_name}
                      {site.photo_date ? ` · ${site.photo_date}` : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['unset', '태그 나중에'],
                ['before', 'Before로 입고'],
                ['after', 'After로 입고'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setUploadRole(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  uploadRole === value
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Input
              key={fileInputKey}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-neutral-500">{files.length}장 선택됨 · 썸네일 × 로 제외</p>
                <div className="flex flex-wrap gap-2">
                  {filePreviewUrls.map((preview) => (
                    <div
                      key={`${preview.index}-${preview.name}`}
                      className="relative w-16 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
                      title={preview.name}
                    >
                      <button
                        type="button"
                        aria-label={`${preview.name} 선택 해제`}
                        title="업로드 목록에서 빼기"
                        className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white hover:bg-red-600"
                        onClick={() => removeSelectedFile(preview.index)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <img
                        src={preview.url}
                        alt={preview.name}
                        className="h-16 w-16 object-cover"
                      />
                      <p className="truncate px-1 py-0.5 text-[10px] leading-tight text-neutral-500">
                        {preview.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <Button
              type="button"
              onClick={() => void handleUpload()}
              disabled={
                uploading ||
                files.length === 0 ||
                (uploadMode === 'new' ? !shortName.trim() : !targetSiteId)
              }
            >
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              {uploadMode === 'new' ? '카드 만들고 넣기' : '선택한 카드에 넣기'}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">대기실 · 현장 카드</h2>
              <p className="text-xs text-neutral-500">
                대기중(사진만) → 작업중(릴스 제작) → 작업완료(합성 끝). 채널 버튼은 업로드 완료 시
                초록색·게시물 링크. 「11시 줄서기 예약」은 준비 끝난 미예약 카드를 격일 11:00에
                1장씩 앞으로 줄 세웁니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleFillPublishQueue()}
                disabled={queueFillBusy || loading}
                title="업로드 준비 끝난 미예약 카드를 앞으로 격일 11:00에 1장씩 예약"
              >
                {queueFillBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarClock className="mr-1.5 h-4 w-4" />
                )}
                11시 줄서기 예약
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportShowroomOpen(true)}
                disabled={creating}
              >
                <FolderInput className="mr-1.5 h-4 w-4" />
                BA 있는 쇼룸
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportAfterOnlyOpen(true)}
                disabled={creating}
              >
                <FolderInput className="mr-1.5 h-4 w-4" />
                Before 없는 After
              </Button>
              {selectedBatch && selectedBatch.assets.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (beforeId && afterId) {
                      openPromoteWithBa(beforeId, afterId)
                      return
                    }
                    setPromotePrefill(null)
                    setPromoteShowroomOpen(true)
                  }}
                  disabled={creating}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  쇼룸으로 보내기
                </Button>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중…
            </div>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">
              아직 현장 카드가 없습니다. 「BA 있는 쇼룸」또는 「Before 없는 After」로 시작하거나,
              위에서 새 카드를 만들어 주세요.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIndustryFilter(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${industryChipClass(!industryFilter)}`}
                >
                  전체
                </button>
                {INDUSTRY_PREFERRED_ORDER.map((industry) => (
                  <button
                    key={`ad-inbox-industry-${industry}`}
                    type="button"
                    onClick={() => setIndustryFilter(industry)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${industryChipClass(industryFilter === industry)}`}
                  >
                    {industry}
                  </button>
                ))}
                <span className="text-xs text-neutral-500">{visibleBatches.length}개</span>
              </div>
              {visibleBatches.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  이 업종의 현장 카드가 없습니다. 다른 분류를 선택해 보세요.
                </p>
              ) : (
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <div className="space-y-1">
                {visibleBatches.map((batch) => {
                  const selected = selectedBatch?.key === batch.key
                  const workState = workProgressByKey[batch.key] ?? {
                    progress: 'waiting' as const,
                    completedAt: null,
                    uploadedAt: null,
                    scheduledAt: null,
                    channels: deriveAdInboxBatchWorkState([]).channels,
                  }
                  const progress = workState.progress
                  const uploadedDate = formatAdInboxWorkCompletedDate(workState.uploadedAt)
                  const scheduledLabel = formatAdInboxScheduledDateTime(workState.scheduledAt)
                  const canDeleteSite = sites.some((site) => site.id === batch.siteId)
                  const siteDeleting = deletingSiteId === batch.siteId
                  const scheduleBusy = schedulingBatchKey === batch.key
                  const activeJobMatchesCard =
                    Boolean(activeJob) &&
                    (activeJob?.before_after_group_key ?? '') ===
                      buildAdInboxShortsGroupKey(batch.key)
                  // 합성본+타깃만 있으면 예약 UI 유지 (ready는 준비 후 예약 가능)
                  const canScheduleSelected =
                    selected &&
                    activeJobMatchesCard &&
                    !jobsLoading &&
                    Boolean(activeJob?.final_video_url) &&
                    (activeJob?.targets ?? []).length > 0
                  const hasScheduledTargets =
                    selected &&
                    activeJobMatchesCard &&
                    (activeJob?.targets ?? []).some((t) => t.publish_status === 'scheduled')
                  const canConfirmSchedule =
                    canScheduleSelected &&
                    (activeJob?.targets ?? []).some((t) =>
                      ['launch_ready', 'approved', 'scheduled'].includes(t.publish_status),
                    )
                  const scheduleInputValue =
                    scheduleDraftByKey[batch.key] ??
                    toDatetimeLocalValue(workState.scheduledAt) ??
                    ''
                  return (
                    <div
                      key={batch.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedBatchKey(batch.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedBatchKey(batch.key)
                        }
                      }}
                      className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                        selected
                          ? 'border-sky-500 bg-white text-neutral-900 ring-2 ring-sky-500/30'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1 font-medium leading-snug">{batch.shortName}</div>
                        {canDeleteSite ? (
                          <button
                            type="button"
                            title="현장 카드 삭제"
                            aria-label={`${batch.shortName} 현장 카드 삭제`}
                            disabled={siteDeleting || Boolean(deletingSiteId)}
                            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteSite(batch)
                            }}
                          >
                            {siteDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-tight ${workProgressBadgeClass(progress)}`}
                        >
                          {adInboxWorkProgressLabel(progress, workState.completedAt)}
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          B{batch.beforeCount} · A{batch.afterCount}
                          {batch.unsetCount ? ` · ?${batch.unsetCount}` : ''} · {batch.assets.length}장
                        </span>
                        {batch.promotedCount > 0 || batch.status === 'promoted' ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            {batch.status === 'promoted'
                              ? '쇼룸 완료'
                              : `쇼룸 ${batch.promotedCount}/${batch.assets.length}`}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {uploadedDate ? (
                          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight text-teal-800">
                            업로드 {uploadedDate}
                          </span>
                        ) : null}
                        {scheduledLabel ? (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight text-violet-800 ring-1 ring-violet-200">
                            발행예정 {scheduledLabel}
                          </span>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1">
                          {workState.channels.map((channelState) => {
                            const label = adInboxChannelShortLabel(channelState.channel)
                            const className =
                              'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-tight ' +
                              (channelState.status === 'scheduled'
                                ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200'
                                : channelPublishButtonClass(channelState.status))
                            const title = channelPublishTitle(channelState)
                            const ytVideoId =
                              channelState.channel === 'youtube'
                                ? extractYoutubeVideoId(channelState.externalPostUrl)
                                : null
                            const ytMetrics = ytVideoId
                              ? ytMetricsByVideoId.get(ytVideoId)
                              : undefined
                            const ytChip = ytMetrics ? formatYoutubeMetricsChip(ytMetrics) : null
                            const displayLabel = ytChip ? `${label} · ${ytChip.label}` : label
                            const displayTitle = ytChip ? `${title} · ${ytChip.title}` : title
                            if (channelState.status === 'published' && channelState.externalPostUrl) {
                              return (
                                <a
                                  key={channelState.channel}
                                  href={channelState.externalPostUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={displayTitle}
                                  className={className + ' underline-offset-2 hover:underline'}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {displayLabel}
                                </a>
                              )
                            }
                            return (
                              <span
                                key={channelState.channel}
                                title={displayTitle}
                                className={className}
                              >
                                {displayLabel}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      {selected && canScheduleSelected ? (
                        <div
                          className="mt-2 space-y-1.5 border-t border-neutral-200/80 pt-2"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <label className="block text-[10px] font-medium text-neutral-600">
                            발행예정
                            <input
                              type="datetime-local"
                              className="mt-0.5 w-full rounded border border-neutral-200 bg-white px-1.5 py-1 text-[11px] text-neutral-800"
                              value={scheduleInputValue || defaultScheduleLocalValue()}
                              onChange={(event) =>
                                setScheduleDraftByKey((prev) => ({
                                  ...prev,
                                  [batch.key]: event.target.value,
                                }))
                              }
                              disabled={scheduleBusy || actingJob}
                            />
                          </label>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={scheduleBusy || actingJob || !canConfirmSchedule}
                              title={
                                canConfirmSchedule
                                  ? '선택한 시각에 자동 발행'
                                  : '업로드 준비가 끝난 뒤 예약할 수 있습니다'
                              }
                              className="rounded bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                              onClick={() => void handleSchedulePublish(batch)}
                            >
                              {scheduleBusy ? '저장 중…' : '예약'}
                            </button>
                            {hasScheduledTargets ? (
                              <button
                                type="button"
                                disabled={scheduleBusy || actingJob}
                                className="rounded border border-neutral-300 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                                onClick={() => void handleCancelSchedule(batch)}
                              >
                                예약 취소
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {selectedBatch ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                      Before: {beforeAsset ? '선택됨' : '미선택'}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
                      After: {afterAsset ? '선택됨' : '미선택'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRecommendPair()}
                      disabled={recommending || displayAssets.length < 2}
                    >
                      {recommending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      매칭 추천
                    </Button>
                  </div>

                  {recommendation ? (
                    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-sm text-violet-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          추천 페어 · {recommendation.engine === 'ai' ? 'AI' : '규칙'} · 신뢰도{' '}
                          {recommendation.confidence}
                        </p>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={() => void handleApplyRecommendation()}>
                            적용
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRecommendation(null)}
                          >
                            무시
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-violet-800">{recommendation.reason}</p>
                      <p className="mt-2 text-[11px] text-violet-700">
                        자동 실행하지 않습니다. 적용 후 눈으로 확인하고 타임랩스를 만드세요.
                      </p>
                    </div>
                  ) : null}

                  {beforeAsset || afterAsset ? (
                    <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-neutral-700">선택 BA 비교</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!beforeAsset || !afterAsset}
                          onClick={openComparePreview}
                        >
                          <Columns2 className="mr-1.5 h-3.5 w-3.5" />
                          비교해서 보기
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className="overflow-hidden rounded-lg border border-amber-200 bg-white text-left"
                          onClick={() => beforeAsset && openPreviewAt(beforeAsset.id)}
                          disabled={!beforeAsset}
                        >
                          <div className="px-2 py-1 text-[10px] font-semibold text-amber-800">Before</div>
                          <div className="aspect-[16/10] bg-neutral-200">
                            {beforeAsset ? (
                              <img
                                src={getAdInboxFullPreviewUrl(beforeAsset)}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : synthBeforeDraft && afterAsset && synthBeforeDraft.fromAfterId === afterAsset.id ? (
                              <img
                                src={synthBeforeDraft.thumbnail_url || synthBeforeDraft.cloudinary_url}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-neutral-400">
                                {afterAsset ? '미선택 · Before 합성 가능' : '미선택'}
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="overflow-hidden rounded-lg border border-emerald-200 bg-white text-left"
                          onClick={() => afterAsset && openPreviewAt(afterAsset.id)}
                          disabled={!afterAsset}
                        >
                          <div className="px-2 py-1 text-[10px] font-semibold text-emerald-800">After</div>
                          <div className="aspect-[16/10] bg-neutral-200">
                            {afterAsset ? (
                              <img
                                src={getAdInboxFullPreviewUrl(afterAsset)}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[11px] text-neutral-400">
                                미선택
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                      {afterAsset && !beforeAsset ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              synthesizingBefore ||
                              attachingSynthBefore ||
                              creating ||
                              cleaningId != null
                            }
                            onClick={() => void handleSynthesizeBeforeFromAfter('construction')}
                          >
                            {synthesizingBefore && synthesizingBeforeMode === 'construction' ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {synthBeforeDraft?.fromAfterId === afterAsset.id &&
                            synthBeforeDraft.mode === 'construction'
                              ? '공사 전 다시 합성'
                              : '공사 전 Before'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              synthesizingBefore ||
                              attachingSynthBefore ||
                              creating ||
                              cleaningId != null
                            }
                            onClick={() => void handleSynthesizeBeforeFromAfter('empty_room')}
                          >
                            {synthesizingBefore && synthesizingBeforeMode === 'empty_room' ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {synthBeforeDraft?.fromAfterId === afterAsset.id &&
                            synthBeforeDraft.mode === 'empty_room'
                              ? '빈 방 다시 합성'
                              : '빈 방 Before'}
                          </Button>
                          {synthBeforeDraft && synthBeforeDraft.fromAfterId === afterAsset.id ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={attachingSynthBefore || synthesizingBefore}
                                onClick={() => void handleAcceptSynthesizedBefore()}
                              >
                                {attachingSynthBefore ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                이 Before 쓰기
                                {synthBeforeDraft.mode === 'empty_room' ? ' (빈 방)' : ' (공사 전)'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={attachingSynthBefore || synthesizingBefore}
                                onClick={() => setSynthBeforeDraft(null)}
                              >
                                취소
                              </Button>
                            </>
                          ) : null}
                          <p className="w-full text-[11px] text-neutral-500">
                            「공사 전」= 철거·공사 분위기 / 「빈 방」= 가구만 제거(빈 방 타임랩스용).
                            확인 후 「이 Before 쓰기」→ 타임랩스·쇼룸으로 보내면 됩니다.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedBatch.assets.length === 0 && displayAssets.length > 0 ? (
                    <p className="mb-3 text-[11px] text-neutral-500">
                      쇼룸 BA로 만든 카드입니다. 원본은 쇼룸에 두고, 여기서 확대·BA 지정만 합니다.
                    </p>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {displayAssets.map((asset) => {
                      const preview = getShowroomImagePreviewUrl(asset)
                      const isBefore = beforeId === asset.id
                      const isAfter = afterId === asset.id
                      const linked = Boolean(asset.linked_from_showroom_job)
                      return (
                        <div
                          key={asset.id}
                          className={`overflow-hidden rounded-xl border bg-neutral-50 ${
                            isBefore
                              ? 'border-amber-500 ring-2 ring-amber-200'
                              : isAfter
                                ? 'border-emerald-500 ring-2 ring-emerald-200'
                                : 'border-neutral-200'
                          }`}
                        >
                          <div className="relative aspect-[4/3] bg-neutral-200">
                            <button
                              type="button"
                              aria-label="사진 확대"
                              title="확대해서 보기"
                              className="group absolute inset-0 z-[1] cursor-zoom-in"
                              onMouseEnter={() => prefetchAdInboxEnlarge(asset)}
                              onFocus={() => prefetchAdInboxEnlarge(asset)}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                openPreviewAt(asset.id)
                              }}
                            >
                              {preview ? (
                                <img
                                  src={preview}
                                  alt=""
                                  draggable={false}
                                  className="pointer-events-none h-full w-full object-cover"
                                />
                              ) : null}
                              <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-70 transition-opacity group-hover:opacity-100">
                                <ZoomIn className="h-3 w-3" />
                                확대
                              </span>
                            </button>
                            {linked ? (
                              <span className="absolute left-1.5 top-1.5 z-10 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                쇼룸 BA
                              </span>
                            ) : asset.is_consultation ? (
                              <span className="absolute left-1.5 top-1.5 z-10 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                쇼룸 등록됨
                              </span>
                            ) : null}
                            {!linked ? (
                              <button
                                type="button"
                                title="사진 삭제"
                                disabled={deletingId === asset.id || cleaningId === asset.id}
                                className="absolute right-1.5 top-1.5 z-10 inline-flex items-center justify-center rounded-md bg-black/55 p-1.5 text-white hover:bg-red-600 disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleDeleteAsset(asset)
                                }}
                              >
                                {deletingId === asset.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                          <div className="space-y-1.5 p-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                aria-pressed={isBefore}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                  isBefore
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-amber-50 hover:text-amber-900'
                                }`}
                                onClick={() => handlePickForTimelapse(asset, 'before')}
                              >
                                Before
                              </button>
                              <button
                                type="button"
                                aria-pressed={isAfter}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                  isAfter
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-emerald-50 hover:text-emerald-900'
                                }`}
                                onClick={() => handlePickForTimelapse(asset, 'after')}
                              >
                                After
                              </button>
                              <button
                                type="button"
                                disabled={cleaningId === asset.id || deletingId === asset.id}
                                className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-900 disabled:opacity-50"
                                onClick={() => void handleCleanupPeople(asset)}
                              >
                                {cleaningId === asset.id ? '보정중…' : '사람제거'}
                              </button>
                            </div>
                            {!isBefore && !isAfter ? (
                              <p className="text-[10px] text-neutral-400">미선택 · 하나를 누르세요</p>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => beforeAsset && void handleCleanupPeople(beforeAsset)}
                      disabled={!beforeAsset || cleaningId === beforeAsset?.id}
                    >
                      {cleaningId && beforeAsset && cleaningId === beforeAsset.id ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Eraser className="mr-1.5 h-4 w-4" />
                      )}
                      Before 사람 제거 보정
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleCreateTimelapse('standard')}
                      disabled={creating || !beforeAsset || !afterAsset}
                    >
                      {creating ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Video className="mr-1.5 h-4 w-4" />
                      )}
                      타임랩스 만들기
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCreateTimelapse('empty_room')}
                      disabled={creating || !beforeAsset || !afterAsset}
                    >
                      {creating ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Video className="mr-1.5 h-4 w-4" />
                      )}
                      빈 방 타임랩스
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!beforeAsset || !afterAsset) {
                          toast.error('Before/After를 선택한 뒤 쇼룸으로 보내세요.')
                          return
                        }
                        openPromoteWithBa(beforeAsset.id, afterAsset.id)
                      }}
                      disabled={creating || !beforeAsset || !afterAsset}
                    >
                      <Send className="mr-1.5 h-4 w-4" />
                      선택 BA 쇼룸으로
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    After만 있으면 「공사 전 Before」또는「빈 방 Before」→「이 Before 쓰기」후
                    타임랩스·쇼룸으로 보내세요. 빈 방 Before면 「빈 방 타임랩스」를 쓰세요.
                    사람이 찍힌 Before는 타임랩스 전에 「사람 제거 보정」→ 새 컷 확인 → 그다음 타임랩스.
                    Before가 이미 빈 방이면 「빈 방 타임랩스」(구도 맞춤 후 설치만)를 쓰세요. 합성
                    Before가 준비되면 「선택 BA 쇼룸으로」로 블로그·전후비교에 연결하세요.
                  </p>

                  <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-900">이 배치 검수</h3>
                        <p className="text-xs text-neutral-500">
                          원본이 나오면 여기서 확인하고, 괜찮으면 합성으로 진행합니다.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void refreshJobs(selectedBatch)}
                        disabled={jobsLoading}
                      >
                        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${jobsLoading ? 'animate-spin' : ''}`} />
                        작업 새로고침
                      </Button>
                    </div>

                    {jobsLoading && jobs.length === 0 ? (
                      <div className="flex items-center gap-2 py-6 text-sm text-neutral-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        작업 불러오는 중…
                      </div>
                    ) : jobs.length === 0 ? (
                      <p className="py-4 text-sm text-neutral-500">
                        아직 이 배치의 타임랩스 작업이 없습니다. BA를 고른 뒤 「타임랩스 만들기」를 누르세요.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {jobs.length > 1 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {jobs.map((job) => (
                              <button
                                key={job.id}
                                type="button"
                                onClick={() => setActiveJobId(job.id)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                                  activeJob?.id === job.id
                                    ? 'border-neutral-900 bg-neutral-900 text-white'
                                    : 'border-neutral-200 bg-white text-neutral-600'
                                }`}
                              >
                                {jobStatusLabel(job)} · {job.created_at.slice(5, 16).replace('T', ' ')}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {activeJob ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-white px-2.5 py-1 font-medium text-neutral-800 ring-1 ring-neutral-200">
                                {jobStatusLabel(activeJob)}
                              </span>
                              <span className="text-neutral-500">
                                kling: {activeJob.kling_status ?? '—'} · job {activeJob.status}
                              </span>
                            </div>

                            {activeJob.source_video_url ? (
                              <video
                                key={activeJob.source_video_url}
                                src={activeJob.source_video_url}
                                controls
                                playsInline
                                className="max-h-[420px] w-full rounded-xl bg-black"
                              />
                            ) : (
                              <div className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-8 text-sm text-neutral-500">
                                {isJobGenerating(activeJob) && (
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                )}
                                {generatingHint(activeJob)}
                              </div>
                            )}

                            {activeJob.final_video_url ? (
                              <div>
                                <p className="mb-2 text-xs font-medium text-neutral-700">최종(합성) 영상</p>
                                <video
                                  key={activeJob.final_video_url}
                                  src={activeJob.final_video_url}
                                  controls
                                  playsInline
                                  className="max-h-[420px] w-full rounded-xl bg-black"
                                />
                              </div>
                            ) : null}

                            {compositionDraft ? (
                              <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                                <div>
                                  <p className="text-sm font-semibold text-neutral-900">쇼츠 포맷</p>
                                  <p className="mt-0.5 text-xs text-neutral-600">
                                    컷 순서는 After 콜드오픈 고정. 제목·훅은 직접 고르고, 화면·자막·색·BGM은 현장 시드로
                                    자동 회전합니다.
                                  </p>
                                </div>
                                <div className="text-xs text-neutral-600">
                                  컷 순서
                                  <div className="mt-1 flex h-8 items-center rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-800">
                                    After 콜드오픈 · After → Before 반전 → 타임랩스
                                  </div>
                                </div>
                                <label className="block text-xs text-neutral-600">
                                  제목 (6종 로테)
                                  <select
                                    value={compositionDraft.titleTemplate}
                                    onChange={(event) =>
                                      setCompositionDraft((current) =>
                                        current
                                          ? { ...current, titleTemplate: event.target.value }
                                          : current,
                                      )
                                    }
                                    className="mt-1 h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800"
                                  >
                                    {titleTemplateOptions(compositionDraft.titleTemplate).map((template) => (
                                      <option key={template} value={template}>
                                        {buildShowroomShortsVariantTitle(
                                          { ...compositionDraft, titleTemplate: template },
                                          selectedBatch?.shortName?.trim() ||
                                            selectedBatch?.label?.trim() ||
                                            '이 공간',
                                        )}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block text-xs text-neutral-600">
                                  훅 자막 (6종 로테)
                                  <select
                                    value={hookOptionValue(compositionDraft.hookLine1, compositionDraft.hookLine2)}
                                    onChange={(event) => {
                                      const [hookLine1 = '', hookLine2 = ''] = event.target.value.split('\n')
                                      setCompositionDraft((current) =>
                                        current ? { ...current, hookLine1, hookLine2 } : current,
                                      )
                                    }}
                                    className="mt-1 h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-800"
                                  >
                                    {hookLineOptions(compositionDraft.hookLine1, compositionDraft.hookLine2).map(
                                      ([line1, line2]) => (
                                        <option key={`${line1}/${line2}`} value={hookOptionValue(line1, line2)}>
                                          {line1} / {line2}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                                <div className="space-y-1.5 rounded-md border border-violet-100 bg-white px-2.5 py-2 text-[11px] text-neutral-600">
                                  <p className="font-medium text-neutral-700">
                                    자동 회전 (재합성해도 같은 조합)
                                  </p>
                                  <p>화면 · {formatShowroomShortsFrameModeLabel(compositionDraft.frameMode)}</p>
                                  <p>
                                    현장명 자막 · {compositionDraft.siteLine || '(현장명 없음 — 미표시)'}
                                  </p>
                                  <p>보조 자막 · {compositionDraft.subLine}</p>
                                  <p>CTA 자막 · {compositionDraft.ctaLine}</p>
                                  <p className="flex items-center gap-1.5">
                                    <span>오버레이 색 ·</span>
                                    <span
                                      className="inline-block h-3 w-3 rounded-sm ring-1 ring-neutral-300"
                                      style={{ backgroundColor: overlayCssColor(compositionDraft.hookColor) }}
                                    />
                                    <span
                                      className="inline-block h-3 w-3 rounded-sm ring-1 ring-neutral-300"
                                      style={{ backgroundColor: overlayCssColor(compositionDraft.ctaColor) }}
                                    />
                                    <span>자막 위치 {compositionDraft.textYShift >= 0 ? '+' : ''}
                                      {compositionDraft.textYShift}px
                                    </span>
                                  </p>
                                  <p>
                                    BGM · {formatShowroomShortsBgmLabel(compositionDraft.bgmTrack)} (11곡 풀)
                                  </p>
                                </div>
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={actingJob}
                                    onClick={() => void handleSaveCompositionConfig()}
                                  >
                                    포맷 설정 저장
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            {(activeJob.targets ?? []).some(
                              (target) => target.publish_status === 'scheduled',
                            ) ? (
                              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                재합성하면 예약된 채널의 예약을 먼저 해제하고, 새 최종 영상 기준으로 업로드 준비를 다시
                                만듭니다.
                              </p>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={actingJob}
                                onClick={() => void handlePollActive()}
                              >
                                {actingJob ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                상태 확인
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={actingJob}
                                onClick={() => void handleRegenerate()}
                              >
                                프롬프트 교정 후 다시 생성
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={actingJob || !activeJob.source_video_url}
                                onClick={() => void handleCompose()}
                              >
                                {activeJob.final_video_url
                                  ? '합성·업로드준비 다시하기'
                                  : '원본 OK · 합성·업로드준비'}
                              </Button>
                              {activeJob.source_video_url ? (
                                <Button type="button" size="sm" variant="outline" asChild>
                                  <a href={activeJob.source_video_url} target="_blank" rel="noreferrer">
                                    원본 새 탭
                                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              ) : null}
                            </div>

                            {activeJob.final_video_url ? (
                              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-neutral-900">
                                      최종 업로드 전 확인
                                    </p>
                                    <p className="mt-0.5 text-xs text-neutral-600">
                                      합성·업로드 준비는 자동입니다. 제목·본문·첫댓글은 「내용 수정」으로 고칠 수
                                      있고, 저장한 뒤 「론칭 승인」하면 Make 업로드에 반영됩니다. 첫댓글 링크는
                                      짧은 주소(
                                      <span className="font-medium text-neutral-800">/r/yt · /r/ig · /r/fb</span>
                                      )로 쇼룸+UTM이 붙습니다.
                                    </p>
                                  </div>
                                  {orderedTargets.length < SHOWROOM_SHORTS_CHANNELS.length ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={actingJob}
                                      onClick={() => void handleEnsureTripleTargets()}
                                    >
                                      3채널 타깃 맞추기
                                    </Button>
                                  ) : null}
                                </div>
                                {orderedTargets.length === 0 ? (
                                  <p className="text-xs text-amber-700">
                                    퍼블리시 타깃이 없습니다. 「3채널 타깃 맞추기」를 눌러 주세요.
                                  </p>
                                ) : (
                                  <div className="grid gap-3 md:grid-cols-3">
                                    {orderedTargets.map((target) => {
                                      const publishPackage = buildShowroomShortsPublishPackage(target)
                                      const canPrepare = [
                                        'ready',
                                        'failed',
                                        'launch_ready',
                                        'approved',
                                      ].includes(target.publish_status)
                                      const canLaunch = ['launch_ready', 'approved'].includes(
                                        target.publish_status,
                                      )
                                      const canEditPackage = !['preparing', 'publishing'].includes(
                                        target.publish_status,
                                      )
                                      const busy =
                                        target.publish_status === 'preparing' ||
                                        target.publish_status === 'publishing'
                                      const isEditing = editingTargetId === target.id
                                      const bodyPreview = publishPackage.descriptionWithHashtags
                                      const previewUrl = pickPrepString(target.preparation_payload, [
                                        'previewUrl',
                                        'draftUrl',
                                        'platformDraftUrl',
                                        'uploadUrl',
                                      ])
                                      const checklistRaw = target.preparation_payload?.checklist
                                      const checklist = Array.isArray(checklistRaw)
                                        ? checklistRaw
                                            .map((item) => (typeof item === 'string' ? item.trim() : ''))
                                            .filter(Boolean)
                                        : []

                                      return (
                                        <div
                                          key={target.id}
                                          className="flex flex-col rounded-lg border border-neutral-200 bg-white p-3"
                                        >
                                          <div className="mb-2 flex items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-neutral-900">
                                              {getChannelLabel(target.channel)}
                                            </p>
                                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                                              {publishStatusLabel(target.publish_status)}
                                            </span>
                                          </div>

                                          {target.publish_status === 'preparing' ||
                                          target.publish_status === 'ready' ? (
                                            <p className="mb-2 flex items-center gap-1.5 text-xs text-neutral-500">
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              업로드 준비 패키지를 만드는 중…
                                            </p>
                                          ) : null}

                                          <div className="mb-3 space-y-2 rounded-md border border-neutral-100 bg-neutral-50 p-2.5 text-xs text-neutral-700">
                                            {isEditing ? (
                                              <>
                                                <div>
                                                  <p className="mb-1 font-medium text-neutral-500">제목</p>
                                                  <Input
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    className="h-8 bg-white text-xs"
                                                    disabled={editSaving}
                                                  />
                                                </div>
                                                <div>
                                                  <p className="mb-1 font-medium text-neutral-500">본문</p>
                                                  <textarea
                                                    value={editBody}
                                                    onChange={(e) => setEditBody(e.target.value)}
                                                    rows={5}
                                                    disabled={editSaving}
                                                    className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                                                  />
                                                </div>
                                                <div>
                                                  <p className="mb-1 font-medium text-neutral-500">첫 댓글</p>
                                                  <textarea
                                                    value={editComment}
                                                    onChange={(e) => setEditComment(e.target.value)}
                                                    rows={2}
                                                    disabled={editSaving}
                                                    className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                                                  />
                                                  {publishPackage.landingUrl ? (
                                                    <p className="mt-1 text-[11px] text-emerald-700">
                                                      짧은 링크 · {publishPackage.landingUrl}
                                                    </p>
                                                  ) : null}
                                                </div>
                                                <div className="flex justify-end gap-2 pt-1">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={editSaving}
                                                    onClick={handleCancelEditPackage}
                                                  >
                                                    취소
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={editSaving || actingJob}
                                                    onClick={() => void handleSaveEditPackage(target)}
                                                  >
                                                    {editSaving ? (
                                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                    ) : null}
                                                    저장
                                                  </Button>
                                                </div>
                                              </>
                                            ) : (
                                              <>
                                                <div className="flex justify-end">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[11px]"
                                                    disabled={!canEditPackage || actingJob || editSaving}
                                                    onClick={() =>
                                                      handleStartEditPackage(
                                                        target.id,
                                                        publishPackage.title,
                                                        bodyPreview,
                                                        publishPackage.firstComment,
                                                      )
                                                    }
                                                  >
                                                    내용 수정
                                                  </Button>
                                                </div>
                                                <div>
                                                  <p className="mb-0.5 font-medium text-neutral-500">제목</p>
                                                  <p className="whitespace-pre-wrap break-words">
                                                    {publishPackage.title || '—'}
                                                  </p>
                                                </div>
                                                <div>
                                                  <p className="mb-0.5 font-medium text-neutral-500">본문</p>
                                                  <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words">
                                                    {bodyPreview || '—'}
                                                  </p>
                                                </div>
                                                {publishPackage.firstComment ? (
                                                  <div>
                                                    <p className="mb-0.5 font-medium text-neutral-500">첫 댓글</p>
                                                    <p className="whitespace-pre-wrap break-words">
                                                      {publishPackage.firstComment}
                                                    </p>
                                                    {publishPackage.landingUrl ? (
                                                      <p className="mt-1 text-[11px] text-emerald-700">
                                                        짧은 링크 · {publishPackage.landingUrl}
                                                        <span className="text-neutral-500">
                                                          {' '}
                                                          → medium=shorts
                                                        </span>
                                                      </p>
                                                    ) : null}
                                                  </div>
                                                ) : null}
                                                {checklist.length > 0 ? (
                                                  <ul className="list-disc space-y-0.5 pl-4 text-neutral-600">
                                                    {checklist.map((item) => (
                                                      <li key={item}>{item}</li>
                                                    ))}
                                                  </ul>
                                                ) : null}
                                                {previewUrl ? (
                                                  <a
                                                    href={previewUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-neutral-700 underline-offset-2 hover:underline"
                                                  >
                                                    플랫폼 초안/미리보기
                                                    <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                ) : null}
                                              </>
                                            )}
                                          </div>

                                          <div className="mt-auto flex flex-col gap-2">
                                            <Button
                                              type="button"
                                              size="sm"
                                              disabled={!canLaunch || actingJob}
                                              onClick={() => void handleLaunchTarget(target)}
                                            >
                                              {busy && target.publish_status === 'publishing' ? (
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                              ) : null}
                                              론칭 승인
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              disabled={!canPrepare || actingJob}
                                              onClick={() => void handlePrepareTarget(target)}
                                            >
                                              {busy && target.publish_status === 'preparing' ? (
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                              ) : null}
                                              준비 다시 요청
                                            </Button>
                                            {(() => {
                                              const postUrl = resolveAdInboxChannelPostUrl(target)
                                              if (!postUrl) return null
                                              const videoId =
                                                target.channel === 'youtube'
                                                  ? extractYoutubeVideoId(target.external_post_id) ||
                                                    extractYoutubeVideoId(target.external_post_url) ||
                                                    extractYoutubeVideoId(postUrl)
                                                  : null
                                              const metrics = videoId
                                                ? ytMetricsByVideoId.get(videoId)
                                                : undefined
                                              const chip = metrics
                                                ? formatYoutubeMetricsChip(metrics)
                                                : null
                                              return (
                                                <div className="space-y-1">
                                                  <a
                                                    href={postUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] text-neutral-600 underline-offset-2 hover:underline"
                                                  >
                                                    게시물 열기
                                                    <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                  {chip ? (
                                                    <p
                                                      className="text-[11px] tabular-nums text-neutral-700"
                                                      title={chip.title}
                                                    >
                                                      YT 지표 · {chip.label}
                                                      {metrics?.avg_view_percentage != null
                                                        ? ` · 평균시청 ${Math.round(Number(metrics.avg_view_percentage) * 10) / 10}%`
                                                        : ''}
                                                    </p>
                                                  ) : null}
                                                </div>
                                              )
                                            })()}
                                            {target.preparation_error ? (
                                              <p className="text-[11px] text-red-600">
                                                {target.preparation_error}
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-neutral-500">
                                클링 원본이 괜찮으면 「원본 OK · 합성·업로드준비」를 누르세요. 이후 합성과
                                채널 업로드 준비는 자동으로 이어집니다.
                              </p>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
              )}
            </div>
          )}
        </section>
      </div>

      <AdInboxImportShowroomDialog
        open={importShowroomOpen}
        onOpenChange={setImportShowroomOpen}
        onCreated={(result) => {
          void handleImportedFromShowroom(result)
        }}
      />
      <AdInboxImportShowroomAfterOnlyDialog
        open={importAfterOnlyOpen}
        onOpenChange={setImportAfterOnlyOpen}
        onCreated={(result) => {
          void handleImportedFromShowroom(result)
        }}
      />
      <AdInboxPromoteToShowroomDialog
        open={promoteShowroomOpen}
        onOpenChange={(open) => {
          setPromoteShowroomOpen(open)
          if (!open) setPromotePrefill(null)
        }}
        batch={selectedBatch}
        prefill={promotePrefill}
        onPromoted={() => {
          void refresh()
        }}
      />
      <AdInboxImagePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        mode={previewMode}
        assets={displayAssets}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        beforeId={beforeId}
        afterId={afterId}
        onPick={(asset, slot) => {
          const inbox = displayAssets.find((a) => a.id === asset.id)
          if (inbox) handlePickForTimelapse(inbox, slot)
        }}
      />
    </div>
  )
}
