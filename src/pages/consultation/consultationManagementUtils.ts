import { OPEN_MARKET_SOURCES, type CustomerTier } from './consultationManagementConstants'

export function isMarketSource(source: string): boolean {
  return OPEN_MARKET_SOURCES.includes(source as (typeof OPEN_MARKET_SOURCES)[number])
}

/**
 * 지능형 등급 제안 (Mock) — 업체명·메모 키워드로 적절한 등급 추천.
 * 신규 등록·마이그레이션 시 추천용. 예: '초등학교' 포함 → 교육기관 성격으로 신규 제안.
 */
export function suggestCategory(companyName: string, painPoint?: string): CustomerTier {
  const text = `${companyName ?? ''} ${painPoint ?? ''}`.toLowerCase()
  if (/조심|주의|이슈/.test(text)) return '조심'
  if (/파트너|제휴|협력/.test(text)) return '파트너'
  if (/단골|재계약|재방문/.test(text)) return '단골'
  if (/초등학교|중학교|고등학교|학원|학교|교육|대학|교습소|독서실/.test(text)) return '신규'
  return '미지정'
}
