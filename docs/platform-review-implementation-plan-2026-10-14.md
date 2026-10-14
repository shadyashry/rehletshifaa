# Implementation plan for the 2026-10-14 expert review

Source: `docs/platform-review-2026-10-14.md`. Finding IDs (A-01, E-02 …) refer to that document.

Working rules (from `CLAUDE.md` and the owner's standing decisions): one phase per Claude Code session on
`codex/platform-control-plane`, commit when green, never push without being asked; smallest correct patch per
component; every copy change in `en.json` and `ar.json`; pre-production clean cutover (replace, don't shim);
full backend suite (`mvn -o`) plus the PostgreSQL mapping proof must stay green per phase.

## Which Claude Code model and which speed

| Work type | Model | Effort | Fast mode | Why |
|---|---|---|---|---|
| Architecture-sensitive slices that touch the lifecycle, money, crypto, or the `JourneyService` split (P0-1, P0-2, P0-4, P0-5, P1-7, P1-11) | **Claude Fable 5.1** (this model) | **high** (xhigh for P0-1 and P1-11) | off | These change invariants that every other module relies on; the cost of a wrong cut is a week of rework |
| Rule-and-workflow slices with clear specs (urgency, TTLs, reminders, SLA labels, incidents, payer org, partners, validators) | **Claude Opus 5.5** | medium | **on** | Well-bounded; Opus with fast output gives the best throughput; the patterns already exist in the codebase to copy |
| Mechanical slices (reformatting, i18n sweeps, test scaffolds, docs, dashboards JSON, Grafana panels, Arabic copy pass) | **Claude Sonnet 5.5** | low–medium | on | Cheap, fast, low risk |
| Review of any P0 phase before commit | Fable 5.1 via `/code-review high` on the diff | — | off | Independent pass on the riskiest changes |

How to set it in the desktop app: pick the model in the session's model selector, set effort in the session settings
(low / medium / high / xhigh / max), toggle fast output with `/fast`. Fast mode runs Opus with faster output; it does
not change the model's reasoning quality, so use it for the Opus and Sonnet rows, not to "speed up" Fable.

Session count below assumes one slice per session, 2–4 hours of agent time each, owner verification on dev between
phases.

---

## P0 — Critical (before any real patient)

### P0-1  Patient PII encryption, key versioning, fail-closed production  (E-01, E-02, E-08, V13)
- **Scope:** encrypt `patient_profiles.given_name`, `family_name`, `whatsapp_number` with `CryptoService`; keep
  `whatsapp_digits` as an HMAC blind index (new `whatsapp_hmac` column) used by routing, recovery and inbound
  matching; add `key_version` to every encrypted column family; envelope encryption (master key from env or KMS wraps
  versioned data keys); rotation job; a `prod` profile validator that refuses the default crypto key, dummy bank
  details, missing Meta app secret, missing FX source.
- **Files:** `shared/crypto/CryptoService.java`, `directory/domain/PatientProfile.java`,
  `casemanagement/application/IntakeLifecycleService.java`, `journey/application/PublicCaseAccessService.java`
  (`samePhone`), `conversation/application/WhatsAppInboundProcessor.java`, new `V86__encrypt_patient_pii.sql`, new
  `shared/config/ProductionGuards.java`, `application.yml`.
- **Tests:** mapping proof on PostgreSQL; inbound match by hashed digits; recovery link by hashed phone; validator
  refuses each default; rotation re-encrypts and bumps `key_version`.
- **Acceptance:** no plaintext name/phone column; `prod` profile fails to start with any default secret.
- **Sessions:** 2. **Model:** Fable 5.1, xhigh.
- **Status (2026-10-14, branch `feat/review-p0`):** delivered.
  - Delivered: `PiiCipher` primitive; `CryptoService` with versioned keys (`v<N>:` prefix, unprefixed = key 1,
    `app.crypto.pii-keys.<N>`, `active-pii-key-version`), separate HMAC index key, `isCurrent`/`reencrypt`;
    `EncryptedStringConverter` on `patient_profiles.given_name/family_name/preferred_name/whatsapp_number` and
    `case_submission_contacts.contact_name/whatsapp_number`; `whatsapp_digits` replaced by the `whatsapp_hmac` blind index
    kept by `PhoneIndexListener`; inbound WhatsApp matching, verified-mobile check and intake-conversation lookup use the
    index; display names composed in Java (`PatientNameParts`) instead of JPQL `concat`; `V86__encrypt_patient_pii`
    encrypts existing rows in place; `PiiKeyRotationService` sweep (`app.crypto.rotation-cron`, off by default; batches
    by `id` or `subject`); `ProductionSafetyValidator` refuses dev keys, short keys and placeholder bank details;
    compose/deploy env and docs carry `PII_INDEX_KEY`.
  - Tests: full offline suite 744 run / 0 failures after fixes; `CryptoServiceTest`, `PatientPiiAtRestTest`,
    `PiiKeyRotationServiceTest`, `ProductionSafetyValidatorTest`, `CleanPatientSchemaMigrationTest` (V86 on H2),
    `PostgresJpaMappingTest` and `PostgresPiiKeyRotationTest` against a PostgreSQL 17 container.
  - Open gaps: patient `email` and submitter `email` are still plaintext (blind index pattern is ready; needs the
    Keycloak email-resolution paths reviewed first); intake conversations and inbound WhatsApp rows keep plaintext
    sender digits (operational key; decide in P1-7 with retention); the dev
    database must be started with `PII_INDEX_KEY` set (compose files updated) before V86 runs there.
  - Next exact action: P0-2 (lifecycle exits) in a new session; rebuild the dev stack first so V86 runs on dev data.

### P0-2  Lifecycle exits  (A-01, V6)
- **Scope:** `CaseTransitionPolicy`: `ACCEPTED → EXPIRED` (after the deposit reminder cycle ends) and
  `ACCEPTED → CANCELLED`; `ARRIVAL_CONFIRMED`, `TREATMENT_IN_PROGRESS`, `DISCHARGED`, `FOLLOW_UP → CANCELLED` with a
  typed reason (`PATIENT_WITHDREW`, `HOSPITAL_REFUSED`, `MEDICAL_CONTRAINDICATION`, `PATIENT_DECEASED`, `NO_SHOW`);
  `DISCHARGED → CLOSED` when the Consultant records "no follow-up needed"; a patient `WITHDRAWN` action from My Care
  after `ACCEPTED`. Cancellation reason table; `syncStageWork` closes open work; deposit refund rule hook.
- **Files:** `journey/application/CaseTransitionPolicy.java`, `JourneyService.transition`,
  `CaseActionService` (new `NONE` reasons), `StaffWorkService.syncStageWork`, `DepositPaymentReminders` (end of
  cycle → expire), `V87__case_cancellation_reasons.sql`, `StaffCaseView.tsx`, `MyCare.tsx`, `en.json`/`ar.json`.
- **Tests:** one test per new edge; "every non-terminal stage has at least one exit" property test; patient-visible
  status words for each exit in EN/AR.
- **Sessions:** 1–2. **Model:** Fable 5.1, high.
- **Status (2026-10-14, branch `feat/review-p0`):** delivered.
  - Delivered: `CaseTransitionPolicy` gains `ACCEPTED → EXPIRED | CANCELLED`, `ARRIVAL_CONFIRMED | TREATMENT_IN_PROGRESS |
    DISCHARGED | FOLLOW_UP → CANCELLED`, `DISCHARGED → CLOSED`, plus the static rules every caller shares (`TERMINAL`,
    `TYPED_CANCELLATION_STAGES`, `exitsFrom`, `patientMayWithdraw`). New `CaseExitService` is the one writer of every
    exit, each validated by the policy: coordinator typed cancellation (through the existing transition endpoint,
    `TransitionRequest.cancellationReason`, mandatory from ACCEPTED onwards, 400 `CANCELLATION_REASON_REQUIRED`), patient
    withdrawal (`POST /patient/cases/{id}/withdraw`, PATIENT_DECIDE step-up, refused with 409
    `WITHDRAWAL_NEEDS_COORDINATOR` once the travel plan is CONFIRMED/ARRIVED), deposit expiry (`expireUnpaidDeposit`, called
    by `DepositPaymentReminders` after day 4 + `app.payments.deposit-expiry-grace-days`, default 14; a deposit nothing was
    received against is cancelled so a re-prepared estimate raises a fresh one), and the Consultant's "no follow-up
    needed" (`POST /doctor/cases/{id}/follow-ups/not-needed`). Every exit writes `case_status_history`, two audit events
    (`CASE_STATUS_CHANGED`, `CASE_EXIT_RECORDED`), a `case_exit_reasons` row (`V87__case_exit_reasons.sql`; note stored
    encrypted; history and audit carry the typed reason only), cancels every open task on the case once, at the exit
    (`StaffWorkService.closeOpenWork`; `EMERGENCY_OVERRIDE_REVIEW` survives, and work opened on an ended case afterwards,
    such as a refund, is left alone), and resets `waiting_on` to NONE. The unpaid deposit is cancelled by
    `PaymentService.cancelUnpaidDeposit` (audited `DEPOSIT_CANCELLED`), never by the exit service directly. `CaseActionService` returns `NONE` with `CurrentActionView.exit`
    (WITHDRAWN / CANCELLED / EXPIRED / COMPLETED / CLOSED) and offers `WITHDRAW` to the patient and `CANCEL_CASE` to the
    coordinator in the typed stages; Consultants still never cancel a whole case. Frontend: `CancelCaseDialog`
    (typed reason + encrypted note) behind More actions in `StaffCaseView`, one quiet withdraw line with a confirm dialog in
    `MyCare`, copy under `myCare.steps`, `myCare.withdraw`, `cancelCase`, `workCopy.items.CASE_EXPIRED_UNPAID` in EN/AR.
  - Tests: `CaseTransitionPolicyTest` (property: a terminal stage is reachable from every non-terminal stage; the committed
    stages leave directly; withdrawal rule table); `JourneyServiceIntegrationTest` one test per post-arrival edge
    (typed reason required, Consultant refused, work closed, audit; contraindication; no-follow-up close with role and
    stage guards; deceased; no-show); `CoordinatorCaseActionsTest` ACCEPTED typed cancel, patient withdraw until travel
    is confirmed, reminder cycle → EXPIRED after the grace period (idempotent, coordinator told once); frontend
    `MyCare.test.tsx` and `StaffOperationalUi.test.tsx` (exit words, one quiet withdraw action, typed dialog contract).
  - Open gaps: no refund rule hook yet (a part-paid deposit is left as is on every exit; Finance's rule belongs to
    P0-4); the patient gets no notification on expiry (the coordinator does; a patient template needs the notification
    copy pass); the Consultant has no UI for "no follow-up needed" or for follow-up plans at all (backend only, as
    before); a case re-opened from a deposit expiry keeps its cancelled deposit history and relies on the coordinator
    re-preparing the estimate. A `/code-review high` pass on the diff found nine issues (note leaked plaintext into
    history/audit, column overflow, post-exit work swept, governance reviews closed, deposit status written around
    PaymentService, eager travel-plan read, two sources for the expiry word, dead confirm fallback, untested part-paid
    expiry); all nine are fixed in the follow-up commit.
  - Next exact action: P0-3 (clinical urgency and emergency guidance) in a new session from its prompt block, Opus 5.5
    fast, after fast-forwarding `feat/review-p0` to this commit and rebuilding the dev stack so V87 runs.

### P0-3  Clinical urgency and emergency guidance  (A-02)
- **Scope:** `urgency` on the case (ROUTINE / PRIORITY / URGENT) set by the coordinator with a reason at intake and
  changeable in review; URGENT → work priority HIGH, Consultant offer TTL halved, lead alert, routing tie-break;
  bilingual "if this is an emergency, seek local care now" banner on Send my case, status link and My Care;
  medical disclaimer in the consent record.
- **Files:** `V88__case_urgency.sql`, `JourneyService`/`CaseService`, `StaffWorkService` priority derivation,
  `AssignmentEngine` tie-break, `CaseForm.tsx`, `CaseStatusAccess.tsx`, `MyCare.tsx`, copy.
- **Sessions:** 1. **Model:** Opus 5.5 fast, medium.
- **Status (2026-10-14, branch `feat/review-p0`):** delivered (Opus 5.5; the effort level is set by the owner in the app).
  - Delivered: `V88__case_urgency.sql` adds `medical_cases.urgency` (ROUTINE default, CHECK) and the append-only
    `case_urgency_changes` (from/to, stage, who, when, reason stored encrypted). `CaseUrgency` enum; `MedicalCase.changeUrgency`
    is bookkeeping (no version bump). New `CaseUrgencyService` behind `GET|PUT /api/v1/coordinator/cases/{id}/urgency`
    (CASE_COORDINATE; reason mandatory, max 500; refused on DRAFT/ended cases `URGENCY_LOCKED`, on the same level
    `URGENCY_UNCHANGED`; row lock so the recorded "from" is real). Audit `CASE_URGENCY_CHANGED` carries only
    `FROM -> TO`, never the reason. URGENT: `StaffWorkService.derivePriority(blocking, dueAt, urgency, now)` is still the
    one source of priority, with urgency as a further input (new work HIGH; open LOW/NORMAL work raised once by
    `raiseOpenWorkForUrgency`; lowering urgency lowers nothing, because a hand-raised item cannot be told apart); lead
    alert `CASE_MARKED_URGENT` (in-app + work email) to the primary coordinator, their CARE_COORDINATION leads, else
    the Care Coordination Managers, never to the person who set it; routing tie-break in
    `CoordinatorScoringService.score(…, urgent)` (equal scores: on-duty first, then fewest cases held, then the usual
    ratio / last assignment / subject; urgency never changes a score, eligibility or precedence; `CaseFacts.urgent`
    read by `CoordinationRepository.facts`). `CaseActionService` offers `SET_URGENCY` while the case is in its journey;
    `CaseView.urgency` for staff, null for patient and Finance-payment views. Consent: intake consent is now
    `intake-v2`, the form's consent sentence plus the medical disclaimer, stored in the patient's language
    (`IntakeLifecycleService.intakeConsentTerms`), and the same disclaimer line sits inside the consent checkbox on
    Send my case. Frontend: `EmergencyGuidance` (static `role="note"`, logical `border-s`, alert tokens) on Send my case
    (`CaseForm.tsx`, both the guest and the signed-in paths), the status link (`CaseStatusAccess.tsx`, every phase,
    copy passed by the page from `common.emergencyNotice`) and My Care (care view, `myCare.emergency`);
    `UrgencyDialog` behind More actions plus a staff-only urgency fact in the `StaffCaseView` header. Copy in EN/AR
    (`common.emergencyNotice`, `form.medicalDisclaimer`, `myCare.emergency`, `portalWork.urgency`,
    `workCopy.items.CASE_MARKED_URGENT`) by the mechanical-worker subagent; `myCare.withdraw` and `myCare.steps` kept.
  - Tests: `UatDefectCorrectionsTest.urgentCaseMakesItsWorkHighAndNothingElseDoes` (priority derivation incl. PRIORITY
    and ROUTINE); `CoordinatorScoringTest` urgent tie-break order and selection, and "urgency never outranks a higher
    score"; new `CaseUrgencyServiceTest` (routine default + SET_URGENCY offered; URGENT raises open and new work, alerts
    the lead once and not the actor, reason encrypted and absent from audit, lowering keeps history and raised work;
    managers alerted without a lead; reason/level/locked refusals; Consultant refused); frontend
    `CaseStatusAccess.test.tsx` (EN/AR note), `MyCare.test.tsx` (one note, care view only, not an alert),
    `StaffOperationalUi.test.tsx` (More actions offers it only when listed; dialog needs a new level and a reason, one
    PUT; Arabic levels). Verification: `mvn -o -q test` 769 tests, 0 failures, 3 pre-existing skips (the affected
    classes re-run after the last backend edit); `pnpm typecheck` clean; eslint clean on touched files; 5 touched
    vitest files 115/115; `PostgresJpaMappingTest` on postgres:17 green with V88 applied.
  - Open gaps: the Consultant offer deadline is not halved yet, because the offer TTL does not exist; the TODO is in
    P1-6. The urgency is not set inside the intake form itself; the coordinator sets it from More actions at intake
    and during review. The dialog does not show the previous reason (the GET endpoint returns it). The queue cards
    and team queue do not sort or badge by urgency yet. The routing tie-break only acts on routing after urgency is
    set (reassignment, re-routing), since a new case starts ROUTINE when it is first routed. No Send my case unit test
    exists, so the notice there is covered by typecheck only. Native Arabic review of the new copy is pending with
    the rest of the Arabic copy.
  - Next exact action: P0-4 (deposit redesign) needs the owner's three deposit decisions first (commitment-fee amount
    per corridor currency, treatment-deposit basis, launch rails). Once they are recorded, start P0-4 in a new session
    from its prompt block, Fable 5.1 high, after fast-forwarding `feat/review-p0` to this commit and rebuilding the dev
    stack so V88 runs.

### P0-4  Deposit redesign: commitment fee + treatment deposit, corridor rails  (B-01, V2)
- **Owner decisions needed first:** commitment-fee amount per corridor currency; treatment-deposit basis (doctor fees
  vs patient total); which rails launch (Egyptian PSP card, partner cash-in, exchange house).
- **Scope:** two deposit components on the existing `deposit_components` model: `COMMITMENT` (due at
  acknowledgement, unlocks coordination) and `TREATMENT` (due at travel confirmation); readiness gate consumes
  `COMMITMENT` only; `TRAVEL_COORDINATION` entry unchanged; travel **confirmation** requires `TREATMENT` settled;
  `method` enum gains `CARD`, `AGENT_CASH`, `EXCHANGE_HOUSE`; agent cash-in recorded by Finance against a partner
  reference (partner entity from P1-12 or a simple reference string until then); patient UI shows the two amounts and
  when each is due.
- **Files:** `PaymentService.createDepositForAcknowledgement`, `DepositQueryService`, `CustomerReadinessService`,
  `CaseTransitionPolicy.entryBlockers`, `JourneyService.upsertTravel` (confirm gate), `V89__deposit_components_v2.sql`,
  `PatientDepositPayment.tsx`, `FinanceApproval.tsx` / Finance verification screen, copy.
- **Tests:** readiness with commitment only; travel confirm refused without treatment deposit; ledger recompute per
  component; waiver per component.
- **Sessions:** 2. **Model:** Fable 5.1, high.

### P0-5  Facility entity and package catalogue  (B-02, A-07)
- **Scope:** `facilities` (name, city, accreditation records with expiry, settlement terms, contact) and
  `facility_packages` (procedure code, care area, EGP range, inclusions, valid from/to, approval status) owned by
  Consultant Operations, approved once by Finance; a proposal line source `FACILITY_PACKAGE` that releases without a
  Finance work item; manual lines keep the Finance gate; per-care-area pre-approved manual band (`manual_band_egp`)
  on the commercial policy so a manual line inside the band releases without Finance; facility picker on the travel
  plan and treatment record replaces the free-text field.
- **Files:** `V90__facilities_and_packages.sql`, new `facility` module (keep inside `journey` or a new slice;
  ArchUnit cycle check), `PricingCatalogService`, `JourneyService.createProposal` gate computation,
  `CommercialPolicyService`, Control Center screens (`platform-control-center/`), `ClinicalReview.tsx` line picker,
  copy.
- **Tests:** gate matrix with the new source; band inside/outside; facility accreditation expiry job (reuse
  `CredentialExpiryService` pattern).
- **Sessions:** 3. **Model:** Fable 5.1, high.

---

## P1 — High (before the first paying patient)

### P1-6  Time bounds on waits  (A-03, A-04, A-10, D-02)
- Consultant offer TTL (48 working hours → auto-decline, coordinator work); information-request reminders day 2 /
  day 5 / coordinator / auto-cancel at 30 days; SLA table per queue (Finance verify 1 working day, identity review
  2, Operations plan 2) written into work-item due dates so HIGH derives automatically; patient-facing "usually
  within N working days" on every `WAIT_*` state plus a "meanwhile" line.
- TODO from P0-3 (A-02): an URGENT case halves the Consultant offer deadline (24 working hours instead of 48). Read
  the level with `StaffWorkService.urgency(caseId)` (or `CaseUrgency.urgent()`) when the offer deadline is computed,
  and recompute an open offer's deadline when `CaseUrgencyService.set` raises a case to URGENT.
- Files: new `ConsultantOfferExpiryService`, `DepositPaymentReminders` pattern reused for information requests,
  `StaffWorkService` due-date source, `CaseActionService` wait windows, `MyCare.tsx`, `CaseStatusAccess.tsx`, copy.
- Sessions: 2. Model: Opus 5.5 fast, medium.

### P1-7  Retention, purge, erasure, draft clean-up  (E-03, §7.13)
- `retention_policies` table (record class → days, legal-hold flag); scheduled purge with audit (abandoned drafts
  and their files at 7 days first); subject erasure that pseudonymises the person and keeps ledger and audit;
  Compliance read-only view of purges.
- Files: `V91__retention.sql`, new `shared/retention/RetentionService`, `DocumentService` (S3 delete), Control
  Center audit screen.
- Sessions: 2. Model: Fable 5.1, high.

### P1-8  Metrics, alerts, scheduler leadership  (E-05, E-04)
- Micrometer + Prometheus registry; business gauges and timers (queue depth per team, time-to-proposal, deposit
  verification age, reply-timer breaches, outbox dead letters); Grafana dashboard JSON in
  `docker-compose.observability.yml`; alert rules; ShedLock on all 16 `@Scheduled` jobs; verify `SKIP LOCKED` claiming
  in outbox, identity-operation and inbound stores.
- Sessions: 2. Model: Opus 5.5 fast, medium (ShedLock verification: Fable high, 1 short session).

### P1-9  Backups and restore drill  (E-09)
- Managed Postgres PITR settings documented and scripted for the chosen host; versioned S3 with cross-region copy;
  nightly Keycloak realm export; a `scripts/restore-drill.sh` that restores to a scratch stack and runs the smoke
  suite; RTO/RPO written into `docs/deployment.md`.
- Sessions: 1–2. Model: Opus 5.5 fast, medium.

### P1-10  Commercial truth on the proposal  (B-03, A-08, B-05, D-01)
- "How your price works" three-step panel and the no-surprise guarantee text (counsel-approved) on the proposal and
  homepage; "coordination & guarantee" named in inclusions; final-quote rule: expected ≤ preliminary maximum unless a
  Consultant scope-change reason is recorded and shown, with a 24-hour cooling period before acceptance; final-quote
  validity (setting, default 14 days) and FX tolerance band (setting) with Finance re-approval outside it.
- Files: `JourneyService.createFinalQuote`, `ProposalExpiryService` (final quotes), `CommercialPolicyService`
  settings, `ProposalSign.tsx`, homepage, copy.
- Sessions: 2. Model: Fable 5.1, high (rule) then Sonnet 5.5 (copy/UI).

### P1-11  Split `JourneyService`  (E-06)
- Extract `ConsultantAssignmentService`, `ClinicalReviewService`, `ProposalService` (create / release / decide /
  resend), `FinalQuoteService`, `TreatmentService`, `FollowUpService`; reformat to normal line length; no behaviour
  change; ArchUnit and all 720 tests green; do this **after** P0-2/P0-4/P1-10 so the extracted code is the final
  shape.
- Sessions: 2. Model: Fable 5.1, xhigh.

### P1-12  Payouts, payer organisations, partners  (B-04, C-03/F-01, F-04)
- Settlement statement per case from the frozen snapshot (provider net, deposits received, balance, facility
  share); Finance "mark paid" with reference; monthly provider statement export. `payer_organisations` (type:
  GOVERNMENT / EMPLOYER / INSURER), payer quote PDF addressed to the payer, guarantee-letter upload as a document
  type, payer pays at confirmation. `partners` with referral code, case attribution, commission statement, status-only
  visibility.
- Sessions: 3 (one per entity). Model: Opus 5.5 fast, medium; settlement maths reviewed by Fable.

### P1-13  Minors, guardians, incidents, reopen  (A-05, A-06)
- Age band at intake; `GUARDIAN` delegation type with evidence requirement and its own consent text; case-level
  `incidents` (COMPLAINT / DISPUTE / ADVERSE_EVENT / DEATH, severity, owner, resolution) visible to Compliance;
  complaint intake from My Care routed to the Care Coordination Manager; `REOPEN` from `CLOSED` into `FOLLOW_UP`.
- Sessions: 2. Model: Opus 5.5 fast, medium (guardian consent reviewed by Fable).

### P1-14  Consultant public profiles  (D-03, §16.2 item 5)
- Render the published public profile: "Credentials reviewed · current", years, sub-specialties, languages,
  platform case volume, optional intro video (S3, scanned); no ratings.
- Sessions: 1. Model: Sonnet 5.5 fast, medium (Impeccable pass by Fable at the end).

---

## P2 — Medium (first quarter after launch)

| ID | Slice | Sessions | Model |
|---|---|---|---|
| P2-15 | `market`/`destination` column with default `EG` on catalogue, policies, facility, base currency, readiness (C-01) | 1 | Fable high |
| P2-16 | S11 returning patient → same coordinator; patient-level primary coordinator (A-09) | 1 | Opus fast |
| P2-17 | Care-area change reason and "Reviewed by" (A-12); second-opinion visibility (A-11) | 1 | Opus fast |
| P2-18 | R1 travel items with companions and per-traveller documents (A-13, §2.7) | 3 | Fable high |
| P2-19 | Stage-weighted capacity; full-cover mode for leave (A-14) | 1 | Opus fast |
| P2-20 | Signature moments: case sent, specialist reviewing, estimate ready, welcome, discharge summary (D-04) | 3 | Fable high (Impeccable), Sonnet for copy |
| P2-21 | Arabic-first copy pass, Arabic type scale and numeral rule in `DESIGN.md` (D-05) | 2 | Sonnet fast, then native reviewer |
| P2-22 | Staff "My work" keyboard flow, one-next-action strip, bilingual templates (D-06) | 2 | Opus fast |
| P2-23 | Per-link rate limits and Turnstile-backed upload exemption (E-11) | 1 | Opus fast |
| P2-24 | Refund rules enforced per §2.6 (B-06); minimum coordination fee (B-07) | 1 | Fable high |
| P2-25 | Paid specialist opinion product (F-02) on the review flow + payment adapter (§2.5 decided) | 3 | Fable high |
| P2-26 | Decision record: Flowable frozen as definition + history + simulation (E-07) | 0.5 | Sonnet |

## P3 — Low (backlog)

Non-sequential case numbers (A-15); constant-time Track case (A-16); slot-bound final-assessment appointment
(A-17); Control Center theme convergence when touched (D-07); service hours per team with zone (C-06); FHIR Bundle
export on demand (C-07); region-per-market deployment (E-10); video consultation (F-03); aftercare subscription
(F-05). Sonnet or Opus fast, one session each.

---

## Order of sessions (recommended)

1. P0-1 (crypto) → 2. P0-2 (exits) → 3. P0-3 (urgency) → 4. P0-4 (deposit; needs owner decisions) → 5. P0-5
(facility) → 6. P1-6 (time bounds) → 7. P1-8 (metrics + ShedLock) → 8. P1-7 (retention) → 9. P1-10 (commercial
truth) → 10. P1-11 (split) → 11. P1-12 (payouts/payer/partner) → 12. P1-13 (guardian/incidents) → 13. P1-9 (DR
drill) → 14. P1-14 (profiles) → P2 in table order.

Owner decisions that gate a slice: P0-4 (fee amounts, deposit basis, rails), P1-10 (guarantee wording, validity),
P1-12 (payer terms, partner commission), P2-15 (second destination timing).

Roughly 35 sessions for P0+P1, 20 for P2.
