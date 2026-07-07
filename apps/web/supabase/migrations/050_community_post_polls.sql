-- 050_community_post_polls.sql
-- 커뮤니티 글 투표 — 단일 선택, 게시 24시간 후 자동 종료.
CREATE TABLE IF NOT EXISTS community_post_polls (
  post_id    uuid PRIMARY KEY REFERENCES community_posts(id) ON DELETE CASCADE,
  options    text[] NOT NULL,               -- 2~4개
  ends_at    timestamptz NOT NULL,          -- 게시 +24h
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_post_poll_votes (
  post_id      uuid NOT NULL REFERENCES community_post_polls(post_id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_index int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)            -- 1인 1표(단일 선택)
);
CREATE INDEX IF NOT EXISTS community_post_poll_votes_post_idx ON community_post_poll_votes(post_id);

ALTER TABLE community_post_polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_post_polls_select ON community_post_polls;
CREATE POLICY community_post_polls_select ON community_post_polls FOR SELECT USING (true);
DROP POLICY IF EXISTS community_post_poll_votes_select ON community_post_poll_votes;
CREATE POLICY community_post_poll_votes_select ON community_post_poll_votes FOR SELECT USING (true);
-- INSERT는 서버 라우트(admin)에서 가드 후 수행.
