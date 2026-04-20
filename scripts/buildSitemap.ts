/* eslint-disable no-console */
/**
 * 빌드 후 `dist/sitemap.xml` 과 `dist/robots.txt` 를 생성한다.
 *
 * 포함 정책:
 * - `/public/showroom/case/<siteName>`  -> `metadata.canonical_blog_post.status === 'approved'`
 * - `/public/showroom/cardnews/<siteName>`  -> `metadata.cardNewsPublication.is_published === true`
 *
 * 환경 변수:
 * - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (필수)
 * - SITE_PUBLIC_BASE_URL (필수, 예: https://www.findgagu.com)
 *
 * 사용:
 *   tsx scripts/buildSitemap.ts
 *   - 또는 -
 *   SITE_PUBLIC_BASE_URL=https://www.findgagu.com tsx scripts/buildSitemap.ts
 *
 * `npm run build` 이후에 실행되도록 package.json scripts에 연결되어 있다.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

type CaseRow = {
  site_name: string | null
  metadata: Record<string, unknown> | null
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.trim() || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY?.trim() || ''
const BASE_URL = (process.env.SITE_PUBLIC_BASE_URL?.trim() || '').replace(/\/+$/, '')

const STRICT = process.env.SITEMAP_STRICT === '1'

async function writeFallback(reason: string): Promise<void> {
  console.warn(`[buildSitemap] 비활성 사유: ${reason}. 빈 sitemap/robots 만 작성합니다.`)
  const distDir = path.resolve(process.cwd(), 'dist')
  if (!existsSync(distDir)) await mkdir(distDir, { recursive: true })
  const robots = ['User-agent: *', 'Allow: /', ''].join('\n')
  const empty = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'
  await writeFile(path.join(distDir, 'sitemap.xml'), empty, 'utf8')
  await writeFile(path.join(distDir, 'robots.txt'), robots, 'utf8')
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  if (STRICT) {
    console.error('[buildSitemap] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 가 비어 있습니다.')
    process.exit(1)
  }
  await writeFallback('Supabase 환경변수 누락 (로컬 빌드일 수 있음)')
  process.exit(0)
}
if (!BASE_URL) {
  if (STRICT) {
    console.error('[buildSitemap] SITE_PUBLIC_BASE_URL 이 비어 있습니다. 예: https://www.findgagu.com')
    process.exit(1)
  }
  await writeFallback('SITE_PUBLIC_BASE_URL 누락 (로컬 빌드일 수 있음)')
  process.exit(0)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

function encodeSitePath(siteName: string): string {
  return encodeURIComponent(siteName.trim())
}

function isoDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function readNested<T = unknown>(obj: unknown, ...keys: string[]): T | null {
  let cur: unknown = obj
  for (const k of keys) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null
    cur = (cur as Record<string, unknown>)[k]
  }
  return (cur ?? null) as T | null
}

type SitemapEntry = {
  loc: string
  lastmod?: string | null
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${escapeXml(e.loc)}</loc>`]
      if (e.lastmod) parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`)
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`)
      if (typeof e.priority === 'number') parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

async function fetchAllRows(): Promise<CaseRow[]> {
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

async function main(): Promise<void> {
  console.log(`[buildSitemap] base = ${BASE_URL}`)
  const rows = await fetchAllRows()
  console.log(`[buildSitemap] fetched ${rows.length} case profile rows`)

  const entries: SitemapEntry[] = []

  // 정적 진입점들 (필요시 더 추가)
  entries.push({ loc: `${BASE_URL}/`, changefreq: 'weekly', priority: 0.6 })
  entries.push({ loc: `${BASE_URL}/showroom`, changefreq: 'weekly', priority: 0.7 })

  let approvedBlogCount = 0
  let publishedCardNewsCount = 0

  for (const row of rows) {
    const siteName = (row.site_name ?? '').trim()
    if (!siteName) continue
    const metadata = row.metadata ?? null

    const blog = readNested<Record<string, unknown>>(metadata, 'canonical_blog_post')
    const blogStatus = blog && typeof blog['status'] === 'string' ? (blog['status'] as string) : null
    const blogUpdatedAt = blog && typeof blog['updatedAt'] === 'string' ? (blog['updatedAt'] as string) : null
    const blogApprovedAt = blog && typeof blog['approvedAt'] === 'string' ? (blog['approvedAt'] as string) : null

    if (blogStatus === 'approved') {
      entries.push({
        loc: `${BASE_URL}/public/showroom/case/${encodeSitePath(siteName)}`,
        lastmod: isoDateOnly(blogUpdatedAt) ?? isoDateOnly(blogApprovedAt) ?? undefined,
        changefreq: 'monthly',
        priority: 0.8,
      })
      approvedBlogCount += 1
    }

    const cardNewsPub = readNested<Record<string, unknown>>(metadata, 'cardNewsPublication')
    const isCardNewsPublished = cardNewsPub && cardNewsPub['is_published'] === true
    const cardNewsPublishedAt = cardNewsPub && typeof cardNewsPub['published_at'] === 'string' ? (cardNewsPub['published_at'] as string) : null
    const cardNewsSlug = cardNewsPub && typeof cardNewsPub['slug'] === 'string' ? (cardNewsPub['slug'] as string).trim() : ''
    const cardNewsKey = cardNewsSlug || siteName
    if (isCardNewsPublished) {
      entries.push({
        loc: `${BASE_URL}/public/showroom/cardnews/${encodeSitePath(cardNewsKey)}`,
        lastmod: isoDateOnly(cardNewsPublishedAt) ?? undefined,
        changefreq: 'monthly',
        priority: 0.7,
      })
      publishedCardNewsCount += 1
    }
  }

  // 안정적 정렬: URL 사전순
  entries.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0))

  const sitemap = renderSitemapXml(entries)
  const robots = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${BASE_URL}/sitemap.xml`,
    '',
  ].join('\n')

  const distDir = path.resolve(process.cwd(), 'dist')
  if (!existsSync(distDir)) {
    await mkdir(distDir, { recursive: true })
  }
  const sitemapPath = path.join(distDir, 'sitemap.xml')
  const robotsPath = path.join(distDir, 'robots.txt')
  await writeFile(sitemapPath, sitemap, 'utf8')
  await writeFile(robotsPath, robots, 'utf8')

  console.log(`[buildSitemap] wrote ${sitemapPath} (${entries.length} urls)`)
  console.log(`[buildSitemap]   - approved blog cases: ${approvedBlogCount}`)
  console.log(`[buildSitemap]   - published card news: ${publishedCardNewsCount}`)
  console.log(`[buildSitemap] wrote ${robotsPath}`)
}

main().catch((err) => {
  console.error('[buildSitemap] failed:', err)
  process.exit(1)
})
