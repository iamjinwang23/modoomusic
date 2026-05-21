-- 온보딩 컬럼 추가 (기존 유저는 완료 처리)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_source text,
  ADD COLUMN IF NOT EXISTS onboarding_ai_exp text,
  ADD COLUMN IF NOT EXISTS onboarding_goals text[];

-- display_name NOT NULL 제약 완화 (온보딩에서 설정)
ALTER TABLE profiles ALTER COLUMN display_name DROP NOT NULL;

-- 신규 유저 트리거 업데이트: 이메일 노출 없이 랜덤 username
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  rand_username text := 'mono_';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    rand_username := rand_username || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_hue, onboarding_done)
  VALUES (
    NEW.id,
    rand_username,
    null,
    (floor(random() * 360))::smallint,
    false
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
