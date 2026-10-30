"""이미 관리 API로 만든 제출용 두 계정을 이 서버의 허용 목록에 추가한다."""
import argparse
from pathlib import Path
from shutil import copy2
from datetime import datetime

import httpx
from dotenv import dotenv_values, set_key

from server.config import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='생략하면 설정 대상만 확인')
    args = parser.parse_args()
    settings = Settings.from_env()
    if not settings.secret_key:
        raise SystemExit('SUPABASE_SECRET_KEY 설정이 필요합니다.')
    headers = {'apikey': settings.secret_key}
    if settings.secret_key.count('.') == 2:
        headers['Authorization'] = 'Bearer ' + settings.secret_key
    found = {}
    with httpx.Client(base_url=settings.supabase_url, headers=headers, timeout=30) as client:
        for page in range(1, 101):
            response = client.get('/auth/v1/admin/users', params={'page': page, 'per_page': 100})
            response.raise_for_status()
            users = response.json()['users']
            for user in users:
                name = user.get('app_metadata', {}).get('submission_account')
                if name in {'test_admin', 'test_student'} and user.get('email') == name + '@example.com' and user.get('email_confirmed_at'):
                    if name in found:
                        raise SystemExit('제출용 계정이 중복됩니다.')
                    found[name] = user
            if len(users) < 100:
                break
        else:
            raise SystemExit('계정 목록 범위를 초과했습니다.')
    if set(found) != {'test_admin', 'test_student'}:
        raise SystemExit('이 프로젝트에서 제출용 두 계정을 찾지 못했습니다. 설정은 변경하지 않았습니다.')
    print('test_admin: 전체 관리자 / test_student: 학생')
    if args.apply:
        path = Path(__file__).resolve().parents[2] / '.env'
        backup = path.with_name('.env.before-submission-' + datetime.now().strftime('%Y%m%d%H%M%S%f'))
        copy2(path, backup)
        backup.chmod(0o600)
        values = dotenv_values(path)
        admins = {v.strip() for v in (values.get('ADMIN_EMAILS') or '').split(',') if v.strip()}
        demos = {v.strip() for v in (values.get('DEMO_USER_IDS') or '').split(',') if v.strip()}
        admins.add(found['test_admin']['email'])
        demos.update(u['id'] for u in found.values())
        set_key(str(path), 'ADMIN_EMAILS', ','.join(sorted(admins)))
        set_key(str(path), 'DEMO_USER_IDS', ','.join(sorted(demos)))
        path.chmod(0o600)
        print('기존 관리자 유지, 제출용 설정 저장 완료. API 재시작이 필요합니다.')
    else:
        print('미리보기 완료. 저장하려면 --apply를 사용하세요.')


if __name__ == '__main__':
    main()
