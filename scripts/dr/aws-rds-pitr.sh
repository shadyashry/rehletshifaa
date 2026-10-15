#!/usr/bin/env bash
# P1-9 (E-09): point-in-time recovery for the managed PostgreSQL, AWS RDS as the worked example of the host-neutral
# settings in docs/disaster-recovery.md (the production host is not decided yet). Needs the AWS CLI v2 and a role
# allowed to change the instance. Prints the commands without running them unless --apply is given.
#
#   scripts/dr/aws-rds-pitr.sh configure [--apply]   retention, backup window, protection, cross-region backup copy
#   scripts/dr/aws-rds-pitr.sh status                 latest restorable time (the real RPO right now) and settings
#   scripts/dr/aws-rds-pitr.sh restore --target NAME (--time 2026-10-15T09:30:00Z | --latest) [--apply]
#                                                     a NEW instance at that moment; the source is never changed
#
# Environment:
#   RDS_INSTANCE           source DB instance identifier (required)
#   PRIMARY_REGION         its region (required)
#   DR_REGION              region that holds the replicated automated backups (required for configure)
#   DR_KMS_KEY_ARN         KMS key in DR_REGION that encrypts the replicated backups (required for configure)
#   BACKUP_RETENTION_DAYS  automated backup + WAL retention, the PITR window (default 35, the RDS maximum)
#   DR_RETENTION_DAYS      retention of the cross-region copy (default 14)
#   BACKUP_WINDOW          daily snapshot window, UTC (default 00:30-01:30, night in the corridor time zones)
#   MAINTENANCE_WINDOW     weekly maintenance, UTC, must not overlap the backup window (default sun:02:00-03:00)
#   DB_SUBNET_GROUP, VPC_SECURITY_GROUP_IDS (space-separated)   network of a restored instance (restore only)
set -Eeuo pipefail

apply=false; action="${1:-}"; shift || true
target=""; restore_time=""; latest=false
while (( $# )); do
  case "$1" in
    --apply) apply=true; shift ;;
    --target) target="$2"; shift 2 ;;
    --time) restore_time="$2"; shift 2 ;;
    --latest) latest=true; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done

: "${RDS_INSTANCE:?set RDS_INSTANCE}" "${PRIMARY_REGION:?set PRIMARY_REGION}"
retention="${BACKUP_RETENTION_DAYS:-35}"
dr_retention="${DR_RETENTION_DAYS:-14}"
window="${BACKUP_WINDOW:-00:30-01:30}"
maintenance="${MAINTENANCE_WINDOW:-sun:02:00-03:00}"

run() {
  printf '+'; printf ' %q' "$@"; echo
  if [[ "${apply}" == true ]]; then "$@"; fi
}

case "${action}" in
  configure)
    : "${DR_REGION:?set DR_REGION}" "${DR_KMS_KEY_ARN:?set DR_KMS_KEY_ARN}"
    # PITR on RDS = automated backups (daily snapshot + transaction logs shipped every 5 minutes) kept for the
    # retention period. Deletion protection and tag copying keep a careless delete from taking the backups with it.
    run aws rds modify-db-instance --region "${PRIMARY_REGION}" --db-instance-identifier "${RDS_INSTANCE}" \
      --backup-retention-period "${retention}" --preferred-backup-window "${window}" \
      --preferred-maintenance-window "${maintenance}" --copy-tags-to-snapshot --deletion-protection \
      --apply-immediately
    # Cross-region: the automated backups AND their transaction logs are replicated, so a regional loss still allows
    # a point-in-time restore in DR_REGION.
    arn="$(aws rds describe-db-instances --region "${PRIMARY_REGION}" --db-instance-identifier "${RDS_INSTANCE}" \
      --query 'DBInstances[0].DBInstanceArn' --output text 2>/dev/null || echo "arn:aws:rds:${PRIMARY_REGION}:ACCOUNT:db:${RDS_INSTANCE}")"
    run aws rds start-db-instance-automated-backups-replication --region "${DR_REGION}" \
      --source-db-instance-arn "${arn}" --backup-retention-period "${dr_retention}" --kms-key-id "${DR_KMS_KEY_ARN}"
    ;;
  status)
    aws rds describe-db-instances --region "${PRIMARY_REGION}" --db-instance-identifier "${RDS_INSTANCE}" \
      --query 'DBInstances[0].{latestRestorableTime:LatestRestorableTime,retentionDays:BackupRetentionPeriod,backupWindow:PreferredBackupWindow,deletionProtection:DeletionProtection,encrypted:StorageEncrypted,replications:DBInstanceAutomatedBackupsReplications}' \
      --output table
    ;;
  restore)
    [[ -n "${target}" ]] || { echo "restore needs --target NAME (a new instance)" >&2; exit 2; }
    [[ "${target}" != "${RDS_INSTANCE}" ]] || { echo "the target must be a new instance, not the source" >&2; exit 2; }
    if [[ "${latest}" == true ]]; then when=(--use-latest-restorable-time)
    elif [[ -n "${restore_time}" ]]; then when=(--restore-time "${restore_time}")
    else echo "restore needs --time ISO-8601-UTC or --latest" >&2; exit 2; fi
    # A restored instance gets the default network unless one is passed; keep it private and in the app's subnets.
    network=()
    [[ -n "${DB_SUBNET_GROUP:-}" ]] && network+=(--db-subnet-group-name "${DB_SUBNET_GROUP}")
    # shellcheck disable=SC2206
    [[ -n "${VPC_SECURITY_GROUP_IDS:-}" ]] && network+=(--vpc-security-group-ids ${VPC_SECURITY_GROUP_IDS})
    run aws rds restore-db-instance-to-point-in-time --region "${PRIMARY_REGION}" \
      --source-db-instance-identifier "${RDS_INSTANCE}" --target-db-instance-identifier "${target}" "${when[@]}" "${network[@]}" \
      --no-publicly-accessible --deletion-protection --copy-tags-to-snapshot
    run aws rds wait db-instance-available --region "${PRIMARY_REGION}" --db-instance-identifier "${target}"
    echo "Next: point DB_URL at ${target} (secret store), restart the backend, run the smoke checks (docs/disaster-recovery.md)."
    ;;
  *)
    sed -n '2,24p' "$0"; exit 2 ;;
esac
[[ "${apply}" == true || "${action}" == status ]] || echo "(dry run: nothing was changed; add --apply)"
