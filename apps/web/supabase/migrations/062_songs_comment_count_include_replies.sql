-- ============================================================
-- 062_songs_comment_count_include_replies.sql
-- songs.comment_count를 "답글(대댓글) 포함 전체 댓글 수"로 변경 (Instagram/TikTok식).
--   기존(017): top-level만(parent_id IS NULL) 카운트.
--   변경: 모든 댓글 카운트. 답글은 song_id를 가지며(reply route가 부모 song_id로 INSERT),
--         부모 삭제 시 답글은 ON DELETE CASCADE(014)로 함께 삭제되고 각 행 DELETE가
--         트리거를 발동하므로 카운트가 정확히 감소한다.
-- 트리거(comments_song_count_sync)는 그대로 두고 함수만 재정의.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_song_comment_count() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE songs SET comment_count = comment_count + 1 WHERE id = NEW.song_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE songs SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.song_id;
  END IF;
  RETURN NULL;
END $$;

-- 백필 — 전체 댓글(답글 포함)로 재계산.
UPDATE songs s
SET comment_count = (
  SELECT COUNT(*) FROM comments c WHERE c.song_id = s.id
);
