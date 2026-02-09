-- 견적서 PDF용 버킷 (비공개)
INSERT INTO storage.buckets (id, name, public)
VALUES ('estimate-documents', 'estimate-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 원가표 JPG용 버킷 (비공개)
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-assets', 'vendor-assets', false)
ON CONFLICT (id) DO NOTHING;
