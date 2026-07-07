-- 관리자 계정 + 일일 크레딧 한도 분기
-- iamjinwang23@gmail.com을 관리자로 마킹하고 일일 100크레딧 부여.
-- 향후 다른 admin 권한(곡 신고 처리·통계 페이지 등) 확장 base.

-- 1) profiles.is_admin 컬럼 (기본 false)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_admin_idx
  ON profiles(is_admin) WHERE is_admin = true;

-- 2) iamjinwang23@gmail.com 관리자 지정
UPDATE profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'iamjinwang23@gmail.com'
);
