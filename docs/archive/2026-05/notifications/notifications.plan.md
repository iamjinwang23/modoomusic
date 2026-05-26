---
template: plan
version: 1.3
feature: notifications
---

# notifications Planning Document

> **Summary**: 좋아요·새 곡 완성·시스템 공지·팔로우·댓글 5종 알림을 Supabase에 적재하고, 데스크톱은 사이드바 위 오버레이 패널·모바일은 풀 페이지로 노출
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
| **Problem** | 사용자 활동(좋아요·곡 완성)이 toast로만 휘발돼 다시 확인할 수 없고, 운영자가 사용자에게 공지를 보낼 채널이 없음. 사이드바 알림 메뉴는 placeholder 상태 |
| **Solution** | Supabase `notifications` 테이블(RLS) + 데스크톱 좌측 오버레이 패널(~360px) / 모바일 `/notifications` 라우트. 사이드바 점 배지로 미읽음 표시 |
| **Function/UX Effect** | 좋아요·곡 완성·공지 영구 기록, 클릭 시 타입별 적절한 대상으로 이동(곡 상세/프로필/모달). 패널 자체는 라우팅 변화 없음 → 사용 중 컨텍스트 유지 |
| **Core Value** | 사용자 활동 흔적의 가시화 → 재방문 유도 + 운영자-사용자 1대N 소통 채널 확보 (소셜 2차 확장 발판) |

---

## Context Anchor

> Auto-generated from Executive Summary. Propagated to Design/Do documents for context continuity.

| Key | Value |
|-----|-------|
| **WHY** | 좋아요·새 곡 완성이 toast로만 휘발돼 사용자 활동 흔적이 남지 않음 + 운영자 공지 채널 부재 |
| **WHO** | MONO 모든 로그인 사용자 (수신자) + 비누컴퍼니 운영자 (시스템 공지 발신자) |
| **RISK** | RLS 미흡 시 타 사용자 알림 노출 / 좋아요 트리거 부하 / 데스크톱 오버레이가 미니바·곡 상세와 z-index 충돌 |
| **SUCCESS** | 좋아요 발생 → 1초 내 알림 적재 / 패널 열기·아이템 이동 200ms 미만 / 미읽음 점 배지 정확도 100% |
| **SCOPE** | Phase 1: 5종 알림 스키마·RLS·서버 트리거·패널 UI·점 배지·읽음 처리 / Out: 푸시·이메일·운영자 admin UI |

---

## 1. Overview

### 1.1 Purpose

사용자가 받은 활동(좋아요)·시스템 메시지·자신이 시작한 작업(곡 생성 완료)을 한 곳에 모아 보고, 다시 진입할 수 있게 한다. 운영자가 사용자 그룹에 일방향 공지를 보낼 수 있는 인프라를 확보한다.

### 1.2 Background

- 1차 출시 현재 좋아요는 카운트만 증가하고 받은 사람에게 신호가 없음
- 곡 생성 완료 알림은 toast (자동 사라짐) → 다른 페이지에 있다 돌아오면 못 봄
- 운영자가 사용자에게 신규 기능·공지를 보낼 채널이 GitHub README/외부 채널뿐
- 사이드바·BottomNav에 "알림" 메뉴는 이미 존재하지만 `/notifications` 페이지는 "알림 준비 중" placeholder

### 1.3 Related Documents

- 이전 갭 분석: `docs/03-analysis/today-song-mvp.analysis.md` §8.6 (Design §7에 notifications 페이지 누락 항목 있음)
- UI 컨벤션 메모리: `~/.claude/projects/-Users-jinwang-Desktop-minimax-wrap/memory/project_ui_conventions.md` (이벤트 버스·z-index·profileColor)
- 참조 패턴: Mureka 알림 패널 (사이드바 옆 오버레이 슬라이드)

---

## 2. Scope

### 2.1 In Scope

- [ ] Supabase `notifications` 테이블 + RLS + 인덱스
- [ ] 좋아요 발생 시 알림 INSERT (Supabase trigger 또는 API 핸들러에서 직접)
- [ ] 곡 생성 완료 시 본인에게 알림 INSERT (`app/api/generate/route.ts`)
- [ ] 시스템 공지 INSERT 경로 (운영자가 SQL 직접 — admin UI는 별도)
- [ ] 팔로우·댓글 알림 스키마 자리 확보 (소셜 2차 기능 도입 시 즉시 사용)
- [ ] `notificationService` (list·markAsRead·unreadCount)
- [ ] 데스크톱 알림 오버레이 패널 (사이드바 위, ~360px, backdrop 클릭으로 닫음)
- [ ] 모바일 `/notifications` 풀 페이지 리스트 (기존 placeholder 교체)
- [ ] 사이드바 + BottomNav 알림 메뉴 점 배지 (미읽음 > 0)
- [ ] 알림 클릭 시 타입별 적절한 대상으로 이동 + 해당 알림 읽음 처리
- [ ] 한국어 문구 (제목·본문·빈 상태)

### 2.2 Out of Scope

- 푸시 알림 (브라우저 Push API·FCM)
- 이메일 알림
- 운영자용 공지 발송 admin UI — 1차는 Supabase Dashboard SQL로 INSERT
- 실시간 구독 (Supabase Realtime) — 1차는 패널 열 때 / 마운트 시 fetch만
- 알림 설정(끄기·필터)
- 묶음 알림 ("3명이 좋아했어요" 등의 집계 표시) — 1차는 단건 표시

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `notifications` 테이블 5종 타입 enum (`like`, `song_complete`, `system`, `follow`, `comment`) | High | Pending |
| FR-02 | RLS: 본인(`user_id = auth.uid()`) 알림만 SELECT/UPDATE 가능, INSERT는 service role 또는 trigger만 | High | Pending |
| FR-03 | 좋아요 INSERT/DELETE 시 곡 소유자에게 알림 자동 생성 (본인 곡 자기 좋아요는 제외) | High | Pending |
| FR-04 | 곡 생성 완료 시 본인에게 `song_complete` 알림 INSERT | High | Pending |
| FR-05 | 시스템 공지(`system`) — 운영자가 `target_user_id NULL`로 INSERT하면 전 사용자에게 표시되는 패턴 OR 사용자별 INSERT | High | Pending |
| FR-06 | 데스크톱: 사이드바 "알림" 클릭 → 라우트 변경 없이 오버레이 패널 토글 (`pathname` 기반 라우팅 X) | High | Pending |
| FR-07 | 모바일: 사이드바·BottomNav "알림" 클릭 → `/notifications` 라우트로 풀 페이지 | High | Pending |
| FR-08 | 사이드바·BottomNav 알림 메뉴 우측 상단에 점 배지(미읽음 > 0) | High | Pending |
| FR-09 | 알림 클릭 시: like/comment → 곡 상세 / follow → 그 사용자 프로필 / song_complete → 곡 상세 / system → 인앱 모달 또는 외부 링크 | High | Pending |
| FR-10 | 알림 클릭 시 해당 row `read_at` 업데이트 (개별 처리, 패널 일괄 X) | High | Pending |
| FR-11 | 빈 상태("아직 받은 알림이 없어요") + 로딩 스켈레톤 | Medium | Pending |
| FR-12 | 알림 텍스트는 한국어, 상대 시간 표시 ("3시간 전") | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 좋아요 → 알림 적재 < 1s, 패널 fetch < 300ms | 수동 측정 |
| Security | RLS — 본인 알림 외 접근 차단, 시스템 공지 변조 불가 | Supabase advisors + 수동 시도 |
| Accessibility | 알림 패널 ESC 닫기, focus trap, aria-label | 키보드 테스트 |
| 일관성 | 곡 소유자 hue 전파(이미 ownerAvatarHue 패턴) 재사용, 다크 톤 토큰 준수 | UI 리뷰 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-12 모두 구현
- [ ] Supabase 마이그레이션 적용 + RLS 정책 등록
- [ ] 좋아요 5번 → 미읽음 점 배지 노출, 패널에 5건 표시 확인
- [ ] 알림 1건 클릭 → 해당 알림만 `read_at` 채워지고 배지 갱신 확인
- [ ] 데스크톱·모바일에서 각각 의도한 형태(오버레이/풀페이지)로 노출 확인
- [ ] 시스템 공지 INSERT → 즉시(또는 새로고침으로) 노출 확인
- [ ] `pnpm tsc --noEmit` 통과

### 4.2 Quality Criteria

- [ ] 본인 곡 자기 좋아요는 알림 생성되지 않음
- [ ] 다른 유저 알림이 절대 본인에게 노출되지 않음 (RLS 검증)
- [ ] z-index 충돌 없음 (미니바·곡 상세 풀스크린과)
- [ ] 한국어 친근 존댓말, 이모지 회피

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| RLS 정책 누락으로 타 사용자 알림 노출 | High | Medium | Supabase advisors 통과 + 수동 cross-account 테스트 |
| Supabase trigger 디버깅 어려움 (silent fail) | Medium | Medium | 1차는 like API 핸들러에서 직접 INSERT (trigger 회피). 안정화 후 trigger 검토 |
| 좋아요 toggle 빈도 높을 때 알림 중복 적재 | Medium | Medium | DELETE 시 알림 미생성 + 24h 내 중복 알림 dedupe 또는 INSERT만 |
| 시스템 공지의 "전 사용자 broadcast" 구현 | Medium | Low | 1차는 `target_user_id NULL = 전체` + 클라이언트가 `IS NULL OR user_id = me`로 UNION 조회 (또는 사용자별 행 복제 — 후자가 read 상태 관리 단순) |
| 데스크톱 오버레이가 모바일 미니바·곡 상세와 z-index 충돌 | Medium | Low | 알림 패널 z-index를 `z-[58]`(미니바보다 위, 곡 상세 풀스크린 `z-[55]`보다 위, SongEditModal `z-[60]`보다 아래)로 결정 |
| 알림 개수가 누적돼 패널이 무거워짐 | Low | Medium | 초기 fetch limit 30, "더 보기" 페이지네이션 (또는 무한 스크롤은 2차) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `notifications` 테이블 | DB Model | 신규 생성 + RLS + 인덱스(`user_id`, `created_at DESC`) |
| `likes` 테이블 / 좋아요 API | API | INSERT 시 알림 생성 로직 추가 (또는 trigger) |
| `POST /api/generate` | API | 성공 시점에 `notifications` INSERT 1행 |
| 사이드바(`app/(main)/layout.tsx`) | UI | 알림 메뉴: 데스크톱 클릭 핸들러 변경(라우팅 → 오버레이 토글) + 점 배지 |
| `BottomNav.tsx` | UI | 알림 탭에 점 배지 |
| `/notifications` 페이지 | UI | placeholder → 풀 페이지 리스트 (모바일 진입 경로) |
| 신규: `NotificationPanel.tsx` | UI | 데스크톱 오버레이 패널 |
| 신규: `services/notification.service.ts` | Service | list, markAsRead, unreadCount |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| 좋아요 API | UPDATE | `services/song.service.ts:update({ liked })`, `app/api/songs/[id]/like/route.ts` (있다면) | Needs verification — 좋아요 토글 후 알림 INSERT 분기 |
| `POST /api/generate` | CREATE | `features/song/hooks/useSongGeneration.ts` → `/api/generate` | Needs verification — 응답 처리 변경 없음 (서버에서만 INSERT) |
| 사이드바 알림 메뉴 | NAV | `app/(main)/layout.tsx:26` (NAV_ITEMS) | Breaking — 데스크톱은 `Link` 대신 button + state toggle로 분기. 모바일은 그대로 Link |
| BottomNav 알림 탭 | NAV | `components/BottomNav.tsx:29` | None — 모바일은 라우팅 유지 |

### 6.3 Verification

- [ ] RLS — 두 계정으로 동시 로그인해 cross-account 조회 차단 확인
- [ ] 좋아요 빠른 토글에 알림 중복 생성 없는지
- [ ] `useShellScroll` 같은 과거 패턴 잔재가 없는지 (이미 제거됨)
- [ ] z-index 충돌: 곡 상세 풀스크린·모달 동시 열림 시 동작

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | 단순 — | 정적 — | ☐ |
| **Dynamic** | features/ 모듈·Supabase 통합 | 백엔드 있는 웹앱 | ☑ |
| **Enterprise** | 엄격한 레이어 분리 | 대규모 시스템 | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js 15 (확정) | Next.js 15 App Router | 기존 stack |
| State (패널 open) | Context / 이벤트 버스 / Zustand | **이벤트 버스 + useState** (shell layout에 state) | 기존 `view-song`·`view-profile` 패턴과 통일 |
| Data fetching | RPC / select / Realtime | select + 폴링 X (마운트·열기 시 fetch) | 단순. Realtime은 2차 |
| 점 배지 갱신 | polling / subscription / event | 페이지 마운트 + 좋아요·곡완성 이벤트 발생 시 무효화 | 이미 있는 이벤트 패턴 재사용 |
| 알림 INSERT | Postgres trigger / API 핸들러 | **API 핸들러** (1차) | 디버깅 쉬움. trigger는 안정화 후 |
| Broadcast(시스템) | `target_user_id NULL`이 전체 / 사용자별 행 복제 | **사용자별 행 복제** | read 상태 관리·RLS 단순. 운영자가 SQL `INSERT … FROM profiles` |
| Styling | Tailwind v4 (확정) | Tailwind v4 | 기존 |

### 7.3 Clean Architecture Approach

```
Dynamic 레벨:

app/
  (main)/
    layout.tsx          # 사이드바 알림 메뉴 + 점 배지 + NotificationPanel 마운트
    notifications/
      page.tsx          # 모바일 풀 페이지 (Server·Client 혼합)
  api/
    generate/route.ts   # 곡 완성 시 notifications INSERT
    songs/[id]/like/route.ts  # 좋아요 시 알림 INSERT (없으면 생성)

components/
  NotificationPanel.tsx     # 데스크톱 오버레이 패널
  NotificationItem.tsx      # 단일 아이템 (타입별 분기 렌더)

services/
  notification.service.ts   # list / markAsRead / unreadCount

types/domain.ts             # Notification 타입 추가
```

이벤트 버스 신규:
- `notifications-updated` — 패널 갱신·점 배지 재조회 트리거

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] CLAUDE.md → AGENTS.md import (Next.js 15 주의)
- [x] `~/.claude/.../memory/` 자동 메모리 — UI 컨벤션·이벤트 버스 정리됨
- [x] TypeScript strict (tsc 통과 필수)
- [x] Tailwind v4
- [x] Supabase RLS 패턴 (`songs`, `profiles`, `likes` 등 기존)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 알림 텍스트 톤 | 미정 | "{name}님이 {song}를 좋아했어요" 등 한국어 친근 존댓말 | High |
| 빈 상태 카피 | 미정 | "아직 받은 알림이 없어요" | Medium |
| 시스템 공지 INSERT 절차 | 미정 | Supabase SQL 스니펫 예시(`INSERT INTO notifications SELECT id, 'system', ...`) → 운영자용 가이드 | Medium |
| 알림 시각 포맷 | 미정 | `n분 전 / n시간 전 / n일 전 / YYYY.MM.DD` | Medium |

### 8.3 Environment Variables Needed

신규 없음 — 기존 Supabase 키 사용.

---

## 9. Next Steps

1. [ ] `/pdca design notifications` — 3가지 아키텍처 옵션 비교 + 선택
2. [ ] 디자인 안에서 알림 패널 폭/위치/애니메이션 최종 픽스
3. [ ] DB 마이그레이션 SQL 초안 (테이블·RLS·트리거 후보)
4. [ ] `/pdca do notifications` — 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-26 | Initial draft (Plan) | jinwang |
