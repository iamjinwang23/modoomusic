# today-song-mvp Design Document

> **Summary**: MiniMax Music/Image API + Supabase Auth/Storage 기반 풀 파이프라인 — 음악·커버 생성, 소셜 OAuth, 4단계 온보딩, 프로필 이미지 시스템, 페이지별 라우팅, 생성 중 즉시 정보 표시 UX
>
> **Project**: 오늘의 노래 (MONO)
> **Version**: 0.2.0
> **Author**: jinwang
> **Date**: 2026-05-21
> **Status**: Implemented (Phase 1·2·3·4 모두 완료)
> **Last Updated**: 2026-06-01
> **Planning Doc**: [today-song-mvp.plan.md](../../01-plan/features/today-song-mvp.plan.md)

> **갱신 이력**: 본 문서 §1~§11은 2026-05-21 작성 당시의 Phase 1·2 설계 스냅샷. Phase 3·4 진화(Supabase 마이그레이션, 알림·좋아요·팔로우·댓글, 백그라운드 생성, AI 가사·심플 모드, ⋮ 메뉴 통합, SEO, 모바일 skeleton)는 §12 Addendum 참조.

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | MiniMax API + Supabase로 AI 음악 SNS MVP를 검증 — 생성·소셜 OAuth·온보딩·프로필 사이의 일관된 정체성 흐름 확립 |
| **WHO** | 음악을 만들고 싶지만 전문 지식이 없는 일반 사용자, 커버곡을 빠르게 제작·공유하고 싶은 크리에이터 |
| **RISK** | MiniMax API 응답시간 100초+, URL 24시간 만료, music-cover 유료($0.15/트랙), Supabase Storage 용량 |
| **SUCCESS** | 음악 생성 + 커버 자동 첨부, 카카오/구글 로그인 + 온보딩, 프로필 이미지 업로드·변경·삭제, 페이지별 URL 라우팅, 헤더↔프로필↔플레이어 아바타 일관성 |
| **SCOPE** | Phase 1: API+생성 UI (완료) / Phase 2: Auth+온보딩+프로필+라우팅+Storage 업로드 (완료) / Phase 3: Supabase songs DB 마이그레이션 + 구독 잠금 (다음) |

---

## Design Anchor

| Category | Tokens |
|----------|--------|
| **Colors (Base)** | bg: `#171A20`, header/sidebar: `#111318` → `#12151E`, panel: `#1E2129`/`#21252E`, border: `white/[0.06]`/`white/[0.08]`, accent: `violet-600` |
| **Colors (Profile Palette)** | 6색 bg/text 쌍 — HSL 기반 결정적 매핑 (avatar/cover 공유) |
| | `(87,57%,73%)/(87,45%,32%)` `(261,76%,75%)/(261,55%,35%)` `(40,60%,82%)/(40,50%,35%)` |
| | `(129,33%,77%)/(129,30%,30%)` `(0,49%,80%)/(0,40%,35%)` `(22,73%,75%)/(22,55%,35%)` |
| **Typography** | 본문: `text-sm`, 라벨: `text-xs text-zinc-500`, 제목(섹션): `text-xl font-semibold`, 프로필 이름: `text-3xl font-bold`, 미니바 제목: `text-sm font-medium` |
| **Spacing** | panel padding: `px-4 py-3` / `px-5 py-3`, gap: `gap-3`/`gap-4`, 섹션 간격: `mt-6` |
| **Radius** | panel: `rounded-xl`, 모달: `rounded-2xl`, badge: `rounded-full`, 아바타: `rounded-full`, 커버: `rounded-2xl` |
| **Dimensions** | 아바타 헤더: `w-8 h-8`, 아바타 프로필: `w-[100px] h-[100px]`, 커버 비율: `aspect-ratio: 1064/368`, 썸네일: `w-16 aspect-[2/3]` |
| **z-index** | header: 20, mobile drawer: 40-50, login modal: 50, song detail: 53, user menu: 54-55, song delete confirm: 70, onboarding: 80 |
| **Image** | 프로필 WebP, avatar max 400px / cover max 1200px, quality 0.85, Supabase Storage `profile-images/{userId}/{type}.webp` |
| **Layout** | Header(h-14) / Left sidebar(w-60) + Center(w-[560px] for create, flex-1 for others) + Right(My Work, create 전용) |
| **Tone** | 다크 테마, violet 액센트, 한국어 우선(법적 텍스트 제외) |

---

## 1. Overview

### 1.1 Design Goals

- MiniMax API 호출을 서버 사이드(`route.ts`)로 격리해 API 키 보호
- 음악 생성과 커버 이미지 생성을 병렬(`Promise.all`)로 처리해 총 대기 시간 최소화
- Supabase Auth + Storage를 통한 소셜 로그인·프로필 이미지 영속화
- LocalStorage(곡)와 Supabase DB(프로필) 하이브리드 — Phase 3에 곡도 Supabase로 이전
- 페이지별 URL 라우팅으로 브라우저 뒤로가기·새로고침 정상 동작
- 모든 영역에서 사용자 정체성(아바타·이름) 실시간 일관성

### 1.2 Design Principles

- **관심사 분리**: API(`minimax.service.ts`/`route.ts`) / 상태(`useSongGeneration`, `GlobalPlayerContext`) / UI(컴포넌트) 레이어 분리
- **이벤트 버스**: 컴포넌트 간 약결합을 위해 `window.dispatchEvent(new CustomEvent(...))` 패턴 사용 (`profile-avatar-updated`, `song-generating`, `song-updated`, `view-song`, `play-song`, `view-profile`, `open-login`)
- **결정적 폴백**: 이미지 미존재 시 HSL 팔레트 인덱스(`avatarHue`/`coverHue`)로 일관된 색상 폴백
- **즉시 표시**: 생성 중에도 사용자가 입력한 정보(제목/프롬프트/태그)는 바로 보여주고, 비결정 자원(오디오/이미지)만 스피너로 표현 (Suno 패턴)
- **프롬프트 주입**: 보컬 성별 등 UI 파라미터는 API 파라미터 없이 프롬프트 텍스트로 주입

---

## 2. Architecture

### 2.1 전체 컴포넌트 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                                    │
│                                                                  │
│  /  /library  /explore  /profile/[username]  /notifications     │
│   │                                                              │
│   ▼                                                              │
│  HomeLayout (initialSection, initialProfileUsername)            │
│   ├── Header (logo, headerAvatar, user menu, login button)      │
│   ├── Sidebar (NAV_ITEMS, plan upgrade)                          │
│   └── Center                                                     │
│       ├── create   → SongForm + MyWorkPanel(right aside)        │
│       ├── archive  → MyWorkPanel (showCollections)               │
│       ├── explore  → ExplorePanel                                │
│       ├── profile  → ProfilePanel(username)                      │
│       ├── song     → SongDetailPage (overlay)                    │
│       └── ...                                                    │
│   GlobalMiniBar (sticky bottom, only when song loaded)          │
│                                                                  │
│  Modals (portal): LoginModal · OnboardingModal · LoginModal      │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  Services / API                                                  │
│   ├── /api/generate          → MiniMax Music + Image (병렬)      │
│   ├── /api/check-username    → profiles 중복검사                  │
│   ├── /auth/callback         → OAuth 콜백                         │
│   └── songService (LocalStorage, Phase 3에 이전 예정)            │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  External                                                        │
│   ├── MiniMax Music/Image API                                    │
│   ├── Supabase Auth (Google/Kakao OAuth)                         │
│   ├── Supabase Storage (profile-images bucket)                   │
│   └── Supabase DB (profiles table)                               │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 음악 생성 파이프라인

```
SongForm.tsx
  │ submit({ prompt, genre, mood, customLyrics, instrumental, model, audioBase64? })
  ▼
useSongGeneration.generate()
  │ window.dispatchEvent('song-generating', detail: { title, prompt, genre, mood, instrumental })
  ▼ MyWorkPanel.onGenerating → setPendingSong
  ▼ <PendingSongItem> 즉시 표시 (썸네일 스피너만 회전)
  │
  ▼ POST /api/generate
  ┌─────────────────────────────────────┐
  │  generateSong()     ──▶ /v1/music_generation     │
  │  generateCoverImage() ──▶ /v1/image_generation   │
  │           Promise.all                            │
  └─────────────────────────────────────┘
  ▼ { audioUrl, lyrics, coverUrl }
  ▼ songService.save()  → LocalStorage
  ▼ window.dispatchEvent('song-updated')
  ▼ MyWorkPanel.onUpdated → setPendingSong(null) + setSongs(songService.getAll())
  ▼ <SongWorkItem> 정식 카드로 전환
```

### 2.3 인증 + 온보딩 플로우

```
LoginModal (Google / Kakao / Apple / Email)
  │ supabase.auth.signInWithOAuth({ provider, redirectTo: /auth/callback })
  ▼
/auth/callback (route handler)
  │ exchange code → session
  ▼ redirect /
HomeLayout useEffect [user?.id]
  │ supabase.from('profiles').select('onboarding_done, avatar_url, display_name')
  ├── !data || !onboarding_done  → setOnboardingOpen(true)
  └── data.avatar_url / display_name → setHeader{Avatar,DisplayName}

OnboardingModal (4 steps)
  Step 1: 유입 경로 (인스타그램/유튜브/친구·지인/광고/기타)
  Step 2: AI 경험 (never/little/often/daily)
  Step 3: 목표 (create/listen/content/browse, 다중)
  Step 4: 이름 + 아이디 (랜덤 추천 + 실시간 중복검사 via /api/check-username)
  │
  ▼ handleFinish()
  │ Promise.all([
  │   supabase.from('profiles').upsert({ id, username, display_name, onboarding_done: true, ... }),
  │   supabase.auth.updateUser({ data: { username, full_name } }),
  │ ])
  ▼ onDone() → 닫힘, HomeLayout 재진입 시 모달 미표시
```

### 2.4 프로필 이미지 시스템

```
ProfilePanel (isSelf)
  │ hover overlay (group/avatar, group/cover) → 카메라 / 휴지통 아이콘
  ▼ file input change
toWebp(file, maxPx, quality=0.85) ─── Canvas API
  │ avatar maxPx=400, cover maxPx=1200
  ▼ Blob (image/webp)
uploadProfileImage(userId, file, type)
  │ supabase.storage.from('profile-images').upload(`${userId}/${type}.webp`, blob, { upsert: true })
  ▼ public URL
setAvatarUrl/setCoverUrl  (ProfilePanel 로컬 state)
supabase.from('profiles').update({ avatar_url|cover_url: url })
window.dispatchEvent('profile-avatar-updated', detail: url)
  │
  ├─▶ HomeLayout.handleAvatarUpdated → setHeaderAvatarUrl
  └─▶ MyWorkPanel.onAvatarUpdated → setOwnerAvatarUrl
         │
         ▼ 이후 'view-song'/'play-song' dispatch 시 ownerAvatarUrl 포함
         ▼ GlobalPlayerContext → SongDetailPage / GlobalMiniBar 반영
```

### 2.5 라우팅 구조

| URL | initialSection | 진입 컴포넌트 | 비고 |
|-----|---------------|--------------|------|
| `/` | `create` | `HomeLayout` | SongForm + MyWorkPanel(우측) |
| `/library` | `archive` | `HomeLayout` (showCollections=true) | 곡/컬렉션 탭 |
| `/explore` | `explore` | `HomeLayout` | ExplorePanel |
| `/profile/[username]` | `profile` | `HomeLayout` (async params) | ProfilePanel |
| `/notifications` | `notifications` | `HomeLayout` | EmptyPanel (준비 중) |
| `(song detail)` | `song` | overlay, URL 변경 없음 | `view-song` 이벤트 트리거 |

- 네비게이션: `useRouter().push(sectionToPath(section, username))`로 URL 갱신
- `/archive` → `/library` 리다이렉트 (호환성)

---

## 3. Data Model

### 3.1 Song (LocalStorage, Phase 3에 Supabase 이전 예정)

```ts
interface Song {
  id: string
  createdAt: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  customLyrics: string | null
  lyrics: string | null
  instrumental: boolean
  audioUrl: string
  duration: number | null
  liked?: boolean
  published?: boolean
  publishedAt?: string
  coverHue?: number
  coverImage?: string
}
```

### 3.2 UserProfile (도메인)

```ts
interface UserProfile {
  username: string
  displayName: string
  userId: string
  bio: string | null
  avatarHue: number          // 6색 팔레트 인덱스
  avatarImage?: string | null
  coverImage?: string | null
  followerCount: number
  followingCount: number
  songCount: number
  isFollowing?: boolean
}
```

### 3.3 PublicSong (탐색·프로필용)

```ts
interface PublicSong {
  id: string
  createdAt: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  lyrics: string | null
  instrumental: boolean
  audioUrl: string
  duration: number | null
  coverHue: number
  coverImage?: string
  username: string
  displayName: string
  userId: string
  likeCount: number
  playCount: number
  isLiked: boolean
}
```

### 3.4 Supabase `profiles` 테이블

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auth.users.id 참조 |
| username | text (unique) | 영문 소문자/숫자/`.`/`_`, 최대 30자 |
| display_name | text | 한글 포함 가능, 최대 30자 |
| avatar_url | text \| null | Supabase Storage URL |
| cover_url | text \| null | Supabase Storage URL |
| onboarding_done | boolean | 4단계 완료 여부 |
| onboarding_source | text | instagram/youtube/friend/ad/etc |
| onboarding_ai_exp | text | never/little/often/daily |
| onboarding_goals | text[] | create/listen/content/browse |

### 3.5 Supabase Storage 버킷

| Bucket | Path | Notes |
|--------|------|-------|
| `profile-images` | `{userId}/avatar.webp` | maxPx 400, quality 0.85 |
| `profile-images` | `{userId}/cover.webp` | maxPx 1200, quality 0.85 |

---

## 4. API Contract

### 4.1 POST `/api/generate`

Request:
```ts
{
  prompt: string
  genre: string
  mood: string
  customLyrics?: string
  instrumental: boolean
  model: 'music-2.6-free' | 'music-2.0' | 'music-cover-free'
  audioBase64?: string  // cover-free 모델 사용 시
  title?: string        // 클라이언트 전용 (서버 미사용, songService.save에서 직접 사용)
}
```

Response (200):
```ts
{
  audioUrl: string      // Supabase Storage URL (`songs-audio` 버킷)
  lyrics: string | null
  coverUrl: string | null  // Supabase Storage URL (`songs-covers` 버킷)
}
```

Side effects: `MOCK_MODE=false`일 때 MiniMax 결과 audio/cover를 Supabase Storage `songs-audio`, `songs-covers` 버킷에 영속 저장 후 그 URL을 반환

Errors: 400 (빈 prompt), 502 (MiniMax 실패). RPM 초과는 현재 502로 통합 처리

### 4.2 GET `/api/check-username?username=`

Response: `{ available: boolean, reason?: 'empty' | 'invalid' }`
- `available: false`인 경우 `reason`이 동봉됨 (empty: 빈 문자열, invalid: 정규식 미부합, 그 외: 중복)

### 4.3 Supabase Auth

- Providers: `google`, `kakao` (대시보드 활성화)
- redirectTo: `${origin}/auth/callback`
- `auth.updateUser({ data: { username, full_name } })` — 온보딩 완료 시 호출하여 `user.user_metadata` 동기화

---

## 5. State Management

### 5.1 GlobalPlayerContext

```ts
interface State {
  feed: Song[]
  idx: number
  isOwner: boolean
  ownerAvatarUrl: string | null
  ownerName: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}
```

- `view-song`/`play-song` 이벤트로 LOAD action 트리거
- 동일 곡(id) 재진입 시 LOAD 무시 (재생 위치 유지)
- audio 요소는 Provider 내부 ref로 단일 인스턴스 보장

### 5.2 useAuth (AuthProvider)

- `user`, `signOut()` 노출
- Supabase Auth state change 구독 → user 갱신

### 5.3 useSongGeneration

- `status: 'idle' | 'generating' | 'done' | 'error'`
- `elapsed` 카운터 (1초 단위)
- 시작 시: `dispatchEvent('song-generating', detail: { title, prompt, genre, mood, instrumental })`
- 완료 시: `songService.save()` + `dispatchEvent('song-updated')`

### 5.4 Local 컴포넌트 State

- `ProfilePanel`: `avatarUrl`, `coverUrl`, `uploading: 'avatar'|'cover'|null`, `following`
- `MyWorkPanel`: `songs`, `pendingSong`, `ownerAvatarUrl`, `editing`, `deleting`, `collecting`, `publishing`, `unpublishing`
- `HomeLayout`: `activeSection`, `prevSection`, `profileUsername`, `drawerOpen`, `loginOpen`, `userMenuOpen`, `onboardingOpen`, `headerAvatarUrl`, `headerDisplayName`

---

## 6. Event Bus (window.dispatchEvent)

| Event | Detail | Producer | Consumer |
|-------|--------|----------|----------|
| `song-generating` | `{ title, prompt, genre, mood, instrumental }` | `useSongGeneration` | `MyWorkPanel` (PendingSongItem 표시) |
| `song-updated` | — | `useSongGeneration`, `songService.update/delete` | `MyWorkPanel` (목록 재조회) |
| `view-song` | `{ feed, idx, isOwner, ownerAvatarUrl, ownerName }` | `MyWorkPanel`, `ProfilePanel`, `ExplorePanel`, `GlobalMiniBar` | `GlobalPlayerContext`, `HomeLayout` (section 전환) |
| `play-song` | `{ feed, idx, isOwner, ownerAvatarUrl, ownerName }` | `MyWorkPanel` 썸네일 클릭 | `GlobalPlayerContext` |
| `view-profile` | `username: string` | 헤더 사용자 메뉴, 곡 작성자 클릭 | `HomeLayout` (navigate to profile) |
| `profile-avatar-updated` | `url: string \| null` | `ProfilePanel` (업로드/삭제 후) | `HomeLayout` 헤더, `MyWorkPanel` |
| `open-login` | — | 미로그인 액션 trap | `HomeLayout` → `setLoginOpen(true)` |
| `collection-updated` | — | `collectionService.*` | `MyCollectionPanel`, `MyWorkPanel` |

---

## 7. UI Component Map

```
app/
  layout.tsx                       — root layout (AuthProvider, GlobalPlayerProvider)
  HomeLayout.tsx                   — 메인 셸 (헤더/사이드/센터/미니바/모달)
  page.tsx                         — / (create)
  library/page.tsx                 — /library (archive)
  explore/page.tsx                 — /explore
  profile/[username]/page.tsx      — /profile/[username]
  notifications/page.tsx           — /notifications
  archive/page.tsx                 — /archive → /library 리다이렉트
  api/generate/route.ts            — MiniMax 병렬 호출
  api/check-username/route.ts      — 아이디 중복검사
  auth/callback/route.ts           — OAuth 콜백

components/
  AuthProvider.tsx                 — Supabase Auth 컨텍스트
  LoginModal.tsx                   — Google/Kakao/Apple/Email
  OnboardingModal.tsx              — 4단계 온보딩
  SongDetailPage.tsx               — 곡 상세 (오너 아바타·이름·팔로우)
  SongDetailSheet.tsx              — 곡 상세 시트 (모바일)
  SongCard.tsx                     — 공통 곡 카드
  GlobalMiniBar.tsx                — 미니 플레이어 (제목 + 아티스트명)
  SongEditModal.tsx, CollectionPickerModal, PublishModal

contexts/
  GlobalPlayerContext.tsx          — 전역 플레이어 reducer + audio 단일 인스턴스

features/
  song/components/
    SongForm.tsx                   — 생성 폼
    MyWorkPanel.tsx                — 내 음악 (SongWorkItem + PendingSongItem)
    MyCollectionPanel.tsx          — 컬렉션
    SongResult.tsx                 — 생성 결과 카드 (legacy)
    PublishModal.tsx               — 공개/게시 모달
    GenreSelector, MoodSelector
  song/hooks/useSongGeneration.ts  — 생성 훅
  explore/components/
    ExplorePanel.tsx               — 탐색
    ProfilePanel.tsx               — 프로필 (아바타+이름+커버 통합)
    PublicSongCard.tsx             — 공개곡 카드

lib/supabase/
  client.ts                        — createClient() (브라우저)
  server.ts                        — 서버 컴포넌트 / route handler용 클라이언트

services/
  minimax.service.ts               — MiniMax API
  storage.service.ts               — Supabase Storage 업로드 헬퍼 (songs/covers)
  song.service.ts                  — LocalStorage 곡 (Phase 3 이전 예정)
  collection.service.ts            — LocalStorage 컬렉션
  explore.service.ts               — mock 탐색 데이터

types/domain.ts                    — Song / UserProfile / PublicSong
```

---

## 8. Test Plan (수동 QA 체크리스트)

### 8.1 인증·온보딩
- [ ] 새 계정 Google 로그인 → 온보딩 4단계 표시
- [ ] Kakao 로그인 → 온보딩 표시
- [ ] 아이디 중복검사 — 사용 중일 때 빨강 메시지
- [ ] 아이디 유효성 — 영문 소문자/숫자/`.`/`_` 외 문자 거부
- [ ] 온보딩 완료 → 새로고침해도 재표시 안 됨
- [ ] 헤더 메뉴 사용자 이름·이메일이 정확

### 8.2 프로필 이미지
- [ ] 아바타 업로드(jpg/png) → WebP로 저장, 즉시 표시
- [ ] 아바타 변경 → 헤더/미니바/곡상세 동시 반영
- [ ] 아바타 삭제 → 첫 글자 이니셜 폴백
- [ ] 커버 업로드 → 그라데이션 폴백 대체
- [ ] 호버 시 카메라/휴지통 오버레이 표시 (커버/아바타 독립)

### 8.3 음악 생성
- [ ] 텍스트 → music-2.6-free 생성 (약 1분)
- [ ] 생성 중 PendingSongItem 즉시 표시, 썸네일 스피너
- [ ] 음원 업로드 → music-cover-free 커버 생성
- [ ] 보컬 성별 적용 (lyrics에서 확인)
- [ ] 가사 비움 → 인스트루멘탈 처리
- [ ] 커버 이미지 첨부됨

### 8.4 라우팅·내비
- [ ] 사이드바 클릭 → URL 변경 + 정상 진입
- [ ] 브라우저 뒤로/앞으로 정상 동작
- [ ] /profile/[username] 직접 진입
- [ ] 새로고침 시 동일 페이지 유지
- [ ] 곡 상세는 URL 변경 없음 (overlay)

### 8.5 로그아웃
- [ ] 로그아웃 즉시 곡/컬렉션/아바타/이름 클리어
- [ ] LocalStorage 항목 제거 확인

---

## 9. Risks & Mitigations

| 위험 | 영향 | 대응 |
|------|-----|------|
| MiniMax API URL 24시간 만료 | 음악·이미지 깨짐 | Phase 3에서 Supabase Storage 영속화 |
| `user_metadata` 캐시 지연 | 온보딩 직후 표시 불일치 | 화면 리프레시 + `auth.updateUser` 즉시 호출 |
| 프로필 이미지 동기화 누락 | 영역별 아바타 불일치 | `profile-avatar-updated` 이벤트 + 모든 영역 구독 |
| 이름 충돌 (Google 계정 이름) | 온보딩 이름이 적용 안 됨 | `auth.updateUser({ full_name })`로 덮어쓰기 |
| 커버 이미지 생성 실패 | 곡에 이미지 없음 | `coverHue` 그라데이션 폴백 |
| RLS 미설정 | 다른 사용자 프로필 수정 가능 | Supabase RLS — `auth.uid() = id` 정책 필수 |
| 페이지 직접 진입 시 권한 | /profile/me 접근 등 | `isSelf` 판별 + 조회는 공개, 편집은 isSelf만 |

---

## 10. Phase 3 Forward Compatibility

이번 Design은 Phase 3(Supabase songs DB)로의 확장을 다음과 같이 보장:

- `songService` 인터페이스(`save`/`getAll`/`update`/`delete`) 유지 → 내부만 Supabase로 교체 가능
- `Song` 타입의 `audioUrl`/`coverImage`는 URL 문자열로 추상화 → Storage URL로 교체 자유
- 이벤트 버스(`song-updated`)는 백엔드 무관하게 그대로 사용
- `useSongGeneration`은 결과를 `songService.save()`에 위임 → DB 저장 로직은 service 내부에 캡슐화

---

## 11. Implementation Guide

### 11.1 구현 순서 (회고)

1. ✅ MiniMax API 연동 + 모델 선택
2. ✅ 커버 이미지 병렬 생성 + Song 타입 확장
3. ✅ Supabase Auth + 소셜 로그인 모달
4. ✅ 4단계 온보딩 모달 + profiles 테이블
5. ✅ profiles → auth.user_metadata 동기화
6. ✅ Supabase Storage + WebP 변환 + 아바타/커버 업로드
7. ✅ 이벤트 버스 기반 아바타 실시간 동기화
8. ✅ 페이지별 URL 라우팅 (`/library`, `/explore`, `/profile/[username]`)
9. ✅ 로그아웃 시 LocalStorage + UI 클리어
10. ✅ 프로필 패널 디자인 통합 (아바타+이름+커버, 6색 팔레트)
11. ✅ 생성 중 즉시 정보 표시 (PendingSongItem) + 썸네일 스피너
12. ✅ GlobalMiniBar 아티스트 이름 + ownerName context 전파
13. ✅ `/api/generate` MiniMax 결과 → Supabase Storage(`songs-audio`/`songs-covers`) 영속 저장

### 11.2 다음 단계 (Phase 3 예고)

1. Supabase `songs` 테이블 + RLS 정책
2. `songService` Supabase 재작성 (LocalStorage 제거)
3. LocalStorage → Supabase 1회 마이그레이션 헬퍼
4. `collections` 테이블 연동
5. music-cover 유료 모델 구독자 잠금 (플랜 체계 도입)

### 11.3 Session Guide (Phase 3 구현 시)

| Module | Scope | 예상 변경 |
|--------|-------|----------|
| `module-songs-schema` | Supabase migration: `songs` 테이블 + RLS | SQL only |
| `module-song-service` | `songService` Supabase 재작성 | song.service.ts, 호출처 |
| `module-migration` | LocalStorage → Supabase 1회 이전 헬퍼 | 새 파일 |
| `module-collections` | `collections` 테이블 연동 | collection.service.ts |
| `module-plan-lock` | music-cover 유료 모델 구독자 잠금 | SongForm.tsx, profiles 컬럼 추가 |

사용 예: `/pdca do today-song-mvp --scope module-songs-schema,module-song-service`

---

## 12. Addendum — Phase 3·4 진화 (2026-05-22 ~ 2026-06-02)

본 섹션은 2026-05-21 본 문서 작성 이후 추가된 아키텍처·데이터 모델·이벤트·UI 패턴을 모은 부록. 각 항목의 상세 plan/design은 별도 문서 참조.

### 12.1 Phase 3 — Supabase 곡 DB·Storage·백그라운드 생성

- `songs` 테이블 마이그레이션 완료 (id·user_id·title·prompt·genre·mood·lyrics·audio_url·cover_image·duration·is_public·created_at·status·model·like_count·play_count·comment_count·publish_comment·published_at)
- `songService` 재작성: `cache` 모듈 변수 + `loaded`/`inflightLoad` 플래그 + `getAll()` 동기 반환 + `setSongOwner(userId)` 진입 + `isLoaded()` 노출
- MiniMax 24h URL → Supabase Storage `songs/{userId}/{songId}.{ext}` 영속화
- **백그라운드 생성** (Suno parity, 마이그레이션 011): `/api/generate`가 status=generating으로 INSERT → 즉시 응답 → Next.js `after()`로 MiniMax+Storage 처리 → UPDATE(done|failed)
- `SongRealtimeBridge` 컴포넌트: Supabase Realtime UPDATE 구독 → 캐시 patch + "곡 완성" 토스트. **payload.old엔 PK만** 오므로 캐시의 이전 status를 기준 비교 (함정)
- 좀비 generating row cleanup (10분 timeout, cron 통합 — Hobby 한도 2개·daily)

### 12.2 알림·좋아요·팔로우 (마이그레이션 010, social-actions feature)

- `notifications` 테이블 5종 타입(`like`/`song_complete`/`system`/`follow`/`comment`) + RLS + Vercel Cron daily 정리(KST 03:00, 90일+)
- `like` 알림 dedupe: UNIQUE INDEX (영구 — 한 번 받으면 다시 안 옴)
- `follow` 알림 폭주 차단: 미읽음 dedupe + unfollow 시 미읽음 DELETE
- API: POST `/api/songs/[id]/like`, POST `/api/profiles/[id]/follow` (둘 다 토글 + 알림 INSERT)
- `useOptimisticToggle` 헬퍼 — 4 컴포넌트 통일 (낙관적 UI + 롤백 + inflight 차단 + guard 콜백)
- `fillIsLiked` 후처리로 N+1 회피 (4개 메서드 통합)
- 알림 UI: 데스크톱 사이드바 옆 400px 오버레이 / 모바일 `/notifications` 풀페이지

### 12.3 AI 가사 생성 + 심플 모드 (2026-05-29, 마이그레이션 013)

- MiniMax **전용** `lyrics_generation` 엔드포인트 (크레딧 미소모, 15초 + 1분 2회 레이트리밋 — `profiles.last_lyrics_gen_at`/`prev_lyrics_gen_at` 2컬럼 게이팅)
- 14종 구조 태그 포함 가사 + style_tags + song_title 반환
- 어드밴스드 가사 섹션 "AI 가사" 버튼 → 팝업 → textarea 교체 + 제목 자동 채움
- **심플 모드**: 토글로 mode 분기, localStorage 마지막 모드 복원. 자동작사(`autoLyrics`) + 모델 자동(보컬→2.0, 인스트→2.6)
- 효과음/지문 sanitize: 14종 구조 태그 외 **대괄호 단독 라인만** 제거 (괄호 보컬 애드립은 유지)

### 12.4 댓글 시스템 (2026-05-31 ~ 2026-06-01, 마이그레이션 014/015/016/017)

상세는 `docs/02-design/features/comments.design.md` 참조.

- 3테이블: `comments`·`comment_likes`·`comment_reports`
- 1단계 대댓글 DB 트리거 (`enforce_comment_depth`)
- 카운트 트리거 둘 다 `SECURITY DEFINER` (다른 사용자 row UPDATE 시 RLS 우회 — 함정)
- `songs.comment_count` 컬럼 + top-level 전용 동기화 트리거 (017)
- API: 6 핸들러 (GET/POST list, PATCH/DELETE, reply, like, report — 23505 멱등)
- 컴포넌트: EmojiHotkeyBar, CommentReportModal(8 사유), CommentItem(인라인 하트·게시자 배지·더보기/접기·인라인 편집/답글), CommentsPanel(이모지+500자+카운트)
- 알림 통합: `type='comment'` + `payload.kind`('comment'|'reply') 분기
- SongDetailPage: 데스크톱 가사·댓글 좌우 / 모바일 `[가사|댓글]` 토글
- 좋아요 아이콘 변경: Thumb-Up → 인라인 하트 SVG(빨강 fill)
- `song-comment-count-changed` 커스텀 이벤트로 카운트 실시간 동기화

### 12.5 ⋮ 메뉴 통합 (2026-06-01)

- 행 최종 구성: 재생수·좋아요·댓글·공유·(게시됨 pill: 리스트만)·⋮
- ⋮ 안 항목: 비소유자→컬렉션 / 소유자→컬렉션·게시하기/취소·저장(상세만)·편집·삭제
- 컬렉션 active 시 `text-violet-400` + violet 필터
- SongDetailPage: `OwnerMenu` → `SongMoreMenu`로 일반화 (모든 사용자에게 ⋮ 노출)
- MyWorkPanel: 기존 `MoreMenu`에 컬렉션 항목 추가, 생성중/실패는 컬렉션 비활성
- 게시됨 pill 위치 정책: 리스트 유지(여러 곡 훑을 때 가치), 상세 제거(단일 곡이라 중복 — OwnerMenu의 "게시 취소"로 대체)

### 12.6 SEO + 검색 등록 (2026-06-01)

- `app/layout.tsx` metadata 풍부화:
  - `metadataBase`, `alternates.canonical: '/'`
  - `title.template: '%s · 모두의 노래'`, `SITE_TAGLINE = 'AI 음악 크리에이티브 플랫폼'`
  - openGraph(ko_KR·images 1200×630), twitter(summary_large_image), keywords, authors
  - robots.googleBot 'max-image-preview':'large'
  - verification: env `GOOGLE_SITE_VERIFICATION`·`NAVER_SITE_VERIFICATION` (HTML 태그 fallback)
- JSON-LD `@graph` inline `<script type="application/ld+json">`:
  - `Organization` (logo `ImageObject{ url, width:512, height:512 }`)
  - `WebSite` (publisher → Organization)
  - `WebApplication` (`MultimediaApplication`, `Offer price:0 KRW`)
- `app/robots.ts`: `*` allow `/`, disallow `/api/`·`/auth/`·`/archive/`·`/notifications/`
- `app/sitemap.ts` (정적): `/`(1.0 daily), `/explore`(0.8 daily), `/terms`·`/privacy`·`/policy`(0.3 monthly)
- 공개 곡 sitemap 의도적 제외 — `?song={id}` 쿼리는 SSR 동일 콘텐츠 → duplicate content 위험
- Google Search Console: 도메인 속성 + DNS TXT verify 완료
- Naver Search Advisor: HTML 파일 verify 완료 (`/public/naver*.html`)
- **Vercel Primary swap** (함정): 기존 www가 Primary였고 non-www는 307 임시 리다이렉트 → Naver 봇이 307 안 따라가 verify 실패. **non-www를 Production / www는 308 Permanent Redirect로 swap** + canonical과 일치

### 12.7 Skeleton 로딩 UI (2026-06-01)

- 공통: `bg-white/[0.04] shimmer` 클래스 (globals.css 기존 shimmer 키프레임 활용)
- `MyWorkPanel`: `songService.isLoaded()` derive → loading state. 6개 `SongWorkItemSkeleton` (썸네일+제목+프롬프트+⋮+액션 알약4)
- `ExplorePanel`:
  - 메인: 2개 `SectionCarouselSkeleton` (라벨 유지 + 8 카드 가로)
  - AllView: `GridSkeleton` 12 (auto-fill,minmax 150·200 grid)
- `ProfilePanel`: `ProfilePanelSkeleton` (커버 + 아바타·이름 + 스탯 + 그리드 8)
- 의도: 텍스트 "불러오는 중…" / 빈 상태 플래시 제거, 콘텐츠 점프 방지

### 12.8 UX 폴리시 모음

- 곡 표면 댓글 카운트 칩(chat.svg + count): SongDetailPage·MyWorkPanel·PublicSongCard·ProfileSongThumb (좋아요 다음 위치)
- 모델 설명 한국어화 (Music 2.0/2.5+/2.6 desc 사용자 친화 문구로)
- 게시됨 pill 호버 모핑 (grid 0fr↔1fr "게시됨↔게시 삭제" 폭 모핑 + 아이콘 360° 회전)
- 내 음악 필터 칩(전체/좋아요/게시) + 검색(통합 부분일치), 모바일은 검색 아이콘→폭 모핑 오버레이
- 사이드바 "더보기" 메뉴(More-3) — 약관·정책·문의

### 12.9 탐색 hero + Aurora + 장르 사전 확장 (2026-06-02)

- `features/explore/components/ExploreHero.tsx`: Suno 스타일 글래스모피즘 입력 박스. textarea auto-grow(2→4줄 cap), 19 장르별 placeholder + 10 타이틀 랜덤. 비로그인 → open-login / 로그인 → sessionStorage prefill·autosubmit → `/` 이동
- `SongForm`: mount 시 prefill 소비, `pendingAutoSubmit` state로 user·prefill 준비되면 즉시 generate
- `features/explore/components/AuroraBackground.tsx`: 페이지 fixed 그라데이션 배경. globals.css의 `.aurora-layer` 클래스(repeating-linear-gradient blue·indigo·violet + mix-blend-difference + 150s) 재사용. 좌측 사이드바 영역 제외(`md:left-60`) + mask로 상단 30%만 노출
- `AnimatedGradientBackground` 재작성: 기존 rAF radial breathing 제거 → `.aurora-layer absolute` 사용. MyWorkPanel 빈 상태도 동일 톤(탭까지 덮음), FloatingDots 제거
- `utils/extractTags.ts`: 12 → 19 라벨 + 기타 fallback. K-pop 독립, 트로트·레게·가스펠·라틴·동요·디스코 신규, R&B에 soul/소울. `extractGenre` 반환 타입 `string | null` → `string`. 사전 순서 = 특화 먼저 → 일반 (substring 충돌 회피)
- 마이그레이션 018(`018_reinfer_genre.sql`): TS pickFirst와 동일한 CASE WHEN ILIKE 순서로 기존 곡 일괄 재추론
- cron `/api/cron/backfill-tags?force=1` 옵션 추가 — 전체 재평가 모드

### 12.10 곡 커버 이미지 WebP + Storage (2026-06-02, 마이그레이션 019)

- **문제**: 사용자 편집·게시 시 base64 data URL이 `songs.cover_image` TEXT 컬럼에 통째로 저장 → Postgres statement timeout 폭주
- **`utils/imageUpload.ts`** 신규: `toWebp(file, maxPx=800, quality=0.85)` + `uploadSongCover(userId, songId, file, variant)`. Storage `songs-covers/{userId}/{songId}-{cover|publish}.webp` 경로
- `SongEditModal`·`PublishModal`: FileReader 폐기, objectURL 프리뷰 + 저장 시점 Storage 업로드 (트랜잭션 안전, 색상 선택 시 pendingFile 클리어)
- 마이그레이션 019(`019_songs_publish_cover_image.sql`): `ALTER TABLE songs ADD COLUMN publish_cover_image text`
- `song.service.ts` DbSong/rowToSong/songToRow/patchToRow에 매핑 추가
- `explore.service.ts` SONG_SELECT에 추가 + `coverImage = publish_cover_image ?? cover_image` 우선 노출
- `types/domain.ts` PublicSong에 `publishCoverImage` 필드
- WebP 효과: 200KB → 30~60KB (3~5배 축소), DB가 아닌 Storage라 쿼리 부하 0
- **운영 액션 (2026-06-02 완료)**: 019 SQL 적용, base64 cover_image NULL UPDATE, Storage RLS 정책 추가

### 12.11 Unlisted 공유 모델 (2026-06-02)

- 기존: 비공개 곡은 공유 링크 받아도 RLS에 막혀 접근 불가
- 변경: Suno·YouTube Unlisted 패턴 — 게시 안 한 곡도 링크 받은 사람이 접근 가능. 게시는 "탐색·프로필 공식 노출" 의미로 분리
- `app/api/songs/[id]/share/route.ts` 신규: service_role로 by-id 조회 (RLS 우회). `generating`/`failed`는 404. UUID v4 추측 불가가 보안 모델
- `exploreService.getShareSongById` 신규: 위 API 호출 + `fillIsLiked`
- `app/(main)/layout.tsx` 딥링크 핸들러: `getPublicSongById` → `getShareSongById` 교체
- 탐색·프로필 list는 무변경 (여전히 `is_public=true` 필터)
- 다음: `/song/[id]` 전용 라우트 + `generateMetadata`로 카톡·페북 공유 시 곡 커버 OG 미리보기 (2026-06-03 예정)

### 12.12 새 함정 (관련 메모 [[feedback-code-pitfalls]] 동기화)

본 단계에서 누적된 함정 — Plan/Design 시 반드시 참고:

1. **SONG_SELECT 누락** — public 뷰에서 컬럼 조용히 사라짐 (`is_public`, `comment_count`, `publish_comment` 미포함 시 `published`/`commentCount` undefined로 나옴)
2. **트리거 SECURITY DEFINER** — 다른 사용자 row UPDATE 트리거(좋아요·팔로우·댓글 카운트)는 반드시 정의자 권한
3. **Realtime payload.old엔 PK만** — UPDATE 이벤트의 이전 상태는 클라이언트 캐시에서 가져와야 함
4. **rowToPatch 필드 미러링** — 생성 후 바뀌는 모든 필드(audio·status·duration·title·cover 등)를 미러링
5. **Apple Team ID B/8 혼동** — `Y5K8ACM8PL`은 B 아니라 8
6. **Naver=Email 프로바이더** — Supabase Custom Provider 불가, 자체 API 라우트 + magic link
7. **Vercel webhook 권한** — GitHub App 권한 업데이트 대기 시 자동 배포 끊김
8. **Vercel 307 vs 308 SEO 함정** — Primary 아닌 도메인의 307 임시 리다이렉트를 Naver 봇이 안 따라감. canonical과 Primary 방향 일치 필수
9. **마이그레이션 수동 적용 drift** — Supabase MCP 권한 부족으로 `*.sql`은 수동 SQL Editor 적용 → repo 파일과 원격 drift 가능
