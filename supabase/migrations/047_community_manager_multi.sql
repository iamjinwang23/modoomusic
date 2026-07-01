-- 047_community_manager_multi.sql
-- 관리자(profiles.is_admin)의 다중 커뮤니티 운영 허용.
-- manager_id UNIQUE 제거 → 1인 1개 제한은 앱 레벨(createCommunity)에서 관리자 예외로 처리.
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_manager_id_key;

-- 유니크 인덱스가 사라졌으니 조회용 일반 인덱스 추가 (manager_id 기준 lookup 유지)
CREATE INDEX IF NOT EXISTS communities_manager_idx ON communities(manager_id);
