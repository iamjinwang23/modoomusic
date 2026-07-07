-- ============================================================
-- 어드민 권한 세분화 — Module 4 확장
-- profiles.admin_permissions text[] (NULL = 최고관리자 / 배열 = 제한된 메뉴만)
-- 기존 is_admin=true 사용자 (iamjinwang23@gmail.com)는 NULL 유지 → 최고관리자
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_permissions text[];

-- 인덱스 — 권한별 어드민 카운트·조회 용 (선택적)
CREATE INDEX IF NOT EXISTS profiles_admin_permissions_idx
  ON profiles USING GIN (admin_permissions) WHERE is_admin = true;

COMMENT ON COLUMN profiles.admin_permissions IS
  'NULL = 최고관리자 (모든 메뉴 + 관리자 등록 가능) / text[] = 제한 관리자 (배열에 명시된 메뉴만 접근). dashboard는 모든 관리자가 접근 가능.';
