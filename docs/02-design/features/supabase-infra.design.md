# Design: supabase-infra

**Feature**: Supabase 인프라 연동  
**Architecture**: Option B — Clean Architecture  
**Date**: 2026-05-20  
**Status**: Design

---

## Context Anchor

| 항목 | 내용 |
|------|------|
| **WHY** | 로그인·공유 없이는 바이럴 루프 불가 — 인프라가 모든 소셜 기능의 전제 조건 |
| **WHO** | 곡을 만들고 탐색 피드에 공유하고 싶은 사용자 |
| **RISK** | RLS 미설정 시 데이터 노출 / MiniMax→Storage 파이프라인 실패 시 곡 유실 |
| **SUCCESS** | 로그인 → 곡 생성 → DB 저장 → 게시 → 탐색 피드 노출 E2E 동작 |
| **SCOPE** | Auth(Google OAuth) + DB 스키마 + Storage + 게시 플로우. 댓글·알림·결제 제외 |

---

## 1. 아키텍처 개요

**Clean Architecture** — Repository 계층이 모든 데이터 접근을 담당하고, Server Actions가 쓰기 작업의 단일 진입점 역할.

```
┌─────────────────────────────────────────────────────┐
│  Client Components (React)                          │
│  MyWorkPanel / ExplorePanel / SongForm / ...        │
│         ↓ 읽기: Supabase browser client (RLS)       │
│         ↓ 쓰기: Server Actions (form action / fn)   │
├─────────────────────────────────────────────────────┤
│  Server Actions  (app/actions/*.ts)                 │
│  song / auth / like / follow / storage              │
│         ↓                                           │
├─────────────────────────────────────────────────────┤
│  Repository Layer  (lib/repositories/*.ts)          │
│  SongRepo / ProfileRepo / ExploreRepo / ...         │
│         ↓                                           │
├─────────────────────────────────────────────────────┤
│  Supabase  (Auth · Postgres · Storage)              │
└─────────────────────────────────────────────────────┘
```

**읽기**: 클라이언트에서 `createBrowserClient` + RLS로 직접 쿼리  
**쓰기**: 항상 Server Actions 경유 (Supabase Service Key는 서버에만 존재)  
**Auth**: `proxy.ts`에서 세션 갱신(Next.js 16: `middleware.ts` → `proxy.ts` 리네임), `AuthProvider`가 클라이언트에 user 공급

---

## 2. 파일 구조

```
minimax-test/
├── proxy.ts                               # 세션 갱신 + admin 가드 (Next.js 16: middleware.ts deprecated)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql         # profiles/songs/follows/likes + RLS
├── lib/
│   ├── supabase/
│   │   ├── client.ts                      # createBrowserClient (클라이언트용)
│   │   ├── server.ts                      # createServerClient (서버 액션용)
│   │   └── admin.ts                       # createAdminClient (service_role, RLS 우회)
│   └── repositories/
│       ├── song.repository.ts             # CRUD + is_public 쿼리
│       ├── profile.repository.ts          # getByUsername, upsert
│       ├── explore.repository.ts          # public songs + feed/filter
│       ├── like.repository.ts             # toggle, count
│       ├── follow.repository.ts           # toggle, count
│       └── storage.repository.ts          # uploadAudio (MiniMax URL → Storage)
├── app/
│   └── actions/
│       ├── song.actions.ts                # createSong, updateSong, deleteSong
│       ├── publish.actions.ts             # publishSong, unpublishSong
│       ├── auth.actions.ts                # signInWithGoogle, signOut
│       ├── like.actions.ts                # toggleLike
│       └── follow.actions.ts              # toggleFollow
├── components/
│   ├── AuthProvider.tsx                   # 클라이언트 user context
│   └── PublishModal.tsx                   # 게시하기 UI (코멘트 + 태그)
├── hooks/
│   └── useAuth.ts                         # useContext(AuthContext) 래퍼
├── types/
│   └── domain.ts                          # Song / PublicSong / UserProfile (기존 유지)
└── services/
    ├── song.service.ts                    # ⚠️ deprecated → song.repository + actions
    └── explore.service.ts                 # ⚠️ deprecated → explore.repository
```

---

## 3. DB 스키마 (SQL)

```sql
-- profiles
CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username      text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  bio           text,
  avatar_hue    smallint DEFAULT 0,
  follower_count  integer DEFAULT 0,
  following_count integer DEFAULT 0,
  song_count      integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- songs
CREATE TABLE songs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  title           text,
  prompt          text NOT NULL,
  genre           text,
  mood            text,
  style_prompt    text,
  instrumental    boolean DEFAULT false,
  lyrics          text,
  audio_url       text,
  cover_hue       smallint DEFAULT 0,
  duration        integer,
  is_public       boolean DEFAULT false,
  publish_comment text,
  like_count      integer DEFAULT 0,
  play_count      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  published_at    timestamptz
);

-- follows
CREATE TABLE follows (
  follower_id   uuid REFERENCES profiles ON DELETE CASCADE,
  following_id  uuid REFERENCES profiles ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

-- likes
CREATE TABLE likes (
  user_id    uuid REFERENCES profiles ON DELETE CASCADE,
  song_id    uuid REFERENCES songs ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);
```

### RLS 정책

```sql
-- profiles: 전체 읽기, 본인만 수정
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read"  ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_write" ON profiles FOR UPDATE USING (auth.uid() = id);

-- songs: public 또는 본인 소유만 읽기, 본인만 쓰기
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "songs_read"   ON songs FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "songs_insert" ON songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "songs_update" ON songs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "songs_delete" ON songs FOR DELETE USING (auth.uid() = user_id);

-- follows / likes: 인증 유저만 쓰기, 전체 읽기
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_read"   ON follows FOR SELECT USING (true);
CREATE POLICY "follows_write"  ON follows FOR ALL USING (auth.uid() = follower_id);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes_read"  ON likes FOR SELECT USING (true);
CREATE POLICY "likes_write" ON likes FOR ALL USING (auth.uid() = user_id);
```

### Triggers (count 캐시)

```sql
-- like_count 자동 갱신
CREATE OR REPLACE FUNCTION update_like_count() RETURNS trigger AS $$
BEGIN
  UPDATE songs SET like_count = (SELECT COUNT(*) FROM likes WHERE song_id = COALESCE(NEW.song_id, OLD.song_id))
  WHERE id = COALESCE(NEW.song_id, OLD.song_id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER likes_count_trigger AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_like_count();

-- follower/following_count 자동 갱신
CREATE OR REPLACE FUNCTION update_follow_count() RETURNS trigger AS $$
DECLARE target_id uuid;
BEGIN
  target_id := COALESCE(NEW.following_id, OLD.following_id);
  UPDATE profiles SET follower_count = (SELECT COUNT(*) FROM follows WHERE following_id = target_id) WHERE id = target_id;
  target_id := COALESCE(NEW.follower_id, OLD.follower_id);
  UPDATE profiles SET following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = target_id) WHERE id = target_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER follows_count_trigger AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_count();

-- song_count 자동 갱신
CREATE OR REPLACE FUNCTION update_song_count() RETURNS trigger AS $$
BEGIN
  UPDATE profiles SET song_count = (SELECT COUNT(*) FROM songs WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND is_public = true)
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER songs_count_trigger AFTER INSERT OR UPDATE OR DELETE ON songs
  FOR EACH ROW EXECUTE FUNCTION update_song_count();

-- 신규 유저 가입 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, avatar_hue)
  VALUES (
    NEW.id,
    COALESCE(split_part(NEW.email, '@', 1), 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    floor(random() * 360)::smallint
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 4. Supabase 클라이언트 유틸

### `lib/supabase/client.ts`
```ts
import { createBrowserClient } from '@supabase/ssr'
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

### `lib/supabase/server.ts`
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // 서버 전용
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}
```

### `proxy.ts` (Next.js 16: 기존 `middleware.ts` 리네임)
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
export async function proxy(request: NextRequest) {
  // 세션 쿠키 갱신 + /admin/* 라우트 가드(ROUTE_PERMISSION 매핑)
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

---

## 5. Server Actions 설계

### `app/actions/auth.actions.ts`
```ts
'use server'
export async function signInWithGoogle() { /* supabase.auth.signInWithOAuth({ provider: 'google' }) */ }
export async function signOut() { /* supabase.auth.signOut() */ }
```

### `app/actions/song.actions.ts`
```ts
'use server'
// createSong(formData): MiniMax 호출 → audio 다운로드 → Storage 업로드 → songs INSERT
// updateSong(id, patch): songs UPDATE (소유자 검증)
// deleteSong(id): Storage 파일 삭제 + songs DELETE
```

### `app/actions/publish.actions.ts`
```ts
'use server'
// publishSong(id, { comment, genre, mood }): is_public=true, published_at=now()
// unpublishSong(id): is_public=false
```

### `app/actions/like.actions.ts`
```ts
'use server'
// toggleLike(songId): likes INSERT or DELETE (trigger가 like_count 갱신)
```

### `app/actions/follow.actions.ts`
```ts
'use server'
// toggleFollow(targetUserId): follows INSERT or DELETE
```

---

## 6. Repository 설계

### `lib/repositories/song.repository.ts`
```ts
// getMySongs(userId): songs WHERE user_id = userId ORDER BY created_at DESC
// getById(id): single song
// create(data): INSERT → return Song
// update(id, patch): UPDATE
// delete(id): DELETE + Storage 삭제
```

### `lib/repositories/explore.repository.ts`
```ts
// getFeed(tab: 'recommended'|'latest', limit): public songs
// getByFilter(tab, genres, moods): filtered public songs
// getUserSongs(username): songs by username WHERE is_public=true
```

### `lib/repositories/storage.repository.ts`
```ts
// uploadAudio(userId, songId, audioUrl): fetch(audioUrl) → storage.upload('songs/{userId}/{songId}.mp3')
// deleteAudio(userId, songId): storage.remove(...)
// getPublicUrl(path): storage.getPublicUrl(...)
```

---

## 7. AuthProvider (클라이언트 Auth 상태)

```tsx
// components/AuthProvider.tsx
'use client'
export const AuthContext = createContext<{ user: User | null }>({ user: null })
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}
```

`app/layout.tsx`에서 `<AuthProvider>` 래핑.

---

## 8. 기존 컴포넌트 변경 범위

| 컴포넌트 | 변경 내용 |
|----------|-----------|
| `SongForm.tsx` | `useSongGeneration` → `createSong` server action 호출 |
| `MyWorkPanel.tsx` | `songService.getAll()` → `supabase.from('songs').select(...)` |
| `ExplorePanel.tsx` | `exploreService.getFeed()` → `explore.repository` |
| `ProfilePanel.tsx` | `exploreService.getProfile()` → `profile.repository` |
| `PublicSongCard.tsx` | 좋아요 → `toggleLike` server action |
| `ProfilePanel.tsx` | 팔로우 → `toggleFollow` server action |
| `LoginModal.tsx` | `signInWithGoogle` server action 연결 |
| `HomeLayout.tsx` | `AuthProvider`로 감싸기, user 상태 활용 |
| `app/layout.tsx` | `AuthProvider` 추가 |
| `songService.ts` | deprecated 처리 (점진적 제거) |
| `exploreService.ts` | deprecated 처리 |
| **신규** `PublishModal.tsx` | 게시하기 UI |

---

## 9. MiniMax → Storage 파이프라인

```
SongForm 제출
  → createSong server action
    → useSongGeneration (MiniMax API 호출)
    → MiniMax가 audio URL 반환
    → storage.repository.uploadAudio(userId, songId, audioUrl)
      → fetch(audioUrl) → ArrayBuffer
      → supabase.storage.from('songs').upload(path, buffer)
      → getPublicUrl(path)
    → songs INSERT { audio_url: storageUrl }
    → 'song-updated' 이벤트 → MyWorkPanel 갱신
```

실패 시: MiniMax URL을 fallback으로 `audio_url`에 저장 (Storage 업로드 실패해도 곡 유실 없음).

---

## 10. 게시 플로우 (PublishModal)

```
MyWorkPanel 곡 항목 → "게시하기" 버튼
  → PublishModal 열림
    → 코멘트 textarea (선택)
    → 태그 칩: genre / mood 선택
  → 확인
    → publishSong server action(id, { comment, genre, mood })
      → songs UPDATE { is_public: true, published_at: now(), publish_comment, genre, mood }
    → 'song-updated' 이벤트
    → 탐색 피드 갱신 (explore.repository re-fetch)
```

---

## 11. 환경변수

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # 클라이언트 노출 가능
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # 서버 전용, 절대 노출 금지
MINIMAX_API_KEY=...
MINIMAX_MOCK=false
```

---

## 12. 구현 Session Guide

### Module Map

| 모듈 | 파일 | 예상 소요 |
|------|------|-----------|
| M1 | Supabase 프로젝트 생성 + `.env.local` | 30분 |
| M2 | `supabase/migrations/001_initial_schema.sql` 작성 + 적용 | 1시간 |
| M3 | `lib/supabase/client.ts`, `server.ts`, `proxy.ts`(Next.js 16) | 30분 |
| M4 | `app/actions/auth.actions.ts` + `LoginModal` 연결 | 1시간 |
| M5 | `AuthProvider.tsx` + `app/layout.tsx` 래핑 | 30분 |
| M6 | `lib/repositories/storage.repository.ts` + `song.actions.ts` | 1.5시간 |
| M7 | `SongForm` → `createSong` action 교체 | 1시간 |
| M8 | `lib/repositories/song.repository.ts` + `MyWorkPanel` 교체 | 1시간 |
| M9 | `lib/repositories/explore.repository.ts` + `ExplorePanel` / `ProfilePanel` 교체 | 1.5시간 |
| M10 | `PublishModal.tsx` + `publish.actions.ts` | 1시간 |
| M11 | `like.actions.ts` + `follow.actions.ts` + 컴포넌트 연결 | 1시간 |

### 권장 세션 분할

- **Session 1**: M1 + M2 + M3 (인프라 기반)
- **Session 2**: M4 + M5 (Auth 완성)
- **Session 3**: M6 + M7 (Storage + 곡 생성)
- **Session 4**: M8 + M9 (데이터 읽기 교체)
- **Session 5**: M10 + M11 (게시 + 소셜 액션)
