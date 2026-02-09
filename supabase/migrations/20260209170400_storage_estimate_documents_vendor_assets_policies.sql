-- estimate-documents: 업로드/조회 허용 (anon - 마이그레이션용)
CREATE POLICY "estimate_documents_insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'estimate-documents');

CREATE POLICY "estimate_documents_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'estimate-documents');

-- vendor-assets: 업로드/조회 허용 (anon - 마이그레이션용)
CREATE POLICY "vendor_assets_insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'vendor-assets');

CREATE POLICY "vendor_assets_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'vendor-assets');
