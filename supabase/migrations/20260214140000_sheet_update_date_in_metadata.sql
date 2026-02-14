-- 구글 시트 '최신 업데이트' 값을 metadata.sheet_update_date에 저장. 앱에서 '오늘 갱신' / 미갱신 D-Day 표시에 사용.
-- 호출 시 각 row에 sheet_update_date (YYYY-MM-DD 문자열) 포함 권장.
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
      (elem->>'created_at')::timestamptz AS created_at,
      CASE
        WHEN TRIM(COALESCE(elem->>'sheet_update_date', '')) ~ '^\d{4}-\d{2}-\d{2}$'
        THEN TRIM(elem->>'sheet_update_date')
        ELSE NULL
      END AS sheet_update_date
    FROM jsonb_array_elements(rows) AS elem
    WHERE NULLIF(TRIM(COALESCE(elem->>'project_name', '')), '') IS NOT NULL
  ),
  upserted AS (
    INSERT INTO consultations (project_name, link, start_date, update_date, status, estimate_amount, created_at, metadata)
    SELECT
      input.project_name,
      input.link,
      input.start_date,
      COALESCE(input.update_date, CURRENT_DATE),
      '상담중',
      0,
      COALESCE(input.created_at, now()),
      CASE
        WHEN input.sheet_update_date IS NOT NULL
        THEN jsonb_build_object('sheet_update_date', input.sheet_update_date)
        ELSE '{}'::jsonb
      END
    FROM input
    ON CONFLICT (project_name) DO UPDATE SET
      link = EXCLUDED.link,
      start_date = EXCLUDED.start_date,
      update_date = EXCLUDED.update_date,
      created_at = EXCLUDED.created_at,
      metadata = COALESCE(consultations.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)
  )
  SELECT count(*) INTO v_processed FROM input;

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'processed', 0);
END;
$$;
