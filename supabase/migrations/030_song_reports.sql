-- 곡 신고 시스템 (comment_reports 패턴 차용)
-- 본인이 신고한 곡은 list에서 자동 숨김 (refresh 후), 즉시는 클라이언트 블라인드 처리.
-- comment_reports에 SELECT(own) 정책 추가 — 새로고침 후 신고자한테만 숨김 처리 위해.

-- ============================================================
-- 1) song_reports 테이블 (comment_reports와 미러 스키마)
-- ============================================================
CREATE TABLE IF NOT EXISTS song_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  song_id      uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (reason IN
    ('욕설·비속어','음란물','혐오·차별 표현','도배','광고·홍보성 콘텐츠','개인정보 노출','저작권 침해','기타')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, song_id)
);

CREATE INDEX IF NOT EXISTS song_reports_reporter_id_idx ON song_reports(reporter_id);
CREATE INDEX IF NOT EXISTS song_reports_song_id_idx ON song_reports(song_id);

ALTER TABLE song_reports ENABLE ROW LEVEL SECURITY;

-- INSERT 본인만
DROP POLICY IF EXISTS "song_reports_insert" ON song_reports;
CREATE POLICY "song_reports_insert" ON song_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- SELECT 본인만 — list 필터링용 (다른 사람 신고 내역은 admin 전용)
DROP POLICY IF EXISTS "song_reports_select_own" ON song_reports;
CREATE POLICY "song_reports_select_own" ON song_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- ============================================================
-- 2) comment_reports에 SELECT(own) 추가 — 동일 패턴 (014에선 SELECT 미허용)
-- ============================================================
DROP POLICY IF EXISTS "comment_reports_select_own" ON comment_reports;
CREATE POLICY "comment_reports_select_own" ON comment_reports FOR SELECT
  USING (auth.uid() = reporter_id);
