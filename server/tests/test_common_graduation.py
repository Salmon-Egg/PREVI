from server.scripts.append_common_graduation import items_for
from server.logic.graduation import calculate_graduation


def test_legacy_groups_are_choices_not_all_individually_required_courses():
    items=items_for({'department':'컴퓨터공학과','admission_year':2021})
    assert len(items)==8 and all(x['manual'] for x in items)
    assert any('상상력에의초대 / 문제해결의힘' in x['name'] for x in items)
    rule={'total_credits':120,'areas':[],'required_courses':items,'certifications':[]}
    result=calculate_graduation([],rule)
    assert all(x['done'] is None for x in result['requirements'])


def test_future_and_standard_general_education_are_separated():
    future=items_for({'department':'컴퓨터소프트웨어전공','admission_year':2025})
    standard=items_for({'department':'헤어디자인학과','admission_year':2025})
    assert any('전공탐색세미나' in x['name'] for x in future)
    assert not any('전공탐색세미나' in x['name'] for x in standard)
    assert '37학점' in future[-1]['name'] and '32학점' in standard[-1]['name']
    assert items_for({'department':'소프트웨어학과','admission_year':2025})==[]
    assert items_for({'department':'글로벌관광경영학과','admission_year':2026})==[]
