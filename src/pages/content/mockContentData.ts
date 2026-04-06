export type MockContentStatus = 'idea' | 'queued' | 'draft' | 'review' | 'approved' | 'published'
export type MockDistributionStatus = 'not_generated' | 'draft_ready' | 'review_pending' | 'scheduled' | 'published' | 'error'
export type MockAutomationStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type MockContentItem = {
  id: string
  siteName: string
  businessType: string
  region: string
  status: MockContentStatus
  priorityReason: string
  readinessScore: number
  automationScore: number
  integrationStatus: '미설정' | 'mock 연결' | '실URL 연결'
  revealLevel: 'teaser' | 'summary' | 'detail'
  updatedAt: string
  tags: string[]
  blogTitle: string
  seoDescription: string
  ctaText: string
  faqTopics: string[]
  derivativeHook: string
}

export type MockDistribution = {
  id: string
  contentItemId: string
  channel: string
  status: MockDistributionStatus
  publishUrl: string | null
  webhookStatus: '연동 미설정' | 'mock 연결' | '실URL 연결'
  updatedAt: string
}

export type MockAutomationJob = {
  id: string
  contentItemId: string
  channel: string
  jobType: string
  status: MockAutomationStatus
  updatedAt: string
  reflectedAt: string | null
  errorMessage: string | null
}

export type MockTemplate = {
  id: string
  templateType: 'blog' | 'cta' | 'shorts_blog_service' | 'shorts_youtube_engine' | 'long_form'
  name: string
  description: string
  usageCount: number
  performanceLabel: string
}

export type MockDerivative = {
  id: string
  contentItemId: string
  type: 'shorts_blog_service' | 'shorts_youtube_engine' | 'long_form' | 'social_caption' | 'cta' | 'faq'
  channel: string
  title: string
  body: string
  hookText: string
  outline: string
  status: 'draft_ready' | 'review_pending' | 'approved'
  updatedAt: string
}

export type MockActivityLog = {
  id: string
  contentItemId: string
  actionType: string
  fromStatus: string | null
  toStatus: string | null
  channel: string | null
  message: string
  createdAt: string
}

export const mockContentItems: MockContentItem[] = [
  {
    id: 'content-2503-apgujeong',
    siteName: '2503 압구정 관리형 독서실',
    businessType: '관리형',
    region: '서울',
    status: 'queued',
    priorityReason: '연동 보완',
    readinessScore: 82,
    automationScore: 58,
    integrationStatus: 'mock 연결',
    revealLevel: 'summary',
    updatedAt: '2026-03-28T10:20:00+09:00',
    tags: ['관리형', '집중도', '상담전환'],
    blogTitle: '압구정 관리형 독서실 공간 리뉴얼로 상담 전환이 좋아진 이유',
    seoDescription: '관리형 독서실 공간 설계와 집중도 개선 포인트를 실제 사례 기준으로 정리한 원문',
    ctaText: '유사 사례를 더 보고 싶다면 상담 전 쇼룸에서 비교 사례를 먼저 확인해 보세요.',
    faqTopics: ['예산', '좌석 구성', '동선', '공사기간'],
    derivativeHook: '같은 평수인데도 상담 반응이 달라진 이유',
  },
  {
    id: 'content-2502-mokdong',
    siteName: '2502 목동 학원 리뉴얼',
    businessType: '학원',
    region: '서울',
    status: 'draft',
    priorityReason: '자동화 확인',
    readinessScore: 88,
    automationScore: 74,
    integrationStatus: '실URL 연결',
    revealLevel: 'detail',
    updatedAt: '2026-03-28T09:45:00+09:00',
    tags: ['학원', '리뉴얼', '브랜딩'],
    blogTitle: '목동 학원 리뉴얼 사례로 보는 브랜딩형 공간 설계 포인트',
    seoDescription: '학원 리뉴얼에서 상담 전환과 신뢰도를 높인 디자인 포인트를 정리한 원문',
    ctaText: '학원 업종에 맞는 사례를 더 보고 싶다면 상세 상담 전에 발행 큐 기준 사례를 함께 검토하세요.',
    faqTopics: ['브랜딩', '수납', '색상', '학생 동선'],
    derivativeHook: '학원은 왜 인테리어보다 신뢰감 설계가 먼저일까',
  },
  {
    id: 'content-2501-songdo',
    siteName: '2501 송도 스터디카페 전환',
    businessType: '스터디카페',
    region: '인천',
    status: 'review',
    priorityReason: '템플릿 보완',
    readinessScore: 76,
    automationScore: 69,
    integrationStatus: '실URL 연결',
    revealLevel: 'teaser',
    updatedAt: '2026-03-27T17:10:00+09:00',
    tags: ['스터디카페', '전환', '후킹'],
    blogTitle: '스터디카페를 관리형 스타일로 전환할 때 먼저 바뀌어야 하는 것',
    seoDescription: '스터디카페 전환 사례를 바탕으로 후킹과 운영 메시지를 정리한 원문',
    ctaText: '관리형 전환에 가까운 사례가 궁금하면 전환형 쇼룸 사례를 함께 살펴보세요.',
    faqTopics: ['전환 컨셉', '좌석 밀도', '집중도', '브랜딩'],
    derivativeHook: '스터디카페가 관리형처럼 보이기 시작한 순간',
  },
]

export const mockDistributions: MockDistribution[] = [
  {
    id: 'dist-1',
    contentItemId: 'content-2503-apgujeong',
    channel: 'Google Blog',
    status: 'draft_ready',
    publishUrl: null,
    webhookStatus: 'mock 연결',
    updatedAt: '2026-03-28T10:18:00+09:00',
  },
  {
    id: 'dist-2',
    contentItemId: 'content-2502-mokdong',
    channel: 'Naver Blog',
    status: 'review_pending',
    publishUrl: null,
    webhookStatus: 'mock 연결',
    updatedAt: '2026-03-28T09:50:00+09:00',
  },
  {
    id: 'dist-3',
    contentItemId: 'content-2502-mokdong',
    channel: 'YouTube Shorts',
    status: 'scheduled',
    publishUrl: 'https://example.com/shorts/mockdong',
    webhookStatus: '실URL 연결',
    updatedAt: '2026-03-28T09:52:00+09:00',
  },
  {
    id: 'dist-4',
    contentItemId: 'content-2501-songdo',
    channel: 'Instagram Reels',
    status: 'draft_ready',
    publishUrl: null,
    webhookStatus: '실URL 연결',
    updatedAt: '2026-03-27T17:58:00+09:00',
  },
  {
    id: 'dist-5',
    contentItemId: 'content-2501-songdo',
    channel: 'Facebook Video',
    status: 'error',
    publishUrl: null,
    webhookStatus: '실URL 연결',
    updatedAt: '2026-03-27T18:02:00+09:00',
  },
]

export const mockAutomationJobs: MockAutomationJob[] = [
  {
    id: 'job-1',
    contentItemId: 'content-2503-apgujeong',
    channel: 'Google Blog',
    jobType: 'blog_publish',
    status: 'queued',
    updatedAt: '2026-03-28T10:19:00+09:00',
    reflectedAt: null,
    errorMessage: null,
  },
  {
    id: 'job-2',
    contentItemId: 'content-2502-mokdong',
    channel: 'YouTube Shorts',
    jobType: 'shorts_youtube_engine',
    status: 'processing',
    updatedAt: '2026-03-28T09:54:00+09:00',
    reflectedAt: '2026-03-28T09:55:00+09:00',
    errorMessage: null,
  },
  {
    id: 'job-3',
    contentItemId: 'content-2501-songdo',
    channel: 'Instagram Reels',
    jobType: 'shorts_blog_service',
    status: 'completed',
    updatedAt: '2026-03-27T17:57:00+09:00',
    reflectedAt: '2026-03-27T17:59:00+09:00',
    errorMessage: null,
  },
  {
    id: 'job-4',
    contentItemId: 'content-2501-songdo',
    channel: 'Facebook Video',
    jobType: 'shorts_blog_service',
    status: 'failed',
    updatedAt: '2026-03-27T18:05:00+09:00',
    reflectedAt: '2026-03-27T18:07:00+09:00',
    errorMessage: 'payload에 필수 CTA 링크가 빠졌습니다.',
  },
]

export const mockTemplates: MockTemplate[] = [
  {
    id: 'tpl-blog-1',
    templateType: 'blog',
    name: 'SEO 메인 원문 템플릿',
    description: '문제 인식 -> 해결 방식 -> 후기 -> CTA 순서로 구성된 기본 블로그 템플릿',
    usageCount: 18,
    performanceLabel: '안정적',
  },
  {
    id: 'tpl-shorts-blog-1',
    templateType: 'shorts_blog_service',
    name: '블로그 기반 숏츠 템플릿',
    description: '블로그 핵심 문장을 압축해 릴스/숏츠 소개 스크립트와 업로드 체크 항목을 정리합니다.',
    usageCount: 11,
    performanceLabel: '테스트 확대',
  },
  {
    id: 'tpl-shorts-youtube-1',
    templateType: 'shorts_youtube_engine',
    name: '유튜브 자동화 숏츠 템플릿',
    description: '비포어/애프터 또는 시공사례 기반 영상 엔진용 후킹, 장면 순서, CTA 메모를 정리합니다.',
    usageCount: 6,
    performanceLabel: '신규',
  },
]

export const mockDerivatives: MockDerivative[] = [
  {
    id: 'drv-1',
    contentItemId: 'content-2503-apgujeong',
    type: 'shorts_youtube_engine',
    channel: 'YouTube Shorts',
    title: '압구정 사례 유튜브 자동화 쇼츠 초안',
    body: '상담 전환이 달라진 공간 설계 포인트를 비포어/애프터 중심 15초 영상 흐름으로 정리한 초안',
    hookText: '같은 평수인데 왜 상담 반응이 달라질까요?',
    outline: '비포어 -> 변화 포인트 -> CTA',
    status: 'draft_ready',
    updatedAt: '2026-03-28T10:21:00+09:00',
  },
  {
    id: 'drv-2',
    contentItemId: 'content-2502-mokdong',
    type: 'shorts_blog_service',
    channel: 'YouTube Shorts',
    title: '목동 학원 블로그 기반 숏츠 초안',
    body: '원문 핵심 문장을 30초 이내 영상 스크립트와 업로드 캡션 흐름으로 정리한 초안',
    hookText: '학원은 왜 인테리어보다 신뢰감 설계가 먼저일까',
    outline: '후킹 -> 핵심 장면 -> CTA',
    status: 'review_pending',
    updatedAt: '2026-03-28T09:48:00+09:00',
  },
  {
    id: 'drv-3',
    contentItemId: 'content-2501-songdo',
    type: 'social_caption',
    channel: 'Instagram Reels',
    title: '송도 전환형 릴스 캡션',
    body: '관리형 전환 포인트를 짧은 문장과 CTA 중심으로 정리한 캡션',
    hookText: '스터디카페가 관리형처럼 보이기 시작한 순간',
    outline: '후킹 -> 변화 포인트 -> CTA',
    status: 'approved',
    updatedAt: '2026-03-27T17:30:00+09:00',
  },
  {
    id: 'drv-4',
    contentItemId: 'content-2501-songdo',
    type: 'social_caption',
    channel: 'Facebook Video',
    title: '송도 전환형 페이스북 영상 캡션',
    body: '페이스북 영상 게시용으로 조금 더 설명형으로 정리한 캡션',
    hookText: '관리형 전환 전후를 한 번에 보여주는 사례',
    outline: '후킹 -> 변화 포인트 -> CTA',
    status: 'draft_ready',
    updatedAt: '2026-03-27T17:35:00+09:00',
  },
]

export const mockActivityLogs: MockActivityLog[] = [
  {
    id: 'log-1',
    contentItemId: 'content-2503-apgujeong',
    actionType: 'queue_sync',
    fromStatus: 'idea',
    toStatus: 'queued',
    channel: null,
    message: '쇼룸 원천 이미지 기준으로 콘텐츠 후보가 갱신되었습니다.',
    createdAt: '2026-03-28T10:22:00+09:00',
  },
  {
    id: 'log-2',
    contentItemId: 'content-2502-mokdong',
    actionType: 'automation_dispatch',
    fromStatus: 'draft',
    toStatus: 'review',
    channel: 'YouTube Shorts',
    message: '쇼츠 자동화 요청이 처리 중 상태로 전환되었습니다.',
    createdAt: '2026-03-28T09:54:00+09:00',
  },
  {
    id: 'log-3',
    contentItemId: 'content-2501-songdo',
    actionType: 'distribution_error',
    fromStatus: 'review',
    toStatus: 'review',
    channel: 'Facebook Video',
    message: 'CTA 링크 누락으로 배포 오류가 발생했습니다.',
    createdAt: '2026-03-27T18:05:00+09:00',
  },
]

export function getMockContentItem(id: string) {
  return mockContentItems.find((item) => item.id === id) ?? null
}

export function getMockContentJobs(contentItemId: string) {
  return mockAutomationJobs.filter((item) => item.contentItemId === contentItemId)
}

export function getMockContentDistributions(contentItemId: string) {
  return mockDistributions.filter((item) => item.contentItemId === contentItemId)
}

export function formatMockDate(value: string | null) {
  if (!value) return '없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '없음'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
