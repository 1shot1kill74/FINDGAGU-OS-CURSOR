/**
 * 쇼룸 케이스 "블로그 정본" — Google/네이버/내부 쇼룸이 공유하는 단일 스냅샷.
 *
 * 저장 위치: `public.showroom_case_profiles.metadata` → {@link CANONICAL_BLOG_METADATA_KEY}
 *
 * - `bodyHtml`: 내부 쇼룸·배포 어댑터가 그대로 쓰는 HTML (이미지 figure, 캡션, SEO/AEO/GEO 섹션 포함)
 * - `images[]`: 본문에 삽입된 이미지의 식별·접근성·캡션 (필요 시 bodyHtml과 동기화)
 * - `seo` / `aeoGeo`: 메타·답변엔진용 필드
 *
 * 흐름: 카드뉴스(슬라이드) → (n8n/에디터) 이 정본을 채움 → 승인 → 어댑터가 구글·네이버 포맷으로 변환.
 */

import type { ShowroomCaseN8nImageContextItem } from '@/lib/showroomCaseContentPackage'

export const CANONICAL_BLOG_METADATA_KEY = 'canonical_blog_post'

export type ShowroomCaseCanonicalBlogStatus = 'draft' | 'review' | 'approved' | 'archived'

export type ShowroomCaseCanonicalBlogImagePlacement = 'inline' | 'full' | 'compare-row'

/** 본문에 포함된 한 장의 이미지 (삽입 위치는 bodyHtml 또는 placement 힌트로 표현). */
export type ShowroomCaseCanonicalBlogImageBlock = {
  /** 클라이언트·어댑터에서 안정적으로 참조하기 위한 ID */
  id: string
  /** `image_assets.id` 등 */
  imageAssetId?: string | null
  /** 게시용 URL (워터마크/변환 적용본 권장) */
  url: string
  alt: string
  caption?: string | null
  placement?: ShowroomCaseCanonicalBlogImagePlacement | null
}

export type ShowroomCaseCanonicalBlogSeo = {
  /** 검색 결과·포스트 제목 */
  title: string
  seoDescription: string
  keywords?: string[]
  /** 홈페이지 내 canonical 경로 (예: `/public/showroom/cardnews/foo`). 전체 블로그 URL 아님. */
  canonicalPath?: string | null
  ogTitle?: string | null
  ogDescription?: string | null
}

export type ShowroomCaseCanonicalBlogFaqItem = {
  question: string
  answer: string
}

/** AEO/GEO 등 답변·생성형 엔진용 보조 블록 */
export type ShowroomCaseCanonicalBlogStructured = {
  featuredAnswer?: string | null
  faqItems?: ShowroomCaseCanonicalBlogFaqItem[]
  geoPoints?: string[]
}

export type ShowroomCaseCanonicalBlogPostV1 = {
  schemaVersion: 1
  status: ShowroomCaseCanonicalBlogStatus
  /** 프로필 `site_name`과 동일해야 함 */
  siteName: string
  /** 카드뉴스 생성 결과와 매칭할 때 사용 (선택) */
  cardNewsGenerationRef?: string | null
  /** 사람이 읽기 좋은 제목 (본문 첫 헤딩과 동일해도 됨) */
  title: string
  /** 정본의 원본 마크다운. 렌더 시 `bodyHtml`보다 우선하는 source of truth. */
  bodyMarkdown?: string | null
  /** 이미지 figure, 캡션, SEO/AEO/GEO 섹션까지 포함한 단일 HTML */
  bodyHtml: string
  images: ShowroomCaseCanonicalBlogImageBlock[]
  seo: ShowroomCaseCanonicalBlogSeo
  structured?: ShowroomCaseCanonicalBlogStructured | null
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
  approvedBy?: string | null
}

export type ShowroomCaseCanonicalBlogPost = ShowroomCaseCanonicalBlogPostV1

function readString(record: Record<string, unknown>, key: string): string | null {
  const v = record[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function parseImages(value: unknown): ShowroomCaseCanonicalBlogImageBlock[] | null {
  if (!Array.isArray(value)) return null
  const out: ShowroomCaseCanonicalBlogImageBlock[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const img = raw as Record<string, unknown>
    const id = readString(img, 'id')
    const url = readString(img, 'url')
    const alt = readString(img, 'alt')
    if (!id || !url || !alt) continue
    const placement = readString(img, 'placement')
    const allowed: ShowroomCaseCanonicalBlogImagePlacement[] = ['inline', 'full', 'compare-row']
    const placementNorm =
      placement && allowed.includes(placement as ShowroomCaseCanonicalBlogImagePlacement)
        ? (placement as ShowroomCaseCanonicalBlogImagePlacement)
        : null
    const imageAssetId = readString(img, 'imageAssetId') ?? readString(img, 'image_asset_id')
    const caption = readString(img, 'caption')
    out.push({
      id,
      url,
      alt,
      imageAssetId: imageAssetId ?? null,
      caption: caption ?? null,
      placement: placementNorm,
    })
  }
  return out
}

function parseSeo(raw: unknown): ShowroomCaseCanonicalBlogSeo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const title = readString(record, 'title')
  const seoDescription =
    readString(record, 'seoDescription') ??
    readString(record, 'seo_description') ??
    readString(record, 'description')
  if (!title || !seoDescription) return null

  const keywordsRaw = record.keywords ?? record.keyword_list
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((k) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean)
    : undefined

  const canonicalPath =
    readString(record, 'canonicalPath') ?? readString(record, 'canonical_path')
  const ogTitle = readString(record, 'ogTitle') ?? readString(record, 'og_title')
  const ogDescription = readString(record, 'ogDescription') ?? readString(record, 'og_description')

  return {
    title,
    seoDescription,
    ...(keywords?.length ? { keywords } : {}),
    canonicalPath: canonicalPath ?? null,
    ogTitle: ogTitle ?? null,
    ogDescription: ogDescription ?? null,
  }
}

function parseStructured(raw: unknown): ShowroomCaseCanonicalBlogStructured | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const featuredAnswer =
    readString(record, 'featuredAnswer') ??
    readString(record, 'featured_answer')
  const geoRaw = record.geoPoints ?? record.geo_points
  const geoPoints = Array.isArray(geoRaw)
    ? geoRaw.map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean)
    : undefined

  const faqRaw = record.faqItems ?? record.faq_items ?? record.faq_qas
  let faqItems: ShowroomCaseCanonicalBlogFaqItem[] | undefined
  if (Array.isArray(faqRaw)) {
    faqItems = faqRaw
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null
        const f = item as Record<string, unknown>
        const q = readString(f, 'question') ?? readString(f, 'q')
        const a = readString(f, 'answer') ?? readString(f, 'a')
        if (!q || !a) return null
        return { question: q, answer: a }
      })
      .filter(Boolean) as ShowroomCaseCanonicalBlogFaqItem[]
  }

  if (!featuredAnswer && !faqItems?.length && !geoPoints?.length) return null
  return {
    featuredAnswer: featuredAnswer ?? null,
    ...(faqItems?.length ? { faqItems } : {}),
    ...(geoPoints?.length ? { geoPoints } : {}),
  }
}

/**
 * `showroom_case_profiles.metadata`에서 정본을 읽습니다. 형식이 맞지 않으면 `null`.
 */
export function parseCanonicalBlogPostFromMetadata(metadata: unknown): ShowroomCaseCanonicalBlogPost | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const root = metadata as Record<string, unknown>
  const raw = root[CANONICAL_BLOG_METADATA_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>

  const schemaVersion = Number(record.schemaVersion ?? record.schema_version)
  if (schemaVersion !== 1) return null

  const status = readString(record, 'status')
  const allowedStatus: ShowroomCaseCanonicalBlogStatus[] = ['draft', 'review', 'approved', 'archived']
  if (!status || !allowedStatus.includes(status as ShowroomCaseCanonicalBlogStatus)) return null

  const siteName = readString(record, 'siteName') ?? readString(record, 'site_name')
  const title = readString(record, 'title')
  const bodyMarkdown = readString(record, 'bodyMarkdown') ?? readString(record, 'body_markdown')
  const bodyHtml = readString(record, 'bodyHtml') ?? readString(record, 'body_html')
  const createdAt = readString(record, 'createdAt') ?? readString(record, 'created_at')
  const updatedAt = readString(record, 'updatedAt') ?? readString(record, 'updated_at')

  if (!siteName || !title || !bodyHtml || !createdAt || !updatedAt) return null

  const images = parseImages(record.images)
  if (!images) return null

  const seo = parseSeo(record.seo)
  if (!seo) return null

  const structured =
    parseStructured(record.structured) ??
    parseStructured(record.aeo_geo) ??
    parseStructured(record.aeoGeo)

  const cardNewsGenerationRef =
    readString(record, 'cardNewsGenerationRef') ?? readString(record, 'card_news_generation_ref')
  const approvedAt = readString(record, 'approvedAt') ?? readString(record, 'approved_at')
  const approvedBy = readString(record, 'approvedBy') ?? readString(record, 'approved_by')

  return {
    schemaVersion: 1,
    status: status as ShowroomCaseCanonicalBlogStatus,
    siteName,
    title,
    bodyMarkdown: bodyMarkdown ?? null,
    bodyHtml,
    images,
    seo,
    ...(structured ? { structured } : {}),
    cardNewsGenerationRef: cardNewsGenerationRef ?? null,
    createdAt,
    updatedAt,
    approvedAt: approvedAt ?? null,
    approvedBy: approvedBy ?? null,
  }
}

/** DB/SQL 저장용으로 정본 객체를 평문 레코드로 직렬화합니다. */
export function serializeCanonicalBlogPost(post: ShowroomCaseCanonicalBlogPost): Record<string, unknown> {
  return {
    schema_version: post.schemaVersion,
    schemaVersion: post.schemaVersion,
    status: post.status,
    site_name: post.siteName,
    siteName: post.siteName,
    title: post.title,
    body_markdown: post.bodyMarkdown ?? null,
    bodyMarkdown: post.bodyMarkdown ?? null,
    body_html: post.bodyHtml,
    bodyHtml: post.bodyHtml,
    images: post.images.map((img) => ({
      id: img.id,
      image_asset_id: img.imageAssetId ?? null,
      imageAssetId: img.imageAssetId ?? null,
      url: img.url,
      alt: img.alt,
      caption: img.caption ?? null,
      placement: img.placement ?? null,
    })),
    seo: {
      title: post.seo.title,
      seo_description: post.seo.seoDescription,
      seoDescription: post.seo.seoDescription,
      ...(post.seo.keywords?.length ? { keywords: post.seo.keywords } : {}),
      canonical_path: post.seo.canonicalPath ?? null,
      canonicalPath: post.seo.canonicalPath ?? null,
      og_title: post.seo.ogTitle ?? null,
      ogTitle: post.seo.ogTitle ?? null,
      og_description: post.seo.ogDescription ?? null,
      ogDescription: post.seo.ogDescription ?? null,
    },
    ...(post.structured
      ? {
          structured: {
            featured_answer: post.structured.featuredAnswer ?? null,
            featuredAnswer: post.structured.featuredAnswer ?? null,
            faq_items: post.structured.faqItems ?? [],
            faqItems: post.structured.faqItems ?? [],
            geo_points: post.structured.geoPoints ?? [],
            geoPoints: post.structured.geoPoints ?? [],
          },
        }
      : {}),
    card_news_generation_ref: post.cardNewsGenerationRef ?? null,
    cardNewsGenerationRef: post.cardNewsGenerationRef ?? null,
    created_at: post.createdAt,
    createdAt: post.createdAt,
    updated_at: post.updatedAt,
    updatedAt: post.updatedAt,
    approved_at: post.approvedAt ?? null,
    approvedAt: post.approvedAt ?? null,
    approved_by: post.approvedBy ?? null,
    approvedBy: post.approvedBy ?? null,
  }
}

/**
 * 미리보기 등에서 `images[]`를 추가 렌더할 때, 본문 HTML에 이미 같은 URL로 삽입된 경우는 생략한다.
 * (이스케이프된 src 속성도 대략 매칭)
 */
export function filterCanonicalBlogImagesNotInBodyHtml(
  bodyHtml: string,
  images: ShowroomCaseCanonicalBlogImageBlock[],
): ShowroomCaseCanonicalBlogImageBlock[] {
  const html = String(bodyHtml ?? '')
  return images.filter((img) => {
    const u = img.url?.trim()
    if (!u) return false
    if (html.includes(u)) return false
    const amp = u.replace(/&/g, '&amp;')
    if (html.includes(amp)) return false
    return true
  })
}

/**
 * 화면 렌더의 진실 원천은 `bodyMarkdown`이다.
 * - 새 정본: `bodyMarkdown` → 최신 파서로 매 렌더마다 HTML 생성
 * - 구 정본: `bodyHtml` fallback
 */
export function renderCanonicalBlogPostHtml(post: ShowroomCaseCanonicalBlogPost): string {
  const markdown = post.bodyMarkdown?.trim()
  if (markdown) return plainMarkdownToSafeArticleHtml(markdown)
  return post.bodyHtml
}

/**
 * 기존 정본에 `bodyMarkdown`이 없으면, 저장돼 있는 n8n blog 응답에서 다시 채운다.
 * 파서가 개선되면 이 경로로 재렌더된 `bodyHtml`도 함께 최신화된다.
 */
export function hydrateCanonicalBlogPostFromGenerationResponse(
  post: ShowroomCaseCanonicalBlogPost | null,
  generationResponse: unknown,
): ShowroomCaseCanonicalBlogPost | null {
  if (!post) return null
  if (post.bodyMarkdown?.trim()) return post
  const extracted = extractN8nShowroomCaseBlogPayload(generationResponse)
  if (!extracted?.bodyMarkdown?.trim()) return post
  return {
    ...post,
    bodyMarkdown: extracted.bodyMarkdown.trim(),
    bodyHtml: plainMarkdownToSafeArticleHtml(extracted.bodyMarkdown.trim()),
  }
}

export type CanonicalBlogPreviewFigure = {
  url: string
  alt: string
}

function buildCanonicalBlogPreviewFigureHtml(
  figure: CanonicalBlogPreviewFigure,
  options?: { caption?: string | null },
): string {
  const srcEsc = escapeHtmlForCanonicalBlog(figure.url)
  const altEsc = escapeHtmlForCanonicalBlog(figure.alt)
  const caption = options?.caption?.trim()
  const captionHtml = caption
    ? `<figcaption class="px-1 pt-2 text-center text-xs leading-relaxed text-neutral-500">${escapeHtmlForCanonicalBlog(caption)}</figcaption>`
    : ''
  return `<figure class="my-6 mx-auto max-w-3xl"><img src="${srcEsc}" alt="${altEsc}" class="w-full rounded-lg object-cover" loading="lazy" decoding="async" />${captionHtml}</figure>`
}

/**
 * 오래된 정본에 상대경로/깨진 토큰(`_6888_...`)이 `<img src>`로 저장된 경우
 * 미리보기에서는 제거한다. 유효한 https URL 이미지만 유지한다.
 */
function stripBrokenImgTagsFromHtml(html: string): string {
  const withoutBrokenImgs = String(html ?? '').replace(
    /<img\b([^>]*?)src=(["'])(.*?)\2([^>]*)>/gi,
    (full: string, _before: string, _quote: string, src: string) =>
      sanitizeCanonicalBlogHttpsUrl(src) ? full : '',
  )

  return withoutBrokenImgs
    .replace(/<figure\b[^>]*>\s*<\/figure>/gi, '')
    .replace(/<p\b[^>]*>\s*(?:<br\s*\/?>|\s|&nbsp;)*<\/p>/gi, '')
}

function findPreviewFigureForBrokenTail(
  marker: string,
  figures: CanonicalBlogPreviewFigure[],
  usedUrls: Set<string>,
): CanonicalBlogPreviewFigure | null {
  const trimmed = marker.trim().replace(/\)+$/, '')
  const idTail = trimmed.match(/([a-z0-9]{6,})$/i)?.[1]?.toLowerCase() ?? ''
  const direct = figures.find((fig) => {
    if (usedUrls.has(fig.url)) return false
    const url = fig.url.toLowerCase()
    const alt = fig.alt.toLowerCase()
    return (
      (idTail.length > 0 && url.includes(idTail)) ||
      url.includes(trimmed.toLowerCase()) ||
      alt.includes(trimmed.toLowerCase())
    )
  })
  if (direct) return direct
  return figures.find((fig) => !usedUrls.has(fig.url)) ?? null
}

/**
 * 저장된 오래된 정본의 깨진 이미지 꼬리(`_6888_책상_xxxx)`)를 화면 렌더 시 복구한다.
 * - 꼬리 줄이 붙은 문단은 해당 꼬리를 제거한 뒤, 매칭되는 이미지를 바로 아래에 삽입
 * - 남은 이미지는 본문 끝에 순서대로 보강
 */
export function repairCanonicalBlogBodyHtmlForPreview(
  bodyHtml: string,
  figures: CanonicalBlogPreviewFigure[],
): string {
  const uniqueFigures = figures.filter((fig, index, arr) => {
    const url = fig.url?.trim()
    if (!url) return false
    return arr.findIndex((item) => item.url === url) === index
  })
  if (uniqueFigures.length === 0) return String(bodyHtml ?? '')

  const usedUrls = new Set<string>()
  let html = stripBrokenImgTagsFromHtml(bodyHtml)

  html = html.replace(
    /<p([^>]*)>([\s\S]*?)<br\s*\/?>\s*(_[^<]+?)\)\s*<\/p>/g,
    (_match, attrs: string, before: string, marker: string) => {
      const figure = findPreviewFigureForBrokenTail(marker, uniqueFigures, usedUrls)
      const cleanedText = before.replace(/<br\s*\/?>\s*$/, '').trim()
      const paragraph = cleanedText ? `<p${attrs}>${cleanedText}</p>` : ''
      if (!figure) return paragraph
      usedUrls.add(figure.url)
      return buildCanonicalBlogPreviewFigureHtml(figure, {
        caption: cleanedText
          ? cleanedText
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : null,
      })
    },
  )

  html = html.replace(
    /<p([^>]*)>\s*(_[^<]+?)\)\s*<\/p>/g,
    (_match, _attrs: string, marker: string) => {
      const figure = findPreviewFigureForBrokenTail(marker, uniqueFigures, usedUrls)
      if (!figure) return ''
      usedUrls.add(figure.url)
      return buildCanonicalBlogPreviewFigureHtml(figure)
    },
  )

  const remaining = uniqueFigures.filter((fig) => !usedUrls.has(fig.url))
  if (remaining.length === 0) return html
  const inject = remaining.map(buildCanonicalBlogPreviewFigureHtml).join('')
  const closeIdx = html.lastIndexOf('</article>')
  if (closeIdx !== -1) return `${html.slice(0, closeIdx)}${inject}${html.slice(closeIdx)}`
  return `${html}${inject}`
}

/** LLM/사용자 입력을 그대로 넣기 전 이스케이프 (정본 `bodyHtml`은 신뢰 가능한 파이프라인에서만 조합). */
export function escapeHtmlForCanonicalBlog(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeCanonicalBlogHttpsUrl(raw: string): string | null {
  const u = String(raw ?? '').trim()
  if (!/^https:\/\//i.test(u) || u.length > 4096) return null
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

type MarkdownChunk =
  | { kind: 'text'; text: string }
  | { kind: 'img'; alt: string; urlRaw: string }

function readMarkdownImageUrl(block: string, startIndex: number): { urlRaw: string; endIndex: number } | null {
  if (block[startIndex] !== '(') return null
  let depth = 0
  let cursor = startIndex
  let url = ''
  while (cursor < block.length) {
    const ch = block[cursor]
    if (ch === '(') {
      depth += 1
      if (depth > 1) url += ch
      cursor += 1
      continue
    }
    if (ch === ')') {
      depth -= 1
      if (depth === 0) {
        return {
          urlRaw: url.trim(),
          endIndex: cursor + 1,
        }
      }
      if (depth < 0) return null
      url += ch
      cursor += 1
      continue
    }
    url += ch
    cursor += 1
  }
  return null
}

/** `![alt](url)` 마크다운 이미지 한 줄(블록 내 여러 개 가능). URL 안 괄호도 허용. */
function parseMarkdownChunks(block: string): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = []
  let last = 0
  let cursor = 0
  while (cursor < block.length) {
    const bangIndex = block.indexOf('![', cursor)
    if (bangIndex === -1) break
    const altEnd = block.indexOf('](', bangIndex + 2)
    if (altEnd === -1) break
    const alt = block.slice(bangIndex + 2, altEnd)
    const urlInfo = readMarkdownImageUrl(block, altEnd + 1)
    if (!urlInfo) {
      cursor = altEnd + 2
      continue
    }
    if (bangIndex > last) chunks.push({ kind: 'text', text: block.slice(last, bangIndex) })
    chunks.push({ kind: 'img', alt, urlRaw: urlInfo.urlRaw })
    last = urlInfo.endIndex
    cursor = urlInfo.endIndex
  }
  if (last < block.length) chunks.push({ kind: 'text', text: block.slice(last) })
  if (chunks.length === 0) chunks.push({ kind: 'text', text: block })
  return chunks
}

function renderMarkdownBlockHtml(block: string): string {
  const trimmed = block.trim()
  if (!trimmed) return ''
  const chunks = parseMarkdownChunks(trimmed)
  const pieces: string[] = []
  let textBuf = ''
  const flushText = () => {
    const t = textBuf.trim()
    if (!t) return
    pieces.push(`<p class="mb-4 leading-relaxed text-neutral-800">${escapeHtmlForCanonicalBlog(t).replace(/\n/g, '<br />')}</p>`)
    textBuf = ''
  }
  for (const ch of chunks) {
    if (ch.kind === 'text') {
      textBuf += ch.text
      continue
    }
    flushText()
    const safeUrl = sanitizeCanonicalBlogHttpsUrl(ch.urlRaw)
    if (safeUrl) {
      const srcEsc = escapeHtmlForCanonicalBlog(safeUrl)
      const altEsc = escapeHtmlForCanonicalBlog(ch.alt)
      pieces.push(
        `<figure class="my-6 mx-auto max-w-3xl"><img src="${srcEsc}" alt="${altEsc}" class="w-full rounded-lg object-cover" loading="lazy" decoding="async" /></figure>`,
      )
    } else {
      textBuf += `![${ch.alt}](${ch.urlRaw})`
    }
  }
  flushText()
  return pieces.join('')
}

/** 마크다운 본문을 안전 HTML로 변환. 단락(`\\n\\n`) 구분, `![alt](https…)` 이미지는 figure/img로 렌더. */
export function plainMarkdownToSafeArticleHtml(markdown: string): string {
  const t = String(markdown ?? '').trim()
  if (!t) return '<article class="showroom-canonical-blog"></article>'
  const blocks = t.split(/\n\n+/).filter(Boolean)
  const inner = blocks.map(renderMarkdownBlockHtml).join('')
  return `<article class="showroom-canonical-blog space-y-1 max-w-none">${inner}</article>`
}

export type N8nShowroomCaseBlogPayload = {
  title: string
  summary: string
  bodyMarkdown: string
}

/** 쇼룸 케이스 n8n 웹훅 응답에서 블로그 JSON을 꺼냅니다 (`블로그 결과 정리` 노드 출력 형식). */
export function extractN8nShowroomCaseBlogPayload(parsed: unknown): N8nShowroomCaseBlogPayload | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const root = parsed as Record<string, unknown>
  const payload = root.payload && typeof root.payload === 'object' && !Array.isArray(root.payload)
    ? (root.payload as Record<string, unknown>)
    : root
  const blog = payload.blog && typeof payload.blog === 'object' && !Array.isArray(payload.blog)
    ? (payload.blog as Record<string, unknown>)
    : null
  if (!blog) return null

  const title = typeof blog.title === 'string' ? blog.title.trim() : ''
  const summary = typeof blog.summary === 'string' ? blog.summary.trim() : ''
  const bodyMarkdown =
    typeof blog.body_markdown === 'string'
      ? blog.body_markdown.trim()
      : typeof blog.bodyMarkdown === 'string'
        ? blog.bodyMarkdown.trim()
        : ''

  if (!title || !bodyMarkdown) return null

  return {
    title,
    summary,
    bodyMarkdown,
  }
}

export type BuildCanonicalBlogFromN8nParams = {
  siteName: string
  n8nResponse: unknown
  /** 비포·애프 대표 컷 URL (카드뉴스와 동일 출처 권장) */
  beforeImageUrl?: string | null
  afterImageUrl?: string | null
  /** 웹훅과 동일한 현장 이미지 목록 — 본문에 URL이 빠져도 저장 시 마크다운 이미지로 보강 */
  imageContext?: ShowroomCaseN8nImageContextItem[] | null
  /** 최초 저장 시각 유지용(재저장 시에는 기존 값 전달) */
  existingCreatedAt?: string | null
}

function altFromImageContextRow(row: ShowroomCaseN8nImageContextItem): string {
  const s = row.summaryLine?.trim()
  if (s) return s.length > 140 ? `${s.slice(0, 137)}…` : s
  const bits = [
    row.beforeAfter === 'before' ? '비포' : row.beforeAfter === 'after' ? '애프터' : '',
    row.productName,
    row.colorName,
    row.location,
  ].filter(Boolean) as string[]
  return bits.join(' · ') || '현장 이미지'
}

/**
 * LLM이 `![alt](https://…)` 대신 캡션 아래에 `_6888_책상_mn0125vz)` 같은 꼬리만 두는 경우 제거한다.
 */
export function stripBrokenBlogImageTailLines(markdown: string): string {
  const out = String(markdown ?? '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (/^\s*_\d+_[^\s(]+\)\s*$/.test(line)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out
}

type InjectFigure = { url: string; alt: string }

/** 본문 HTML에 아직 없는 URL을 `</article>` 직전에 figure/img로 삽입한다. */
function injectMissingImageFiguresIntoArticleHtml(
  bodyHtml: string,
  figures: InjectFigure[],
): string {
  let html = String(bodyHtml ?? '')
  const pieces: string[] = []
  const seen = new Set<string>()
  for (const fig of figures) {
    const url = fig.url?.trim()
    if (!url || !/^https:\/\//i.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    const srcEsc = escapeHtmlForCanonicalBlog(url)
    if (html.includes(`src="${srcEsc}"`) || html.includes(srcEsc)) continue
    const altEsc = escapeHtmlForCanonicalBlog(fig.alt)
    pieces.push(
      `<figure class="my-6 mx-auto max-w-3xl"><img src="${srcEsc}" alt="${altEsc}" class="w-full rounded-lg object-cover" loading="lazy" decoding="async" /></figure>`,
    )
  }
  if (pieces.length === 0) return html
  const inject = pieces.join('')
  const closeIdx = html.lastIndexOf('</article>')
  if (closeIdx !== -1) return `${html.slice(0, closeIdx)}${inject}${html.slice(closeIdx)}`
  return `${html}${inject}`
}

function buildInjectFiguresFromContextAndHeroes(params: {
  imageContext: ShowroomCaseN8nImageContextItem[] | undefined | null
  siteName: string
  beforeUrl?: string | null
  afterUrl?: string | null
}): InjectFigure[] {
  const out: InjectFigure[] = []
  const bu = params.beforeUrl?.trim()
  const au = params.afterUrl?.trim()
  const sn = params.siteName.trim()
  if (bu && /^https:\/\//i.test(bu)) {
    out.push({ url: bu, alt: `${sn} 비포 현장` })
  }
  if (au && /^https:\/\//i.test(au)) {
    out.push({ url: au, alt: `${sn} 애프터 현장` })
  }
  const ctx = Array.isArray(params.imageContext) ? params.imageContext : []
  for (const row of ctx) {
    const url = row.url?.trim()
    if (!url || !/^https:\/\//i.test(url)) continue
    out.push({ url, alt: altFromImageContextRow(row) })
  }
  return out
}

/**
 * n8n `body_markdown`에 `![…](https…)`가 빠졌거나 깨져도, 작업실에서 보낸 `imageContext` URL로 본문을 보강한다.
 * 이미 본문에 포함된 URL은 중복 삽입하지 않는다.
 */
export function mergeBlogBodyMarkdownWithImageContext(
  bodyMarkdown: string,
  imageContext: ShowroomCaseN8nImageContextItem[] | undefined | null,
): string {
  const base = String(bodyMarkdown ?? '').trim()
  const items = Array.isArray(imageContext) ? imageContext : []
  const additions: string[] = []
  for (const row of items) {
    const url = row.url?.trim()
    if (!url || !/^https:\/\//i.test(url)) continue
    if (base.includes(url)) continue
    if (additions.some((block) => block.includes(url))) continue
    const alt = altFromImageContextRow(row).replace(/\]/g, '］').replace(/\[/g, '［')
    additions.push(`![${alt}](${url})`)
  }
  if (additions.length === 0) return base
  return [base, ...additions].filter(Boolean).join('\n\n')
}

/**
 * `channel: blog` n8n 응답과 현장 메타를 합쳐 `canonical_blog_post` 초안을 만듭니다.
 * 이미지·SEO 블록은 이후 에디터/n8n 고도화 시 확장합니다.
 */
export function buildCanonicalBlogPostFromN8nBlogResponse(params: BuildCanonicalBlogFromN8nParams): ShowroomCaseCanonicalBlogPost | null {
  const extracted = extractN8nShowroomCaseBlogPayload(params.n8nResponse)
  if (!extracted) return null

  const now = new Date().toISOString()
  const createdAt = params.existingCreatedAt?.trim() || now

  const images: ShowroomCaseCanonicalBlogImageBlock[] = []
  const seenImageUrls = new Set<string>()
  const beforeUrl = params.beforeImageUrl?.trim()
  if (beforeUrl) {
    seenImageUrls.add(beforeUrl)
    images.push({
      id: 'before-hero',
      url: beforeUrl,
      alt: `${params.siteName} 비포 현장`,
      caption: '비포',
      placement: 'full',
    })
  }
  const afterUrl = params.afterImageUrl?.trim()
  if (afterUrl) {
    seenImageUrls.add(afterUrl)
    images.push({
      id: 'after-hero',
      url: afterUrl,
      alt: `${params.siteName} 애프터 현장`,
      caption: '애프터',
      placement: 'full',
    })
  }

  const ctx = params.imageContext ?? []
  for (const row of ctx) {
    const url = row.url?.trim()
    if (!url || !/^https:\/\//i.test(url)) continue
    if (seenImageUrls.has(url)) continue
    seenImageUrls.add(url)
    images.push({
      id: `asset-${row.assetId}`,
      imageAssetId: row.assetId,
      url,
      alt: altFromImageContextRow(row),
      caption: null,
      placement: 'inline',
    })
  }

  const cleanedMarkdown = stripBrokenBlogImageTailLines(extracted.bodyMarkdown)
  const mergedMarkdown = mergeBlogBodyMarkdownWithImageContext(cleanedMarkdown, ctx)
  let bodyHtml = plainMarkdownToSafeArticleHtml(mergedMarkdown)
  bodyHtml = injectMissingImageFiguresIntoArticleHtml(
    bodyHtml,
    buildInjectFiguresFromContextAndHeroes({
      imageContext: ctx,
      siteName: params.siteName,
      beforeUrl: params.beforeImageUrl,
      afterUrl: params.afterImageUrl,
    }),
  )
  const summaryForSeo = extracted.summary.trim()
  const seoDescription =
    summaryForSeo.length > 160 ? `${summaryForSeo.slice(0, 157)}…` : summaryForSeo || `${extracted.title} — 파인드가구 온라인 쇼룸 사례`

  return {
    schemaVersion: 1,
    status: 'draft',
    siteName: params.siteName.trim(),
    title: extracted.title,
    bodyMarkdown: mergedMarkdown,
    bodyHtml,
    images,
    seo: {
      title: extracted.title,
      seoDescription,
      ogTitle: extracted.title,
      ogDescription: seoDescription,
    },
    structured: summaryForSeo
      ? { featuredAnswer: summaryForSeo }
      : null,
    cardNewsGenerationRef: null,
    createdAt,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
  }
}
