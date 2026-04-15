import { HIGHLIGHT_KEYWORDS } from '@/pages/showroom/showroomPageConstants'

/** 말풍선 문구에서 하이라이트할 핵심 단어 (주황/브랜드 강조색) */
export function highlightKeywords(text: string) {
  if (!text) return null
  const parts: { str: string; highlight: boolean }[] = []
  let remaining = text
  while (remaining.length > 0) {
    let earliest = { index: remaining.length, kw: '' }
    for (const kw of HIGHLIGHT_KEYWORDS) {
      const i = remaining.indexOf(kw)
      if (i !== -1 && i < earliest.index) earliest = { index: i, kw }
    }
    if (earliest.kw) {
      if (earliest.index > 0) parts.push({ str: remaining.slice(0, earliest.index), highlight: false })
      parts.push({ str: earliest.kw, highlight: true })
      remaining = remaining.slice(earliest.index + earliest.kw.length)
    } else {
      parts.push({ str: remaining, highlight: false })
      break
    }
  }
  return parts.map((p, i) =>
    p.highlight ? (
      <span key={i} className="text-amber-600 font-semibold">
        {p.str}
      </span>
    ) : (
      <span key={i}>{p.str}</span>
    )
  )
}
