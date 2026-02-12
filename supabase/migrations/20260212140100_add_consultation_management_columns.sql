-- 상담 관리 핵심 컬럼 추가 (고객 정보, 운영 데이터, 업종)
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS request_date date,
  ADD COLUMN IF NOT EXISTS customer_grade text,
  ADD COLUMN IF NOT EXISTS golden_time timestamptz,
  ADD COLUMN IF NOT EXISTS inbound_channel text,
  ADD COLUMN IF NOT EXISTS industry text;

COMMENT ON COLUMN consultations.customer_phone IS '고객 전화번호';
COMMENT ON COLUMN consultations.region IS '지역명 (프로젝트명에서 추출하거나 직접 입력)';
COMMENT ON COLUMN consultations.request_date IS '고객의 실제 요청 일자';
COMMENT ON COLUMN consultations.customer_grade IS '고객 등급 (신규, 단골, 파트너, 블랙, 기타)';
COMMENT ON COLUMN consultations.golden_time IS '상담 골든타임 (접수 후 특정 시간 내 응대 확인용)';
COMMENT ON COLUMN consultations.inbound_channel IS '인입 채널 (채널톡, 전화, 블로그 등)';
COMMENT ON COLUMN consultations.industry IS '업종 (학원, 관리형, 스터디카페, 학교, 관공서, 아파트, 기타)';
