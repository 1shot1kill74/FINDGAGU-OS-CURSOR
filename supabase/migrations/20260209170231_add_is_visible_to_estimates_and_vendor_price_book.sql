-- estimates에 is_visible 추가 (사후 정리용)
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.estimates.is_visible IS 'false면 목록/통계에서 제외';

-- vendor_price_book에 is_test, is_visible 추가 (사후 정리용)
ALTER TABLE public.vendor_price_book
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendor_price_book
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vendor_price_book.is_test IS '테스트용 원가 데이터 여부';
COMMENT ON COLUMN public.vendor_price_book.is_visible IS 'false면 목록에서 제외';
