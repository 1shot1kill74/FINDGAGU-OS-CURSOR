-- image_assets 테이블에 is_consultation 컬럼 추가
-- 상담 공유 바구니 필터 및 상담용 이미지 구분용
ALTER TABLE image_assets
  ADD COLUMN IF NOT EXISTS is_consultation boolean DEFAULT false;

COMMENT ON COLUMN image_assets.is_consultation IS '상담용 이미지 여부 — 상담 공유 바구니 필터 및 상담 전용 뷰 정렬용';
