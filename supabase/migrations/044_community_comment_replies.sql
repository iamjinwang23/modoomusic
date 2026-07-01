-- 044_community_comment_replies.sql
-- 커뮤니티 글 댓글: 대댓글(parent_id) + 수정 시각(edited_at) + 댓글 좋아요.
ALTER TABLE community_post_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES community_post_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS community_post_comments_parent_idx ON community_post_comments(parent_id);

-- 댓글 좋아요
CREATE TABLE IF NOT EXISTS community_post_comment_likes (
  comment_id uuid NOT NULL REFERENCES community_post_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

-- 카운트 트리거
CREATE OR REPLACE FUNCTION public.community_post_comment_like_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_post_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_post_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_community_post_comment_like_count ON community_post_comment_likes;
CREATE TRIGGER trg_community_post_comment_like_count AFTER INSERT OR DELETE ON community_post_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_post_comment_like_count();

-- RLS: 읽기 공개, 쓰기는 서버(service_role)만
ALTER TABLE community_post_comment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_post_comment_likes_select ON community_post_comment_likes;
CREATE POLICY community_post_comment_likes_select ON community_post_comment_likes FOR SELECT USING (true);
