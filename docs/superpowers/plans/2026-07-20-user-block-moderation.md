# 사용자 차단 + UGC 보강 + IAP 활성화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apple 재리젝(1.2 UGC, 2.1(b) IAP) 해소 — 사용자 차단 풀스택(웹+앱) 구현, 신고 24h 보강, IAP 활성화.

**Architecture:** 차단은 `user_blocks` 테이블 기반. API는 기존 `follow` 라우트의 토글 패턴, 피드 필터는 `explore.service.ts`의 `filterMyReported()` 복제. 모바일/웹 UI는 기존 신고 진입점 옆에 차단 추가. IAP는 코드 완성 상태라 플래그만 ON.

**Tech Stack:** Next.js 16(app router), Supabase(admin/user client), Expo(expo-router), react-native-iap.

## Global Constraints

- **자동 커밋/푸시 금지** — 각 태스크에 커밋 스텝이 있으나, 실제 `git commit`·`git push`는 형님의 명시 요청이 있을 때만. 커밋 스텝은 "커밋 준비 완료(diff 제시)"로 갈음하고 승인 대기.
- **마이그레이션은 수동 적용** — Supabase MCP는 이 프로젝트(bckbcbrmnztfwmtldkly) 권한 없음. 마이그레이션 파일만 작성하고, 적용은 형님이 SQL Editor에서. 로컬 검증은 SQL 문법 확인까지.
- **Next.js 16**: API route의 `params`는 `Promise` → `const { id } = await params` 필수.
- **인증**: `createUserClient()`(server.ts, 인증·getUser) / `createAdminClient()`(admin.ts, RLS 우회 쓰기). 클라 컴포넌트는 `@/lib/supabase/client`의 `createClient()`.
- **UI 레이블 한국어** (법적 텍스트 제외).
- **모바일 API**: `api.get(path)` / `api.post(path, body?)` / `api.patch(path, body?)` / `api.del(path)`.
- **모바일 확인 다이얼로그**: `Alert.alert(title, msg, [...])` destructive 스타일 (ConfirmModal은 모바일에 없음). **웹 확인**: `<ConfirmModal variant="danger" .../>`.
- **다음 마이그레이션 번호 = 061**.
- **차단 기준 컬럼**: 곡·포스트·댓글의 작성자 컬럼은 `user_id`(피드 매핑 후 `userId`).
- **IAP 재빌드**: `react-native-iap`는 네이티브 → 플래그 ON 시 Build 12 재빌드 필요.

---

## 파일 구조

**생성:**
- `apps/web/supabase/migrations/061_user_blocks.sql`
- `apps/web/services/block.service.ts` — 차단 조회/생성/해제 + `getBlockedUserIds`
- `apps/web/app/api/users/[id]/block/route.ts` — POST(차단 토글 생성)/DELETE(해제)
- `apps/web/app/api/users/blocked/route.ts` — GET(내 차단 목록)
- `apps/mobile/src/app/blocked-users.tsx` — 차단 목록 화면
- `apps/mobile/src/lib/block.ts` — 모바일 차단 API 래퍼
- `apps/web/components/BlockedUsersSection.tsx` — 웹 차단 목록 관리 UI

**수정:**
- `apps/web/services/explore.service.ts` — `filterBlocked()` 추가 + `getFeed`/`getByFilter`에 적용
- 프로필 곡 목록·커뮤니티 피드·댓글 목록 서비스 — 차단 필터 적용
- `apps/web/app/api/songs/[id]/comments/route.ts` 외 상호작용 API — 차단 체크
- `apps/mobile/src/lib/use-public-song-more.tsx` — 차단 핸들러
- `apps/mobile/src/components/ui/public-song-more-sheet.tsx` — 차단 행
- 커뮤니티 포스트/댓글 더보기 시트, 프로필 헤더 — 차단 진입점
- `apps/mobile/src/app/settings.tsx` — 차단 목록 셀
- `apps/mobile/src/app/_layout.tsx` — blocked-users 라우트 등록
- `apps/web/components/SongDetailPage.tsx` — `SongMoreMenu`에 차단
- `apps/web/app/(admin)/admin/reports/page.tsx` — 24h 경과 표시
- `apps/web/app/terms/page.tsx`(또는 약관 소스) — 무관용 조항
- `apps/mobile/.env` + EAS env — `EXPO_PUBLIC_IAP_ENABLED=true`

---

## Task 1: 차단 테이블 + 조회 서비스

**Files:**
- Create: `apps/web/supabase/migrations/061_user_blocks.sql`
- Create: `apps/web/services/block.service.ts`

**Interfaces:**
- Produces: `getBlockedUserIds(admin, userId): Promise<string[]>` — 양방향 합집합(내가 차단 + 나를 차단). `createBlock(admin, blockerId, blockedId): Promise<void>`, `removeBlock(admin, blockerId, blockedId): Promise<void>`, `listBlocked(admin, userId): Promise<{id,display_name,avatar_url}[]>`.

- [ ] **Step 1: 마이그레이션 작성** (058 스타일 미러)

`apps/web/supabase/migrations/061_user_blocks.sql`:
```sql
-- 061_user_blocks.sql
-- 사용자 간 차단 — 양방향 완전차단(피드 숨김·상호 언팔·상호작용 차단)의 기반 테이블.

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks(blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON user_blocks;
CREATE POLICY user_blocks_select_own ON user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_insert ON user_blocks;
CREATE POLICY user_blocks_insert ON user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_delete_own ON user_blocks;
CREATE POLICY user_blocks_delete_own ON user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);
```

- [ ] **Step 2: 서비스 작성**

`apps/web/services/block.service.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

// 양방향 합집합: 내가 차단한 + 나를 차단한 유저 id (피드 상호 숨김용)
export async function getBlockedUserIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const [{ data: iBlocked }, { data: blockedMe }] = await Promise.all([
    admin.from('user_blocks').select('blocked_id').eq('blocker_id', userId),
    admin.from('user_blocks').select('blocker_id').eq('blocked_id', userId),
  ])
  const ids = new Set<string>()
  for (const r of iBlocked ?? []) ids.add(r.blocked_id as string)
  for (const r of blockedMe ?? []) ids.add(r.blocker_id as string)
  return [...ids]
}

export async function createBlock(admin: SupabaseClient, blockerId: string, blockedId: string): Promise<void> {
  await admin.from('user_blocks').upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' })
  // 양방향 언팔로우
  await admin.from('follows').delete().eq('follower_id', blockerId).eq('following_id', blockedId)
  await admin.from('follows').delete().eq('follower_id', blockedId).eq('following_id', blockerId)
}

export async function removeBlock(admin: SupabaseClient, blockerId: string, blockedId: string): Promise<void> {
  await admin.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId)
}

export async function listBlocked(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from('user_blocks')
    .select('blocked_id, created_at, profiles!user_blocks_blocked_id_fkey(id, display_name, avatar_url)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => r.profiles).filter(Boolean)
}
```

> 실행 시: `follows` 컬럼명(`follower_id`/`following_id`)과 `profiles` FK 조인 별칭이 실제와 맞는지 `apps/web/supabase/migrations/001_initial_schema.sql`에서 확인. 조인 별칭이 다르면 `user_blocks_blocked_id_fkey` 부분을 실제 FK명으로 교정.

- [ ] **Step 3: 타입체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음 (block.service.ts 관련).

- [ ] **Step 4: 커밋 준비** (자동 커밋 금지 — diff 제시 후 승인 대기)
```
feat(block): user_blocks 마이그레이션 061 + 차단 조회 서비스
```

---

## Task 2: 차단/해제/목록 API

**Files:**
- Create: `apps/web/app/api/users/[id]/block/route.ts`
- Create: `apps/web/app/api/users/blocked/route.ts`

**Interfaces:**
- Consumes: `createBlock`, `removeBlock`, `listBlocked` (Task 1).
- Produces: `POST /api/users/[id]/block` (차단), `DELETE /api/users/[id]/block` (해제), `GET /api/users/blocked` (목록).

- [ ] **Step 1: 차단/해제 라우트**

`apps/web/app/api/users/[id]/block/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBlock, removeBlock } from '@/services/block.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: targetId } = await params
  if (targetId === user.id) return NextResponse.json({ error: 'cannot_block_self' }, { status: 400 })
  await createBlock(createAdminClient(), user.id, targetId)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: targetId } = await params
  await removeBlock(createAdminClient(), user.id, targetId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 목록 라우트**

`apps/web/app/api/users/blocked/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listBlocked } from '@/services/block.service'

export async function GET() {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const blocked = await listBlocked(createAdminClient(), user.id)
  return NextResponse.json({ blocked })
}
```

- [ ] **Step 3: 실동작 검증** (dev 서버 또는 배포 후)

로그인 상태 쿠키/토큰으로:
```
POST /api/users/{타인id}/block → { ok: true }
GET  /api/users/blocked        → { blocked: [{id, display_name, avatar_url}] }
DELETE /api/users/{타인id}/block → { ok: true }
```
자기 자신 차단 → 400 `cannot_block_self`.

- [ ] **Step 4: 커밋 준비**
```
feat(block): 차단/해제/목록 API
```

---

## Task 3: 피드 필터 (곡·프로필·커뮤니티·댓글)

**Files:**
- Modify: `apps/web/services/explore.service.ts` (`filterMyReported` 근처 138-191)
- Modify: 프로필 곡 목록 서비스, 커뮤니티 피드 서비스(`community-post.service.ts`), 댓글 목록 서비스

**Interfaces:**
- Consumes: `getBlockedUserIds` (Task 1).
- Produces: 로그인 사용자 컨텍스트의 모든 공개 피드에서 차단 유저 콘텐츠 제외.

- [ ] **Step 1: explore.service에 filterBlocked 추가** (`filterMyReported` 복제)

`apps/web/services/explore.service.ts` — 기존 `filterMyReported` 아래에:
```ts
import { getBlockedUserIds } from '@/services/block.service'

async function filterBlocked<T extends { userId: string }>(supabase: SupabaseClient, songs: T[]): Promise<T[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return songs
  const blocked = new Set(await getBlockedUserIds(supabase as never, user.id))
  if (blocked.size === 0) return songs
  return songs.filter((s) => !blocked.has(s.userId))
}
```

> `getBlockedUserIds`는 admin client를 받도록 설계됐으나 select-only이므로 user client로도 동작(RLS가 본인 blocker 행 허용 + blocked_me는 RLS로 막힘 주의). **정확성을 위해 explore에서는 admin client를 쓰거나, `getBlockedUserIds`가 내부에서 admin을 생성하도록 조정.** 실행 시 explore.service의 다른 함수가 admin/user 중 무엇을 쓰는지 확인해 일치시킬 것 — `filterMyReported`가 쓰는 클라이언트와 동일하게.

- [ ] **Step 2: getFeed/getByFilter에 적용**

`filterMyReported(...)` 호출 직후 체이닝:
```ts
const filtered = await filterMyReported(supabase, mapped)
const visible = await filterBlocked(supabase, filtered)
return visible
```
`getFeed`(line ~175)와 `getByFilter`(line ~191) 두 곳 모두.

- [ ] **Step 3: 프로필 곡 목록 필터**

프로필의 공개곡 목록을 반환하는 서비스에도 동일 `filterBlocked` 적용. (실행 시 프로필 곡 목록 서비스 함수 위치 확인 — `explore.service` 또는 `profile.service`.)

- [ ] **Step 4: 커뮤니티 피드·댓글 필터**

`apps/web/services/community-post.service.ts`의 포스트 목록, 댓글 목록 조회 함수에 차단 필터 적용. 커뮤니티 포스트/댓글은 `user_id`(작성자) 기준으로 `getBlockedUserIds` 결과를 제외. 곡 댓글 목록(`comments` 조회) 서비스에도 동일 적용.

- [ ] **Step 5: 타입체크 + 실동작**

Run: `cd apps/web && npx tsc --noEmit`
실동작: A가 B 차단 → A의 둘러보기/검색/B프로필/커뮤니티 피드에서 B 콘텐츠 사라짐, B 피드에서도 A 콘텐츠 사라짐(양방향).

- [ ] **Step 6: 커밋 준비**
```
feat(block): 차단 유저 콘텐츠 피드 필터(곡·프로필·커뮤니티·댓글)
```

---

## Task 4: 상호작용 차단 (댓글·팔로우 API)

**Files:**
- Modify: `apps/web/app/api/songs/[id]/comments/route.ts` (POST)
- Modify: 커뮤니티 댓글 작성 API, 팔로우 API(`profiles/[id]/follow/route.ts`)

**Interfaces:**
- Consumes: `getBlockedUserIds` (Task 1).
- Produces: 차단 관계인 두 유저 간 댓글·팔로우 시도 시 403.

- [ ] **Step 1: 댓글 작성에 차단 체크**

곡 댓글 POST에서, 곡 소유자와 요청자가 차단 관계면 거부:
```ts
import { getBlockedUserIds } from '@/services/block.service'
// ... user 인증 후, 곡 소유자 ownerId 조회한 뒤:
const blocked = await getBlockedUserIds(createAdminClient(), user.id)
if (blocked.includes(ownerId)) return NextResponse.json({ error: 'blocked' }, { status: 403 })
```
커뮤니티 댓글 작성 API에도 동형 적용(포스트 작성자 기준).

- [ ] **Step 2: 팔로우에 차단 체크**

`profiles/[id]/follow/route.ts` POST 시작부에 차단 관계면 403:
```ts
const blocked = await getBlockedUserIds(createAdminClient(), user.id)
if (blocked.includes(targetUserId)) return NextResponse.json({ error: 'blocked' }, { status: 403 })
```

- [ ] **Step 3: 타입체크 + 실동작**

Run: `cd apps/web && npx tsc --noEmit`
실동작: 차단 관계에서 상대 곡에 댓글/팔로우 시도 → 403.

- [ ] **Step 4: 커밋 준비**
```
feat(block): 차단 관계 상호작용(댓글·팔로우) 차단
```

---

## Task 5: 모바일 차단 진입점 + 플로우

**Files:**
- Create: `apps/mobile/src/lib/block.ts`
- Modify: `apps/mobile/src/lib/use-public-song-more.tsx`
- Modify: `apps/mobile/src/components/ui/public-song-more-sheet.tsx`
- Modify: 커뮤니티 포스트/댓글 더보기 시트, 프로필 헤더 컴포넌트

**Interfaces:**
- Consumes: `POST/DELETE /api/users/[id]/block`, 기존 신고 API.
- Produces: `blockUser(userId): Promise<void>`, `unblockUser(userId): Promise<void>`, `listBlocked(): Promise<Blocked[]>` (block.ts).

- [ ] **Step 1: 모바일 API 래퍼**

`apps/mobile/src/lib/block.ts`:
```ts
import { api } from './api'

export interface BlockedUser { id: string; display_name: string; avatar_url: string | null }

export const blockUser = (userId: string) => api.post(`/api/users/${userId}/block`)
export const unblockUser = (userId: string) => api.del(`/api/users/${userId}/block`)
export const listBlocked = async (): Promise<BlockedUser[]> => {
  const r = await api.get('/api/users/blocked') as { blocked: BlockedUser[] }
  return r.blocked
}
```

- [ ] **Step 2: 곡 더보기 시트에 차단 행**

`public-song-more-sheet.tsx` — 신고 `Row` 아래에:
```tsx
<Row icon="slash" label="차단" onPress={run(onBlock)} color={mono.color.danger} />
```
props에 `onBlock: () => void` 추가.

- [ ] **Step 3: use-public-song-more에 차단 핸들러 + 신고 연계**

`use-public-song-more.tsx`:
```ts
import { blockUser } from '@/lib/block'
import { toast } from '@/lib/toast'

const block = (song: PublicSong) => {
  Alert.alert('이 사용자를 차단할까요?', `${song.authorName}님의 콘텐츠가 더 이상 보이지 않아요.`, [
    { text: '아니요', style: 'cancel' },
    { text: '차단하기', style: 'destructive', onPress: async () => {
      try {
        await blockUser(song.userId)
        toast.success('차단했어요')
        onChanged?.()
        // 신고 함께 제안
        Alert.alert('신고도 하시겠어요?', '부적절한 콘텐츠라면 신고해 주세요.', [
          { text: '건너뛰기', style: 'cancel' },
          { text: '신고하기', onPress: () => report(song) },
        ])
      } catch { toast.error('처리에 실패했어요') }
    } },
  ])
}
```
`onBlock={() => { if (ref.current && requireAuth()) block(ref.current) }}` 로 시트에 전달. `song.userId`/`song.authorName` 실제 필드명 확인.

- [ ] **Step 4: 커뮤니티 포스트/댓글 더보기 + 프로필 헤더**

커뮤니티 `post-card` 더보기 시트, 댓글 더보기 시트, 프로필 화면 헤더 ⋮ 에도 동형으로 "차단" 추가(신고 옆). 프로필 헤더는 대상 유저 id로 `blockUser` 호출 + 차단 후 프로필에서 뒤로가기 또는 빈 상태.

- [ ] **Step 5: 타입체크**

Run: `cd apps/mobile && npx tsc --noEmit`

- [ ] **Step 6: 커밋 준비**
```
feat(mobile/block): 차단 진입점(곡·커뮤·프로필) + 신고 연계 플로우
```

---

## Task 6: 모바일 차단 목록 화면

**Files:**
- Create: `apps/mobile/src/app/blocked-users.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/app/settings.tsx`

**Interfaces:**
- Consumes: `listBlocked`, `unblockUser` (Task 5).

- [ ] **Step 1: 라우트 등록**

`_layout.tsx` — settings 근처:
```tsx
<Stack.Screen name="blocked-users" options={{ presentation: 'modal' }} />
```

- [ ] **Step 2: 설정 셀 추가**

`settings.tsx` — 이용안내 섹션 근처에 새 `styles.group`:
```tsx
<View style={styles.group}>
  <Pressable style={styles.cell} onPress={() => router.push('/blocked-users')}>
    <View style={styles.linkLeft}>
      <Icon name="slash" size={18} color={mono.color.textSecondary} />
      <Text style={styles.cellText}>차단 목록</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>
</View>
```

- [ ] **Step 3: 차단 목록 화면**

`blocked-users.tsx` — 헤더("차단 목록") + `listBlocked()` 로드 + FlatList(아바타·이름·"차단 해제" 버튼). 해제 시 `unblockUser(id)` → 목록 갱신. 비면 empty 상태("차단한 사용자가 없어요"). 기존 modal 화면(settings.tsx 등)의 헤더·리스트 스타일 패턴 재사용.

- [ ] **Step 4: 타입체크 + 실동작**

Run: `cd apps/mobile && npx tsc --noEmit`
실동작(시뮬): 설정 → 차단 목록 → 항목 → 차단 해제 → 목록에서 사라짐.

- [ ] **Step 5: 커밋 준비**
```
feat(mobile/block): 설정 차단 목록 화면 + 해제
```

---

## Task 7: 웹 차단 UI

**Files:**
- Modify: `apps/web/components/SongDetailPage.tsx` (`SongMoreMenu` line 721~)
- Create: `apps/web/components/BlockedUsersSection.tsx`
- Modify: 내 계정/설정 페이지 (차단 목록 섹션 삽입)

**Interfaces:**
- Consumes: block API (Task 2), `ConfirmModal`.

- [ ] **Step 1: SongMoreMenu에 차단**

`SongDetailPage.tsx` — 신고 버튼(line 787-791) 아래에 `onBlock?` prop 기반 버튼 추가:
```tsx
{!isOwner && onBlock && (
  <button onClick={() => { setOpen(false); onBlock() }}
    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
    차단
  </button>
)}
```
호출부: `onBlock={!isOwner ? () => setBlockOpen(true) : undefined}` + `const [blockOpen, setBlockOpen] = useState(false)` + `<ConfirmModal open={blockOpen} variant="danger" title="이 사용자를 차단할까요?" confirmLabel="차단하기" onConfirm={...} onClose={() => setBlockOpen(false)} />`. onConfirm에서 `fetch('/api/users/{userId}/block', { method: 'POST' })` 후 성공 시 차단 완료 + 선택적 신고 모달.

- [ ] **Step 2: 차단 목록 섹션**

`BlockedUsersSection.tsx` — `GET /api/users/blocked` 로드, 리스트(아바타·이름·"차단 해제"), 해제 `DELETE /api/users/{id}/block`. 내 계정/설정 페이지에 삽입.

- [ ] **Step 3: 타입체크 + 실동작**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: 커밋 준비**
```
feat(web/block): 더보기 차단 + 차단 목록 관리
```

---

## Task 8: 신고 24h 표시 + 이용약관 조항

**Files:**
- Modify: `apps/web/app/(admin)/admin/reports/page.tsx`
- Modify: 이용약관 소스(`apps/web/app/terms/page.tsx` 또는 약관 데이터)

**Interfaces:** 없음(독립 보강).

- [ ] **Step 1: 어드민 신고 큐 경과 시간**

`admin/reports/page.tsx` — 각 신고 행에 `createdAt` 기준 경과 시간 표시. 24h 초과 pending은 빨강 강조:
```tsx
const hours = (Date.now() - new Date(createdAt).getTime()) / 3.6e6
<span className={hours > 24 ? 'text-red-400' : 'text-white/50'}>{formatElapsed(createdAt)}</span>
```

- [ ] **Step 2: 이용약관 무관용 조항**

이용약관에 "부적절 콘텐츠 및 학대 행위에 대한 무관용(zero tolerance) — 신고된 콘텐츠는 24시간 내 검토하며, 위반 시 콘텐츠 삭제 및 계정 정지" 취지 조항이 있는지 확인. 없으면 추가.

- [ ] **Step 3: 타입체크 + 커밋 준비**

Run: `cd apps/web && npx tsc --noEmit`
```
feat(moderation): 신고 24h 경과 표시 + 이용약관 무관용 조항
```

---

## Task 9: IAP 활성화

**Files:**
- Modify: `apps/mobile/.env`
- EAS production 환경변수 (`eas env` 또는 EAS 대시보드)

**Interfaces:** 없음.

- [ ] **Step 1: 로컬 플래그**

`apps/mobile/.env`: `EXPO_PUBLIC_IAP_ENABLED=false` → `true`.

- [ ] **Step 2: EAS production 환경변수**

`EXPO_PUBLIC_IAP_ENABLED=true`를 production 환경에 설정(현재 false로 로드됨). 명령: `cd apps/mobile && npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_IAP_ENABLED --value true --visibility plaintext` (기존 값 있으면 update).

- [ ] **Step 3: 검증**

시뮬레이터는 StoreKit 상품 없이 빈 목록만 확인 가능(정상). 실제 상품 표시는 TestFlight(Sandbox)에서 검증. 크레딧 충전 화면 진입 시 크래시 없이 상품 로딩 시도되는지 확인.

- [ ] **Step 4: 커밋 준비**
```
feat(iap): 인앱결제 활성화(EXPO_PUBLIC_IAP_ENABLED=true)
```

---

## 실행 후 (계획 밖)

- Build 12 재빌드(react-native-iap 네이티브) → TestFlight.
- iPad 시뮬/실기기 검증: 차단 플로우·차단 목록·해제·IAP 상품 로딩.
- **스크린 녹화**(실기기 권장): ① 로그인 전 EULA 제시 ② 신고 ③ 차단 ④ 차단 해제.
- App Store Connect: IAP 상품 4종을 이 빌드 심사에 첨부(상품별 스크린샷) + 녹화를 App Review Notes에 첨부.
- Resolution Center 회신: 차단·신고·필터·24h 정책 + IAP 제출 안내.

## 자기 리뷰 체크리스트 (완료)

- 스펙 커버리지: 차단(1~7)·24h(8)·EULA(8)·IAP(9) 전부 태스크 있음. ✅
- 피드 필터 대상: 곡·프로필·커뮤니티·댓글(Task 3) — 스펙 §4 대상과 일치. ✅
- 타입 일관성: `getBlockedUserIds`/`createBlock`/`removeBlock`/`listBlocked` 정의(Task1)와 사용(Task2~5) 일치. ✅
- 플레이스홀더: 각 태스크 실제 코드 포함. 실행 시 확인 필요 지점은 인용 주석으로 명시. ✅
