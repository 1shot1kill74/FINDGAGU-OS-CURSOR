import { assertInternalAdmin } from '../server/internalAdminAuth'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

type CollectProvider = 'naver_news' | 'naver_local' | 'google_news' | 'naver_blog'

type CollectItem = {
  title: string
  link: string
  pubDate?: string
  description?: string
  query: string
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

const NAVER_NEWS_QUERIES = [
  '학원 개원',
  '학원 이전',
  '학원 리모델링',
  '스터디카페 오픈',
  '스터디카페 인테리어',
  '관리형 독서실 오픈',
  '독서실 리모델링',
  '아파트 커뮤니티 독서실',
  '아파트 스터디룸',
  '학교 특별실 가구',
]

const GOOGLE_NEWS_QUERIES = [
  '학원 개원 OR 학원 이전 OR 학원 리모델링',
  '스터디카페 오픈 OR 스터디카페 인테리어',
  '관리형 독서실 오픈 OR 독서실 리모델링',
  '아파트 커뮤니티 독서실 OR 아파트 스터디룸',
  '학교 특별실 가구 OR 학교 기자재 책상',
]

const NAVER_BLOG_TARGETS: Array<{
  query: string
  industryHint: string
  regionHint?: string
}> = [
  { query: '강남 학원', industryHint: 'academy', regionHint: '강남' },
  { query: '서초 학원', industryHint: 'academy', regionHint: '서초' },
  { query: '송파 학원', industryHint: 'academy', regionHint: '송파' },
  { query: '분당 학원', industryHint: 'academy', regionHint: '분당' },
  { query: '수원 학원', industryHint: 'academy', regionHint: '수원' },
  { query: '목동 학원', industryHint: 'academy', regionHint: '목동' },
  { query: '스터디카페', industryHint: 'study_cafe' },
  { query: '관리형 스터디카페', industryHint: 'study_cafe' },
  { query: '관리형 독서실', industryHint: 'managed_reading_room' },
  { query: '학원 리모델링', industryHint: 'academy' },
  { query: '스터디카페 인테리어', industryHint: 'study_cafe' },
  { query: '독서실 좌석', industryHint: 'managed_reading_room' },
  { query: '학원 개원', industryHint: 'academy' },
  { query: '스터디카페 오픈', industryHint: 'study_cafe' },
]

/** BefoAftr local-search 패턴: 지역 + 교육공간 키워드 */
const NAVER_LOCAL_TARGETS: Array<{
  region: string
  keyword: string
  industryHint: string
}> = [
  { region: '강남구', keyword: '학원', industryHint: 'academy' },
  { region: '서초구', keyword: '학원', industryHint: 'academy' },
  { region: '송파구', keyword: '학원', industryHint: 'academy' },
  { region: '분당', keyword: '학원', industryHint: 'academy' },
  { region: '수원시', keyword: '학원', industryHint: 'academy' },
  { region: '강남구', keyword: '스터디카페', industryHint: 'study_cafe' },
  { region: '서초구', keyword: '스터디카페', industryHint: 'study_cafe' },
  { region: '분당', keyword: '스터디카페', industryHint: 'study_cafe' },
  { region: '수원시', keyword: '스터디카페', industryHint: 'study_cafe' },
  { region: '강남구', keyword: '관리형 독서실', industryHint: 'managed_reading_room' },
  { region: '분당', keyword: '관리형 독서실', industryHint: 'managed_reading_room' },
  { region: '수원시', keyword: '독서실', industryHint: 'managed_reading_room' },
]

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
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCharCode(code) : ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Google News description은 `<a>제목</a> <font>매체</font>`만 주고 요약이 없다.
 * 가짜 요약(제목 — 매체)을 만들지 않는다.
 */
function parseGoogleNewsDescription(html: string): { headline: string; publisher: string } {
  const linkMatch = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)
  const fontMatch = html.match(/<font\b[^>]*>([\s\S]*?)<\/font>/i)
  return {
    headline: stripHtml(linkMatch?.[1] || ''),
    publisher: stripHtml(fontMatch?.[1] || ''),
  }
}

function stripPublisherSuffix(title: string): string {
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
  const keywords = core.match(/(리모델링|개원|이전|오픈|인테리어|재개원|확장|이전\s*오픈)/g) || []

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

function normalizeTitleKey(text: string): string {
  return stripPublisherSuffix(text)
    .toLowerCase()
    .replace(/["'`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeTitleKey(a)
  const nb = normalizeTitleKey(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const head = Math.min(28, na.length, nb.length)
  if (head >= 12 && (na.includes(nb.slice(0, head)) || nb.includes(na.slice(0, head)))) return true
  return false
}

function getNaverCredentials(required = true) {
  const clientId = getEnv('NAVER_CLIENT_ID', false)
  const clientSecret = getEnv('NAVER_CLIENT_SECRET', false)
  if (!clientId || !clientSecret) {
    if (!required) return null
    throw new Error(
      'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없습니다. Vercel/서버 환경변수에만 설정하세요 (VITE_ 금지).',
    )
  }
  return { clientId, clientSecret }
}

async function naverSearch(
  path: 'news' | 'local' | 'blog',
  query: string,
  opts?: { display?: number; start?: number; sort?: string },
) {
  const creds = getNaverCredentials(true)
  if (!creds) throw new Error('네이버 API 키가 없습니다.')
  const { clientId, clientSecret } = creds
  const display = opts?.display ?? (path === 'local' ? 5 : path === 'blog' ? 30 : 20)
  const start = opts?.start ?? 1
  const sort = opts?.sort ?? (path === 'local' ? 'comment' : 'date')
  const url = new URL(`https://openapi.naver.com/v1/search/${path}.json`)
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(display))
  url.searchParams.set('start', String(start))
  url.searchParams.set('sort', sort)

  const res = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`네이버 ${path} 검색 실패 (${res.status}): ${text.slice(0, 180)}`)
  }
  return JSON.parse(text) as {
    items?: Array<Record<string, string>>
    total?: number
  }
}

/**
 * Google News RSS는 요약이 없으므로 네이버 뉴스 검색으로 description·원문을 보강한다.
 * (본문 불러오기용 originallink도 함께 확보)
 */
async function enrichGoogleNewsWithNaverSnippets(items: CollectItem[]): Promise<CollectItem[]> {
  if (!items.length) return items
  if (!getNaverCredentials(false)) return items

  const enriched: CollectItem[] = []
  for (const item of items) {
    const queries = buildNaverEnrichQueries(item.title)
    if (!queries.length) {
      enriched.push({ ...item, description: item.description || '' })
      continue
    }

    let matched:
      | {
          title: string
          link: string
          description: string
          pubDate?: string
        }
      | undefined

    try {
      for (const query of queries) {
        const payload = await naverSearch('news', query, { display: 5, start: 1, sort: 'sim' })
        matched = (payload.items ?? [])
          .map((row) => ({
            title: stripHtml(row.title || ''),
            link: stripHtml(row.originallink || row.link || ''),
            description: stripHtml(row.description || ''),
            pubDate: row.pubDate || undefined,
          }))
          .find((row) => row.description && titlesLikelyMatch(item.title, row.title))
        if (matched) break
      }
    } catch {
      matched = undefined
    }

    if (matched) {
      enriched.push({
        ...item,
        title: matched.title || item.title,
        link: matched.link || item.link,
        pubDate: matched.pubDate || item.pubDate,
        description: matched.description,
      })
      continue
    }

    enriched.push({ ...item, description: '' })
  }
  return enriched
}

async function fetchNaverNews(queries: string[]): Promise<CollectItem[]> {
  const collected: CollectItem[] = []
  const seen = new Set<string>()
  for (const query of queries.slice(0, 10)) {
    const payload = await naverSearch('news', query, { display: 20, start: 1, sort: 'date' })
    for (const item of payload.items ?? []) {
      const title = stripHtml(item.title || '')
      const link = stripHtml(item.originallink || item.link || '')
      const key = link || title
      if (!key || seen.has(key)) continue
      seen.add(key)
      collected.push({
        title,
        link,
        pubDate: item.pubDate || undefined,
        description: stripHtml(item.description || ''),
        query,
      })
    }
  }
  return collected
}

async function fetchNaverLocal(
  targets: Array<{ region: string; keyword: string; industryHint: string }>,
): Promise<CollectItem[]> {
  const collected: CollectItem[] = []
  const seen = new Set<string>()
  for (const target of targets.slice(0, 16)) {
    const query = `${target.region} ${target.keyword}`
    // 공식 문서 기준 local display 최대 5. BefoAftr는 더 크게 쓰기도 했으나 안전하게 5.
    const payload = await naverSearch('local', query, { display: 5, start: 1, sort: 'comment' })
    for (const item of payload.items ?? []) {
      const title = stripHtml(item.title || '')
      const link = stripHtml(item.link || '')
      const telephone = stripHtml(item.telephone || '')
      const address = stripHtml(item.roadAddress || item.address || '')
      const category = stripHtml(item.category || '')
      const key = `${title}|${telephone}|${address}`
      if (!title || seen.has(key)) continue
      // 교육 공간과 무관한 카테고리 1차 제외
      if (/호텔|병원|치킨|미용|부동산|중개|카페(?!.*스터디)/i.test(`${title} ${category}`)) continue
      seen.add(key)
      collected.push({
        title,
        link: link || `https://search.naver.com/search.naver?query=${encodeURIComponent(title)}`,
        description: [category, address, telephone].filter(Boolean).join(' · '),
        query,
        telephone: telephone || undefined,
        address: address || undefined,
        category: category || undefined,
        industryHint: target.industryHint,
        regionHint: target.region,
        intentHint: 'directory',
      })
    }
  }
  return collected
}

function parseNaverPostdateToIso(postdate: string): string | undefined {
  const raw = String(postdate || '').replace(/\D/g, '')
  if (raw.length !== 8) return undefined
  const y = Number(raw.slice(0, 4))
  const m = Number(raw.slice(4, 6))
  const d = Number(raw.slice(6, 8))
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function normalizeBloggerKey(link: string): string {
  return stripHtml(link)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .trim()
}

function activationLevelFromDays(days: number | null): string {
  if (days == null) return 'dormant'
  if (days <= 30) return 'hot'
  if (days <= 90) return 'warm'
  if (days <= 180) return 'cool'
  return 'dormant'
}

/** 네이버 블로그 검색 → blogger 단위 액티베이팅 타겟 */
async function fetchNaverBlogs(
  targets: Array<{ query: string; industryHint: string; regionHint?: string }>,
): Promise<CollectItem[]> {
  type Post = {
    title: string
    link: string
    description: string
    postIso?: string
    query: string
  }
  type Bucket = {
    bloggerName: string
    bloggerLink: string
    posts: Post[]
    industryHint: string
    regionHint?: string
  }

  const byBlogger = new Map<string, Bucket>()

  for (const target of targets.slice(0, 14)) {
    const payload = await naverSearch('blog', target.query, { display: 30, start: 1, sort: 'date' })
    for (const item of payload.items ?? []) {
      const title = stripHtml(item.title || '')
      const link = stripHtml(item.link || '')
      const description = stripHtml(item.description || '')
      const bloggerName = stripHtml(item.bloggername || '')
      const bloggerLink = stripHtml(item.bloggerlink || link)
      const key = normalizeBloggerKey(bloggerLink)
      if (!key || !title) continue

      const hay = `${bloggerName} ${title} ${description}`
      if (!/학원|스터디|독서실|교습|입시|보습|관리형|좌석|인테리어|리모델링|개원|오픈/.test(hay)) {
        continue
      }
      const operatorBlog = /학원|스터디|독서실|클리닉|교습|입시|보습|관리형/.test(bloggerName)
      const reviewOnly = /후기|방문기|체험단|가봤|다녀왔/.test(title) && !operatorBlog
      if (reviewOnly) continue
      // 운영 블로그가 아니면 공간·개원 키워드가 제목에 있을 때만 채택
      if (!operatorBlog && !/학원|스터디카페|독서실|리모델링|인테리어|개원|오픈|좌석|확장/.test(title)) {
        continue
      }

      const postIso = parseNaverPostdateToIso(item.postdate || '')
      const post: Post = { title, link, description, postIso, query: target.query }
      const existing = byBlogger.get(key)
      if (existing) {
        existing.posts.push(post)
        if (!existing.regionHint && target.regionHint) existing.regionHint = target.regionHint
      } else {
        byBlogger.set(key, {
          bloggerName: bloggerName || title.slice(0, 40),
          bloggerLink,
          posts: [post],
          industryHint: target.industryHint,
          regionHint: target.regionHint,
        })
      }
    }
  }

  const now = Date.now()
  const collected: CollectItem[] = []
  for (const bucket of byBlogger.values()) {
    const sorted = [...bucket.posts].sort((a, b) => {
      const ta = a.postIso ? new Date(a.postIso).getTime() : 0
      const tb = b.postIso ? new Date(b.postIso).getTime() : 0
      return tb - ta
    })
    const latest = sorted[0]
    if (!latest) continue
    const lastIso = latest.postIso
    const days =
      lastIso && !Number.isNaN(new Date(lastIso).getTime())
        ? Math.max(0, Math.floor((now - new Date(lastIso).getTime()) / 86400000))
        : null
    const level = activationLevelFromDays(days)
    const recentTitles = sorted
      .slice(0, 5)
      .map((p) => `· ${p.title}`)
      .join('\n')
    const description = [
      `블로그 활성: ${level}` + (days != null ? ` (최근글 ${days}일 전)` : ''),
      `샘플 글 ${sorted.length}건`,
      recentTitles,
      latest.description ? `요약: ${latest.description}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const blogUrl = bucket.bloggerLink.startsWith('http')
      ? bucket.bloggerLink
      : `https://${bucket.bloggerLink}`

    collected.push({
      title: bucket.bloggerName,
      link: blogUrl,
      pubDate: lastIso,
      description,
      query: latest.query,
      industryHint: bucket.industryHint,
      regionHint: bucket.regionHint,
      intentHint: 'blog_activation',
      bloggerLink: blogUrl,
      bloggerName: bucket.bloggerName,
      activationLevel: level,
      samplePostCount: sorted.length,
      lastPostDate: lastIso,
      category: 'naver_blog',
    })
  }

  collected.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return tb - ta
  })
  return collected
}

function decodeXml(text: string) {
  return stripHtml(text)
}

function parseRssItems(xml: string, query: string): CollectItem[] {
  const items: CollectItem[] = []
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
  for (const block of blocks.slice(0, 12)) {
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim())
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim())
    const pubDate = decodeXml((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '').trim())
    const sourceName = decodeXml((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? '').trim())
    const rawDescription = (block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '').trim()
    const blurb = parseGoogleNewsDescription(rawDescription)
    // Google RSS description에는 본문 요약이 없음 → 비워 두고 네이버로 보강
    if (!title && !link) continue
    items.push({
      title: title || blurb.headline,
      link,
      pubDate: pubDate || undefined,
      description: '',
      query,
      // publisher hint는 regionHint 슬롯을 쓰지 않고 title에 이미 포함됨
      // sourceName은 enrich 매칭용으로 query 메타에만 남김
      ...(sourceName || blurb.publisher ? { category: sourceName || blurb.publisher } : {}),
    })
  }
  return items
}

async function fetchGoogleNewsRss(queries: string[]): Promise<CollectItem[]> {
  const collected: CollectItem[] = []
  const seen = new Set<string>()
  for (const query of queries) {
    const url = new URL('https://news.google.com/rss/search')
    url.searchParams.set('q', query)
    url.searchParams.set('hl', 'ko')
    url.searchParams.set('gl', 'KR')
    url.searchParams.set('ceid', 'KR:ko')
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'FindgaguOS-EduOutreach/1.0 (+https://www.findgagu.co.kr)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
    if (!res.ok) throw new Error(`Google News RSS 실패 (${res.status})`)
    const xml = await res.text()
    for (const item of parseRssItems(xml, query)) {
      const key = item.link || item.title
      if (!key || seen.has(key)) continue
      seen.add(key)
      collected.push(item)
    }
  }
  return enrichGoogleNewsWithNaverSnippets(collected)
}

function resolveProvider(sourceSlug?: string, provider?: string): CollectProvider {
  if (
    provider === 'naver_news' ||
    provider === 'naver_local' ||
    provider === 'google_news' ||
    provider === 'naver_blog'
  ) {
    return provider
  }
  if (sourceSlug?.includes('naver_blog') || sourceSlug?.includes('blog')) return 'naver_blog'
  if (sourceSlug?.includes('naver_news')) return 'naver_news'
  if (sourceSlug?.includes('naver_local')) return 'naver_local'
  if (sourceSlug?.includes('google')) return 'google_news'
  return 'naver_blog'
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
      queries?: string[]
      sourceSlug?: string
      provider?: CollectProvider
      regions?: string[]
    }

    const provider = resolveProvider(body.sourceSlug, body.provider)
    let items: CollectItem[] = []

    if (provider === 'naver_news') {
      const queries =
        Array.isArray(body.queries) && body.queries.length
          ? body.queries.map((q) => String(q).trim()).filter(Boolean).slice(0, 10)
          : NAVER_NEWS_QUERIES
      items = await fetchNaverNews(queries)
    } else if (provider === 'naver_local') {
      const regionFilter = Array.isArray(body.regions)
        ? body.regions.map((r) => String(r).trim()).filter(Boolean)
        : []
      const targets = regionFilter.length
        ? NAVER_LOCAL_TARGETS.filter((t) => regionFilter.includes(t.region))
        : NAVER_LOCAL_TARGETS
      items = await fetchNaverLocal(targets.length ? targets : NAVER_LOCAL_TARGETS)
    } else if (provider === 'naver_blog') {
      items = await fetchNaverBlogs(NAVER_BLOG_TARGETS)
    } else {
      const queries =
        Array.isArray(body.queries) && body.queries.length
          ? body.queries.map((q) => String(q).trim()).filter(Boolean).slice(0, 6)
          : GOOGLE_NEWS_QUERIES
      items = await fetchGoogleNewsRss(queries)
    }

    res.status(200).json({
      ok: true,
      source: provider,
      itemCount: items.length,
      items: items.slice(0, 80),
      compliance: {
        public_source_only: true,
        official_api: provider.startsWith('naver'),
        no_sns_login: true,
        no_auto_dm: true,
        human_approval_required: true,
        phone_auto_dial_forbidden: true,
      },
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '수집 실패',
    })
  }
}
