# 모바일 푸시 알림 (Expo/APNs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MONO 네이티브 iOS 앱에 Expo Push(APNs) 알림을 도입한다 — 기존 웹 푸시 인프라를 확장하고, 카테고리별 on/off 설정과 딥링크를 추가한다.

**Architecture:** 발송·게이팅은 `push.service.ts` 한 곳에서 처리한다. `push_subscriptions`에 `platform` 컬럼을 더해 Expo 토큰을 같은 테이블에 저장하고, `sendPushToUser`가 web(VAPID)·expo(Expo Push API) 두 채널로 병행 발송하며 `notification_preferences`로 카테고리별 배달을 게이팅한다. 모바일은 로그인 시 토큰을 등록하고 알림 탭 시 payload의 `data.route`로 딥링크한다.

**Tech Stack:** Next.js(커스텀 버전 — `node_modules/next/dist/docs/` 참조), Supabase(Postgres+RLS), `web-push`(기존), Expo SDK 57(`expo-notifications`, `expo-device`), expo-router, `@mono/shared`(vitest), npm workspaces + Turborepo.

## Global Constraints

- **Next.js는 학습 데이터와 다름** — 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드 정독(`apps/web/AGENTS.md`).
- **Expo v57 문서 정독** — 모바일 코드 작성 전 https://docs.expo.dev/versions/v57.0.0/ (`apps/mobile/AGENTS.md`).
- **npm workspaces**(pnpm 아님). 네이티브 의존성은 `apps/mobile/package.json`에 **직접 선언**해야 autolink됨(루트에 설치 금지 — 영상 커버 함정 재발 방지).
- **브랜치 `feat/mobile-push`에서만 작업. main 직접 커밋 금지.** 웹 소스 변경 있는 태스크는 머지 전 `npm run build -w web` 통과 필수. `@mono/shared` 변경은 `npm run test -w @mono/shared`.
- **네이티브 의존성 추가 시 OTA 미반영** — EAS/네이티브 리빌드부터 반영. iOS 리빌드: `cd apps/mobile && PATH=/opt/homebrew/bin:$PATH npx expo run:ios --device "<실기기명>"`.
- **iOS 푸시 실배달은 실기기 전용**(시뮬레이터 미지원).
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- `sendPushToUser`는 **절대 throw 하지 않는다**(발송 실패가 트리거 요청을 막으면 안 됨) — 기존 계약 유지.

---

### Task 1: `@mono/shared` — PushCategory 타입·매핑·라벨

**Files:**
- Modify: `packages/shared/src/domain/index.ts` (NotificationType 정의 아래, line ~112)
- Test: `packages/shared/src/domain/push-category.test.ts` (신규)

**Interfaces:**
- Produces:
  - `type PushCategory = 'song_complete' | 'likes' | 'comments' | 'follow' | 'community' | 'credit'`
  - `PUSH_CATEGORIES: readonly PushCategory[]`
  - `PUSH_CATEGORY_LABELS: Record<PushCategory, string>` (한국어)
  - `notificationTypeToCategory(type: NotificationType): PushCategory | null` — 토글 대상 아닌 타입(`system`)은 `null`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/src/domain/push-category.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_LABELS,
  notificationTypeToCategory,
} from './index'

describe('push category', () => {
  it('카테고리 6종', () => {
    expect(PUSH_CATEGORIES).toEqual([
      'song_complete', 'likes', 'comments', 'follow', 'community', 'credit',
    ])
  })

  it('모든 카테고리에 라벨', () => {
    for (const c of PUSH_CATEGORIES) {
      expect(PUSH_CATEGORY_LABELS[c]).toBeTruthy()
    }
  })

  it('알림 타입 → 카테고리 매핑', () => {
    expect(notificationTypeToCategory('song_complete')).toBe('song_complete')
    expect(notificationTypeToCategory('like')).toBe('likes')
    expect(notificationTypeToCategory('comment')).toBe('comments')
    expect(notificationTypeToCategory('follow')).toBe('follow')
    expect(notificationTypeToCategory('community_like')).toBe('community')
    expect(notificationTypeToCategory('community_closing')).toBe('community')
    expect(notificationTypeToCategory('credit_charged')).toBe('credit')
  })

  it('system 은 토글 대상 아님', () => {
    expect(notificationTypeToCategory('system')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -w @mono/shared`
Expected: FAIL — `PUSH_CATEGORIES` 등 export 없음.

- [ ] **Step 3: 최소 구현**

`packages/shared/src/domain/index.ts`의 `NotificationType` 정의(line 112) **바로 아래**에 추가:
```ts
// 푸시 알림 카테고리 — 설정 화면 토글 단위. system(공지)은 토글 대상 아님.
export type PushCategory = 'song_complete' | 'likes' | 'comments' | 'follow' | 'community' | 'credit'

export const PUSH_CATEGORIES: readonly PushCategory[] = [
  'song_complete', 'likes', 'comments', 'follow', 'community', 'credit',
]

export const PUSH_CATEGORY_LABELS: Record<PushCategory, string> = {
  song_complete: '곡 완성',
  likes: '좋아요',
  comments: '댓글·답글',
  follow: '팔로우',
  community: '커뮤니티',
  credit: '크레딧 충전',
}

export function notificationTypeToCategory(type: NotificationType): PushCategory | null {
  switch (type) {
    case 'song_complete': return 'song_complete'
    case 'like': return 'likes'
    case 'comment': return 'comments'
    case 'follow': return 'follow'
    case 'community_like':
    case 'community_comment':
    case 'community_closing': return 'community'
    case 'credit_charged': return 'credit'
    default: return null // 'system'
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -w @mono/shared`
Expected: PASS (기존 테스트 + 신규 4 케이스).

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/domain/index.ts packages/shared/src/domain/push-category.test.ts
git commit -m "feat(shared): PushCategory 타입·매핑·라벨

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 마이그레이션 056 — push_subscriptions 확장 + notification_preferences

**Files:**
- Create: `apps/web/supabase/migrations/056_push_expo_and_prefs.sql`

**Interfaces:**
- Produces: `push_subscriptions.platform` 컬럼, nullable `p256dh`/`auth`; `notification_preferences` 테이블(user_id PK + 6 boolean).

- [ ] **Step 1: 마이그레이션 파일 작성**

`apps/web/supabase/migrations/056_push_expo_and_prefs.sql`:
```sql
-- 056_push_expo_and_prefs.sql
-- push_subscriptions: Expo/APNs 토큰 수용 (endpoint=ExponentPushToken, platform='expo', p256dh/auth NULL)
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth   DROP NOT NULL;

-- 알림 카테고리별 푸시 on/off (opt-out: 행 없으면 전부 ON)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  song_complete boolean NOT NULL DEFAULT true,
  likes         boolean NOT NULL DEFAULT true,
  comments      boolean NOT NULL DEFAULT true,
  follow        boolean NOT NULL DEFAULT true,
  community     boolean NOT NULL DEFAULT true,
  credit        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_prefs_select_own ON notification_preferences
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notif_prefs_write_own ON notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: 로컬 SQL 문법 확인(선택)**

기존 마이그레이션과 형식 대조: `042_push_subscriptions.sql`, `055_community_closure.sql`와 컨벤션(주석 헤더·`IF NOT EXISTS`·RLS) 일치하는지 육안 확인.

- [ ] **Step 3: 마이그레이션 적용**

Supabase에 적용(둘 중 하나):
- MCP: `mcp__claude_ai_Supabase__apply_migration` (name=`056_push_expo_and_prefs`, query=위 SQL).
- 또는 유저가 Supabase 대시보드/CLI로 적용.

적용 후 확인: `push_subscriptions`에 `platform` 컬럼, `notification_preferences` 테이블 존재.
> ⚠️ 서버 코드(Task 3~5)는 이 스키마에 의존하므로 **머지·배포 전 프로덕션 DB에도 적용** 필요.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/supabase/migrations/056_push_expo_and_prefs.sql
git commit -m "feat(db): push_subscriptions platform 컬럼 + notification_preferences (056)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `push.service.ts` — Expo 채널 + category 게이팅

**Files:**
- Modify: `apps/web/services/push.service.ts`

**Interfaces:**
- Consumes: `PushCategory` from `@mono/shared`.
- Produces: `sendPushToUser(userId: string, payload: PushPayload, category?: PushCategory): Promise<void>` (시그니처 확장, 하위호환 — category 미전달 시 게이팅 없음). `PushPayload`에 `data?: Record<string, string>` 추가.

- [ ] **Step 1: PushPayload 확장 + import**

`apps/web/services/push.service.ts` 상단 import에 추가:
```ts
import type { PushCategory } from '@mono/shared'
```
`PushPayload` 인터페이스에 `data?` 추가:
```ts
export interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
  data?: Record<string, string>  // Expo 딥링크용 — { route: '/(tabs)' } 등
}
```

- [ ] **Step 2: Expo 발송 함수 추가**

`sendToSubs` 아래에 추가:
```ts
// Expo Push API로 발송. 만료(DeviceNotRegistered) 토큰 자동 삭제. throw 안 함.
async function sendToExpo(tokens: string[], payload: PushPayload): Promise<void> {
  const admin = createAdminClient()
  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body ?? '',
    sound: 'default' as const,
    data: payload.data ?? {},
  }))
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      })
      const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> }
      const results = json.data ?? []
      await Promise.all(results.map(async (r, idx) => {
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
          await admin.from('push_subscriptions').delete().eq('endpoint', chunk[idx].to)
        }
      }))
    } catch (e) {
      console.error('[push] expo send 실패:', (e as Error).message)
    }
  }
}
```

- [ ] **Step 3: sendPushToUser 게이팅 + 분기**

`sendPushToUser`를 아래로 교체:
```ts
// 한 사용자의 모든 구독 기기(web+expo)로 푸시. category 지정 시 프리퍼런스로 게이팅. 실패해도 throw 안 함.
export async function sendPushToUser(userId: string, payload: PushPayload, category?: PushCategory): Promise<void> {
  // ensureConfigured()는 web-push(VAPID) 전용 — expo 채널은 VAPID 불필요하므로 여기서 조기 return 안 함.
  const admin = createAdminClient()

  // 카테고리 게이팅: 프리퍼런스 행이 있고 해당 컬럼이 false면 발송 skip (opt-out)
  if (category) {
    const { data: pref } = await admin
      .from('notification_preferences')
      .select(category)
      .eq('user_id', userId)
      .maybeSingle()
    if (pref && (pref as Record<string, boolean>)[category] === false) return
  }

  const { data } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, platform')
    .eq('user_id', userId)
  if (!data || !data.length) return

  const webSubs = data.filter((s) => s.platform !== 'expo' && s.p256dh && s.auth) as Sub[]
  const expoTokens = data.filter((s) => s.platform === 'expo').map((s) => s.endpoint as string)

  if (webSubs.length && ensureConfigured()) await sendToSubs(webSubs, payload)
  if (expoTokens.length) await sendToExpo(expoTokens, payload)
}
```
> 주의: `select(category)`는 category가 컬럼명(`'likes'` 등)이라 안전(Task 1의 6개 값만 들어옴). `.maybeSingle()`은 행 없으면 `null` → 게이팅 없음(전부 ON).

- [ ] **Step 4: sendPushToAll에 expo 채널 병행**

`sendPushToAll` 내부 `sendToSubs` 호출부를 web/expo 분기로 교체:
```ts
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth, platform').limit(100000)
  if (!data || !data.length) return
  const webSubs = data.filter((s) => s.platform !== 'expo' && s.p256dh && s.auth) as Sub[]
  const expoTokens = data.filter((s) => s.platform === 'expo').map((s) => s.endpoint as string)
  if (ensureConfigured()) {
    for (let i = 0; i < webSubs.length; i += 500) await sendToSubs(webSubs.slice(i, i + 500), payload)
  }
  for (let i = 0; i < expoTokens.length; i += 100) await sendToExpo(expoTokens.slice(i, i + 100), payload)
}
```

- [ ] **Step 5: 타입체크·빌드**

Run: `npm run build -w web`
Expected: exit 0. (타입 에러 없이 빌드 성공.)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/services/push.service.ts
git commit -m "feat(web): push.service Expo 채널 + category 게이팅

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 구독 엔드포인트 — expo 분기

**Files:**
- Modify: `apps/web/app/api/push/subscribe/route.ts`
- Modify: `apps/web/app/api/push/unsubscribe/route.ts`

**Interfaces:**
- Consumes: `push_subscriptions` (platform 컬럼).
- Produces: `POST /api/push/subscribe` 가 `{ platform:'expo', token }` 수용; `POST /api/push/unsubscribe` 가 `{ token }` 수용.

- [ ] **Step 1: subscribe expo 분기**

`apps/web/app/api/push/subscribe/route.ts` — user 인증 통과 직후, 기존 웹 파싱 **앞**에 expo 분기 추가:
```ts
  // Expo/APNs 토큰 등록 (모바일)
  if ((body as { platform?: string })?.platform === 'expo') {
    const token = typeof (body as { token?: unknown }).token === 'string' ? (body as { token: string }).token : ''
    if (!token) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin
      .from('push_subscriptions')
      .upsert({ user_id: user.id, endpoint: token, platform: 'expo' }, { onConflict: 'endpoint' })
    if (error) { console.error('[push.subscribe.expo]', error.message); return NextResponse.json({ error: 'internal' }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  }
```
> `body`는 이미 `try { body = await req.json() }`로 파싱됨. expo 분기를 웹 endpoint 파싱 전에 두어 웹 경로 무변경. body 타입에 `platform?`, `token?` 추가 필요 시 캐스팅(위 코드처럼).

- [ ] **Step 2: unsubscribe expo 분기**

`apps/web/app/api/push/unsubscribe/route.ts` 읽고, 기존 endpoint 삭제 로직 옆에 `token`(expo) 케이스 추가:
```ts
  // 바디에서 token(expo) 또는 endpoint(web) 추출 후 해당 행 삭제
  const key = typeof body.token === 'string' ? body.token : (typeof body.endpoint === 'string' ? body.endpoint : '')
  if (!key) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const admin = createAdminClient()
  await admin.from('push_subscriptions').delete().eq('endpoint', key).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
```
> 실제 파일 구조에 맞춰 변수명·기존 로직 보존하며 병합. `endpoint`와 `token` 모두 `endpoint` 컬럼으로 매칭(expo 토큰도 endpoint에 저장하므로 동일).

- [ ] **Step 3: 빌드**

Run: `npm run build -w web`
Expected: exit 0.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/app/api/push/subscribe/route.ts apps/web/app/api/push/unsubscribe/route.ts
git commit -m "feat(web): push subscribe/unsubscribe Expo 토큰 분기

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 프리퍼런스 엔드포인트 (GET/POST)

**Files:**
- Create: `apps/web/app/api/notifications/preferences/route.ts`

**Interfaces:**
- Consumes: `notification_preferences`, `PUSH_CATEGORIES` from `@mono/shared`.
- Produces:
  - `GET /api/notifications/preferences` → `{ preferences: Record<PushCategory, boolean> }` (행 없으면 전부 true).
  - `POST /api/notifications/preferences` (바디 `{ category: PushCategory, enabled: boolean }`) → `{ ok: true }`.

- [ ] **Step 1: 라우트 작성**

`apps/web/app/api/notifications/preferences/route.ts`:
```ts
// 알림 카테고리별 푸시 on/off. GET=조회(기본 전부 ON), POST=단일 토글 upsert.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUSH_CATEGORIES, type PushCategory } from '@mono/shared'

function defaults(): Record<PushCategory, boolean> {
  return PUSH_CATEGORIES.reduce((a, c) => { a[c] = true; return a }, {} as Record<PushCategory, boolean>)
}

export async function GET() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle()
  const prefs = defaults()
  if (data) for (const c of PUSH_CATEGORIES) prefs[c] = (data as Record<string, boolean>)[c] !== false
  return NextResponse.json({ preferences: prefs })
}

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { category?: unknown; enabled?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const category = body.category as PushCategory
  if (!PUSH_CATEGORIES.includes(category) || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notification_preferences')
    .upsert({ user_id: user.id, [category]: body.enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { console.error('[notif.prefs.post]', error.message); return NextResponse.json({ error: 'internal' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build -w web`
Expected: exit 0.

- [ ] **Step 3: 수동 스모크(dev 서버)**

```bash
npm run dev -w web   # 별도 터미널, localhost:3000
# 인증 토큰 없이 401 확인:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/notifications/preferences
```
Expected: `401`.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/app/api/notifications/preferences/route.ts
git commit -m "feat(web): 알림 프리퍼런스 GET/POST 엔드포인트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 트리거 배선 — category 추가 + 신규 push

**Files:**
- Modify: `apps/web/app/api/generate/route.ts` (category 추가)
- Modify: `apps/web/app/api/songs/[id]/like/route.ts` (category 추가)
- Modify: `apps/web/app/api/songs/[id]/comments/route.ts` (category 추가)
- Modify: `apps/web/app/api/comments/[id]/reply/route.ts` (category 추가)
- Modify: `apps/web/services/video-finalize.service.ts` (신규 push)
- Modify: `apps/web/app/api/profiles/[id]/follow/route.ts` (신규 push)
- Modify: `apps/web/services/community.service.ts` (신규 push)
- Modify: `apps/web/services/community-post.service.ts` (신규 push)
- Modify: `apps/web/services/payment.service.ts` (신규 push)

**Interfaces:**
- Consumes: `sendPushToUser(userId, payload, category)` (Task 3).
- Produces: 모든 알림 타입이 모바일 딥링크 route 포함해 발송됨.

- [ ] **Step 1: 기존 4 호출에 category + data.route 추가**

각 파일에서 기존 `sendPushToUser(...)` 호출을 아래처럼 확장(payload에 `data:{route}` 추가, 세 번째 인자 category):
```ts
// generate/route.ts (곡 완성) — 기존 호출에 추가:
await sendPushToUser(user.id, { title: '곡이 완성됐어요', body: doneTitle, url: '/library', tag: `song-${songId}`, data: { route: '/(tabs)' } }, 'song_complete')

// songs/[id]/like/route.ts:
await sendPushToUser(song.user_id, { title: '새 좋아요', body: '내 곡을 좋아했어요', url: `/?song=${songId}`, tag: `like-${songId}`, data: { route: '/(tabs)' } }, 'likes')

// songs/[id]/comments/route.ts:
await sendPushToUser(song.user_id, { title: '새 댓글', body: `${songTitle}에 댓글이 달렸어요`, url: `/?song=${songId}`, tag: `comment-${songId}`, data: { route: '/(tabs)' } }, 'comments')

// comments/[id]/reply/route.ts:
await sendPushToUser(parentUserId, { title: '새 답글', body: '내 댓글에 답글이 달렸어요', url: `/?song=${song.id}`, tag: `reply-${song.id}`, data: { route: '/(tabs)' } }, 'comments')
```

- [ ] **Step 2: video-finalize 신규 push (곡 완성/영상)**

`apps/web/services/video-finalize.service.ts` 읽기. `admin.from('notifications').insert({ ... type:'song_complete' ... })` **직후**에 push 추가(이미 `sendPushToUser` import 없으면 추가):
```ts
import { sendPushToUser } from '@/services/push.service'
// 영상 커버 완료 알림 insert 직후:
await sendPushToUser(song.user_id, { title: '영상 커버가 완성됐어요', body: song.title ?? '', tag: `video-${song.id}`, data: { route: '/(tabs)' } }, 'song_complete')
// 실패 케이스 insert 직후:
await sendPushToUser(song.user_id, { title: '영상 커버 생성 실패', body: song.title ?? '', tag: `video-fail-${song.id}`, data: { route: '/(tabs)' } }, 'song_complete')
```

- [ ] **Step 3: follow 신규 push**

`apps/web/app/api/profiles/[id]/follow/route.ts` 읽기. `type:'follow'` 알림 insert(팔로우가 새로 생성된 분기) **직후**에 추가. 대상=팔로우 당한 사용자, 행위자명은 파일 내 변수 사용(없으면 '누군가'):
```ts
import { sendPushToUser } from '@/services/push.service'
// 팔로우 알림 insert 직후 (targetUserId = 팔로우 당한 user, followerName = 팔로워 표시명):
await sendPushToUser(targetUserId, { title: '새 팔로워', body: `${followerName ?? '누군가'}님이 회원님을 팔로우해요`, tag: `follow-${followerId}`, data: { route: `/creator/${followerUsername}` } }, 'follow')
```
> 파일에 `followerUsername`이 없으면 조회하거나 route를 `/(tabs)`로 대체(후속 개선). 실제 변수명에 맞춰 병합.

- [ ] **Step 4: community 신규 push**

`apps/web/services/community.service.ts`와 `community-post.service.ts` 읽기. `type` 이 `community_like`/`community_comment`/`community_closing` 인 알림 insert 직후 각각 추가. `communityId`는 각 함수 스코프 변수 사용:
```ts
import { sendPushToUser } from '@/services/push.service'
// community_like insert 직후:
await sendPushToUser(postAuthorId, { title: '게시글 좋아요', body: '내 게시글을 좋아해요', data: { route: `/community/${communityId}` } }, 'community')
// community_comment insert 직후:
await sendPushToUser(postAuthorId, { title: '게시글 댓글', body: '내 게시글에 댓글이 달렸어요', data: { route: `/community/${communityId}` } }, 'community')
// community_closing insert 직후 (대량이면 각 대상 user에):
await sendPushToUser(memberId, { title: '커뮤니티 폐쇄 예정', body: '가입한 커뮤니티가 곧 닫혀요', data: { route: `/community/${communityId}` } }, 'community')
```
> closing은 여러 멤버 대상일 수 있음 — 기존 insert가 `insert(rows)` 벌크면, 각 대상에 `sendPushToUser` 루프(또는 향후 배치). 실제 코드 패턴에 맞춰 병합.

- [ ] **Step 5: credit 신규 push**

`apps/web/services/payment.service.ts` 읽기. `type:'credit_charged'` 알림 insert 직후 추가:
```ts
import { sendPushToUser } from '@/services/push.service'
// credit_charged insert 직후 (userId = 충전 대상):
await sendPushToUser(userId, { title: '크레딧이 충전됐어요', body: '', tag: 'credit', data: { route: '/settings' } }, 'credit')
```

- [ ] **Step 6: 빌드**

Run: `npm run build -w web`
Expected: exit 0. (모든 신규 import·호출 타입 통과.)

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/api apps/web/services
git commit -m "feat(web): 전 알림 트리거에 Expo 푸시 category + 딥링크 배선

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 모바일 — expo-notifications 설치 + eas init + push.ts

**Files:**
- Modify: `apps/mobile/package.json` (expo-notifications)
- Modify: `apps/mobile/app.json` (plugins + extra.eas.projectId + owner)
- Create: `apps/mobile/src/lib/push.ts`

**Interfaces:**
- Produces:
  - `registerForPush(): Promise<void>` — 권한 요청 + 토큰 등록.
  - `unregisterForPush(): Promise<void>` — 토큰 해제.
  - `configureNotificationHandler(): void` — 포그라운드 배너 핸들러.

- [ ] **Step 1: Expo v57 문서 정독**

https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ 및 push notifications 가이드(권한·getExpoPushTokenAsync·projectId·handler) 확인.

- [ ] **Step 2: 의존성 설치 (앱 워크스페이스에 직접)**

```bash
cd apps/mobile && npx expo install expo-notifications
```
`apps/mobile/package.json`의 `dependencies`에 `expo-notifications` 추가됐는지 확인(루트에 설치됐으면 루트에서 제거하고 앱으로 이동 — 영상 커버 함정 방지).

- [ ] **Step 3: app.json plugins + eas init**

`apps/mobile/app.json` `plugins` 배열에 `"expo-notifications"` 추가.
그다음:
```bash
cd apps/mobile && PATH=/opt/homebrew/bin:$PATH npx eas init
```
→ `app.json`에 `owner` + `extra.eas.projectId` 기록됨(유저 Expo 계정 로그인 필요할 수 있음 → `! eas login`).

- [ ] **Step 4: push.ts 작성**

`apps/mobile/src/lib/push.ts`:
```ts
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { api } from './api'

const TOKEN_KEY = 'expo_push_token'

// 포그라운드에서도 배너·소리 표시
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

// 권한 요청 + Expo 토큰 발급 + 서버 등록. 실기기 아니면 조용히 skip.
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) { console.warn('[push] projectId 없음'); return }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
    await api.post('/api/push/subscribe', { platform: 'expo', token })
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  } catch (e) {
    console.warn('[push] register 실패:', (e as Error).message)
  }
}

// 저장된 토큰 서버에서 해제 (로그아웃 시)
export async function unregisterForPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    if (!token) return
    await api.post('/api/push/unsubscribe', { token })
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch (e) {
    console.warn('[push] unregister 실패:', (e as Error).message)
  }
}
```
> `expo-constants`는 Expo에 기본 포함(별도 설치 불필요, 미포함이면 `npx expo install expo-constants`).

- [ ] **Step 5: 타입체크**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: 에러 없음(또는 기존과 동일한 무관 경고만).

- [ ] **Step 6: 커밋**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/app.json apps/mobile/src/lib/push.ts
git commit -m "feat(mobile): expo-notifications 설치 + push.ts(토큰 등록/해제)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 모바일 — 등록 훅 + 딥링크 리스너

**Files:**
- Modify: `apps/mobile/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `registerForPush`, `unregisterForPush`, `configureNotificationHandler` (Task 7); `useSession` (`src/lib/use-session.ts`).

- [ ] **Step 1: _layout.tsx 읽기**

`apps/mobile/src/app/_layout.tsx` 구조 파악(세션 게이트·Stack 위치, `index.js` 진입점의 LogBox 참고).

- [ ] **Step 2: 핸들러 설정 + 세션 훅 + 리스너 추가**

`_layout.tsx`에 추가(세션은 이미 `useSession` 또는 유사 훅으로 접근 가능 가정):
```tsx
import { useEffect, useRef } from 'react'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { configureNotificationHandler, registerForPush, unregisterForPush } from '@/lib/push'
import { useSession } from '@/lib/use-session'

// 모듈 로드 시 1회 — 포그라운드 핸들러
configureNotificationHandler()

// (컴포넌트 내부)
function usePushLifecycle() {
  const { session } = useSession()
  const wasAuthed = useRef(false)

  // 로그인/로그아웃에 따라 토큰 등록/해제
  useEffect(() => {
    if (session && !wasAuthed.current) { wasAuthed.current = true; registerForPush() }
    if (!session && wasAuthed.current) { wasAuthed.current = false; unregisterForPush() }
  }, [session])

  // 알림 탭 → 딥링크
  useEffect(() => {
    const go = (route?: unknown) => { if (typeof route === 'string' && route) router.push(route as never) }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      go(r.notification.request.content.data?.route)
    })
    // 콜드스타트: 알림 탭으로 앱이 열린 경우
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) go(r.notification.request.content.data?.route)
    })
    return () => sub.remove()
  }, [])
}
```
루트 컴포넌트에서 `usePushLifecycle()` 호출.
> `_layout`이 이미 `useSession`을 쓰고 있으면 중복 훅 대신 기존 세션 값에 이펙트만 추가. router.push의 타입은 typedRoutes off(app.json)라 `as never` 캐스팅 허용.

- [ ] **Step 3: 타입체크**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/mobile/src/app/_layout.tsx
git commit -m "feat(mobile): 세션 연동 푸시 등록/해제 + 알림 탭 딥링크

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 모바일 — 설정 알림 토글 UI

**Files:**
- Modify: `apps/mobile/src/app/settings.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/notifications/preferences` (Task 5); `PUSH_CATEGORIES`, `PUSH_CATEGORY_LABELS` from `@mono/shared`.

- [ ] **Step 1: settings.tsx 읽기**

`apps/mobile/src/app/settings.tsx` 현재 구조·스타일(mono 토큰·섹션 패턴) 파악.

- [ ] **Step 2: 알림 섹션 추가**

기존 설정 항목 아래 "알림" 섹션 추가:
```tsx
import { useEffect, useState } from 'react'
import { Switch, Linking } from 'react-native'
import { PUSH_CATEGORIES, PUSH_CATEGORY_LABELS, type PushCategory } from '@mono/shared'
import { api } from '@/lib/api'

// 컴포넌트 내부:
const [prefs, setPrefs] = useState<Record<PushCategory, boolean> | null>(null)

useEffect(() => {
  api.get('/api/notifications/preferences')
    .then((j) => setPrefs((j as { preferences: Record<PushCategory, boolean> }).preferences))
    .catch(() => setPrefs(null))
}, [])

const toggle = async (c: PushCategory, v: boolean) => {
  setPrefs((p) => (p ? { ...p, [c]: v } : p))            // 낙관적
  try { await api.post('/api/notifications/preferences', { category: c, enabled: v }) }
  catch { setPrefs((p) => (p ? { ...p, [c]: !v } : p)) }  // 롤백
}
```
렌더(mono 토큰 스타일 사용):
```tsx
{prefs && (
  <View>
    <Text style={styles.sectionTitle}>알림</Text>
    {PUSH_CATEGORIES.map((c) => (
      <View key={c} style={styles.prefRow}>
        <Text style={styles.prefLabel}>{PUSH_CATEGORY_LABELS[c]}</Text>
        <Switch value={prefs[c]} onValueChange={(v) => toggle(c, v)} />
      </View>
    ))}
    <Pressable onPress={() => Linking.openSettings()}>
      <Text style={styles.prefHint}>기기 알림이 꺼져 있다면 → 시스템 설정 열기</Text>
    </Pressable>
  </View>
)}
```
스타일 `sectionTitle`/`prefRow`/`prefLabel`/`prefHint`는 기존 settings.tsx의 StyleSheet 컨벤션(mono 토큰)에 맞춰 추가.

- [ ] **Step 3: 타입체크**

```bash
cd apps/mobile && npx tsc --noEmit
```
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/mobile/src/app/settings.tsx
git commit -m "feat(mobile): 설정 화면 알림 카테고리 토글

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: APNs 자격증명 + 실기기 빌드 + 검증

**Files:** (코드 변경 없음 — 자격증명·빌드·수동 검증)

**Interfaces:**
- Consumes: Task 1~9 전체.

- [ ] **Step 1: APNs 자격증명 (유저 인터랙티브)**

유저가 실행(Apple Developer 로그인 필요):
```
! cd apps/mobile && eas credentials
```
→ iOS → Push Notifications → EAS-관리 Push Key(.p8) 생성/업로드. (또는 `eas login` 먼저.)

- [ ] **Step 2: 실기기 dev 빌드**

```bash
cd apps/mobile && PATH=/opt/homebrew/bin:$PATH npx expo run:ios --device "<실기기명>"
```
> `xcrun xctrace list devices`로 연결된 실기기명 확인. 신뢰 프로파일·개발자 모드 필요.

- [ ] **Step 3: 토큰 등록 확인**

앱 실행 → 로그인 → 알림 권한 허용. Supabase에서:
```sql
select user_id, platform, left(endpoint, 20) from push_subscriptions where platform = 'expo';
```
Expected: 방금 로그인한 유저의 `platform='expo'` 행 존재.

- [ ] **Step 4: 테스트 발송**

https://expo.dev/notifications 에 ExponentPushToken 붙여넣고 title/body + data `{"route":"/(tabs)"}` 발송. 또는:
```bash
curl -s -X POST https://exp.host/--/api/v2/push/send -H 'Content-Type: application/json' \
  -d '[{"to":"ExponentPushToken[...]","title":"테스트","body":"푸시 확인","data":{"route":"/(tabs)"}}]'
```
Expected: 기기에 배너 수신 → 탭 시 라이브러리로 이동.

- [ ] **Step 5: 실 트리거 end-to-end**

- 타 계정으로 내 공개곡 좋아요 → '새 좋아요' 배너.
- 곡 생성 완료(생성 후 대기) → '곡이 완성됐어요' 배너 → 탭 → 라이브러리.
- 팔로우/커뮤니티 좋아요 → 각 배너 + 딥링크.

- [ ] **Step 6: 프리퍼런스 게이팅 검증**

설정 → '좋아요' 토글 OFF → 타 계정으로 재좋아요 → **푸시 안 옴**. 알림함(`/notifications`) 열면 좋아요 **기록은 있음**.

- [ ] **Step 7: 로그아웃 정리 검증**

로그아웃 → Step 3 쿼리 재실행 → 해당 토큰 행 삭제됨.

- [ ] **Step 8: 검증 결과 기록 + 커밋(있으면)**

검증 중 발견한 수정은 해당 Task로 되돌아가 반영·재검증. 최종적으로 결과를 `native-mobile-app` 메모리에 반영.

---

## 머지 & 배포 (전 태스크 통과 후, 유저 승인 하)

- [ ] `npm run build -w web` 최종 통과 확인(웹 소스 변경 있음).
- [ ] `npm run test -w @mono/shared` 통과.
- [ ] **마이그레이션 056이 프로덕션 Supabase에 적용됐는지 확인**(코드 배포 전 필수).
- [ ] 유저 승인 → `feat/mobile-push` → main 머지(no-ff) → origin push → Vercel 배포.
- [ ] `native-mobile-app` 메모리 업데이트(푸시 완료·남은 후보: IAP·제출·안드로이드).
