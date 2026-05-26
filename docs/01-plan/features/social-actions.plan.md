---
template: plan
version: 1.3
feature: social-actions
---

# social-actions Planning Document

> **Summary**: 좋아요(다른 사람 곡)·팔로우/팔로잉 full stack 완성 — fake 토글된 UI에 실제 DB·API·알림 연동
>
> **Project**: minimax-test (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-26
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 인프라(DB·RLS·count 트리거)는 다 있지만 `PublicSongCard` 좋아요·`ProfilePanel` 팔로우 버튼이 로컬 state만 토글 → 새로고침 시 사라지고 다른 사용자에게 안 보임. `follow` 알림 트리거 부재 |
| **Solution** | `POST /api/profiles/[id]/follow` 신규 + `PublicSong.isLiked`·`UserProfile.isFollowing` SELECT 채우기 + 모든 좋아요·팔로우 UI를 낙관적 업데이트 패턴으로 API 연동 |
| **Function/UX Effect** | 좋아요·팔로우 영구 기록, 카운트 즉시 반영, follow 알림 트리거. 비로그인 시 로그인 모달, 실패 시 롤백+토스트 |
| **Core Value** | 사용자 간 상호작용 가능해짐 → 알림 시스템 실 효용 확보 + 소셜 그래프(팔로우) 데이터 축적 시작 (피드 개인화·쇼츠 등 2차 기능 발판) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 좋아요·팔로우 UI가 fake → 사용자 간 실제 상호작용 불가능 + follow 알림 발화 X |
| **WHO** | MONO 로그인 사용자 (서로 좋아요·팔로우) + 운영자(소셜 그래프 데이터 시작) |
| **RISK** | 낙관적 UI 롤백 누락 시 UI/DB 불일치 / 자기 자신 팔로우 / 빠른 토글 시 race condition |
| **SUCCESS** | 좋아요 토글 200ms 내 UI 반영, 새로고침 후 상태 유지 / 팔로우 시 follower_count +1 즉시 / follow 알림 1초 내 적재 |
| **SCOPE** | Phase 1: PublicSongCard 좋아요 완성 + isLiked SELECT + 팔로우 API + isFollowing SELECT + ProfilePanel 와이어링 + follow 알림 / Out: 팔로워 리스트·피드 필터·차단 |

---

## 1. Overview

### 1.1 Purpose

이미 구축된 좋아요/팔로우 인프라(DB·RLS·count 트리거)와 알림 시스템을 실제 사용자 경험으로 연결한다. 가짜로 동작하던 버튼들을 진짜 동작으로 바꾸고, 알림이 실제로 트리거되도록 마지막 한 단계를 채운다.

### 1.2 Background

- `001_initial_schema.sql`에 `likes`·`follows` 테이블·RLS·count 자동 트리거가 모두 구축됨
- `010_notifications.sql`에 `follow` 타입 정의됨
- 알림 시스템(이전 사이클)에서 `like` 타입 트리거는 `POST /api/songs/[id]/like`로 완성
- 그러나 다음이 누락:
  - `PublicSongCard.handleLike`는 `setLiked(v => !v)` 만 호출 (DB X)
  - `ProfilePanel`의 팔로우 버튼은 `setFollowing(v => !v)` 만 호출 (DB X)
  - `PublicSong.isLiked`는 `services/explore.service.ts:48`에서 항상 `false` 고정 ("현재 미구현" 주석)
  - 팔로우 API 라우트가 없음 → `follow` 알림 트리거 X

### 1.3 Related Documents

- 이전 사이클: `docs/04-report/notifications.report.md` §3 (FR-09 follow 라우팅, 트리거 자리 확보)
- DB 스키마: `supabase/migrations/001_initial_schema.sql` (likes, follows, count 트리거)
- UI 컨벤션 메모리: 이벤트 버스·hover 패턴·다크 토큰

---

## 2. Scope

### 2.1 In Scope

- [ ] `POST /api/profiles/[id]/follow` 신규 라우트 (토글 + follow 알림 INSERT + 자기 자신 차단)
- [ ] `PublicSongCard.handleLike` → 새 좋아요 API 호출 + 낙관적 UI + 실패 시 롤백
- [ ] `ProfilePanel` 팔로우 버튼 → 새 follow API 호출 + 낙관적 UI + follower_count 즉시 반영
- [ ] `services/explore.service.ts`: `PublicSong.isLiked` SELECT (피드 fetch 시 `likes` join)
- [ ] `services/explore.service.ts`: `UserProfile.isFollowing` SELECT (`getProfile` 시 `follows` 확인)
- [ ] 비로그인 사용자 좋아요·팔로우 클릭 → `open-login` 이벤트 디스패치
- [ ] 실패 토스트 한국어
- [ ] 카운트 즉시 갱신 (낙관적): `PublicSong.likeCount`, `UserProfile.followerCount`

### 2.2 Out of Scope

- 팔로워/팔로잉 리스트 페이지 (count 클릭 시 모달)
- 팔로우 피드 필터 (팔로잉 사용자 곡만 보기)
- "좋아요한 곡 모음" 페이지
- 차단·뮤트
- 추천 사용자 (You might know)
- 좋아요 알림 묶음 ("3명이 좋아했어요")

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `POST /api/profiles/[id]/follow` — 토글 (INSERT/DELETE follows) + 본인 follow 시 400 차단 | High | Pending |
| FR-02 | `/api/profiles/[id]/follow` INSERT 시 알림 생성 (`type='follow'`, `actor_id=me`, `user_id=target`) — 본인 자신은 제외 (FR-01에서 이미 차단) | High | Pending |
| FR-03 | `PublicSongCard.handleLike` — `POST /api/songs/[id]/like` 호출 + 낙관적 UI + 실패 롤백 | High | Pending |
| FR-04 | `ProfilePanel` 팔로우 버튼 — `POST /api/profiles/[id]/follow` 호출 + 낙관적 UI + follower_count 즉시 갱신 | High | Pending |
| FR-05 | `services/explore.service.ts`: `PublicSong.isLiked` SELECT — 로그인 시 현재 사용자의 `likes` join, 비로그인 false | High | Pending |
| FR-06 | `services/explore.service.ts`: `UserProfile.isFollowing` SELECT — `getProfile`에서 본인 → other 사이 `follows` 확인 | High | Pending |
| FR-07 | 비로그인 사용자가 좋아요·팔로우 클릭 → `window.dispatchEvent(new Event('open-login'))` | High | Pending |
| FR-08 | 실패 시 한국어 토스트 ("좋아요 처리에 실패했어요" / "팔로우에 실패했어요") + UI 롤백 | High | Pending |
| FR-09 | 카운트 항상 표시 (좋아요 0건이어도) — 현재 PublicSongCard 동작 유지 | Medium | Pending |
| FR-10 | 팔로우 버튼 톤: 미팔로우 = `bg-violet-600 text-white`, 팔로잉 = `border border-white text-white bg-transparent` — 현재 유지 | Medium | Pending |
| FR-11 | follow 알림 클릭 시 → actor 프로필로 이동 (notifications §5.3 라우팅 이미 정의됨, 단 actorName ≠ username 이슈는 본 사이클에서 actor username payload 추가로 해결) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 좋아요·팔로우 토글 → 낙관적 UI 0ms, API < 300ms | 수동 측정 |
| Security | RLS — 좋아요/팔로우는 본인 명의만 INSERT/DELETE 가능 (already in 001 migration). API에서 auth 가드 + 자기 자신 follow 차단 | 수동 cross-account 테스트 |
| Race condition | 동일 곡 좋아요 빠른 토글 → 마지막 의도만 반영. 서버 응답으로 동기화 | 수동 |
| 일관성 | follower_count 갱신은 DB 트리거 + 클라이언트 낙관적 +1/-1 | 수동 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~11 모두 구현
- [ ] `PublicSongCard`에서 좋아요 → 새로고침 후 상태 유지 + likeCount DB 반영
- [ ] 다른 사용자 프로필에서 팔로우 → 새로고침 후 "팔로잉" 유지 + follower_count +1 DB 반영
- [ ] 팔로우 시 상대방 알림 패널에 "회원님을 팔로우했어요" 1건 추가됨
- [ ] 알림 클릭 시 follower의 프로필로 정확히 이동 (username 기반)
- [ ] 자기 자신 팔로우 시도 → 400 (UI에선 본인 프로필에 팔로우 버튼 자체 안 노출)
- [ ] 비로그인 시 좋아요·팔로우 클릭 → 로그인 모달
- [ ] `pnpm tsc --noEmit` 통과

### 4.2 Quality Criteria

- [ ] 낙관적 UI 롤백 누락 없음 (try/catch 양쪽 처리)
- [ ] 한국어 친근 존댓말 카피
- [ ] 다크 톤 토큰 준수

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 낙관적 UI 롤백 누락 → UI/DB 불일치 | Medium | Medium | try/finally 패턴 + 서버 응답으로 state 동기화 |
| 자기 자신 팔로우 | Low | Low | 서버에서 400, UI에서 본인 프로필이면 팔로우 버튼 안 그림 (이미 isSelf 분기) |
| 빠른 토글 race condition (좋아요 on/off 5번 연속) | Low | Medium | 진행 중 fetch 있으면 추가 클릭 무시 (debounce) 또는 마지막 응답으로 강제 동기화 |
| `isLiked` SELECT가 곡 30개 × 1쿼리 → N+1 | Medium | Medium | 한 번에 join — `select … with likes!inner(user_id) where likes.user_id = me`로 단일 쿼리. 또는 likes를 별도 1쿼리로 가져와 클라이언트 매핑 |
| follow 알림 클릭 시 actorName이 displayName이라 username 라우팅 실패 (notifications Gap #4) | Medium | High | 본 사이클에서 follow 알림 INSERT 시 `payload`에 `username` 포함. NotificationPanel handleClick이 payload.username 우선 사용 |
| `isFollowing` SELECT가 본인일 때 무의미 → 매번 자기 자신 체크 추가 | Low | Low | `getProfile`에서 username == 본인 username일 때 isFollowing 계산 skip |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `app/api/profiles/[id]/follow/route.ts` | API | 신규 — 토글 + 알림 INSERT |
| `services/explore.service.ts` | Service | SONG_SELECT에 `likes` join 추가 + `getProfile`에 `follows` 확인 추가 |
| `features/explore/components/PublicSongCard.tsx` | UI | handleLike에 fetch + 낙관적/롤백 |
| `features/explore/components/ProfilePanel.tsx` | UI | 팔로우 버튼 handler에 fetch + 낙관적/롤백 + follower_count 즉시 반영 |
| `components/NotificationPanel.tsx` | UI | follow 알림 클릭 시 payload.username 우선 사용 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `likes` 테이블 | INSERT/DELETE | `app/api/songs/[id]/like/route.ts` (이미 신규) + RLS 허용 (anon X, authenticated 본인만) | None — API 라우트에서 처리 |
| `follows` 테이블 | INSERT/DELETE | (없음 — 신규 라우트가 첫 consumer) | None |
| `notifications` 테이블 | INSERT (type='follow') | 신규 follow API에서 | None — RLS service role only 적용됨 |
| `PublicSong.isLiked` | READ | ExplorePanel, ProfilePanel, PublicSongCard 등 모든 곡 카드 | Needs verification — 기존 항상 false였으니 true도 처리되는지 |
| `UserProfile.isFollowing` | READ | ProfilePanel 팔로우 버튼 초기 상태 | 기존 undefined였음 |

### 6.3 Verification

- [ ] 좋아요 빠른 토글 → 서버 응답이 마지막 의도와 일치
- [ ] 본인 프로필에서 팔로우 버튼 안 보임
- [ ] 비공개 곡 카드는 PublicSongCard에 안 옴 (공개 곡만 fetch이므로 OK)
- [ ] follow 알림 INSERT의 payload에 username 포함되어 NotificationPanel 라우팅 정상

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic 레벨 (변경 없음).

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| State (낙관적) | useState 로컬 / 전역 store | 컴포넌트 로컬 useState | 단순. 카운트는 부모에서 받은 prop을 로컬 state로 미러링하여 +1/-1 |
| API 라우트 | profile-based / user-based | `/api/profiles/[id]/follow` (id = target user id) | RESTful, 명확 |
| `isLiked` SELECT 전략 | N+1 / 단일 join / 별도 쿼리 | **단일 join** (`likes!left(user_id)` 필터링) | 단순, 빠름 |
| `isFollowing` SELECT | profile fetch에 join | `getProfile`에서 1쿼리 추가 | 1회만 호출되므로 부담 X |
| follow 알림 payload | basic / username 포함 | username 포함 — `payload: { username: actor.username }` | NotificationPanel 라우팅 정확도 |
| 빠른 토글 처리 | debounce / inflight flag / 서버 응답 강제 동기화 | inflight flag (진행 중이면 추가 클릭 무시) | 단순 |

### 7.3 Clean Architecture Approach

```
app/
  api/
    profiles/[id]/follow/route.ts  # 신규
    songs/[id]/like/route.ts       # 기존 (이전 사이클)

services/
  explore.service.ts                # SONG_SELECT에 likes join + getProfile에 follows 확인

features/explore/components/
  PublicSongCard.tsx                # handleLike에 API 호출
  ProfilePanel.tsx                  # 팔로우 버튼 handler

components/
  NotificationPanel.tsx             # follow 알림 클릭 시 payload.username 우선
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] 낙관적 UI 패턴: SongDetailPage·GlobalMiniBar 좋아요에서 이미 사용 중
- [x] open-login 이벤트: BottomNav 프로필 탭에서 이미 사용
- [x] 한국어 친근 존댓말 토스트
- [x] notifications 테이블 + RLS service role INSERT

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| follow 알림 payload 스펙 | 미정 | `{ username: string }` — actor의 username | High |
| 낙관적 카운트 일관성 | 좋아요는 likeCount + (liked ? 1 : 0) 패턴 사용 중 | 팔로우도 followerCount + (following ? 1 : -1) 같이 통일 | Medium |

### 8.3 Environment Variables Needed

신규 없음.

---

## 9. Next Steps

1. [ ] `/pdca design social-actions` — 아키텍처 옵션 비교
2. [ ] 디자인 안에서 N+1 회피 SQL 패턴 픽스
3. [ ] `/pdca do social-actions` — 구현

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-26 | Initial draft (Plan) | jinwang |
