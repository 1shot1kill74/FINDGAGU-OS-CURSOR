/**
 * products 테이블 저장 전 필터 — 가구 제품·부속품만 등록, 배송/설치/시공 등 제외
 */

/** 품목명에 포함되면 products 저장에서 제외할 키워드 (가구 제품·부속품 아님) */
export const PRODUCTS_EXCLUDED_KEYWORDS = [
  '배송',
  '설치',
  '운반',
  '시공',
  '양중',
  '사다리차',
  '크레인',
  '인건비',
  '공사비',
  '세차',
  '경비',
  '관리비',
] as const

/**
 * 품목명이 products 마스터에 부적절한지 여부
 * - 배송·설치·운반·시공·양중·사다리차 등 비제품 항목 제외
 */
export function shouldExcludeFromProducts(productName: string): boolean {
  const name = (productName ?? '').trim()
  if (!name) return true
  const lower = name.toLowerCase()
  return PRODUCTS_EXCLUDED_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

/**
 * items를 products 저장 대상 / 제외로 분류
 */
export function splitForProducts<T extends { product_name?: string }>(
  items: T[]
): { toSave: T[]; excluded: T[] } {
  const toSave: T[] = []
  const excluded: T[] = []
  for (const it of items) {
    const name = (it.product_name ?? '').trim() || '(미명)'
    if (shouldExcludeFromProducts(name)) {
      excluded.push(it)
    } else {
      toSave.push(it)
    }
  }
  return { toSave, excluded }
}
