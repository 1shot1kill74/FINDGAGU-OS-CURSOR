-- order_documents에 document_category 추가 (발주서 vs 배치도 구분)
-- purchase_order: 발주서 PDF/PPT, floor_plan: 배치도 PDF
ALTER TABLE order_documents
  ADD COLUMN IF NOT EXISTS document_category text DEFAULT 'purchase_order';

COMMENT ON COLUMN order_documents.document_category IS 'purchase_order: 발주서 PDF/PPT, floor_plan: 배치도 PDF';
