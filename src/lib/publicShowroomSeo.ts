import type { PageHeadJsonLd, PageHeadMetaTag } from '@/lib/usePageHead'

/** 공개 랜딩 정본 호스트 (sitemap · canonical · JSON-LD) */
export const PUBLIC_SHOWROOM_ORIGIN = 'https://www.findgagu.co.kr'

export const PUBLIC_SHOWROOM_BRAND = '파인드가구'
export const PUBLIC_SHOWROOM_HUB_PATH = '/public/showroom'
export const PUBLIC_SHOWROOM_HUB_TITLE = '파인드가구 온라인 쇼룸 — 학원·도서관·아파트 공간 사례'
export const PUBLIC_SHOWROOM_HUB_DESCRIPTION =
  '학원 자습실, 도서관, 아파트 커뮤니티 공간의 Before/After 시공 사례를 모은 파인드가구 온라인 쇼룸입니다. 현장 사진을 보고 맞춤 상담을 요청하세요.'

/** 공개 공유 기본 OG (1200×630, `public/og-default.jpg`) */
export const PUBLIC_SHOWROOM_DEFAULT_OG_PATH = '/og-default.jpg'

export const PUBLIC_SHOWROOM_HUB_FAQS = [
  {
    question: '파인드가구 온라인 쇼룸에서는 무엇을 볼 수 있나요?',
    answer:
      '학원·도서관·아파트 커뮤니티 등 실제 시공 현장의 Before/After 사진과 사례 설명을 볼 수 있습니다. 관심 현장을 고른 뒤 상담을 요청할 수 있습니다.',
  },
  {
    question: '어떤 공간에 가구·공간 시공을 맡길 수 있나요?',
    answer:
      '학원 자습실, 독서실, 도서관, 아파트 커뮤니티 시설 등 공공·교육·주거 부대시설 공간에 맞춘 가구·레이아웃 사례를 중심으로 안내합니다.',
  },
  {
    question: '상담은 어떻게 신청하나요?',
    answer:
      '쇼룸에서 관심 사례를 확인한 뒤 상담(채널톡) 버튼으로 문의하거나, 문의 페이지에서 현장·연락처를 남겨 주시면 됩니다.',
  },
] as const

function absoluteUrl(pathOrUrl: string, origin = typeof window !== 'undefined' ? window.location.origin : PUBLIC_SHOWROOM_ORIGIN): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = origin.replace(/\/+$/, '')
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}

export function getPublicShowroomDefaultOgImageUrl(origin?: string): string {
  const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : PUBLIC_SHOWROOM_ORIGIN)).replace(/\/+$/, '')
  return absoluteUrl(PUBLIC_SHOWROOM_DEFAULT_OG_PATH, base)
}

export function buildPublicShowroomBasicMetas(input: {
  title: string
  description: string
  canonicalPath: string
  ogType?: 'website' | 'article'
  imageUrl?: string | null
  robots?: string | null
}): PageHeadMetaTag[] {
  const origin = typeof window !== 'undefined' ? window.location.origin : PUBLIC_SHOWROOM_ORIGIN
  const canonicalUrl = absoluteUrl(input.canonicalPath, origin)
  const imageUrl = input.imageUrl?.trim() || getPublicShowroomDefaultOgImageUrl(origin)
  const list: PageHeadMetaTag[] = [
    { kind: 'name', name: 'description', content: input.description },
    { kind: 'property', property: 'og:title', content: input.title },
    { kind: 'property', property: 'og:description', content: input.description },
    { kind: 'property', property: 'og:type', content: input.ogType ?? 'website' },
    { kind: 'property', property: 'og:url', content: canonicalUrl },
    { kind: 'property', property: 'og:locale', content: 'ko_KR' },
    { kind: 'property', property: 'og:site_name', content: PUBLIC_SHOWROOM_BRAND },
    { kind: 'property', property: 'og:image', content: imageUrl },
    { kind: 'property', property: 'og:image:width', content: '1200' },
    { kind: 'property', property: 'og:image:height', content: '630' },
    { kind: 'name', name: 'twitter:card', content: 'summary_large_image' },
    { kind: 'name', name: 'twitter:title', content: input.title },
    { kind: 'name', name: 'twitter:description', content: input.description },
    { kind: 'name', name: 'twitter:image', content: imageUrl },
  ]
  if (input.robots?.trim()) {
    list.push({ kind: 'name', name: 'robots', content: input.robots.trim() })
  }
  return list
}

export function buildOrganizationJsonLd(origin = PUBLIC_SHOWROOM_ORIGIN): PageHeadJsonLd {
  const base = origin.replace(/\/+$/, '')
  const logo = getPublicShowroomDefaultOgImageUrl(base)
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: PUBLIC_SHOWROOM_BRAND,
    url: base,
    logo,
    image: logo,
    description: PUBLIC_SHOWROOM_HUB_DESCRIPTION,
    areaServed: {
      '@type': 'Country',
      name: '대한민국',
    },
    knowsAbout: ['학원 가구', '도서관 가구', '아파트 커뮤니티 시설', '자습실 인테리어', '공간 시공'],
  }
}

export function buildWebSiteJsonLd(origin = PUBLIC_SHOWROOM_ORIGIN): PageHeadJsonLd {
  const base = origin.replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: `${PUBLIC_SHOWROOM_BRAND} 온라인 쇼룸`,
    url: `${base}${PUBLIC_SHOWROOM_HUB_PATH}`,
    inLanguage: 'ko-KR',
    publisher: {
      '@type': 'Organization',
      name: PUBLIC_SHOWROOM_BRAND,
      url: base,
    },
  }
}

export function buildHubFaqJsonLd(): PageHeadJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: PUBLIC_SHOWROOM_HUB_FAQS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

export function getPublicShowroomCanonicalUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : PUBLIC_SHOWROOM_ORIGIN
  return absoluteUrl(path, origin)
}
