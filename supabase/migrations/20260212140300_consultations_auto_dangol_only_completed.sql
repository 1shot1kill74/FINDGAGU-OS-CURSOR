-- 자동 단골 판정: "성공적으로 완료된" 프로젝트만 카운트 (status = 시공완료, 휴식기, 계약완료)
CREATE OR REPLACE FUNCTION consultations_auto_promote_customer_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  phone_digits text;
  completed_count int;
BEGIN
  IF NEW.customer_phone IS NULL OR TRIM(NEW.customer_phone) = '' THEN
    RETURN NEW;
  END IF;

  phone_digits := regexp_replace(TRIM(NEW.customer_phone), '\D', '', 'g');
  IF length(phone_digits) < 9 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO completed_count
  FROM consultations c
  WHERE regexp_replace(TRIM(COALESCE(c.customer_phone, '')), '\D', '', 'g') = phone_digits
    AND c.status IN ('시공완료', '휴식기', '계약완료');

  IF completed_count >= 2 THEN
    UPDATE consultations
    SET customer_grade = '단골'
    WHERE regexp_replace(TRIM(COALESCE(customer_phone, '')), '\D', '', 'g') = phone_digits
      AND (customer_grade IS NULL OR customer_grade = '신규' OR customer_grade = '');
  END IF;

  RETURN NEW;
END;
$$;

-- status 변경 시 단골 자동 판정 트리거
CREATE OR REPLACE FUNCTION consultations_auto_promote_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  phone_digits text;
  completed_count int;
BEGIN
  IF NEW.status NOT IN ('시공완료', '휴식기', '계약완료') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('시공완료', '휴식기', '계약완료') THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_phone IS NULL OR TRIM(NEW.customer_phone) = '' THEN
    RETURN NEW;
  END IF;

  phone_digits := regexp_replace(TRIM(NEW.customer_phone), '\D', '', 'g');
  IF length(phone_digits) < 9 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO completed_count
  FROM consultations c
  WHERE regexp_replace(TRIM(COALESCE(c.customer_phone, '')), '\D', '', 'g') = phone_digits
    AND c.status IN ('시공완료', '휴식기', '계약완료');

  IF completed_count >= 2 THEN
    UPDATE consultations
    SET customer_grade = '단골'
    WHERE regexp_replace(TRIM(COALESCE(customer_phone, '')), '\D', '', 'g') = phone_digits
      AND (customer_grade IS NULL OR customer_grade = '신규' OR customer_grade = '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultations_auto_promote_on_status ON consultations;
CREATE TRIGGER trg_consultations_auto_promote_on_status
  AFTER UPDATE OF status ON consultations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION consultations_auto_promote_on_status_change();
