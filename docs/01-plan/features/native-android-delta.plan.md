# MONO 네이티브 앱 — Android 델타 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 RN/Expo로 구축된 모바일 앱(iOS 기준)을 **안드로이드에서도 동작·출시**시키기 위한 플랫폼-특화 델타(빌드·FCM 푸시·Play Billing·플랫폼 UX·Play 제출)를 완성한다.

**Architecture:** 앱 코드·`packages/shared`·BFF·인증·재생·영상·커뮤니티는 iOS와 **공유**(추가작업 0). 이 계획은 안드로이드 특화 설정/연동만 다룬다. RevenueCat·Expo Notifications가 스토어/푸시를 추상화하므로 대부분 **설정 + 자격증명 + 스토어 등록** 작업이다.

**Tech Stack:** Expo(EAS Build/Submit), `expo-notifications`(FCM), RevenueCat(Play Billing), Google Play Console, EAS credentials.

> **설계 근거:** `docs/02-design/features/native-ios-app.design.md` §14.
> **전제:** 이 계획의 각 Task는 대응 iOS 페이즈가 선행돼야 한다(아래 Task별 "선행" 명시). 처음부터 듀얼플랫폼이므로 **각 페이즈 구현 시 안드로이드 검증은 그 페이즈 계획에 포함**되고, 이 문서는 안드로이드에만 존재하는 작업을 모은다.

## Global Constraints

- **가격**: `pricing.ts`의 `android` 마크업 **+15%**(Play ~15% 수수료 반영). iOS는 +30%, web 원가. (설계 §14.2)
- **크레딧 잔액**: 스토어 무관 **웹/앱 공유**(같은 Supabase 계정). 스토어는 구매 채널일 뿐.
- **크레딧 지급 웹훅**: iOS와 **동일 엔드포인트**(`/api/iap/revenuecat-webhook`). RevenueCat이 `store` 필드로 app_store/play_store 구분.
- **패키지명**: `com.modoomusic.app`(iOS bundle id와 정합. 2026-07-08 `com.modoomusic.app`→`com.modoomusic.app`로 정정 — BeeNoo 애플 팀에 등록된 실제 식별자). 확정 후 변경 금지(스토어 귀속).
- **min SDK / target**: Expo 기본(min 24+), target은 Play 최신 정책 준수.
- **외부결제 문구 금지**: Play 정책상 앱 내 웹 결제 유도 금지(iOS와 동일 원칙).

---

## Task 1: Android 빌드 설정 + EAS 프로필

**선행:** Phase 1(Expo 스켈레톤 존재).

**Files:**
- Modify: `apps/mobile/app.json`(android 섹션), `apps/mobile/eas.json`(build 프로필)
- Create: `apps/mobile/assets/adaptive-icon.png`(어댑티브 아이콘 foreground)

**Interfaces:**
- Produces: `eas build -p android --profile preview`가 성공하는 상태(설치 가능한 APK/AAB).

- [ ] **Step 1: app.json android 설정**

`apps/mobile/app.json`의 `expo.android`:
```json
{
  "package": "com.modoomusic.app",
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "backgroundColor": "#111318"
  },
  "edgeToEdgeEnabled": true
}
```

- [ ] **Step 2: eas.json 빌드 프로필**

`apps/mobile/eas.json`:
```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "android": { "buildType": "apk" } },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "android": { "buildType": "app-bundle" } }
  },
  "submit": { "production": {} }
}
```

- [ ] **Step 3: 프리뷰 빌드 검증**

Run: `cd apps/mobile && eas build -p android --profile preview --non-interactive 2>&1 | tail -15`
Expected: 빌드 성공 → 설치 가능한 APK URL 출력. (EAS 로그인·프로젝트 연결 선행 필요)

- [ ] **Step 4: 실기기/에뮬레이터 부팅 확인 (수동)**

APK 설치 → 앱 부팅·탭 셸·로그인 화면 노출 확인(iOS와 동일 UI).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/eas.json apps/mobile/assets/adaptive-icon.png
git commit -m "feat(android): app.json android 설정 + EAS 빌드 프로필 + 어댑티브 아이콘"
```

---

## Task 2: FCM 푸시 (Expo Notifications)

**선행:** Phase 7(푸시 서버/클라 로직), Task 1.

**Files:**
- Add: `apps/mobile/google-services.json`(Firebase 콘솔 다운로드, gitignore 대상 — EAS secret로 주입 권장)
- Modify: `apps/mobile/app.json`(expo-notifications 플러그인), 서버 `push_subscriptions` 저장 시 `platform: 'android'`

**Interfaces:**
- Consumes: Phase 7의 서버 전송(Expo Push API).
- Produces: 안드로이드 기기가 Expo push 토큰을 등록하고, 서버 알림이 FCM 경유로 수신됨.

- [ ] **Step 1: Firebase 프로젝트 + FCM 자격증명**

Firebase 콘솔에서 안드로이드 앱(`com.modoomusic.app`) 등록 → `google-services.json` 다운로드. FCM V1 서비스계정 키를 **EAS credentials**(`eas credentials`)에 등록(레포에 커밋 금지).

- [ ] **Step 2: app.json 플러그인**

`apps/mobile/app.json` `expo.plugins`에 `["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#7C3AED" }]` 추가. `expo.android.googleServicesFile`을 `google-services.json` 경로(또는 EAS secret 참조)로 지정.

- [ ] **Step 3: 토큰 등록에 platform 구분**

Phase 7의 토큰 등록 코드에서 `Platform.OS`로 `push_subscriptions.platform`을 `'ios'|'android'` 저장(서버가 채널 선택). 서버 전송 로직은 Expo Push API 동일(변경 없음).

- [ ] **Step 4: 안드로이드 수신 검증 (수동)**

안드로이드 기기 로그인 → 토큰 등록 확인 → 서버에서 테스트 알림 발송(예: 커뮤니티 활동) → **기기에서 FCM 푸시 수신** 확인.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/.gitignore
git commit -m "feat(android): FCM 푸시(expo-notifications) + platform=android 토큰 등록"
```

---

## Task 3: Play Billing (RevenueCat) + Play Console 상품

**선행:** Phase 3(RevenueCat IAP·크레딧 웹훅), Task 1.

**Files:**
- Modify: `apps/mobile`의 RevenueCat 설정(Android API key 추가), Play Console 상품 등록(대시보드 작업)

**Interfaces:**
- Consumes: Phase 3의 RevenueCat SDK 초기화·구매 흐름·크레딧 지급 웹훅.
- Produces: 안드로이드에서 크레딧 팩 구매 → RevenueCat → 동일 웹훅 → 크레딧 지급(잔액 공유).

- [ ] **Step 1: Play Console 상품 등록**

Google Play Console에서 크레딧 팩을 **관리형 상품(소비성 인앱 상품)**으로 등록: `pack_100`/`pack_300`/`pack_1000`. 가격은 `pricing.ts`의 android(+15%) 값에 맞춰 설정.

- [ ] **Step 2: RevenueCat Android 연결**

RevenueCat 대시보드에 Play 앱 연결(서비스계정 JSON) + Android Offerings를 iOS와 동일 팩 구조로 구성. 앱 초기화에 **Android용 RevenueCat API key** 추가(`Platform.OS`로 분기).

- [ ] **Step 3: 웹훅 스토어 분기 확인**

`/api/iap/revenuecat-webhook`이 이벤트의 `store`(`PLAY_STORE`)를 로깅·처리하는지 확인(크레딧 지급 로직은 스토어 무관 동일). 필요 시 멱등키에 스토어 트랜잭션 ID 포함.

- [ ] **Step 4: 샌드박스 구매 검증 (수동)**

Play 라이선스 테스터 계정으로 안드로이드에서 크레딧 팩 구매 → RevenueCat 이벤트 → **웹훅 크레딧 지급 → 앱/웹 잔액 반영** 확인. 복원·환불도 점검.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(android): Play Billing(RevenueCat) 연결 + Android Offerings + 크레딧 지급 검증"
```

---

## Task 4: 안드로이드 플랫폼 UX 패스

**선행:** 대상 화면들이 존재(Phase 2~6 진행분).

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`(상태바·엣지투엣지), 필요 화면의 하드웨어 뒤로가기 핸들링

**Interfaces:**
- Produces: 안드로이드 관례(뒤로가기·상태바·세이프에어리어)에 맞는 동작.

- [ ] **Step 1: 하드웨어 뒤로가기 점검**

모달/시트가 열린 상태에서 안드로이드 하드웨어 뒤로가기 시 **모달만 닫히고 앱이 종료되지 않도록** 처리(`BackHandler` 또는 Expo Router 기본 동작 확인). 각 바텀시트(`@gorhom/bottom-sheet`)의 back 동작 확인.

- [ ] **Step 2: 상태바·엣지투엣지·세이프에어리어**

`_layout.tsx`에서 `expo-status-bar` 스타일(다크) + 엣지투엣지에서 콘텐츠가 상태바/네비바에 가리지 않게 `SafeAreaView`/inset 적용. iOS 노치와 별개로 안드로이드 인셋 확인.

- [ ] **Step 3: 실기기 스모크 (수동)**

주요 플로우(로그인·생성·재생·커뮤니티·구매)를 안드로이드 실기기에서 태우며 뒤로가기·레이아웃 깨짐·상태바 확인.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app
git commit -m "fix(android): 하드웨어 뒤로가기·엣지투엣지·상태바 플랫폼 UX"
```

---

## Task 5: Play Console 제출 준비 + EAS Submit

**선행:** Task 1~4, 출시 대상 페이즈 완료.

**Files:**
- Modify: `apps/mobile/eas.json`(submit.production.android), Play Console 스토어 등록정보(대시보드)

**Interfaces:**
- Produces: 내부 테스트 트랙에 올라간 AAB + 스토어 등록정보(데이터 안전 폼 포함).

- [ ] **Step 1: 데이터 안전 폼 + 스토어 등록정보**

Play Console에 앱 등록정보(설명·스크린샷·아이콘), **데이터 안전(Data safety) 폼**(수집 데이터: 계정·콘텐츠·구매내역 등), 콘텐츠 등급, 타깃층 작성.

- [ ] **Step 2: 프로덕션 AAB 빌드 + 제출 설정**

`eas.json`의 `submit.production.android`에 서비스계정 키 경로 지정.

Run: `cd apps/mobile && eas build -p android --profile production 2>&1 | tail -10`
Expected: AAB 빌드 성공.

- [ ] **Step 3: 내부 테스트 트랙 제출**

Run: `cd apps/mobile && eas submit -p android --profile production --latest 2>&1 | tail -10`
Expected: Play Console **내부 테스트 트랙** 업로드 성공.

- [ ] **Step 4: 내부 테스트 설치 검증 (수동)**

내부 테스터 링크로 설치 → 부팅·로그인·핵심 플로우·구매(라이선스 테스터) 확인 후 프로덕션 승격 판단.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/eas.json
git commit -m "chore(android): EAS Submit(Play) 설정 + 내부 테스트 트랙 제출"
```

---

## Self-Review 결과

- **Spec 커버리지(설계 §14.2):** 결제(Play Billing)=T3, 가격(3축)=Phase 1 pricing.ts 수정분(별도) + T3 상품가, 푸시(FCM)=T2, 스토어 제출=T5, 플랫폼 UX=T4, 빌드/CI=T1.
- **플레이스홀더:** 대시보드 작업(Firebase·Play Console·RevenueCat)은 명령이 아닌 콘솔 절차라 단계로 명시. 코드/설정 스텝은 실제 내용 포함.
- **타입/이름 일관성:** `push_subscriptions.platform`·`/api/iap/revenuecat-webhook`·`com.modoomusic.app`·`pricing.ts` android(+15%)를 iOS 계획·설계와 동일 명칭으로 사용.
- **의존성:** 각 Task의 "선행"으로 대응 iOS 페이즈 명시(T2→Phase7, T3→Phase3). 순수 안드로이드 스탠드얼론이 아니라 페이즈에 부착되는 델타임을 반영.
