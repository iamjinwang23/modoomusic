-- ============================================================
-- 039_paid_credits_payments.sql
-- 유상 크레딧 + 결제(PortOne) 기록
--   1) profiles.paid_credits — 유상 크레딧 잔액 (무상 bonus_credits·일일과 분리)
--      소진 우선순위: 보너스 → 일일 → 유상(최후). 돈 주고 산 크레딧을 마지막까지 보존.
--   2) payments — 결제 내역(대사·환불 근거). 지급은 ready→paid 조건부 전이로 멱등.
--   3) add_paid_credits(uid, delta) — 유상 크레딧 원자적 증감 RPC.
-- ============================================================

-- 1) 유상 크레딧 잔액
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS paid_credits integer NOT NULL DEFAULT 0;

-- 2) 결제 내역
CREATE TABLE IF NOT EXISTS payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       text NOT NULL UNIQUE,            -- PortOne paymentId (서버 생성, 멱등키)
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_code     text NOT NULL,                   -- 'credit_2900' 등
  order_name       text NOT NULL,
  amount           integer NOT NULL,                -- 결제 금액(원, VAT 포함)
  credits          integer NOT NULL,                -- 지급 크레딧(구매 시점 스냅샷)
  status           text NOT NULL DEFAULT 'ready'    -- ready|paid|failed|cancelled|refunded
                     CHECK (status IN ('ready','paid','failed','cancelled','refunded')),
  pg_tx_id         text,                            -- PortOne transactionId
  paid_at          timestamptz,
  cancelled_at     timestamptz,
  refunded_credits integer NOT NULL DEFAULT 0,      -- 환불된 크레딧 수
  raw              jsonb,                            -- 마지막 검증 응답 스냅샷
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status, created_at DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 본인 결제내역만 읽기. INSERT/UPDATE/DELETE는 서버(service_role)만 — 정책 미생성 = 차단.
DROP POLICY IF EXISTS payments_select_own ON payments;
CREATE POLICY payments_select_own ON payments
  FOR SELECT USING (user_id = auth.uid());

-- updated_at 자동 갱신 (033의 범용 set_updated_at 재사용)
DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) 유상 크레딧 원자적 증감 (지급/환불 시 race 방지)
CREATE OR REPLACE FUNCTION public.add_paid_credits(p_user uuid, p_delta integer)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE profiles SET paid_credits = GREATEST(0, paid_credits + p_delta) WHERE id = p_user;
$$;
