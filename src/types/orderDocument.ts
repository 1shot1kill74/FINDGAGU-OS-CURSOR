/** 발주서/배치도 문서 구분 */
export type OrderDocumentCategory = 'purchase_order' | 'floor_plan'

/** 발주서(PPT/PDF) — DB order_documents 및 갤러리/라이트박스용 */
export interface OrderDocument {
  id: string
  consultation_id: string
  storage_path: string
  file_name: string
  file_type: 'pdf' | 'ppt' | 'pptx'
  thumbnail_path: string | null
  product_tags: string[]
  document_category?: OrderDocumentCategory | null
  created_at: string | null
}

/** 갤러리 카드용 — 실측 PDF(legacy) 또는 발주서 */
export type DocumentGalleryItem =
  | { type: 'measurement'; consultationId: string; path: string; name: string }
  | { type: 'order'; doc: OrderDocument }
