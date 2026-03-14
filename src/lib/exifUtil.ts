/**
 * 이미지 파일에서 EXIF/GPS 추출 — 스마트 업로드 자동 입력용
 */
import { parse as exifrParse } from 'exifr'

const DATE_TAG_CANDIDATES = [
  'DateTimeOriginal',
  'CreateDate',
  'DateTimeDigitized',
  'ModifyDate',
  'DateCreated',
  'DigitalCreationDate',
  'CreationDate',
  'DateTime',
  '36867',
  '306',
  '36868',
] as const

const REGION_ALIAS_MAP: Record<string, string> = {
  '서울특별시': '서울',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '인천광역시': '인천',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '경기도': '경기',
  '강원도': '강원',
  '강원특별자치도': '강원',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전북특별자치도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주',
}

const METRO_REGIONS = new Set([
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
])

interface ReverseGeocodeAddress {
  state?: string
  city?: string
  county?: string
  borough?: string
  city_district?: string
  district?: string
  municipality?: string
  town?: string
  village?: string
  suburb?: string
  quarter?: string
  neighbourhood?: string
  country_code?: string
}

interface ReverseGeocodeResult {
  address?: ReverseGeocodeAddress
}

function normalizePhotoDate(value: unknown): string | null {
  if (!value) return null

  if (typeof value === 'string') {
    const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})(\s+)/, '$1-$2-$3$4')
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match?.[1]) return match[1]
    const parsed = new Date(normalized)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      const day = String(parsed.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value as string | number)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function findFirstDateValue(source: unknown, seen = new WeakSet<object>()): unknown {
  if (!source || typeof source !== 'object') return null
  if (seen.has(source as object)) return null
  seen.add(source as object)

  const record = source as Record<string, unknown>
  for (const key of DATE_TAG_CANDIDATES) {
    if (record[key] != null) return record[key]
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object' || value instanceof Date || Array.isArray(value)) continue
    const nested = findFirstDateValue(value, seen)
    if (nested != null) return nested
  }

  return null
}

function stripAdministrativeSuffix(value: string, mode: 'district' | 'city'): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (mode === 'district') return trimmed.replace(/(자치)?구$/, '')
  return trimmed.replace(/(특별자치)?시$/, '').replace(/군$/, '')
}

function pickFirstAddressPart(
  address: ReverseGeocodeAddress,
  keys: Array<keyof ReverseGeocodeAddress>
): string | null {
  for (const key of keys) {
    const value = address[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function normalizeKoreanRegion(address: ReverseGeocodeAddress): string | null {
  if (address.country_code && address.country_code.toLowerCase() !== 'kr') return null

  const state = typeof address.state === 'string' ? address.state.trim() : ''
  if (!state) return null

  if (state === '세종특별자치시') return '충남 세종'

  const region = REGION_ALIAS_MAP[state]
  if (!region) return null

  if (state === '제주특별자치도') {
    const city = pickFirstAddressPart(address, ['city', 'county', 'town', 'municipality'])
    const normalizedCity = city ? stripAdministrativeSuffix(city, 'city') : ''
    return normalizedCity ? `${region} ${normalizedCity}` : region
  }

  if (state === '경기도') {
    const city = pickFirstAddressPart(address, ['city', 'county', 'municipality', 'town'])
    const normalizedCity = city ? stripAdministrativeSuffix(city, 'city') : ''
    return normalizedCity ? `${region} ${normalizedCity}` : region
  }

  if (METRO_REGIONS.has(state)) {
    const district = pickFirstAddressPart(address, ['city_district', 'borough', 'district', 'county', 'suburb'])
    const normalizedDistrict = district ? stripAdministrativeSuffix(district, 'district') : ''
    return normalizedDistrict ? `${region} ${normalizedDistrict}` : region
  }

  const city = pickFirstAddressPart(address, ['city', 'county', 'municipality', 'town'])
  const normalizedCity = city ? stripAdministrativeSuffix(city, 'city') : ''
  return normalizedCity ? `${region} ${normalizedCity}` : region
}

async function reverseGeocodeKoreanRegion(lat: number, lon: number): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lon))
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('accept-language', 'ko')

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null

    const json = (await res.json()) as ReverseGeocodeResult
    if (!json.address) return null
    return normalizeKoreanRegion(json.address)
  } catch {
    return null
  }
}

export interface ExifResult {
  /** 촬영일 (EXIF DateTimeOriginal 우선) YYYY-MM-DD */
  photo_date: string | null
  /** 지역 설명 (GPS 위·경도 또는 좌표 문자열. 추후 역지오코딩 연동 가능) */
  location: string | null
  /** 원본 EXIF/GPS 전체 (metadata jsonb 저장용) */
  metadata: Record<string, unknown>
}

/**
 * 파일에서 EXIF를 읽어 촬영일·위치·전체 메타 반환
 */
export async function readExifFromFile(file: File): Promise<ExifResult> {
  const metadata: Record<string, unknown> = {}
  let photo_date: string | null = null
  let location: string | null = null

  try {
    const exif = await exifrParse(file, {
      xmp: true,
      iptc: true,
      gps: true,
    })
    if (!exif || typeof exif !== 'object') return { photo_date: null, location: null, metadata: {} }

    Object.assign(metadata, exif)

    const rawExif = exif as Record<string, unknown>
    const dt = findFirstDateValue(rawExif)
    photo_date = normalizePhotoDate(dt)

    const lat = rawExif.GPSLatitude ?? rawExif['2']
    const lon = rawExif.GPSLongitude ?? rawExif['4']
    if (typeof lat === 'number' && typeof lon === 'number') {
      location =
        (await reverseGeocodeKoreanRegion(lat, lon)) ??
        `${lat.toFixed(6)}, ${lon.toFixed(6)}`
    } else if (lat != null && lon != null) {
      location = `${String(lat)}, ${String(lon)}`
    }
  } catch (_) {
    // EXIF 없거나 읽기 실패 시 빈 결과
  }

  return { photo_date, location, metadata }
}
