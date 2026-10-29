# Backend architecture and code-quality review (run 2026-10-29)

Revision reviewed: `feat/review-p0` @ `92a2a900`. Method: scoped `/code-review` skill at **high** effort (8 angles,
inline, no verifier pass) on the security-critical modules, then manual tracing of the request path
gateway → `SecurityConfig` → `SecondFactorGuard` → controller → application service → `Authority` → repository, and of
the scheduled jobs. Findings marked **CONFIRMED** were reproduced by a failing test before the fix; **PLAUSIBLE** are
reasoned from code and not yet measured or reproduced.

## Module map (production code, 719 Java files)

| Module | Responsibility | Notes |
|---|---|---|
| `authority` | Single authorization entry point (`Authority.require/authorize/decide`), `RolePolicy` (the only role→permission×scope table), `EffectiveRoleStore` (roles from DB every request) | Deny by default; tokens carry identity only (`DatabaseAuthenticationConverter`) |
| `security` | Spring Security chain, JWT decoder (issuer + audience + azp), `SecondFactorGuard`, rate-limit filter, restore sign-in block | `anyRequest().denyAll()`; CSP `default-src 'none'` on API |
| `access`, `workforce`, `identity` | Staff lifecycle, governance, owner transfer, Keycloak identity operations + reconciliation | Durable identity-operation outbox (`IdentityOperationProcessor`) |
| `casemanagement` | Case intake, lifecycle state, tasks, case numbers | `CaseNumberGenerator` is one of three JDBC exceptions |
| `coordination` | Routing policy, eligibility, scoring, `AssignmentEngine` (claim/reassign/route under a global routing lock) | |
| `journey` | Clinical review, proposals, commercial policy, payments, admission, treatment, discharge, follow-up, incidents | Largest module; `JourneyService` is a pass-through facade |
| `conversation` | WhatsApp intake conversations, inbound processing | |
| `document` | Presign/confirm uploads, ClamAV scan, S3/MinIO adapter, stale-upload sweeper | |
| `notification` | Transactional outbox with leased delivery, retries, dead letters | |
| `settlement`, `facility`, `clinic`, `directory`, `compliance`, `retention` | Reconciliation/statements, facility catalogue, virtual clinic + public profiles, directory, scorecards/audit samples, retention/erasure | |
| `shared` | Audit, cache (Redis, reference data only), crypto (AES-GCM + HMAC blind index), scheduling leases, persistence base | |

## Strengths (evidence)

- **Layering and authority are enforced mechanically**: `ArchitectureRulesTest` (22 rules) — controllers only in `api`,
  repositories in `infrastructure`, entities in `domain`, no Keycloak role mapping, no retired compatibility names,
  plain SQL limited to 3 listed classes, no native queries (0 `nativeQuery = true` in `src/main`).
- **One authorization vocabulary**: `RolePolicy` is a single reviewed table; `Authority.decide` derives roles from
  database records on every request (no cache), applies MFA-at-sign-in for staff, step-up (20 min, recent MFA, passkey for
  privileged roles), and audits supervisory and deposit-scoped reads.
- **Gateway identity is sound**: realip trusts `CF-Connecting-IP` only from private ranges and *sets* (not appends)
  `X-Forwarded-For`, so the backend's `RATE_LIMIT_TRUST_PROXY` read cannot be spoofed through the gateway.
- **Document pipeline fails closed**: size + declared type + signature + ClamAV `INSTREAM`; only an exact `stream: OK`
  is clean; no verdict is retryable (`scanDeferred`), never clean; stale uploads swept under a lease.
- **Money ledgers are append-only** with namespaced idempotency keys for deposit receipts/refunds; maker/checker on
  transfer confirmation (`SELF_CONFIRMATION`) and on evidence countersigning (`SELF_COUNTERSIGN_REFUSED`).
- **Scheduled jobs**: 22 of 25 `@Scheduled` methods are `@LeasedJob` (one instance per tick); the remaining three
  (`WhatsAppInboundProcessor`, `IdentityOperationProcessor`, `NotificationOutboxProcessor`) claim rows with their own
  per-row leases (outbox `SEND_MARGIN` guards reclaim during a provider call).

## Findings

Severity: Critical / High / Medium / Low. Status: OPEN, FIXED (with test), RECORDED (proposal, not changed).

| ID | Severity | File:line | Finding | Consequence | Status |
|---|---|---|---|---|---|
| AR-01 | High | `journey/application/PaymentService.java:163` | `recordReceipt` answers an idempotent replay **before** the case-scope check and without checking the deposit belongs to the path's case, then returns `depositForCase(caseId)` for the caller's case id | A Finance user replays one of their own keys against any case id and reads that case's deposit ledger (amounts, transfer references) — object-level authorization bypass (SEC-6 class) | FIXED (D-01, red/green) |
| AR-02 | High | `journey/application/AdmissionService.java:315,357` | `recordBalance`/`recordFeeBalance` have no idempotency and `case_evidence` has no uniqueness; a resubmitted receipt is a second receipt counted toward the amount due | A retried submit makes a half-paid platform fee look paid; admission readiness proceeds without the money (incorrect money) | FIXED (D-02, red/green) |
| AR-03 | Medium | `journey/application/ReplyCoverService.java:69` (root: `authority/application/Authority.java:192`) | The manager probe `allowed(REPLY_COVER_MANAGE, platform)` passes for every coordinator because a `SELF` grant matches any `PLATFORM` resource | Every coordinator lists every team's covers and free-text reasons; breaks UC-20 isolation | FIXED (D-03, red/green) |
| AR-04 | Medium | `journey/application/JourneyReadService.java:123,258`; `MedicalCaseRepository.findCoordinatorQueueRows` | The unclaimed queue, the intake preview (condition text) and the documents of an unclaimed case are open to **every** coordinator; only the claim enforces team/care-area eligibility | A Team A coordinator reads the medical documents of a case waiting for Team B; contradicts UC-03 "team queue" and UC-20 "the other team's coordinators cannot open it" | FIXED (D-04, red/green) |
| AR-05 | Medium | `document/application/DocumentService.java:155` | Per-case quota is check-then-insert without a case lock | Parallel presigns exceed the file/byte limits | FIXED (D-05) |
| AR-06 | Medium | `security/RateLimitFilter.java:138` | One backend write budget (default 30 POST/PUT per minute) per client IP for all authenticated work, below the gateway's 60/min | Staff behind one NAT throttle each other (the local `.env` already overrides it for UAT); production needs a per-principal budget or a higher authenticated limit | RECORDED — needs launch workload (see `production-readiness.md`) |
| AR-07 | Medium (perf hypothesis) | `document/application/DocumentService.java:75-86` | S3 read + ClamAV scan (10 s timeout) run inside the confirm transaction after `saveAndFlush` | One pooled connection held per in-flight scan; a slow scanner can exhaust the pool | RECORDED — measure in performance phase |
| AR-08 | Medium (perf hypothesis) | `coordination/application/CoordinatorEligibilityService.java:31-46` + `AssignmentEngine` global `repo.lock()` | Eligibility does 3 queries per coordinator (`holds`, `workload`, `lastAutomatic`) inside the platform-wide routing lock | Routing/claim latency grows linearly with coordinators and all routing is serialized | RECORDED — measure |
| AR-09 | Low (perf) | `authority/application/Authority.java:95,138,107` | Effective roles (≈6 queries) recomputed 2–3× per request (guard, decide, authorize) | Avoidable DB load on every call; a request-scoped memo keeps IAM-08 (no cross-request cache) | RECORDED — measure |
| AR-10 | Low | `journey/application/JourneyReadService.java:124` | `intakePreview` takes `SELECT … FOR UPDATE` for a read | Previews contend with claims/routing on the hottest rows | RECORDED |
| AR-11 | Low (maintainability) | `journey/application/JourneyService.java:19` | ~60 one-line delegations kept as a "compatibility facade" | Two places per operation; contradicts the pre-production "replace legacy directly" decision | RECORDED — bounded refactor: point controllers at the owning services, delete the facade (no behavior change; covered by existing integration tests) |
| AR-12 | Low | `document/application/SecureDocumentService.java:23` | 404 for an unknown document id before the 403 authorization check | Existence oracle for document UUIDs (random v4, low practical risk) | RECORDED |
| AR-13 | Low | `document/application/DocumentService.java:157` | `sanitizeFileName` strips `\p{Cntrl}` but not bidi/format characters (`\p{Cf}`, e.g. U+202E) | Display spoofing of file names in staff UI (type is still enforced by signature) | RECORDED |

| AR-14 | Medium (design) | `retention/application/SubjectErasureService.java:102` | Subject erasure is irreversible and done by one Care Coordination Manager with step-up; no second approver | One compromised or mistaken manager session erases a person; SOD for destructive actions | RECORDED — proposal: maker/checker like the facility package approval |
| AR-15 | High (found live) | `document/infrastructure/ClamAvDocumentInspector.java:26` | In `clamav` mode the declared-type signature check never ran | MIME-spoofed uploads accepted as CLEAN in dev and production configuration | FIXED (D-06, red/green) |
| AR-16 | Critical (dependency) | `frontend/package.json` | `next@16.3.3` with three critical advisories; `/_next/image` reachable | Pre-auth RCE/SSRF class exposure on the public site | FIXED (D-07, 16.4.2) |

## Independent review of the fixes

A read-only `backend-design:security-reviewer` subagent reviewed the backend patch (D-01..D-06): **no blocking
findings**; every fix confirmed against its callers (including the WhatsApp channel/staged paths for D-06, all
document endpoints for D-04, no lock-ordering cycle for D-05). Applied refinements: D-02 matches a resubmit only on
same reference (trimmed, case-insensitive) + amount + payment time, otherwise `409` (never a silent drop); D-04 loads
the actor's served care areas once per queue request (was per row) and decides the preview before the row lock with
one neutral message; D-01 checks deposit ownership only on the replay branch (no new existence oracle). Not applied
(recorded): D-05 holds the case lock across the WhatsApp `storage.seal` upload; manager/lead-specific tests for D-04.

## Remaining risks and proposals

- Service size: `CaseActionService` (681 lines), `AdmissionService` (650), `VirtualClinicService` (564),
  `FollowUpService` (552). Each is cohesive around one workflow; no split proposed without a concrete change driver.
- Review not yet completed in depth for: conversation/WhatsApp inbound, identity operations, retention/erasure,
  settlement maths. See `checkpoint.md` for the order.
