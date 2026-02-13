-- 제품 = 제품명+규격+색상 동일할 때만 동일. 기존 name unique 제거 후 (name, spec, color) 복합 유일.
-- 1) NULL → '' 정규화 (unique 비교 일관성)
UPDATE products SET spec = COALESCE(TRIM(spec), ''), color = COALESCE(TRIM(color), '') WHERE spec IS NULL OR color IS NULL;

-- 2) (name, spec, color) 기준 중복 제거: 최신 updated_at 한 건만 유지
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name, COALESCE(spec,''), COALESCE(color,'') ORDER BY updated_at DESC NULLS LAST) AS rn
  FROM products
)
DELETE FROM products WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) 나머지 행 spec/color 빈 문자열 통일
UPDATE products SET spec = COALESCE(TRIM(spec), ''), color = COALESCE(TRIM(color), '') WHERE spec IS NULL OR color IS NULL;

-- 4) name 유일 제거
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_name_key;

-- 5) (name, spec, color) 복합 유일 추가
ALTER TABLE products ADD CONSTRAINT products_name_spec_color_key UNIQUE (name, spec, color);

COMMENT ON CONSTRAINT products_name_spec_color_key ON products IS '동일 제품 = 제품명+규격+색상 모두 일치. 규격/색상 다르면 별도 행.';
