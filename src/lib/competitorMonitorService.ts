import { supabase } from '@/lib/supabase'

export type CompetitorRow = {
  id: string
  slug: string
  name: string
  website_url: string | null
  notes: string | null
  profile: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CompetitorChannelRow = {
  id: string
  competitor_id: string
  channel_type: 'youtube' | 'instagram' | 'blog' | 'website'
  label: string
  external_id: string | null
  external_url: string | null
  rss_url: string | null
  poll_enabled: boolean
  last_polled_at: string | null
  last_poll_status: string | null
  last_poll_error: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CompetitorContentItemRow = {
  id: string
  competitor_id: string
  channel_id: string | null
  channel_type: string
  external_id: string
  title: string | null
  description: string | null
  url: string | null
  published_at: string | null
  thumbnail_url: string | null
  raw: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
}

export type CompetitorKeywordRow = {
  id: string
  competitor_id: string | null
  keyword: string
  is_active: boolean
  created_at: string
}

export type CompetitorKeywordHitRow = {
  id: string
  content_item_id: string
  keyword_id: string
  matched_field: string
  matched_snippet: string | null
  detected_at: string
  competitor_keywords?: { keyword: string } | null
  competitor_content_items?: CompetitorContentItemRow | null
}

export type CompetitorPollRunRow = {
  id: string
  competitor_id: string | null
  status: string
  channels_polled: number
  items_new: number
  items_updated: number
  keyword_hits_new: number
  error_message: string | null
  details: Record<string, unknown>
  started_at: string
  finished_at: string | null
}

export type CompetitorPollResult = {
  ok: boolean
  results?: Array<{
    competitor: string
    runId: string
    channelsPolled: number
    itemsNew: number
    itemsUpdated: number
    keywordHitsNew: number
    error: string | null
    channels: Array<Record<string, unknown>>
  }>
  error?: string
}

const CHANNEL_LABELS: Record<string, string> = {
  youtube: '유튜브',
  instagram: '인스타그램',
  blog: '블로그',
  website: '웹사이트',
}

export function getCompetitorChannelLabel(type: string) {
  return CHANNEL_LABELS[type] ?? type
}

export async function fetchCompetitors() {
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as CompetitorRow[]
}

export async function fetchCompetitorChannels(competitorId: string) {
  const { data, error } = await supabase
    .from('competitor_channels')
    .select('*')
    .eq('competitor_id', competitorId)
    .order('channel_type')
  if (error) throw error
  return (data ?? []) as CompetitorChannelRow[]
}

export async function fetchCompetitorKeywords(competitorId: string) {
  const { data, error } = await supabase
    .from('competitor_keywords')
    .select('*')
    .eq('is_active', true)
    .or(`competitor_id.eq.${competitorId},competitor_id.is.null`)
    .order('keyword')
  if (error) throw error
  return (data ?? []) as CompetitorKeywordRow[]
}

export async function fetchCompetitorContent(competitorId: string, channelType?: string, limit = 40) {
  let query = supabase
    .from('competitor_content_items')
    .select('*')
    .eq('competitor_id', competitorId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('first_seen_at', { ascending: false })
    .limit(limit)
  if (channelType) query = query.eq('channel_type', channelType)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CompetitorContentItemRow[]
}

export async function fetchRecentKeywordHits(competitorId: string, limit = 30) {
  const { data: items, error: itemsError } = await supabase
    .from('competitor_content_items')
    .select('id')
    .eq('competitor_id', competitorId)
  if (itemsError) throw itemsError
  const ids = (items ?? []).map((row) => row.id)
  if (ids.length === 0) return [] as CompetitorKeywordHitRow[]

  const { data, error } = await supabase
    .from('competitor_keyword_hits')
    .select('*, competitor_keywords(keyword), competitor_content_items(*)')
    .in('content_item_id', ids)
    .order('detected_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CompetitorKeywordHitRow[]
}

export async function fetchRecentPollRuns(competitorId: string, limit = 10) {
  const { data, error } = await supabase
    .from('competitor_poll_runs')
    .select('*')
    .eq('competitor_id', competitorId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CompetitorPollRunRow[]
}

export async function addCompetitorKeyword(competitorId: string | null, keyword: string) {
  const trimmed = keyword.trim()
  if (!trimmed) throw new Error('키워드를 입력하세요.')
  const { data, error } = await supabase
    .from('competitor_keywords')
    .insert({ competitor_id: competitorId, keyword: trimmed })
    .select('*')
    .single()
  if (error) throw error
  return data as CompetitorKeywordRow
}

export async function runCompetitorPoll(competitorSlug?: string) {
  const { data, error } = await supabase.functions.invoke<CompetitorPollResult>('competitor-monitor-poll', {
    body: { competitorSlug },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function addManualInstagramPost(
  competitorId: string,
  channelId: string,
  postUrl: string,
  title?: string,
) {
  const url = postUrl.trim()
  if (!url.includes('instagram.com')) throw new Error('인스타그램 게시물 URL을 입력하세요.')
  const externalId = url.split('?')[0].replace(/\/$/, '')
  const { data, error } = await supabase
    .from('competitor_content_items')
    .upsert(
      {
        competitor_id: competitorId,
        channel_id: channelId,
        channel_type: 'instagram',
        external_id: externalId,
        title: title?.trim() || '수동 등록 인스타 게시물',
        description: '',
        url,
        published_at: new Date().toISOString(),
        raw: { source: 'manual' },
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'competitor_id,channel_type,external_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as CompetitorContentItemRow
}
