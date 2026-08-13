import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchYoutubeAnalyticsReport,
  fetchYoutubeAnalyticsStatus,
  startYoutubeAnalyticsOAuth,
  syncYoutubeAnalytics,
  type YoutubeAnalyticsStatus,
  type YoutubeShortsAnalyticsRow,
} from '@/lib/youtubeAnalyticsService'
import { toast } from 'sonner'

export type YoutubeAnalyticsReturnTo = '/admin/ad-inbox' | '/admin/showroom-shorts'

type YoutubeAnalyticsPanelProps = {
  returnTo?: YoutubeAnalyticsReturnTo
  /** 표 행 수 (기본 15) */
  reportLimit?: number
  className?: string
  /** 동기화 성공 후 호출 (카드별 지표 갱신용) */
  onSynced?: () => void
}

function formatDateTime(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ko-KR')
}

function formatUploadDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

export default function YoutubeAnalyticsPanel({
  returnTo = '/admin/ad-inbox',
  reportLimit = 15,
  className,
  onSynced,
}: YoutubeAnalyticsPanelProps) {
  const [ytStatus, setYtStatus] = useState<YoutubeAnalyticsStatus | null>(null)
  const [ytRows, setYtRows] = useState<YoutubeShortsAnalyticsRow[]>([])
  const [ytLoading, setYtLoading] = useState(false)
  const [ytActing, setYtActing] = useState(false)

  const loadYtAnalytics = async () => {
    setYtLoading(true)
    try {
      const status = await fetchYoutubeAnalyticsStatus()
      setYtStatus(status)
      if (status.connected || status.status === 'needs_reconnect') {
        const report = await fetchYoutubeAnalyticsReport(reportLimit)
        const rows = [...(report.rows ?? [])].sort((a, b) => {
          const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
          const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
          if (bTime !== aTime) return bTime - aTime
          return (Number(b.lifetime_views) || 0) - (Number(a.lifetime_views) || 0)
        })
        setYtRows(rows)
      } else {
        setYtRows([])
      }
    } catch (error) {
      setYtStatus(null)
      setYtRows([])
      console.warn('[youtube-analytics]', error)
    } finally {
      setYtLoading(false)
    }
  }

  useEffect(() => {
    void loadYtAnalytics()
  }, [reportLimit])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('yt_analytics')
    if (!flag) return
    if (flag === 'connected') {
      toast.success('유튜브 애널리틱스가 연결되었습니다.')
      void loadYtAnalytics()
    } else if (flag === 'error') {
      toast.error(params.get('message') || '유튜브 애널리틱스 연결에 실패했습니다.')
    }
    params.delete('yt_analytics')
    params.delete('message')
    const next = params.toString()
    const url = `${window.location.pathname}${next ? `?${next}` : ''}`
    window.history.replaceState({}, '', url)
  }, [])

  const handleYtConnect = async () => {
    setYtActing(true)
    try {
      const url = await startYoutubeAnalyticsOAuth({ returnTo })
      window.location.href = url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'OAuth 시작 실패')
      setYtActing(false)
    }
  }

  const handleYtSync = async () => {
    setYtActing(true)
    try {
      const result = await syncYoutubeAnalytics(90)
      toast.success(`${result.synced ?? 0}개 쇼츠 지표를 동기화했습니다.`)
      await loadYtAnalytics()
      onSynced?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '동기화 실패')
    } finally {
      setYtActing(false)
    }
  }

  return (
    <div className={className ?? 'rounded-lg border border-border bg-card p-4 space-y-3'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">유튜브 애널리틱스</p>
          <p className="text-xs text-muted-foreground">
            3달은 최근 90일, 평생은 업로드 이후 누적입니다. 시청함 vs 넘김은 Studio 전용 —
            API는 engagedViews/views·평균시청%로 훅·이탈을 봅니다.
          </p>
          {ytLoading ? (
            <p className="text-xs text-muted-foreground">상태 확인 중…</p>
          ) : ytStatus?.connected ? (
            <p className="text-xs text-muted-foreground">
              연결됨 · {ytStatus.channelTitle || ytStatus.channelId}
              {ytStatus.lastSyncAt ? ` · 동기화 ${formatDateTime(ytStatus.lastSyncAt)}` : ''}
            </p>
          ) : ytStatus?.status === 'needs_reconnect' ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              재연결 필요{ytStatus.lastSyncError ? ` · ${ytStatus.lastSyncError}` : ''}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">미연결 · docs/YOUTUBE_ANALYTICS_OAUTH_SETUP.md</p>
          )}
          {ytStatus?.lastSyncError && ytStatus.connected ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              최근 동기화 오류: {ytStatus.lastSyncError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!ytStatus?.connected || ytStatus.status === 'needs_reconnect' ? (
            <Button type="button" size="sm" onClick={() => void handleYtConnect()} disabled={ytActing}>
              {ytActing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              유튜브 애널리틱스 연결
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleYtConnect()}
              disabled={ytActing}
            >
              다시 연결
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleYtSync()}
            disabled={ytActing || !ytStatus?.connected}
          >
            {ytActing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            지표 동기화
          </Button>
        </div>
      </div>

      {ytRows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">영상</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">업로드</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap" title="YouTube Analytics 최근 90일">
                  3달
                </th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap" title="업로드 이후 누적 조회">
                  평생
                </th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap" title="3달 조회 / 평생 조회">
                  3달 비중
                </th>
                <th className="px-3 py-2 font-medium text-right">Engaged</th>
                <th className="px-3 py-2 font-medium text-right">Engaged%</th>
                <th className="px-3 py-2 font-medium text-right">평균시청%</th>
              </tr>
            </thead>
            <tbody>
              {ytRows.map((row) => {
                const views90 = Number(row.views) || 0
                const lifetime = Math.max(Number(row.lifetime_views) || 0, views90)
                const recentShare =
                  lifetime > 0 ? Math.round((1000 * views90) / lifetime) / 10 : null
                return (
                <tr key={row.video_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <a
                      href={`https://www.youtube.com/shorts/${row.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      {(row.title || row.video_id).slice(0, 48)}
                    </a>
                  </td>
                  <td
                    className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground"
                    title={row.published_at ? formatDateTime(row.published_at) ?? undefined : undefined}
                  >
                    {formatUploadDate(row.published_at)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {views90.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {lifetime.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {recentShare == null ? '—' : `${recentShare}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(row.engaged_views).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.engaged_pct == null ? '—' : `${row.engaged_pct}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.avg_view_percentage == null
                      ? '—'
                      : `${Math.round(Number(row.avg_view_percentage) * 10) / 10}%`}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
