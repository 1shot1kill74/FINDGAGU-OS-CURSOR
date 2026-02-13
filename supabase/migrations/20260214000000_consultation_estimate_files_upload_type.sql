-- 견적서(왼쪽) vs 외주업체 단가표(오른쪽) 리스트 구분용. 입구별로 저장 시 설정.
ALTER TABLE consultation_estimate_files
ADD COLUMN IF NOT EXISTS upload_type text NOT NULL DEFAULT 'estimates'
CHECK (upload_type IN ('estimates', 'vendor_price'));

COMMENT ON COLUMN consultation_estimate_files.upload_type IS 'estimates=견적서(공급가), vendor_price=외주업체 단가표(원가). 입구별 구분.';
