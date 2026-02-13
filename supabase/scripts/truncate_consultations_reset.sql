-- 구글 시트 기준 0점 조절: consultations 및 연동 자식 테이블 일괄 초기화
-- 실행 전 반드시 백업·동의 후 Supabase SQL Editor에서 수동 실행할 것.
--
-- 안정 우선: CASCADE로 consultations를 참조하는 모든 테이블을 함께 비우며,
-- FK 제약으로 인한 오류 없이 정리된다.
--
-- 참조 관계 (consultations ← 자식):
--   consultation_messages, estimates, order_documents,
--   construction_images, project_images, consultation_estimate_files
--
-- 참고: consultations.id는 gen_random_uuid() 사용으로 시퀀스 없음. 초기화 불필요.

BEGIN;

TRUNCATE TABLE public.consultations CASCADE;

COMMIT;
