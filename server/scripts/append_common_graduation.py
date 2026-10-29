"""확인된 2021~2026학번 기준에 계열별 공통 교양 확인 목록 추가. 기본은 미리보기."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path

import httpx

from server.config import Settings
from server.scripts.graduation_catalog import ROOT, RESEARCH
from server.scripts.load_graduation_catalog import all_rows


def additions():
    data=json.loads((RESEARCH/'common_general_education_2026.json').read_text(encoding='utf-8'))
    items=[{'name':g['name']+' — '+' / '.join(g['options']), 'manual':True} for g in data['legacy_groups']]
    items.append({'name':'교양선택: 인문과예술·사회와세계·과학과기술·미래와융합·인성과체육 각 1과목 이상, 합계 15학점 이상', 'manual':True})
    items.append({'name':'교양 이수면제·대체재수강 인정은 포탈 확인. World English 1·2는 2026년 8월부터 필수 제외, 교양 전체 33학점은 유지', 'manual':True})
    return data,items


def items_for(row):
    data,legacy=additions()
    if row['admission_year'] in data['legacy_years']:
        return legacy
    catalog=json.loads((RESEARCH/'graduation_catalog_2026.json').read_text(encoding='utf-8'))
    entry=next((e for e in catalog['departments'] if e['name']==row['department']),None)
    if row['admission_year'] not in (2025,2026) or not entry or entry['group'] not in ('future','unassigned','standard','sports'):
        return []
    future=entry['group'] in ('future','unassigned')
    courses=['창의문제해결프로젝트','미래리더를위한대인관계','College English 1','College English 2','Life Care Design','Communication']
    if future:courses+=['전공탐색세미나','진로설계세미나','멘토링 1','멘토링 2']
    items=[{'name':'교양필수 확인: '+c,'manual':True} for c in courses]
    items.append({'name':f"교양선택 5개 영역 각각 1과목 이상, 합계 {15 if future else 18}학점 이상. 교양 전체 {37 if future else 32}학점 및 영어 이수면제·대체 인정은 별도 확인",'manual':True})
    return items


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup-dir',type=Path)
    args=parser.parse_args()
    data,items=additions()
    if not args.apply:
        print(json.dumps({'legacy_years':data['legacy_years'],'legacy_manual_items':len(items),
            'new_years':[2025,2026],'new_scope':'확인된 미래융합·일반 계열만, 외국인 전담학과 제외','source':data['source_url']},ensure_ascii=False));return
    if not args.backup_dir:
        parser.error('--apply requires --backup-dir')
    backup=args.backup_dir.resolve()
    if backup==ROOT or ROOT in backup.parents:
        raise RuntimeError('백업 폴더는 저장소 밖에 지정해 주세요.')
    settings=Settings.from_env();secret=os.environ['SUPABASE_SECRET_KEY']
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':secret,'Authorization':'Bearer '+secret},timeout=30) as db:
        rows=all_rows(db,'grad_requirements',admission_year='in.(2021,2022,2023,2024,2025,2026)')
        backup.mkdir(parents=True,exist_ok=True)
        path=backup/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'-common-requirements-before.json')
        path.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
        changed=0
        for row in rows:
            old=row['required_courses'];names={x['name'] for x in old}
            names.update(x['details'] for x in old if isinstance(x.get('details'),str))
            extra=[x for x in items_for(row) if x['name'] not in names]
            if not extra:continue
            # 다른 수정이 들어간 행은 덮어쓰지 않고 멈춘다.
            response=db.patch('/rest/v1/grad_requirements',params={'id':'eq.'+str(row['id']),
                'required_courses':'eq.'+json.dumps(old,ensure_ascii=False,separators=(',',':'))},
                headers={'Prefer':'return=representation'},json={'required_courses':old+extra})
            response.raise_for_status()
            if len(response.json())!=1:
                raise RuntimeError('동시 변경을 발견했습니다. 현재 기준을 다시 확인해 주세요.')
            changed+=1
        print(json.dumps({'rules_checked':len(rows),'rules_updated':changed,'source':data['source_url']},ensure_ascii=False))


if __name__=='__main__':main()
