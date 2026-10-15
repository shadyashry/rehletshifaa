#!/usr/bin/env bash
# P1-9 (E-09): object storage protection for medical documents (and, once built, sealed evidence): versioning on, a
# cross-region copy, noncurrent versions kept for the PITR window, and recovery of a deleted or overwritten object.
# AWS S3 is the worked example of docs/disaster-recovery.md; the MinIO equivalent of each step is printed beside it.
# Prints the commands without running them unless --apply is given (status and versions are read-only and always run).
#
#   scripts/dr/aws-s3-versioning-replication.sh configure [--apply]
#   scripts/dr/aws-s3-versioning-replication.sh status
#   scripts/dr/aws-s3-versioning-replication.sh versions KEY            every version and delete marker of one object
#   scripts/dr/aws-s3-versioning-replication.sh recover KEY [--version-id ID] [--apply]
#        deleted object: removes the newest delete marker, so the version under it is current again;
#        overwritten object: copies --version-id (the good version) over the current one, a new version on top.
#
# Environment:
#   S3_BUCKET              primary bucket (required)
#   PRIMARY_REGION         its region (required)
#   DR_BUCKET, DR_REGION   replica bucket and its region (required for configure)
#   REPLICATION_ROLE_ARN   role S3 assumes to replicate (required for configure)
#   DR_KMS_KEY_ARN         KMS key in DR_REGION for replicas (required for configure)
#   NONCURRENT_DAYS        how long overwritten/deleted versions are kept (default 35 = the database PITR window)
set -Eeuo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
apply=false; action="${1:-}"; shift || true
key=""; version_id=""
while (( $# )); do
  case "$1" in
    --apply) apply=true; shift ;;
    --version-id) version_id="$2"; shift 2 ;;
    -*) echo "unknown argument $1" >&2; exit 2 ;;
    *) key="$1"; shift ;;
  esac
done
: "${S3_BUCKET:?set S3_BUCKET}" "${PRIMARY_REGION:?set PRIMARY_REGION}"
noncurrent="${NONCURRENT_DAYS:-35}"

run() {
  printf '+'; printf ' %q' "$@"; echo
  if [[ "${apply}" == true ]]; then "$@"; fi
}
minio() { echo "  minio: $*"; }

case "${action}" in
  configure)
    : "${DR_BUCKET:?set DR_BUCKET}" "${DR_REGION:?set DR_REGION}" "${REPLICATION_ROLE_ARN:?set REPLICATION_ROLE_ARN}" "${DR_KMS_KEY_ARN:?set DR_KMS_KEY_ARN}"
    tmp="$(mktemp -d)"; trap 'rm -rf -- "${tmp}"' EXIT
    # 1. Versioning on both buckets (replication requires it). Overwrites and deletes keep the old bytes as versions.
    run aws s3api put-bucket-versioning --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --versioning-configuration Status=Enabled
    run aws s3api put-bucket-versioning --region "${DR_REGION}" --bucket "${DR_BUCKET}" --versioning-configuration Status=Enabled
    minio "mc version enable primary/${S3_BUCKET} && mc version enable dr/${DR_BUCKET}"
    # 2. Cross-region copy of every new object within 15 minutes (Replication Time Control). Delete markers are NOT
    #    replicated, so a delete in the primary never removes the replica.
    sed -e "s#REPLACE_WITH_REPLICATION_ROLE_ARN#${REPLICATION_ROLE_ARN}#" -e "s#REPLACE_WITH_DR_BUCKET#${DR_BUCKET}#" \
        -e "s#REPLACE_WITH_DR_KMS_KEY_ARN#${DR_KMS_KEY_ARN}#" "${repo}/infrastructure/s3-replication.example.json" > "${tmp}/replication.json"
    run aws s3api put-bucket-replication --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --replication-configuration "file://${tmp}/replication.json"
    minio "mc replicate add primary/${S3_BUCKET} --remote-bucket 'https://ACCESS:SECRET@dr-endpoint/${DR_BUCKET}' --replicate 'existing-objects,metadata-sync'"
    # 3. Lifecycle: unconfirmed uploads expire after a day; noncurrent versions are kept NONCURRENT_DAYS, so any point
    #    the database can be restored to still finds its documents' bytes.
    sed -e "s#\"NoncurrentDays\": 35#\"NoncurrentDays\": ${noncurrent}#" "${repo}/infrastructure/s3-lifecycle.example.json" > "${tmp}/lifecycle.json"
    run aws s3api put-bucket-lifecycle-configuration --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --lifecycle-configuration "file://${tmp}/lifecycle.json"
    minio "mc ilm rule add primary/${S3_BUCKET} --noncurrent-expire-days ${noncurrent}"
    echo "Objects that existed before replication was enabled need one S3 Batch Replication job (or mc replicate resync)."
    ;;
  status)
    aws s3api get-bucket-versioning --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}"
    aws s3api get-bucket-replication --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" \
      --query 'ReplicationConfiguration.Rules[].{id:ID,status:Status,to:Destination.Bucket,rtc:Destination.ReplicationTime.Status,deleteMarkers:DeleteMarkerReplication.Status}' --output table
    aws s3api get-bucket-lifecycle-configuration --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --query 'Rules[].ID' --output text
    ;;
  versions)
    [[ -n "${key}" ]] || { echo "versions needs KEY" >&2; exit 2; }
    aws s3api list-object-versions --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --prefix "${key}" \
      --query '{versions:Versions[?Key==`'"${key}"'`].{id:VersionId,latest:IsLatest,modified:LastModified,size:Size},deleteMarkers:DeleteMarkers[?Key==`'"${key}"'`].{id:VersionId,latest:IsLatest,modified:LastModified}}' --output json
    minio "mc ls --versions primary/${S3_BUCKET}/${key}"
    ;;
  recover)
    [[ -n "${key}" ]] || { echo "recover needs KEY" >&2; exit 2; }
    if [[ -n "${version_id}" ]]; then
      # Overwritten: the chosen version becomes current again as a new version; nothing is destroyed.
      run aws s3api copy-object --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --key "${key}" \
        --copy-source "${S3_BUCKET}/${key}?versionId=${version_id}" --metadata-directive COPY --tagging-directive COPY
      minio "mc cp --version-id ${version_id} primary/${S3_BUCKET}/${key} primary/${S3_BUCKET}/${key}"
    else
      # Deleted: the newest delete marker goes; the version under it is current again.
      marker="$(aws s3api list-object-versions --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --prefix "${key}" \
        --query 'DeleteMarkers[?Key==`'"${key}"'` && IsLatest==`true`].VersionId | [0]' --output text)"
      [[ -n "${marker}" && "${marker}" != None ]] || { echo "no current delete marker on ${key}; pass --version-id for an overwrite" >&2; exit 1; }
      run aws s3api delete-object --region "${PRIMARY_REGION}" --bucket "${S3_BUCKET}" --key "${key}" --version-id "${marker}"
      minio "mc undo primary/${S3_BUCKET}/${key}   (or mc rm --version-id <marker id>)"
    fi
    echo "If the primary region itself is lost, read the replica in DR_BUCKET and point S3_BUCKET/AWS_REGION at it."
    ;;
  *)
    sed -n '2,24p' "$0"; exit 2 ;;
esac
[[ "${apply}" == true || "${action}" == status || "${action}" == versions ]] || echo "(dry run: nothing was changed; add --apply)"
