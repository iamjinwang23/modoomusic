-- ============================================================
-- 010_notifications.sql
-- 알림: 좋아요·새 곡 완성·시스템 공지·팔로우·댓글
-- Design Ref: notifications.design.md §3
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,    -- 수신자
  type        text NOT NULL CHECK (type IN ('like','song_complete','system','follow','comment')),
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,            -- 행위자 (system은 NULL)
  song_id     uuid REFERENCES songs(id) ON DELETE CASCADE,
  comment_id  uuid,                                                       -- comment 도입 시 사용
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,                         -- system: {title, body, url?}
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 사용자별 최신순 조회용
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- 미읽음 카운트 빠른 조회
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read_at IS NULL;

-- 좋아요 중복 알림 차단 (off→on 반복 스팸 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_like
  ON notifications (user_id, actor_id, song_id, type)
  WHERE type = 'like' AND comment_id IS NULL;

-- ============================================================
-- RLS — 본인 알림만 조회·읽음 처리. INSERT는 service role만 가능
-- (INSERT 정책을 만들지 않으면 RLS 활성화 상태에서 anon/authenticated INSERT 차단)
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own_read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 본인이 자기 알림 삭제 허용 (UI에서 노출하지 않더라도 안전한 default)
CREATE POLICY "notifications_delete_own"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);
