-- 037_announcement_feature_category.sql
-- 공지 카테고리에 'feature'(새로운 기능) 추가. 기존 CHECK 제약을 교체.
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_category_check;
ALTER TABLE announcements
  ADD CONSTRAINT announcements_category_check
  CHECK (category IN ('notice', 'promotion', 'feature'));
