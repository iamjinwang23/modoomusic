-- 045_community_post_reports.sql
-- 커뮤니티 게시글 신고 — song_reports/comment_reports 미러 스키마 + 어드민 신고 큐 통합.
-- 인정(upheld) 시 community_posts.status = 'hidden'로 블라인드.

CREATE TABLE IF NOT EXISTS community_post_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id         uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reason          text NOT NULL CHECK (reason IN
    ('욕설·비속어','음란물','혐오·차별 표현','도배','광고·홍보성 콘텐츠','개인정보 노출','저작권 침해','기타')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution      text CHECK (resolution IN ('upheld', 'dismissed')),
  resolution_memo text,
  resolved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (reporter_id, post_id)
);

CREATE INDEX IF NOT EXISTS community_post_reports_reporter_idx ON community_post_reports(reporter_id);
CREATE INDEX IF NOT EXISTS community_post_reports_post_idx ON community_post_reports(post_id);

ALTER TABLE community_post_reports ENABLE ROW LEVEL SECURITY;

-- INSERT 본인만 (라우트는 admin으로 넣지만 방어적으로 유지)
DROP POLICY IF EXISTS community_post_reports_insert ON community_post_reports;
CREATE POLICY community_post_reports_insert ON community_post_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- SELECT 본인만 — 새로고침 후 신고자 블라인드 필터링용
DROP POLICY IF EXISTS community_post_reports_select_own ON community_post_reports;
CREATE POLICY community_post_reports_select_own ON community_post_reports FOR SELECT
  USING (auth.uid() = reporter_id);
