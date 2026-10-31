-- 장학 판정용 선택 정보. 학생이 챗봇이나 M-4에서 직접 알려 줄 때만 채움 (비우면 '확인 필요'로 판정).
begin;
alter table public.profiles
    add column toeic_score smallint check (toeic_score between 10 and 990),
    add column income_bracket smallint check (income_bracket between 0 and 10),  -- 한국장학재단 소득구간
    add column residence text check (char_length(btrim(residence)) between 1 and 50);
commit;
