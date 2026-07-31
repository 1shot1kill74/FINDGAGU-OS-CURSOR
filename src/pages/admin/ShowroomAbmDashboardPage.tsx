import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { eachDayOfInterval, format, startOfDay, subDays } from 'date-fns'
import { ArrowLeft, MessageCircle, TrendingUp, Users, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import {
  getAbmTrafficFilterLabel,
  getShowroomAbmProductionHostnames,
  matchesShowroomAbmTrafficFilter,
  readAbmEventJobId,
  type ShowroomAbmTrafficFilter,
} from '@/lib/showroomAbmTraffic'
import { stripLeadingSiteNumericCode } from '@/lib/showroomShorts'
import { parseAdInboxShortNameFromGroupKey } from '@/lib/showroomShortsLanding'

const TRAFFIC_FILTER_OPTIONS: { value: ShowroomAbmTrafficFilter; label: string; description: string }[] = [
  { value: 'production', label: '프로덕션만', description: '운영 도메인만 집계' },
  { value: 'exclude_local', label: '로컬 제외', description: 'localhost 제외' },
  { value: 'all', label: '전체', description: '로컬·프리뷰 포함' },
]

const PERIOD_OPTIONS = [
  { value: 7, label: '7일' },
  { value: 15, label: '15일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
] as const

const CHANNEL_LABELS: Record<string, string> = {
  youtube: '유튜브',
  facebook: '페이스북',
  instagram: '인스타그램',
  direct: '다이렉트',
  unknown: 'UTM 없음',
}

const CHANNEL_COLORS: Record<string, string> = {
  youtube: '#e11d48',
  facebook: '#2563eb',
  instagram: '#db2777',
  direct: '#0f766e',
  unknown: '#94a3b8',
}

const CHANNEL_COLOR_FALLBACK = ['#ea580c', '#0891b2', '#4d7c0f', '#b45309', '#334155']
const UNKNOWN_JOB_KEY = '__unknown__'
const ENTER_EVENTS = new Set(['abm_showroom_enter', 'abm_shorts_landing_enter'])

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

type DailyStackDay = {
  date: string
  dateLabel: string
  weekdayLabel: string
  total: number
  segments: { key: string; label: string; color: string; value: number }[]
}

type ChannelTotal = {
  key: string
  label: string
  color: string
  enterSessions: number
  consultationSessions: number
  share: number
}

type VideoRankRow = {
  jobId: string | null
  jobLabel: string
  enterSessions: number
  landingSessions: number
  consultationSessions: number
  channelBreakdown: string
}

type DateChannelVideoRow = {
  date: string
  dateLabel: string
  channelLabel: string
  jobLabel: string
  enterSessions: number
  landingSessions: number
  consultationSessions: number
}

export default function ShowroomAbmDashboardPage() {
  const [periodDays, setPeriodDays] = useState<number>(15)
  const [trafficFilter, setTrafficFilter] = useState<ShowroomAbmTrafficFilter>('production')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AbmEventRow[]>([])
  const [jobLabels, setJobLabels] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setErrorMessage(null)

      try {
        const now = new Date()
        const since = startOfDay(subDays(now, periodDays - 1))
        const until = new Date(now)
        until.setHours(23, 59, 59, 999)

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
          setJobLabels({})
          setErrorMessage(error.message)
          return
        }

        const nextRows = (data ?? []) as AbmEventRow[]
        setRows(nextRows)

        const jobIds = [
          ...new Set(
            nextRows
              .map((row) => readAbmEventJobId(row.metadata))
              .filter((jobId): jobId is string => Boolean(jobId))
          ),
        ]

        if (jobIds.length === 0) {
          setJobLabels({})
          return
        }

        const { data: jobs, error: jobsError } = await supabase
          .from('showroom_shorts_jobs')
          .select('id, before_after_group_key')
          .in('id', jobIds)

        if (cancelled) return
        if (jobsError) {
          setJobLabels({})
          return
        }

        const labels: Record<string, string> = {}
        for (const job of jobs ?? []) {
          const id = String(job.id)
          const shortName = parseAdInboxShortNameFromGroupKey(
            typeof job.before_after_group_key === 'string' ? job.before_after_group_key : null
          )
          const displayName = stripLeadingSiteNumericCode(shortName) || shortName
          labels[id] = displayName || formatJobIdShort(id)
        }
        setJobLabels(labels)
      } catch (error) {
        if (cancelled) return
        setRows([])
        setJobLabels({})
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

  const overview = useMemo(() => buildOverview(filteredRows, periodDays), [filteredRows, periodDays])
  const dailyStack = useMemo(() => buildDailyStackedEnter(filteredRows, periodDays), [filteredRows, periodDays])
  const channelTotals = useMemo(() => buildChannelTotals(filteredRows), [filteredRows])
  const videoRanks = useMemo(() => buildVideoRanks(filteredRows, jobLabels), [filteredRows, jobLabels])
  const detailRows = useMemo(
    () => buildDateChannelVideoRows(filteredRows, jobLabels),
    [filteredRows, jobLabels]
  )
  const productionHostnames = useMemo(() => getShowroomAbmProductionHostnames(), [])
  const maxDailyTotal = Math.max(1, ...dailyStack.map((day) => day.total))
  const hovered = dailyStack.find((day) => day.date === hoveredDay) ?? null

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_40%,#eef2ff00_100%)] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              대시보드
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">쇼룸 유입</h1>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              하루에 몇 명이 왔는지, 어느 채널·영상에서 왔는지. 광고 후보를 고르는 화면입니다.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={periodDays === option.value ? 'default' : 'outline'}
                  className="h-8 rounded-full px-3"
                  onClick={() => setPeriodDays(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TRAFFIC_FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={trafficFilter === option.value ? 'default' : 'ghost'}
                  className="h-8 rounded-full px-3 text-slate-600"
                  onClick={() => setTrafficFilter(option.value)}
                  title={option.description}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : errorMessage ? (
          <p className="text-sm text-rose-600">{errorMessage}</p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="총 진입"
                value={formatNumber(overview.enterSessions)}
                hint={`${getAbmTrafficFilterLabel(trafficFilter)} · ${periodDays}일`}
                icon={<Users className="h-4 w-4" />}
              />
              <Kpi
                label="일평균"
                value={overview.dailyAvg.toFixed(1)}
                hint="진입 세션 / 일수"
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <Kpi
                label="상담"
                value={formatNumber(overview.consultationSessions)}
                hint={
                  overview.enterSessions > 0
                    ? `전환 ${formatPercent(overview.consultationSessions / overview.enterSessions)}`
                    : '전환 —'
                }
                icon={<MessageCircle className="h-4 w-4" />}
              />
              <Kpi
                label="영상 추적"
                value={`${formatNumber(overview.knownVideoShare * 100)}%`}
                hint={
                  overview.enterSessions > 0
                    ? `진입 ${formatNumber(overview.knownVideoEnter)} / ${formatNumber(overview.enterSessions)}`
                    : 'jobId 있는 유입'
                }
                icon={<Video className="h-4 w-4" />}
              />
            </section>

            <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">일자별 진입</h2>
                  <p className="mt-1 text-sm text-slate-500">막대 높이 = 그날 총 방문 · 색 = 채널</p>
                </div>
                {hovered ? (
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-900">
                      {hovered.dateLabel} · {formatNumber(hovered.total)}명
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {hovered.segments
                        .filter((segment) => segment.value > 0)
                        .map((segment) => (
                          <span key={segment.key}>
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />{' '}
                            {segment.label} {segment.value}
                          </span>
                        ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">막대에 마우스를 올리면 채널 분해</p>
                )}
              </div>

              {dailyStack.every((day) => day.total === 0) ? (
                <p className="mt-8 text-sm text-slate-500">이 기간·필터에 진입이 없습니다.</p>
              ) : (
                <>
                  <div className="mt-6 flex h-56 items-end gap-1.5 sm:gap-2">
                    {dailyStack.map((day) => {
                      const heightPct = (day.total / maxDailyTotal) * 100
                      const active = hoveredDay === day.date
                      return (
                        <button
                          key={day.date}
                          type="button"
                          className="group flex min-w-0 flex-1 flex-col items-center gap-2"
                          onMouseEnter={() => setHoveredDay(day.date)}
                          onMouseLeave={() => setHoveredDay(null)}
                          onFocus={() => setHoveredDay(day.date)}
                          onBlur={() => setHoveredDay(null)}
                          aria-label={`${day.dateLabel} 진입 ${day.total}`}
                        >
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${day.total > 0 ? 'text-slate-700' : 'text-slate-300'}`}
                          >
                            {day.total > 0 ? day.total : ''}
                          </span>
                          <div className="relative flex h-40 w-full max-w-[44px] items-end justify-center">
                            <div
                              className={`flex w-full flex-col-reverse overflow-hidden rounded-t-md transition ${
                                active ? 'ring-2 ring-slate-900/10' : ''
                              } ${day.total === 0 ? 'bg-slate-100' : ''}`}
                              style={{ height: day.total === 0 ? '4px' : `${Math.max(heightPct, 8)}%` }}
                            >
                              {day.segments
                                .filter((segment) => segment.value > 0)
                                .map((segment) => (
                                  <div
                                    key={segment.key}
                                    title={`${segment.label}: ${segment.value}`}
                                    style={{
                                      backgroundColor: segment.color,
                                      height: `${(segment.value / day.total) * 100}%`,
                                      minHeight: segment.value > 0 ? 3 : 0,
                                    }}
                                  />
                                ))}
                            </div>
                          </div>
                          <div className="text-center leading-tight">
                            <p className={`text-[11px] font-medium ${active ? 'text-slate-900' : 'text-slate-500'}`}>
                              {day.dateLabel}
                            </p>
                            <p className="text-[10px] text-slate-400">{day.weekdayLabel}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                    {channelTotals.map((channel) => (
                      <div key={channel.key} className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: channel.color }} />
                        {channel.label}
                        <span className="font-semibold text-slate-800">{formatNumber(channel.enterSessions)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">채널 비중</h2>
                <p className="mt-1 text-sm text-slate-500">기간 합계 · 어디서 많이 오나</p>
                <div className="mt-5 space-y-3">
                  {channelTotals.length === 0 ? (
                    <p className="text-sm text-slate-500">채널 데이터 없음</p>
                  ) : (
                    channelTotals.map((channel) => (
                      <div key={channel.key}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800">{channel.label}</span>
                          <span className="tabular-nums text-slate-600">
                            {formatNumber(channel.enterSessions)}
                            <span className="ml-2 text-xs text-slate-400">{formatPercent(channel.share)}</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.max(channel.share * 100, channel.enterSessions > 0 ? 4 : 0)}%`,
                              backgroundColor: channel.color,
                            }}
                          />
                        </div>
                        {channel.consultationSessions > 0 ? (
                          <p className="mt-1 text-[11px] text-slate-400">상담 {formatNumber(channel.consultationSessions)}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">영상 순위</h2>
                <p className="mt-1 text-sm text-slate-500">광고 태울 후보 · 진입·상담 많은 순</p>
                {videoRanks.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-500">집계할 진입이 없습니다.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                          <th className="pb-2 pr-3 font-medium">#</th>
                          <th className="pb-2 pr-3 font-medium">영상</th>
                          <th className="pb-2 pr-3 font-medium">채널</th>
                          <th className="pb-2 pr-3 text-right font-medium">진입</th>
                          <th className="pb-2 text-right font-medium">상담</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videoRanks.slice(0, 8).map((row, index) => (
                          <tr key={row.jobId ?? UNKNOWN_JOB_KEY} className="border-b border-slate-50">
                            <td className="py-2.5 pr-3 tabular-nums text-slate-400">{index + 1}</td>
                            <td className="py-2.5 pr-3 font-medium text-slate-900">
                              {row.jobLabel}
                              {row.landingSessions > 0 ? (
                                <span className="ml-2 text-[11px] font-normal text-teal-700">랜딩 {row.landingSessions}</span>
                              ) : null}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-slate-500">{row.channelBreakdown}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-slate-800">
                              {formatNumber(row.enterSessions)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-slate-700">
                              {formatNumber(row.consultationSessions)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {videoRanks.some((row) => row.jobId == null) ? (
                  <p className="mt-3 text-[11px] leading-5 text-slate-400">
                    「영상 미상」은 `/r/채널/jobId` 없이 들어온 유입입니다. 프로필·옛 링크·테스트가 섞일 수 있습니다.
                  </p>
                ) : null}
              </div>
            </section>

            <details className="rounded-3xl border border-slate-200/80 bg-white/70 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                날짜 × 채널 × 영상 상세
              </summary>
              <p className="mt-2 text-xs text-slate-500">일자별로 채널·영상 조합을 펼쳐 볼 때</p>
              {detailRows.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">상세 행 없음</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                        <th className="px-2 py-2 font-medium">날짜</th>
                        <th className="px-2 py-2 font-medium">채널</th>
                        <th className="px-2 py-2 font-medium">영상</th>
                        <th className="px-2 py-2 text-right font-medium">진입</th>
                        <th className="px-2 py-2 text-right font-medium">랜딩</th>
                        <th className="px-2 py-2 text-right font-medium">상담</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((row) => (
                        <tr
                          key={`${row.date}-${row.channelLabel}-${row.jobLabel}`}
                          className="border-b border-slate-50 text-slate-700"
                        >
                          <td className="px-2 py-2">{row.dateLabel}</td>
                          <td className="px-2 py-2">{row.channelLabel}</td>
                          <td className="px-2 py-2 font-medium text-slate-900">{row.jobLabel}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.enterSessions)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.landingSessions)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.consultationSessions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>

            <p className="text-center text-[11px] text-slate-400">
              진입 = 쇼룸·숏츠 랜딩 고유 세션 · 호스트 {productionHostnames.slice(0, 2).join(', ')}
              {rows.length !== filteredRows.length
                ? ` · 필터로 ${formatNumber(rows.length - filteredRows.length)}건 제외`
                : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi(props: { label: string; value: string; hint: string; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{props.label}</p>
        <div className="rounded-full bg-slate-100 p-1.5 text-slate-600">{props.icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.hint}</p>
    </div>
  )
}

function buildOverview(rows: AbmEventRow[], periodDays: number) {
  const enterSessions = countEnterSessions(rows)
  const consultationSessions = countUniqueSessions(rows, 'abm_consultation_click')
  const knownVideoEnter = countEnterSessions(rows.filter((row) => readAbmEventJobId(row.metadata)))
  return {
    enterSessions,
    consultationSessions,
    dailyAvg: periodDays > 0 ? enterSessions / periodDays : 0,
    knownVideoEnter,
    knownVideoShare: enterSessions > 0 ? knownVideoEnter / enterSessions : 0,
  }
}

function buildDailyStackedEnter(rows: AbmEventRow[], periodDays: number): DailyStackDay[] {
  const dates = getPeriodDateKeys(periodDays)
  const buckets = new Map<string, Map<string, Set<string>>>()

  for (const date of dates) buckets.set(date, new Map())

  for (const row of rows) {
    if (!ENTER_EVENTS.has(row.event_name)) continue
    const date = toLocalDateKey(row.created_at)
    const dayBucket = buckets.get(date)
    if (!dayBucket) continue
    const channel = resolveChannelKey(row.metadata)
    const set = dayBucket.get(channel) ?? new Set<string>()
    set.add(row.session_key)
    dayBucket.set(channel, set)
  }

  const channelOrder = rankChannels(
    [...buckets.values()].flatMap((day) =>
      [...day.entries()].map(([key, set]) => [key, set.size] as const)
    )
  )

  return dates.map((date) => {
    const dayBucket = buckets.get(date) ?? new Map()
    const segments = channelOrder.map((key, index) => ({
      key,
      label: resolveChannelLabel(key),
      color: resolveChannelColor(key, index),
      value: dayBucket.get(key)?.size ?? 0,
    }))
    const total = segments.reduce((sum, segment) => sum + segment.value, 0)
    const dateObj = new Date(`${date}T00:00:00`)
    return {
      date,
      dateLabel: format(dateObj, 'M/d'),
      weekdayLabel: format(dateObj, 'EEE'),
      total,
      segments,
    }
  })
}

function buildChannelTotals(rows: AbmEventRow[]): ChannelTotal[] {
  const enter = new Map<string, Set<string>>()
  const consult = new Map<string, Set<string>>()

  for (const row of rows) {
    const channel = resolveChannelKey(row.metadata)
    if (ENTER_EVENTS.has(row.event_name)) {
      const set = enter.get(channel) ?? new Set<string>()
      set.add(row.session_key)
      enter.set(channel, set)
    }
    if (row.event_name === 'abm_consultation_click') {
      const set = consult.get(channel) ?? new Set<string>()
      set.add(row.session_key)
      consult.set(channel, set)
    }
  }

  const totalEnter = [...enter.values()].reduce((sum, set) => sum + set.size, 0)
  const keys = rankChannels([...enter.entries()].map(([key, set]) => [key, set.size] as const))

  return keys.map((key, index) => {
    const enterSessions = enter.get(key)?.size ?? 0
    return {
      key,
      label: resolveChannelLabel(key),
      color: resolveChannelColor(key, index),
      enterSessions,
      consultationSessions: consult.get(key)?.size ?? 0,
      share: totalEnter > 0 ? enterSessions / totalEnter : 0,
    }
  })
}

function buildVideoRanks(rows: AbmEventRow[], jobLabels: Record<string, string>): VideoRankRow[] {
  const map = new Map<
    string,
    {
      jobId: string | null
      enter: Set<string>
      landing: Set<string>
      consultation: Set<string>
      channels: Map<string, number>
    }
  >()

  for (const row of rows) {
    const isEnter = ENTER_EVENTS.has(row.event_name)
    const isLanding = row.event_name === 'abm_shorts_landing_enter'
    const isConsultation = row.event_name === 'abm_consultation_click'
    if (!isEnter && !isLanding && !isConsultation) continue

    const jobId = readAbmEventJobId(row.metadata)
    const key = jobId ?? UNKNOWN_JOB_KEY
    const bucket = map.get(key) ?? {
      jobId,
      enter: new Set<string>(),
      landing: new Set<string>(),
      consultation: new Set<string>(),
      channels: new Map<string, number>(),
    }

    if (isEnter) {
      bucket.enter.add(row.session_key)
      const channel = resolveChannelKey(row.metadata)
      bucket.channels.set(channel, (bucket.channels.get(channel) ?? 0) + 1)
    }
    if (isLanding) bucket.landing.add(row.session_key)
    if (isConsultation) bucket.consultation.add(row.session_key)
    map.set(key, bucket)
  }

  return [...map.values()]
    .map((bucket) => {
      const topChannels = [...bucket.channels.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([channel]) => resolveChannelLabel(channel))
      return {
        jobId: bucket.jobId,
        jobLabel: bucket.jobId ? jobLabels[bucket.jobId] || formatJobIdShort(bucket.jobId) : '영상 미상',
        enterSessions: bucket.enter.size,
        landingSessions: bucket.landing.size,
        consultationSessions: bucket.consultation.size,
        channelBreakdown: topChannels.join(' · ') || '—',
      }
    })
    .sort(
      (a, b) =>
        b.enterSessions - a.enterSessions ||
        b.consultationSessions - a.consultationSessions ||
        a.jobLabel.localeCompare(b.jobLabel, 'ko')
    )
}

function buildDateChannelVideoRows(
  rows: AbmEventRow[],
  jobLabels: Record<string, string>
): DateChannelVideoRow[] {
  const map = new Map<
    string,
    {
      date: string
      channelKey: string
      jobId: string | null
      enter: Set<string>
      landing: Set<string>
      consultation: Set<string>
    }
  >()

  for (const row of rows) {
    const isEnter = ENTER_EVENTS.has(row.event_name)
    const isLanding = row.event_name === 'abm_shorts_landing_enter'
    const isConsultation = row.event_name === 'abm_consultation_click'
    if (!isEnter && !isLanding && !isConsultation) continue

    const date = toLocalDateKey(row.created_at)
    const channelKey = resolveChannelKey(row.metadata)
    const jobId = readAbmEventJobId(row.metadata)
    const key = `${date}||${channelKey}||${jobId ?? UNKNOWN_JOB_KEY}`
    const bucket = map.get(key) ?? {
      date,
      channelKey,
      jobId,
      enter: new Set<string>(),
      landing: new Set<string>(),
      consultation: new Set<string>(),
    }
    if (isEnter) bucket.enter.add(row.session_key)
    if (isLanding) bucket.landing.add(row.session_key)
    if (isConsultation) bucket.consultation.add(row.session_key)
    map.set(key, bucket)
  }

  return [...map.values()]
    .map((bucket) => ({
      date: bucket.date,
      dateLabel: format(new Date(`${bucket.date}T00:00:00`), 'M/d'),
      channelLabel: resolveChannelLabel(bucket.channelKey),
      jobLabel: bucket.jobId ? jobLabels[bucket.jobId] || formatJobIdShort(bucket.jobId) : '영상 미상',
      enterSessions: bucket.enter.size,
      landingSessions: bucket.landing.size,
      consultationSessions: bucket.consultation.size,
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.enterSessions - a.enterSessions ||
        a.channelLabel.localeCompare(b.channelLabel, 'ko')
    )
}

function countEnterSessions(rows: AbmEventRow[]): number {
  const sessions = new Set<string>()
  for (const row of rows) {
    if (ENTER_EVENTS.has(row.event_name)) sessions.add(row.session_key)
  }
  return sessions.size
}

function countUniqueSessions(rows: AbmEventRow[], eventName: string): number {
  const sessions = new Set<string>()
  for (const row of rows) {
    if (row.event_name === eventName) sessions.add(row.session_key)
  }
  return sessions.size
}

function getPeriodDateKeys(periodDays: number): string[] {
  const end = startOfDay(new Date())
  const start = startOfDay(subDays(end, periodDays - 1))
  return eachDayOfInterval({ start, end }).map((date) => format(date, 'yyyy-MM-dd'))
}

function toLocalDateKey(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd')
}

function resolveChannelKey(metadata: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== 'object') return 'unknown'
  const value = metadata.utm_source
  if (typeof value !== 'string' || !value.trim()) return 'unknown'
  return value.trim().toLowerCase()
}

function resolveChannelLabel(key: string): string {
  return CHANNEL_LABELS[key] ?? key
}

function resolveChannelColor(key: string, index: number): string {
  return CHANNEL_COLORS[key] ?? CHANNEL_COLOR_FALLBACK[index % CHANNEL_COLOR_FALLBACK.length] ?? '#64748b'
}

function rankChannels(pairs: ReadonlyArray<readonly [string, number]>): string[] {
  const totals = new Map<string, number>()
  for (const [key, value] of pairs) {
    totals.set(key, (totals.get(key) ?? 0) + value)
  }
  const preferred = ['youtube', 'facebook', 'instagram', 'direct', 'unknown']
  return [...totals.keys()].sort((a, b) => {
    const diff = (totals.get(b) ?? 0) - (totals.get(a) ?? 0)
    if (diff !== 0) return diff
    return preferred.indexOf(a) - preferred.indexOf(b) || a.localeCompare(b)
  })
}

function formatJobIdShort(jobId: string): string {
  return jobId.slice(0, 8)
}

function formatNumber(value: number) {
  return value.toLocaleString('ko-KR')
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`
}
