"""새 가상 계정으로 학과별 최소 기준 조회와 검색 자료 읽기 권한을 확인한다."""
import os
import secrets
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app


def check(ok,label):
    if not ok:raise RuntimeError(label)
    print('PASS: ' + label,flush=True)


def main():
    settings=Settings.from_env();secret=os.getenv('SUPABASE_SECRET_KEY','')
    if not secret:raise RuntimeError('Missing server key')
    uid=None
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':secret,'Authorization':'Bearer '+secret},timeout=30) as db:
        try:
            email,password='codex-catalog-' + uuid4().hex + '@skuniv.ac.kr',secrets.token_urlsafe(32)
            r=db.post('/auth/v1/admin/users',json={'email':email,'password':password,'email_confirm':True})
            r.raise_for_status();uid=r.json()['id']
            r=db.post('/auth/v1/token',params={'grant_type':'password'},headers={'apikey':settings.publishable_key,'Authorization':'Bearer ' + settings.publishable_key},json={'email':email,'password':password})
            r.raise_for_status();headers={'Authorization':'Bearer ' + r.json()['access_token']}
            with TestClient(create_app(settings)) as api:
                for department,year,total,major,general in (
                    ('컴퓨터소프트웨어전공',2025,130,60,37),
                    ('헤어디자인학과',2025,120,48,32),
                    ('경영학부',2024,120,48,33),
                    ('스포츠앤테크놀로지학과',2024,120,60,33),
                    ('글로벌관광경영학과',2026,120,48,33),
                    ('컴퓨터공학과',2021,120,48,33),
                ):
                    r=api.put('/me',headers=headers,json={'department':department,'admission_year':year,'grade':2,'semester':2})
                    check(r.status_code==200,'temporary profile saved')
                    r=api.get('/graduation',headers=headers)
                    check(r.status_code==200,'graduation API supports cohort ' + str(year))
                    value=r.json();areas={a['name']:a['required'] for a in value['areas']}
                    check(value['required_total']==total and areas['전공']==major and areas['교양']==general,'correct department-specific minima')
                    check(any(r['done'] is None for r in value['requirements']),'manual requirements remain unknown')
                r=api.put('/me',headers=headers,json={'department':'컴퓨터소프트웨어전공','admission_year':2021,'grade':4,'semester':2})
                check(r.status_code==200,'legacy cohort with renamed department saved')
                r=api.get('/graduation',headers=headers)
                check(r.status_code==200,'renamed legacy department no longer blocks graduation screen')
                value=r.json()
                check(value['required_total']==120 and value['remaining_total'] is None,'reference minimum shown without asserting personal remaining credits')
                check(any('기준을 참고' in q['name'] and q['done'] is None for q in value['requirements']),'curriculum review is explicit')
            r=db.get('/rest/v1/documents',headers={'apikey':settings.publishable_key,**headers},params={'kind':'eq.졸업요건','select':'id,title,url','limit':1000})
            check(r.status_code==200 and len(r.json())>=69,'authenticated students can read graduation sources')
            r=db.get('/rest/v1/doc_chunks',headers={'apikey':settings.publishable_key,**headers},params={'document_id':'eq.' + str(r.json()[0]['id']),'select':'id,content'})
            check(r.status_code==200 and len(r.json())>0,'authenticated students can read source chunks')
        finally:
            if uid:
                r=db.delete('/auth/v1/admin/users/'+uid)
                check(r.status_code in (200,204,404),'temporary account deleted')


if __name__=='__main__':main()
