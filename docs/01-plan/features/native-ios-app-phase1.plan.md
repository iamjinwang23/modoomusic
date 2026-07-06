# MONO 네이티브 iOS 앱 — Phase 1 (기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Next.js 웹을 무중단으로 모노레포화하고, 공유 패키지·인증(쿠키+Bearer BFF)·Expo 앱 스켈레톤·디자인 프리미티브를 세워 이후 페이즈가 올라탈 기반을 완성한다.

**Architecture:** pnpm + Turborepo 모노레포. `apps/web`(기존 Next.js 이동), `apps/mobile`(Expo RN 신규), `packages/shared`(타입·에러코드·가격상수·API 클라이언트). 기존 Next.js API를 쿠키+Bearer 둘 다 받는 공용 BFF로 확장해 앱이 재사용한다.

**Tech Stack:** pnpm workspaces, Turborepo, Next.js 16(기존), Expo(managed, 최신 SDK) + Expo Router, React Native, TypeScript, Nativewind v4, `@supabase/supabase-js`, `expo-secure-store`, Vitest(shared 단위테스트).

> **설계 근거:** `docs/02-design/features/native-ios-app.design.md`. 이 Phase는 설계 §2·§3·§4에 해당.
> **주의(레포 규약):** 이 저장소의 Next.js는 변형판이다. 웹 라우트/서버 코드를 만질 때 **반드시 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 읽는다**(AGENTS.md).

## Global Constraints

- **웹 빌드 무중단**: 모노레포 이동 중 어느 커밋에서도 `pnpm --filter web build`가 통과해야 한다.
- **인증 하위호환**: 기존 **쿠키 인증 경로는 동작 보존**. Bearer는 *추가*만 한다(웹 회귀 금지).
- **패키지 매니저**: **pnpm** 단일. npm/yarn lock 파일 생성 금지.
- **shared import 별칭**: 웹·앱 모두 `@mono/shared`로 참조. 상대경로 `../../packages` 금지.
- **워딩**: 사용자 노출 문구는 확정 규약 따름 — 영상 생성은 "영상 만들기"(§ video-cover), "비디오" 미사용.
- **타입 단일 소스**: 도메인 타입은 `packages/shared/src/domain`에만 정의. `apps/*`에서 재정의 금지.
- **iOS deployment target**: 15.1 이상.

---

## 파일 구조 (이 Phase에서 생성/이동)

```
mono/
├─ pnpm-workspace.yaml            (생성)
├─ turbo.json                     (생성)
├─ package.json                   (루트, 생성 — workspace scripts)
├─ apps/
│  ├─ web/                        (기존 전체 이동: app/ components/ lib/ services/ features/ utils/ supabase/ public/ next.config 등)
│  └─ mobile/                     (Expo 신규)
│     ├─ app/                     (Expo Router)
│     ├─ lib/supabase.ts          (RN supabase 클라이언트)
│     ├─ lib/session.ts           (secure-store 세션 어댑터)
│     ├─ components/ui/           (DS 프리미티브)
│     ├─ tailwind.config.js
│     └─ app.json
└─ packages/
   └─ shared/
      ├─ package.json
      ├─ tsconfig.json
      ├─ vitest.config.ts
      └─ src/
         ├─ index.ts
         ├─ domain/index.ts       (types/domain.ts 이동)
         ├─ errors.ts
         ├─ pricing.ts
         └─ api-client.ts
```

---

## Task 1: pnpm 워크스페이스 + Turborepo 골격

**Files:**
- Create: `pnpm-workspace.yaml`, `turbo.json`, `package.json`(루트)

**Interfaces:**
- Produces: 워크스페이스 루트. 이후 모든 `pnpm --filter <pkg>` 명령이 여기서 동작.

- [ ] **Step 1: 현재 상태 확인 (웹 빌드 베이스라인)**

Run: `pnpm install && pnpm --silent next build >/dev/null 2>&1; echo "build exit: $?"`
Expected: 기존 루트에서 빌드 성공(exit 0). (아직 이동 전 — 베이스라인 확보)

- [ ] **Step 2: 워크스페이스 파일 생성**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "test": { "dependsOn": ["^build"] }
  }
}
```

루트 `package.json`:
```json
{
  "name": "mono",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "web": "pnpm --filter web dev",
    "mobile": "pnpm --filter mobile start"
  },
  "devDependencies": { "turbo": "^2.3.0" }
}
```

- [ ] **Step 3: turbo 설치 확인**

Run: `pnpm install && pnpm turbo --version`
Expected: 버전 출력(예: 2.x). 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml turbo.json package.json
git commit -m "chore(monorepo): pnpm workspace + turborepo 골격"
```

---

## Task 2: 기존 Next.js를 `apps/web`으로 이동 (무중단)

**Files:**
- Modify(이동): 루트의 웹 소스 전체 → `apps/web/`
- Modify: `apps/web/package.json`(name: "web"), `apps/web/tsconfig.json`(paths)

**Interfaces:**
- Produces: `apps/web` — `pnpm --filter web build` 통과 상태.

> **주의:** 이 Task는 순수 이동+경로조정. 로직 변경 0. AGENTS.md에 따라 Next 설정을 만질 땐 `node_modules/next/dist/docs/` 확인.

- [ ] **Step 1: 웹 소스를 apps/web으로 git mv**

Run:
```bash
mkdir -p apps/web
git mv app components lib services features utils supabase public \
        next.config.* tsconfig.json package.json \
        middleware.ts vercel.json AGENTS.md apps/web/ 2>/dev/null || true
ls apps/web
```
Expected: 위 디렉터리/파일들이 `apps/web/` 아래 존재. (존재하지 않는 항목은 무시)

- [ ] **Step 2: apps/web/package.json name 변경**

`apps/web/package.json`의 `"name"`을 `"web"`으로 수정. `scripts.build`가 `"next build"`인지 확인(그대로 유지).

- [ ] **Step 3: 웹 빌드로 이동 검증**

Run: `pnpm install && pnpm --filter web build 2>&1 | tail -5; echo "exit: ${PIPESTATUS[0]}"`
Expected: 빌드 성공(exit 0). 실패 시 `tsconfig.json`의 `baseUrl`/`paths`(`@/*` → `./*`)가 `apps/web` 기준으로 맞는지 확인 후 수정.

- [ ] **Step 4: Vercel 루트 디렉터리 메모**

`apps/web/vercel.json` 상단에 주석 추가:
```json
// Vercel Project > Settings > Root Directory 를 apps/web 으로 지정 필요 (배포 전 대시보드 설정)
```
그리고 이 사실을 커밋 메시지에 남긴다(배포 담당이 봐야 함).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(monorepo): 기존 Next.js를 apps/web으로 이동 (로직 무변경·빌드 통과) — Vercel Root Directory=apps/web 설정 필요"
```

---

## Task 3: `packages/shared` 생성 + 도메인 타입 이전

**Files:**
- Create: `packages/shared/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/domain/index.ts`
- Modify: `apps/web/**`의 `@/types/domain` import → `@mono/shared`

**Interfaces:**
- Produces: `@mono/shared`에서 `Community`, `CommunityPost`, `Notification`, `Song` 등 도메인 타입 export.

- [ ] **Step 1: shared 패키지 파일 생성**

`packages/shared/package.json`:
```json
{
  "name": "@mono/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "declaration": true, "skipLibCheck": true, "esModuleInterop": true
  },
  "include": ["src"]
}
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 2: 도메인 타입 이동**

Run:
```bash
mkdir -p packages/shared/src/domain
git mv apps/web/types/domain.ts packages/shared/src/domain/index.ts
```

`packages/shared/src/index.ts`:
```ts
export * from './domain'
export * from './errors'
export * from './pricing'
export * from './api-client'
```

- [ ] **Step 3: 웹 import 일괄 치환**

Run:
```bash
grep -rl "@/types/domain" apps/web --include=*.ts --include=*.tsx | \
  xargs sed -i '' "s#@/types/domain#@mono/shared#g"
```
(리눅스면 `sed -i` 에서 빈 인자 제거)

- [ ] **Step 4: 웹 workspace 의존성 추가 + 타입체크**

`apps/web/package.json`의 `dependencies`에 `"@mono/shared": "workspace:*"` 추가 후:

Run: `pnpm install && pnpm --filter web exec tsc --noEmit 2>&1 | tail -5; echo "exit: ${PIPESTATUS[0]}"`
Expected: 타입체크 통과(exit 0). 잔여 `@/types/domain` 참조 없음.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): @mono/shared 생성 + 도메인 타입 이전, 웹 import 전환"
```

---

## Task 4: shared 에러코드 + 가격상수

**Files:**
- Create: `packages/shared/src/errors.ts`, `packages/shared/src/pricing.ts`, `packages/shared/src/pricing.test.ts`

**Interfaces:**
- Produces: `API_ERROR`(에러코드 상수 맵), `CREDIT_PACKS`(플랫폼별 가격 테이블), `packPrice(packId, platform)`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/shared/src/pricing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { CREDIT_PACKS, packPrice } from './pricing'

describe('pricing', () => {
  it('앱 가격은 웹 대비 +30% (반올림)', () => {
    const pack = CREDIT_PACKS[0]
    expect(packPrice(pack.id, 'app')).toBe(Math.round(pack.webPriceKrw * 1.3))
  })
  it('알 수 없는 팩은 에러', () => {
    expect(() => packPrice('nope', 'web')).toThrow()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @mono/shared test 2>&1 | tail -5`
Expected: FAIL ("Cannot find module './pricing'").

- [ ] **Step 3: 구현**

`packages/shared/src/errors.ts`:
```ts
// API 라우트가 반환하는 에러코드 — 웹/앱 공용 매핑 소스
export const API_ERROR = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not_found',
  not_member: 'not_member',
  banned_word: 'banned_word',
  community_closing: 'community_closing',
  song_not_public: 'song_not_public',
  internal: 'internal',
} as const
export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR]
```

`packages/shared/src/pricing.ts`:
```ts
export type Platform = 'web' | 'app'
export interface CreditPack { id: string; credits: number; webPriceKrw: number }

// webPriceKrw = 웹(PortOne) 가격. 앱은 Apple IAP 로 +30%.
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_100', credits: 100, webPriceKrw: 4900 },
  { id: 'pack_300', credits: 300, webPriceKrw: 12900 },
  { id: 'pack_1000', credits: 1000, webPriceKrw: 39000 },
]

const APP_MARKUP = 1.3
export function packPrice(packId: string, platform: Platform): number {
  const pack = CREDIT_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error(`unknown pack: ${packId}`)
  return platform === 'app' ? Math.round(pack.webPriceKrw * APP_MARKUP) : pack.webPriceKrw
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @mono/shared test 2>&1 | tail -5`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/errors.ts packages/shared/src/pricing.ts packages/shared/src/pricing.test.ts
git commit -m "feat(shared): 에러코드·플랫폼별 크레딧 가격(앱 +30%) 상수"
```

---

## Task 5: shared API 클라이언트 (typed fetch + 토큰 주입)

**Files:**
- Create: `packages/shared/src/api-client.ts`, `packages/shared/src/api-client.test.ts`

**Interfaces:**
- Consumes: `ApiErrorCode` (Task 4).
- Produces: `createApiClient({ baseUrl, getToken }) => { get, post, del }`. 각 메서드는 `Authorization: Bearer`를 자동 첨부하고, 비-2xx면 `{ error: ApiErrorCode }`를 던진다.

- [ ] **Step 1: 실패 테스트 작성**

`packages/shared/src/api-client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { createApiClient } from './api-client'

describe('api-client', () => {
  it('토큰이 있으면 Authorization 헤더 첨부', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => 'TKN', fetchImpl: fetchMock })
    await api.get('/api/ping')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer TKN')
  })
  it('비-2xx면 error 코드로 throw', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) })
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => null, fetchImpl: fetchMock })
    await expect(api.get('/api/x')).rejects.toMatchObject({ error: 'forbidden' })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @mono/shared test api-client 2>&1 | tail -5`
Expected: FAIL ("Cannot find module './api-client'").

- [ ] **Step 3: 구현**

`packages/shared/src/api-client.ts`:
```ts
import type { ApiErrorCode } from './errors'

export interface ApiClientOpts {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}
export interface ApiError { error: ApiErrorCode | string; status: number }

export function createApiClient(opts: ApiClientOpts) {
  const doFetch = opts.fetchImpl ?? fetch
  async function req(method: string, path: string, body?: unknown) {
    const token = await opts.getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw { error: json.error ?? 'internal', status: res.status } as ApiError
    return json
  }
  return {
    get: (p: string) => req('GET', p),
    post: (p: string, body?: unknown) => req('POST', p, body),
    del: (p: string) => req('DELETE', p),
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @mono/shared test 2>&1 | tail -5`
Expected: PASS (4 passed 누적).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api-client.ts packages/shared/src/api-client.test.ts
git commit -m "feat(shared): typed API 클라이언트 (Bearer 토큰 자동 첨부·에러 매핑)"
```

---

## Task 6: 백엔드 인증 헬퍼 — Bearer 토큰 수용 (BFF)

**Files:**
- Modify: `apps/web/lib/supabase/server.ts` (`createUserClient`)
- Test: `apps/web/lib/supabase/server.bearer.test.ts`

**Interfaces:**
- Consumes: 기존 `createUserClient()` (쿠키 기반).
- Produces: `createUserClient()`가 요청 헤더에 `Authorization: Bearer <jwt>`가 있으면 그 토큰으로 인증하고, 없으면 기존 쿠키 경로를 그대로 쓴다. **쿠키 경로 동작 불변.**

> **주의:** `createUserClient`는 전 API 라우트의 공통 진입점 → 회귀 위험 최상. 반드시 `node_modules/next/dist/docs/`에서 이 Next 버전의 route handler/헤더 접근 방식을 확인 후 수정.

- [ ] **Step 1: 현재 구현 확인**

Run: `sed -n '1,80p' apps/web/lib/supabase/server.ts`
Expected: `createUserClient`가 `cookies()`로 세션을 읽는 구조 파악. (Bearer 분기 삽입 지점 식별)

- [ ] **Step 2: 실패 테스트 작성**

`apps/web/lib/supabase/server.bearer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveAuthToken } from './server'  // Step 3에서 추출할 순수 함수

describe('resolveAuthToken', () => {
  it('Authorization 헤더의 Bearer 토큰을 우선 반환', () => {
    const h = new Headers({ authorization: 'Bearer abc.def.ghi' })
    expect(resolveAuthToken(h)).toBe('abc.def.ghi')
  })
  it('Bearer 없으면 null (쿠키 경로로 위임)', () => {
    expect(resolveAuthToken(new Headers())).toBeNull()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인 → 순수 함수 추출 + 분기 구현**

Run: `pnpm --filter web exec vitest run server.bearer 2>&1 | tail -5`
Expected: FAIL ("resolveAuthToken is not exported").

`apps/web/lib/supabase/server.ts`에 추가/수정:
```ts
// Authorization 헤더에서 Bearer 토큰 추출 (RN 앱 경로). 없으면 null → 쿠키 경로 사용.
export function resolveAuthToken(headers: Headers): string | null {
  const auth = headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null
  return null
}
```
그리고 `createUserClient` 내부에서: 요청 헤더를 얻어 `resolveAuthToken`이 토큰을 주면 `createServerClient(..., { global: { headers: { Authorization: \`Bearer ${token}\` } }, cookies: { getAll: () => [], setAll: () => {} } })` 형태로 토큰 기반 클라이언트를 만들고, 없으면 **기존 쿠키 기반 코드 경로를 그대로 실행**. (기존 코드 라인은 삭제하지 말고 분기만 추가)

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `pnpm --filter web exec vitest run server.bearer 2>&1 | tail -5`
Expected: PASS (2 passed).

- [ ] **Step 5: 웹 회귀 확인 (쿠키 경로 불변)**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web build 2>&1 | tail -3; echo "exit: ${PIPESTATUS[0]}"`
Expected: 타입체크·빌드 통과(exit 0). 쿠키 경로 코드는 그대로 존재.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/supabase/server.ts apps/web/lib/supabase/server.bearer.test.ts
git commit -m "feat(bff): createUserClient에 Bearer 토큰 인증 경로 추가 (쿠키 경로 보존)"
```

---

## Task 7: Expo 앱 스켈레톤 (Expo Router + Nativewind)

**Files:**
- Create: `apps/mobile/` (Expo 프로젝트), `apps/mobile/tailwind.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, 탭 5개 stub

**Interfaces:**
- Produces: 시뮬레이터에서 부팅되는 탭 셸(홈·탐색·생성·커뮤니티·내정보).

- [ ] **Step 1: Expo 앱 생성**

Run:
```bash
cd apps && pnpm create expo-app@latest mobile --template tabs@latest && cd ..
```
Expected: `apps/mobile` 생성. `apps/mobile/package.json` name을 `"mobile"`로 수정.

- [ ] **Step 2: Nativewind + 워크스페이스 의존성 설치**

Run:
```bash
pnpm --filter mobile add nativewind tailwindcss react-native-reanimated
pnpm --filter mobile add @mono/shared@workspace:*
```

`apps/mobile/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
}
```
(metro/babel의 nativewind 설정은 nativewind v4 설치 가이드 그대로 적용 — `apps/mobile`의 `metro.config.js`·`babel.config.js` 수정.)

- [ ] **Step 3: 탭 5개 stub 작성**

`apps/mobile/app/(tabs)/_layout.tsx` — 탭 5개(index/explore/create/community/me) 정의. 각 탭 화면은 화면명만 렌더하는 stub:
```tsx
import { View, Text } from 'react-native'
export default function CreateScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-[#111318]">
      <Text className="text-white text-lg">만들기</Text>
    </View>
  )
}
```
(나머지 4개도 동일 패턴, 라벨만 다르게: 홈·탐색·커뮤니티·내정보)

- [ ] **Step 4: 부팅 검증 (타입체크 + 번들)**

Run: `pnpm --filter mobile exec tsc --noEmit 2>&1 | tail -3; echo "tsc: ${PIPESTATUS[0]}"`
Expected: 타입체크 통과. (시뮬레이터 실행은 `pnpm --filter mobile start` 로 수동 확인 — 탭 5개 노출·Nativewind className 적용 확인)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): Expo 앱 스켈레톤 + Nativewind + 탭 5개 셸"
```

---

## Task 8: RN Supabase 인증 (secure-store 세션 + 로그인)

**Files:**
- Create: `apps/mobile/lib/session.ts`, `apps/mobile/lib/supabase.ts`, `apps/mobile/lib/api.ts`, `apps/mobile/app/(auth)/login.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (세션 게이트)

**Interfaces:**
- Consumes: `createApiClient` (Task 5).
- Produces: `supabase`(RN 클라이언트), `api`(토큰 자동 첨부 API 클라이언트), 로그인 후 세션이 `expo-secure-store`에 영속.

- [ ] **Step 1: 의존성 설치**

Run: `pnpm --filter mobile add @supabase/supabase-js expo-secure-store`

- [ ] **Step 2: secure-store 세션 어댑터 + supabase 클라이언트**

`apps/mobile/lib/session.ts`:
```ts
import * as SecureStore from 'expo-secure-store'
// supabase-js 가 기대하는 Storage 인터페이스를 secure-store 로 구현
export const secureStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
}
```

`apps/mobile/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { secureStorage } from './session'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
)
```

`apps/mobile/lib/api.ts`:
```ts
import { createApiClient } from '@mono/shared'
import { supabase } from './supabase'

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,       // 배포된 apps/web 도메인
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
})
```

- [ ] **Step 3: 로그인 화면 + 세션 게이트**

`apps/mobile/app/(auth)/login.tsx` — 이메일/비번 입력 + `supabase.auth.signInWithPassword`. (소셜 provider는 Phase 4에서 확장)
`apps/mobile/app/_layout.tsx` — `supabase.auth.getSession()`/`onAuthStateChange`로 세션 없으면 `(auth)/login`, 있으면 `(tabs)`로 라우팅.

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter mobile exec tsc --noEmit 2>&1 | tail -3; echo "tsc: ${PIPESTATUS[0]}"`
Expected: 통과.

- [ ] **Step 5: 엔드투엔드 스모크 (수동)**

`.env`에 `EXPO_PUBLIC_*` 채우고 `pnpm --filter mobile start` → 시뮬레이터에서 로그인 → 앱 재시작해도 세션 유지 확인. (BFF 검증은 Task 9)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib apps/mobile/app
git commit -m "feat(mobile): Supabase 인증(secure-store 세션) + 로그인 + API 클라이언트"
```

---

## Task 9: BFF 엔드투엔드 검증 (앱 → Bearer → 기존 API)

**Files:**
- Modify: `apps/mobile/app/(tabs)/community.tsx` (임시로 커뮤니티 목록 fetch 렌더)

**Interfaces:**
- Consumes: `api` (Task 8), Task 6의 Bearer 인증.
- Produces: 앱이 로그인 토큰으로 기존 `GET /api/communities/list`를 호출해 데이터를 받는 것 확인 → Phase 2~ 진행 가능 신호.

- [ ] **Step 1: 커뮤니티 목록 임시 렌더**

`apps/mobile/app/(tabs)/community.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { View, Text, FlatList } from 'react-native'
import { api } from '@/lib/api'

export default function CommunityScreen() {
  const [items, setItems] = useState<{ id: string; name: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api.get('/api/communities/list')
      .then((j: { communities?: { id: string; name: string }[] }) => setItems(j.communities ?? []))
      .catch((e) => setErr(e.error ?? 'error'))
  }, [])
  return (
    <View className="flex-1 bg-[#111318] p-4">
      {err && <Text className="text-red-400">에러: {err}</Text>}
      <FlatList data={items} keyExtractor={(x) => x.id}
        renderItem={({ item }) => <Text className="text-white py-2">{item.name}</Text>} />
    </View>
  )
}
```
(실제 `/api/communities/list` 응답 형태는 해당 라우트에서 확인 후 맞춘다.)

- [ ] **Step 2: 엔드투엔드 확인 (수동)**

로그인 상태에서 커뮤니티 탭 진입 → 목록이 뜨면 **BFF(Bearer) 경로 검증 완료**. 401/403이면 Task 6 인증 분기 점검.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(tabs)/community.tsx
git commit -m "test(mobile): BFF 엔드투엔드 스모크 — 앱→Bearer→기존 API 확인"
```

---

## Task 10: 디자인 프리미티브 (Button·Text·BottomSheet·Toast·Avatar)

**Files:**
- Create: `apps/mobile/components/ui/{Button,AppText,Sheet,Toast,Avatar}.tsx`

**Interfaces:**
- Produces: Phase 2~ 화면들이 재사용할 네이티브 프리미티브. 다크테마 토큰 사용.

- [ ] **Step 1: 의존성 설치**

Run: `pnpm --filter mobile add @gorhom/bottom-sheet react-native-gesture-handler expo-image`

- [ ] **Step 2: 프리미티브 구현**

`apps/mobile/components/ui/Button.tsx`:
```tsx
import { Pressable, Text } from 'react-native'
export function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress}
      className={`py-3.5 rounded-xl items-center ${disabled ? 'bg-white/[0.06]' : 'bg-violet-600 active:bg-violet-500'}`}>
      <Text className={`text-sm font-semibold ${disabled ? 'text-zinc-600' : 'text-white'}`}>{label}</Text>
    </Pressable>
  )
}
```
`Avatar.tsx`(expo-image + hue 폴백), `AppText.tsx`(테마 텍스트), `Sheet.tsx`(@gorhom/bottom-sheet 래퍼), `Toast.tsx`(네이티브 토스트) — 각각 웹 대응 컴포넌트의 시각 규약(색·라운드·타이포)을 따르되 RN 프리미티브로 구현.

- [ ] **Step 3: 프리미티브 렌더 확인 (수동 + 타입체크)**

Run: `pnpm --filter mobile exec tsc --noEmit 2>&1 | tail -3; echo "tsc: ${PIPESTATUS[0]}"`
Expected: 통과. (시각 확인은 임시 스토리 화면에서 수동)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ui
git commit -m "feat(mobile): DS 프리미티브 (Button·Text·Sheet·Toast·Avatar)"
```

---

## Task 11: 읽기 엔드포인트 커버리지 전수조사 (Phase 2~ 최대 변수 해소)

**Files:**
- Create: `docs/02-design/features/native-ios-app-endpoint-inventory.md`

**Interfaces:**
- Produces: 웹의 각 화면/데이터가 (a) 기존 REST 라우트로 커버되는지 (b) 서버컴포넌트 직접호출이라 **신규 엔드포인트 필요**인지의 전수 목록 → Phase 2~ 착수 전 신설 대상 확정.

- [ ] **Step 1: 기존 API 라우트 목록화**

Run: `find apps/web/app/api -name 'route.ts' | sort`
Expected: 전 API 라우트 목록.

- [ ] **Step 2: 화면별 데이터 소스 매핑**

각 주요 화면(홈/탐색/프로필/라이브러리/곡상세/커뮤니티 허브·상세/알림)에 대해 "데이터를 어디서 얻나"를 조사: 기존 route 있음 / 서버컴포넌트·서비스 직접호출(=신설 필요). 결과를 표로 문서화.

- [ ] **Step 3: 신설 엔드포인트 목록 확정**

문서 하단에 "Phase별 신설 필요 엔드포인트" 목록 작성 → Phase 2~ 각 계획의 입력으로 사용.

- [ ] **Step 4: Commit**

```bash
git add docs/02-design/features/native-ios-app-endpoint-inventory.md
git commit -m "docs(mobile): 읽기 엔드포인트 커버리지 전수조사 — Phase 2~ 신설 대상 확정"
```

---

## 이후 페이즈 (별도 계획 문서로 작성 예정)

각 페이즈는 자체로 동작하는 소프트웨어를 산출하며, **Task 11 인벤토리 결과를 입력**으로 착수 시점에 상세 계획을 작성한다.

| Phase | 산출물 | 선행 |
|---|---|---|
| 2 | 음악 생성 + track-player 재생 + 라이브러리 | Phase 1, 인벤토리 |
| 3 | 크레딧 + RevenueCat IAP + 생성 게이팅 | Phase 2 |
| 4 | 탐색·프로필·소셜(팔로우·좋아요) | Phase 1 |
| 5 | 커뮤니티(피드·글·댓글·투표·임베드·폐쇄 UI) | Phase 1 |
| 6 | 영상 만들기 + expo-video | Phase 2 |
| 7 | 푸시(Expo/APNs) | Phase 1 |
| 8 | 폴리시 + App Store 제출 | 전체 |

---

## Self-Review 결과

- **Spec 커버리지:** 설계 §2(레포)=T1~3, §3(인증BFF)=T6, §4(내비·DS)=T7·T10, RN 인증=T8, BFF 검증=T9, shared(타입·에러·가격·API)=T3~5, §12 최대변수(엔드포인트 갭)=T11. 음악/영상/커뮤니티/IAP/푸시는 Phase 2~로 명시 이관(스코프 분할).
- **플레이스홀더:** 코드 스텝은 실제 코드 포함. 스캐폴딩(Expo·turbo)은 실행 명령으로 대체. "적절히 처리" 류 없음.
- **타입 일관성:** `createApiClient`(T5) 시그니처를 T8·T9에서 동일 사용. `resolveAuthToken`(T6) 이름 일치. `CREDIT_PACKS`/`packPrice`(T4)는 Phase 3에서 소비 예정.
