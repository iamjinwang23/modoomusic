# MONO 네이티브 모바일 앱 설계 (React Native / Expo · iOS + Android)

> **상태: v1 핵심 구현·프로덕션 배포됨 (2026-07-06 설계 · 2026-07-07 구현·배포). iOS 우선, 안드로이드 델타 대기.**
> 목표: 현재 웹(Next.js 16 + Supabase)을 **완전 네이티브 모바일 앱**으로. v1은 **웹 기능 전체 패리티**, **처음부터 iOS+안드로이드 듀얼플랫폼**.
> 백엔드(Next.js API + Supabase)는 재사용, 프론트만 네이티브 신설. RN이라 앱 코드 대부분 양 플랫폼 공유(안드로이드는 §14 델타 참조).

---

## 0.5 구현 현황 (2026-07-07, main `112116f`)

**✅ 프로덕션 배포됨** — apps/mobile(Expo SDK57). iOS 시뮬레이터 딥링크(`mobile://<route>`)로 전 화면 검증, 오디오 재생 유저 확인.

| 영역 | 상태 | 비고 |
|---|---|---|
| 모노레포·shared·BFF(쿠키+Bearer) | ✅ | **npm workspaces**(pnpm 아님 — 라이브 레포 리스크로 변경) |
| 인증(소셜 Google/Kakao/Apple/**네이버**·게스트) | ✅ | 소셜 전용(이메일 제거·2026-07-13). 네이버=서버 세션교환+setSession(§3.2). 세션 secure-store |
| 음악 생성·실시간 완성·라이브러리 | ✅ | POST /api/generate, songs UPDATE 구독 |
| 재생(미니/전체 플레이어·가사·좋아요·공개·공유) | ✅ | **react-native-track-player** |
| 영상 커버(생성·재생) | ✅ | **expo-video**, generate-video BFF |
| 커뮤니티(목록·상세·가입·글쓰기+곡첨부·좋아요·댓글) | ✅ | |
| 탐색(공개곡)·검색·크리에이터 프로필·팔로우 | ✅ | 신규 BFF explore/feed·explore/profile |
| 계정(프로필 탭=크리에이터 프로필·설정·알림) | ✅ | |
| **결제/IAP** | ⬜ | Phase3 RevenueCat 미착수 |
| **푸시** | ⬜ | Expo/APNs 미착수 |
| **안드로이드·제출** | ⬜ | §14 델타·EAS·TestFlight 대기 |

**설계 대비 주요 변경(divergence):**
- **스타일: Nativewind 대신 MONO 토큰(`src/theme/mono.ts`)+StyleSheet** — SDK57 Nativewind 호환 리스크 회피.
- **아이콘: 웹과 동일한 MingCute** — `react-native-svg`+`react-native-svg-transformer`로 웹 `public/*.svg` 채택(fill→currentColor tint). 좋아요=Thumb-Up 썸즈업.
- **하단 네비: 웹 커스텀 바텀네비 파리티 5탭**(둘러보기·커뮤니티·만들기(중앙,모달)·라이브러리·프로필). NativeTabs 아님, expo-router JS Tabs.
- **결제 마크업**: 설계 iOS +30% 유지(pricing.ts). 안드로이드 +15%.
- 상세 구현·함정은 auto-memory `native-mobile-app.md` 참조.

---

## 0. 확정 결정 (브레인스토밍 결과)

| 항목 | 결정 | 근거 |
|---|---|---|
| v1 스코프 | **웹 기능 전체 패리티** | 축소 없이 전체 이식(단, 구현은 모듈별 페이즈) |
| 프레임워크 | **Expo (managed) + EAS** Build/Submit/Update | dev build로 네이티브 모듈 자유·빌드/제출/OTA 간편 |
| 백엔드 연동 | **통합 REST BFF** — 기존 Next.js API 재사용 | 비즈니스 로직 단일화, 웹/앱 동일 규칙 |
| 인증 | **쿠키 + Bearer 토큰** 병행 수용 | RN은 토큰, 웹은 쿠키 — 라우트 재사용 |
| 레포 | **모노레포** (pnpm + Turborepo) | 타입·API 계약 단일 소스, drift 방지 |
| 결제 | **RevenueCat** IAP, 크레딧 잔액 웹/앱 공유, 앱 가격 **+30%** | StoreKit 엣지케이스 위임, Apple IAP 강제 대응 |

---

## 1. 아키텍처 개요

```
┌─────────────┐        ┌─────────────────────────┐        ┌──────────────┐
│ apps/mobile │──REST─▶│ apps/web (Next.js API)   │──────▶│  Supabase    │
│ (Expo RN)   │ Bearer │  = 공용 BFF (쿠키+토큰)   │ admin  │  DB·Auth·RT  │
│  supabase-js│◀─RT────┼──────────────────────────┼───────│  Storage     │
└─────────────┘realtime└─────────────────────────┘        └──────────────┘
        │                         │
        ├─ RevenueCat (IAP) ──웹훅─┤ (크레딧 지급 엔드포인트)
        └─ Expo Push (APNs) ◀──────┘ (알림 생성 로직 재사용)
        packages/shared (types·에러코드·가격상수·zod·API 클라이언트)
```

- **웹/앱은 같은 Next.js API를 호출.** 앱은 읽기(피드·라이브러리 등)와 쓰기(생성·글·크레딧) 모두 REST로.
- **Supabase realtime**은 RN에서 `supabase-js`로 직접 구독(웹의 `SongRealtimeBridge` 패턴 재사용).

---

## 2. 레포 구조 (모노레포)

```
mono/
├─ apps/
│  ├─ web/        ← 현재 Next.js 16 전부 이동 (경로만 변경, 로직 무변경 지향)
│  └─ mobile/     ← Expo RN 신규 (Expo Router)
├─ packages/
│  └─ shared/     ← @mono/shared
│     ├─ domain/       ← types/domain.ts 이동 (Community·Song·Notification 등)
│     ├─ errors.ts     ← 에러 코드 상수 (community_closing, not_member, banned_word …)
│     ├─ pricing.ts    ← 크레딧 팩·가격 상수 (웹/앱 가격 분리 테이블)
│     ├─ schemas/      ← zod 요청/응답 스키마 (API 계약)
│     └─ api-client.ts ← typed fetch (토큰 자동 첨부·에러 매핑)
├─ turbo.json
└─ pnpm-workspace.yaml
```

- **마이그레이션 원칙:** `apps/web`로 옮길 때 import 경로(`@/…`)만 정리하고 런타임 로직은 건드리지 않음. 웹 빌드가 항상 통과하는 상태 유지.
- `types/domain.ts` → `packages/shared/domain`으로 이전, 웹은 재-export 얇은 shim으로 무중단 전환.

---

## 3. 인증 (BFF 확장)

**RN 측:**
- `supabase-js` + `expo-secure-store` 어댑터로 세션 영속화
- 소셜/이메일 로그인 (웹과 동일 provider)
- 액세스 토큰 자동 리프레시 → `api-client`가 모든 요청에 `Authorization: Bearer` 첨부

**백엔드 측:**
- 인증 헬퍼(`lib/supabase/server.ts`의 `createUserClient`)를 **쿠키 OR Bearer** 둘 다 수용하도록 확장:
  - `Authorization: Bearer <jwt>` 있으면 그 토큰으로 Supabase 클라이언트 생성/검증
  - 없으면 기존 쿠키 경로 (웹 무변경)
- 전 API 라우트가 이 헬퍼를 쓰므로 **한 곳 수정으로 앱 지원**.

⚠️ **리스크:** 인증 헬퍼는 전 라우트의 공통 진입점 → 회귀 위험. 쿠키 경로 동작 보존 회귀 테스트 필수.

### 3.1 로그인 화면 (2026-07-13, 배포 완료)
- **소셜 전용** — Google·Apple·**네이버**·카카오. **이메일 로그인은 앱에서 제거**(당분간 계획 없음). 웹 `LoginModal` 톤앤매너 이식(로고·브랜드 아이콘 버튼·최근 로그인 배지·약관 푸터).
- 딥링크 콜백은 `openAuthSessionAsync(url, 'mono://auth/callback')`로 인터셉트 — app.json `scheme`은 `mobile`이지만 ASWebAuthenticationSession의 callbackURLScheme이라 `mono://`도 동작(Info.plist 등록 불필요).

### 3.2 네이버 앱 로그인 (Supabase 미지원 → 웹 커스텀 플로우 재사용)
네이버는 OIDC 미지원이라 서버 커스텀 라우트 사용. **모바일 supabase 클라이언트는 `flowType:'pkce'`라, 서버 생성 magiclink `token_hash`를 앱에서 직접 `verifyOtp` 하면 `"email link is invalid or has expired"`로 실패**(웹은 `@supabase/ssr` 서버=비-PKCE라 성공). 그래서 앱 경로는 서버가 세션까지 만들어 전달:
1. 앱: `GET /api/auth/naver?platform=app` 을 in-app 브라우저로 진입 → 서버가 `naver_oauth_platform=app` 쿠키 기록
2. 네이버 인증 후 콜백(`/api/auth/naver/callback`): 앱이면 **서버(비-PKCE 익명 클라이언트)에서 `verifyOtp`로 세션 교환** → `mono://auth/callback?access_token=…&refresh_token=…` 딥링크로 반환
3. 앱: 딥링크의 토큰으로 **`supabase.auth.setSession`만** 수행 (verifyOtp 안 함)
- 웹 경로는 기존 `token_hash` → `/auth/callback` 그대로. **네이버 콘솔·Supabase allowlist 변경 불필요**(동일 웹 콜백 재사용). 실기기 로그인 성공 확인.
- 배경: 네이버 가입 실사용자가 앱에서 로그인 못 하던 문제. 관련 함정 `feedback-code-pitfalls`.

---

## 4. 내비게이션 & 디자인 시스템

- **Expo Router** (파일 기반 라우팅, Next.js App Router와 동일 멘탈모델) — 탭 셸(홈/탐색/생성/커뮤니티/내정보)
- **Nativewind v4** (RN용 Tailwind) — 팀 Tailwind 숙련도·다크테마 토큰 재사용. 웹의 색 토큰을 `packages/shared`에서 공유
- **UI 프리미티브 네이티브 재작성** (웹 DOM 컴포넌트 재사용 불가):
  - 버튼·인풋·칩·아바타·차트카운트
  - 모달 → **네이티브 바텀시트**(`@gorhom/bottom-sheet`)
  - 토스트 → 네이티브 토스트
  - 이미지 → `expo-image`
- 접근성·햅틱·제스처는 네이티브 관례 따름(웹 클릭 패턴 그대로 옮기지 않음).

---

## 5. 음악 생성 + 재생 ⭐ 핵심 네이티브 업그레이드

**생성:**
- 기존 생성 API 호출(크레딧 차감·moderation 서버 그대로)
- 진행 상태는 **Supabase realtime 구독**으로 수신(웹 `SongRealtimeBridge`·`VideoCoverPoller` 로직 이식) — 완료 시 인앱 갱신 + 로컬 알림

**재생:**
- **react-native-track-player** — 백그라운드 오디오, 잠금화면/제어센터 컨트롤, 큐, 이어재생
- 웹의 iframe/오디오 플레이어 대비 진짜 네이티브 경험(이게 앱화의 핵심 가치)
- Expo config plugin 셋업 필요

**라이브러리:** 내 곡 목록·상태·재생, 삭제·공유·게시.

---

## 6. 영상 (MiniMax)

- "**영상 만들기**" 모달 네이티브화(이미지→영상 / 텍스트→영상 탭)
- 생성은 기존 API + realtime(웹과 동일 비동기 폴링/구독)
- 재생: **expo-video**로 mp4 커버 루프(자동재생·muted·loop). 정적 커버 폴백(웹 `VideoCoverPlayer` 3단 폴백 로직 이식)

---

## 7. 커뮤니티

- 피드·글·댓글·대댓글·좋아요·투표·신고·모더레이션·**폐쇄정책(§13)** → **서버 로직 전부 재사용**(REST)
- 작성 UI(텍스트·이미지·곡 첨부·투표) 네이티브화
- 링크 임베드:
  - YouTube/유튜브뮤직 → `react-native-youtube-iframe`
  - 그 외 iframe형 → `react-native-webview`
  - OG 프리뷰 카드 → 네이티브 카드(`/api/og` 재사용)
- 이미지 갤러리 → `expo-image` + 네이티브 뷰어

---

## 8. 크레딧 + IAP (RevenueCat)

**모델:** 크레딧은 소비형 디지털 재화 → iOS는 **Apple IAP 필수**. 계정은 같은 Supabase → **크레딧 잔액 웹/앱 공유**, 구매 가격만 앱 +30%.

**흐름:**
```
RN(RevenueCat SDK) ─구매─▶ App Store ─▶ RevenueCat
                                          │ 웹훅
                                          ▼
                        신규 엔드포인트 /api/iap/revenuecat-webhook
                          → 영수증/이벤트 검증 → credit.service 로 크레딧 지급
```
- **Offerings** = 크레딧 팩(웹 팩과 매핑, Apple 가격대 +30%)
- 소비 로직(`credit.service`)은 서버 그대로 — 지급 채널만 추가
- 웹은 PortOne 유지(병행)
- 복원(restore)·환불·샌드박스 → RevenueCat 위임

⚠️ **Apple 컴플라이언스:** 앱 내에서 **웹 결제 유도·외부 결제 링크/문구 금지**(3.1.1). 크레딧 구매는 앱에선 IAP만 노출.

---

## 9. 푸시 (APNs)

- **Expo Notifications** → APNs. 앱에서 디바이스/Expo push 토큰 등록
- `push_subscriptions` 테이블 확장(웹 VAPID 구독과 별개로 APNs/Expo 토큰 저장, `platform` 컬럼 구분)
- 서버 알림 **생성 로직 재사용**(`notifyCommunityActivity`·`notifyClosing` 등) + **전송 채널에 Expo Push 추가**(웹푸시와 병행 발송)

---

## 10. 실시간

- Supabase realtime은 RN `supabase-js`에서 그대로 동작 → 곡/영상 상태, 커뮤니티 갱신에 활용(웹과 동일).

---

## 11. 구현 순서 (페이즈)

| # | 페이즈 | 산출물 |
|---|---|---|
| 1 | **기반** | 모노레포화(웹 이동 무중단)·`shared` 패키지·Expo 스켈레톤·인증(BFF Bearer + RN 로그인)·탭 내비 셸·DS 프리미티브 |
| 2 | **핵심 루프** | 음악 생성 + track-player 재생 + 라이브러리 |
| 3 | **크레딧 + IAP** | RevenueCat 연동·웹훅 크레딧 지급·생성 게이팅 |
| 4 | **탐색/프로필/소셜** | 탐색 피드·프로필·팔로우·좋아요 |
| 5 | **커뮤니티** | 피드·글·댓글·투표·임베드·폐쇄정책 UI |
| 6 | **영상** | 영상 만들기 + expo-video 재생 |
| 7 | **푸시** | Expo/APNs 등록·전송 채널 |
| 8 | **폴리시 + 제출** | 접근성·성능·App Store 심사 대응·TestFlight→출시 |

---

## 12. 주요 리스크 & 미해결

- **읽기 엔드포인트 갭(최대 변수):** 현재 다수 화면이 서버컴포넌트/서비스 직접 호출로 렌더 → RN엔 REST 엔드포인트가 필요. **착수 시 전 화면의 현 API 커버리지 전수조사** 후 신설 목록 확정.
- **쿠키→Bearer 인증 리팩터:** 공통 헬퍼라 회귀 위험. 웹 쿠키 경로 보존 검증.
- **모노레포 재구성:** 웹 빌드·배포(Vercel) 안 깨지게 단계적 이동.
- **track-player / expo config plugin** 셋업.
- **커뮤니티 iframe 임베드** 네이티브 한계(일부 provider 미지원 가능).
- **Apple 심사:** IAP 준수·외부결제 언급 금지·개인정보 매니페스트·계정삭제(이미 있음).
- **가격 정책 분리:** 웹/앱 별도 가격(앱 +30%) — `pricing.ts`에서 플랫폼별 팩 정의.

---

## 13. 비고

- 백엔드·Supabase·모더레이션·폐쇄정책·크레딧 소비 로직은 **재사용**(신규 개발 아님).
- 신규 개발의 대부분은 **RN 프론트 + 인증 토큰화 + IAP/푸시 네이티브 채널 + 읽기 엔드포인트 보강**.
- 관련: [[community.design]] §13(폐쇄정책), [[video-cover.design]], [[community-launch-announcement]](웹 오픈 예약).

---

## 14. 안드로이드 (듀얼플랫폼 델타) — 2026-07-07

> **결정: 처음부터 iOS+안드로이드 듀얼플랫폼.** RN이라 앱 코드 대부분 공유 → "안드로이드 개발"의 대부분은 각 페이즈를 **안드로이드에서도 검증**하는 것. 아래는 안드로이드-특화 델타.

### 14.1 공유 (추가작업 0)
모든 화면·비즈로직·`packages/shared`·BFF·인증(Bearer)·realtime·**재생(track-player, Android 지원)**·**영상(expo-video)**·커뮤니티 — 그대로 동작.

### 14.2 안드로이드-특화 델타

| # | 항목 | 내용 |
|---|---|---|
| 1 | **결제 (Play Billing)** | RevenueCat이 App Store + **Google Play Billing 둘 다 추상화** → SDK 그대로. Play Console 상품 등록 + Android Offerings 구성. 크레딧 지급 웹훅은 **동일 엔드포인트**(RevenueCat이 스토어 구분). |
| 2 | **가격 (스토어별 최적화)** | `pricing.ts` 축을 **`web`/`ios`/`android`** 3개로 확장. Apple 30% → iOS **+30%**, Play ~15% → android **+15%**(기본, 조정 가능). 크레딧 잔액은 여전히 웹/앱 **공유**. |
| 3 | **푸시 (FCM)** | Expo Notifications가 FCM 추상화. `google-services.json` + FCM 자격증명 EAS 등록. 서버 전송은 Expo Push API 동일, 토큰만 플랫폼 구분(`push_subscriptions.platform`). |
| 4 | **스토어 제출** | Google Play Console, 어댑티브 아이콘, target API level(Play 최신 정책), 데이터 안전 폼, EAS Submit. |
| 5 | **플랫폼 UX** | 하드웨어 뒤로가기, 엣지투엣지, 상태바, Material 리플. Expo Router가 대부분 처리 — 뒤로가기·상태바만 점검. |
| 6 | **빌드/CI** | EAS Build 프로필에 android(dev/preview/production) 추가, 듀얼 빌드·제출. |

### 14.3 기존 계획 반영
- **Phase 1의 `pricing.ts`를 `web`/`ios`/`android` 3축으로 수정**(iOS 계획 델타).
- **각 페이즈에 "안드로이드 검증" 스텝 추가**(듀얼플랫폼 전제).
- 안드로이드-특화 작업(FCM·Play 상품·Play Console·어댑티브 아이콘·EAS android)은 **별도 `native-android-delta.plan.md`**로.
