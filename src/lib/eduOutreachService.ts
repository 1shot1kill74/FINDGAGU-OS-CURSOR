import { supabase } from '@/lib/supabase'
import { scoreEduBlogTarget } from '@/lib/eduOutreachActivation'
import {
  orgNameFromScore,
  preferredWindowForIndustry,
  scoreEduOutreachSignal,
} from '@/lib/eduOutreachScoring'
import { toReadableSourceText, isTitleLikeSummary } from '@/lib/eduOutreachText'
import { assertSafeHttpUrl, isSafeHttpUrl } from '@/lib/safeHttpUrl'
import type {
  EduOutreachDraftRow,
  EduOutreachIndustry,
  EduOutreachLeadRow,
  EduOutreachLeadWithDraft,
  EduOutreachSendLogRow,
  EduOutreachSignalRow,
  EduOutreachSourceRow,
} from '@/lib/eduOutreachTypes'

type CollectItem = {
  title: string
  link: string
  pubDate?: string
  description?: string
  query?: string
  telephone?: string
  address?: string
  category?: string
  industryHint?: string
  regionHint?: string
  intentHint?: string
  bloggerLink?: string
  bloggerName?: string
  activationLevel?: string
  samplePostCount?: number
  lastPostDate?: string
}

export type EduOutreachCollectProvider = 'naver_news' | 'naver_local' | 'google_news' | 'naver_blog'

function asLead(row: Record<string, unknown>): EduOutreachLeadRow {
  return row as unknown as EduOutreachLeadRow
}

export async function listEduOutreachSources() {
  const { data, error } = await supabase
    .from('edu_outreach_sources')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as EduOutreachSourceRow[]
}

export async function listEduOutreachLeads(statuses?: string[]) {
  let query = supabase
    .from('edu_outreach_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .order('fit_score', { ascending: false })
    .limit(120)

  if (statuses?.length) query = query.in('status', statuses)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => asLead(row as Record<string, unknown>))
}

export async function listEduOutreachLeadsWithDrafts(statuses?: string[]) {
  const leads = await listEduOutreachLeads(statuses)
  if (!leads.length) return [] as EduOutreachLeadWithDraft[]

  const leadIds = leads.map((l) => l.id)
  const signalIds = leads.map((l) => l.signal_id).filter((id): id is string => Boolean(id))

  const [draftsRes, signalsRes] = await Promise.all([
    supabase.from('edu_outreach_drafts').select('*').in('lead_id', leadIds).eq('is_current', true),
    signalIds.length
      ? supabase
          .from('edu_outreach_signals')
          .select('id, title, body, source_url, published_at, region_hint, industry_hint, raw, first_seen_at')
          .in('id', signalIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (draftsRes.error) throw new Error(draftsRes.error.message)
  if (signalsRes.error) throw new Error(signalsRes.error.message)

  const draftByLead = new Map<string, EduOutreachDraftRow>()
  for (const row of draftsRes.data ?? []) {
    const draft = row as EduOutreachDraftRow
    draftByLead.set(draft.lead_id, draft)
  }

  const signalById = new Map<string, EduOutreachSignalRow>()
  for (const row of signalsRes.data ?? []) {
    const signal = row as EduOutreachSignalRow
    signalById.set(signal.id, signal)
  }

  return leads.map((lead) => ({
    ...lead,
    draft: draftByLead.get(lead.id) ?? null,
    signal: lead.signal_id ? signalById.get(lead.signal_id) ?? null : null,
  }))
}

export async function listRecentSendLogs(limit = 30) {
  const { data, error } = await supabase
    .from('edu_outreach_send_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as EduOutreachSendLogRow[]
}

async function upsertSignalAndLead(item: {
  sourceId: string | null
  externalId: string
  title: string
  body: string
  sourceUrl: string
  publishedAt: string | null
  industryHint?: EduOutreachIndustry
  regionHint?: string
  intentHint?: string
  telephone?: string
  bloggerLink?: string
  bloggerName?: string
  activationLevel?: string
  samplePostCount?: number
  lastPostDate?: string
}) {
  const readable = toReadableSourceText({ title: item.title, body: item.body })
  const cleanTitle = readable.title || item.title
  const isBlog = (item.intentHint || '').trim() === 'blog_activation'
  // 제목±매체만 반복한 가짜 요약은 저장하지 않음. 블로그 본문은 그대로 저장.
  const cleanBody = isBlog
    ? item.body || readable.summary
    : isTitleLikeSummary(cleanTitle, readable.summary)
      ? ''
      : readable.summary

  const safeSourceUrl = isSafeHttpUrl(item.sourceUrl) ? item.sourceUrl.trim() : ''
  const safeBloggerLink = item.bloggerLink && isSafeHttpUrl(item.bloggerLink) ? item.bloggerLink.trim() : ''
  const storedSourceUrl = safeBloggerLink || safeSourceUrl

  const score = isBlog
    ? scoreEduBlogTarget({
        orgName: item.bloggerName || cleanTitle,
        title: cleanTitle,
        body: cleanBody,
        sourceUrl: storedSourceUrl,
        industryHint: item.industryHint,
        regionHint: item.regionHint,
        lastPostDateIso: item.lastPostDate || item.publishedAt,
        samplePostCount: item.samplePostCount ?? 1,
      })
    : scoreEduOutreachSignal({
        title: cleanTitle,
        body: cleanBody,
        sourceUrl: safeSourceUrl,
        industryHint: item.industryHint,
        regionHint: item.regionHint,
        intentHint: item.intentHint,
      })

  const { data: signal, error: signalError } = await supabase
    .from('edu_outreach_signals')
    .upsert(
      {
        source_id: item.sourceId,
        external_id: item.externalId,
        title: cleanTitle,
        body: cleanBody,
        source_url: storedSourceUrl,
        published_at: item.publishedAt,
        industry_hint: score.industry,
        region_hint: score.region,
        raw: {
          title: item.title,
          description: item.body,
          clean_title: cleanTitle,
          clean_body: cleanBody,
          publisher: readable.publisher || null,
          telephone: item.telephone ?? null,
          intent_hint: item.intentHint ?? null,
          has_real_summary: Boolean(cleanBody),
          blogger_link: item.bloggerLink ?? null,
          blogger_name: item.bloggerName ?? null,
          activation_level: isBlog
            ? ('activation_level' in score ? score.activation_level : item.activationLevel) ?? null
            : item.activationLevel ?? null,
          sample_post_count: item.samplePostCount ?? null,
          last_post_date: item.lastPostDate ?? null,
        },
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'external_id' },
    )
    .select('*')
    .single()
  if (signalError) throw new Error(signalError.message)

  const { data: existing } = await supabase
    .from('edu_outreach_leads')
    .select('id, status')
    .eq('signal_id', signal.id)
    .maybeSingle()

  if (existing?.id && existing.status !== 'new' && existing.status !== 'scored' && existing.status !== 'queued') {
    return { leadId: existing.id as string, created: false, scored: false }
  }

  // 블로그 활성 48+ / 디렉터리 52+ / 뉴스 55+
  const queueThreshold =
    item.intentHint === 'blog_activation' ? 48 : item.intentHint === 'directory' ? 52 : 55
  const status =
    score.industry === 'excluded' || score.fit_score < 40
      ? 'excluded'
      : score.fit_score >= queueThreshold
        ? 'queued'
        : 'scored'

  const leadPayload = {
    signal_id: signal.id,
    org_name: isBlog
      ? item.bloggerName || orgNameFromScore(cleanTitle, cleanBody)
      : orgNameFromScore(cleanTitle, cleanBody),
    industry: score.industry,
    intent: score.intent,
    region: score.region,
    status,
    fit_score: score.fit_score,
    score_payload: score,
    evidence_quote: score.evidence_quote,
    source_url: isSafeHttpUrl(score.source_url) ? score.source_url.trim() : storedSourceUrl,
    why: score.why,
    outreach_angle: score.outreach_angle,
    cta_url: isSafeHttpUrl(score.cta_url) ? score.cta_url.trim() : '',
    preferred_contact_window: preferredWindowForIndustry(score.industry),
    scored_at: new Date().toISOString(),
    queued_at: status === 'queued' ? new Date().toISOString() : null,
    contact_channel:
      score.industry === 'military'
        ? 'official_bid'
        : item.telephone
          ? 'phone'
          : isBlog
            ? 'form'
            : 'unknown',
    contact_value: item.telephone?.trim() || safeBloggerLink || null,
    updated_at: new Date().toISOString(),
  }

  let leadId = existing?.id as string | undefined
  if (leadId) {
    const { error } = await supabase.from('edu_outreach_leads').update(leadPayload).eq('id', leadId)
    if (error) throw new Error(error.message)
  } else {
    const { data: created, error } = await supabase
      .from('edu_outreach_leads')
      .insert(leadPayload)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    leadId = created.id as string
  }

  if (score.draft_message && status !== 'excluded') {
    await supabase.from('edu_outreach_drafts').update({ is_current: false }).eq('lead_id', leadId)
    const { error: draftError } = await supabase.from('edu_outreach_drafts').insert({
      lead_id: leadId,
      channel: score.industry === 'military' ? 'official_bid' : 'manual_copy',
      subject: `[파인드가구] ${leadPayload.org_name} 교육공간 사례`,
      body: score.draft_message,
      cta_url: leadPayload.cta_url,
      engine: 'heuristic',
      is_current: true,
    })
    if (draftError) throw new Error(draftError.message)
  }

  return { leadId, created: !existing?.id, scored: true }
}

export async function importManualEduNotice(input: {
  title: string
  sourceUrl: string
  body?: string
  industryHint?: EduOutreachIndustry
}) {
  const safeUrl = assertSafeHttpUrl(input.sourceUrl, '공개 URL')
  const sources = await listEduOutreachSources()
  const source = sources.find((s) => s.slug === 'g2b_manual_import') ?? null
  const externalId = `manual:${safeUrl || input.title.trim()}`

  return upsertSignalAndLead({
    sourceId: source?.id ?? null,
    externalId,
    title: input.title.trim(),
    body: (input.body || '').trim(),
    sourceUrl: safeUrl,
    publishedAt: new Date().toISOString(),
    industryHint: input.industryHint,
  })
}

const PROVIDER_SOURCE_SLUG: Record<EduOutreachCollectProvider, string> = {
  naver_news: 'naver_news_edu_furniture',
  naver_local: 'naver_local_edu_places',
  google_news: 'google_news_edu_furniture',
  naver_blog: 'naver_blog_edu_activation',
}

function externalIdForProvider(provider: EduOutreachCollectProvider, item: CollectItem) {
  if (provider === 'naver_local') {
    return `nlocal:${item.title}|${item.telephone || ''}|${item.address || item.link || ''}`
  }
  if (provider === 'naver_news') {
    return `nnews:${item.link || item.title}`
  }
  if (provider === 'naver_blog') {
    return `nblog:${item.bloggerLink || item.link || item.title}`
  }
  return `gnews:${item.link || item.title}`
}

export async function collectEduOutreachSignals(provider: EduOutreachCollectProvider) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인이 필요합니다.')

  const sources = await listEduOutreachSources()
  const slug = PROVIDER_SOURCE_SLUG[provider]
  const source = sources.find((s) => s.slug === slug) ?? null
  if (!source && provider !== 'google_news') {
    // 마이그레이션 전이라도 API 수집은 가능 — source_id null로 저장
  }

  const { data: run, error: runError } = await supabase
    .from('edu_outreach_poll_runs')
    .insert({ source_id: source?.id ?? null, status: 'running', details: { provider } })
    .select('id')
    .single()
  if (runError) throw new Error(runError.message)

  let signalsNew = 0
  let leadsNew = 0
  let leadsScored = 0

  try {
    const res = await fetch('/api/edu-outreach-collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ provider, sourceSlug: slug }),
    })
    const payload = (await res.json()) as {
      ok?: boolean
      message?: string
      items?: CollectItem[]
    }
    if (!res.ok || !payload.ok) {
      throw new Error(payload.message || '공개 시그널 수집에 실패했습니다.')
    }

    for (const item of payload.items ?? []) {
      const result = await upsertSignalAndLead({
        sourceId: source?.id ?? null,
        externalId: externalIdForProvider(provider, item),
        title: item.title || '(제목 없음)',
        body: item.description || '',
        sourceUrl: item.link || '',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        industryHint: item.industryHint as EduOutreachIndustry | undefined,
        regionHint: item.regionHint,
        intentHint: item.intentHint,
        telephone: item.telephone,
        bloggerLink: item.bloggerLink,
        bloggerName: item.bloggerName,
        activationLevel: item.activationLevel,
        samplePostCount: item.samplePostCount,
        lastPostDate: item.lastPostDate,
      })
      signalsNew += 1
      if (result.created) leadsNew += 1
      if (result.scored) leadsScored += 1
    }

    if (source) {
      await supabase
        .from('edu_outreach_sources')
        .update({
          last_polled_at: new Date().toISOString(),
          last_poll_status: 'ok',
          last_poll_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', source.id)
    }

    await supabase
      .from('edu_outreach_poll_runs')
      .update({
        status: 'ok',
        signals_new: signalsNew,
        leads_new: leadsNew,
        leads_scored: leadsScored,
        finished_at: new Date().toISOString(),
        details: { provider, itemCount: payload.items?.length ?? 0 },
      })
      .eq('id', run.id)

    return { provider, signalsNew, leadsNew, leadsScored, itemCount: payload.items?.length ?? 0 }
  } catch (error) {
    const message = error instanceof Error ? error.message : '수집 실패'
    if (source) {
      await supabase
        .from('edu_outreach_sources')
        .update({
          last_polled_at: new Date().toISOString(),
          last_poll_status: 'error',
          last_poll_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', source.id)
    }
    await supabase
      .from('edu_outreach_poll_runs')
      .update({
        status: 'error',
        error_message: message,
        finished_at: new Date().toISOString(),
        details: { provider },
      })
      .eq('id', run.id)
    throw error
  }
}

/** @deprecated use collectEduOutreachSignals('google_news') */
export async function collectGoogleNewsEduSignals() {
  return collectEduOutreachSignals('google_news')
}

export async function collectNaverNewsEduSignals() {
  return collectEduOutreachSignals('naver_news')
}

export async function collectNaverLocalEduPlaces() {
  return collectEduOutreachSignals('naver_local')
}

export async function fetchEduOutreachArticleBody(input: {
  url: string
  title?: string | null
  signalId?: string | null
  persist?: boolean
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인이 필요합니다.')

  const res = await fetch('/api/edu-outreach-fetch-article', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      url: input.url,
      title: input.title || undefined,
      signalId: input.signalId || undefined,
      persist: Boolean(input.persist && input.signalId),
    }),
  })
  const payload = (await res.json()) as {
    ok?: boolean
    message?: string
    text?: string
    title?: string
    excerpt?: string
    finalUrl?: string
    siteName?: string
    byline?: string
  }
  if (!res.ok || !payload.ok || !payload.text) {
    throw new Error(payload.message || '원문 본문을 불러오지 못했습니다.')
  }
  return payload
}

export async function updateEduOutreachDraft(draftId: string, body: string) {
  const { error } = await supabase
    .from('edu_outreach_drafts')
    .update({ body, engine: 'human', updated_at: new Date().toISOString() })
    .eq('id', draftId)
  if (error) throw new Error(error.message)
}

export async function approveEduOutreachLead(input: {
  leadId: string
  draftId?: string | null
  note?: string
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('edu_outreach_leads')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.leadId)
  if (error) throw new Error(error.message)

  const { error: approvalError } = await supabase.from('edu_outreach_approvals').insert({
    lead_id: input.leadId,
    draft_id: input.draftId ?? null,
    action: 'approve',
    actor_user_id: user?.id ?? null,
    note: input.note ?? null,
  })
  if (approvalError) throw new Error(approvalError.message)
}

export async function rejectEduOutreachLead(input: { leadId: string; note?: string }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('edu_outreach_leads')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.leadId)
  if (error) throw new Error(error.message)

  const { error: approvalError } = await supabase.from('edu_outreach_approvals').insert({
    lead_id: input.leadId,
    action: 'reject',
    actor_user_id: user?.id ?? null,
    note: input.note ?? null,
  })
  if (approvalError) throw new Error(approvalError.message)
}

/** 자동 발송 없음 — 사람이 복사/공식 채널로 보낸 뒤 로그만 남김 */
export async function logEduOutreachSend(input: {
  leadId: string
  draftId?: string | null
  messageSnapshot: string
  destination?: string
  channel?: string
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error: logError } = await supabase.from('edu_outreach_send_logs').insert({
    lead_id: input.leadId,
    draft_id: input.draftId ?? null,
    channel: input.channel || 'manual_copy',
    status: 'logged',
    destination: input.destination ?? null,
    message_snapshot: input.messageSnapshot,
    actor_user_id: user?.id ?? null,
    metadata: { human_in_the_loop: true, auto_send: false },
  })
  if (logError) throw new Error(logError.message)

  const { error } = await supabase
    .from('edu_outreach_leads')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.leadId)
  if (error) throw new Error(error.message)
}

export function computeEduOutreachMetrics(leads: EduOutreachLeadRow[]) {
  const queued = leads.filter((l) => l.status === 'queued').length
  const approved = leads.filter((l) => l.status === 'approved' || l.status === 'sent' || l.status === 'converted').length
  const rejected = leads.filter((l) => l.status === 'rejected' || l.status === 'excluded').length
  const reviewed = approved + rejected
  const sent = leads.filter((l) => l.status === 'sent' || l.status === 'replied' || l.status === 'converted').length
  const converted = leads.filter((l) => l.status === 'converted' || l.status === 'replied').length
  const byIndustry: Record<string, number> = {}
  for (const lead of leads) {
    if (lead.status === 'excluded' || lead.status === 'rejected') continue
    if ((lead.fit_score ?? 0) < 55) continue
    byIndustry[lead.industry] = (byIndustry[lead.industry] ?? 0) + 1
  }
  return {
    queued,
    approvalRate: reviewed ? approved / reviewed : 0,
    replyProxyRate: sent ? converted / sent : 0,
    weeklyValidByIndustry: byIndustry,
  }
}
