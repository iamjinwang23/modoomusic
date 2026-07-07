-- ============================================================
-- 043_community.sql — 커뮤니티(카페형) 기능
--   communities(카페) · community_members(가입) · community_posts(글)
--   · community_post_comments · community_post_likes
-- 정책: 개설 1인 1개(manager_id UNIQUE) · 가입 다수 · 폐쇄=매니저 하드삭제(cascade)
--   · 글쓰기 멤버만(라우트 가드) · 카운트 트리거 자동 유지
-- ============================================================

-- 1) 커뮤니티(카페)
CREATE TABLE IF NOT EXISTS communities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id   uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,  -- 1인 1개
  name         text NOT NULL,
  topic        text,                                  -- 주제/카테고리
  description  text,
  cover_image  text,
  member_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communities_member_idx ON communities(member_count DESC);
CREATE INDEX IF NOT EXISTS communities_created_idx ON communities(created_at DESC);

-- 2) 멤버십(가입)
CREATE TABLE IF NOT EXISTS community_members (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_members_user_idx ON community_members(user_id, joined_at DESC);

-- 3) 글(뉴스피드)
CREATE TABLE IF NOT EXISTS community_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       text NOT NULL DEFAULT '',
  image_url     text,
  song_id       uuid REFERENCES songs(id) ON DELETE SET NULL,   -- 내 음악 첨부(곡 삭제돼도 글 유지)
  pinned        boolean NOT NULL DEFAULT false,                  -- 인기글/공지 상단 고정(매니저)
  like_count    integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_posts_feed_idx ON community_posts(community_id, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS community_posts_pinned_idx ON community_posts(community_id, pinned, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS community_posts_popular_idx ON community_posts(like_count DESC, created_at DESC) WHERE status = 'active';

-- 4) 댓글
CREATE TABLE IF NOT EXISTS community_post_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_post_comments_idx ON community_post_comments(post_id, created_at);

-- 5) 좋아요
CREATE TABLE IF NOT EXISTS community_post_likes (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- ── 카운트 트리거 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_member_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_community_member_count ON community_members;
CREATE TRIGGER trg_community_member_count AFTER INSERT OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION public.community_member_count();

CREATE OR REPLACE FUNCTION public.community_post_like_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_community_post_like_count ON community_post_likes;
CREATE TRIGGER trg_community_post_like_count AFTER INSERT OR DELETE ON community_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_post_like_count();

CREATE OR REPLACE FUNCTION public.community_post_comment_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_community_post_comment_count ON community_post_comments;
CREATE TRIGGER trg_community_post_comment_count AFTER INSERT OR DELETE ON community_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_post_comment_count();

-- updated_at (033의 set_updated_at 재사용)
DROP TRIGGER IF EXISTS trg_communities_updated ON communities;
CREATE TRIGGER trg_communities_updated BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_community_posts_updated ON community_posts;
CREATE TRIGGER trg_community_posts_updated BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS: 읽기 공개, 쓰기는 서버(service_role)만 ───────────────
ALTER TABLE communities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_likes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communities_select ON communities;
CREATE POLICY communities_select ON communities FOR SELECT USING (true);
DROP POLICY IF EXISTS community_members_select ON community_members;
CREATE POLICY community_members_select ON community_members FOR SELECT USING (true);
DROP POLICY IF EXISTS community_posts_select ON community_posts;
CREATE POLICY community_posts_select ON community_posts FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS community_post_comments_select ON community_post_comments;
CREATE POLICY community_post_comments_select ON community_post_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS community_post_likes_select ON community_post_likes;
CREATE POLICY community_post_likes_select ON community_post_likes FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE 정책 미생성 = anon/authenticated 차단. 모든 쓰기는 라우트(admin)에서 가드 후 수행.
