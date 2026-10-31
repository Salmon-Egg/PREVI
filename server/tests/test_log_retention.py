import logging
import os
from pathlib import Path
import time
import json

from server.log_retention import RetentionFileHandler


def test_startup_removes_old_archives_and_idle_active_file_only(tmp_path):
    now = time.time()
    active = tmp_path / "api.log"
    old = tmp_path / "api.log.2020-01-01"
    recent = tmp_path / "api.log.2026-01-01"
    other = tmp_path / "other.log.2020-01-01"
    backup = tmp_path / "api.log.2020-01-01.private.json"
    for path in (active, old, recent, other, backup):
        path.write_text("private old request\n", encoding="utf-8")
        os.utime(path, (now - 40 * 86400, now - 40 * 86400))
    os.utime(recent, (now, now))
    handler = RetentionFileHandler(active, when="midnight", backupCount=29,
                                   encoding="utf-8", start_sweeper=False)
    try:
        assert not old.exists()
        assert active.read_text(encoding="utf-8") == ""
        assert recent.exists() and other.exists() and backup.exists()
        handler.emit(logging.makeLogRecord({"msg": "new request"}))
        assert active.read_text(encoding="utf-8").strip() == "new request"
    finally:
        handler.close()


def test_idle_sweep_rotates_without_a_log_record(tmp_path):
    handler = RetentionFileHandler(tmp_path / "api.log", when="midnight",
                                   backupCount=29, start_sweeper=False)
    try:
        handler.emit(logging.makeLogRecord({"msg": "before"}))
        handler.rolloverAt = int(time.time()) - 1
        handler.sweep()
        assert (tmp_path / "api.log").read_text() == ""
        assert any(p.read_text().strip() == "before" for p in tmp_path.glob("api.log.*"))
    finally:
        handler.close()


def test_production_handler_configuration_loads(tmp_path):
    config = json.loads((Path(__file__).parents[1] / "log_config.json").read_text())
    options = config["handlers"]["file"].copy()
    options.pop("class")
    options.pop("formatter")
    options["filename"] = str(tmp_path / "api.log")
    handler = RetentionFileHandler(**options)
    handler.close()


def test_background_cleanup_runs_without_requests_and_stops_on_close(tmp_path):
    handler = RetentionFileHandler(tmp_path / "api.log", when="midnight",
                                   backupCount=29, sweep_interval=0.01)
    old = tmp_path / "api.log.2020-01-01"
    try:
        old.write_text("expired", encoding="utf-8")
        stale = time.time() - 40 * 86400
        os.utime(old, (stale, stale))
        deadline = time.monotonic() + 2
        while old.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert not old.exists()
    finally:
        handler.close()
    assert handler._stop.is_set()
