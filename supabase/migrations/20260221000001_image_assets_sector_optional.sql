-- [선택] image_assets에 sector 컬럼 추가
-- 참고: 현재 업종 필터는 image_assets.business_type, project_images.industry를 사용합니다.
-- sector 컬럼이 별도로 필요한 경우에만 아래를 실행하세요.

-- ALTER TABLE image_assets ADD COLUMN IF NOT EXISTS sector text;
-- COMMENT ON COLUMN image_assets.sector IS '업종 (학원, 관리형, 스터디카페, 학교, 아파트, 기타)';
