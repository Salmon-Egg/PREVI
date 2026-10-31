"""API 파일만 회전·정리한다. 공용 journald와 다른 프로그램 로그는 건드리지 않는다."""
import logging.handlers
from pathlib import Path
import re
import sys
import threading
import time


class RetentionFileHandler(logging.handlers.TimedRotatingFileHandler):
    """요청이 없어도 회전한다. 29일 상한과 1분 점검으로 30일 전 정리한다.

    API가 중지된 동안에는 정리할 수 없다. 다음 시작 때 먼저 정리한다.
    """

    def __init__(self, filename, *, max_age_days=29, sweep_interval=60,
                 start_sweeper=True, **kwargs):
        if not 0 < max_age_days <= 29 or not 0 < sweep_interval <= 3600:
            raise ValueError("로그 보관은 29일 이하, 정리 간격은 1시간 이하로 설정하세요.")
        self.max_age_seconds = max_age_days * 86400
        self._stop = threading.Event()
        super().__init__(filename, **kwargs)
        self.sweep()
        if start_sweeper:
            threading.Thread(target=self._run, args=(sweep_interval,),
                             name="previ-api-log-retention", daemon=True).start()

    def getFilesToDelete(self):
        base = Path(self.baseFilename)
        pattern = re.compile(re.escape(base.name) + r"\.\d{4}-\d{2}-\d{2}$")
        expired = {path for path in super().getFilesToDelete()
                   if pattern.fullmatch(Path(path).name) and not Path(path).is_symlink()}
        cutoff = time.time() - self.max_age_seconds
        for path in base.parent.iterdir():
            if pattern.fullmatch(path.name) and not path.is_symlink() and path.is_file():
                if path.stat().st_mtime < cutoff:
                    expired.add(str(path))
        return sorted(expired)

    def sweep(self):
        self.acquire()
        try:
            if self.shouldRollover(None):
                self.doRollover()
            # 시작 직후나 회전 전에도 기존 보관 파일의 기한을 확인한다.
            for path in self.getFilesToDelete():
                Path(path).unlink(missing_ok=True)
        finally:
            self.release()

    def _run(self, interval):
        while not self._stop.wait(interval):
            try:
                self.sweep()
            except OSError:
                # 같은 로그에 재귀 기록하지 않고 운영 점검에 실패를 알린다.
                print("PREVI API log retention failed; check logs directory permissions.",
                      file=sys.stderr, flush=True)

    def close(self):
        self._stop.set()
        self.acquire()
        try:
            super().close()
        finally:
            self.release()
