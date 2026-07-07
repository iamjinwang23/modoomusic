-- ============================================================
-- 015_comments_body_500.sql
-- 댓글 본문 길이 제한 1000 → 500자
-- ============================================================
-- 기존 CHECK 제약 제거 (이름은 환경마다 자동 생성된 값일 수 있음)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.comments'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%char_length(body)%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE comments DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- 500자 초과 기존 본문은 500자로 truncate (위반 row 제거)
UPDATE comments SET body = LEFT(body, 500) WHERE char_length(body) > 500;

-- 새 CHECK 적용
ALTER TABLE comments
  ADD CONSTRAINT comments_body_length CHECK (char_length(body) BETWEEN 1 AND 500);
