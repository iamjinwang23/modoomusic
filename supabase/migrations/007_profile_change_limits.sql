-- 프로필 변경 정책용 컬럼
--  username_changed_at  : 아이디는 평생 1회만 변경 (NULL = 변경 안 함, 변경 시 이 컬럼이 채워지면 이후 비활성화)
--  name_change_log      : 이름 변경 타임스탬프 배열 (최근 14일 안에 2회 이하만 허용)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS name_change_log     timestamptz[] NOT NULL DEFAULT '{}';
