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

## Deferred (다음 사이클 후보)

- SongDetailPage·GlobalMiniBar 좋아요 헬퍼 통합 (책갈피/공개 좋아요 두 의미 정리)
- Realtime 알림 (Supabase Realtime subscribe)
- 알림 UI 그룹핑 ("X님 외 N명")
- 운영자용 시스템 공지 발송 admin UI
