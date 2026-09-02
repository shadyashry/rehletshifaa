#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd -- "${script_dir}/.." && pwd)"
env_file="${ENV_FILE:-${deploy_dir}/.env}"
compose_file="${deploy_dir}/docker-compose.yml"

ENV_FILE="${env_file}" bash "${script_dir}/preflight.sh"

compose=(docker compose --env-file "${env_file}" -f "${compose_file}")
"${compose[@]}" pull --ignore-buildable
"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps

echo "Deployment started. TLS may take a few minutes on the first run."
echo "Run: ENV_FILE=${env_file} bash ${script_dir}/healthcheck.sh"

