# Plan: supabase-infra

**Feature**: Supabase 인프라 연동  
**Date**: 2026-05-20  
**Status**: Plan

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | localStorage + mock 데이터로 동작 중이라 유저 간 데이터 공유, 실 로그인, 진짜 탐색 피드가 불가능 |
| **Solution** | Supabase(Auth + DB + Storage)를 붙여 실 사용자 기반 서비스로 전환하고, 게시 플로우를 신설해 탐색 피드를 실 데이터화 |
| **Function UX Effect** | 로그인 → 내 곡 저장 → 게시하기(코멘트/태그) → 탐색 피드 노출까지 완전한 콘텐츠 라이프사이클 완성 |
| **Core Value** | "만든 곡을 세상에 공유"하는 핵심 소셜 루프의 기술적 기반 마련 |

---

## Context Anchor

| 항목 | 내용 |
|------|------|
| **WHY** | 로그인·공유 없이는 바이럴 루프 불가 — 인프라가 모든 소셜 기능의 전제 조건 |
| **WHO** | 곡을 만들고 탐색 피드에 공유하고 싶은 사용자 |
| **RISK** | RLS 미설정 시 타 유저 데이터 노출 / MiniMax → Storage 파이프라인 실패 시 곡 유실 |
| **SUCCESS** | 로그인 후 곡 생성 → DB 저장 → 게시 → 탐색 피드 노출까지 E2E 동작 |
| **SCOPE** | Auth(Google OAuth) + DB 스키마 + Storage + 게시 플로우. 댓글·알림·결제 제외 |

---

## 1. 요구사항

### 1.1 Auth
- Google OAuth 로그인 (Supabase Auth)
- 로그인 후 `profiles` 자동 생성 (displayName 기본값: Google 이름)
- 로그아웃, 세션 유지 (서버 컴포넌트 호환)
- 미로그인 상태에서도 탐색 피드 열람 가능 (공개 읽기 허용)

### 1.2 DB 스키마

#### `profiles`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid (FK → auth.users) | PK |
| username | text UNIQUE | 자동 생성(email prefix), 수정 가능 |
| display_name | text | Google 이름으로 초기화 |
| bio | text | nullable |
| avatar_hue | int2 | 0–359, 기본 랜덤 |
| follower_count | int4 | 캐시 (trigger 갱신) |
| following_count | int4 | 캐시 |
| song_count | int4 | 캐시 |
| created_at | timestamptz | |

#### `songs`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid | PK |
| user_id | uuid (FK → profiles) | |
| title | text | nullable |
| prompt | text | |
| genre | text | nullable |
| mood | text | nullable |
| style_prompt | text | MiniMax에 보낸 전체 스타일 |
| instrumental | bool | |
| lyrics | text | nullable |
| audio_url | text | Supabase Storage public URL |
| cover_hue | int2 | |
| duration | int4 | seconds, nullable |
| is_public | bool | 기본 false, 게시 시 true |
| publish_comment | text | 게시 시 작성하는 코멘트 |
| like_count | int4 | 캐시 |
| play_count | int4 | 캐시 |
| created_at | timestamptz | |
| published_at | timestamptz | nullable |

#### `follows`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| follower_id | uuid (FK → profiles) | |
| following_id | uuid (FK → profiles) | |
| created_at | timestamptz | |
| PK | (follower_id, following_id) | |

#### `likes`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| user_id | uuid (FK → profiles) | |
| song_id | uuid (FK → songs) | |
| created_at | timestamptz | |
| PK | (user_id, song_id) | |

### 1.3 Storage
- 버킷: `songs` (public)
- 경로: `{user_id}/{song_id}.mp3`
- MiniMax 생성 후 → 서버에서 다운로드 → Supabase Storage 업로드 → DB에 Storage URL 저장

### 1.4 게시(Publish) 플로우
- 내 음악 리스트에서 "게시하기" 버튼 → `PublishModal` 열림
- PublishModal: 코멘트(선택) + 태그(genre/mood 칩, 선택) 입력
- 확인 → `songs.is_public = true`, `published_at = now()`, 코멘트/태그 저장
- 게시 취소 기능: `is_public = false` 복귀
- 탐색 피드: `songs` where `is_public = true` 쿼리

### 1.5 기존 서비스 레이어 교체
- `songService`: localStorage → Supabase DB (동일 인터페이스 유지)
- `exploreService`: mock → Supabase DB public songs (동일 인터페이스 유지)
- 클라이언트: `@supabase/ssr` + `createBrowserClient`
- 서버: `createServerClient` (미들웨어, 서버 액션)

### 1.6 RLS (Row Level Security)
- `profiles`: 전체 읽기 허용 / 본인만 수정
- `songs`: `is_public=true` 전체 읽기 / 본인만 전체 접근 / 수정 권한
- `follows`: 인증 유저만 insert/delete / 전체 읽기
- `likes`: 인증 유저만 insert/delete / 전체 읽기

---

## 2. 제외 범위 (이번 Plan)

- Apple / Kakao OAuth
- 댓글
- 알림
- 구독/결제
- 팔로우 피드 필터 (팔로잉한 사람 곡만 보기)
- localStorage 기존 곡 마이그레이션 (신규 저장분부터 적용)

---

## 3. 성공 기준

| # | 기준 |
|---|------|
| SC-1 | Google OAuth 로그인 → `profiles` 자동 생성 |
| SC-2 | 곡 생성 → Supabase Storage 오디오 저장 → songs DB 저장 |
| SC-3 | 내 음악 리스트 → DB에서 본인 곡 로드 |
| SC-4 | 게시하기 → 탐색 피드에 노출 (is_public=true) |
| SC-5 | 미로그인 상태에서 탐색 피드 열람 가능 |
| SC-6 | 좋아요 → likes 테이블 반영 + like_count 캐시 갱신 |
| SC-7 | 팔로우 → follows 테이블 반영 + count 캐시 갱신 |

---

## 4. 기술 스택

| 항목 | 선택 |
|------|------|
| BaaS | Supabase (Auth + Postgres + Storage) |
| 클라이언트 라이브러리 | `@supabase/ssr`, `@supabase/supabase-js` |
| 인증 | Supabase Auth (Google OAuth) |
| 미들웨어 | Next.js middleware + `createServerClient` (세션 갱신) |
| DB 마이그레이션 | Supabase 대시보드 SQL Editor (또는 `supabase/migrations/`) |
| 오디오 저장 | Supabase Storage `songs` 버킷 |

---

## 5. 구현 순서 (모듈)

| 순서 | 모듈 | 설명 |
|------|------|------|
| M1 | Supabase 프로젝트 + 환경변수 | 프로젝트 생성, `.env.local` 설정 |
| M2 | DB 스키마 + RLS | SQL 마이그레이션, trigger |
| M3 | Auth 미들웨어 + 클라이언트 유틸 | `lib/supabase/`, middleware.ts |
| M4 | Google OAuth 로그인 UI 연결 | LoginModal → Supabase signInWithOAuth |
| M5 | songService 교체 | localStorage → DB + Storage |
| M6 | MiniMax → Storage 파이프라인 | 서버 액션에서 오디오 다운로드 후 Storage 업로드 |
| M7 | exploreService 교체 | mock → DB public songs |
| M8 | 게시하기 플로우 | PublishModal + publish 서버 액션 |
| M9 | 좋아요·팔로우 실 연동 | likes/follows 테이블 write |

---

## 6. 리스크

| 리스크 | 심각도 | 완화 방법 |
|--------|--------|-----------|
| MiniMax → Storage 파이프라인 실패 | High | 서버 액션에서 try/catch + 실패 시 MiniMax URL fallback 저장 |
| RLS 설정 누락 → 데이터 노출 | High | 스키마 작성 직후 RLS enable + 정책 검증 |
| Supabase 콜드 스타트 지연 | Medium | 연결 풀링 확인, 미들웨어 최소화 |
| localStorage 기존 데이터 소실 | Low | 이번 범위에서는 마이그레이션 제외, 신규 저장분부터 적용 |
