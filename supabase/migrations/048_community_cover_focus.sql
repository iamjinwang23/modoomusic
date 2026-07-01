-- 048_community_cover_focus.sql
-- 커버 초점(상세 배너에서 보일 위치) — CSS object-position/background-position 문자열(예: '50% 30%').
-- 커버 원본은 전체 저장(홈 16:9), 상세 배너(7:2)는 이 초점으로 크롭 위치를 잡음.
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS cover_focus text;
