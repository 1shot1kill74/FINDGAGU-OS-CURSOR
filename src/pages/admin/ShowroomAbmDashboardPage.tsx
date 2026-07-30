import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Filter, MessageCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { ShowroomAbmConsultationSurface } from '@/lib/showroomAbmTracking'
import {
  formatAbmHostnameLabel,
  getAbmTrafficFilterLabel,
  getShowroomAbmProductionHostnames,
  matchesShowroomAbmTrafficFilter,
  readAbmEventHostname,
  type ShowroomAbmTrafficFilter,
} from '@/lib/showroomAbmTraffic'

const TRAFFIC_FILTER_OPTIONS: { value: ShowroomAbmTrafficFilter; label: string; description: string }[] = [
  {
    value: 'production',
    label: '프로덕션만',
    description: 'www.findgagu.co.kr · os.findgagu.co.kr 등 운영 도메인만 집계',
  },
  {
    value: 'exclude_local',
    label: '로컬 제외',
    description: 'localhost·127.0.0.1 테스트는 제외',
  },
  {
    value: 'all',
    label: '전체',
    description: '로컬·프리뷰·구 데이터까지 모두 포함',
  },
]

const PERIOD_OPTIONS = [
  { value: 0, label: '오늘' },
  { value: 7, label: '최근 7일' },
  { value: 15, label: '최근 15일' },
  { value: 30, label: '최근 30일' },
  { value: 90, label: '최근 90일' },
] as const

/** 핵심: 숏츠 → 중간 랜딩 → 상담 */
const SHORTS_LANDING_FUNNEL_STEPS = [
  { eventName: 'abm_shorts_landing_enter', label: '숏츠 랜딩 진입' },
  {
    eventName: 'abm_consultation_click',
    label: '랜딩에서 상담 클릭',
    metadataKey: 'surface',
    metadataValue: 'shorts_landing',
  },
] as const

/** 보조: 랜딩에서 카탈로그로 빠진 뒤 */
const SHORTS_TO_CATALOG_FUNNEL_STEPS = [
  { eventName: 'abm_shorts_landing_enter', label: '숏츠 랜딩 진입' },
  { eventName: 'abm_shorts_more_sites_click', label: '다른 현장 더 보기' },
  { eventName: 'abm_showroom_enter', label: '쇼룸 카탈로그 진입' },
] as const

const BEFORE_AFTER_FUNNEL_STEPS = [
  { eventName: 'abm_showroom_enter', label: '쇼룸 진입' },
  { eventName: 'abm_header_nav_click', label: '현장 전후 바로가기', metadataKey: 'navTarget', metadataValue: 'before_after' },
  { eventName: 'abm_ba_story_click', label: 'B/A 카드 클릭' },
  { eventName: 'abm_case_open', label: '사례 페이지 열림' },
  { eventName: 'abm_consultation_click', label: '상담 클릭' },
] as const

const EXPERT_RECOMMEND_FUNNEL_STEPS = [
  { eventName: 'abm_showroom_enter', label: '쇼룸 진입' },
  { eventName: 'abm_header_nav_click', label: '전문가추천 바로가기', metadataKey: 'navTarget', metadataValue: 'expert_recommend' },
  { eventName: 'abm_concern_select', label: '추천 질문 선택' },
  { eventName: 'abm_ba_story_click', label: '추천 사례 클릭', metadataKey: 'concern' },
  { eventName: 'abm_consultation_click', label: '상담 클릭', metadataKey: 'concern' },
] as const

const GALLERY_STEPS = [
  { eventName: 'abm_gallery_browse', label: '갤러리 탐색' },
  { eventName: 'abm_gallery_open', label: '갤러리 상세 열림' },
  { eventName: 'abm_consultation_click', label: '상담 클릭' },
] as const

const SURFACE_LABELS: Record<ShowroomAbmConsultationSurface, string> = {
  expert_comment: '전문가 코멘트',
  case_sticky: '사례 하단 Sticky',
  case_inline: '사례 본문 상담',
  gallery_modal: '갤러리 모달',
  gallery_browse_header: '메인 Sticky',
  shorts_landing: '숏츠 연속 랜딩',
}

const HEADER_NAV_LABELS: Record<string, string> = {
  before_after: '시공전후',
  expert_recommend: '전문가추천',
}

type AbmEventRow = {
  id: string
  session_key: string
  event_name: string
  source_surface: string
  site_name: string | null
  industry: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type FunnelStepMetric = {
  eventName: string
  label: string
  sessions: number
  events: number
  rateFromEnter: number | null
  dropFromPrevious: number | null
}

type ConcernMetric = {
  concern: string
  sessions: number
  concernSelects: number
  baClicks: number
  caseOpens: number
  consultations: number
}

type SurfaceMetric = {
  surface: string
  label: string
  sessions: number
  events: number
}

type HeaderNavMetric = {
  target: string
  label: string
  sessions: number
  events: number
}

type CaseFailMetric = {
  reason: string
  events: number
  sessions: number
}

type HostnameMetric = {
  hostname: string | null
  label: string
  sessions: number
  events: number
}

type ChannelMetric = {
  source: string
  medium: string
  campaign: string
  sessions: number
  events: number
  consultations: number
}

export default function ShowroomAbmDashboardPage() {
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [trafficFilter, setTrafficFilter] = useState<ShowroomAbmTrafficFilter>('production')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AbmEventRow[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setErrorMessage(null)

      try {
        const now = new Date()
        const since = new Date(now)
        const until = new Date(now)
        until.setHours(23, 59, 59, 999)

        if (periodDays === 0) {
          since.setHours(0, 0, 0, 0)
        } else {
          since.setDate(since.getDate() - (periodDays - 1))
          since.setHours(0, 0, 0, 0)
        }

        const { data, error } = await supabase
          .from('showroom_engagement_events')
          .select('id, session_key, event_name, source_surface, site_name, industry, metadata, created_at')
          .gte('created_at', since.toISOString())
          .lte('created_at', until.toISOString())
          .like('event_name', 'abm_%')
          .order('created_at', { ascending: false })

        if (cancelled) return

        if (error) {
          setRows([])
          setErrorMessage(error.message)
          return
        }

        setRows((data ?? []) as AbmEventRow[])
      } catch (error) {
        if (cancelled) return
        setRows([])
        setErrorMessage(error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [periodDays])

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesShowroomAbmTrafficFilter(row.metadata, trafficFilter)),
    [rows, trafficFilter]
  )

  const hostnameMetrics = useMemo(() => buildHostnameMetrics(rows), [rows])
  const metrics = useMemo(() => buildAbmDashboardMetrics(filteredRows), [filteredRows])
  const productionHostnames = useMemo(() => getShowroomAbmProductionHostnames(), [])
  const hiddenRowCount = rows.length - filteredRows.length
  const legacyRowCount = useMemo(
    () => rows.filter((row) => !readAbmEventHostname(row.metadata)).length,
    [rows]
  )

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              대시보드
            </Link>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-slate-900" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">쇼룸 ABM 퍼널</h1>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              광고 숏츠 → 중간 랜딩(<code className="rounded bg-slate-100 px-1">/r/yt|ig|fb/:jobId</code>) → 상담·카탈로그
              흐름을 먼저 보고, 쇼룸 카탈로그 탐색은 보조로 봅니다. 기본값은{' '}
              <span className="font-medium text-slate-800">프로덕션 도메인만</span> 집계합니다.
            </p>
            <p className="text-xs text-slate-500">
              프로덕션 호스트: {productionHostnames.join(', ')}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 md:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {TRAFFIC_FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={trafficFilter === option.value ? 'default' : 'outline'}
                  className="h-9"
                  onClick={() => setTrafficFilter(option.value)}
                  title={option.description}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={periodDays === option.value ? 'default' : 'outline'}
                  className="h-9"
                  onClick={() => setPeriodDays(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {!loading && !errorMessage && rows.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="font-medium text-slate-900">{getAbmTrafficFilterLabel(trafficFilter)}</span> 기준{' '}
            <span className="font-medium text-slate-900">{formatNumber(filteredRows.length)}</span>건 표시
            {hiddenRowCount > 0 ? (
              <>
                {' '}
                · 전체 {formatNumber(rows.length)}건 중 {formatNumber(hiddenRowCount)}건 제외
              </>
            ) : null}
            {legacyRowCount > 0 ? (
              <>
                {' '}
                · 호스트 미기록(구 데이터) {formatNumber(legacyRowCount)}건
              </>
            ) : null}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard
            title="숏츠 랜딩 세션"
            value={formatNumber(metrics.shortsLandingSessions)}
            description="abm_shorts_landing_enter 고유 session_key"
            icon={<Users className="h-4 w-4" />}
          />
          <SummaryCard
            title="랜딩→상담"
            value={formatNumber(metrics.shortsConsultationSessions)}
            description="숏츠 랜딩 CTA 상담 클릭 세션"
            icon={<MessageCircle className="h-4 w-4" />}
          />
          <SummaryCard
            title="랜딩 상담 전환율"
            value={formatPercent(metrics.shortsConsultationRate)}
            description="랜딩 상담 ÷ 숏츠 랜딩 진입"
            icon={<Filter className="h-4 w-4" />}
          />
          <SummaryCard
            title="다른 현장 더 보기"
            value={formatNumber(metrics.shortsMoreSitesSessions)}
            description="랜딩에서 카탈로그로 이동한 세션"
            icon={<BarChart3 className="h-4 w-4" />}
          />
        </section>

        {loading ? (
          <p className="text-sm text-slate-500">데이터를 불러오는 중입니다...</p>
        ) : errorMessage ? (
          <p className="text-sm text-rose-600">{errorMessage}</p>
        ) : filteredRows.length === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              {rows.length === 0
                ? '선택 기간에 ABM 이벤트가 없습니다. 숏츠 랜딩(`/r/.../jobId`) 또는 공개 쇼룸에서 행동이 발생하면 여기에 쌓입니다.'
                : `${getAbmTrafficFilterLabel(trafficFilter)} 조건에 맞는 이벤트가 없습니다. 로컬 테스트만 있었다면 「로컬 제외」 또는 「전체」로 바꿔 보세요.`}
            </p>
            {rows.length > 0 && hostnameMetrics.length > 0 ? (
              <div className="mt-4">
                <SimpleTable
                  title="호스트별 원본 이벤트"
                  description="현재 필터와 관계없이 기간 내 전체 분포"
                  emptyMessage=""
                  columns={['호스트', '세션', '이벤트']}
                  rows={hostnameMetrics.map((row) => [
                    row.label,
                    formatNumber(row.sessions),
                    formatNumber(row.events),
                  ])}
                />
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-2">
              <FunnelPanel
                title="숏츠 → 랜딩 → 상담"
                description="광고 숏츠 링크 → 중간 랜딩 → 채널톡 상담 (핵심 퍼널)"
                steps={metrics.shortsLandingFunnel}
              />
              <FunnelPanel
                title="숏츠 → 랜딩 → 카탈로그"
                description="랜딩에서 「다른 현장 더 보기」로 쇼룸 탐색에 합류"
                steps={metrics.shortsToCatalogFunnel}
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <SimpleTable
                title="상담 클릭 surface"
                description="어디 CTA에서 상담이 시작됐는지 (숏츠 랜딩 포함)"
                emptyMessage="상담 클릭 데이터가 없습니다."
                columns={['위치', '세션', '클릭 수']}
                rows={metrics.surfaceMetrics.map((row) => [row.label, formatNumber(row.sessions), formatNumber(row.events)])}
              />
              <SimpleTable
                title="SNS/캠페인별 유입"
                description="숏츠 `/r/yt|ig|fb` · SNS `/sns/...` UTM 기준"
                emptyMessage="채널 데이터가 없습니다."
                columns={['소스', '매체', '캠페인', '세션', '이벤트', '상담']}
                rows={metrics.channelMetrics.map((row) => [
                  row.source,
                  row.medium,
                  row.campaign,
                  formatNumber(row.sessions),
                  formatNumber(row.events),
                  formatNumber(row.consultations),
                ])}
              />
            </section>

            <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm open:pb-5">
              <summary className="cursor-pointer text-lg font-semibold text-slate-900">
                쇼룸 카탈로그 퍼널 (보조)
              </summary>
              <p className="mt-2 text-sm text-slate-500">
                프로필 링크·「다른 현장 더 보기」로 들어온 뒤의 기존 공개 쇼룸 탐색입니다. 숏츠 직행과 별개로 봅니다.
              </p>
              <div className="mt-5 grid gap-6 xl:grid-cols-3">
                <FunnelPanel
                  title="현장 전후 퍼널"
                  description="진입 → 현장 전후 → B/A → 사례 → 상담"
                  steps={metrics.beforeAfterFunnel}
                />
                <FunnelPanel
                  title="전문가추천 퍼널"
                  description="진입 → 전문가추천 → 질문 → 사례 → 상담"
                  steps={metrics.expertRecommendFunnel}
                />
                <FunnelPanel
                  title="사진 탐색 퍼널"
                  description="갤러리 탐색 → 상세 → 상담"
                  steps={metrics.galleryFunnel}
                />
              </div>
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <SimpleTable
                  title="바로가기 클릭"
                  description="현장 전후·전문가추천 책갈피 (abm_header_nav_click)"
                  emptyMessage="바로가기 클릭 데이터가 없습니다."
                  columns={['대상', '세션', '클릭 수']}
                  rows={metrics.headerNavMetrics.map((row) => [row.label, formatNumber(row.sessions), formatNumber(row.events)])}
                />
                <SimpleTable
                  title="고민별 행동"
                  description="concern 메타데이터 기준"
                  emptyMessage="고민 데이터가 없습니다."
                  columns={['고민', '세션', '고민 선택', 'B/A 클릭', '사례 열림', '상담']}
                  rows={metrics.concernMetrics.map((row) => [
                    row.concern,
                    formatNumber(row.sessions),
                    formatNumber(row.concernSelects),
                    formatNumber(row.baClicks),
                    formatNumber(row.caseOpens),
                    formatNumber(row.consultations),
                  ])}
                />
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <SummaryCard
                  title="카탈로그 세션"
                  value={formatNumber(metrics.enterSessions)}
                  description="abm_showroom_enter"
                  icon={<Users className="h-4 w-4" />}
                />
                <SummaryCard
                  title="전체 상담 세션"
                  value={formatNumber(metrics.consultationSessions)}
                  description="모든 surface 합"
                  icon={<MessageCircle className="h-4 w-4" />}
                />
                <SummaryCard
                  title="사례 열림 / 실패"
                  value={`${formatNumber(metrics.caseOpenEvents)} / ${formatNumber(metrics.caseFailEvents)}`}
                  description="abm_case_open · fail"
                  icon={<BarChart3 className="h-4 w-4" />}
                />
              </div>
            </details>

            {metrics.caseFailMetrics.length > 0 ? (
              <SimpleTable
                title="사례 페이지 실패"
                description="404·incomplete 등 막힌 지점"
                emptyMessage=""
                columns={['사유', '세션', '건수']}
                rows={metrics.caseFailMetrics.map((row) => [row.reason, formatNumber(row.sessions), formatNumber(row.events)])}
              />
            ) : null}

            {hostnameMetrics.length > 0 ? (
              <SimpleTable
                title="호스트별 이벤트"
                description={`${getAbmTrafficFilterLabel(trafficFilter)} 필터 적용 전·후 비교용`}
                emptyMessage=""
                columns={['호스트', '세션', '이벤트']}
                rows={hostnameMetrics.map((row) => [row.label, formatNumber(row.sessions), formatNumber(row.events)])}
              />
            ) : null}
          </>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">해석 가이드</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <p>1. 핵심은 숏츠 랜딩입니다. 랜딩 진입 대비 상담 전환이 낮으면 CTA·사진·카피부터 손봅니다.</p>
            <p>2. 「다른 현장 더 보기」가 높고 상담이 낮으면, 랜딩이 카탈로그로만 새고 있는 것입니다.</p>
            <p>3. 인스타는 프로필 링크(고정 쇼룸 입구) 비중이 클 수 있어, 카탈로그 퍼널은 보조로 봅니다.</p>
            <p>4. 유튜브·페이스북은 숏츠 job 랜딩 직행이 본선입니다. medium=`shorts` 유입을 채널 표에서 확인하세요.</p>
            <p>5. 퍼널은 session_key 기준입니다. 기본 「프로덕션만」은 운영 도메인만 집계합니다.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function buildHostnameMetrics(rows: AbmEventRow[]): HostnameMetric[] {
  const map = new Map<string | null, { sessions: Set<string>; events: number }>()

  for (const row of rows) {
    const hostname = readAbmEventHostname(row.metadata)
    const bucket = map.get(hostname) ?? { sessions: new Set<string>(), events: 0 }
    bucket.sessions.add(row.session_key)
    bucket.events += 1
    map.set(hostname, bucket)
  }

  return [...map.entries()]
    .map(([hostname, bucket]) => ({
      hostname,
      label: formatAbmHostnameLabel(hostname),
      sessions: bucket.sessions.size,
      events: bucket.events,
    }))
    .sort((a, b) => b.events - a.events || b.sessions - a.sessions)
}

function buildAbmDashboardMetrics(rows: AbmEventRow[]) {
  const enterSessions = countUniqueSessions(rows, 'abm_showroom_enter')
  const consultationSessions = countUniqueSessions(rows, 'abm_consultation_click')
  const caseOpenEvents = countEvents(rows, 'abm_case_open')
  const caseFailEvents = countEvents(rows, 'abm_case_open_fail')

  const shortsLandingSessions = countUniqueSessions(rows, 'abm_shorts_landing_enter')
  const shortsConsultationSessions = countUniqueSessions(
    getFunnelStepRows(rows, {
      eventName: 'abm_consultation_click',
      metadataKey: 'surface',
      metadataValue: 'shorts_landing',
    }),
    'abm_consultation_click',
  )
  const shortsMoreSitesSessions = countUniqueSessions(rows, 'abm_shorts_more_sites_click')

  const shortsLandingFunnel = buildFunnelMetrics(rows, SHORTS_LANDING_FUNNEL_STEPS, shortsLandingSessions)
  const shortsToCatalogFunnel = buildFunnelMetrics(rows, SHORTS_TO_CATALOG_FUNNEL_STEPS, shortsLandingSessions)
  const beforeAfterFunnel = buildFunnelMetrics(rows, BEFORE_AFTER_FUNNEL_STEPS, enterSessions)
  const expertRecommendFunnel = buildFunnelMetrics(rows, EXPERT_RECOMMEND_FUNNEL_STEPS, enterSessions)
  const galleryFunnel = buildFunnelMetrics(rows, GALLERY_STEPS, enterSessions)

  return {
    shortsLandingSessions,
    shortsConsultationSessions,
    shortsConsultationRate:
      shortsLandingSessions > 0 ? shortsConsultationSessions / shortsLandingSessions : 0,
    shortsMoreSitesSessions,
    enterSessions,
    consultationSessions,
    consultationRate: enterSessions > 0 ? consultationSessions / enterSessions : 0,
    caseOpenEvents,
    caseFailEvents,
    shortsLandingFunnel,
    shortsToCatalogFunnel,
    beforeAfterFunnel,
    expertRecommendFunnel,
    galleryFunnel,
    concernMetrics: buildConcernMetrics(rows),
    headerNavMetrics: buildHeaderNavMetrics(rows),
    surfaceMetrics: buildSurfaceMetrics(rows),
    channelMetrics: buildChannelMetrics(rows),
    caseFailMetrics: buildCaseFailMetrics(rows),
  }
}

function buildFunnelMetrics(
  rows: AbmEventRow[],
  steps: readonly { eventName: string; label: string; metadataKey?: string; metadataValue?: string }[],
  enterSessions: number
): FunnelStepMetric[] {
  let previousSessions: number | null = null

  return steps.map((step) => {
    const stepRows = getFunnelStepRows(rows, step)
    const sessions = countUniqueSessions(stepRows, step.eventName)
    const events = countEvents(stepRows, step.eventName)
    const rateFromEnter = enterSessions > 0 ? sessions / enterSessions : null
    const dropFromPrevious =
      previousSessions == null || previousSessions <= 0 ? null : 1 - sessions / previousSessions

    previousSessions = sessions

    return {
      eventName: step.eventName,
      label: step.label,
      sessions,
      events,
      rateFromEnter,
      dropFromPrevious,
    }
  })
}

function getFunnelStepRows(
  rows: AbmEventRow[],
  step: { eventName: string; metadataKey?: string; metadataValue?: string }
): AbmEventRow[] {
  const metadataKey = step.metadataKey
  if (!metadataKey) return rows
  if (step.metadataValue == null) return rows.filter((row) => Boolean(readMetadataString(row.metadata, metadataKey)))
  return rows.filter((row) => readMetadataString(row.metadata, metadataKey) === step.metadataValue)
}

function buildConcernMetrics(rows: AbmEventRow[]): ConcernMetric[] {
  const concerns = new Set<string>()
  for (const row of rows) {
    const concern = readMetadataString(row.metadata, 'concern')
    if (concern) concerns.add(concern)
  }

  return [...concerns]
    .map((concern) => {
      const concernRows = rows.filter((row) => readMetadataString(row.metadata, 'concern') === concern)
      return {
        concern,
        sessions: new Set(concernRows.map((row) => row.session_key)).size,
        concernSelects: countUniqueSessions(concernRows, 'abm_concern_select'),
        baClicks: countUniqueSessions(concernRows, 'abm_ba_story_click'),
        caseOpens: countUniqueSessions(concernRows, 'abm_case_open'),
        consultations: countUniqueSessions(concernRows, 'abm_consultation_click'),
      }
    })
    .sort(
      (a, b) => b.consultations - a.consultations || b.sessions - a.sessions || a.concern.localeCompare(b.concern, 'ko')
    )
}

function buildHeaderNavMetrics(rows: AbmEventRow[]): HeaderNavMetric[] {
  const map = new Map<string, { sessions: Set<string>; events: number }>()

  for (const row of rows) {
    if (row.event_name !== 'abm_header_nav_click') continue
    const target = readMetadataString(row.metadata, 'navTarget') ?? 'unknown'
    const bucket = map.get(target) ?? { sessions: new Set<string>(), events: 0 }
    bucket.sessions.add(row.session_key)
    bucket.events += 1
    map.set(target, bucket)
  }

  return [...map.entries()]
    .map(([target, bucket]) => ({
      target,
      label: HEADER_NAV_LABELS[target] ?? target,
      sessions: bucket.sessions.size,
      events: bucket.events,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.events - a.events)
}

function buildSurfaceMetrics(rows: AbmEventRow[]): SurfaceMetric[] {
  const map = new Map<string, { sessions: Set<string>; events: number }>()

  for (const row of rows) {
    if (row.event_name !== 'abm_consultation_click') continue
    const surface = readMetadataString(row.metadata, 'surface') ?? 'unknown'
    const bucket = map.get(surface) ?? { sessions: new Set<string>(), events: 0 }
    bucket.sessions.add(row.session_key)
    bucket.events += 1
    map.set(surface, bucket)
  }

  return [...map.entries()]
    .map(([surface, bucket]) => ({
      surface,
      label: SURFACE_LABELS[surface as ShowroomAbmConsultationSurface] ?? surface,
      sessions: bucket.sessions.size,
      events: bucket.events,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.events - a.events)
}

function buildChannelMetrics(rows: AbmEventRow[]): ChannelMetric[] {
  const map = new Map<string, { sessions: Set<string>; events: number; consultations: Set<string> }>()

  for (const row of rows) {
    const source = readMetadataString(row.metadata, 'utm_source')
    if (!source) continue

    const medium = readMetadataString(row.metadata, 'utm_medium') ?? '-'
    const campaign = readMetadataString(row.metadata, 'utm_campaign') ?? '-'
    const key = `${source}||${medium}||${campaign}`
    const bucket = map.get(key) ?? { sessions: new Set<string>(), events: 0, consultations: new Set<string>() }
    bucket.sessions.add(row.session_key)
    bucket.events += 1
    if (row.event_name === 'abm_consultation_click') bucket.consultations.add(row.session_key)
    map.set(key, bucket)
  }

  return [...map.entries()]
    .map(([key, bucket]) => {
      const [source, medium, campaign] = key.split('||')
      return {
        source: source ?? '-',
        medium: medium ?? '-',
        campaign: campaign ?? '-',
        sessions: bucket.sessions.size,
        events: bucket.events,
        consultations: bucket.consultations.size,
      }
    })
    .sort((a, b) => b.consultations - a.consultations || b.sessions - a.sessions || b.events - a.events)
}

function buildCaseFailMetrics(rows: AbmEventRow[]): CaseFailMetric[] {
  const map = new Map<string, { sessions: Set<string>; events: number }>()

  for (const row of rows) {
    if (row.event_name !== 'abm_case_open_fail') continue
    const reason = readMetadataString(row.metadata, 'reason') ?? 'unknown'
    const bucket = map.get(reason) ?? { sessions: new Set<string>(), events: 0 }
    bucket.sessions.add(row.session_key)
    bucket.events += 1
    map.set(reason, bucket)
  }

  return [...map.entries()]
    .map(([reason, bucket]) => ({
      reason,
      sessions: bucket.sessions.size,
      events: bucket.events,
    }))
    .sort((a, b) => b.events - a.events)
}

function countUniqueSessions(rows: AbmEventRow[], eventName: string): number {
  const sessions = new Set<string>()
  for (const row of rows) {
    if (row.event_name === eventName) sessions.add(row.session_key)
  }
  return sessions.size
}

function countEvents(rows: AbmEventRow[], eventName: string): number {
  return rows.filter((row) => row.event_name === eventName).length
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function SummaryCard(props: { title: string; value: string; description: string; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{props.title}</p>
        <div className="rounded-full bg-slate-100 p-2 text-slate-700">{props.icon}</div>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.description}</p>
    </div>
  )
}

function FunnelPanel(props: { title: string; description: string; steps: FunnelStepMetric[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{props.description}</p>
      <div className="mt-6 space-y-3">
        {props.steps.map((step) => {
          const dropPercent = step.dropFromPrevious == null ? null : step.dropFromPrevious * 100
          const isHighDrop = dropPercent != null && dropPercent >= 40

          return (
            <div key={step.eventName} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                  <p className="text-xs text-slate-500">{step.eventName}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-900">{formatNumber(step.sessions)} 세션</p>
                  <p className="text-xs text-slate-500">{formatNumber(step.events)} 이벤트</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {step.rateFromEnter != null ? (
                  <span className="text-slate-600">진입 대비 {formatPercent(step.rateFromEnter)}</span>
                ) : null}
                {dropPercent != null ? (
                  <span className={isHighDrop ? 'font-semibold text-rose-600' : 'text-slate-600'}>
                    이전 단계 대비 이탈 {dropPercent.toFixed(1)}%
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SimpleTable(props: {
  title: string
  description: string
  emptyMessage: string
  columns: string[]
  rows: string[][]
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{props.description}</p>

      {props.rows.length === 0 ? (
        props.emptyMessage ? <p className="mt-6 text-sm text-slate-500">{props.emptyMessage}</p> : null
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                {props.columns.map((column) => (
                  <th key={column} className="px-3 py-3 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr key={`${props.title}-${index}`} className="border-b border-slate-100 align-top">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${props.title}-${index}-${cellIndex}`}
                      className={`px-3 py-3 ${cellIndex === 0 ? 'font-medium text-slate-900' : 'text-slate-700'}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatNumber(value: number) {
  return value.toLocaleString('ko-KR')
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}
