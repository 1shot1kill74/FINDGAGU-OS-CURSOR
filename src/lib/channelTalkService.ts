/**
 * 채널톡 자동화 가상 테스트 — 시뮬레이터용 서비스
 * - 비정형 문의 텍스트 → AI 파싱(Mock) → Consultations 메타데이터 매핑
 * - FAQ 엔진: 키워드(가격/사이즈/배송/견적/상담 등) 매칭 시 3단계 응답(안심→정보→가치) [AI 자동 응답] 타임라인 기록
 * - 매칭 없으면 일반 순차 안내 멘트 1건만 기록. 생성 데이터는 is_test: true (일괄 삭제 가능)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import { INDUSTRY_SEARCH_KEYWORDS } from '@/data/referenceCases'
import type { IndustryTag } from '@/data/referenceCases'

export interface ChannelTalkSimulatorPayload {
  name: string
  contact: string
  inquiry: string
  industry: string
}

/** AI 파싱 결과 (비정형 문의 → 컬럼 매핑용). Mock: 키워드/정규식 기반, 추후 LLM 교체 가능 */
export interface ParsedInquiry {
  region?: string
  pain_point?: string
  /** 기타 메타 확장용 */
  [key: string]: string | undefined
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi

/** 비정형 문의 텍스트를 Mock 파싱하여 region, pain_point 등 구조화. 추후 LLM API로 교체 */
export async function parseInquiryToStructuredData(rawText: string): Promise<ParsedInquiry> {
  const t = (rawText || '').trim()
  const result: ParsedInquiry = {}

  const regionKeywords: Record<string, string> = {
    서울: '서울',
    경기: '경기',
    인천: '인천',
    부산: '부산',
    대구: '대구',
    광주: '광주',
    대전: '대전',
    울산: '울산',
    세종: '세종',
    강원: '강원',
    충북: '충북',
    충남: '충남',
    전북: '전북',
    전남: '전남',
    경북: '경북',
    경남: '경남',
    제주: '제주',
  }
  for (const [key, value] of Object.entries(regionKeywords)) {
    if (t.includes(key)) {
      result.region = value
      break
    }
  }

  if (t.length > 0) result.pain_point = t.slice(0, 500)
  return result
}

/** 업종 문자열 → 표준 IndustryTag 매칭 (CONSULTATION_INDUSTRY_OPTIONS와 동일 체계) */
function normalizeIndustry(input: string): string {
  const s = (input || '').trim()
  if (!s) return '기타'
  for (const [tag, keywords] of Object.entries(INDUSTRY_SEARCH_KEYWORDS)) {
    if (keywords.some((k) => s.includes(k) || s === tag)) return tag
  }
  return s || '기타'
}

export interface MarketingLinkItem {
  title: string
  link: string
}

/** marketing_contents에서 블로그용 콘텐츠 조회. 업종(industry)에 맞는 링크 목록 반환. content 내 URL 추출 또는 title 기반 placeholder */
export async function getMarketingLinksForIndustry(
  supabase: SupabaseClient,
  industry: string
): Promise<MarketingLinkItem[]> {
  const { data: rows } = await supabase
    .from('marketing_contents')
    .select('id, title, content, platform, persona')
    .eq('platform', 'blog')
    .limit(20)

  const list = (rows || []) as Array<{ id: string; title: string; content: string; platform: string; persona?: string }>
  const industryLower = industry.toLowerCase().replace(/\s/g, '')
  const out: MarketingLinkItem[] = []

  for (const row of list) {
    const title = row.title || '블로그 글'
    const content = row.content || ''
    const firstUrl = content.match(URL_IN_TEXT)?.[0]
    const link = firstUrl || `https://blog.findgagu.com/${encodeURIComponent(title)}`
    const match =
      (row.persona && row.persona.includes(industry)) ||
      (row.title && row.title.includes(industry)) ||
      industryLower.includes('기타')
    if (match || list.length <= 3) out.push({ title, link })
  }

  if (out.length === 0) {
    out.push({
      title: `[${industry}] 업종 추천 블로그`,
      link: `https://blog.findgagu.com/${encodeURIComponent(industry)}`,
    })
  }
  return out.slice(0, 5)
}

export interface ProcessSimulatedResult {
  consultationId: string
  parsed: ParsedInquiry
  sentMessages: string[]
  error?: string
}

const AI_BADGE = '[AI 자동 응답]'

/** A/S FAQ 표준 답변 (키 'A/S', 'AS' 공통) */
const FAQ_ANSWER_AS =
  '제작·설치 완료 후 A/S가 필요하시면 담당자에게 연락 주시면 됩니다. 보증 범위 내에서 신속히 처리해 드립니다.'

/** FAQ 매칭 테이블: 핵심 키워드별 표준 답변. 특수문자·슬래시 포함 키는 따옴표로 감싸서 문법 오류 방지 */
export const FAQ_DATA: Record<string, string> = {
  '가격':
    '가구 비용은 규격·수량·옵션에 따라 달라집니다. 방문 상담 또는 사진·평수 공유 시 맞춤 견적을 안내해 드립니다.',
  '비용': '비용은 규격·수량·옵션에 따라 달라집니다. 방문 상담 또는 사진·평수 공유 시 맞춤 견적을 안내해 드립니다.',
  '사이즈':
    '규격은 현장 실측 후 최종 확정됩니다. 대략적인 평수나 가로×세로×높이(mm)를 알려주시면 가용 제품을 먼저 추천해 드립니다.',
  '규격':
    '규격은 현장 실측 후 최종 확정됩니다. 대략적인 평수나 가로×세로×높이(mm)를 알려주시면 가용 제품을 먼저 추천해 드립니다.',
  '배송':
    '제작 완료 후 배송·설치는 지역에 따라 1~2주 소요될 수 있습니다. 급한 일정이 있으시면 문의 시 말씀해 주시면 조정해 드리겠습니다.',
  '설치':
    '설치는 제작 완료 후 일정을 조율해 진행합니다. 현장 조건(엘리베이터, 층수)에 따라 추가 안내를 드립니다.',
  '견적':
    '견적은 업체명·연락처·대략적인 규격·수량을 알려주시면 1~2일 내 회신해 드립니다. 상세한 현장 실측 후 최종 견적을 드립니다.',
  '상담':
    '상담은 전화·채널톡·방문 모두 가능합니다. 원하시는 시간대를 알려주시면 담당자가 순차적으로 연락드리겠습니다.',
  '기간':
    '제작·배송·설치 기간은 규모와 지역에 따라 다릅니다. 문의 시 예상 일정을 안내해 드립니다.',
  'A/S': FAQ_ANSWER_AS,
  'AS': FAQ_ANSWER_AS,
}

/** 문의 텍스트에서 FAQ 키워드 매칭 (첫 번째 매칭 키워드 반환, 없으면 null). 웹훅 Edge Function에서 동일 로직 사용 */
export function matchFaqKeyword(inquiry: string): string | null {
  const t = (inquiry || '').trim()
  if (!t) return null
  for (const keyword of Object.keys(FAQ_DATA)) {
    if (t.includes(keyword)) return keyword
  }
  return null
}

/** 1단계 안심: 문의하신 {키워드} 관련 내용 확인 + 담당자 준비 중 */
function buildReassuranceMent(keyword: string): string {
  return `${AI_BADGE} 문의하신 ${keyword} 관련 내용을 확인했습니다. 담당자가 상세히 안내해 드리기 위해 준비 중입니다.`
}

/** 2단계 정보: {키워드}에 대해 먼저 안내 + FAQ 표준 답변 */
function buildInfoMent(keyword: string, faqAnswer: string): string {
  return `${AI_BADGE} ${keyword}에 대해 먼저 안내드리면, ${faqAnswer} 입니다.`
}

/** 3단계 가치: 업종 시공 사례 + 블로그 링크 */
function buildValueMent(industry: string, links: MarketingLinkItem[]): string {
  const prefix = `${AI_BADGE} 기다리시는 동안 참고하실 만한 ${industry} 시공 사례입니다.`
  if (links.length === 0) return prefix
  const linkLines = links.map((item) => `[${item.title}] ${item.link}`)
  return `${prefix}\n${linkLines.join('\n')}`
}

/** 매칭 키워드 없을 때: 일반 순차 안내 멘트 1건 */
function buildGenericSequentialMent(): string {
  return `${AI_BADGE} 문의하신 내용을 확인했습니다. 담당자가 순차적으로 안내해 드리겠습니다. 잠시만 기다려 주세요.`
}

/**
 * 시뮬레이터에서 쏜 채널톡 형식 데이터 처리:
 * 1) AI 파싱 → metadata(region, pain_point, industry 등) 구성
 * 2) Consultations insert (is_test: true)
 * 3) FAQ 키워드 매칭 시: [AI 자동 응답] 1단계(안심) → 2단계(정보·FAQ 표준 답변) → 3단계(가치·블로그 링크) 순서대로 타임라인 기록
 * 4) 매칭 키워드 없으면: [AI 자동 응답] 순차 안내 멘트 1건만 기록
 */
export async function processSimulatedIncoming(
  supabase: SupabaseClient,
  payload: ChannelTalkSimulatorPayload
): Promise<ProcessSimulatedResult> {
  const { name, contact, inquiry, industry } = payload
  const companyName = (name || '').trim() || '(채널톡 시뮬레이터)'
  const contactNorm = (contact || '').trim() || '000-0000-0000'
  const industryNorm = normalizeIndustry(industry)

  const parsed = await parseInquiryToStructuredData(inquiry)
  const metadata: Record<string, unknown> = {
    source: '채널톡',
    channel_talk_simulator: true,
    industry: industryNorm,
    region: parsed.region ?? '미확인',
    pain_point: parsed.pain_point ?? inquiry.slice(0, 500),
  }

  const { data: consultation, error: consultErr } = await supabase
    .from('consultations')
    .insert({
      company_name: companyName,
      manager_name: companyName,
      contact: contactNorm,
      status: '상담중',
      expected_revenue: null,
      is_test: true,
      is_visible: true,
      metadata: metadata as Json,
    })
    .select('id')
    .single()

  if (consultErr || !consultation) {
    return {
      consultationId: '',
      parsed,
      sentMessages: [],
      error: consultErr?.message ?? '상담 생성 실패',
    }
  }

  const consultationId = consultation.id
  const sentMessages: string[] = []
  const keyword = matchFaqKeyword(inquiry)

  if (keyword && FAQ_DATA[keyword]) {
    const faqAnswer = FAQ_DATA[keyword]
    const ment1 = buildReassuranceMent(keyword)
    const ment2 = buildInfoMent(keyword, faqAnswer)
    const links = await getMarketingLinksForIndustry(supabase, industryNorm)
    const ment3 = buildValueMent(industryNorm, links)

    for (const [index, content] of [ment1, ment2, ment3].entries()) {
      const { error: msgErr } = await supabase.from('consultation_messages').insert({
        consultation_id: consultationId,
        sender_id: 'system',
        content,
        message_type: 'SYSTEM',
        metadata: { type: 'channel_faq_auto_reply', step: index + 1, keyword: index === 0 || index === 1 ? keyword : undefined },
      })
      if (!msgErr) sentMessages.push(content)
    }
  } else {
    const generic = buildGenericSequentialMent()
    const { error: msgErr } = await supabase.from('consultation_messages').insert({
      consultation_id: consultationId,
      sender_id: 'system',
      content: generic,
      message_type: 'SYSTEM',
      metadata: { type: 'channel_faq_auto_reply', step: 0, generic: true },
    })
    if (!msgErr) sentMessages.push(generic)
  }

  return { consultationId, parsed, sentMessages }
}
