"""검증 자료를 기존 grad_requirements/documents/doc_chunks에 추가. 기본값은 dry-run."""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path

import httpx

from server.config import Settings
from server.scripts.graduation_catalog import ROOT, validate


def all_rows(db,table,**params):
    rows=[]
    while True:
        response=db.get('/rest/v1/' + table,params={'select':'*','order':'id.asc',**params,'offset':len(rows),'limit':100})
        response.raise_for_status()
        page=response.json()
        rows.extend(page)
        if len(page)<100:return rows


def install(db,rules,docs):
    stats={'rules_added':0,'rules_preserved':0,'documents_added':0,'chunks_added':0,'chunks_preserved':0}
    # 기존 확인 행은 덮어쓰지 않고 새로운 학과·학번만 추가한다.
    response=db.post('/rest/v1/grad_requirements',params={'on_conflict':'department,admission_year'},
        headers={'Prefer':'resolution=ignore-duplicates,return=representation'},json=rules)
    response.raise_for_status()
    stats['rules_added']=len(response.json())
    stats['rules_preserved']=len(rules)-stats['rules_added']
    managed=[]
    for doc in docs:
        found=all_rows(db,'documents',title='eq.' + doc['title'])
        if len(found)>1:raise RuntimeError('같은 자료명이 여러 개 있습니다: ' + doc['title'])
        if found:
            stored=found[0]
            if stored['url']!=doc['url']:raise RuntimeError('기존 자료의 출처 변경은 별도 확인이 필요합니다.')
        else:
            response=db.post('/rest/v1/documents',headers={'Prefer':'return=representation'},json={k:doc[k] for k in ('title','url','kind')})
            response.raise_for_status();stored=response.json()[0];stats['documents_added']+=1
        managed.append(stored['id'])
        existing=all_rows(db,'doc_chunks',document_id=f"eq.{stored['id']}")
        old={c['content'] for c in existing}
        expected=set(doc['contents'])
        if old-expected:
            raise RuntimeError('기존 문단은 삭제하지 않고 중지합니다. 자료 개정을 확인해 주세요.')
        missing=[{'document_id':stored['id'],'content':text} for text in doc['contents'] if text not in old]
        stats['chunks_preserved']+=len(existing)
        if missing:
            response=db.post('/rest/v1/doc_chunks',json=missing)
            response.raise_for_status();stats['chunks_added']+=len(missing)
    return stats,managed


def embed_managed(db,ids):
    # 기존 요람·장학 자료를 다시 적재하거나 삭제하지 않고 추가분의 빈 임베딩만 처리한다.
    from server.ai import client
    if client.AI_FAKE or not client.EMBED_MODEL:
        raise RuntimeError('실제 임베딩 모델 설정이 필요합니다. AI_FAKE=1에서는 색인하지 않습니다.')
    count=0
    for identifier in ids:
        rows=all_rows(db,'doc_chunks',document_id=f'eq.{identifier}',embedding='is.null')
        doc=all_rows(db,'documents',id=f'eq.{identifier}')[0]
        for start in range(0,len(rows),32):
            part=rows[start:start+32]
            vectors=client.embed([client.doc_text(doc['title'],r['content']) for r in part])
            if not vectors or len(vectors)!=len(part) or any(len(v)!=768 or any(not math.isfinite(x) for x in v) for v in vectors):
                raise RuntimeError('768차원 임베딩 결과의 개수·값을 확인해 주세요.')
            for row,vector in zip(part,vectors):
                response=db.patch('/rest/v1/doc_chunks',params={'id':f"eq.{row['id']}"},json={'embedding':str(vector)})
                response.raise_for_status();count+=1
    return count


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--embed',action='store_true',help='GPU PC의 실제 모델로 신규 자료의 빈 임베딩만 채움')
    parser.add_argument('--backup-dir',type=Path)
    parser.add_argument('--department',help='지정 학과의 기준·문서만 선택. 다른 학과는 변경하지 않음')
    args=parser.parse_args()
    rules,docs=validate()
    if args.department:
        rules=[r for r in rules if r['department']==args.department]
        docs=[d for d in docs if d['title'].endswith(' · ' + args.department)]
        if not rules or not docs:
            parser.error('해당 학과의 확인된 기준과 문서가 모두 있어야 합니다.')
    print(json.dumps({'planned_rules':len(rules),'planned_documents':len(docs),'planned_chunks':sum(len(d['contents']) for d in docs)},ensure_ascii=False))
    if not args.apply:return
    if not args.backup_dir:parser.error('--apply requires --backup-dir outside Git')
    backup=args.backup_dir.resolve()
    if backup==ROOT or ROOT in backup.parents:raise RuntimeError('백업 폴더는 Git 저장소 밖에 지정해 주세요.')
    backup.mkdir(parents=True,exist_ok=True)
    settings=Settings.from_env();secret=os.getenv('SUPABASE_SECRET_KEY','').strip()
    if not secret:raise RuntimeError('서버 전용 키가 필요합니다.')
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':secret,'Authorization':'Bearer ' + secret},timeout=40) as db:
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        before=all_rows(db,'grad_requirements')
        (backup/(stamp+'-graduation-rules-before.json')).write_text(json.dumps(before,ensure_ascii=False,indent=2),encoding='utf-8')
        stats,ids=install(db,rules,docs)
        stats['managed_document_ids']=ids
        stats['embedded']=embed_managed(db,ids) if args.embed else 0
        stats['embedding_pending']=sum(len(all_rows(db,'doc_chunks',document_id=f'eq.{i}',embedding='is.null')) for i in ids)
        (backup/(stamp+'-load-report.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(stats,ensure_ascii=False))


if __name__=='__main__':main()
