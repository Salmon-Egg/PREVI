"""기존 PREVI 공유 스크립트가 고정 API를 유지하도록 전환한다. 기본은 미리보기."""
import argparse
from datetime import datetime
import difflib
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
from urllib.parse import urlsplit


BEGIN = '# PREVI_FIXED_API_BEGIN'
END = '# PREVI_FIXED_API_END'


def patch_script(original: str, api_url: str) -> str:
    parsed = urlsplit(api_url)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
        raise ValueError('고정 API는 사용자 정보·경로·쿼리가 없는 HTTPS 주소여야 합니다.')
    api_url = api_url.rstrip('/')
    block = (f'{BEGIN}\nexport PREVI_API_URL={shlex.quote(api_url)}\n'
             'check_url "$PREVI_API_URL/health"\n'
             'echo "API 연결 완료: $PREVI_API_URL"\n' + END)
    if BEGIN in original:
        start = original.index(BEGIN)
        end = original.index(END, start) + len(END)
    else:
        start = original.index('"$tunnel" tunnel ')
        marker = 'echo "API 연결 완료: $PREVI_API_URL"'
        end = original.index(marker, start) + len(marker)
        old = original[start:end]
        if 'http://127.0.0.1:8000' not in old or 'api_pid=$!' not in old:
            raise ValueError('기존 API 터널 구간이 예상과 다릅니다. 파일을 확인하세요.')
    result = original[:start] + block + original[end:]
    old_loop = 'while kill -0 "$api_pid" 2>/dev/null &&\n      kill -0 "$web_pid" 2>/dev/null; do'
    new_loop = 'while kill -0 "$web_pid" 2>/dev/null; do'
    if old_loop in result:
        result = result.replace(old_loop, new_loop)
    elif new_loop not in result:
        raise ValueError('기존 터널 감시 구문이 예상과 달라 전환을 중단합니다.')
    if '$api_pid' in result or 'api_pid=$!' in result:
        raise ValueError('기존 API 터널 감시 구문이 남아 있어 전환을 중단합니다.')
    if 'http://127.0.0.1:8095' not in result or 'web_pid=$!' not in result:
        raise ValueError('학생 웹 터널 구간을 찾지 못했습니다.')
    return result.replace('tunnel --no-autoupdate --url',
                          'tunnel --no-autoupdate --protocol http2 --url')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-url', required=True)
    parser.add_argument('--apply', action='store_true', help='백업 후 실제 서버 설정 변경')
    args = parser.parse_args()
    source = Path.home() / '.local/previ-tools/previ-share.sh'
    original = source.read_text(encoding='utf-8')
    updated = patch_script(original, args.api_url)
    if not args.apply:
        print(''.join(difflib.unified_diff(original.splitlines(True), updated.splitlines(True),
                                         fromfile=str(source), tofile=str(source))))
        print('미리보기만 완료했습니다. 실제 적용에는 --apply가 필요합니다.')
        return
    if os.name != 'posix':
        raise SystemExit('실제 적용은 Linux 학교 서버에서만 실행하세요.')
    with tempfile.NamedTemporaryFile(mode='w', dir=source.parent, encoding='utf-8', delete=False) as file:
        file.write(updated)
        pending = Path(file.name)
    try:
        subprocess.run(['bash', '-n', str(pending)], check=True)
        backup = source.with_name(source.name + '.bak-fixed-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        with backup.open('x', encoding='utf-8') as file:
            file.write(original)
        backup.chmod(0o600)
        dropin = Path.home() / '.config/systemd/user/previ-share.service.d/fixed-api.conf'
        dropin.parent.mkdir(parents=True, exist_ok=True)
        dropin.write_text('[Unit]\nWants=previ-ngrok.service\nAfter=previ-ngrok.service\n', encoding='utf-8')
        pending.chmod(0o700)
        pending.replace(source)
        print('고정 API 전환 설정 완료. 기존 설정을 백업했습니다.')
        print('systemctl --user daemon-reload 후 previ-share.service를 재시작하세요.')
    finally:
        pending.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
