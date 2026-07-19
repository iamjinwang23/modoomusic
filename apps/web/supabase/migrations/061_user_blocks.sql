-- 061_user_blocks.sql
-- 사용자 간 차단 — 양방향 완전차단(피드 숨김·상호 언팔·상호작용 차단)의 기반 테이블.

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks(blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- 양방향 SELECT: 내가 차단한 행(blocker=me) + 나를 차단한 행(blocked=me).
-- 브라우저 클라이언트가 피드에서 양방향 숨김을 계산하려면 두 방향 다 읽어야 함.
-- 차단 "목록" UI는 쿼리에서 blocker_id=me로 따로 좁힘(나를 차단한 사람은 목록에 안 뜸).
DROP POLICY IF EXISTS user_blocks_select_own ON user_blocks;
CREATE POLICY user_blocks_select_own ON user_blocks FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS user_blocks_insert ON user_blocks;
CREATE POLICY user_blocks_insert ON user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_delete_own ON user_blocks;
CREATE POLICY user_blocks_delete_own ON user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);
