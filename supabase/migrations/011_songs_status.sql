-- Suno parity: 백그라운드 생성 패턴
--   generating : API가 row INSERT 후 백그라운드로 MiniMax+Storage 처리 중
--   done       : MiniMax 완료 + Storage 영구화 완료 (재생 가능)
--   failed     : 생성 실패 (크레딧은 이미 환불됨)
-- 기존 row는 전부 done (DEFAULT). 클라이언트는 status !== 'done' 곡은 재생 불가 처리.
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
  CHECK (status IN ('generating', 'done', 'failed'));

-- 좀비 generating row를 cleanup cron이 빠르게 찾을 수 있도록 부분 인덱스
CREATE INDEX IF NOT EXISTS songs_generating_created_idx
  ON public.songs (created_at)
  WHERE status = 'generating';

-- generating 상태에서는 audio_url이 빈 문자열일 수 있으므로 NOT NULL 제약 완화
-- (기존 done row는 모두 채워져 있으니 호환 OK)
ALTER TABLE public.songs ALTER COLUMN audio_url DROP NOT NULL;

-- Realtime 활성화: 클라이언트가 status 변화 구독 (generating → done/failed)
ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
