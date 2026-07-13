-- 058_community_comment_reports.sql
-- 커뮤니티 댓글 신고 — comment_reports/community_post_reports 미러 스키마.
-- ⚠️ 어드민 신고 큐(/admin/reports) 통합은 후속(현재는 접수·저장만). 매니저 삭제로 1차 모더레이션.

CREATE TABLE IF NOT EXISTS community_comment_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id      uuid NOT NULL REFERENCES community_post_comments(id) ON DELETE CASCADE,
  reason          text NOT NULL CHECK (reason IN
    ('욕설·비속어','음란물','혐오·차별 표현','도배','광고·홍보성 콘텐츠','개인정보 노출','저작권 침해','기타')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution      text CHECK (resolution IN ('upheld', 'dismissed')),
  resolution_memo text,
  resolved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (reporter_id, comment_id)
);

CREATE INDEX IF NOT EXISTS community_comment_reports_reporter_idx ON community_comment_reports(reporter_id);
CREATE INDEX IF NOT EXISTS community_comment_reports_comment_idx ON community_comment_reports(comment_id);

ALTER TABLE community_comment_reports ENABLE ROW LEVEL SECURITY;

-- INSERT 본인만(라우트는 admin으로 넣지만 방어적 유지)
DROP POLICY IF EXISTS community_comment_reports_insert ON community_comment_reports;
CREATE POLICY community_comment_reports_insert ON community_comment_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- SELECT 본인만
DROP POLICY IF EXISTS community_comment_reports_select_own ON community_comment_reports;
CREATE POLICY community_comment_reports_select_own ON community_comment_reports FOR SELECT
  USING (auth.uid() = reporter_id);
