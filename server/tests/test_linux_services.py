import json
from pathlib import Path

import pytest

from server.scripts.prepare_linux_services import render_units, write_units


def test_services_use_project_venv_and_shared_nonblocking_job_lock():
    units = render_units('/home/student/front-back-kick')
    assert len(units) == 7
    for name, value in units.items():
        if name.endswith('.service'):
            assert 'WorkingDirectory=/home/student/front-back-kick\n' in value
            assert '/home/student/front-back-kick/.venv/bin/python -m ' in value
            assert '--reload' not in value
        if name.endswith('.service') and name != 'previ-api.service':
            assert '/usr/bin/flock -n -E 0 %t/previ-jobs.lock ' in value
    assert '--host 127.0.0.1' in units['previ-api.service']
    assert 'Restart=on-failure' in units['previ-api.service']
    assert '--log-config server/log_config.json' in units['previ-api.service']


def test_api_log_keeps_30_days_and_no_chat_text():
    config = json.loads((Path(__file__).parents[1]/'log_config.json').read_text(encoding='utf-8'))
    assert config['handlers']['file']['when'] == 'midnight'
    assert config['handlers']['file']['backupCount'] == 29  # 오늘 파일 + 지난 29일
    assert config['root']['level'] == 'WARNING'  # chat의 INFO 로그에는 질문 앞부분이 있음


def test_schedules_are_explicit_korean_time_and_do_not_catch_up_unexpectedly():
    units = render_units('/srv/previ')
    collect = units['previ-collect.timer']
    times = [line for line in collect.splitlines() if line.startswith('OnCalendar=')]
    assert times == [f'OnCalendar=*-*-* {hour:02d}:00:00 Asia/Seoul' for hour in range(9, 19)]
    assert '08:50:00 Asia/Seoul' in units['previ-daily.timer']
    assert '*:0/5:00 Asia/Seoul' in units['previ-reminders.timer']
    for name, value in units.items():
        if name.endswith('.timer'):
            assert 'Persistent=false' in value
    assert '--reminders-only' in units['previ-reminders.service']
    assert '--extract' in units['previ-daily.service']


@pytest.mark.parametrize('root', ['relative/path','/home/user/../other','/home/%n/previ','/home/$USER/previ','/home/evil\nExecStart=bad','/home/user with space/previ'])
def test_unsupported_paths_cannot_inject_service_directives(root):
    with pytest.raises(ValueError):
        render_units(root)


def test_generation_never_overwrites_existing_configuration(tmp_path):
    output = tmp_path/'units'
    units = render_units('/srv/previ')
    write_units(output, units)
    original = (output/'previ-api.service').read_bytes()
    with pytest.raises(ValueError):
        write_units(output, render_units('/srv/changed'))
    assert (output/'previ-api.service').read_bytes() == original
    assert b'\r\n' not in original
