/**
 * competitor-monitor-poll — 경쟁사 YouTube·블로그(RSS)·인스타(Apify + RSS fallback) 수집
 *
 * 시크릿: YOUTUBE_DATA_API_KEY, APIFY_API_TOKEN
 * 배포: npx supabase functions deploy competitor-monitor-poll --project-ref sxxnshvidfwuemgbyuqz
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const DEFAULT_YOUTUBE_LIMIT = 15
const DEFAULT_BLOG_RSS_LIMIT = 20
const DEFAULT_INSTAGRAM_LIMIT = 15
const DEFAULT_APIFY_ACTOR = "apify~instagram-scraper"
const DEFAULT_APIFY_TIMEOUT_SECS = 120

type ChannelRow = {
  id: string
  competitor_id: string
  channel_type: string
  label: string
  external_id: string | null
  external_url: string | null
  rss_url: string | null
  metadata: Record<string, unknown> | null
}

type ContentDraft = {
  external_id: string
  title: string
  description: string
  url: string
  published_at: string | null
  thumbnail_url: string | null
  raw: Record<string, unknown>
}

type KeywordRow = { id: string; keyword: string; competitor_id: string | null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function parseRssItems(xml: string): ContentDraft[] {
  const items: ContentDraft[] = []
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
  for (const block of itemBlocks) {
    const title = stripHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, ""))
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim()
    const guid = (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? link).trim()
    const desc = stripHtml((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, ""))
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "").trim()
    if (!guid && !link) continue
    items.push({
      external_id: guid || link,
      title: title || "(제목 없음)",
      description: desc,
      url: link,
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
      thumbnail_url: null,
      raw: { source: "rss" },
    })
  }
  return items
}

async function fetchYouTubeByChannelId(apiKey: string, channelId: string): Promise<ContentDraft[]> {
  const chRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${encodeURIComponent(channelId)}&key=${apiKey}`,
  )
  if (!chRes.ok) throw new Error(`YouTube channels: ${chRes.status}`)
  const chJson = await chRes.json()
  const channel = chJson?.items?.[0]
  const uploadsPlaylist = channel?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsPlaylist) return []

  const plRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploadsPlaylist)}&maxResults=15&key=${apiKey}`,
  )
  if (!plRes.ok) throw new Error(`YouTube playlistItems: ${plRes.status}`)
  const plJson = await plRes.json()
  return (plJson?.items ?? []).map((item: Record<string, unknown>) => {
    const snippet = (item.snippet ?? {}) as Record<string, unknown>
    const resourceId = (snippet.resourceId ?? {}) as Record<string, unknown>
    const videoId = String(resourceId.videoId ?? "")
    const thumbs = (snippet.thumbnails ?? {}) as Record<string, { url?: string }>
    return {
      external_id: videoId,
      title: String(snippet.title ?? ""),
      description: String(snippet.description ?? "").slice(0, 2000),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      published_at: snippet.publishedAt ? String(snippet.publishedAt) : null,
      thumbnail_url: thumbs.medium?.url ?? thumbs.default?.url ?? null,
      raw: { source: "youtube_api", channelId },
    } satisfies ContentDraft
  }).filter((row: ContentDraft) => row.external_id)
}

function extractYouTubeHandle(channel: ChannelRow): string | null {
  const fromUrl = channel.external_url?.match(/youtube\.com\/@([\w.-]+)/i)?.[1]
  if (fromUrl) return fromUrl
  const fromId = channel.external_id?.replace(/^@/, "").trim()
  if (fromId && !/^UC[\w-]{20,}$/.test(fromId)) return fromId
  return null
}

async function resolveYouTubeChannelId(apiKey: string, channel: ChannelRow): Promise<string | null> {
  if (channel.external_id && /^UC[\w-]{20,}$/.test(channel.external_id)) {
    return channel.external_id
  }
  const handle = extractYouTubeHandle(channel)
  if (handle) {
    const byHandle = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`,
    )
    if (byHandle.ok) {
      const data = await byHandle.json()
      const id = data?.items?.[0]?.id
      if (id) return id
    }
  }
  const meta = channel.metadata ?? {}
  const expectedTitle = String(meta.expected_channel_title ?? meta.expectedChannelTitle ?? "").trim()
  const searchQuery = String(meta.search_query ?? meta.searchQuery ?? "완내스가구")
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&maxResults=5&key=${apiKey}`,
  )
  if (!searchRes.ok) throw new Error(`YouTube search: ${searchRes.status}`)
  const searchJson = await searchRes.json()
  const items = (searchJson?.items ?? []) as Array<{ snippet?: { channelId?: string; title?: string }; id?: { channelId?: string } }>
  if (expectedTitle) {
    const matched = items.find((item) => item.snippet?.title?.includes(expectedTitle))
    const id = matched?.snippet?.channelId ?? matched?.id?.channelId
    if (id) return String(id)
  }
  const first = items[0]?.snippet?.channelId ?? items[0]?.id?.channelId
  return first ? String(first) : null
}

async function pollYouTube(apiKey: string, channel: ChannelRow): Promise<ContentDraft[]> {
  const channelId = await resolveYouTubeChannelId(apiKey, channel)
  if (!channelId) throw new Error("YouTube 채널 ID를 찾지 못했습니다.")
  return fetchYouTubeByChannelId(apiKey, channelId)
}

async function pollRss(channel: ChannelRow, limit?: number): Promise<ContentDraft[]> {
  const rssUrl = channel.rss_url?.trim()
  if (!rssUrl) throw new Error("RSS URL이 없습니다.")
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "FindgaguOS-CompetitorMonitor/1.0" },
  })
  if (!res.ok) throw new Error(`RSS fetch ${res.status}`)
  const xml = await res.text()
  const items = parseRssItems(xml)
  return limit ? items.slice(0, limit) : items
}

function resolveInstagramProfileUrl(channel: ChannelRow) {
  const fromUrl = channel.external_url?.trim()
  if (fromUrl) return fromUrl.replace(/\/$/, "") + "/"
  const handle = channel.external_id?.replace(/^@/, "").trim()
  if (handle) return `https://www.instagram.com/${handle}/`
  return null
}

function mapApifyInstagramPost(row: Record<string, unknown>): ContentDraft {
  const shortCode = String(row.shortCode ?? row.shortcode ?? "")
  const url = String(row.url ?? (shortCode ? `https://www.instagram.com/p/${shortCode}/` : ""))
  const caption = String(row.caption ?? row.text ?? "").slice(0, 2000)
  const title = caption.slice(0, 120).trim() || "(인스타 게시물)"
  const timestamp = row.timestamp ?? row.takenAt ?? row.createdAt ?? row.date
  const published_at = timestamp ? new Date(String(timestamp)).toISOString() : null
  const thumb = String(row.displayUrl ?? row.thumbnailUrl ?? row.imageUrl ?? row.thumbnail ?? "")
  const external_id = shortCode || url.split("?")[0].replace(/\/$/, "")

  return {
    external_id,
    title,
    description: caption,
    url,
    published_at,
    thumbnail_url: thumb || null,
    raw: {
      source: "apify",
      likesCount: row.likesCount ?? row.likes,
      commentsCount: row.commentsCount ?? row.comments,
      type: row.type,
    },
  }
}

async function pollInstagramApify(token: string, channel: ChannelRow, limit: number): Promise<ContentDraft[]> {
  const profileUrl = resolveInstagramProfileUrl(channel)
  if (!profileUrl) throw new Error("인스타 프로필 URL이 없습니다.")

  const meta = channel.metadata ?? {}
  const actorId = String(meta.apify_actor ?? meta.apifyActor ?? DEFAULT_APIFY_ACTOR)
  const resultsLimit = Number(meta.results_limit ?? meta.resultsLimit ?? limit) || limit
  const timeoutSecs = Number(Deno.env.get("APIFY_RUN_TIMEOUT_SECS") ?? DEFAULT_APIFY_TIMEOUT_SECS) || DEFAULT_APIFY_TIMEOUT_SECS

  const runUrl = new URL(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`)
  runUrl.searchParams.set("token", token)
  runUrl.searchParams.set("timeout", String(timeoutSecs))

  const res = await fetch(runUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [profileUrl],
      resultsType: "posts",
      resultsLimit,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apify Instagram ${res.status}: ${text.slice(0, 200)}`)
  }

  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error("Apify Instagram: invalid response")
  return rows
    .map((row) => mapApifyInstagramPost(row as Record<string, unknown>))
    .filter((row) => row.external_id && row.url)
}

async function pollInstagram(
  apifyToken: string,
  channel: ChannelRow,
  limit = DEFAULT_INSTAGRAM_LIMIT,
): Promise<{ items: ContentDraft[]; source: string }> {
  if (apifyToken) {
    try {
      const items = await pollInstagramApify(apifyToken, channel, limit)
      return { items, source: "apify" }
    } catch (apifyError) {
      if (!channel.rss_url?.trim()) throw apifyError
      console.warn("[competitor-monitor-poll] Apify failed, falling back to RSS:", apifyError)
    }
  }

  if (channel.rss_url?.trim()) {
    return { items: await pollRss(channel, limit), source: apifyToken ? "rss_fallback" : "rss" }
  }

  throw new Error("APIFY_API_TOKEN 또는 RSS URL이 필요합니다.")
}

async function upsertContentAndKeywords(
  supabase: ReturnType<typeof createClient>,
  competitorId: string,
  channel: ChannelRow,
  items: ContentDraft[],
  keywords: KeywordRow[],
) {
  let itemsNew = 0
  let itemsUpdated = 0
  let keywordHitsNew = 0

  for (const item of items) {
    const { data: existing } = await supabase
      .from("competitor_content_items")
      .select("id")
      .eq("competitor_id", competitorId)
      .eq("channel_type", channel.channel_type)
      .eq("external_id", item.external_id)
      .maybeSingle()

    const payload = {
      competitor_id: competitorId,
      channel_id: channel.id,
      channel_type: channel.channel_type,
      external_id: item.external_id,
      title: item.title,
      description: item.description,
      url: item.url,
      published_at: item.published_at,
      thumbnail_url: item.thumbnail_url,
      raw: item.raw,
      last_seen_at: new Date().toISOString(),
    }

    let contentItemId: string
    if (existing?.id) {
      await supabase.from("competitor_content_items").update(payload).eq("id", existing.id)
      contentItemId = existing.id
      itemsUpdated += 1
    } else {
      const { data: inserted, error } = await supabase
        .from("competitor_content_items")
        .insert({ ...payload, first_seen_at: new Date().toISOString() })
        .select("id")
        .single()
      if (error) throw error
      contentItemId = inserted.id
      itemsNew += 1
    }

    const haystack = `${item.title}\n${item.description}`.toLowerCase()
    for (const kw of keywords) {
      if (!kw.keyword.trim()) continue
      const needle = kw.keyword.trim().toLowerCase()
      if (!haystack.includes(needle)) continue
      const field = item.title.toLowerCase().includes(needle) ? "title" : "description"
      const { error: hitError } = await supabase.from("competitor_keyword_hits").upsert(
        {
          content_item_id: contentItemId,
          keyword_id: kw.id,
          matched_field: field,
          matched_snippet: item.title.slice(0, 200),
          detected_at: new Date().toISOString(),
        },
        { onConflict: "content_item_id,keyword_id,matched_field", ignoreDuplicates: true },
      )
      if (!hitError) keywordHitsNew += 1
    }
  }

  return { itemsNew, itemsUpdated, keywordHitsNew }
}

async function authorizeRequest(req: Request, supabaseUrl: string, supabaseAnon: string) {
  const cronHeader = req.headers.get("x-competitor-monitor-cron-secret")?.trim() ?? ""
  const expectedCron = Deno.env.get("COMPETITOR_MONITOR_CRON_SECRET")?.trim() ?? ""
  if (expectedCron && cronHeader === expectedCron) {
    return { mode: "cron" as const }
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return null

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return null
  return { mode: "user" as const, user }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const auth = await authorizeRequest(req, supabaseUrl, supabaseAnon)
    if (!auth) return json({ error: "Unauthorized" }, 401)

    const body = await req.json().catch(() => ({})) as { competitorSlug?: string; channelTypes?: string[]; source?: string }
    const youtubeKey = Deno.env.get("YOUTUBE_DATA_API_KEY")?.trim() ?? ""
    const apifyToken = Deno.env.get("APIFY_API_TOKEN")?.trim() ?? ""

    const admin = createClient(supabaseUrl, serviceKey)

    let competitorQuery = admin.from("competitors").select("id, slug, name").eq("is_active", true)
    if (body.competitorSlug) competitorQuery = competitorQuery.eq("slug", body.competitorSlug)
    const { data: competitors, error: compError } = await competitorQuery
    if (compError) throw compError
    if (!competitors?.length) return json({ error: "활성 경쟁사가 없습니다." }, 404)

    const channelFilter = body.channelTypes?.length ? body.channelTypes : null

    const results: Record<string, unknown>[] = []

    for (const competitor of competitors) {
      const { data: runRow, error: runError } = await admin
        .from("competitor_poll_runs")
        .insert({ competitor_id: competitor.id, status: "running" })
        .select("id")
        .single()
      if (runError) throw runError

      let channelsPolled = 0
      let itemsNew = 0
      let itemsUpdated = 0
      let keywordHitsNew = 0
      const channelResults: Record<string, unknown>[] = []
      let runErrorMessage: string | null = null

      const { data: channels, error: chError } = await admin
        .from("competitor_channels")
        .select("*")
        .eq("competitor_id", competitor.id)
        .eq("poll_enabled", true)
      if (chError) throw chError

      const { data: keywords, error: kwError } = await admin
        .from("competitor_keywords")
        .select("id, keyword, competitor_id")
        .eq("is_active", true)
        .or(`competitor_id.eq.${competitor.id},competitor_id.is.null`)
      if (kwError) throw kwError

      for (const channel of (channels ?? []) as ChannelRow[]) {
        if (channelFilter && !channelFilter.includes(channel.channel_type)) continue
        if (channel.channel_type === "website") {
          await admin
            .from("competitor_channels")
            .update({
              last_polled_at: new Date().toISOString(),
              last_poll_status: "skipped",
              last_poll_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", channel.id)
          continue
        }

        try {
          let items: ContentDraft[] = []
          let fetchSource: string | undefined
          if (channel.channel_type === "youtube") {
            if (!youtubeKey) throw new Error("YOUTUBE_DATA_API_KEY 미설정")
            items = await pollYouTube(youtubeKey, channel)
            fetchSource = "youtube_api"
          } else if (channel.channel_type === "blog") {
            items = await pollRss(channel, DEFAULT_BLOG_RSS_LIMIT)
            fetchSource = "rss"
          } else if (channel.channel_type === "instagram") {
            const instagramResult = await pollInstagram(apifyToken, channel, DEFAULT_INSTAGRAM_LIMIT)
            items = instagramResult.items
            fetchSource = instagramResult.source
          } else {
            throw new Error(`지원하지 않는 채널: ${channel.channel_type}`)
          }

          const stats = await upsertContentAndKeywords(
            admin,
            competitor.id,
            channel,
            items,
            (keywords ?? []) as KeywordRow[],
          )
          channelsPolled += 1
          itemsNew += stats.itemsNew
          itemsUpdated += stats.itemsUpdated
          keywordHitsNew += stats.keywordHitsNew

          await admin
            .from("competitor_channels")
            .update({
              last_polled_at: new Date().toISOString(),
              last_poll_status: "ok",
              last_poll_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", channel.id)

          channelResults.push({
            channel: channel.label,
            type: channel.channel_type,
            status: "ok",
            source: fetchSource,
            fetched: items.length,
            ...stats,
          })
        } catch (channelError) {
          const message = channelError instanceof Error ? channelError.message : String(channelError)
          runErrorMessage = runErrorMessage ? `${runErrorMessage}; ${message}` : message
          await admin
            .from("competitor_channels")
            .update({
              last_polled_at: new Date().toISOString(),
              last_poll_status: "error",
              last_poll_error: message.slice(0, 500),
              updated_at: new Date().toISOString(),
            })
            .eq("id", channel.id)
          channelResults.push({
            channel: channel.label,
            type: channel.channel_type,
            status: "error",
            error: message,
          })
        }
      }

      await admin
        .from("competitor_poll_runs")
        .update({
          status: runErrorMessage ? "partial_error" : "completed",
          channels_polled: channelsPolled,
          items_new: itemsNew,
          items_updated: itemsUpdated,
          keyword_hits_new: keywordHitsNew,
          error_message: runErrorMessage,
          details: { channels: channelResults, triggeredBy: auth.mode, source: body.source ?? auth.mode },
          finished_at: new Date().toISOString(),
        })
        .eq("id", runRow.id)

      results.push({
        competitor: competitor.slug,
        runId: runRow.id,
        channelsPolled,
        itemsNew,
        itemsUpdated,
        keywordHitsNew,
        error: runErrorMessage,
        channels: channelResults,
      })
    }

    return json({ ok: true, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[competitor-monitor-poll]", message)
    return json({ error: message }, 500)
  }
})
