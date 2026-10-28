# Claude prompt: deep platform validation, fixes, and production readiness

Copy the text below into Claude Code with this repository open.

---

Work as the backend architecture reviewer, QA lead, and implementation engineer for RehletShifaa. Review code quality and architecture first, then perform a deep, requirements-driven validation of the whole platform. Fix confirmed defects, complete missing approved functionality, and verify the fixes. My priority is that patients and every staff role can complete all intended workflows correctly on a secure, maintainable, scalable, and available system. Assess performance and production readiness with measured evidence as well.

Execute the work; do not stop after proposing a plan or running the existing tests. Continue through discovery, testing, reproduction, fixes, regression verification, and reporting. If a prerequisite blocks one area, record it precisely and continue independent work. Do not claim that all functionality works from a green build, mocked browser tests, or historical reports.

Use relevant skills installed in your Claude Code environment. At the start, discover their exact names, instructions, and prerequisites rather than assuming a name or capability. In particular, check for `/code-review`, UI/UX Pro Max, Impeccable, Vercel/Next.js, and end-to-end testing skills (or their installed equivalents). Apply `/code-review` to the backend architecture and security review; UI/UX Pro Max and Impeccable to visual quality, Arabic/RTL, responsive design, and accessibility; Vercel/Next.js guidance to frontend rendering, caching, build, and performance; and the E2E skill to real cross-role browser journeys and test evidence. Use each skill where it adds value, following its actual instructions. A skill's checklist or automated verdict is supporting evidence, not proof of a real workflow. If a skill is unavailable or inapplicable, continue with the repository's tools and report that fact. Do not invoke deployment or external publishing merely because a Vercel skill exists. Record which skills and versions were actually used, their findings, and any limitations in the final report.

## 1. Establish the actual baseline and approved scope

Follow the repository's `AGENTS.md` and applicable `CLAUDE.md` instructions. First inspect the current branch, commit, working tree, and relevant uncommitted changes. Preserve other work; do not reset, discard, stash, switch branches, or merge unrelated work merely to get a clean baseline. At prompt preparation on 2026-10-28 the checkout was `feat/review-p0`, although older instructions name `codex/platform-control-plane`. Verify the current state instead of assuming either name is current.

Read `docs/platform-control-plane/section-1-implementation-status.md` first, including its latest handoffs and next-action entries. Then build a source index from:

- `docs/platform-control-plane/platform-users-and-virtual-clinics-requirements.md` and the relevant execution-plan sections.
- `docs/qa-test-protocol.md` and `docs/qa/test-accounts-and-e2e-journey.md`.
- `docs/end-to-end-workflows.md` and `docs/commercial-workflow-status.md`.
- `docs/platform-review-implementation-plan-2026-10-14.md`, including the later admission, treatment, reconciliation, and follow-up work.
- `docs/remaining-work-prioritized.md`, which is a documentation summary requiring verification against code.
- `docs/post-deposit-solution-architecture.md`, relevant architecture sections, and current UX status/backlog where they define behavior or acceptance criteria.
- `docs/security-and-production-readiness.md` and relevant deployment/operations instructions.

Follow references only as needed for coverage. Some documents contain historical branches, obsolete authorization models, outdated test totals, or superseded requirements. Record conflicts and resolve them using explicit approved decisions and current handoffs; current code is evidence of implementation, not proof that the requirement is satisfied. Never restore retired provider organizations, Keycloak business authority, or compatibility paths because an old test/doc expects them.

Produce a requirements traceability matrix before substantial fixes, and maintain it throughout the work. Include every approved functional requirement and acceptance criterion, not just the platform-control-plane epic or existing test cases. Give requirements without IDs stable local IDs and source references. Map every `UC-01`–`UC-20` and `SEC-1`–`SEC-17` scenario from `docs/qa-test-protocol.md`; add current workflows introduced after that protocol. Include discovered routes/actions with no documented requirement as review items rather than silently excluding them. Mark each source as current, superseded, deferred, or unresolved so old documents cannot silently redefine expected behavior.

For each requirement record: source/ID, expected behavior, role and scope, preconditions, implementation location, positive/negative/boundary scenarios, automated test location, real integration/browser evidence, result, defect/blocker reference, and remaining work. For evidence record the test data identifier, environment/build, timestamp, command or steps, outcome, and sanitized request/correlation ID where applicable. Use explicit results: PASS, FAIL, PARTIAL, BLOCKED, NOT TESTED, or DEFERRED BY APPROVED DECISION. Keep implementation status separate from verification status. Report the full denominator and exclusions; deferred or skipped work is never a pass. Do not infer a requirement passed merely because a test name mentions it; inspect the assertion and prove the relevant outcome.

This request authorizes local development fixes, missing functionality with settled approved requirements, regression tests, synthetic fixtures, and necessary canonical dev-stack rebuilds. Make the smallest coherent changes. For genuinely undecided business rules, legal wording, intentional feature gates, or new product scope, prepare the concrete gap/options and request only the missing decision; continue elsewhere. Do not invent approval, enable Journey admission, or implement deferred booking/Practice Manager/recovery behavior just to complete the matrix.

## 2. Use the real application boundaries

Inspect existing tests, fixtures, scripts, and configuration before adding a new harness. Establish the source and automated-test baseline before the architecture review; run the full browser and live journey suites after review findings have shaped the test plan. Use the supported commands, serialized where they share build output or services:

- Backend: `cd backend`, then `mvn -o -q test`.
- Frontend: `cd frontend`, then `pnpm typecheck`, `pnpm test`, and `pnpm lint`; classify baseline failures honestly and fix defects within scope.
- Local production-rendered browser suite, after review: `pnpm test:e2e`, with port 3100 available. Do not use parallel `next dev` runs as acceptance evidence. Inspect any separate QA/cross-browser configuration because the default suite may exclude it.
- PostgreSQL: run `PostgresJpaMappingTest` using the repository's documented disposable PostgreSQL setup. H2 alone does not prove production database behavior. Read `docs/platform-control-plane/jpa-migration-status.md` before persistence changes; preserve JPA/layer rules and migration discipline.

For the real development environment use only the named tunnel and canonical overlay:

```text
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Stable URLs are frontend `https://dev.rehletshifaa.com`, API `https://api-dev.rehletshifaa.com`, identity `https://auth-dev.rehletshifaa.com`, files `https://files-dev.rehletshifaa.com`, and Mailpit `https://mail-dev.rehletshifaa.com`.

For tunnel Playwright runs set these environment variables using the current shell's syntax:

```text
PLAYWRIGHT_EXTERNAL_SERVER=true
PLAYWRIGHT_BASE_URL=https://dev.rehletshifaa.com
PLAYWRIGHT_API_BASE_URL=https://api-dev.rehletshifaa.com
PLAYWRIGHT_OIDC_AUTHORITY=https://auth-dev.rehletshifaa.com/realms/rehletshifaa
```

Confirm these match the frontend build values. `NEXT_PUBLIC_*` changes require rebuilding. Record the source revision plus relevant working-tree changes, deployed image/build, migration level, enabled flags, and environment for each evidence run. Prove the running application contains the code being evaluated.

Use existing authorized local test credentials through environment variables without printing them. Inspect live specs for required inputs such as `PORTAL_TEST_PASSWORD`, `PORTAL_TEST_CASE`, `DOCTOR_TEST_PASSWORD`, `OPERATIONS_TEST_PASSWORD`, and `FINANCE_TEST_PASSWORD`. Obtain test OTPs from Mailpit or the intended dev channel. Missing credentials/integration access are explicit blockers, not permission to fake a passing live test.

Exercise real browser sign-in, Keycloak/MFA/step-up, the API gateway, backend, PostgreSQL, Redis, MinIO/scanner, outbox, and Mailpit. Include the gateway policy tests and the applicable live Playwright specs; inspect environment gates so a skipped live spec is visible in the report. No direct-backend fallback for end-to-end acceptance. Label mock/simulator evidence separately from real component integration and external-provider sandbox evidence. A mock pass never closes a requirement whose required real boundary remains untested. Run live OTP, Mailpit, and rate-limit journeys serially so parallel tests do not consume each other's messages or shared public request budget.

Use uniquely tagged synthetic cases and test identities. Create workflow state through supported UI/API flows; direct database setup in isolated automated tests is not a live workflow demonstration. Keep a fixture manifest so runs are reproducible. Do not delete existing volumes, recreate the shared database, or run reset scripts. Use separate disposable resources for destructive recovery/migration/fault tests. Send only to designated test recipients/sandboxes; no real patient communications, real payments, production deployment, or production load tests.

## 3. Review backend code quality and architecture before deep testing

After establishing the source and test baseline, perform an independent, evidence-based review of the current backend. Trace the most important requests and background jobs through controller, application service, domain policy, repository, and external adapter boundaries. Review all backend modules and shared infrastructure for systemic issues, then inspect risk-heavy paths in depth: authority and identity, intake/routing, cases and clinical workflow, consultant eligibility, commercial policy and ledgers, documents, notifications, migrations, and scheduled recovery. Include the frontend/API boundary where it affects correctness or maintainability. This is a code review, not merely a compilation or lint pass.

Assess these qualities explicitly:

- **SOLID and clean code:** each class and module has a clear responsibility; policies and orchestration are separated; dependencies point toward stable interfaces; abstractions are justified by actual variation; interfaces are cohesive; domain rules have one authoritative home; names, error contracts, and invariants are understandable. Identify large services, duplicated rules, hidden coupling, flag-driven branching, and complicated methods where they create real maintenance or correctness risk. Apply SOLID as a way to improve behavior and change safety, not as a target for more classes or interfaces.
- **Professional architecture:** enforce the existing controller → use case → repository layering and authority-module boundaries. Check domain entities, transactional boundaries, JPA mappings, migrations, API contracts, versioning, validation, idempotency, audit/outbox consistency, and external adapters. Verify errors and retries preserve invariants across PostgreSQL, Keycloak, Redis, MinIO/scanner, Mailpit/WhatsApp, and the gateway. Do not replace established project patterns with an unproven architecture merely for style.
- **Maintainability and testability:** evaluate cohesion, dependency direction, test seams, focused regression coverage for important rules, flaky/shared fixtures, configuration drift, dead code, misleading comments, and documentation mismatches. Make critical policies easy to locate and review. Identify code paths where the only tests are mocks, happy paths, or tests that duplicate implementation logic.
- **Scalability and performance:** inspect for unbounded queries/results, N+1 reads, missing or ineffective indexes, lock ordering and contention, long transactions, duplicate polling, excessive synchronous external calls, cache misuse, connection/pool sizing, and jobs that cannot safely run on multiple instances. Treat suspected bottlenecks as hypotheses until measured in the performance phase.
- **Availability and recovery:** review failure isolation, dependency timeouts, backoff and retry budgets, dead letters, transactional outbox, idempotent scheduled jobs, distributed leadership/coordination, graceful degradation, restart behavior, health/readiness signals, observability, backup/restore assumptions, and how partial external failures are repaired. Identify single points of failure and the expected behavior during each dependency outage.
- **Security and privacy:** trace deny-by-default authorization, object and team scope, step-up, separation of duties, least privilege, input validation, secure links/OTPs, upload scanning, encryption/key handling, audit correlation, sensitive-data minimization, logging, secret/configuration handling, and dependency/build risks. Confirm every trust boundary is enforced by the backend; never infer business authority from a client or token role claim.

For each finding give file and line, severity, concrete failure or maintenance consequence, reproduction or reasoning, affected requirement/workflow, and a small corrective design. Distinguish proven defects from design risks and style preferences. Prioritize security/safety/data integrity, availability failures, performance problems supported by evidence, then maintainability. Fix actionable high-impact findings in coherent slices with meaningful tests and an independent review for sensitive changes. Record wider refactors as bounded proposals with their benefit, migration risk, and test plan; do not introduce broad rewrites or speculative abstractions solely to claim SOLID compliance. Revisit the review after changes to catch new coupling or regressions. Include a focused threat model of the patient, staff, admin, gateway, identity, file, and third-party boundaries, and review dependency/security scan results when supported tooling is available. A code review or automated scan does not replace an independent penetration test.

## 4. Validate every functional area deeply

Use the matrix as the complete inventory. At minimum cover:

1. **Public site and intake:** English/Arabic navigation, care areas, consultant directory/profile publication and eligibility, intake validation, consent, draft/resume where supported, uploads, duplicate submission, confirmation, status tracking, information requests, and recovery links. Check urgency, minors/guardians, and contact-channel behavior against approved rules.
2. **Identity and account lifecycle:** staff invitations, resend/cancel/expiry, first sign-in activation, required MFA, password/MFA recovery, logout/session expiry, durable identity-operation retry/dead letters/reconciliation, disable/restore, job changes, offboarding, dormancy, and recertification. Verify patients, workforce, consultants, delegates, and representatives receive only their intended authority.
3. **Roles and governance:** every current role, workspace, permission, resource scope, teams/leads/reporting lines, separation of duties, independent approvals, account ownership/transfer, and last-admin/last-owner protections. Authority changes must apply on the next request, including with an existing session/token.
4. **Coordination and communication:** intake routing, policies, capacity, availability/languages, no-capacity/manual queues and retries, two-team isolation, claims/transfers, supervision, coverage/leave, work queues, tasks, reminders, WhatsApp intake and conversation ownership, internal/patient threads, read receipts, attachments, and notification privacy.
5. **Consultants and clinics:** onboarding, credential verification/expiry/suspension, capability authority, public eligibility, clinic profile/services/pricing/availability, assignment offers and expiry, acceptance/decline, transfers, second opinions, and continuity when eligibility is lost. Validate current permitted delegation behavior and its denial boundaries; do not silently activate deferred consent flows.
6. **Commercial and patient conversion:** catalogue/FX, preliminary estimates and revisions, all conditional Operations/Finance approval paths, release/delivery/resend/expiry, exact-version acknowledgement, account/profile setup, contact verification versus legal identity, representatives, consent records, deposits/receipts/waivers/refunds, money rounding/currency, and server-computed readiness. Verify patient responses never contain internal costs, margin, or privileged reasons.
7. **Care delivery through completion:** travel planning and commitment gates, appointment evidence, facilities/accreditation, reservation/admission/voucher/balance, arrival, final assessment/quote/acceptance, procedure consent, treatment milestones/change orders, discharge documents, reconciliation/statements, follow-up execution/outcomes, complications/incidents, and closure. Include cancellation/no-show/decline/expiry/reopen paths only as currently approved. Verify refund entitlement and ledger invariants for every supported exit.
8. **Administration and operations:** Control Center forms and actions, policy/catalogue publication/versioning, imports/exports where supported, audit/history, notifications, job scheduling, expiry/SLA processing, operational recovery, retention/legal holds/erasure behavior, metrics, alerts, and error handling.
9. **Journey governance/runtime:** creation/editing/validation/simulation, maker/checker approval, publish/version pinning/rollback, and runtime integration where approved/enabled. Distinguish a designer/simulation pass from demonstrated execution by a real case; document gated behavior and incomplete integration explicitly.

For each meaningful action test the valid flow, invalid input, missing prerequisite, wrong role, wrong case/team/owner, stale version, duplicate submission/retry, cancellation, expiry/time boundaries, and persistence after refresh/re-login. Test boundaries before/at/after deadlines and relevant timezone/currency rules. After refusals, prove there was no unintended state change, ledger entry, audit of success, outbox delivery, or disclosure.

Use at least two distinct identities per relevant scope and independent actors for maker/checker actions. Never use one all-powerful test user as evidence that role workflows work. Exercise concurrency on critical transitions: claims, assignment/referral acceptance, capacity, approvals, proposal decisions, payments/refunds, and identity/governance changes. Prove single outcomes, idempotency, rollback, and absence of duplicate side effects.

Run complete browser journeys across role handoffs with real persisted data, including a patient case from intake through follow-up/closure, plus representative, cancellation/refund, and exception variants. Assert both visible outcomes and authorized API/state evidence. A 200 response or successful click alone is insufficient. Verify messages arrive and async work completes, not merely that it was queued. Record the exact point where any journey cannot continue and test the remaining branches independently. Do not manufacture completion by directly changing database state or bypassing a required role, approval, consent, or readiness gate.

## 5. Security, usability, and resilience

Test object-level authorization directly through APIs as well as the UI: foreign IDs, hidden fields, overposting, role-claim spoofing, inactive identities, revoked delegation/assignment, stale tokens, missing step-up, and cross-thread/document access. Prove the gateway cannot grant business authority and that admin/auditor/support access does not bypass clinical restrictions.

Exercise OTP/link scope, expiry, replay, enumeration resistance, throttling, CORS, upload size/type/signature checks, quarantine, scanner failure, presigned URL expiry, audit correlation, and sensitive-data leakage in logs/payloads. Use safe test payloads in an isolated dev context. Keep secure tokens, credentials, patient data, and sensitive browser traces out of committed evidence.

Verify English/Arabic parity, RTL, mobile widths 320–390 px and desktop, keyboard/focus/labels, accessible validation, loading/empty/error states, navigation and back/refresh, duplicate-click prevention, unsaved drafts, and recovery from network/session failures. Use the configured browser QA pack where available; record browser coverage and any missing engines. Automated accessibility results do not replace manual keyboard/visual checks.

Test outages and recovery for Redis, Keycloak, database, object storage/scanner, and notification delivery in an isolated setup. Validate fail-closed security, visible recoverable failures, bounded retries, dead letters, cache fallback, scheduler leadership, and restart recovery without duplicate work. Recheck health after restoring every injected fault. A backup/restore drill must restore to disposable resources and verify database, documents, identity, and reconciliation consistency; never overwrite shared dev or production data.

For the production-readiness verdict, check each current Priority 0 launch blocker in `docs/remaining-work-prioritized.md` against fresh evidence, including approved legal and Arabic copy, bank details, `PII_INDEX_KEY` and migration prerequisites, WhatsApp template approval, facility contact data, backup and restore evidence, Journey runtime decision/integration, and owner or regulatory actions. Record who can close each blocker and the evidence required. Verify production configuration without printing secrets. Treat a configured local simulator, draft template, successful dev run, or code-only backup procedure as partial evidence where real production setup or human approval is still needed.

## 6. Measure performance and optimize demonstrated bottlenecks

Performance testing is part of this task, after basic correctness is stable. Establish a reproducible baseline for public intake/status, login, queues/search/pagination, case detail, document operations, proposal/payment actions, and async delivery.

Use approved traffic/volume expectations, latency/error budgets, and SLO/RPO/RTO if available. If absent, document provisional workload assumptions and engineering targets, ask for the launch workload, and continue bounded exploratory measurements. Never present assumed numbers as approved production capacity.

Use representative synthetic data volumes and mixed concurrent roles with realistic think time. Start with a single-user baseline and a small ramp; document concurrency, request rate, data size, duration, machine/container limits, and stop thresholds before execution. Run sustained, burst, and soak scenarios within a bounded resource budget. Higher-load/capacity and fault tests belong on an isolated local or staging environment, not the shared tunnel. Keep the tunnel check modest and representative.

Record p50/p95/p99 latency, throughput, unexpected error rates, timeouts, expected versus unexpected 429s, CPU/memory, database connections/query time/locks, cache behavior, outbox lag, and browser loading/responsiveness. Attribute tunnel/CDN latency separately where possible. Capture run commands and raw sanitized results. Intended throttling is a separate scenario; zero unexpected 429s should hold for ordinary role journeys. Do not disable gateway controls or spoof extra clients merely to inflate reported capacity.

Investigate measured causes such as N+1 queries, unbounded reads, missing indexes, slow transactions, lock contention, polling/request fan-out, large bundles, and pool/worker settings. Implement proportionate fixes, then compare the same workload before/after and rerun affected correctness tests. Never cache authorization, live clinical/workflow/payment state, weaken validation, or introduce unnecessary dependencies/infrastructure for benchmark gains. Follow offline Maven constraints.

State the tested operating envelope and limiting factors. A laptop/tunnel result supports only that tested environment; distinguish it from production sizing and external-service capacity. Identify configuration/capacity changes that are actually supported by evidence.

## 7. Fix, verify, and maintain evidence

For each defect record severity, requirement, affected actor/workflow, reproduction, expected/actual outcome, root cause, fix, and regression evidence. Prioritize safety/privacy, unauthorized access, data loss, incorrect money, blocked journeys, then remaining defects. Record existing failures too; do not hide them as unrelated or repeatedly rerun until a flaky test appears green.

Use focused tests while fixing. For significant bugs, demonstrate a regression test fails before the fix and passes after where practical. Do not weaken assertions, permissions, business invariants, or readiness gates to make tests pass. Work in bounded slices, updating the matrix and checkpoint after each, so this large task can resume across sessions without losing unverified areas. Finish with full backend/frontend regression, PostgreSQL verification where relevant, production-rendered E2E, and fresh affected live journeys against the final build. Earlier green runs do not validate later changes. Recheck the running revision and configuration before final acceptance; report a red or skipped gate rather than treating it as a pass.

Use available subagents for independent bounded work or review when useful, with one writer per file and one owner of integration/checkpoints. Serialize builds, database mutations, shared fixtures, and stack operations. Obtain independent review of critical authorization, identity, governance, money, and concurrency changes when available; state if that review could not be obtained. Do not claim tools/models were used when unavailable.

Create and maintain these artifacts under `docs/qa/deep-platform-validation/` (reuse an existing run directory if resuming, otherwise use a dated run directory):

- `requirements-matrix.csv`: all requirements, scenarios, status, and evidence links.
- `architecture-review.md`: backend module map, SOLID/clean-code and architecture findings with file/line evidence, severity, fixes, remaining risks, and reviewer/retest status.
- `defects.md`: reproducible findings, severity, fixes, retest results, remaining gaps.
- `performance.md`: workload, budgets, environment, raw-result references, before/after measurements, and limits.
- `production-readiness.md`: requirement-by-requirement launch gates, every current Priority 0 blocker with owner and evidence, configuration/recovery/security/integration checks, and unresolved decisions.
- `report.md`: final functional verdict, actual test totals, failed/skipped/blocked coverage, live journeys, changed files, and prioritized remaining actions.
- `checkpoint.md`: current revision/environment, completed work, fixtures, last commands/results, next exact action, and blockers, so another session can resume without redoing discovery.

Update the canonical Section 1 checkpoint at meaningful boundaries for changes to that epic, preserving history. Keep evidence sanitized and link bulky local/CI artifacts rather than committing secrets or unbounded reports. Send concise progress updates focused on findings, fixes, and remaining uncertainty.

## 8. Completion criteria and final answer

The objective is complete only when every approved in-scope requirement has an evidence-backed result; architecture findings have been resolved or explicitly recorded with risk; defects and approved implementation gaps have been fixed and retested or explicitly remain open; required real role journeys have run against the final code; and performance/recovery/production prerequisites have honest verdicts. Report the requirement counts by status and severity, including unexecuted live specs and every launch blocker. A critical or high severity failure in safety, privacy, authority, money, or the main patient journey prevents a functional-pass verdict. If any required item is failed, partial, blocked, or untested, state that full functional completion is not yet proven.

Report code quality and architecture, functional completion, and production readiness as separate verdicts. Open legal/native-Arabic approvals, actual bank details, external provider/template approvals, hosting/backup/restore requirements, or owner decisions cannot be closed by code tests. Do not claim legal approval, external penetration-test certification, or production readiness without the required evidence. Do not treat old backlog labels as current facts without checking them.

End with a concise answer: what now works, what was fixed, what was actually tested live, measured performance, what remains broken/missing/unverified, which exact decisions or credentials are needed, and links to the evidence and next-action checkpoint. Do not stop at an audit-only report while authorized fixes or independent verification remain possible.
