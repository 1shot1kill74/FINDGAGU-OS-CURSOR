import type { PageHeadJsonLd, PageHeadMetaTag } from './usePageHead'
import {
  assignUniqueShowroomCaseSlugs,
  buildPublicShowroomCasePath,
  buildPublicShowroomCasePathFromSlug,
} from './showroomCaseSlug'
import { FINDGAGU_ENTITY_ONE_LINER, MANAGED_STUDY_CAFE_GUIDE_PATH } from './aeo/managedStudyCafeFurnitureGuide'
import { SHOWROOM_GUIDES, type ShowroomGuide } from './aeo/showroomGuides'

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

/** .co.kr = 현장 사례 정본, .com = 제품·회사 소개 */
export const PUBLIC_SHOWROOM_DOMAIN_ROLES = {
  showroom: {
    origin: PUBLIC_SHOWROOM_ORIGIN,
    role: '현장 사례·가이드·상담 정본',
    summary:
      'www.findgagu.co.kr 은 시공 Before/After, 업종 가이드, 상담 접수의 정본입니다.',
  },
  product: {
    origin: PUBLIC_SHOWROOM_PRODUCT_ORIGIN,
    role: '제품·회사 소개',
    summary:
      'www.findgagu.com 은 제품 시리즈·회사 이력·트랜드 원문을 두는 소개 사이트입니다. 사례 검색·인용은 .co.kr을 씁니다.',
  },
} as const

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
export const PUBLIC_SHOWROOM_CONTACT_PATH = '/contact'
export const PUBLIC_SHOWROOM_HUB_TITLE =
  '파인드가구 온라인 쇼룸 — 관리형 스터디카페·학원·아파트 공간 사례'
export const PUBLIC_SHOWROOM_HUB_DESCRIPTION =
  '관리형 스터디카페·관리형 독서실·학원 자습실·아파트 커뮤니티 공간의 Before/After 시공 사례를 모은 파인드가구 온라인 쇼룸입니다. 맞춤 가구·배치 컨설팅 상담을 요청하세요.'
export const PUBLIC_SHOWROOM_GALLERY_TITLE =
  '시공사례 더보기 — 파인드가구 온라인 쇼룸'
export const PUBLIC_SHOWROOM_GALLERY_DESCRIPTION =
  '업종·제품·색상별로 파인드가구 시공 사례 사진을 더 둘러보세요. 관리형 스터디카페·학원·학교·아파트 커뮤니티 현장 사진을 확인할 수 있습니다.'
export const PUBLIC_SHOWROOM_CONTACT_TITLE = `${PUBLIC_SHOWROOM_BRAND} 상담 문의`
export const PUBLIC_SHOWROOM_CONTACT_DESCRIPTION =
  '관리형 스터디카페·학원 자습실·아파트 커뮤니티 맞춤 가구·배치 상담. 쇼룸 사례를 보고 온 문의도 접수합니다. 전화 031-592-7981.'
export const PUBLIC_SHOWROOM_CONTACT_FEATURED_ANSWER =
  '파인드가구 상담은 견적만 받는 창구가 아니라, 평수·좌석 수·관리 동선을 듣고 레이아웃과 가구 구성을 맞춰 드리는 무료 컨설팅입니다. 시공 사례 정본은 www.findgagu.co.kr, 제품·회사 소개는 www.findgagu.com 입니다.'
export const PUBLIC_SHOWROOM_CONTACT_FAQS = [
  {
    question: '파인드가구 상담은 무엇을 해주나요?',
    answer: PUBLIC_SHOWROOM_CONTACT_FEATURED_ANSWER,
  },
  {
    question: '상담 전에 무엇을 보면 되나요?',
    answer:
      '온라인 쇼룸에서 같은 업종 Before/After를 고른 뒤 문의를 남기면 됩니다. 관리형 스터디카페·관리형 독서실·학원 자습실·아파트 커뮤니티 가이드에 체크리스트가 있습니다.',
  },
  {
    question: 'findgagu.com과 findgagu.co.kr은 무엇이 다른가요?',
    answer: `${PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.summary} ${PUBLIC_SHOWROOM_DOMAIN_ROLES.product.summary}`,
  },
] as const

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
    answer: `책상 규격·1인 몰입석 비율·관리 동선 체크리스트와 FAQ는 파인드가구 가이드(${PUBLIC_SHOWROOM_ORIGIN}${MANAGED_STUDY_CAFE_GUIDE_PATH})에 정리되어 있습니다. 쇼룸에서는 Before/After 사례를 확인할 수 있습니다.`,
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
  {
    question: '학원 자습실·아파트 커뮤니티·관리형 독서실 가이드도 있나요?',
    answer: `관리형 스터디카페 외에 학원 자습실·아파트 커뮤니티·관리형 독서실 가이드가 있습니다. ${SHOWROOM_GUIDES.map((guide) => `${guide.teaserLabel}(${PUBLIC_SHOWROOM_ORIGIN}${guide.path})`).join(', ')}`,
  },
  {
    question: 'findgagu.com과 findgagu.co.kr은 무엇이 다른가요?',
    answer: `${PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.summary} ${PUBLIC_SHOWROOM_DOMAIN_ROLES.product.summary}`,
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
    '@type': ['Organization', 'LocalBusiness'],
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
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.role,
        value: PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.origin,
      },
      {
        '@type': 'PropertyValue',
        name: PUBLIC_SHOWROOM_DOMAIN_ROLES.product.role,
        value: PUBLIC_SHOWROOM_DOMAIN_ROLES.product.origin,
      },
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

export type PublicShowroomHubCaseLink = {
  siteName: string
  title: string
  path: string
}

export function buildHubBreadcrumbJsonLd(origin = PUBLIC_SHOWROOM_ORIGIN): PageHeadJsonLd {
  const base = origin.replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: PUBLIC_SHOWROOM_BRAND,
        item: base,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '온라인 쇼룸',
        item: `${base}${PUBLIC_SHOWROOM_HUB_PATH}`,
      },
    ],
  }
}

export function buildHubCollectionJsonLd(
  cases: PublicShowroomHubCaseLink[] = [],
  origin = PUBLIC_SHOWROOM_ORIGIN,
): PageHeadJsonLd {
  const base = origin.replace(/\/+$/, '')
  const pageUrl = `${base}${PUBLIC_SHOWROOM_HUB_PATH}`
  const itemList =
    cases.length > 0
      ? {
          '@type': 'ItemList',
          numberOfItems: cases.length,
          itemListElement: cases.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.title,
            url: absoluteUrl(item.path, base),
          })),
        }
      : undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: PUBLIC_SHOWROOM_HUB_TITLE,
    description: PUBLIC_SHOWROOM_HUB_DESCRIPTION,
    url: pageUrl,
    inLanguage: 'ko-KR',
    isPartOf: {
      '@type': 'WebSite',
      name: `${PUBLIC_SHOWROOM_BRAND} 온라인 쇼룸`,
      url: pageUrl,
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#showroom-main-heading', '#showroom-hub-faq'],
    },
    ...(itemList ? { mainEntity: itemList } : {}),
  }
}

export function toPublicShowroomHubCaseLink(input: {
  siteName: string
  title?: string | null
  slug?: string | null
}): PublicShowroomHubCaseLink {
  const siteName = input.siteName.trim()
  const title = input.title?.trim() || siteName
  return {
    siteName,
    title,
    path: input.slug?.trim()
      ? buildPublicShowroomCasePathFromSlug(input.slug.trim())
      : buildPublicShowroomCasePath({ siteName, title }),
  }
}

export function toPublicShowroomHubCaseLinks(
  rows: Array<{ siteName: string; title?: string | null }>,
): PublicShowroomHubCaseLink[] {
  const slugs = assignUniqueShowroomCaseSlugs(rows)
  return rows.map((row) =>
    toPublicShowroomHubCaseLink({
      siteName: row.siteName,
      title: row.title,
      slug: slugs.get(row.siteName.trim()),
    }),
  )
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

export function buildHubPrerenderPage(
  origin = PUBLIC_SHOWROOM_ORIGIN,
  cases: PublicShowroomHubCaseLink[] = [],
): PublicShowroomPrerenderPage {
  const base = origin.replace(/\/+$/, '')
  const canonicalUrl = absoluteUrl(PUBLIC_SHOWROOM_HUB_PATH, base)
  const faqHtml = PUBLIC_SHOWROOM_HUB_FAQS.map(
    (item) =>
      `<dt>${escapePrerenderHtml(item.question)}</dt><dd>${escapePrerenderHtml(item.answer)}</dd>`,
  ).join('')
  const caseHtml = cases
    .map((item) => {
      const href = absoluteUrl(item.path, base)
      return `<li><a href="${escapePrerenderHtml(href)}">${escapePrerenderHtml(item.title)}</a></li>`
    })
    .join('')
  return {
    relativeDir: 'public/showroom',
    title: PUBLIC_SHOWROOM_HUB_TITLE,
    description: PUBLIC_SHOWROOM_HUB_DESCRIPTION,
    canonicalUrl,
    ogType: 'website',
    ogImage: getPublicShowroomDefaultOgImageUrl(base),
    jsonLd: [
      buildOrganizationJsonLd(base),
      buildWebSiteJsonLd(base),
      buildHubFaqJsonLd(),
      buildHubBreadcrumbJsonLd(base),
      buildHubCollectionJsonLd(cases, base),
    ],
    noscriptHtml: [
      `<h1>${escapePrerenderHtml(PUBLIC_SHOWROOM_HUB_TITLE)}</h1>`,
      `<p>${escapePrerenderHtml(PUBLIC_SHOWROOM_HUB_DESCRIPTION)}</p>`,
      `<p>${escapePrerenderHtml(FINDGAGU_ENTITY_ONE_LINER)}</p>`,
      `<section><h2>자주 묻는 질문</h2><dl>${faqHtml}</dl></section>`,
      caseHtml
        ? `<section><h2>시공 사례</h2><ol>${caseHtml}</ol></section>`
        : '',
      `<p><a href="${escapePrerenderHtml(canonicalUrl)}">${escapePrerenderHtml(canonicalUrl)}</a></p>`,
    ].filter(Boolean).join('\n'),
  }
}

export function buildGuidePrerenderPage(
  guide: ShowroomGuide,
  origin = PUBLIC_SHOWROOM_ORIGIN,
): PublicShowroomPrerenderPage {
  const base = origin.replace(/\/+$/, '')
  const canonicalUrl = absoluteUrl(guide.path, base)
  const checklistHtml = guide.checklist
    .map(
      (item) =>
        `<li><strong>${escapePrerenderHtml(item.label)}</strong> — ${escapePrerenderHtml(item.detail)}</li>`,
    )
    .join('')
  const faqHtml = guide.faqs
    .map(
      (item) =>
        `<dt>${escapePrerenderHtml(item.question)}</dt><dd>${escapePrerenderHtml(item.answer)}</dd>`,
    )
    .join('')
  return {
    relativeDir: `public/showroom/guide/${guide.slug}`,
    title: guide.title,
    description: guide.description,
    canonicalUrl,
    ogType: 'article',
    ogImage: getPublicShowroomDefaultOgImageUrl(base),
    jsonLd: [
      buildOrganizationJsonLd(base),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        inLanguage: 'ko-KR',
        mainEntityOfPage: canonicalUrl,
        author: { '@type': 'Organization', name: PUBLIC_SHOWROOM_BRAND },
        publisher: { '@type': 'Organization', name: PUBLIC_SHOWROOM_BRAND },
        about: [...guide.about],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: guide.faqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
    noscriptHtml: [
      `<h1>${escapePrerenderHtml(guide.h1)}</h1>`,
      `<p>${escapePrerenderHtml(FINDGAGU_ENTITY_ONE_LINER)}</p>`,
      `<p>${escapePrerenderHtml(guide.featuredAnswer)}</p>`,
      `<section><h2>선택 체크리스트</h2><ul>${checklistHtml}</ul></section>`,
      `<section><h2>자주 묻는 질문</h2><dl>${faqHtml}</dl></section>`,
      `<p>${escapePrerenderHtml(PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.summary)} ${escapePrerenderHtml(PUBLIC_SHOWROOM_DOMAIN_ROLES.product.summary)}</p>`,
      `<p><a href="${escapePrerenderHtml(canonicalUrl)}">${escapePrerenderHtml(canonicalUrl)}</a></p>`,
    ].join('\n'),
  }
}

export function buildGalleryPrerenderPage(
  origin = PUBLIC_SHOWROOM_ORIGIN,
  cases: PublicShowroomHubCaseLink[] = [],
): PublicShowroomPrerenderPage {
  const base = origin.replace(/\/+$/, '')
  const canonicalUrl = absoluteUrl(PUBLIC_SHOWROOM_GALLERY_PATH, base)
  const hubUrl = absoluteUrl(PUBLIC_SHOWROOM_HUB_PATH, base)
  const contactUrl = absoluteUrl(PUBLIC_SHOWROOM_CONTACT_PATH, base)
  const caseHtml = cases
    .map((item) => {
      const href = absoluteUrl(item.path, base)
      return `<li><a href="${escapePrerenderHtml(href)}">${escapePrerenderHtml(item.title)}</a></li>`
    })
    .join('')
  return {
    relativeDir: 'public/showroom/gallery',
    title: PUBLIC_SHOWROOM_GALLERY_TITLE,
    description: PUBLIC_SHOWROOM_GALLERY_DESCRIPTION,
    canonicalUrl,
    ogType: 'website',
    ogImage: getPublicShowroomDefaultOgImageUrl(base),
    jsonLd: [
      buildOrganizationJsonLd(base),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: PUBLIC_SHOWROOM_GALLERY_TITLE,
        description: PUBLIC_SHOWROOM_GALLERY_DESCRIPTION,
        url: canonicalUrl,
        inLanguage: 'ko-KR',
        isPartOf: {
          '@type': 'WebSite',
          name: `${PUBLIC_SHOWROOM_BRAND} 온라인 쇼룸`,
          url: hubUrl,
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: PUBLIC_SHOWROOM_BRAND,
            item: hubUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: '시공사례 더보기',
            item: canonicalUrl,
          },
        ],
      },
    ],
    noscriptHtml: [
      `<h1>${escapePrerenderHtml(PUBLIC_SHOWROOM_GALLERY_TITLE)}</h1>`,
      `<p>${escapePrerenderHtml(PUBLIC_SHOWROOM_GALLERY_DESCRIPTION)}</p>`,
      `<p>${escapePrerenderHtml(FINDGAGU_ENTITY_ONE_LINER)}</p>`,
      caseHtml
        ? `<section><h2>시공 사례</h2><ol>${caseHtml}</ol></section>`
        : '',
      `<p><a href="${escapePrerenderHtml(hubUrl)}">온라인 쇼룸</a> · <a href="${escapePrerenderHtml(contactUrl)}">상담 문의</a></p>`,
      `<p><a href="${escapePrerenderHtml(canonicalUrl)}">${escapePrerenderHtml(canonicalUrl)}</a></p>`,
    ].filter(Boolean).join('\n'),
  }
}

export function buildContactPrerenderPage(origin = PUBLIC_SHOWROOM_ORIGIN): PublicShowroomPrerenderPage {
  const base = origin.replace(/\/+$/, '')
  const canonicalUrl = absoluteUrl(PUBLIC_SHOWROOM_CONTACT_PATH, base)
  const hubUrl = absoluteUrl(PUBLIC_SHOWROOM_HUB_PATH, base)
  const { phone, email, address } = PUBLIC_SHOWROOM_COMPANY
  return {
    relativeDir: 'contact',
    title: PUBLIC_SHOWROOM_CONTACT_TITLE,
    description: PUBLIC_SHOWROOM_CONTACT_DESCRIPTION,
    canonicalUrl,
    ogType: 'website',
    ogImage: getPublicShowroomDefaultOgImageUrl(base),
    jsonLd: [
      buildOrganizationJsonLd(base),
      {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: PUBLIC_SHOWROOM_CONTACT_TITLE,
        description: PUBLIC_SHOWROOM_CONTACT_DESCRIPTION,
        url: canonicalUrl,
        inLanguage: 'ko-KR',
        mainEntity: {
          '@type': 'LocalBusiness',
          name: PUBLIC_SHOWROOM_BRAND,
          telephone: phone,
          email,
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: PUBLIC_SHOWROOM_CONTACT_FAQS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: PUBLIC_SHOWROOM_BRAND,
            item: hubUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: '상담 문의',
            item: canonicalUrl,
          },
        ],
      },
    ],
    noscriptHtml: [
      `<h1>${escapePrerenderHtml(PUBLIC_SHOWROOM_CONTACT_TITLE)}</h1>`,
      `<p>${escapePrerenderHtml(PUBLIC_SHOWROOM_CONTACT_FEATURED_ANSWER)}</p>`,
      `<p>${escapePrerenderHtml(FINDGAGU_ENTITY_ONE_LINER)}</p>`,
      `<section><h2>자주 묻는 질문</h2><dl>${PUBLIC_SHOWROOM_CONTACT_FAQS.map(
        (item) =>
          `<dt>${escapePrerenderHtml(item.question)}</dt><dd>${escapePrerenderHtml(item.answer)}</dd>`,
      ).join('')}</dl></section>`,
      `<section><h2>연락처</h2><p>전화 ${escapePrerenderHtml(phone)} · ${escapePrerenderHtml(email)}</p><p>${escapePrerenderHtml(address)}</p></section>`,
      `<p>${escapePrerenderHtml(PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.summary)} ${escapePrerenderHtml(PUBLIC_SHOWROOM_DOMAIN_ROLES.product.summary)}</p>`,
      `<p><a href="${escapePrerenderHtml(hubUrl)}">온라인 쇼룸 보기</a></p>`,
      `<p><a href="${escapePrerenderHtml(canonicalUrl)}">${escapePrerenderHtml(canonicalUrl)}</a></p>`,
    ].join('\n'),
  }
}

