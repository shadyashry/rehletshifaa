#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd -- "${script_dir}/.." && pwd)"
env_file="${ENV_FILE:-${deploy_dir}/.env}"
compose_file="${deploy_dir}/docker-compose.yml"

fail() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }

command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose v2 plugin is not installed."
[[ -f "${env_file}" ]] || fail "Missing ${env_file}; copy .env.example to .env and fill it in."

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

required=(APP_DOMAIN API_DOMAIN AUTH_DOMAIN STORAGE_DOMAIN ACME_EMAIL POSTGRES_ADMIN_PASSWORD APP_DB_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_USERNAME KEYCLOAK_ADMIN_PASSWORD CLAIM_TOKEN_PEPPER MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY MAIL_HOST MAIL_USERNAME MAIL_PASSWORD MAIL_FROM COORDINATOR_EMAIL WHATSAPP_WEBHOOK_URL WHATSAPP_TOKEN NEXT_PUBLIC_TURNSTILE_SITE_KEY TURNSTILE_SECRET NEXT_PUBLIC_WHATSAPP_NUMBER)
for key in "${required[@]}"; do
  value="${!key:-}"
  [[ -n "${value}" ]] || fail "${key} is empty."
  [[ "${value}" != *"replace-with"* ]] || fail "${key} still contains its example placeholder."
  [[ "${value}" != *"example.com"* ]] || fail "${key} still contains example.com."
done

domains=("${APP_DOMAIN}" "${API_DOMAIN}" "${AUTH_DOMAIN}" "${STORAGE_DOMAIN}")
[[ "$(printf '%s\n' "${domains[@]}" | sort -u | wc -l)" -eq 4 ]] || fail "APP_DOMAIN, API_DOMAIN, AUTH_DOMAIN, and STORAGE_DOMAIN must be distinct."
for domain in "${domains[@]}"; do
  [[ "${domain}" != *"://"* && "${domain}" != */* ]] || fail "Use hostnames without https:// or paths: ${domain}"
  getent ahosts "${domain}" >/dev/null 2>&1 || fail "DNS does not resolve yet: ${domain}"
done

for key in POSTGRES_ADMIN_PASSWORD APP_DB_PASSWORD KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD CLAIM_TOKEN_PEPPER MINIO_ROOT_PASSWORD S3_SECRET_KEY; do
  value="${!key}"
  [[ "${#value}" -ge 24 ]] || fail "${key} must contain at least 24 characters."
done

secret_count="$(printf '%s\n' "${POSTGRES_ADMIN_PASSWORD}" "${APP_DB_PASSWORD}" "${KEYCLOAK_DB_PASSWORD}" "${KEYCLOAK_ADMIN_PASSWORD}" "${CLAIM_TOKEN_PEPPER}" "${MINIO_ROOT_PASSWORD}" "${S3_SECRET_KEY}" | sort -u | wc -l)"
[[ "${secret_count}" -eq 7 ]] || fail "Database, identity, token, and storage secrets must all be different."

architecture="$(uname -m)"
if [[ "${architecture}" != "aarch64" && "${architecture}" != "arm64" ]]; then
  warn "Host architecture is ${architecture}; Oracle Always Free A1 normally reports aarch64."
fi

memory_kib="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
[[ "${memory_kib}" -ge 10000000 ]] || fail "This full stack needs at least 10 GB RAM. Select an A1 VM with 12 GB or more."

available_kib="$(df -Pk "${deploy_dir}" | awk 'NR==2 {print $4}')"
[[ "${available_kib}" -ge 20971520 ]] || fail "At least 20 GB of free disk is required before image builds and document growth."

mode="$(stat -c '%a' "${env_file}")"
if (( 10#${mode} % 100 > 0 )); then
  fail "${env_file} is readable by group or others. Run: chmod 600 ${env_file}"
fi

docker compose --env-file "${env_file}" -f "${compose_file}" config --quiet
echo "Preflight checks passed."

