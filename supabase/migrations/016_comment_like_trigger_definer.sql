-- ============================================================
-- 016_comment_like_trigger_definer.sql
-- like_count 트리거가 다른 사용자의 comments row를 UPDATE할 수 있도록 SECURITY DEFINER 추가
-- (comments_update RLS는 본인만 → 트리거 SECURITY INVOKER 기본값이면 차단됨)
-- ============================================================
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

-- 기존 댓글들의 like_count를 실제 좋아요 수로 재동기화 (트리거 누락분 복구)
UPDATE comments c
SET like_count = (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id);
