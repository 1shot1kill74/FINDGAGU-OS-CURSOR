-- customer_phone 수정 시에도 등급 자동 승격 적용
CREATE TRIGGER trg_consultations_auto_promote_grade_on_update
  AFTER UPDATE OF customer_phone ON consultations
  FOR EACH ROW
  WHEN (OLD.customer_phone IS DISTINCT FROM NEW.customer_phone)
  EXECUTE FUNCTION consultations_auto_promote_customer_grade();
