"""출시 전 테스트 데이터 정리. 제출용 두 계정만 남기고 처음 설정 상태로 되돌린다. 학교 자료는 건드리지 않는다.
저장소 맨 위 폴더에서:  python -m server.scripts.reset_test_data   (미리보기)
--apply: 저장소 밖에 백업한 뒤 삭제. 실제 사용자가 생긴 뒤에는 실행하면 안 됨 (사용자 데이터도 전부 지움)."""
import argparse
from datetime import datetime
import json
from pathlib import Path

import httpx

from server.config import Settings
from server.scripts.create_demo_accounts import all_users

KEEP = {'test_admin': 'test_admin@example.com', 'test_student': 'test_student@example.com'}
BUCKET = 'lost-items'
# messages·lost_item_tries는 외래 키로 함께 지워진다
DELETE_TABLES = ['unanswered_questions', 'conversations', 'lost_items', 'support_tickets', 'notifications',
                 'scholarship_applications', 'todos', 'eligibility', 'grades', 'timetable', 'profiles']
BACKUP_TABLES = DELETE_TABLES + ['messages', 'lost_item_tries']
SCHOOL_TABLES = ['courses', 'grad_requirements', 'academic_calendar', 'documents', 'doc_chunks']
ADMIN_NOTICES = {'board_post_id': 'like.admin-*'}


def split_accounts(users):
    """(남길 계정, 지울 계정). 제출용 두 계정을 확인하지 못하면 아무것도 지우지 않고 멈춘다."""
    kept = [u for u in users if KEEP.get(u.get('app_metadata', {}).get('submission_account')) == u.get('email')]
    if len(kept) != len(KEEP):
        raise SystemExit('제출용 두 계정을 찾지 못했습니다. 아무것도 지우지 않았습니다.')
    return kept, [u for u in users if u not in kept]


def count(db, table, **filters):
    r = db.get('/rest/v1/' + table, params={'select': '*', 'limit': 0, **filters}, headers={'Prefer': 'count=exact'})
    r.raise_for_status()
    return int(r.headers['content-range'].split('/')[-1])


def all_rows(db, table, **filters):
    rows = []
    while True:
        batch = db.get('/rest/v1/' + table, params={'select': '*', 'limit': 1000, 'offset': len(rows), **filters}).raise_for_status().json()
        rows += batch
        if len(batch) < 1000:
            return rows


def listed(db, prefix):
    return db.post(f'/storage/v1/object/list/{BUCKET}', json={'prefix': prefix, 'limit': 1000}).raise_for_status().json()


def photo_paths(db):
    # 글이 이미 지워져 표에 없는 사진도 남아 있어 표가 아니라 저장소를 기준으로 찾는다 (경로: 사용자id/파일명)
    return [f"{folder['name']}/{file['name']}" for folder in listed(db, '') for file in listed(db, folder['name'])]


def backup(db, users, paths):
    folder = Path(__file__).resolve().parents[3] / ('db_backup_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
    (folder / 'photos').mkdir(parents=True)
    data = {table: all_rows(db, table) for table in BACKUP_TABLES}
    data['notices'] = all_rows(db, 'notices', **ADMIN_NOTICES)
    data['users'] = users
    (folder / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    for path in paths:
        target = folder / 'photos' / path
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(db.get(f'/storage/v1/object/{BUCKET}/{path}').raise_for_status().content)
    return folder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='생략하면 지울 건수만 확인')
    args = parser.parse_args()
    settings = Settings.from_env()
    if not settings.secret_key:
        raise SystemExit('SUPABASE_SECRET_KEY 설정이 필요합니다.')
    headers = {'apikey': settings.secret_key}
    if settings.secret_key.count('.') == 2:
        headers['Authorization'] = 'Bearer ' + settings.secret_key
    with httpx.Client(base_url=settings.supabase_url, headers=headers, timeout=120) as db:
        users = all_users(db)
        kept, removed = split_accounts(users)
        paths = photo_paths(db)
        notices = all_rows(db, 'notices', **ADMIN_NOTICES)
        school = {table: count(db, table) for table in SCHOOL_TABLES}
        school_notices = count(db, 'notices') - len(notices)

        print('프로젝트:', settings.supabase_url)
        print('남길 계정:', [u['email'] for u in kept])
        print('지울 계정:', [u['email'] for u in removed])
        print('지울 공지:', [n['title'] for n in notices])
        print('지울 사진:', len(paths))
        for table in BACKUP_TABLES:
            print(f'지울 {table}: {count(db, table)}')
        print('유지 학교 자료:', school, 'notices', school_notices)
        if not args.apply:
            print('미리보기 완료. 지우려면 --apply를 사용하세요.')
            return

        print('백업:', backup(db, users, paths))
        for table in DELETE_TABLES:
            db.delete('/rest/v1/' + table, params={'user_id': 'not.is.null'}).raise_for_status()
        db.delete('/rest/v1/notices', params=ADMIN_NOTICES).raise_for_status()
        if paths:
            db.request('DELETE', f'/storage/v1/object/{BUCKET}', json={'prefixes': paths}).raise_for_status()
        for user in removed:
            db.delete('/auth/v1/admin/users/' + user['id']).raise_for_status()
        # 제출용 계정의 처음 상태 = 빈 프로필 행 (docs/제출용_계정.md)
        db.post('/rest/v1/profiles', json=[{'user_id': u['id']} for u in kept]).raise_for_status()

        left = {table: count(db, table) for table in BACKUP_TABLES if table != 'profiles'}
        assert not any(left.values()), left
        assert count(db, 'profiles') == len(kept)
        assert {u['id'] for u in all_users(db)} == {u['id'] for u in kept}
        assert not photo_paths(db)
        assert {table: count(db, table) for table in SCHOOL_TABLES} == school
        assert count(db, 'notices') == school_notices
        print('정리 완료. 학교 자료 건수 변동 없음.')


if __name__ == '__main__':
    main()
