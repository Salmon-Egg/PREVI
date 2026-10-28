"""지정된 가상 학생 계정만 생성. 비밀번호는 저장소 밖의 파일에만 보관한다."""
import argparse
import json
import os
from pathlib import Path
import secrets

import httpx

from server.config import Settings
from server.scripts.seed_personas import PERSONAS


def all_users(client):
    rows, page = [], 1
    while True:
        r = client.get('/auth/v1/admin/users',params={'page':page,'per_page':100})
        r.raise_for_status()
        batch = r.json()['users']
        rows.extend(batch)
        if len(batch) < 100:
            return rows
        page += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create',action='store_true',help='생략하면 계정 존재 여부만 확인')
    parser.add_argument('--credentials',type=Path,help='저장소 밖에 둘 비밀번호 JSON 파일')
    args = parser.parse_args()
    settings = Settings.from_env()
    key = os.getenv('SUPABASE_SECRET_KEY','').strip()
    if not key:
        raise RuntimeError('서버 전용 키가 필요합니다.')
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':key,'Authorization':'Bearer ' + key},timeout=30) as client:
        existing = {(u.get('email') or '').lower():u for u in all_users(client)}
        if not args.create:
            for sid, name, *_ in PERSONAS:
                print(name, 'exists' if sid + '@skuniv.ac.kr' in existing else 'missing')
            return
        if not args.credentials:
            parser.error('--create requires --credentials')
        path = args.credentials.resolve()
        repo = Path(__file__).resolve().parents[2]
        if path == repo or repo in path.parents:
            raise RuntimeError('비밀번호 파일은 Git 저장소 밖에 지정해 주세요.')
        if path.exists():
            stored = json.loads(path.read_text(encoding='utf-8'))
        else:
            stored = {'students':[{'name':name,'email':sid + '@skuniv.ac.kr',
                'password':None if sid + '@skuniv.ac.kr' in existing else secrets.token_urlsafe(24)} for sid,name,*_ in PERSONAS]}
            # 계정 생성 전에 저장하므로 중간 실패 후에도 같은 비밀번호로 이어서 실행할 수 있다.
            with path.open('x',encoding='utf-8') as file:
                json.dump(stored,file,ensure_ascii=False,indent=2)
        credentials = {entry['email']:entry for entry in stored['students']}
        for sid,name,*_ in PERSONAS:
            email = sid + '@skuniv.ac.kr'
            if email in existing:
                print(name + ': existing account preserved')
                continue
            password = credentials[email]['password']
            if not password:
                raise RuntimeError('가상 계정 비밀번호 파일을 확인해 주세요.')
            r = client.post('/auth/v1/admin/users',json={'email':email,'password':password,'email_confirm':True})
            r.raise_for_status()
            print(name + ': confirmed demo account created (no email sent)')
        print('Credentials saved outside Git; passwords were not printed.')


if __name__ == '__main__':
    main()
