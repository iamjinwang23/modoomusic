-- AI 가사 생성 연타 방지 레이트리밋 (크레딧 미소모)
--   last_lyrics_gen_at : 가장 최근 가사 생성 시각
--   prev_lyrics_gen_at : 그 이전(2번째 최근) 생성 시각
-- 규칙: 쿨다운 = now - last < 15s 차단, 1분 2회 = now - prev < 60s 차단
-- 성공 시에만 prev <- 기존 last, last <- now 로 시프트. 일일 리셋 불필요(타임스탬프만).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_lyrics_gen_at timestamptz,
  ADD COLUMN IF NOT EXISTS prev_lyrics_gen_at timestamptz;
