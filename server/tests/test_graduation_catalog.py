import json

import httpx

from server.scripts.graduation_catalog import document_rows, rule_rows, validate
from server.scripts.load_graduation_catalog import install


def test_cohort_and_department_specific_minima_are_not_generalized():
    rows,docs=validate()
    rules={(r['department'],r['admission_year']):r for r in rows}
    assert rules['컴퓨터소프트웨어전공',2025]['total_credits']==130
    assert rules['헤어디자인학과',2025]['total_credits']==120
    assert rules['헤어디자인학과',2025]['areas'][1]['required']==32
    assert rules['헤어디자인학과',2024]['areas'][1]['required']==33
    assert rules['스포츠앤테크놀로지학과',2023]['areas'][0]['required']==48
    assert rules['스포츠앤테크놀로지학과',2024]['areas'][0]['required']==60
    assert rules['스포츠앤테크놀로지학과',2025]['total_credits']==130
    assert rules['도시공학과',2024]['areas'][0]['required']==60
    assert ('전자컴퓨터공학과',2022) not in rules
    assert ('컴퓨터소프트웨어전공',2023) not in rules
    assert not any(r['department']=='사이버드론봇학전공' for r in rows)
    assert len(rules)==len(rows)
    assert all(d['url'].startswith('https://') for d in docs)


def test_computer_engineering_2021_is_explicit_and_not_merged_department():
    rules={(r['department'],r['admission_year']):r for r in rule_rows()}
    rule=rules['컴퓨터공학과',2021]
    assert rule['total_credits']==120
    assert [(a['name'],a['required']) for a in rule['areas']]==[('전공',48),('교양',33)]
    assert ('컴퓨터공학과',2022) not in rules
    assert ('전자공학과',2021) not in rules
    assert all(c['manual'] for c in rule['required_courses'])
    assert any('ce.skuniv.ac.kr' in s for s in rule['certifications'])


def test_manual_evidence_is_not_treated_as_automatic_completion():
    rules=rule_rows()
    assert all(r['certifications'] for r in rules)
    assert all(all(c['manual'] for c in r['required_courses']) for r in rules)
    contents='\n'.join(c for d in document_rows() for c in d['contents'])
    assert '2025년 8월 졸업예정자부터 폐지' in contents
    assert '21·22학번' in contents
    assert '통합 전 학과' in contents


def test_loader_is_idempotent_and_preserves_existing_rules_and_vectors():
    rules=rule_rows()[:1]
    original={**rules[0],'id':1,'total_credits':999}
    tables={'grad_requirements':[original],'documents':[],'doc_chunks':[]}
    def handler(request):
        table=request.url.path.split('/')[-1]
        params=request.url.params
        if request.method=='GET':
            rows=tables[table]
            for key,value in params.items():
                if key not in ('select','order','limit','offset'):
                    rows=[r for r in rows if str(r.get(key))==value.removeprefix('eq.')]
            offset=int(params.get('offset',0))
            return httpx.Response(200,json=rows[offset:offset+100])
        assert request.method=='POST'  # 기본 적재는 기존 행을 수정하거나 삭제하지 않는다.
        body=json.loads(request.content)
        if table=='grad_requirements':
            assert request.headers['Prefer'].startswith('resolution=ignore-duplicates')
            return httpx.Response(201,json=[])
        if table=='documents':
            row={'id':len(tables[table])+1,**body}
            tables[table].append(row)
            return httpx.Response(201,json=[row])
        tables[table].extend({'id':len(tables[table])+i+1,**row} for i,row in enumerate(body))
        return httpx.Response(201)
    with httpx.Client(base_url='https://test',transport=httpx.MockTransport(handler)) as db:
        docs=document_rows()[:1]
        stats,ids=install(db,rules,docs)
        assert stats['documents_added']==1
        tables['doc_chunks'][0]['embedding']='existing-vector-do-not-touch'
        stats,again=install(db,rules,docs)
        assert stats['documents_added']==stats['chunks_added']==0
        assert ids==again
        assert tables['grad_requirements'][0]['total_credits']==999
        assert tables['doc_chunks'][0]['embedding']=='existing-vector-do-not-touch'
