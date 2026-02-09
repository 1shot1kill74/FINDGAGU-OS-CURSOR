-- industry 컬럼: 시공사례 뱅크 표준 6가지 태그만 허용
-- (학원, 관리형, 스터디카페, 학교, 아파트, 기타)
-- reference_cases 테이블이 이미 있을 때만 적용하세요.

ALTER TABLE reference_cases
  DROP CONSTRAINT IF EXISTS reference_cases_industry_check;

ALTER TABLE reference_cases
  ADD CONSTRAINT reference_cases_industry_check
  CHECK (industry IN ('학원', '관리형', '스터디카페', '학교', '아파트', '기타'));
