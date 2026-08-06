/** 공개 시그널 원문 HTML → 사람이 읽을 텍스트 */

export function stripHtmlToText(input: string | null | undefined): string {
  if (!input) return ''
  let text = String(input)
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCharCode(code) : ' '
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = Number.parseInt(h, 16)
      return Number.isFinite(code) ? String.fromCharCode(code) : ' '
    })
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

function normalizeForCompare(text: string): string {
  return stripHtmlToText(text)
    .toLowerCase()
    .replace(/["'`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 제목 끝의 ` - 매체` / ` — 매체` 접미 제거 (검색·비교용) */
export function stripPublisherSuffix(title: string): string {
  return stripHtmlToText(title)
    .replace(/\s+[—–-]\s+[^\n—–-]{1,40}$/u, '')
    .trim()
}

/**
 * Google News RSS description은 보통
 * `<a>제목</a>&nbsp;&nbsp;<font>매체명</font>` 형태라 본문이 없다.
 * 제목·매체만 뽑아 두고, summary는 비운다(가짜 요약 방지).
 */
export function extractGoogleNewsBlurb(html: string | null | undefined): {
  headline: string
  publisher: string
  summary: string
} {
  const raw = String(html || '')
  const linkMatch = raw.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)
  const fontMatch = raw.match(/<font\b[^>]*>([\s\S]*?)<\/font>/i)
  const headline = stripHtmlToText(linkMatch?.[1] || '')
  const publisher = stripHtmlToText(fontMatch?.[1] || '')
  const plain = stripHtmlToText(raw)

  // 링크+매체만 있으면 요약이 아님. plain이 더 길 때만 본문 후보로 사용.
  const blurbOnly = Boolean(headline) && (!plain || plain === headline || plain === `${headline} ${publisher}`)
  const summary = blurbOnly ? '' : plain

  return { headline, publisher, summary }
}

/**
 * RSS/저장본이 제목(±매체)만 반복한 경우 true.
 * 예: "학원 리모델링 완료 — E동아"
 */
export function isTitleLikeSummary(title: string | null | undefined, summary: string | null | undefined): boolean {
  const t = normalizeForCompare(title || '')
  const s = normalizeForCompare(summary || '')
  if (!s) return true
  if (!t) return false
  if (s === t) return true

  const tCore = normalizeForCompare(stripPublisherSuffix(t))
  const sCore = normalizeForCompare(stripPublisherSuffix(s))
  if (tCore && sCore && (tCore === sCore || tCore.startsWith(sCore) || sCore.startsWith(tCore))) {
    // 요약이 제목과 같거나, 제목+짧은 매체 접미만 붙은 경우
    if (Math.abs(s.length - t.length) <= 48) return true
  }

  // "제목 — 매체" 패턴이면서 본문 길이 부족
  if (/[—–-]/.test(summary || '') && s.length <= t.length + 48 && sCore.startsWith(tCore.slice(0, Math.min(28, tCore.length)))) {
    return true
  }

  return false
}

/** UI/저장용: HTML이면 정리하고, 뉴스 블러브면 매체만 분리(가짜 요약 만들지 않음) */
export function toReadableSourceText(input: {
  title?: string | null
  body?: string | null
}): { title: string; summary: string; publisher: string } {
  const rawBody = input.body || ''
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(rawBody) || /&nbsp;|&lt;|&gt;/.test(rawBody)

  if (looksLikeHtml && /<a\b/i.test(rawBody)) {
    const blurb = extractGoogleNewsBlurb(rawBody)
    const title = stripHtmlToText(input.title) || blurb.headline
    return {
      title,
      publisher: blurb.publisher,
      summary: blurb.summary,
    }
  }

  const title = stripHtmlToText(input.title)
  let summary = stripHtmlToText(rawBody)
  let publisher = ''

  // 이미 정규화된 "제목 — 매체" 저장본
  const publisherMatch = summary.match(/\s+[—–]\s+([^\n—–]{1,40})$/u)
  if (publisherMatch) {
    publisher = publisherMatch[1].trim()
  } else {
    const dashMatch = summary.match(/\s+-\s+([^\n-]{1,40})$/u)
    // 제목성 한 줄 + 짧은 매체명일 때만 publisher로 간주
    if (dashMatch && isTitleLikeSummary(title, summary)) {
      publisher = dashMatch[1].trim()
    }
  }

  if (isTitleLikeSummary(title, summary)) {
    summary = ''
  }

  return {
    title,
    publisher,
    summary,
  }
}
