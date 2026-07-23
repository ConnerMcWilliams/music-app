# Django backend image for Railway.
#
# Why a Dockerfile instead of Railway's Nixpacks autodetection: Nixpacks installs
# the project (`pip install .`) before the full source tree is in place, but this
# app's pyproject.toml declares itself a setuptools package, so the wheel build
# fails at that point with "package directory 'config' does not exist". Here we
# COPY the whole source first, so every package directory exists when pip builds
# the wheel.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Full source first, then install — the copy order is the whole point (see header).
# psycopg[binary] and av (PyAV) ship self-contained binary wheels, so no apt
# packages (libpq, ffmpeg) are needed.
COPY . .
RUN pip install --upgrade pip && pip install .

# Bake collected static into the image so WhiteNoise serves it at runtime.
# collectstatic needs no database and no real SECRET_KEY (it's an exempt
# management command); DEBUG defaults off, so the hashed + manifest storage runs.
RUN python manage.py collectstatic --noinput

# On Railway, railway.json overrides this: migrate runs as preDeployCommand and
# gunicorn as startCommand. This default keeps the image runnable on its own
# (e.g. `docker run`). gunicorn.conf.py reads the listen port from $PORT, which
# the platform provides.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi -c gunicorn.conf.py"]
