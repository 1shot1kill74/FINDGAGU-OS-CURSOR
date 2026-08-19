/**
 * 네이버 블로그 수기 발행용 "패키지" 빌더.
 *
 * 입력: 승인된 (혹은 작업실에서 미리보기 가능한) `ShowroomCaseCanonicalBlogPost`
 * 출력:
 *   - 네이버 친화 본문 HTML (이미지 자리는 [이미지 N] 마커, 자가 사이트 풋터 포함)
 *   - 네이버 친화 본문 마크다운 (HTML과 1:1 대응, 같은 [이미지 N] 마커)
 *   - 추천 제목 후보 / 추천 해시태그 / 발행 체크리스트
 *   - 이미지 다운로드 목록 (zip은 호출부에서 fetch + JSZip)
 *
 * 설계 원칙
 * - 운영자 손에 들어가는 결과물은 "복붙 + 사진 업로드"만 하면 끝나야 한다.
 * - 본문 안의 이미지 위치는 마크다운/HTML 어디에서도 똑같이 `[이미지 N]` 으로 보여서
 *   사람이 그 자리에 같은 번호 사진을 끼워 넣기만 하면 된다.
 * - 패키지 사진은 본문 `![alt](url)` 만 포함. 정본 images[] 잔여 컷은 넣지 않는다.
 * - 본문은 홈페이지 정본 `bodyMarkdown` 그대로. 인용 박스·FAQ·이중 제목·견적명 푸터를 덧붙이지 않는다.
 * - 본문 끝에는 자가 사이트 사례 페이지 링크(=백링크)만 추가한다.
 *
 * 구글 SEO와의 분업
 * - 구글: 자가 사이트가 정본. 캐노니컬은 자가 사이트.
 * - 네이버: 본문이 네이버 도메인에 있어야 블로그/뷰 탭에 노출되므로 본문은 그대로 복제한다.
 *   대신 마지막에 자가 사이트 링크를 넣어 신호를 회수한다.
 */

import type {
  ShowroomCaseCanonicalBlogPost,
  ShowroomCaseCanonicalBlogImageBlock,
} from '@/lib/showroomCaseCanonicalBlog'
import { PUBLIC_SHOWROOM_ORIGIN } from '@/lib/publicShowroomSeo'
import { buildPublicShowroomCasePath } from '@/lib/showroomCaseSlug'

const FOOTER_LINK_LABEL = '원본 보러 가기'
const BODY_STYLE =
  "font-family:'마루부리','Nanum MaruBuri',MaruBuri,sans-serif;font-size:16px;line-height:1.8;text-align:left;"
const HEADING_STYLE =
  "font-family:'마루부리','Nanum MaruBuri',MaruBuri,sans-serif;font-size:20px;line-height:1.8;text-align:left;font-weight:700;"

export type NaverPackageImageItem = {
  /** 사람이 인식하는 1-base 번호. 본문의 `[이미지 N]` 과 일치한다. */
  index: number
  /** 다운로드 zip에 들어갈 파일명. 예: `01_비포_거실.jpg` */
  filename: string
  /** 원본 URL (다운로드는 호출부에서) */
  url: string
  /** 이미지 alt — 캡션/접근성 보조용 */
  alt: string
  /** 네이버 사진 설명칸에 넣을 한 줄 */
  caption: string
  /** 비포/애프터/일반 라벨 (본문 내 캡션에 사용) */
  label: 'before' | 'after' | 'plain'
}

export type NaverBlogPackage = {
  /** 클립보드 복사용 본문 HTML — 네이버 에디터에 그대로 붙여넣기 가능 */
  bodyHtml: string
  /** 클립보드 복사용 본문 마크다운 — 다른 채널 재사용 시 유용 */
  bodyMarkdown: string
  /** 서식 없는 본문. [이미지 N] 과 원본 링크는 유지 */
  bodyPlainText: string
  /** 추천 제목 후보 (3~5개) */
  titleCandidates: string[]
  /** 추천 해시태그 (#포함) */
  hashtags: string[]
  /** 다운로드용 이미지 목록 */
  images: NaverPackageImageItem[]
  /** 사진 캡션 정리표 — 한 줄에 `[이미지 N]` + 캡션 */
  captionTableText: string
  /** 발행 체크리스트 — 다이얼로그 우측에 표시 */
  publishingChecklist: string[]
  /** 본문 끝에 들어가는 자가 사이트 사례 페이지 절대 URL */
  canonicalSourceUrl: string
}

export type BuildNaverPackageInput = {
  post: ShowroomCaseCanonicalBlogPost
  /** 자가 사이트 베이스 URL. 비어 있으면 공개 쇼룸 정본 호스트(www.findgagu.co.kr). */
  publicBaseUrl?: string
  /** 사람이 보는 표시 라벨 (예: "2505 경기권 관리형 6888"). 비면 post.title 사용. */
  displayLabel?: string
  /** 업종/문제/해결 등 해시태그 보강에 쓸 라벨들 */
  industryLabel?: string | null
  problemLabel?: string | null
  solutionLabel?: string | null
}

function safeFilenamePiece(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function inferImageExtension(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    const m = path.match(/\.(jpe?g|png|webp|gif|avif)$/i)
    if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
  } catch {
    /* noop */
  }
  return 'jpg'
}

function detectImageLabel(alt: string): 'before' | 'after' | 'plain' {
  const a = alt.trim()
  if (!a) return 'plain'
  if (/^(비포|before)\b/i.test(a)) return 'before'
  if (/^(애프터|after)\b/i.test(a)) return 'after'
  if (a.includes('비포')) return 'before'
  if (a.includes('애프터')) return 'after'
  return 'plain'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 본문 마크다운을 "네이버 친화" 형태로 정규화한다.
 * - 마크다운 이미지 `![alt](url)` 는 본문에서 빼고, 등장 순서를 `imageOrder` 에 모은다.
 * - 같은 자리는 placeholder `[[IMG:N]]` 로 표시 (이후 HTML/마크다운 변환 시 [이미지 N] 으로 치환).
 * - `**`, `*`, 인라인 링크는 가볍게 그대로 둔다(마크다운 본문에). HTML 변환 시 별도로 처리.
 *
 * 정렬 정책: 본문에 등장한 `![alt](url)` 만 패키지 사진으로 쓴다.
 * 정본 images[]에만 있고 본문에 없는 컷은 덧붙이지 않는다.
 */
function normalizeBlogMarkdownToNaverShape(
  markdown: string,
  postImages: ShowroomCaseCanonicalBlogImageBlock[],
): { normalizedMarkdown: string; orderedImages: ShowroomCaseCanonicalBlogImageBlock[] } {
  const src = String(markdown ?? '').trim()
  const orderedImages: ShowroomCaseCanonicalBlogImageBlock[] = []
  const seenUrls = new Set<string>()

  const replaced = src.replace(
    /!\[([^\]]*)\]\((https?:\/\/\S+)(?:\s+"[^"]*")?\)/g,
    (_full, alt: string, url: string) => {
      const rawUrl = String(url || '').trim()
      const cleanAlt = String(alt || '').trim()
      if (!rawUrl) return ''
      const fromCanonical =
        postImages.find((img) => img.url === rawUrl) ||
        postImages.find((img) => img.url.startsWith(rawUrl) || rawUrl.startsWith(img.url.split('?')[0]))
      const cleanUrl = fromCanonical?.url || rawUrl
      if (seenUrls.has(cleanUrl)) {
        const idx = orderedImages.findIndex((img) => img.url === cleanUrl) + 1
        return `\n\n[[IMG:${idx}]]\n\n`
      }
      seenUrls.add(cleanUrl)
      const block: ShowroomCaseCanonicalBlogImageBlock = fromCanonical
        ? { ...fromCanonical, alt: fromCanonical.alt || cleanAlt }
        : {
            id: `inline-${orderedImages.length + 1}`,
            url: cleanUrl,
            alt: cleanAlt || '현장 사진',
          }
      orderedImages.push(block)
      return `\n\n[[IMG:${orderedImages.length}]]\n\n`
    },
  )

  const compacted = replaced.replace(/\n{3,}/g, '\n\n').trim()
  return { normalizedMarkdown: compacted, orderedImages }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripCaptionNoise(text: string, siteName: string): string {
  let s = String(text || '')
  for (const part of siteName.split(/[\s_/·]+/).filter((piece) => piece.length >= 2)) {
    s = s.replace(new RegExp(escapeRegExp(part), 'g'), ' ')
  }
  s = s.replace(/견적/g, ' ')
  s = s.replace(/\b\d{4}\b/g, ' ')
  s = s.replace(/비포|애프터|before|after/gi, ' ')
  s = s.replace(/[·|,/_]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (/^(현장|사진)$/.test(s)) return ''
  return s
}

function buildNaverImageCaption(
  img: ShowroomCaseCanonicalBlogImageBlock,
  label: 'before' | 'after' | 'plain',
  siteName: string,
): string {
  const stored = String(img.caption || '').trim()
  if (stored && stored.length >= 4 && !/^(비포|애프터|before|after)$/i.test(stored)) {
    return stored
  }
  const product = String(img.productName || '').replace(/\s+/g, '').trim()
  const leftover = stripCaptionNoise(img.alt, siteName)
  if (label === 'before') {
    if (leftover) return `비포 — ${leftover}`
    return '비포 — 가구 설치 전 현장'
  }
  if (label === 'after') {
    if (product && leftover && !leftover.includes(product)) return `애프터 — ${product} ${leftover}`
    if (product) return `애프터 — ${product}`
    if (leftover) return `애프터 — ${leftover}`
    return '애프터 — 설치 후 현장'
  }
  return product || leftover || '현장 사진'
}

export function formatNaverCaptionTable(images: NaverPackageImageItem[]): string {
  return images.map((img) => `[이미지 ${img.index}] ${img.caption}`).join('\n')
}

function buildImageItems(
  images: ShowroomCaseCanonicalBlogImageBlock[],
  siteName: string,
): NaverPackageImageItem[] {
  return images.map((img, i) => {
    const index = i + 1
    const label =
      img.beforeAfter === 'before' || img.beforeAfter === 'after'
        ? img.beforeAfter
        : detectImageLabel(img.alt)
    const ext = inferImageExtension(img.url)
    const labelKor = label === 'before' ? '비포' : label === 'after' ? '애프터' : '현장'
    const altPiece = safeFilenamePiece(img.alt) || '사진'
    const num = String(index).padStart(2, '0')
    return {
      index,
      filename: `${num}_${labelKor}_${altPiece}.${ext}`,
      url: img.url,
      alt: img.alt,
      caption: buildNaverImageCaption(img, label, siteName),
      label,
    }
  })
}

/** 네이버 블로그 태그: 최대 30개, 공백 포함 합계 100자. */
const NAVER_HASHTAG_MAX_COUNT = 30
const NAVER_HASHTAG_MAX_CHARS = 100
const REQUIRED_HASHTAGS = ['파인드가구', '시공사례']
const SKIP_HASHTAGS = new Set([
  '리뉴얼',
  '공간전략',
  '밝은공간',
  '좌석배치',
  '매출부진',
  '학습환경',
  '가구디자인',
  '공간분리',
  '책상공간',
  '좌석개선',
  '책상배치',
  '수납책장',
  '집중력가구',
  '학습공간인테리어',
  '아파트리모델링',
  '파인드가구사례',
  '교육공간',
  '공간리뉴얼',
])

function compactHashtag(raw: string): string {
  return String(raw || '').replace(/^#/, '').replace(/\s+/g, '').trim()
}

function caseHaystack(input: BuildNaverPackageInput): string {
  return [
    input.displayLabel,
    input.industryLabel,
    input.post.siteName,
    input.post.title,
    input.post.seo.title,
    ...(input.post.seo.keywords ?? []),
  ]
    .map((value) => String(value || ''))
    .join(' ')
}

function collectProductHashtags(input: BuildNaverPackageInput): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  const pushName = (raw: string) => {
    const compact = compactHashtag(raw)
    if (!compact || compact.length < 2 || compact.length > 12) return
    if (/^(기타|미지정|현장|사진)$/.test(compact)) return
    const key = compact.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(compact)
  }

  for (const img of input.post.images ?? []) {
    pushName(img.productName || '')
    const fromAlt = String(img.alt || '').match(/((?:프라이버시|스마트)\s*[A-Z0-9형]?)/i)
    if (fromAlt?.[1]) pushName(fromAlt[1])
    if (names.length >= 3) break
  }
  return names
}

function isEssentialExtraHashtag(compact: string): boolean {
  if (compact.length < 2 || compact.length > 12) return false
  if (SKIP_HASHTAGS.has(compact)) return false
  if (/부진|전략|개선|변화|문제/.test(compact)) return false
  return true
}

function pushHashtag(result: string[], seen: Set<string>, compact: string): boolean {
  const key = compact.toLowerCase()
  if (!compact || seen.has(key)) return false
  const tag = `#${compact}`
  const joined = result.length === 0 ? tag : `${result.join(' ')} ${tag}`
  if (result.length >= NAVER_HASHTAG_MAX_COUNT) return false
  if (joined.length > NAVER_HASHTAG_MAX_CHARS) return false
  seen.add(key)
  result.push(tag)
  return true
}

function buildHashtagPool(input: BuildNaverPackageInput): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const required of REQUIRED_HASHTAGS) {
    pushHashtag(result, seen, required)
  }

  const hay = caseHaystack(input)
  const compactHay = compactHashtag(hay)
  const industry = compactHashtag(input.industryLabel || '')
  const isRenewal = /리뉴얼|renewal/i.test(hay)
  const isStudyCafe = compactHay.includes('스터디카페') || industry.includes('스터디카페')

  const extras: string[] = []
  if (industry) extras.push(industry)
  if (isStudyCafe) extras.push('스터디카페')
  if (isStudyCafe && isRenewal) extras.push('스터디카페리뉴얼')
  else if (industry && isRenewal && industry !== '스터디카페') extras.push(`${industry}리뉴얼`)
  extras.push(...collectProductHashtags(input))
  extras.push(...(input.post.seo.keywords ?? []))

  for (const raw of extras) {
    const compact = compactHashtag(String(raw || ''))
    if (REQUIRED_HASHTAGS.includes(compact)) continue
    if (!isEssentialExtraHashtag(compact)) continue
    pushHashtag(result, seen, compact)
    if (result.length >= 10) break
  }
  return result
}

function buildPublishingChecklist(): string[] {
  return [
    '제목은 홈페이지 SEO 제목 그대로 쓴다.',
    '본문은 홈페이지 정본 그대로 붙인다. FAQ·인용 박스·견적명을 덧붙이지 않는다.',
    '본문 안의 [이미지 1], [이미지 2] … 자리에 같은 번호 사진을 끌어다 놓거나 복사해 붙여넣는다.',
    '맨 끝 원본 보기 링크가 공개 쇼룸 사람 슬러그로 열리는지 확인한다.',
    '사진 설명은 캡션 정리표에서 복사해 같은 번호 사진에 붙인다.',
    '해시태그는 브랜드·시공사례·제품명·업종리뉴얼 정도만 붙인다. 30개·100자를 넘기지 않는다.',
    '카테고리/공개범위/검색노출 옵션을 평소 운영 정책대로 설정한다.',
  ]
}

/**
 * 홈페이지 정본 본문을 그대로 옮긴다.
 * - 이미지만 `[이미지 N]` 마커로 바꾼다.
 * - 끝에 공개 쇼룸 링크만 붙인다.
 */
function buildNaverMarkdown(
  normalizedMarkdown: string,
  canonicalUrl: string,
): string {
  const body = normalizedMarkdown
    .replace(/\[\[IMG:(\d+)\]\]/g, (_m, n) => `\n[이미지 ${n}]\n`)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const lines: string[] = []
  if (body) {
    lines.push(body)
    lines.push('')
  }
  lines.push(`[${FOOTER_LINK_LABEL}](${canonicalUrl})`)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 네이버에 바로 붙여넣을 수 있게 서식만 걷고, [이미지 N]·원본 링크는 남긴다. */
export function naverMarkdownToPlainText(markdown: string): string {
  return String(markdown || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildNaverHtml(
  normalizedMarkdown: string,
  canonicalUrl: string,
): string {
  const out: string[] = []
  const blocks = normalizedMarkdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    const imgMatch = block.match(/^\[\[IMG:(\d+)\]\]$/)
    if (imgMatch) {
      out.push(`<p style="${BODY_STYLE}">[이미지 ${imgMatch[1]}]</p>`)
      continue
    }
    if (/^#{1,6}\s/.test(block)) {
      const level = block.match(/^#+/)?.[0].length ?? 1
      const safeLevel = Math.min(Math.max(level, 2), 3)
      const text = block.replace(/^#+\s+/, '').trim()
      out.push(`<h${safeLevel} style="${HEADING_STYLE}">${escapeHtml(text)}</h${safeLevel}>`)
      continue
    }
    if (/^>\s/.test(block)) {
      const text = block.replace(/^>\s?/, '').trim()
      out.push(`<blockquote style="${BODY_STYLE}">${escapeHtml(text)}</blockquote>`)
      continue
    }
    const safe = escapeHtml(block).replace(/\n/g, '<br />')
    out.push(`<p style="${BODY_STYLE}">${safe}</p>`)
  }

  out.push(
    `<p style="${BODY_STYLE}"><a href="${escapeHtml(canonicalUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(FOOTER_LINK_LABEL)}</a></p>`,
  )
  return out.join('\n')
}

function resolveCanonicalSourceUrl(input: BuildNaverPackageInput): string {
  const trimBase = (s: string) => s.replace(/\/+$/, '')
  const baseUrl = trimBase((input.publicBaseUrl && input.publicBaseUrl.trim()) || PUBLIC_SHOWROOM_ORIGIN)
  const explicit = input.post.seo.canonicalPath?.trim()
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) {
      try {
        const parsed = new URL(explicit)
        return `${baseUrl}${parsed.pathname}${parsed.search}`
      } catch {
        return explicit
      }
    }
    const path = explicit.startsWith('/') ? explicit : `/${explicit}`
    return `${baseUrl}${path}`
  }
  const sitePath = buildPublicShowroomCasePath({
    siteName: input.post.siteName,
    title: input.post.seo.title || input.post.title,
    canonicalPath: input.post.seo.canonicalPath,
  })
  return `${baseUrl}${sitePath}`
}

export function formatNaverSourceUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}${parsed.search}`
  } catch {
    return url
  }
}

export function buildNaverBlogPackage(input: BuildNaverPackageInput): NaverBlogPackage {
  const { post } = input
  const displayLabel = (input.displayLabel || post.title || post.siteName).trim()
  const canonicalSourceUrl = resolveCanonicalSourceUrl(input)

  const sourceMarkdown = post.bodyMarkdown?.trim() || ''
  const { normalizedMarkdown, orderedImages } = normalizeBlogMarkdownToNaverShape(
    sourceMarkdown,
    post.images ?? [],
  )

  const images = buildImageItems(orderedImages, post.siteName || displayLabel)
  const captionTableText = formatNaverCaptionTable(images)

  const bodyMarkdown = buildNaverMarkdown(normalizedMarkdown, canonicalSourceUrl)
  const bodyHtml = buildNaverHtml(normalizedMarkdown, canonicalSourceUrl)
  const bodyPlainText = naverMarkdownToPlainText(bodyMarkdown)
  const titleCandidates = [((post.seo.title || post.title || displayLabel).trim())].filter(Boolean)
  const hashtags = buildHashtagPool(input)
  const publishingChecklist = buildPublishingChecklist()

  return {
    bodyHtml,
    bodyMarkdown,
    bodyPlainText,
    titleCandidates,
    hashtags,
    images,
    captionTableText,
    publishingChecklist,
    canonicalSourceUrl,
  }
}

/**
 * 패키지에 들어 있는 이미지를 순서대로 다운로드해서 zip Blob 으로 만든다.
 * 호출부 예: `await downloadNaverPackageAsZip(pkg, 'naver_2505_경기권_6888.zip')`
 *
 * 같은 zip에 본문도 함께 넣어서 운영자가 한 번에 보관하기 좋게 한다.
 *   - body.html / body.md / hashtags.txt / titles.txt / captions.txt / checklist.txt / source.url
 *
 * 일부 이미지가 CORS 등으로 실패하면, 그 이미지는 건너뛰고 진행 (UI에 결과 카운트만 노출).
 */
export async function downloadNaverPackageAsZip(
  pkg: NaverBlogPackage,
  zipFilename: string,
): Promise<{ totalImages: number; downloaded: number; skipped: string[] }> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  zip.file('body.html', pkg.bodyHtml)
  zip.file('body.md', pkg.bodyMarkdown)
  zip.file('titles.txt', pkg.titleCandidates.join('\n'))
  zip.file('hashtags.txt', pkg.hashtags.join(' '))
  zip.file('captions.txt', pkg.captionTableText)
  zip.file('checklist.txt', pkg.publishingChecklist.map((line, i) => `${i + 1}. ${line}`).join('\n'))
  zip.file('source.url', `[InternetShortcut]\nURL=${pkg.canonicalSourceUrl}\n`)

  const skipped: string[] = []
  let downloaded = 0
  for (const img of pkg.images) {
    try {
      const file = await fetchNaverPackageImageFile(img)
      zip.file(`images/${img.filename}`, file)
      downloaded += 1
    } catch {
      skipped.push(img.filename)
    }
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = zipFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 30_000)

  return { totalImages: pkg.images.length, downloaded, skipped }
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/** 패키지 사진을 File로 받아 드래그·클립보드·zip에 같이 쓴다. */
export async function fetchNaverPackageImageFile(img: NaverPackageImageItem): Promise<File> {
  const res = await fetch(img.url, { mode: 'cors' })
  if (!res.ok) {
    throw new Error(`이미지 ${img.index} 다운로드 실패 (${res.status})`)
  }
  const blob = await res.blob()
  const type = blob.type.startsWith('image/') ? blob.type : mimeFromFilename(img.filename)
  return new File([blob], img.filename, { type })
}

async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('이미지를 PNG로 바꿀 수 없습니다.')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('PNG 변환 실패'))), 'image/png')
  })
}

/** 네이버 에디터 붙여넣기용. 브라우저는 PNG 복사가 가장 안정적이다. */
export async function copyNaverPackageImageToClipboard(file: File): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('이 브라우저는 이미지 복사를 지원하지 않습니다.')
  }
  const pngBlob = await convertImageBlobToPng(file)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}

/**
 * 네이버 에디터가 파일 드롭으로 받도록 File만 넣는다.
 * URL을 같이 넣으면 원격 주소만 삽입되고 업로드가 안 될 수 있다.
 */
export function attachNaverPackageImageDragData(dataTransfer: DataTransfer, file: File): void {
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.items.add(file)
}
