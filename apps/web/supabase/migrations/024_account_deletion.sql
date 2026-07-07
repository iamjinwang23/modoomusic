-- Design Ref: account-deletion §3 — 회원 탈퇴 (7일 grace + soft delete + 사유 수집)
-- Plan SC: 인앱 탈퇴 / 7일 100% 복원 / §7 데이터 처리 / 사유 통계 / referral 부정 차단
-- Vercel Hobby 2 cron 한도 → finalize는 별도 cron 대신 cleanup-notifications에 번들 (Decision 갱신)

-- ============================================================
-- 1) profiles에 deleted_at 컬럼 + index (soft delete)
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 2) 탈퇴 사유 로그 (개인 식별 정보 0 — K-PIPA 안전)
-- ============================================================
CREATE TABLE IF NOT EXISTS account_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_category text NOT NULL CHECK (reason_category IN ('quality','no_ideas','switching','privacy','pause','other')),
  reason_text text CHECK (char_length(reason_text) <= 200),
  user_age_days integer,
  song_count integer,
  had_bonus_credits boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE account_deletion_logs ENABLE ROW LEVEL SECURITY;
-- 어떤 클라이언트도 직접 SELECT 불가. service_role 만 통계용 조회.
CREATE POLICY "account_deletion_logs_no_access"
  ON account_deletion_logs FOR SELECT USING (false);

-- ============================================================
-- 3) 탈퇴자 placeholder profile
--    profiles.id가 auth.users FK이므로 placeholder auth.users도 먼저 생성 필요
-- ============================================================
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, email_confirmed_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'service_role',
  'deleted@placeholder.local',
  '{"provider":"placeholder"}'::jsonb, '{}'::jsonb,
  now(), now(), now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (
  id, username, display_name, avatar_hue,
  onboarding_done, referral_code,
  bonus_credits, referrer_bonus_count, song_count
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'deleted_user',
  '(탈퇴한 회원)',
  0,
  true,
  'deleted0',  -- 8 chars lowercase alnum (generate_referral_code 패턴 호환)
  0, 0, 0
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4) RPC: 탈퇴 요청 (soft delete + 사유 로그 익명 저장)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  invoker_id uuid,
  reason_cat text,
  reason_txt text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_age int;
  song_cnt int;
  had_bonus boolean;
BEGIN
  -- 1. 이미 탈퇴 상태면 거부
  IF (SELECT deleted_at FROM profiles WHERE id = invoker_id) IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_deleted');
  END IF;

  -- 2. placeholder 탈퇴 금지 (방어적)
  IF invoker_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN jsonb_build_object('error', 'placeholder_protected');
  END IF;

  -- 3. 통계 컨텍스트 수집 (user_id 미저장)
  SELECT
    GREATEST(EXTRACT(DAY FROM NOW() - u.created_at)::int, 0),
    COALESCE(p.song_count, 0),
    COALESCE(p.bonus_credits, 0) > 0 OR COALESCE(p.referrer_bonus_count, 0) > 0
  INTO user_age, song_cnt, had_bonus
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  WHERE u.id = invoker_id;

  -- 4. 사유 로그 INSERT (user_id 없음 — K-PIPA 안전)
  INSERT INTO account_deletion_logs (
    reason_category, reason_text, user_age_days, song_count, had_bonus_credits
  ) VALUES (
    reason_cat, NULLIF(TRIM(reason_txt), ''), user_age, song_cnt, had_bonus
  );

  -- 5. profiles.deleted_at 마킹
  UPDATE profiles SET deleted_at = NOW() WHERE id = invoker_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 5) RPC: 복원 (grace period 내)
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_account(invoker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_when timestamptz;
BEGIN
  SELECT deleted_at INTO deleted_when FROM profiles WHERE id = invoker_id;
  IF deleted_when IS NULL THEN
    RETURN jsonb_build_object('error', 'not_deleted');
  END IF;
  IF NOW() - deleted_when > INTERVAL '7 days' THEN
    RETURN jsonb_build_object('error', 'grace_period_expired');
  END IF;

  UPDATE profiles SET deleted_at = NULL WHERE id = invoker_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 6) RPC: 영구 파기 (cron만 호출 — service_role 권한)
--    운영정책 §7 데이터 처리 매트릭스에 따라 처리
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_account_deletion(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  placeholder_id uuid := '00000000-0000-0000-0000-000000000000';
  deleted_when timestamptz;
BEGIN
  -- 0. 방어: placeholder는 영구 파기 금지
  IF target_id = placeholder_id THEN
    RETURN jsonb_build_object('error', 'placeholder_protected');
  END IF;

  -- 0.1 방어: grace period 미경과는 거부
  SELECT deleted_at INTO deleted_when FROM profiles WHERE id = target_id;
  IF deleted_when IS NULL THEN
    RETURN jsonb_build_object('error', 'not_deleted');
  END IF;
  IF NOW() - deleted_when < INTERVAL '7 days' THEN
    RETURN jsonb_build_object('error', 'not_eligible');
  END IF;

  -- 1. 공개 곡: 작성자 익명화 후 유지 (커뮤니티 가치 보존)
  UPDATE songs SET user_id = placeholder_id
  WHERE user_id = target_id AND is_public = true;

  -- 2. 비공개 곡: 삭제 (개인 작업 보호)
  DELETE FROM songs WHERE user_id = target_id AND is_public = false;

  -- 3. 본인 작성 댓글: 익명화 후 유지
  UPDATE comments SET user_id = placeholder_id WHERE user_id = target_id;

  -- 4. 좋아요·팔로우·알림: 즉시 파기
  DELETE FROM likes WHERE user_id = target_id;
  DELETE FROM follows WHERE follower_id = target_id OR following_id = target_id;
  DELETE FROM notifications WHERE actor_id = target_id OR user_id = target_id;

  -- 5. referral 관계 정리 — 다른 회원이 이 사람을 추천인으로 둔 경우 referred_by NULL
  UPDATE profiles SET referred_by = NULL WHERE referred_by = target_id;

  -- 6. profiles row 삭제 (CASCADE로 잔여 관계 자동 정리)
  DELETE FROM profiles WHERE id = target_id;

  -- 참고: auth.users는 API 라우트에서 admin.deleteUser로 별도 처리
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 7) redeem_referral 패치 — 탈퇴자 코드 차단
--    기존 함수 통째 교체 (line 92-94: deleted_at IS NULL 추가)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_referral(
  invitee_id uuid,
  invitee_ip text,
  ref_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  owner_id uuid;
  owner_bonus_count integer;
  invitee_created_at timestamptz;
  ip_count integer;
  provider_count integer;
  invitee_provider text;
  owner_bonus_added boolean := false;
  owner_username text;
BEGIN
  -- 1. 코드 검증 + 탈퇴자 코드 차단 (NEW: deleted_at IS NULL)
  SELECT id, referrer_bonus_count, username
    INTO owner_id, owner_bonus_count, owner_username
  FROM profiles
  WHERE referral_code = ref_code AND deleted_at IS NULL;
  IF owner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_code');
  END IF;

  -- 2. 자기참조 차단
  IF owner_id = invitee_id THEN
    RETURN jsonb_build_object('error', 'self_referral');
  END IF;

  -- 3. 이미 redeem 차단
  IF (SELECT referred_by FROM profiles WHERE id = invitee_id) IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_redeemed');
  END IF;

  -- 3.5. 신규 가입자만 허용 (60초 가드)
  SELECT created_at INTO invitee_created_at FROM auth.users WHERE id = invitee_id;
  IF invitee_created_at IS NULL OR EXTRACT(EPOCH FROM (NOW() - invitee_created_at)) > 60 THEN
    RETURN jsonb_build_object('error', 'not_new_user');
  END IF;

  -- 4. Anti-abuse: 같은 OAuth provider로 같은 owner 이미 referral한 적 있으면 차단
  SELECT COALESCE(
    raw_user_meta_data->>'provider',
    raw_app_meta_data->>'provider'
  ) INTO invitee_provider
  FROM auth.users WHERE id = invitee_id;

  SELECT COUNT(*) INTO provider_count
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.referred_by = owner_id
    AND COALESCE(
      u.raw_user_meta_data->>'provider',
      u.raw_app_meta_data->>'provider'
    ) = invitee_provider;
  IF provider_count > 0 THEN
    RETURN jsonb_build_object('error', 'abuse_blocked', 'reason', 'same_provider');
  END IF;

  -- 5. Anti-abuse: 동일 IP 4건 초과 차단
  SELECT COUNT(*) INTO ip_count
  FROM profiles WHERE referred_from_ip = invitee_ip;
  IF ip_count >= 4 THEN
    RETURN jsonb_build_object('error', 'abuse_blocked', 'reason', 'ip_quota');
  END IF;

  -- 6. invitee +10cr + referred_by + IP
  UPDATE profiles
  SET bonus_credits = COALESCE(bonus_credits, 0) + 10,
      referred_by = owner_id,
      referred_from_ip = invitee_ip
  WHERE id = invitee_id;

  -- 7. owner: count +1, 10명 이하면 +10cr
  IF owner_bonus_count < 10 THEN
    UPDATE profiles
    SET bonus_credits = COALESCE(bonus_credits, 0) + 10,
        referrer_bonus_count = COALESCE(referrer_bonus_count, 0) + 1
    WHERE id = owner_id;
    owner_bonus_added := true;
  ELSE
    UPDATE profiles
    SET referrer_bonus_count = COALESCE(referrer_bonus_count, 0) + 1
    WHERE id = owner_id;
  END IF;

  RETURN jsonb_build_object(
    'owner_id', owner_id,
    'owner_username', owner_username,
    'bonus_credits', 10,
    'owner_bonus_added', owner_bonus_added
  );
END;
$$;

-- ============================================================
-- 8) RLS 갱신 — profiles_select에 deleted_at 필터
--    본인은 자기 deleted_at 조회 필요 (AuthProvider 복원 분기)
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
USING (deleted_at IS NULL OR auth.uid() = id);

-- songs/comments/likes 등은 profiles와의 inner join (SONG_SELECT의
-- `profiles!songs_user_id_fkey ( ... )`)을 통해 자동 차단됨.
-- 단, songs RLS 자체는 user_id 기반이므로 별도 변경 없음.

-- ============================================================
-- 9) Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion(uuid) TO service_role;
