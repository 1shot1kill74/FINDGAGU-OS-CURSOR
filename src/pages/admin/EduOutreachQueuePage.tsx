import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  approveEduOutreachLead,
  collectEduOutreachSignals,
  computeEduOutreachMetrics,
  fetchEduOutreachArticleBody,
  importManualEduNotice,
  listEduOutreachLeadsWithDrafts,
  listRecentSendLogs,
  logEduOutreachSend,
  rejectEduOutreachLead,
  updateEduOutreachDraft,
  type EduOutreachCollectProvider,
} from '@/lib/eduOutreachService'
import { isTitleLikeSummary, toReadableSourceText } from '@/lib/eduOutreachText'
import { activationLevelLabel } from '@/lib/eduOutreachActivation'
import { safeExternalHref } from '@/lib/safeHttpUrl'
import {
  EDU_INDUSTRY_LABELS,
  EDU_STATUS_LABELS,
  type EduOutreachIndustry,
  type EduOutreachLeadWithDraft,
  type EduOutreachSendLogRow,
} from '@/lib/eduOutreachTypes'

type TabKey = 'queued' | 'approved' | 'sent' | 'all'
/** 수집·큐 영역 분리: 블로그 활성 vs 뉴스 트렌드 vs 지역 디렉터리 */
type LaneKey = 'blog' | 'news' | 'directory'

function leadLane(lead: EduOutreachLeadWithDraft): LaneKey {
  const intent = (lead.intent || '').trim()
  const rawHint =
    typeof lead.signal?.raw?.intent_hint === 'string' ? lead.signal.raw.intent_hint.trim() : ''
  const hint = rawHint || intent
  if (
    hint === 'blog_activation' ||
    intent === 'blog_activation' ||
    intent === 'blog_presence' ||
    typeof lead.score_payload?.activation_level === 'string'
  ) {
    return 'blog'
  }
  if (hint === 'directory' || intent === 'directory') return 'directory'
  return 'news'
}

const LANE_META: Record<
  LaneKey,
  { label: string; blurb: string; empty: string }
> = {
  blog: {
    label: '블로그 활성',
    blurb: '학원·스터디 블로그 업데이트 활성도 + 공간의도 → 아웃리치 타겟',
    empty: '블로그 활성 리드가 없습니다. 「블로그 활성 수집」을 실행하세요.',
  },
  news: {
    label: '뉴스 트렌드',
    blurb: '개원·리모델링 등 공개 뉴스 시그널 (트렌드 참고, 아웃리치 주력 아님)',
    empty: '뉴스 트렌드 리드가 없습니다. 「뉴스 수집」을 실행하세요.',
  },
  directory: {
    label: '지역 디렉터리',
    blurb: '네이버 지역검색 업체 풀 (전화 저장만, 자동 연락 금지)',
    empty: '지역 디렉터리 리드가 없습니다. 「지역 수집」을 실행하세요.',
  },
}

function formatScore(score: number | null) {
  if (score == null || Number.isNaN(score)) return '-'
  return score.toFixed(0)
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('ko-KR')
}

/** 리스트용 짧은 날짜 (예: 26.07.22) */
function formatDateShort(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}.${mm}.${dd}`
}

/** 발행일 우선, 없으면 수집일 */
function leadEventAt(lead: EduOutreachLeadWithDraft) {
  return lead.signal?.published_at || lead.signal?.first_seen_at || lead.created_at || null
}

function intentLabel(intent: string | null | undefined) {
  if (!intent) return '-'
  if (intent === 'directory') return '업체 디렉터리(이벤트 아님)'
  if (intent === 'blog_activation') return '블로그 활성 타겟'
  if (intent === 'blog_presence') return '블로그 운영(공간의도 약함)'
  if (intent === 'open') return '개원/오픈'
  if (intent === 'relocate') return '이전/확장'
  if (intent === 'renewal') return '리뉴얼/리모델링'
  if (intent === 'furniture_replace') return '책상·좌석 교체'
  if (intent === 'procurement') return '입찰/구매'
  if (intent === 'fitout') return '공간 조성'
  if (intent === 'excluded') return '제외'
  return intent
}

/** 판단용 원문 블록 — signal 우선, HTML 제거·뉴스 블러브 정규화 */
function getSourceEvidence(lead: EduOutreachLeadWithDraft) {
  const signal = lead.signal
  const raw = signal?.raw ?? {}
  const rawDescription =
    typeof raw.description === 'string' ? raw.description : typeof raw.clean_body === 'string' ? raw.clean_body : ''

  // body가 제목±매체 가짜 요약이면 raw.description(실제 스니펫)을 우선
  const bodyCandidate = signal?.body || lead.evidence_quote || ''
  const preferRaw =
    rawDescription &&
    !isTitleLikeSummary(signal?.title || lead.org_name || '', rawDescription) &&
    isTitleLikeSummary(signal?.title || lead.org_name || '', bodyCandidate)

  const readable = toReadableSourceText({
    title: signal?.title || lead.evidence_quote || lead.org_name,
    body: preferRaw ? rawDescription : bodyCandidate,
  })
  const sourceUrl = signal?.source_url || lead.source_url || ''
  const publishedAt = signal?.published_at || null
  const telephone =
    lead.contact_value ||
    (typeof raw.telephone === 'string' ? raw.telephone : '') ||
    ''

  const fetchedBody =
    typeof raw.fetched_article === 'boolean' && raw.fetched_article && signal?.body
      ? signal.body
      : ''

  const readableSummary =
    readable.summary && !isTitleLikeSummary(readable.title, readable.summary) ? readable.summary : ''
  const summary = fetchedBody || readableSummary
  const isFullBody = Boolean(fetchedBody)

  return {
    title: readable.title,
    body: summary,
    summary,
    publisher:
      readable.publisher ||
      (typeof raw.site_name === 'string' ? raw.site_name : '') ||
      (typeof raw.publisher === 'string' ? raw.publisher : '') ||
      '',
    sourceUrl,
    publishedAt,
    telephone,
    raw,
    isFullBody,
    hasSummary: Boolean(summary),
  }
}

export default function EduOutreachQueuePage() {
  const [lane, setLane] = useState<LaneKey>('blog')
  const [tab, setTab] = useState<TabKey>('queued')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [leads, setLeads] = useState<EduOutreachLeadWithDraft[]>([])
  const [logs, setLogs] = useState<EduOutreachSendLogRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [manualIndustry, setManualIndustry] = useState<EduOutreachIndustry>('military')
  const [articleBodyByLead, setArticleBodyByLead] = useState<Record<string, string>>({})
  const [fetchingBody, setFetchingBody] = useState(false)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const [nextLeads, nextLogs] = await Promise.all([
        listEduOutreachLeadsWithDrafts(),
        listRecentSendLogs(20),
      ])
      setLeads(nextLeads)
      setLogs(nextLogs)
      setSelectedId((prev) => prev ?? nextLeads[0]?.id ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '리드를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  const laneLeads = useMemo(() => leads.filter((l) => leadLane(l) === lane), [leads, lane])

  const laneCounts = useMemo(() => {
    const counts: Record<LaneKey, number> = { blog: 0, news: 0, directory: 0 }
    for (const lead of leads) {
      if (lead.status === 'excluded') continue
      counts[leadLane(lead)] += 1
    }
    return counts
  }, [leads])

  const metrics = useMemo(() => computeEduOutreachMetrics(laneLeads), [laneLeads])

  const filtered = useMemo(() => {
    const base =
      tab === 'queued'
        ? laneLeads.filter((l) => l.status === 'queued' || l.status === 'scored')
        : tab === 'approved'
          ? laneLeads.filter((l) => l.status === 'approved')
          : tab === 'sent'
            ? laneLeads.filter((l) => l.status === 'sent' || l.status === 'replied' || l.status === 'converted')
            : laneLeads.filter((l) => l.status !== 'excluded')

    return [...base].sort((a, b) => {
      const ta = new Date(leadEventAt(a) || 0).getTime()
      const tb = new Date(leadEventAt(b) || 0).getTime()
      if (tb !== ta) return tb - ta
      return (b.fit_score ?? 0) - (a.fit_score ?? 0)
    })
  }, [laneLeads, tab])

  const selected = useMemo(
    () => filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  useEffect(() => {
    setSelectedId(null)
  }, [lane])

  useEffect(() => {
    setDraftBody(selected?.draft?.body ?? '')
  }, [selected?.id, selected?.draft?.body])

  const onCollect = async (provider: EduOutreachCollectProvider) => {
    setBusy(true)
    try {
      const result = await collectEduOutreachSignals(provider)
      const label =
        provider === 'naver_blog'
          ? '블로그 활성'
          : provider === 'naver_news'
            ? '네이버 뉴스'
            : provider === 'naver_local'
              ? '네이버 지역'
              : 'Google News'
      toast.success(
        `${label} ${result.itemCount}건 · 신규 ${result.leadsNew} · 점수화 ${result.leadsScored}`,
      )
      if (provider === 'naver_blog') setLane('blog')
      else if (provider === 'naver_local') setLane('directory')
      else setLane('news')
      setTab('queued')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수집 실패')
    } finally {
      setBusy(false)
    }
  }

  const onFetchArticleBody = async () => {
    if (!selected) return
    const url = selected.signal?.source_url || selected.source_url
    if (!url) {
      toast.error('원문 URL이 없습니다.')
      return
    }
    setFetchingBody(true)
    try {
      const article = await fetchEduOutreachArticleBody({
        url,
        title: selected.signal?.title || selected.org_name || selected.evidence_quote,
        signalId: selected.signal_id,
        persist: true,
      })
      setArticleBodyByLead((prev) => ({
        ...prev,
        [selected.id]: article.text || '',
      }))
      toast.success('원문 본문을 불러왔습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '본문 불러오기 실패')
    } finally {
      setFetchingBody(false)
    }
  }

  const onManualImport = async () => {
    if (!manualTitle.trim() || !manualUrl.trim()) {
      toast.error('제목과 공개 URL이 필요합니다.')
      return
    }
    setBusy(true)
    try {
      await importManualEduNotice({
        title: manualTitle,
        sourceUrl: manualUrl,
        industryHint: manualIndustry,
      })
      toast.success('공식 공고를 큐에 넣었습니다.')
      setManualTitle('')
      setManualUrl('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수동 등록 실패')
    } finally {
      setBusy(false)
    }
  }

  const onApprove = async () => {
    if (!selected) return
    setBusy(true)
    try {
      if (selected.draft && draftBody !== selected.draft.body) {
        await updateEduOutreachDraft(selected.draft.id, draftBody)
      }
      await approveEduOutreachLead({ leadId: selected.id, draftId: selected.draft?.id, note: 'OS 승인' })
      toast.success('승인했습니다. 자동 발송은 하지 않습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '승인 실패')
    } finally {
      setBusy(false)
    }
  }

  const onReject = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await rejectEduOutreachLead({ leadId: selected.id, note: 'OS 거절' })
      toast.success('거절 처리했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '거절 실패')
    } finally {
      setBusy(false)
    }
  }

  const onCopyAndLog = async () => {
    if (!selected) return
    const text = draftBody || selected.draft?.body || ''
    if (!text.trim()) {
      toast.error('보낼 메시지 초안이 없습니다.')
      return
    }
    setBusy(true)
    try {
      if (selected.draft && draftBody !== selected.draft.body) {
        await updateEduOutreachDraft(selected.draft.id, draftBody)
      }
      if (selected.status !== 'approved') {
        await approveEduOutreachLead({ leadId: selected.id, draftId: selected.draft?.id })
      }
      await navigator.clipboard.writeText(text)
      await logEduOutreachSend({
        leadId: selected.id,
        draftId: selected.draft?.id,
        messageSnapshot: text,
        channel: selected.industry === 'military' ? 'official_bid' : 'manual_copy',
      })
      toast.success('메시지를 복사했고 발송 로그를 남겼습니다. (자동 DM/메일 없음)')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '로그 기록 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                대시보드
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">교육가구 아웃리치</h1>
              <p className="mt-1 text-sm text-slate-500">{LANE_META[lane].blurb}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void load(true)} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            {lane === 'blog' ? (
              <Button type="button" disabled={busy} onClick={() => void onCollect('naver_blog')} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                블로그 활성 수집
              </Button>
            ) : null}
            {lane === 'news' ? (
              <>
                <Button type="button" disabled={busy} onClick={() => void onCollect('naver_news')} className="gap-1.5">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  뉴스 수집
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void onCollect('google_news')}>
                  Google 보조
                </Button>
              </>
            ) : null}
            {lane === 'directory' ? (
              <Button type="button" disabled={busy} onClick={() => void onCollect('naver_local')} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                지역 수집
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(['blog', 'news', 'directory'] as const).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={lane === key ? 'default' : 'outline'}
              onClick={() => {
                setLane(key)
                setTab('queued')
              }}
            >
              {LANE_META[key].label}
              <span className={`ml-1.5 tabular-nums ${lane === key ? 'text-white/80' : 'text-slate-400'}`}>
                {laneCounts[key]}
              </span>
            </Button>
          ))}
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">승인 대기</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.queued}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">승인률(리뷰 대비)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {(metrics.approvalRate * 100).toFixed(0)}%
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">발송 대비 회신/전환(프록시)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {(metrics.replyProxyRate * 100).toFixed(0)}%
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">유효 리드(업종)</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {Object.entries(metrics.weeklyValidByIndustry).length
                ? Object.entries(metrics.weeklyValidByIndustry)
                    .map(([k, v]) => `${EDU_INDUSTRY_LABELS[k as EduOutreachIndustry] ?? k} ${v}`)
                    .join(' · ')
                : '아직 없음'}
            </p>
          </div>
        </div>

        {lane === 'news' ? (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">공식 공고 수동 등록 (나라장터·학교·군 시설)</h2>
          <p className="mt-1 text-xs text-slate-500">개인 휴대폰 난사 금지. 공개 URL만. 군부대는 official channel only.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.2fr_160px_auto]">
            <Input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="공고 제목"
            />
            <Input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://... 공개 공고 URL"
            />
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={manualIndustry}
              onChange={(e) => setManualIndustry(e.target.value as EduOutreachIndustry)}
            >
              <option value="military">군부대</option>
              <option value="school">학교</option>
              <option value="apartment_community">아파트 커뮤니티</option>
              <option value="academy">학원</option>
              <option value="study_cafe">스터디카페</option>
              <option value="managed_reading_room">관리형 독서실</option>
            </select>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void onManualImport()}>
              등록
            </Button>
          </div>
        </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['queued', '승인 대기'],
              ['approved', '승인됨'],
              ['sent', '발송 기록'],
              ['all', '전체'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={tab === key ? 'default' : 'outline'}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중…
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
              {filtered.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">{LANE_META[lane].empty}</p>
              ) : (
                filtered.map((lead) => {
                  const evidence = getSourceEvidence(lead)
                  const eventAt = leadEventAt(lead)
                  const activationLevel =
                    typeof lead.score_payload?.activation_level === 'string'
                      ? lead.score_payload.activation_level
                      : typeof evidence.raw.activation_level === 'string'
                        ? evidence.raw.activation_level
                        : null
                  return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedId(lead.id)}
                    className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                      selected?.id === lead.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 line-clamp-1">
                        {lead.org_name || '미상'}
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">
                        {formatDateShort(eventAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {EDU_INDUSTRY_LABELS[lead.industry]} · {intentLabel(lead.intent)} · {lead.region || '미상'}
                      <span className="text-slate-400"> · fit {formatScore(lead.fit_score)}</span>
                    </p>
                    {activationLevel ? (
                      <p className="mt-0.5 text-[11px] font-medium text-amber-800">
                        {activationLevelLabel(activationLevel)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs leading-5 text-slate-600 line-clamp-2">
                      {evidence.title || evidence.summary}
                    </p>
                  </button>
                  )
                })
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              {!selected ? (
                <p className="text-sm text-slate-500">리드를 선택하세요.</p>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const evidence = getSourceEvidence(selected)
                    return (
                      <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{selected.org_name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {EDU_INDUSTRY_LABELS[selected.industry]} · fit {formatScore(selected.fit_score)} ·{' '}
                        {intentLabel(selected.intent)} ·{' '}
                        {selected.preferred_contact_window === 'lunch_or_late_evening'
                          ? '연락 권장: 점심/21:30–23:00'
                          : selected.preferred_contact_window === 'official_channel_only'
                            ? '공식 채널만'
                            : '업무시간'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {safeExternalHref(evidence.sourceUrl) ? (
                        <a
                          href={safeExternalHref(evidence.sourceUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          원문보기 <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {safeExternalHref(evidence.sourceUrl) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || fetchingBody}
                          onClick={() => void onFetchArticleBody()}
                          className="gap-1.5"
                        >
                          {fetchingBody ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          본문 불러오기
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-amber-950">판단용 원문</h3>
                      <p className="text-xs text-amber-800/80">
                        발행 {formatWhen(evidence.publishedAt)} · 수집{' '}
                        {formatWhen(selected.signal?.first_seen_at || selected.created_at)}
                      </p>
                    </div>
                    <p className="mt-3 text-base font-semibold leading-7 text-slate-900">
                      {evidence.title || '(제목 없음)'}
                    </p>
                    {evidence.publisher ? (
                      <p className="mt-1 text-xs text-slate-500">매체 · {evidence.publisher}</p>
                    ) : null}
                    <div className="mt-3 rounded-xl border border-amber-100 bg-white px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {articleBodyByLead[selected.id] || evidence.isFullBody
                          ? '원문 본문'
                          : evidence.hasSummary
                            ? '뉴스 짧은 요약 (본문 아님)'
                            : '요약 없음'}
                      </p>
                      <p className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {articleBodyByLead[selected.id] ||
                          evidence.summary ||
                          '짧은 요약이 없습니다. Google News RSS는 제목만 제공하므로, 「본문 불러오기」로 원문을 추출하거나 네이버 뉴스로 다시 수집하세요.'}
                      </p>
                      {!articleBodyByLead[selected.id] && !evidence.isFullBody ? (
                        <p className="mt-2 text-xs text-amber-800">
                          {evidence.hasSummary
                            ? '뉴스 API는 제목·짧은 요약만 줍니다. 「본문 불러오기」로 원문 페이지 본문을 추출하거나, 「원문보기」로 직접 확인하세요.'
                            : 'Google News는 RSS에 본문 요약이 없습니다. 네이버 뉴스 수집을 쓰면 짧은 요약·원문 링크가 채워집니다.'}
                        </p>
                      ) : null}
                    </div>
                    {(evidence.telephone || selected.region) && (
                      <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                        <p><span className="text-slate-400">지역</span> {selected.region || '-'}</p>
                        <p><span className="text-slate-400">연락처(저장만)</span> {evidence.telephone || '-'}</p>
                      </div>
                    )}
                  </section>

                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">AI/규칙 해석 (참고)</p>
                    <p className="mt-1"><span className="text-slate-500">의도</span> {intentLabel(selected.intent)}</p>
                    <p className="mt-1"><span className="text-slate-500">점수 근거</span> {selected.why || '-'}</p>
                    {typeof selected.score_payload?.activation_level === 'string' ? (
                      <p className="mt-1">
                        <span className="text-slate-500">블로그 활성</span>{' '}
                        {activationLevelLabel(String(selected.score_payload.activation_level))}
                        {typeof selected.score_payload.days_since_last_post === 'number'
                          ? ` · ${selected.score_payload.days_since_last_post}일 전`
                          : ''}
                      </p>
                    ) : null}
                    <p className="mt-1"><span className="text-slate-500">증거 인용</span> {selected.evidence_quote || '-'}</p>
                    <p className="mt-1"><span className="text-slate-500">제안 앵글</span> {selected.outreach_angle || '-'}</p>
                  </div>
                      </>
                    )
                  })()}

                  <div>
                    <label className="text-xs font-medium text-slate-500">메시지 초안 (승인 전 수정 가능)</label>
                    <textarea
                      className="mt-1 min-h-[140px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                    />
                    {safeExternalHref(selected.cta_url) ? (
                      <a
                        href={safeExternalHref(selected.cta_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 underline"
                      >
                        CTA/쇼룸 링크 <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy || selected.status === 'sent'} onClick={() => void onApprove()} className="gap-1.5">
                      <Check className="h-4 w-4" />
                      승인
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void onReject()} className="gap-1.5">
                      <X className="h-4 w-4" />
                      거절
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void onCopyAndLog()} className="gap-1.5">
                      <ClipboardCopy className="h-4 w-4" />
                      복사 + 발송 로그
                    </Button>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Send className="h-3.5 w-3.5" />
                      자동 발송 없음
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">최근 발송 로그</h2>
          {logs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">아직 로그가 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {formatWhen(log.created_at)} · {log.channel} · {log.status}
                  <span className="mt-1 block line-clamp-2 text-slate-500">{log.message_snapshot}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
