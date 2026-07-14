-- 059_iap_purchases.sql — 앱 인앱결제(RevenueCat) 소비 로그 + 멱등 지급 키.
-- RevenueCat 웹훅이 NON_RENEWING_PURCHASE(소비성 크레딧) 이벤트를 보내면
-- transaction_id(스토어 거래 id)를 UNIQUE로 잡아 중복 지급을 막고 add_paid_credits로 지급한다.

create table if not exists public.iap_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store text not null default 'unknown',       -- 'app_store' | 'play_store'
  product_id text not null,
  credits integer not null,
  transaction_id text not null unique,          -- 멱등키(스토어 거래 id)
  event_id text,                                -- RevenueCat 이벤트 id
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists iap_purchases_user_idx on public.iap_purchases (user_id, created_at desc);

alter table public.iap_purchases enable row level security;

-- 본인 구매 내역만 읽기(마이페이지용). 쓰기는 서버(service_role)만 — 정책 없음 = 클라 write 차단.
drop policy if exists "iap own read" on public.iap_purchases;
create policy "iap own read" on public.iap_purchases
  for select using (auth.uid() = user_id);
