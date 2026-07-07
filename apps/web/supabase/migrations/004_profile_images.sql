-- 프로필 이미지 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS cover_url  text;

-- profile-images 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 공개 읽기
CREATE POLICY "profile-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-images');

-- Storage RLS: 본인 경로만 업로드 (path 첫 번째 세그먼트 = userId)
CREATE POLICY "profile-images owner insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-images'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

CREATE POLICY "profile-images owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

CREATE POLICY "profile-images owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = split_part(name, '/', 1)
  );
