# today-song-mvp Gap Analysis

> **Date**: 2026-05-21
> **Match Rate**: 87.3%
> **Mode**: Static analysis (no runtime)
> **Recommendation**: critical-only-iterate (문서 정합화)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Plan/Design 회고형 업데이트 후 코드와의 실제 정합도 검증 |
| **WHO** | 개발자 (jinwang) |
| **RISK** | 문서가 실제보다 보수적으로 작성되어 다음 작업 결정에 혼선 |
| **SUCCESS** | Match Rate ≥ 90% (현재 87.3%) |
| **SCOPE** | 정적 분석만, 런타임 테스트 제외 |

---

## 1. Structural Match (96.6%)

29개 파일 중 28개 존재. 누락: `app/notifications/page.tsx`.

추가 발견된 미반영 파일:
- `services/storage.service.ts`
- `lib/supabase/server.ts`
- `components/SongCard.tsx`
- `components/SongDetailSheet.tsx`

---

## 2. Functional Depth (100%)

샘플링한 핵심 주장 6건 모두 코드 증거로 확인:

| 주장 | 증거 |
|------|------|
| `profile-avatar-updated` 디스패치 | ProfilePanel.tsx:172, 182 (producer); HomeLayout.tsx:115, MyWorkPanel.tsx:131 (consumer) |
| `song-generating` → PendingSongItem | useSongGeneration.ts:29; MyWorkPanel.tsx:33,129,203 |
| `GlobalPlayerContext.ownerName` | contexts/GlobalPlayerContext.tsx:12,27,31,48,124 |
| `view-song` 이벤트 와이어링 | 4 producers / 2 consumers 모두 존재 |
| `profile-avatar-updated` 와이어링 | 정상 |
| `song-generating` 와이어링 | 정상 |

---

## 3. API Contract (70%)

### 3.1 POST /api/generate

| 항목 | Design | 실제 | 상태 |
|------|--------|------|------|
| Request | `title?` 포함 | 서버가 `title` 미사용 (클라이언트 로컬에서만 사용) | ⚠️ |
| Response | `{ audioUrl, lyrics, coverUrl }` | 일치 | ✅ |
| Error codes | 400/429/500 | 400/502 (429 없음) | ⚠️ |
| Side effect | 미문서화 | Supabase Storage `songs-audio`/`songs-covers`에 업로드 | ❌ |

### 3.2 GET /api/check-username

| 항목 | Design | 실제 | 상태 |
|------|--------|------|------|
| Response | `{ available }` | `{ available, reason? }` (`reason: 'empty'\|'invalid'`) | ⚠️ |

---

## 4. Decision Record Verification

§11.1 12개 항목 중 3개 샘플링: 전부 코드 증거 있음.

**미문서화 결정**: songs-audio/cover Supabase Storage 업로드 파이프라인이 이미 구현됨에도 §11.2(Phase 3 예고)에 "다음 단계"로 남아 있음.

---

## 5. Gap List

| # | Severity | Conf | Gap | 위치 | 권장 수정 |
|---|----------|:---:|-----|------|----------|
| 1 | Critical | 100% | Phase scope 불일치 — Storage 업로드가 이미 구현됨 | route.ts:23-31, Design L22/487/527 | §11.2 → §11.1 이동, Context Anchor SCOPE 갱신 |
| 2 | Critical | 95% | `app/notifications/page.tsx` 누락 | Design §7, §2.5 | 빈 placeholder 생성 또는 Design에서 제거 |
| 3 | Important | 95% | `title` 필드 서버 미수신 | route.ts:6 vs Design L307 | §4.1에서 클라이언트 전용 표기 |
| 4 | Important | 90% | 에러 코드 목록 불일치 | route.ts:9,36 | §4.1 → 400/502 |
| 5 | Important | 85% | Storage 업로드 side-effect 미문서화 | route.ts:23-31 | §4.1에 side-effect 추가 |
| 6 | Minor | 100% | `GlobalMiniBar` view-song에 `ownerAvatarUrl` 누락 | GlobalMiniBar.tsx:31 | 1줄 추가 |
| 7 | Minor | 95% | check-username `reason` 필드 미문서화 | route.ts:9-10 | §4.2 갱신 |
| 8 | Minor | 90% | §7 미반영 파일 4개 | Design L394-441 | UI Component Map 갱신 |
| 9 | Minor | 85% | §11.1에 Storage 업로드 결정 누락 | Design L512-523 | 항목 13 추가 |

---

## 6. Match Rate

```
Structural × 0.2 + Functional × 0.4 + Contract × 0.4
= 0.966 × 0.2 + 1.00 × 0.4 + 0.70 × 0.4
= 0.873
```

**87.3%** — 90% 기준 미달이나, Contract drift가 주원인이며 모두 문서 측 수정으로 해결 가능.

---

## 7. Recommendation

**critical-only-iterate** — 코드 변경 거의 없이 Design 문서 정합화로 90%+ 달성 가능.

수정 우선순위:
1. (코드) `app/notifications/page.tsx` 빈 placeholder 생성 OR Design에서 제거
2. (코드) `GlobalMiniBar.tsx:31`에 `ownerAvatarUrl` 추가 (1줄)
3. (문서) Design §11.1/§11.2 — Storage 업로드 Phase 이동
4. (문서) §4.1 title/error/side-effect 갱신
5. (문서) §4.2 reason 필드 추가
6. (문서) §7 UI Component Map 갱신

예상 결과 Match Rate: 95%+

---

## 8. 후속 진행 (2026-05-22 ~ 2026-05-26)

분석 이후 추가 구현된 항목 — 차기 Gap Analysis에서 §4·§7 갱신 필요.

### 8.1 모바일 UX 폴리시

| 항목 | 위치 | 메모 |
|------|------|------|
| 곡 상세 모바일 풀스크린 (상단만, 미니바/BottomNav 가시) | `components/SongDetailPage.tsx` | `fixed inset-x-0 top-0 bottom-[calc(156px+env(safe-area-inset-bottom,0px))] z-[55]` |
| 커버 자연 페이드 | `components/SongDetailPage.tsx` | `mask-image` (검정 그라데이션 div 회피) |
| 사운드 웨이브 → 제목 좌측 (모바일) | `components/SongDetailPage.tsx` | `SoundWaveIcon size={18}` |
| 액션 버튼(좋아요 등) 활성 = 흰 바탕 + 검정 아이콘 | `components/SongDetailPage.tsx` ActionBtn | 리스트 패턴과 통일 |
| 헤더 자동 숨김 시도 → 롤백 | (제거됨) | `hooks/useShellScroll.ts` 삭제. 상단 고정 유지 |
| 탐색 캐러셀 좌우 화살표 모바일 숨김 | `features/explore/components/SectionCarousel` | — |
| 미니바 상단 인터랙티브 프로그레스 | `components/GlobalMiniBar.tsx` | tap/drag seek |
| iOS 안전영역 + viewport-fit=cover | `app/layout.tsx`, `globals.css` | 흰 띠 제거 |

### 8.2 공유 deep link

- `utils/shareUrl.ts:buildSongShareUrl` → `${origin}/?song={id}`
- shell layout(`app/(main)/layout.tsx`)에서 `?song=` 쿼리 감지 → `exploreService.getPublicSongById()` fetch → `view-song` 디스패치 + 쿼리 정리
- `services/explore.service.ts:getPublicSongById` 신규

### 8.3 이미지 생성 프롬프트 우선순위

- `app/api/generate/route.ts:pickImagePrompt` — 가사(`[...]` 태그 제거, 12자+고유문자 3+) → 제목(2자+) → 스타일 순
- `isMeaningful()`로 "ㅇㄴㅁ" 같은 무의미 입력 차단

### 8.4 프로필 컬러 통일 (avatar hue 전파)

- `utils/profileColor.ts` 신규 — 6색 팔레트 (`PROFILE_PALETTE`)
- `PublicSong`에 `avatarHue`, `avatarUrl` 필드 추가
- `services/explore.service.ts:SONG_SELECT`에 `profiles.avatar_hue, avatar_url` 조인
- `contexts/GlobalPlayerContext` State에 `ownerAvatarHue: number | null` 추가
- `view-song` / `play-song` 이벤트 detail에 `ownerAvatarHue` 포함 — 모든 디스패처(`MyWorkPanel`, `MyCollectionPanel`, `ProfilePanel`, `ExplorePanel`, `useSongGeneration`, `GlobalMiniBar.openDetail`, shell `?song=`)에서 채움
- `SongDetailPage`: `ownerAvatarHue ?? profile?.avatarHue ?? 0` 사용. **viewer의 `user.id`로 fallback 계산 금지** (다른 색 노출 원인)
- `AuthProvider.AuthProfile`에 `avatarHue` 포함 (DB `avatar_hue` SELECT)

### 8.5 MiniMax 호환성 분기 (검증된 사실)

- Music 2.0: `is_instrumental` 미지원, 가사 필수(min 10자) → 사용자가 instrumental 토글 시 Music 2.6-free로 자동 전환 + 토스트
- Music 2.5+/2.6/2.6-free: `is_instrumental` 지원
- 가사 너무 짧으면 클라이언트·서버 둘 다 검증 (10자)
- `translateMinimaxError`로 영문 응답 한국어화

### 8.6 차기 Gap Analysis 시 갱신 필요 항목

- Design §4.1 (POST /api/generate): `pickImagePrompt` 로직 + Storage 업로드 (이미 §11.1로 이동 권장됨)
- Design §7 UI Component Map: `SongDetailPage` 풀스크린 구조, `profileColor` util, `shareUrl` util
- Design §11.1 Decision Record: 11번 이후 신규 결정(avatar hue 전파, deep link 패턴, mask 페이드, 헤더 자동숨김 반려) 추가
- Plan Success Criteria: 모바일 폴리시 / 공유 링크 / 아바타 통일 항목 ✅ Met 마킹

---

## 9. 2026-06-01 재분석 — Phase 3·4 완료 후

> 본 절은 2026-05-22 이후 추가·완료된 Phase 3·4 범위까지 포함한 갱신. 정식 `/pdca analyze` 실행이 아닌 누적 변경 회고. 정밀 매치는 차후 별도 분석 회차에서.

### 9.1 Phase 3 (Supabase 곡 DB·Storage·백그라운드 생성) — Match 추정 100%

- ✅ `songs` 테이블 마이그레이션 완료 (010·011 등) — Design Phase 3 Forward Compatibility(§10) 명세와 일치
- ✅ MiniMax 24h URL → Supabase Storage `songs/{userId}/{songId}.{ext}` 영속화
- ✅ `songService` Supabase 재작성 + `isLoaded()` 노출 + cache 동기 반환
- ✅ 백그라운드 생성 (Suno parity) — `/api/generate` after()로 비동기 + Realtime UPDATE 구독
- ✅ `SongRealtimeBridge` — payload.old PK만 함정 해결로 클라이언트 캐시 기준 비교

### 9.2 Phase 4 (소셜·SEO·UX) — Match 추정 95%+

| 범위 | 완료 |
|---|---|
| 알림·좋아요·팔로우 (010 마이그레이션, social-actions feature archived) | ✅ |
| AI 가사 생성 + 심플 모드 (013 마이그레이션) | ✅ |
| 댓글 시스템 (014·015·016·017 마이그레이션) | ✅ (017 수동 적용 예정) |
| ⋮ 메뉴 통합 + 게시 액션 재배치 | ✅ |
| SEO (metadata·robots·sitemap·JSON-LD·OG·logo) | ✅ |
| Vercel Primary swap (non-www) | ✅ |
| Skeleton 로딩 UI (4 패널) | ✅ |
| Google Search Console verify | ✅ |
| Naver Search Advisor verify | ✅ (sitemap 제출 완료, 색인 대기) |

### 9.3 신규 결정 기록 (§4 Decision Record 보강)

| # | Decision | Outcome |
|---|---|---|
| 12 | 백그라운드 생성 = DB 단일 소스 (generation.store 제거) | 채택 — 페이지 이동에도 진행 표시 |
| 13 | 카운트 트리거는 `SECURITY DEFINER` (좋아요·댓글) | 필수 — RLS 우회 위해 |
| 14 | 댓글 카운트는 top-level만 집계 | 채택 — `comments_select` 카운트와 일치 |
| 15 | 곡 표면 액션 행 간소화 → ⋮ 메뉴 통합 | 채택 — 컬렉션·게시·저장이 모두 ⋮ 안 |
| 16 | 게시됨 pill: 리스트 유지·상세 제거 | 채택 — 컨텍스트별 가치 다름 |
| 17 | canonical = non-www, Vercel Primary도 non-www | 채택 — 307 vs 308 SEO 함정 해결 |
| 18 | 공개 곡 sitemap 제외 | 채택 — duplicate content 회피 (`?song=` 쿼리는 오버레이) |
| 19 | OG 이미지는 1200×630, 검색 favicon은 정사각 512×512 | 채택 — 용도별 분리 |
| 20 | skeleton은 아이템 모양 정밀 mimics, 일반 직사각형 X | 채택 — 콘텐츠 점프 방지 |

### 9.4 Gap List 갱신

#### Critical (없음)
운영 영향이 큰 Critical gap 없음. 1차 Free 정책 + Phase 4 모두 정상 동작.

#### Important
| Gap | 영역 | 해결 방안 |
|---|---|---|
| 마이그레이션 017 수동 적용 미완 | DB | SQL Editor에서 `017_songs_comment_count.sql` 실행 |
| publishCoverImage 미저장 버그 | song.service patchToRow | 매핑·DB 컬럼 추가 |
| Vercel "DNS Change Recommended" 노란 뱃지 | DNS | 권장사항 검토 후 Route 53 반영 (선택) |

#### Minor / Future
- 곡 상세 SEO 미적용 (`?song=` 쿼리 오버레이 한계 — `/song/[id]` 라우트 신설 시 sitemap 확장)
- 결제 인프라 미연동 (Plus·Pro 가격 확정 대기)
- 실시간 부분 재생 (MediaSource + MiniMax stream 응답 포맷 미공개)

### 9.5 Phase 4 새 함정 (메모리 `feedback_code_pitfalls.md` 동기화)

1. SONG_SELECT 누락 — public 뷰 컬럼 silent drop
2. 트리거 SECURITY DEFINER 필수 — 좋아요·댓글 카운트
3. Realtime payload.old엔 PK만
4. rowToPatch 필드 미러링 누락
5. Apple Team ID `Y5K8ACM8PL` B/8 혼동
6. Naver=Email 프로바이더 (자체 OAuth)
7. Vercel webhook 권한 (GitHub App 업데이트 대기)
8. **Vercel 307 vs 308 SEO 함정** (신규) — Primary 아닌 도메인 307을 Naver 봇이 안 따라감
9. **uploadProfileImage 고정 경로 + upsert** — 저장 시점 트랜잭션 필요하면 objectURL 미리보기

### 9.6 다음 분석 회차 권장 항목

- 댓글 시스템 단독 `/pdca analyze comments` (Design 정밀 매치 → Match Rate 산출)
- 백그라운드 생성 단독 `/pdca analyze` (Realtime + after() 흐름의 Functional Depth)
- SEO 색인 결과 추적 (Google·Naver 색인 페이지 수, 검색 노출 키워드)
- 운영 메트릭 — DAU·생성 곡 수·게시 비율·댓글 수·평균 응답 시간
