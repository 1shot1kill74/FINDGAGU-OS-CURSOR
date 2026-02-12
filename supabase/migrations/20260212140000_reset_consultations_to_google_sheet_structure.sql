-- Reset consultations to Google Sheet structure
-- 1. Drop FK constraints from tables referencing consultations
ALTER TABLE consultation_messages DROP CONSTRAINT IF EXISTS consultation_messages_consultation_id_fkey;
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_consultation_id_fkey;
ALTER TABLE order_documents DROP CONSTRAINT IF EXISTS order_documents_consultation_id_fkey;
ALTER TABLE construction_images DROP CONSTRAINT IF EXISTS construction_images_consultation_id_fkey;
ALTER TABLE project_images DROP CONSTRAINT IF EXISTS project_images_consultation_id_fkey;

-- 2. Truncate consultation-dependent tables (clear all data)
TRUNCATE TABLE consultation_messages CASCADE;
TRUNCATE TABLE estimates CASCADE;
TRUNCATE TABLE order_documents CASCADE;

-- 3. Null out consultation_id in tables that reference it (optional linkage)
UPDATE construction_images SET consultation_id = NULL WHERE consultation_id IS NOT NULL;
UPDATE project_images SET consultation_id = NULL WHERE consultation_id IS NOT NULL;

-- 4. Drop old consultations table
DROP TABLE IF EXISTS consultations CASCADE;

-- 5. Drop old consultation_status enum if exists (was used by old consultations)
DROP TYPE IF EXISTS consultation_status CASCADE;

-- 6. Create new consultations table — Google Sheet 구조 (프로젝트명, 링크, 시작일, 업데이트일, 상태, 견적가)
CREATE TABLE consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL UNIQUE,
  link text,
  start_date date,
  update_date date,
  status text,
  estimate_amount bigint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE consultations IS '구글 시트 구조: 프로젝트명(unique), 링크, 시작일, 업데이트일, 상태, 견적가';
COMMENT ON COLUMN consultations.project_name IS '프로젝트명 — 중복 불가(unique)';
COMMENT ON COLUMN consultations.link IS '링크 (예: 노션/구글드라이브 URL)';
COMMENT ON COLUMN consultations.start_date IS '시작일';
COMMENT ON COLUMN consultations.update_date IS '업데이트일';
COMMENT ON COLUMN consultations.status IS '상태 (예: 진행중, 완료, 보류 등)';
COMMENT ON COLUMN consultations.estimate_amount IS '견적가(원)';

-- 7. Re-add FK constraints for child tables
ALTER TABLE consultation_messages
  ADD CONSTRAINT consultation_messages_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE;

ALTER TABLE estimates
  ADD CONSTRAINT estimates_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE;

ALTER TABLE order_documents
  ADD CONSTRAINT order_documents_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE;

ALTER TABLE construction_images
  ADD CONSTRAINT construction_images_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL;

ALTER TABLE project_images
  ADD CONSTRAINT project_images_consultation_id_fkey
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL;
