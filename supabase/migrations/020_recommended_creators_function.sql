-- Design Ref: recommended-creators §4.3 — Supabase JS 한계로 raw SQL 대신 RPC 함수 신설.
-- 스키마 변경 없음 (테이블·컬럼 추가 X). 로직 함수만 추가.
-- SECURITY DEFINER: profiles/songs/follows RLS와 무관하게 추천 결과 fetch (서비스 측 통제)
--
-- 로그인 시: 개인화 5 (내가 좋아요한 곡 작성자) + 트렌딩 2 (Top30 셔플) + 신규 1 (30일내 가입)
-- 비로그인 시: 트렌딩 Top30에서 8명 셔플

CREATE OR REPLACE FUNCTION public.recommended_creators(me uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_hue smallint,
  avatar_url text,
  follower_count integer,
  bucket smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF me IS NULL THEN
    -- 비로그인: Top30 활동 점수 풀에서 셔플 후 8명
    RETURN QUERY
    SELECT t.id, t.username, t.display_name, t.avatar_hue, t.avatar_url, t.follower_count, 2::smallint
    FROM (
      SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
             (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
      FROM profiles p
      JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '7 days'
      GROUP BY p.id
      ORDER BY score DESC
      LIMIT 30
    ) t
    ORDER BY RANDOM()
    LIMIT 8;
  ELSE
    -- 로그인: 5 + 2 + 1 하이브리드
    RETURN QUERY
    WITH liked AS (
      SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
             1::smallint AS bucket, MAX(l.created_at) AS rank_key
      FROM likes l
      JOIN songs s ON s.id = l.song_id
      JOIN profiles p ON p.id = s.user_id
      WHERE l.user_id = me
        AND s.user_id != me
        AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = me AND f.following_id = s.user_id)
        AND EXISTS (SELECT 1 FROM songs s2 WHERE s2.user_id = p.id AND s2.is_public)
      GROUP BY p.id
      ORDER BY rank_key DESC
      LIMIT 5
    ),
    trending_pool AS (
      SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
             2::smallint AS bucket,
             (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
      FROM profiles p
      JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '7 days'
      WHERE p.id != me
        AND p.id NOT IN (SELECT lc.id FROM liked lc)
        AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = me AND f.following_id = p.id)
      GROUP BY p.id
      ORDER BY score DESC
      LIMIT 30
    ),
    trending AS (
      SELECT t.id, t.username, t.display_name, t.avatar_hue, t.avatar_url, t.follower_count, t.bucket
      FROM trending_pool t
      ORDER BY RANDOM()
      LIMIT 2
    ),
    new_creator AS (
      SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
             3::smallint AS bucket
      FROM profiles p
      WHERE p.created_at > NOW() - INTERVAL '30 days'
        AND p.id != me
        AND p.id NOT IN (SELECT lc.id FROM liked lc)
        AND p.id NOT IN (SELECT tc.id FROM trending tc)
        AND EXISTS (SELECT 1 FROM songs s WHERE s.user_id = p.id AND s.is_public)
        AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = me AND f.following_id = p.id)
      ORDER BY RANDOM()
      LIMIT 1
    )
    SELECT lk.id, lk.username, lk.display_name, lk.avatar_hue, lk.avatar_url, lk.follower_count, lk.bucket FROM liked lk
    UNION ALL
    SELECT tr.id, tr.username, tr.display_name, tr.avatar_hue, tr.avatar_url, tr.follower_count, tr.bucket FROM trending tr
    UNION ALL
    SELECT nc.id, nc.username, nc.display_name, nc.avatar_hue, nc.avatar_url, nc.follower_count, nc.bucket FROM new_creator nc;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recommended_creators(uuid) TO authenticated, anon;
