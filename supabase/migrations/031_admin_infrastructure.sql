-- ============================================================
-- Admin 인프라 — Module 1
-- Design Ref: §3 Data Model
--   1) admin_actions 감사 로그 테이블
--   2) profiles.suspended_at 정지 컬럼
--   3) song_reports / comment_reports 처리 상태 컬럼
--   4) record_admin_action() RPC (SECURITY DEFINER)
-- ============================================================

-- 1) admin_actions — 모든 어드민 동작 영구 기록
-- Plan SC: (2) 모든 동작이 admin_actions에 기록
CREATE TABLE IF NOT EXISTS admin_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      text NOT NULL,                                       -- 'grant_credit' | 'resolve_report' | 'suspend_user' | ...
  target_type text NOT NULL,                                       -- 'user' | 'song' | 'comment' | 'report' | 'system'
  target_id   text,                                                -- uuid 또는 식별자 (system은 NULL)
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,                  -- before/after 등 컨텍스트
  reason      text NOT NULL CHECK (char_length(reason) >= 5),      -- 사유 필수 (5자 이상)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_admin_idx
  ON admin_actions(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_action_idx
  ON admin_actions(action, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx
  ON admin_actions(target_type, target_id);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- 어드민만 자기 동작/전체 조회. INSERT/UPDATE/DELETE는 서버(service_role)에서만.
DROP POLICY IF EXISTS admin_actions_select ON admin_actions;
CREATE POLICY admin_actions_select ON admin_actions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 2) profiles 정지 컬럼
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended_at     timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by     uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_suspended_idx
  ON profiles(suspended_at) WHERE suspended_at IS NOT NULL;

-- 3) song_reports / comment_reports 처리 상태
ALTER TABLE song_reports
  ADD COLUMN IF NOT EXISTS resolved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS resolution      text CHECK (resolution IN ('upheld', 'dismissed')),
  ADD COLUMN IF NOT EXISTS resolution_memo text,
  ADD COLUMN IF NOT EXISTS resolved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE comment_reports
  ADD COLUMN IF NOT EXISTS resolved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS resolution      text CHECK (resolution IN ('upheld', 'dismissed')),
  ADD COLUMN IF NOT EXISTS resolution_memo text,
  ADD COLUMN IF NOT EXISTS resolved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS song_reports_pending_idx
  ON song_reports(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS comment_reports_pending_idx
  ON comment_reports(created_at DESC) WHERE resolved_at IS NULL;

-- 4) record_admin_action() RPC — server에서 service_role로 호출.
-- p_admin_id는 server route가 가드 통과 후 명시적으로 전달 (auth.uid() 미사용 —
-- service_role 클라이언트로도 호출 가능하게 하기 위함).
-- Design Ref: §9 Service Layer — withAudit() 래퍼가 이 RPC 호출
-- 다중 방어: RPC 내부에서도 p_admin_id의 is_admin 재검증
CREATE OR REPLACE FUNCTION public.record_admin_action(
  p_admin_id    uuid,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_payload     jsonb,
  p_reason      text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF char_length(coalesce(p_reason, '')) < 5 THEN
    RAISE EXCEPTION 'reason_too_short';
  END IF;

  INSERT INTO admin_actions (admin_id, action, target_type, target_id, payload, reason)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, coalesce(p_payload, '{}'::jsonb), p_reason)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_admin_action(uuid, text, text, text, jsonb, text)
  TO authenticated, service_role;
