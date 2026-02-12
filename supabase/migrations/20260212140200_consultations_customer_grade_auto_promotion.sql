-- 등급 자동 승격: 동일 customer_phone으로 상담 카드 2개 이상 시 customer_grade를 '단골'로 자동 설정
-- 전화번호 비교: 숫자만 추출하여 비교 (010-1234-5678 = 01012345678)

CREATE OR REPLACE FUNCTION consultations_auto_promote_customer_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  phone_digits text;
  card_count int;
BEGIN
  -- customer_phone이 비어있으면 스킵
  IF NEW.customer_phone IS NULL OR TRIM(NEW.customer_phone) = '' THEN
    RETURN NEW;
  END IF;

  -- 숫자만 추출 (비교용)
  phone_digits := regexp_replace(TRIM(NEW.customer_phone), '\D', '', 'g');
  IF length(phone_digits) < 9 THEN
    RETURN NEW;
  END IF;

  -- 동일 번호(숫자 기준)로 된 상담 카드 수
  SELECT count(*) INTO card_count
  FROM consultations c
  WHERE regexp_replace(TRIM(COALESCE(c.customer_phone, '')), '\D', '', 'g') = phone_digits;

  -- 2개 이상이면 신규/미설정 등급만 '단골'로 승격 (파트너·블랙 등은 유지)
  IF card_count >= 2 THEN
    UPDATE consultations
    SET customer_grade = '단골'
    WHERE regexp_replace(TRIM(COALESCE(customer_phone, '')), '\D', '', 'g') = phone_digits
      AND (customer_grade IS NULL OR customer_grade = '신규' OR customer_grade = '');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consultations_auto_promote_grade
  AFTER INSERT ON consultations
  FOR EACH ROW
  EXECUTE FUNCTION consultations_auto_promote_customer_grade();

COMMENT ON FUNCTION consultations_auto_promote_customer_grade() IS '동일 전화번호로 상담 카드 2개 이상 시 customer_grade를 단골로 자동 승격 (신규→단골)';
