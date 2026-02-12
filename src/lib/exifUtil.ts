/**
 * 이미지 파일에서 EXIF/GPS 추출 — 스마트 업로드 자동 입력용
 */
import { parse as exifrParse } from 'exifr'

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
    const exif = await exifrParse(file)
    if (!exif || typeof exif !== 'object') return { photo_date: null, location: null, metadata: {} }

    Object.assign(metadata, exif)

    const dt = (exif as Record<string, unknown>).DateTimeOriginal ?? (exif as Record<string, unknown>).CreateDate
    if (dt) {
      const d = dt instanceof Date ? dt : new Date(dt as string | number)
      if (!Number.isNaN(d.getTime())) {
        photo_date = d.toISOString().slice(0, 10)
      }
    }

    const lat = (exif as Record<string, unknown>).GPSLatitude
    const lon = (exif as Record<string, unknown>).GPSLongitude
    if (typeof lat === 'number' && typeof lon === 'number') {
      location = `${lat.toFixed(6)}, ${lon.toFixed(6)}`
    } else if (lat != null && lon != null) {
      location = `${String(lat)}, ${String(lon)}`
    }
  } catch (_) {
    // EXIF 없거나 읽기 실패 시 빈 결과
  }

  return { photo_date, location, metadata }
}
