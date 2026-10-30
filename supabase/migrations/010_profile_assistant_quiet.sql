-- fe/mvp3: M-5 '비서가 볼 정보'(assistant_scope), M-3 방해 금지 시간(notify.quiet).
begin;
alter table public.profiles
    add column assistant_scope jsonb not null
        default '{"grades": true, "timetable": true, "status": true, "chat_history": true}'
        check (jsonb_typeof(assistant_scope) = 'object'),
    add column notify_quiet text not null default ''
        check (notify_quiet = '' or notify_quiet ~ '^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$');  -- '22:00-07:00', ''=끔
commit;
