"""출처를 검토한 졸업 자료를 기존 DB 표 모양으로 변환한다. 학과명을 임의 치환하지 않는다."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'supabase' / 'research'
FILES = ('graduation_catalog_2026.json','graduation_catalog_legacy_2024.json')


def catalogs():
    return [json.loads((RESEARCH / filename).read_text(encoding='utf-8')) for filename in FILES]


def years_for(entry):
    if 'years' in entry:
        return entry['years']
    group = entry['group']
    if group in ('future','unassigned'):
        return [2025,2026]
    if group == 'standard':
        return [2023,2024,2025,2026] if entry.get('legacy_confirmed') else [2025,2026]
    if group == 'sports':
        return [2023,2024,2025,2026]
    if group == 'international':
        return [2026]
    if group in ('legacy','legacy_language','legacy_international'):
        return [2023,2024]
    return []


def minimum_rule(entry, year):
    if year not in years_for(entry):
        raise ValueError('확인하지 않은 입학년도입니다.')
    group = entry['group']
    if group in ('future','unassigned'):
        total, major, general = 130,60,37
    elif group == 'sports':
        total,major,general = (120,48,33) if year == 2023 else (120,60,33) if year == 2024 else (130,60,32)
    elif group in ('international','legacy_international'):
        total,major,general = 120,48,33
    elif group == 'legacy_language':
        total,major,general = 120,60,33
    else:
        total,major,general = 120,entry.get('major_credits',48),33 if year <= 2024 else 32
    certifications = [
        '일반 단일전공의 확인된 최소 학점이며 최종 졸업사정 결과가 아님',
        *entry['notes'],
        *entry.get('review',[]),
        '편입·학과 변경·재입학·다전공·이수 대체 및 학생별 예외는 학과 확인',
    ]
    if group == 'unassigned':
        certifications.insert(0,'최종 전공 미선택 상태: 선택 전공의 졸업요건을 반드시 추가 확인')
    return {'department':entry['name'],'admission_year':year,'total_credits':total,
        'areas':[{'name':'전공','required':major},{'name':'교양','required':general}],
        'required_courses':[{'name':'교양 필수·선택 영역과 학과 지정 필수 교과목 전체 확인','manual':True}],
        'certifications':certifications}


def rule_rows():
    result, seen = [], set()
    for catalog in catalogs():
        for entry in catalog['departments']:
            for year in years_for(entry):
                key = entry['name'],year
                if key in seen:
                    raise ValueError('자료의 학과·입학년도 중복: ' + str(key))
                seen.add(key)
                result.append(minimum_rule(entry,year))
    return result


def document_rows():
    result = []
    for catalog in catalogs():
        edition = 2026 if 'catalog_2026' in catalog else 2024
        pdf = catalog.get('catalog_2026') or catalog['catalog_url']
        for entry in catalog['departments']:
            title = f"졸업요건 정리({edition}) · {entry['name']}"
            years = years_for(entry)
            scope = ', '.join(map(str,years)) + '학번 최소 학점' if years else '안내용 문서만 등록. 미확인 학번·융합전공을 주전공 계산에 사용하지 않음'
            source = entry.get('source_url') or pdf + '#page=' + str(entry['pages'][-1])
            header = f"[{title}]\n확인일: 2026-10-29. 적용 범위: {scope}. 출처: {source}. PDF 실제 쪽: {','.join(map(str,entry['pages']))}."
            contents = [header + '\n' + note for note in entry['notes']]
            contents += [header + '\n미확정: ' + note for note in entry.get('review',[])]
            contents.append(header + '\n학교 공통 외국어 졸업요건과 CREOS·SKON·DREAM 비교과 인증은 2025년 8월 졸업예정자부터 폐지. 학과 자체 시험·작품·한국어 요건과 구분. 학생별 최종 판단은 포탈·학과 확인.')
            result.append({'title':title,'url':source,'kind':'졸업요건','contents':contents})
    main = catalogs()[0]
    for page,label,content in (
        (96,'2025학번 이후 미래융합·자유전공','단일전공 총 130학점, 전공 60학점, 교양 37학점. 다전공·편입·전과는 별도 적용. 통합 전 학과명에 임의 적용하지 않는다.'),
        (97,'2025학번 이후 예술·미용·군사 등','공통 표는 총 120학점, 전공 48학점, 교양 32학점. 스포츠앤테크놀로지는 학과 별도 규정의 총 130·전공 60을 확인한다.'),
        (98,'2017~2024학번 공통','총 120·전공 48을 공통 최소로 안내하나 학과 상향 기준이 존재한다. 교양은 2017~2019 22학점, 2020 28학점, 2021~2024 33학점. 개별 필수교과·영역은 별도 확인.'),
    ):
        title = '졸업요건 정리(2026) · ' + label
        url = main['catalog_2026'] + '#page=' + str(page)
        result.append({'title':title,'url':url,'kind':'졸업요건','contents':[f'[{title}] 확인일 2026-10-29. 출처 {url}. {content}']})
    result.append({'title':'졸업요건 정리(2026) · 폐지 규정과 적용 원칙','url':main['abolition_url'],'kind':'졸업요건',
        'contents':['[현재 졸업요건 적용 원칙] ' + note for note in main['common_notes']]})
    return result


def validate():
    rows, docs = rule_rows(),document_rows()
    if len({d['title'] for d in docs}) != len(docs):
        raise ValueError('자료 제목 중복')
    for doc in docs:
        if not doc['url'].startswith('https://') or '.skuniv.ac.kr' not in doc['url']:
            raise ValueError('공식 출처 누락')
        if not doc['contents'] or any(not text.strip() for text in doc['contents']):
            raise ValueError('문단 누락')
    return rows,docs
