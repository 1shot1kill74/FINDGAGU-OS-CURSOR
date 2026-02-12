/**
 * 공식 가구 컬러칩 — 이미지 자산·견적서 색상 드롭다운 옵션
 * DB color_chips (color_type, color_name) 기준. 기타 선택 시 직접 입력 가능.
 */
import { getSupabase } from '@/lib/supabase'

export type ColorType = 'Standard' | 'Special' | 'Other'

export interface ColorChip {
  id: string
  color_type: ColorType
  color_name: string
  display_order: number
}

/** DB 조회 실패 시 사용할 기본 목록 (마이그레이션 시드와 동일) */
export const COLOR_CHIPS_FALLBACK: ColorChip[] = [
  ...[
    '아카시아',
    '모번',
    '파스텔모번',
    '레트로오크',
    '네츄럴월넛',
    '멀바우',
    '백색',
    '라이트그레이',
    '샌드그레이',
  ].map((color_name, i) => ({
    id: `std-${i}`,
    color_type: 'Standard' as ColorType,
    color_name,
    display_order: i + 1,
  })),
  ...['N101', 'N102', 'N104', 'N105', 'N106', 'N107', 'N110', 'N112', 'N132'].map((color_name, i) => ({
    id: `sp-${i}`,
    color_type: 'Special' as ColorType,
    color_name,
    display_order: i + 1,
  })),
  { id: 'other-1', color_type: 'Other', color_name: '기타', display_order: 1 },
]

/** DB에서 컬러칩 목록 조회 (color_type → display_order 순) */
export async function getColorChips(): Promise<ColorChip[]> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('color_chips')
      .select('id, color_type, color_name, display_order')
      .order('color_type', { ascending: true })
      .order('display_order', { ascending: true })
    if (error) throw error
    if (data && data.length > 0) return data as ColorChip[]
  } catch (_) {
    // ignore
  }
  return COLOR_CHIPS_FALLBACK
}

/** 드롭다운용 옵션: 그룹 라벨 + value=color_name. 기타 선택 시 직접 입력 필드 노출용 */
export function getColorOptionsForSelect(chips: ColorChip[]): { group: string; value: string; label: string }[] {
  const groupLabel: Record<ColorType, string> = {
    Standard: '기본 컬러 (Standard)',
    Special: '스페셜 컬러 (Special)',
    Other: '기타',
  }
  return chips.map((c) => ({
    group: groupLabel[c.color_type],
    value: c.color_name,
    label: c.color_name,
  }))
}
