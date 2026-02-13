-- 데이터 일원화: 시트에서 빈 값이 오면 DB도 null로 동기화 (UPDATE 시 5개 필드 모두 payload 기준)
CREATE OR REPLACE FUNCTION public.update_single_consultation_from_sheet(
  project_name text,
  link text DEFAULT NULL,
  start_date date DEFAULT NULL,
  update_date date DEFAULT NULL,
  created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_updated int := 0;
  v_pname text := NULLIF(TRIM(project_name), '');
  v_link text := link;
  v_start date := start_date;
  v_update date := update_date;
  v_created timestamptz := created_at;
BEGIN
  IF v_pname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'project_name required');
  END IF;

  SELECT id INTO v_id FROM consultations c WHERE c.project_name = v_pname;

  IF v_id IS NULL THEN
    INSERT INTO consultations (
      project_name,
      link,
      start_date,
      update_date,
      status,
      estimate_amount,
      created_at
    ) VALUES (
      v_pname,
      NULLIF(TRIM(COALESCE(v_link, '')), ''),
      v_start,
      COALESCE(v_update, CURRENT_DATE),
      '상담중',
      0,
      COALESCE(v_created, now())
    );
    RETURN jsonb_build_object('ok', true, 'inserted', 1, 'updated', 0);
  END IF;

  -- 기존 행: 시트 5개 필드만 반영. 빈 값이 오면 DB도 null (데이터 일원화)
  UPDATE consultations SET
    link = NULLIF(TRIM(COALESCE(v_link, '')), ''),
    start_date = v_start,
    update_date = v_update,
    created_at = v_created
  WHERE id = v_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'inserted', 0, 'updated', v_updated);
END;
$$;
