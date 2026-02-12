/**
 * AI 견적 추천 — 과거 이력·원가표 기반 더블 체크
 * - 과거 이력: estimateAiService.searchPastCaseRecommendations (consultation_id/estimate_id로 원본보기)
 * - vendor_price_book: 원가(cost) → 마진 30% 역산 판매단가
 * - products: 판매단가(supply_price) 저장 → 원가 역산(수익률 판단용)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { roundToPriceUnit, formatDateYYMMDD } from './estimateUtils'

const RECOMMEND_MARGIN_PERCENT = 30

export interface VendorPriceRecommendation {
  /** 역산 추천 단가 (마진 30% 적용, roundToPriceUnit) */
  unitPrice: number
  /** 원가 */
  cost: number
  /** 원가표 원본 이미지 URL (라이트박스용). 없으면 null */
  image_url: string | null
  /** vendor_price_book 행 id (원본보기 구분용) */
  id: string
  /** 출처: vendor_price_book | products */
  source: 'vendor_price_book' | 'products'
  /** 제품명 (표시용) */
  product_name: string
  /** 등록/수정일 (YY.MM.DD 표시용) */
  appliedDate?: string
  /** 외경 사이즈 (가로×세로×높이). 원가표 출처일 때 카드에 표시 */
  spec?: string | null
  /** 현장명 (원가표 출처일 때 카드에 표시) */
  site_name?: string | null
}

/** 품명 일치 시 단일 행 반환용 — row 타입에서 VendorPriceRecommendation 생성 */
function rowToVendorRecommendation(
  row: { id: string; product_name: string | null; cost: number; image_url?: string | null; spec?: string | null; site_name?: string | null; created_at?: string; updated_at?: string },
  name: string
): VendorPriceRecommendation {
  const cost = Number(row.cost)
  const unitPrice = roundToPriceUnit(cost / (1 - RECOMMEND_MARGIN_PERCENT / 100))
  const appliedDate = formatDateYYMMDD(row.updated_at ?? row.created_at ?? '')
  return {
    unitPrice,
    cost,
    image_url: row.image_url ?? null,
    id: row.id,
    source: 'vendor_price_book',
    product_name: row.product_name ?? name,
    appliedDate: appliedDate || undefined,
    spec: row.spec?.trim() || null,
    site_name: row.site_name?.trim() || null,
  }
}

/**
 * 품명으로 vendor_price_book 다건 조회. 검색어가 품명에 포함된 모든 행 반환(하위 분류 포함, 예: 올데이C → 올데이CA).
 * is_visible 필터는 consultations/estimates 쪽에만 적용; vendor_price_book은 마스터 데이터.
 */
export async function getVendorPriceRecommendations(
  supabase: SupabaseClient,
  productName: string
): Promise<VendorPriceRecommendation[]> {
  const name = (productName ?? '').trim()
  if (!name) return []

  const { data: rows } = await supabase
    .from('vendor_price_book')
    .select('id, product_name, cost, image_url, spec, site_name, created_at, updated_at')
    .eq('is_visible', true)
    .ilike('product_name', `%${name}%`)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (!rows?.length) return []

  const mapped = rows
    .filter((r) => r && Number(r.cost) > 0)
    .map((r) => rowToVendorRecommendation(r as { id: string; product_name: string | null; cost: number; image_url?: string | null; spec?: string | null; site_name?: string | null; created_at?: string; updated_at?: string }, name))

  // 품명·규격(외경) 기준 중복 제거 — 동일 올데이CA·1000x1280x1200 한 건만 표시
  const seen = new Map<string, VendorPriceRecommendation>()
  for (const v of mapped) {
    const key = `${(v.product_name ?? '').trim()}|${(v.spec ?? '').trim()}`
    if (!seen.has(key)) seen.set(key, v)
  }
  return [...seen.values()]
}

/**
 * 품명으로 vendor_price_book 조회 후 마진 30% 역산 단가 반환 (단일 건).
 * vendor_price_book에 없으면 products 테이블 fallback.
 */
export async function getVendorPriceRecommendation(
  supabase: SupabaseClient,
  productName: string
): Promise<VendorPriceRecommendation | null> {
  const list = await getVendorPriceRecommendations(supabase, productName)
  if (list.length > 0) return list[0]

  const name = (productName ?? '').trim()
  if (!name) return null
  const { data: products } = await supabase
    .from('products')
    .select('id, name, supply_price, created_at, updated_at')
    .ilike('name', `%${name}%`)
    .limit(1)
  const p = products?.[0]
  if (p && Number(p.supply_price) > 0) {
    const unitPrice = Number(p.supply_price)
    const cost = Math.round(unitPrice * (1 - RECOMMEND_MARGIN_PERCENT / 100))
    const pRow = p as { created_at?: string; updated_at?: string }
    const appliedDate = formatDateYYMMDD(pRow.updated_at ?? pRow.created_at)
    return {
      unitPrice,
      cost,
      image_url: null,
      id: p.id,
      source: 'products',
      product_name: p.name ?? name,
      appliedDate: appliedDate || undefined,
      spec: null,
    }
  }
  return null
}
