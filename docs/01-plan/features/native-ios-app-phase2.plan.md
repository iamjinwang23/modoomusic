# MONO 네이티브 앱 — Phase 2 (핵심 루프) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans. 스텝은 체크박스(`- [ ]`).

**Goal:** 앱에서 음악 생성 → 라이브러리(내 곡) → 재생(백그라운드·잠금화면)의 핵심 루프를 네이티브로 완성한다.

**Architecture:** 신규 BFF 읽기 엔드포인트(`GET /api/songs/mine`·`/api/songs/[id]`)로 곡 데이터를 REST화(웹은 client supabase 직접쿼리 → RN은 BFF). 생성은 기존 `/api/generate` 재사용 + Supabase realtime로 상태 구독. 재생은 `react-native-track-player`(백그라운드 오디오·제어센터).

**Tech Stack:** Next.js API(BFF), `@mono/shared`, `react-native-track-player`, `@supabase/supabase-js` realtime, Expo dev build(네이티브, CocoaPods 셋업됨).

> **선행:** Phase 1 완료(브랜치 `feat/monorepo-phase1`). 네이티브 빌드 가능(`npm run ios` = expo run:ios, PATH에 `/opt/homebrew/bin`). 웹 dev(`npm run dev -w web`)로 API 제공.
> **설계:** [[native-ios-app.design]] §5(생성·재생)·§11(Phase2). 엔드포인트 갭: [[native-ios-app-endpoint-inventory]].

## Global Constraints

- **BFF 재사용**: 신규 엔드포인트는 **기존 서비스/쿼리 로직 재사용**(웹 client 쿼리를 서버 route로 노출). 로직 중복 금지.
- **인증**: BFF Bearer 경로(Phase1 T6) — `createUserClient`가 토큰→user 컨텍스트. RLS 그대로 적용.
- **응답 셰이프**: `@mono/shared`의 `Song` 타입에 맞춤(웹/앱 계약 단일화). row→Song 매핑은 웹 `song.service`의 것 재사용/이전.
- **재생 라이브러리**: `react-native-track-player`(백그라운드·락스크린). Expo config plugin 등록 필수.
- **네이티브 빌드**: track-player 추가 후 **재-prebuild + 네이티브 재빌드** 필요(`npm run ios`). PATH에 homebrew.
- **크레딧**: 생성은 기존 서버 `tryConsumeCredits` 그대로. 앱 IAP는 Phase3(이번 범위 아님).

---

## Task 1: BFF — `GET /api/songs/mine` (내 곡 리스트)

**Files:**
- Create: `apps/web/app/api/songs/mine/route.ts`
- Reference: `apps/web/services/song.service.ts`(row→Song 매핑·쿼리), `packages/shared/src/domain`(Song)

**Interfaces:**
- Produces: `GET /api/songs/mine` → `{ songs: Song[] }`. 인증 유저의 곡을 `created_at desc`로. 미인증 401.

- [ ] **Step 1: 서버용 곡 조회 함수 확인/추출**

Run: `sed -n '120,160p' apps/web/services/song.service.ts`
Expected: `loadFromSupabase`의 `.from('songs').select('*').eq('user_id', …)` 쿼리 + row→Song 매핑 파악. 매핑 함수가 client 전용이면 서버 재사용 가능하게 순수 함수로 분리(`rowToSong`).

- [ ] **Step 2: 라우트 작성**

`apps/web/app/api/songs/mine/route.ts`:
```ts
// GET /api/songs/mine — 인증 유저의 곡 리스트(RN 라이브러리). 웹은 client supabase 직접쿼리라 앱용 REST 신설.
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listMySongs } from '@/services/song-query.service'

export async function GET() {
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const songs = await listMySongs(client, user.id)
  return NextResponse.json({ songs })
}
```

- [ ] **Step 3: 서버 쿼리 서비스 작성(기존 매핑 재사용)**

`apps/web/services/song-query.service.ts` — `listMySongs(client, userId)`: `client.from('songs').select('*').eq('user_id', userId).order('created_at', { ascending: false })` → `rowToSong` 매핑해 `Song[]` 반환. `rowToSong`은 song.service에서 추출(중복 금지).

- [ ] **Step 4: 검증(웹 dev + curl, 인증)**

웹 dev 실행 중 가정. Bearer 토큰 없는 호출은 401. (토큰 검증은 Task 4 앱 연동에서 실증)
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/songs/mine`
Expected: `401`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/songs/mine/route.ts apps/web/services/song-query.service.ts apps/web/services/song.service.ts
git commit -m "feat(bff): GET /api/songs/mine — 내 곡 리스트(row→Song 재사용) (Phase2 T1)"
```

---

## Task 2: BFF — `GET /api/songs/[id]` (곡 상세)

**Files:**
- Create: `apps/web/app/api/songs/[id]/route.ts`
- Reference: `apps/web/services/song-query.service.ts`(Task 1)

**Interfaces:**
- Consumes: `rowToSong`/`song-query.service`(T1).
- Produces: `GET /api/songs/[id]` → `{ song: Song }` 또는 404. 공개곡/본인곡 접근 규칙은 기존 RLS·published 기준 따름.

- [ ] **Step 1: 라우트 작성**

`apps/web/app/api/songs/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getSongById } from '@/services/song-query.service'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  const song = await getSongById(client, id, user?.id)
  if (!song) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ song })
}
```
> **주의:** 이 경로에 이미 하위 라우트(`/like`·`/comments` 등)가 있으나 `route.ts`(상세 GET)는 없음 → 신설. AGENTS.md대로 필요 시 `node_modules/next/dist/docs/` 확인.

- [ ] **Step 2: `getSongById` 작성**

`song-query.service.ts`에 추가: `getSongById(client, id, userId?)` — `client.from('songs').select('*').eq('id', id).maybeSingle()` → 없으면 null, 있으면 `rowToSong`. (RLS가 공개/본인 접근 통제)

- [ ] **Step 3: 검증**

Run: `curl -s "http://localhost:3000/api/songs/00000000-0000-0000-0000-000000000000" -o /dev/null -w "%{http_code}\n"`
Expected: `404`(없는 id).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/songs
git commit -m "feat(bff): GET /api/songs/[id] — 곡 상세 (Phase2 T2)"
```

---

## Task 3: RN — 라이브러리 화면 (내 곡)

**Files:**
- Modify: `apps/mobile/src/app/index.tsx`(홈 → 라이브러리로) 또는 신규 탭. Create: `apps/mobile/src/components/song-row.tsx`
- Reference: `apps/mobile/src/lib/api.ts`

**Interfaces:**
- Consumes: `api`(Phase1), `GET /api/songs/mine`(T1), `Song`(@mono/shared).
- Produces: 내 곡 리스트 UI(커버·제목·상태). 탭 시 재생(Task 5)·상세(Task 6) 연결 지점.

- [ ] **Step 1: song-row 컴포넌트**

`apps/mobile/src/components/song-row.tsx` — `Song`을 받아 커버(expo-image)·제목·상태(생성중/완료) 렌더, `onPress`. 다크 테마 inline style.

- [ ] **Step 2: 라이브러리 화면에서 fetch**

홈(`index.tsx`)을 라이브러리로 전환: `api.get('/api/songs/mine')` → `Song[]` FlatList. 로그인 필요(미로그인은 Phase1 게스트/로그인). 로딩·빈상태 처리.

- [ ] **Step 3: 타입체크 + 번들 검증**

Run: `npx tsc --noEmit -p apps/mobile/tsconfig.json`
Expected: 통과. 시뮬레이터에서 로그인 후 내 곡 목록 렌더(스크린샷).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): 라이브러리 화면 — 내 곡 리스트(GET /api/songs/mine) (Phase2 T3)"
```

---

## Task 4: RN — track-player 셋업 (백그라운드 오디오)

**Files:**
- Modify: `apps/mobile/package.json`(react-native-track-player), `apps/mobile/app.json`(config plugin), `apps/mobile/index.js` 또는 등록 포인트
- Create: `apps/mobile/src/lib/player.ts`(TrackPlayer setup·서비스)

**Interfaces:**
- Produces: `setupPlayer()`·`playSong(song)` — track-player 초기화 + 곡 재생. 백그라운드·제어센터 지원.

- [ ] **Step 1: 설치 + config plugin**

Run: `npx expo install react-native-track-player`
`app.json` plugins에 track-player 등록(문서 기준). `playback-service` 등록(`TrackPlayer.registerPlaybackService`).

- [ ] **Step 2: player.ts**

`setupPlayer()`(1회 init, capabilities: play/pause/skip), `playSong(song: Song)`(`TrackPlayer.reset()` + `add({ id, url: song.audioUrl, title, artwork: song.coverImage })` + `play()`).

- [ ] **Step 3: 네이티브 재빌드(커스텀 네이티브 모듈)**

Run: `PATH="/opt/homebrew/bin:$PATH" npm run ios`
Expected: prebuild(track-player pod 포함) + pod install + Build Succeeded. 시뮬레이터 실행.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): react-native-track-player 셋업(백그라운드 오디오) (Phase2 T4)"
```

---

## Task 5: RN — 재생 연동 + 미니 플레이어

**Files:**
- Create: `apps/mobile/src/components/mini-player.tsx`
- Modify: 라이브러리 song-row `onPress` → `playSong`, `_layout`에 미니플레이어 마운트

**Interfaces:**
- Consumes: `playSong`(T4), track-player 상태 훅(`useProgress`·`usePlaybackState`).
- Produces: 곡 탭 → 재생 + 하단 미니 플레이어(제목·재생/일시정지). 시뮬레이터에서 실제 오디오 재생 검증.

- [ ] **Step 1: 미니 플레이어**

`mini-player.tsx` — 현재 트랙(`useActiveTrack`)·재생상태(`usePlaybackState`) 표시, play/pause 버튼. 트랙 없으면 숨김.

- [ ] **Step 2: song-row → 재생**

라이브러리에서 완료(status done) 곡 탭 시 `playSong(song)`.

- [ ] **Step 3: 검증(실제 재생)**

시뮬레이터 로그인 → 완료곡 탭 → 오디오 재생 + 미니플레이어 표시(스크린샷). 백그라운드(앱 나가도 재생 유지) 확인.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): 곡 재생 + 미니 플레이어(track-player) (Phase2 T5)"
```

---

## Task 6: RN — 음악 생성 흐름

**Files:**
- Create: `apps/mobile/src/app/create.tsx`(생성 화면), `apps/mobile/src/lib/song-realtime.ts`(상태 구독)
- Reference: `/api/generate`(기존)

**Interfaces:**
- Consumes: `api.post('/api/generate', …)`, Supabase realtime(songs 테이블 구독).
- Produces: 프롬프트/가사 입력 → 생성 요청(크레딧 서버차감) → realtime로 진행상태 → 완료 시 라이브러리 갱신.

- [ ] **Step 1: generate 요청 계약 확인**

Run: `sed -n '1,80p' apps/web/app/api/generate/route.ts`
Expected: 요청 바디(프롬프트·가사·모델·instrumental 등)·응답·상태 전이(생성중→완료) 파악. 앱 요청 셰이프 맞춤.

- [ ] **Step 2: 생성 화면**

`create.tsx` — 프롬프트·(선택)가사·모델 입력 + "만들기" → `api.post('/api/generate', body)`. 생성중 UI.

- [ ] **Step 3: realtime 상태 구독**

`song-realtime.ts` — `supabase.channel().on('postgres_changes', { table: 'songs', filter: user }, …)`로 상태 변화 수신(웹 `SongRealtimeBridge` 패턴 이식). 완료 시 라이브러리 refetch.

- [ ] **Step 4: 검증**

⚠️ 실제 생성은 **크레딧 차감·MiniMax 호출**(실비용). MOCK_MODE 있으면 활용. 시뮬레이터에서 생성 요청→상태 전이→완료곡 라이브러리 표시 확인(가능하면 목).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): 음악 생성 흐름 + realtime 상태 구독 (Phase2 T6)"
```

---

## Self-Review

- **Spec 커버리지(설계 §5·§11 Phase2):** 생성=T6, 재생(track-player·미니플레이어)=T4·T5, 라이브러리=T3, 엔드포인트 갭(songs/mine·songs/[id])=T1·T2.
- **플레이스홀더:** BFF 라우트·player 셋업은 실제 코드/명령. 웹 서비스 재사용 지점 명시(rowToSong 추출).
- **타입 일관성:** `Song`(@mono/shared) 응답 셰이프 통일. `song-query.service`(listMySongs·getSongById·rowToSong) T1→T2 재사용. `playSong`(T4)→T5 소비.
- **미검증 리스크:** 실제 음악 생성은 크레딧·외부 API 비용 → MOCK 우선. track-player 백그라운드는 네이티브 빌드 후 실기 확인.
