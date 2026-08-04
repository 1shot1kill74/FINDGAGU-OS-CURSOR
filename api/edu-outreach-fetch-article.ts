import { spawn } from 'node:child_process'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { assertInternalAdmin, getBearerToken } from './_internalAdminAuth'
import {
  assertSafePublicHttpUrl,
  fetchHtmlFollowingRedirectsSafely,
  isGoogleNewsHost,
} from './_safePublicUrl'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

type ExtractedArticle = {
  engine: string
  finalUrl: string
  title: string
  byline?: string
  excerpt?: string
  text: string
  siteName?: string
}

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
}

function stripHtml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function stripPublisherSuffix(title: string) {
  return stripHtml(title)
    .replace(/\s+[—–-]\s+[^\n—–-]{1,40}$/u, '')
    .trim()
}

function buildNaverEnrichQueries(title: string): string[] {
  const core = stripPublisherSuffix(title)
  const queries: string[] = []
  if (core) queries.push(core.slice(0, 80))

  const orgs = core.match(/[가-힣A-Za-z0-9]{2,}(?:학원|스터디카페|독서실|학교|기숙학원)/g) || []
  const places = core.match(/(?:강남|서초|송파|분당|수원|목동|오목교|노원|일산|부산|대구|대전|광주|인천)[가-힣0-9]*/g) || []
  const keywords = core.match(/(리모델링|개원|이전|오픈|인테리어|재개원|확장)/g) || []

  const compact = [...new Set([...orgs.slice(0, 2), ...places.slice(0, 2), ...keywords.slice(0, 1)])]
    .join(' ')
    .trim()
  if (compact && compact !== core) queries.push(compact.slice(0, 80))

  if (orgs[0] && keywords[0]) {
    const pair = `${orgs[0]} ${keywords[0]}`
    if (!queries.includes(pair)) queries.push(pair)
  }
  if (orgs[0] && places[0]) {
    const pair = `${orgs[0]} ${places[0]}`
    if (!queries.includes(pair)) queries.push(pair)
  }

  return [...new Set(queries.filter(Boolean))].slice(0, 4)
}

function titlesLikelyMatch(a: string, b: string) {
  const clean = (t: string) =>
    stripPublisherSuffix(t)
      .toLowerCase()
      .replace(/["'`']/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const na = clean(a)
  const nb = clean(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const head = Math.min(28, na.length, nb.length)
  return head >= 12 && (na.includes(nb.slice(0, head)) || nb.includes(na.slice(0, head)))
}

async function resolveViaNaverNews(title: string): Promise<{ url: string; description: string; title: string } | null> {
  const clientId = getEnv('NAVER_CLIENT_ID', false)
  const clientSecret = getEnv('NAVER_CLIENT_SECRET', false)
  if (!clientId || !clientSecret) return null

  const queries = buildNaverEnrichQueries(title)
  if (!queries.length) return null

  for (const query of queries) {
    const url = new URL('https://openapi.naver.com/v1/search/news.json')
    url.searchParams.set('query', query)
    url.searchParams.set('display', '5')
    url.searchParams.set('start', '1')
    url.searchParams.set('sort', 'sim')

    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    })
    if (!res.ok) continue
    const payload = (await res.json()) as { items?: Array<Record<string, string>> }
    const match = (payload.items ?? [])
      .map((row) => ({
        title: stripHtml(row.title || ''),
        url: stripHtml(row.originallink || row.link || ''),
        description: stripHtml(row.description || ''),
      }))
      .find((row) => row.url && titlesLikelyMatch(title, row.title))
    if (match) return match
  }

  return null
}

function clip(text: string, max = 3500) {
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

async function fetchHtml(url: string) {
  return fetchHtmlFollowingRedirectsSafely(url)
}

function extractWithReadability(html: string, url: string): ExtractedArticle | null {
  const { document } = parseHTML(html)
  try {
    Object.defineProperty(document, 'documentURI', { value: url, configurable: true })
  } catch {
    // ignore
  }
  const reader = new Readability(document as unknown as Document, { charThreshold: 80 })
  const article = reader.parse()
  if (!article) return null
  const textContent = clip((article.textContent || '').replace(/\s+\n/g, '\n'))
  if (textContent.length < 80) return null
  return {
    engine: 'mozilla-readability',
    finalUrl: url,
    title: (article.title || '').trim(),
    byline: (article.byline || '').trim(),
    excerpt: (article.excerpt || '').trim(),
    text: textContent,
    siteName: (article.siteName || '').trim(),
  }
}

function markdownFromCrawl4aiPayload(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const obj = value as {
    raw_markdown?: string
    fit_markdown?: string
    markdown_with_citations?: string
  }
  return obj.raw_markdown || obj.fit_markdown || obj.markdown_with_citations || ''
}

async function extractWithCrawl4ai(url: string): Promise<ExtractedArticle | null> {
  await assertSafePublicHttpUrl(url)
  const base = getEnv('CRAWL4AI_BASE_URL', false) || 'http://127.0.0.1:11235'
  const token = getEnv('CRAWL4AI_API_TOKEN', false)
  if (!base) return null

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const root = base.replace(/\/$/, '')

  // Prefer lightweight /md (stable string response), then full /crawl.
  const mdRes = await fetch(`${root}/md`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, f: 'fit' }),
  })
  if (mdRes.ok) {
    const mdJson = (await mdRes.json()) as { markdown?: string; title?: string; url?: string; success?: boolean }
    const text = clip(mdJson.markdown || '')
    if (text.length >= 80) {
      return {
        engine: 'crawl4ai',
        finalUrl: mdJson.url || url,
        title: (mdJson.title || '').trim(),
        excerpt: text.slice(0, 240),
        text,
      }
    }
  }

  const res = await fetch(`${root}/crawl`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      urls: [url],
      priority: 10,
      crawler_config: {
        type: 'CrawlerRunConfig',
        params: {
          scrape_mode: 'markdown',
          remove_overlay_elements: true,
          exclude_external_images: true,
        },
      },
    }),
  })
  if (!res.ok) return null

  const payload = (await res.json()) as {
    results?: Array<{
      markdown?: string | Record<string, string>
      title?: string
      url?: string
      success?: boolean
    }>
    result?: { markdown?: string | Record<string, string>; title?: string; url?: string }
  }
  const first = payload.results?.[0] || payload.result
  if (!first) return null
  const text = clip(markdownFromCrawl4aiPayload(first.markdown))
  if (text.length < 80) return null
  return {
    engine: 'crawl4ai',
    finalUrl: first.url || url,
    title: (first.title || '').trim(),
    excerpt: text.slice(0, 240),
    text,
  }
}

async function extractWithScrapling(url: string): Promise<ExtractedArticle | null> {
  await assertSafePublicHttpUrl(url)
  const python =
    getEnv('SCRAPLING_PYTHON', false) ||
    '/Users/findgagu/Desktop/업무참고용/.venvs/scrapling/bin/python'
  const script =
    getEnv('EDU_OUTREACH_EXTRACT_SCRIPT', false) ||
    path.resolve(process.cwd(), 'scripts/edu_outreach_extract_article.py')

  return new Promise((resolve) => {
    const child = spawn(python, [script, '--url', url], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, 70000)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const parsed = JSON.parse(stdout || '{}') as {
          ok?: boolean
          engine?: string
          finalUrl?: string
          title?: string
          excerpt?: string
          text?: string
          message?: string
        }
        if (!parsed.ok || !parsed.text || parsed.text.length < 80) {
          if (stderr) console.warn('[scrapling]', stderr.slice(0, 300))
          resolve(null)
          return
        }
        resolve({
          engine: parsed.engine || 'scrapling-dynamic',
          finalUrl: parsed.finalUrl || url,
          title: parsed.title || '',
          excerpt: parsed.excerpt || '',
          text: clip(parsed.text),
        })
      } catch {
        resolve(null)
      }
    })
  })
}

async function extractArticleCascade(url: string): Promise<ExtractedArticle> {
  await assertSafePublicHttpUrl(url)
  const errors: string[] = []

  // 1) Crawl4AI (로컬 docker MCP/REST) — 가능하면 최우선
  try {
    const crawl4ai = await extractWithCrawl4ai(url)
    if (crawl4ai) return crawl4ai
    errors.push('crawl4ai: empty')
  } catch (error) {
    errors.push(`crawl4ai: ${error instanceof Error ? error.message : 'fail'}`)
  }

  // 2) Scrapling (Playwright) — 로컬 전용
  try {
    const scrapling = await extractWithScrapling(url)
    if (scrapling) return scrapling
    errors.push('scrapling: empty')
  } catch (error) {
    errors.push(`scrapling: ${error instanceof Error ? error.message : 'fail'}`)
  }

  // 3) Readability fallback — Vercel/서버리스에서도 동작
  const { html, finalUrl } = await fetchHtml(url)
  const readability = extractWithReadability(html, finalUrl)
  if (readability) return readability

  throw new Error(`본문 추출 실패 (${errors.join(' | ') || 'all engines empty'})`)
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'POST only' })
    return
  }

  try {
    const auth = await assertInternalAdmin(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      url?: string
      title?: string
      signalId?: string
      persist?: boolean
    }
    let url = (body.url || '').trim()
    const titleHint = (body.title || '').trim()
    if (!url) {
      res.status(400).json({ ok: false, message: 'url이 필요합니다.' })
      return
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      res.status(400).json({ ok: false, message: '유효하지 않은 URL입니다.' })
      return
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).json({ ok: false, message: 'http/https URL만 지원합니다.' })
      return
    }

    const fromGoogleNews = isGoogleNewsHost(parsed.hostname)

    // Google News 경유 링크 → 네이버 originallink로 치환 후 본문 추출
    if (fromGoogleNews) {
      if (!titleHint) {
        res.status(400).json({
          ok: false,
          message:
            'Google News 경유 링크는 본문 추출이 어렵습니다. 네이버 뉴스로 다시 수집하거나 제목과 함께 요청하세요.',
        })
        return
      }
      const resolved = await resolveViaNaverNews(titleHint)
      if (!resolved?.url) {
        res.status(400).json({
          ok: false,
          message: 'Google News 링크의 원문을 네이버에서 찾지 못했습니다. 네이버 뉴스로 다시 수집해 주세요.',
        })
        return
      }
      try {
        parsed = await assertSafePublicHttpUrl(resolved.url)
        url = parsed.toString()
      } catch (error) {
        res.status(400).json({
          ok: false,
          message: error instanceof Error ? error.message : '치환된 원문 URL이 유효하지 않습니다.',
        })
        return
      }
    } else {
      try {
        parsed = await assertSafePublicHttpUrl(url)
      } catch (error) {
        res.status(400).json({
          ok: false,
          message: error instanceof Error ? error.message : '허용되지 않는 URL입니다.',
        })
        return
      }
      url = parsed.toString()
    }

    const article = await extractArticleCascade(url)
    try {
      await assertSafePublicHttpUrl(article.finalUrl)
    } catch {
      res.status(400).json({ ok: false, message: '추출된 최종 URL이 안전하지 않습니다.' })
      return
    }

    if (body.persist && body.signalId) {
      const signalId = String(body.signalId).trim()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(signalId)) {
        res.status(400).json({ ok: false, message: '유효하지 않은 signalId입니다.' })
        return
      }

      const token = getBearerToken(req)
      const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const summary = article.excerpt || article.text.slice(0, 500)

      const { data: existingSignal, error: signalLookupError } = await supabase
        .from('edu_outreach_signals')
        .select('id')
        .eq('id', signalId)
        .maybeSingle()
      if (signalLookupError) {
        res.status(500).json({ ok: false, message: signalLookupError.message })
        return
      }
      if (!existingSignal?.id) {
        res.status(404).json({ ok: false, message: '시그널을 찾을 수 없거나 권한이 없습니다.' })
        return
      }

      const { error: signalUpdateError } = await supabase
        .from('edu_outreach_signals')
        .update({
          title: article.title || undefined,
          body: article.text,
          source_url: article.finalUrl,
          raw: {
            fetched_article: true,
            engine: article.engine,
            byline: article.byline || null,
            site_name: article.siteName || null,
            excerpt: article.excerpt || null,
            final_url: article.finalUrl,
            resolved_from_google_news: fromGoogleNews,
          },
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', signalId)
      if (signalUpdateError) {
        res.status(500).json({ ok: false, message: signalUpdateError.message })
        return
      }

      const { error: leadUpdateError } = await supabase
        .from('edu_outreach_leads')
        .update({
          evidence_quote: summary,
          source_url: article.finalUrl,
          why: `원문 본문 추출 완료 (${article.engine})`,
          updated_at: new Date().toISOString(),
        })
        .eq('signal_id', signalId)
      if (leadUpdateError) {
        res.status(500).json({ ok: false, message: leadUpdateError.message })
        return
      }
    }

    res.status(200).json({
      ok: true,
      engine: article.engine,
      finalUrl: article.finalUrl,
      title: article.title,
      byline: article.byline || '',
      siteName: article.siteName || '',
      excerpt: article.excerpt || '',
      text: article.text,
      note: '우선순위: Crawl4AI → Scrapling → Readability',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '본문 추출 실패'
    const status =
      /차단|사설|내부망|허용되지|유효하지 않은 URL|http\/https/.test(message) ? 400 : 500
    res.status(status).json({ ok: false, message })
  }
}
