"""가상 계정 하나로 DELETE /me와 연결 데이터 삭제를 실제 Supabase에서 검사한다."""
import os
import secrets
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app


def check(ok, label):
    if not ok:
        raise RuntimeError(label)
    print('PASS: ' + label, flush=True)


def main():
    settings = Settings.from_env()
    secret = os.getenv('SUPABASE_SECRET_KEY','')
    if not secret:
        raise RuntimeError('서버 전용 키가 필요합니다.')
    uid, conv_id = None, None
    admin = {'apikey':secret,'Authorization':'Bearer ' + secret}
    with httpx.Client(base_url=settings.supabase_url,headers=admin,timeout=20) as db:
        def insert(table,value):
            r = db.post('/rest/v1/' + table,headers={'Prefer':'return=representation'},json=value)
            r.raise_for_status()
            return r.json()[0]
        try:
            email, password = 'codex-delete-' + uuid4().hex + '@skuniv.ac.kr', secrets.token_urlsafe(32)
            r = db.post('/auth/v1/admin/users',json={'email':email,'password':password,'email_confirm':True})
            r.raise_for_status()
            uid = r.json()['id']
            r = db.post('/auth/v1/token',headers={'apikey':settings.publishable_key,'Authorization':'Bearer ' + settings.publishable_key},
                        params={'grant_type':'password'},json={'email':email,'password':password})
            r.raise_for_status()
            token = r.json()['access_token']
            insert('profiles',{'user_id':uid,'nickname':'탈퇴검사','department':'소프트웨어학과','admission_year':2023,'grade':2,'semester':2})
            insert('grades',{'user_id':uid,'term':'2-1','course_name':'가상과목','credits':3,'grade':'A0','area':'전공'})
            todo = insert('todos',{'user_id':uid,'type':'deadline','title':'가상 할 일'})
            conv_id = insert('conversations',{'user_id':uid,'title':'가상대화'})['id']
            message = insert('messages',{'conversation_id':conv_id,'role':'user','text':'가상질문'})
            insert('unanswered_questions',{'user_id':uid,'message_id':message['id'],'question':'가상질문'})
            insert('notifications',{'user_id':uid,'type':'deadline','title':'가상알림','target_id':todo['id']})
            with TestClient(create_app(settings)) as app:
                check(app.delete('/me').status_code == 401,'missing login cannot delete')
                r = app.delete('/me',headers={'Authorization':'Bearer ' + token})
                check(r.status_code == 204,'authenticated DELETE /me succeeds')
                check(app.get('/me',headers={'Authorization':'Bearer ' + token}).status_code == 401,'deleted account cannot use API')
            for table in ('profiles','grades','todos','conversations','unanswered_questions','notifications'):
                r = db.get('/rest/v1/' + table,params={'user_id':'eq.' + uid,'select':'id'})
                check(r.status_code == 200 and r.json() == [],'personal data deleted: ' + table)
            r = db.get('/rest/v1/messages',params={'conversation_id':f'eq.{conv_id}','select':'id'})
            check(r.status_code == 200 and r.json() == [],'conversation messages deleted')
            r = db.get('/auth/v1/admin/users/' + uid)
            check(r.status_code == 404,'authentication account deleted')
            uid = None
        finally:
            if uid:
                r = db.delete('/auth/v1/admin/users/' + uid)
                check(r.status_code in (200,204,404),'temporary account cleaned up')


if __name__ == '__main__':
    main()
