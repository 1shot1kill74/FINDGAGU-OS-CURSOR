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
import {
  parseShowroomBlogQaReview,
  serializeShowroomBlogQaReview,
  type ShowroomBlogQaReview,
} from '@/lib/showroomCaseBlogQa'

export const CANONICAL_BLOG_METADATA_KEY = 'canonical_blog_post'

export type ShowroomCaseCanonicalBlogStatus =
  | 'draft'
  | 'review'
  | 'scheduled'
  | 'approved'
  | 'archived'

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
  /** 쇼룸 라이트박스와 동일한 사진 오버레이용 메타 */
  beforeAfter?: 'before' | 'after' | null
  productName?: string | null
  colorName?: string | null
}

/** 블로그 사진 우측 상단 오버레이 (Before/After · 제품명 · 색상) */
export type ShowroomCaseBlogImageOverlayMeta = {
  beforeAfter?: 'before' | 'after' | null
  productName?: string | null
  colorName?: string | null
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
  /** 예약 공개 시각 (ISO). status === 'scheduled' 일 때 사용 */
  scheduledAt?: string | null
  approvedAt?: string | null
  approvedBy?: string | null
  /** SEO/AEO 자동 검수 결과 (생성 직후 채점) */
  qaReview?: ShowroomBlogQaReview | null
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
    const beforeAfterRaw =
      readString(img, 'beforeAfter') ?? readString(img, 'before_after') ?? readString(img, 'before_after_role')
    const beforeAfter =
      beforeAfterRaw === 'before' || beforeAfterRaw === 'after' ? beforeAfterRaw : null
    const productName = readString(img, 'productName') ?? readString(img, 'product_name')
    const colorName = readString(img, 'colorName') ?? readString(img, 'color_name')
    out.push({
      id,
      url,
      alt,
      imageAssetId: imageAssetId ?? null,
      caption: caption ?? null,
      placement: placementNorm,
      beforeAfter,
      productName: productName ?? null,
      colorName: colorName ?? null,
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
  const allowedStatus: ShowroomCaseCanonicalBlogStatus[] = [
    'draft',
    'review',
    'scheduled',
    'approved',
    'archived',
  ]
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
  const scheduledAt = readString(record, 'scheduledAt') ?? readString(record, 'scheduled_at')
  const approvedAt = readString(record, 'approvedAt') ?? readString(record, 'approved_at')
  const approvedBy = readString(record, 'approvedBy') ?? readString(record, 'approved_by')
  const qaReview =
    parseShowroomBlogQaReview(record.qaReview) ??
    parseShowroomBlogQaReview(record.qa_review)

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
    scheduledAt: scheduledAt ?? null,
    approvedAt: approvedAt ?? null,
    approvedBy: approvedBy ?? null,
    qaReview: qaReview ?? null,
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
      before_after: img.beforeAfter ?? null,
      beforeAfter: img.beforeAfter ?? null,
      product_name: img.productName ?? null,
      productName: img.productName ?? null,
      color_name: img.colorName ?? null,
      colorName: img.colorName ?? null,
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
    scheduled_at: post.scheduledAt ?? null,
    scheduledAt: post.scheduledAt ?? null,
    approved_at: post.approvedAt ?? null,
    approvedAt: post.approvedAt ?? null,
    approved_by: post.approvedBy ?? null,
    approvedBy: post.approvedBy ?? null,
    ...(post.qaReview
      ? {
          qa_review: serializeShowroomBlogQaReview(post.qaReview),
          qaReview: serializeShowroomBlogQaReview(post.qaReview),
        }
      : { qa_review: null, qaReview: null }),
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
 * 같은 원본 사진을 URL 형태와 무관하게 묶기 위한 키.
 *
 * 본문(썸네일 변환), 공개 쇼룸(워터마크 오버레이 여러 겹), 원본(v12345)이 모두
 * 마지막에 같은 Cloudinary public id 조각을 남기므로 그 조각만 비교한다.
 * Cloudinary가 아닌 프록시 URL은 마지막 조각이 variant 이름이라 경로 전체를 쓴다.
 */
export function canonicalBlogImageMatchKey(url: string): string {
  const raw = String(url ?? '').trim().split('?')[0]
  if (!raw) return ''
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const uploadIdx = decoded.indexOf('/image/upload/')
  if (uploadIdx === -1) return decoded.toLowerCase()
  const segments = decoded.slice(uploadIdx + '/image/upload/'.length).split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  return last.replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase()
}

function mergeBlogImageOverlayMeta(
  base: ShowroomCaseBlogImageOverlayMeta | undefined,
  next: ShowroomCaseBlogImageOverlayMeta | undefined,
): ShowroomCaseBlogImageOverlayMeta | undefined {
  if (!base && !next) return undefined
  const beforeAfter = next?.beforeAfter ?? base?.beforeAfter ?? null
  const productName = (next?.productName ?? base?.productName)?.trim() || null
  const colorName = (next?.colorName ?? base?.colorName)?.trim() || null
  if (!beforeAfter && !productName && !colorName) return undefined
  return { beforeAfter, productName, colorName }
}

export type ShowroomCaseBlogImageOverlayHint = ShowroomCaseBlogImageOverlayMeta & {
  url: string
}

/** 정본 `images[]` + 페이지 힌트(비포/애프 자산 등)로 URL 키 → 오버레이 메타 맵을 만든다. */
export function buildCanonicalBlogOverlayLookup(
  post: ShowroomCaseCanonicalBlogPost,
  overlayHints?: ShowroomCaseBlogImageOverlayHint[] | null,
): Map<string, ShowroomCaseBlogImageOverlayMeta> {
  const map = new Map<string, ShowroomCaseBlogImageOverlayMeta>()
  const put = (url: string | null | undefined, meta: ShowroomCaseBlogImageOverlayMeta | undefined) => {
    const key = canonicalBlogImageMatchKey(url ?? '')
    if (!key || !meta) return
    const merged = mergeBlogImageOverlayMeta(map.get(key), meta)
    if (merged) map.set(key, merged)
  }
  for (const img of post.images ?? []) {
    put(img.url, {
      beforeAfter: img.beforeAfter ?? null,
      productName: img.productName ?? null,
      colorName: img.colorName ?? null,
    })
  }
  for (const hint of overlayHints ?? []) {
    put(hint.url, {
      beforeAfter: hint.beforeAfter ?? null,
      productName: hint.productName ?? null,
      colorName: hint.colorName ?? null,
    })
  }
  return map
}

/**
 * 화면 렌더의 진실 원천은 `bodyMarkdown`이다.
 * - 새 정본: `bodyMarkdown` → 최신 파서로 매 렌더마다 HTML 생성
 * - 구 정본: `bodyHtml` fallback
 */
export function renderCanonicalBlogPostHtml(
  post: ShowroomCaseCanonicalBlogPost,
  options?: { overlayHints?: ShowroomCaseBlogImageOverlayHint[] | null },
): string {
  const markdown = post.bodyMarkdown?.trim()
  const overlayByUrl = buildCanonicalBlogOverlayLookup(post, options?.overlayHints)
  if (markdown) return plainMarkdownToSafeArticleHtml(markdown, { overlayByUrl })
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
  const inject = remaining.map((figure) => buildCanonicalBlogPreviewFigureHtml(figure)).join('')
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

type ImageLabelKind = 'before' | 'after' | null

function detectImageLabelFromAlt(alt: string): ImageLabelKind {
  const a = String(alt ?? '').toLowerCase()
  if (!a) return null
  if (/(비포|before|리모델링\s*전|시공\s*전|이전\s*모습|기존\s*모습)/i.test(a)) return 'before'
  if (/(애프터|after|리모델링\s*후|시공\s*후|이후\s*모습|변화된|새롭게|리뉴얼\s*후)/i.test(a)) return 'after'
  return null
}

function buildBlogImageOverlayHtml(meta: ShowroomCaseBlogImageOverlayMeta | undefined): string {
  if (!meta) return ''
  const productName = meta.productName?.trim() || ''
  const colorName = meta.colorName?.trim() || ''
  const role = meta.beforeAfter === 'before' || meta.beforeAfter === 'after' ? meta.beforeAfter : null
  if (!role && !productName && !colorName) return ''

  // dangerouslySetInnerHTML + Tailwind JIT 누락을 피하려고 핵심 레이아웃/색은 inline style로 고정
  const parts: string[] = [
    `<div data-blog-image-overlay="1" style="position:absolute;top:8px;right:8px;z-index:10;max-width:70%;border-radius:0.5rem;background:rgba(0,0,0,0.72);padding:0.5rem 0.75rem;color:#fff;font-size:0.875rem;line-height:1.35;text-align:left;pointer-events:none;box-shadow:0 10px 15px -3px rgba(0,0,0,0.35);backdrop-filter:blur(4px)">`,
  ]
  if (role) {
    const label = role === 'before' ? 'Before' : 'After'
    parts.push(
      `<div style="margin-bottom:0.25rem"><span style="display:inline-flex;align-items:center;border-radius:9999px;background:rgba(255,255,255,0.15);padding:0.125rem 0.5rem;font-size:11px;font-weight:600;color:#fff">${label}</span></div>`,
    )
  }
  if (productName) {
    parts.push(
      `<div style="font-weight:600">제품명 ${escapeHtmlForCanonicalBlog(productName)}</div>`,
    )
  }
  if (colorName) {
    parts.push(
      `<div style="margin-top:0.125rem;font-size:0.75rem;color:rgba(229,229,229,0.95)">색상 ${escapeHtmlForCanonicalBlog(colorName)}</div>`,
    )
  }
  parts.push(`</div>`)
  return parts.join('')
}

function buildFigureHtml(
  safeUrl: string,
  alt: string,
  overlay?: ShowroomCaseBlogImageOverlayMeta,
): string {
  const srcEsc = escapeHtmlForCanonicalBlog(safeUrl)
  const altEsc = escapeHtmlForCanonicalBlog(alt)
  const overlayHtml = buildBlogImageOverlayHtml(overlay)
  return (
    `<figure style="position:relative;margin:1.5rem auto;max-width:48rem;overflow:hidden;border-radius:0.5rem">` +
    `<img src="${srcEsc}" alt="${altEsc}" class="w-full rounded-lg object-cover" loading="lazy" decoding="async" />` +
    overlayHtml +
    `</figure>`
  )
}

type ArticleRenderState = {
  beforeLabeled: boolean
  afterLabeled: boolean
  imageIndex: number
  overlayByUrl: Map<string, ShowroomCaseBlogImageOverlayMeta>
}

const CANONICAL_BLOG_HEADING_CLASS: Record<number, string> = {
  1: 'mt-2 mb-4 text-xl font-bold tracking-tight text-neutral-900',
  2: 'mt-8 mb-3 text-base font-bold text-neutral-900',
  3: 'mt-6 mb-2 text-sm font-bold text-neutral-900',
  4: 'mt-5 mb-2 text-sm font-semibold text-neutral-900',
  5: 'mt-4 mb-2 text-sm font-semibold text-neutral-800',
  6: 'mt-4 mb-2 text-sm font-semibold text-neutral-800',
}

function renderCanonicalBlogHeadingHtml(level: number, text: string): string {
  const safeLevel = Math.min(6, Math.max(1, level))
  const tag = `h${safeLevel}`
  const className = CANONICAL_BLOG_HEADING_CLASS[safeLevel] ?? CANONICAL_BLOG_HEADING_CLASS[2]
  return `<${tag} class="${className}">${escapeHtmlForCanonicalBlog(text)}</${tag}>`
}

function renderCanonicalBlogParagraphHtml(text: string): string {
  return `<p class="mb-4 leading-relaxed text-neutral-700">${escapeHtmlForCanonicalBlog(text).replace(/\n/g, '<br />')}</p>`
}

/** 마크다운 텍스트 블록 → 제목(h1–h6) 또는 본문 문단. */
function renderMarkdownTextBlockHtml(text: string): string {
  const t = text.trim()
  if (!t) return ''
  const lines = t.split('\n')
  const headingMatch = lines[0].match(/^(#{1,6})\s+(.+)$/)
  if (headingMatch) {
    const headingHtml = renderCanonicalBlogHeadingHtml(headingMatch[1].length, headingMatch[2].trim())
    const rest = lines.slice(1).join('\n').trim()
    return rest ? `${headingHtml}${renderCanonicalBlogParagraphHtml(rest)}` : headingHtml
  }
  return renderCanonicalBlogParagraphHtml(t)
}

function resolveFigureOverlay(
  safeUrl: string,
  alt: string,
  state: ArticleRenderState,
): ShowroomCaseBlogImageOverlayMeta | undefined {
  const fromMeta = state.overlayByUrl.get(canonicalBlogImageMatchKey(safeUrl))
  const detected = detectImageLabelFromAlt(alt)
  const isHeadArea = state.imageIndex < 2

  let beforeAfter = fromMeta?.beforeAfter ?? null
  if (!beforeAfter) {
    if (detected === 'before' && !state.beforeLabeled && isHeadArea) beforeAfter = 'before'
    else if (detected === 'after' && !state.afterLabeled && isHeadArea) beforeAfter = 'after'
    else if (!state.beforeLabeled && state.imageIndex === 0) beforeAfter = 'before'
    else if (!state.afterLabeled && state.imageIndex === 1) beforeAfter = 'after'
  }

  if (beforeAfter === 'before') state.beforeLabeled = true
  if (beforeAfter === 'after') state.afterLabeled = true

  return mergeBlogImageOverlayMeta(fromMeta, { beforeAfter, productName: null, colorName: null })
}

function renderMarkdownBlockHtml(block: string, state: ArticleRenderState): string {
  const trimmed = block.trim()
  if (!trimmed) return ''
  const chunks = parseMarkdownChunks(trimmed)
  const pieces: string[] = []
  let textBuf = ''
  const flushText = () => {
    const t = textBuf.trim()
    if (!t) return
    pieces.push(renderMarkdownTextBlockHtml(t))
    textBuf = ''
  }
  for (const ch of chunks) {
    if (ch.kind === 'text') {
      textBuf += ch.text
      continue
    }
    flushText()
    const safeUrl = sanitizeCanonicalBlogHttpsUrl(ch.urlRaw)
    if (!safeUrl) {
      textBuf += `![${ch.alt}](${ch.urlRaw})`
      continue
    }
    const overlay = resolveFigureOverlay(safeUrl, ch.alt, state)
    pieces.push(buildFigureHtml(safeUrl, ch.alt, overlay))
    state.imageIndex += 1
  }
  flushText()
  return pieces.join('')
}

/** 마크다운 본문을 안전 HTML로 변환. 단락(`\\n\\n`) 구분, `![alt](https…)` 이미지는 figure/img로 렌더. */
export function plainMarkdownToSafeArticleHtml(
  markdown: string,
  options?: { overlayByUrl?: Map<string, ShowroomCaseBlogImageOverlayMeta> },
): string {
  const t = String(markdown ?? '').trim()
  if (!t) return '<article class="showroom-canonical-blog"></article>'
  const blocks = t.split(/\n\n+/).filter(Boolean)
  const state: ArticleRenderState = {
    beforeLabeled: false,
    afterLabeled: false,
    imageIndex: 0,
    overlayByUrl: options?.overlayByUrl ?? new Map(),
  }
  const inner = blocks.map((b) => renderMarkdownBlockHtml(b, state)).join('')
  return `<article class="showroom-canonical-blog max-w-none">${inner}</article>`
}

const OPEN_SHOWROOM_TEASER_MAX = 360

function clampOpenShowroomTeaser(text: string): string {
  const t = text.trim()
  if (!t) return ''
  return t.length > OPEN_SHOWROOM_TEASER_MAX ? `${t.slice(0, OPEN_SHOWROOM_TEASER_MAX - 1)}…` : t
}

/**
 * 블로그 마크다운에서 첫 번째 본문 문단(제목·이미지 블록 제외)을 평문으로 추출한다.
 * 오픈 쇼룸 카드 등 짧은 티저용.
 */
export function extractFirstPlainParagraphFromBlogMarkdown(markdown: string): string | null {
  const raw = String(markdown ?? '').trim()
  if (!raw) return null
  const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    const oneLine = block.replace(/\s*\n\s*/g, ' ').trim()
    if (/^#{1,6}\s/.test(oneLine)) continue
    if (/^!\[/.test(block)) continue
    if (/^<[a-z]/i.test(block.trim())) continue
    let t = oneLine.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
    t = t.replace(/\*([^*]+)\*/g, '$1')
    t = t.replace(/^#{1,6}\s+/, '').trim()
    if (t.length >= 8) return t
  }
  return null
}

/**
 * 공개 오픈 쇼룸 카드 하단에 넣을 한 줄 소개.
 * 우선순위: 승인된 정본만 — 본문 첫 문단 → SEO 설명 → 핵심 요약(featuredAnswer).
 */
export function openShowroomBlogTeaserLine(post: ShowroomCaseCanonicalBlogPost | null): string | null {
  if (!post || post.status !== 'approved') return null
  const md = post.bodyMarkdown?.trim()
  if (md) {
    const fromBody = extractFirstPlainParagraphFromBlogMarkdown(md)
    if (fromBody) return clampOpenShowroomTeaser(fromBody)
  }
  const seo = post.seo?.seoDescription?.trim()
  if (seo) return clampOpenShowroomTeaser(seo)
  const fa = post.structured?.featuredAnswer?.trim()
  if (fa) return clampOpenShowroomTeaser(fa)
  return null
}

export type N8nShowroomCaseBlogPayload = {
  title: string
  summary: string
  bodyMarkdown: string
  seo?: {
    seoTitle?: string | null
    seoDescription?: string | null
    ogTitle?: string | null
    ogDescription?: string | null
    keywords?: string[] | null
    canonicalPath?: string | null
  } | null
  structured?: {
    featuredAnswer?: string | null
    faqItems?: Array<{ question: string; answer: string }> | null
    geoPoints?: string[] | null
  } | null
}

function readObj(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = record[key]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function readStr(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function readStringArray(record: Record<string, unknown> | null, ...keys: string[]): string[] {
  if (!record) return []
  for (const k of keys) {
    const v = record[k]
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((s) => s.length > 0)
    }
  }
  return []
}

function readFaqArray(record: Record<string, unknown> | null, ...keys: string[]): Array<{ question: string; answer: string }> {
  if (!record) return []
  for (const k of keys) {
    const v = record[k]
    if (!Array.isArray(v)) continue
    const out: Array<{ question: string; answer: string }> = []
    for (const item of v) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const r = item as Record<string, unknown>
      const q = readStr(r, 'question', 'q', 'Q')
      const a = readStr(r, 'answer', 'a', 'A')
      if (q && a) out.push({ question: q, answer: a })
    }
    return out
  }
  return []
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

  const seoRaw = readObj(blog, 'seo') ?? readObj(blog, 'SEO')
  const structuredRaw = readObj(blog, 'structured') ?? readObj(blog, 'aeo') ?? readObj(blog, 'AEO')

  const seo = seoRaw
    ? {
        seoTitle: readStr(seoRaw, 'seo_title', 'seoTitle', 'title'),
        seoDescription: readStr(seoRaw, 'seo_description', 'seoDescription', 'description'),
        ogTitle: readStr(seoRaw, 'og_title', 'ogTitle'),
        ogDescription: readStr(seoRaw, 'og_description', 'ogDescription'),
        keywords: readStringArray(seoRaw, 'keywords', 'seo_keywords'),
        canonicalPath: readStr(seoRaw, 'canonical_path', 'canonicalPath'),
      }
    : null

  const structured = structuredRaw
    ? {
        featuredAnswer: readStr(structuredRaw, 'featured_answer', 'featuredAnswer'),
        faqItems: readFaqArray(structuredRaw, 'faq_items', 'faqItems', 'faq'),
        geoPoints: readStringArray(structuredRaw, 'geo_points', 'geoPoints'),
      }
    : null

  return {
    title,
    summary,
    bodyMarkdown,
    seo,
    structured,
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
  const seenImageKeys = new Set<string>()
  const ctx = params.imageContext ?? []

  const findContextRow = (url: string | null | undefined) => {
    const key = canonicalBlogImageMatchKey(url ?? '')
    if (!key) return null
    return ctx.find((row) => canonicalBlogImageMatchKey(row.url) === key) ?? null
  }

  const pushImage = (block: ShowroomCaseCanonicalBlogImageBlock) => {
    const key = canonicalBlogImageMatchKey(block.url)
    if (!key || seenImageKeys.has(key)) return
    seenImageKeys.add(key)
    images.push(block)
  }

  const beforeUrl = params.beforeImageUrl?.trim()
  if (beforeUrl) {
    const row = findContextRow(beforeUrl)
    pushImage({
      id: 'before-hero',
      url: beforeUrl,
      alt: `${params.siteName} 비포 현장`,
      caption: '비포',
      placement: 'full',
      beforeAfter: 'before',
      productName: row?.productName ?? null,
      colorName: row?.colorName ?? null,
      imageAssetId: row?.assetId ?? null,
    })
  }
  const afterUrl = params.afterImageUrl?.trim()
  if (afterUrl) {
    const row = findContextRow(afterUrl)
    pushImage({
      id: 'after-hero',
      url: afterUrl,
      alt: `${params.siteName} 애프터 현장`,
      caption: '애프터',
      placement: 'full',
      beforeAfter: 'after',
      productName: row?.productName ?? null,
      colorName: row?.colorName ?? null,
      imageAssetId: row?.assetId ?? null,
    })
  }

  for (const row of ctx) {
    const url = row.url?.trim()
    if (!url || !/^https:\/\//i.test(url)) continue
    pushImage({
      id: `asset-${row.assetId}`,
      imageAssetId: row.assetId,
      url,
      alt: altFromImageContextRow(row),
      caption: null,
      placement: 'inline',
      beforeAfter: row.beforeAfter ?? null,
      productName: row.productName ?? null,
      colorName: row.colorName ?? null,
    })
  }

  const cleanedMarkdown = stripBrokenBlogImageTailLines(extracted.bodyMarkdown)
  const overlayByUrl = new Map<string, ShowroomCaseBlogImageOverlayMeta>()
  for (const img of images) {
    const key = canonicalBlogImageMatchKey(img.url)
    if (!key) continue
    const meta = mergeBlogImageOverlayMeta(undefined, {
      beforeAfter: img.beforeAfter ?? null,
      productName: img.productName ?? null,
      colorName: img.colorName ?? null,
    })
    if (meta) overlayByUrl.set(key, meta)
  }
  const bodyHtml = plainMarkdownToSafeArticleHtml(cleanedMarkdown, { overlayByUrl })
  const summaryForSeo = extracted.summary.trim()
  const fallbackDescription =
    summaryForSeo.length > 160 ? `${summaryForSeo.slice(0, 157)}…` : summaryForSeo || `${extracted.title} — 파인드가구 온라인 쇼룸 사례`

  const llmSeo = extracted.seo ?? null
  const llmStructured = extracted.structured ?? null

  const seoTitle = (llmSeo?.seoTitle ?? '').trim() || extracted.title
  const seoDescription = (llmSeo?.seoDescription ?? '').trim() || fallbackDescription
  const ogTitle = (llmSeo?.ogTitle ?? '').trim() || seoTitle
  const ogDescription = (llmSeo?.ogDescription ?? '').trim() || seoDescription
  const keywords = (llmSeo?.keywords ?? []).filter((s) => s && s.trim().length > 0)
  const canonicalPath = (llmSeo?.canonicalPath ?? '').trim() || null

  const featuredAnswer = (llmStructured?.featuredAnswer ?? '').trim() || summaryForSeo || null
  const faqItems = (llmStructured?.faqItems ?? []).filter((q) => q.question.trim() && q.answer.trim())
  const geoPoints = (llmStructured?.geoPoints ?? []).filter((g) => g && g.trim().length > 0)

  const structured =
    featuredAnswer || faqItems.length > 0 || geoPoints.length > 0
      ? {
          featuredAnswer: featuredAnswer ?? null,
          faqItems,
          geoPoints,
        }
      : null

  return {
    schemaVersion: 1,
    status: 'draft',
    siteName: params.siteName.trim(),
    title: extracted.title,
    bodyMarkdown: cleanedMarkdown,
    bodyHtml,
    images,
    seo: {
      title: seoTitle,
      seoDescription,
      ogTitle,
      ogDescription,
      ...(keywords.length ? { keywords } : {}),
      canonicalPath,
    },
    structured,
    cardNewsGenerationRef: null,
    createdAt,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
  }
}
