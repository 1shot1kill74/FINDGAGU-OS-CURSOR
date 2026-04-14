import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, ExternalLink, Repeat, Target, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getExternalDisplayNameFromImageAssetMeta } from '@/lib/imageAssetService'
import { supabase } from '@/lib/supabase'
import {
  buildTrackedShowroomUrl,
  type ShowroomCtaType,
  type ShowroomCtaVisitRow,
} from '@/lib/showroomCtaTracking'
import { broadenPublicDisplayName } from '@/lib/showroomShareService'

const PERIOD_OPTIONS = [
  { value: 0, label: '오늘' },
  { value: 7, label: '최근 7일' },
  { value: 15, label: '최근 15일' },
  { value: 30, label: '최근 30일' },
  { value: 90, label: '최근 90일' },
] as const

const CTA_LABELS: Record<ShowroomCtaType, string> = {
  yt_comment: '유튜브 첫댓글',
  yt_profile: '유튜브 프로필',
  fb_caption: '페이스북 캡션',
  fb_profile: '페이스북 프로필',
  ig_caption: '인스타 캡션',
  ig_profile: '인스타 프로필',
}

const CHANNEL_LABELS: Record<string, string> = {
  youtube: '유튜브',
  facebook: '페이스북',
  instagram: '인스타그램',
}

type GroupMetric = {
  key: string
  label: string
  totalVisits: number
  uniqueVisitors: number
  returningVisitors: number
  revisitRate: number
}

type JobMetric = {
  jobId: string
  label: string
  totalVisits: number
  uniqueVisitors: number
  returningVisitors: number
  revisitRate: number
  lastVisitedAt: string | null
}

export default function ShowroomAdsDashboardPage() {
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ShowroomCtaVisitRow[]>([])
  const [jobLabels, setJobLabels] = useState<Record<string, string>>({})
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
          .from('showroom_cta_visits')
          .select('*')
          .gte('created_at', since.toISOString())
          .lte('created_at', until.toISOString())
          .order('created_at', { ascending: false })

        if (cancelled) return

        if (error) {
          setRows([])
          setJobLabels({})
          setErrorMessage(error.message)
          return
        }

        const nextRows = data ?? []
        setRows(nextRows)

        const youtubeJobIds = Array.from(
          new Set(
            nextRows
              .filter((row) => row.channel === 'youtube' && row.cta === 'yt_comment')
              .map((row) => row.content_job_id?.trim() || '')
              .filter(Boolean)
          )
        )

        if (youtubeJobIds.length === 0) {
          setJobLabels({})
          return
        }

        try {
          const { data: jobs, error: jobsError } = await supabase
            .from('showroom_shorts_jobs')
            .select('id, before_asset_id, after_asset_id')
            .in('id', youtubeJobIds)

          if (cancelled) return
          if (jobsError) throw jobsError

          const assetIds = Array.from(
            new Set(
              (jobs ?? [])
                .flatMap((job) => [
                  typeof job.before_asset_id === 'string' ? job.before_asset_id : '',
                  typeof job.after_asset_id === 'string' ? job.after_asset_id : '',
                ])
                .filter(Boolean)
            )
          )

          const assetById = new Map<string, { site_name: string | null; metadata: unknown }>()
          if (assetIds.length > 0) {
            const { data: assets, error: assetsError } = await supabase
              .from('image_assets')
              .select('id, site_name, metadata')
              .in('id', assetIds)

            if (cancelled) return
            if (assetsError) throw assetsError

            for (const asset of assets ?? []) {
              assetById.set(String(asset.id), {
                site_name: typeof asset.site_name === 'string' ? asset.site_name : null,
                metadata: asset.metadata,
              })
            }
          }

          const labels = Object.fromEntries(
            (jobs ?? []).map((job) => {
              const beforeAsset = assetById.get(String(job.before_asset_id ?? ''))
              const afterAsset = assetById.get(String(job.after_asset_id ?? ''))
              const label =
                getExternalDisplayNameFromImageAssetMeta(afterAsset?.metadata) ||
                getExternalDisplayNameFromImageAssetMeta(beforeAsset?.metadata) ||
                broadenPublicDisplayName(afterAsset?.site_name ?? null) ||
                broadenPublicDisplayName(beforeAsset?.site_name ?? null) ||
                afterAsset?.site_name ||
                beforeAsset?.site_name ||
                String(job.id)

              return [String(job.id), label]
            })
          )

          setJobLabels(labels)
        } catch {
          // Do not block the dashboard if label enrichment fails.
          setJobLabels({})
        }
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

  const summary = useMemo(() => {
    const visitorCounts = countByVisitor(rows)
    const uniqueVisitors = visitorCounts.size
    const returningVisitors = [...visitorCounts.values()].filter((count) => count > 1).length
    const totalVisits = rows.length

    return {
      totalVisits,
      uniqueVisitors,
      returningVisitors,
      revisitRate: uniqueVisitors > 0 ? returningVisitors / uniqueVisitors : 0,
    }
  }, [rows])

  const channelMetrics = useMemo(
    () =>
      buildGroupedMetrics(rows, (row) => ({
        key: row.channel,
        label: CHANNEL_LABELS[row.channel] ?? row.channel,
      })).sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || b.returningVisitors - a.returningVisitors),
    [rows]
  )

  const ctaMetrics = useMemo(
    () =>
      buildGroupedMetrics(rows, (row) => ({
        key: row.cta,
        label: CTA_LABELS[row.cta as ShowroomCtaType] ?? row.cta,
      })).sort((a, b) => b.returningVisitors - a.returningVisitors || b.uniqueVisitors - a.uniqueVisitors),
    [rows]
  )

  const jobMetrics = useMemo<JobMetric[]>(() => {
    const map = new Map<string, ShowroomCtaVisitRow[]>()
    for (const row of rows) {
      if (row.channel !== 'youtube' || row.cta !== 'yt_comment') continue
      const jobId = row.content_job_id?.trim()
      if (!jobId) continue
      const bucket = map.get(jobId) ?? []
      bucket.push(row)
      map.set(jobId, bucket)
    }

    return [...map.entries()]
      .map(([jobId, bucket]) => {
        const visitorCounts = countByVisitor(bucket)
        const uniqueVisitors = visitorCounts.size
        const returningVisitors = [...visitorCounts.values()].filter((count) => count > 1).length

        return {
          jobId,
          label: jobLabels[jobId] ?? jobId,
          totalVisits: bucket.length,
          uniqueVisitors,
          returningVisitors,
          revisitRate: uniqueVisitors > 0 ? returningVisitors / uniqueVisitors : 0,
          lastVisitedAt: bucket[0]?.created_at ?? null,
        }
      })
      .sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || b.returningVisitors - a.returningVisitors || b.totalVisits - a.totalVisits)
  }, [jobLabels, rows])

  const sampleLinks = useMemo(
    () => [
      {
        label: '유튜브 첫댓글',
        url: buildTrackedShowroomUrl({
          channel: 'youtube',
          cta: 'yt_comment',
          jobId: 'JOB_ID',
          source: 'showroom_shorts',
        }),
      },
      {
        label: '페이스북 프로필',
        url: buildTrackedShowroomUrl({
          channel: 'facebook',
          cta: 'fb_profile',
          jobId: 'JOB_ID',
          source: 'showroom_shorts',
        }),
      },
      {
        label: '인스타 캡션',
        url: buildTrackedShowroomUrl({
          channel: 'instagram',
          cta: 'ig_caption',
          jobId: 'JOB_ID',
          source: 'showroom_shorts',
        }),
      },
    ],
    []
  )

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link to="/showroom" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              내부 쇼룸으로 돌아가기
            </Link>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-slate-900" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">쇼룸 광고 대시보드</h1>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              1차는 채널별로 얼마나 유입되는지와 지금 관심 고객이 얼마나 있는지 보고, 2차는 유튜브 첫댓글 CTA 기준으로 어떤 콘텐츠
              `jobId`가 반응을 만들었는지 확인하는 구조입니다.
            </p>
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

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="실제 방문자 수" value={formatNumber(summary.uniqueVisitors)} description="선택 기간 내 고유 visitor_key" icon={<Users className="h-4 w-4" />} />
          <SummaryCard title="관심 방문자 수" value={formatNumber(summary.returningVisitors)} description="선택 기간 내 2회 이상 방문" icon={<Repeat className="h-4 w-4" />} />
          <SummaryCard title="재방문 비율" value={formatPercent(summary.revisitRate)} description="지금 관심도 신호" icon={<Target className="h-4 w-4" />} />
          <SummaryCard title="총 방문 수" value={formatNumber(summary.totalVisits)} description="채널 유입 규모 참고용" icon={<ExternalLink className="h-4 w-4" />} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <MetricTable
            title="1차 진단: 채널별 유입"
            description="어느 채널이 실제 방문자와 관심 방문자를 만들고 있는지 먼저 본다."
            rows={channelMetrics}
            emptyMessage="아직 채널 유입 데이터가 없습니다."
          />

          <MetricTable
            title="1차 참고: CTA 위치별 반응"
            description="기본 해석은 채널 합산으로 보고, CTA 위치 차이는 참고 지표로만 확인한다."
            rows={ctaMetrics}
            emptyMessage="아직 CTA 유입 데이터가 없습니다."
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">2차 진단: 유튜브 콘텐츠 반응</h2>
              <p className="text-sm leading-6 text-slate-600">
                콘텐츠별 반응은 유튜브 첫댓글 CTA(`yt_comment`)에 `jobId`가 붙은 데이터만 사용합니다.
              </p>
            </div>
            <p className="text-xs text-slate-500">페이스북/인스타그램은 채널 반응용으로 1차 지표에만 반영합니다.</p>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">데이터를 불러오는 중입니다...</p>
          ) : errorMessage ? (
            <p className="mt-6 text-sm text-rose-600">{errorMessage}</p>
          ) : jobMetrics.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">아직 유튜브 첫댓글 CTA 기준으로 누적된 `jobId` 유입 데이터가 없습니다.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">jobId</th>
                    <th className="px-3 py-3 font-medium">실제 방문자</th>
                    <th className="px-3 py-3 font-medium">관심 방문자</th>
                    <th className="px-3 py-3 font-medium">재방문 비율</th>
                    <th className="px-3 py-3 font-medium">총 방문</th>
                    <th className="px-3 py-3 font-medium">최근 유입</th>
                  </tr>
                </thead>
                <tbody>
                  {jobMetrics.map((row) => (
                    <tr key={row.jobId} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">{row.jobId}</td>
                      <td className="px-3 py-3 text-slate-900">{formatNumber(row.uniqueVisitors)}</td>
                      <td className="px-3 py-3 text-slate-900">{formatNumber(row.returningVisitors)}</td>
                      <td className="px-3 py-3 text-slate-900">{formatPercent(row.revisitRate)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatNumber(row.totalVisits)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(row.lastVisitedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">운영 규칙</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>1. 기본 해석은 채널 합산입니다. 페이스북/인스타그램의 프로필 CTA와 캡션 CTA는 채널 반응 데이터로 봅니다.</p>
              <p>2. 콘텐츠별 반응은 유튜브 첫댓글 CTA(`yt_comment`)에 `jobId`가 붙은 데이터만 사용합니다.</p>
              <p>3. `visitor_key`는 브라우저 기준이라 개인정보를 직접 저장하지 않고도 실제 방문자 수와 관심 방문자 수를 볼 수 있습니다.</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">추적 링크 예시</h2>
            <div className="mt-4 space-y-3">
              {sampleLinks.map((sample) => (
                <div key={sample.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{sample.label}</p>
                  <p className="mt-1 break-all font-mono text-xs leading-5 text-slate-600">{sample.url}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
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

function MetricTable(props: {
  title: string
  description: string
  rows: GroupMetric[]
  emptyMessage: string
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{props.description}</p>

      {props.rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{props.emptyMessage}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">항목</th>
                <th className="px-3 py-3 font-medium">실제 방문자</th>
                <th className="px-3 py-3 font-medium">관심 방문자</th>
                <th className="px-3 py-3 font-medium">재방문 비율</th>
                <th className="px-3 py-3 font-medium">총 방문</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-900">{row.label}</td>
                  <td className="px-3 py-3 text-slate-700">{formatNumber(row.uniqueVisitors)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatNumber(row.returningVisitors)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatPercent(row.revisitRate)}</td>
                  <td className="px-3 py-3 text-slate-700">{formatNumber(row.totalVisits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function buildGroupedMetrics(
  rows: ShowroomCtaVisitRow[],
  getGroup: (row: ShowroomCtaVisitRow) => { key: string; label: string }
): GroupMetric[] {
  const grouped = new Map<string, { label: string; rows: ShowroomCtaVisitRow[] }>()

  for (const row of rows) {
    const group = getGroup(row)
    const existing = grouped.get(group.key)
    if (existing) {
      existing.rows.push(row)
    } else {
      grouped.set(group.key, { label: group.label, rows: [row] })
    }
  }

  return [...grouped.entries()].map(([key, group]) => {
    const visitorCounts = countByVisitor(group.rows)
    const uniqueVisitors = visitorCounts.size
    const returningVisitors = [...visitorCounts.values()].filter((count) => count > 1).length

    return {
      key,
      label: group.label,
      totalVisits: group.rows.length,
      uniqueVisitors,
      returningVisitors,
      revisitRate: uniqueVisitors > 0 ? returningVisitors / uniqueVisitors : 0,
    }
  })
}

function countByVisitor(rows: ShowroomCtaVisitRow[]) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const current = map.get(row.visitor_key) ?? 0
    map.set(row.visitor_key, current + 1)
  }
  return map
}

function formatNumber(value: number) {
  return value.toLocaleString('ko-KR')
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return '-'
  return parsed.toLocaleString('ko-KR')
}
