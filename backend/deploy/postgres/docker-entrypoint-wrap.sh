#!/bin/sh
set -eu

CERT_SRC="${PG_TLS_CERT_DIR:-/tls}"
CERT_DST="/var/lib/postgresql/tls"

mkdir -p "$CERT_DST"

if [ -f "$CERT_SRC/server.crt" ] && [ -f "$CERT_SRC/server.key" ]; then
  cp "$CERT_SRC/server.crt" "$CERT_DST/server.crt"
  cp "$CERT_SRC/server.key" "$CERT_DST/server.key"
  if [ -f "$CERT_SRC/ca.crt" ]; then
    cp "$CERT_SRC/ca.crt" "$CERT_DST/ca.crt"
  fi
  chown -R postgres:postgres "$CERT_DST"
  chmod 700 "$CERT_DST"
  chmod 600 "$CERT_DST/server.key"
  chmod 644 "$CERT_DST/server.crt"
  if [ -f "$CERT_DST/ca.crt" ]; then
    chmod 644 "$CERT_DST/ca.crt"
  fi
  echo "[boom-pg] TLS certificates installed under $CERT_DST"
else
  echo "[boom-pg] WARNING: TLS certs missing in $CERT_SRC — generate with scripts/generate-db-certs.sh"
fi

if [ -f /etc/postgresql/postgresql.conf ]; then
  set -- "$@" -c "config_file=/etc/postgresql/postgresql.conf"
fi
if [ -f /etc/postgresql/pg_hba.conf ]; then
  set -- "$@" -c "hba_file=/etc/postgresql/pg_hba.conf"
fi

exec docker-entrypoint.sh "$@"
