/* eslint-disable no-console */
/**
 * 빌드 후 공개 쇼룸 SEO/AEO HTML을 prerender 한다.
 *
 * 산출물:
 *   dist/public/showroom/index.html
 *   dist/public/showroom/guide/managed-study-cafe-furniture/index.html
 *   dist/public/showroom/case/<siteName>/index.html  (approved만)
 *
 * 셸에는 SEO/AEO 정보를 인라인으로 넣는다:
 *   - <title>, <meta name="description">, og:* 메타 (셸 기본값을 교체)
 *   - <link rel="canonical">
 *   - JSON-LD
 *   - <noscript> 안에 본문 요약 / featuredAnswer (검색엔진 가시 텍스트)
 *   - 그리고 그대로 SPA가 부팅 (<div id="root"> + bundled script)
 *
 * 환경 변수:
 *   - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (사례 prerender에 필수)
 *   - SITE_PUBLIC_BASE_URL (필수, 예: https://www.findgagu.co.kr)
 *
 * 환경 변수가 없으면 (로컬 빌드 등) 조용히 스킵한다.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  buildGuidePrerenderPage,
  buildHubPrerenderPage,
  type PublicShowroomPrerenderPage,
} from '../src/lib/publicShowroomSeo.ts'

type CaseRow = {
  site_name: string | null
  metadata: Record<string, unknown> | null
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.trim() || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY?.trim() || ''
const DEFAULT_PUBLIC_BASE_URL = 'https://www.findgagu.co.kr'
const BASE_URL = (
  process.env.SITE_PUBLIC_BASE_URL?.trim() ||
  (process.env.VERCEL === '1' ? DEFAULT_PUBLIC_BASE_URL : '')
).replace(/\/+$/, '')
const STRICT = process.env.PRERENDER_STRICT === '1'

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const TEMPLATE_PATH = path.join(DIST_DIR, 'index.html')

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}

function readNested<T = unknown>(obj: unknown, ...keys: string[]): T | null {
  let cur: unknown = obj
  for (const k of keys) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null
    cur = (cur as Record<string, unknown>)[k]
  }
  return (cur ?? null) as T | null
}

function readStr(obj: unknown, ...keys: string[]): string {
  if (!obj || typeof obj !== 'object') return ''
  const rec = obj as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function readStringArray(obj: unknown, ...keys: string[]): string[] {
  if (!obj || typeof obj !== 'object') return []
  const rec = obj as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x.length > 0)
    }
  }
  return []
}

type FaqItem = { question: string; answer: string }

function readFaqArray(obj: unknown, ...keys: string[]): FaqItem[] {
  if (!obj || typeof obj !== 'object') return []
  const rec = obj as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (Array.isArray(v)) {
      const items: FaqItem[] = []
      for (const it of v) {
        if (!it || typeof it !== 'object') continue
        const q = readStr(it, 'question', 'q')
        const a = readStr(it, 'answer', 'a')
        if (q && a) items.push({ question: q, answer: a })
      }
      return items
    }
  }
  return []
}

type CasePrerender = {
  siteName: string
  url: string
  canonicalUrl: string
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string | null
  featuredAnswer: string
  faqItems: FaqItem[]
  bodyMarkdown: string
  approvedAt: string | null
  updatedAt: string | null
}

function buildCasePrerender(row: CaseRow): CasePrerender | null {
  const siteName = (row.site_name ?? '').trim()
  if (!siteName) return null
  const blog = readNested<Record<string, unknown>>(row.metadata, 'canonical_blog_post')
  if (!blog) return null
  const status = typeof blog['status'] === 'string' ? (blog['status'] as string) : ''
  if (status !== 'approved') return null

  const seo = readNested<Record<string, unknown>>(blog, 'seo') ?? {}
  const structured = readNested<Record<string, unknown>>(blog, 'structured') ?? {}

  const title =
    readStr(seo, 'title', 'seo_title', 'seoTitle') ||
    readStr(blog, 'title') ||
    `${siteName} — 파인드가구 온라인 쇼룸 사례`

  const description =
    readStr(seo, 'seo_description', 'seoDescription', 'description') ||
    readStr(blog, 'summary') ||
    ''

  const ogTitle = readStr(seo, 'og_title', 'ogTitle') || title
  const ogDescription = readStr(seo, 'og_description', 'ogDescription') || description

  const featuredAnswer = readStr(structured, 'featured_answer', 'featuredAnswer')
  const faqItems = readFaqArray(structured, 'faq_items', 'faqItems', 'faq')

  const canonicalPath = readStr(seo, 'canonical_path', 'canonicalPath')
  const url = `${BASE_URL}/public/showroom/case/${encodeURIComponent(siteName)}`
  const canonicalUrl = canonicalPath ? `${BASE_URL}${canonicalPath.startsWith('/') ? '' : '/'}${canonicalPath}` : url

  const heroImage =
    readStr(blog, 'heroImageUrl', 'hero_image_url') ||
    null

  const bodyMarkdown = typeof blog['bodyMarkdown'] === 'string' ? (blog['bodyMarkdown'] as string) : ''
  const approvedAt = typeof blog['approvedAt'] === 'string' ? (blog['approvedAt'] as string) : null
  const updatedAt = typeof blog['updatedAt'] === 'string' ? (blog['updatedAt'] as string) : null

  void readStringArray(seo, 'keywords', 'seo_keywords')

  return {
    siteName,
    url,
    canonicalUrl,
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage: heroImage,
    featuredAnswer,
    faqItems,
    bodyMarkdown,
    approvedAt,
    updatedAt,
  }
}

function buildCaseJsonLd(c: CasePrerender): string {
  const article: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.title,
    description: c.description,
    mainEntityOfPage: c.canonicalUrl,
    inLanguage: 'ko',
  }
  if (c.ogImage) article.image = [c.ogImage]
  if (c.approvedAt) article.datePublished = c.approvedAt
  if (c.updatedAt) article.dateModified = c.updatedAt

  const blocks: string[] = []
  blocks.push(
    `<script type="application/ld+json">${JSON.stringify(article).replace(/</g, '\\u003c')}</script>`,
  )
  if (c.faqItems.length > 0) {
    const faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: c.faqItems.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    }
    blocks.push(
      `<script type="application/ld+json">${JSON.stringify(faq).replace(/</g, '\\u003c')}</script>`,
    )
  }
  return blocks.join('\n    ')
}

function buildCaseHeadInjection(c: CasePrerender): string {
  const lines: string[] = []
  lines.push(`<title>${escapeHtml(c.title)}</title>`)
  if (c.description) lines.push(`<meta name="description" content="${escapeAttr(c.description)}" />`)
  lines.push(`<link rel="canonical" href="${escapeAttr(c.canonicalUrl)}" />`)
  lines.push(`<meta property="og:type" content="article" />`)
  lines.push(`<meta property="og:title" content="${escapeAttr(c.ogTitle)}" />`)
  if (c.ogDescription) lines.push(`<meta property="og:description" content="${escapeAttr(c.ogDescription)}" />`)
  lines.push(`<meta property="og:url" content="${escapeAttr(c.canonicalUrl)}" />`)
  lines.push(`<meta property="og:site_name" content="파인드가구" />`)
  lines.push(`<meta property="og:locale" content="ko_KR" />`)
  if (c.ogImage) {
    lines.push(`<meta property="og:image" content="${escapeAttr(c.ogImage)}" />`)
  }
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`)
  lines.push(`<meta name="twitter:title" content="${escapeAttr(c.ogTitle)}" />`)
  if (c.ogDescription) lines.push(`<meta name="twitter:description" content="${escapeAttr(c.ogDescription)}" />`)
  if (c.ogImage) lines.push(`<meta name="twitter:image" content="${escapeAttr(c.ogImage)}" />`)
  lines.push(buildCaseJsonLd(c))
  return lines.map((l) => `    ${l}`).join('\n')
}

function buildCaseNoscriptBody(c: CasePrerender): string {
  const MAX_BODY = 8000
  const trimmedBody = c.bodyMarkdown.length > MAX_BODY
    ? `${c.bodyMarkdown.slice(0, MAX_BODY)}\n…`
    : c.bodyMarkdown

  const parts: string[] = []
  parts.push(`<h1>${escapeHtml(c.title)}</h1>`)
  if (c.description) parts.push(`<p>${escapeHtml(c.description)}</p>`)
  if (c.featuredAnswer) {
    parts.push(`<section><h2>핵심 요약</h2><p>${escapeHtml(c.featuredAnswer)}</p></section>`)
  }
  if (trimmedBody.trim()) {
    parts.push(`<section><h2>사례 본문</h2><pre style="white-space:pre-wrap">${escapeHtml(trimmedBody)}</pre></section>`)
  }
  if (c.faqItems.length > 0) {
    const faqHtml = c.faqItems
      .map(
        (f) => `<dt>${escapeHtml(f.question)}</dt><dd>${escapeHtml(f.answer)}</dd>`,
      )
      .join('')
    parts.push(`<section><h2>자주 묻는 질문</h2><dl>${faqHtml}</dl></section>`)
  }
  parts.push(`<p><a href="${escapeAttr(c.canonicalUrl)}">${escapeHtml(c.canonicalUrl)}</a></p>`)
  return parts.join('\n')
}

function buildStaticPageHeadInjection(page: PublicShowroomPrerenderPage): string {
  const lines: string[] = []
  lines.push(`<title>${escapeHtml(page.title)}</title>`)
  lines.push(`<meta name="description" content="${escapeAttr(page.description)}" />`)
  lines.push(`<link rel="canonical" href="${escapeAttr(page.canonicalUrl)}" />`)
  lines.push(`<meta property="og:type" content="${escapeAttr(page.ogType)}" />`)
  lines.push(`<meta property="og:title" content="${escapeAttr(page.title)}" />`)
  lines.push(`<meta property="og:description" content="${escapeAttr(page.description)}" />`)
  lines.push(`<meta property="og:url" content="${escapeAttr(page.canonicalUrl)}" />`)
  lines.push(`<meta property="og:site_name" content="파인드가구" />`)
  lines.push(`<meta property="og:locale" content="ko_KR" />`)
  lines.push(`<meta property="og:image" content="${escapeAttr(page.ogImage)}" />`)
  lines.push(`<meta property="og:image:width" content="1200" />`)
  lines.push(`<meta property="og:image:height" content="630" />`)
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`)
  lines.push(`<meta name="twitter:title" content="${escapeAttr(page.title)}" />`)
  lines.push(`<meta name="twitter:description" content="${escapeAttr(page.description)}" />`)
  lines.push(`<meta name="twitter:image" content="${escapeAttr(page.ogImage)}" />`)
  for (const block of page.jsonLd) {
    lines.push(
      `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`,
    )
  }
  return lines.map((l) => `    ${l}`).join('\n')
}

/**
 * SPA 셸의 기본 SEO 태그를 제거한 뒤 페이지 전용 메타를 주입한다.
 * (이중 <title>/og 충돌 방지)
 */
function stripShellSeoHead(html: string): string {
  return html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\b(?:(?!\/?>)[\s\S])*?\bname\s*=\s*["']description["'](?:(?!\/?>)[\s\S])*?\/?>\s*/gi, '')
    .replace(/<meta\b(?:(?!\/?>)[\s\S])*?\bproperty\s*=\s*["']og:[^"']*["'](?:(?!\/?>)[\s\S])*?\/?>\s*/gi, '')
    .replace(/<meta\b(?:(?!\/?>)[\s\S])*?\bname\s*=\s*["']twitter:[^"']*["'](?:(?!\/?>)[\s\S])*?\/?>\s*/gi, '')
    .replace(/<link\b(?:(?!\/?>)[\s\S])*?\brel\s*=\s*["']canonical["'](?:(?!\/?>)[\s\S])*?\/?>\s*/gi, '')
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '')
}

function injectHeadAndNoscript(template: string, headInjection: string, noscriptInner: string): string {
  let html = stripShellSeoHead(template)
  const headClose = '</head>'
  if (!html.includes(headClose)) {
    throw new Error('template missing </head>')
  }
  html = html.replace(headClose, `${headInjection}\n  ${headClose}`)

  const noscript = `<noscript>${noscriptInner}</noscript>`
  const rootEmpty = '<div id="root"></div>'
  if (html.includes(rootEmpty)) {
    html = html.replace(rootEmpty, `<div id="root">${noscript}</div>`)
  } else {
    html = html.replace(/<div id="root"[^>]*><\/div>/, (m) => m.replace('></div>', `>${noscript}</div>`))
  }
  return html
}

function injectCaseIntoTemplate(template: string, c: CasePrerender): string {
  return injectHeadAndNoscript(template, buildCaseHeadInjection(c), buildCaseNoscriptBody(c))
}

function injectStaticPageIntoTemplate(template: string, page: PublicShowroomPrerenderPage): string {
  return injectHeadAndNoscript(template, buildStaticPageHeadInjection(page), page.noscriptHtml)
}

async function fetchAllRows(): Promise<CaseRow[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return []
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const PAGE = 1000
  const out: CaseRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('showroom_case_profiles')
      .select('site_name, metadata')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`supabase select failed: ${error.message}`)
    const rows = (data ?? []) as CaseRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

async function writePrerenderedHtml(relativeSegments: string[], html: string): Promise<void> {
  const outDir = path.join(DIST_DIR, ...relativeSegments)
  const outFile = path.join(outDir, 'index.html')
  await mkdir(outDir, { recursive: true })
  await writeFile(outFile, html, 'utf8')
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !BASE_URL) {
    const reason = !SUPABASE_URL || !SUPABASE_ANON_KEY ? 'Supabase 환경변수 누락' : 'SITE_PUBLIC_BASE_URL 누락'
    if (STRICT) {
      console.error(`[prerender] ${reason}. 빌드를 실패시킵니다 (PRERENDER_STRICT=1).`)
      process.exit(1)
    }
    console.warn(`[prerender] ${reason} → prerender 스킵 (로컬 빌드일 수 있음).`)
    return
  }

  if (!existsSync(TEMPLATE_PATH)) {
    console.warn(`[prerender] dist/index.html 이 없습니다. vite build 가 먼저 실행되어야 합니다.`)
    if (STRICT) process.exit(1)
    return
  }

  const template = await readFile(TEMPLATE_PATH, 'utf8')
  console.log(`[prerender] base=${BASE_URL}`)

  const hub = buildHubPrerenderPage(BASE_URL)
  const guide = buildGuidePrerenderPage(BASE_URL)
  await writePrerenderedHtml(hub.relativeDir.split('/'), injectStaticPageIntoTemplate(template, hub))
  await writePrerenderedHtml(guide.relativeDir.split('/'), injectStaticPageIntoTemplate(template, guide))
  console.log(`[prerender] hub + guide pages written`)

  const rows = await fetchAllRows()
  console.log(`[prerender] case rows=${rows.length}`)

  let written = 0
  for (const row of rows) {
    const c = buildCasePrerender(row)
    if (!c) continue

    await writePrerenderedHtml(
      ['public', 'showroom', 'case', c.siteName],
      injectCaseIntoTemplate(template, c),
    )
    written += 1
  }

  console.log(`[prerender] approved case pages prerendered: ${written}`)
}

main().catch((err) => {
  console.error('[prerender] failed:', err)
  process.exit(1)
})
