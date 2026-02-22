-- 1. documents 버킷 생성 (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. documents 버킷 정책 (public 읽기, anon 업로드)
CREATE POLICY "documents_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

CREATE POLICY "documents_anon_insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents_anon_update"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'documents');

CREATE POLICY "documents_anon_delete"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'documents');

-- 3. image_assets에 storage_type, storage_path 컬럼 추가
ALTER TABLE image_assets
  ADD COLUMN IF NOT EXISTS storage_type text DEFAULT 'cloudinary';

ALTER TABLE image_assets
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN image_assets.storage_type IS 'cloudinary: 시공사례 이미지, supabase: 발주서/배치도 문서';
COMMENT ON COLUMN image_assets.storage_path IS 'storage_type=supabase일 때 documents 버킷 내 경로';
