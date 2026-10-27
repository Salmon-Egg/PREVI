-- SQL Editor에서 실행한 뒤 Authentication > Hooks에서 연결해야 적용됩니다.
begin;

create or replace function public.hook_school_email_only(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
    if email !~ '^[^@[:space:]]+@skuniv[.]ac[.]kr$' then
        return jsonb_build_object('error', jsonb_build_object(
            'http_code', 403,
            'message', '@skuniv.ac.kr 학교 이메일로만 가입할 수 있습니다.'
        ));
    end if;
    return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_school_email_only(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_school_email_only(jsonb) to supabase_auth_admin;

-- 실제 가입이나 이메일 발송 없이 함수의 허용/차단 결과를 검사합니다.
do $$
declare
    email text;
begin
    foreach email in array array['test@skuniv.ac.kr', 'TEST@SKUNIV.AC.KR'] loop
        if public.hook_school_email_only(jsonb_build_object('user', jsonb_build_object('email', email))) <> '{}'::jsonb then
            raise exception '학교 도메인 허용 검사 실패';
        end if;
    end loop;
    foreach email in array array['test@gmail.com', 'test@sub.skuniv.ac.kr', 'test@skuniv.ac.kr.evil.com', 'test@fakeskuniv.ac.kr', 'a@b@skuniv.ac.kr', '@skuniv.ac.kr', 'test@skuniv.ac.kr ', ''] loop
        if public.hook_school_email_only(jsonb_build_object('user', jsonb_build_object('email', email))) #>> '{error,http_code}' is distinct from '403' then
            raise exception '다른 도메인 차단 검사 실패';
        end if;
    end loop;
end;
$$;

commit;
select '학교 이메일 검사 통과. Authentication > Hooks에서 hook_school_email_only를 연결하세요.' as result;
