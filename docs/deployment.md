# Deployment guide

For a cost-constrained single-host installation, use the dedicated [Oracle Cloud Free VM guide](oracle-free-vm-deployment.md). It adds an Arm-compatible production Compose stack, automatic TLS, private service networking, strict configuration checks, and encrypted backups. The managed-service topology below remains the recommended architecture for higher availability and regulated production use.

## Recommended topology

- Deploy `frontend/Dockerfile` behind a CDN and TLS termination.
- Deploy `backend/Dockerfile` to a private application network behind an API load balancer.
- Use managed PostgreSQL with encryption, automated backups, point-in-time recovery, and restricted security groups.
- Use a dedicated private S3 bucket with public access blocked, versioning, lifecycle rules, access logging, and a narrowly scoped application role.
- Store database, SMTP, Turnstile, and KMS values in a managed secret store.

## Release sequence

1. Run the complete CI suite and scan both images and dependencies.
2. Provision database, bucket, KMS key if used, application roles, SMTP, DNS, TLS, WAF, secrets, and monitoring.
3. Deploy the backend with `SPRING_PROFILES_ACTIVE=prod`, OIDC issuer/JWK configuration, `APP_SECURITY_ENABLED=true`, `STORAGE_MODE=s3`, distinct high-entropy `CLAIM_TOKEN_PEPPER` and `PII_ENCRYPTION_KEY` values, public HTTPS `APP_PUBLIC_BASE_URL` and `APP_WEB_BASE_URL`, scanning, `NOTIFICATIONS_MODE=live`, `MAIL_MODE=smtp`, `WHATSAPP_MODE=webhook`, and `TURNSTILE_ENABLED=true`.
4. Verify Flyway migration success and `/actuator/health` from inside the trusted network.
5. Build the frontend with API/site and OIDC public values at image-build time, then deploy it.
6. Perform bilingual role-portal smoke tests, anonymous submission, OTP-protected case status and information response, clean/malicious upload, the complete doctor → operations → finance → coordinator release → patient decision sequence, post-acceptance activation, email/WhatsApp delivery, backup restore, rollback rehearsal, and alert verification using non-sensitive fixtures.

## Storage policy

Adapt the examples in `infrastructure/` with the real bucket, account, role, KMS key, and approved retention period. Do not grant `s3:ListBucket`, wildcard bucket access, or public-read permissions. The application role is restricted to the randomized `medical/` prefix and object tags distinguish pending from clean uploads.

## Backups and migration

Flyway migrations run forward on startup. Test each migration against a recent sanitized snapshot and take a recoverable backup before production schema changes. Roll back application binaries independently; use a reviewed forward-fix migration instead of ad-hoc schema edits.

What is backed up, how each store is recovered and how the drill works: [disaster-recovery.md](disaster-recovery.md).
The production host is not decided, so the settings there are host-neutral with AWS RDS/S3 as the worked example
(`scripts/dr/`).

## Recovery objectives (RTO and RPO)

| Objective | Target | How it is met |
|---|---|---|
| **RPO** (data that may be lost) | **15 minutes** | PostgreSQL PITR with the transaction log shipped at least every 5 minutes, 35-day window, backups and logs copied to a second region; documents versioned (an overwrite or delete loses nothing) and copied to the second region within 15 minutes; Keycloak accounts in its database (same PITR); realm configuration exported nightly and kept in git |
| **RTO** (time to serve patients again) | **4 hours** | Restore to a new database instance and repoint, documents from versions or the replica, backend and frontend from the registry, smoke checks; rehearsed by `scripts/restore-drill.sh` |

Budget for the 4 hours: 30 min to detect and decide; up to 2 h for the database PITR restore (managed-host restore
time grows with size; measure it in the production drill); 30 min to repoint secrets and start backend, Keycloak and
frontend; 30 min smoke checks and the role-portal smoke; the rest is margin.

**Drill, measured** (rerun quarterly and before launch; record each result here):

| Date | Where | Restored | Restore time | Result |
|---|---|---|---|---|
| 2026-10-15 | Local scratch stack (Docker Desktop, Windows 11), set from the dev stack | 136 tables / 798 rows (V96, migrated to V98), realm (7 bound + 3 custom flows), bucket (0 objects; 3 in a synthetic rerun) | **135 s** (realm import 71 s, mostly Keycloak start; backend start 40 s) | PASS: counts and checksums equal, health UP, Flyway V98, `/api/v1/me` 401/200, object version recovery |

The local drill restores a database dump, the realm export and a bucket snapshot into a scratch Compose stack and
runs the smoke checks; it does not time a managed-host PITR restore or a region failover, which the first
production drill must add to this table before real patient data is accepted.
