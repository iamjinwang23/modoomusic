-- 003의 handle_new_user 트리거 교체가 원격 DB에 적용되지 않아, 001(구) 버전이 계속 활성 상태였음.
-- 증상: 신규 유저가 ① 이메일 접두사 노출 username(enjine_11d2 등), ② onboarding_done=true(컬럼 기본값) →
-- 온보딩 모달이 뜨지 않음. 본 마이그레이션으로 트리거를 확정 재적용.
--
-- 변경점:
--   - username: 이메일 기반 → 랜덤 mono_xxxxxx (이메일 노출 방지)
--   - onboarding_done: 명시적으로 false (신규 가입자 온보딩 노출)
--   - display_name: provider 메타(full_name) 있으면 채우고, 없으면 NULL (온보딩에서 입력)
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
    NEW.raw_user_meta_data->>'full_name',
    (floor(random() * 360))::smallint,
    false
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 트리거가 끊겼을 가능성 대비해 재연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
