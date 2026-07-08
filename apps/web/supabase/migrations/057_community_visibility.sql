-- ============================================================
-- 057_community_visibility.sql — 커뮤니티 공개/비공개
--   communities.visibility·join_rules
--   community_join_requests(비공개 승인 가입) · community_blocks(강퇴 차단)
--   notifications 타입 3종(신청·승인·거절)
-- 정책: 공개=현행 즉시가입 / 비공개=신청→매니저 승인. 발견 차단 없음.
--   쓰기 전부 라우트(admin). 신규 테이블 SELECT 정책 미부여.
-- ============================================================

-- 1) communities 확장
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','private')),
  ADD COLUMN IF NOT EXISTS join_rules text;

-- 2) 가입 신청/심사 (비공개)
CREATE TABLE IF NOT EXISTS community_join_requests (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rejected')),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_join_requests_pending_idx
  ON community_join_requests(community_id, created_at)
  WHERE status = 'pending';

-- 3) 강퇴 재가입 영구 차단
CREATE TABLE IF NOT EXISTS community_blocks (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- 4) RLS — 신규 테이블: 활성화만, SELECT 정책 미부여(전부 admin 경유)
ALTER TABLE community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_blocks        ENABLE ROW LEVEL SECURITY;

-- 5) 알림 타입 확장 (기존 커뮤니티 알림 + 폐쇄 유지)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like','song_complete','system','follow','comment','credit_charged',
    'community_like','community_comment','community_closing',
    'community_join_request','community_join_approved','community_join_rejected'
  ));
