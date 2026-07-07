-- 040_notification_credit_charged.sql
-- 알림 타입에 'credit_charged'(크레딧 충전 완료) 추가. 기존 CHECK 교체.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'song_complete', 'system', 'follow', 'comment', 'credit_charged'));
