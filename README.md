# RehletShifaa V1

RehletShifaa is a bilingual Arabic/English medical case-intake platform. Patients can learn how the service works, select a specialty, submit a concise case, upload private medical documents directly to object storage, and receive a human-readable reference number.

> Medical disclaimer: RehletShifaa is an intake and coordination service. It does not provide emergency care, diagnosis, or a substitute for professional medical advice.

## Product surface

- English and Arabic experiences with complete RTL support
- Premium, responsive marketing pages and specialty/consultant discovery
- Accessible multi-step case intake with consent and anti-spam support
- Private, presigned document uploads with server-side confirmation
- Transactional case submission and coordinator email notification
- Privacy, terms, and medical-disclaimer pages
- SEO metadata, sitemap, robots, canonical/hreflang, Open Graph image, and analytics abstraction
- Structured logs, correlation IDs, rate limiting, health endpoint, and OpenAPI UI

## Architecture

```text
Browser (Next.js) ── case metadata ──> Spring Boot API ──> PostgreSQL
       │                                      │
       └── presigned PUT ──────────────> private S3 bucket
                                              │
                                              └── minimal notification ──> SMTP
```

The API deliberately exposes no public case-retrieval endpoint. Uploaded objects use random keys that contain no patient identifiers. See [docs/architecture.md](docs/architecture.md) and [docs/security-and-production-readiness.md](docs/security-and-production-readiness.md).

## Repository layout

```text
frontend/       Next.js 16, React 19, TypeScript, Tailwind CSS
backend/        Spring Boot 3.5, Java 21, PostgreSQL, Flyway
docs/           Architecture, security, and deployment guides
infrastructure/ Least-privilege AWS policy and S3 lifecycle examples
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

Compose uses PostgreSQL, mock local document storage, and Mailpit. It is a development configuration only.

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
4. `POST /api/v1/cases/{caseId}/documents/{documentId}/confirm` verifies the remote object.
5. `POST /api/v1/cases/{caseId}/submit` validates consent and document state, marks the case submitted, and returns the public reference number.

Supported documents are PDF, JPEG, and PNG, up to the configured limit. Production uses the `s3` storage mode; local development uses `mock`.

## Configuration

Copy `frontend/.env.example` and `backend/.env.example`. The important production settings are:

- Frontend: public API/site URLs, WhatsApp number, Turnstile site key, and optional GA4/Google Ads identifiers.
- Backend: PostgreSQL credentials, CORS origins, Turnstile secret, SMTP settings, rate limits, and upload limits.
- Storage: region, private bucket, and either AES-256 or KMS server-side encryption.

Never place secrets in a `NEXT_PUBLIC_*` variable or commit real environment files. Production startup intentionally fails when required integrations are missing.

## Deployment

Build the two Dockerfiles and deploy them behind HTTPS. Use a managed PostgreSQL database, private object storage, a transactional SMTP provider, and a CDN/WAF in front of the frontend and API. Follow [docs/deployment.md](docs/deployment.md) before exposing the service to real patient information.

## Production readiness

The repository implements secure defaults, but operating a medical-data system also requires organizational controls: a jurisdiction-specific privacy/legal review, vendor agreements, access-control and audit procedures, incident response, retention decisions, backups and restore testing, monitoring, vulnerability management, and clinical escalation processes. The included legal copy is placeholder content and must be approved by qualified counsel.

