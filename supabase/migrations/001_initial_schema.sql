-- ============================================================
-- 오늘의 노래 — Initial Schema
-- ============================================================

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username        text UNIQUE NOT NULL,
  display_name    text NOT NULL,
  bio             text,
  avatar_hue      smallint DEFAULT 0,
  follower_count  integer DEFAULT 0,
  following_count integer DEFAULT 0,
  song_count      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- songs
CREATE TABLE IF NOT EXISTS songs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  title           text,
  prompt          text NOT NULL,
  genre           text,
  mood            text,
  style_prompt    text,
  instrumental    boolean DEFAULT false,
  lyrics          text,
  audio_url       text,
  cover_hue       smallint DEFAULT 0,
  duration        integer,
  is_public       boolean DEFAULT false,
  publish_comment text,
  like_count      integer DEFAULT 0,
  play_count      integer DEFAULT 0,
  is_new          boolean DEFAULT true,
  liked           boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  published_at    timestamptz
);

-- follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id   uuid REFERENCES profiles ON DELETE CASCADE,
  following_id  uuid REFERENCES profiles ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

-- likes
CREATE TABLE IF NOT EXISTS likes (
  user_id    uuid REFERENCES profiles ON DELETE CASCADE,
  song_id    uuid REFERENCES songs ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes    ENABLE ROW LEVEL SECURITY;

-- profiles: 전체 읽기, 본인만 수정
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- songs: public 또는 본인 소유만 읽기
CREATE POLICY "songs_select" ON songs FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "songs_insert" ON songs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "songs_update" ON songs FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "songs_delete" ON songs FOR DELETE
  USING (auth.uid() = user_id);

-- follows: 전체 읽기, 인증 유저만 쓰기
CREATE POLICY "follows_select" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert" ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete" ON follows FOR DELETE
  USING (auth.uid() = follower_id);

-- likes: 전체 읽기, 인증 유저만 쓰기
CREATE POLICY "likes_select" ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Triggers
-- ============================================================

-- 신규 유저 가입 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_hue)
  VALUES (
    NEW.id,
    COALESCE(
      split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 4),
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    (floor(random() * 360))::smallint
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- like_count 자동 갱신
CREATE OR REPLACE FUNCTION update_like_count()
RETURNS trigger AS $$
DECLARE target_song_id uuid;
BEGIN
  target_song_id := COALESCE(NEW.song_id, OLD.song_id);
  UPDATE songs
  SET like_count = (SELECT COUNT(*) FROM likes WHERE song_id = target_song_id)
  WHERE id = target_song_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER likes_count_trigger
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_like_count();

-- follower/following_count 자동 갱신
CREATE OR REPLACE FUNCTION update_follow_count()
RETURNS trigger AS $$
DECLARE fing_id uuid; fer_id uuid;
BEGIN
  fing_id := COALESCE(NEW.following_id, OLD.following_id);
  fer_id  := COALESCE(NEW.follower_id,  OLD.follower_id);
  UPDATE profiles
  SET follower_count = (SELECT COUNT(*) FROM follows WHERE following_id = fing_id)
  WHERE id = fing_id;
  UPDATE profiles
  SET following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = fer_id)
  WHERE id = fer_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER follows_count_trigger
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_count();

-- song_count (public 곡만 카운트)
CREATE OR REPLACE FUNCTION update_song_count()
RETURNS trigger AS $$
DECLARE target_user_id uuid;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);
  UPDATE profiles
  SET song_count = (
    SELECT COUNT(*) FROM songs
    WHERE user_id = target_user_id AND is_public = true
  )
  WHERE id = target_user_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER songs_count_trigger
  AFTER INSERT OR UPDATE OF is_public OR DELETE ON songs
  FOR EACH ROW EXECUTE FUNCTION update_song_count();
