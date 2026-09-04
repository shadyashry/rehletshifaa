# Oracle Cloud Free VM deployment

This bundle runs the full RehletShifaa stack on one Oracle Cloud Infrastructure Ampere A1 VM. It is appropriate for a low-traffic pilot or controlled launch. It is not highly available: one VM, one PostgreSQL instance, and one MinIO disk remain single points of failure.

## 1. Provision the VM

Create the instance in the tenancy home region:

- Shape: `VM.Standard.A1.Flex` (Arm). Allocate at least 2 OCPUs and 12 GB RAM; use a larger Always Free allowance only if the OCI console explicitly shows it for your tenancy.
- Image: Ubuntu 24.04 LTS Arm64.
- Boot volume: 100–150 GB, within your available free block-volume allowance.
- Public IPv4: enabled and reserved if available.
- SSH: key authentication only.

Create an OCI Network Security Group for the VM. Allow inbound TCP 80 and 443 from `0.0.0.0/0`, UDP 443 if HTTP/3 is desired, and TCP 22 only from your administration IP. Do not open 3000, 5432, 8080, 8180, 9000, 9001, or 3310. OCI networking and the host firewall are separate controls; both must permit 80/443.

## 2. Configure DNS and external services

Create four A records pointing to the VM public IP:

- `care.your-domain.tld` — web application
- `api.your-domain.tld` — API
- `auth.your-domain.tld` — Keycloak
- `storage.your-domain.tld` — private S3-compatible endpoint

Do this before starting Caddy so ACME certificate issuance can succeed. If Cloudflare proxies the records, use Full (strict) TLS and ensure WebSockets are allowed. Never use Flexible TLS.

Provision these external integrations before deployment:

- Transactional SMTP on port 587/465. OCI blocks outbound port 25 by default.
- WhatsApp provider webhook and bearer token.
- Cloudflare Turnstile site and secret keys for the exact web hostname.
- Outbound HTTPS for daily currency rates (`open.er-api.com` by default; override with `CURRENCY_PROVIDER_URL`, or set `CURRENCY_API_ENABLED=false` and have senior Finance pin rates manually). Prices are held in EGP and converted for the patient; rates are frozen onto each released document.

## 3. Prepare the host

Clone the repository to `/opt/rehletshifaa`, then run:

```bash
cd /opt/rehletshifaa
sudo bash deploy/oracle/scripts/bootstrap-ubuntu.sh
```

Sign out and back in. The script installs Docker Compose, enables automatic security updates, opens only SSH/HTTP/HTTPS in UFW, and creates protected application and backup directories.

The full stack requires at least 10 GB RAM because Keycloak and ClamAV are memory-intensive. The deployment intentionally rejects the 1 GB E2 micro shape.

## 4. Supply production configuration

```bash
cd /opt/rehletshifaa/deploy/oracle
cp .env.example .env
chmod 600 .env
```

Replace every placeholder. Generate a different value for each password and pepper:

```bash
openssl rand -base64 48
```

Do not place secrets in `NEXT_PUBLIC_*`; those values are compiled into browser assets. Keep `.env` out of Git and back it up separately in an approved secret manager.

Prepare the backup encryption secret outside the repository:

```bash
sudo sh -c 'umask 077; openssl rand -base64 48 > /etc/rehletshifaa/backup-passphrase'
sudo chown root:docker /etc/rehletshifaa/backup-passphrase
sudo chmod 640 /etc/rehletshifaa/backup-passphrase
```

## 5. Deploy and verify

```bash
cd /opt/rehletshifaa
bash deploy/oracle/scripts/preflight.sh
bash deploy/oracle/scripts/deploy.sh
bash deploy/oracle/scripts/healthcheck.sh
```

The first start can take several minutes while images build, ClamAV downloads signatures, Keycloak initializes its database, and Caddy obtains certificates. View status and sanitized logs with:

```bash
docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml ps
docker compose --env-file deploy/oracle/.env -f deploy/oracle/docker-compose.yml logs --tail=100 SERVICE_NAME
```

The deployment exposes only Caddy. PostgreSQL, Spring Boot, Next.js, Keycloak's management port, MinIO, its console, and ClamAV remain on the Docker network. Caddy blocks external actuator, OpenAPI, Swagger, and MinIO administrative paths.

## 6. Complete identity setup

Open `https://auth.your-domain.tld/admin` and sign in with the bootstrap administrator. Immediately:

1. Create named administrator accounts; avoid daily use of the bootstrap account.
2. Require MFA for staff and privileged roles.
3. Create each staff identity and assign only the required realm role.
4. Test email verification and password reset through the configured SMTP provider.
5. Review session duration, brute-force detection, audit events, and account recovery.

The production realm contains no demo users or default staff passwords. Realm import runs only when the realm does not already exist; later JSON edits must be applied through a reviewed Keycloak migration or Admin API process.

## 7. Back up and update

Create an encrypted application, identity, and document backup:

```bash
cd /opt/rehletshifaa
bash deploy/oracle/scripts/backup.sh
```

Copy every resulting `.tar.gz.enc` file off the VM to an encrypted, access-controlled location. A backup on the same boot volume is not disaster recovery. Test restoration on a separate non-production VM before accepting real patient data.

For an application update:

```bash
cd /opt/rehletshifaa
git pull --ff-only
bash deploy/oracle/scripts/backup.sh
bash deploy/oracle/scripts/deploy.sh
bash deploy/oracle/scripts/healthcheck.sh
```

Flyway applies forward database migrations when the backend starts. Take a verified backup first and use reviewed forward-fix migrations; do not edit the schema manually.

## Operational limits and go-live gate

This single-VM design optimizes for the free tier, not resilience. Monitor disk, RAM, container health, certificate renewal, ClamAV signatures, failed notification outbox entries, and backup age. Configure external uptime monitoring and OCI alarms. Keep at least 20% disk free.

Before real patient data is accepted, complete the legal/privacy review, vendor agreements, penetration and dependency testing, backup-restore rehearsal, incident response, retention/deletion policy, staff access review, and the checklist in `security-and-production-readiness.md`. For a larger or regulated production launch, move PostgreSQL and object storage to managed encrypted services and run multiple application/identity instances behind a load balancer.

