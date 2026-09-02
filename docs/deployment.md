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
3. Deploy the backend with `SPRING_PROFILES_ACTIVE=prod`, OIDC issuer/JWK configuration, `APP_SECURITY_ENABLED=true`, `STORAGE_MODE=s3`, a non-default claim pepper, scanning, `NOTIFICATIONS_MODE=live`, `MAIL_MODE=smtp`, `WHATSAPP_MODE=webhook`, and `TURNSTILE_ENABLED=true`.
4. Verify Flyway migration success and `/actuator/health` from inside the trusted network.
5. Build the frontend with API/site and OIDC public values at image-build time, then deploy it.
6. Perform bilingual role-portal smoke tests, patient claim, clean/malicious upload, complete proposal approval, email/WhatsApp delivery, backup restore, rollback rehearsal, and alert verification using non-sensitive fixtures.

## Storage policy

Adapt the examples in `infrastructure/` with the real bucket, account, role, KMS key, and approved retention period. Do not grant `s3:ListBucket`, wildcard bucket access, or public-read permissions. The application role is restricted to the randomized `medical/` prefix and object tags distinguish pending from clean uploads.

## Backups and migration

Flyway migrations run forward on startup. Test each migration against a recent sanitized snapshot and take a recoverable backup before production schema changes. Roll back application binaries independently; use a reviewed forward-fix migration instead of ad-hoc schema edits.
