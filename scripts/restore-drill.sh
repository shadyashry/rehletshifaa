#!/usr/bin/env bash
# P1-9 (E-09): restore drill. Restores a backup set (scripts/backup-set.sh) into a scratch stack, proves it works,
# reports the time taken and removes the scratch stack again.
#
#   scripts/restore-drill.sh <backup-set-dir> [--keep] [--report-dir DIR]
#
# Environment (all optional):
#   DRILL_BACKEND_IMAGE   backend image to run (production drill: the released image); unset = build ./backend
#   CLAIM_TOKEN_PEPPER, PII_ENCRYPTION_KEY, PII_INDEX_KEY
#                         the source environment's keys from the secret store (default: the dev stack's local values)
#   DRILL_DB_PORT, DRILL_KEYCLOAK_PORT, DRILL_MINIO_PORT, DRILL_BACKEND_PORT   loopback ports (15432/18180/19000/18080)
#
# Isolation: Compose project "rehletshifaa-restore-drill" (scripts/restore-drill/compose.yml) with its own network,
# volumes and loopback-only ports. The dev stack (project "rehletshifaa") is never addressed: no exec, no volume, no
# port. Teardown removes only the scratch project's containers and volumes. Every credential of the scratch stack is
# generated here for this run and lives only in this process's environment.
#
# Steps, each timed: verify the set's checksums -> start Postgres, Keycloak, MinIO, Redis -> restore the database and
# compare every table's row count -> import the realm, re-key its client secrets -> restore the objects and compare
# every checksum -> start the backend (Flyway migrates forward) -> smoke checks: readiness and health UP, Flyway at
# the newest migration of this checkout with no failed migration, /api/v1/me refused without a token and served with
# one (signed by the restored realm, checked by the backend against the restored database) -> rehearse recovering an
# overwritten and deleted object from its versions. The restore time (RTO evidence) is the sum of the steps; building
# the backend image is reported separately (in production the image is already in the registry).
set -Eeuo pipefail
umask 077
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'   # Git Bash on Windows: keep container paths as written

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
project=rehletshifaa-restore-drill
dev_project=rehletshifaa
compose_file="${repo}/scripts/restore-drill/compose.yml"

set_dir=""; keep=false; report_dir="${BACKUP_DIR:-${repo}/backups}/drill-reports"
while (( $# )); do
  case "$1" in
    --keep) keep=true; shift ;;
    --report-dir) report_dir="$2"; shift 2 ;;
    -*) echo "usage: $0 <backup-set-dir> [--keep] [--report-dir DIR]" >&2; exit 2 ;;
    *) set_dir="$1"; shift ;;
  esac
done
[[ -n "${set_dir}" && -f "${set_dir}/MANIFEST" ]] || { echo "usage: $0 <backup-set-dir> [--keep] [--report-dir DIR]" >&2; exit 2; }
set_dir="$(cd -- "${set_dir}" && pwd)"
[[ "${project}" != "${dev_project}" ]] || { echo "restore-drill: scratch project must not be the dev project" >&2; exit 2; }

host_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
dc() { docker compose -p "${project}" -f "$(host_path "${compose_file}")" "$@"; }
rand() { openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
manifest() { sed -n "s/^$1=//p" "${set_dir}/MANIFEST"; }

export DRILL_DB_PORT="${DRILL_DB_PORT:-15432}" DRILL_KEYCLOAK_PORT="${DRILL_KEYCLOAK_PORT:-18180}"
export DRILL_MINIO_PORT="${DRILL_MINIO_PORT:-19000}" DRILL_BACKEND_PORT="${DRILL_BACKEND_PORT:-18080}"
export DRILL_DB_PASSWORD="$(rand)" DRILL_KC_ADMIN_PASSWORD="$(rand)" DRILL_MINIO_PASSWORD="$(rand)"
export DRILL_IDENTITY_ADMIN_SECRET="$(rand)"
smoke_secret="$(rand)"
api="http://localhost:${DRILL_BACKEND_PORT}"
issuer="http://localhost:${DRILL_KEYCLOAK_PORT}/realms/rehletshifaa"

work="$(mktemp -d)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${report_dir}"
report="${report_dir}/restore-drill-${stamp}.md"
steps=(); notes=(); current=""; step_started=0; restore_seconds=0; build_seconds=0; result=FAIL

step() { current="$1"; step_started=$SECONDS; echo "restore-drill: ${current}"; }
done_step() {
  local took=$((SECONDS - step_started))
  steps+=("| ${current} | ${took} | ${1:-} |"); restore_seconds=$((restore_seconds + took)); current=""
}
note() { notes+=("- $1"); echo "restore-drill:   $1"; }
fail() { echo "restore-drill: FAILED at '${current}': $1" >&2; notes+=("- **Failed at ${current}:** $1"); exit 1; }

write_report() {
  {
    echo "# Restore drill ${stamp}"
    echo
    echo "- Result: **${result}**"
    echo "- Backup set: \`$(basename "${set_dir}")\` (taken $(manifest created_at) from \`$(manifest source_project)\`, Flyway V$(manifest flyway_version), $(manifest table_count) tables, $(manifest object_count) objects)"
    echo "- Checkout: \`$(git -C "$(host_path "${repo}")" rev-parse --short HEAD 2>/dev/null || echo unknown)\`, newest migration V${newest:-?}"
    echo "- Backend image: \`${DRILL_BACKEND_IMAGE:-not built}\` (build ${build_seconds}s, not part of the restore time)"
    echo "- **Restore time (sum of the steps): ${restore_seconds}s ($(( (restore_seconds + 59) / 60 )) min)**"
    echo
    echo "| Step | Seconds | Evidence |"
    echo "|---|---|---|"
    printf '%s\n' "${steps[@]}"
    echo
    printf '%s\n' "${notes[@]}"
  } > "${report}"
}

cleanup() {
  local status=$?
  local tail_log=""
  if [[ -n "${current}" && "${result}" != PASS ]]; then
    tail_log="$(dc logs --no-color --tail 40 backend 2>/dev/null | sed -E 's/(secret|password|token)[^ ]*/\1=<redacted>/Ig' || true)"
    [[ -z "${tail_log}" ]] || notes+=("- Backend log tail at failure:" '```' "${tail_log}" '```')
  fi
  write_report || true
  if [[ "${keep}" == true ]]; then
    echo "restore-drill: scratch stack kept (docker compose -p ${project} -f scripts/restore-drill/compose.yml down -v)"
  else
    dc down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf -- "${work}"
  echo "restore-drill: ${result}; report ${report}"
  exit "${status}"
}
trap cleanup EXIT

# Compose interpolates every service, so the image name must be known before the first dc call.
build_image=false
if [[ -z "${DRILL_BACKEND_IMAGE:-}" ]]; then
  export DRILL_BACKEND_IMAGE="rehletshifaa-restore-drill/backend:$(git -C "$(host_path "${repo}")" rev-parse --short HEAD 2>/dev/null || echo local)"
  build_image=true
fi

newest="$(ls "${repo}/backend/src/main/resources/db/migration" | sed -nE 's/^V([0-9]+)__.*/\1/p' | sort -n | tail -n 1)"

# Ports must be free (the dev stack uses other ones; this also catches a forgotten --keep run of a foreign stack).
for port in "${DRILL_DB_PORT}" "${DRILL_KEYCLOAK_PORT}" "${DRILL_MINIO_PORT}" "${DRILL_BACKEND_PORT}"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    [[ -n "$(dc ps -q 2>/dev/null)" ]] || { echo "restore-drill: port ${port} is in use by something else" >&2; exit 1; }
  fi
done
dc down -v --remove-orphans >/dev/null 2>&1 || true   # a previous --keep run of this scratch project only

if [[ "${build_image}" == true ]]; then
  echo "restore-drill: building ${DRILL_BACKEND_IMAGE} from ./backend"
  build_started=$SECONDS
  docker build -q -t "${DRILL_BACKEND_IMAGE}" "$(host_path "${repo}/backend")" >/dev/null
  build_seconds=$((SECONDS - build_started))
fi

step "Verify the backup set"
(cd "${set_dir}" && sha256sum -c --quiet SHA256SUMS) || fail "checksum mismatch in the backup set"
done_step "SHA256SUMS match ($(wc -l < "${set_dir}/SHA256SUMS" | tr -d ' ') files)"

step "Start the scratch infrastructure"
dc up -d --wait postgres minio redis mailpit >/dev/null 2>&1 || fail "postgres/minio/redis/mailpit did not become healthy"
dc up -d keycloak >/dev/null 2>&1 || fail "keycloak did not start"
done_step "project ${project}, ports ${DRILL_DB_PORT}/${DRILL_KEYCLOAK_PORT}/${DRILL_MINIO_PORT}"

step "Restore the database"
dc exec -T postgres pg_restore -U rehletshifaa -d rehletshifaa --no-owner --no-privileges --exit-on-error \
  < "${set_dir}/postgres.dump" || fail "pg_restore failed"
dc exec -T postgres sh -c 'psql -U rehletshifaa -d rehletshifaa -X -A -t -F "	" -v ON_ERROR_STOP=1' \
  < "${repo}/scripts/restore-drill/table-counts.sql" > "${work}/table-counts.tsv"
if ! diff -q "${set_dir}/table-counts.tsv" "${work}/table-counts.tsv" >/dev/null; then
  diff "${set_dir}/table-counts.tsv" "${work}/table-counts.tsv" | head -n 20 >&2
  fail "row counts differ from the backup set"
fi
rows="$(awk -F '\t' '{ s += $2 } END { print s + 0 }' "${work}/table-counts.tsv")"
done_step "$(wc -l < "${work}/table-counts.tsv" | tr -d ' ') tables, ${rows} rows, every count equal to the set"

step "Import the realm and re-key client secrets"
dc exec -T keycloak bash -c 'cat > /tmp/realm.json' < "${set_dir}/keycloak-realm.json"
dc exec -T -e IDENTITY_SECRET="${DRILL_IDENTITY_ADMIN_SECRET}" -e SMOKE_SECRET="${smoke_secret}" keycloak bash -s \
  > "${work}/realm-import.txt" <<'KEYCLOAK' || fail "realm import failed"
set -e
k=/opt/keycloak/bin/kcadm.sh; c=/tmp/kcadm.config
for attempt in $(seq 1 100); do
  "$k" config credentials --config "$c" --server http://localhost:8080 --realm master \
    --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1 && break
  [ "$attempt" = 100 ] && { echo "keycloak did not come up" >&2; exit 1; }
  sleep 3
done
"$k" create realms --config "$c" -f /tmp/realm.json >/dev/null
# Client secrets are masked in the export; production sets them from the secret store, the drill generates them.
id="$("$k" get clients -r rehletshifaa --config "$c" -q clientId=staff-identity-admin --fields id --format csv --noquotes)"
"$k" update "clients/$id" -r rehletshifaa --config "$c" -s "secret=$IDENTITY_SECRET"
# The drill's own smoke client (scratch realm only): client credentials, the API audience, nothing else.
"$k" create clients -r rehletshifaa --config "$c" -s clientId=restore-drill -s enabled=true -s publicClient=false \
  -s serviceAccountsEnabled=true -s standardFlowEnabled=false -s directAccessGrantsEnabled=false -s "secret=$SMOKE_SECRET" \
  -s 'protocolMappers=[{"name":"api-audience","protocol":"openid-connect","protocolMapper":"oidc-audience-mapper","config":{"included.custom.audience":"rehletshifaa-api","access.token.claim":"true","id.token.claim":"false"}}]' >/dev/null
echo "clients=$("$k" get clients -r rehletshifaa --config "$c" --fields clientId --format csv --noquotes | sort | tr '\n' ' ')"
echo "flows=|$("$k" get authentication/flows -r rehletshifaa --config "$c" --fields alias --format csv --noquotes | tr '\n' '|')|"
echo "custom_flows=$("$k" get authentication/flows -r rehletshifaa --config "$c" --fields builtIn --format csv --noquotes | grep -c false)"
rm -f "$c" /tmp/realm.json
KEYCLOAK
restored_clients="$(sed -n 's/^clients=//p' "${work}/realm-import.txt")"
restored_flows="$(sed -n 's/^flows=//p' "${work}/realm-import.txt")"
restored_custom="$(sed -n 's/^custom_flows=//p' "${work}/realm-import.txt" | tr -d ' ')"
for client in $(grep -oE '"clientId" : "[^"]+"' "${set_dir}/keycloak-realm.json" | sed -E 's/.*: "([^"]+)"/\1/' | sort -u); do
  [[ " ${restored_clients} " == *" ${client} "* ]] || fail "client ${client} missing after the import"
done
# Every flow the realm binds (browser, direct grant, reset credentials, ...) and every custom top-level flow must be
# back. Built-in flows of features this realm does not use (Keycloak 26 no longer creates "saml ecp") are not compared.
bound=0
while IFS= read -r flow; do
  [[ "${restored_flows}" == *"|${flow}|"* ]] || fail "bound flow '${flow}' missing after the import"
  bound=$((bound + 1))
done < <(grep -oE '"(browser|directGrant|resetCredentials|registration|clientAuthentication|dockerAuthentication|firstBrokerLogin)Flow" : "[^"]+"'   "${set_dir}/keycloak-realm.json" | sed -E 's/.*: "([^"]+)"/\1/')
export_custom="$(grep -A1 '"topLevel" : true' "${set_dir}/keycloak-realm.json" | grep -c '"builtIn" : false' || true)"
[[ "${restored_custom}" == "${export_custom}" ]] || fail "${restored_custom} custom top-level flows restored, ${export_custom} exported"
done_step "all ${bound} bound flows and ${export_custom} custom flows present, every exported client present; staff-identity-admin re-keyed"

step "Restore the objects"
minio_id="$(dc ps -q minio)"
mkdir -p "${work}/objects"
tar -C "${work}/objects" -xf "${set_dir}/objects.tar"
dc exec -T minio sh -c 'set -e; export MC_HOST_d="http://drill:${MINIO_ROOT_PASSWORD}@localhost:9000"
  mc mb --ignore-existing d/medical-documents >/dev/null && mc version enable d/medical-documents >/dev/null
  mc anonymous set none d/medical-documents >/dev/null' || fail "bucket setup failed"
docker cp "$(host_path "${work}/objects")" "${minio_id}:/tmp/restore" >/dev/null
docker cp "$(host_path "${set_dir}/objects.sha256")" "${minio_id}:/tmp/objects.sha256" >/dev/null
objects="$(manifest object_count)"
dc exec -T minio sh -c 'set -e; export MC_HOST_d="http://drill:${MINIO_ROOT_PASSWORD}@localhost:9000"
  mc mirror --quiet /tmp/restore d/medical-documents >/dev/null
  rm -rf /tmp/verify; mkdir -p /tmp/verify; mc mirror --quiet d/medical-documents /tmp/verify >/dev/null
  cd /tmp/verify; if [ -s /tmp/objects.sha256 ]; then sha256sum -c --quiet /tmp/objects.sha256; fi
  rm -rf /tmp/restore /tmp/verify' || fail "object checksums differ after the restore"
[[ "${objects}" != 0 ]] || note "The backup set holds no objects (the source bucket was empty); storage is exercised by the version-recovery rehearsal below."
done_step "${objects} objects, every checksum equal to the set; bucket versioned, no anonymous access"

step "Start the backend"
dc up -d --no-deps backend >/dev/null 2>&1 || fail "backend container did not start"
for attempt in $(seq 1 200); do
  [[ "$(curl -s --max-time 3 "${api}/actuator/health/readiness" || true)" == *'"status":"UP"'* ]] && break
  [[ "${attempt}" == 200 ]] && fail "backend not ready after 10 minutes"
  sleep 3
done
done_step "readiness UP"

step "Smoke checks"
health="$(curl -s --max-time 5 "${api}/actuator/health")"
[[ "${health}" == *'"status":"UP"'* ]] || fail "health is not UP: ${health}"
flyway="$(dc exec -T postgres psql -U rehletshifaa -d rehletshifaa -X -A -t -c \
  "select version from flyway_schema_history where success order by installed_rank desc limit 1")"
failed="$(dc exec -T postgres psql -U rehletshifaa -d rehletshifaa -X -A -t -c \
  "select count(*) from flyway_schema_history where not success")"
flyway="${flyway//[$'\r\n ']/}"; failed="${failed//[$'\r\n ']/}"
[[ "${flyway}" == "${newest}" ]] || fail "Flyway at V${flyway}, the checkout's newest is V${newest}"
[[ "${failed}" == 0 ]] || fail "${failed} failed Flyway migrations"
anonymous="$(curl -s -o "$(host_path "${work}/anonymous.txt")" -w '%{http_code}' --max-time 5 "${api}/api/v1/me")"
[[ "${anonymous}" == 401 ]] || fail "/api/v1/me without a token answered ${anonymous}, expected 401"
token_json="$(curl -s --max-time 10 -u "restore-drill:${smoke_secret}" -d grant_type=client_credentials \
  "${issuer}/protocol/openid-connect/token")"
token="$(printf '%s' "${token_json}" | sed -nE 's/.*"access_token":"([^"]+)".*/\1/p')"
[[ -n "${token}" ]] || fail "no token from the restored realm"
me_status="$(curl -s -o "$(host_path "${work}/me.json")" -w '%{http_code}' --max-time 10 -H "Authorization: Bearer ${token}" "${api}/api/v1/me")"
[[ "${me_status}" == 200 ]] && grep -q '"subject"' "${work}/me.json" || fail "/api/v1/me with a token answered ${me_status}"
done_step "health UP; Flyway V$(manifest flyway_version) -> V${flyway}, 0 failed; /api/v1/me 401 without a token, 200 with one"

step "Rehearse an object recovery"
# The MinIO image has no grep or sed, so the version list is read here and the chosen id sent back.
canary=d/medical-documents/restore-drill/canary.txt
mcx() { dc exec -T -e KEY="${canary}" -e VID="${1:-}" minio sh -c "set -e; export MC_HOST_d=\"http://drill:\${MINIO_ROOT_PASSWORD}@localhost:9000\"; $2"; }
mcx "" 'echo original > /tmp/canary && mc cp --quiet /tmp/canary "$KEY" >/dev/null
  echo overwritten > /tmp/canary && mc cp --quiet /tmp/canary "$KEY" >/dev/null
  mc rm --quiet "$KEY" >/dev/null
  if mc cat "$KEY" >/dev/null 2>&1; then echo "deleted object still readable" >&2; exit 1; fi' || fail "could not overwrite and delete the canary"
mcx "" 'mc ls --versions --json "$KEY"' > "${work}/versions.json" || fail "could not list the canary's versions"
# Newest first: the delete marker, the overwrite, the original. Recovery copies the original over the delete marker.
vid="$(grep -v '"isDeleteMarker":true' "${work}/versions.json" | sed -nE 's/.*"versionId":"([^"]+)".*/\1/p' | tail -n 1)"
[[ -n "${vid}" ]] || fail "no version of the canary to recover"
mcx "${vid}" 'mc cp --quiet --version-id "$VID" "$KEY" "$KEY" >/dev/null
  [ "$(mc cat "$KEY")" = original ] || { echo "recovered content differs" >&2; exit 1; }' || fail "object version recovery failed"
versions="$(mcx "" 'mc ls --versions --json "$KEY"' | grep -c versionId || true)"
done_step "overwritten then deleted object recovered from its first version (${versions} versions kept)"

result=PASS
note "Scratch credentials were generated for this run and discarded with the stack."
