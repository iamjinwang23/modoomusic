# search Design Document

> **Architecture**: Option C — Pragmatic Balance
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-04
> **Status**: Draft
> **Plan Ref**: `docs/01-plan/features/search.plan.md`

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 1차 SNS 4종 中 마지막 미구현 — 검색만 완성하면 발견·관계·표현·찾기 closed-loop |
| **WHO** | 곡 작성자(자기 곡과 별개), 모든 둘러보기 방문자 |
| **RISK** | ILIKE 풀스캔 / 비공개 곡 노출 / 가사 부담 |
| **SUCCESS** | 검색 진입율 15%+, 클릭율 30%+, 응답 < 300ms |
| **SCOPE** | 둘러보기 상단 우측 UI + 통합 검색 API + 4탭 결과 + 최근 검색어 + 태그→필터 |

---

## 1. Overview

둘러보기 본문 상단 우측에 검색 UI를 추가해 곡·사용자·태그 통합 검색을 제공. 단일 API 호출 + 단일 `SearchPanel` 컴포넌트 내부에 4탭 분기. ExplorePanel은 검색 상태 토글만 보유, 검색 활성 시 hero·섹션 대신 SearchPanel 노출.

---

## 2. Architecture (Option C)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ExplorePanel.tsx                                                      │
│   ├─ 상단 우측: 검색 input (MyWorkPanel 패턴 차용, 별개 state)      │
│   │      searchOpen, query, debouncedQuery state                     │
│   ├─ if (!query) → 기존 hero + sections + RecommendedCreators       │
│   └─ if (query) → <SearchPanel query={...} onClose={...} />         │
└───────────────────────────────────────────────────────────────────────┘
              │
              ↓ debounced fetch
┌───────────────────────────────────────────────────────────────────────┐
│ GET /api/search?q=...                                                 │
│   → services/search.service.ts                                        │
│      - searchSongs(q)    : ILIKE 곡 (is_public=true)                  │
│      - searchUsers(q)    : ILIKE 사용자                               │
│      - searchTags(q)     : GENRE_LABELS·MOOD_LABELS 매칭              │
│   → { songs, users, tags }                                            │
└───────────────────────────────────────────────────────────────────────┘
              │
              ↓
┌───────────────────────────────────────────────────────────────────────┐
│ SearchPanel.tsx                                                       │
│   ├─ Tabs: [전체 | 곡 | 사용자 | 태그]                                │
│   ├─ activeTab state, results props                                   │
│   └─ 빈 query → <RecentSearches /> 표시                              │
│                                                                       │
│ RecentSearches.tsx                                                    │
│   ├─ localStorage 10 FIFO                                             │
│   ├─ 칩 + 개별 X + 전체 지우기                                       │
│   └─ onSelect(q) → ExplorePanel에 query 주입                          │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model

**마이그레이션 없음**. 기존 `songs`, `profiles` 테이블만 사용.

### 3.1 API 응답 타입

```ts
// types/domain.ts에 추가 (또는 SearchPanel.tsx 내부)
interface SearchResults {
  songs: PublicSong[]      // LIMIT 30, is_public 곡만
  users: SearchUser[]      // LIMIT 20
  tags: SearchTag[]        // 매칭된 태그 모두
}

interface SearchUser {
  id: string
  username: string
  displayName: string
  avatarHue: number
  avatarUrl: string | null
  followerCount: number
  isFollowing?: boolean    // 로그인 사용자 한정
}

interface SearchTag {
  label: string            // '발라드', '신나는' 등
  type: 'genre' | 'mood'
  count: number            // 해당 태그를 가진 공개 곡 수
}
```

---

## 4. API Contract

### 4.1 `GET /api/search`

**Query**: `q` (string, required, trimmed, 최소 1자)

**Response 200**:
```json
{
  "data": {
    "songs": [/* PublicSong[] */],
    "users": [/* SearchUser[] */],
    "tags": [/* SearchTag[] */]
  }
}
```

**Response 400** (빈 query): `{ "error": "query required" }`

**구현 메모**:
- 인증 옵셔널 (비로그인도 검색 가능)
- 로그인 시 `isFollowing` 계산 (1 round trip 추가)
- 곡 검색에는 항상 `.eq('is_public', true)` 강제
- 사용자 검색에는 본인 제외 안 함 (자기 검색 시 본인 노출 정상)

### 4.2 service 함수 시그니처

```ts
// services/search.service.ts
export async function searchAll(
  q: string,
  currentUserId: string | null
): Promise<SearchResults>

async function searchSongs(supabase, q): Promise<PublicSong[]>
async function searchUsers(supabase, q, currentUserId): Promise<SearchUser[]>
function searchTags(q): SearchTag[]   // 사전 매칭 — 동기, DB 호출 X
async function attachTagCounts(supabase, tags): Promise<SearchTag[]>
```

---

## 5. UI / Component

### 5.1 ExplorePanel 변경

```tsx
const [searchOpen, setSearchOpen] = useState(false)
const [query, setQuery] = useState('')
const [debouncedQuery, setDebouncedQuery] = useState('')

useEffect(() => {
  const id = setTimeout(() => setDebouncedQuery(query.trim()), 300)
  return () => clearTimeout(id)
}, [query])

// 검색 UI: 상단 우측에 div
<div className="relative flex-1 overflow-y-auto px-5 py-6">
  <AuroraBackground />
  <ExploreHero />

  {/* 상단 우측 검색 — MyWorkPanel 패턴 */}
  <div className="relative flex justify-end mb-4">
    <SearchInput value={query} onChange={setQuery} open={searchOpen} onOpenChange={setSearchOpen} />
  </div>

  {debouncedQuery ? (
    <SearchPanel query={debouncedQuery} onTagClick={handleTagClick} onClose={() => { setQuery(''); setSearchOpen(false) }} />
  ) : (
    <div className="space-y-8">
      {HOME_SECTIONS.map(/*...*/)}
      <RecommendedCreators />
    </div>
  )}
</div>
```

### 5.2 SearchPanel 구조

```tsx
function SearchPanel({ query, onTagClick, onClose }) {
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'songs' | 'users' | 'tags'>('all')

  useEffect(() => {
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(d => { setResults(d.data); setLoading(false) })
    track(EVENTS.SEARCH_PERFORM, { query_length: query.length })
  }, [query])

  // Tabs + 콘텐츠 switch
  return (
    <div>
      <Tabs active={activeTab} onChange={setActiveTab} />
      {loading ? <SearchSkeleton /> :
       activeTab === 'all'   ? <AllTab    results={results} onTagClick={onTagClick} /> :
       activeTab === 'songs' ? <SongsTab  songs={results?.songs ?? []} /> :
       activeTab === 'users' ? <UsersTab  users={results?.users ?? []} /> :
       <TagsTab tags={results?.tags ?? []} onTagClick={onTagClick} />}
    </div>
  )
}
```

### 5.3 결과 카드 재사용

- 곡: `PublicSongCard` 그대로 사용 (origin: 'search' 전파)
- 사용자: `CreatorCard` 패턴 차용 또는 간단 인라인 컴포넌트 (RecommendedCreators의 CreatorCard 일부 추출 가능, 1차는 인라인)
- 태그: 칩 형태 — `[{label} · {count}곡]`, 클릭 시 onTagClick(tag)

### 5.4 RecentSearches

```tsx
function RecentSearches({ onSelect }) {
  const [recents, setRecents] = useState<string[]>([])
  useEffect(() => {
    const raw = localStorage.getItem('mono.search.recent')
    setRecents(raw ? JSON.parse(raw) : [])
  }, [])

  function remove(q: string) {
    const next = recents.filter(r => r !== q)
    setRecents(next)
    localStorage.setItem('mono.search.recent', JSON.stringify(next))
  }
  function clearAll() { setRecents([]); localStorage.removeItem('mono.search.recent') }

  if (recents.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex justify-between"><p>최근 검색</p><button onClick={clearAll}>모두 지우기</button></div>
      <div className="flex flex-wrap gap-2">
        {recents.map(q => (
          <button key={q} onClick={() => onSelect(q)} className="chip">
            {q} <X onClick={(e) => { e.stopPropagation(); remove(q) }} />
          </button>
        ))}
      </div>
    </div>
  )
}

// 검색 수행 시점에 ExplorePanel이 추가 호출
function addRecent(q: string) {
  const raw = localStorage.getItem('mono.search.recent')
  const list = raw ? JSON.parse(raw) : []
  const next = [q, ...list.filter((x: string) => x !== q)].slice(0, 10)
  localStorage.setItem('mono.search.recent', JSON.stringify(next))
}
```

### 5.5 빈 결과 처리

```tsx
{results.songs.length === 0 && results.users.length === 0 && results.tags.length === 0 ? (
  <div className="text-center py-12 text-zinc-500">
    <p className="text-base text-zinc-300 mb-2">검색 결과가 없어요</p>
    <p className="text-xs">철자를 확인하거나 다른 키워드로 시도해보세요</p>
  </div>
) : ...}
```

---

## 6. State Management

| State | 위치 | 용도 |
|---|---|---|
| `searchOpen` | ExplorePanel | 모바일 모핑 오버레이 토글 |
| `query` | ExplorePanel | input value |
| `debouncedQuery` | ExplorePanel | 300ms 후 검색 트리거 키 |
| `results` | SearchPanel | API 응답 캐시 |
| `loading` | SearchPanel | 스켈레톤 토글 |
| `activeTab` | SearchPanel | 4탭 분기 |
| `recents` | RecentSearches | localStorage 거울 |

Context 없음. props drilling은 ExplorePanel → SearchPanel 1단계, SearchPanel → 각 탭 1단계로 충분.

---

## 7. Implementation Details

### 7.1 `services/search.service.ts`

```ts
import { createUserClient } from '@/lib/supabase/server'
import { GENRE_LABELS, MOOD_LABELS } from '@/utils/extractTags'
import { SONG_SELECT, rowToPublicSong, fillIsLiked } from '@/services/explore.service'
import type { PublicSong } from '@/types/domain'

export interface SearchUser {
  id: string
  username: string
  displayName: string
  avatarHue: number
  avatarUrl: string | null
  followerCount: number
  isFollowing?: boolean
}

export interface SearchTag {
  label: string
  type: 'genre' | 'mood'
  count: number
}

export interface SearchResults {
  songs: PublicSong[]
  users: SearchUser[]
  tags: SearchTag[]
}

export async function searchAll(q: string, currentUserId: string | null): Promise<SearchResults> {
  const supabase = await createUserClient()
  const trimmed = q.trim()
  if (!trimmed) return { songs: [], users: [], tags: [] }

  const [songs, users, tags] = await Promise.all([
    searchSongs(supabase, trimmed),
    searchUsers(supabase, trimmed, currentUserId),
    searchTagsWithCount(supabase, trimmed),
  ])

  // 곡에 isLiked 후처리
  const songsWithLikes = currentUserId ? await fillIsLiked(supabase, songs, currentUserId) : songs
  return { songs: songsWithLikes, users, tags }
}

async function searchSongs(supabase, q: string): Promise<PublicSong[]> {
  const pattern = `%${q}%`
  const { data, error } = await supabase
    .from('songs')
    .select(SONG_SELECT)
    .eq('is_public', true)
    .or(`title.ilike.${pattern},prompt.ilike.${pattern},genre.ilike.${pattern},mood.ilike.${pattern}`)
    .order('like_count', { ascending: false })
    .limit(30)
  if (error) { console.error('[searchSongs]', error.message); return [] }
  return (data ?? []).map(rowToPublicSong)
}

async function searchUsers(supabase, q: string, currentUserId: string | null): Promise<SearchUser[]> {
  const pattern = `%${q}%`
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_hue, avatar_url, follower_count')
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order('follower_count', { ascending: false })
    .limit(20)
  if (error) { console.error('[searchUsers]', error.message); return [] }

  const users: SearchUser[] = (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name ?? r.username,
    avatarHue: r.avatar_hue ?? 0,
    avatarUrl: r.avatar_url,
    followerCount: r.follower_count ?? 0,
  }))

  // isFollowing 일괄 조회
  if (currentUserId && users.length > 0) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .in('following_id', users.map(u => u.id))
    const followed = new Set((follows ?? []).map((f: any) => f.following_id))
    users.forEach(u => { u.isFollowing = followed.has(u.id) })
  }
  return users
}

async function searchTagsWithCount(supabase, q: string): Promise<SearchTag[]> {
  const lower = q.toLowerCase()
  const genreMatches = GENRE_LABELS.filter(g => g.toLowerCase().includes(lower))
  const moodMatches  = MOOD_LABELS.filter(m => m.toLowerCase().includes(lower))
  const matches: SearchTag[] = [
    ...genreMatches.map(label => ({ label, type: 'genre' as const, count: 0 })),
    ...moodMatches.map(label => ({ label, type: 'mood' as const, count: 0 })),
  ]
  if (matches.length === 0) return []

  // 각 태그별 공개 곡 수 (병렬)
  await Promise.all(matches.map(async (m) => {
    const { count } = await supabase
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('is_public', true)
      .eq(m.type === 'genre' ? 'genre' : 'mood', m.label)
    m.count = count ?? 0
  }))
  return matches.filter(m => m.count > 0)
}
```

### 7.2 `app/api/search/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { searchAll } from '@/services/search.service'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json({ error: 'query required' }, { status: 400 })

  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  const results = await searchAll(q, user?.id ?? null)
  return NextResponse.json({ data: results })
}
```

### 7.3 GA4 이벤트 추가 (`utils/analytics.ts`)

```ts
export const EVENTS = {
  // ... 기존 7개
  SEARCH_PERFORM: 'search_perform',
  SEARCH_RESULT_CLICK: 'search_result_click',
} as const
```

호출 위치:
- `SearchPanel` useEffect 안 fetch 직후 → `track(EVENTS.SEARCH_PERFORM, { query_length, result_count })`
- 각 결과 카드 클릭 핸들러에서 → `track(EVENTS.SEARCH_RESULT_CLICK, { type: 'song'|'user'|'tag' })`

### 7.4 태그 클릭 → 둘러보기 필터 적용

```ts
function handleTagClick(tag: SearchTag) {
  // 검색 종료 + 둘러보기 필터 활성
  setQuery('')
  setSearchOpen(false)
  // 둘러보기 "전체 보기" → 해당 태그 칩 활성
  setAllView({ tab: 'latest', label: '새로운 음악' })
  // SectionAllView에 태그 prefill 전달 — 추가 prop 필요
}
```

→ `SectionAllView`에 `initialFilters?: string[]` prop 추가, mount 시 setFilters로 주입.

---

## 8. Test Plan

### 8.1 수동 검증

- [ ] 둘러보기 진입 → 상단 우측 검색 input(데스크톱)·아이콘(모바일) 노출
- [ ] 모바일 아이콘 탭 → 폭 모핑 오버레이 (MyWorkPanel과 동일 transition)
- [ ] 빈 query → 검색 발생 안 함, 결과 패널 미노출
- [ ] 1자 입력 → 300ms 후 검색 발사, 결과 표시
- [ ] 4탭 전환 동작
- [ ] 전체 탭에서 곡 6 + 사용자 5 + 태그 3 미리보기
- [ ] 곡 클릭 → SongDetailPage 진입 (origin 'search')
- [ ] 사용자 클릭 → ProfilePanel 진입
- [ ] 태그 클릭 → 검색 종료 + 둘러보기 필터 자동 적용
- [ ] 비공개 곡 검색 결과 0건 (SQL 직접 검증)
- [ ] 빈 결과 안내 노출
- [ ] 최근 검색어: 검색 수행 후 localStorage 저장, input 포커스 시 칩 표시, 개별 X·전체 지우기
- [ ] ESC·X → 검색 종료
- [ ] 사용자 검색에서 본인 표시 OK
- [ ] 응답 시간 < 300ms (Network 탭)
- [ ] GA4 DebugView에서 `search_perform`·`search_result_click` 확인

### 8.2 보안 검증

- [ ] `is_public = true` 강제 확인
- [ ] 비로그인 사용자 → 401 없이 정상 응답
- [ ] SQL injection 방지: `.or()` 메서드는 query escape 안 함 → query에 특수문자(`,`, `%`, `_`) 들어가면? — Supabase JS는 ILIKE 값을 자동 quote하지 않음. **추가 검증 필요** (Decision Record §7)

---

## 9. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Supabase `.or()` 메서드에 query 그대로 들어가면 ILIKE 와일드카드 `%`·`_`가 사용자 입력에 의해 오용될 수 있음 | query escape: `q.replace(/[%_,]/g, '\\$&')` 적용 + 최대 길이 50자 제한 |
| 풀스캔 느림 | 1차는 데이터 규모 작아 OK. Phase 2 trigram 인덱스 |
| 검색 input 빠른 타이핑 시 race | useState `debouncedQuery` + AbortController로 이전 fetch 취소 (선택) |
| 태그 검색 count 쿼리 N+1 | `Promise.all`로 병렬화 (현재 GENRE 19 + MOOD 11 = 최대 30개, 일치 결과만 count) |
| localStorage 손상된 JSON | try/catch + 무효 시 빈 배열 |
| isFollowing 추가 round trip | 검색 사용자 결과 LIMIT 20이라 1 쿼리 충분 |

---

## 10. Decision Records (10)

| # | 결정 | 근거 |
|---|---|---|
| 1 | Option C (Pragmatic) | 4탭 통합 검색에 B는 과잉, A는 비대 |
| 2 | 단일 통합 API `/api/search` | 1 round trip, 4탭 미리 모두 로드 |
| 3 | 마이그레이션 0 | 기존 컬럼만 사용, Phase 2에 인덱스 |
| 4 | Supabase ILIKE | 데이터 규모 작음, pg_trgm·FTS는 Phase 2 |
| 5 | 곡 검색 = 제목·prompt·genre·mood (가사 제외) | TEXT 컬럼 부하 회피, 사용자 명시 |
| 6 | 사용자 결과 본인 포함 | 자기 검색 시 본인 노출 정상, 자기 프로필 진입 가능 |
| 7 | query escape (`%`·`_`·`,`) + 50자 max | SQL 와일드카드 오용 방지, UX 영향 0 |
| 8 | debounce 300ms | UX 표준, 빠른 타이핑 시 race 회피 |
| 9 | 태그 클릭 → 둘러보기 필터 자동 적용 | 라우트 추가 없이 기존 SectionAllView 재사용, 사용자 명시 |
| 10 | localStorage 키 `mono.search.recent` | 프로젝트 네임스페이스 규칙 |

---

## 11. Implementation Guide

### 11.1 모듈 분할

| Module | 파일 | 변경 |
|---|---|---|
| `module-types` | `types/domain.ts` 또는 `services/search.service.ts` 내부 | `SearchUser`·`SearchTag`·`SearchResults` 인터페이스 |
| `module-service` | `services/search.service.ts` | **신규** (~120 lines) |
| `module-api` | `app/api/search/route.ts` | **신규** (~15 lines) |
| `module-recent` | `features/explore/components/RecentSearches.tsx` | **신규** (~70 lines) |
| `module-panel` | `features/explore/components/SearchPanel.tsx` | **신규** (~180 lines) |
| `module-integration` | `features/explore/components/ExplorePanel.tsx` | 수정 (검색 input + searchOpen state + 분기) |
| `module-tag-filter` | `features/explore/components/ExplorePanel.tsx` | `SectionAllView`에 `initialFilters` prop 추가 |
| `module-analytics` | `utils/analytics.ts` | `SEARCH_PERFORM`·`SEARCH_RESULT_CLICK` 추가 |
| `module-qa` | (수동 QA) | DebugView·SQL injection 검증 |

### 11.2 구현 순서

1. `module-types` (~5분)
2. `module-service` (~30분) — escape + 3 fetch 함수
3. `module-api` (~10분)
4. `module-recent` (~20분) — localStorage 헬퍼
5. `module-panel` (~50분) — 4탭 + skeleton + 빈 상태
6. `module-integration` (~30분) — ExplorePanel input + 분기
7. `module-tag-filter` (~10분) — initialFilters prop
8. `module-analytics` (~3분)
9. `module-qa` (~30분)

**총 예상**: ~3.5h

### 11.3 Session Guide

| Scope Key | 권장 묶음 | 예상 시간 |
|---|---|---|
| `module-service,module-api,module-types` | 백엔드만 | ~45분 |
| `module-recent,module-panel,module-integration,module-tag-filter` | UI 통합 | ~2h |
| `module-analytics,module-qa` | 마무리 | ~30분 |

**단일 세션 권장 ~3.5h** 또는 2 세션 분할 가능.

---

## 12. Open Questions (Do 진입 전 확인)

1. **Supabase `.or()` escape** — `'title.ilike.%abc%'`처럼 패턴이 문자열에 들어가는데, query에 `,` 포함 시 `.or()`이 다른 컬럼으로 오인할 가능성. Decision Record §7로 `.replace(/[%_,]/g, '\\$&')` + 50자 제한으로 회피. **DO 단계에서 actually 테스트 필요**
2. **`SONG_SELECT` reuse** — `services/explore.service.ts`의 SONG_SELECT 상수를 import 가능 여부 확인 (export 안 돼있으면 export 추가)
3. **`SectionAllView` initialFilters** — 현재 구조에 prop 주입 자연스러운지 (이미 setAllView가 tab/label만 받음 → 확장)
4. **모바일 검색 활성 시 hero 숨김 처리** — MyWorkPanel은 필터 칩만 페이드아웃, 우리는 hero·sections 통째로 숨김 필요. CSS 또는 조건부 렌더

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-04 | Initial draft, Option C 선택 | iamjinwang@gmail.com |
