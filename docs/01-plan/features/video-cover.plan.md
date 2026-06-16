# video-cover Planning Document

> **Summary**: 곡 커버에 6초 비디오(MiniMax Hailuo-2.3-Fast, 768P)를 자동 생성. 이미지-to-비디오(기존 cover 활용) + 텍스트-to-비디오(프롬프트 직접 작성) 두 입력 방식. 가입 시 1회 무료 체험권 부여, 이후 사용은 Plus·Pro 결제 전용. 곡 카드·상세에서 자동 재생 루프.
>
> **Project**: 모두의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-06-04
> **Status**: Planning

---

## ⚠️ 갱신 (2026-06-15) — 가격·모델·저장소 재확정

> 본 문서의 초안(2026-06-04) 가정 중 **가격·모델·저장소**는 아래로 **대체**됨. 본문에 남은 "15cr 단일 모델" 표기는 이 섹션이 우선.

**1. 단가 정정 (공식 PAYG 기준 — platform.minimax.io/docs/guides/pricing-paygo)**
- 곡(Music-2.6) 원가 = **$0.15/곡** (이전 메모의 $0.035는 오해, 폐기). **1cr = $0.015 ≈ 20원** (Music 2.0=2cr=$0.03, 2.6=10cr=$0.15, 원가 1:5 일치)
- 영상: Hailuo-02 512P·6s = **$0.10**, Hailuo-2.3-Fast 768P·6s = **$0.19**, Hailuo-2.3 768P·6s = $0.28

**2. 가격 = 2티어 확정 (~1.5배 마진)**
| 티어 | 모델 | 화질/길이 | 원가 | **차감 cr** | 마진 |
|---|---|---|---|---|---|
| 기본 | Hailuo-02 | 512P·6s | $0.10 (6.7cr) | **10cr** | 1.50배 |
| 고화질 | Hailuo-2.3-Fast | 768P·6s | $0.19 (12.7cr) | **20cr** | 1.58배 |
- Hailuo-2.3 표준(768P $0.28)은 **드롭** — Fast와 해상도 동일·원가만 47%↑, 명분 없음. 화질 우위 실측 시 프리미엄 부활 검토
- 직관: 512p = 곡 1개치(10cr), 768p = 곡 2개치(20cr). 실패 생성도 과금 → 라운드업이 버퍼

**3. 저장소 = 회사 논의로 보류 (둘 중 택1)**
- **A) Supabase Pro $25/월** — 공수 0·자동 백업·한도 대폭 상향(저장 100GB·egress 250GB·DB 8GB)
- **B) Cloudflare R2(미디어 파일만) + Supabase Free** — ~$0, egress 무료. 단 R2 통합 1회 공수 + 백업 직접(pg_dump). DB/인증/Realtime은 Free 유지
- MVP 규모(현재 MAU 46·파일 438MB/1GB·egress 1.66GB/5GB)에선 둘 다 기술적 충분. **자동 백업 + 공수** 차이의 비용 정책 결정
- 보험: `services/storage.service.ts` 단일 진입점 유지 → 나중에 R2 전환을 쉬운 작업으로

---

## Executive Summary

| Perspective | Content |
|---|---|
| **Problem** | 정적 커버 이미지가 음악의 분위기·감정을 충분히 표현 못 함. SNS·메신저 공유 시 "와우" 효과 약함. Suno도 비디오 커버 도입해 차별화 중인데 우리는 정적 이미지뿐 |
| **Solution** | MiniMax Hailuo-2.3-Fast로 6초 비디오 커버 생성. 이미지-to-비디오(기존 커버 자동 활용)와 텍스트-to-비디오(프롬프트 직접 입력) 두 방식. 결과는 곡 카드·상세에서 자동 재생 루프 |
| **Function/UX Effect** | 곡 상세에 "비디오 커버 만들기" 모달 → 입력 방식 탭 선택 → 6초 비디오 생성(약 30~60초 소요) → 완료 후 자동 재생. SNS 공유 시 정적 이미지 대신 비디오 미리보기로 임팩트↑ |
| **Core Value** | "이거 어떻게 만든 거야?" 바이럴 트리거. 음악과 시각이 결합된 종합 콘텐츠 = 결제 사용자 차별화 가치. 가입 1회 체험으로 모든 사용자가 한 번은 경험 + Plus·Pro 결제 강력한 유인 |

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 정적 커버의 표현력 한계 + Suno 등 경쟁자가 비디오로 차별화 중. 음악+영상 종합 콘텐츠가 SNS 시대 핵심 무기 |
| **WHO** | (1차) 비디오 한 번 체험해보고 싶은 가입 사용자, (2차/주력) Plus·Pro 결제 사용자(고품질 콘텐츠 제작자), (외부) 공유 메신저로 받은 비로그인 사용자 |
| **RISK** | (a) MiniMax Hailuo 응답시간·실패율 = 사용자 체감 품질 직결, (b) Storage 비용 폭증(6초 mp4 ≈ 1~3MB × 사용자수), (c) 1회 체험 abuse 차단 정책, (d) 비디오 자동 재생이 모바일 데이터 부담될 수 있음 |
| **SUCCESS** | (1) 가입자 중 30%+ 비디오 1회 체험 이용 (2) 비디오 커버 곡의 공유 비율이 정적 커버 곡 대비 2배+ (3) Plus·Pro 결제 전환에 비디오가 결정적 영향(설문 등) |
| **SCOPE** | (In) 이미지-to-비디오 + 텍스트-to-비디오 / 6초 / 768P / Hailuo-2.3-Fast / 1회 체험 + 결제 게이팅 / 곡 카드·상세 자동 재생 루프 (Out) 음성·BGM 합성, 사용자 편집(크롭/필터), 10초+ 영상, 1080P |

---

## 1. Overview

### 1.1 Purpose

곡 단위로 6초 비디오 커버를 생성·저장·표시하는 기능 추가. 이미지-to-비디오 또는 텍스트-to-비디오 두 입력 방식 모두 제공. 정적 cover_image 위에 비디오 레이어로 자동 재생 루프.

### 1.2 Background

- 현재 곡 커버는 자동 생성 이미지(`songs.cover_image`)로 정적 PNG
- Suno가 비디오 커버 도입 + SNS 공유 시 임팩트 큼 (사용자 의견·시장 흐름)
- MiniMax Hailuo-2.3-Fast가 6초 768P 영상을 $0.19에 생성 가능 (수익성 확보 가능 가격대)

### 1.3 Related Documents

- 이미지·Storage 패턴: `docs/02-design/features/today-song-mvp.design.md` §12.10 (커버 이미지 WebP + Storage)
- 백그라운드 생성 패턴: 같은 문서 §12.1 (Phase 3 — `after()` + Realtime UPDATE)
- 환불 로직: `services/credit.service.ts:refundCredits`

---

## 2. Scope

### 2.1 In Scope (1차 출시)

- [ ] **두 입력 방식**:
  - 이미지-to-비디오: 기존 `cover_image`(자동 또는 사용자 업로드 커버)를 입력 → MiniMax Image2Video 호출
  - 텍스트-to-비디오: 사용자가 프롬프트 직접 입력 → MiniMax Text2Video 호출
- [ ] **2티어 모델 / 6초 고정** (상단 갱신 섹션 참조): 기본 Hailuo-02 512P / 고화질 Hailuo-2.3-Fast 768P
- [ ] **가격: 512P 10cr / 768P 20cr** (~1.5배 마진, 1cr=$0.015 기준). ~~15cr 단일~~ 폐기
- [ ] **하이브리드 무료 정책**:
  - 가입 시 `video_trial_remaining = 1` 부여
  - 무료 사용자: 체험권 1회 소진 후 잠금
  - Plus·Pro 결제 사용자: 크레딧 차감으로 무제한 사용 (결제 인프라 출시 후)
- [ ] **백그라운드 처리**: `/api/songs/[id]/generate-video` INSERT 후 즉시 반환 → `after()`로 MiniMax 호출 → Storage 업로드 → UPDATE
- [ ] **Storage**: `songs-video-covers/{userId}/{songId}.mp4` (별도 버킷)
- [ ] **자동 재생 루프 UI**: 곡 카드·상세에서 `<video autoplay muted loop playsinline>` 노출 (정적 이미지 폴백)
- [ ] **소유자 전용 UI**: "비디오 커버 만들기" 버튼은 isOwner에만 노출
- [ ] **실패·환불**: 생성 실패 시 status=failed + 크레딧(또는 체험권) 환불
- [ ] **알림**: 비디오 커버 생성 완료 시 `notifications.type='song_complete'` 또는 신규 타입
- [ ] **체험 어뷰즈 차단**: 가입 시점 트리거로 1회만 부여, 탈퇴·재가입 케이스는 `last_video_trial_at` 등으로 제한

### 2.2 Out of Scope (이번 단계 제외)

- 10초+ 비디오 (Hailuo-2.3 Standard 모델)
- 1080P 화질
- 비디오 편집(크롭·필터·자막)
- 음원과 비디오 동기화 (오디오 분석 기반 비디오 카메라 워크)
- 사용자가 직접 mp4 업로드
- 비디오 to 비디오(이전 비디오 변형)
- 곡 생성 단계에서 비디오까지 자동 동시 생성 (별도 액션으로 분리)
- Plus·Pro 결제 인프라 자체 (별도 feature)

---

## 3. Requirements

### 3.1 Functional Requirements

#### FR-1 비디오 커버 생성 모달 (Suno 레퍼런스 따름)
- 곡 상세 페이지 소유자 메뉴(⋮)에 "비디오 커버 만들기" 항목 추가
- 모달 헤더: "비디오 커버 만들기" + 남은 체험권/크레딧 안내
- 두 입력 방식 탭: "**이미지 → 비디오**" (기본), "**텍스트 → 비디오**"
  - 이미지 탭: 기존 곡의 cover_image 미리보기 + 선택사항으로 "어떻게 움직일지 설명"(텍스트 입력)
  - 텍스트 탭: 자유 텍스트 프롬프트 (장면·분위기 묘사)
- 미리보기 영역: 빈 상태엔 "생성된 영상이 여기 나타나요" 안내 + Sparkles 아이콘, 생성 후엔 비디오 재생
- CTA: 무료 체험권 보유 시 "**무료로 만들기**" / 미보유·결제 사용자 "**만들기 (15 cr)**" / 무료 사용자 체험 소진 후 "**플랜 업그레이드**" (잠금)

#### FR-2 이미지-to-비디오 흐름
- 입력: 기존 `cover_image` URL (자동/사용자 업로드 무관)
- 선택 입력: 모션 프롬프트 ("천천히 줌인", "구름이 흘러가게" 등)
- MiniMax I2V API 호출 → 6초 mp4 응답
- Storage `songs-video-covers/{userId}/{songId}.mp4` 업로드
- `songs.video_cover_url` UPDATE

#### FR-3 텍스트-to-비디오 흐름
- 입력: 사용자 자유 프롬프트 (장면 묘사)
- MiniMax T2V API 호출 → 6초 mp4 응답
- 이후 흐름은 FR-2와 동일

#### FR-4 크레딧·체험권 정책
- 가입 시점: `profiles.video_trial_remaining = 1` 자동 부여 (handle_new_user 트리거 확장)
- 클라이언트는 모달 진입 시점에 `video_trial_remaining` 조회
- 1회 체험 사용 시: `video_trial_remaining = 0` UPDATE, 크레딧 차감 X
- 체험 소진 + 무료 사용자: 모달에 "플랜 업그레이드" 안내, 생성 버튼 비활성
- 체험 소진 + 결제 사용자: 15 cr 크레딧 차감, 정상 생성
- 실패 시: 체험권/크레딧 환불

#### FR-5 백그라운드 생성 + Realtime
- API 즉시 응답: `{ songId, videoStatus: 'generating' }`
- `songs.video_cover_status = 'generating'` UPDATE
- `after()` 백그라운드: MiniMax → Storage → UPDATE done/failed
- 곡 카드·상세: Realtime 구독 또는 polling으로 status 변화 감지
- 완료 시 알림: `notifications`에 INSERT (song_complete 타입 재활용 또는 신규 video_cover_complete)

#### FR-6 자동 재생 루프
- 비디오 커버가 있는 곡의 카드: 정적 이미지 대신 `<video autoplay muted loop playsinline>` 노출
- 곡 상세 페이지 동일
- 모바일 데이터 절약: 사용자 설정 또는 시스템 데이터 세이버 모드 감지 시 정적 이미지 폴백 (Phase 5 후보)
- 비디오 없는 곡: 기존 정적 이미지 유지

#### FR-7 공유·OG
- 공유 시 OG 메타데이터에 비디오 메타(`og:video`, `og:video:type=video/mp4`) 포함
- 카카오톡·페이스북 등에서 비디오 미리보기 (사이트별 지원 차이 있음)
- (Phase 5) `/song/[id]` 전용 라우트와 함께 진행

### 3.2 Non-Functional Requirements

| 항목 | 기준 |
|---|---|
| **생성 시간** | 평균 30~60초 (MiniMax Hailuo-2.3-Fast 기준) |
| **Storage 용량** | 영상 1개 평균 1~3MB (768P 6초 mp4) |
| **대역폭 비용** | Supabase Storage egress 가격 기준 모니터링. CDN 캐시로 완화 |
| **실패율 목표** | < 5% (모니터링 + 알림) |
| **모바일 자동 재생** | iOS Safari/Android Chrome 모두 `muted playsinline` 조합으로 재생 보장 |
| **체험권 어뷰즈** | 동일 디바이스/이메일 재가입 시 트리거에서 차단(이메일·전화 검증) |

---

## 4. Technical Design (High-Level)

### 4.1 데이터 모델

#### Migration 020: 비디오 커버 컬럼 + 체험권

```sql
-- songs 테이블: 비디오 커버 메타
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_url text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_status text;  -- 'generating' | 'done' | 'failed' | null
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_generated_at timestamptz;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_prompt text;  -- T2V 프롬프트 또는 I2V 모션 설명 보관(재생성용)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_cover_mode text;     -- 'image_to_video' | 'text_to_video'

-- profiles 테이블: 체험권
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS video_trial_remaining smallint DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS video_trial_used_at timestamptz;

-- handle_new_user 트리거에 video_trial_remaining=1 부여 추가 (마이그레이션 003 패턴 따름)
```

#### Storage 버킷 신설: `songs-video-covers`
- Public read (공유 가능해야 함)
- INSERT/UPDATE: authenticated + `(storage.foldername(name))[1] = auth.uid()` (커버 이미지 정책과 동일 패턴)

### 4.2 API 라우트

#### POST `/api/songs/[id]/generate-video`
- Auth: 로그인 필수, 곡 소유자만
- Body: `{ mode: 'image_to_video' | 'text_to_video', motionPrompt?: string, textPrompt?: string }`
- 흐름:
  1. 곡 소유자 검증
  2. `video_cover_status` 검사 (이미 generating이면 409)
  3. 체험권 또는 크레딧 사전 검증
     - 체험권 있음 → trial로 표시
     - 체험권 없고 결제 사용자(플랜 보유) → 15 cr 차감
     - 둘 다 아님 → 402 Payment Required
  4. `UPDATE songs SET video_cover_status='generating', video_cover_mode=?, video_cover_prompt=?`
  5. 즉시 응답 `{ status: 'generating' }`
  6. `after()`로 백그라운드:
     - MiniMax I2V 또는 T2V 호출
     - 응답 영상 URL → fetch → Storage 업로드
     - `UPDATE songs SET video_cover_url, video_cover_status='done', video_cover_generated_at=now()`
     - 알림 INSERT (`notifications.type='song_complete'` 재사용 또는 신규 타입)
     - 실패 시: status='failed' + 체험권/크레딧 환불

### 4.3 서비스 레이어

`services/video.service.ts` (신규):
- `generateImageToVideo(imageUrl, motionPrompt?)`: MiniMax I2V API 래퍼
- `generateTextToVideo(textPrompt)`: MiniMax T2V API 래퍼
- 에러 변환(한국어), rate limit 처리

### 4.4 UI 컴포넌트

`components/VideoCoverModal.tsx` (신규):
- Suno 레퍼런스 따른 모달 (탭, 미리보기, CTA)
- 두 입력 모드 탭
- 진행 상태 표시 (generating/done/failed)
- 모바일 바텀시트, 데스크톱 중앙 (기존 모달 컨벤션)

`components/SongVideoCover.tsx` (또는 PublicSongCard·SongDetailPage 내부 인라인):
- `<video>` 요소 노출 로직
- 비디오 URL 있으면 비디오, 없으면 정적 이미지

### 4.5 백그라운드·Realtime

- `components/SongRealtimeBridge.tsx` 확장: `video_cover_status` 필드도 구독·patchSong
- 클라이언트 캐시 patch: `Song` 도메인 타입에 `videoCoverUrl`, `videoCoverStatus` 추가
- `services/song.service.ts` rowToSong·songToRow·rowToPatch에 매핑 추가

### 4.6 도메인 타입

```typescript
// types/domain.ts
interface Song {
  // ... 기존 필드
  videoCoverUrl?: string
  videoCoverStatus?: 'generating' | 'done' | 'failed'
  videoCoverGeneratedAt?: string
  videoCoverMode?: 'image_to_video' | 'text_to_video'
}

interface AuthProfile {
  // ... 기존
  videoTrialRemaining: number
}
```

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| MiniMax Hailuo 응답시간 느림 (1분+) | 사용자 이탈 | 백그라운드 처리 + 알림 + 페이지 이동 자유로움 (음악 생성과 동일 패턴) |
| Hailuo 실패율 높음 | 환불 부담·만족도↓ | 체험권/크레딧 자동 환불 + 실패율 모니터링 (목표 < 5%) |
| Storage 비용 폭증 | 운영 비용↑ | CDN 캐시 활용 + Storage egress 대시보드 모니터링 + 다음 단계로 비디오 보관 기간 정책 |
| 모바일 데이터 부담 | 사용자 불만 | iOS/Android 데이터 절약 모드 감지(추후) + `<video preload="metadata">`로 즉시 다운로드 X |
| 체험권 어뷰즈 | 비용 누수 | 가입 트리거에서만 부여 + `video_trial_used_at`로 이력 보존 + 이메일·전화 검증 강화 |
| 부적절 콘텐츠 (T2V 프롬프트) | 법적·이미지 리스크 | MiniMax 자체 안전 필터(1026 코드)에 의존 + 우리 측 키워드 블랙리스트 추후 도입 |
| 결제 인프라 없는 상태에서 잠금 UX | 사용자 혼란 | "곧 출시" 배지 + 명확한 안내 카피 |

---

## 6. Success Criteria

각 항목은 1차 출시 후 4주 시점 측정.

- [ ] 비디오 커버 생성 모달 정상 동작 (이미지·텍스트 모드 둘 다)
- [ ] 가입 사용자의 30%+가 1회 체험권 사용
- [ ] 생성 평균 시간 60초 이내
- [ ] 생성 실패율 5% 미만
- [ ] 비디오 커버 곡의 SNS 공유 빈도가 정적 커버 곡 대비 2배+
- [ ] 카드·상세에서 자동 재생 루프 정상 (iOS/Android/데스크톱)
- [ ] 결제 인프라 출시 후 Plus·Pro 결제 사용자 중 50%+가 비디오 커버 활용
- [ ] Storage egress 비용 합리적 범위 (모니터링 임계치 설정)
- [ ] 마이그레이션 020 + Storage 버킷 정책 적용 완료
- [ ] 환불 로직 정상 동작 (실패 시 체험권/크레딧 자동 복원)

---

## 7. Next Steps

1. **(다음) Design 문서 작성** — Architecture 3가지 옵션, Module Map, Session Guide
2. **Pencil MCP / Design Anchor** (선택) — UI 컨셉 페이지 잡고 디자인 토큰 잠그기
3. **Do 구현 세션 분할**:
   - Session 1: 마이그레이션 + 서비스 레이어 + API 라우트
   - Session 2: VideoCoverModal UI + 곡 상세 진입
   - Session 3: 카드·상세 자동 재생 루프 + Realtime 동기화
   - Session 4: 알림·환불·실패 처리 + QA
4. **결제 인프라 feature와 연계** — 비디오 잠금 해제 타이밍 맞추기
5. **MiniMax Hailuo API 사양 확인** — 실제 응답 포맷·해상도·옵션 검증 (제한 응답시간, base_resp.status_code 등)
