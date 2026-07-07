-- 프로필 SNS 링크 컬럼 추가 (입력하면 프로필에 아이콘으로 표시)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS link_instagram text,
  ADD COLUMN IF NOT EXISTS link_tiktok    text,
  ADD COLUMN IF NOT EXISTS link_youtube   text,
  ADD COLUMN IF NOT EXISTS link_facebook  text,
  ADD COLUMN IF NOT EXISTS link_x         text;
