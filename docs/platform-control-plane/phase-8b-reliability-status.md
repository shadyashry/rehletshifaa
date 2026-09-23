# Phase 8B — runtime reliability and recovery status

Date: 2026-09-23. Scope: Phase 8B only. No Phase 8C (Playwright/live E2E, EN/AR, RTL, mobile, accessibility, visual) or Phase 8D work, no Journey production enablement, no new infrastructure. Flyway stays at **V50** (no schema change was needed).

## Handoff state discovered (Codex, uncommitted)

Codex had started only slice 1 before its usage limit:

| Slice | State at handoff | State now |
|---|---|---|
| 1. Crash-safe outbox transitions | PARTIALLY IMPLEMENTED — `claim()` parked expired final-attempt leases as `DEAD_LETTER/UNKNOWN_OUTCOME` and skipped exhausted rows; `recordDelivered`/`recordFailure` fenced on `status='PROCESSING' AND attempts=?`; delivery counters/logs; two store tests | IMPLEMENTED / TESTED (Codex's work kept unchanged, completed below) |
| 2. Retryable, fail-closed scanner outages | NOT STARTED | IMPLEMENTED / TESTED |
| 3. Shadow-comparison isolation | NOT STARTED | IMPLEMENTED / TESTED |
| 4. Finite timeouts + readiness + graceful shutdown | NOT STARTED | IMPLEMENTED / TESTED |

## What was completed

### 1. Outbox (`NotificationOutboxStore`, `NotificationOutboxProcessor`)
- **Unknown outcome after a successful send** — previously a failure *recording* delivery was caught by the provider-failure handler and booked `RETRY`, scheduling a deliberate duplicate send. Provider failure and outcome-recording failure are now separate; an unrecorded success is counted (`delivered_unrecorded`), logged, and left to lease expiry exactly like a crash at that point.
- **Lease overrun duplicate** — a batch of 20 slow sends could run past the 300 s lease, letting another instance reclaim and send a message the first worker was about to send. Each claimed message now carries `leaseExpiresAt`; no send starts within `SEND_MARGIN` (60 s) of expiry. Unstarted claims are handed back with `release()` (status `RETRY`, due now, the unmade attempt refunded).
- **Shutdown** — on `ContextClosedEvent` no new batch is claimed and remaining claims of the current batch are released, not stranded for 5 minutes.
- **Permanent failures** — `TEMPLATE_FAILURE` is dead-lettered immediately instead of burning all attempts (the old comment already said "never retryable"). `CHANNEL_NOT_CONFIGURED`/`PROVIDER_FAILURE` stay retryable and bounded by `max_attempts`.
- **Observability** — `notification.delivery{channel,outcome=delivered|retry|dead_letter|delivered_unrecorded|dead_letter_unknown_outcome}` plus WARN/ERROR logs; dead letters stay queryable in `notification_outbox`.
- Delivery semantics are **at-least-once**. SMTP has no idempotency key, so a crash between provider acceptance and the outcome write can still re-send once on a non-final attempt; the final attempt is parked instead. This is the strongest guarantee the current transports allow.

### 2. Malware scanner outage (`ClamAvDocumentInspector`, `DocumentService`, `ProviderCredentialService`)
- **HIGH, fixed — fail-open parse**: the clamd reply was tested for `"OK"` before `"FOUND"`, so a signature name containing `OK` (e.g. `…OKLoader-1 FOUND`) read as clean. Now any `FOUND` is malware and only an exact `stream: OK` is clean.
- **HIGH, fixed — outage caused permanent misclassification**: an unreachable/erroring scanner set a medical document to terminal `SCAN_FAILED` and deleted it. `validateSubmittable` blocks on `SCAN_FAILED` and there is no document-removal route, so a brief ClamAV outage permanently blocked that draft's submission. Credential evidence was marked `REJECTED` and deleted.
- `InspectionResult` now has an explicit `retryable` flag: `CLEAN`, `MALWARE_FOUND`, `SCAN_SIZE_LIMIT` (permanent) versus `SCANNER_UNAVAILABLE`/`SCANNER_ERROR` (retryable non-verdict). On a retryable result the document returns to `PENDING`, keeps its stored object and gets `503 DOCUMENT_SCAN_UNAVAILABLE`. Evidence stays `PENDING` with its staged upload and gets `503 EVIDENCE_SCAN_UNAVAILABLE`. `PENDING` is still unusable: submission is blocked, downloads need `CLEAN`, and evidence cannot be decided. Fail-closed is unchanged.
- Recovery: the same confirm succeeds once the scanner returns. Confirming an already-`CLEAN` document returns `CLEAN` again, so a retry after a lost response is idempotent.
- Frontend: `CaseForm` re-confirms the same stored upload on retry instead of presigning a new document, which would have left the first `PENDING` and blocked submission.
- Observability: `document.scan{outcome}` and a WARN log on every non-verdict.

### 3. Shadow comparison isolation (`JourneyLiveShadowService`, `JourneyProjectionService`)
- **HIGH, fixed**: the Phase 7C comparator ran inline in `project()` inside the case-submission transaction, and Phase 7A rolls back the whole `submit()` on any exception. A comparator bug or evidence-insert failure therefore rolled back a real patient submission.
- `compareIsolated()` is now the only production entry point. It runs under a SQL savepoint on the transaction-bound `JdbcClient`, rolls back to it on failure, and never throws. On PostgreSQL a failed statement aborts the whole transaction unless a savepoint is rolled back, so a catch alone would not have been enough. It still has to read the uncommitted case and task rows, so it runs neither in `REQUIRES_NEW` nor asynchronously.
- `Propagation.NESTED` was tried first. It is unavailable because Hibernate's `JpaDialect` exposes no Spring `SavepointManager`. Direct `java.sql.Connection` savepoints are forbidden by `ArchitectureRulesTest`.
- Failure observability: `journey.shadow.comparison.failure{exception}`, WARN log, `JOURNEY_LIVE_SHADOW_FAILED` audit through the existing `REQUIRES_NEW` audit. Exception class only, never its message.
- Still non-mutating: it never calls a runtime, handler, assignment, notification or payment path. Real-submission test: an evidence row is really written and then the comparator throws. Result: case `RECEIVED`, one binding, one Flowable instance, one WorkItem, one projection, zero evidence rows, failure metric +1, one failure audit.

### 4. Timeouts, readiness, graceful shutdown
- **HIGH, fixed — unbounded remote calls**: JavaMail (no socket timeouts), Keycloak admin (`RestClient.create()`), the JWKS fetch (Nimbus default `RestTemplate`), and WhatsApp, Turnstile and FX clients (Boot builder without timeouts) could all wait forever. The single scheduler thread shared by outbox, proposal-expiry, credential-expiry and queue-retry jobs would freeze on one stalled SMTP server.
  - `spring.http.client.connect-timeout=5s`, `read-timeout=15s` apply to every Boot-built `RestClient`/`RestTemplate`. Keycloak staff/patient services and the JWKS decoder now use the Boot builders.
  - SMTP: connect 5 s, read 15 s, write 15 s.
  - Already finite and unchanged: Redis 2 s/2 s, ClamAV 10 s connect/read, S3 (`UrlConnectionHttpClient` SDK defaults: connect 2 s, socket 30 s). The S3 presigner is local signing.
  - Invariant tested: the slowest single SMTP (35 s) or HTTP (20 s) delivery is shorter than the outbox `SEND_MARGIN` (60 s).
- **Readiness**: `liveness = livenessState`; `readiness = readinessState + db`. The database is the only dependency no request can do without. Deliberately excluded:
  - Redis: cache and rate limiter fall back to the database or local counting.
  - SMTP: the outbox retries.
  - ClamAV: only upload confirmation needs it, and it fails closed with 503.
  - Journey runtime: cutover is off.
  - Disk space.
  
  Oracle deploy already probes `/actuator/health/readiness`.
- **Graceful shutdown**:
  - `server.shutdown=graceful` stops accepting requests and lets in-flight ones finish.
  - `spring.lifecycle.timeout-per-shutdown-phase=25s`.
  - The scheduler awaits running jobs for up to 30 s and starts no new executions after context close.
  - The outbox releases unstarted claims.
  - Total bound 55 s, below the Oracle backend `stop_grace_period` (60 s) and the new local compose `stop_grace_period: 60s` (Docker's 10 s default would SIGKILL mid-drain).
  - The Dockerfile uses exec-form `ENTRYPOINT`, so the JVM receives SIGTERM.

### Also fixed during the review
- **MEDIUM — queue recovery starvation**: `CoordinationQueueRetry` aborted the whole pass on the first failing case. The queue is read in case-id order, so one poison case starved every case after it. Each case now fails alone.
- **MEDIUM — error semantics**:
  - Concurrency losers (optimistic version, lock wait, deadlock) returned 500. They now return `409 CONCURRENT_MODIFICATION`.
  - Database unavailability returned 500. It now returns `503 SERVICE_UNAVAILABLE` with `Retry-After: 5`.
  - `ApiError` contract and no-leak behaviour are unchanged.

## Phase 8B review classification

| Area | Result | Evidence / note |
|---|---|---|
| Transaction boundaries | FIXED + VERIFIED | Shadow isolation fixed. Outbox provider calls stay outside transactions (three short store transactions). Flowable shares the business TM and DataSource, so bind/start/projection is atomic with `submit()` (7A test). Audit is `REQUIRES_NEW`. |
| Lost-response retry / idempotency | FIXED + VERIFIED | Document confirm is now idempotent. Payment receipts and refunds are idempotent on key. Coordination commands and credential decisions carry idempotency keys and revisions. OTP/grant consumption is single-use. A repeated case submit returns `409 CASE_NOT_DRAFT` (no duplicate; the client sees a conflict, not the original success — Phase 8C UX item). |
| Concurrency | FIXED + VERIFIED | Submit row lock (7B two-thread test); outbox `SKIP LOCKED` + lease + attempt fencing; optimistic-lock losers now 409. |
| Journey restart / recovery | VERIFIED | Engine state is in the same database and transaction; no Flowable async executor; projection idempotent per runtime task reference; bindings/admissions immutable; cutover snapshot per process. |
| DB outage | FIXED (semantics) / DEFERRED — INFRASTRUCTURE (live test) | Readiness goes DOWN; requests get 503 after Hikari's 30 s acquire timeout; schedulers log and retry next cycle; the outbox loses nothing. Not exercised against a real stopped PostgreSQL. |
| Keycloak outage | FIXED (timeouts) / VERIFIED (fail-closed) | Admin calls and JWKS refresh are bounded at 5 s + 15 s. Token validation uses the cached JWKS, then fails closed (401). Onboarding/invite errors are translated to neutral API errors. Some Keycloak calls occur inside DB transactions and hold a connection for up to 20 s during an outage (MEDIUM debt below). |
| Object-storage outage | VERIFIED (fail-closed/recoverable) | Presign is local. A verify/read failure rolls back confirm and the document stays `PENDING`, so it is retryable. Surfaces as generic 500, not 503 (LOW debt). |
| Notification / webhook reliability | FIXED + VERIFIED | Outbox above. Meta webhook HMAC, duplicate-event uniqueness and monotonic status are unchanged (8A). |
| Queue / fallback recovery | FIXED | Per-case isolation in `CoordinationQueueRetry`. Journey routing already falls back to the unassigned queue on engine error. |
| Schedulers / multi-instance | VERIFIED | Outbox: `SKIP LOCKED` + lease + fencing. Proposal/credential expiry: conditional `UPDATE … WHERE status IN`, idempotent across instances; provider events deduped by key. Queue retry: `repo.lock()` serializes. Rate limit shared in Redis (per-instance on Redis outage). Flyway takes its own migration lock. |
| Health / readiness | FIXED | See slice 4. |
| Observability | FIXED (signals) / DEFERRED — INFRASTRUCTURE (export) | New counters, logs and audits listed above; structured JSON logs. Actuator exposes `health` only, so Micrometer counters (including the 7B/7C ones) are not externally scrapeable. A secured metrics exporter and backend are an infrastructure decision. |
| Backup / restore | DEFERRED — INFRASTRUCTURE | `deploy/oracle/scripts/backup.sh`: encrypted `pg_dump` of the app and Keycloak databases plus objects. No restore rehearsal performed. The three stores are dumped at different instants (not point-in-time consistent). |
| Startup / Flyway | VERIFIED | Additive V1–V50, `ddl-auto=validate`, Flyway clean disabled by default. A migration failure aborts startup, so readiness is never UP. Journey schema update stays off by default. |

## Findings by severity

- **CRITICAL**: none found.
- **HIGH** (all fixed):
  1. ClamAV reply parsed `OK` before `FOUND` (fail-open).
  2. Scanner outage permanently condemned uploads and blocked draft submission or rejected evidence.
  3. Shadow comparator failure rolled back real case submission.
  4. Unbounded SMTP, Keycloak, JWKS and outbound HTTP calls could freeze request threads and the single scheduler thread.
  5. Outbox could book a delivered-but-unrecorded message as a provider failure and deliberately re-send it.
  6. Outbox lease could expire mid-batch, allowing a duplicate send by another instance.
- **MEDIUM** (fixed): queue-retry starvation by one failing case; 500 instead of 409/503 for concurrency and database outage; readiness ignored the database; graceful shutdown not configured and local compose SIGKILLed after 10 s; template failures consumed all retry attempts.
- **MEDIUM** (open debt):
  - Keycloak admin calls inside DB transactions (bounded now, but hold a connection during an outage).
  - Micrometer metrics not exported.
  - No backup-restore rehearsal or point-in-time consistency across database, Keycloak and objects.
  - Real-dependency outage drills (PostgreSQL, Keycloak, MinIO, ClamAV, SMTP) not performed.
- **LOW** (open debt):
  - Storage SDK failures surface as 500, not 503.
  - An abandoned presign leaves a `PENDING` draft document that blocks submission (pre-existing; the retry path is fixed, abandonment is not).
  - Repeated submit after a lost response shows 409 rather than the original success.
  - No unit test for the `CaseForm` re-confirm branch (logic is minimal; Phase 8C E2E intake upload covers it).
  - The aggregate `/actuator/health` still includes optional contributors (orchestration uses the probe groups).

## Test evidence

Focused (all green):
- `NotificationOutboxProcessorTest` (6)
- `NotificationOutboxDeliveryTest` (8, including Codex's 2)
- `ClamAvDocumentInspectorTest` (6, scripted clamd socket)
- `DocumentServiceTest` (6)
- `ProviderCredentialIntegrationTest` (8)
- `JourneyProductionIntakeIntegrationTest` (9)
- `RuntimeReliabilityConfigurationTest` (4, parses shipped `application.yml` and both compose files)
- `RuntimeReliabilityWiringTest` (3)
- `CaseControllerTest` (6)
- `ArchitectureRulesTest` (9)

Full backend regression: **481 tests / 54 suites, 0 failures, 0 errors, 1 intentional skip** (baseline 452 / 50). Flyway V1–V50. Frontend typecheck clean; **223 / 37** passing.

**PHASE 8B COMPLETE: YES. PHASE 8C READY: YES.**

Not performed (no fabricated outage testing): live outages of PostgreSQL/Keycloak/MinIO/ClamAV/SMTP against the running stack; PostgreSQL-specific aborted-transaction behaviour (H2 does not poison a transaction on error; the savepoint rollback itself is proven by the evidence row being unwound); Playwright (Phase 8C).

## Phase 8C readiness

Remaining major work is Phase 8C scope (Playwright/live-stack E2E, EN/AR, desktop/mobile, RTL, accessibility, deferred visual review, UX/E2E defect closure) plus the MEDIUM/LOW infrastructure debt above.
