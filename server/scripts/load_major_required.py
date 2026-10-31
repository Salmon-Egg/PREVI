"""요람에서 확인한 학과별 전공 필수 과목을 졸업 기준에 추가. 기본은 미리보기, 쓰기는 --apply."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path

import httpx

from server.config import Settings
from server.logic.graduation import normalized_name
from server.scripts.graduation_catalog import RESEARCH, ROOT
from server.scripts.load_graduation_catalog import all_rows


def entries():
    return json.loads((RESEARCH / 'major_required_courses.json').read_text(encoding='utf-8'))['entries']


def merged(row, items):
    """전공 과목을 교양 앞에 둠. 이미 있는 이름은 두 번 넣지 않아 다시 실행해도 그대로."""
    old = row['required_courses']
    names = {normalized_name(c['name']) for c in old}
    extra = []
    for entry in items:
        if entry['department'] == row['department'] and row['admission_year'] in entry['years']:
            extra += [{'name': c} for c in entry['courses'] if normalized_name(c) not in names]
            if entry.get('note') and normalized_name(entry['note']) not in names:
                extra.append({'name': entry['note'], 'manual': True})
    return extra + old


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup-dir', type=Path)
    args = parser.parse_args()
    if args.apply and not args.backup_dir:
        parser.error('--apply requires --backup-dir')
    settings = Settings.from_env()
    secret = os.environ['SUPABASE_SECRET_KEY']
    items = entries()
    with httpx.Client(base_url=settings.supabase_url, headers={'apikey': secret, 'Authorization': 'Bearer ' + secret}, timeout=30) as db:
        rows = all_rows(db, 'grad_requirements')
        changes = [(row, merged(row, items)) for row in rows]
        changes = [(row, new) for row, new in changes if new != row['required_courses']]
        covered = {(e['department'], y) for e in items for y in e['years']}
        missing = sorted(covered - {(r['department'], r['admission_year']) for r in rows})
        print(json.dumps({'rules': len(rows), 'rules_to_update': len(changes), 'not_in_database': missing}, ensure_ascii=False))
        if not args.apply:
            return
        backup = args.backup_dir.resolve()
        if backup == ROOT or ROOT in backup.parents:
            raise RuntimeError('백업 폴더는 저장소 밖에 지정해 주세요.')
        backup.mkdir(parents=True, exist_ok=True)
        path = backup / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '-major-required-before.json')
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        for row, new in changes:
            # 다른 수정이 들어간 행은 덮어쓰지 않고 멈춘다.
            response = db.patch('/rest/v1/grad_requirements', params={'id': 'eq.' + str(row['id']),
                'required_courses': 'eq.' + json.dumps(row['required_courses'], ensure_ascii=False, separators=(',', ':'))},
                headers={'Prefer': 'return=representation'}, json={'required_courses': new})
            response.raise_for_status()
            if len(response.json()) != 1:
                raise RuntimeError('동시 변경을 발견했습니다. 현재 기준을 다시 확인해 주세요.')
        print(json.dumps({'rules_updated': len(changes), 'backup': str(path)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
