import { createClient } from '@supabase/supabase-js'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

type CollectProvider = 'naver_news' | 'naver_local' | 'google_news'

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

/** Google News description: <a>제목</a> <font>매체</font> */
function normalizeGoogleNewsDescription(html: string): string {
  const linkMatch = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)
  const fontMatch = html.match(/<font\b[^>]*>([\s\S]*?)<\/font>/i)
  const headline = stripHtml(linkMatch?.[1] || '')
  const publisher = stripHtml(fontMatch?.[1] || '')
  if (headline && publisher) return `${headline} — ${publisher}`
  if (headline) return headline
  return stripHtml(html)
}

function getNaverCredentials() {
  const clientId = getEnv('NAVER_CLIENT_ID', false) || getEnv('VITE_NAVER_CLIENT_ID', false)
  const clientSecret =
    getEnv('NAVER_CLIENT_SECRET', false) || getEnv('VITE_NAVER_CLIENT_SECRET', false)
  if (!clientId || !clientSecret) {
    throw new Error(
      'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없습니다. BefoAftr .env 값을 Findgagu OS .env(및 Vercel)에 복사하세요.',
    )
  }
  return { clientId, clientSecret }
}

async function naverSearch(path: 'news' | 'local', query: string, opts?: { display?: number; start?: number; sort?: string }) {
  const { clientId, clientSecret } = getNaverCredentials()
  const display = opts?.display ?? (path === 'local' ? 5 : 20)
  const start = opts?.start ?? 1
  const sort = opts?.sort ?? (path === 'news' ? 'date' : 'comment')
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
    const rawDescription = (block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '').trim()
    const description = normalizeGoogleNewsDescription(rawDescription)
    if (!title && !link) continue
    items.push({ title, link, pubDate: pubDate || undefined, description, query })
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
  return collected
}

function resolveProvider(sourceSlug?: string, provider?: string): CollectProvider {
  if (provider === 'naver_news' || provider === 'naver_local' || provider === 'google_news') {
    return provider
  }
  if (sourceSlug?.includes('naver_news')) return 'naver_news'
  if (sourceSlug?.includes('naver_local')) return 'naver_local'
  if (sourceSlug?.includes('google')) return 'google_news'
  return 'naver_news'
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
