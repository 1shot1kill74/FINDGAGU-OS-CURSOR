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

function clearManagedHeadElements(): void {
  const head = document.head
  const managed = head.querySelectorAll(`[${MANAGED_ATTR}="1"]`)
  managed.forEach((node) => node.parentNode?.removeChild(node))
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
 */
export function usePageHead(options: PageHeadOptions): void {
  const { title, metas, canonicalUrl, jsonLd } = options

  useEffect(() => {
    const head = document.head
    const previousTitle = document.title

    clearManagedHeadElements()

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
