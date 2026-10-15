# Backups, recovery and the restore drill (P1-9, review finding E-09)

Targets, the latest drill result and the release checklist line are in [deployment.md](deployment.md#recovery-objectives-rto-and-rpo).
This page says what is backed up, how each part is recovered, and how the drill proves it.

**The production host is not decided.** [deployment.md](deployment.md) recommends managed PostgreSQL and S3; the
[Oracle Free VM guide](oracle-free-vm-deployment.md) is a single-host option with its own encrypted `backup.sh`. So
the settings below are written host-neutral (what to set), with **AWS RDS and S3 as the worked example** in
`scripts/dr/`. Choosing another host means filling the same table for it, not changing the targets.

## What holds state

| Store | Holds | Recovered by | Loss bound (RPO) |
|---|---|---|---|
| PostgreSQL, application database | Cases, documents' metadata, audit, money, everything clinical | Point-in-time recovery (PITR) | ≤ 15 min (RDS ships the transaction log every 5 min) |
| PostgreSQL, Keycloak database (production: same managed instance, own database) | Accounts, passwords, second factors, sessions | The same PITR | ≤ 15 min |
| Object storage, `medical-documents` bucket | Uploaded medical documents; sealed evidence once the evidence ledger exists (P1-15/16) | Object versions (in region), the cross-region replica (region loss) | 0 for overwrite/delete; ≤ 15 min for region loss |
| Keycloak realm configuration | Realm settings, clients, roles, groups, authentication flows, required actions | Nightly realm export (+ `infrastructure/keycloak/realm-rehletshifaa.json` in git) | 24 h for console changes; configuration rarely changes |
| Redis | Reference-data cache and rate-limit counters only | Nothing to recover; refills from the database | none |
| Secrets (`PII_ENCRYPTION_KEY`, `PII_INDEX_KEY`, `CLAIM_TOKEN_PEPPER`, client secrets, DB and storage credentials) | Keys without which restored data cannot be read | The secret store, replicated to the recovery region | must be zero: **a restored database is unreadable without the same PII keys** |

## 1. PostgreSQL point-in-time recovery

What to set on any host:

| Setting | Value | Why |
|---|---|---|
| Continuous WAL archiving | on; a segment leaves the host at least every 5 minutes | Sets the RPO |
| Base backup | daily, 00:30–01:30 UTC | Night across the corridor time zones (UTC+2 to +4) |
| PITR window (base backups + WAL retention) | 35 days | Long enough to notice silent corruption or a bad migration; noncurrent object versions are kept as long (section 2) |
| Cross-region copy of backups and WAL | on, 14 days | A regional loss still allows PITR |
| Encryption | KMS key, separate key in the recovery region | Health data at rest |
| Deletion protection; final snapshot on delete | on | A careless delete cannot take the backups with it |
| Restore target | always a **new** instance, then repoint `DB_URL` | The damaged instance stays for investigation |

AWS RDS worked example, `scripts/dr/aws-rds-pitr.sh` (prints the commands; `--apply` runs them):

```bash
RDS_INSTANCE=rehletshifaa-prod PRIMARY_REGION=<primary> DR_REGION=<recovery> DR_KMS_KEY_ARN=<key arn in recovery region> scripts/dr/aws-rds-pitr.sh configure --apply
RDS_INSTANCE=rehletshifaa-prod PRIMARY_REGION=<primary> scripts/dr/aws-rds-pitr.sh status
RDS_INSTANCE=rehletshifaa-prod PRIMARY_REGION=<primary> scripts/dr/aws-rds-pitr.sh restore --target rehletshifaa-restore-0915 --time 2026-10-15T09:15:00Z --apply
```

`configure` sets 35-day automated backups (RDS ships the transaction log every 5 minutes and handles WAL retention
itself), the backup and maintenance windows, deletion protection and tag copying, and replicates the automated
backups with their logs to the recovery region. `status` shows `LatestRestorableTime`, the real RPO at that moment.

Self-managed PostgreSQL (for example the Oracle VM) gets the same table with pgBackRest or WAL-G:
`archive_mode = on`, `archive_timeout = 300`, `wal_level = replica`, an archive command that pushes to an encrypted
bucket in another region, a weekly full and daily differential backup, retention to cover 35 days. The Oracle
`backup.sh` (encrypted nightly dump) is a 24-hour RPO only and does not meet the target alone.

After a restore: point `DB_URL` (secret store) at the new instance, start the backend (Flyway only moves forward;
a restore to before a migration re-applies it), run the smoke checks of section 5, then the role-portal smoke of
the release sequence.

## 2. Object storage: versioning, cross-region copy, recovering an object

What to set on any host:

- **Versioning on** for the documents bucket (and later the evidence bucket). An overwrite or delete keeps the old
  bytes as a noncurrent version; a delete only adds a delete marker.
- **Noncurrent versions kept 35 days** (the PITR window), so a database restored to any point in the window still
  finds the bytes its rows point to. Expired delete markers are cleaned up. Retention of current objects is P1-7's.
- **Cross-region copy** of every new object, within 15 minutes, to a replica bucket encrypted with a key in the
  recovery region. **Delete markers are not replicated**: a delete in the primary never removes the replica.
- The **application role cannot destroy versions**: `infrastructure/s3-app-role-policy.example.json` grants
  `s3:DeleteObject` (adds a delete marker) but never `s3:DeleteObjectVersion`, `s3:PutBucketVersioning` or
  `s3:PutLifecycleConfiguration`. Removing a delete marker is an operator action with a separate role.
- **Sealed evidence** (when P1-15/16 build it): its own bucket or prefix with S3 Object Lock in compliance mode, so
  not even an operator can shorten its retention. Versioning is the prerequisite and is on from day one.

AWS S3 worked example, `scripts/dr/aws-s3-versioning-replication.sh` with `infrastructure/s3-replication.example.json`
and `infrastructure/s3-lifecycle.example.json`; each step also prints its MinIO (`mc`) equivalent:

```bash
S3_BUCKET=<bucket> PRIMARY_REGION=<primary> DR_BUCKET=<replica> DR_REGION=<recovery> REPLICATION_ROLE_ARN=<arn> DR_KMS_KEY_ARN=<arn> scripts/dr/aws-s3-versioning-replication.sh configure --apply
S3_BUCKET=<bucket> PRIMARY_REGION=<primary> scripts/dr/aws-s3-versioning-replication.sh versions medical/<key>
```

Recovering one object (the key is `medical_documents.storage_key` of the row):

- **Deleted:** `... recover medical/<key> --apply` removes the newest delete marker; the version under it is current again.
  MinIO: `mc undo <alias>/<bucket>/<key>` or `mc rm --version-id <marker>`.
- **Overwritten:** `... versions medical/<key>`, pick the good version by time and size, then
  `... recover medical/<key> --version-id <id> --apply`: it is copied over the current object as a new version, so
  nothing is destroyed. MinIO: `mc cp --version-id <id> <alias>/<bucket>/<key> <alias>/<bucket>/<key>`.
- **Region lost:** read the replica bucket; point `S3_BUCKET` and `AWS_REGION` (secret store) at it.

The drill rehearses the overwrite-then-delete recovery on its scratch bucket every time it runs.

## 3. Keycloak: realm export nightly, users with the database

Users, credentials and second factors live in Keycloak's database, which is recovered by the database PITR, never
by a file. The realm **configuration** is exported every night:

- `infrastructure/keycloak/export-realm.sh` calls the admin partial export (realm, clients, roles, groups, flows,
  required actions). Keycloak masks client secrets, the SMTP password and key material; the script refuses to write
  an export that holds a person's account, a stored credential or an unmasked secret. The only users in it are
  client service accounts, which carry the clients' role mappings.
- Nightly in Docker: the `keycloak-realm-export` service of `docker-compose.backup.yml` (opt-in overlay; 02:00 UTC;
  30 kept in `backups/keycloak-realm/`, which git ignores):

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml -f docker-compose.backup.yml up -d --no-deps keycloak-realm-export
  ```

  Production: the same container with `KC_ADMIN_USER`/`KC_ADMIN_PASSWORD` from the secret store (an export account
  with `manage-realm`), writing to the encrypted backup bucket.
- Restoring configuration only (database intact): compare the export with the live realm, re-apply with
  `kcadm.sh create partialImport -s ifResourceExists=OVERWRITE`. Restoring an empty Keycloak: `kcadm.sh create realms
  -f <export>`, then set each confidential client's secret from the secret store (`staff-identity-admin`). Key
  providers are regenerated, so existing sessions end and people sign in again.

## 4. Backup sets and the restore drill

`scripts/backup-set.sh` takes a set from a running Compose stack, read-only (pg_dump, the realm export, a copy of the
bucket, row counts per table, checksums). `scripts/restore-drill.sh <set>` restores it into the scratch stack
`scripts/restore-drill/compose.yml` (project `rehletshifaa-restore-drill`, loopback ports 15432/18180/19000/18080, its
own volumes) and never addresses the dev stack. Every scratch credential is generated per run.

```bash
bash scripts/backup-set.sh                      # from the dev stack; prints the set's directory
bash scripts/restore-drill.sh backups/sets/<UTC timestamp>
```

What it proves, each step timed: the set's checksums; every table's row count equal after `pg_restore`; every exported
client and all top-level flows present after the realm import, client secrets re-keyed; every object's checksum equal
after the restore into a versioned bucket; the backend from this checkout starts on the restored data; then the smoke
checks: readiness and health `UP`, Flyway at the checkout's newest migration with no failed one, `/api/v1/me`
refused without a token (401) and served with a token issued by the restored realm (200), and an overwritten then
deleted object recovered from its first version. The report (`backups/drill-reports/restore-drill-<UTC>.md`) gives
the restore time, the sum of the steps; building the backend image is listed apart (production pulls a released
image). `--keep` leaves the scratch stack running for inspection.

Production drill, quarterly and before launch: restore the database by PITR to a new instance and the bucket from
versions/replica in the recovery region, take a set from that restored copy with `backup-set.sh` pointed at a scratch
project there, run `restore-drill.sh` with `DRILL_BACKEND_IMAGE` = the released image and the environment's PII keys
from the secret store, then record the time in [deployment.md](deployment.md#recovery-objectives-rto-and-rpo). A set
holds patient data: it lives on encrypted storage in the recovery account, never on a laptop or in the repository.

## 5. Smoke checks after any real recovery

Same as the drill, against the recovered environment: `/actuator/health` `UP` from inside the network; Flyway's newest
successful version equals the release's newest migration and none failed; a signed-in staff read and a patient read
through the gateway; one document download (bytes from storage, checksum matches the row); the outbox drains; then the
release sequence's role-portal smoke in [deployment.md](deployment.md).
