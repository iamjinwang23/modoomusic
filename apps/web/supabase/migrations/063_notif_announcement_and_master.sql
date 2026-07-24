-- 063_notif_announcement_and_master.sql
-- 알림 설정 확장: ① '공지'(announcement) 카테고리 추가 ② '전체 알림' 마스터(push_enabled).
--   announcement  — 공지·운영(system) 푸시 on/off. 기본 ON.
--   push_enabled  — 전체 알림 마스터. false면 모든 푸시 차단(개별값은 유지). 기본 ON.
-- 둘 다 기존 유저(행 없음) 기본 ON으로 동작(코드가 !== false로 판정).

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS announcement boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true;
