# today-song-mvp Planning Document

> **Summary**: MiniMax API 기반 AI 음악 생성 서비스 MVP — 텍스트→음악, 음원 커버, 커버 이미지 자동 생성, 소셜 OAuth + 온보딩 + 프로필 시스템
>
> **Project**: 오늘의 노래 (MONO — 모두가 만드는 세상의 모든 노래)
> **Version**: 0.2.0
> **Author**: jinwang
> **Date**: 2026-05-21
> **Status**: In Progress (Phase 1·2 완료 — Phase 3 Supabase DB 연동 진행 중)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 텍스트만으로 고품질 음악을 만들기 어려웠고, 만들어진 곡을 보관·공유·탐색할 SNS형 흐름이 부재 |
| **Solution** | MiniMax Music + Image API 풀 파이프라인 + Supabase Auth/Storage 기반 소셜 OAuth·온보딩·프로필 이미지 시스템 + 페이지별 라우팅 + 생성 중 즉시 정보 표시 UX |
| **Function/UX Effect** | 모델 선택, 보컬 성별 자동 주입, 커버 이미지 동시 생성, WebP 자동 변환, 4단계 온보딩, 헤더/프로필/플레이어 아바타 실시간 동기화, 곡 정보는 즉시 표시되고 썸네일만 스피너로 표현 |
| **Core Value** | 누구나 텍스트 한 줄로 커버 이미지가 포함된 완성된 곡을 얻고, 자신의 프로필에서 자신만의 정체성으로 모아볼 수 있는 zero-friction 음악 SNS |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | MiniMax API + Supabase로 AI 음악 SNS MVP를 검증 — 생성·소셜 OAuth·온보딩·프로필 사이의 일관된 정체성 흐름 확립 |
| **WHO** | 음악을 만들고 싶지만 전문 지식이 없는 일반 사용자, 커버곡을 빠르게 제작·공유하고 싶은 크리에이터 |
| **RISK** | MiniMax API 응답시간 100초+, URL 24시간 만료, music-cover 유료($0.15/트랙) 과금, Supabase Storage 용량 |
| **SUCCESS** | 음악 생성 + 커버 자동 첨부, 카카오/구글 로그인 + 온보딩, 프로필 이미지 업로드·변경·삭제, 페이지별 URL 라우팅, 헤더↔프로필↔플레이어 아바타 일관성 |
| **SCOPE** | Phase 1: API+생성 UI (완료) / Phase 2: Auth+온보딩+프로필+라우팅 (완료) / Phase 3: Supabase songs DB+Storage 영속화 (다음) / Phase 4: 검색·팔로우·댓글 (이후) |

---

## 1. Overview

### 1.1 Purpose

MiniMax Music/Image API와 Supabase Auth/Storage를 연동하여, 텍스트 프롬프트로 곡을 생성하고 자신의 정체성(프로필)으로 보관·공유할 수 있는 음악 SNS MVP를 구축한다.

### 1.2 Background

- MiniMax: `music-2.6-free`(무료/RPM 제한), `music-2.0`($0.03/트랙), `music-cover-free`(무료 커버) 모델 제공
- Supabase: Auth(Google/Kakao OAuth), Storage(profile-images 버킷), profiles 테이블 (id, username, display_name, avatar_url, cover_url, onboarding_done, onboarding_source, onboarding_ai_exp, onboarding_goals)
- LocalStorage 기반 곡/컬렉션 저장은 현재 유지, Phase 3에서 Supabase DB로 마이그레이션 예정
- Next.js App Router 기반 페이지별 URL 라우팅 (/, /library, /explore, /profile/[username])

### 1.3 Related Documents

- MiniMax Music/Image API: https://platform.minimax.io/docs
- Supabase Plan: `docs/01-plan/features/supabase-infra.plan.md`

---

## 2. Scope

### 2.1 In Scope — Phase 1 (음악 생성 파이프라인, 완료)

- [x] MiniMax Music API 연동 (music-2.6-free, music-2.0, music-cover-free)
- [x] 커버 이미지 자동 생성 (image-01, 병렬 처리)
- [x] 모델 선택 드롭다운 (beta 뱃지, minimax.webp 아이콘)
- [x] 보컬 성별 → 프롬프트 자동 주입 (female/male vocals)
- [x] 가사 없음 → 인스트루멘탈 자동 처리
- [x] 음원 커버 생성 (music-cover-free + audio_base64)
- [x] 저작권 안내 팝업 (1회 + localStorage)
- [x] GlobalMiniBar 그리드 레이아웃 (재생 컨트롤 센터 정렬)
- [x] SongEditModal 리디자인 (2:3 썸네일, PublishModal 패턴)
- [x] `coverImage` → Song 타입 + 3개 컴포넌트 적용
- [x] **생성 중 UX 개선**: 스켈레톤 제거 → 제목/프롬프트/태그 즉시 표시, 썸네일만 스피너 (Suno 패턴)
- [x] **GlobalMiniBar 아티스트 이름**: 제목 하단 표시, `ownerName` 컨텍스트 전파

### 2.2 In Scope — Phase 2 (인증·온보딩·프로필, 완료)

- [x] **카카오/구글 OAuth 로그인 모달** (이미지 좌측, 통일된 카피)
- [x] **4단계 온보딩 모달**: ①유입경로 ②AI 경험 ③목표 ④이름/아이디 (랜덤 추천 + 실시간 중복검사)
- [x] 온보딩 완료 시 `supabase.auth.updateUser({ username, full_name })` 동기화
- [x] **프로필/커버 이미지 업로드** (Canvas WebP 변환 → Supabase Storage `profile-images`)
- [x] **이미지 변경·삭제** 호버 오버레이 (아바타 100px, 커버 1064×368)
- [x] **헤더 아바타 ↔ 프로필 ↔ 곡 상세 ↔ 미니바 실시간 동기화** (`profile-avatar-updated` 이벤트)
- [x] **6색 팔레트 (bg/text 쌍)**: 기본 프로필/커버 컬러 통일, HSL 기반 결정적 매핑
- [x] **페이지별 URL 라우팅**: `/`(create), `/library`, `/explore`, `/profile/[username]` — 브라우저 뒤로가기 정상 동작
- [x] **로그아웃 처리**: localStorage 정리 + UI 즉시 갱신 (곡/컬렉션/아바타/이름 클리어)
- [x] 프로필 패널 디자인: 아바타+이름 커버 내부 통합, 텍스트 `text-3xl font-bold`, 6색 팔레트 적용
- [x] 곡 상세 페이지 아바타: 업로드 이미지 표시 + 폴백

### 2.3 In Scope — Phase 3 (Supabase 곡 DB, 진행 예정)

- [ ] `songs` 테이블 설계 (id, owner_id, title, prompt, genre, mood, lyrics, audio_url, cover_url, duration, published, created_at)
- [ ] LocalStorage → Supabase DB 마이그레이션 (songService 재작성)
- [ ] MiniMax API 응답(24시간 URL) → Supabase Storage로 영속 저장
- [ ] `collections` 테이블 연동
- [ ] music-cover 유료 모델 구독자 잠금

### 2.4 Out of Scope (현재)

- 검색 기능 (Phase 4)
- 팔로우/팔로워 시스템 (Phase 4)
- 댓글 기능 (Phase 4)
- 쇼츠 등록 (Phase 4)
- Music Cover Preprocess 2-step 워크플로우 (`cover_feature_id`)
- 가사 자동 최적화 (`lyrics_optimizer`) — 의도적 제거

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|---------|---------|------|
| FR-01 | 텍스트 스타일 프롬프트로 음악 생성 | P0 | ✅ |
| FR-02 | 모델 선택 (2.6-free / 2.0 / cover-free) | P0 | ✅ |
| FR-03 | 커버 이미지 자동 생성 및 곡에 첨부 | P1 | ✅ |
| FR-04 | 보컬 성별 프롬프트 반영 | P1 | ✅ |
| FR-05 | 가사 없음 → 인스트루멘탈 처리 | P1 | ✅ |
| FR-06 | 참조 음원 업로드로 커버곡 생성 | P1 | ✅ |
| FR-07 | 저작권 안내 팝업 (1회 + 다시보지않기) | P1 | ✅ |
| FR-08 | 카카오/구글 OAuth 소셜 로그인 | P0 | ✅ |
| FR-09 | 4단계 온보딩 (유입/AI경험/목표/이름·아이디) | P0 | ✅ |
| FR-10 | 온보딩 → auth metadata 자동 동기화 | P0 | ✅ |
| FR-11 | 프로필/커버 이미지 업로드·변경·삭제 (WebP 변환) | P0 | ✅ |
| FR-12 | 헤더/프로필/플레이어 아바타 실시간 동기화 | P0 | ✅ |
| FR-13 | 페이지별 URL 라우팅 (브라우저 뒤로가기) | P0 | ✅ |
| FR-14 | 로그아웃 시 곡 목록/UI 즉시 클리어 | P0 | ✅ |
| FR-15 | 생성 중 즉시 정보 표시 + 썸네일 스피너 | P1 | ✅ |
| FR-16 | GlobalMiniBar 아티스트 이름 표시 | P1 | ✅ |
| FR-17 | Supabase `songs` DB 저장/조회 | P0 | 🔜 |
| FR-18 | Supabase Storage 오디오/이미지 영속화 | P0 | ✅ |
| FR-19 | music-cover 유료 모델 구독자 잠금 | P2 | 🔜 |

### 3.2 Non-Functional Requirements

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-01 | 음악 생성 응답시간 | 100초 내외 (API 특성상 허용) |
| NFR-02 | 이미지 생성 병렬 처리 | 음악 생성과 동시 진행 |
| NFR-03 | API URL 만료 대응 | 24시간 내 Supabase Storage로 이전 (Phase 3) |
| NFR-04 | 429 에러 처리 | 사용자 안내 메시지 표시 |
| NFR-05 | 프로필 이미지 용량 최적화 | WebP 변환, 아바타 max 400px / 커버 max 1200px, quality 0.85 |
| NFR-06 | 인증 상태 변경 반영 | 로그인/로그아웃/온보딩 즉시 UI 동기화 |
| NFR-07 | URL 상태 보존 | 새로고침 시 현재 페이지 유지 (App Router) |

---

## 4. Technical Design

### 4.1 음악 생성 파이프라인

```
POST /api/generate
  ├── generateSong()       → music-2.6-free / music-2.0 / music-cover-free
  └── generateCoverImage() → image-01 (병렬)
      ↓
  { audioUrl, lyrics, coverUrl }
      ↓
  songService.save() → LocalStorage (Phase 3에서 Supabase DB 이전 예정)
      ↓
  UI: 제목/프롬프트/태그 즉시 표시, 썸네일만 스피너
```

### 4.2 인증·온보딩 플로우

```
LoginModal (Google/Kakao)
  ↓ supabase.auth.signInWithOAuth
/auth/callback
  ↓
HomeLayout useEffect: profiles.onboarding_done 확인
  ├── 미완료 → OnboardingModal (4 step) → upsert profiles + auth.updateUser
  └── 완료    → 정상 진입
```

### 4.3 프로필 이미지 시스템

```
ProfilePanel (호버 오버레이)
  ↓ toWebp(file, maxPx) → Canvas API
Supabase Storage `profile-images/{userId}/avatar.webp` (upsert)
  ↓
profiles.avatar_url 업데이트
  ↓
window.dispatchEvent('profile-avatar-updated', detail: url)
  ↓
HomeLayout / MyWorkPanel 리스너 → 헤더 + 미니바 즉시 반영
```

### 4.4 라우팅 구조

| URL | Section | 진입 컴포넌트 |
|-----|---------|--------------|
| `/` | create | `HomeLayout initialSection="create"` |
| `/library` | archive | `HomeLayout initialSection="archive"` |
| `/explore` | explore | `HomeLayout initialSection="explore"` |
| `/profile/[username]` | profile | `HomeLayout initialSection="profile" initialProfileUsername` |
| `/notifications` | notifications | `HomeLayout initialSection="notifications"` |

### 4.5 모델 구조

| 모델 ID | 용도 | 요금 | 잠금 |
|---------|------|------|------|
| music-2.6-free | 텍스트→음악 | 무료 (RPM 제한) | - |
| music-2.0 | 텍스트→음악 | $0.03/트랙 | - |
| music-cover-free | 음원 커버 | 무료 (RPM 제한) | - |
| music-2.6 | 텍스트→음악 Pro | $0.15/트랙 | 구독자 (Phase 3) |

### 4.6 주요 파일

```
app/
  HomeLayout.tsx                 — 전체 레이아웃 + 라우팅 + 헤더 아바타/온보딩 트리거
  page.tsx / library/page.tsx / explore/page.tsx / profile/[username]/page.tsx — 페이지 래퍼
  api/generate/route.ts          — 음악+이미지 병렬 생성 엔드포인트
components/
  LoginModal.tsx                 — 소셜 로그인 모달 (Google/Kakao/Apple/Email)
  OnboardingModal.tsx            — 4단계 온보딩
  SongDetailPage.tsx             — 곡 상세 (ownerAvatarUrl 표시)
  GlobalMiniBar.tsx              — 미니 플레이어 (제목 + 아티스트명)
  AuthProvider.tsx               — Supabase Auth 컨텍스트
contexts/GlobalPlayerContext.tsx — 전역 플레이어 (ownerAvatarUrl, ownerName)
features/
  song/components/SongForm.tsx   — 생성 폼
  song/components/MyWorkPanel.tsx — 내 음악 (PendingSongItem 포함)
  song/hooks/useSongGeneration.ts — 생성 훅 + CustomEvent dispatch
  explore/components/ProfilePanel.tsx — 프로필 (아바타+이름+커버 통합)
  explore/components/ExplorePanel.tsx — 탐색
lib/supabase/client.ts            — Supabase 클라이언트
services/
  minimax.service.ts              — MiniMax API
  song.service.ts                 — LocalStorage 곡 서비스 (→ Phase 3 마이그레이션)
types/domain.ts                   — Song / UserProfile / PublicSong
```

---

## 5. Risks

| 위험 | 영향도 | 대응 |
|------|-------|------|
| MiniMax API URL 24시간 만료 | 높음 | Phase 3에서 Supabase Storage 이전 |
| music-2.6-free RPM 제한 | 중간 | 429 에러 시 music-2.0 사용 안내 |
| music-cover 과금 ($0.15) | 중간 | 구독자 잠금 (Phase 3) |
| 커버 이미지 생성 실패 | 낮음 | null 허용 + 그라데이션 폴백 |
| 프로필 이미지 용량 누적 | 중간 | WebP 변환 + maxPx 적용 (avatar 400 / cover 1200) |
| 온보딩 중단 시 빈 프로필 | 중간 | `onboarding_done` 플래그 + 재진입 시 모달 강제 표시 |
| user_metadata 캐시 지연 | 낮음 | `supabase.auth.updateUser` + 화면 리프레시 패턴 |

---

## 6. Success Criteria

- [x] music-2.0 생성 테스트 완료
- [x] 커버 이미지 Song에 저장 및 3개 컴포넌트 표시
- [x] 카카오 로그인 + 온보딩 + 프로필 생성 플로우 완료
- [x] 구글 로그인 동작
- [x] 프로필 이미지 업로드(WebP) → 새로고침 후 유지
- [x] 커버 이미지 업로드/변경/삭제 동작
- [x] 헤더/프로필/곡상세/미니바 아바타 일관성
- [x] 페이지별 URL 라우팅 + 뒤로가기
- [x] 로그아웃 시 곡 목록·아바타·이름 즉시 클리어
- [x] 생성 중 곡 정보 즉시 표시 + 썸네일 스피너
- [x] 미니바 제목 하단 아티스트 이름 표시
- [ ] Supabase `songs` 테이블 마이그레이션 후 새로고침 시 곡 목록 유지
- [x] MiniMax 결과물의 Supabase Storage 영속화
- [ ] music-cover-free 커버 생성 테스트

---

## 7. Next Steps

1. **Supabase songs 테이블 설계 + 마이그레이션** — LocalStorage 제거, owner_id 기반 조회
2. **API URL 영속화** — MiniMax 응답 audio/image를 Supabase Storage `songs/{userId}/{songId}.{ext}` 로 저장
3. **collections 테이블 연동**
4. **music-cover 구독 잠금** — 플랜 체계와 연동
5. **검색·팔로우·댓글 기획** — Phase 4 기능 로드맵
