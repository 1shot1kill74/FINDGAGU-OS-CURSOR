/**
 * 네이버 클립 수기 발행용 패키지.
 *
 * - 업로드 API 없음 → 앱(모바일) 또는 네이버TV Creator Studio(WEB/PC)에서 사람이 올림
 * - OS는 제목·태그·설명·첫댓글·랜딩·체크리스트만 준비 (유튜브 숏츠 카피 재사용)
 * - 유입 측정: /r/clip/:jobId → 숏츠 랜딩 + utm_source=naver_clip
 */

import {
  PUBLIC_SHOWROOM_ORIGIN,
} from '@/lib/publicShowroomSeo'
import {
  buildShowroomShortsPublishPackage,
  type ShowroomShortsTargetRecord,
} from '@/lib/showroomShorts'

export const NAVER_CLIP_UTM_SOURCE = 'naver_clip' as const

export type NaverClipUploadPath = 'mobile_app' | 'creator_studio_web'

export type NaverClipPackage = {
  title: string
  /** 클립 제목 제한에 맞춤 (대략 50자 권장) */
  titleForClip: string
  description: string
  hashtags: string[]
  hashtagsText: string
  descriptionWithHashtags: string
  firstComment: string
  landingUrl: string
  videoUrl: string | null
  uploadPaths: Array<{
    id: NaverClipUploadPath
    label: string
    summary: string
  }>
  publishingChecklist: string[]
}

function clipLandingUrl(jobId: string, origin = PUBLIC_SHOWROOM_ORIGIN): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/r/clip/${encodeURIComponent(jobId)}`
}

function truncateTitle(title: string, max = 50): string {
  const t = title.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trim()}…`
}

function normalizeHashtags(raw: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const token = item.trim().replace(/^#+/, '')
    if (!token) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(`#${token}`)
  }
  // 네이버 검색·클립 태그 보강 (중복 시 normalize에서 걸림)
  for (const extra of ['관리형스터디카페', '스터디카페가구', '파인드가구']) {
    const key = extra.toLowerCase()
    if (seen.has(key)) continue
    if (out.length >= 10) break
    seen.add(key)
    out.push(`#${extra}`)
  }
  return out.slice(0, 10)
}

function stripLandingUrls(text: string): string {
  return text
    .replace(/\n?https?:\/\/(?:www\.)?findgagu\.co\.kr\S*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildNaverClipPackage(input: {
  jobId: string
  /** 보통 유튜브 타깃 — 카피 정본 */
  sourceTarget: ShowroomShortsTargetRecord
  videoUrl?: string | null
  publicOrigin?: string
}): NaverClipPackage {
  const origin = (input.publicOrigin ?? PUBLIC_SHOWROOM_ORIGIN).replace(/\/+$/, '')
  const base = buildShowroomShortsPublishPackage(input.sourceTarget)
  const landingUrl = clipLandingUrl(input.jobId, origin)
  const hashtags = normalizeHashtags(
    (base.hashtagsText.match(/#[^\s#]+/g) ?? []).map((h) => h.replace(/^#/, '')),
  )
  const hashtagsText = hashtags.join(' ')
  const description = stripLandingUrls(base.description)
  const descriptionWithHashtags = [description, hashtagsText].filter(Boolean).join('\n\n')
  const commentBody = stripLandingUrls(base.firstComment) ||
    '관리형 스터디카페·자습실 사례가 더 궁금하시면 쇼룸에서 확인하세요.'
  const firstComment = `${commentBody}\n${landingUrl}`

  return {
    title: base.title,
    titleForClip: truncateTitle(base.title, 50),
    description,
    hashtags,
    hashtagsText,
    descriptionWithHashtags,
    firstComment,
    landingUrl,
    videoUrl: input.videoUrl?.trim() || null,
    uploadPaths: [
      {
        id: 'mobile_app',
        label: '모바일 (일반)',
        summary: '네이버앱 클립 탭 또는 클립 크리에이터 앱 → + → 갤러리에서 MP4 선택 → 제목·태그 입력 → 업로드',
      },
      {
        id: 'creator_studio_web',
        label: 'PC (네이버TV 스튜디오)',
        summary:
          '네이버TV Creator Studio 2.0에 채널이 있으면 웹에서 클립 업로드 가능. 없으면 모바일 경로 사용.',
      },
    ],
    publishingChecklist: [
      '최종 MP4를 폰으로 전송(모바일)하거나 PC에서 스튜디오 업로드 준비',
      '제목은 50자 이내 · 검색 키워드를 앞에 배치',
      '태그 5~10개 (관리형스터디카페 등 네이버 검색어 포함)',
      '첫 댓글에 /r/clip/:jobId 랜딩 붙여 유입 측정',
      '가이드 URL로 CTA를 바꾸지 않음 (측정·전환 퍼널 유지)',
      '게시 후 숏츠 잡에 외부 URL을 메모해 두면 추적에 유리',
    ],
  }
}

export function formatNaverClipPackageText(pkg: NaverClipPackage): string {
  return [
    '[네이버 클립 수기 발행 패키지]',
    '',
    `제목(50자): ${pkg.titleForClip}`,
    '',
    '설명:',
    pkg.description,
    '',
    `태그: ${pkg.hashtagsText}`,
    '',
    '첫 댓글:',
    pkg.firstComment,
    '',
    `랜딩: ${pkg.landingUrl}`,
    pkg.videoUrl ? `영상: ${pkg.videoUrl}` : '영상: (잡의 MP4 다운로드 사용)',
    '',
    '업로드 경로:',
    ...pkg.uploadPaths.map((p) => `- ${p.label}: ${p.summary}`),
    '',
    '체크리스트:',
    ...pkg.publishingChecklist.map((item) => `- ${item}`),
  ].join('\n')
}
