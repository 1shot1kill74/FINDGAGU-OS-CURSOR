-- 데이터 일원화: 배치 시에도 시트 빈 값 → DB null (UPDATE 시 EXCLUDED 값 그대로 반영).
-- 검수: project_name이 INSERT·UPDATE의 유일한 기준(Unique Key). ON CONFLICT (project_name) 사용.
CREATE OR REPLACE FUNCTION public.update_multiple_consultations_from_sheet(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_processed int;
BEGIN
  IF rows IS NULL OR jsonb_array_length(rows) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'processed', 0, 'message', 'no rows');
  END IF;

  WITH input AS (
    SELECT
      NULLIF(TRIM(elem->>'project_name'), '') AS project_name,
      NULLIF(TRIM(COALESCE(elem->>'link', '')), '') AS link,
      (elem->>'start_date')::date AS start_date,
      (elem->>'update_date')::date AS update_date,
      (elem->>'created_at')::timestamptz AS created_at
    FROM jsonb_array_elements(rows) AS elem
    WHERE NULLIF(TRIM(COALESCE(elem->>'project_name', '')), '') IS NOT NULL
  ),
  upserted AS (
    INSERT INTO consultations (project_name, link, start_date, update_date, status, estimate_amount, created_at)
    SELECT
      input.project_name,
      input.link,
      input.start_date,
      COALESCE(input.update_date, CURRENT_DATE),
      '상담중',
      0,
      COALESCE(input.created_at, now())
    FROM input
    ON CONFLICT (project_name) DO UPDATE SET
      link = EXCLUDED.link,
      start_date = EXCLUDED.start_date,
      update_date = EXCLUDED.update_date,
      created_at = EXCLUDED.created_at
  )
  SELECT count(*) INTO v_processed FROM input;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'processed', 0);
END;
$$;
