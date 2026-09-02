#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd -- "${script_dir}/.." && pwd)"
env_file="${ENV_FILE:-${deploy_dir}/.env}"
compose_file="${deploy_dir}/docker-compose.yml"

[[ -f "${env_file}" ]] || { echo "Missing ${env_file}" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

backup_directory="${BACKUP_DIRECTORY:-/var/backups/rehletshifaa}"
passphrase_file="${BACKUP_PASSPHRASE_FILE:-/etc/rehletshifaa/backup-passphrase}"
[[ -s "${passphrase_file}" ]] || { echo "Missing non-empty backup passphrase file: ${passphrase_file}" >&2; exit 1; }
mkdir -p "${backup_directory}"

staging="$(mktemp -d "${backup_directory}/.staging.XXXXXX")"
cleanup() {
  resolved="$(realpath -- "${staging}")"
  case "${resolved}" in
    "$(realpath -- "${backup_directory}")"/.staging.*) rm -rf -- "${resolved}" ;;
    *) echo "Refusing to remove unexpected staging path: ${resolved}" >&2 ;;
  esac
}
trap cleanup EXIT

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${backup_directory}/rehletshifaa-${timestamp}.tar.gz.enc"
compose=(docker compose --env-file "${env_file}" -f "${compose_file}")

"${compose[@]}" exec -T postgres pg_dump -U postgres -d "${APP_DB_NAME:-rehletshifaa}" --format=custom > "${staging}/application.dump"
"${compose[@]}" exec -T postgres pg_dump -U postgres -d "${KEYCLOAK_DB_NAME:-keycloak}" --format=custom > "${staging}/keycloak.dump"
mkdir -p "${staging}/objects"

network_name="${COMPOSE_PROJECT_NAME:-rehletshifaa}_app"
docker run --rm \
  --network "${network_name}" \
  --entrypoint /bin/sh \
  -e MINIO_ROOT_USER="${MINIO_ROOT_USER}" \
  -e MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD}" \
  -e S3_BUCKET="${S3_BUCKET:-medical-documents}" \
  -v "${staging}/objects:/backup" \
  minio/mc:RELEASE.2025-07-21T05-28-08Z \
  -ec 'mc alias set source http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite "source/$S3_BUCKET" /backup'

(cd "${staging}" && sha256sum application.dump keycloak.dump > SHA256SUMS)
tar -C "${staging}" -czf - . | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass "file:${passphrase_file}" -out "${archive}"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:${passphrase_file}" -in "${archive}" | tar -tzf - >/dev/null

echo "Encrypted, verified backup created: ${archive}"
echo "Copy it off the VM and protect the passphrase separately."

