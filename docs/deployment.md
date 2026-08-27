# Deployment guide

## Recommended topology

- Deploy `frontend/Dockerfile` behind a CDN and TLS termination.
- Deploy `backend/Dockerfile` to a private application network behind an API load balancer.
- Use managed PostgreSQL with encryption, automated backups, point-in-time recovery, and restricted security groups.
- Use a dedicated private S3 bucket with public access blocked, versioning, lifecycle rules, access logging, and a narrowly scoped application role.
- Store database, SMTP, Turnstile, and KMS values in a managed secret store.

## Release sequence

1. Run the complete CI suite and scan both images and dependencies.
2. Provision database, bucket, KMS key if used, application roles, SMTP, DNS, TLS, WAF, secrets, and monitoring.
3. Deploy the backend with `SPRING_PROFILES_ACTIVE=prod`, `STORAGE_MODE=s3`, `MAIL_MODE=smtp`, and `TURNSTILE_ENABLED=true`.
4. Verify Flyway migration success and `/actuator/health` from inside the trusted network.
5. Build the frontend with its public environment values and deploy it.
6. Perform bilingual smoke tests, an upload/submit test using non-sensitive fixtures, email delivery verification, rollback rehearsal, and alert verification.

## Storage policy

Adapt the examples in `infrastructure/` with the real bucket, account, role, KMS key, and approved retention period. Do not grant the application `s3:ListBucket`, wildcard bucket access, or public-read permissions. Staff download access and malware scanning should use separate roles and workflows.

## Backups and migration

Flyway migrations run forward on startup. Test each migration against a recent sanitized snapshot and take a recoverable backup before production schema changes. Roll back application binaries independently; use a reviewed forward-fix migration instead of ad-hoc schema edits.

