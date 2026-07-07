-- 041_payment_refund_request.sql
-- 사용자 환불 신청 — 어드민이 검토 후 실제 취소(환불) 처리.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_requested_at  timestamptz,
  ADD COLUMN IF NOT EXISTS refund_request_reason text;
