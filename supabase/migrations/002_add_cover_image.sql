-- songs 테이블에 cover_image 컬럼 추가 (Supabase Storage 영구 URL)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS cover_image text;
