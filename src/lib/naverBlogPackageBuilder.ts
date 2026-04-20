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
 * - 본문 끝에는 자가 사이트 사례 페이지 링크(=백링크)를 항상 포함한다.
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

const FOOTER_HEADER = '✦ 자세한 비포·애프터와 추가 사진은 원본에서 확인할 수 있어요.'

export type NaverPackageImageItem = {
  /** 사람이 인식하는 1-base 번호. 본문의 `[이미지 N]` 과 일치한다. */
  index: number
  /** 다운로드 zip에 들어갈 파일명. 예: `01_비포_거실.jpg` */
  filename: string
  /** 원본 URL (다운로드는 호출부에서) */
  url: string
  /** 이미지 alt — 캡션/접근성 보조용 */
  alt: string
  /** 비포/애프터/일반 라벨 (본문 내 캡션에 사용) */
  label: 'before' | 'after' | 'plain'
}

export type NaverBlogPackage = {
  /** 클립보드 복사용 본문 HTML — 네이버 에디터에 그대로 붙여넣기 가능 */
  bodyHtml: string
  /** 클립보드 복사용 본문 마크다운 — 다른 채널 재사용 시 유용 */
  bodyMarkdown: string
  /** 추천 제목 후보 (3~5개) */
  titleCandidates: string[]
  /** 추천 해시태그 (#포함) */
  hashtags: string[]
  /** 다운로드용 이미지 목록 */
  images: NaverPackageImageItem[]
  /** 발행 체크리스트 — 다이얼로그 우측에 표시 */
  publishingChecklist: string[]
  /** 본문 끝에 들어가는 자가 사이트 사례 페이지 절대 URL */
  canonicalSourceUrl: string
}

export type BuildNaverPackageInput = {
  post: ShowroomCaseCanonicalBlogPost
  /** 자가 사이트 베이스 URL. 비어 있으면 window.location.origin 사용. */
  publicBaseUrl?: string
  /** 사람이 보는 표시 라벨 (예: "2505 경기권 관리형 6888"). 비면 post.title 사용. */
  displayLabel?: string
  /** 업종/문제/해결 등 해시태그 보강에 쓸 라벨들 */
  industryLabel?: string | null
  problemLabel?: string | null
  solutionLabel?: string | null
}

const KOREAN_PUNCT = /[\s,.!?;:()[\]{}'"`~·…—\-]+/g

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
 * 정렬 정책: 본문에서 사용된 순서를 우선시키되, 본문에 없는 정본 images 도 뒤에 덧붙여서
 * 운영자가 추가 사진까지 한 번에 받을 수 있게 한다.
 */
function normalizeBlogMarkdownToNaverShape(
  markdown: string,
  postImages: ShowroomCaseCanonicalBlogImageBlock[],
): { normalizedMarkdown: string; orderedImages: ShowroomCaseCanonicalBlogImageBlock[] } {
  const src = String(markdown ?? '').trim()
  const orderedImages: ShowroomCaseCanonicalBlogImageBlock[] = []
  const seenUrls = new Set<string>()

  const replaced = src.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_full, alt: string, url: string) => {
      const cleanUrl = String(url || '').trim()
      const cleanAlt = String(alt || '').trim()
      if (!cleanUrl) return ''
      if (seenUrls.has(cleanUrl)) {
        const idx = orderedImages.findIndex((img) => img.url === cleanUrl) + 1
        return `\n\n[[IMG:${idx}]]\n\n`
      }
      seenUrls.add(cleanUrl)
      const fromCanonical = postImages.find((img) => img.url === cleanUrl)
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

  for (const img of postImages) {
    if (!img?.url) continue
    if (seenUrls.has(img.url)) continue
    seenUrls.add(img.url)
    orderedImages.push(img)
  }

  const compacted = replaced.replace(/\n{3,}/g, '\n\n').trim()
  return { normalizedMarkdown: compacted, orderedImages }
}

function buildImageItems(images: ShowroomCaseCanonicalBlogImageBlock[]): NaverPackageImageItem[] {
  return images.map((img, i) => {
    const index = i + 1
    const label = detectImageLabel(img.alt)
    const ext = inferImageExtension(img.url)
    const labelKor = label === 'before' ? '비포' : label === 'after' ? '애프터' : '현장'
    const altPiece = safeFilenamePiece(img.alt) || '사진'
    const num = String(index).padStart(2, '0')
    return {
      index,
      filename: `${num}_${labelKor}_${altPiece}.${ext}`,
      url: img.url,
      alt: img.alt,
      label,
    }
  })
}

function buildHashtagPool(input: BuildNaverPackageInput): string[] {
  const post = input.post
  const seo = post.seo
  const seedWords: string[] = []

  for (const k of seo.keywords ?? []) {
    if (k && k.trim()) seedWords.push(k.trim())
  }
  if (input.industryLabel) seedWords.push(input.industryLabel.trim())
  if (input.problemLabel) seedWords.push(input.problemLabel.trim())
  if (input.solutionLabel) seedWords.push(input.solutionLabel.trim())

  const titleTokens = (seo.title || post.title || '')
    .split(KOREAN_PUNCT)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 12)
  for (const tok of titleTokens) seedWords.push(tok)

  const baseTags = ['파인드가구', '온라인쇼룸', '시공사례', '비포애프터', '리모델링', '인테리어']
  for (const t of baseTags) seedWords.push(t)

  const seen = new Set<string>()
  const result: string[] = []
  for (const w of seedWords) {
    const compact = w.replace(/\s+/g, '')
    if (!compact) continue
    if (compact.length > 18) continue
    const key = compact.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(`#${compact}`)
    if (result.length >= 18) break
  }
  return result
}

function buildTitleCandidates(input: BuildNaverPackageInput): string[] {
  const { post, displayLabel } = input
  const baseTitle = (post.seo.title || post.title || displayLabel || '시공 사례').trim()
  const label = (displayLabel || post.siteName || '').trim()
  const industry = (input.industryLabel || '').trim()
  const summary = (post.structured?.featuredAnswer || post.seo.seoDescription || '').trim()

  const candidates = new Set<string>()
  candidates.add(baseTitle)
  if (label && !baseTitle.includes(label)) candidates.add(`${label} | ${baseTitle}`)
  if (industry) candidates.add(`${industry} 비포·애프터 | ${baseTitle}`)
  if (summary) {
    const oneLine = summary.split(/[.!?\n]/)[0].trim()
    if (oneLine && oneLine.length <= 50) {
      candidates.add(`${baseTitle} — ${oneLine}`)
    }
  }
  candidates.add(`${baseTitle} (현장 리포트)`)

  return Array.from(candidates)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0 && t.length <= 60)
    .slice(0, 5)
}

function buildPublishingChecklist(): string[] {
  return [
    '제목 1개를 골라 네이버 에디터 제목란에 붙여 넣는다.',
    '본문을 그대로 붙여 넣는다 (HTML 또는 텍스트 모드 어느 쪽이든 가능).',
    '본문 안의 [이미지 1], [이미지 2] … 자리에 같은 번호 사진을 업로드한다.',
    '대표 이미지는 보통 [이미지 1] (대표 비포) 또는 [이미지 2] (대표 애프터) 를 사용한다.',
    '본문 마지막의 "원본 보러 가기" 링크가 자가 사이트 사례 페이지로 잘 걸렸는지 확인한다.',
    '추천 해시태그에서 6~10개를 골라 추가한다.',
    '카테고리/공개범위/검색노출 옵션을 평소 운영 정책대로 설정한다.',
  ]
}

/**
 * 네이버 친화 본문 마크다운을 만든다.
 * - 단락은 짧게(가능하면 2~3문장) 유지.
 * - 이미지는 본문에서 따로 꺼내 `[이미지 N]` 마커로 표시.
 * - 끝에 핵심 요약 / FAQ / 자가 사이트 링크 풋터를 붙인다.
 */
function buildNaverMarkdown(
  normalizedMarkdown: string,
  post: ShowroomCaseCanonicalBlogPost,
  canonicalUrl: string,
  displayLabel: string,
): string {
  const lines: string[] = []
  const title = post.seo.title || post.title || displayLabel
  lines.push(`# ${title}`)
  lines.push('')

  const featured = post.structured?.featuredAnswer?.trim()
  if (featured) {
    lines.push(`> ${featured}`)
    lines.push('')
  }

  const body = normalizedMarkdown
    .replace(/\[\[IMG:(\d+)\]\]/g, (_m, n) => `\n[이미지 ${n}]\n`)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (body) {
    lines.push(body)
    lines.push('')
  }

  const faqs = (post.structured?.faqItems ?? []).filter((q) => q.question.trim() && q.answer.trim())
  if (faqs.length > 0) {
    lines.push('## 자주 묻는 질문')
    for (const qa of faqs) {
      lines.push(`**Q. ${qa.question.trim()}**`)
      lines.push(`A. ${qa.answer.trim()}`)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push(FOOTER_HEADER)
  lines.push(`👉 [${displayLabel} — 원본 보러 가기](${canonicalUrl})`)
  lines.push('')

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function buildNaverHtml(
  normalizedMarkdown: string,
  post: ShowroomCaseCanonicalBlogPost,
  canonicalUrl: string,
  displayLabel: string,
): string {
  const title = escapeHtml(post.seo.title || post.title || displayLabel)
  const out: string[] = []
  out.push(`<h1>${title}</h1>`)

  const featured = post.structured?.featuredAnswer?.trim()
  if (featured) {
    out.push(
      `<blockquote style="border-left:3px solid #10b981;background:#ecfdf5;padding:12px 16px;margin:16px 0;color:#064e3b;">${escapeHtml(featured)}</blockquote>`,
    )
  }

  const blocks = normalizedMarkdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    const imgMatch = block.match(/^\[\[IMG:(\d+)\]\]$/)
    if (imgMatch) {
      const n = imgMatch[1]
      out.push(
        `<p style="margin:18px 0;color:#475569;font-weight:600;">[이미지 ${n}]</p>`,
      )
      continue
    }
    if (/^#{1,6}\s/.test(block)) {
      const level = (block.match(/^#+/)?.[0].length ?? 1)
      const safeLevel = Math.min(Math.max(level, 2), 4)
      const text = block.replace(/^#+\s+/, '').trim()
      out.push(`<h${safeLevel}>${escapeHtml(text)}</h${safeLevel}>`)
      continue
    }
    if (/^>\s/.test(block)) {
      const text = block.replace(/^>\s?/, '').trim()
      out.push(`<blockquote>${escapeHtml(text)}</blockquote>`)
      continue
    }
    const safe = escapeHtml(block).replace(/\n/g, '<br />')
    out.push(`<p>${safe}</p>`)
  }

  const faqs = (post.structured?.faqItems ?? []).filter((q) => q.question.trim() && q.answer.trim())
  if (faqs.length > 0) {
    out.push('<h2>자주 묻는 질문</h2>')
    for (const qa of faqs) {
      out.push(`<p><strong>Q. ${escapeHtml(qa.question.trim())}</strong></p>`)
      out.push(`<p>A. ${escapeHtml(qa.answer.trim())}</p>`)
    }
  }

  out.push('<hr />')
  out.push(`<p>${escapeHtml(FOOTER_HEADER)}</p>`)
  out.push(
    `<p>👉 <a href="${escapeHtml(canonicalUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(displayLabel)} — 원본 보러 가기</a></p>`,
  )

  return out.join('\n')
}

function resolveCanonicalSourceUrl(input: BuildNaverPackageInput): string {
  const trimBase = (s: string) => s.replace(/\/+$/, '')
  const base =
    (input.publicBaseUrl && input.publicBaseUrl.trim()) ||
    (typeof window !== 'undefined' && window.location ? window.location.origin : '')
  const baseUrl = base ? trimBase(base) : ''
  const explicit = input.post.seo.canonicalPath?.trim()
  if (explicit) {
    const path = explicit.startsWith('/') ? explicit : `/${explicit}`
    return baseUrl ? `${baseUrl}${path}` : path
  }
  const sitePath = `/public/showroom/case/${encodeURIComponent(input.post.siteName)}`
  return baseUrl ? `${baseUrl}${sitePath}` : sitePath
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

  const images = buildImageItems(orderedImages)

  const bodyMarkdown = buildNaverMarkdown(normalizedMarkdown, post, canonicalSourceUrl, displayLabel)
  const bodyHtml = buildNaverHtml(normalizedMarkdown, post, canonicalSourceUrl, displayLabel)
  const titleCandidates = buildTitleCandidates(input)
  const hashtags = buildHashtagPool(input)
  const publishingChecklist = buildPublishingChecklist()

  return {
    bodyHtml,
    bodyMarkdown,
    titleCandidates,
    hashtags,
    images,
    publishingChecklist,
    canonicalSourceUrl,
  }
}

/**
 * 패키지에 들어 있는 이미지를 순서대로 다운로드해서 zip Blob 으로 만든다.
 * 호출부 예: `await downloadNaverPackageAsZip(pkg, 'naver_2505_경기권_6888.zip')`
 *
 * 같은 zip에 본문도 함께 넣어서 운영자가 한 번에 보관하기 좋게 한다.
 *   - body.html / body.md / hashtags.txt / titles.txt / checklist.txt / source.url
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
  zip.file('checklist.txt', pkg.publishingChecklist.map((line, i) => `${i + 1}. ${line}`).join('\n'))
  zip.file('source.url', `[InternetShortcut]\nURL=${pkg.canonicalSourceUrl}\n`)

  const skipped: string[] = []
  let downloaded = 0
  for (const img of pkg.images) {
    try {
      const res = await fetch(img.url, { mode: 'cors' })
      if (!res.ok) {
        skipped.push(img.filename)
        continue
      }
      const blob = await res.blob()
      zip.file(`images/${img.filename}`, blob)
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
