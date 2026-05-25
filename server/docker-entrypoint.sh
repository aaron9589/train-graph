#!/bin/sh
set -e

# Fix ownership of the data volume at runtime so the app user can write to it,
# regardless of whether the volume was created by a previous root-run container.
chown -R app:app /app/server/data

exec su-exec app node server/index.js
