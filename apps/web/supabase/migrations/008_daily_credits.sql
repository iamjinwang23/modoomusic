-- 1차 출시(Free Only): 일일 크레딧 추적
--   daily_credits_used    : 오늘 사용한 크레딧 누계 (KST 자정 리셋)
--   last_credit_reset_at  : 마지막으로 리셋한 시점 (UTC 저장, 비교 시 KST 변환)
-- Free 정책: 일 10크, Music 2.0(2cr/곡)만 허용 → 최대 5곡/일
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_credits_used   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_credit_reset_at timestamptz NOT NULL DEFAULT now();
