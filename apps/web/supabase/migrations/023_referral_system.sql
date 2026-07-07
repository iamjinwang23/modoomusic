-- Design Ref: referral §3.1 — 친구 초대 시스템 마이그레이션
-- 결제 인프라 전 viral loop, 보너스 +10cr/+10cr, 누적 10명 상한
-- Anti-abuse: provider별 1회 + IP 4건 + isNewUser 60초 가드 (Decision #11)

-- 1) profiles 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer_bonus_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_credits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_from_ip text;

CREATE INDEX IF NOT EXISTS profiles_referral_code_idx ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON profiles(referred_by);
CREATE INDEX IF NOT EXISTS profiles_referred_from_ip_idx ON profiles(referred_from_ip);

-- 2) 8자 base36 lowercase referral_code 생성 함수
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts integer := 0;
BEGIN
  LOOP
    candidate := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 5 THEN
      RAISE EXCEPTION 'referral_code generation failed after 5 attempts';
    END IF;
  END LOOP;
END;
$$;

-- 3) 기존 사용자 referral_code 백필
UPDATE profiles
SET referral_code = generate_referral_code()
WHERE referral_code IS NULL;

ALTER TABLE profiles ALTER COLUMN referral_code SET NOT NULL;

-- 4) handle_new_user 트리거 확장 — 가입 시 referral_code 자동 부여
-- 기존 트리거 함수 유지하면서 referral_code 추가 가능. 트리거가 이미 있다면 ON CONFLICT (id) DO UPDATE로 referral_code만 채워줌
-- 안전한 방법: 별도 트리거로 INSERT 직후 채워주기
CREATE OR REPLACE FUNCTION public.set_referral_code_on_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_referral_code_trigger ON profiles;
CREATE TRIGGER set_referral_code_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_code_on_profile_insert();

-- 5) 핵심 RPC: redeem_referral — 모든 anti-abuse 체크 + 양쪽 보너스 transaction
-- Design Ref: §4.2 — 단일 트랜잭션으로 race condition 회피
-- Naver 함정: raw_user_meta_data->>'provider' 우선 (custom flow) → raw_app_meta_data->>'provider' fallback
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
  -- 1. 코드 검증
  SELECT id, referrer_bonus_count, username
    INTO owner_id, owner_bonus_count, owner_username
  FROM profiles WHERE referral_code = ref_code;
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

  -- 3.5. 신규 가입자만 허용 (Decision #11) — auth.users.created_at < 60초
  SELECT created_at INTO invitee_created_at FROM auth.users WHERE id = invitee_id;
  IF invitee_created_at IS NULL OR EXTRACT(EPOCH FROM (NOW() - invitee_created_at)) > 60 THEN
    RETURN jsonb_build_object('error', 'not_new_user');
  END IF;

  -- 4. Anti-abuse: 같은 OAuth provider로 같은 owner 이미 referral한 적 있으면 차단
  -- Naver 함정: raw_user_meta_data->>'provider' 우선 (custom magiclink)
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

  -- 5. Anti-abuse: 동일 IP에서 4건 초과 차단
  SELECT COUNT(*) INTO ip_count
  FROM profiles WHERE referred_from_ip = invitee_ip;
  IF ip_count >= 4 THEN
    RETURN jsonb_build_object('error', 'abuse_blocked', 'reason', 'ip_quota');
  END IF;

  -- 6. invitee +10cr bonus + referred_by 마킹 + IP 기록
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

GRANT EXECUTE ON FUNCTION public.redeem_referral(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO authenticated;
