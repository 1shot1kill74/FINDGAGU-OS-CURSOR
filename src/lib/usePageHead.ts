import { useEffect } from 'react'

export type PageHeadMetaTag =
  | { kind: 'name'; name: string; content: string }
  | { kind: 'property'; property: string; content: string }

export type PageHeadJsonLd = Record<string, unknown>

export type PageHeadOptions = {
  title?: string | null
  metas?: PageHeadMetaTag[]
  canonicalUrl?: string | null
  jsonLd?: PageHeadJsonLd[] | null
}

const MANAGED_ATTR = 'data-page-head'
const PRESERVED_META_NAMES = new Set(['naver-site-verification'])

function escapeAttrSelector(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function clearManagedHeadElements(): void {
  const head = document.head
  const managed = head.querySelectorAll(`[${MANAGED_ATTR}="1"]`)
  managed.forEach((node) => node.parentNode?.removeChild(node))
}

/** prerender/정적 셸에 이미 있는 동일 SEO 태그를 제거해 중복을 막는다. */
function clearReplacedSeoHeadElements(options: PageHeadOptions): void {
  const head = document.head

  if (options.canonicalUrl?.trim()) {
    head.querySelectorAll('link[rel="canonical"]').forEach((node) => {
      node.parentNode?.removeChild(node)
    })
  }

  if (options.jsonLd && options.jsonLd.length > 0) {
    head.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
      node.parentNode?.removeChild(node)
    })
  }

  for (const tag of options.metas ?? []) {
    if (tag.kind === 'name') {
      if (PRESERVED_META_NAMES.has(tag.name)) continue
      head
        .querySelectorAll(`meta[name="${escapeAttrSelector(tag.name)}"]`)
        .forEach((node) => node.parentNode?.removeChild(node))
      continue
    }
    head
      .querySelectorAll(`meta[property="${escapeAttrSelector(tag.property)}"]`)
      .forEach((node) => node.parentNode?.removeChild(node))
  }
}

function applyMeta(tag: PageHeadMetaTag): HTMLMetaElement {
  const meta = document.createElement('meta')
  if (tag.kind === 'name') {
    meta.setAttribute('name', tag.name)
  } else {
    meta.setAttribute('property', tag.property)
  }
  meta.setAttribute('content', tag.content)
  meta.setAttribute(MANAGED_ATTR, '1')
  return meta
}

function applyCanonical(url: string): HTMLLinkElement {
  const link = document.createElement('link')
  link.setAttribute('rel', 'canonical')
  link.setAttribute('href', url)
  link.setAttribute(MANAGED_ATTR, '1')
  return link
}

function applyJsonLd(data: PageHeadJsonLd): HTMLScriptElement {
  const script = document.createElement('script')
  script.setAttribute('type', 'application/ld+json')
  script.setAttribute(MANAGED_ATTR, '1')
  script.textContent = JSON.stringify(data)
  return script
}

/**
 * 클라이언트 사이드에서 `<head>`의 title/meta/canonical/JSON-LD를 관리한다.
 * 동일 페이지에서 여러 번 호출되어도 마지막 호출 결과만 유지된다.
 * prerender가 넣은 동일 태그는 교체해서 중복되지 않는다.
 */
export function usePageHead(options: PageHeadOptions): void {
  const { title, metas, canonicalUrl, jsonLd } = options

  useEffect(() => {
    const head = document.head
    const previousTitle = document.title

    clearManagedHeadElements()
    clearReplacedSeoHeadElements(options)

    if (title && title.trim()) {
      document.title = title.trim()
    }

    metas?.forEach((m) => {
      if (!m.content || !m.content.trim()) return
      head.appendChild(applyMeta(m))
    })

    if (canonicalUrl && canonicalUrl.trim()) {
      head.appendChild(applyCanonical(canonicalUrl.trim()))
    }

    jsonLd?.forEach((data) => {
      if (!data || typeof data !== 'object') return
      head.appendChild(applyJsonLd(data))
    })

    return () => {
      clearManagedHeadElements()
      document.title = previousTitle
    }
  }, [title, metas, canonicalUrl, jsonLd])
}
