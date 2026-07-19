# 사용자 차단 + UGC 모더레이션 보강 + IAP 활성화

작성일: 2026-07-20
관련 심사: App Store 재리젝 (Build 11, 2026-07-19, Submission bb1e7472)

## 배경

Apple 로그인 리젝은 Build 11로 통과했으나, 재심사에서 두 가지 새 이슈로 리젝됨.

- **Guideline 2.1(b)** — 앱이 크레딧(IAP)을 노출하는데 IAP 상품이 심사에 제출되지 않음. → IAP 상품은 App Store Connect에 이미 등록 완료(형님 확인). 앱에서 `EXPO_PUBLIC_IAP_ENABLED` 플래그만 켜면 됨.
- **Guideline 1.2 (UGC)** — 사용자 생성 콘텐츠 앱의 필수 안전장치 미비. 4대 요구 중 **사용자 차단(user block) 기능만 전무**. 나머지(콘텐츠 필터링·신고·EULA)는 이미 구현됨.

## 현황 (조사 결과)

| Apple 요구 | 현황 |
|---|---|
| 콘텐츠 필터링 | ✅ 금칙어 사전(app `moderation.service.ts` + DB 트리거 052/054) + 신고 기반 어드민 처리 |
| 사용자 차단(block) | ❌ **전무** — 신규 구현. (커뮤니티 매니저 밴 `community_blocks`는 별개) |
| 신고 24h 처리(제거+추방) | 🟡 신고 4종(곡·댓글·커뮤 포스트·커뮤 댓글) + 어드민 큐 `admin/reports` + resolve API 존재. SLA 표시·자동 추방 없음 |
| 가입 전 EULA | 🟡 로그인 버튼 하단 "계속하면 이용약관·개인정보처리방침에 동의" (passive consent, 로그인 전 제시됨) |

## 목표 / 비목표

**목표**
- 사용자 간 차단(양방향 완전차단) 풀스택 구현 (웹 + 모바일)
- 차단 진입점: 프로필 + 곡/커뮤니티 포스트/댓글 더보기 시트
- 차단 시 신고 함께 제안 (기존 신고 시스템 재사용 → 어드민 큐 = 개발자 통보)
- 설정에 차단 목록 화면 (해제 가능)
- 어드민 신고 큐 24h 경과 표시 + 정책 문서화
- EULA/이용약관에 UGC 무관용 조항 확인·보강
- IAP 활성화 (`EXPO_PUBLIC_IAP_ENABLED=true`)

**비목표 (YAGNI)**
- 신고 자동 추방/자동 콘텐츠 제거 (수동 어드민 유지)
- 명시적 EULA 체크박스 (passive consent 유지 — 로그인 전 제시로 충족)
- 키워드 뮤트, 임시 차단, 차단 만료 등 고급 기능

## 설계

### 1. 데이터 모델 — 마이그레이션 `061_user_blocks.sql`

```sql
create table user_blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index idx_user_blocks_blocker on user_blocks(blocker_id);
create index idx_user_blocks_blocked on user_blocks(blocked_id);
```
- RLS: 본인이 blocker인 행만 select/insert/delete.
- 차단 조회는 "A가 B를 차단했거나 B가 A를 차단한" **양방향 합집합**으로 피드 필터에 사용.

### 2. 차단 시맨틱 (양방향 완전차단)

A가 B를 차단하면:
- **상호 피드 숨김**: 둘러보기(추천/최신/인기)·검색·프로필 곡 목록·커뮤니티 피드·댓글 목록에서 서로의 곡·포스트·댓글 제외.
- **상호 언팔로우**: `follows`에서 (A→B), (B→A) 양방향 삭제. 팔로워/팔로잉 카운트 반영.
- **상호작용 차단**: B가 A의 곡/포스트에 댓글·좋아요 시도 시 API 403. A→B도 동일.
- **프로필 접근**: B가 A 프로필 열람 시 빈/차단 상태 화면.
- 이미 존재하는 댓글·좋아요도 상호 숨김 대상(피드 필터가 처리).

차단은 신고와 독립 (차단해도 상대에게 알림 없음). 차단 직후 신고 사유 시트를 선택적으로 제시.

### 3. API (apps/web)

- `POST /api/users/[id]/block` — 차단 생성. 부수효과: 양방향 언팔로우. 멱등(이미 차단 시 200).
- `DELETE /api/users/[id]/block` — 차단 해제.
- `GET /api/users/blocks` — 내 차단 목록(프로필 정보 조인).
- 차단 시 신고: 기존 신고 API 재사용(`/api/songs/[id]/report` 등) — 차단 플로우에서 대상 유형에 맞는 신고 엔드포인트 호출. 별도 신규 API 불필요.

### 4. 피드 필터링 (서비스 레이어)

- 헬퍼 `getBlockedUserIds(userId): Promise<string[]>` — 양방향 합집합, 요청 단위 캐시.
- 적용 대상 쿼리 (로그인 사용자 컨텍스트가 있는 경우):
  - 곡 목록/둘러보기/검색 (`song.service` 계열)
  - 프로필 곡 목록
  - 커뮤니티 피드/포스트 목록 (`community-post.service`)
  - 곡 댓글 / 커뮤니티 댓글 목록
- 비로그인/공개 컨텍스트는 필터 없음(차단은 로그인 사용자 개인 설정).
- 구현 방식: 기존 admin-client 쿼리에 `.not('user_id', 'in', (blockedIds))` 절 추가. 차단 수가 적어 성능 부담 없음.

### 5. 모바일 UI (apps/mobile)

- **차단 진입점**: 프로필 화면 헤더 ⋮, `song-more-sheet`, 커뮤니티 `post-card` 더보기, 댓글 더보기 시트에 "차단"(신고 아래, 빨강). 본인/이미 차단한 상대엔 미노출.
- **차단 플로우**: 범용 `ConfirmModal`("이 사용자를 차단할까요?" / "차단하기" / "아니요") → 차단 API → 성공 스낵바 → 신고 사유 시트("함께 신고할까요?", 건너뛰기 가능).
- **차단 목록**: 설정 화면에 "차단 목록" 셀(CELL 통일) → 신규 라우트 `blocked-users.tsx` → 리스트(아바타·이름·차단해제 버튼). 비어있으면 empty 상태.
- 차단 직후 피드에서 해당 유저 콘텐츠가 사라지는지 확인(목록 refetch/무효화).

### 6. 웹 UI (apps/web)

- 프로필 페이지 및 곡/커뮤니티 더보기 메뉴(`SongMoreMenu` 등)에 "차단" 추가.
- 내 계정/설정에 차단 목록 관리 섹션(해제 가능).
- 피드 필터는 §4 백엔드 공통이라 자동 적용.

### 7. 신고 24h 처리 보강

- 어드민 신고 큐(`admin/reports/page.tsx`)에 각 신고의 **경과 시간(상대시간, 24h 초과 시 강조)** 표시.
- 운영 정책 문서화(심사 회신용): 신고는 24시간 내 검토하며, 위반 확인 시 콘텐츠 제거 + 반복/중대 위반 계정 정지(`admin/users/[id]/suspend`).

### 8. EULA 확인

- 이용약관(`/terms`)에 "부적절 콘텐츠·학대 행위 무관용(zero tolerance)" 조항이 있는지 확인, 없으면 추가.
- 로그인 전 동의 제시는 현행 유지(스크린 녹화로 시연).

### 9. IAP 활성화

- `apps/mobile/.env` 및 EAS production 환경변수 `EXPO_PUBLIC_IAP_ENABLED=true`.
- 상품 4종(`mono_credit_60/130/250/560`)은 App Store Connect 등록 완료 → 심사에 함께 제출(상품별 스크린샷 첨부).
- 코드 변경 없음(기존 `iap.ts`·`credit-purchase.tsx` 완성 상태). 플래그만.

## 심사 재제출

- **스크린 녹화(실기기/시뮬)**: ① 로그인 전 EULA 제시 ② 신고 플로우 ③ 차단 플로우 ④ 차단 목록 해제. Notes에 첨부.
- **Resolution Center 회신**: 차단 구현·신고·필터·24h 정책 설명 + IAP 상품 제출 안내.
- Build 12로 재빌드(네이티브 변경: 차단 UI는 JS지만 IAP 플래그·react-native-iap는 네이티브라 재빌드 필요).

## 순서 / 마일스톤

1. 백엔드: 마이그 061 + 차단/해제/목록 API + 피드 필터 헬퍼·적용
2. 모바일 UI: 진입점 + 차단 플로우 + 설정 차단목록
3. 웹 UI: 진입점 + 차단목록 관리
4. 보강: 어드민 24h 표시 + 이용약관 조항 + EULA 확인
5. IAP 플래그 ON
6. Build 12 → iPad 검증(차단·IAP) → 스크린 녹화 → 재제출

## 리스크

- 피드 필터 누락 시 차단한 유저 콘텐츠가 특정 화면에 남을 수 있음 → §4 대상 쿼리 체크리스트로 관리.
- IAP 상품 심사: 상품별 스크린샷·메타데이터 필수. 하나라도 누락 시 2.1(b) 재발.
- 데모계정 이슈(이전 리젝의 Information Needed)는 이번엔 안 나왔으므로 소셜 로그인 안내 유지.
