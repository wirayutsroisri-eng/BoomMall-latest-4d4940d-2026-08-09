#!/usr/bin/env bash
# Generate on-premise TLS material for PostgreSQL ↔ Backend (self-signed CA).
# Run once on the company server (or replace with corporate PKI certs).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${CERT_OUT_DIR:-$ROOT_DIR/deploy/certs}"
DAYS="${CERT_DAYS:-3650}"
# Comma-separated hostnames / IPs that clients will use in DATABASE_URL host=
# Include Docker DNS name "postgres" + private server IP / LAN hostname.
SAN_HOSTS="${CERT_SAN_HOSTS:-postgres,localhost,127.0.0.1}"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

if [[ -f server.crt && -f server.key && -f ca.crt ]]; then
  echo "Certs already exist in $OUT_DIR — delete them first to regenerate."
  exit 0
fi

echo "Generating Boom Coin DB TLS certs → $OUT_DIR"
echo "SAN hosts: $SAN_HOSTS"

openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS" \
  -subj "/O=BoomMall/OU=OnPrem/CN=BoomMall Boom Coin CA" \
  -out ca.crt

openssl genrsa -out server.key 2048
openssl req -new -key server.key \
  -subj "/O=BoomMall/OU=OnPrem/CN=postgres" \
  -out server.csr

# Build SAN extension file
{
  echo "subjectAltName = @alt_names"
  echo "extendedKeyUsage = serverAuth"
  echo "[alt_names]"
  i=1
  IFS=',' read -ra PARTS <<< "$SAN_HOSTS"
  for h in "${PARTS[@]}"; do
    h="$(echo "$h" | xargs)"
    [[ -z "$h" ]] && continue
    if [[ "$h" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "IP.$i = $h"
    else
      echo "DNS.$i = $h"
    fi
    i=$((i + 1))
  done
} > san.cnf

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "$DAYS" -sha256 -extfile san.cnf

chmod 600 server.key ca.key
chmod 644 server.crt ca.crt
rm -f server.csr san.cnf ca.srl

echo "Done."
echo "  ca.crt      — mount / trust on API host (sslrootcert)"
echo "  server.crt  — PostgreSQL server certificate"
echo "  server.key  — PostgreSQL private key (never commit)"
echo
echo "Example SAN for company LAN:"
echo "  CERT_SAN_HOSTS=postgres,db.internal.boommall.local,10.10.0.5 ./scripts/generate-db-certs.sh"
