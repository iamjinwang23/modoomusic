-- 커뮤니티 소셜 알림(좋아요·댓글·답글) 타입 추가
-- community_like / community_comment — actor_id + payload(url·kind)로 렌더/라우팅. song_id는 null.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'song_complete', 'system', 'follow', 'comment', 'credit_charged',
    'community_like', 'community_comment'
  ));
