-- 발행 승인 시점의 예산 기획안 데이터를 독립 보존 (원본 상담/임시저장과 분리)
ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS final_proposal_data jsonb;
COMMENT ON COLUMN estimates.final_proposal_data IS '발행 승인 시점에 복사된 기획안 스냅샷. 승인 후 표시/PDF/공유는 이 값 사용.';
