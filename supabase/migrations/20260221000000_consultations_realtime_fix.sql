-- Realtime fix: consultations 테이블이 postgres_changes 이벤트를 올바르게 브로드캐스트하도록 설정
--
-- 1. REPLICA IDENTITY FULL
--    UPDATE 이벤트 발생 시 변경 전·후 행 전체 데이터를 WAL에 기록.
--    이 설정 없이는 Supabase Realtime이 UPDATE 이벤트를 구독자에게 전달하지 못함.
--
-- 2. supabase_realtime publication ADD TABLE
--    대시보드에서 등록해도 migration 누락 시 환경 재배포 후 누락될 수 있어 SQL로 보강.
--    이미 등록된 경우 멱등(idempotent) 처리됨.

ALTER TABLE public.consultations REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
