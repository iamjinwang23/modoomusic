-- 052_banned_words_trigger.sql
-- 클라이언트 직접 쓰기 경로(곡 제목·공개 코멘트, 프로필 이름·소개)는 라우트 검사가 안 닿으므로 DB 트리거로 차단.
-- 사용자 편집(UPDATE)만 검사 — 생성/가입(INSERT)은 AI·OAuth 값이라 제외(오탐으로 인한 생성·가입 실패 방지).
CREATE OR REPLACE FUNCTION public.check_banned_words() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  combined text;
  hit text;
BEGIN
  IF TG_TABLE_NAME = 'songs' THEN
    combined := lower(regexp_replace(coalesce(NEW.title,'') || ' ' || coalesce(NEW.publish_comment,''), '\s', '', 'g'));
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    combined := lower(regexp_replace(coalesce(NEW.display_name,'') || ' ' || coalesce(NEW.bio,''), '\s', '', 'g'));
  ELSE
    RETURN NEW;
  END IF;

  IF combined = '' THEN RETURN NEW; END IF;

  SELECT word INTO hit
  FROM banned_words
  WHERE combined LIKE '%' || lower(regexp_replace(word, '\s', '', 'g')) || '%'
  LIMIT 1;

  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'banned_word' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_songs_banned_words ON songs;
CREATE TRIGGER trg_songs_banned_words BEFORE UPDATE OF title, publish_comment ON songs
  FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();

DROP TRIGGER IF EXISTS trg_profiles_banned_words ON profiles;
CREATE TRIGGER trg_profiles_banned_words BEFORE UPDATE OF display_name, bio ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_banned_words();
