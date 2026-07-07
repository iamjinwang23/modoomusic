-- 036_announcement_notified_at.sql
-- 공지 "지금 전체 알림 보내기" 지원 — 발송 시각 기록.
-- 예약 발행 자동 알림은 (Hobby cron 한도로) 미지원 → 어드민이 수동으로 발송 버튼 클릭.
-- notified_at: 최초 전체 알림 발송 시각 (재발송 시 새로 가입한 유저에게만 추가 발송, app-level dedupe).

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;
