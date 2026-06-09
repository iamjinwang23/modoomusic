-- 018(reinfer_genre)의 R&B/힙합 순서 버그 fix + 토큰 정리 재적용 (extractTags.ts a606435 매칭)
-- 변경:
--   (1) 힙합을 R&B보다 먼저 검사 — 두 키워드 동시 등장 시 힙합 우선
--   (2) 힙합 토큰 보강: trap·드릴
--   (3) R&B에서 단독 'soul'·'소울' 제거(가사 오염 회피), 합성형만 유지
-- 실행 후 결과: 기존에 R&B로 잘못 분류된 힙합 곡들이 '힙합'으로 재이동 → 둘러보기 장르 칩에 힙합 등장.

UPDATE songs s
SET genre = CASE
  -- 1) 특화/세부 라벨 (substring 충돌 회피로 먼저)
  WHEN h ILIKE '%k-pop%' OR h ILIKE '%kpop%' OR h ILIKE '%케이팝%' OR h ILIKE '%케이 팝%' THEN 'K-pop'
  WHEN h ILIKE '%로파이%' OR h ILIKE '%lo-fi%' OR h ILIKE '%lofi%' THEN '로파이'
  WHEN h ILIKE '%트로트%' OR h ILIKE '%trot%' THEN '트로트'
  WHEN h ILIKE '%레게%' OR h ILIKE '%reggae%' THEN '레게'
  WHEN h ILIKE '%가스펠%' OR h ILIKE '%gospel%' OR h ILIKE '%복음%' OR h ILIKE '%ccm%' THEN '가스펠'
  WHEN h ILIKE '%라틴%' OR h ILIKE '%latin%' OR h ILIKE '%salsa%' OR h ILIKE '%살사%' OR h ILIKE '%reggaeton%' OR h ILIKE '%레게톤%' OR h ILIKE '%bachata%' OR h ILIKE '%바차타%' THEN '라틴'
  WHEN h ILIKE '%동요%' OR h ILIKE '%어린이 노래%' OR h ILIKE '%아이 노래%' OR h ILIKE '%children''s song%' OR h ILIKE '%kids song%' OR h ILIKE '%nursery rhyme%' THEN '동요'

  -- 2) 일반 장르
  WHEN h ILIKE '%발라드%' OR h ILIKE '%ballad%' THEN '발라드'
  WHEN h ILIKE '%팝%' OR h ILIKE '%팝송%' OR h ILIKE '%pop%' OR h ILIKE '%city pop%' OR h ILIKE '%citypop%' OR h ILIKE '%synth-pop%' OR h ILIKE '%synthpop%' THEN '팝'
  -- 힙합 (R&B 앞으로 이동 — 'soul'/'소울' 가사 오염 회피)
  WHEN h ILIKE '%힙합%' OR h ILIKE '%랩%' OR h ILIKE '%hip-hop%' OR h ILIKE '%hiphop%' OR h ILIKE '%hip hop%' OR h ILIKE '%rap%' OR h ILIKE '%트랩%' OR h ILIKE '%trap%' OR h ILIKE '%드릴%' OR h ILIKE '%drill%' THEN '힙합'
  -- R&B (단독 'soul'·'소울' 제거 — 합성형으로만 매칭)
  WHEN h ILIKE '%알앤비%' OR h ILIKE '%r&b%' OR h ILIKE '%rnb%' OR h ILIKE '%rhythm and blues%' OR h ILIKE '%neo soul%' OR h ILIKE '%네오 소울%' OR h ILIKE '%soul music%' OR h ILIKE '%소울 음악%' OR h ILIKE '%소울 발라드%' OR h ILIKE '%r-and-b%' OR h ILIKE '%rhythm-and-blues%' THEN 'R&B'
  WHEN h ILIKE '%재즈%' OR h ILIKE '%보사노바%' OR h ILIKE '%jazz%' OR h ILIKE '%bossa%' THEN '재즈'
  WHEN h ILIKE '%포크%' OR h ILIKE '%어쿠스틱%' OR h ILIKE '%folk%' OR h ILIKE '%acoustic%' THEN '포크'
  WHEN h ILIKE '%락%' OR h ILIKE '%록%' OR h ILIKE '%하드락%' OR h ILIKE '%메탈%' OR h ILIKE '%rock%' OR h ILIKE '%hard rock%' OR h ILIKE '%metal%' THEN '락'
  WHEN h ILIKE '%일렉트로닉%' OR h ILIKE '%하우스%' OR h ILIKE '%테크노%' OR h ILIKE '%트랜스%' OR h ILIKE '%덥스텝%' OR h ILIKE '%edm%' OR h ILIKE '%electronic%' OR h ILIKE '%house%' OR h ILIKE '%techno%' OR h ILIKE '%trance%' OR h ILIKE '%dubstep%' THEN '일렉트로닉'
  WHEN h ILIKE '%펑크%' OR h ILIKE '%funk%' OR h ILIKE '%funky%' THEN '펑크'
  WHEN h ILIKE '%디스코%' OR h ILIKE '%disco%' THEN '디스코'
  WHEN h ILIKE '%컨트리%' OR h ILIKE '%country%' THEN '컨트리'
  WHEN h ILIKE '%클래식%' OR h ILIKE '%오케스트라%' OR h ILIKE '%교향곡%' OR h ILIKE '%classical%' OR h ILIKE '%orchestra%' OR h ILIKE '%symphony%' THEN '클래식'

  -- 3) Fallback
  ELSE '기타'
END
FROM (
  SELECT id, concat_ws(' ', prompt, title, lyrics) AS h
  FROM songs
) sub
WHERE s.id = sub.id;

-- 결과 확인용
-- SELECT genre, count(*) FROM songs WHERE is_public = true GROUP BY genre ORDER BY count(*) DESC;
