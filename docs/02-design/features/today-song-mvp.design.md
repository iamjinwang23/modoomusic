# today-song-mvp Design Document

> **Summary**: MiniMax Music/Image API + Supabase Auth/Storage 기반 풀 파이프라인 — 음악·커버 생성, 소셜 OAuth, 4단계 온보딩, 프로필 이미지 시스템, 페이지별 라우팅, 생성 중 즉시 정보 표시 UX
>
> **Project**: 오늘의 노래 (MONO)
> **Version**: 0.2.0
> **Author**: jinwang
> **Date**: 2026-05-21
> **Status**: Implemented (Phase 1·2)
> **Planning Doc**: [today-song-mvp.plan.md](../../01-plan/features/today-song-mvp.plan.md)

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
