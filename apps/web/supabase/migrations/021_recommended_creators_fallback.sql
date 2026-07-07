-- Design Ref: recommended-creators §4.3 — 트렌딩 폴백 추가
-- 020 함수 REPLACE: 7일 풀이 < 8명이면 30일 → 전체 공개 곡 보유자 순으로 확대
-- 스키마 변경 없음 (함수 본문만 교체)

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
    -- 비로그인: 7d → 30d → 전체 폴백
    RETURN QUERY
    WITH trending_pool AS (
      SELECT DISTINCT ON (u.id)
             u.id, u.username, u.display_name, u.avatar_hue, u.avatar_url, u.follower_count,
             u.priority, u.score
      FROM (
        SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
               1 AS priority,
               (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
        FROM profiles p
        JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '7 days'
        GROUP BY p.id
        UNION ALL
        SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
               2 AS priority,
               (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
        FROM profiles p
        JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '30 days'
        GROUP BY p.id
        UNION ALL
        SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
               3 AS priority,
               (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
        FROM profiles p
        JOIN songs s ON s.user_id = p.id AND s.is_public
        GROUP BY p.id
      ) u
      ORDER BY u.id, u.priority  -- 동일 사용자는 가장 좁은 윈도우(7d) 우선
    )
    SELECT t.id, t.username, t.display_name, t.avatar_hue, t.avatar_url, t.follower_count, 2::smallint
    FROM (
      SELECT id, username, display_name, avatar_hue, avatar_url, follower_count
      FROM trending_pool
      ORDER BY priority, score DESC
      LIMIT 30
    ) t
    ORDER BY RANDOM()
    LIMIT 8;
  ELSE
    -- 로그인: 5 + 2 + 1 (트렌딩에도 동일 폴백 적용)
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
      SELECT DISTINCT ON (u.id)
             u.id, u.username, u.display_name, u.avatar_hue, u.avatar_url, u.follower_count,
             u.priority, u.score
      FROM (
        SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
               1 AS priority,
               (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
        FROM profiles p
        JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '7 days'
        WHERE p.id != me
          AND p.id NOT IN (SELECT lc.id FROM liked lc)
          AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = me AND f.following_id = p.id)
        GROUP BY p.id
        UNION ALL
        SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
               2 AS priority,
               (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
        FROM profiles p
        JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '30 days'
        WHERE p.id != me
          AND p.id NOT IN (SELECT lc.id FROM liked lc)
          AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = me AND f.following_id = p.id)
        GROUP BY p.id
        UNION ALL
        SELECT p.id, p.username, p.display_name, p.avatar_hue, p.avatar_url, p.follower_count,
               3 AS priority,
               (SUM(s.like_count) * 2 + SUM(s.play_count) + COUNT(*) * 5) AS score
        FROM profiles p
        JOIN songs s ON s.user_id = p.id AND s.is_public
        WHERE p.id != me
          AND p.id NOT IN (SELECT lc.id FROM liked lc)
          AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = me AND f.following_id = p.id)
        GROUP BY p.id
      ) u
      ORDER BY u.id, u.priority
    ),
    trending AS (
      SELECT t.id, t.username, t.display_name, t.avatar_hue, t.avatar_url, t.follower_count, 2::smallint AS bucket
      FROM (
        SELECT id, username, display_name, avatar_hue, avatar_url, follower_count
        FROM trending_pool
        ORDER BY priority, score DESC
        LIMIT 30
      ) t
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
