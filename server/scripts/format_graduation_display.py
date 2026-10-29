"""졸업 표시 문구 정리. 상세 원문은 required_courses[].details 및 백업에 보존."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path

import httpx

from server.config import Settings
from server.logic.graduation_display import compact_rule
from server.scripts.graduation_catalog import ROOT
from server.scripts.load_graduation_catalog import all_rows


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup-dir',type=Path)
    args=parser.parse_args()
    settings=Settings.from_env();secret=os.environ['SUPABASE_SECRET_KEY']
    with httpx.Client(base_url=settings.supabase_url,headers={'apikey':secret,'Authorization':'Bearer '+secret},timeout=30) as db:
        rows=all_rows(db,'grad_requirements')
        planned=[(r,compact_rule(r)) for r in rows]
        planned=[(r,v) for r,v in planned if any(r[k]!=v[k] for k in v)]
        if not args.apply:
            print(json.dumps({'rules_to_format':len(planned)}));return
        if not args.backup_dir:parser.error('--apply requires --backup-dir')
        backup=args.backup_dir.resolve()
        if backup==ROOT or ROOT in backup.parents:raise RuntimeError('백업은 저장소 밖에 저장해야 합니다.')
        backup.mkdir(parents=True,exist_ok=True)
        path=backup/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'-graduation-display-before.json')
        path.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
        changed=0
        for row,value in planned:
            response=db.patch('/rest/v1/grad_requirements',params={'id':'eq.'+str(row['id']),
                'required_courses':'eq.'+json.dumps(row['required_courses'],ensure_ascii=False,separators=(',',':')),
                'certifications':'eq.'+json.dumps(row['certifications'],ensure_ascii=False,separators=(',',':'))},
                headers={'Prefer':'return=representation'},json=value)
            response.raise_for_status()
            if len(response.json())!=1:raise RuntimeError('동시 변경 감지: 현재 기준을 확인해 주세요.')
            changed+=1
        print(json.dumps({'rules_formatted':changed,'source_details_preserved':True}))


if __name__=='__main__':main()
