-- ============================================================
-- 035_video_cover.sql — 비디오 커버 (MiniMax Hailuo, 비동기 task)
-- Design Ref: docs/02-design/features/video-cover.design.md (§3, 비동기로 수정)
--   MiniMax 영상은 비동기: POST→task_id → query(status) → files/retrieve(url)
--   → songs.video_cover_task_id 추가, 폴링(클라이언트 + cleanup 크론)으로 마무리
-- ============================================================

-- songs: 비디오 커버 메타
ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS video_cover_url          text,
  ADD COLUMN IF NOT EXISTS video_cover_status       text,   -- 'generating' | 'done' | 'failed'
  ADD COLUMN IF NOT EXISTS video_cover_mode         text,   -- 'image_to_video' | 'text_to_video'
  ADD COLUMN IF NOT EXISTS video_cover_prompt       text,
  ADD COLUMN IF NOT EXISTS video_cover_resolution   text,   -- '512P' | '768P' (티어)
  ADD COLUMN IF NOT EXISTS video_cover_task_id       text,   -- MiniMax 비동기 task id
  ADD COLUMN IF NOT EXISTS video_cover_charge        text,   -- 'trial' | 'credit' (환불 분기용)
  ADD COLUMN IF NOT EXISTS video_cover_started_at    timestamptz,  -- 폴링 timeout 기준
  ADD COLUMN IF NOT EXISTS video_cover_generated_at  timestamptz;

-- 진행중 task 폴링/정리용 (cleanup 크론이 stale generating sweep)
CREATE INDEX IF NOT EXISTS songs_video_generating_idx
  ON songs(video_cover_started_at) WHERE video_cover_status = 'generating';

-- profiles: 비디오 체험권 (NOT NULL DEFAULT 1 → 기존·신규 회원 모두 1회 자동 부여)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS video_trial_remaining smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_trial_used_at   timestamptz;

-- Storage 버킷: songs-video-covers (서버 업로드는 service_role로 RLS 우회, 정책은 보강용)
INSERT INTO storage.buckets (id, name, public)
VALUES ('songs-video-covers', 'songs-video-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "songs-video-covers public read" ON storage.objects;
CREATE POLICY "songs-video-covers public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'songs-video-covers');

DROP POLICY IF EXISTS "songs-video-covers owner insert" ON storage.objects;
CREATE POLICY "songs-video-covers owner insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'songs-video-covers' AND auth.uid()::text = split_part(name, '/', 1)
  );

DROP POLICY IF EXISTS "songs-video-covers owner update" ON storage.objects;
CREATE POLICY "songs-video-covers owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'songs-video-covers' AND auth.uid()::text = split_part(name, '/', 1)
  );
