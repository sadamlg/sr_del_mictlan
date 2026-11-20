#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workdir="$(mktemp -d)"
project_name="phase09-backup-${RANDOM}-${RANDOM}"
env_file="$workdir/compose.env"
identity_file="$workdir/age-identity"
compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f "$repo_root/compose.yaml" -f "$repo_root/compose.phase09.yaml")

cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    "${compose[@]}" logs --no-color 2>/dev/null || true
  fi
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$workdir"
  exit "$status"
}
trap cleanup EXIT

cat >"$env_file" <<EOF
COMPOSE_PROJECT_NAME=$project_name
POSTGRES_DB=phase09_backup_test
POSTGRES_USER=phase09_backup_test
POSTGRES_PASSWORD=phase09_backup_test_only
DATABASE_URL=postgresql://phase09_backup_test:phase09_backup_test_only@postgres:5432/phase09_backup_test
POSTGRES_PORT=0
MAILPIT_PORT=0
BACKEND_PORT=0
R2_BACKUP_BUCKET=phase09-backups
R2_ENDPOINT_URL=http://s3mock:9090
R2_REGION=us-east-1
R2_ACCESS_KEY_ID=phase09_test
R2_SECRET_ACCESS_KEY=phase09_test_secret
AWS_ACCESS_KEY_ID=phase09_test
AWS_SECRET_ACCESS_KEY=phase09_test_secret
AWS_EC2_METADATA_DISABLED=true
BACKUP_AGE_RECIPIENT=
HEALTHCHECKS_BACKUP_PING_URL=
EOF

"${compose[@]}" build database-backup
"${compose[@]}" run --rm --no-deps --user "$(id -u):$(id -g)" --volume "$workdir:/keys" --entrypoint bash database-backup \
  -ec 'age-keygen -o /keys/age-identity 2>/dev/null; age-keygen -y /keys/age-identity > /keys/age-recipient'
chmod 0444 "$identity_file"
BACKUP_AGE_RECIPIENT="$(cat "$workdir/age-recipient")"
printf 'BACKUP_AGE_RECIPIENT=%s\n' "$BACKUP_AGE_RECIPIENT" >>"$env_file"

"${compose[@]}" up --detach --wait --wait-timeout 120 postgres s3mock

"${compose[@]}" run --rm --no-deps --entrypoint bash database-backup \
  -ec 'printf "s3mock connectivity probe\n" >/tmp/s3-probe; curl --silent --show-error --fail --request PUT --upload-file /tmp/s3-probe "$R2_ENDPOINT_URL/$R2_BACKUP_BUCKET/connectivity-probe" >/dev/null'

"${compose[@]}" exec -T postgres psql --set ON_ERROR_STOP=1 --username=phase09_backup_test --dbname=phase09_backup_test \
  --command="CREATE TABLE phase09_backup_probe (marker text PRIMARY KEY); INSERT INTO phase09_backup_probe VALUES ('synthetic-restore-check');"
"${compose[@]}" run --rm --no-deps database-backup

object_key="$("${compose[@]}" run --rm --no-deps --entrypoint aws database-backup \
  --endpoint-url http://s3mock:9090 --region us-east-1 s3api list-objects-v2 \
  --bucket phase09-backups --prefix postgres/phase09-test/ --query 'Contents[-1].Key' --output text)"
if [[ ! "$object_key" =~ ^postgres/phase09-test/[0-9]{4}/[0-9]{2}/[0-9]{2}/database-[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]]; then
  printf '%s\n' 'The isolated backup test did not produce the expected object.' >&2
  exit 1
fi

"${compose[@]}" exec -T postgres createdb --username=phase09_backup_test phase09_restore_test
restore_url=postgresql://phase09_backup_test:phase09_backup_test_only@postgres:5432/phase09_restore_test
"${compose[@]}" run --rm --no-deps --volume "$identity_file:/tmp/age-identity:ro" \
  --env "DATABASE_URL=$restore_url" --entrypoint bash database-backup \
  -euo pipefail -c '
    aws --endpoint-url "$R2_ENDPOINT_URL" --region "$R2_REGION" s3api get-object \
      --bucket "$R2_BACKUP_BUCKET" --key "$1" /tmp/database.dump.age >/dev/null
    age --decrypt --identity /tmp/age-identity /tmp/database.dump.age \
      | pg_restore --no-owner --no-acl --exit-on-error --dbname="$DATABASE_URL"
  ' _ "$object_key"

restored_marker="$("${compose[@]}" exec -T postgres psql --set ON_ERROR_STOP=1 --username=phase09_backup_test --dbname=phase09_restore_test \
  --tuples-only --no-align --command='SELECT marker FROM phase09_backup_probe;')"
if [[ "$restored_marker" != synthetic-restore-check ]]; then
  printf '%s\n' 'The isolated backup restore did not recover the expected synthetic marker.' >&2
  exit 1
fi

printf '%s\n' 'Isolated PostgreSQL backup, encrypted object upload/download, decryption, and restore succeeded.'
