---
template: design
version: 1.3
feature: admin
date: 2026-06-12
author: Jinwang
project: 모두의 노래 (MONO)
version_app: 0.1.0
---

# 어드민(Admin) Design Document

> **Summary**: `/admin` route group을 라이트 모드로 분리. 7개 운영 모듈(크레딧·신고·사용자·콘텐츠·통계·공지·모델)을 `is_admin` 가드 + `admin_actions` 감사 로그로 묶음. Pragmatic Balance 아키텍처(Option C).
>
> **Project**: 모두의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: Jinwang
> **Date**: 2026-06-12
> **Status**: Draft
> **Planning Doc**: [admin.plan.md](../../01-plan/features/admin.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | SQL 직접 실행 의존 — 위험·반복·기록 부재. 결제·외부 사용자 받기 전 정비 필요. |
| **WHO** | `profiles.is_admin = true` 사용자, 데스크톱 전용. |
| **RISK** | 권한 남용·탈취, 라이트/다크 토큰 충돌, 크레딧 지급 실수. |
| **SUCCESS** | (1) SQL 없이 운영 100% (2) 모든 동작 `admin_actions` 기록 (3) 비관리자 접근 0건. |
| **SCOPE** | v1: 7개 모듈 풀스코프. v2: 결제 환불·정산·실시간 알림. |

---

## 1. Overview

### 1.1 Design Goals

- 라이트 모드 어드민 페이지를 본체(다크) 코드와 시각·기능적으로 분리
- SQL 직접 실행 대체 — 자주 쓰는 운영 동작을 폼·확인 모달로 처리
- 모든 mutation에 사유 텍스트 + 감사 로그 강제 (실수 검출·추적 가능성)
- 1인 운영 가능한 단순 구조 (오버엔지니어링 회피)

### 1.2 Design Principles

- **명시적 클래스** — 라이트 토큰을 페이지 단위에 명시 (CSS variable 시스템 X)
- **감사 우선** — `admin.service.ts`의 `withAudit()` 래퍼를 통한 자동 로그
- **보안 다중 가드** — middleware + layout 가드 + API 재검증 (3중)
- **재사용 컴포넌트 최소** — `<AdminPanel>` `<AdminConfirm>` `<DataTable>` 3개로 시작

---

## 2. Architecture Options

### 2.0 Architecture Comparison (선택: C)

| Option | 테마 처리 | 공용 컴포넌트 | 서비스 분리 | 작업량 | 선택 |
|---|---|---|---|---|---|
| A — Minimal | inline 클래스 반복 | 없음 | route handler 직접 | 0.7일 | |
| B — Clean Architecture | CSS 변수 + 디자인 시스템 | 풀 추출 | features/admin/ 전체 | 1.5일+ | |
| **C — Pragmatic Balance** | route group 자체 layout | 3개 공통 컴포넌트 | services/admin.service.ts 단일 | **1.2일** | ✅ |

### 2.1 Component Diagram

```
┌────────────────────────────────────────────────┐
│  Browser (Light Mode UI, Desktop only)         │
│  app/(admin)/admin/*                           │
└────────────┬───────────────────────────────────┘
             │ fetch
             ▼
┌────────────────────────────────────────────────┐
│  app/api/admin/* (Server Routes)               │
│  ├─ guard() → 401/403 if !is_admin             │
│  ├─ mutation logic                             │
│  └─ withAudit() → admin_actions INSERT         │
└────────────┬───────────────────────────────────┘
             │ service_role
             ▼
┌────────────────────────────────────────────────┐
│  Supabase                                      │
│  ├─ profiles (is_admin, suspended_at)          │
│  ├─ admin_actions (NEW audit log)              │
│  ├─ reports (resolved_at, resolution NEW)      │
│  └─ notifications (공지 송출)                  │
└────────────────────────────────────────────────┘
```

### 2.2 Data Flow

**예시: 크레딧 지급**
1. UI → `POST /api/admin/grant-credit { userId, amount, reason }`
2. `guard()` — auth.getUser() → profiles.is_admin 확인 → 실패 시 401/403
3. `withAudit('grant_credit', { userId, amount, reason })` 컨텍스트 진입
4. `bonus_credits += amount` UPDATE (service_role)
5. `admin_actions` INSERT (admin_id, action, target_user_id, payload, reason)
6. dispatch `notifications-changed` (대상 사용자 배지 갱신)
7. 응답 + UI toast

### 2.3 Dependencies

- 기존: `@supabase/supabase-js`, `@supabase/ssr`, Next.js 16 App Router, Tailwind v4
- 추가: 없음 (의존성 추가 X — Pragmatic Balance 원칙)

---

## 3. Data Model

### 3.1 Entity Definition

**admin_actions** (NEW)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| admin_id | uuid REFERENCES profiles(id) ON DELETE SET NULL | 누가 했는지 |
| action | text NOT NULL | 'grant_credit' \| 'resolve_report' \| 'suspend_user' 등 enum-like |
| target_type | text NOT NULL | 'user' \| 'song' \| 'comment' \| 'report' \| 'system' |
| target_id | text | 대상 ID (uuid 또는 식별자) |
| payload | jsonb NOT NULL DEFAULT '{}' | 동작별 메타(amount, before, after 등) |
| reason | text NOT NULL CHECK (length(reason) >= 5) | 사유 필수 |
| created_at | timestamptz NOT NULL DEFAULT now() | |

인덱스: `(admin_id, created_at DESC)`, `(action, created_at DESC)`, `(target_type, target_id)`

**profiles.suspended_at** (ALTER)
- `suspended_at timestamptz` — NULL이면 정상, 값 있으면 정지됨
- `suspended_reason text`
- `suspended_by uuid REFERENCES profiles(id)`

**reports.resolved_at + resolution** (ALTER)
- `resolved_at timestamptz` NULL이면 미처리
- `resolution text CHECK (resolution IN ('upheld', 'dismissed'))` — 인정/기각
- `resolution_memo text`
- `resolved_by uuid REFERENCES profiles(id)`

### 3.2 Entity Relationships

```
profiles (admin) ──< admin_actions >── profiles (target)
                                      │
                                      ├── songs (target)
                                      ├── comments (target)
                                      └── reports (target)
```

### 3.3 Database Schema (Migration 030)

`supabase/migrations/030_admin_actions_and_suspension.sql`:
- `admin_actions` 테이블 + 인덱스 + RLS (is_admin SELECT, server-side INSERT only)
- `profiles` 3개 컬럼 추가
- `reports` 4개 컬럼 추가
- RPC `record_admin_action(p_action, p_target_type, p_target_id, p_payload, p_reason)` SECURITY DEFINER

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/grant-credit` | 크레딧 지급/차감 |
| GET | `/api/admin/users/search?q=` | 사용자 검색 (username/email 부분 일치) |
| GET | `/api/admin/users/[id]` | 사용자 상세 |
| POST | `/api/admin/users/[id]/suspend` | 정지 |
| POST | `/api/admin/users/[id]/unsuspend` | 정지 해제 |
| POST | `/api/admin/users/[id]/force-delete` | 강제 탈퇴 |
| GET | `/api/admin/reports?status=pending` | 신고 큐 |
| POST | `/api/admin/reports/[id]/resolve` | 신고 처리(upheld/dismissed) |
| POST | `/api/admin/content/songs/[id]/unpublish` | 강제 비공개 |
| POST | `/api/admin/content/songs/[id]/delete` | 강제 삭제 |
| GET | `/api/admin/stats/dashboard` | DAU/MAU·곡·크레딧 요약 |
| POST | `/api/admin/announcements` | 공지 송출 (notifications 일괄 INSERT) |
| PATCH | `/api/admin/models/[id]` | 모델 단가·잠금 토글 |
| GET | `/api/admin/audit?admin&action&from&to` | 감사 로그 조회 |
| GET | `/api/admin/audit/export.csv` | 감사 로그 CSV 다운로드 |

### 4.2 Detailed Specification

#### `POST /api/admin/grant-credit`

**Request**
```json
{
  "userId": "uuid",
  "amount": 100,            // 음수면 차감 (단, 결과가 음수 되지 않게 GREATEST)
  "reason": "베타 테스터 보상"  // min 5 chars
}
```

**Response**
- 200: `{ "data": { "username": "...", "newBonus": 116 } }`
- 400: `{ "error": "invalid_input" | "reason_too_short" | "exceeds_daily_limit" }`
- 401/403: `{ "error": "unauthenticated" | "forbidden" }`
- 404: `{ "error": "user_not_found" }`

**Validation**
- amount: integer, |amount| <= 1000
- reason: length >= 5, <= 200
- 일일 어드민당 지급 합산 한도: `ADMIN_DAILY_GRANT_LIMIT_CR` (default 1000)

#### `POST /api/admin/reports/[id]/resolve`

**Request**
```json
{
  "resolution": "upheld" | "dismissed",
  "memo": "선정성 콘텐츠 명백"
}
```

**Action**
- `upheld`: 대상 콘텐츠 `is_blinded=true` 유지 + `reports.resolved_at`/`resolution` 기록
- `dismissed`: 대상 콘텐츠 `is_blinded=false` + 위와 동일

#### `GET /api/admin/users/search?q=na58`

**Response**
```json
{
  "data": [
    {
      "id": "uuid",
      "username": "na5892",
      "email": "na58921@gmail.com",
      "displayName": "...",
      "bonusCredits": 14,
      "suspendedAt": null,
      "createdAt": "2026-06-10T06:26:54Z"
    }
  ]
}
```

LIKE 검색 (`username ILIKE %q%` OR `email ILIKE %q%`), 상위 20건.

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
┌──────────────────────────────────────────────────────────┐
│ Header (h-12): MONO admin · 운영자명 · 로그아웃          │
├──────────┬───────────────────────────────────────────────┤
│ Sidebar  │ Main Content (라이트 카드 패턴)               │
│ (200px)  │                                                │
│          │ ┌─────────────────────────────────────────┐  │
│ • 대시보드│ │ Section: 사용자 검색                    │  │
│ • 크레딧 │ │ [검색 input]                            │  │
│ • 신고   │ │ ─────────────                           │  │
│ • 사용자 │ │ [DataTable]                             │  │
│ • 콘텐츠 │ └─────────────────────────────────────────┘  │
│ • 통계   │                                                │
│ • 공지   │                                                │
│ • 모델   │                                                │
│ • 감사   │                                                │
└──────────┴───────────────────────────────────────────────┘
```

### 5.2 User Flow — 크레딧 지급

```
[/admin/credits 진입]
   ↓
[사용자 검색 입력] → 결과 리스트 (요약 카드)
   ↓
[지급 버튼 클릭] → AdminConfirm 다이얼로그
  ┌─────────────────────────────┐
  │ 크레딧 지급                  │
  │ 대상: na5892                 │
  │ 금액: [+100] cr              │
  │ 사유: [______________]       │
  │ ─────────────                │
  │ [취소] [지급]                │
  └─────────────────────────────┘
   ↓
[지급] → POST /api/admin/grant-credit
   ↓
toast.success + 결과 카드 업데이트 + 감사 로그 자동
```

### 5.3 Component List

- `AdminLayout` — 사이드바 + 본문 컨테이너 (`app/(admin)/admin/layout.tsx`)
- `AdminSidebar` — 8개 모듈 메뉴 + active 표시
- `AdminPanel` — 라이트 카드 (`bg-white rounded-2xl border border-zinc-200 p-6`)
- `AdminConfirm` — 확인 다이얼로그 (사유 필수 input + 확인 버튼)
- `DataTable` — 정렬·페이지네이션 가능한 간단 테이블
- `UserSearchInput` — 디바운스 검색 + 결과 리스트

### 5.4 Page UI Checklist

#### 사용자 검색·상세 (`/admin/users`)
- [ ] 검색 input (디바운스 300ms)
- [ ] 결과 카드: 아바타, username, email, bonus, 정지 여부, 가입일
- [ ] 카드 클릭 → 상세 (`/admin/users/[id]`)
- [ ] 상세: 정지·정지 해제·강제 탈퇴 버튼 + 사유 입력
- [ ] 본인 계정 보호 (자기 자신은 정지·탈퇴 버튼 비활성)

#### 크레딧 (`/admin/credits`)
- [ ] 사용자 검색 → 결과 카드 → 지급 버튼
- [ ] 지급 모달: 금액 +/-, 사유 (5자 이상), 일일 한도 표시
- [ ] 결과 toast + 감사 로그 자동

#### 신고 큐 (`/admin/reports`)
- [ ] 필터: 미처리/처리 완료, 신고 유형(곡·댓글)
- [ ] 각 신고: 대상 콘텐츠 미리보기 + 신고자·사유
- [ ] 인정/기각 버튼 + 메모 입력

#### 콘텐츠 (`/admin/content`)
- [ ] 곡·댓글 검색
- [ ] 강제 비공개·삭제 버튼 + 사유

#### 통계 (`/admin/stats` 또는 root `/admin`)
- [ ] DAU/MAU 카드
- [ ] 곡 생성 일별 차트 (최근 30일)
- [ ] 크레딧 소진 합계
- [ ] 인기 곡 Top 20

#### 공지 (`/admin/announcements`)
- [ ] 대상 선택: 전체 / 특정 user_ids (CSV 입력) / 검색
- [ ] 제목 + 본문 + URL
- [ ] 미리보기 + 일괄 INSERT

#### 모델 (`/admin/models`)
- [ ] 모델 목록 (`MODELS` 상수 또는 DB)
- [ ] 단가·잠금 토글

#### 감사 로그 (`/admin/audit`)
- [ ] 필터: 어드민, 동작 유형, 기간
- [ ] CSV 내보내기
- [ ] payload jsonb 표시 (`<pre>`)

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | 로그인 안 됨 |
| `forbidden` | 403 | is_admin=false |
| `invalid_input` | 400 | Zod 검증 실패 |
| `reason_too_short` | 400 | 사유 5자 미만 |
| `exceeds_daily_limit` | 400 | 어드민 일일 지급 한도 초과 |
| `user_not_found` | 404 | 대상 없음 |
| `target_not_found` | 404 | 신고·곡·댓글 없음 |
| `self_action` | 400 | 본인에게 정지·탈퇴 시도 |

### 6.2 Error Response Format

```json
{ "error": "exceeds_daily_limit", "message": "오늘 지급 한도(1000cr)를 초과했어요" }
```

---

## 7. Security Considerations

- **3중 가드**:
  1. `proxy.ts` — `/admin/*` 경로 진입 시 세션 확인 + `admin_permissions` 매칭 (Next.js 16: `middleware.ts` → `proxy.ts`로 통합, 56ebc24)
  2. `app/(admin)/admin/layout.tsx` — server component에서 `is_admin` 확인 후 redirect
  3. 모든 `/api/admin/*` route handler — `await guard()` 호출
- **service_role 키 격리** — 클라이언트 번들에 절대 포함 X (이미 분리되어 있음)
- **CSRF 보호** — Supabase auth는 Bearer 토큰 + same-origin 정책으로 기본 보호
- **감사 로그 변조 방지** — `admin_actions`는 INSERT만 허용 RLS, UPDATE/DELETE 금지
- **본인 보호** — 본인을 정지·탈퇴·차감하는 동작 차단
- **rate limit** — 검색 API에 디바운스 + 서버 60req/min 가드
- **sensitive payload** — 감사 로그 payload에 비밀번호·토큰 절대 X

---

## 8. Test Plan

### 8.1 Test Scope

- L1 (API): `/api/admin/*` 전체 endpoints
- L2 (UI Action): 핵심 시나리오 (크레딧 지급·신고 처리·정지)
- L3 (E2E): admin 로그인 → 사용자 검색 → 크레딧 지급 → 감사 로그 확인
- 보안 테스트: 비관리자 토큰으로 API 직접 호출 시 403

### 8.2 L1: API Test Scenarios

| Test | Endpoint | Expected |
|---|---|---|
| 401 비로그인 | POST /api/admin/grant-credit | 401 unauthenticated |
| 403 비관리자 | POST /api/admin/grant-credit (일반 유저 토큰) | 403 forbidden |
| 400 사유 짧음 | POST /api/admin/grant-credit { reason: "ok" } | 400 reason_too_short |
| 200 정상 지급 | POST /api/admin/grant-credit { amount:100, reason:"테스트" } | 200 + bonus +100 |
| 일일 한도 초과 | 11번째 지급 (합계 > 1000) | 400 exceeds_daily_limit |
| 감사 로그 기록 | 위 모든 200 케이스 후 | `admin_actions` row 존재 |

### 8.3 L2: UI Action Tests

- 어드민 로그인 후 `/admin/credits` 진입 → 검색 → 지급 모달 열기 → 사유 입력 → 지급 → toast 확인

### 8.4 L3: E2E

- iamjinwang23@gmail.com 로그인 → /admin 진입 → 사용자 검색 (na5892) → 100cr 지급 → /admin/audit 진입 → 방금 동작 보임 확인

### 8.5 Seed Data Requirements

- 테스트용 일반 유저 1명 (is_admin=false)
- 테스트용 신고 row 1건 (resolved_at=null)

---

## 9. Clean Architecture

### 9.1 Layer Structure

```
┌─────────────────────────────────────┐
│ Presentation: app/(admin)/admin/*   │
│ - UI components, route components   │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│ Application: app/api/admin/*        │
│ - route handlers, input validation  │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│ Service: services/admin.service.ts  │
│ - audit log wrapper, business rules │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│ Infrastructure: lib/supabase/admin  │
│ - service_role client (existing)    │
└─────────────────────────────────────┘
```

### 9.4 This Feature's Layer Assignment

| Layer | Path | Files |
|---|---|---|
| Presentation | `app/(admin)/admin/`, `components/admin/` | 11 files |
| Application | `app/api/admin/` | 13 routes |
| Service | `services/admin.service.ts`, `lib/admin/guard.ts` | 2 files |
| DB | `supabase/migrations/030_*.sql` | 1 migration |

---

## 10. Coding Convention Reference

### 10.1 Naming

- Route group: `(admin)` (괄호로 URL에 안 들어감)
- 페이지 컴포넌트: `AdminCreditsPage`, `AdminReportsPage`...
- API route: `app/api/admin/grant-credit/route.ts` (소문자 케밥)
- 감사 로그 action 키: snake_case (`grant_credit`, `resolve_report`)

### 10.4 This Feature's Conventions

**라이트 모드 토큰 (페이지 단위 명시)**
- 배경: `bg-zinc-50` (전체), `bg-white` (카드)
- 텍스트: `text-zinc-900` (본문), `text-zinc-600` (보조)
- 보더: `border-zinc-200`
- 강조: `bg-violet-600 text-white` (CTA), `text-violet-600` (링크)
- 위험: `bg-red-50 text-red-700 border-red-200`
- 성공: `bg-green-50 text-green-700`

**확인 모달 컨벤션**
- 모든 mutation은 `<AdminConfirm>` 사용
- 사유 input 필수, 5자 이상 검증
- 확인 버튼은 red (위험 동작) 또는 violet (일반)

**감사 로그 컨벤션**
- 모든 mutation API는 `withAudit(adminId, action, target, payload, reason)` 래퍼로 처리
- payload는 before/after 객체로 (예: `{ before: { bonusCredits: 14 }, after: { bonusCredits: 114 } }`)

---

## 11. Implementation Guide

### 11.1 Recommended Order

1. **Module 1: 인프라** — 마이그레이션 030 + `lib/admin/guard.ts` + `services/admin.service.ts` + `app/(admin)/admin/layout.tsx` + 사이드바
2. **Module 2: 크레딧** — `/admin/credits` 페이지 + `/api/admin/grant-credit` + 사용자 검색 컴포넌트 재사용
3. **Module 3: 신고** — `/admin/reports` 큐 + 처리 API
4. **Module 4: 사용자** — `/admin/users` 검색·상세·정지·탈퇴
5. **Module 5: 콘텐츠** — `/admin/content` 곡·댓글 관리
6. **Module 6: 통계** — `/admin/` 대시보드 카드 + 차트
7. **Module 7: 공지** — `/admin/announcements` 일괄 송출
8. **Module 8: 모델** — `/admin/models` 단가·잠금 토글
9. **Module 9: 감사** — `/admin/audit` 조회·필터·CSV 내보내기

### 11.2 Files to Create / Modify

**Create (NEW)**:
- `supabase/migrations/030_admin_actions_and_suspension.sql`
- `app/(admin)/admin/layout.tsx` + `page.tsx` (dashboard)
- `app/(admin)/admin/{credits,reports,users,content,announcements,models,audit}/page.tsx` (7개)
- `app/(admin)/admin/users/[id]/page.tsx`
- `app/api/admin/{guard.ts, grant-credit/route.ts, users/search/route.ts, ...}` (14 files)
- `services/admin.service.ts`
- `lib/admin/guard.ts`
- `components/admin/{AdminPanel,AdminConfirm,AdminSidebar,DataTable,UserSearchInput}.tsx`

**Modify**:
- `proxy.ts` — `/admin/*` 경로 인증 가드 + `ROUTE_PERMISSION` 매핑 (Next.js 16: `middleware.ts` 사용 금지, `proxy.ts`만 허용)
- `app/(main)/layout.tsx` — 본체 layout이 `/admin` 진입 차단 (불필요할 듯, route group이 알아서)

### 11.3 Session Guide

| Module | Scope Key | Files Count | Est. Time | Depends On |
|---|---|---|---|---|
| infrastructure | `module-1` | 5 | 3h | — |
| credits | `module-2` | 3 | 2h | module-1 |
| reports | `module-3` | 3 | 2h | module-1 |
| users | `module-4` | 4 | 2h | module-1 |
| content | `module-5` | 3 | 1.5h | module-1 |
| stats | `module-6` | 2 | 1.5h | module-1 |
| announcements | `module-7` | 2 | 1.5h | module-1 |
| models | `module-8` | 2 | 1h | module-1 |
| audit | `module-9` | 2 | 1.5h | module-1 |

**Recommended Session Split** (1.2일 분량):
- **Session 1 (~3h)**: Module 1 인프라
- **Session 2 (~4h)**: Module 2 크레딧 + Module 3 신고 (가장 시급)
- **Session 3 (~4h)**: Module 4 사용자 + Module 9 감사 (운영 안정성)
- **Session 4 (~3h)**: Module 5~8 나머지 (콘텐츠·통계·공지·모델)

`/pdca do admin --scope module-1` 식으로 단계별 진행 가능.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-12 | 초안 — Option C 선택 후 작성, 9개 모듈 세션 분할 | Jinwang |
