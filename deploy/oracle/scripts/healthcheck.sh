#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd -- "${script_dir}/.." && pwd)"
env_file="${ENV_FILE:-${deploy_dir}/.env}"
compose_file="${deploy_dir}/docker-compose.yml"

[[ -f "${env_file}" ]] || { echo "Missing ${env_file}" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

compose=(docker compose --env-file "${env_file}" -f "${compose_file}")
"${compose[@]}" ps
"${compose[@]}" exec -T postgres pg_isready -U postgres -d postgres
"${compose[@]}" exec -T backend wget -qO- http://localhost:8080/actuator/health/readiness >/dev/null

curl --fail --silent --show-error --retry 10 --retry-delay 3 "https://${APP_DOMAIN}/en" >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 3 "https://${AUTH_DOMAIN}/realms/rehletshifaa/.well-known/openid-configuration" >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 3 "https://${STORAGE_DOMAIN}/minio/health/live" >/dev/null

echo "Database, backend, web, identity, storage, and public TLS checks passed."

