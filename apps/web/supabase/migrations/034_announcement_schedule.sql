-- ============================================================
-- 034_announcement_schedule.sql
-- 공지 예약 발행 — publish_at 시각 게이팅 (별도 cron 불필요)
--   publish_at NULL    → 즉시 공개 (status='published' 기준)
--   publish_at 미래    → 그 시각 이후에만 공개 (RLS + 쿼리에서 게이팅)
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

-- 예약 노출 가속용 (게시 + 예약시각)
CREATE INDEX IF NOT EXISTS announcements_publish_at_idx
  ON announcements(publish_at) WHERE status = 'published';

-- RLS 갱신: 게시 + (예약 없음 또는 예약시각 도래) 이면 공개. 어드민은 전체.
DROP POLICY IF EXISTS announcements_select ON announcements;
CREATE POLICY announcements_select ON announcements
  FOR SELECT
  USING (
    (status = 'published' AND (publish_at IS NULL OR publish_at <= now()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
