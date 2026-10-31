"""Linux 사용자 systemd 파일 생성. 기본은 미리보기이며 서비스 등록은 하지 않는다."""
import argparse
from pathlib import Path, PurePosixPath
import re


def render_units(project_root):
    root = str(project_root).rstrip('/')
    # systemd의 %, $, 인수 구문이 경로를 다른 명령으로 해석하지 않게 제한한다.
    if not re.fullmatch(r'/[A-Za-z0-9_./-]+', root) or '..' in PurePosixPath(root).parts:
        raise ValueError('Linux 프로젝트 경로는 절대 경로이며 영문·숫자·밑줄·점·하이픈·/만 사용할 수 있습니다.')
    python = root + '/.venv/bin/python'
    common = f'WorkingDirectory={root}\nEnvironment=PYTHONUTF8=1\n'
    units = {'previ-api.service':
        '[Unit]\nDescription=PREVI API\n\n[Service]\nType=simple\n' + common +
        f'ExecStart={python} -m uvicorn server.main:app --host 127.0.0.1 --port 8000\n'
        'Restart=on-failure\nRestartSec=5\nTimeoutStopSec=30\n\n[Install]\nWantedBy=default.target\n'}
    jobs = {
        'collect': ('server.jobs.collect_notices --save --pages 3 --max-posts 150',
                    [f'*-*-* {hour:02d}:00:00 Asia/Seoul' for hour in range(9, 19)]),
        'daily': ('server.jobs.daily_check --extract', ['*-*-* 08:50:00 Asia/Seoul']),
        'reminders': ('server.jobs.daily_check --reminders-only', ['*-*-* *:0/5:00 Asia/Seoul']),
    }
    for name, (command, schedule) in jobs.items():
        units[f'previ-{name}.service'] = (
            f'[Unit]\nDescription=PREVI {name} job\n\n[Service]\nType=oneshot\n' + common +
            f'ExecStart=/usr/bin/flock -n -E 0 %t/previ-jobs.lock {python} -m {command}\n'
            'TimeoutStartSec=2h\n')
        units[f'previ-{name}.timer'] = (
            f'[Unit]\nDescription=PREVI {name} schedule\n\n[Timer]\n' +
            ''.join('OnCalendar=' + s + '\n' for s in schedule) +
            'AccuracySec=1s\nPersistent=false\n\n[Install]\nWantedBy=timers.target\n')
    return units


def write_units(output, units):
    output = Path(output)
    if output.exists() and any(output.iterdir()):
        raise ValueError('출력 폴더가 비어 있지 않습니다. 기존 설정을 덮어쓰지 않도록 새 폴더를 지정하세요.')
    output.mkdir(parents=True, exist_ok=True)
    for name, content in units.items():
        with (output/name).open('x', encoding='utf-8', newline='\n') as file:
            file.write(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', default=Path(__file__).resolve().parents[2].as_posix())
    parser.add_argument('--output-dir', help='새 출력 폴더. 생략하면 생성 내용을 출력만 함')
    args = parser.parse_args()
    units = render_units(args.project_root)
    if args.output_dir:
        write_units(args.output_dir, units)
        print(f'{len(units)} files prepared; no services registered.')
    else:
        for name, content in units.items():
            print(f'# {name}\n{content}')


if __name__ == '__main__':
    main()
