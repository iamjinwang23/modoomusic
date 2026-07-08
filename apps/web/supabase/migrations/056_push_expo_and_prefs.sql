-- 056_push_expo_and_prefs.sql
-- push_subscriptions: Expo/APNs 토큰 수용 (endpoint=ExponentPushToken, platform='expo', p256dh/auth NULL)
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth   DROP NOT NULL;

-- 알림 카테고리별 푸시 on/off (opt-out: 행 없으면 전부 ON)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  song_complete boolean NOT NULL DEFAULT true,
  likes         boolean NOT NULL DEFAULT true,
  comments      boolean NOT NULL DEFAULT true,
  follow        boolean NOT NULL DEFAULT true,
  community     boolean NOT NULL DEFAULT true,
  credit        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_prefs_select_own ON notification_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notif_prefs_write_own ON notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
