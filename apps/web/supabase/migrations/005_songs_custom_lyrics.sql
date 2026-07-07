-- songs.custom_lyrics 컬럼 추가 (사용자가 직접 입력한 가사)
-- lyrics는 MiniMax가 생성한 가사, custom_lyrics는 사용자가 사전에 직접 작성한 가사
ALTER TABLE songs ADD COLUMN IF NOT EXISTS custom_lyrics text;

