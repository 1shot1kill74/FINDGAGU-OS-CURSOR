import type { PageHeadJsonLd, PageHeadMetaTag } from './usePageHead'
import {
  FINDGAGU_ENTITY_ONE_LINER,
  MANAGED_STUDY_CAFE_CHECKLIST,
  MANAGED_STUDY_CAFE_FEATURED_ANSWER,
  MANAGED_STUDY_CAFE_FAQS,
  MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
  MANAGED_STUDY_CAFE_GUIDE_PATH,
  MANAGED_STUDY_CAFE_GUIDE_TITLE,
} from './aeo/managedStudyCafeFurnitureGuide'

/**
 * Organization.sameAs — 공식 채널 (findgagu.com 푸터 · 내부 세일즈킷 기준)
 * YouTube @findgagu1552 / Instagram @findgagu2 / Facebook findgagu
 */
export const PUBLIC_SHOWROOM_SAME_AS = [
  'https://www.youtube.com/@findgagu1552',
  'https://www.instagram.com/findgagu2/',
  'https://www.facebook.com/findgagu',
  'https://blog.naver.com/findgagu',
] as const

/** 공개 랜딩 정본 호스트 (sitemap · canonical · JSON-LD) */
export const PUBLIC_SHOWROOM_ORIGIN = 'https://www.findgagu.co.kr'

/** 제품·회사 이력 에비던스 호스트 (findgagu.com) */
export const PUBLIC_SHOWROOM_PRODUCT_ORIGIN = 'https://www.findgagu.com'

export const PUBLIC_SHOWROOM_BRAND = '파인드가구'

/** 공개 푸터·Organization JSON-LD용 사업자 정보 (.com과 동일) */
export const PUBLIC_SHOWROOM_COMPANY = {
  legalName: '파인드가구',
  phone: '031-592-7981',
  fax: '031-592-7982',
  email: 'findgagu@naver.com',
  address: '경기도 남양주시 화도읍 가곡로88번길 29-2',
  businessNumber: '374-81-02631',
  mailOrderNumber: '제 2022-화도수동-125호',
} as const

export const PUBLIC_SHOWROOM_HUB_PATH = '/public/showroom'
export const PUBLIC_SHOWROOM_GALLERY_PATH = '/public/showroom/gallery'
export const PUBLIC_SHOWROOM_HUB_TITLE =
  '파인드가구 온라인 쇼룸 — 관리형 스터디카페·학원·아파트 공간 사례'
export const PUBLIC_SHOWROOM_HUB_DESCRIPTION =
  '관리형 스터디카페·관리형 독서실·학원 자습실·아파트 커뮤니티 공간의 Before/After 시공 사례를 모은 파인드가구 온라인 쇼룸입니다. 맞춤 가구·배치 컨설팅 상담을 요청하세요.'
export const PUBLIC_SHOWROOM_GALLERY_TITLE =
  '시공사례 더보기 — 파인드가구 온라인 쇼룸'
export const PUBLIC_SHOWROOM_GALLERY_DESCRIPTION =
  '업종·제품·색상별로 파인드가구 시공 사례 사진을 더 둘러보세요. 관리형 스터디카페·학원·학교·아파트 커뮤니티 현장 사진을 확인할 수 있습니다.'

/** 공개 공유 기본 OG (1200×630, `public/og-default.jpg`) */
export const PUBLIC_SHOWROOM_DEFAULT_OG_PATH = '/og-default.jpg'

/** 허브 FAQ는 짧게 — 상세 Q&A는 가이드 정본 페이지 */
export const PUBLIC_SHOWROOM_HUB_FAQS = [
  {
    question: '파인드가구는 어떤 업체인가요?',
    answer: FINDGAGU_ENTITY_ONE_LINER,
  },
  {
    question: '파인드가구 온라인 쇼룸에서는 무엇을 볼 수 있나요?',
    answer:
      '관리형 스터디카페·관리형 독서실·학원·아파트 커뮤니티 등 실제 시공 현장의 Before/After 사진과 사례 설명을 볼 수 있습니다. 관심 현장을 고른 뒤 상담을 요청할 수 있습니다.',
  },
  {
    question: '관리형 스터디카페 가구는 어디서 기준을 보면 되나요?',
    answer: `책상 규격·1인 몰입석 비율·관리 동선 체크리스트와 FAQ는 파인드가구 가이드(${MANAGED_STUDY_CAFE_GUIDE_PATH})에 정리되어 있습니다. 쇼룸에서는 Before/After 사례를 확인할 수 있습니다.`,
  },
  {
    question: '어떤 공간에 가구·공간 시공을 맡길 수 있나요?',
    answer:
      '관리형 스터디카페, 관리형 독서실, 학원 자습실, 도서관, 아파트 커뮤니티 시설 등 교육·학습 공간에 맞춘 가구·레이아웃 사례를 중심으로 안내합니다.',
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
    legalName: PUBLIC_SHOWROOM_COMPANY.legalName,
    url: base,
    logo,
    image: logo,
    description: FINDGAGU_ENTITY_ONE_LINER,
    telephone: PUBLIC_SHOWROOM_COMPANY.phone,
    email: PUBLIC_SHOWROOM_COMPANY.email,
    taxID: PUBLIC_SHOWROOM_COMPANY.businessNumber,
    address: {
      '@type': 'PostalAddress',
      streetAddress: PUBLIC_SHOWROOM_COMPANY.address,
      addressLocality: '남양주시',
      addressRegion: '경기도',
      addressCountry: 'KR',
    },
    sameAs: [...PUBLIC_SHOWROOM_SAME_AS, PUBLIC_SHOWROOM_PRODUCT_ORIGIN],
    areaServed: {
      '@type': 'Country',
      name: '대한민국',
    },
    knowsAbout: [
      '관리형 스터디카페 가구',
      '관리형 독서실 가구',
      '스터디카페 인테리어',
      '학원 가구',
      '도서관 가구',
      '아파트 커뮤니티 시설',
      '자습실 인테리어',
      '공간 시공',
    ],
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

/** 빌드 타임 prerender용 — 허브·가이드 정적 head/noscript 스펙 */
export type PublicShowroomPrerenderPage = {
  /** dist 기준 상대 디렉터리 (끝에 index.html 기록) */
  relativeDir: string
  title: string
  description: string
  canonicalUrl: string
  ogType: 'website' | 'article'
  ogImage: string
  jsonLd: PageHeadJsonLd[]
  noscriptHtml: string
}

function escapePrerenderHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildHubPrerenderPage(origin = PUBLIC_SHOWROOM_ORIGIN): PublicShowroomPrerenderPage {
  const base = origin.replace(/\/+$/, '')
  const canonicalUrl = absoluteUrl(PUBLIC_SHOWROOM_HUB_PATH, base)
  const faqHtml = PUBLIC_SHOWROOM_HUB_FAQS.map(
    (item) =>
      `<dt>${escapePrerenderHtml(item.question)}</dt><dd>${escapePrerenderHtml(item.answer)}</dd>`,
  ).join('')
  return {
    relativeDir: 'public/showroom',
    title: PUBLIC_SHOWROOM_HUB_TITLE,
    description: PUBLIC_SHOWROOM_HUB_DESCRIPTION,
    canonicalUrl,
    ogType: 'website',
    ogImage: getPublicShowroomDefaultOgImageUrl(base),
    jsonLd: [buildOrganizationJsonLd(base), buildWebSiteJsonLd(base), buildHubFaqJsonLd()],
    noscriptHtml: [
      `<h1>${escapePrerenderHtml(PUBLIC_SHOWROOM_HUB_TITLE)}</h1>`,
      `<p>${escapePrerenderHtml(PUBLIC_SHOWROOM_HUB_DESCRIPTION)}</p>`,
      `<p>${escapePrerenderHtml(FINDGAGU_ENTITY_ONE_LINER)}</p>`,
      `<section><h2>자주 묻는 질문</h2><dl>${faqHtml}</dl></section>`,
      `<p><a href="${escapePrerenderHtml(canonicalUrl)}">${escapePrerenderHtml(canonicalUrl)}</a></p>`,
    ].join('\n'),
  }
}

export function buildGuidePrerenderPage(origin = PUBLIC_SHOWROOM_ORIGIN): PublicShowroomPrerenderPage {
  const base = origin.replace(/\/+$/, '')
  const canonicalUrl = absoluteUrl(MANAGED_STUDY_CAFE_GUIDE_PATH, base)
  const checklistHtml = MANAGED_STUDY_CAFE_CHECKLIST.map(
    (item) =>
      `<li><strong>${escapePrerenderHtml(item.label)}</strong> — ${escapePrerenderHtml(item.detail)}</li>`,
  ).join('')
  const faqHtml = MANAGED_STUDY_CAFE_FAQS.map(
    (item) =>
      `<dt>${escapePrerenderHtml(item.question)}</dt><dd>${escapePrerenderHtml(item.answer)}</dd>`,
  ).join('')
  return {
    relativeDir: 'public/showroom/guide/managed-study-cafe-furniture',
    title: MANAGED_STUDY_CAFE_GUIDE_TITLE,
    description: MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
    canonicalUrl,
    ogType: 'article',
    ogImage: getPublicShowroomDefaultOgImageUrl(base),
    jsonLd: [
      buildOrganizationJsonLd(base),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: MANAGED_STUDY_CAFE_GUIDE_TITLE,
        description: MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
        inLanguage: 'ko-KR',
        mainEntityOfPage: canonicalUrl,
        author: { '@type': 'Organization', name: PUBLIC_SHOWROOM_BRAND },
        publisher: { '@type': 'Organization', name: PUBLIC_SHOWROOM_BRAND },
        about: ['관리형 스터디카페 가구', '관리형 독서실 가구', '스터디카페 가구업체'],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: MANAGED_STUDY_CAFE_FAQS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
    noscriptHtml: [
      `<h1>${escapePrerenderHtml(MANAGED_STUDY_CAFE_GUIDE_TITLE)}</h1>`,
      `<p>${escapePrerenderHtml(FINDGAGU_ENTITY_ONE_LINER)}</p>`,
      `<p>${escapePrerenderHtml(MANAGED_STUDY_CAFE_FEATURED_ANSWER)}</p>`,
      `<section><h2>선택 체크리스트</h2><ul>${checklistHtml}</ul></section>`,
      `<section><h2>자주 묻는 질문</h2><dl>${faqHtml}</dl></section>`,
      `<p><a href="${escapePrerenderHtml(canonicalUrl)}">${escapePrerenderHtml(canonicalUrl)}</a></p>`,
    ].join('\n'),
  }
}

