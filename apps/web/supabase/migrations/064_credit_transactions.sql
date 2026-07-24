-- 064_credit_transactions.sql
-- 크레딧 원장(ledger) — 충전·사용·환불을 거래로 기록. 설정 '크레딧 내역' 화면의 소스.
--   category : 탭 분류. 'charge'(충전 탭) | 'usage'(사용 탭)
--   kind     : 세부 유형. 'charge'(충전) | 'use'(사용) | 'refund'(환불)
--   amount   : 사용가능 크레딧에 대한 부호 있는 증감. 충전/생성실패환불 +, 사용/결제환불 −
--   source   : 'iap'|'payment'|'song'|'video'|'referral'|'admin'|'signup'|'other'
--   ref_id   : 관련 엔티티(song_id / payment_id / store transaction_id 등)
-- 잔액(러닝 밸런스)은 저장 안 함 — 일일 크레딧 매일 리셋 + 3버킷 혼합이라 누적 잔액은 오해 소지.

create table if not exists public.credit_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  category   text not null check (category in ('charge','usage')),
  kind       text not null check (kind in ('charge','use','refund')),
  amount     integer not null,
  source     text not null default 'other',
  ref_id     text,
  title      text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);
create index if not exists credit_tx_user_cat_idx on public.credit_transactions (user_id, category, created_at desc);

alter table public.credit_transactions enable row level security;

-- 본인 내역만 읽기. 쓰기는 서버(service_role)만 — 정책 없음 = 클라 write 차단.
drop policy if exists "credit_tx own read" on public.credit_transactions;
create policy "credit_tx own read" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- ── 백필: 기존 충전 기록을 거래로 이관(멱등 — 재실행 시 중복 방지 위해 not exists 가드) ──

-- 앱스토어/플레이스토어 IAP 충전
insert into public.credit_transactions (user_id, category, kind, amount, source, ref_id, title, created_at)
select p.user_id, 'charge', 'charge', p.credits, 'iap', p.transaction_id,
       '크레딧 충전 ' || p.credits || 'cr', p.created_at
from public.iap_purchases p
where not exists (
  select 1 from public.credit_transactions t
  where t.source = 'iap' and t.ref_id = p.transaction_id and t.kind = 'charge'
);

-- 웹 PortOne 결제 충전(지급 완료분)
insert into public.credit_transactions (user_id, category, kind, amount, source, ref_id, title, created_at)
select p.user_id, 'charge', 'charge', p.credits, 'payment', p.payment_id,
       '크레딧 충전 ' || p.credits || 'cr', coalesce(p.paid_at, p.created_at)
from public.payments p
where p.status in ('paid','refunded')
  and not exists (
    select 1 from public.credit_transactions t
    where t.source = 'payment' and t.ref_id = p.payment_id and t.kind = 'charge'
  );

-- 웹 결제 환불(크레딧 회수분)
insert into public.credit_transactions (user_id, category, kind, amount, source, ref_id, title, created_at)
select p.user_id, 'charge', 'refund', -p.refunded_credits, 'payment', p.payment_id,
       '결제 환불 ' || p.refunded_credits || 'cr', coalesce(p.cancelled_at, p.updated_at, p.created_at)
from public.payments p
where p.refunded_credits > 0
  and not exists (
    select 1 from public.credit_transactions t
    where t.source = 'payment' and t.ref_id = p.payment_id and t.kind = 'refund'
  );
