# Architecture audit and remediation — 2026-10-06

Scope: backend (`backend/`), gateway, compose stacks and the opt-in Elastic overlay. Frontend not in scope.
Branch `codex/platform-control-plane`; nothing committed (the owner commits). Live persistence tracker:
`jpa-migration-status.md`. Decisions: `technical-decisions.md` §29.

---

## 1. Executive summary

| | Before | After |
|---|---|---|
| Persistence | ~70 classes issuing hand-written SQL through `JdbcClient` (JPA used for 3 tables) | 101 JPA entities, 103 Spring Data repositories. **Every write is JPA** except the coordination module's own tables (deferred until the in-progress CL2 slice lands) and the `local`-profile seeder. 17 classes still *read* with `JdbcClient` (296 statements, mostly `JourneyService`), fenced by an ArchUnit ratchet |
| Schema safety | Migration V72 failed on every PostgreSQL database (dev backend could not start); mappings only ever ran on H2 | V72 fixed; `PostgresJpaMappingTest` boots on PostgreSQL 17, validates every entity and executes every repository query |
| Caching | Redis configured but values could not be deserialized (records + default typing) and polymorphic typing exposed a gadget surface; production had no Redis | Typed per-cache serializers, versioned key prefix, per-cache TTLs, evict-after-commit, fail-fast when Redis is down; internal password-protected Redis in the production compose |
| Logging | Hand-rolled "JSON" pattern that broke on quotes and split stack traces across lines; no request id in logs | Spring Boot native ECS JSON; validated `X-Request-ID` as `http.request.id`; machine-readable `event.code`; gateway logs ECS with the same id |
| Central search | None | Opt-in Elasticsearch/Kibana/Filebeat 9.5.4 overlay: data stream, 7-day retention, typed mappings, 10 saved searches, least-privilege writer |
| Guard rails | — | ArchUnit: no new `JdbcClient`, acyclic modules (unchanged), controllers out of persistence |

Tests: 570 run; the only failures are the 101 pre-existing CL2 routing failures ("An effective routing policy is
required"), unchanged before and after every slice.

## 2. Repository instructions applied

- `CLAUDE.md`: review-first, targeted edits, smallest relevant verification, concise output; preserve Codex in-progress
  work (no resets, no reformatting of files I did not need to touch — the import tidy was limited to files my scripted
  edits had disturbed).
- `AGENTS.md`: offline Maven (`mvn -o`), no new dependencies absent from `~/.m2` (this is why OpenTelemetry was not
  added), never commit, never copy `.env` secrets into source, `deploy/oracle/` touched only with explicit approval
  (given for its Redis), dev stack rebuilt only with the documented compose command, no Docker volume deletion.
- Pre-production clean-cutover rule (memory): no compatibility layers or data migrations for legacy shapes.
- Owner decisions taken during the audit: convert persistence to Spring Data JPA (overrides §2's `JdbcClient` choice,
  recorded as §29); Elastic as an opt-in compose overlay; internal Redis in the Oracle deployment.

## 3. Critical findings

| Severity | Area | Finding | Risk | Resolution |
|---|---|---|---|---|
| P0 | Data/deploy | V72 counted the implicit NOT NULL constraint as a decision CHECK and aborted on PostgreSQL | Backend could not start on any real database | Fixed the constraint filter; proven by `PostgresJpaMappingTest` |
| P0 | Security | Redis cache used polymorphic default typing (`@class` in payload) | Deserialization gadget surface for anyone who can write Redis | Typed `Jackson2JsonRedisSerializer` per cache (`CacheSpec`); no type ids stored |
| P1 | Correctness | Cached records failed to deserialize | Cache silently useless; every read hit the DB | Same typed serializers; `CacheSerializationTest` round-trips every cache |
| P1 | Security | Dev Redis published on all interfaces | Unauthenticated Redis reachable from the LAN | Bound to `127.0.0.1` |
| P1 | Security | Client-supplied request id logged verbatim | Log injection / forged correlation | `[A-Za-z0-9._-]{1,64}` validation in filter and gateway, else a fresh UUID |
| P1 | Observability | Pattern-based JSON logs broke on quotes; stack traces split | Logs not machine-parseable; Elastic ingestion impossible | Native ECS structured logging; `StructuredLoggingTest` |
| P1 | Persistence | Raw SQL in ~70 classes; 25 inline audit INSERTs; 15 notification INSERTs | Inconsistent guards, duplicated logic, no compile-time checking | JPA write migration (all tables but the deferred ones); single writers `AuditTrail`, `NotificationOutbox`, `CaseStatusLog` |
| P1 | Concurrency | `INSERT … WHERE NOT EXISTS` for idempotent rows (staff notifications, payment ledger, clinic opening) | Duplicate-key error under concurrent delivery | HQL `INSERT … ON CONFLICT DO NOTHING` |
| P1 | Availability | Gateway resolved `backend` once at start | Gateway crash-looped whenever the backend was down | Runtime DNS (`resolver` + `resolve` upstream) |
| P1 | Wiring | Nested `@EnableAutoConfiguration` scanned `journey.infrastructure` repositories twice | Duplicate beans / start-up fragility | Exclusions moved to `@SpringBootApplication` |
| P2 | Performance | Three N+1 loops in workforce reads; journey version list loaded deployments per version | Latency grows with data | Batched queries |
| P2 | Performance | Unbounded admin lists | Memory/latency on growth | Caps (identity operations 500, reconciliation runs 200, audit 200, history 100) |
| P2 | Configuration | FX provider URL, on/off switch and supported currencies hard-coded in the service | Untestable, environment-specific behaviour in code | `CurrencyProperties` + `ExchangeRateProvider` port/adapter |
| P2 | Architecture | `casemanagement` read `medical_documents` (owned by a module above it) | Hidden upward dependency | `SubmissionDocuments` port implemented by `document` |
| P2 | Production | No Redis in the Oracle deployment | Rate limits per node; no shared cache | Internal Redis: password, read-only FS, no published port, `allkeys-lru` 128 MB |

## 4. Clean Architecture review

- Modules (`shared` · `workforce` · `directory` · `authority` · `identity`/`notification` · `security` ·
  `casemanagement` · `access`/`clinic` · `document` · `journey` · `coordination`) depend downward only;
  `businessModulesAreFreeOfCycles` passes. New: a `directory` module for person-profile tables (read by six modules),
  and `casemanagement` now sits below `access`/`clinic` so they reach case tables through its repositories.
- Inside a module: `api` (controllers, DTOs) → `application` (use cases) → `domain` (entities, rules) ←
  `infrastructure` (Spring Data repositories, stores, adapters). Controllers do not touch persistence (ArchUnit).
- Ports where a dependency would point the wrong way or at a vendor: `ExchangeRateProvider`, `SubmissionDocuments`,
  existing `StoragePort`, `JourneyRuntimePort`, `IdentityProvisioningPort`.
- Observation: `journey/application` still holds its read models inline (large services issuing SQL); they should
  become query services (see §14).

## 5. SOLID review

- **SRP** — improved: consultant onboarding extracted from `JourneyService` into `ConsultantOnboardingService`; status
  history, audit and notifications each have one writer. Remaining: `JourneyService` (≈900 lines) still mixes many
  use cases — debt.
- **OCP** — cache specs and TTLs are data (`CacheSpec`, `CacheProperties`); adding a cache adds a spec, not code paths.
- **LSP** — no inheritance hierarchies were introduced beyond `AssignedIdEntity`/`PersistableEntity`, which every entity
  honours (`isNew` semantics proven by the PostgreSQL test).
- **ISP** — repositories are per aggregate and expose intention-named operations (`moveStatus`, `acceptAsPrimary`,
  `revokeOpenForCase`) instead of a generic SQL surface.
- **DIP** — application services depend on repositories and ports, not on `JdbcClient`/`RestClient`; the remaining
  `JdbcClient` users are listed and fenced.

## 6. Persistence review

- **JPA / entities** — 101 entities. Application-assigned UUIDs (`AssignedIdEntity`, `Persistable`, so `save` is a
  persist). Business `version`/`revision` columns are explicit fields bumped by the guarded update, not `@Version`
  (several updates intentionally do not bump them). Entities co-written by JPQL are `@DynamicUpdate`.
- **Repositories** — 103 Spring Data interfaces on `BaseRepository` (`lockById` = `PESSIMISTIC_WRITE` + refresh, because
  a lock on an already-managed instance does not reload it). Composite services are `…Store`s.
- **SQL / native SQL** — no native queries. Remaining plain SQL: reads in 17 classes plus the deferred coordination
  writes and the `local` seeder; `CaseNumberGenerator` uses `nextval` (no JPQL equivalent; documented exception).
- **Transactions** — every converted write flushes immediately, so remaining JDBC reads in the same transaction see it
  (the transition invariant). `@Modifying(flushAutomatically, clearAutomatically)` on bulk JPQL. Test fixtures that
  change rows with raw SQL now flush/clear around it.
- **N+1** — removed in workforce reads and journey version listing; remaining risk lives in the unconverted read models.
- **Indexes** — not changed; existing unique constraints back every idempotency key used by `ON CONFLICT`.
- **Pagination** — admin lists capped; journey history paged (`OffsetPageRequest`).
- **Concurrency** — every guarded `UPDATE … WHERE status/version=?` kept its exact guard as JPQL returning `int`;
  `SKIP LOCKED` leasing for identity operations and the outbox; governance and case row locks via `lockById`.

## 7. Configuration review

Externalised: FX provider (`app.currency.*`: enabled, provider URL, supported quote currencies), cache enablement and per-cache TTLs
(`CACHE_TTL_*`, now including `fx-rate-tables`), log format and environment (`LOG_FORMAT`, `APP_ENVIRONMENT`), Redis
host/password in production. Legitimate invariants kept in code: business status vocabularies, guard sets, encryption
and hashing algorithms, request-id format.

## 8. Cache architecture

- **Redis architecture** — Spring Cache on Redis (Lettuce), key prefix `rehletshifaa:cache:v1:`, unknown cache names
  refused (`disableCreateOnMissingCache`), writes and evictions deferred to commit (`transactionAware`).
- **Inventory** — `fx-rates` (15 m), `fx-rate-tables` (15 m), `care-categories` (1 h), `commercial-policy` (10 m).
  Deliberately not cached: case state, work items, notifications, deposits, decisions, authorization, tokens.
- **TTL** — per cache, configurable; default 10 m.
- **Invalidation** — Finance pinning a rate evicts both FX caches; a new commercial policy evicts its entry
  (`ReferenceDataCachingTest`).
- **Serialization** — one declared value type per cache (`CacheSpec`), JSON without type ids.
- **Fallback** — Redis is an optimisation: Lettuce rejects commands while disconnected (no hang), `CacheErrorHandler`
  downgrades to a cache miss, `RedisFailureLog` emits throttled `CACHE_UNAVAILABLE` / `CACHE_DESERIALIZATION_FAILED`.
- **Metrics** — Micrometer is present (actuator); cache statistics are not exported (no metrics backend in scope).
- **Local caches** — none for shared data. In-process maps exist only in the `mock` storage adapter, the local identity
  simulator (both refused in production by `ProductionSafetyValidator`) and the rate limiter's bounded fallback window.

## 9. Observability architecture

- **Structured logging** — ECS 8.11 JSON on stdout (`logging.structured.format.console=ecs`), service name and
  environment set; stack traces stay inside one event.
- **Correlation / request IDs** — gateway and `CorrelationIdFilter` accept a well-formed `X-Request-ID` or mint one,
  echo it, and put it in MDC as `http.request.id`; `AuditTrail` stores it as `audit_events.correlation_id`.
- **Trace IDs / OpenTelemetry** — not added: the OTel and Micrometer-tracing artefacts are not in the offline Maven
  repository (AGENTS rule). The request id is the cross-component key today. Debt (§14).
- **Error codes** — `event.code` on every handled failure class (`DATABASE_UNAVAILABLE`, `UNHANDLED_ERROR`, cache and
  FX provider codes, API 5xx codes).
- **Log transport** — Filebeat autodiscover on the backend and gateway containers (name-anchored regex, Docker labels
  dropped), NDJSON parsing.
- **Elasticsearch / Kibana** — data stream `logs-rehletshifaa-dev`, typed mappings, 7-day lifecycle retention, Kibana
  data view and 10 saved searches (all errors; warnings and errors by module; gateway 5xx; 401/403; 429; Redis/cache
  failures; database failures; external-integration failures; requests slower than 2 s; one request end to end by
  `http.request.id`).
- **Sensitive data** — logs carry subjects/UUIDs, never email, phone, tokens or clinical text; request bodies are not
  logged.
- **Health** — liveness (no dependency) and readiness (database) probes.

## 10. Tool versions

| Tool | Version | Why |
|---|---|---|
| Elasticsearch, Kibana, Filebeat | 9.5.4 | Verified as the current stable 9.x release from Elastic's official artefacts at the time of the audit; one version across the stack (Elastic requires matching minor versions) |
| Spring Boot | 3.5.10 (unchanged) | Native ECS structured logging available since 3.4 |
| Hibernate ORM / Spring Data JPA | 6.6.41.Final / 3.5.8 (Boot-managed) | `ON CONFLICT` in HQL inserts and `cast(:p as Instant)` rely on Hibernate 6.5+ |
| PostgreSQL | 17-alpine (unchanged) | Target of `PostgresJpaMappingTest` |
| Redis | 7-alpine (unchanged) | Kept for parity between dev and the new production service |
| Java | 21 (unchanged) | |

No unrelated dependency was upgraded.

## 11. Security review

- Application: authorization checks were carried over unchanged into every converted method (no persistence change
  bypasses `Authority`); request-id validation closes log injection; concatenated SQL fragments that remain are code
  constants or bounded integers only.
- Redis: no polymorphic deserialization; production instance password-protected, no published port, read-only root
  filesystem; dev instance loopback-only.
- Elastic: security enabled (`elastic`, `kibana_system`, least-privilege `rehletshifaa_log_writer`), ports bound to
  loopback, passwords only in the untracked `.env`. **TLS is not configured** in the overlay — acceptable for the
  loopback dev overlay only (§14).
- Production profile: `ProductionSafetyValidator` refuses simulators/mock adapters and disabled security; `prod` turns
  on OIDC, S3 storage, SMTP and Turnstile.

## 12. Scalability review

- **Stateless application** — no session or shared state in the JVM; the rate limiter and caches use Redis (bounded
  local fallback only while Redis is down).
- **Redis shared cache** — consistent across replicas; evict-after-commit prevents caching uncommitted data.
- **Transactions / database** — row locks (`lockById`), guarded updates and unique constraints make concurrent
  replicas safe; scheduled jobs (proposal expiry, FX refresh, outbox, identity operations) are idempotent or lease rows
  with `SKIP LOCKED`, so running them on every replica is safe without a scheduler lock.
- **Integration boundaries** — external calls (FX, Keycloak, mail, WhatsApp) go through ports on the shared HTTP client with finite timeouts; the outbox
  decouples delivery from the request.
- **Logging / observability** — stdout ECS per replica, collected by Filebeat and correlated by request id; adding
  replicas needs no logging change.

## 13. Testing

- **Added:** `CacheSerializationTest`, `StructuredLoggingTest`, `CorrelationIdFilterTest`, `PostgresJpaMappingTest`
  (opt-in, disposable PostgreSQL), ArchUnit `newPersistenceCodeUsesSpringDataJpa` and `everyJdbcClientExceptionStillNeedsIt`.
- **Changed:** `ReferenceDataCachingTest`, `UatDefectCorrectionsTest`, `MetaWhatsAppWebhookServiceTest`,
  `PlatformUsersDeepQaTest`, `PatientConversionLayerTest`, `JourneyCaseBindingIntegrationTest` (raw-SQL fixtures now
  flush/clear), journey tests renamed to the `…Store` classes.
- **Executed:** full backend suite after every slice (`mvn -o test`, H2) and the PostgreSQL proof after every slice.
- **Result:** 570 tests, 0 new failures; 101 pre-existing failures, all from the in-progress CL2 routing work.
  Coverage caveat: ~50 proposal-path tests are among those 101 (they stop at coordinator routing), so the proposal
  write conversion is proven by the passing journey suites (163 tests) and by the PostgreSQL query proof, not by those 50.

## 14. Remaining technical debt

| Issue | Severity | Reason not done now | Impact | Remediation |
|---|---|---|---|---|
| 17 classes still read with `JdbcClient` (296 statements; `JourneyService` ≈85) | Medium | Read models need redesign as query services; ~100 journey tests are blocked by CL2, so blind translation is unsafe | SQL strings without compile-time checking; logic duplicated across views | One service per slice (`StaffWorkService`, `CaseActionService`, then `JourneyService` by view); ratchet list shrinks |
| Coordination own-table writes | Medium | Being rewritten by the in-progress CL2 slice | Last JDBC writers in production code | Convert after CL2 lands |
| No OpenTelemetry / trace ids | Medium | Artefacts absent from the offline Maven repository | No distributed traces; request id only | Add Micrometer Tracing + OTLP exporter when dependencies can be fetched |
| Elastic overlay has no TLS | Medium (prod) / Low (dev) | Dev overlay is loopback-only | Not production-ready as is | TLS + certificates (or Elastic Cloud) before production use |
| `JourneyService` size (SRP) | Medium | Splitting is coupled to the read-model work | Change risk concentrated in one class | Split per use case with the read-model slices |
| Dead schema (`case_claim_challenges`, V56/V59/V64/V65 tables, `idempotency_records`) | Low | Owner decision | Confusing schema | Implement or drop before `main` |
| `LocalDemoDataSeeder` writes with JDBC | Low | `local` profile only | None in production | Move to a `devdata` package |
| Cache metrics not exported | Low | No metrics backend in scope | Hit ratio invisible | Expose Micrometer cache metrics when a metrics backend exists |
| CL2 baseline (101 failing tests) | High (but not from this work) | Owned by the in-progress CL2 slice | Large part of the journey untested | Finish CL2 |

## 15. Compliance matrix

| Area | Result |
|---|---|
| Repository instructions followed | PASS |
| Clean Architecture | PASS WITH OBSERVATION — journey read models still inline in application services |
| SOLID | PASS WITH OBSERVATION — `JourneyService` SRP |
| JPA-first persistence | PASS WITH OBSERVATION — all writes JPA except deferred coordination/seeder; reads in 17 classes pending |
| Raw SQL removed | FAIL — 296 plain-SQL statements remain (fenced by a ratchet, none in new code) |
| Repository design | PASS |
| Transaction design | PASS |
| Configuration | PASS |
| Secrets | PASS |
| Redis centralized caching | PASS |
| Cache TTL/invalidation | PASS |
| Structured logging | PASS |
| Correlation/tracing | PASS WITH OBSERVATION — request-id correlation; no OpenTelemetry trace ids |
| Elasticsearch logging | PASS WITH OBSERVATION — opt-in overlay; production TLS pending |
| Kibana searchability | PASS |
| Stable supported tooling | PASS |
| Security | PASS WITH OBSERVATION — Elastic TLS |
| Testability | PASS WITH OBSERVATION — CL2 baseline masks ~50 proposal-path tests |
| Scalability | PASS |
| MVP simplicity | PASS |

## 16. Final verdict

**C — Functional but architectural debt remains.**

The platform-level architecture is now in good shape (boundaries enforced, JPA writes with preserved concurrency
semantics, safe shared caching, searchable correlated logs). It is not B yet because the owner-mandated JPA-first rule
is only half met — 17 read-heavy classes still issue SQL — and because the journey module's read models and the CL2
baseline leave a large part of the patient journey without passing tests. Converting the remaining read models as
query services after CL2 is green is the step that moves this to B.

---

## Addendum — CL2 completed (2026-10-06, same day)

- The CL2 standard-intake contract is finished (details: `section-1-implementation-status.md`, "CL2 delivered"): a routed
  standard intake starts intake review; self-claims and self-takeovers notify nobody; transfers send the OPS-1
  notification again; manual (re)assignments keep the person's reason.
- The coordination module's own tables are now JPA-written, so **every production write is JPA** except the
  `local`-profile seeder.
- Full suite: 570 tests, **8 failures (was 101)**, all CL3 readiness tests that still assume profile completion alone
  activates the account. The proposal-path tests that were masked by the routing failure now pass.
- Effect on §14/§15: the "CL2 baseline" debt row is closed and testability improves; the remaining items (read models,
  OpenTelemetry, Elastic TLS, CL3) are unchanged. The verdict stays **C** until the read models are converted.
