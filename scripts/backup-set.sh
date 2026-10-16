#!/usr/bin/env bash
# P1-9: take a backup set from a running Compose stack, the input of scripts/restore-drill.sh.
#
#   scripts/backup-set.sh [--project rehletshifaa] [--bucket medical-documents] [--out DIR]
#
# Read-only against the source stack: pg_dump, the realm partial export and an object listing/copy. No source
# service is restarted and no volume is mounted; the only write on the source side is a temporary copy of the bucket
# in the MinIO container's own /tmp, removed before the script ends.
#
# The set (DIR/<UTC timestamp>/):
#   postgres.dump        pg_dump custom format of the application database
#   table-counts.tsv     row count per table, taken right after the dump (the drill compares it after the restore)
#   keycloak-realm.json  realm configuration (infrastructure/keycloak/export-realm.sh: no users, secrets masked)
#   objects.tar          snapshot of the document bucket; objects.sha256 one checksum per object
#   MANIFEST             what, when, from where; SHA256SUMS over every file
#
# A backup set holds patient data in production: keep DIR on encrypted storage outside the repository (the default
# is ./backups, which git ignores) and copy it off the host. Production databases and buckets are recovered with
# PITR and object versions (docs/disaster-recovery.md); a set like this one is what the quarterly drill restores.
set -Eeuo pipefail
umask 077
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'   # Git Bash on Windows: keep container paths as written

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
project=rehletshifaa
bucket=medical-documents
out="${BACKUP_DIR:-${repo}/backups}/sets"
while (( $# )); do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    --bucket) bucket="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    *) echo "usage: $0 [--project NAME] [--bucket NAME] [--out DIR]" >&2; exit 2 ;;
  esac
done

# docker.exe on Windows needs a Windows path for host-side arguments (docker cp).
host_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

container() {
  local id
  id="$(docker ps -q --filter "label=com.docker.compose.project=${project}" --filter "label=com.docker.compose.service=$1" | head -n 1)"
  [[ -n "${id}" ]] || { echo "backup-set: no running '$1' in compose project '${project}'" >&2; exit 1; }
  echo "${id}"
}
pg="$(container postgres)"; kc="$(container keycloak)"; minio="$(container minio)"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
set_dir="${out}/${stamp}"
mkdir -p "${set_dir}"
started=$SECONDS
echo "backup-set: ${project} -> ${set_dir}"

# 1. Database. The connection uses the container's own POSTGRES_USER / POSTGRES_DB over the local socket.
docker exec "${pg}" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "${set_dir}/postgres.dump"
docker exec -i "${pg}" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -F "	" -v ON_ERROR_STOP=1' \
  < "${repo}/scripts/restore-drill/table-counts.sql" > "${set_dir}/table-counts.tsv"
flyway="$(docker exec "${pg}" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -c "select version from flyway_schema_history where success order by installed_rank desc limit 1"')"

# 2. Realm configuration, with the Keycloak container's own admin environment.
docker exec -i "${kc}" bash -s < "${repo}/infrastructure/keycloak/export-realm.sh" > "${set_dir}/keycloak-realm.json"

# 3. Objects: the MinIO container's bundled mc, credentials from the container's own environment (MC_HOST_*, so no
#    alias file is written), mirrored to its /tmp, copied out with docker cp, then removed from the container.
#    Checksums and tar run on this host (the MinIO image has neither find nor tar).
docker exec -e BUCKET="${bucket}" "${minio}" sh -c '
  set -e; rm -rf /tmp/backup-set-snapshot; mkdir -p /tmp/backup-set-snapshot
  MC_HOST_src="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000" mc mirror --quiet "src/$BUCKET" /tmp/backup-set-snapshot >/dev/null'
docker cp "${minio}:/tmp/backup-set-snapshot" "$(host_path "${set_dir}/objects")" >/dev/null
docker exec "${minio}" rm -rf /tmp/backup-set-snapshot
(cd "${set_dir}/objects" && find . -type f | LC_ALL=C sort | while read -r f; do sha256sum "$f"; done) > "${set_dir}/objects.sha256"
tar -C "${set_dir}/objects" -cf "${set_dir}/objects.tar" .
rm -rf -- "${set_dir}/objects"

objects="$(wc -l < "${set_dir}/objects.sha256" | tr -d ' ')"
{
  echo "created_at=${stamp}"
  echo "source_project=${project}"
  echo "source_commit=$(git -C "$(host_path "${repo}")" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "flyway_version=${flyway}"
  echo "bucket=${bucket}"
  echo "object_count=${objects}"
  echo "table_count=$(wc -l < "${set_dir}/table-counts.tsv" | tr -d ' ')"
  echo "realm=rehletshifaa"
} > "${set_dir}/MANIFEST"
(cd "${set_dir}" && sha256sum postgres.dump table-counts.tsv keycloak-realm.json objects.tar objects.sha256 MANIFEST > SHA256SUMS)

echo "backup-set: done in $((SECONDS - started))s (Flyway V${flyway}, ${objects} objects, $(du -sh "${set_dir}" | cut -f1))"
echo "${set_dir}"
