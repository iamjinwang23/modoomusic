-- Design Ref: account-deletion §5 patch — Option A 즉시 익명화
-- Plan SC: 운영정책 §7 "공개 곡 익명화 후 유지" 일관성 확보
--
-- 변경 의도:
--   기존(024): 탈퇴 시 deleted_at만 마킹 → 공개 곡이 7일간 사라졌다가 cron 이후 "(탈퇴한 회원)"으로 재등장
--   변경(025): 탈퇴 즉시 user_id를 placeholder로 교체 → Day 0부터 "(탈퇴한 회원)" 일관 노출
--   복원 시: original_user_id로 user_id 되돌리기 → 데이터 100% 복귀
--   finalize: 공개 곡 추가 처리 불필요 (이미 placeholder). 비공개 곡 DELETE + 관계 정리만 남음

-- ============================================================
-- 1) songs/comments에 original_user_id 컬럼 (anonymization revert용)
-- ============================================================
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS original_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS original_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS songs_original_user_id_idx
  ON songs(original_user_id) WHERE original_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_original_user_id_idx
  ON comments(original_user_id) WHERE original_user_id IS NOT NULL;

-- ============================================================
-- 2) request_account_deletion 패치 — soft delete + 즉시 익명화
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
  placeholder_id uuid := '00000000-0000-0000-0000-000000000000';
  user_age int;
  song_cnt int;
  had_bonus boolean;
BEGIN
  -- 1. 이미 탈퇴 상태면 거부
  IF (SELECT deleted_at FROM profiles WHERE id = invoker_id) IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_deleted');
  END IF;

  -- 2. placeholder 탈퇴 금지
  IF invoker_id = placeholder_id THEN
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

  -- 6. 즉시 익명화 (Option A — 운영정책 §7 일관성)
  -- 공개 곡: user_id를 placeholder로 교체, original_user_id에 원본 저장
  UPDATE songs
  SET original_user_id = user_id,
      user_id = placeholder_id
  WHERE user_id = invoker_id AND is_public = true;

  -- 비공개 곡: 그대로 유지 (소유권 유지 — 복원 시 자기 라이브러리 복귀, finalize 시 cron이 DELETE)
  -- songs RLS는 (is_public = true OR auth.uid() = user_id)이므로 다른 사람에게 보이지 않음

  -- 댓글: 익명화 (대화 맥락 보존)
  UPDATE comments
  SET original_user_id = user_id,
      user_id = placeholder_id
  WHERE user_id = invoker_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 3) restore_account 패치 — 익명화 revert
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

  -- 1. deleted_at 해제
  UPDATE profiles SET deleted_at = NULL WHERE id = invoker_id;

  -- 2. 곡 익명화 revert (user_id 복원, original_user_id 비움)
  UPDATE songs
  SET user_id = original_user_id,
      original_user_id = NULL
  WHERE original_user_id = invoker_id;

  -- 3. 댓글 익명화 revert
  UPDATE comments
  SET user_id = original_user_id,
      original_user_id = NULL
  WHERE original_user_id = invoker_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 4) finalize_account_deletion 패치 — 익명화 이미 됐으니 더 간단
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
  -- 0. 방어
  IF target_id = placeholder_id THEN
    RETURN jsonb_build_object('error', 'placeholder_protected');
  END IF;

  SELECT deleted_at INTO deleted_when FROM profiles WHERE id = target_id;
  IF deleted_when IS NULL THEN
    RETURN jsonb_build_object('error', 'not_deleted');
  END IF;
  IF NOW() - deleted_when < INTERVAL '7 days' THEN
    RETURN jsonb_build_object('error', 'not_eligible');
  END IF;

  -- 1. 공개 곡: 이미 placeholder. original_user_id만 NULL (원본 소유권 영구 소실)
  --    (profiles.id ON DELETE SET NULL FK가 6번에서 자동 처리하므로 명시 UPDATE는 생략 가능하나
  --     순서 보장 차원에서 명시)
  UPDATE songs SET original_user_id = NULL
  WHERE original_user_id = target_id;

  -- 2. 비공개 곡: 삭제 (여전히 target_id 소유)
  DELETE FROM songs WHERE user_id = target_id AND is_public = false;

  -- 3. 댓글: 이미 placeholder. original_user_id NULL
  UPDATE comments SET original_user_id = NULL
  WHERE original_user_id = target_id;

  -- 4. 좋아요·팔로우·알림: 즉시 파기
  DELETE FROM likes WHERE user_id = target_id;
  DELETE FROM follows WHERE follower_id = target_id OR following_id = target_id;
  DELETE FROM notifications WHERE actor_id = target_id OR user_id = target_id;

  -- 5. referral 관계 정리
  UPDATE profiles SET referred_by = NULL WHERE referred_by = target_id;

  -- 6. profiles row 삭제 (CASCADE로 잔여 관계 자동 정리)
  DELETE FROM profiles WHERE id = target_id;

  -- 참고: auth.users는 API 라우트에서 admin.deleteUser로 별도 처리
  RETURN jsonb_build_object('ok', true);
END;
$$;
