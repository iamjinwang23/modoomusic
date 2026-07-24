-- 065_song_preview_audio.sql
-- 생성 중 실시간 미리 듣기 — MiniMax stream:true 부분 오디오를 주기 업로드해 재생.
--   preview_audio_url: 생성 중에만 채워지는 부분 MP3 URL(?v= 캐시버스트 포함).
--   완곡 완성(status=done) 시 null로 정리. 클라는 status=generating + preview_audio_url로 미리 듣기 노출.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS preview_audio_url text;
