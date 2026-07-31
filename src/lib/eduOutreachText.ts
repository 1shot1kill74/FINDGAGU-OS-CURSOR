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

/**
 * Google News RSS description은 보통
 * `<a>제목</a>&nbsp;&nbsp;<font>매체명</font>` 형태라 본문이 거의 없다.
 * 링크 텍스트·매체명을 뽑아 읽기 쉬운 한 줄 요약으로 만든다.
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

  let summary = ''
  if (headline && publisher) summary = `${headline} — ${publisher}`
  else if (headline) summary = headline
  else summary = plain

  return { headline, publisher, summary }
}

/** UI/저장용: HTML이면 정리하고, 뉴스 블러브면 매체명까지 붙인 요약 */
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
      summary: blurb.summary || title || '원문 요약이 없습니다. 정본 링크를 확인하세요.',
    }
  }

  const title = stripHtmlToText(input.title)
  const summary = stripHtmlToText(rawBody)
  return {
    title,
    publisher: '',
    summary: summary || title || '원문 요약이 없습니다. 정본 링크를 확인하세요.',
  }
}
