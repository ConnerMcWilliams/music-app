"""Gunicorn configuration.

Read the listen port from ``$PORT`` in Python so the start command never depends
on shell variable expansion. On Railway, the ``railway.json`` ``startCommand``
that overrides the image ``CMD`` is not run through a shell, so a literal
``--bind 0.0.0.0:$PORT`` fails with "'$PORT' is not a valid port number". Reading
it here sidesteps that entirely; it also works locally where ``$PORT`` is unset.
"""

import os
import sys

port = os.environ.get('PORT', '8080')
print(f"[gunicorn.conf] Starting gunicorn on port {port}", file=sys.stderr, flush=True)

bind = f"0.0.0.0:{port}"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
# Grading requests decode audio (NumPy/PyAV) and can run long; keep the worker
# timeout well above gunicorn's 30s default so a real take isn't killed.
timeout = 120
# Emit access logs to stdout for the platform's log drain.
accesslog = "-"

