# Kickoff prompts for the review implementation phases

Paste one block into a **new** Claude Code session per phase. Set the model, effort and fast mode as the header
says before sending. Plan: `docs/platform-review-implementation-plan-2026-10-14.md`. Review:
`docs/platform-review-2026-10-14.md`.

Common tail for every prompt (already included below): verify first, then build; commit when green; do not push;
update the plan file's phase entry with what was delivered, tests, open gaps and the next action.

---

## P0-1 — Patient PII encryption, key versioning, fail-closed production
Model: Fable 5.1 · Effort: xhigh · Fast: off · Sessions: 2

```
Implement phase P0-1 of docs/platform-review-implementation-plan-2026-10-14.md (findings E-01, E-02, E-08, V13 in
docs/platform-review-2026-10-14.md).

Scope, in this order:
1. Encrypt patient_profiles.given_name, family_name and whatsapp_number with CryptoService; add whatsapp_hmac as an
   HMAC blind index and switch routing, status-link recovery (PublicCaseAccessService.samePhone) and WhatsApp inbound
   matching to it. One Flyway migration (next free version), pre-production clean cutover: no dual-read.
2. Add key_version to every encrypted column family; envelope encryption (master key from env wraps versioned data
   keys); a rotation job that re-encrypts and bumps key_version.
3. A prod-profile guard that refuses to start when the crypto key is the default, bank details are the dummy
   defaults, the Meta app secret is missing, or the FX source is missing.

Constraints: AGENTS.md and CLAUDE.md rules; ArchUnit stays green; full backend suite (mvn -o) and the PostgreSQL
mapping proof must pass. Delegate reformatting and test scaffolds to the mechanical-worker subagent. Do not change
the case lifecycle or payment logic in this phase.

Commit when green with a conventional message. Do not push. Finish by updating the P0-1 entry in the plan file with
delivered work, tests, open gaps and the next exact action.
```

## P0-2 — Lifecycle exits
Model: Fable 5.1 · Effort: high · Fast: off · Sessions: 1–2

```
Implement phase P0-2 (finding A-01, V6). In journey/application/CaseTransitionPolicy.java add: ACCEPTED -> EXPIRED
(when the deposit reminder cycle ends unpaid) and ACCEPTED -> CANCELLED; ARRIVAL_CONFIRMED, TREATMENT_IN_PROGRESS,
DISCHARGED, FOLLOW_UP -> CANCELLED with a typed reason (PATIENT_WITHDREW, HOSPITAL_REFUSED, MEDICAL_CONTRAINDICATION,
PATIENT_DECEASED, NO_SHOW); DISCHARGED -> CLOSED when the Consultant records "no follow-up needed"; a patient
"withdraw" action from My Care after ACCEPTED. Store the reason in a new table (next Flyway version). Make
StaffWorkService.syncStageWork close open work on every exit and CaseActionService return NONE with a calm,
bilingual status word per exit (en.json and ar.json). Add a property test: every non-terminal stage has at least one
exit. Verify first, build second, full backend suite green, commit, do not push, update the P0-2 plan entry.
```

## P0-3 — Clinical urgency and emergency guidance
Model: Opus 5.5 · Effort: medium · Fast: on · Sessions: 1

```
Implement phase P0-3 (finding A-02). Add a coordinator-set urgency (ROUTINE / PRIORITY / URGENT) with a mandatory
reason on the case, settable at intake and during review (new Flyway version). URGENT: work priority HIGH in
StaffWorkService, Consultant offer deadline halved (if P1-6 is not built yet, record the intent in a TODO in the plan
file), lead alert, and a routing tie-break in CoordinatorScoringService. Add a bilingual "If this is an emergency,
seek local care now" banner to Send my case (CaseForm.tsx), the status link (CaseStatusAccess.tsx) and My Care, and a
medical disclaimer line in the consent record. Copy in en.json and ar.json; logical CSS only; WCAG 2.2 AA. Use the
mechanical-worker subagent for the i18n sweep. Tests for priority derivation and tie-break. Commit when green, do
not push, update the P0-3 plan entry.
```

## P0-4 — Deposit redesign (needs owner decisions first)
Model: Fable 5.1 · Effort: high · Fast: off · Sessions: 2

Fill in before sending: commitment fee per currency: ____ ; treatment-deposit basis: doctor fees / patient total ;
launch rails: ____ .

```
Implement phase P0-4 (finding B-01, V2) with these owner decisions: commitment fee = <amount per currency>;
treatment deposit = 15% of <doctor fees | patient expected total>; rails at launch = <list>.

Build two deposit components on the existing deposit components model: COMMITMENT due at acknowledgement (unlocks
coordination; CustomerReadinessService and CaseTransitionPolicy.entryBlockers consume this one only) and TREATMENT
due at travel confirmation (JourneyService.upsertTravel confirm gate requires it settled). Extend the payment method
enum with CARD, AGENT_CASH, EXCHANGE_HOUSE; Finance records agent cash-in against a partner reference string.
Patient UI (PatientDepositPayment.tsx, MyCare.tsx) shows both amounts, when each is due and what each unlocks.
Ledger recompute, waiver and reminders work per component. Tests: readiness with commitment only; travel confirm
refused without treatment deposit; per-component ledger. Full suite green, commit, do not push, update the P0-4 plan
entry.
```

## P0-5 — Facility entity and package catalogue
Model: Fable 5.1 · Effort: high · Fast: off · Sessions: 3

```
Implement phase P0-5 (findings B-02, A-07). Session 1: facilities (name, city, accreditation records with expiry,
settlement terms, contact) and facility_packages (procedure code, care area, EGP range, inclusions, valid from/to,
approval status) with Control Center screens for Consultant Operations and a one-time Finance approval; expiry job
mirroring CredentialExpiryService. Session 2: proposal line source FACILITY_PACKAGE that releases without a Finance
work item, and a per-care-area pre-approved manual band on the commercial policy so a manual line inside the band
needs no Finance; update the gate computation in JourneyService.createProposal and the gate matrix tests. Session 3:
facility picker replaces the free-text facility field on the travel plan and treatment record; ClinicalReview.tsx
line picker. Keep facilities out of the Consultant workflow as users. ArchUnit: no cycles. Commit each session when
green, do not push, update the P0-5 plan entry.
```

---

## P1-6 — Time bounds on waits
Model: Opus 5.5 · Effort: medium · Fast: on · Sessions: 2

```
Implement phase P1-6, session 1 of 2, of docs/platform-review-implementation-plan-2026-10-14.md (findings A-03, A-04,
A-10, D-02 in docs/platform-review-2026-10-14.md, plus the A-02 TODO recorded under P1-6). Intended model: Opus 5.5,
effort medium, fast mode on. If you are a different model, say so in your first line and continue.

Before you start: read AGENTS.md, then the P1-6 entry in the plan file and the P0-3 and P0-5 Status entries just above
it (urgency vocabulary, migration numbering, verification shape). Do not re-discover the architecture.

Branch: work on top of feat/review-p0, whose HEAD is bc7c714 (local, not pushed). If this session runs in a worktree on
another branch, first run `git merge --ff-only bc7c714`, do the work there, commit, and say so in your final report so
the owner can fast-forward feat/review-p0.

Session 1 scope (the staff-side clocks):
1. Consultant offer TTL: an offered assignment expires after 48 working hours (24 when the case is URGENT, read with
   StaffWorkService.urgency(caseId) or CaseUrgency.urgent()); on expiry the offer is auto-declined with an audited
   reason, the coordinator gets the existing "offer declined" work item, and CaseUrgencyService.set recomputes an open
   offer's deadline when it raises a case to URGENT. Store the deadline on the assignment row (V93, TIMESTAMP WITH TIME
   ZONE, one ADD COLUMN per ALTER) and show it on the consultant's offer card and the coordinator's case page.
2. SLA table per queue written into work-item due dates so HIGH priority derives automatically through
   StaffWorkService.derivePriority: Finance verification 1 working day, identity review 2, Operations plan 2, consultant
   review 2, coordinator intake review 1. Put the table in one place (a small SlaPolicy class with the working-hours
   rule next to it) and read it where StaffWorkService.openWorkItem / syncStageWork create items.
3. Working hours: Cairo time, Saturday to Thursday 10:00-20:00, the same window the out-of-hours notification already
   states; look for an existing business-hours helper before writing one, and make the window configurable under
   app.sla.* with those defaults.
Session 2 (later, not now): information-request reminders on day 2 and day 5, a coordinator alert, auto-cancel at 30
days through CaseExitService; patient-facing "usually within N working days" plus a "meanwhile" line on every WAIT_*
state in CurrentAction.tsx, MyCare.tsx and CaseStatusAccess.tsx.

Facts the plan predates:
- The next free Flyway version is V93. V90-V92 are P0-5 (facilities). Migrations stay H2-safe: TIMESTAMP WITH TIME
  ZONE, one ADD COLUMN per ALTER, no partial indexes; CHECK constraints named.
- Persistence is JPA only: no plain SQL, no native queries, repositories extend BaseRepository, entities in ..domain..,
  repositories in ..infrastructure.., controllers call application services only. ArchitectureRulesTest must stay
  green (no cycles). Prove mappings with PostgresJpaMappingTest.
- Expiry-job patterns to copy: ProposalExpiryService, CredentialExpiryService, FacilityAccreditationExpiryService
  (all @Scheduled fixedDelayString, @Transactional, idempotent, audited). Reminder pattern: DepositPaymentReminders.
- Source files are CRLF (some LF). Git Bash `sed -i` strips CR, and heredocs containing apostrophes break the Bash tool:
  write Python edit scripts to the scratchpad that normalise newlines before matching and restore the file's endings.
- The worktree starts without node_modules: run `pnpm install --offline --frozen-lockfile` in frontend (about two
  minutes from the store).
- Patient-facing copy lives in frontend/src/messages/en.json and ar.json (CRLF; edit surgically, never re-serialise);
  staff screens under components/portal carry inline en/ar objects. Logical CSS only, WCAG 2.2 AA.

Delegation (you own scope, the migration, the lifecycle and authority rules, integration and all verification):
- Delegate the offer-expiry job and its test to the workflow-builder subagent after you have written the V93 column,
  the entity field and the SlaPolicy class; tell it the deadline rule and the audit event name; review its diff.
- Delegate the EN/AR copy for the deadline labels to the mechanical-worker subagent with exact strings and key paths.
- Subagents never run Maven or pnpm. You run every build and test yourself, one at a time, never two in parallel.
- Anything that touches CaseTransitionPolicy, CaseExitService or PaymentService stays with you.

Verification: `cd backend && mvn -o -q test` stays at 0 failures (3 pre-existing skips; the suite was 791/0 at bc7c714).
Frontend: `pnpm typecheck`, the unit tests of the touched components, eslint on touched files. Then the PostgreSQL
proof: `docker run -d --name rs-jpa-mapping-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=jpa_mapping_test -p
127.0.0.1:55439:5432 postgres:17-alpine`, wait for pg_isready, run `mvn -o -q -Dtest=PostgresJpaMappingTest
-Djpa.postgres.test-url=jdbc:postgresql://127.0.0.1:55439/jpa_mapping_test test`, then `docker rm -f rs-jpa-mapping-pg`.

Finish: when green, commit with a conventional message (feat(p1-6): ...) ending in "Co-Authored-By: <your model name>
<noreply@anthropic.com>". Do not push. Update the P1-6 entry in the plan file with a Status block in the same shape as
the P0-5 entries: delivered work, tests and verification numbers, open gaps, and the next exact action (P1-6 session 2,
and that the owner must fast-forward feat/review-p0 and rebuild the dev stack so V93 runs).
```

---

## P1-8 — Metrics, alerts, scheduler leadership
Model: Opus 5.5 · Effort: medium · Fast: owner's choice (normal mode was used for P1-6) · Sessions: 2, then 1 short
Fable 5.1 high verification session

```
Implement phase P1-8, session 1 of 2, of docs/platform-review-implementation-plan-2026-10-14.md (findings E-05 and
E-04 in docs/platform-review-2026-10-14.md). Intended model: Opus 5.5, effort medium. If you are a different model,
say so in your first line and continue.

Before you start: read AGENTS.md, then the P1-8 entry and the "Remaining work" section in the plan file, and the
P1-6 Status entries (the newest scheduled jobs and the SLA table). Do not re-discover the architecture.

Branch: work on top of feat/review-p0 (pushed at e68dbc5, plus this prompt's docs commit). If this session runs in a
worktree on another branch, first `git merge --ff-only feat/review-p0`, do the work there, commit, and say so in your
final report so the owner can fast-forward feat/review-p0.

Facts the plan predates (checked 2026-10-14):
- There are 21 @Scheduled methods in 19 classes, not 16 (P1-6 added ConsultantOfferExpiryService.expireOffers,
  StaffWorkService.raiseWorkDueSoon, InformationRequestReminders.sweep). List them with
  `grep -rn "@Scheduled" backend/src/main/java` before you start.
- Maven is offline. ~/.m2 has micrometer-core (through spring-boot-starter-actuator) but NOT
  micrometer-registry-prometheus, and has NO ShedLock artifact at all. Actuator exposes only `health` today.
- docker-compose.observability.yml is Elasticsearch, Kibana and Filebeat only; there is no Prometheus or Grafana.
- Next free Flyway version is V95. Persistence is JPA only (no plain SQL, no native queries, repositories extend
  BaseRepository, entities in ..domain.., repositories in ..infrastructure..); ArchitectureRulesTest must stay green.
- Row claiming already uses locks in QueuedNotificationRepository, WhatsAppInboundMessageRepository,
  IdentityOperationRepository, ReplyObligationRepository, IntakeConversationRepository and BaseRepositoryImpl.

Recommendation on the two missing artifacts (the owner decides once, at the start; ask in one question):
- Scheduler leadership WITHOUT ShedLock: a JPA lease table (V95 `scheduler_leases`: name PK, owner instance id,
  locked_until TIMESTAMP WITH TIME ZONE, locked_at) taken with a guarded JPQL update ("take when free or expired"),
  wrapped around every job by one small aspect or helper. No new dependency, no JdbcTemplate exception in
  ArchitectureRulesTest, and it is the same guarded-update pattern the jobs already use. Recommended.
- Prometheus: micrometer-registry-prometheus needs one online Maven fetch (version from the Spring Boot BOM) and
  Prometheus + Grafana images need docker pulls. Ask the owner before any download. Without it, ship the meters on
  micrometer-core and expose them on the actuator `metrics` endpoint behind authentication; add the registry later.

Session 1 scope (meters and alerts):
1. Business meters on Micrometer (MeterRegistry), registered in one place per module, tags low-cardinality only
   (team, queue type, channel; never case ids, subjects or names): open work per queue type and its oldest age,
   HIGH and overdue counts; time to proposal (submitted -> released, timer recorded at release); deposit verification
   age (oldest DEPOSIT_RECORD item); reply-timer breaches (ReplyTimerService escalations); outbox dead letters and
   retries by channel; consultant offers expired; information requests cancelled. Gauges read through the existing
   repositories, cached at most 60 s so a scrape never scans tables.
2. Actuator: expose `metrics` (and `prometheus` only if the owner approved the fetch) to authenticated operators
   only; never through the public gateway path without auth. Update SecurityConfig and its coverage test.
3. Alert rules as code: a short alerts document (or Prometheus rules file if approved) with thresholds read from the
   SLA table where one exists (e.g. deposit verification older than 1 working day, any outbox dead letter, reply
   breaches > 0 in 15 min).
Session 2 (later, not now): the scheduler lease on all 21 jobs, the Grafana dashboard JSON, and the Fable 5.1 high
verification session for the lease and the SKIP LOCKED / row-lock claiming in the stores listed above.

Delegation (you own the meter design, security exposure, integration and all verification):
- Delegate the meter registrations for one module at a time to the workflow-builder subagent once you have written
  the first module's meters as the pattern; review each diff.
- Delegate the alerts document and, in session 2, the Grafana dashboard JSON to the mechanical-worker subagent with
  the exact meter names.
- Subagents never run Maven or pnpm. You run every build and test yourself, one at a time, never two in parallel.
- Anything that touches CaseTransitionPolicy, CaseExitService, PaymentService or authorization stays with you.

Verification: `cd backend && mvn -o -q test` stays at 0 failures (811 tests and 3 pre-existing skips at 7d0bbd4).
Add a test that each meter exists with the expected tags and changes when its source changes, and that the metrics
endpoint refuses an anonymous request. If a migration is added, run the PostgreSQL proof: `docker run -d --name
rs-jpa-mapping-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=jpa_mapping_test -p 127.0.0.1:55439:5432
postgres:17-alpine`, wait for pg_isready, run `mvn -o -q -Dtest=PostgresJpaMappingTest
-Djpa.postgres.test-url=jdbc:postgresql://127.0.0.1:55439/jpa_mapping_test test`, then `docker rm -f rs-jpa-mapping-pg`.

Finish: when green, commit with a conventional message (feat(p1-8): ...) ending in "Co-Authored-By: <your model name>
<noreply@anthropic.com>". Do not push. Add a Status block to the P1-8 entry in the plan file in the same shape as the
P1-6 entries (delivered work, tests and numbers, open gaps, next exact action: P1-8 session 2), and tick or update
the "Remaining work" section.
```

---

## Delegation inside a session

A Fable session can hand bounded work to the project subagents in `.claude/agents/`:

- `workflow-builder` (Opus, medium effort): well-specified rule and workflow slices.
- `mechanical-worker` (Sonnet, low effort): reformatting, i18n sweeps, test scaffolds, docs.

Ask in plain words, naming the agent: "Use the mechanical-worker subagent to add the Arabic keys for the new
status words" or "Delegate the reminder job to the workflow-builder subagent, then review its diff." The lead
session reviews every subagent diff before committing.
