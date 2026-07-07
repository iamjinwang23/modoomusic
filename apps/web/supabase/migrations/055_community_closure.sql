-- ============================================================
-- 055_community_closure.sql — 커뮤니티 조건부 폐쇄 정책 (community.design.md §13)
--   현행: 매니저 1클릭 무조건 즉시 하드삭제.
--   목표: 다른 멤버 콘텐츠 0건이면 즉시 삭제 / 1건이라도 있으면 14일 유예(closing, 읽기전용) 후 스윕 삭제.
--   - communities.status(open|closing) + closing_at + close_scheduled_at
--   - notifications CHECK 에 community_closing 추가(폐쇄 예고 알림)
--   - closing 커뮤니티 읽기전용 강제(신규 글·댓글·좋아요·투표·가입 차단) — 라우트 가드의 백스톱 트리거
-- ============================================================

-- 1) 폐쇄 상태 컬럼
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing')),
  ADD COLUMN IF NOT EXISTS closing_at          timestamptz,   -- 폐쇄 예고(유예 시작) 시각
  ADD COLUMN IF NOT EXISTS close_scheduled_at  timestamptz;   -- 하드삭제 예정(= closing_at + 14d)

-- 스윕 스캔용 — closing 중 만료분만 좁게
CREATE INDEX IF NOT EXISTS communities_closing_idx ON communities(close_scheduled_at) WHERE status = 'closing';

-- 2) 폐쇄 예고 알림 타입
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'song_complete', 'system', 'follow', 'comment', 'credit_charged',
    'community_like', 'community_comment', 'community_closing'
  ));

-- 3) 읽기전용 가드 (백스톱) — closing 커뮤니티의 자식 테이블 INSERT 차단.
--    라우트/서비스에서 먼저 'community_closing' 에러로 거르지만, 어떤 경로로도 새 콘텐츠가 들어오지 못하게 DB에서 최종 보장.
--    SECURITY DEFINER + search_path 고정(052/054 관례) — RLS 우회 admin 경로에도 동일 적용.
CREATE OR REPLACE FUNCTION public.community_readonly_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  st  text;
BEGIN
  IF TG_TABLE_NAME = 'community_posts' THEN
    cid := NEW.community_id;
  ELSIF TG_TABLE_NAME = 'community_members' THEN
    cid := NEW.community_id;
  ELSIF TG_TABLE_NAME IN ('community_post_comments', 'community_post_likes', 'community_post_poll_votes') THEN
    SELECT community_id INTO cid FROM community_posts WHERE id = NEW.post_id;
  ELSIF TG_TABLE_NAME = 'community_post_comment_likes' THEN
    SELECT p.community_id INTO cid
      FROM community_post_comments c JOIN community_posts p ON p.id = c.post_id
      WHERE c.id = NEW.comment_id;
  END IF;

  IF cid IS NOT NULL THEN
    SELECT status INTO st FROM communities WHERE id = cid;
    IF st = 'closing' THEN
      RAISE EXCEPTION 'community_closing' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_community_posts_readonly        ON community_posts;
CREATE TRIGGER trg_community_posts_readonly        BEFORE INSERT ON community_posts        FOR EACH ROW EXECUTE FUNCTION public.community_readonly_guard();
DROP TRIGGER IF EXISTS trg_community_members_readonly      ON community_members;
CREATE TRIGGER trg_community_members_readonly      BEFORE INSERT ON community_members      FOR EACH ROW EXECUTE FUNCTION public.community_readonly_guard();
DROP TRIGGER IF EXISTS trg_community_comments_readonly     ON community_post_comments;
CREATE TRIGGER trg_community_comments_readonly     BEFORE INSERT ON community_post_comments     FOR EACH ROW EXECUTE FUNCTION public.community_readonly_guard();
DROP TRIGGER IF EXISTS trg_community_likes_readonly        ON community_post_likes;
CREATE TRIGGER trg_community_likes_readonly        BEFORE INSERT ON community_post_likes        FOR EACH ROW EXECUTE FUNCTION public.community_readonly_guard();
DROP TRIGGER IF EXISTS trg_community_comment_likes_readonly ON community_post_comment_likes;
CREATE TRIGGER trg_community_comment_likes_readonly BEFORE INSERT ON community_post_comment_likes FOR EACH ROW EXECUTE FUNCTION public.community_readonly_guard();
DROP TRIGGER IF EXISTS trg_community_poll_votes_readonly   ON community_post_poll_votes;
CREATE TRIGGER trg_community_poll_votes_readonly   BEFORE INSERT ON community_post_poll_votes   FOR EACH ROW EXECUTE FUNCTION public.community_readonly_guard();
