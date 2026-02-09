/**
 * AI 견적 추천 — 과거 이력·원가표 기반 더블 체크
 * - 과거 이력: estimateAiService.searchPastCaseRecommendations (consultation_id/estimate_id로 원본보기)
 * - 최신 원가: vendor_price_book 또는 products 테이블, 마진율 30% 역산가, roundToPriceUnit 적용
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
}

/**
 * 품명으로 vendor_price_book 조회 후 마진 30% 역산 단가 반환.
 * is_visible 필터는 consultations/estimates 쪽에만 적용; vendor_price_book은 마스터 데이터.
 */
export async function getVendorPriceRecommendation(
  supabase: SupabaseClient,
  productName: string
): Promise<VendorPriceRecommendation | null> {
  const name = (productName ?? '').trim()
  if (!name) return null

  const { data: rows } = await supabase
    .from('vendor_price_book')
    .select('id, product_name, cost, image_url, created_at, updated_at')
    .eq('is_visible', true)
    .ilike('product_name', `%${name}%`)
    .order('updated_at', { ascending: false })
    .limit(1)

  const row = rows?.[0]
  if (row && Number(row.cost) > 0) {
    const cost = Number(row.cost)
    const unitPrice = roundToPriceUnit(cost / (1 - RECOMMEND_MARGIN_PERCENT / 100))
    const appliedDate = formatDateYYMMDD((row as { updated_at?: string; created_at?: string }).updated_at ?? (row as { created_at?: string }).created_at)
    return {
      unitPrice,
      cost,
      image_url: row.image_url ?? null,
      id: row.id,
      source: 'vendor_price_book',
      product_name: row.product_name ?? name,
      appliedDate: appliedDate || undefined,
    }
  }

  // Fallback: products 테이블 (image_url 없음)
  const { data: products } = await supabase
    .from('products')
    .select('id, name, supply_price, created_at, updated_at')
    .ilike('name', `%${name}%`)
    .limit(1)

  const p = products?.[0]
  if (p && Number(p.supply_price) > 0) {
    const cost = Number(p.supply_price)
    const unitPrice = roundToPriceUnit(cost / (1 - RECOMMEND_MARGIN_PERCENT / 100))
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
    }
  }

  return null
}
