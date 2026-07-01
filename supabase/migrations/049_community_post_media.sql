-- 049_community_post_media.sql
-- 커뮤니티 글: 다중 이미지(최대 10, webp) + 링크 URL.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS link_url text;
