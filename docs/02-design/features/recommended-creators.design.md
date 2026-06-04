# recommended-creators Design Document

> **Project**: 모두의 노래 (MONO)
> **Plan**: `docs/01-plan/features/recommended-creators.plan.md`
> **Architecture**: **Option C — Pragmatic Balance** (서비스 한 파일·단일 함수 분기 + 기존 패턴 차용)
> **Date**: 2026-06-04
> **Status**: Design

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 곡 단위만으론 관계 형성 어려움. 사람 발견 → 팔로우 → 알림 → 재방문 = SNS 핵심 |
| **WHO** | (1차) 좋아요·청취 활동 있는 사용자 → 개인화 / (cold start) 신규 → 발견 모드 폴백 / (수혜자) 신규 크리에이터(30일 내 가입) → 첫 팔로워 기회 |
| **RISK** | 필터 버블·cold start·양극화·raw SQL 부담 |
| **SUCCESS** | 클릭율 8%+, 신규 팔로우 +30%, 신규 크리에이터 첫 팔로워 시간 단축, 본인·중복 노출 0건 |
| **SCOPE** | 단일 섹션 / 8명 / 5+2+1 하이브리드 / raw SQL 즉시 계산 / 원형 아바타 카드 + 1탭 팔로우 |

---

## 1. Overview

### 1.1 Design Goals

- **기존 패턴 최대 차용**: 캐러셀·스켈레톤·낙관적 팔로우는 기존 코드 재사용 (신규 패턴 X)
- **단일 책임 + 적정 추상화**: service 한 파일에 SQL 로직 모이지만 strategy 패턴 같은 과도한 추상화는 피함
- **마이그레이션 0**: 기존 컬럼만으로 동작. 새 테이블·인덱스 신설 없음 (1차)
- **확장 친화**: 시그널 1~2개 추가는 service 함수 내부 수정만으로 가능

### 1.2 Design Principles

- **UI는 기존과 일관성**: `SectionCarousel`(곡 캐러셀) 패턴 따름 — 가로 스크롤·hover 화살표·페이드 마스크
- **팔로우는 기존 패턴 재사용**: `useOptimisticToggle` + `/api/profiles/[id]/follow`
- **클라이언트 fetch + 1회 mount**: Realtime 필요 없음 (셔플 결과는 새로고침 시점 기준)
- **빈 결과 = 섹션 숨김**: 강제 노출 X

---

## 2. Architecture

### 2.1 컴포넌트 다이어그램

```
[ExplorePanel] (둘러보기 메인)
   └─ HOME_SECTIONS.map → SectionCarousel(에디터 추천)
                       → SectionCarousel(새로운 음악)
   └─ [RecommendedCreators]  ← 신규 (이 feature)
          │
          ├─→ useEffect mount 시 1회 fetch
          ├─→ GET /api/explore/recommended-creators
          │       │
          │       └─→ services/recommendations.service.ts:getRecommendedCreators(currentUserId?)
          │              │
          │              ├─ 로그인 시: 3 CTE UNION (개인화 5 + 트렌딩 2 + 신규 1)
          │              └─ 비로그인 시: trending 단독 LIMIT 8
          │
          ├─ 가로 스크롤 캐러셀 (SectionCarousel 패턴 차용)
          └─ 카드 (원형 아바타·닉네임·팔로워 수·팔로우 버튼)
                └─ 카드 클릭 → view-profile 이벤트
                └─ 팔로우 버튼 → useOptimisticToggle + /api/profiles/[id]/follow
```

### 2.2 기존 패턴 차용 매핑

| 새 컴포넌트 | 차용 패턴 |
|---|---|
| 캐러셀 가로 스크롤·화살표·페이드 | `features/explore/components/ExplorePanel.tsx:SectionCarousel` |
| 로딩 스켈레톤 | 위 파일의 `SectionCarouselSkeleton` (카드 크기만 다르게 재구성) |
| 팔로우 버튼 | `features/explore/components/ProfilePanel.tsx`의 useOptimisticToggle 패턴 |
| 프로필 이동 | 기존 `view-profile` CustomEvent |
| API service 함수 + 라우트 | 기존 `services/explore.service.ts` 패턴 (단, 서버 측 admin client 필요 없음 — anon RLS로 충분) |

---

## 3. Data Model

### 3.1 마이그레이션 — **없음**

기존 테이블·컬럼만 활용:
- `profiles` (id, username, display_name, avatar_hue, avatar_url, follower_count, created_at)
- `songs` (user_id, is_public, like_count, play_count, created_at)
- `likes` (user_id, song_id)
- `follows` (follower_id, following_id)

### 3.2 도메인 타입 (`types/domain.ts` 확장 — 새 인터페이스만 추가)

```ts
// 추천 크리에이터 카드용 — UserProfile 보다 가벼움
export interface RecommendedCreator {
  id: string
  username: string
  displayName: string
  avatarHue: number
  avatarUrl: string | null
  followerCount: number
  /** 분기 디버깅용 (1=개인화, 2=트렌딩, 3=신규). UI 표시 X */
  bucket?: 1 | 2 | 3
}
```

### 3.3 인덱스 검토 (Phase 1엔 변경 없음, 모니터링용)

- `likes(user_id, created_at desc)` — 개인화 CTE 가속 (사용자 좋아요 이력 fetch)
- `songs(user_id, is_public, created_at desc)` — 트렌딩 CTE 가속
- `profiles(created_at desc)` — 신규 CTE 가속
- `follows(follower_id, following_id)` — 모든 CTE의 NOT EXISTS 절

→ 1차에 인덱스 추가 없이 출시, 응답 시간 200ms 넘으면 Phase 2에 인덱스 추가.

---

## 4. API Contract

### 4.1 `GET /api/explore/recommended-creators`

**Auth**: 선택 (로그인 시 개인화, 비로그인 시 트렌딩 단독)

**Query Params**: 없음 (1차)

**Response 200**:
```ts
{
  creators: Array<{
    id: string
    username: string
    displayName: string
    avatarHue: number
    avatarUrl: string | null
    followerCount: number
    bucket?: 1 | 2 | 3   // 디버깅용, 운영 시 제거 가능
  }>  // 길이 0~8
}
```

**Response 코드**:
- 200: 성공 (빈 배열 포함)
- 500: SQL/DB 에러 (rare)

**구현 흐름**:
```
1. 사용자 정보 fetch (createUserClient → getUser)
2. services/recommendations.service.ts:getRecommendedCreators(user?.id) 호출
3. 결과를 JSON으로 반환
```

### 4.2 service 함수

`services/recommendations.service.ts`

```ts
export async function getRecommendedCreators(
  currentUserId: string | null,
): Promise<RecommendedCreator[]> {
  const supabase = createServerClient()  // RLS는 public read profiles 허용 가정

  if (!currentUserId) {
    // 비로그인: 트렌딩 8명
    return fetchTrendingOnly(supabase, 8)
  }

  // 로그인: 5 + 2 + 1
  const sql = `... 3 CTE UNION ALL ...`  // (Plan §4.3 참조)
  const { data, error } = await supabase.rpc('recommended_creators', { me: currentUserId })
  if (error) throw error
  return (data ?? []).map(toRecommendedCreator)
}
```

### 4.3 SQL: Supabase RPC vs raw SQL

두 옵션 비교 후 **raw SQL via PostgREST**를 1차 채택:

| 방식 | 장점 | 단점 |
|---|---|---|
| **Supabase RPC (`recommended_creators(me)` 함수)** | 인덱스 최적화 EXPLAIN 쉬움, 클라이언트 SQL 노출 X, 자동 캐시 가능 | SQL 함수 정의용 마이그레이션 필요 (1차 "마이그레이션 0" 원칙 위반) |
| **raw SQL via Supabase JS query builder** ⭐ | 마이그레이션 0, 빠른 변경, 디버깅 쉬움 | 클라이언트(서버 라우트지만)에서 SQL 노출, EXPLAIN 별도 |

→ 1차는 raw SQL. Phase 2에 응답 시간 측정 후 인덱스 + RPC 함수로 전환 검토.

### 4.4 raw SQL (실행 형태)

API route 내부에서 다음 SQL을 admin client 또는 anon client로 실행:

```sql
WITH liked AS (
  SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
         1 AS bucket, MAX(l.created_at) AS rank_key
  FROM likes l
  JOIN songs s ON s.id = l.song_id
  JOIN profiles p ON p.id = s.user_id
  WHERE l.user_id = $1
    AND s.user_id != $1
    AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = s.user_id)
    AND EXISTS (SELECT 1 FROM songs s2 WHERE s2.user_id = p.id AND s2.is_public)
  GROUP BY p.id
  ORDER BY rank_key DESC
  LIMIT 5
),
trending AS (
  SELECT * FROM (
    SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
           2 AS bucket, NULL::timestamptz AS rank_key,
           (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
    FROM profiles p
    JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '7 days'
    WHERE p.id != $1
      AND p.id NOT IN (SELECT id FROM liked)
      AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = p.id)
    GROUP BY p.id
    ORDER BY score DESC
    LIMIT 30
  ) t
  ORDER BY RANDOM()
  LIMIT 2
),
new_creator AS (
  SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
         3 AS bucket, p.created_at AS rank_key
  FROM profiles p
  WHERE p.created_at > NOW() - INTERVAL '30 days'
    AND p.id != $1
    AND p.id NOT IN (SELECT id FROM liked)
    AND p.id NOT IN (SELECT id FROM trending)
    AND EXISTS (SELECT 1 FROM songs WHERE user_id = p.id AND is_public)
    AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = p.id)
  ORDER BY RANDOM()
  LIMIT 1
)
SELECT id, username, display_name, avatar_hue, avatar_url, follower_count, bucket FROM liked
UNION ALL
SELECT id, username, display_name, avatar_hue, avatar_url, follower_count, bucket FROM (
  SELECT id, username, display_name, avatar_hue, avatar_url, follower_count, bucket FROM trending
) t
UNION ALL
SELECT id, username, display_name, avatar_hue, avatar_url, follower_count, bucket FROM new_creator;
```

비로그인:
```sql
-- trending CTE 단독, 본인·팔로우 검증 절 제거, LIMIT 8
```

---

## 5. State Management

### 5.1 RecommendedCreators 컴포넌트 내부 state

```ts
const [creators, setCreators] = useState<RecommendedCreator[]>([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  let cancelled = false
  fetch('/api/explore/recommended-creators')
    .then((r) => r.json())
    .then((d) => { if (!cancelled) setCreators(d.creators ?? []) })
    .catch(() => { if (!cancelled) setCreators([]) })
    .finally(() => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }
}, [])
```

### 5.2 카드 내부 팔로우 state (useOptimisticToggle)

```ts
const { state: following, toggle: toggleFollow } = useOptimisticToggle({
  initialState: false,  // 추천 목록은 미팔로우만이라 false 시작
  guard: () => {
    if (!user) { window.dispatchEvent(new Event('open-login')); return false }
    return true
  },
  fetcher: async () => {
    const r = await fetch(`/api/profiles/${creator.id}/follow`, { method: 'POST' })
    const d = await r.json()
    return { state: d.following }
  },
  onError: () => toast.error('팔로우에 실패했어요'),
})
```

→ 팔로우 즉시 카드 버튼이 "팔로잉" 회색으로 바뀜. 새로고침 다음엔 미팔로우 필터로 추천에서 자연 제외됨.

---

## 6. Event Bus

| 이벤트 | detail | 용도 |
|---|---|---|
| `view-profile` (기존) | `username: string` | 카드 클릭 시 프로필로 이동 |
| `open-login` (기존) | — | 비로그인 사용자가 팔로우 클릭 시 |
| `like-updated` (기존) | — | 무관 — 추천은 follow 기반이라 like 변화에 즉시 반응 안 함 |

신규 이벤트 없음.

---

## 7. UI Component Map

### 7.1 컴포넌트 트리

```
<RecommendedCreators>
  <SectionHeader>새로 만나볼 사람들 ›</SectionHeader>
  {loading
    ? <CarouselSkeleton count={8} cardType="creator" />
    : creators.length === 0
      ? null  // 빈 결과 → 섹션 자체 숨김
      : <Carousel>
          {creators.map((c) => <CreatorCard creator={c} />)}
        </Carousel>}
</RecommendedCreators>
```

### 7.2 CreatorCard (인라인 또는 별도 함수)

```tsx
function CreatorCard({ creator }: { creator: RecommendedCreator }) {
  const { user } = useAuth()
  const { state: following, toggle: toggleFollow } = useOptimisticToggle({ ... })
  const avatarColor = profileColor(creator.avatarHue)
  const initial = (creator.displayName ?? creator.username).slice(0, 1).toUpperCase()

  return (
    <div className="shrink-0 w-[120px] md:w-[140px] flex flex-col items-center text-center">
      <button onClick={() => navigate(creator.username)}
        className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ... hover:scale-105 transition-transform">
        {creator.avatarUrl
          ? <Image src={creator.avatarUrl} alt="" fill className="object-cover" unoptimized />
          : <div style={{ background: avatarColor.bg, color: avatarColor.text }}>{initial}</div>}
      </button>
      <p className="mt-2 text-sm font-medium text-white truncate w-full">{creator.displayName}</p>
      <p className="text-xs text-zinc-500 mb-2">{formatCount(creator.followerCount)}</p>
      <button onClick={toggleFollow}
        className={`text-xs px-3 py-1 rounded-full ${following ? 'bg-white/[0.08] text-zinc-400' : 'bg-white text-zinc-900 font-semibold'}`}>
        {following ? '팔로잉' : '+ 팔로우'}
      </button>
    </div>
  )
}
```

### 7.3 통합 위치 (`ExplorePanel`)

```tsx
return (
  <div className="relative flex-1 overflow-y-auto px-5 py-6">
    <AuroraBackground />
    <ExploreHero />
    <div className="space-y-8">
      {HOME_SECTIONS.map(({ id, label }) => <SectionCarousel ... />)}
      <RecommendedCreators />  {/* 새 줄 — "새로운 음악" 아래 */}
    </div>
  </div>
)
```

---

## 8. Test Plan (수동 QA 체크리스트)

### 8.1 알고리즘 정확성
- [ ] 로그인 + 좋아요 풍부: 개인화 5 + 트렌딩 2 + 신규 1 = 8명 노출
- [ ] 로그인 + 좋아요 0: 트렌딩으로 폴백, 8명 모두 트렌딩+신규
- [ ] 로그인 + 모두 팔로우: 결과 0~소수, 섹션 숨김 또는 단축 노출
- [ ] 비로그인: 트렌딩 8명만 노출

### 8.2 노출 제외 규칙
- [ ] 본인 프로필 노출 안 됨
- [ ] 이미 팔로우한 사용자 노출 안 됨
- [ ] 곡 0개 사용자 노출 안 됨
- [ ] 8명 distinct (중복 노출 0)

### 8.3 UI/UX
- [ ] 캐러셀 가로 스크롤 (모바일·데스크톱)
- [ ] 데스크톱: hover 시 좌우 화살표·페이드 표시
- [ ] 모바일: 좌우 화살표 없음, 터치 스크롤만
- [ ] 로딩 시 8개 skeleton 카드 표시
- [ ] 빈 결과: 섹션 자체 비표시 (헤더도 X)
- [ ] 카드 클릭 → 해당 프로필 페이지 이동
- [ ] 팔로우 버튼 클릭 → 즉시 "팔로잉" 회색 전환
- [ ] 비로그인 + 팔로우 클릭 → 로그인 모달

### 8.4 성능
- [ ] API 응답 시간 평균 200ms 이하 (현재 사용자 규모)
- [ ] 동시 다발 요청에도 안정 동작
- [ ] 8명 결과 fetch 후 렌더 점프 없이 자연 등장

### 8.5 셔플 변동성
- [ ] 새로고침 시 트렌딩·신규 부스트 자리가 다른 사람으로 자주 바뀜
- [ ] 개인화 5명은 안정적 (좋아요 변화 없으면 같은 사람)

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 필터 버블 (개인화 위주 = 같은 사람 반복) | 트렌딩 2명 + 신규 1명 `RANDOM()` 셔플로 변동성. Phase 2에서 localStorage dedup |
| Cold start (활동 0 신규) | liked CTE가 자동 빈 결과 → 8자리 모두 trending이 채움 (UNION ALL 자연 폴백) |
| 양극화 (Top 인기인만) | 트렌딩 풀 Top 30 → RANDOM 셔플로 2명 |
| 단일 SQL 부담 | 1차 OK (사용자 1000명 규모). 5000명+ 시 cron 캐시 컬럼 + RPC 함수 |
| 본인·팔로우 노출 위험 | 3개 CTE 모두 명시적 제외 절 + 클라이언트 한 번 더 검증 (방어적) |
| 곡 0개 빈 프로필 | trending·new_creator 모두 `EXISTS songs is_public` 필터 |
| RANDOM 일관성 부재 | 1차 의도된 동작. Phase 2에서 일자 시드로 보완 |
| RLS로 profiles SELECT 차단? | profiles는 기본 public read RLS 있음 (확인 필요). 없으면 admin client로 전환 |

---

## 10. Phase 2 Forward Compatibility

- **localStorage dedup**: `seen_creator_ids` 저장 → 같은 사람 노출 우선순위 ↓
- **카드 풍부화**: 대표 곡 썸네일 1개 표시 (재생 가능)
- **일자 고정 시드**: `RANDOM()` 대신 `md5(date::text || me::text)` 같은 결정적 시드 → "오늘의 추천" 안정화
- **시그널 가중치 A/B 테스트**: like_count × W1 + play_count × W2 + ... A/B 변형
- **5000명+ 도달 시**: `profiles.weekly_activity_score` 컬럼 + cron 매시간 update + RPC 함수
- **장르 임베딩**: 사용자가 좋아한 곡 장르 분포 → 매칭 가중치 (장르 19 매트릭스)
- **인증 마크**: 1만 팔로워+ ✓ 표시

---

## 11. Implementation Guide

### 11.1 구현 순서

1. **service + API 라우트** (백엔드)
   - `services/recommendations.service.ts` — `getRecommendedCreators(userId?)`
   - `app/api/explore/recommended-creators/route.ts`
   - curl로 검증 (로그인·비로그인 양쪽)
2. **타입 + 컴포넌트** (프론트엔드)
   - `types/domain.ts`에 `RecommendedCreator` 인터페이스 추가
   - `features/explore/components/RecommendedCreators.tsx` — 캐러셀 + 카드 인라인
   - 기존 `SectionCarousel` 패턴 따라 가로 스크롤·화살표 구현
3. **ExplorePanel 통합**
   - `HOME_SECTIONS.map` 아래에 `<RecommendedCreators />` 추가
   - loading·empty 분기 두 곳도 같이 (3분기 모두에 노출)
4. **수동 QA**
   - §8 체크리스트 따라 검증

### 11.2 Decisions Record

| # | Decision | Rationale |
|---|---|---|
| 1 | Option C (Pragmatic) 선택 | 1차 feature에 strategy 패턴은 과함. 단일 service 함수 분기로 충분 |
| 2 | 5+2+1 비율 | 개인화 친밀감 + 트렌딩 신선함 + 신규 양성 모두 챙김. Spotify·Insta 단순화 버전 |
| 3 | raw SQL via Supabase JS | 마이그레이션 0 원칙. Phase 2에 인덱스 + RPC 함수로 전환 검토 |
| 4 | 마이그레이션 0 | 기존 컬럼만으로 동작. 새 테이블·인덱스 신설 없음 |
| 5 | 캐러셀 가로 스크롤 (기존 패턴 차용) | UX 일관성. SectionCarousel 패턴 그대로 |
| 6 | 빈 결과 = 섹션 숨김 | 강제 노출은 사용자 신뢰 깎음 |
| 7 | 비로그인 = 트렌딩 8명 단독 | 발견 가치 유지하되 개인화 의미 없음 |
| 8 | 팔로우는 useOptimisticToggle 재사용 | 기존 SNS 액션과 동일 UX |
| 9 | 카드 디자인 단순 (아바타·이름·팔로워 수) | 1차 검증용. 대표 곡 썸네일은 Phase 2 |
| 10 | Realtime 구독 없음 | 셔플 결과는 새로고침 기준. 실시간 변화 불필요 |

### 11.3 Session Guide

**Module Map**:

| Module | Scope | 파일 |
|--------|-------|------|
| `module-service` | service 함수 + SQL CTE 작성 | `services/recommendations.service.ts` |
| `module-api` | API 라우트 | `app/api/explore/recommended-creators/route.ts` |
| `module-types` | 도메인 타입 | `types/domain.ts` |
| `module-ui` | RecommendedCreators 컴포넌트 (캐러셀 + 카드) | `features/explore/components/RecommendedCreators.tsx` |
| `module-integration` | ExplorePanel 통합 (3 분기) | `features/explore/components/ExplorePanel.tsx` |
| `module-qa` | 수동 QA 체크리스트 | 코드 변경 없음 |

**Recommended Session Plan**:

단일 세션 권장 (~2.5h):
- 30분: service + API (curl 검증까지)
- 30분: types + 컴포넌트 골격
- 30분: 카드 UI + useOptimisticToggle
- 30분: ExplorePanel 통합 + 스켈레톤
- 30분: 수동 QA + 미세 조정

또는 2 세션 분할:
- **Session 1** (1h): `module-service` + `module-api` + `module-types`
- **Session 2** (1.5h): `module-ui` + `module-integration` + `module-qa`

사용 예: `/pdca do recommended-creators` (전체) 또는 `/pdca do recommended-creators --scope module-service,module-api,module-types`

---

## 12. Open Questions

다음 항목은 구현 시작 전 또는 첫 세션에서 확인 필요:

1. **`profiles` 테이블 RLS 정책** — 누구나 SELECT 가능한지 확인 필요. 비공개 정책이면 admin client로 전환
2. **`follows` 테이블 RLS** — 본인이 누구 팔로우했는지 SELECT 가능해야 NOT EXISTS 절 정상 동작 (현재 그렇게 설정되어 있을 가능성 큼)
3. **인덱스 부족 여부** — Supabase Dashboard → Database → Indexes에서 `likes(user_id, created_at)`, `songs(user_id, is_public, created_at)` 존재 확인. 없으면 응답 시간 측정 후 Phase 2에 추가
4. **빈 풀 케이스** — 신규 가입자 30일 내 + 곡 게시한 사람이 1명도 없을 때 새 크리에이터 자리 비움 → UI에서 7명만 노출 정상 동작 확인
