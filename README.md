# RehletShifaa Care Platform

RehletShifaa is a bilingual Arabic/English international-care coordination platform. It connects a verified patient request to an accountable coordinator, credentialed consultant, operations, finance, treatment, and follow-up workflow.

> Medical disclaimer: RehletShifaa is an intake and coordination service. It does not provide emergency care, diagnosis, or a substitute for professional medical advice.

## Product surface

- English and Arabic experiences with complete RTL support
- Premium, responsive marketing pages and specialty/consultant discovery
- Accessible multi-step case intake with consent and anti-spam support
- Private, presigned document uploads with server-side confirmation
- OTP-protected case status and information-response links (contact-verified secure access — not legal identity) before account activation, with a patient-chosen WhatsApp or email channel
- Patient conversion layer: resumable onboarding, legal identity verification (behind a provider port), applicable consents, deposit satisfaction/waiver, and a backend-computed customer-readiness gate before chargeable coordination
- Role-scoped portals for patients, coordinators, doctors, operations, finance, credentialing, patient-identity review, administration, and audit
- Versioned clinical reviews and proposals with clinical, operational, finance, and patient approvals
- Durable notification outbox, immutable audit events, tasks, secure case messages, travel, treatment, and follow-up records
- Privacy, terms, and medical-disclaimer pages
- SEO metadata, sitemap, robots, canonical/hreflang, Open Graph image, and analytics abstraction
- Structured logs, correlation IDs, rate limiting, health endpoint, and OpenAPI UI

## Architecture

```text
Browser (Next.js + OIDC PKCE) ── JWT ──> Spring Boot API ──> PostgreSQL
             │                                │       │
             └── presigned PUT/GET ──> private S3     └── durable outbox ──> SMTP/WhatsApp
                                              │
                                         quarantine + ClamAV
```

Anonymous users can create and submit a case without registering. Purpose-scoped secure links plus on-demand OTP verification provide limited pre-acceptance access; full account activation is invited only after proposal acceptance and automatically links the existing profile. Authenticated reads are object-authorized and audited. See [docs/architecture.md](docs/architecture.md), [docs/end-to-end-workflows.md](docs/end-to-end-workflows.md), and [docs/security-and-production-readiness.md](docs/security-and-production-readiness.md).

## Repository layout

```text
frontend/       Next.js 16, React 19, TypeScript, Tailwind CSS
backend/        Spring Boot 3.5, Java 21, PostgreSQL, Flyway
docs/           Architecture, security, and deployment guides
infrastructure/ Least-privilege AWS policy and S3 lifecycle examples
deploy/oracle/  Oracle A1 single-VM production deployment bundle
```

## Run locally

The shortest path is Docker Compose:

```bash
docker compose up --build
```

Then open:

- Web: http://localhost:3000/en (Arabic: `/ar`)
- API docs: http://localhost:8080/swagger-ui.html
- Health: http://localhost:8080/actuator/health
- Mailpit: http://localhost:8025
- Patient/staff portal: http://localhost:3000/en/portal (Arabic: `/ar/portal`)
- Keycloak: http://localhost:8180 (admin console: `admin` / `Admin123!`)
- MinIO console: http://localhost:9001 (`rehletshifaa` / `RehletShifaaLocal123!`)

Compose uses PostgreSQL, Keycloak, private MinIO storage, ClamAV, and Mailpit. It is a development configuration only. Sign-in uses the Keycloak-hosted, branded `rehletshifaa` login theme (bilingual EN/AR with RTL). Local portal users and passwords are documented in [docs/local-development.md](docs/local-development.md).

To run each application directly:

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev

cd ../backend
cp .env.example .env
mvn spring-boot:run
```

Create the `rehletshifaa` PostgreSQL database before starting the backend. Spring/Flyway applies the schema automatically.

## Quality gates

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd ../backend
mvn verify
```

CI runs these checks on every pull request and push to `main`. Frontend unit tests cover the intake schema, Playwright covers the principal case flow, and backend tests cover the service, controller, document workflow, and Flyway migration.

## API flow

1. `POST /api/v1/cases` creates a draft case and returns its UUID.
2. For each document, `POST /api/v1/cases/{caseId}/documents/presign` returns a short-lived upload URL.
3. The browser uploads the document directly using `PUT`.
4. `POST /api/v1/cases/{caseId}/documents/confirm` verifies metadata, quarantines and scans the object, and marks it clean or rejects it.
5. `POST /api/v1/cases/{caseId}/submit` validates consent and document state, marks the case submitted, and returns the public reference number.

6. The returned status link uses `/api/v1/public/cases/{token}`; requesting access creates an OTP, verification creates a short-lived grant, and that grant permits high-level status or a purpose-scoped information response.
7. The released proposal uses `/api/v1/public/proposals/{token}` with a separate OTP/grant before sensitive detail or a decision is exposed.
8. After acceptance, `POST /api/v1/patient/account/activate` links the provisional profile to the signed-in patient. Role-specific endpoints drive the remaining journey.

Supported documents are PDF, JPEG, and PNG, subject to per-file, per-case count, and aggregate-size limits. Production and Docker Compose use private S3-compatible storage; tests can use the in-memory adapter.

## Configuration

Copy `frontend/.env.example` and `backend/.env.example`. The important production settings are:

- Frontend: public API/site URLs, OIDC authority/client, WhatsApp number, Turnstile site key, and optional analytics identifiers.
- Backend: PostgreSQL, OIDC/JWK, token pepper, PII/outbox encryption key, API/web public URLs, CORS, Turnstile, SMTP/WhatsApp, rate limits, upload quotas, ClamAV, and notification-worker settings.
- Storage: region, private bucket, and either AES-256 or KMS server-side encryption.

Never place secrets in a `NEXT_PUBLIC_*` variable or commit real environment files. Production startup intentionally fails when required integrations are missing.

## Deployment

For an Oracle Cloud Always Free-class Ampere A1 VM, follow [docs/oracle-free-vm-deployment.md](docs/oracle-free-vm-deployment.md). The separate production Compose bundle uses Caddy TLS, private container networking, PostgreSQL-backed Keycloak, private MinIO storage, ClamAV, resource limits, secret preflight checks, health checks, and encrypted backups.

For higher availability, build the two application images and use managed PostgreSQL, private object storage, a transactional SMTP provider, and a CDN/WAF in front of the frontend and API. Follow [docs/deployment.md](docs/deployment.md) before exposing the service to real patient information.

## Production readiness

The repository implements secure defaults, but operating a medical-data system also requires organizational controls: a jurisdiction-specific privacy/legal review, vendor agreements, access-control and audit procedures, incident response, retention decisions, backups and restore testing, monitoring, vulnerability management, and clinical escalation processes. The included legal copy is placeholder content and must be approved by qualified counsel.
