# scripts/watch_pending_jobs.py
from __future__ import annotations

import os
import signal
import time
from datetime import datetime

from scripts.process_pending_jobs import process_pending_jobs

_stop = False


def _handle_signal(signum, frame):
    global _stop
    _stop = True


def main() -> None:
    interval_seconds = int(os.getenv("JOB_WATCH_INTERVAL_SECONDS", "5"))

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    print("👀 Job Watch Mode started (quiet + locked)")
    print(f"   Poll interval: {interval_seconds}s")
    print("   Stop with CTRL+C")
    print()

    while not _stop:
        processed = process_pending_jobs(verbose=False)
        if processed > 0:
            print(f"🔔 [{datetime.now().isoformat(timespec='seconds')}] Processed {processed} job(s)")
        time.sleep(interval_seconds)

    print("🛑 Job Watch Mode stopped")


if __name__ == "__main__":
    main()

