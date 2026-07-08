# 커뮤니티 공개/비공개 설정 — 설계

- 작성일: 2026-07-08
- 범위: 웹(`apps/web`) 우선. DB/서버는 공유되므로 모바일도 안전하게 동작(비멤버 빈 피드)하나, 모바일 전용 UI는 후속.
- 관련: 커뮤니티 폐쇄 정책(마이그 055), 커뮤니티 활동 알림(마이그 053), 푸시(마이그 056)

## 1. 목표와 모델

기존 커뮤니티는 **"공개 읽기 + 오픈 가입 + 멤버만 쓰기"** 단일 모델이다. 여기에 **공개/비공개** 축을 추가한다.

**비공개(private) = 콘텐츠 잠금 + 승인 가입**:
- 비멤버는 커버·아바타·이름·소개·멤버수·"가입하기"만 보는 **잠금 상태**. 피드/글쓰기 숨김.
- "가입하기" → **매니저 승인 필요**(가입 신청 → 심사).
- **발견은 차단하지 않음** — 허브·목록에 계속 노출. 인기글도 그대로 노출.
- 인기글 클릭 시 → 커뮤니티 상세에 **그 글 1건만** + 하단 **"더 보려면 가입" CTA**.
- 매니저는 **가입 수칙 텍스트**를 입력하고, 신청 모달에서 노출된다.

공개(public)는 현행 유지(즉시 가입·전체 공개 읽기). 단, **24h 탈퇴 쿨다운은 공개 포함 전체 적용**.

## 2. 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 공개/비공개 변경 시점 | **생성 시 + 이후 수정 모달에서 토글 가능** |
| 비공개→공개 전환 시 대기 신청 | **전원 자동 수락**(멤버 편입 + 승인 알림), pending 정리 |
| 거절 후 재신청 | **2일 쿨다운** 후 재신청 가능 |
| 가입→탈퇴 쿨다운 | **24h**, **전체 커뮤니티** 적용(매니저는 애초에 탈퇴 불가) |
| 강퇴 시 재가입 차단 | 매니저가 **"재가입 영구 차단" 옵션** 선택 가능(blocks) |
| 발견/검색 차단 | **하지 않음**(노출 유지) |
| 인기글 노출 | 비공개도 **인기글 노출 유지**(단일 글 미리보기로 유도) |

## 3. 데이터 모델 (마이그레이션 057)

```sql
-- communities 확장
ALTER TABLE communities
  ADD COLUMN visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private')),
  ADD COLUMN join_rules text;   -- 비공개 가입 수칙(신청 모달 노출). 최대 1000자(앱단 slice)

-- 가입 신청/심사 (비공개)
CREATE TABLE community_join_requests (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rejected')),
  reason       text,             -- 거절 사유
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,      -- 거절 시각(2일 쿨다운 기준)
  decided_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_join_requests_pending_idx
  ON community_join_requests(community_id, created_at)
  WHERE status = 'pending';

-- 강퇴 '재가입 영구 차단'
CREATE TABLE community_blocks (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- 알림 타입 확장
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like','song_complete','system','follow','comment','credit_charged',
    'community_like','community_comment','community_closing',
    'community_join_request','community_join_approved','community_join_rejected'
  ));
```

- **RLS**: 신규 두 테이블 모두 RLS 활성 + SELECT 정책 미부여(쓰기·읽기 전부 라우트 admin 경유). 기존 커뮤니티 테이블 패턴과 동일.
- **수락 = 행 삭제 + members insert** (신청 이력은 남기지 않음, 승인은 멤버십이 곧 증거). **거절 = status='rejected' + reason + decided_at**.
- **재신청 쿨다운**: `rejected` 행이 있고 `now < decided_at + 2일`이면 신규 신청 차단. 지나면 같은 PK 행을 `pending`으로 upsert(갱신).
- **24h 탈퇴 쿨다운**: 기존 `community_members.joined_at` 재사용, 컬럼 추가 없음.

## 4. shared 타입 (`packages/shared/src/domain/index.ts`)

```ts
// Community
visibility: 'public' | 'private'
joinRules: string | null
// 현재 유저 관점 상태(상세용)
joinRequestStatus?: 'none' | 'pending' | 'rejected'
rejoinAvailableAt?: string | null   // 거절 쿨다운 해제 시각
isBlocked?: boolean                 // 강퇴 차단 여부

// NotificationType 에 추가
| 'community_join_request' | 'community_join_approved' | 'community_join_rejected'

// 신청자 표현
export interface CommunityJoinRequest {
  userId: string
  displayName: string | null
  username: string | null
  avatarUrl: string | null
  avatarHue: number | null
  createdAt: string
}
```

`notificationTypeToCategory`: 세 신규 타입 모두 `'community'` 카테고리로 매핑.

## 5. 서버(서비스/라우트)

### 5.1 `community.service.ts`
- `createCommunity` — `visibility`, `joinRules` 입력 수용. 비공개면 join_rules 저장.
- `updateCommunity` — `visibility`/`joinRules` 패치 지원 + **전환 처리**:
  - 공개→비공개: 멤버 유지(할 일 없음). 이후 신규는 승인제.
  - 비공개→공개: `pending` 전원 → `community_members` insert + 신청행 삭제 + **승인 알림**.
- `rowToCommunity` / `SELECT`에 `visibility`, `join_rules` 포함.
- `getCommunity(id, userId)` — 유저 관점 상태 채움: 멤버/매니저 여부(기존) + `joinRequestStatus`·`rejoinAvailableAt`·`isBlocked`.
- `joinCommunity` — 분기:
  - **공개**: 즉시 가입. 단 **`community_blocks`에 있으면 `blocked`** 로 차단(공개도 강퇴 차단 존중).
  - **비공개**: 즉시 가입 대신 **신청 생성**으로 위임(아래 `requestJoin`). 라우트에서 visibility로 분기하거나 서비스 내부 분기.
- `unblockMember(managerId, communityId, targetUserId)` — 매니저 검증 → `community_blocks` 행 삭제(차단 해제).
- `leaveCommunity` — **24h 쿨다운**: `now - joined_at < 24h`면 `{ ok:false, error:'leave_cooldown' }`.
- `kickMember(userId, communityId, targetUserId, ban?: boolean)` — `ban`이면 `community_blocks` insert. 강퇴 알림 문구도 조건부.

### 5.2 신규 `community-join.service.ts` (또는 community.service에 함수 추가)
- `requestJoin(userId, communityId)`:
  - 커뮤니티 존재·private 확인. 이미 멤버면 no-op.
  - `community_blocks`에 있으면 `blocked`.
  - `rejected` + 쿨다운 중이면 `rejoin_cooldown`(+해제 시각).
  - 그 외 `pending` upsert. 매니저에게 **가입 신청 알림**.
- `listJoinRequests(managerId, communityId)` — 매니저 검증 후 `pending` 목록(프로필 조인).
- `approveRequest(managerId, communityId, targetUserId)` — 매니저 검증 → members insert + 신청행 삭제 + **승인 알림**.
- `rejectRequest(managerId, communityId, targetUserId, reason?)` — 매니저 검증 → `status='rejected'`, `reason`, `decided_at=now`, `decided_by` + **거절 알림**(+사유).

### 5.3 `community-post.service.ts`
- `listPosts(communityId, userId, opts?)`:
  - 커뮤니티 visibility 조회. **private && 비멤버/비매니저** → `[]` 반환.
  - `opts.previewPostId` 있으면 그 글이 해당 커뮤니티·active면 **그 1건만** 반환(비멤버 미리보기).
- `getPopularPosts` — **변경 없음**(비공개 인기글도 노출 유지).

### 5.4 라우트
- `POST /api/communities` — body에 `visibility`, `joinRules` 추가.
- `PATCH /api/communities/[id]` — 동일 필드 + 전환.
- `POST /api/communities/[id]/join` — visibility 분기(공개=가입, 비공개=신청). 에러코드: `blocked`, `rejoin_cooldown`.
- `POST /api/communities/[id]/leave` — `leave_cooldown` 처리.
- `GET  /api/communities/[id]/join-requests` — 매니저 심사 목록.
- `POST /api/communities/[id]/join-requests/[userId]/approve`
- `POST /api/communities/[id]/join-requests/[userId]/reject` (body: reason?)
- `POST /api/communities/[id]/kick` — body에 `ban?: boolean` 추가.
- `GET  /api/communities/[id]/posts?preview=<postId>` — 비멤버 단일 글 미리보기 지원.

## 6. UI (`apps/web`)

**개설 모달** `CreateCommunityModal.tsx`
- 공개/비공개 세그먼트 토글. 비공개 시 **수칙 textarea**(선택; 미입력이면 신청 모달에 기본 안내).

**수정 모달** `CommunityEditModal.tsx`
- 동일 토글 + 수칙 편집. 비공개→공개 저장 시 "대기 신청 N명이 자동 수락됩니다" 확인.

**상세 페이지** `community/[id]/page.tsx`
- 비공개·비멤버: 피드/글쓰기 숨김 → 잠금 안내 + "가입하기".
- `?post=<id>` 있으면 그 글 1건 + 하단 가입 CTA.
- 가입 버튼 상태 머신: `가입하기` → (신청) `승인 대기 중`(pending) → 거절 시 `가입하기`(쿨다운 중이면 비활성 "N일 후 재신청"). 차단 시 안내.
- 매니저: **"가입 신청 N"** 진입점(배지, pending 카운트).

**신규 `JoinRequestModal.tsx`** — 수칙 표시 + "가입 신청".

**신규 `ManageJoinRequestsModal.tsx`** — 신청자 리스트 + 수락/거절(사유 인풋).

**강퇴** — 기존 `ConfirmModal` 확장 또는 전용 모달에 **"재가입 영구 차단" 체크박스**. 문구 조건부.

**차단 해제** — 심사 화면(`ManageJoinRequestsModal`)에 **차단 목록 탭** — 차단된 유저 리스트 + "차단 해제" 버튼(`unblockMember`). 영구 차단이 진짜 막다른 길이 되지 않게 최소 해제 경로 제공.

**탈퇴** — 24h 이내면 서버 `leave_cooldown` → 토스트 "가입 후 24시간이 지나야 탈퇴할 수 있어요".

**허브/목록/인기글 카드** — 비공개 커뮤니티에 **자물쇠 아이콘** 표시(발견은 유지, 잠김만 시각화).

## 7. 알림

기존 `notifications` insert + `sendPushToUser`(카테고리 `community`) 재사용. `notifyCommunityModeration` 패턴 참고.

| 이벤트 | 타입 | 수신자 | 문구(안) | 딥링크 |
|---|---|---|---|---|
| 새 가입 신청 | `community_join_request` | 매니저 | "'{name}'에 새 가입 신청이 있어요" | 심사 화면 |
| 가입 승인 | `community_join_approved` | 신청자 | "'{name}' 가입이 승인됐어요" | 커뮤니티 |
| 가입 거절 | `community_join_rejected` | 신청자 | "'{name}' 가입이 거절됐어요" (+사유) | 커뮤니티 |

## 8. 엣지 케이스

- 개설자(매니저)는 자동 멤버·비공개여도 항상 전체 열람.
- `closing`(폐쇄 유예) 상태 + 비공개: 폐쇄 로직 우선(신규 신청/가입 차단은 기존 `community_closing` 가드 재사용).
- 강퇴 차단(blocks)된 유저: 비공개면 신청 불가, 공개면 즉시 가입도 차단(공개 커뮤니티의 blocks도 존중).
- 비공개→공개 자동 수락 시 `member_count` 트리거 정상 증가(멤버 insert 경유).
- 미리보기 글이 삭제/블라인드면 잠금 기본 상태로 폴백.
- 매니저가 자기 자신을 차단/강퇴하는 경로 없음(기존 가드 유지).

## 9. 스코프 밖 (후속)
- 모바일 앱 전용 UI(비공개 잠금·신청 화면). API/DB는 공유되어 즉시 안전.
- 검색/발견 차단, 초대 링크·코드 가입, 다중 매니저의 심사 권한 위임.

## 10. 테스트 관점(요약)
- 마이그레이션 적용 후 기존 공개 커뮤니티 `visibility='public'` 확인.
- 비공개 비멤버: 피드 빈 배열 · 잠금 UI · `?post` 단일 노출.
- 신청→승인/거절→알림 3종 · 2일 재신청 쿨다운 경계.
- 24h 탈퇴 쿨다운 경계(공개·비공개 모두).
- 강퇴+차단 후 재가입/재신청 불가, 차단 해제 후 가능.
- 비공개→공개 전환 시 pending 전원 수락 + member_count 정합.
