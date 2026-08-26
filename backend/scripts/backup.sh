#!/usr/bin/env bash
# Daily PostgreSQL backup for BoomMall (on-premise).
# Stores dumps on company server local disk and prunes old files.
#
# Crontab example (run as deploy user, 02:30 Asia/Bangkok):
#   30 2 * * * /opt/boommall/backend/scripts/backup.sh >> /var/log/boommall-pg-backup.log 2>&1
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Load env if present (does not override already-exported vars)
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/var/backups/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DB_NAME="${POSTGRES_DB:-boommall_coin}"
DB_USER="${POSTGRES_USER:-boom}"
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"
TMP_FILE="${FILE}.partial"

mkdir -p "$BACKUP_DIR"

echo "[backup] $(date -Iseconds) starting → $FILE"

if ! command -v docker >/dev/null 2>&1; then
  echo "[backup] ERROR: docker not found" >&2
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
  echo "[backup] ERROR: service '$SERVICE' is not running (compose: $COMPOSE_FILE)" >&2
  exit 1
fi

# Dump inside the container over local socket (no public port required).
docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=plain --no-owner --no-acl \
  | gzip -c > "$TMP_FILE"

mv "$TMP_FILE" "$FILE"
SIZE="$(du -h "$FILE" | awk '{print $1}')"
echo "[backup] OK size=$SIZE file=$FILE"

# Checksum for integrity
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" > "${FILE}.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$FILE" > "${FILE}.sha256"
fi

# Prune old backups
find "$BACKUP_DIR" -type f \( -name "${DB_NAME}_*.sql.gz" -o -name "${DB_NAME}_*.sql.gz.sha256" \) \
  -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true

echo "[backup] retention=${RETENTION_DAYS}d complete"
