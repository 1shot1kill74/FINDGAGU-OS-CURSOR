import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  ArrowLeft,
  ExternalLink,
  Instagram,
  Newspaper,
  RefreshCw,
  Search,
  Target,
  Youtube,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  addCompetitorKeyword,
  addManualInstagramPost,
  fetchCompetitorChannels,
  fetchCompetitorContent,
  fetchCompetitorKeywords,
  fetchCompetitors,
  fetchRecentKeywordHits,
  fetchRecentPollRuns,
  getCompetitorChannelLabel,
  runCompetitorPoll,
  type CompetitorChannelRow,
  type CompetitorContentItemRow,
  type CompetitorKeywordHitRow,
  type CompetitorKeywordRow,
  type CompetitorPollRunRow,
  type CompetitorRow,
} from '@/lib/competitorMonitorService'

type TabKey = 'overview' | 'youtube' | 'instagram' | 'blog' | 'keywords'

const WANNAEUS_PROFILE = {
  threats: ['공장 원가', '스마트스토어 저가', '블로그 SEO', '유튜브 PD 채용'],
  channels: 7,
  compareDoc: 'docs/COMPETITOR_WANNAEUS_SALES_KIT.md',
}

function ChannelIcon({ type }: { type: string }) {
  if (type === 'youtube') return <Youtube className="h-4 w-4" />
  if (type === 'instagram') return <Instagram className="h-4 w-4" />
  if (type === 'blog') return <Newspaper className="h-4 w-4" />
  return <ExternalLink className="h-4 w-4" />
}

function formatPublished(value: string | null | undefined) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return '-'
  return `${format(parsed, 'yyyy-MM-dd')} · ${formatDistanceToNow(parsed, { addSuffix: true, locale: ko })}`
}

export default function CompetitorMonitorPage() {
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')
  const [competitor, setCompetitor] = useState<CompetitorRow | null>(null)
  const [channels, setChannels] = useState<CompetitorChannelRow[]>([])
  const [keywords, setKeywords] = useState<CompetitorKeywordRow[]>([])
  const [content, setContent] = useState<CompetitorContentItemRow[]>([])
  const [hits, setHits] = useState<CompetitorKeywordHitRow[]>([])
  const [pollRuns, setPollRuns] = useState<CompetitorPollRunRow[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [manualIgUrl, setManualIgUrl] = useState('')

  const instagramChannel = useMemo(
    () => channels.find((row) => row.channel_type === 'instagram') ?? null,
    [channels],
  )

  const filteredContent = useMemo(() => {
    if (tab === 'youtube') return content.filter((row) => row.channel_type === 'youtube')
    if (tab === 'instagram') return content.filter((row) => row.channel_type === 'instagram')
    if (tab === 'blog') return content.filter((row) => row.channel_type === 'blog')
    return content
  }, [content, tab])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const competitors = await fetchCompetitors()
      const target = competitors.find((row) => row.slug === 'wannaeus') ?? competitors[0] ?? null
      setCompetitor(target)
      if (!target) return

      const [nextChannels, nextKeywords, nextContent, nextHits, nextRuns] = await Promise.all([
        fetchCompetitorChannels(target.id),
        fetchCompetitorKeywords(target.id),
        fetchCompetitorContent(target.id),
        fetchRecentKeywordHits(target.id),
        fetchRecentPollRuns(target.id),
      ])
      setChannels(nextChannels)
      setKeywords(nextKeywords)
      setContent(nextContent)
      setHits(nextHits)
      setPollRuns(nextRuns)
    } catch (error) {
      const message = error instanceof Error ? error.message : '불러오기 실패'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handlePoll = async () => {
    if (!competitor) return
    setPolling(true)
    try {
      const result = await runCompetitorPoll(competitor.slug)
      const summary = result?.results?.[0]
      if (summary?.error) {
        toast.warning(`수집 완료(일부 오류): 신규 ${summary.itemsNew}건 · ${summary.error}`)
      } else {
        toast.success(`수집 완료: 신규 ${summary?.itemsNew ?? 0}건 · 키워드 매칭 ${summary?.keywordHitsNew ?? 0}건`)
      }
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : '수집 실패'
      toast.error(message)
    } finally {
      setPolling(false)
    }
  }

  const handleAddKeyword = async () => {
    if (!competitor || !newKeyword.trim()) return
    try {
      await addCompetitorKeyword(competitor.id, newKeyword)
      setNewKeyword('')
      toast.success('키워드를 추가했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '키워드 추가 실패')
    }
  }

  const handleManualInstagram = async () => {
    if (!competitor || !instagramChannel || !manualIgUrl.trim()) return
    try {
      await addManualInstagramPost(competitor.id, instagramChannel.id, manualIgUrl)
      setManualIgUrl('')
      toast.success('인스타 게시물을 등록했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '등록 실패')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft className="h-4 w-4" />
              대시보드
            </Link>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">경쟁사 모니터링</h1>
            <p className="mt-1 text-sm text-slate-500">
              완내스가구 채널·키워드를 수집합니다. 유튜브 API + 블로그 RSS + 인스타 Apify.
            </p>
          </div>
          <Button onClick={() => void handlePoll()} disabled={polling || !competitor}>
            <RefreshCw className={`mr-2 h-4 w-4 ${polling ? 'animate-spin' : ''}`} />
            {polling ? '수집 중…' : '지금 수집'}
          </Button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">불러오는 중…</div>
        ) : !competitor ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            경쟁사 데이터가 없습니다. Supabase 마이그레이션 `20260608160000_create_competitor_monitoring.sql`을 적용하세요.
          </div>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">경쟁사</p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">{competitor.name}</h2>
                    {competitor.website_url ? (
                      <a
                        href={competitor.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm text-sky-700 hover:underline"
                      >
                        {competitor.website_url}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">매출 2배 추정</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{competitor.notes}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {WANNAEUS_PROFILE.threats.map((item) => (
                    <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  영업 대응 문서: <code className="rounded bg-slate-100 px-1.5 py-0.5">{WANNAEUS_PROFILE.compareDoc}</code>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">채널 상태</h3>
                <div className="mt-4 space-y-3">
                  {channels.map((channel) => (
                    <div key={channel.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                          <ChannelIcon type={channel.channel_type} />
                          {channel.label}
                        </div>
                        <span
                          className={`text-xs ${
                            channel.last_poll_status === 'ok'
                              ? 'text-emerald-600'
                              : channel.last_poll_status === 'error'
                                ? 'text-rose-600'
                                : 'text-slate-400'
                          }`}
                        >
                          {channel.last_poll_status ?? '미수집'}
                        </span>
                      </div>
                      {channel.external_url ? (
                        <a
                          href={channel.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block truncate text-xs text-sky-700 hover:underline"
                        >
                          {channel.external_url}
                        </a>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">마지막 수집: {formatPublished(channel.last_polled_at)}</p>
                      {channel.last_poll_error ? (
                        <p className="mt-1 text-xs text-rose-600">{channel.last_poll_error}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              {([
                ['overview', '전체'],
                ['youtube', '유튜브'],
                ['instagram', '인스타'],
                ['blog', '블로그'],
                ['keywords', '키워드'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-full px-4 py-2 text-sm ${
                    tab === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'keywords' ? (
              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Search className="h-4 w-4" />
                    모니터링 키워드 ({keywords.length})
                  </h3>
                  <div className="mt-4 flex gap-2">
                    <input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="예: 러셀책상, 관리형 독서실"
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <Button variant="outline" onClick={() => void handleAddKeyword()}>
                      추가
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {keywords.map((row) => (
                      <span
                        key={row.id}
                        className={`rounded-full px-3 py-1 text-xs ${
                          row.competitor_id ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800'
                        }`}
                      >
                        {row.keyword}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Target className="h-4 w-4" />
                    최근 키워드 매칭
                  </h3>
                  <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto">
                    {hits.length === 0 ? (
                      <p className="text-sm text-slate-500">아직 매칭된 콘텐츠가 없습니다. 「지금 수집」을 실행하세요.</p>
                    ) : (
                      hits.map((hit) => (
                        <div key={hit.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-xs font-medium text-rose-700">{hit.competitor_keywords?.keyword}</p>
                          <p className="mt-1 text-sm text-slate-800">{hit.competitor_content_items?.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatPublished(hit.detected_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {tab === 'instagram' ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
                <p className="font-medium">인스타그램 모니터링 안내</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
                  <li>1차: <strong>Apify Instagram Scraper</strong> — 최신 15건 (캡션·좋아요·URL). Supabase 시크릿 <code className="rounded bg-white px-1">APIFY_API_TOKEN</code> 필요.</li>
                  <li>2차: Apify 실패 시 RSSHub RSS fallback (차단되면 0건).</li>
                  <li>3차: 아래 <strong>게시물 URL 수동 등록</strong>.</li>
                </ul>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={manualIgUrl}
                    onChange={(e) => setManualIgUrl(e.target.value)}
                    placeholder="https://www.instagram.com/p/..."
                    className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                  />
                  <Button variant="outline" onClick={() => void handleManualInstagram()} disabled={!instagramChannel}>
                    게시물 등록
                  </Button>
                </div>
              </section>
            ) : null}

            {tab !== 'keywords' ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tab === 'overview' ? '전체 콘텐츠' : `${getCompetitorChannelLabel(tab)} 콘텐츠`}
                </h3>
                <div className="mt-4 space-y-3">
                  {filteredContent.length === 0 ? (
                    <p className="text-sm text-slate-500">표시할 항목이 없습니다. 수집을 실행하거나 인스타 URL을 수동 등록하세요.</p>
                  ) : (
                    filteredContent.map((item) => (
                      <article key={item.id} className="flex gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" className="h-16 w-28 rounded-lg object-cover" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                              {getCompetitorChannelLabel(item.channel_type)}
                            </span>
                            <span className="text-xs text-slate-400">{formatPublished(item.published_at ?? item.first_seen_at)}</span>
                          </div>
                          <h4 className="mt-1 font-medium text-slate-900">{item.title}</h4>
                          {item.description ? (
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.description}</p>
                          ) : null}
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                            >
                              원문 보기
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">수집 이력</h3>
              <div className="mt-4 space-y-2">
                {pollRuns.length === 0 ? (
                  <p className="text-sm text-slate-500">수집 이력이 없습니다.</p>
                ) : (
                  pollRuns.map((run) => (
                    <div key={run.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{run.status}</span>
                        <span className="text-xs text-slate-500">{formatPublished(run.started_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        채널 {run.channels_polled} · 신규 {run.items_new} · 업데이트 {run.items_updated} · 키워드 {run.keyword_hits_new}
                      </p>
                      {run.error_message ? <p className="mt-1 text-xs text-rose-600">{run.error_message}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
