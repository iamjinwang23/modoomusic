# MONO (모두의 노래) — 온보딩 가이드

AI 음악 생성 SNS. Next.js 15 App Router + Supabase + MiniMax API. Vercel에 배포.

- 운영: 주식회사 비누컴퍼니 / 1차 Free Only 정책
- 배포: https://modoomusic.vercel.app
- GitHub: https://github.com/iamjinwang23/modoomusic
- Supabase ref: `bckbcbrmnztfwmtldkly`

## 빠른 실행

```bash
pnpm install
pnpm dev    # http://localhost:3000
pnpm build  # 프로덕션 빌드 (tsc 통과 필수)
```

`.env.local`에 필요한 키:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MINIMAX_API_KEY=
MINIMAX_GROUP_ID=
```

## 이건 평범한 Next.js가 아니다

`AGENTS.md`가 짧고 강하게 경고함 — Next 15의 API/관례가 기존 지식과 다를 수 있음. 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드 확인. deprecation 경고 무시 금지.

## 핵심 디렉토리

```
app/
  (main)/layout.tsx       # 영구 shell — 헤더·사이드바·미니바·토스트
  (main)/profile/...      # 프로필 페이지
  (legal)/...             # 약관·개인정보처리방침
  api/
    generate/route.ts     # MiniMax 곡 생성 + Storage 업로드
    songs/[id]/...        # 곡 조회·재생수·좋아요
components/
  AuthProvider.tsx        # Supabase 세션 + profile 캐시
  GlobalMiniBar.tsx       # 페이지 이동에도 살아남는 미니 플레이어
  SongDetailPage.tsx      # 곡 상세 (모바일 풀스크린 오버레이)
  toast/                  # 글로벌 토스트
contexts/
  GlobalPlayerContext.tsx # 재생 상태 + ownerAvatarHue/Url/Name 등 메타
features/
  song/                   # 생성·라이브러리·컬렉션
  explore/                # 탐색·다른 사용자 프로필
services/
  minimax.service.ts      # 모델별 파라미터 분기 (2.0 vs 2.6)
  explore.service.ts      # PublicSong fetch (profiles join 포함)
  song.service.ts         # 곡 CRUD + Supabase Storage
utils/
  profileColor.ts         # 6색 팔레트 (전 화면 아바타 컬러 단일 소스)
  shareUrl.ts             # ?song={id} deep link 생성
```

## 절대 깨지 말 것 (실수 빈번 영역)

### 1. React Hooks early return 금지

```ts
// ❌ 컴파일은 되지만 런타임에 React #310
function X() {
  if (!song) return null
  const ref = useRef(null)  // ← 절대 안 됨
}

// ✅
function X() {
  const ref = useRef(null)
  if (!song) return null
}
```

### 2. 디자인 토큰은 단일 소스

아바타 컬러·아이콘 필터·z-index 등은 절대 화면별로 재계산하지 말 것. 이전에 프로필 hue를 3곳에서 따로 계산해 색이 어긋났음 → `utils/profileColor.ts` 단일 util로 해결.

### 3. MiniMax 모델별 파라미터 분기

| 모델 | `is_instrumental` | 가사 |
|------|---|---|
| `music-2.0` | ❌ 미지원 | 필수 (min 10자) |
| `music-2.5+` / `music-2.6` / `music-2.6-free` | ✅ | 옵셔널 |

사용자가 instrumental 토글하면 자동으로 `music-2.6-free`로 전환 + 토스트. `services/minimax.service.ts`의 `supportsInstrumentalFlag` 분기 참고.

### 4. 곡 메타는 이벤트 detail로 전달

`view-song` / `play-song` 디스패치 시 `ownerName` / `ownerAvatarUrl` / `ownerAvatarHue` 반드시 채울 것. 수신부(SongDetailPage)는 fallback 계산을 하지 않음 — 누락 시 색이 깨짐.

## 주요 패턴

### App shell

`app/(main)/layout.tsx`가 페이지 전환에도 살아남는 헤더·사이드바·미니바·토스트를 들고 있음. 라우팅은 가벼운 상태 머신처럼 사용 — `?song={id}` deep link도 layout에서 처리.

### 이벤트 버스 (window.CustomEvent)

| 이벤트 | detail |
|--------|-------|
| `view-song` / `play-song` | `{ feed, idx, isOwner, ownerName?, ownerAvatarUrl?, ownerAvatarHue? }` |
| `view-profile` | `string` (username) |
| `song-generating` / `song-updated` / `collection-updated` / `profile-updated` | — |
| `audio-play` | `string` (songId 또는 `'__global__'`) |

### 모바일 풀스크린 (곡 상세)

```ts
fixed inset-x-0 top-0 bottom-[calc(156px+env(safe-area-inset-bottom,0px))] z-[55]
md:relative md:inset-auto md:bottom-auto md:z-auto md:h-full
```
상단 헤더만 덮고 미니바·BottomNav는 그대로 노출 — **풀스크린이 전체를 덮으면 안 됨**.

### 한국어 UX

모든 사용자 노출 텍스트는 한국어. 친근 존댓말 ("~요" 종결). 결과는 과거형 ("저장되었어요"). MiniMax 영문 에러도 `translateMinimaxError`로 한글화. 약관/법적 텍스트만 예외.

## 외부 서비스 의존성

| 서비스 | 용도 | 비고 |
|--------|-----|------|
| Supabase | Auth (Google·Kakao), DB (RLS), Storage, RPC | Free 플랜 |
| MiniMax | 곡 생성 (music-2.0, music-2.6-free), 가사, 이미지 | PAYG |
| Vercel | 배포 | Hobby — function timeout 60s (곡 생성 30~100s에 빠듯) |

## 작업 시작 전 체크리스트

- [ ] 디자인 토큰 변경이면 `utils/`·`globals.css` 단일 소스에서 바꾸고 grep으로 사용처 확인
- [ ] 이벤트 detail 변경이면 모든 디스패처(`MyWorkPanel`, `MyCollectionPanel`, `ProfilePanel`, `ExplorePanel`, `useSongGeneration`, `GlobalMiniBar`, shell `?song=`) 동시 갱신
- [ ] MiniMax 파라미터 변경이면 `services/minimax.service.ts` 모델 분기 점검
- [ ] 모바일에서 직접 테스트 (Safari iOS · Chrome Android). 데스크톱만 OK는 OK 아님
- [ ] `pnpm tsc --noEmit` 통과 후 commit

## 더 보기

- 진행 중인 작업 로드맵: `docs/01-plan/features/today-song-mvp.plan.md`
- 아키텍처 설계: `docs/02-design/features/today-song-mvp.design.md`
- 최근 갭 분석 + 후속 진행 노트: `docs/03-analysis/today-song-mvp.analysis.md`
