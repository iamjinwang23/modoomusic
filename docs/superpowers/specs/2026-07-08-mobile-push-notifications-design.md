# 모바일 푸시 알림 (Expo/APNs) — 설계

- **날짜**: 2026-07-08
- **브랜치**: `feat/mobile-push`
- **범위**: MONO 네이티브 iOS 앱에 Expo Push(APNs) 알림 도입. 기존 웹 알림 인프라 재사용, 카테고리별 on/off 설정 추가.
- **관련 설계**: `docs/02-design/features/native-ios-app.design.md` §9(푸시). 이 문서가 §9의 구현 설계.
- **플랫폼**: iOS 우선(실기기 검증). 안드로이드는 델타(`native-android-delta.plan.md`)에서 FCM으로 이어짐 — 서버/토큰 구조는 이미 크로스플랫폼.

## 1. 목표 & 비목표

**목표**
- 앱이 닫혀 있어도 알림 배달(곡 완성·좋아요·댓글·답글·팔로우·커뮤니티·크레딧).
- 설정 화면에서 카테고리별 푸시 on/off.
- 알림 탭 → 앱 내 해당 화면 딥링크.
- 기존 웹 푸시(VAPID) 경로 **무회귀**.

**비목표 (v1 제외)**
- 앱 아이콘 언리드 뱃지(`setBadgeCountAsync`).
- 웹 UI의 알림 설정 토글(서버 프리퍼런스는 준비되나 웹 UI는 후속).
- 안드로이드 FCM 실기기 QA(델타에서).
- 리치 알림(이미지/액션 버튼).

## 2. 확정 결정 (브레인스토밍)

| # | 결정 | 근거 |
|---|---|---|
| D1 | 자격증명: Apple 계정+실기기 보유 → **end-to-end 실증까지** | 시뮬레이터는 iOS 푸시 미지원 |
| D2 | 알림 범위: **전체 타입**(곡완성·좋아요·댓글/답글·팔로우·커뮤니티 좋아요/댓글/폐쇄·크레딧) | 유저 선택 |
| D3 | 설정 토글은 **푸시 배달만** 제어, 인앱 알림함은 항상 기록 | 표준 패턴 |
| D4 | Expo 발송: **순수 `fetch` → Expo Push API**(의존성 0) | `web-push` 만료정리 패턴과 대칭, 서버 의존성 안 늘림 |
| D5 | 토큰 저장: `push_subscriptions` **확장**(`platform` 컬럼) | 설계 §9, 단일 테이블 |
| D6 | 딥링크: 서버가 payload `data.route`에 **모바일 라우트 직접** 삽입 | 웹url 매핑보다 명시적 |
| D7 | 카테고리 6종 그룹핑 | 아래 §5 |

## 3. 아키텍처 & 데이터 흐름

```
[모바일 앱]                          [Next.js BFF]                 [Supabase]
 로그인 후(세션 non-null)
  expo-notifications
   → 권한 요청
   → getExpoPushTokenAsync(projectId)
   → POST /api/push/subscribe ──────→ push_subscriptions upsert ──→ platform='expo'
      { platform:'expo', token }        (endpoint=ExpoToken)          endpoint=token
                                                                      p256dh/auth NULL
 로그아웃 → POST /api/push/unsubscribe { token }

 [알림 발생: 곡완성·좋아요·댓글·팔로우·커뮤니티·크레딧]
        ↓ (insert 직후 인라인 호출)
   sendPushToUser(userId, payload, category)
        ├─ notification_preferences 조회 (category OFF면 return)
        ├─ web VAPID 구독 → web-push        (기존, 무변경)
        └─ platform='expo' 토큰 → Expo Push API (fetch, 100청크)
                              ↓ APNs (Expo가 포워딩)
                        [기기 알림 배너]
                              ↓ 탭
                   data.route → router.push(route)
```

**핵심 원리**: 게이팅·발송은 `sendPushToUser` **한 곳**. 기존 트리거는 category 인자만 추가, 신규 트리거는 insert 직후 호출 한 줄 추가.

## 4. 서버 변경 (`apps/web`)

### 4.1 마이그레이션 `056_push_expo_and_prefs.sql`
```sql
-- push_subscriptions: Expo/APNs 토큰 수용
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth   DROP NOT NULL;
-- (endpoint UNIQUE 유지: expo 토큰을 endpoint에 저장, 멱등 upsert 키 그대로)

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
CREATE POLICY notif_prefs_upsert_own ON notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
> ⚠️ `turbo.json` build.env에 새 env 없음(마이그레이션만) → Vercel 빌드 영향 없음. 마이그레이션은 유저가 Supabase에 적용(또는 MCP `apply_migration`).

### 4.2 `services/push.service.ts` 확장
- `PushPayload`에 `data?: Record<string, string>` 추가(Expo message의 `data` 필드 = 딥링크 route 등).
- `type PushCategory = 'song_complete'|'likes'|'comments'|'follow'|'community'|'credit'`.
- `sendPushToUser(userId, payload, category?)`:
  1. `category` 있으면 `notification_preferences`에서 해당 컬럼 조회. **행 존재 && 컬럼 false → return**(opt-out).
  2. `push_subscriptions` 조회 → `platform`으로 분기.
     - `web` → 기존 `sendToSubs`(web-push) 그대로.
     - `expo` → `sendToExpo(tokens, payload)`.
- `sendToExpo(tokens, payload)`:
  - 메시지 배열: `{ to, title, body, data, sound:'default' }`, 100개 청크.
  - `POST https://exp.host/--/api/v2/push/send` (`Content-Type: application/json`).
  - 응답 `data[].status === 'error' && details.error === 'DeviceNotRegistered'` → 해당 토큰 `push_subscriptions` 삭제.
  - 네트워크 오류는 `console.error`만, **throw 안 함**(기존 계약).
- `sendPushToAll`도 web+expo 병행(공지 브로드캐스트, 토글 밖).

### 4.3 구독 엔드포인트
- `POST /api/push/subscribe`: 바디에 `platform==='expo' && token` 이면 `{ user_id, endpoint:token, platform:'expo' }` upsert(onConflict endpoint). 그 외 기존 웹 경로 유지.
- `POST /api/push/unsubscribe`: `token`(expo) 또는 `endpoint`(web)로 삭제.

### 4.4 프리퍼런스 엔드포인트 (신규)
- `GET /api/notifications/preferences` → 6개 boolean(행 없으면 전부 `true`).
- `PUT /api/notifications/preferences` → 바디 `{ category, enabled }` 검증 후 upsert(`user_id` PK). 인증 필수(401).

### 4.5 트리거 지점별 category 배선
| 카테고리 | 타입 | 파일 | 변경 |
|---|---|---|---|
| `song_complete` | song_complete | `app/api/generate/route.ts` | 기존 push에 category 추가 |
| `song_complete` | song_complete | `services/video-finalize.service.ts` | **신규** push(영상 완성/실패) |
| `likes` | like | `app/api/songs/[id]/like/route.ts` | category 추가 |
| `comments` | comment | `app/api/songs/[id]/comments/route.ts` | category 추가 |
| `comments` | reply | `app/api/comments/[id]/reply/route.ts` | category 추가 |
| `follow` | follow | `app/api/profiles/[id]/follow/route.ts` | **신규** push |
| `community` | community_like/comment/closing | `services/community.service.ts`, `services/community-post.service.ts` | **신규** push |
| `credit` | credit_charged | `services/payment.service.ts` | **신규** push |

각 신규 push는 해당 알림 INSERT **직후** 인라인 호출(기존 like/comment 패턴 동일). `data.route`는 §6.3 매핑대로 서버에서 구성.

## 5. 알림 카테고리 (6종)

| 카테고리 키 | 포함 알림 타입 | 설정 라벨(한) |
|---|---|---|
| `song_complete` | song_complete | 곡 완성 |
| `likes` | like | 좋아요 |
| `comments` | comment, reply | 댓글·답글 |
| `follow` | follow | 팔로우 |
| `community` | community_like, community_comment, community_closing | 커뮤니티 |
| `credit` | credit_charged | 크레딧 충전 |

- 공지(`system`, `sendPushToAll`)는 토글 대상 아님(항상 발송).
- `@mono/shared`에 `PushCategory` 타입 + 라벨 상수 추가 → 서버·모바일 공용.

## 6. 모바일 변경 (`apps/mobile`)

### 6.1 의존성 & 빌드
- **Expo v57 문서 정독**(`AGENTS.md` 규칙): https://docs.expo.dev/versions/v57.0.0/
- `expo-notifications` 설치 → `apps/mobile/package.json` 의존성 + `app.json` `plugins` 배열에 추가(워크스페이스 앱에 **직접 선언 필수**, autolink 누락 방지).
- `expo-device`는 이미 설치됨(시뮬레이터 방어용).
- `eas init` → `app.json`에 `owner` + `extra.eas.projectId` 기록(`getExpoPushTokenAsync`에 필요).
- **네이티브 리빌드**: `cd apps/mobile && PATH=/opt/homebrew/bin:$PATH npx expo run:ios --device "<실기기명>"`.

### 6.2 `src/lib/push.ts` (신규)
```
setNotificationHandler({ shouldShowBanner:true, shouldPlaySound:true, ... })  // 포그라운드 배너

registerForPush():
  - if (!Device.isDevice) return                       // 시뮬레이터 방어
  - perm = getPermissionsAsync(); if undetermined → requestPermissionsAsync()
  - if (!granted) return                                // 조용히 skip
  - token = getExpoPushTokenAsync({ projectId }).data
  - POST /api/push/subscribe { platform:'expo', token }
  - secure-store에 마지막 토큰 저장(언등록용)

unregisterForPush():
  - 저장 토큰으로 POST /api/push/unsubscribe { token }; secure-store 정리
```

### 6.3 등록 훅 & 딥링크 (`src/app/_layout.tsx`)
- 세션 게이트 안에서 `useSession()` 관찰:
  - session non-null 최초 → `registerForPush()`.
  - session null(로그아웃) → `unregisterForPush()`.
- 응답 리스너:
  - `addNotificationResponseReceivedListener(r => go(r.notification.request.content.data.route))`.
  - 콜드스타트: `getLastNotificationResponseAsync()` → 있으면 동일 처리.
  - `go(route)`: `router.push(route)`(문자열 라우트).
- **서버 route 매핑**(§4.5에서 payload.data.route 구성):
  | 알림 | data.route |
  |---|---|
  | song_complete | `/(tabs)` (라이브러리) |
  | like/comment/reply(내 곡) | `/(tabs)` (라이브러리) |
  | follow | `/creator/<username>` |
  | community_* | `/community/<communityId>` |
  | credit_charged | `/settings` |
  > route 문자열은 expo-router 경로 그대로. 파라미터는 쿼리스트링.
  > ⚠️ 곡 관련 알림은 **`/player` 직접 딥링크 안 함** — 플레이어는 now-playing 스토어에 트랙이 로드돼야 하는데 콜드 딥링크엔 없음(빈 플레이어). 라이브러리로 보내 유저가 곡을 탭해 재생. player 직행은 후속(딥링크 시 트랙 선로드 필요).

### 6.4 설정 토글 (`src/app/settings.tsx`)
- "알림" 섹션 추가. 마운트 시 `GET /api/notifications/preferences`.
- 카테고리 6개 각각 RN `Switch`. 변경 시 낙관적 업데이트 + `PUT { category, enabled }`.
- 실패 시 롤백 + 조용한 에러.
- 권한이 시스템에서 꺼진 경우 안내 행: "기기 알림이 꺼져 있어요 → 설정 열기"(`Linking.openSettings()`).

## 7. 자격증명 · 검증 계획

**APNs (유저 인터랙티브 단계)**
- `eas credentials` (iOS) → EAS-관리 Push Key(.p8) 생성/업로드. Apple Developer 로그인 필요 → 유저가 `! eas credentials`/`! eas login` 실행.
- dev 빌드는 APNs sandbox 사용(Expo 자동 처리).

**검증 루프 (실기기)**
1. 실기기 dev 빌드 → 로그인 → 권한 허용 → `push_subscriptions`에 `platform='expo'` 행 확인(Supabase).
2. Expo Push Tool 또는 curl로 토큰에 테스트 발송 → 배너 수신.
3. 실 트리거: 타 계정으로 내 곡 좋아요 / 곡 생성 완료 → 배너 → 탭 → 딥링크.
4. 설정 '좋아요' OFF → 재좋아요 → **푸시 없음**, 알림함엔 기록.
5. 로그아웃 → 토큰 행 삭제.

**시뮬레이터로 가능한 검증**: 빌드/타입/설정 UI 렌더/프리퍼런스 GET·PUT. 실배달만 실기기.

## 8. 에러 처리 · 엣지 케이스

- 권한 거부 → 조용히 skip, 설정 화면서 시스템 설정 유도.
- 시뮬레이터 → `Device.isDevice` false → 등록 skip.
- 토큰 만료/앱 삭제 → `DeviceNotRegistered` → 행 삭제(web 404/410과 대칭).
- 멱등 → 같은 토큰 upsert(endpoint 유니크), 중복 없음.
- 발송 실패 격리 → `sendPushToUser` throw 안 함, 트리거 요청 무영향.
- 프리퍼런스 행 없음 → 전부 ON(opt-out).
- 웹 무회귀 → 기존 web-push 경로 보존. `notification_preferences`는 웹 푸시에도 게이팅되나 웹 UI 토글 없음 → 웹은 행 없어 항상 ON.

## 9. 무회귀 / 머지 규율

- 웹 소스 변경(마이그레이션·push.service·subscribe·트리거·신규 엔드포인트) **있음** → 머지 전 `npm run build -w web` 통과 필수.
- `@mono/shared` 변경(PushCategory) → `npm run test -w @mono/shared`.
- 새 브랜치 `feat/mobile-push` → 유저 승인 하 FF/no-ff 머지. main 직접 커밋 금지.
- 네이티브 의존성 추가(expo-notifications) → OTA 미반영, EAS/네이티브 리빌드부터 반영.

## 10. 작업 순서(구현 계획 초안 — 상세는 writing-plans에서)

1. `@mono/shared`: `PushCategory` 타입 + 라벨 상수 + 테스트.
2. 마이그레이션 056 작성 + 적용.
3. `push.service.ts`: expo 채널 + category 게이팅.
4. subscribe/unsubscribe expo 분기 + 프리퍼런스 GET/PUT 엔드포인트.
5. 트리거 배선(기존 category 추가 + 신규 push) → `npm run build -w web`.
6. 모바일: expo-notifications 설치 + `eas init` + `push.ts` + `_layout` 훅/리스너.
7. 설정 토글 UI.
8. APNs 자격증명(유저) → 실기기 dev 빌드.
9. 실기기 검증 루프(§7).
