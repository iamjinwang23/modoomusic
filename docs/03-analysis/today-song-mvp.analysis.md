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
