-- P1 fix: update_single_consultation_from_sheet에 sheet_update_date 파라미터 추가.
-- onEdit에서 D열(업데이트일)을 sheet_update_date로 전달 → metadata.sheet_update_date 병합.
-- 앱 '오늘 갱신' / 미갱신 D-Day 표시가 단건 시트 편집 즉시 반영됨.
CREATE OR REPLACE FUNCTION public.update_single_consultation_from_sheet(
  project_name text,
  link text DEFAULT NULL,
  start_date date DEFAULT NULL,
  update_date date DEFAULT NULL,
  created_at timestamptz DEFAULT NULL,
  sheet_update_date text DEFAULT NULL
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
  -- YYYY-MM-DD 형식만 허용, 그 외 무시
  v_sheet_update_date text := CASE
    WHEN TRIM(COALESCE(sheet_update_date, '')) ~ '^\d{4}-\d{2}-\d{2}$'
    THEN TRIM(sheet_update_date)
    ELSE NULL
  END;
  v_meta_patch jsonb;
BEGIN
  IF v_pname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'project_name required');
  END IF;

  -- metadata 패치 오브젝트 준비 (sheet_update_date가 유효할 때만)
  v_meta_patch := CASE
    WHEN v_sheet_update_date IS NOT NULL
    THEN jsonb_build_object('sheet_update_date', v_sheet_update_date)
    ELSE NULL
  END;

  SELECT id INTO v_id FROM consultations c WHERE c.project_name = v_pname;

  IF v_id IS NULL THEN
    INSERT INTO consultations (
      project_name,
      link,
      start_date,
      update_date,
      status,
      estimate_amount,
      created_at,
      metadata
    ) VALUES (
      v_pname,
      NULLIF(TRIM(COALESCE(v_link, '')), ''),
      v_start,
      COALESCE(v_update, CURRENT_DATE),
      '상담중',
      0,
      COALESCE(v_created, now()),
      COALESCE(v_meta_patch, '{}'::jsonb)
    );
    RETURN jsonb_build_object('ok', true, 'inserted', 1, 'updated', 0);
  END IF;

  -- 기존 행: 시트 5개 필드 반영 + sheet_update_date가 유효하면 metadata 병합
  IF v_meta_patch IS NOT NULL THEN
    UPDATE consultations SET
      link = NULLIF(TRIM(COALESCE(v_link, '')), ''),
      start_date = v_start,
      update_date = v_update,
      created_at = v_created,
      metadata = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
    WHERE id = v_id;
  ELSE
    UPDATE consultations SET
      link = NULLIF(TRIM(COALESCE(v_link, '')), ''),
      start_date = v_start,
      update_date = v_update,
      created_at = v_created
    WHERE id = v_id;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'inserted', 0, 'updated', v_updated);
END;
$$;
