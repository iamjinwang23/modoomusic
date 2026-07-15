-- 컬렉션(저장한 곡 묶음) — 로컬(localStorage/AsyncStorage)에서 서버로 이전. 웹·앱 완전 동기화.
-- song_ids는 uuid[] 배열(순서 보존). 삭제된 곡의 id는 클라에서 필터링(FK 미적용).

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cover_image text,
  song_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_user_idx on public.collections(user_id, created_at);
create index if not exists collections_song_ids_idx on public.collections using gin(song_ids);

alter table public.collections enable row level security;

-- 본인 소유만 접근
create policy "collections_select_own" on public.collections
  for select using (auth.uid() = user_id);
create policy "collections_insert_own" on public.collections
  for insert with check (auth.uid() = user_id);
create policy "collections_update_own" on public.collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collections_delete_own" on public.collections
  for delete using (auth.uid() = user_id);
