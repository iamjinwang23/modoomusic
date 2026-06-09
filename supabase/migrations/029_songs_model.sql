-- 곡 생성 모델 정보 저장 (배지 노출용)
-- 기존 곡은 NULL 유지 — 새로 만든 곡부터 model 누적.
-- 'music-2.0' | 'music-2.5+' | 'music-2.6' 중 하나.

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS model text;

CREATE INDEX IF NOT EXISTS songs_model_idx ON songs(model) WHERE model IS NOT NULL;
