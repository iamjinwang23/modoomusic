-- ============================================================
-- 033_announcements.sql
-- 공지(What's New) — Module 7
--   1) announcements 테이블 (마크다운 본문 + 썸네일 + 카테고리 + 숨김)
--   2) updated_at 자동 갱신 트리거
--   3) announcements-images 스토리지 버킷 (어드민 쓰기, 공개 읽기)
-- Design Ref: §5.2 Module 7 — 공지 송출 / 공개 What's New 페이지
-- ============================================================

-- 1) announcements 테이블
CREATE TABLE IF NOT EXISTS announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'notice' CHECK (category IN ('notice', 'promotion')),
  content     text NOT NULL DEFAULT '',                                   -- 마크다운 본문
  image_url   text,                                                       -- 썸네일 (announcements-images 버킷)
  status      text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 공개 목록: 게시된 것만 최신순
CREATE INDEX IF NOT EXISTS announcements_published_idx
  ON announcements(created_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS announcements_category_idx
  ON announcements(category, created_at DESC) WHERE status = 'published';

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- RLS: 게시된 공지는 누구나 읽기. 어드민은 전체(숨김 포함) 읽기.
DROP POLICY IF EXISTS announcements_select ON announcements;
CREATE POLICY announcements_select ON announcements
  FOR SELECT
  USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- INSERT/UPDATE/DELETE는 서버(service_role)에서만 — anon/authenticated 정책 미생성 = 차단.
-- (어드민 변경은 /api/admin/announcements 라우트가 createAdminClient로 수행)

-- 2) updated_at 자동 갱신 트리거 (범용 함수)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcements_set_updated_at ON announcements;
CREATE TRIGGER announcements_set_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) announcements-images 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('announcements-images', 'announcements-images', true)
ON CONFLICT (id) DO NOTHING;

-- 공개 읽기
DROP POLICY IF EXISTS "announcements-images public read" ON storage.objects;
CREATE POLICY "announcements-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'announcements-images');

-- 어드민만 업로드/수정/삭제 (경로: {announcementId}/{slot}.webp)
DROP POLICY IF EXISTS "announcements-images admin insert" ON storage.objects;
CREATE POLICY "announcements-images admin insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'announcements-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "announcements-images admin update" ON storage.objects;
CREATE POLICY "announcements-images admin update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'announcements-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "announcements-images admin delete" ON storage.objects;
CREATE POLICY "announcements-images admin delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'announcements-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
