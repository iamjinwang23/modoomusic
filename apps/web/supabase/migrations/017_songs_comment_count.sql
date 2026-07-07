-- ============================================================
-- 017_songs_comment_count.sql
-- songs.comment_count denorm (top-level 댓글만 카운트, 대댓글은 제외 — Suno와 동일 표기)
-- ============================================================

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- 기존 곡들의 comment_count 백필 (top-level만)
UPDATE songs s
SET comment_count = (
  SELECT COUNT(*) FROM comments c
  WHERE c.song_id = s.id AND c.parent_id IS NULL
);

-- 트리거: 새 top-level 댓글 INSERT / 삭제 시 카운트 동기화
-- SECURITY DEFINER: songs_update RLS(소유자만)에 막히지 않도록 우회
CREATE OR REPLACE FUNCTION sync_song_comment_count() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NULL THEN
      UPDATE songs SET comment_count = comment_count + 1 WHERE id = NEW.song_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NULL THEN
      UPDATE songs SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.song_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS comments_song_count_sync ON comments;
CREATE TRIGGER comments_song_count_sync
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION sync_song_comment_count();
