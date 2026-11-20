#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENVIRONMENT:?BACKUP_ENVIRONMENT is required}"
: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"

if [[ ! "$BACKUP_ENVIRONMENT" =~ ^[a-z0-9-]{1,32}$ ]]; then
  printf '%s\n' 'BACKUP_ENVIRONMENT must contain lowercase letters, digits, and hyphens.' >&2
  exit 2
fi

if [[ -z "${R2_ENDPOINT_URL:-}" ]]; then
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required when R2_ENDPOINT_URL is unset}"
  R2_ENDPOINT_URL="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

healthchecks_url="${HEALTHCHECKS_BACKUP_PING_URL:-}"
if [[ -n "$healthchecks_url" && ! "$healthchecks_url" =~ ^https://hc-ping\.com/[^[:space:]]+$ ]]; then
  printf '%s\n' 'HEALTHCHECKS_BACKUP_PING_URL must be an HTTPS Healthchecks.io Ping URL.' >&2
  exit 2
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
r2_region="${R2_REGION:-auto}"
export AWS_DEFAULT_REGION="$r2_region"

workdir="$(mktemp -d)"
backup_succeeded=false

send_healthchecks_signal() {
  local signal="$1"
  [[ -n "$healthchecks_url" ]] || return 0
  local target="${healthchecks_url%/}${signal}"
  if ! curl --silent --show-error --fail --max-time 5 --retry 2 "$target" >/dev/null 2>&1; then
    printf '%s\n' 'Healthchecks.io did not receive the PostgreSQL backup signal.' >&2
  fi
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$backup_succeeded" == true ]]; then
    send_healthchecks_signal ''
  else
    send_healthchecks_signal '/fail'
  fi
  rm -rf "$workdir"
  exit "$status"
}
trap cleanup EXIT

send_healthchecks_signal '/start'

started_at="$(date -u +%s)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
date_path="$(date -u +%Y/%m/%d)"
dump_file="$workdir/database.dump"
encrypted_file="$workdir/database.dump.age"
downloaded_file="$workdir/database.download.age"
object_key="postgres/${BACKUP_ENVIRONMENT}/${date_path}/database-${timestamp}.dump.age"

pg_dump --format=custom --no-owner --no-acl --file="$dump_file" --dbname="$DATABASE_URL"
pg_restore --list "$dump_file" >/dev/null
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted_file" "$dump_file"

local_checksum="$(sha256sum "$encrypted_file" | cut -d ' ' -f 1)"
local_size="$(wc -c < "$encrypted_file" | tr -d '[:space:]')"
object_url="s3://${R2_BACKUP_BUCKET}/${object_key}"

aws --endpoint-url "$R2_ENDPOINT_URL" --region "$r2_region" s3 cp \
  "$encrypted_file" "$object_url" --only-show-errors
aws --endpoint-url "$R2_ENDPOINT_URL" --region "$r2_region" s3 cp \
  "$object_url" "$downloaded_file" --only-show-errors

downloaded_checksum="$(sha256sum "$downloaded_file" | cut -d ' ' -f 1)"
if [[ "$local_checksum" != "$downloaded_checksum" ]]; then
  printf '%s\n' 'The uploaded PostgreSQL backup checksum does not match.' >&2
  exit 1
fi

duration_seconds="$(( $(date -u +%s) - started_at ))"
printf 'backup=success environment=%s key=%s bytes=%s sha256=%s duration_seconds=%s\n' \
  "$BACKUP_ENVIRONMENT" "$object_key" "$local_size" "$local_checksum" "$duration_seconds"
backup_succeeded=true
