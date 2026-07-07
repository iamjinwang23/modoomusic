-- 042_push_subscriptions.sql
-- 웹 푸시 구독 저장 (Web Push / VAPID). 사용자 1명이 기기·브라우저별 여러 구독 가능.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,   -- 구독 고유 식별 (멱등 upsert 키)
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- 서버(service_role)만 읽기/쓰기 — 정책 미생성 = anon/authenticated 차단.
