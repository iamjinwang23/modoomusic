-- ============================================================
-- 038_announcement_popup.sql
-- 공지 팝업 노출 — 우측 하단 카드 모달 (이미지 + 제목)
--   popup_enabled   이 공지를 팝업으로 노출할지
--   popup_starts_at 노출 시작 (NULL = 즉시)
--   popup_ends_at   노출 종료 (NULL = 무기한)
-- "한 번에 하나의 팝업만" — 부분 유니크 인덱스로 popup_enabled=true 행을 최대 1개로 강제.
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS popup_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS popup_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS popup_ends_at   timestamptz;

-- 팝업은 동시에 1개만: popup_enabled=true 행은 최대 1개 (부분 인덱스의 모든 값이 true → 유니크 = 1행)
CREATE UNIQUE INDEX IF NOT EXISTS announcements_single_popup
  ON announcements (popup_enabled) WHERE popup_enabled;
