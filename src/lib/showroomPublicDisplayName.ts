/**
 * 공개 쇼룸용 현장 표시명 광역화 — imageAssetService와 showroomShareService 사이 순환 의존 방지를 위해 분리.
 */

function broadenRegionLabel(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const first = normalized.split(' ')[0] ?? ''
  const map: Record<string, string> = {
    서울: '서울권',
    경기: '경기권',
    인천: '경기권',
    부산: '부산권',
    대구: '대구권',
    광주: '광주권',
    대전: '대전권',
    울산: '울산권',
    세종: '충청권',
    강원: '강원권',
    충북: '충청권',
    충남: '충청권',
    전북: '전북권',
    전남: '전남권',
    경북: '경북권',
    경남: '경남권',
    제주: '제주권',
  }
  return map[first] ?? first
}

function inferBroadRegionFromToken(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return null

  const first = normalized.split(' ')[0] ?? ''
  const exactRegion = broadenRegionLabel(first)
  if (exactRegion !== first || /권$/.test(exactRegion)) return exactRegion

  const cityPrefixes: Array<[string, string]> = [
    ['강남', '서울권'],
    ['강동', '서울권'],
    ['강북', '서울권'],
    ['강서', '서울권'],
    ['관악', '서울권'],
    ['광진', '서울권'],
    ['구로', '서울권'],
    ['금천', '서울권'],
    ['노원', '서울권'],
    ['도봉', '서울권'],
    ['동대문', '서울권'],
    ['동작', '서울권'],
    ['마포', '서울권'],
    ['목동', '서울권'],
    ['서대문', '서울권'],
    ['서초', '서울권'],
    ['성동', '서울권'],
    ['성북', '서울권'],
    ['송파', '서울권'],
    ['양천', '서울권'],
    ['영등포', '서울권'],
    ['용산', '서울권'],
    ['은평', '서울권'],
    ['종로', '서울권'],
    ['중구', '서울권'],
    ['중랑', '서울권'],
    ['수원', '경기권'],
    ['성남', '경기권'],
    ['용인', '경기권'],
    ['부천', '경기권'],
    ['안산', '경기권'],
    ['안양', '경기권'],
    ['남양주', '경기권'],
    ['화성', '경기권'],
    ['평택', '경기권'],
    ['의정부', '경기권'],
    ['시흥', '경기권'],
    ['파주', '경기권'],
    ['김포', '경기권'],
    ['광명', '경기권'],
    ['하남', '경기권'],
    ['오산', '경기권'],
    ['군포', '경기권'],
    ['양주', '경기권'],
    ['이천', '경기권'],
    ['안성', '경기권'],
    ['구리', '경기권'],
    ['포천', '경기권'],
    ['의왕', '경기권'],
    ['여주', '경기권'],
    ['동두천', '경기권'],
    ['과천', '경기권'],
    ['가평', '경기권'],
    ['연천', '경기권'],
    ['인천', '경기권'],
    ['부산', '부산권'],
    ['대구', '대구권'],
    ['광주광역시', '광주권'],
    ['대전', '대전권'],
    ['울산', '울산권'],
    ['세종', '충청권'],
    ['춘천', '강원권'],
    ['원주', '강원권'],
    ['강릉', '강원권'],
    ['청주', '충청권'],
    ['천안', '충청권'],
    ['아산', '충청권'],
    ['전주', '전북권'],
    ['군산', '전북권'],
    ['목포', '전남권'],
    ['순천', '전남권'],
    ['포항', '경북권'],
    ['구미', '경북권'],
    ['창원', '경남권'],
    ['김해', '경남권'],
    ['진주', '경남권'],
    ['제주', '제주권'],
  ]

  for (const [prefix, broad] of cityPrefixes) {
    if (normalized.startsWith(prefix)) return broad
  }

  return null
}

export function broadenPublicDisplayName(siteName: string | null): string | null {
  const normalized = (siteName ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  const parts = normalized.split(' ')
  if (parts.length < 3) return normalized
  const hasEstimatePrefix = parts[0] === '견적'
  const prefixCount = hasEstimatePrefix ? 1 : 0
  const hasMonthPrefix = /^\d{4}$/.test(parts[prefixCount] ?? '')
  const regionIndex = hasMonthPrefix ? prefixCount + 1 : prefixCount
  const regionToken = parts[regionIndex] ?? ''
  const cityToken = parts[regionIndex + 1] ?? ''
  const broadRegion = inferBroadRegionFromToken(`${regionToken} ${cityToken}`)
    || inferBroadRegionFromToken(regionToken)
  const shouldReplaceRegion = /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(regionToken)
  if (!broadRegion) return normalized
  return [
    hasEstimatePrefix ? null : null,
    hasMonthPrefix ? parts[prefixCount] : null,
    broadRegion,
    ...parts.slice(regionIndex + (shouldReplaceRegion ? 2 : 1)),
  ]
    .filter(Boolean)
    .join(' ')
}
