-- 특정 배치도(floor_plan) image_assets 레코드 삭제
-- Cloudinary 원본은 이미 삭제됨. DB만 정리.
DELETE FROM image_assets
WHERE (metadata->>'public_id' LIKE '%floor_plan_mlwfjokk%' OR cloudinary_url LIKE '%floor_plan_mlwfjokk%')
  AND category = 'floor_plan';
