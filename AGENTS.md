# RehletShifaa — Codex Instructions

## 1. Canonical project context

Use this file as the default project context. Do **not** re-discover architecture or re-read broad docs unless the task requires it.

Current working branch:
- `codex/platform-control-plane`

Current active epic:
- **Platform users, roles, access, hierarchy, and virtual clinics**
- Live implementation checkpoint: `docs/platform-control-plane/section-1-implementation-status.md`
- Execution plan: `docs/platform-control-plane/platform-users-and-virtual-clinics-execution-plan.md`
- Requirements: `docs/platform-control-plane/platform-users-and-virtual-clinics-requirements.md`

Read the live implementation checkpoint first for this epic, then only the relevant execution-plan or requirements
section. Read `docs/commercial-workflow-status.md` only for commercial-workflow tasks. Read
`docs/end-to-end-workflows.md` or `docs/architecture.md` only when the requested change genuinely depends on them.

## 1a. Codex-to-Claude continuity

The live cross-agent handoff is `docs/platform-control-plane/section-1-implementation-status.md`. Keep its delivered
work, verification, open gaps, and **Next Section 1 slice** accurate at meaningful slice boundaries so another agent
can resume even if Codex stops because of a usage or context limit.

If Claude takes over an interrupted Codex session, it must preserve the existing working tree, inspect `git status`
and the targeted diff, read the live checkpoint, and continue from its next-slice section. It must not reset,
discard, or assume ownership of uncommitted changes without first understanding them. The taking-over agent records
new progress and verification in the same checkpoint file.

## 2. Stable development environment

The local Docker stack is exposed through a **named Cloudflare Tunnel** (`rehletshifaa-dev`). Do not use or introduce `trycloudflare.com` URLs.

Permanent development URLs:
- Frontend: `https://dev.rehletshifaa.com`
- Backend API: `https://api-dev.rehletshifaa.com`
- Keycloak: `https://auth-dev.rehletshifaa.com`
- MinIO/files: `https://files-dev.rehletshifaa.com`
- Mailpit: `https://mail-dev.rehletshifaa.com`

Local ports:
- Frontend `3000`
- Backend `8080`
- Keycloak `8180`
- MinIO API `9000`
- MinIO console `9001`
- Mailpit `8025`
- Redis `6379`
- API gateway `8081`

Docker files:
- Base: `docker-compose.yml`
- Stable tunnel overlay: `docker-compose.tunnel.yml`

Always start/rebuild the development stack with:
```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Never:
- run a base-only rebuild for the tunnel-served environment;
- delete Docker volumes unless explicitly requested;
- replace stable domain URLs with localhost or temporary tunnel URLs;
- expose tunnel secrets or copy `.env` credentials into source.

The `cloudflared` connector runs in Docker via the tunnel overlay and uses `CLOUDFLARE_TUNNEL_TOKEN` from local `.env`.

Keycloak web client:
- client id: `rehletshifaa-web`
- redirect URI: `https://dev.rehletshifaa.com/*`
- web origin: `https://dev.rehletshifaa.com`
- localhost equivalents may remain for local browser testing.

MinIO browser uploads must allow:
- `http://localhost:3000`
- `https://dev.rehletshifaa.com`

## 2a. API gateway and cache

`api-gateway` (nginx, `infrastructure/api-gateway/`) is the business-API entry point: routing,
request correlation, edge rate/size limits, upstream timeouts, security headers, access logging.
It makes no business decision — the backend re-authorizes every request. The `api-dev.rehletshifaa.com`
tunnel ingress points at `http://api-gateway:80`, so the gateway IS the live path; the frontend has one
business API base (`NEXT_PUBLIC_API_BASE_URL`) and no direct-backend fallback, ever.

Client identity at the gateway is Cloudflare's `CF-Connecting-IP` (realip module, trusted only from the
private network the cloudflared connector sits on; forwarded to the backend as `X-Forwarded-For`, which
the backend trusts under `RATE_LIMIT_TRUST_PROXY=true` in the tunnel overlay). Rate budgets are per real
client: reads 300/min (burst 60), writes 60/min (burst 30), `/api/v1/public/` 30/min (burst 15);
CORS preflights and health probes are never counted. Policy tests: `frontend/e2e/gateway.spec.ts`
(`GATEWAY_TEST_URL=http://localhost:8081`, which simulates clients via `CF-Connecting-IP`).

Redis is the shared cache. Only reference data is cached, declared in `CacheNames`:
`fx-rates` + `fx-rate-tables` (15m), `care-categories` (1h), `commercial-policy` (10m); TTLs are configured
under `app.cache.*`. Each cache has one value type declared by its owning module (`CacheSpec`), stored as
plain typed JSON under `rehletshifaa:cache:v1:` (bump the version on an incompatible type change); the
manager refuses undeclared cache names and applies puts/evictions after commit. Live workflow, payment,
authorization and clinical state is never cached. A Redis outage degrades to a database read with a
throttled `event.code=CACHE_UNAVAILABLE` warning; commands fail fast while disconnected.
`RequestRateLimiter` also counts in Redis so the write budget is shared across backend instances.

## 2b. Logging and observability

Backend logs are Spring Boot native ECS JSON on stdout (`LOG_FORMAT=` for plain text); the gateway access
log uses the same ECS names. Correlation id = `X-Request-ID` = ECS `http.request.id` = `requestId` in every
error body = `audit_events.correlation_id`. Stable codes go in `event.code`. Never log exception messages
from mail/identity providers or encrypted fields (names, task titles). Opt-in Elasticsearch/Kibana/Filebeat:
`docker-compose.observability.yml` (see `infrastructure/observability/README.md`; ~3 GB RAM, stop it when idle).

## 2c. Persistence

Spring Data JPA (owner decision 2026-10-06; `docs/platform-control-plane/technical-decisions.md` §29). Read
`docs/platform-control-plane/jpa-migration-status.md` before touching persistence. Repositories extend
`BaseRepository` (use `lockById` for row locks). Prove mappings on PostgreSQL with `PostgresJpaMappingTest`.
No new plain SQL: `ArchitectureRulesTest` allows `org.springframework.jdbc..`/`java.sql..` only in the listed
not-yet-converted classes (`JDBC_NOT_YET_CONVERTED`, shrink-only), and no native queries. The same test enforces the
layers (controllers → application use cases → repositories in `..infrastructure..`, entities in `..domain..`), that
tokens carry no business authority (no role mapping from Keycloak), and that retired compatibility names
(`Legacy*`, `compatibilityRole`, provider organizations) stay gone. Add an exception only as an explicit, documented,
shrink-only list.

## 3. Technology map

Frontend:
- Next.js
- public runtime/build values use `NEXT_PUBLIC_*`
- important: `NEXT_PUBLIC_*` changes require a frontend rebuild

Backend:
- Spring Boot
- PostgreSQL
- Flyway
- Keycloak OIDC/JWT
- MinIO S3-compatible storage
- Redis (Spring Cache; reference data only)
- ClamAV document scanning
- Mailpit SMTP in local/dev

Identity:
- Keycloak realm: `rehletshifaa`
- realm source: `infrastructure/keycloak/realm-rehletshifaa.json`

Deployment:
- local/dev uses Docker Compose + named Cloudflare Tunnel
- `deploy/oracle/` is a separate public VM deployment; do not use it for local tasks unless explicitly requested

## 4. Token-efficient working rules

Default behavior:
1. Inspect only the files directly relevant to the request.
2. Use targeted search for exact symbols, endpoints, configuration keys, or error messages.
3. Do not scan the whole repository, all docs, all tests, or all logs unless necessary.
4. Reuse known project facts from this file instead of re-deriving them.
5. Reuse existing implementation patterns before creating new abstractions.
6. Prefer the smallest correct patch.
7. Do not re-open unchanged files repeatedly.
8. Do not repeat already-successful commands unless code affecting them changed.
9. Summarize long logs; inspect only the lines around the failure.
10. Keep progress updates and final responses concise.

For debugging, start from the failing boundary:
- browser/network error -> inspect the called frontend code + endpoint only;
- API `4xx/5xx` -> inspect the matching backend controller/service/security path;
- auth failure -> inspect Keycloak/OIDC config and token path only;
- upload failure -> inspect presign code + MinIO/CORS + exact request headers;
- database failure -> inspect the relevant entity/repository/migration only.

Do not perform broad architecture reviews during a bug fix unless evidence shows the issue is architectural.

## 4a. Model selection and delegation

The owner authorizes sub-agent delegation for this project when it materially improves delivery or review.
Use sub-agents within the current task; do not create separate user-facing chats unless requested.
Small, coherent changes should stay with one agent. Delegation does not authorize additional product scope,
deployment, destructive operations, or bypassing an explicit decision gate.

### Select by complexity and consequence

These are project defaults, informed by [OpenAI model guidance](https://developers.openai.com/api/docs/guides/model-selection)
(reviewed 2026-10-05), not a requirement to use every model on every task.

| Work | Preferred model | Reasoning | RehletShifaa examples |
|---|---|---|---|
| Small, precisely bounded, low-risk work | `gpt-6-luna` | low or medium | Targeted file discovery, summarizing test output, copy/style edits, documentation of already-verified behavior |
| Normal implementation with clear requirements and established patterns | `gpt-6.1-sol` | medium; high for several interacting components | Control Center forms, API client integration, ordinary service changes, focused regression tests, dev fixtures |
| Security-sensitive or structurally complex implementation | `gpt-6-astra` | high | Role/scope policy, identity adoption, separation of duties, owner governance, patient-data visibility, migration design, transactional admission and concurrency |
| Unresolved cross-module failures or independent review of critical changes | `gpt-6-astra` | high; xhigh when specific unresolved reasoning warrants it | Privilege escalation review, conflicting invariants, race conditions, rollback and version-pinning analysis |

Classify by the consequences of a mistake, not patch size. A one-line authorization change belongs in the
critical category. Do not assign Luna sole responsibility for security policy, identity decisions, migration
design or final review of sensitive changes. Max/ultra is not a default; increase effort only for a concrete
unresolved problem, not merely because a task is long.

### Delegation workflow

1. The primary agent owns scope, contracts, integration, final verification and the checkpoint. For the current
   platform epic, prefer Astra/high for design and critical review, Sol for bounded implementation, and Luna
   only for suitable small tasks. This does not change the current chat's selected model automatically.
2. Before spawning, give a concise task, allowed files, relevant requirements/invariants, expected result and
   verification command. Pass only necessary context; include the applicable `AGENTS.md` instructions and
   checkpoint references. Use the tool's supported context mode when selecting a different model.
3. Delegate independent work in parallel after shared API/schema contracts are settled. Give each editable file
   one owner at a time. Keep migrations, shared authority policy and checkpoint integration under one designated
   writer. Review agents should be read-only unless explicitly reassigned an implementation task.
4. Normally use at most two workers plus the primary agent, within the runtime's actual limit. Sub-agents must
   return to the primary agent before further delegation. Do not duplicate investigations or parallelize tasks
   whose results depend on unfinished work.
5. Serialize tests/builds that share output directories, databases, fixtures or the running Docker stack. Do not
   let one agent clear test classes, rebuild services or mutate live fixtures while another uses them.
6. Require handbacks with changed files, behavior, tests actually run, failures and unresolved assumptions.
   Inspect the resulting diff and verify integration; a sub-agent's completion claim is not verification.
   Obtain independent Astra review for critical authorization, identity, governance and admission changes when
   that model and delegation are available. Fix findings before claiming completion.
7. Escalate Luna to Sol when work needs nontrivial design; escalate Sol to Astra when security boundaries,
   cross-module invariants or concurrency become uncertain, or a focused attempted fix leaves the cause unclear.
   Pass the evidence and failed approach rather than restarting broad discovery.

Use only model IDs and reasoning levels exposed by the active tool/runtime. If a preferred model is unavailable,
use a suitable available model (including the current one) and briefly report the substitution. Never claim a
model was used or switched when it was not. Model unavailability alone should not block useful authorized work;
report any critical review that could not be obtained. Explicit user model choices take precedence.

## 5. Verification strategy

Use the smallest verification proportional to the change.

Frontend:
- focused component/type check first
- general gate: `cd frontend && pnpm typecheck`

Backend:
- focused relevant test first
- general local gate: `cd backend && mvn -o -q test`
- Maven is offline; do not add dependencies that are absent from local `~/.m2`

Local end-to-end (`cd frontend && pnpm test:e2e`, nothing else running on :3100): Playwright builds the frontend and runs
`next start`, 4 workers, about three minutes for the full suite, which is green apart from env-gated live specs.
`PLAYWRIGHT_DEV_SERVER=true` uses `next dev` for quick targeted runs only: under parallel workers the dev server can
corrupt `.next/dev/prerender-manifest.json` mid-run and fail every later page.

End-to-end (Playwright, Chromium) against the running tunnel stack — all three URLs must match how
the frontend was built, or the specs’ route mocks never intercept:
```bash
cd frontend
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=https://dev.rehletshifaa.com PLAYWRIGHT_API_BASE_URL=https://api-dev.rehletshifaa.com PLAYWRIGHT_OIDC_AUTHORITY=https://auth-dev.rehletshifaa.com/realms/rehletshifaa pnpm test:e2e
```
Add `PORTAL_TEST_PASSWORD` to include `portal-live.spec.ts`, which signs in through real Keycloak, and
`PORTAL_TEST_CASE=<acknowledged case number>` (optionally `PORTAL_TEST_CASE_2`) for
`portal-gateway-live.spec.ts`: coordinator, consultant and patient journeys through the real
gateway path, asserting zero 429s and zero failed business calls. `operations-gate-live.spec.ts`
(needs `DOCTOR_TEST_PASSWORD`, `OPERATIONS_TEST_PASSWORD`, `FINANCE_TEST_PASSWORD` too) builds its
own fixture over HTTP — intake → consultant → proposal → pre-release Operations step → release →
patient acknowledgement via Mailpit-read secure links/OTPs — then proves the TRAVEL_COORDINATION gate.
The seeded QA identities (`LocalDemoDataSeeder` registers operations/finance as staff) are all it needs;
no data is seeded by hand.

Run broader verification only when:
- shared infrastructure/API/auth/database/security is changed;
- a focused check fails;
- multiple modules are affected;
- release/merge verification is requested.

Do not run full production builds or E2E suites for cosmetic/config-only changes unless required.

## 6. Database rules

Flyway migrations are additive and immutable once committed to `main`.
- Never edit existing `V1`–`V15`.
- Add `V16+`.
- Pre-production (no environment holds data to keep, decided 2026-09-26): migrations not yet on `main` state the
  final design and may be squashed or edited in place; the local dev database is then recreated. Do not add
  data-migration, backfill, parity or compatibility layers for pre-production data — replace legacy directly.
- Keep migrations H2-safe.
- Use `TIMESTAMP WITH TIME ZONE`.
- Avoid partial indexes.
- Use one `ADD COLUMN` per `ALTER`.
- Keep fixed seed UUIDs where existing patterns require them.

## 7. Change discipline

Before editing:
- identify the minimum affected files;
- state a short implementation plan only if the task is non-trivial.

While editing:
- preserve existing behavior outside task scope;
- do not rewrite unrelated code;
- do not change public contracts without need;
- never commit secrets.

After editing:
- run the smallest relevant verification once;
- report changed files, key behavior change, and verification result;
- mention any important check intentionally skipped.

## 8. User override

If the user explicitly requests broader analysis, exhaustive verification, refactoring, or a different testing level, follow that request.
