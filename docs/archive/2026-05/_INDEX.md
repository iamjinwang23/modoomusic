# 2026-05 Archive Index

## Completed PDCA Cycles

| Feature | Match Rate | Architecture | Path |
|---------|:---:|--------------|------|
| [notifications](notifications/) | 99% | Option C — Pragmatic (API 핸들러 INSERT, shell state, Item 타입 분기, Realtime X) | plan/design/analysis/report |
| [social-actions](social-actions/) | 99% | Option C — Pragmatic (useOptimisticToggle 헬퍼 통일) | plan/design/analysis/report |

## Notable Decisions Carried Over

- **RLS bypass admin client 패턴** (`lib/supabase/admin.ts`) — cookies 없는 service-role 클라이언트. server.ts createClient는 user 컨텍스트라 다른 사람 row UPDATE 차단됨. 모든 신뢰된 서버 INSERT/UPDATE는 admin client 사용
- **알림 폭주 차단 B+C 패턴** — 미읽음 dedupe + 토글 시 미읽음 알림 자동 DELETE (follow API에 적용. like는 UNIQUE INDEX 영구 dedupe)
- **useOptimisticToggle 헬퍼** — 좋아요·팔로우 등 토글 + 낙관 UI + 롤백 + inflight + guard 통일
- **fillIsLiked 후처리** — SONG_SELECT join 대신 song_ids in 1쿼리로 N+1 회피
- **곡 소유자 메타 전파** — `view-song`/`play-song` 이벤트 detail에 `ownerUserId`, `ownerAvatarHue`, `ownerAvatarUrl`, `ownerName` 포함
- **모달 border 통일** — `border-white/[0.10]`로 배경(#171A20)과 시각 구분

## Archive 이후 추가 폴리시 (PDCA 외 작업)

archive 후 같은 세션에서 정리된 항목들 (별도 PDCA 사이클 없이 진행):

| 영역 | 변경 |
|------|------|
| 좋아요 안전성 | SongDetailPage·GlobalMiniBar inflight + 롤백 + isOwner 의미 명확화 주석 (deferred #8 해소) |
| 탐색 칩 | `utils/extractTags.ts` 신규 (12 장르 + 11 무드 사전) + `getAvailableTags` + `getByFilter` inferTags 후처리 |
| 백필 Cron | `/api/cron/backfill-tags` 추가 — nightly NULL 곡 inferTags 채움 (vercel.json crons 2개) |
| 폴리시 | 모달 border 통일 / 곡 상세 스크림 75% / 팔로우 버튼 흰바탕+검정 / 게시하기 상시 노출 / 미니바 padding 2px / 탐색 아이콘 Publish.svg / 크레딧 부족·소진 분기 메시지 / 알림 "모두 읽음" / 90일 자동 정리 Cron |

## 2026-05-27 세션 — UI 폴리시 (재생수·좋아요수 통합 + MarqueeText 수정)

| 영역 | 변경 |
|------|------|
| **재생수·좋아요수 표시** | `Song` 타입에 `playCount?/likeCount?` 추가. `rowToSong`에서 DB 컬럼 매핑. ExplorePanel·ProfilePanel `toSong()`에 두 필드 전달 |
| **cross-view 좋아요 동기화** | `like-updated` 커스텀 이벤트 도입. SongDetailPage·GlobalMiniBar·PublicSongCard에서 dispatch, ExplorePanel·ProfilePanel·MyWorkPanel에서 listen → 같은 곡 좋아요 수치가 어느 뷰에서든 즉시 반영 |
| **내 곡 self-like 허용** | isOwner 분기 제거 — 오너도 public like API 호출. 서버는 이미 self-like 허용(알림만 생략). `GlobalMiniBar`에서 `songService` import 제거 |
| **GlobalMiniBar 수치** | 데스크톱 우측에 재생수 pill + 좋아요수 표시. 모바일 play/pause 원형 제거(아이콘만). 썸네일 w-10→w-9 |
| **SongDetailPage** | 재생수 pill + ActionBtn에 좋아요수. 데스크톱 layout `gap-6` 추가(긴 스타일 텍스트 시 날짜·버튼 붙음 방지). 썸네일 play 애니메이션 좌하단 소형으로 이동. 재생 중 딤 오버레이 제거 |
| **MyWorkPanel (라이브러리)** | `SongWorkItem` 액션 행에 재생수 pill + 좋아요수 pill 추가. `like-updated` 리스너로 세션 내 likeCount 동기화 |
| **MarqueeText 수정** | `marquee-px` + CSS 변수(`var(--marquee-cycle)`) 방식을 keyframe 내 var() 호환성 문제로 폐기 → 기존 `marquee-scroll(-50%)` 방식으로 교체. `requestAnimationFrame` 재측정 추가로 flex layout 미정착 시 오측정 방지. delay 1.2s→0.4s |

## Deferred (다음 사이클 후보)

- Realtime 알림 (Supabase Realtime subscribe)
- 알림 UI 그룹핑 ("X님 외 N명")
- 운영자용 시스템 공지 발송 admin UI
- useOptimisticToggle prop 동기화 race (ref 기반 전환)
- 가사 자동생성 UI (`lyrics-autogen` 후보)
- 검색·댓글·신고·차단 등 소셜 2차
- 결제 인프라 (Plus/Pro)
