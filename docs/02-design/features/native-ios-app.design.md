# MONO 네이티브 iOS 앱 설계 (React Native / Expo)

> **상태: 설계 확정 · 구현 대기 (2026-07-06 세션5 브레인스토밍).**
> 목표: 현재 웹(Next.js 16 + Supabase)을 **완전 네이티브 iOS 앱**으로. v1은 **웹 기능 전체 패리티**.
> 백엔드(Next.js API + Supabase)는 재사용, 프론트만 네이티브 신설.

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
