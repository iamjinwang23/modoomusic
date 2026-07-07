-- 게시 시점에 사용자가 선택한 별도 커버 이미지(Supabase Storage URL) 저장 컬럼.
-- 코드에는 publishCoverImage 도메인 필드와 PublishModal UI가 이미 존재했으나 DB 컬럼이 없어 저장되지 않던 버그 해결.
-- 일반 cover_image(자동 생성) 위에 우선 노출 (rowToPublicSong: publish_cover_image ?? cover_image).

ALTER TABLE songs ADD COLUMN IF NOT EXISTS publish_cover_image text;
