-- 051_banned_words.sql
-- 금칙어(사전 필터) — 커뮤니티 게시글·댓글·이름/소개 등에서 차단. 어드민이 관리.
CREATE TABLE IF NOT EXISTS banned_words (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word       text NOT NULL UNIQUE,          -- 정규화 저장(소문자·공백제거)
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE banned_words ENABLE ROW LEVEL SECURITY;
-- 정책 미생성 = 클라이언트 접근 차단. 조회·관리는 서버(service_role)에서만.

-- 기본 시드 (명백한 욕설·비속어·혐오 표현. 부분일치라 오탐 위험 낮은 형태 위주로 선별. 어드민이 계속 확장/조정)
INSERT INTO banned_words (word) VALUES
  -- 시발 계열 + 우회
  ('시발'),('씨발'),('씨빨'),('시발놈'),('씨발놈'),('씨발년'),('시발새끼'),('씨발새끼'),
  ('시펄'),('씨펄'),('시1발'),('씨1발'),('시8'),('씨8'),('ㅅㅂ'),('ㅆㅂ'),('ㅅ발'),('ㅆ발'),
  -- 새끼 계열 (단독 '새끼'는 오탐이라 복합형만)
  ('개새끼'),('개색기'),('개세끼'),('개새기'),('개1새끼'),('새끼야'),('이새끼'),('저새끼'),
  ('개년'),('개자식'),('개놈'),('개같은'),
  -- 병신 계열
  ('병신'),('븅신'),('병신새끼'),('병1신'),('ㅂㅅ'),('ㅄ'),
  -- 지랄/좆 계열
  ('지랄'),('지랄하네'),('ㅈㄹ'),('좆'),('좆같'),('좆까'),('좆밥'),
  -- 기타 비속어
  ('존나'),('존내'),('니미'),('니미럴'),('니애미'),('니애비'),('애미없'),('애비없'),
  ('엠창'),('후레자식'),('창녀'),('창놈'),('쌍놈'),('썅'),('썅년'),
  -- 혐오/차별 슬러
  ('짱깨'),('짱개'),('짱께'),('쪽바리'),('쪽발이'),
  -- 성적
  ('딸딸이'),('야동'),
  -- 영어 (cock=cocktail, ass=class 등 오탐 큰 건 제외)
  ('fuck'),('fucking'),('fuckin'),('motherfucker'),('shit'),('bullshit'),('bitch'),
  ('asshole'),('dick'),('pussy'),('cunt'),('faggot'),('nigger'),('nigga'),('slut'),('whore')
ON CONFLICT (word) DO NOTHING;
