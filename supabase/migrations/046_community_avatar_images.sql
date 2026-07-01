-- 046_community_avatar_images.sql
-- 커뮤니티 대표(프로필) 이미지 + 이미지 업로드용 스토리지 버킷.

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS avatar_image text;

-- community-images 버킷 (커버·대표 이미지). 업로드는 매니저 가드 후 admin(service_role)으로 수행.
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 공개 읽기 (쓰기는 service_role이 RLS 우회)
DROP POLICY IF EXISTS "community-images public read" ON storage.objects;
CREATE POLICY "community-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-images');
