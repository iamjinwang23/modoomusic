# video-cover Design Document

> **Project**: 모두의 노래 (MONO)
> **Plan**: `docs/01-plan/features/video-cover.plan.md`
> **Architecture**: **Option C — Pragmatic Balance** (음악 생성 코드 무변경 + 비디오 전용 모듈 신설 + 패턴만 차용)
> **Date**: 2026-06-04
> **Status**: Design

> ⚠️ **갱신 (2026-06-15)**: 가격·모델·저장소가 재확정됨 → **`video-cover.plan.md` 상단 "갱신" 섹션이 우선**. 본문의 "15cr 단일 Hailuo-2.3-Fast 768P" 표기는 **2티어(기본 512P=10cr / 고화질 768P=20cr)**로 대체. 단가 기준 1cr=$0.015. 저장소(Supabase Pro vs R2)는 회사 논의 보류. 구현 시 `model`/`resolution`/차감 cr은 티어별로 분기 필요.

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 정적 커버의 표현력 한계 + Suno 경쟁 + 음악+영상 종합 콘텐츠가 SNS 시대 핵심 |
| **WHO** | (1차) 가입자 1회 체험, (주력) Plus·Pro 결제 사용자, 공유 받은 외부 시청자 |
| **RISK** | MiniMax Hailuo 응답시간·실패율, Storage 비용·대역폭, 어뷰즈, 모바일 데이터 부담 |
| **SUCCESS** | 가입자 30%+ 체험, 비디오 곡 공유율 2배+, Plus·Pro 결제 전환 영향 |
| **SCOPE** | 6초·768P·Hailuo-2.3-Fast / I2V+T2V / 1회 체험 + 결제 게이팅 / 자동 재생 루프 |

---

## 1. Overview

### 1.1 Design Goals

- **음악 코드 무변경**: 비디오 추가가 음악 생성 회귀 위험 만들지 않음
- **패턴 일관성**: 백그라운드 생성·Realtime·환불·알림은 음악 패턴 그대로 차용
- **모바일 친화**: iOS Safari/Android Chrome 자동 재생 보장 (`muted playsinline`)
- **점진 출시**: 1차엔 체험권 게이팅 + UI 잠금, 결제 인프라 출시 시 자연스럽게 잠금 해제

### 1.2 Design Principles

- **단일 책임 모듈**: `video.service.ts`는 MiniMax API만, `videoUpload.ts`는 Storage만 책임
- **음악과 도메인 분리**: `songs.video_cover_*` 컬럼만 추가, 기존 `cover_image`/`audio_url`과 독립
- **체험권은 크레딧과 분리**: `consumeVideoTrial`/`refundVideoTrial`을 `credit.service.ts`에 별도 함수로
- **UI: 폴백 우선**: VideoCoverPlayer는 비디오 URL 없으면 기존 정적 이미지로 자연 폴백

---

## 2. Architecture

### 2.1 컴포넌트 다이어그램

```
[VideoCoverModal]  (사용자: 곡 상세에서 진입)
   │
   ├─→ [POST /api/songs/[id]/generate-video]
   │       │
   │       ├─ 권한 검증 (소유자) + 상태 검증 (이미 generating 아님)
   │       ├─ 체험권/크레딧 사전 검증 (consumeVideoTrial 또는 tryConsumeCredits)
   │       ├─ UPDATE songs.video_cover_status = 'generating'
   │       ├─ 즉시 응답 { status: 'generating' }
   │       └─ after(): 백그라운드
   │              │
   │              ├─→ [video.service: generateImageToVideo / generateTextToVideo]
   │              │       └─→ MiniMax Hailuo-2.3-Fast API
   │              │
   │              ├─→ [videoUpload.uploadSongVideoCover]
   │              │       └─→ Supabase Storage `songs-video-covers/{userId}/{songId}.mp4`
   │              │
   │              ├─ UPDATE songs.video_cover_url + status='done' + generated_at
   │              ├─ notifications INSERT (song_complete 재사용)
   │              └─ 실패 시: status='failed' + refundVideoTrial 또는 refundCredits
   │
   └─ Realtime 구독 (SongRealtimeBridge가 video_cover_status 변화 patch)

[PublicSongCard / SongDetailPage / MyWorkPanel]
   └─→ [VideoCoverPlayer]
          ├─ song.videoCoverUrl 있고 done이면 <video autoplay muted loop playsinline>
          └─ 없으면 기존 정적 cover_image
```

### 2.2 음악 생성 패턴 차용 매핑

| 음악 | 비디오 |
|---|---|
| `app/api/generate/route.ts` | `app/api/songs/[id]/generate-video/route.ts` |
| `services/minimax.service.ts:generateMusic` | `services/video.service.ts:generateImageToVideo|generateTextToVideo` |
| `songs.audio_url`, `songs.status` | `songs.video_cover_url`, `songs.video_cover_status` |
| `services/credit.service.ts:tryConsumeCredits/refundCredits` | 위 함수 + 신규 `consumeVideoTrial/refundVideoTrial` |
| `services/storage.service.ts:uploadFromUrl` (음악도 사용) | 동일 `uploadFromUrl` 재사용 — bucket만 'songs-video-covers'로 |
| `components/SongRealtimeBridge.tsx` (status 구독) | 같은 컴포넌트 확장 — `video_cover_status`도 patch |

---

## 3. Data Model

### 3.1 Migration 020

```sql
-- songs 테이블: 비디오 커버 메타
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_url text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_status text;  -- 'generating' | 'done' | 'failed'
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_generated_at timestamptz;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_prompt text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_mode text;   -- 'image_to_video' | 'text_to_video'

-- profiles 테이블: 체험권
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS video_trial_remaining smallint DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS video_trial_used_at timestamptz;

-- handle_new_user 트리거 확장 — 신규 가입자에게 자동 부여
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, onboarding_done, video_trial_remaining)
  VALUES (NEW.id, ..., 1)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Storage 버킷: songs-video-covers (Supabase Dashboard에서 수동 생성 필수)
-- + RLS 정책 (커버 이미지 패턴 동일):
--   songs-video-covers public read
--   users insert own video covers (authenticated, foldername(name)[1] = auth.uid())
--   users update own video covers (authenticated, foldername(name)[1] = auth.uid())
```

### 3.2 도메인 타입 (`types/domain.ts`)

```ts
type VideoCoverStatus = 'generating' | 'done' | 'failed'
type VideoCoverMode = 'image_to_video' | 'text_to_video'

interface Song {
  // ... 기존 필드
  videoCoverUrl?: string
  videoCoverStatus?: VideoCoverStatus
  videoCoverGeneratedAt?: string
  videoCoverMode?: VideoCoverMode
}

interface PublicSong {
  // ... 기존 필드
  videoCoverUrl?: string
  videoCoverStatus?: VideoCoverStatus
}

interface AuthProfile {
  // ... 기존
  videoTrialRemaining: number  // 신규
}
```

### 3.3 PublicSong SONG_SELECT 확장 (탐색·프로필에서 비디오 노출)

```ts
const SONG_SELECT = `
  id, title, ..., cover_image, publish_cover_image,
  video_cover_url, video_cover_status,
  duration, ..., user_id,
  profiles!songs_user_id_fkey ( ... )
`
```

---

## 4. API Contract

### 4.1 `POST /api/songs/[id]/generate-video`

**Auth**: 로그인 필수, 곡 소유자만

**Request Body**:
```ts
{
  mode: 'image_to_video' | 'text_to_video'
  motionPrompt?: string   // image_to_video 모드 — 모션 설명 (선택)
  textPrompt?: string     // text_to_video 모드 — 장면 묘사 (필수)
}
```

**Response (성공)**:
```ts
{
  status: 'generating',
  charge: 'trial' | 'credit',   // 어떤 방식으로 차감됐는지
  remainingTrial?: number
}
```

**Response 코드**:
- `200`: 생성 시작 성공
- `400`: 잘못된 mode 또는 textPrompt 누락
- `401`: 미로그인
- `402`: 체험권·크레딧 둘 다 부족 (결제 유도)
- `403`: 곡 소유자 아님
- `404`: 곡 미존재
- `409`: 이미 generating 상태
- `429`: MiniMax rate limit

**서버 흐름**:
```
1. user 검증 (authentication required)
2. 곡 조회 + 소유자 검증
3. song.video_cover_status === 'generating'이면 409
4. 결제 분기:
   - 기본 체험권 우선 시도: consumeVideoTrial(user.id)
   - 체험권 없으면 tryConsumeCredits(user.id, 15)
   - 둘 다 실패 시 402
5. UPDATE songs SET video_cover_status='generating', video_cover_mode=?, video_cover_prompt=?
6. 즉시 응답
7. after(): 백그라운드
   - mode === 'image_to_video': video.generateImageToVideo(song.cover_image, motionPrompt)
   - mode === 'text_to_video': video.generateTextToVideo(textPrompt)
   - 응답 영상 URL → uploadFromUrl('songs-video-covers', `${userId}/${songId}.mp4`)
   - UPDATE songs SET video_cover_url, status='done', generated_at=now()
   - notifications INSERT (type=song_complete, payload.kind='video_cover')
   - 실패 시: status='failed' + refundVideoTrial 또는 refundCredits(15)
```

### 4.2 MiniMax 비디오 API 래퍼 (`services/video.service.ts`)

```ts
// Image-to-Video
async function generateImageToVideo({
  imageUrl: string,
  motionPrompt?: string,
}): Promise<{ videoUrl: string }> {
  const res = await fetch('https://api.minimax.io/v1/video_generation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'MiniMax-Hailuo-2.3-Fast',
      first_frame_image: imageUrl,
      prompt: motionPrompt,
      duration: 6,
      resolution: '768P',
    }),
  })
  // ... 에러 처리 + base_resp.status_code 검증 + 한국어 메시지 변환
  return { videoUrl: data.data.video }
}

// Text-to-Video
async function generateTextToVideo({
  textPrompt: string,
}): Promise<{ videoUrl: string }> {
  const res = await fetch('https://api.minimax.io/v1/video_generation', { ...
    body: JSON.stringify({
      model: 'MiniMax-Hailuo-2.3-Fast',
      prompt: textPrompt,
      duration: 6,
      resolution: '768P',
    }),
  })
  return { videoUrl: data.data.video }
}
```

**※ 실제 MiniMax video_generation 엔드포인트 사양 확인 필요** — 위는 가정. 응답이 task_id면 polling 필요할 수 있음.

### 4.3 Credit/Trial 함수 추가 (`services/credit.service.ts`)

```ts
// 체험권 소진 — 잔량 1 이상이면 0으로, 0이면 false
export async function consumeVideoTrial(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({
      video_trial_remaining: 0,
      video_trial_used_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .gt('video_trial_remaining', 0)
    .select('id')
    .maybeSingle()
  return !!data && !error
}

// 환불 — 차감했던 1을 되돌림
export async function refundVideoTrial(userId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('profiles')
    .update({ video_trial_remaining: 1, video_trial_used_at: null })
    .eq('id', userId)
    .eq('video_trial_remaining', 0)
}
```

---

## 5. State Management

### 5.1 GlobalPlayerContext

- `Song.videoCoverUrl/Status` 필드를 patch 흐름에 추가
- 이미 `patchSong`이 임의 필드 받으므로 별도 작업 X

### 5.2 SongRealtimeBridge 확장

기존 `status` 변화 감지 외 `video_cover_status` 변화도 patch:

```ts
// rowToPatch 헬퍼 추가
const patch: Partial<Song> = {}
if (newRow.status !== oldStatus) patch.status = newRow.status
if (newRow.video_cover_status !== oldVideoStatus) {
  patch.videoCoverStatus = newRow.video_cover_status
  patch.videoCoverUrl = newRow.video_cover_url ?? undefined
}
patchSong(songId, patch)
```

완료 시 토스트: "비디오 커버가 완성되었어요" (음악 토스트와 분리)

### 5.3 AuthProvider 확장

`AuthProfile`에 `videoTrialRemaining` 노출. UI는 이 값으로 모달 CTA 분기 (무료/유료/잠금).

---

## 6. Event Bus

| 이벤트 | detail | 용도 |
|---|---|---|
| `song-updated` (기존) | — | 비디오 status 변화 시 리스트 갱신 |
| `video-cover-generating` (신규 옵션) | `{ songId }` | 카드에 "비디오 생성 중" 인디케이터 |
| `video-cover-completed` (신규 옵션) | `{ songId, videoUrl }` | 알림 외 클라이언트 패치 |

→ 1차는 기존 `song-updated`만 활용. 별도 이벤트는 필요 시 추가.

---

## 7. UI Component Map

### 7.1 VideoCoverModal (`components/VideoCoverModal.tsx`)

Suno 레퍼런스 + 기존 SongEditModal 컨벤션 차용.

**구조**:
```
모달 (모바일 바텀시트, 데스크톱 중앙, border-white/[0.10], rounded-2xl)
├─ 헤더: "비디오 커버 만들기" + 닫기(X)
├─ 안내: "남은 체험권 1회" 또는 "15 크레딧 사용"
├─ 입력 모드 탭 (둥근 알약 토글):
│   ├─ [이미지 → 비디오] (기본)
│   └─ [텍스트 → 비디오]
├─ 미리보기 영역 (aspect-[2/3] 또는 [16:9]):
│   ├─ 빈 상태: Sparkles 아이콘 + "생성된 영상이 여기 나타나요"
│   ├─ generating: 스피너 + "생성 중... 30~60초 걸려요"
│   ├─ done: <video autoplay muted loop>
│   └─ failed: 재시도 버튼
├─ 입력 폼:
│   ├─ image_to_video 탭: 기존 커버 썸네일 + "어떻게 움직일지" textarea (선택)
│   └─ text_to_video 탭: "장면을 묘사해주세요" textarea (필수)
└─ CTA 버튼:
    ├─ 체험권 있음: "무료로 만들기" (white)
    ├─ 체험권 소진 + 결제 사용자: "만들기 (15 cr)" (violet)
    └─ 체험권 소진 + 무료 사용자: "플랜 업그레이드" (white) → open-coming-soon
```

### 7.2 VideoCoverPlayer (`components/VideoCoverPlayer.tsx`)

```tsx
interface Props {
  videoCoverUrl?: string
  fallbackImageUrl?: string  // cover_image
  coverHue?: number          // 그라데이션 폴백용
  className?: string
}

export function VideoCoverPlayer({ videoCoverUrl, fallbackImageUrl, coverHue, className }: Props) {
  if (videoCoverUrl) {
    return (
      <video
        src={videoCoverUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={className}
      />
    )
  }
  if (fallbackImageUrl) {
    return <Image src={fallbackImageUrl} alt="" fill className={className} />
  }
  return <div className={className} style={{ background: gradientFromHue(coverHue) }} />
}
```

### 7.3 통합 위치

| 위치 | 컴포넌트 변경 |
|---|---|
| `features/explore/components/PublicSongCard.tsx` | 썸네일 영역을 `<VideoCoverPlayer>`로 교체 |
| `features/song/components/MyWorkPanel.tsx` | SongWorkItem 썸네일을 `<VideoCoverPlayer>`로 |
| `features/explore/components/ProfilePanel.tsx` | ProfileSongThumb 내부 교체 |
| `components/SongDetailPage.tsx` | 큰 커버 영역을 `<VideoCoverPlayer>`로 + ⋮ 메뉴에 "비디오 커버 만들기" 추가 (소유자만) |

---

## 8. Test Plan (수동 QA 체크리스트)

### 8.1 인증·권한
- [ ] 미로그인 상태에서 모달 진입 차단
- [ ] 다른 사용자 곡에서 "비디오 커버 만들기" 메뉴 노출 X
- [ ] 자기 곡에서만 메뉴 노출

### 8.2 체험권 정책
- [ ] 신규 가입자 `video_trial_remaining = 1` 자동 부여
- [ ] 체험권 1회 사용 후 잔량 0으로 감소
- [ ] 잔량 0 + 무료 사용자: 모달 CTA "플랜 업그레이드" 표시
- [ ] 잔량 0 + 결제 사용자: 15 cr 차감 정상

### 8.3 이미지-to-비디오
- [ ] 기존 cover_image가 있는 곡: 미리보기에 이미지 노출 + "만들기" 활성
- [ ] cover_image NULL 곡: 모드 비활성 또는 텍스트 모드만 가능
- [ ] motionPrompt 입력 후 생성 → 6초 영상 결과

### 8.4 텍스트-to-비디오
- [ ] textPrompt 비어 있으면 "만들기" 비활성
- [ ] 자유 텍스트 입력 후 생성 → 6초 영상 결과

### 8.5 백그라운드·Realtime
- [ ] 모달 닫고 다른 페이지 이동해도 백그라운드 진행
- [ ] 완료 시 알림 표시 + 곡 카드/상세에 자동 재생 루프 즉시 반영
- [ ] 실패 시 status='failed' + 체험권/크레딧 환불 (`profiles.video_trial_remaining = 1` 복원)

### 8.6 자동 재생 호환성
- [ ] iOS Safari: muted playsinline 자동 재생 정상
- [ ] Android Chrome: 정상
- [ ] 데스크톱 Chrome/Firefox/Edge/Safari: 정상
- [ ] 비디오 없는 곡: 정적 이미지 폴백
- [ ] 모바일 데이터 절약 모드: preload="metadata"로 즉시 다운로드 X

### 8.7 공유·OG (Phase 5 연계)
- [ ] (Phase 5) `/song/[id]` 라우트에 `og:video` 메타 포함
- [ ] 카카오톡 공유 시 비디오 미리보기 (지원 시)

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| MiniMax video_generation 엔드포인트가 task_id 비동기형 | Plan 단계에서 명세 확인 후 polling 추가 또는 webhook 처리 |
| Hailuo 응답 60초+ 걸림 | Vercel `after()` 시간 한도 점검. 한도 초과 시 별도 워커(Edge Function·외부 큐) 검토 |
| Storage egress 비용 폭증 | 자동 재생 곡 비율 모니터링 + Phase 5에 CDN/캐시 정책 고도화 |
| 모바일 자동 재생 차단 | `muted playsinline` 조합 + 사용자 인터랙션 후 재시도 fallback |
| 결제 사용자 부재 1차: "곧 출시" 카피 모호 | 명확 카피: "체험권을 모두 사용하셨어요. Plus·Pro 출시 후 무제한으로 만들 수 있어요" |
| 어뷰즈 (재가입 체험권) | `handle_new_user`에서 동일 이메일·전화 검증 (이미 OAuth라 자연 차단) |

---

## 10. Phase 5 Forward Compatibility

- `/song/[id]` 전용 라우트 (공유 OG 미리보기 feature)와 함께 진행 시:
  - `<meta property="og:video" content="{videoCoverUrl}">` 추가
  - `<meta property="og:video:type" content="video/mp4">`
  - 정적 폴백 `og:image`는 cover_image 그대로
- 결제 인프라 출시 시:
  - 모달 CTA에서 "플랜 업그레이드" → 결제 페이지로 직접 라우팅
  - `consumeVideoTrial` 실패 + 결제 사용자 분기에서 자동 크레딧 차감

---

## 11. Implementation Guide

### 11.1 구현 순서

1. **DB & Storage 인프라**
   - 마이그레이션 020 (컬럼·트리거)
   - Storage 버킷 `songs-video-covers` 생성 + RLS 정책 추가
2. **타입 + 서비스 레이어**
   - `types/domain.ts` 확장
   - `services/video.service.ts` (MiniMax I2V/T2V 래퍼)
   - `services/credit.service.ts` (consumeVideoTrial/refundVideoTrial)
   - `services/song.service.ts` (rowToSong/songToRow/patchToRow 매핑)
3. **API 라우트**
   - `app/api/songs/[id]/generate-video/route.ts`
4. **Realtime + AuthProvider**
   - `components/SongRealtimeBridge.tsx`에 video_cover_status 분기 추가
   - `AuthProvider` profile fetch에 `video_trial_remaining` 포함
5. **UI 컴포넌트**
   - `components/VideoCoverModal.tsx` (Suno 패턴)
   - `components/VideoCoverPlayer.tsx` (video|image 폴백)
6. **곡 카드·상세 통합**
   - PublicSongCard·MyWorkPanel·ProfilePanel·SongDetailPage에 VideoCoverPlayer 적용
   - SongDetailPage ⋮ 메뉴에 "비디오 커버 만들기" 항목 (소유자만)
7. **알림·환불**
   - `notifications.payload.kind` 분기 추가 (`video_cover_complete`)
   - 실패 시 환불 검증
8. **QA**
   - 위 §8 체크리스트 따라 수동 QA
   - iOS/Android 실기기 테스트

### 11.2 Decisions Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Option C (Pragmatic) 선택 | 음악 코드 회귀 위험 X, 작업량 적정, 패턴 일관성 유지 |
| 2 | 6초 / 768P / Hailuo-2.3-Fast 단일 모델 | 가격 $0.19로 마진 확보 + 응답 빠름. Standard·1080P는 Phase 5 |
| 3 | 15 credit 가격 책정 | 원가 $0.19 환산 13 cr에 마진 18% 추가. 음악(마진 0)과 차별화 |
| 4 | 하이브리드 무료 (1회 체험권 + 이후 결제) | 일일 크레딧 이월 X 정책 하에 무료 사용 사실상 불가 → 체험 + 결제 유인 |
| 5 | 별도 Storage 버킷 (`songs-video-covers`) | 음악(songs-audio)과 분리해 대역폭·비용 모니터링 편의 |
| 6 | image_to_video와 text_to_video 둘 다 1차 도입 | 두 입력 방식이 서로 다른 사용 케이스 (기존 커버 활용 vs 자유 창작) |
| 7 | VideoCoverPlayer = video|image|gradient 3단 폴백 | 비디오 없는 곡 깨짐 방지, 점진적 마이그레이션 자연스러움 |
| 8 | Realtime 패치는 기존 SongRealtimeBridge 확장 | 새 컴포넌트 만들 필요 X — `video_cover_status`만 추가 분기 |
| 9 | 알림은 song_complete 재사용 + payload.kind | 신규 타입보다 단순. NotificationItem에서 kind로 카피 분기 |

### 11.3 Session Guide

**Module Map**:

| Module | Scope | 파일 |
|--------|-------|------|
| `module-db` | 마이그레이션 + Storage 버킷 + RLS 정책 | SQL only + Supabase Dashboard |
| `module-service` | video.service + credit.service 확장 + song.service 매핑 + types | `services/video.service.ts`, `services/credit.service.ts`, `services/song.service.ts`, `types/domain.ts` |
| `module-api` | generate-video 라우트 | `app/api/songs/[id]/generate-video/route.ts` |
| `module-realtime-auth` | SongRealtimeBridge 확장 + AuthProvider profile 필드 | `components/SongRealtimeBridge.tsx`, `components/AuthProvider.tsx` |
| `module-ui-modal` | VideoCoverModal 신규 | `components/VideoCoverModal.tsx` |
| `module-ui-player` | VideoCoverPlayer + 카드·상세 통합 | `components/VideoCoverPlayer.tsx`, `PublicSongCard`, `MyWorkPanel`, `ProfilePanel`, `SongDetailPage` |
| `module-notification` | 알림 payload 확장 + NotificationItem 카피 | `services/notification.service.ts`, `components/NotificationItem.tsx` |
| `module-qa` | 수동 QA 체크리스트 통과 + 모바일 실기기 | 코드 변경 없음 |

**Recommended Session Plan**:

- **Session 1 (백엔드 토대, ~1.5h)**: `module-db` + `module-service` + `module-api`
  - 가장 위험 적은 부분 (음악 코드 안 건드림)
  - API curl로 검증 가능
- **Session 2 (UI 핵심, ~1.5h)**: `module-realtime-auth` + `module-ui-modal`
  - 모달 단독으로 동작
  - 카드·상세는 다음 세션
- **Session 3 (통합 + 폴백, ~1.5h)**: `module-ui-player` + 카드·상세 통합
  - VideoCoverPlayer로 일관 렌더
  - 비디오 없는 곡 폴백 확인
- **Session 4 (마무리 + QA, ~1.5h)**: `module-notification` + `module-qa`
  - 알림 카피·디테일
  - 실기기 테스트

사용 예: `/pdca do video-cover --scope module-db,module-service,module-api`

---

## 12. Open Questions

다음 항목은 구현 시작 전 또는 첫 세션에서 확인 필요:

1. **MiniMax video_generation 엔드포인트 응답 포맷**
   - 동기 응답 (audio처럼 즉시 URL 반환)인지, 비동기 task_id 후 polling인지?
   - 비동기면 polling 인터벌·timeout 설계 필요
2. **MiniMax Hailuo-2.3-Fast 모델 정확한 model 식별자**
   - 코드에 박을 `model` 파라미터 값
3. **Vercel `after()` 시간 한도** (Hobby plan = 60s)
   - 응답 60s+ 걸리면 별도 워커 필요
4. **Storage egress 비용 시뮬레이션**
   - Supabase Free tier: egress 5GB/월 → 1MB 비디오 5000회 재생 가능
   - Plus tier 이상 권장
5. **handle_new_user 트리거에 video_trial_remaining 추가 시 RLS 영향**
   - SECURITY DEFINER 함수이므로 OK이지만 마이그레이션 003 패턴 그대로 따름

---

## 13. 구현 노트 (2026-06-19) — Status: 구현 완료(S1–S4 코드), 미배포

> 본 설계 초안 대비 **실제 구현에서 바뀐 핵심**과 결정 사항. 충돌 시 본 섹션 우선.

### 13.1 핵심 아키텍처 변경 — MiniMax 영상은 비동기
설계 초안의 "동기 즉시 URL 반환"은 **오류**. 실측(운영 키 직접 curl) 확인:
- `POST /v1/video_generation` → **`task_id` 반환** (URL 아님)
- `GET /v1/query/video_generation?task_id=` → `{ status, file_id }`, 완료 시 `status:"Success"`
- `GET /v1/files/retrieve?file_id=` → `{ file: { download_url } }` — **GroupId 불필요**
- 생성 영상은 **세로(portrait)** 512×768/918. 소요 수 분.
→ 음악처럼 `after()` 한 번으로 못 끝냄. **마무리(finalize)는 폴링으로**:
  - 즉시: `POST /api/songs/[id]/generate-video`가 task 생성 후 `video_cover_task_id` 저장하고 즉시 응답(generating).
  - 클라 폴링: `GET /api/songs/[id]/video-status`(5초) → 서버가 query→retrieve→Storage 업로드→done.
  - 백그라운드 재개: `components/VideoCoverPoller.tsx`(레이아웃 마운트, 8초)로 모달 닫혀도/앱 재진입/서버재시작 시 generating 비디오 자동 마무리.
  - 야간 회수: `cleanup-notifications` 크론이 `sweepVideoCovers()` 호출.
  - 공통 로직: `services/video-finalize.service.ts:finalizeVideoCover/sweepVideoCovers`. **timeout(12분)은 query 후 검사** — 완성된 영상은 시간 지나도 저장.

### 13.2 마이그레이션
설계의 020 → 실제 **035_video_cover.sql** (번호 이동). `video_cover_task_id`·`charge`·`started_at` 컬럼 추가. `handle_new_user` 미수정 — `video_trial_remaining smallint NOT NULL DEFAULT 1`로 기존·신규 자동 부여.

### 13.3 가격 2티어 (plan §갱신 반영)
basic 512P=10cr(Hailuo-02) / hd 768P=20cr(Hailuo-2.3-Fast). `services/video.service.ts:VIDEO_TIERS`. **model 식별자 문자열은 콘솔 확정 필요**(추정값으로 동작 중).

### 13.4 §12 Open Questions 해소
1. 응답 포맷 → **비동기 task_id 폴링** (위 13.1). 2. model 식별자 → TIERS 상수 분리(콘솔 확정 TODO). 3. Vercel after() → **사용 안 함**, 폴링/크론 방식. 4. Storage egress → **Supabase Pro 전환 완료**(100GB/250GB) + 공개 그리드는 재생중만 자동재생으로 egress 절감. 5. trial 트리거 → 컬럼 DEFAULT로 대체(트리거 미변경).

### 13.5 UI
- 모달: Suno 참고 구성(미리보기 240px·언더라인 탭·프롬프트 썸네일칩·티어 세그먼트). CTA는 음악 만들기 버튼 구성(Sparkles+크레딧). `document.body` 포털(미니바 위). **연 시점 곡 스냅샷 고정**(재생곡 바뀌어도 불변).
- VideoCoverPlayer(video→image→gradient 3단 폴백). 곡상세 커버·라이브러리는 자동재생, **탐색·프로필 그리드는 재생중인 곡만** 재생(egress).
- 진입점: 곡상세 커버 하단 버튼 + 상세/리스트 ⋮ 메뉴.
- 알림: NotificationItem song_complete를 payload.kind로 분기(video_cover / video_cover_failed). **실패 시 알림 INSERT**.

### 13.6 남은 것
- 실기기 자동재생 QA, MiniMax model 식별자 콘솔 확정, **커밋·배포**(더 다듬은 뒤).
- **음악(노래) 생성 실패 알림 추가** — 현재 음악은 성공만 알림, 실패는 토스트만. 비디오와 동일하게 실패 알림 적용 필요.
