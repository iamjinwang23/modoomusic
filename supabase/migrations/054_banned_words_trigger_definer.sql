-- 054_banned_words_trigger_definer.sql
-- check_banned_words()가 SECURITY INVOKER(기본값)라 클라이언트 직접 UPDATE(profiles/songs) 시
-- banned_words 조회가 RLS(정책 0개)에 막혀 0행 → 검사가 조용히 통과되던 문제 수정.
-- (016_comment_like_trigger_definer와 동일 패턴: SECURITY DEFINER + search_path 고정)
CREATE OR REPLACE FUNCTION public.check_banned_words() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
