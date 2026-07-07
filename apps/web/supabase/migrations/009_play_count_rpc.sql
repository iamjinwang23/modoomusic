-- 곡 재생수 원자적 증가 (race condition 방지)
-- SECURITY DEFINER로 RLS 우회하되, song_id로만 동작 — 권한 누수 없음
CREATE OR REPLACE FUNCTION increment_play_count(song_id uuid)
RETURNS void AS $$
  UPDATE songs SET play_count = play_count + 1 WHERE id = song_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 익명 + 인증 유저 모두 호출 가능
GRANT EXECUTE ON FUNCTION increment_play_count(uuid) TO anon, authenticated;
