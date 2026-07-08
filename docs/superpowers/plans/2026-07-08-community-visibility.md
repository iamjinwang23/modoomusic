# 커뮤니티 공개/비공개 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커뮤니티에 공개/비공개 설정을 추가한다 — 비공개는 콘텐츠 잠금 + 매니저 승인 가입(수칙·심사·차단), 24h 탈퇴 쿨다운, 2일 재신청 쿨다운.

**Architecture:** 기존 커뮤니티 패턴(서버 admin client + 라우트 가드 + `services/*.service.ts` + SQL 마이그레이션)을 그대로 따른다. 순수 로직(쿨다운 계산·알림 카테고리 매핑·상태 파생)은 `packages/shared`로 추출해 vitest로 TDD하고, DB/서비스/라우트/UI는 `next build`(타입체크) + 수동 검증으로 확인한다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Supabase(Postgres, admin client) · vitest(shared 전용) · Tailwind.

## Global Constraints

- **Next.js 16**: 이 저장소는 학습데이터와 다른 브레이킹 버전. 라우트/규칙은 기존 파일 패턴을 그대로 모방할 것. 새 API는 없음.
- **테스트 하네스**: 유닛 테스트는 `packages/shared`에만 존재(vitest). 실행 `cd packages/shared && npm test`. 웹앱은 유닛 하네스 없음 → 검증은 `cd apps/web && npx next build`(타입체크 포함) + 수동.
- **쓰기 경로**: 모든 커뮤니티 쓰기는 서버 `createAdminClient()` 경유. RLS는 SELECT만 열려 있고 신규 테이블은 SELECT 정책도 부여하지 않는다(라우트 admin 경유).
- **한국어 카피**: 모든 사용자 노출 문구는 한국어(존댓말·"~요"체). 기존 토스트/문구 톤 유지.
- **쿨다운 상수(정확값)**: 탈퇴 24시간 = `86_400_000` ms. 재신청 2일 = `172_800_000` ms.
- **마이그레이션 번호**: 다음 번호는 `057`. 파일명 `057_community_visibility.sql`.
- **커밋**: 매 태스크 종료 시 커밋. 커밋 메시지는 기존 스타일(`feat(web):`, `feat(db):`, `feat(shared):` 등, 한국어 요약).

---

### Task 1: 마이그레이션 057 — 스키마 확장

**Files:**
- Create: `apps/web/supabase/migrations/057_community_visibility.sql`

**Interfaces:**
- Produces (DB): `communities.visibility`('public'|'private', default 'public'), `communities.join_rules`(text null); 테이블 `community_join_requests`(PK community_id,user_id; status 'pending'|'rejected'; reason·created_at·decided_at·decided_by), `community_blocks`(PK community_id,user_id; reason·created_at); `notifications.type` CHECK에 `community_join_request`·`community_join_approved`·`community_join_rejected` 추가.

- [ ] **Step 1: 마이그레이션 SQL 작성**

Create `apps/web/supabase/migrations/057_community_visibility.sql`:

```sql
-- ============================================================
-- 057_community_visibility.sql — 커뮤니티 공개/비공개
--   communities.visibility·join_rules
--   community_join_requests(비공개 승인 가입) · community_blocks(강퇴 차단)
--   notifications 타입 3종(신청·승인·거절)
-- 정책: 공개=현행 즉시가입 / 비공개=신청→매니저 승인. 발견 차단 없음.
--   쓰기 전부 라우트(admin). 신규 테이블 SELECT 정책 미부여.
-- ============================================================

-- 1) communities 확장
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private')),
  ADD COLUMN IF NOT EXISTS join_rules text;

-- 2) 가입 신청/심사 (비공개)
CREATE TABLE IF NOT EXISTS community_join_requests (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rejected')),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_join_requests_pending_idx
  ON community_join_requests(community_id, created_at)
  WHERE status = 'pending';

-- 3) 강퇴 재가입 영구 차단
CREATE TABLE IF NOT EXISTS community_blocks (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- 4) RLS — 신규 테이블: 활성화만, SELECT 정책 미부여(전부 admin 경유)
ALTER TABLE community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_blocks        ENABLE ROW LEVEL SECURITY;

-- 5) 알림 타입 확장 (기존 커뮤니티 알림 + 폐쇄 유지)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like','song_complete','system','follow','comment','credit_charged',
    'community_like','community_comment','community_closing',
    'community_join_request','community_join_approved','community_join_rejected'
  ));
```

- [ ] **Step 2: 마이그레이션 적용**

이전 마이그레이션(056)과 동일한 경로로 적용한다. Supabase MCP를 쓸 수 있으면 `mcp__claude_ai_Supabase__apply_migration`(name: `community_visibility`, query: 위 SQL)로 적용. 아니면 Supabase 대시보드 SQL 에디터에 붙여 실행.

- [ ] **Step 3: 적용 검증**

Run (MCP `execute_sql` 또는 대시보드):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='communities' AND column_name IN ('visibility','join_rules');
SELECT to_regclass('public.community_join_requests'), to_regclass('public.community_blocks');
```
Expected: `visibility`, `join_rules` 2행 반환. 두 `to_regclass` 모두 non-null. 기존 커뮤니티는 `visibility='public'` 기본값.

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/057_community_visibility.sql
git commit -m "feat(db): 커뮤니티 visibility·join_rules + 가입신청·차단 테이블 (057)"
```

---

### Task 2: shared 타입 + 순수 쿨다운/매핑 헬퍼 (vitest TDD)

**Files:**
- Modify: `packages/shared/src/domain/index.ts`
- Create: `packages/shared/src/domain/community-visibility.test.ts`

**Interfaces:**
- Consumes: `Community`(기존), `NotificationType`(기존), `notificationTypeToCategory`(기존).
- Produces:
  - 상수 `LEAVE_COOLDOWN_MS = 86_400_000`, `REJOIN_COOLDOWN_MS = 172_800_000`.
  - `canLeaveCommunity(joinedAtIso: string, nowMs: number): boolean`
  - `rejoinAvailableAtIso(decidedAtIso: string): string`
  - `isRejoinCooldownActive(decidedAtIso: string, nowMs: number): boolean`
  - `Community`에 필드: `visibility: 'public' | 'private'`, `joinRules: string | null`, `joinRequestStatus?: 'none' | 'pending' | 'rejected'`, `rejoinAvailableAt?: string | null`, `isBlocked?: boolean`.
  - `NotificationType`에 `'community_join_request' | 'community_join_approved' | 'community_join_rejected'` 추가.
  - `interface CommunityJoinRequest { userId; displayName; username; avatarUrl; avatarHue; createdAt }`.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/shared/src/domain/community-visibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LEAVE_COOLDOWN_MS,
  REJOIN_COOLDOWN_MS,
  canLeaveCommunity,
  rejoinAvailableAtIso,
  isRejoinCooldownActive,
  notificationTypeToCategory,
} from './index'

describe('커뮤니티 탈퇴 24h 쿨다운', () => {
  const joined = '2026-07-08T00:00:00.000Z'
  it('상수 = 24시간', () => {
    expect(LEAVE_COOLDOWN_MS).toBe(86_400_000)
  })
  it('24h 이내면 탈퇴 불가', () => {
    const now = new Date('2026-07-08T23:59:59.000Z').getTime()
    expect(canLeaveCommunity(joined, now)).toBe(false)
  })
  it('정확히 24h 경과 시 탈퇴 가능', () => {
    const now = new Date('2026-07-09T00:00:00.000Z').getTime()
    expect(canLeaveCommunity(joined, now)).toBe(true)
  })
})

describe('거절 재신청 2일 쿨다운', () => {
  const decided = '2026-07-08T00:00:00.000Z'
  it('상수 = 2일', () => {
    expect(REJOIN_COOLDOWN_MS).toBe(172_800_000)
  })
  it('해제 시각 = 거절 + 2일', () => {
    expect(rejoinAvailableAtIso(decided)).toBe('2026-07-10T00:00:00.000Z')
  })
  it('2일 이내면 쿨다운 활성', () => {
    const now = new Date('2026-07-09T12:00:00.000Z').getTime()
    expect(isRejoinCooldownActive(decided, now)).toBe(true)
  })
  it('2일 경과 시 쿨다운 해제', () => {
    const now = new Date('2026-07-10T00:00:00.000Z').getTime()
    expect(isRejoinCooldownActive(decided, now)).toBe(false)
  })
})

describe('가입 알림 타입 → community 카테고리', () => {
  it('신청·승인·거절 모두 community', () => {
    expect(notificationTypeToCategory('community_join_request')).toBe('community')
    expect(notificationTypeToCategory('community_join_approved')).toBe('community')
    expect(notificationTypeToCategory('community_join_rejected')).toBe('community')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd packages/shared && npx vitest run src/domain/community-visibility.test.ts`
Expected: FAIL — `LEAVE_COOLDOWN_MS`·`canLeaveCommunity` 등 export 없음.

- [ ] **Step 3: 최소 구현**

`packages/shared/src/domain/index.ts` 편집:

(a) `NotificationType`에 타입 3종 추가 — 기존 라인:
```ts
export type NotificationType = 'like' | 'song_complete' | 'system' | 'follow' | 'comment' | 'credit_charged' | 'community_like' | 'community_comment' | 'community_closing'
```
을 다음으로 교체:
```ts
export type NotificationType = 'like' | 'song_complete' | 'system' | 'follow' | 'comment' | 'credit_charged' | 'community_like' | 'community_comment' | 'community_closing' | 'community_join_request' | 'community_join_approved' | 'community_join_rejected'
```

(b) `notificationTypeToCategory`의 community 케이스에 3종 추가 — 기존:
```ts
    case 'community_like':
    case 'community_comment':
    case 'community_closing': return 'community'
```
을:
```ts
    case 'community_like':
    case 'community_comment':
    case 'community_closing':
    case 'community_join_request':
    case 'community_join_approved':
    case 'community_join_rejected': return 'community'
```

(c) `Community` 인터페이스에 필드 추가 (`isManager?: boolean` 아래에):
```ts
  visibility: 'public' | 'private'
  joinRules: string | null
  joinRequestStatus?: 'none' | 'pending' | 'rejected'  // 현재 유저 기준(비공개 상세용)
  rejoinAvailableAt?: string | null                    // 거절 쿨다운 해제 시각
  isBlocked?: boolean                                  // 강퇴 차단 여부
```

(d) `CommunityMember` 인터페이스 아래에 신규 인터페이스 + 쿨다운 헬퍼 추가:
```ts
export interface CommunityJoinRequest {
  userId: string
  displayName: string | null
  username: string | null
  avatarUrl: string | null
  avatarHue: number | null
  createdAt: string
}

// 커뮤니티 가입/탈퇴 쿨다운 — 순수 로직(서비스에서 재사용)
export const LEAVE_COOLDOWN_MS = 86_400_000      // 24시간
export const REJOIN_COOLDOWN_MS = 172_800_000    // 2일

export function canLeaveCommunity(joinedAtIso: string, nowMs: number): boolean {
  return nowMs - new Date(joinedAtIso).getTime() >= LEAVE_COOLDOWN_MS
}
export function rejoinAvailableAtIso(decidedAtIso: string): string {
  return new Date(new Date(decidedAtIso).getTime() + REJOIN_COOLDOWN_MS).toISOString()
}
export function isRejoinCooldownActive(decidedAtIso: string, nowMs: number): boolean {
  return nowMs - new Date(decidedAtIso).getTime() < REJOIN_COOLDOWN_MS
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `cd packages/shared && npx vitest run src/domain/community-visibility.test.ts`
Expected: PASS (모든 it 통과).

- [ ] **Step 5: 전체 shared 테스트 회귀 확인**

Run: `cd packages/shared && npm test`
Expected: 전체 PASS(기존 push-category 등 포함).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/domain/index.ts packages/shared/src/domain/community-visibility.test.ts
git commit -m "feat(shared): 커뮤니티 visibility 타입·쿨다운 헬퍼·알림 타입 3종"
```

---

### Task 3: community.service — visibility 생성/수정/조회 + 전환

**Files:**
- Modify: `apps/web/services/community.service.ts`

**Interfaces:**
- Consumes: Task 2의 `Community` 필드, `createAdminClient`, `findBannedWord`, `sendPushToUser`(기존).
- Produces:
  - `CommunityRow`에 `visibility`·`join_rules` 포함, `SELECT`에 두 컬럼 추가, `rowToCommunity`가 `visibility`·`joinRules` 매핑.
  - `createCommunity(userId, input)`의 `input`에 `visibility?: 'public'|'private'`, `joinRules?: string | null` 추가.
  - `updateCommunity(userId, communityId, patch)`의 `patch`에 `visibility?`, `joinRules?` 추가 + 비공개→공개 전환 시 pending 전원 자동 수락(멤버 편입 + 승인 알림 + 신청행 삭제).
  - `getCommunity(communityId, userId)`가 `joinRequestStatus`·`rejoinAvailableAt`·`isBlocked` 채움.
  - export `notifyJoinDecision(admin, userId, communityName, communityId, kind: 'approved'|'rejected', reason?)` (Task 5에서 재사용).

- [ ] **Step 1: Row/SELECT/매핑에 visibility 추가**

`CommunityRow` 인터페이스에 추가:
```ts
  visibility?: 'public' | 'private'
  join_rules?: string | null
```
`rowToCommunity` 반환 객체에 추가(`closeScheduledAt` 라인 뒤):
```ts
    visibility: r.visibility ?? 'public',
    joinRules: r.join_rules ?? null,
```
`SELECT` 상수 끝에 두 컬럼 추가:
```ts
const SELECT = 'id, manager_id, name, topic, description, cover_image, cover_focus, avatar_image, member_count, created_at, status, closing_at, close_scheduled_at, visibility, join_rules'
```

- [ ] **Step 2: createCommunity 시그니처·insert 확장**

`createCommunity`의 `input` 타입에 필드 추가:
```ts
  input: { name: string; topic?: string | null; description?: string | null; coverImage?: string | null; visibility?: 'public' | 'private'; joinRules?: string | null },
```
`.insert({...})` 객체에 추가:
```ts
      visibility: input.visibility === 'private' ? 'private' : 'public',
      join_rules: input.visibility === 'private' ? (input.joinRules ?? null) : null,
```

- [ ] **Step 3: updateCommunity — visibility/join_rules 패치 + 전환**

`updateCommunity`의 `patch` 타입에 추가: `visibility?: 'public' | 'private'; joinRules?: string | null`.

`update` 객체 빌드 구간(`if (patch.avatarImage !== undefined)` 다음)에 추가:
```ts
  if (patch.visibility !== undefined) update.visibility = patch.visibility === 'private' ? 'private' : 'public'
  if (patch.joinRules !== undefined) update.join_rules = patch.joinRules?.trim().slice(0, 1000) || null
```

전환 처리 — DB update 성공 직후(`const community = rowToCommunity(...)` 앞)에 삽입:
```ts
  // 비공개→공개 전환: 대기 신청 전원 자동 수락(멤버 편입 + 승인 알림)
  if (patch.visibility === 'public') {
    const { data: pend } = await admin.from('community_join_requests')
      .select('user_id').eq('community_id', communityId).eq('status', 'pending')
    const userIds = (pend ?? []).map((r) => r.user_id as string)
    if (userIds.length) {
      await admin.from('community_members').upsert(
        userIds.map((uid) => ({ community_id: communityId, user_id: uid })),
        { onConflict: 'community_id,user_id', ignoreDuplicates: true },
      )
      await admin.from('community_join_requests').delete().eq('community_id', communityId)
      const { data: cRow } = await admin.from('communities').select('name').eq('id', communityId).maybeSingle()
      for (const uid of userIds) notifyJoinDecision(admin, uid, (cRow?.name as string) ?? '', communityId, 'approved')
    }
  }
```

- [ ] **Step 4: getCommunity — 유저 관점 상태 파생**

`getCommunity`의 `if (userId) { ... }` 블록 내부(`community.isManager = ...` 다음)에 추가:
```ts
    if (community.visibility === 'private' && !community.isMember && !community.isManager) {
      const { data: blk } = await admin.from('community_blocks')
        .select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
      community.isBlocked = !!blk
      const { data: reqRow } = await admin.from('community_join_requests')
        .select('status, decided_at').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
      if (!reqRow) {
        community.joinRequestStatus = 'none'
      } else if (reqRow.status === 'pending') {
        community.joinRequestStatus = 'pending'
      } else {
        community.joinRequestStatus = 'rejected'
        community.rejoinAvailableAt = reqRow.decided_at
          ? rejoinAvailableAtIso(reqRow.decided_at as string) : null
      }
    }
```
파일 상단 import에 `rejoinAvailableAtIso` 추가:
```ts
import { rejoinAvailableAtIso } from '@mono/shared'
```
(기존 `import type { Community, CommunityMember } from '@mono/shared'`는 유지, 값 import는 별도 라인으로.)

- [ ] **Step 5: notifyJoinDecision 헬퍼 추가**

파일 하단(맨 끝)에 추가:
```ts
// 가입 심사 결과 알림 — 신청자에게 인앱 + 웹푸시. Task 5 승인/거절·전환 자동수락에서 재사용.
export function notifyJoinDecision(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  communityName: string,
  communityId: string,
  kind: 'approved' | 'rejected',
  reason?: string,
): void {
  const url = `/community/${communityId}`
  const title = kind === 'approved' ? '가입이 승인됐어요' : '가입이 거절됐어요'
  const body = kind === 'approved'
    ? `'${communityName}' 커뮤니티 가입이 승인됐어요.`
    : `'${communityName}' 커뮤니티 가입이 거절됐어요.${reason ? ` 사유: ${reason}` : ''}`
  const type = kind === 'approved' ? 'community_join_approved' : 'community_join_rejected'
  admin.from('notifications').insert({ user_id: userId, type, payload: { title, body, url } })
    .then(({ error }) => { if (error) console.error('[community.notifyJoinDecision]', error.message) })
  sendPushToUser(userId, { title, body, url }).catch(() => {})
}
```

- [ ] **Step 6: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 타입 에러 없음(빌드 성공). visibility 필드가 `Community`에 추가돼 다른 소비처에서 누락 에러가 나면, 그 지점은 후속 UI 태스크에서 처리하므로 여기서는 서비스 파일 한정 타입 통과가 목표 — build가 통과해야 함(선택적 필드라 소비처 강제 없음).

- [ ] **Step 7: Commit**

```bash
git add apps/web/services/community.service.ts
git commit -m "feat(web): community.service visibility 생성·수정·조회 + 비공개→공개 전환"
```

---

### Task 4: 24h 탈퇴 쿨다운 + 강퇴 차단/해제

**Files:**
- Modify: `apps/web/services/community.service.ts`
- Modify: `apps/web/app/api/communities/[id]/leave/route.ts`
- Modify: `apps/web/app/api/communities/[id]/kick/route.ts`
- Create: `apps/web/app/api/communities/[id]/unblock/route.ts`

**Interfaces:**
- Consumes: `canLeaveCommunity`(Task 2), `kickMember`(기존), `leaveCommunity`(기존).
- Produces:
  - `leaveCommunity`가 24h 이내면 `{ ok:false, error:'leave_cooldown' }`.
  - `kickMember(userId, communityId, targetUserId, ban?: boolean)` — `ban`이면 `community_blocks` upsert.
  - `unblockMember(userId, communityId, targetUserId): { ok; error? }`.
  - `POST /api/communities/[id]/unblock` (body `{ userId }`).

- [ ] **Step 1: leaveCommunity에 24h 쿨다운**

`leaveCommunity`의 `if (c.manager_id === userId) ...` 다음, 삭제 전에 삽입:
```ts
  const { data: mem } = await admin.from('community_members')
    .select('joined_at').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (mem && !canLeaveCommunity(mem.joined_at as string, Date.now())) {
    return { ok: false, error: 'leave_cooldown' }
  }
```
파일 상단 값 import에 `canLeaveCommunity` 추가:
```ts
import { canLeaveCommunity, rejoinAvailableAtIso } from '@mono/shared'
```

- [ ] **Step 2: kickMember에 ban 파라미터**

시그니처 변경:
```ts
export async function kickMember(userId: string, communityId: string, targetUserId: string, ban = false): Promise<{ ok: boolean; error?: string }> {
```
멤버 삭제(`await admin.from('community_members').delete()...`) 다음, 알림 전에 삽입:
```ts
  if (ban) {
    await admin.from('community_blocks').upsert(
      { community_id: communityId, user_id: targetUserId },
      { onConflict: 'community_id,user_id', ignoreDuplicates: true },
    )
  }
```

- [ ] **Step 3: unblockMember 추가**

`kickMember` 함수 뒤에 삽입:
```ts
// 차단 해제 — 매니저만. community_blocks 행 제거.
export async function unblockMember(userId: string, communityId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }
  await admin.from('community_blocks').delete().eq('community_id', communityId).eq('user_id', targetUserId)
  return { ok: true }
}
```

- [ ] **Step 4: leave 라우트 에러코드 매핑**

`apps/web/app/api/communities/[id]/leave/route.ts`의 status 매핑 라인 교체:
```ts
    const status = result.error === 'manager_cannot_leave' || result.error === 'leave_cooldown' ? 400 : result.error === 'not_found' ? 404 : 500
```

- [ ] **Step 5: kick 라우트 — ban 전달**

`apps/web/app/api/communities/[id]/kick/route.ts`:
body 타입을 `{ userId?: unknown; ban?: unknown }`로 바꾸고, 호출을:
```ts
  const result = await kickMember(user.id, id, body.userId, body.ban === true)
```

- [ ] **Step 6: unblock 라우트 생성**

Create `apps/web/app/api/communities/[id]/unblock/route.ts`:
```ts
// POST /api/communities/[id]/unblock — 강퇴 차단 해제(매니저만). { userId }
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { unblockMember } from '@/services/community.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { userId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  if (typeof body.userId !== 'string') return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const result = await unblockMember(user.id, id, body.userId)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 빌드 성공.

- [ ] **Step 8: 수동 검증**

로컬 dev(`cd apps/web && npm run dev`)에서: 방금 가입한 커뮤니티 탈퇴 시도 → 400 `leave_cooldown` 응답(네트워크 탭). (실제 UI 토스트는 Task 11.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/services/community.service.ts apps/web/app/api/communities/\[id\]/leave/route.ts apps/web/app/api/communities/\[id\]/kick/route.ts apps/web/app/api/communities/\[id\]/unblock/route.ts
git commit -m "feat(web): 24h 탈퇴 쿨다운 + 강퇴 재가입 차단·해제"
```

---

### Task 5: 가입 신청 서비스 (community-join.service.ts)

**Files:**
- Create: `apps/web/services/community-join.service.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `sendPushToUser`, `notifyJoinDecision`(Task 3), `isRejoinCooldownActive`·`rejoinAvailableAtIso`(Task 2), `CommunityJoinRequest`(Task 2).
- Produces:
  - `requestJoin(userId, communityId): { ok; error?; status?: 'pending' }` — 에러 `not_found`·`not_private`·`already_member`·`blocked`·`rejoin_cooldown`·`community_closing`.
  - `listJoinRequests(managerId, communityId): { ok; error?; requests?: CommunityJoinRequest[] }`.
  - `approveRequest(managerId, communityId, targetUserId): { ok; error? }`.
  - `rejectRequest(managerId, communityId, targetUserId, reason?): { ok; error? }`.

- [ ] **Step 1: 서비스 파일 생성**

Create `apps/web/services/community-join.service.ts`:
```ts
// 커뮤니티 비공개 가입 — 신청/목록/승인/거절. 서버 전용(admin). 매니저 가드 포함.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/services/push.service'
import { notifyJoinDecision } from '@/services/community.service'
import { isRejoinCooldownActive } from '@mono/shared'
import type { CommunityJoinRequest } from '@mono/shared'

// 신청 — 비공개 전용. 차단·쿨다운·중복 방어. 매니저에게 신청 알림.
export async function requestJoin(userId: string, communityId: string): Promise<{ ok: boolean; error?: string; status?: 'pending' }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id, name, visibility, status').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.visibility !== 'private') return { ok: false, error: 'not_private' }
  if (c.status === 'closing') return { ok: false, error: 'community_closing' }

  const { data: mem } = await admin.from('community_members').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (mem) return { ok: false, error: 'already_member' }

  const { data: blk } = await admin.from('community_blocks').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (blk) return { ok: false, error: 'blocked' }

  const { data: existing } = await admin.from('community_join_requests').select('status, decided_at').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (existing?.status === 'pending') return { ok: true, status: 'pending' }  // 멱등
  if (existing?.status === 'rejected' && existing.decided_at && isRejoinCooldownActive(existing.decided_at as string, Date.now())) {
    return { ok: false, error: 'rejoin_cooldown' }
  }

  // 신규 or 쿨다운 지난 재신청 — pending 으로 upsert(status/시각 리셋)
  const { error } = await admin.from('community_join_requests').upsert(
    { community_id: communityId, user_id: userId, status: 'pending', reason: null, decided_at: null, decided_by: null, created_at: new Date().toISOString() },
    { onConflict: 'community_id,user_id' },
  )
  if (error) { console.error('[community.requestJoin]', error.message); return { ok: false, error: 'internal' } }

  // 매니저 신청 알림
  const managerId = c.manager_id as string
  const title = '새 가입 신청'
  const body = `'${c.name as string}'에 새 가입 신청이 있어요.`
  const url = `/community/${communityId}`
  admin.from('notifications').insert({ user_id: managerId, type: 'community_join_request', payload: { title, body, url } })
    .then(({ error: e }) => { if (e) console.error('[community.requestJoin.notify]', e.message) })
  sendPushToUser(managerId, { title, body, url }).catch(() => {})
  return { ok: true, status: 'pending' }
}

// 매니저 가드 헬퍼 — 커뮤니티 소유 확인.
async function assertManager(admin: ReturnType<typeof createAdminClient>, managerId: string, communityId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { data: c } = await admin.from('communities').select('manager_id, name').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== managerId) return { ok: false, error: 'forbidden' }
  return { ok: true, name: (c.name as string) ?? '' }
}

// pending 목록 — 매니저만. 프로필 조인.
export async function listJoinRequests(managerId: string, communityId: string): Promise<{ ok: boolean; error?: string; requests?: CommunityJoinRequest[] }> {
  const admin = createAdminClient()
  const guard = await assertManager(admin, managerId, communityId)
  if (!guard.ok) return { ok: false, error: guard.error }
  const { data } = await admin.from('community_join_requests')
    .select('user_id, created_at, profiles!user_id(username, display_name, avatar_url, avatar_hue)')
    .eq('community_id', communityId).eq('status', 'pending')
    .order('created_at', { ascending: true })
  const requests: CommunityJoinRequest[] = (data ?? []).map((r) => {
    const p = (r as { profiles?: { username?: string; display_name?: string; avatar_url?: string; avatar_hue?: number } }).profiles
    return {
      userId: r.user_id as string,
      displayName: p?.display_name ?? null,
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      avatarHue: p?.avatar_hue ?? null,
      createdAt: r.created_at as string,
    }
  })
  return { ok: true, requests }
}

// 승인 — 매니저만. 멤버 편입 + 신청행 삭제 + 승인 알림.
export async function approveRequest(managerId: string, communityId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const guard = await assertManager(admin, managerId, communityId)
  if (!guard.ok) return { ok: false, error: guard.error }
  const { data: req } = await admin.from('community_join_requests').select('status').eq('community_id', communityId).eq('user_id', targetUserId).maybeSingle()
  if (!req || req.status !== 'pending') return { ok: false, error: 'not_pending' }
  await admin.from('community_members').upsert(
    { community_id: communityId, user_id: targetUserId },
    { onConflict: 'community_id,user_id', ignoreDuplicates: true },
  )
  await admin.from('community_join_requests').delete().eq('community_id', communityId).eq('user_id', targetUserId)
  notifyJoinDecision(admin, targetUserId, guard.name, communityId, 'approved')
  return { ok: true }
}

// 거절 — 매니저만. status=rejected + 사유 + decided_at(쿨다운 기준) + 거절 알림.
export async function rejectRequest(managerId: string, communityId: string, targetUserId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const guard = await assertManager(admin, managerId, communityId)
  if (!guard.ok) return { ok: false, error: guard.error }
  const { data: req } = await admin.from('community_join_requests').select('status').eq('community_id', communityId).eq('user_id', targetUserId).maybeSingle()
  if (!req || req.status !== 'pending') return { ok: false, error: 'not_pending' }
  const { error } = await admin.from('community_join_requests')
    .update({ status: 'rejected', reason: reason?.trim().slice(0, 300) || null, decided_at: new Date().toISOString(), decided_by: managerId })
    .eq('community_id', communityId).eq('user_id', targetUserId)
  if (error) { console.error('[community.rejectRequest]', error.message); return { ok: false, error: 'internal' } }
  notifyJoinDecision(admin, targetUserId, guard.name, communityId, 'rejected', reason?.trim().slice(0, 300) || undefined)
  return { ok: true }
}
```

- [ ] **Step 2: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 빌드 성공.

- [ ] **Step 3: Commit**

```bash
git add apps/web/services/community-join.service.ts
git commit -m "feat(web): 비공개 가입 신청·목록·승인·거절 서비스"
```

---

### Task 6: 가입 라우트 분기 + 심사 라우트

**Files:**
- Modify: `apps/web/services/community.service.ts` (`joinCommunity`)
- Modify: `apps/web/app/api/communities/[id]/join/route.ts`
- Create: `apps/web/app/api/communities/[id]/join-requests/route.ts`
- Create: `apps/web/app/api/communities/[id]/join-requests/[userId]/approve/route.ts`
- Create: `apps/web/app/api/communities/[id]/join-requests/[userId]/reject/route.ts`

**Interfaces:**
- Consumes: `requestJoin`·`listJoinRequests`·`approveRequest`·`rejectRequest`(Task 5), `joinCommunity`(기존).
- Produces:
  - `joinCommunity` — 공개는 즉시 가입(+blocks 존중), 비공개는 `{ ok:false, error:'needs_request' }`(라우트가 신청으로 위임).
  - `GET /join-requests` (매니저 목록), `POST /join-requests/[userId]/approve`, `POST /join-requests/[userId]/reject`.

- [ ] **Step 1: joinCommunity에 blocks 존중 + 비공개 분기**

`community.service.ts`의 `joinCommunity`에서 `if (c.status === 'closing') ...` 다음에 삽입(단, select에 visibility 필요 — `.select('id, status')`를 `.select('id, status, visibility')`로 변경):
```ts
  const { data: blk } = await admin.from('community_blocks').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (blk) return { ok: false, error: 'blocked' }
  if (c.visibility === 'private') return { ok: false, error: 'needs_request' }
```

- [ ] **Step 2: join 라우트 — 비공개면 신청으로 위임**

`apps/web/app/api/communities/[id]/join/route.ts` 교체:
```ts
// POST /api/communities/[id]/join — 공개=즉시 가입 / 비공개=가입 신청
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { joinCommunity } from '@/services/community.service'
import { requestJoin } from '@/services/community-join.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const result = await joinCommunity(user.id, id)
  if (result.ok) return NextResponse.json({ ok: true, joined: true })

  // 비공개 → 신청으로 위임
  if (result.error === 'needs_request') {
    const req = await requestJoin(user.id, id)
    if (req.ok) return NextResponse.json({ ok: true, requested: true, status: req.status })
    const status = req.error === 'not_found' ? 404 : req.error === 'blocked' || req.error === 'rejoin_cooldown' || req.error === 'community_closing' ? 403 : 500
    return NextResponse.json({ error: req.error }, { status })
  }
  const status = result.error === 'not_found' ? 404 : result.error === 'community_closing' || result.error === 'blocked' ? 403 : 500
  return NextResponse.json({ error: result.error }, { status })
}
```

- [ ] **Step 3: join-requests 목록 라우트**

Create `apps/web/app/api/communities/[id]/join-requests/route.ts`:
```ts
// GET /api/communities/[id]/join-requests — pending 목록(매니저만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listJoinRequests } from '@/services/community-join.service'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await listJoinRequests(user.id, id)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ requests: result.requests })
}
```

- [ ] **Step 4: approve 라우트**

Create `apps/web/app/api/communities/[id]/join-requests/[userId]/approve/route.ts`:
```ts
// POST /api/communities/[id]/join-requests/[userId]/approve — 승인(매니저만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { approveRequest } from '@/services/community-join.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await approveRequest(user.id, id, userId)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' || result.error === 'not_pending' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: reject 라우트**

Create `apps/web/app/api/communities/[id]/join-requests/[userId]/reject/route.ts`:
```ts
// POST /api/communities/[id]/join-requests/[userId]/reject — 거절(매니저만). { reason? }
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { rejectRequest } from '@/services/community-join.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { reason?: unknown } = {}
  try { body = await req.json() } catch { /* reason 선택 */ }
  const reason = typeof body.reason === 'string' ? body.reason : undefined
  const result = await rejectRequest(user.id, id, userId, reason)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' || result.error === 'not_pending' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 빌드 성공. 새 라우트 4개가 라우트 매니페스트에 등장.

- [ ] **Step 7: Commit**

```bash
git add apps/web/services/community.service.ts apps/web/app/api/communities/\[id\]/join/route.ts apps/web/app/api/communities/\[id\]/join-requests
git commit -m "feat(web): 가입 라우트 공개/비공개 분기 + 심사(목록·승인·거절) 라우트"
```

---

### Task 7: 피드 가시성 게이팅 + 단일 글 미리보기

**Files:**
- Modify: `apps/web/services/community-post.service.ts` (`listPosts`)
- Modify: `apps/web/app/api/communities/[id]/posts/route.ts` (GET)

**Interfaces:**
- Consumes: `listPosts`(기존), `createAdminClient`.
- Produces: `listPosts(communityId, userId?, opts?: { limit?: number; previewPostId?: string })` — 비공개+비멤버는 `[]`(previewPostId 있으면 그 1건만). GET `/posts?preview=<postId>` 지원.

- [ ] **Step 1: listPosts 시그니처·게이팅 변경**

`community-post.service.ts`의 `listPosts` 교체(기존 `limit = 50` 인자를 opts로):
```ts
export async function listPosts(
  communityId: string,
  userId?: string,
  opts: { limit?: number; previewPostId?: string } = {},
): Promise<CommunityPost[]> {
  const admin = createAdminClient()
  const limit = opts.limit ?? 50

  // 비공개 + 비멤버/비매니저 → 잠금. previewPostId 있으면 그 1건만 노출.
  const { data: c } = await admin.from('communities').select('manager_id, visibility').eq('id', communityId).maybeSingle()
  if (c?.visibility === 'private') {
    let allowed = false
    if (userId) {
      if (c.manager_id === userId) allowed = true
      else {
        const { data: m } = await admin.from('community_members').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
        allowed = !!m
      }
    }
    if (!allowed) {
      if (!opts.previewPostId) return []
      const { data } = await admin.from('community_posts').select(POST_SELECT)
        .eq('community_id', communityId).eq('id', opts.previewPostId).eq('status', 'active').maybeSingle()
      if (!data) return []
      const one = rowToPost(data as PostRow)
      return fillPolls(admin, await fillLiked(admin, [one], userId), userId)
    }
  }

  const { data } = await admin
    .from('community_posts')
    .select(POST_SELECT)
    .eq('community_id', communityId)
    .eq('status', 'active')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const posts = (data ?? []).map((r) => rowToPost(r as PostRow))
  return fillPolls(admin, await fillLiked(admin, posts, userId), userId)
}
```

- [ ] **Step 2: posts GET 라우트에 preview 전달**

`apps/web/app/api/communities/[id]/posts/route.ts`의 GET 교체:
```ts
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  const previewPostId = new URL(req.url).searchParams.get('preview') ?? undefined
  const posts = await listPosts(id, user?.id, { previewPostId })
  return NextResponse.json({ posts })
}
```
(GET 시그니처의 첫 인자 `_req`를 `req`로 변경.)

- [ ] **Step 3: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 빌드 성공. `listPosts` 호출처(다른 서비스에서 `limit` 위치인자 사용 여부) 확인 — 위치인자 `listPosts(id, uid, 50)` 형태가 있으면 `{ limit: 50 }`로 수정. Run: `grep -rn "listPosts(" apps/web` 로 확인 후 필요한 곳 수정.

- [ ] **Step 4: 수동 검증**

dev 서버에서 비공개 커뮤니티(임시로 DB `UPDATE communities SET visibility='private' WHERE id='<id>'`)에 비멤버로 `GET /api/communities/<id>/posts` → `{ posts: [] }`. `?preview=<postId>` → 그 1건만.

- [ ] **Step 5: Commit**

```bash
git add apps/web/services/community-post.service.ts apps/web/app/api/communities/\[id\]/posts/route.ts
git commit -m "feat(web): 비공개 피드 게이팅 + 단일 글 미리보기(preview)"
```

---

### Task 8: 개설/수정 모달 — visibility 토글 + 수칙

**Files:**
- Modify: `apps/web/components/community/CreateCommunityModal.tsx`
- Modify: `apps/web/components/community/CommunityEditModal.tsx`

**Interfaces:**
- Consumes: POST `/api/communities`(Task 3 필드), PATCH `/api/communities/[id]`(Task 3 전환).
- Produces: UI만.

- [ ] **Step 1: CreateCommunityModal 상태·전송**

`const [description, setDescription] = useState('')` 아래 추가:
```tsx
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [joinRules, setJoinRules] = useState('')
```
`submit`의 `body: JSON.stringify({...})`를 교체:
```tsx
        body: JSON.stringify({ name: name.trim(), topic: topic.trim(), description: description.trim(), visibility, joinRules: visibility === 'private' ? joinRules.trim() : '' }),
```

- [ ] **Step 2: CreateCommunityModal 토글 UI**

소개(description) `<div>` 블록 뒤, 닫는 `</div>`(space-y-3 컨테이너 끝) 앞에 삽입:
```tsx
          <div>
            <label className="text-[11px] text-zinc-400">공개 설정</label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setVisibility('public')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${visibility === 'public' ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]'}`}>공개</button>
              <button type="button" onClick={() => setVisibility('private')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${visibility === 'private' ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]'}`}>비공개</button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">{visibility === 'private' ? '멤버만 글을 볼 수 있고, 가입은 매니저 승인이 필요해요.' : '누구나 글을 보고 바로 가입할 수 있어요.'}</p>
          </div>
          {visibility === 'private' && (
            <div>
              <label className="text-[11px] text-zinc-400">가입 수칙 (선택)</label>
              <textarea value={joinRules} onChange={(e) => setJoinRules(e.target.value)} maxLength={1000} placeholder="가입 신청 시 보여줄 안내나 규칙을 적어주세요"
                className="mt-1 w-full h-20 bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
            </div>
          )}
```

- [ ] **Step 3: CommunityEditModal 상태**

`const [avatarUrl, setAvatarUrl] = useState(community.avatarImage)` 아래 추가:
```tsx
  const [visibility, setVisibility] = useState<'public' | 'private'>(community.visibility)
  const [joinRules, setJoinRules] = useState(community.joinRules ?? '')
```

- [ ] **Step 4: CommunityEditModal 전송 + 전환 안내**

`handleSave`의 PATCH body 교체:
```tsx
      body: JSON.stringify({ name: name.trim(), topic: topic.trim() || null, description: description.trim() || null, visibility, joinRules: visibility === 'private' ? joinRules.trim() : '' }),
```
`handleSave` 첫 줄(`if (!canSave) return`) 다음에 전환 확인 삽입:
```tsx
    if (community.visibility === 'private' && visibility === 'public') {
      if (!window.confirm('공개로 바꾸면 대기 중인 가입 신청이 모두 자동 수락돼요. 계속할까요?')) return
    }
```

- [ ] **Step 5: CommunityEditModal 토글 UI**

소개 `<div>`(description textarea 블록) 뒤, 폐쇄 섹션(`{/* 폐쇄 (danger) */}`) 앞에 삽입:
```tsx
          {/* 공개 설정 */}
          <div>
            <label className="text-xs text-zinc-500">공개 설정</label>
            <div className="mt-1.5 flex gap-2">
              <button type="button" onClick={() => setVisibility('public')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${visibility === 'public' ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-zinc-400 hover:bg-white/[0.10]'}`}>공개</button>
              <button type="button" onClick={() => setVisibility('private')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${visibility === 'private' ? 'bg-violet-600 text-white' : 'bg-white/[0.05] text-zinc-400 hover:bg-white/[0.10]'}`}>비공개</button>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">{visibility === 'private' ? '멤버만 글을 볼 수 있고, 가입은 매니저 승인이 필요해요.' : '누구나 글을 보고 바로 가입할 수 있어요.'}</p>
          </div>
          {visibility === 'private' && (
            <div>
              <label className="text-xs text-zinc-500">가입 수칙</label>
              <textarea value={joinRules} onChange={(e) => setJoinRules(e.target.value)} maxLength={1000} rows={3} placeholder="가입 신청 시 보여줄 안내나 규칙"
                className="mt-1.5 w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors resize-none" />
            </div>
          )}
```

- [ ] **Step 6: 타입체크(build) + 수동 검증**

Run: `cd apps/web && npx next build` → 성공.
dev에서 개설 모달에 공개/비공개 토글·수칙 노출, 비공개로 개설 → `GET /api/communities/<id>`가 `visibility:'private'` 반환(네트워크 탭).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/community/CreateCommunityModal.tsx apps/web/components/community/CommunityEditModal.tsx
git commit -m "feat(web): 개설·수정 모달 공개/비공개 토글 + 가입 수칙"
```

---

### Task 9: 상세 페이지 — 잠금 뷰 + 가입 버튼 상태머신 + 미리보기 + 매니저 배지

**Files:**
- Modify: `apps/web/app/(main)/community/[id]/page.tsx`

**Interfaces:**
- Consumes: `Community.visibility`·`joinRequestStatus`·`rejoinAvailableAt`·`isBlocked`(Task 2/3), `?preview` 지원 posts(Task 7), join 라우트 응답(Task 6).
- Produces: 비공개 잠금 UI, 가입 버튼 상태, 미리보기 CTA, 매니저 "가입 신청 N" 진입점(모달은 Task 10에서 연결).

- [ ] **Step 1: 파생 플래그 + preview 로드**

`const focusPostId = searchParams.get('post')` 는 이미 존재. `load` 콜백의 posts fetch를 preview 포함으로 교체:
```tsx
      fetch(`/api/communities/${id}/posts${focusPostId ? `?preview=${focusPostId}` : ''}`).then(r => r.ok ? r.json() : { posts: [] }),
```
`load`의 deps 배열에 `focusPostId` 추가: `}, [id, user?.id, focusPostId])`.

`const isClosing = ...` 아래에 파생 추가:
```tsx
  const isPrivate = community?.visibility === 'private'
  const locked = isPrivate && !isMember && !isManager   // 비공개·비멤버 = 잠금
```

- [ ] **Step 2: join() 응답 분기(신청/차단/쿨다운)**

`join` 함수 교체:
```tsx
  async function join() {
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    setBusy(true)
    const res = await fetch(`/api/communities/${id}/join`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      toast.success(j.requested ? '가입을 신청했어요' : '가입했어요'); load(); return
    }
    toast.error(
      j.error === 'blocked' ? '이 커뮤니티에 가입할 수 없어요' :
      j.error === 'rejoin_cooldown' ? '아직 재신청할 수 없어요' :
      j.error === 'community_closing' ? '폐쇄 예정이라 가입할 수 없어요' : '가입에 실패했어요',
    )
  }
```

- [ ] **Step 3: 잠금 시 글쓰기/피드 숨김**

글쓰기 컴포저 조건 `{(isMember || isManager) && !isClosing && (`는 그대로 두면 잠금 시 자동 숨김(비멤버라). 피드 렌더 구간을 잠금 처리 — `<div className="mt-6 md:px-5 divide-y ...">` 블록 전체를 다음으로 감싼다:
```tsx
        {locked ? (
          <div className="px-5 mt-8">
            {/* 미리보기 글 1건(있으면) */}
            {posts && posts.length > 0 && (
              <div className="mb-6">{/* 기존 posts.map 카드 렌더를 재사용하려면 이 자리에 단일 카드 표시 */}</div>
            )}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <p className="text-sm font-medium text-white">멤버만 볼 수 있는 커뮤니티예요</p>
              <p className="text-xs text-zinc-500 mt-1">가입하면 모든 글과 대화를 볼 수 있어요.</p>
              {community?.isBlocked ? (
                <p className="mt-4 text-xs text-red-300">가입이 제한된 커뮤니티예요.</p>
              ) : community?.joinRequestStatus === 'pending' ? (
                <button disabled className="mt-4 px-5 py-2.5 rounded-full text-sm font-semibold bg-white/[0.08] text-zinc-400 cursor-default">승인 대기 중</button>
              ) : community?.joinRequestStatus === 'rejected' && community.rejoinAvailableAt && new Date(community.rejoinAvailableAt).getTime() > Date.now() ? (
                <button disabled className="mt-4 px-5 py-2.5 rounded-full text-sm font-semibold bg-white/[0.08] text-zinc-400 cursor-default">{Math.ceil((new Date(community.rejoinAvailableAt).getTime() - Date.now()) / 86400000)}일 후 재신청 가능</button>
              ) : (
                <button onClick={busy ? undefined : openJoin} className="mt-4 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition">가입하기</button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 md:px-5 divide-y divide-white/[0.06] md:divide-y-0 md:space-y-3">
            {/* ...기존 피드 렌더(posts === null ? ... : posts.map(...)) 그대로... */}
          </div>
        )}
```
주의: 잠금 미리보기의 단일 카드는 기존 `posts.map` 카드 JSX를 함수로 추출(`renderPostCard(p)`)해 양쪽에서 재사용하는 것을 권장. 최소 구현으로는 미리보기 영역에서 `posts.slice(0,1).map(renderPostCard)`, 비잠금 영역에서 `posts.map(renderPostCard)`.

- [ ] **Step 4: openJoin — 비공개면 신청 모달, 공개면 즉시 가입**

`join` 함수 위에 추가(모달 상태는 Task 10에서 실제 모달 연결; 여기선 상태 토글만):
```tsx
  const [joinReqOpen, setJoinReqOpen] = useState(false)
  function openJoin() {
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    if (isPrivate) setJoinReqOpen(true)   // 수칙 모달(Task 10)
    else join()
  }
```
기존 `roleButton`의 미가입 버튼 `onClick={busy ? undefined : join}`을 `onClick={busy ? undefined : openJoin}`으로 변경.

- [ ] **Step 5: 매니저 "가입 신청 N" 진입점**

`load` 콜백에서 매니저면 pending 카운트 fetch — `load` 내 Promise.all 뒤에 추가:
```tsx
    if (d?.community?.isManager && d.community.visibility === 'private') {
      const rq = await fetch(`/api/communities/${id}/join-requests`).then(r => r.ok ? r.json() : { requests: [] })
      setPendingCount((rq.requests ?? []).length)
    } else setPendingCount(0)
```
상태 추가(다른 useState 옆): `const [pendingCount, setPendingCount] = useState(0)` 와 `const [manageOpen, setManageOpen] = useState(false)`.
소개/카테고리 렌더 뒤(`{community?.topic && ...}` 다음)에 매니저 진입점:
```tsx
          {isManager && isPrivate && (
            <button onClick={() => setManageOpen(true)} className="inline-flex items-center gap-1.5 mt-3 ml-2 px-3 py-1.5 rounded-full bg-white/[0.06] text-sm text-white hover:bg-white/[0.10] transition">
              가입 신청{pendingCount > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center justify-center">{pendingCount}</span>}
            </button>
          )}
```

- [ ] **Step 6: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 빌드 성공. (`joinReqOpen`·`manageOpen`은 Task 10에서 모달로 소비 — 사용처 없으면 lint 경고 가능하나 build는 통과. Task 10에서 즉시 연결.)

- [ ] **Step 7: 수동 검증 + Commit**

dev에서 비공개 커뮤니티에 비멤버로 진입 → 피드 잠김·"가입하기". `?post=<id>` 진입 → 미리보기 1건 + 잠금 CTA.
```bash
git add "apps/web/app/(main)/community/[id]/page.tsx"
git commit -m "feat(web): 상세 비공개 잠금 뷰·가입 상태머신·미리보기·매니저 신청 진입점"
```

---

### Task 10: 가입 신청 모달 + 매니저 심사 모달(차단 탭)

**Files:**
- Create: `apps/web/components/community/JoinRequestModal.tsx`
- Create: `apps/web/components/community/ManageJoinRequestsModal.tsx`
- Modify: `apps/web/app/(main)/community/[id]/page.tsx` (모달 연결)

**Interfaces:**
- Consumes: `community.joinRules`, `POST /join`(신청), `GET /join-requests`, approve/reject 라우트, `POST /unblock`(Task 4), `CommunityJoinRequest`.
- Produces: 두 모달 컴포넌트 + 상세에서 렌더.

- [ ] **Step 1: JoinRequestModal 생성**

Create `apps/web/components/community/JoinRequestModal.tsx`:
```tsx
// 비공개 가입 신청 — 수칙 표시 + 신청. createPortal 패턴(CreateCommunityModal 참고).
'use client'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import { toast } from '@/components/toast/toast'

export function JoinRequestModal({ communityId, communityName, joinRules, onClose, onRequested }: {
  communityId: string
  communityName: string
  joinRules: string | null
  onClose: () => void
  onRequested: () => void
}) {
  const [busy, setBusy] = useState(false)
  if (typeof document === 'undefined') return null

  async function submit() {
    if (busy) return
    setBusy(true)
    const res = await fetch(`/api/communities/${communityId}/join`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) { toast.success('가입을 신청했어요'); onRequested(); onClose(); return }
    toast.error(j.error === 'blocked' ? '이 커뮤니티에 가입할 수 없어요' : j.error === 'rejoin_cooldown' ? '아직 재신청할 수 없어요' : '신청에 실패했어요')
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl w-full max-w-[420px] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-white">{communityName} 가입 신청</h2>
        <p className="mt-1 text-xs text-zinc-400">매니저 승인 후 가입돼요.</p>
        {joinRules && (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-[11px] font-medium text-zinc-400 mb-1">가입 수칙</p>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{joinRules}</p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={busy ? undefined : onClose} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition disabled:opacity-40">취소</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition active:scale-[0.98] disabled:opacity-40">{busy ? '신청 중…' : '가입 신청'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: ManageJoinRequestsModal 생성(신청/차단 탭)**

Create `apps/web/components/community/ManageJoinRequestsModal.tsx`:
```tsx
// 매니저 심사 — pending 승인/거절(사유) + 차단 목록/해제.
'use client'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import type { CommunityJoinRequest } from '@mono/shared'

function Avatar({ name, hue, url }: { name: string | null; hue: number | null; url: string | null }) {
  const c = profileColor(hue ?? 0)
  if (url) return <img src={url} alt="" width={36} height={36} className="rounded-full object-cover shrink-0" style={{ width: 36, height: 36 }} />
  return <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: 36, height: 36, background: c.bg, color: c.text, fontSize: 15 }}>{(name ?? '?').slice(0, 1).toUpperCase()}</div>
}

export function ManageJoinRequestsModal({ communityId, onClose, onChanged }: {
  communityId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [requests, setRequests] = useState<CommunityJoinRequest[] | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/communities/${communityId}/join-requests`).then(r => r.ok ? r.json() : { requests: [] }).then(j => setRequests(j.requests ?? []))
  }, [communityId])

  async function decide(userId: string, action: 'approve' | 'reject', rsn?: string) {
    setBusy(true)
    const res = await fetch(`/api/communities/${communityId}/join-requests/${userId}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: rsn }),
    })
    setBusy(false)
    if (!res.ok) { toast.error('처리에 실패했어요'); return }
    toast.success(action === 'approve' ? '가입을 수락했어요' : '가입을 거절했어요')
    setRequests(prev => prev?.filter(r => r.userId !== userId) ?? null)
    setRejecting(null); setReason('')
    onChanged()
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full h-full md:h-auto md:max-w-[440px] md:max-h-[80vh] bg-[#181B22] md:border border-white/[0.10] md:rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">가입 신청</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {requests === null ? (
            <p className="text-sm text-zinc-500 py-10 text-center">불러오는 중…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">대기 중인 신청이 없어요.</p>
          ) : requests.map(r => (
            <div key={r.userId} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Avatar name={r.displayName ?? r.username} hue={r.avatarHue} url={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{r.displayName ?? r.username ?? '익명'}</p>
                  {r.username && <p className="text-xs text-zinc-500 truncate">@{r.username}</p>}
                </div>
                {rejecting !== r.userId && (
                  <div className="flex gap-2 shrink-0">
                    <button disabled={busy} onClick={() => decide(r.userId, 'approve')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-40">수락</button>
                    <button disabled={busy} onClick={() => setRejecting(r.userId)} className="px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 bg-white/[0.06] hover:bg-white/[0.12] transition disabled:opacity-40">거절</button>
                  </div>
                )}
              </div>
              {rejecting === r.userId && (
                <div className="mt-2.5 flex gap-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="거절 사유(선택)"
                    className="flex-1 bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  <button disabled={busy} onClick={() => decide(r.userId, 'reject', reason.trim() || undefined)} className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition disabled:opacity-40">거절 확정</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
```
(차단 목록/해제 탭은 v1에서 이 모달 하단에 별도 섹션으로 추가 가능하나, 우선 pending 심사만으로 검증 후 후속 확장. 스펙 §6 차단 해제 경로는 `POST /unblock` 라우트로 이미 열려 있어 UI만 추후 연결.)

- [ ] **Step 3: 상세에서 모달 연결**

`page.tsx` 하단 모달 렌더 구간(`{membersOpen && ...}` 근처)에 추가:
```tsx
      {joinReqOpen && community && <JoinRequestModal communityId={id} communityName={community.name} joinRules={community.joinRules} onClose={() => setJoinReqOpen(false)} onRequested={load} />}
      {manageOpen && <ManageJoinRequestsModal communityId={id} onClose={() => setManageOpen(false)} onChanged={load} />}
```
import 추가(상단):
```tsx
import { JoinRequestModal } from '@/components/community/JoinRequestModal'
import { ManageJoinRequestsModal } from '@/components/community/ManageJoinRequestsModal'
```

- [ ] **Step 4: 타입체크(build) + 수동 검증**

Run: `cd apps/web && npx next build` → 성공.
dev: 비공개 커뮤니티 비멤버 → "가입하기" → 수칙 모달 → 신청 → 상태 "승인 대기 중". 매니저 계정 → "가입 신청 N" → 수락/거절(사유). 알림 도착 확인.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/community/JoinRequestModal.tsx apps/web/components/community/ManageJoinRequestsModal.tsx "apps/web/app/(main)/community/[id]/page.tsx"
git commit -m "feat(web): 가입 신청 모달 + 매니저 심사 모달 연결"
```

---

### Task 11: 강퇴 차단 체크박스 + 탈퇴 쿨다운 토스트 + 잠금 아이콘

**Files:**
- Modify: `apps/web/app/(main)/community/[id]/page.tsx` (강퇴·탈퇴)
- Modify: `apps/web/components/community/hubCards.tsx` (또는 카드 렌더 위치) — 비공개 자물쇠

**Interfaces:**
- Consumes: kick 라우트 `ban`(Task 4), leave `leave_cooldown`(Task 4), `community.visibility`.
- Produces: 강퇴 시 차단 옵션, 탈퇴 실패 토스트, 목록 카드 자물쇠.

- [ ] **Step 1: 강퇴에 차단 옵션**

`page.tsx`의 `kick` 함수에 `ban` 인자 추가:
```tsx
  async function kick(p: CommunityPost, ban: boolean) {
    const res = await fetch(`/api/communities/${id}/kick`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: p.authorId, ban }),
    })
    if (res.ok) { toast.success(`${p.authorName ?? '사용자'}님을 내보냈어요`); load() }
    else toast.error('강퇴에 실패했어요')
  }
```
강퇴 확인 모달(`confirmKick` ConfirmModal)은 ban 체크박스가 필요하므로 전용 상태 추가 — `confirmKick` 근처에 `const [kickBan, setKickBan] = useState(false)`. ConfirmModal은 커스텀 콘텐츠를 못 받으므로, 강퇴 확인만 별도 처리: 기존 `ConfirmModal open={!!confirmKick}`의 `description`에 안내를 두고, onConfirm을 `kick(confirmKick, kickBan)`으로. 체크박스는 ConfirmModal이 children을 지원하지 않으면 description 아래 표시 불가 → 최소 구현: 강퇴 시 `window.confirm('재가입을 영구 차단할까요? (취소=차단 없이 강퇴)')` 결과를 ban으로 사용:
```tsx
  // confirmKick onConfirm 교체
  onConfirm={() => { if (confirmKick) { const ban = window.confirm('이 회원의 재가입을 영구 차단할까요?\n확인=차단 후 강퇴 / 취소=차단 없이 강퇴'); kick(confirmKick, ban) } setConfirmKick(null) }}
```
(권장: 후속에 전용 KickModal로 교체. v1은 confirm으로 검증.)

- [ ] **Step 2: 탈퇴 쿨다운 토스트**

`leave` 함수의 에러 토스트 교체:
```tsx
    else toast.error(j.error === 'manager_cannot_leave' ? '매니저는 탈퇴할 수 없어요 (폐쇄만 가능)' : j.error === 'leave_cooldown' ? '가입 후 24시간이 지나야 탈퇴할 수 있어요' : '탈퇴에 실패했어요')
```

- [ ] **Step 3: 목록 카드 자물쇠 아이콘**

`hubCards.tsx`에는 카드 컴포넌트가 **둘**이다 — `CommunityCard`(이름 렌더 `<p ...>{c.name}</p>` 약 28행)와 `CommunityRankRow`(약 46행). `/Lock.svg` 자산은 없으므로 **인라인 SVG**를 쓴다. 각 이름 `<p>`를 이름+자물쇠를 감싸는 플렉스로 교체.

`CommunityCard`의 `<p className="text-sm font-bold text-white truncate">{c.name}</p>`를:
```tsx
          <p className="text-sm font-bold text-white truncate flex items-center gap-1">
            <span className="truncate">{c.name}</span>
            {c.visibility === 'private' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="shrink-0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
          </p>
```
`CommunityRankRow`의 동일한 이름 `<p ...>{c.name}</p>`도 같은 패턴으로 교체(클래스 `mt-0.5` 등 원본 유지 시 span에 truncate 이동).

- [ ] **Step 4: 타입체크(build)**

Run: `cd apps/web && npx next build`
Expected: 빌드 성공.

- [ ] **Step 5: 수동 검증**

dev: 방금 가입한 계정으로 탈퇴 → "24시간" 토스트. 매니저가 멤버 강퇴 시 차단 확인 → 차단된 계정 재가입/재신청 불가. 허브/목록에서 비공개 커뮤니티에 자물쇠 표시.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(main)/community/[id]/page.tsx" apps/web/components/community/hubCards.tsx
git commit -m "feat(web): 강퇴 재가입 차단 옵션 + 탈퇴 쿨다운 안내 + 비공개 자물쇠"
```

---

## 최종 통합 검증 (전 태스크 후)

- [ ] `cd packages/shared && npm test` → 전체 PASS.
- [ ] `cd apps/web && npx next build` → 성공.
- [ ] 수동 E2E 시나리오:
  1. 공개 커뮤니티 개설 → 즉시 가입 정상, 24h 내 탈퇴 차단.
  2. 비공개 개설(수칙 입력) → 비멤버 잠금·인기글 미리보기 확인.
  3. 신청 → 매니저 알림 → 수락 → 신청자 알림 → 가입·피드 열람.
  4. 신청 → 거절(사유) → 신청자 알림 + 2일 재신청 쿨다운(즉시 재신청 차단).
  5. 강퇴+차단 → 재가입/재신청 불가 → `/unblock` 후 가능.
  6. 비공개→공개 전환 → pending 전원 자동 수락 + 승인 알림 + member_count 증가.

## 스코프 밖(후속)
- 모바일(`apps/mobile`) 비공개 UI. API/DB는 공유되어 즉시 안전(비멤버 빈 피드).
- 전용 KickModal(체크박스 UI), ManageJoinRequestsModal 차단 목록 탭 UI(라우트는 이미 존재).
- 검색/발견 차단, 초대 링크·코드.

---

## 후속(사용자 승인) — 멤버 관리 모달: 강퇴(멤버 탭) + 차단 해제(차단 탭)

배경: 현재 강퇴·차단은 피드의 글 ⋮ 메뉴로만 가능(글 없는 멤버는 강퇴 불가), 차단 목록/해제 UI 없음. 기존 `CommunityMembersModal`은 읽기전용. 매니저에게 상단 탭(멤버/차단)의 관리 모달을 제공한다. 비매니저는 현행 읽기전용 목록 유지.

### Task 12A: 백엔드 — 차단 목록 조회

**Files:**
- Modify: `packages/shared/src/domain/index.ts`
- Modify: `apps/web/services/community.service.ts`
- Create: `apps/web/app/api/communities/[id]/blocks/route.ts`

**Interfaces:**
- Produces: `interface CommunityBlockedUser { userId; displayName; username; avatarUrl; avatarHue; createdAt; reason: string | null }`; `listBlocks(managerId, communityId): { ok; error?; blocks?: CommunityBlockedUser[] }`; `GET /api/communities/[id]/blocks` (manager only) → `{ blocks }`.

- [ ] **Step 1: shared 타입**

`packages/shared/src/domain/index.ts` — `CommunityJoinRequest` 인터페이스 아래에 추가:
```ts
export interface CommunityBlockedUser {
  userId: string
  displayName: string | null
  username: string | null
  avatarUrl: string | null
  avatarHue: number | null
  createdAt: string
  reason: string | null
}
```

- [ ] **Step 2: listBlocks 서비스**

`apps/web/services/community.service.ts` — `unblockMember` 함수 뒤에 추가(프로필 조인, 매니저 가드). import에 타입 추가는 파일 상단 `import type { Community, CommunityMember } from '@mono/shared'`를 `import type { Community, CommunityMember, CommunityBlockedUser } from '@mono/shared'`로 확장:
```ts
// 차단 목록 — 매니저만. 프로필 조인.
export async function listBlocks(userId: string, communityId: string): Promise<{ ok: boolean; error?: string; blocks?: CommunityBlockedUser[] }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }
  const { data } = await admin
    .from('community_blocks')
    .select('user_id, reason, created_at, profiles!user_id(username, display_name, avatar_url, avatar_hue)')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
  const blocks: CommunityBlockedUser[] = (data ?? []).map((r) => {
    const p = (r as { profiles?: { username?: string; display_name?: string; avatar_url?: string; avatar_hue?: number } }).profiles
    return {
      userId: r.user_id as string,
      displayName: p?.display_name ?? null,
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      avatarHue: p?.avatar_hue ?? null,
      createdAt: r.created_at as string,
      reason: (r.reason as string | null) ?? null,
    }
  })
  return { ok: true, blocks }
}
```
주의: `community_blocks`는 `profiles`로 FK가 `user_id` 하나뿐이라 `profiles!user_id` 힌트는 안전(단일 FK).

- [ ] **Step 3: GET /blocks 라우트**

Create `apps/web/app/api/communities/[id]/blocks/route.ts` (join-requests 목록 라우트와 동일 구조):
```ts
// GET /api/communities/[id]/blocks — 차단 사용자 목록(매니저만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listBlocks } from '@/services/community.service'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await listBlocks(user.id, id)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ blocks: result.blocks })
}
```

- [ ] **Step 4: 검증** — `cd apps/web && npx next build` 성공. `cd packages/shared && npm test` 그린.
- [ ] **Step 5: Commit** — `feat(web): 차단 사용자 목록(listBlocks) + GET /blocks 라우트`

### Task 12B: 프론트 — 탭형 멤버 관리 모달

**Files:**
- Modify: `apps/web/components/community/CommunityMembersModal.tsx`
- Modify: `apps/web/app/(main)/community/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/communities/[id]/blocks`(12A), `POST /kick`(`{userId,ban}`), `POST /unblock`(`{userId}`), `CommunityMember`, `CommunityBlockedUser`.

- [ ] **Step 1: CommunityMembersModal 확장 — props + 탭 상태**

props를 `{ members, managerId, communityId, isManager, onClose, onChanged }`로 확장(`onChanged` optional, 매니저 액션 후 부모 새로고침). 파일 상단에 `import { useEffect, useState } from 'react'`, `import { toast } from '@/components/toast/toast'`, 타입 `CommunityMember, CommunityBlockedUser` from `@mono/shared` 추가.
- 매니저가 아니면 기존 렌더(단순 목록) 그대로 — 탭 미노출.
- 매니저면 상단 탭 `멤버 N` | `차단 N`. `const [tab, setTab] = useState<'members'|'blocked'>('members')`, `const [blocks, setBlocks] = useState<CommunityBlockedUser[] | null>(null)`, `const [busy, setBusy] = useState(false)`, `const [manageId, setManageId] = useState<string | null>(null)`(행 액션 메뉴 토글).
- 차단 탭 진입 시 `blocks===null`이면 fetch: `useEffect`로 tab==='blocked' && blocks===null → `fetch('/api/communities/${communityId}/blocks')...setBlocks(j.blocks ?? [])` (`.catch(()=>setBlocks([]))`).

- [ ] **Step 2: 멤버 탭 강퇴/차단 액션**

각 비매니저 멤버 행 우측에 관리 버튼(⋯) → 열리면 "강퇴" / "강퇴 후 차단". 액션:
```tsx
async function kick(userId: string, ban: boolean) {
  setBusy(true)
  const res = await fetch(`/api/communities/${communityId}/kick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, ban }) })
  setBusy(false); setManageId(null)
  if (res.ok) { toast.success(ban ? '내보내고 차단했어요' : '내보냈어요'); onChanged?.(); onClose() }
  else toast.error('처리에 실패했어요')
}
```
(강퇴는 멤버십 목록을 바꾸므로 `onChanged`로 상세를 새로고침하고 모달을 닫는다. `manageId`로 행별 작은 메뉴를 토글: "강퇴"→`kick(id,false)`, "강퇴 후 차단"→`kick(id,true)`. 매니저 본인 행에는 관리 버튼 미표시.)

- [ ] **Step 3: 차단 탭 목록 + 해제**

차단 탭: `blocks===null` 로딩, 빈 배열이면 "차단한 사용자가 없어요.", 아니면 각 행(아바타·이름·`@username`) 우측 "차단 해제":
```tsx
async function unblock(userId: string) {
  setBusy(true)
  const res = await fetch(`/api/communities/${communityId}/unblock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
  setBusy(false)
  if (res.ok) { toast.success('차단을 해제했어요'); setBlocks(prev => prev?.filter(b => b.userId !== userId) ?? null); onChanged?.() }
  else toast.error('해제에 실패했어요')
}
```
헤더 제목/카운트는 탭에 맞춰(`멤버 N`/`차단 N`) 표시. 기존 아바타/프로필 이동 로직 재사용. Korean copy(존댓말/~요). 기존 스타일 토큰 유지(ManageJoinRequestsModal 참고).

- [ ] **Step 4: page.tsx 배선**

`CommunityMembersModal` 렌더에 props 추가:
```tsx
{membersOpen && community && <CommunityMembersModal members={members} managerId={community.managerId} communityId={id} isManager={isManager} onClose={() => setMembersOpen(false)} onChanged={load} />}
```

- [ ] **Step 5: 검증** — `cd apps/web && npx next build` 성공. (수동 라이브 검증은 컨트롤러가 후속.)
- [ ] **Step 6: Commit** — `feat(web): 멤버 관리 모달 — 멤버 탭 강퇴/차단 + 차단 탭 해제`
