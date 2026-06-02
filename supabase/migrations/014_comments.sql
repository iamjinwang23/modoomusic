-- ============================================================
-- 014_comments.sql
-- 댓글 시스템: comments(1단계 대댓글) + comment_likes + comment_reports
-- Design Ref: comments.design.md §3
-- ============================================================

-- ── 댓글 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id      uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES comments(id) ON DELETE CASCADE,           -- NULL = 최상위
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  like_count   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz                                                -- NULL이 아니면 편집됨
);

CREATE INDEX IF NOT EXISTS idx_comments_song_top
  ON comments(song_id, created_at DESC)
  WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments(parent_id, created_at)
  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_user
  ON comments(user_id);

-- 1단계 깊이 강제: parent의 parent_id가 NULL이어야 함
CREATE OR REPLACE FUNCTION enforce_comment_depth() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM comments WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'comments depth exceeds 1';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS comments_depth_check ON comments;
CREATE TRIGGER comments_depth_check
  BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION enforce_comment_depth();

-- ── 댓글 좋아요 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_likes (
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id   uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- like_count denorm 트리거 — SECURITY DEFINER로 RLS 우회 (다른 사용자 댓글 UPDATE 필요)
CREATE OR REPLACE FUNCTION sync_comment_like_count() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS comment_likes_sync ON comment_likes;
CREATE TRIGGER comment_likes_sync
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION sync_comment_like_count();

-- ── 댓글 신고 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id    uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reason        text NOT NULL CHECK (reason IN
    ('욕설·비속어','음란물','혐오·차별 표현','도배','광고·홍보성 콘텐츠','개인정보 노출','저작권 침해','기타')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, comment_id)
);

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

-- comments: 공개 곡 댓글 또는 본인 댓글 읽기
DROP POLICY IF EXISTS "comments_select" ON comments;
CREATE POLICY "comments_select" ON comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM songs s WHERE s.id = comments.song_id AND s.is_public = true)
  OR auth.uid() = user_id
);
DROP POLICY IF EXISTS "comments_insert" ON comments;
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND s.is_public = true)
);
DROP POLICY IF EXISTS "comments_update" ON comments;
CREATE POLICY "comments_update" ON comments FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "comments_delete" ON comments;
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = user_id);

-- comment_likes: SELECT public, INSERT/DELETE 본인만
DROP POLICY IF EXISTS "comment_likes_select" ON comment_likes;
CREATE POLICY "comment_likes_select" ON comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "comment_likes_insert" ON comment_likes;
CREATE POLICY "comment_likes_insert" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "comment_likes_delete" ON comment_likes;
CREATE POLICY "comment_likes_delete" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- comment_reports: INSERT 본인만. SELECT/UPDATE는 admin 전용(정책 없음 = 차단)
DROP POLICY IF EXISTS "comment_reports_insert" ON comment_reports;
CREATE POLICY "comment_reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ── notifications.comment_id → comments(id) FK 추가 ─────
-- (010에서는 자리표만이라 FK 없음)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_comment_id_fkey'
      AND table_name = 'notifications'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_comment_id_fkey
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;
  END IF;
END $$;
