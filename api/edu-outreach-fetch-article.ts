import { spawn } from 'node:child_process'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

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

function readHeader(req: RequestLike, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getBearerToken(req: RequestLike) {
  const authorization = readHeader(req, 'authorization')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

async function assertUser(req: RequestLike) {
  const token = getBearerToken(req)
  if (!token) return { ok: false as const, status: 401, message: '로그인이 필요합니다.' }
  const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { ok: false as const, status: 401, message: '유효하지 않은 세션입니다.' }
  return { ok: true as const, user: data.user }
}

function clip(text: string, max = 3500) {
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase()
  return (
    host.includes('news.google.') ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host.includes('accounts.google.')
  )
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`원문 페이지 요청 실패 (${res.status})`)
  return { html: await res.text(), finalUrl: res.url || url }
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

function extractWithScrapling(url: string): Promise<ExtractedArticle | null> {
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
    const auth = await assertUser(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      url?: string
      signalId?: string
      persist?: boolean
    }
    const url = (body.url || '').trim()
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
    if (isBlockedHost(parsed.hostname)) {
      res.status(400).json({
        ok: false,
        message:
          'Google News 경유 링크는 본문 추출이 어렵습니다. 네이버 뉴스로 다시 수집하면 원문(originallink)을 씁니다.',
      })
      return
    }

    const article = await extractArticleCascade(url)

    if (body.persist && body.signalId) {
      const token = getBearerToken(req)
      const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const summary = article.excerpt || article.text.slice(0, 500)
      await supabase
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
          },
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', body.signalId)

      await supabase
        .from('edu_outreach_leads')
        .update({
          evidence_quote: summary,
          source_url: article.finalUrl,
          why: `원문 본문 추출 완료 (${article.engine})`,
          updated_at: new Date().toISOString(),
        })
        .eq('signal_id', body.signalId)
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
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '본문 추출 실패',
    })
  }
}
