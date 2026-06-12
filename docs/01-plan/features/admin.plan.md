---
template: plan
version: 1.3
feature: admin
date: 2026-06-12
author: Jinwang
project: 모두의 노래 (MONO)
version_app: 0.1.0
---

# 어드민(Admin) Planning Document

> **Summary**: `is_admin=true` 사용자만 접근 가능한 운영 전용 페이지(`/admin`). 라이트 모드 디자인으로 본체와 시각적 분리. 크레딧 지급·신고 처리·사용자 관리·콘텐츠 관리·통계·공지·모델 운영을 SQL 없이 UI로 처리하고 모든 동작을 `admin_actions` 테이블에 감사 로그로 기록.
>
> **Project**: 모두의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: Jinwang
> **Date**: 2026-06-12
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 운영 작업(크레딧 지급·신고 처리 등)이 전부 Supabase SQL Editor에서 수동 — 위험·반복·기록 부재. 외부 사용자 늘면 운영 부담 가속. |
| **Solution** | `/admin` 라우트 + `is_admin` 가드 + 라이트 모드 layout group. 크레딧·신고·사용자·콘텐츠·통계·공지·모델 7개 모듈로 구성. 모든 동작은 `admin_actions` 감사 로그에 기록. |
| **Function/UX Effect** | SQL 없이 5분 안에 운영 처리 완료. 감사 로그로 사후 추적 가능. 라이트 모드로 운영자 모드 시각적 식별. |
| **Core Value** | 결제·앱 출시·외부 사용자 유입 전에 운영 인프라 정비 → 실수 방지 + 작업 속도 + 추적 가능성 확보. |

---

## Context Anchor

> Auto-generated from Executive Summary. Propagated to Design/Do documents for context continuity.

| Key | Value |
|-----|-------|
| **WHY** | 운영을 SQL 직접 실행에 의존 — 위험·반복·기록 부재. 결제·외부 사용자 받기 전 정비 필요. |
| **WHO** | `profiles.is_admin = true` 사용자 (현재: `iamjinwang23@gmail.com`만). 데스크톱 사용. |
| **RISK** | 크레딧 지급 권한 남용·실수, 어드민 권한 탈취 시 데이터 변조. 라이트 모드 토큰이 다크 모드 글로벌 스타일과 충돌. |
| **SUCCESS** | (1) SQL 없이 크레딧 지급·신고 처리 100% 가능 (2) 모든 어드민 동작이 `admin_actions`에 기록 (3) 비관리자 접근 시 redirect 0건 |
| **SCOPE** | v1: 7개 모듈 풀스코프. v2: 결제 환불·정산·실시간 알림. |

---

## 1. Overview

### 1.1 Purpose

운영 작업의 SQL 직접 실행 의존도를 없애고, 빈도 높은 동작(크레딧 지급·신고 처리)을 UI로 5분 안에 처리할 수 있게 한다. 모든 동작을 감사 로그에 남겨 사후 추적·실수 검출이 가능하게 한다.

### 1.2 Background

- 2026-06-10 사용자(na5892) 친구 초대 보너스 미적용 케이스 대응 시 Supabase SQL Editor로 수동 처리 → 실수 위험·기록 부재 노출
- 결제 인프라(Plus/Pro) 도입 시 환불·구독 관리 운영 빈도 증가 예상
- 외부 사용자 유입 시작되면 신고·차단 처리 빈도 증가 예상
- 현재 `profiles.is_admin` 컬럼 + 일일 100cr 분기 외 어드민 인프라 0

### 1.3 Related Documents

- 관련 마이그레이션: `supabase/migrations/027_admin_credit_grant.sql` (is_admin 컬럼)
- 신고 시스템 기존 코드: `components/SongReportModal.tsx`, `app/api/songs/[id]/report/route.ts`
- 친구 초대 시스템: `services/referral.service.ts`, `supabase/migrations/024_account_deletion.sql:199`

---

## 2. Scope

### 2.1 In Scope (v1 풀스코프)

- [ ] `app/(admin)/admin/layout.tsx` — 라이트 모드 + is_admin 가드 + 네비게이션 사이드바
- [ ] **크레딧 모듈**: 사용자 검색(username/email) + 보너스 지급/차감 폼 + 사유 입력 + 감사 로그
- [ ] **신고 모듈**: 신고 큐 / 곡·댓글 블라인드 상태 / 신고 처리(인정·기각) + 처리 메모
- [ ] **사용자 모듈**: 검색·필터 / 프로필 상세 / 정지(`suspended` 플래그) / 강제 탈퇴
- [ ] **콘텐츠 모듈**: 곡·댓글 검색 / 강제 비공개·삭제 / 통계(재생수·좋아요·댓글)
- [ ] **통계 대시보드**: DAU/MAU·곡 생성 추이·크레딧 소진·인기 곡 Top 20
- [ ] **공지 송출**: 시스템 알림(`notifications` INSERT) 일괄 발송 폼 + 대상 필터(전체·특정 유저)
- [ ] **모델 운영**: 모델 단가·잠금(`locked`) 토글 — DB 또는 config 기반 (Design에서 결정)
- [ ] `admin_actions` 감사 테이블 + 모든 어드민 동작 자동 기록 RPC/래퍼
- [ ] `/admin/audit` 페이지 — 감사 로그 조회·필터

### 2.2 Out of Scope

- 모바일 반응형 (데스크톱 전용 결정됨)
- 별도 도메인 (admin.modoomusic.com) — `/admin` 가드 방식 사용
- 어드민 권한 등급 분리 (모두 평등한 super_admin 역할로 시작)
- 결제 관련 환불·정산 (결제 인프라 도입 후 v2)
- 실시간 알림 (운영자에게 신고 들어오면 알림) — v2
- 두 단계 인증 (2FA) — 어드민 권한 등급화 시점에 같이

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `/admin` 경로는 `profiles.is_admin = true`만 접근. 비관리자 redirect to `/` | High | Pending |
| FR-02 | 사용자 검색: username 또는 email 부분 일치, 상위 20건 | High | Pending |
| FR-03 | 크레딧 지급/차감: 금액(+/-) + 사유 텍스트(필수) + 확인 다이얼로그 → DB UPDATE + `admin_actions` INSERT | High | Pending |
| FR-04 | 신고 큐: `reports` 테이블 미처리(`resolved_at` NULL) 목록, 신규순 정렬 | High | Pending |
| FR-05 | 신고 처리: 인정(블라인드 유지) 또는 기각(블라인드 해제) + 처리 메모 → `resolved_at`, `resolution` 기록 + `admin_actions` 로그 | High | Pending |
| FR-06 | 사용자 정지: `profiles.suspended_at` (NEW 컬럼) 설정 + 사유 + 자동 로그아웃 | Medium | Pending |
| FR-07 | 강제 탈퇴: 기존 `account-deletion` RPC 호출 + 사유 + 감사 로그 | Medium | Pending |
| FR-08 | 콘텐츠 강제 비공개: `songs.published = false` 설정 + `admin_actions` | Medium | Pending |
| FR-09 | 콘텐츠 삭제: 기존 delete RPC + 감사 로그 | Medium | Pending |
| FR-10 | 통계 대시보드: DAU/MAU(`profiles.last_active_at` 기반 또는 GA4), 곡 생성 일별 추이, 크레딧 소진 합계, 인기 곡 Top 20 | Medium | Pending |
| FR-11 | 공지 송출: 대상(전체·특정 유저) + 제목·본문·링크 → `notifications` INSERT 일괄 | Medium | Pending |
| FR-12 | 모델 운영: 모델 단가·잠금 토글 UI — `models` 테이블(NEW) 또는 config 파일 (Design에서 결정) | Low | Pending |
| FR-13 | 감사 로그 조회: `admin_actions` 테이블, 어드민·동작 유형·기간 필터, CSV 내보내기 | Medium | Pending |
| FR-14 | 모든 동작에 사유 텍스트 필수(최소 5자) — 감사 추적 가능성 확보 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 사용자 검색 응답 < 500ms (300 prefix 인덱스) | DevTools Network |
| Security | `is_admin` 미들웨어 가드 + 모든 mutation API에서 재검증 | 비관리자 토큰으로 API 직접 호출 테스트 |
| Accessibility | WCAG 2.1 AA 수준(어드민이라 우선순위 낮음) | 기본 키보드 탐색만 보장 |
| Audit | 모든 mutation에 `admin_actions` 기록 + 사유 텍스트 필수 | DB 직접 조회 후 누락 없는지 확인 |
| Theme | 라이트 모드 토큰 분리 — 본체(다크) 글로벌 스타일과 충돌 없음 | 시각 검수 + 다크 모드 진입 후 어드민 진입했을 때 색 깨짐 없음 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-14 모든 기능 구현
- [ ] `admin_actions` 테이블 + RPC 마이그레이션 적용
- [ ] 라이트 모드 layout group 동작 (다크 모드 본체와 충돌 없음)
- [ ] is_admin 가드 — 비관리자 접근 시 redirect
- [ ] 어드민 동작 후 감사 로그 자동 기록 검증
- [ ] iamjinwang23@gmail.com으로 모든 모듈 수동 테스트 완료

### 4.2 Quality Criteria

- [ ] `npx tsc --noEmit` 0 에러
- [ ] 모든 mutation API에 server-side is_admin 재검증
- [ ] 빌드 성공 (`npm run build`)
- [ ] 어드민 모듈이 본체 번들 사이즈에 영향 없음 (route group 분리)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 어드민 권한 탈취 시 데이터 변조 | High | Low | service_role 키로 직접 mutation, RLS 추가 가드, 감사 로그 강제 |
| 라이트 모드 토큰이 다크 모드 글로벌 스타일과 충돌 | Medium | Medium | `app/(admin)/` route group + 자체 `globals-admin.css` + Tailwind `data-theme` 전략 |
| 크레딧 지급 실수 (오타 등) | High | Medium | 확인 다이얼로그 + 사유 필수 + 감사 로그 + 일일 지급 한도(예: 1000cr/일) |
| 사용자 정지·강제 탈퇴 오작동 | High | Low | 동일 확인 다이얼로그 + 정지는 reversible, 탈퇴는 기존 grace period 시스템 활용 |
| 신고 처리 시 블라인드 토글이 일관되지 않음 | Medium | Medium | 트랜잭션으로 처리 + `reports.resolution` enum으로 상태 명시 |
| 라이트모드 + 다크모드 페이지 간 이동시 깜빡임 | Low | High | next/font 미리 로드 + CSS theme transition |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `app/(admin)/` route group | NEW route group | 라이트 모드 어드민 전용 layout |
| `admin_actions` 테이블 | NEW DB Model | 감사 로그 (id, admin_id, action, target_type, target_id, payload, reason, created_at) |
| `profiles.suspended_at` | NEW Column | 사용자 정지 플래그 |
| `reports.resolved_at` / `resolution` | UPDATE Schema | 신고 처리 상태 (기존 컬럼 추가) |
| `models` 테이블 또는 config | NEW or Config | 모델 단가·잠금 (Design 결정) |
| `notifications` INSERT API | Reuse | 공지 송출 시 활용 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `profiles.is_admin` | READ | `services/credit.service.ts:39` (일일 한도 분기) | None |
| `profiles.is_admin` | READ | NEW `lib/admin/guard.ts` (어드민 가드) | None (NEW) |
| `reports` (기존) | INSERT | `app/api/songs/[id]/report/route.ts`, `app/api/comments/[id]/report/route.ts` | None |
| `reports` | UPDATE | NEW (어드민 신고 처리 API) | NEW |
| `profiles.suspended_at` (NEW) | READ | NEW `lib/auth/check-suspended.ts` (인증 게이트) | NEW |
| `notifications` | INSERT | 기존 `services/notification.service.ts` | None (재사용) |
| `bonus_credits` | UPDATE | NEW admin grant API | NEW (기존 `tryConsumeCredits`와 무관) |

### 6.3 Verification

- [ ] 비관리자 토큰으로 `/api/admin/*` 호출 시 401/403 반환 확인
- [ ] 어드민 동작 후 `admin_actions` row 생성 확인
- [ ] 라이트 모드 페이지 → 본체 다크 모드 페이지 이동 시 색 깨짐 없음
- [ ] 정지된 사용자 로그인 시도 시 차단 메시지

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | feature 기반 + BaaS | Web 앱 + 백엔드 | ☑ |
| Enterprise | 엄격 레이어 분리 | 고트래픽 | ☐ |

**선택 사유**: 기존 MONO 코드베이스가 Dynamic 레벨이고, 어드민도 같은 구조에 통합. 별도 분리 X.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js | Next.js (기존) | 기존 사용 |
| Route 분리 | route group `(admin)` / subdomain | **route group `(admin)`** | 코드 통합 유지 + layout 격리 |
| URL | `/admin` | `/admin` | 사용자 결정 |
| 테마 | 라이트 모드 | `app/(admin)/` 자체 layout + Tailwind 명시 색상 | data-theme 또는 globals-admin.css |
| State Management | Context / 기본 React state | **기본 React state + SWR/fetch** | 단순 CRUD, 복잡 상태 없음 |
| API Client | fetch (기존) | fetch | 기존 패턴 |
| Form Handling | native | **native form + useState** | 단순 폼, 라이브러리 불필요 |
| Styling | Tailwind v4 (기존) | Tailwind + 라이트 토큰 명시 | `bg-white text-zinc-900` 등 명시 |
| Auth | Supabase RLS + is_admin | server middleware + API 재검증 | 클라이언트 가드는 보조용 |
| Audit Log | DB 테이블 | `admin_actions` | 사용자 결정 |

### 7.3 Folder Structure

```
app/
  (admin)/                           ← NEW route group, 라이트 모드 layout
    admin/
      layout.tsx                     ← 라이트 테마 wrapper + is_admin 가드 + 사이드바
      page.tsx                       ← 대시보드 (통계 요약)
      credits/page.tsx               ← 크레딧 모듈
      reports/page.tsx               ← 신고 큐
      users/page.tsx                 ← 사용자 검색
      users/[id]/page.tsx            ← 사용자 상세 (정지·강제 탈퇴)
      content/page.tsx               ← 콘텐츠 관리
      announcements/page.tsx         ← 공지 송출
      models/page.tsx                ← 모델 운영
      audit/page.tsx                 ← 감사 로그

app/api/admin/
  guard.ts                           ← 공통 is_admin 재검증 헬퍼
  grant-credit/route.ts              ← POST { userId, amount, reason }
  reports/[id]/resolve/route.ts      ← POST { resolution, memo }
  users/search/route.ts              ← GET ?q=
  users/[id]/suspend/route.ts        ← POST { reason }
  users/[id]/force-delete/route.ts   ← POST { reason }
  content/songs/[id]/unpublish/route.ts
  content/songs/[id]/delete/route.ts
  announcements/route.ts             ← POST { target, title, body, url }
  models/[id]/route.ts               ← PATCH { price, locked }
  stats/dashboard/route.ts           ← GET (DAU/MAU 등)
  audit/route.ts                     ← GET ?admin&action&from&to

services/
  admin.service.ts                   ← 감사 로그 INSERT 자동 래퍼

supabase/migrations/
  030_admin_audit_actions.sql        ← admin_actions + suspended_at + reports 컬럼 + RLS
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` — coding conventions 부분 있음
- [x] `tsconfig.json`
- [x] Tailwind v4 설정 (별도 config 없음, postcss만)
- [x] 한국어 UX 컨벤션 (memory에 기록됨)
- [x] 라이트 모드 토큰 가이드는 없음 — NEW 필요

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **라이트 모드 토큰** | 없음 (앱 전체 다크) | bg-white, text-zinc-900, border-zinc-200, accent violet-600 유지 | High |
| **어드민 사이드바 패턴** | 없음 | 좌측 200px 고정, 모듈별 항목, 활성 표시 | High |
| **확인 다이얼로그 컨벤션** | 곳곳에 inline (`{confirmDelete && ...}`) | 어드민은 `<AdminConfirm reason="...">` 재사용 컴포넌트 | High |
| **감사 로그 작성 규칙** | 없음 | 모든 API mutation에서 `admin.service.ts` 헬퍼 호출 강제 | High |
| **에러 메시지** | 기존 한국어 | 어드민은 영문 기술 메시지 OK (운영자가 보는 것) | Low |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `SUPABASE_SERVICE_ROLE_KEY` | 어드민 API service_role 동작 | Server | 기존 사용 중 |
| `ADMIN_DAILY_GRANT_LIMIT_CR` | 어드민 1인당 일일 지급 상한(실수 방지) | Server | ☑ (NEW, 권장 1000) |

---

## 9. Next Steps

1. [ ] `/pdca design admin` — 3가지 아키텍처 옵션 비교 후 결정 (특히 라이트 모드 토큰 전략)
2. [ ] 마이그레이션 030 작성 (`admin_actions` + `suspended_at` + `reports` 컬럼 확장)
3. [ ] 모듈별 세션 분할 구현 (`/pdca do admin --scope <module>`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-12 | 초안 — Checkpoint 1·2 확정 후 작성 | Jinwang |
