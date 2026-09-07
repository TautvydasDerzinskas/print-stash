#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
APP_USER=appuser
APP_GROUP=appgroup

# Align group with requested PGID (create or update in-place).
if getent group "$PGID" >/dev/null 2>&1; then
  APP_GROUP="$(getent group "$PGID" | cut -d: -f1)"
elif getent group "$APP_GROUP" >/dev/null 2>&1; then
  addgroup -g "$PGID" "$APP_GROUP" 2>/dev/null || true
fi

# Align user with requested PUID.
if id "$APP_USER" >/dev/null 2>&1; then
  deluser "$APP_USER" >/dev/null 2>&1 || true
  adduser -D -u "$PUID" -G "$APP_GROUP" -s /sbin/nologin "$APP_USER"
fi

# Make sure mounted data directories are writable by the runtime user.
CHOWN_MODE=${CHOWN_MODE:-minimal}
mkdir -p /app/storage /app/data
if [ "$CHOWN_MODE" = "recursive" ]; then
  chown -R "$PUID":"$PGID" /app/storage /app/data 2>/dev/null || true
else
  chown "$PUID":"$PGID" /app/storage /app/data 2>/dev/null || true
fi

# Managed migrations: apply any pending Prisma migrations before the app starts.
npx prisma migrate deploy

exec su-exec "$APP_USER" "$@"
