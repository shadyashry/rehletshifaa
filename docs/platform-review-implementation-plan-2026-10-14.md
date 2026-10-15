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
- **Owner decisions (2026-10-14, in chat):** keep ONE deposit; no commitment fee and no second payment. Reasons: the
  platform arranges travel only on some cases, so "at travel confirmation" is not a moment every case has, and a split
  adds a second due date and a second Finance check. The deposit stays 15% of the patient's medical total (marked-up
  Consultant lines, travel excluded), now at least USD 200 and at most USD 1,500 (Claude's recommended values, accepted:
  "use your numbers"), never above the medical total, rounded up to the next 10 (USD/EUR/...) or 100 (EGP), and it
  counts towards the final bill. Rails: bank transfer as before, plus cash through an agent now; card later through the
  provider-agnostic adapter once a provider is signed. Revisit a split only if acceptances stall at the deposit.
- **Status (2026-10-14, branch `feat/review-p0`):** delivered as re-scoped above (Opus 5.5; the plan named Fable 5.1).
  - Delivered: `V89__deposit_bounds_and_agent_cash.sql` (the P0-5 file names shift by one): `deposit_policies.minimum_usd`
    and `maximum_usd` (CHECKs, existing policies set to 200 / 1,500); `deposit_transfer_reports.method` gains `AGENT_CASH`
    with `agent_name` (CHECK: agent name exactly when agent cash); existing PLATFORM components relabelled REFUNDABLE.
    New `DepositCalculator` is the one amount rule, used for the deposit itself (`PaymentService.createDepositForAcknowledgement`),
    the anticipated amount before it exists (`DepositQueryService.standing`, now in the estimate's currency; the patient
    summary no longer shows an EGP figure under it) and the proposal's "deposit due" line (`PaymentService.depositDueDisplay`
    on the viewed version's own snapshot, replacing an EGP-to-display re-conversion). Bounds are USD converted at the
    proposal's FX date (`CurrencyService.effectiveRate("USD", date)`; a missing USD rate applies the share unbounded and
    logs `DEPOSIT_BOUNDS_FX_UNAVAILABLE` rather than blocking the acceptance). The EGP ledger amount is derived from the
    rounded display amount, so patient and Finance read one figure. `configurePolicy` takes and validates
    `minimumUsd`/`maximumUsd` (`DEPOSIT_BOUNDS_INVALID`; audit carries both). New deposits are REFUNDABLE (owner refund
    rule) and remain credited to the final bill. Agent cash: `TransferReferenceRequest(reference, method, agentName)`,
    `PAYMENT_METHOD_INVALID` / `AGENT_NAME_REQUIRED`, same maker/checker verification by Finance; ledger method AGENT_CASH.
    Frontend: `PatientDepositPayment` third option "Cash through an agent" (agent name + receipt number, the payment
    reference to give the agent, no bank details), Finance `TransferPanel` shows the method and agent,
    `MarginDeposit` (Control Center) shows and sends the bounds with every revision (prefilled, so saving a rate never
    drops them; an emptied field means no bound). EN/AR copy by the mechanical-worker subagent.
  - Tests: new `DepositCalculatorTest` (the worked examples 800 / 3,000 / 8,000 / 20,000 USD -> 200 / 450 / 1,200 /
    1,500; rounding USD and EGP; never above the total, also after rounding; EUR and EGP proposals use dollar bounds;
    unbounded without a rate); `CoordinatorCaseActionsTest.cashPaidThroughAnAgentIsReportedWithTheAgentAndVerifiedByFinance`;
    `JourneyServiceIntegrationTest` bounds validation + audit, and the deposit now rounded up to EGP 100;
    `PostActivationLandingTest` (USD rounding, ledger from the rounded figure); `PatientActivationJourneyTest` deposit
    REFUNDABLE; frontend `PatientDepositPayment.test.tsx` (agent path, mandatory agent, Arabic) and
    `PageHeaders.test.tsx` (bounds shown, sent, emptied bound sent as null). Verification: `mvn -o -q test` 775 tests,
    0 failures, 3 pre-existing skips; `pnpm typecheck` clean; eslint clean on touched files; touched vitest files green;
    `PostgresJpaMappingTest` on postgres:17 green with V89 applied (bounds 200.00 / 1500.00).
  - Open gaps: no vetted agent list yet (free-text agent name until the partner entity in P1-12; coordinators tell the
    patient which agent to use). Card stays disabled until a provider is chosen (DEP-2 adapter). The patient-facing
    refund wording is unchanged: the refund rule is decided, but the legal review of the refund copy (F2) is still open,
    so only the stored class changed. Many fixtures have no USD rate, so integration tests mostly exercise the
    unbounded path; the bounds are pinned by the unit test and the USD fixture in `PostActivationLandingTest`. A case
    whose medical total is below USD 200 pays its whole medical total as the deposit, by design.
  - Next exact action: P0-5 session 1 (facility entity and package catalogue) in a new session from its prompt block,
    Fable 5.1 high, taking V90, after fast-forwarding `feat/review-p0` to this commit and rebuilding the dev stack so
    V88 and V89 run.

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
- **Status (2026-10-14, session 1 of 3, Fable 5.1 high; committed on `claude/elegant-dewdney-e89e74`, a worktree fast-forwarded
  from `feat/review-p0` bc4c0b9, so the owner fast-forwards `feat/review-p0` to this commit):**
  - Delivered: `V90__facilities_and_packages.sql`: `facilities` (name, city, kind, status ACTIVE/SUSPENDED, derived
    `accreditation_status` NONE/CURRENT/EXPIRED, contact name/email/phone, settlement terms PREPAID/ON_DISCHARGE/NET_15/30/60
    + notes, UNIQUE(name, city)), `facility_accreditations` (body, reference, issued/expires dates, CURRENT/EXPIRED/WITHDRAWN)
    and `facility_packages` (procedure code, care area FK, EGP min/max, inclusions/exclusions, valid from/to, append-only
    `version` per facility+code, PENDING_FINANCE/APPROVED/REJECTED/RETIRED with decided-by/at/note; CHECK: pending ⇔ undecided).
    New top-level module `com.rehletshifaa.facility` (api/application/domain/infrastructure; depends on shared, authority,
    notification and `clinic.infrastructure.CareCategoryRepository` only, so `journey` can depend on it in sessions 2–3 without
    a cycle; ArchUnit 22/22 green). `FacilityCatalogService` + `FacilityAdminController` (`/api/v1/admin/facilities`, under the
    existing `/api/v1/admin/**` authenticated rule): create/update/suspend facility, record/withdraw accreditation (refuses an
    already-expired record, recomputes the derived state), propose package (code upper-cased; one waiting version per code;
    care area must exist; range and validity checked; suspended facility refused), Finance approve/reject (reject needs a
    note), Consultant Operations retire; approving retires the previously approved version of that code in the same
    transaction. Authority: new `FACILITY_READ` (Consultant Operations Manager, Finance Manager, Finance, Compliance Auditor),
    `FACILITY_MANAGE` (Consultant Operations Manager), `FACILITY_PACKAGE_APPROVE` (Finance Manager, step-up); maker/checker
    `PACKAGE_SELF_APPROVAL` refuses the proposer approving their own version even when holding both roles; System
    Administrators keep no facility power (SOD-07). Facilities never become users: no account, role, assignment or work item is
    created anywhere in the module. `FacilityAccreditationExpiryService` (workflow-builder subagent, reviewed) mirrors
    `CredentialExpiryService`: hourly scan expires lapsed CURRENT records, recomputes the facility state with one
    `FACILITY_ACCREDITATION_LAPSED` audit event, and emails the facility contact at 60/30/7 days (`app.facilities.*`,
    template `facility-accreditation-expiry`, idempotent outbox keys). Audit events for every write. Frontend: Control Center
    › Commercial › Facilities & Packages (`FacilityCatalog.tsx`, route `/commercial/facilities`, nav visible on
    `FACILITY_READ`): Finance queue with approve/reject confirmation dialogs (note; reason mandatory on reject), facility
    list → detail with edit, suspend/reactivate, accreditation records with "expires in N days" and withdraw, package
    versions with EGP range and status, propose form; copy in `facility-copy.ts` (EN + draft AR by the mechanical-worker
    subagent; the Control Center carries no en.json/ar.json keys, so none were added).
  - Tests: `FacilityCatalogServiceTest` (5: ownership + validation codes, approve-once/supersede/reject, self-approval,
    readers vs. coordinator/admin denied, withdraw + suspend audited), `FacilityAccreditationExpiryServiceTest` (4: lapse,
    mixed stays current, reminders once per window, no contact → no reminder), `RolePolicyTest`, `ArchitectureRulesTest`
    (no cycles with the new module), `PasswordOnlySessionCoverageTest` covers the new endpoints automatically; frontend
    `FacilityCatalog.test.tsx` (6: ops proposes with exact body, Finance confirms before approve, reject needs reason,
    read-only, denied, Arabic). Verification: `mvn -o -q test` 784 tests, 0 failures, 3 pre-existing skips (775 at bc4c0b9 + 9 new); `pnpm typecheck` clean; eslint clean on touched
    files; vitest 46/46 across the six Control Center files touched or neighbouring; `PostgresJpaMappingTest` on
    postgres:17-alpine with V90 applied green (1/1; every repository query, the three new facility repositories included, parsed and planned by PostgreSQL).
  - Open gaps: no staff notification or work item to Consultant Operations when an accreditation lapses (only the audit
    event, the screen badge and the contact email; a notification port outside `journey` is needed first). Accreditation
    evidence documents are not stored (the credential pattern binds to case documents). `Facility.updated_at` is not stamped
    by the expiry job. Arabic copy is a draft pending native review. Operations/coordinators get `FACILITY_READ` only in
    session 3 with the picker. No dev-seed facility yet (`LocalDemoDataSeeder`), so live verification needs one created
    through the screen as consultant-operations-manager@local.test.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit and rebuilds the dev stack
    (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`) so V90 runs; then P0-5 session 2 in a
    new session (Fable 5.1, high): proposal line source `FACILITY_PACKAGE` (approved, in validity, facility ACTIVE) that
    releases without a Finance work item, `manual_band_egp` per care area on the commercial policy, gate computation in
    `JourneyService.createProposal`, gate matrix tests. V91 is the next free Flyway version.
- **Status (2026-10-14, session 2 of 3, Fable 5.1 high, same session as session 1 at the owner's "go ahead"; committed on
  `claude/elegant-dewdney-e89e74` on top of 86f18ec, so the owner fast-forwards `feat/review-p0` again):**
  - Delivered: `V91__facility_package_lines_and_manual_band.sql`: `commercial_policies.manual_band_egp` (CHECK >= 0, null =
    every manual line waits for Finance), `clinical_review_cost_estimates.facility_package_id` and
    `proposal_items.facility_package_id` (FK to `facility_packages`), and `proposal_items.source` widened to
    CATALOG/MANUAL/FACILITY_PACKAGE: V11's inline unnamed CHECK cannot be dropped by name on both PostgreSQL and H2, so the
    column is rebuilt through a scratch column (values kept) and the new constraints are named (`ck_proposal_items_source`,
    `ck_proposal_items_package`: package ⇔ facility_package_id). New `FacilityPackagePricing` (facility module, no
    authorization) answers "priceable now": APPROVED, today inside validity, facility ACTIVE. Consultant cost estimates
    accept `facilityPackageId` (`CostEstimateItem`, old constructors kept): the package must be priceable
    (`FACILITY_PACKAGE_INVALID`) and the expected EGP figure must sit inside its range (`FACILITY_PACKAGE_RANGE`); the line
    stores the package and its min/max, `requires_finance_approval=false`. The gate in `JourneyService.createProposal` and
    in the final quote is now decided per line by `lineNeedsFinance`: a package line is re-checked at proposal time (a
    package retired since the review falls back to Finance), a catalogue line keeps its stored answer, a manual line
    releases without Finance only when its EGP price is at or below the care area policy's band; a missing policy still
    forces Finance. Line source `FACILITY_PACKAGE` is written on the proposal item with the package id. Commercial policy:
    `configure` takes `manualBandEgp` (`MANUAL_BAND_INVALID` when negative; audited), `Policy`/`CommercialPolicyView` carry
    it (cache record widened; `CacheSerializationTest` updated). Frontend: Control Center › Margin & Deposit shows the band
    per active margin policy and takes it with every margin revision (prefilled from the platform default; empty = none);
    Finance approval screen labels a `FACILITY_PACKAGE` line "Approved facility package" (EN/AR); `portal-model.ts` type
    widened. No new copy keys: both screens carry inline EN/AR.
  - Tests: new `FacilityPackageLineGateTest` (5: approved package line releases without Finance and no Finance work item,
    package retired before the proposal falls back to `FINANCE_APPROVAL_REQUIRED`, price outside range / unapproved package
    refused, manual inside band releases while just outside does not, no band means every manual line waits and a negative
    band is refused); `CoordinatorCaseActionsTest` (35), `JourneyHappyPathParityTest` (6), `JourneyServiceIntegrationTest`
    (21), `PricingCatalogServiceTest`, `ReferenceDataCachingTest`, `CacheSerializationTest`, `FacilityCatalogServiceTest`,
    `ArchitectureRulesTest` (22, no cycles with journey → facility) all green in the focused run; frontend
    `PageHeaders.test.tsx` gains "states the pre-approved manual band with every margin revision" (11/11 with
    `FinanceApproval.test.tsx`). Verification: `mvn -o -q test` 789 tests, 0 failures, 3 pre-existing skips (784 after session 1 + 5 new); `pnpm typecheck` clean; eslint clean on touched
    files; `PostgresJpaMappingTest` on postgres:17-alpine with V91 applied green (1/1; the rebuilt `proposal_items.source` carries only the two named checks).
  - Open gaps: no UI yet to pick a facility package on the consultant's clinical review or to see the facility name on a
    proposal line (session 3: `ClinicalReview.tsx` line picker; the API already accepts `facilityPackageId`). The band is
    read from the care area's active policy at proposal time, not snapshotted on the version (the margin is); acceptable
    because the band only decides the gate, never a price. Package lines are EGP-only (a figure in another currency without
    an FX rate is refused). Finance's commercial view does not yet show the package range or facility name.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit and rebuilds the dev stack so V91 runs; then P0-5
    session 3 (Fable 5.1, high): facility picker replacing the free-text facility field on the travel plan and treatment
    record (`TravelPlan`, `TreatmentEpisode`, journey/domain), the `ClinicalReview.tsx` line picker for facility packages,
    `FACILITY_READ` for Operations and coordinators where the pickers need it. V92 is the next free Flyway version.
- **Status (2026-10-14, session 3 of 3, Fable 5.1 high, same session at the owner's "go ahead with session 3"; committed on
  `claude/elegant-dewdney-e89e74` on top of 8bc5fa9, so the owner fast-forwards `feat/review-p0` again):**
  - Delivered: `V92__facility_picker_on_travel_and_treatment.sql`: `travel_plans.facility_id` and `treatment_episodes.facility_id`
    (FK to `facilities`, indexed) replace the free-text `facility` columns, which are dropped (pre-production, nothing
    migrated). `treatment_episodes.facility_id` stays nullable in the schema for rows older than V92; the service refuses a new
    episode without one (`FACILITY_REQUIRED`). `TravelPlan.Details` and `TreatmentEpisode.Record` carry `facilityId`;
    `TravelPlanRequest.facilityId` (optional while planning) and `TreatmentRequest.facilityId` (`@NotNull`) replace the strings;
    both paths refuse an unknown or suspended facility (`FACILITY_INVALID`, 409) through the new `FacilityDirectory.active`.
    Picker data: `GET /api/v1/facilities/directory?careArea=` (`FacilityDirectoryController`, new authenticated path in
    `SecurityConfig`) returns active facilities with their approved, in-validity packages and ranges only (no contacts, no
    settlement terms), guarded by `REFERENCE_DATA_READ`. Decision, deviating from the plan wording: the directory is reference
    data every case builder already holds (consultants, coordinators, Operations, managers), so no `FACILITY_READ` grants were
    added for Operations or coordinators; the full commercial record stays behind `FACILITY_READ` in the Control Center.
    Frontend: `Portal.tsx` loads the directory for consultants (with their catalogue) and for Operations and passes it through
    `StaffCaseView` to `CaseWorkflowActions`, where the travel plan and the treatment record now carry a facility select
    (`name · city`; required on the treatment record; an empty directory says so and points to Consultant Operations), and to
    `ClinicalReview.tsx`, which gains a "Facility packages (Finance-approved)" section: tick a package, set the expected EGP
    figure inside its range (out-of-range is flagged and holds the submit), and the line travels as `facilityPackageId` with
    the consultant's figure; a saved draft re-seeds the picks; totals show "Approved facility packages" apart from the
    catalogue price and never as "awaiting Finance". EN/AR inline, as the siblings. `DirectoryFacility`/`DirectoryPackage`
    types in `portal-model.ts`; `operations-gate-live.spec.ts` sends `facilityId: null`.
  - Tests: new `FacilityDirectoryTest` (2: active facilities with priceable packages only and nothing commercial beyond the
    range, care-area filter, consultant/coordinator/Operations may read, patient and the full record refused; `active()` for
    suspended/unknown/null), `CoordinatorCaseActionsTest` travel test now refuses an unknown facility and stores the chosen id
    (35 green), `JourneyServiceIntegrationTest` (21) and `PatientConversionLayerTest` (31) updated to facility ids,
    `PasswordOnlySessionCoverageTest` covers the new endpoint, `ArchitectureRulesTest` (22). Frontend: `ClinicalReview.test.tsx`
    gains the package-line case (approved line, exact body, out-of-range holds the submit), new `CaseWorkflowActions.test.tsx`
    (2: Operations sends the facility id, the treatment record requires one), `FinanceApproval.test.tsx` (17/17 across the
    three); every `src/components/portal` test green (24 files, 200 tests). Verification: `mvn -o -q test` 791 tests, 0 failures, 3 pre-existing skips (789 after session 2 + 2 new); `pnpm typecheck` clean;
    eslint clean on touched files; `PostgresJpaMappingTest` on postgres:17-alpine with V92 applied green (1/1; `travel_plans.facility_id` present, the text column gone).
  - Open gaps: the final-assessment form (`StaffCaseView` → `/doctor/cases/{id}/final-assessment`) offered catalogue and manual
    lines only; closed the same day in a second follow-up commit by extracting the package section into the shared
    `FacilityPackagePicker` (one range rule for the clinical review and the final assessment; `FinalAssessment.test.tsx`). Also
    closed the same day in a follow-up commit: the Finance commercial view names the facility on a package line (`ProposalCommercialLine.facilityName`,
    through `FacilityDirectory.facilityNamesOfPackages`), and the workspace carries `travelPlan` and `treatmentEpisodes` read
    views with the facility named (staff only), shown on the case page as "Destination & treatment"; the travel form reopens on
    the stored facility and status. Tests: `CoordinatorCaseActionsTest` reads the plan back, `FacilityDirectoryTest` covers the
    name lookups, `FinanceApproval.test.tsx` and `CaseWorkflowActions.test.tsx` cover the screens. Coordinators do not
    yet see the directory anywhere (no picker needs it on their screens). `FACILITY_READ` for Operations/coordinators was not
    granted (see decision above); revisit if a screen needs contacts or settlement terms outside the Control Center.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit and rebuilds the dev stack so V92 runs; P0-5 is
    complete as planned. Next phase per the sequence: P1-6 (time bounds on waits) in a new session from its prompt block,
    taking V93. B-02 follow-ups to schedule later: facility name on the patient proposal
    (the consultant's line description already carries it); the patient-facing travel view once the patient journey needs it.

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
- **Status (2026-10-14, session 1 of 2, branch `feat/review-p0`):** delivered (Claude Fable 5.1 stood in for Opus 5.5).
  - Delivered: `V93__consultant_offer_deadline.sql` adds `case_assignments.offer_expires_at` (TIMESTAMP WITH TIME ZONE, indexed
    with `status`). The working week moved from `coordination.domain.WorkingSchedule` to `shared.time.WorkingSchedule` unchanged,
    because `coordination` already depends on `journey` and the module-cycle rule forbids the reverse. New `SlaPolicy`
    (`journey.application`, `@Component`) is the one place the service levels live: the working week (`app.sla.zone`, `days`,
    `open`, `close`; defaults Cairo, Saturday–Thursday 10:00–20:00, the window the out-of-hours WhatsApp reply states), the
    offer hours (`app.sla.offer-hours` 48, `urgent-offer-hours` 24) and the queue table in working days (one working day = one
    window, 10 working hours): Finance verification `DEPOSIT_RECORD` 1, identity review `PATIENT_IDENTITY_REVIEW` 2, Operations
    `PREPARE_TRAVEL_PACKAGE`/`UPDATE_TRAVEL_PLAN` 2, consultant `CLINICAL_REVIEW` 2, coordinator intake `ASSIGN_CONSULTANT` and
    `REVIEW_PATIENT_RESPONSE` 1. `StaffWorkService.openWorkItem` gives every item opened without a due date its queue's
    `SlaPolicy.dueAt` (one place; stage steps from `syncStageWork` and every other creator go through it), so
    `derivePriority` reads it; the due-date half of that rule is now also applied over time by the scheduled
    `StaffWorkService.raiseWorkDueSoon` (`app.sla.due-soon-scan-ms`, 5 min; raises LOW/NORMAL open items to HIGH, never lowers).
    Decision, deviating from the P0-3 wording "due within a day": `DUE_SOON` is now 4 hours, not 24, because a one-working-day
    item is due within 24 wall-clock hours the moment it opens and every new intake review would have been HIGH at once
    (`UatDefectCorrectionsTest` G and `OperationalWorkflowTest` guard exactly that); HIGH now means the last stretch before the
    due time or overdue. Consultant offer TTL (A-03 + the A-02 TODO): `JourneyService.assign` stores
    `StaffWorkService.offerDeadline(caseId, now)` (= `SlaPolicy.offerDeadline(now, urgency.urgent())`, 48 working hours, 24 on
    an URGENT case) on a DOCTOR offer through `CaseAssignment.offered` and as the `CONSULTANT_ASSIGNMENT` work item's due date.
    New `ConsultantOfferExpiryService` (workflow-builder subagent, reviewed; `ProposalExpiryService` shape,
    `app.sla.offer-expiry-scan-ms` 60 s): `expireOffers` declines each pending primary offer past its deadline through the
    PENDING-guarded `CaseAssignmentRepository.decline` (idempotent), closes the consultant's offer item, moves the case
    CONSULTANT_ASSIGNMENT_PENDING → READY_FOR_CONSULTANT with a SYSTEM status-history row, opens the coordinator's existing
    `REASSIGN_CONSULTANT` item (event `ASSIGNMENT_DECLINED`, copy `ASSIGNMENT_OFFER_EXPIRED` with the consultant's name and the
    hours), sets waiting-on `ASSIGNMENT_DECLINED_REASSIGN`, tells the consultant in-app (`OFFER_EXPIRED_CONSULTANT`, no email)
    and audits `CONSULTANT_OFFER_EXPIRED`; `shortenOpenOffer(caseId)`, called by `CaseUrgencyService.set` when a case becomes
    URGENT, recomputes the open offer's deadline at 24 working hours from when it was made (never extends; a late raise may put
    it in the past, so the next scan expires it), re-dates the offer work item and audits `CONSULTANT_OFFER_SHORTENED`.
    Referral offers (TRANSFER, SECOND_OPINION) never expire. `AssignmentView.offerExpiresAt` reaches the frontend: the
    consultant's accept/decline card (`CurrentActionPanel.respondBy`, "Respond by 14 Oct, 15:00" in place of the day-only due
    chip) and the coordinator's case page team list ("Offer until …" under a pending consultant). Copy: `portalWork.workCopy.items`
    `ASSIGNMENT_OFFER_EXPIRED` / `OFFER_EXPIRED_CONSULTANT` and `portalWork.currentAction.respondBy` in EN/AR (mechanical-worker
    subagent, CRLF kept); the team-list label is inline EN/AR as its siblings.
  - Tests: new `SlaPolicyTest` (6: defaults, 48/24 working hours across Friday and out-of-hours starts, the queue table, one
    working day = one window, configurable window, refused nonsense), `WorkServiceLevelTest` (2: SLA due date and derived
    priority on open, undated types stay undated, explicit dates kept; the due-soon raise is idempotent and skips later and
    completed items), `ConsultantOfferExpiryServiceTest` (5: deadline on offer and work item, URGENT deadline, expiry with every
    side effect once and a no-op replay, future and accepted offers untouched, URGENT shortens once), `WorkingScheduleTest`
    moved with its class; `UatDefectCorrectionsTest` G gains the one-working-day-is-NORMAL case and `OperationalWorkflowTest`
    now expects the intake review to carry a due date. Verification: `mvn -o -q test` 804 tests, 0 failures, 3 pre-existing skips (791 at bc7c714 + 13 new);
    `pnpm typecheck` clean; eslint clean on the four touched frontend files; `StaffOperationalUi.test.tsx` (58, incl. the new
    respond-by case), `StaffWorkspace.test.tsx` (11) and `portal-labels.test.ts` (11) green; `PostgresJpaMappingTest` on
    postgres:17-alpine with V93 applied green (1/1, the new `CaseAssignmentRepository` and `CaseTaskRepository` queries executed).
  - Open gaps: identity review has no case work item (the reviewer works from the onboarding state), so its 2-day level is
    only in the table until session 2 reads it for the patient copy. Referral offers have no deadline. The queue cards
    (`CaseQueue.tsx`) do not show the offer deadline, only the case page does. The consultant is not told by email that an offer
    expired, and repeated expiry carries no availability penalty (A-03's last clause, not planned here). Escalation to the Finance
    Manager on breach (A-04) is not built; HIGH in the queue is the only signal. Native Arabic review of the new copy pending
    with the rest.
  - Next exact action (session 1, done): owner fast-forwards `feat/review-p0` to this commit (made on the worktree branch
    `claude/keen-montalcini-720fa3`) and rebuilds the dev stack (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml
    up -d --build`) so V93 runs; then P1-6 session 2 in a new session: information-request reminders on day 2 and day 5 and a
    coordinator alert (`DepositPaymentReminders` pattern), auto-cancel at 30 days through `CaseExitService`, and the
    patient-facing "usually within N working days" (read `SlaPolicy.workingDays`) plus a "meanwhile" line on every `WAIT_*`
    state in `CurrentAction.tsx`, `MyCare.tsx` and `CaseStatusAccess.tsx`.
  - Done after session 1: the owner fast-forwarded `feat/review-p0` to ccba170 and the dev stack was rebuilt; V93 applied.
- **Status (2026-10-14, session 2 of 2, branch `feat/review-p0`):** delivered (Opus 5.5, normal mode at the owner's request).
  - Delivered: `V94__information_request_reminders.sql` adds `case_tasks.reminder_cycle_at` and `reminder_step` (0–3, named
    CHECK, indexed with type and status) and widens `ck_case_exit_reasons_reason` with `INFORMATION_NOT_PROVIDED`.
    `PatientActionService.request` starts the cycle on a new request and restarts it when the coordinator asks again.
    New `InformationRequestReminders` (`DepositPaymentReminders` shape: hourly sweep, one transaction per request, guarded
    step so each message goes once, a sweep that was down skips to the step the day calls for): calendar days from the ask,
    because the patient's time is not the team's week. Day 2 and day 5 (`app.sla.information-reminder-days`) send the patient
    a reminder with a fresh secure link (`PublicCaseAccessService.issueInformationLink(caseId, lang, template)`, new outbox
    template `patient-action-reminder`, the earlier link revoked); day 7 (`information-alert-day`) alerts the coordinator
    (`INFO_REQUEST_UNANSWERED`); day 30 (`information-cancel-days`) cancels a case parked in INFORMATION_REQUIRED through the
    new `CaseExitService.cancelUnansweredInformation` (lifecycle policy, typed exit reason, open work cancelled), tells the
    patient in their language how to come back (template `information-request-closed`) and the coordinator
    (`CASE_CANCELLED_NO_INFORMATION`); a non-blocking request on a case that moved on is only withdrawn (`INFO_REQUEST_CLOSED`,
    waiting reason `PATIENT_INFO_UNANSWERED`). Both templates are bound under `app.whatsapp.meta.templates` and registered in
    `docs/whatsapp-message-templates.md`. Wait windows (D-02): `SlaPolicy` gains `PREPARE_PROPOSAL` 2 working days and maps
    each waiting state to its queue (`WAIT_QUEUES`, `PHASE_QUEUES`); `CurrentActionView.expectedWorkingDays` is filled by
    `CaseActionService` on every WAIT current action for patient and staff, and `PublicCaseStatus.expectedWorkingDays` per
    status-link phase. My Care shows "This usually takes up to N working days." and a "Meanwhile" line on every waiting
    step; the status link shows the same per phase (`phaseMeanwhile`); the staff panel shows "Usually within N working days"
    on a wait on another team. EN/AR copy in `portalWork.plural.workingDays` (Arabic plural forms), `currentAction.usuallyWithin`,
    `myCare.step.usuallyWithin`/`meanwhile`, `meanwhile` on each WAIT_* step, the three new work-copy items and the waiting
    reason; the status link's copy is inline as its siblings.
  - Tests: new `InformationRequestRemindersTest` (5: cycle start, day 2/5 reminders once each with one live link, day 7 alert
    once; a sweep that was down sends one reminder; asking again restarts; day 30 cancels a parked case once through the
    policy with the typed reason, the patient and coordinator told once; a non-blocking request is withdrawn and the case
    continues); `SlaPolicyTest` gains the wait and phase windows; `ConsultantOfferExpiryServiceTest` checks the coordinator's
    WAIT_CONSULTANT carries 2; `NotificationOutboxProcessorTest` renders both new templates in EN and AR. Frontend:
    `MyCare.test.tsx` (window and meanwhile only on a team step, Arabic plural), `CaseStatusAccess.test.tsx` (window and
    meanwhile per phase, none while the patient owes the step), `StaffOperationalUi.test.tsx` (staff wait window).
    Verification: `mvn -o -q test` 811 tests, 0 failures, 3 pre-existing skips (804 after session 1 + 7 new); `pnpm typecheck`
    clean; eslint clean on the seven touched frontend files; `MyCare`, `CaseStatusAccess`, `StaffOperationalUi` and
    `portal-labels` (EN/AR key parity) 109/109; `PostgresJpaMappingTest` on postgres:17-alpine with V94 applied green (1/1).
  - Open gaps: the two WhatsApp templates must be submitted to Meta for approval before production (email works now).
    A case cancelled for no answer has no in-place recovery: CANCELLED is terminal, so the patient sends the case again; an
    owner decision if a reopen path is wanted. The status link shows no window in the deposit phase (the patient's own step)
    and none for identity review. `PREPARE_PROPOSAL` now has a 2-working-day staff due date too, as the patient window
    needs one figure. Native Arabic review of the new copy is pending with the rest. Scheduler leadership for the three
    new jobs belongs to P1-8 (ShedLock on what is now 19 `@Scheduled` jobs).
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit (worktree branch `claude/keen-montalcini-720fa3`)
    and rebuilds the dev stack so V94 runs; P1-6 is complete. Next phase per the sequence: P1-8 (metrics, alerts, scheduler
    leadership), whose kickoff prompt block still has to be written in `docs/platform-review-phase-prompts.md`.

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
- **Status (2026-10-14, session 1 of 2, branch `feat/review-p0`):** delivered (Opus 5.5, normal mode).
  - Owner decision at the start (one question): scheduler leadership through an in-house JPA lease table instead of ShedLock
    (session 2, no new dependency), and no downloads now: the meters ship on micrometer-core; `micrometer-registry-prometheus`,
    Prometheus and Grafana come later with the owner's OK. Lead-session correction during the session: the meters are not
    served on the main port behind a token but on a separate internal port that only the Docker network reaches, so a future
    Prometheus scrapes without tokens (built that way; the first token-gated version was removed before commit). Later the owner
    approved one online fetch of `micrometer-registry-prometheus` (Boot 3.5.10 BOM version) and the `prom/prometheus` and
    `grafana/grafana` pulls, and chose in this session to commit session 1 first and do the fetch in session 2.
  - Delivered: `shared.metrics` (`CachedSnapshot`: a gauge source read at most once per time-to-live, capped at 60 s;
    `GroupedGauges`: gauges over one grouped JPQL read, one series per low-cardinality tag set, registered the first time a
    read sees it and kept at 0 when its rows are gone; `AfterCommit`: business counters count only committed work). One meter
    class per module. `JourneyMetrics` (journey): `work.open.items`, `work.open.oldest.age` (seconds), `work.open.high` (HIGH or
    URGENT), `work.open.overdue` (past the SLA due date, so overdue = older than the queue's working-day level) per `queue`
    (work item type) and `team` (owning role), untagged `work.open.total`, from `CaseTaskRepository.summarizeOpenInternalWork`;
    deposit verification age is `work.open.oldest.age{queue=DEPOSIT_RECORD}`; `journey.proposal.time.to.release{revision}`
    (submitted to preliminary proposal released, recorded in `JourneyService.releaseProposal`);
    `journey.consultant.offer.expired` (`ConsultantOfferExpiryService`); `journey.information.request.closed{outcome=case_cancelled|withdrawn}`
    (`InformationRequestReminders`). `NotificationMetrics` (notification; workflow-builder subagent, reviewed):
    `notification.outbox.dead.letters`, `.retrying`, `.pending`, `.oldest.pending.age` per `channel`, untagged
    `notification.outbox.dead.letters.total`, from `QueuedNotificationRepository.summarizeByChannel`; the existing
    `notification.delivery{channel,outcome}` counter keeps counting retries and dead letters as events. Review fix:
    `cancelQueued` (superseded proposal resends) now marks `last_error_code = SUPERSEDED` and those rows are not counted as
    dead letters, so the dead-letter alert means a delivery failure. `ConversationMetrics` (conversation; workflow-builder
    subagent, reviewed): `conversation.reply.timer.breach{conversation=case|intake, step=lead|managers}`, once per escalation in
    `ReplyTimerService.dispatch` (tag renamed from `channel` in review: an obligation does not record the transport).
    Exposure: `management.endpoints.web.exposure.include: health,metrics`; new `security.MetricsPort` adds a second Tomcat
    connector on `app.management.metrics-port` (`METRICS_PORT`, default 8090; 0 turns it off). `SecurityConfig` grants
    `/actuator/metrics/**` only on that port, so the main port (8080) serves health and refuses the meters to everyone, a System
    Administrator included; a filter answers 404 to anything but the meters on the metrics port, so it is no second way into the
    API. Compose publishes only 8080 for the backend, and neither the gateway (health only) nor the tunnel routes to 8090. Alert rules as code:
    `infrastructure/observability/alerts.md` (mechanical-worker subagent, reviewed): 10 rules in one YAML block with thresholds
    from `SlaPolicy` where one exists (deposit verification overdue = 1 working day, every SLA queue overdue, any outbox dead
    letter in 15 min, outbox stuck 15 min, reply breaches in 15 min, offers expiring, information-request cancellations,
    proposal slower than the summed stage levels), checked against the actuator until a Prometheus registry exists. No migration.
  - Tests: new `JourneyMetricsTest` (3: every journey meter registered with its tags; queue gauges follow open work only after
    the 60 s snapshot and stay at 0 when the work closes; counters and the proposal timer count only what committed),
    `NotificationMetricsTest` (2: total registered; per-channel dead letters, retrying, pending and oldest age through the
    snapshot, superseded resends excluded), `MetricsPortTest` (3: the main port serves health and refuses `/actuator/metrics` and a meter
    to an anonymous call and to a System Administrator with a passkey; the metrics port serves both without a token and answers
    404 to the API, health and api-docs; env, beans, prometheus, loggers and heapdump not exposed on either port); `ReplyTimerIntegrationTest` gains the breach count per tag set and a
    committed-only counter test. The test `application.yml` (which shadows the main one) exposes the same endpoints.
    Verification: `mvn -o -q test` 820 tests, 0 failures, 3 pre-existing skips (811 at 7d0bbd4 + 9 new). No migration, so no
    PostgreSQL proof was needed.
  - Scheduler split for session 2 (lead-session correction, checked in the code; there are 22 `@Scheduled` methods, not 21):
    claim-based workers stay unleased because every instance may run them, each taking different rows under a row lock / SKIP
    LOCKED: `NotificationOutboxProcessor.dispatch`, `WhatsAppInboundProcessor.dispatch`, `IdentityOperationProcessor.dispatch`,
    `ReplyTimerService.dispatch` (`ReplyObligationRepository.lockDue`) and `ReplyTimerService.closeIdle`
    (`IntakeConversationRepository.lockIdle`). The other 17 sweeps take the lease: `AccessHygieneService.runRecertificationSchedule`
    and `.disableDormantAccounts`, `StaffLifecycleService.expireInvitations`, `IntakeConversationService.releaseDepartedOwners`,
    `CoordinatorDepartureService.releaseDepartedOwners`, `CoordinationQueueRetry.retry`,
    `FacilityAccreditationExpiryService.expireAccreditations`, `IdentityReconciliationService.scheduled`,
    `ConsultantOfferExpiryService.expireOffers`, `CredentialExpiryService.expireCredentials`, `DepositPaymentReminders.sweep`,
    `InformationRequestReminders.sweep`, `PoolWorkDepartureService.releaseDepartedOwners`,
    `ProposalExpiryService.expireReleasedProposals`, `StaffWorkService.raiseWorkDueSoon`, `PiiKeyRotationService.rotate`. Session 2
    re-checks each before wrapping it. The lease time comes from the database clock (JPQL `current_timestamp`), not the instance clock.
  - Open gaps: Prometheus cannot scrape yet (no registry); when it comes, it scrapes `backend:8090` on the Docker network.
    Anything on that network can read the meters (counts and ages only, no case or person data). Dead letters are never archived, so the level only grows
    and alerts read its increase. Identity review has no work item, so no queue series. `work.open.*` covers internal staff work
    only, not patient actions. The 60 s cache is per backend instance. HIGH backlog, outbox retrying and offer-expiry thresholds
    are starting values to tune with a month of data.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit (worktree branch `claude/p1-8-metrics-0fba3f`);
    then P1-8 session 2 in a new session: V95 `scheduler_leases` (name PK, owner instance id, `locked_until`, `locked_at`, TIMESTAMP
    WITH TIME ZONE) taken with a guarded JPQL update on the database clock and wrapped around the 17 sweeps above (not the 5
    claim-based workers) by one aspect or helper (the lead session's lease design is in the shared notes folder,
    `p1-8-lease-design.md`: one guarded update on the database clock, per-job max and min hold, release stamps success or
    failure, per-job timer, failure counter and last-success gauge; first alert: a job's last success older than twice its
    cadence; the lead lists only the three queue workers as unleased, so decide the two reply-timer jobs), the approved
    Prometheus fetch (`/actuator/prometheus` on port 8090 only, the alerts as a Prometheus rules file, Prometheus and Grafana in
    `docker-compose.observability.yml`, Grafana bound to localhost), the
    Grafana dashboard JSON (mechanical-worker, exact meter names from `alerts.md`), then the short Fable 5.1 high verification
    session for the lease and the row-lock claiming stores.
- **Status (2026-10-15, session 2 of 2, branch `claude/p1-8-lease-5e9409`, cut from 5919bf1):** delivered (Opus 5.5, normal mode).
  - Scheduler lease (E-04), owner's in-house JPA design, no ShedLock: V95 `scheduler_leases` (name PK `pk_scheduler_leases`,
    holder, locked_at, locked_until, last_started_at, last_succeeded_at, last_failed_at, last_error_code; TIMESTAMP WITH TIME
    ZONE; CHECKs `ck_scheduler_leases_name|_window|_error`; a row is inserted already taken on a job's first run, so holder and
    window are NOT NULL). Module `shared.scheduling` (domain `SchedulerLease`, infrastructure `SchedulerLeaseRepository`,
    application `LeasedJob`, `SchedulerLeases`, `LeasedJobs`, `SchedulerJobMetrics`, `SchedulingConfig`), inside `shared` so every
    module uses it without a cycle. `@LeasedJob(maxHold = EXPIRY_SCAN|SWEEP|DAILY)` (5, 10, 60 min) next to `@Scheduled`; an
    infrastructure-role Spring AOP advisor (no AspectJ on the classpath) at the highest precedence wraps the call outside the
    job's own `@Transactional`. Take: JPQL `select current_timestamp` (database clock, truncated to microseconds), then ONE
    guarded JPQL update `where name = :name and (locked_until <= :now or (holder = :me and the lease was released))`, else insert
    the first row (a duplicate-key race means another instance won). The extra disjunct lets the holder's own next tick run at
    once, so the minimum hold (= the fixed delay; `maxHold` for a cron) only keeps the other instances out and a slower database
    clock never makes the only instance skip a tick; a running lease is never re-taken, not even by its holder. Release (own
    REQUIRES_NEW transaction, also on exception) is guarded by holder + locked_at, sets locked_until = db now + minimum hold and
    stamps last_succeeded_at, or last_failed_at + the exception class (never the message); a lost or failed release is logged
    (`event.code` `SCHEDULER_LEASE_LOST` / `SCHEDULER_LEASE_RELEASE_FAILED`) and the lease frees itself at its maximum hold. A
    skipped call returns 0 / nothing. Holder = `pid@host` (one per container). Lease name = `SimpleClassName.method`.
  - The 18/3 split (21 `@Scheduled` methods in 19 classes; session 1's "22" was a miscount). Leased (18): EXPIRY_SCAN
    `StaffLifecycleService.expireInvitations`, `FacilityAccreditationExpiryService.expireAccreditations`,
    `ConsultantOfferExpiryService.expireOffers`, `CredentialExpiryService.expireCredentials`,
    `ProposalExpiryService.expireReleasedProposals`, `StaffWorkService.raiseWorkDueSoon`, `ReplyTimerService.dispatch`,
    `ReplyTimerService.closeIdle`; SWEEP `IntakeConversationService.releaseDepartedOwners`,
    `CoordinatorDepartureService.releaseDepartedOwners`, `PoolWorkDepartureService.releaseDepartedOwners`,
    `CoordinationQueueRetry.retry`, `DepositPaymentReminders.sweep`, `InformationRequestReminders.sweep`; DAILY
    `AccessHygieneService.runRecertificationSchedule`, `.disableDormantAccounts`, `IdentityReconciliationService.scheduled`,
    `PiiKeyRotationService.rotate` (off by default, cron `-`). Unleased claim-based workers (3): `NotificationOutboxProcessor`,
    `WhatsAppInboundProcessor`, `IdentityOperationProcessor` (PESSIMISTIC_WRITE + SKIP LOCKED). The two reply-timer jobs session 1
    left open are leased as the lead decided (18/3); their row locks stay as a second guard.
  - Job health meters (`SchedulerJobMetrics`, tag `task`, not `job`, which Prometheus uses as its target label), registered at
    startup for every leased job: `scheduler.job.duration` (timer), `scheduler.job.failures` (counter),
    `scheduler.job.last.success` (epoch seconds from `scheduler_leases`, 30 s snapshot, so any instance's success counts; the
    instance start until a first success), `scheduler.job.cadence` (fixed delay or cron interval; none for a disabled cron), so
    "no success within 2x cadence" is one PromQL rule.
  - Prometheus (E-05): `micrometer-registry-prometheus` 1.15.8 (Boot 3.5.10 BOM) by the one approved online fetch, every build since
    `mvn -o`. `/actuator/prometheus` is served on the internal metrics port only (`MetricsPort.metricsPath`, `SecurityConfig`);
    the main port refuses it. Prometheus names: a gauge loses `.total` and gains its unit (`work.open.high` ->
    `work_open_high_items`, `work.open.total` -> `work_open`); checked on a real scrape, no name collisions.
  - Observability compose: `prom/prometheus:v3.5.0` (scrapes `backend:8090`, rules from `prometheus/rules/`, 15 d retention,
    127.0.0.1:9090) and `grafana/grafana:12.1.0` (127.0.0.1:3300, admin password `GRAFANA_ADMIN_PASSWORD` from .env, no sign-up or
    anonymous access, provisioned data source + read-only dashboard); no route through api-gateway, Caddy or the tunnel. Rule file
    `prometheus/rules/alerts.yml` (mechanical-worker, reviewed; `promtool check rules`: 13 rules): the 10 alerts.md rules plus
    SCHEDULER_JOB_STALE, SCHEDULER_JOB_FAILING, BACKEND_METRICS_DOWN. Dashboard `grafana/dashboards/rehletshifaa-operations.json`
    (mechanical-worker): Queues, Service levels, Outbox, Scheduled jobs rows. alerts.md and the observability README updated.
    Started locally (`up -d prometheus grafana` on the running dev stack's network): 13 rules loaded, dashboard provisioned without
    error, both ports loopback-only; the scrape target showed down because the running dev backend is the pre-P1-8 image (no
    port 8090), which changes after the next `--build`. Then stopped and removed.
  - Tests: `app.scheduling.enabled` (default true) now gates `@EnableScheduling`; the test `application.yml` turns it off, so no
    background tick races a test's direct call (the `spring.task.scheduling.enabled=false` some tests set was never a real
    property). New `SchedulerLeaseTest` (8): two instances racing 10 rounds (first insert, then the guarded update) take it once;
    success and failure both release for the minimum hold (other instance refused, holder re-takes), failure counted and coded
    by class only; an expired lease is taken over and the late holder's release changes nothing; lease times come from the
    database while the instance clock reads 2001; a leased bean method skips while another instance holds it and runs once it
    expires, closed for its 60 s fixed delay; every job's meters from startup with cadence 60 s / 86,400 s / none for the
    disabled rotation; the last-success gauge follows the database through the snapshot. `MetricsPortTest` (+1): the metrics
    port serves the Prometheus scrape with the business and job meters; the main port refuses it to anonymous and to a System
    Administrator. Every leased job still runs in its existing test (each now goes through the lease).
    Verification: `mvn -o -q test` 829 tests (820 + 9 new), 3 pre-existing skips: 0 failures from this phase; the only 3 failures and 2 errors are the pre-existing facility date tests below, which pass with the JVM in UTC (`JAVA_TOOL_OPTIONS=-Duser.timezone=UTC`). PostgreSQL proof
    `PostgresJpaMappingTest` on postgres:17-alpine with V95: green (every repository query, the lease's included).
  - Pre-existing, not from this phase: `FacilityCatalogServiceTest`, `FacilityDirectoryTest` and `FacilityPackageLineGateTest`
    (3 failures, 2 errors) fail at 5919bf1 too whenever the machine's local date is ahead of the UTC date (the tests build
    validity dates with `LocalDate.now()`, the services compare with the UTC clock).
  - Open gaps: no Alertmanager (alerts are visible in Prometheus and Grafana, notify no one); the dev backend must be rebuilt
    for V95 and port 8090 before the dashboard shows data; a run longer than its maximum hold can overlap a second instance (the
    late release is then a no-op, logged); the lease is per job, not per row, so the three claim-based workers still rely on
    SKIP LOCKED alone; image tags v3.5.0 / 12.1.0 were pinned without checking for newer patch releases.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit and rebuilds the dev stack
    (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`, V95 runs); then a short Fable 5.1 high
    verification session for the lease (`shared.scheduling`, V95, the advisor order versus `@Transactional`) and the row-lock
    claiming in `QueuedNotificationRepository`, `WhatsAppInboundMessageRepository`, `IdentityOperationRepository`,
    `ReplyObligationRepository`, `IntakeConversationRepository` and `BaseRepositoryImpl`; then the next phase in the
    re-prioritised "Remaining work" list (P1-10).
- **Verification (2026-10-15, Fable 5.1 high, branch `claude/p1-8-verify-125954`, cut from 1074125):** lease and row-lock
  claiming reviewed for correctness under concurrency; one defect fixed.
  - Scheduler lease: no defect. The take is one guarded UPDATE, so under READ COMMITTED the loser re-evaluates the row after
    the winner's commit and no longer matches (`locked_until` moved, holder changed); the holder-retake disjunct matches only
    a released take (`last_*_at >= locked_at`; a takeover moves `locked_at` forward, so a stale stamp never re-opens a running
    lease); the first-row insert race ends in a unique-key violation that `tryTake` reports as "not taken"; release is guarded
    by holder + `locked_at`, both from the database clock truncated to the column's microseconds. The advisor is
    `@Role(INFRASTRUCTURE)` at `HIGHEST_PRECEDENCE`, so the auto-proxy creator applies it outermost and the transaction advisor
    (lowest precedence) runs inside it, for beans with and without `@Transactional`; the scheduler calls the proxy. Max holds:
    every EXPIRY_SCAN and SWEEP job is database-only (batched or per-case); DAILY covers `IdentityReconciliationService` (one
    Keycloak call per staff member, stops at the first unavailable) and `PiiKeyRotationService` (off by default). A job that
    outlives its hold can overlap another instance and its late release is a logged no-op (known gap, kept). A skipped call
    returns 0 / false / nothing. 18 `@LeasedJob` = 21 `@Scheduled` minus the 3 claim-based workers, confirmed by grep. New
    `SchedulerLeaseTest.theLeaseAdviceIsTheOutermostAdviceOnEveryLeasedJobBean`: every leased bean is a proxy, the lease advisor
    is outermost, beans with and without the transaction advisor are both covered, every leased method is public and not
    final and matched by the pointcut, all 17 test-context jobs present. Low, not changed: a `tryTake` that fails on a database
    outage is not counted in `scheduler.job.failures` (the stale-success alert covers it); a cron lease's minimum hold is
    `maxHold` (60 min), so two instances whose clocks differ by more than an hour would both run a daily job.
  - Row-lock claiming: `PESSIMISTIC_WRITE` + `jakarta.persistence.lock.timeout=-2` renders as `for update skip locked` on
    PostgreSQL for all five claim queries (`lockDue` x4, `lockIdle`; seen in the SQL log of the proof run); in each store the
    lock, the status change and the lease stamp commit in one transaction, so a second instance never sees a claimed row as
    due before its lease expires. **Fixed (Medium): `IdentityOperationProcessor` executed every claimed operation however
    little of its 120 s lease was left**, so with two instances and a slow Keycloak a batch of twenty could outlive its lease
    and the other instance re-claim a RUNNING operation by expiry and execute it twice (a second invitation or reset e-mail;
    the outcome write stays guarded by `attempts`). Fix, as the outbox's `SEND_MARGIN`: `EXECUTE_MARGIN` = 120 s hands back
    uncharged (`store.release`) any operation whose lease is nearly spent, and `LEASE_SECONDS` 120 -> 300 (as the outbox and
    inbound stores). New `IdentityOperationProcessorTest` (2). Low, not changed: `WhatsAppInboundProcessor` has no such margin,
    but filing is idempotent by provider message id (`ALREADY_FILED`), so a reclaimed message only repeats the media fetch; the
    three workers judge lease expiry by the instance clock, not the database clock (one VM: no skew).
  - Verification run: focused `SchedulerLeaseTest` (9), `IdentityOperationProcessorTest` (2), `IdentityOperationIntegrationTest`
    (3), `ArchitectureRulesTest` (22): 0 failures; `PostgresJpaMappingTest` on postgres:17-alpine green with SQL logging;
    full `mvn -o -q test` (JVM in UTC) 832 tests, 0 failures, 3 pre-existing skips (829 + 3 new). Commit `df40908` + this line.
  - Next: owner fast-forwards `feat/review-p0` to this commit and rebuilds the dev stack (V95); then P1-10 per "Remaining work".

### P1-9  Backups and restore drill  (E-09)
- Managed Postgres PITR settings documented and scripted for the chosen host; versioned S3 with cross-region copy;
  nightly Keycloak realm export; a `scripts/restore-drill.sh` that restores to a scratch stack and runs the smoke
  suite; RTO/RPO written into `docs/deployment.md`.
- Sessions: 1–2. Model: Opus 5.5 fast, medium.
- **Status (2026-10-15, session 1 of 1, Opus 5.5; committed on `claude/amazing-jepsen-cb80d9`, cut from `claude/guardian-upload` at
  `9d0309b`):** delivered, scripts and docs only (no Java, no migration; V98 stays the newest, V99 the next free). The production host is
  not decided in the docs, so the settings are written host-neutral with **AWS RDS/S3 as the worked example**; the runbook is the new
  `docs/disaster-recovery.md`, the targets and the drill table are in `docs/deployment.md` ("Recovery objectives").
  - Delivered: **PITR** `scripts/dr/aws-rds-pitr.sh` (`configure`: 35-day automated backups, the log shipped every 5 min, backup window
    00:30–01:30 UTC, deletion protection, automated backups + logs replicated to a second region for 14 days with its own KMS key;
    `status`: latest restorable time; `restore`: always to a new private instance) and the same settings for self-managed PostgreSQL
    (pgBackRest/WAL-G, `archive_timeout = 300`). **Object storage** `scripts/dr/aws-s3-versioning-replication.sh` +
    `infrastructure/s3-replication.example.json` (new; RTC 15 min, delete markers not replicated, SSE-KMS replica key) +
    `infrastructure/s3-lifecycle.example.json` (noncurrent versions kept 35 days = the PITR window, expired delete markers removed):
    `configure`, `versions KEY`, `recover KEY` (deleted: remove the delete marker; overwritten: copy `--version-id` over as a new version),
    each step with its `mc` equivalent; the app role still has no `s3:DeleteObjectVersion`. **Realm export**
    `infrastructure/keycloak/export-realm.sh` (admin partial export: realm, clients, roles, groups, flows; secrets and key material masked by
    Keycloak; refuses a file with a person's account, a stored credential or an unmasked secret; only client service accounts pass) and
    the opt-in overlay `docker-compose.backup.yml` (`keycloak-realm-export`, extends `keycloak-sync` so no credential is repeated; nightly
    02:00 UTC, 30 kept in `backups/keycloak-realm/`, `EXPORT_ONCE=true` for one run). Users and second factors are recovered with Keycloak's
    database (PITR), never from a file. **Backup set** `scripts/backup-set.sh` (read-only on the source: pg_dump, the realm export, a bucket
    copy, row counts per table via `scripts/restore-drill/table-counts.sql`, `MANIFEST`, `SHA256SUMS`; containers found by Compose labels,
    credentials only from the containers' own environment). **Drill** `scripts/restore-drill.sh <set>` into `scripts/restore-drill/compose.yml`
    (project `rehletshifaa-restore-drill`, loopback ports 15432/18180/19000/18080, own volumes, a scratch Mailpit for the mail health check,
    every credential generated per run, default Spring profile so no demo seeder, notifications off; `down -v` of that project only):
    checksums → infrastructure → `pg_restore` with every table's row count compared → realm import, `staff-identity-admin` re-keyed, a
    scratch-only `restore-drill` client (client credentials, API audience; the scratch backend allows it as a presenter) → objects restored
    into a versioned bucket, every checksum compared → backend from this checkout → smoke: readiness and health UP, Flyway at the
    checkout's newest (V98) with 0 failed, `/api/v1/me` 401 without a token and 200 with a restored-realm token → overwrite-then-delete
    recovery of a canary object from its versions; a timed Markdown report in `backups/drill-reports/`. `/backups/` is git-ignored.
  - Drill, run for real (2026-10-15, Docker Desktop on Windows 11, set taken from the running dev stack, which was only read): **PASS,
    restore time 135 s** (realm import 71 s, mostly Keycloak start; backend start 40 s; image build 3 s cached, reported apart): 136 tables
    / 798 rows equal, 7 bound + 3 custom flows and every client back, Flyway V96 → V98, `/api/v1/me` 401/200, canary recovered (4 versions).
    The dev bucket held **0 objects**, so the object path was also run with a synthetic copy of the set (3 added files, labelled in its
    `MANIFEST`): PASS, 122 s, 3 checksums equal. `keycloak-realm-export` ran once in the dev project (`run --rm --no-deps`): export written,
    checksum OK; no dev service was recreated. Keycloak 26 does not recreate the unused built-in `saml ecp` flow on import, so the drill
    compares bound and custom flows, not the total. The `scripts/dr/` scripts were dry-run only (no AWS account here).
  - Tests and numbers: backend `mvn -o -q test` (JVM in UTC) 887 tests, 0 failures, 3 skips (unchanged: no Java in this phase); `bash -n` on every new script.
  - Open gaps: the **production drill** (managed-host PITR restore time, region failover, the PII keys from the secret store) must add its
    row to `docs/deployment.md` before real patient data; a host decision (then fill the settings table for it); the Oracle option's
    `backup.sh` is a 24 h RPO and does not meet the target alone; sealed-evidence Object Lock waits for the evidence ledger (P1-15/16);
    an alert on backup age / replication lag (Alertmanager route is a P1-8 follow-up); the drill as a scheduled quarterly job.
  - Next exact action: owner fast-forwards `feat/review-p0` (after `claude/guardian-upload`) to this commit; optionally starts the nightly
    export (`... -f docker-compose.backup.yml up -d --no-deps keycloak-realm-export`). Then P1-15 once D-B, D-C, D-D are decided.

### P1-10  Commercial truth on the proposal  (B-03, A-08, B-05, D-01)
- "How your price works" three-step panel and the no-surprise guarantee text (counsel-approved) on the proposal and
  homepage; "coordination & guarantee" named in inclusions; final-quote rule: expected ≤ preliminary maximum unless a
  Consultant scope-change reason is recorded and shown, with a 24-hour cooling period before acceptance; final-quote
  validity (setting, default 14 days) and FX tolerance band (setting) with Finance re-approval outside it.
- Files: `JourneyService.createFinalQuote`, `ProposalExpiryService` (final quotes), `CommercialPolicyService`
  settings, `ProposalSign.tsx`, homepage, copy.
- Sessions: 2. Model: Fable 5.1, high (rule) then Sonnet 5.5 (copy/UI).
- **Decisions (owner, 2026-10-15; recommendations accepted):**
  - **D-A, the fee: yes, before launch.** The 15% stops being a markup baked into each Consultant line. Each medical
    line carries the provider's own price (Consultant and facility at their own prices). The platform charges the
    patient one disclosed line, the **coordination and guarantee fee** (`PLATFORM_FEE` category on `proposal_items`),
    equal to today's margin rate times the provider total. The rate still comes from the locked commercial policy
    version. The patient's total, the deposit (15% of that total, `DepositCalculator`), Finance's margin figures and the
    EGP ledger stay numerically the same; only the structure and what the patient sees change.
  - **Guarantee wording: a placeholder until counsel approves it.** Each locale keeps it under one key so the approved
    text is a copy change. Placeholder (EN): "Our no-surprise promise: your final quote will not be higher than the
    maximum shown here unless your Consultant finds, when they examine you, that your treatment needs to change. If it
    does, they will tell you why in writing, and you will have at least 24 hours to decide." It promises only what
    the rule enforces; no refund promise until counsel and the owner decide one.
  - **Final-quote validity: 14 days** after release, a setting on the commercial policy (`final_quote_validity_days`,
    default 14). The coordinator may shorten it but never lengthen it. `ProposalExpiryService` expires final quotes the
    same way it expires estimates.
  - **FX tolerance band: 3%**, a setting on the commercial policy (`fx_tolerance_rate`, default 0.03). When a final
    quote is accepted, its display-currency total is re-computed at the day's rate. If that total differs from the
    frozen one by more than the band in either direction, acceptance pauses and Finance re-approves: either confirm
    the frozen rate or re-release at the new rate. The no-surprise cap is compared in EGP (provider total plus fee),
    so a currency move can never count as a scope change and a scope change can never hide behind one.
  - **Still open:** counsel on the VAT rate of the fee (the design assumes 14%). P1-10 shows the fee without VAT;
    the VAT line comes with the platform e-invoice in P1-17. The final wording of the guarantee is also open.
- **Status (2026-10-15, session 1 of 2, Opus 5.5 high; the plan named Fable 5.1; committed on `claude/p1-10-fee-fb4348`, a
  worktree fast-forwarded from `feat/review-p0` f938fad, so the owner fast-forwards `feat/review-p0` to this commit):** the money
  rule, the cap, validity and the FX band delivered; the patient-facing panel and copy are session 2.
  - Delivered: `V96__platform_fee_line_and_final_quote_rules.sql`: `proposal_items` source widened to PLATFORM (named check
    replaced), named checks `ck_proposal_items_category` (MEDICAL/PLATFORM_FEE), `ck_proposal_items_fee_source` (fee ⇔ PLATFORM)
    and `ck_proposal_items_fee_mandatory` (a fee line is never optional); `commercial_policies.final_quote_validity_days` (default
    14, 1–90) and `fx_tolerance_rate` (default 0.0300, 0–0.5); `proposal_versions.above_estimate_maximum` and
    `fx_reapproval_status` (PENDING/CONFIRMED) with rate, requested-at, decided-by/at.
    **Fee line (D-A).** New `ProposalPricing` is the one price rule for the estimate and the final quote: medical lines carry the
    provider's own price (`unitPriceEgp = providerPriceEgp`, min/max likewise); one `PLATFORM_FEE` line "Coordination and guarantee
    fee" = margin rate x provider total, separately for expected, lowest and highest, sorted last, never optional, provider price 0
    (`ProposalItem.platformFee`). `marginAmount` = the expected fee; the patient totals = provider totals + fee; the locked margin of
    the estimate is still reused by the final quote. The "never itemized" comment is replaced; `DepositCalculator` javadoc says
    "provider lines plus the fee". Proposal views (staff workspace, My Care, the public token view, the rendered HTML) list the fee
    line through the existing item list; Finance's commercial view shows it as source PLATFORM; the Consultant and their practice
    manager get the workspace proposal without the fee line, so they see only their own price.
    **No-surprise cap (A-08).** `createFinalQuote` compares the final expected EGP total (provider + fee) with the accepted
    estimate's EGP maximum (falling back to the latest estimate's when none is accepted) and refuses above it without a scope
    change reason (`409 SCOPE_CHANGE_REASON_REQUIRED`); with one the version is flagged `above_estimate_maximum`, the reason is
    stored trimmed and shown on the patient's views as before, and the audit records both totals. Such a quote cannot be accepted
    until 24 h after release (`409 COOLING_PERIOD` naming the time it opens; `ProposalView`/`PublicProposalView.acceptableFrom`)
    on all three decision paths: signed in, secure link, and recorded by the coordinator. Declining or asking for changes is never held.
    **Validity (B-05).** `CommercialPolicyRequest` takes `finalQuoteValidityDays` and `fxToleranceRate` (left out: carried over from
    the version being replaced, else the defaults; `QUOTE_VALIDITY_INVALID`, `FX_TOLERANCE_INVALID`; audited; same
    COMMERCIAL_POLICY_MANAGE holders, System Administrator and Finance Manager); `Policy` carries them boxed so older cache entries
    read the defaults. `FinalQuoteRequest.validUntil` is now optional; a date beyond policy days from now is refused
    (`400 QUOTE_VALIDITY_TOO_LONG`); at release `validUntil` = min(release + policy days, coordinator's date), a passed date
    refuses the release (`409 QUOTE_VALIDITY_PASSED`); a final quote's share token expires no later than the quote. The inline
    expiry (decision past validity) no longer tries to move an ARRIVAL_CONFIRMED case to EXPIRED. `ProposalExpiryService`
    (workflow-builder subagent, reviewed) expires final quotes in its scan without touching the macro case, closes a pending
    FX re-approval and opens one coordinator work item `FINAL_QUOTE_EXPIRED` (audit `FINAL_QUOTE_EXPIRED`).
    **FX band (B-05).** On acceptance of a non-EGP final quote the display total is re-priced at today's rate; beyond the policy band
    in either direction (or with no rate today) the acceptance pauses: `409 FX_REAPPROVAL_REQUIRED` with a calm "our Finance team
    is checking" message, the request recorded on the version, one blocking Finance work item `FX_REAPPROVAL` and audit
    `FINAL_QUOTE_FX_REAPPROVAL_REQUESTED`; repeated attempts open nothing new. Finance (`FINANCE_SETTLE` on the case):
    `POST /api/v1/finance/cases/{caseId}/final-quotes/{versionId}/fx-rate/confirm` keeps the frozen rate (the next acceptance
    proceeds without a new check; audit `FINAL_QUOTE_FX_RATE_CONFIRMED`) or `.../fx-rate/reprice` re-releases at today's rate
    (lines and document re-fixed, EGP figures, cap and validity unchanged, old link replaced and the patient sent the quote again;
    audit `FINAL_QUOTE_REPRICED`). EGP quotes skip the check.
    **Defect found and fixed:** `ProposalItemRepository.priceAt` was a JPQL `round(unitPriceEgp * :rate, 2)` that bound the rate as
    a scale-2 decimal on H2, so a release at 0.0204 priced every line at 0.02 (the snapshot stored the right rate). It is now
    computed in Java on the entity (`ProposalItem.priceAt`). Existing fixtures all used two-decimal rates, so nothing caught it.
  - Tests: new `FinalQuoteRulesTest` (15: fee line arithmetic and before/after on a fixed case with totals, margin and deposit
    equal to the old per-line markup; range and USD figures; Consultant sees only their line; released document lists the fee;
    cap refused without reason, flagged with one, none needed at or under the maximum; cap in EGP so an FX move alone never trips
    it; cooling period on the signed-in and the secure-link paths; validity default 14 days, shorter coordinator date kept and
    the link with it, longer refused, a 7-day policy shortens it; policy settings refused for coordinator, Finance and Consultant,
    allowed for System Administrator and Finance Manager, carried over when omitted, validated; FX inside the band accepts,
    outside pauses and opens the Finance item, Finance confirms and the patient accepts at the frozen rate, Finance re-releases at
    today's rate and the patient accepts through the new link; EGP skips the band), `FinalQuoteExpiryTest` (3, workflow-builder:
    the scan expires a final quote, revokes its links, leaves the case ARRIVAL_CONFIRMED, opens one coordinator item and audits;
    idempotent; closes a pending FX item), `ProposalPricingTest` (3: whole-pound totals equal the old markup; the one-cent case;
    ranges). Updated for the fee line: `JourneyServiceIntegrationTest`, `SecureJourneyCorrectionsTest` (SEC-10 keeps the EGP base,
    the rate and every internal field forbidden; the display line price and fee are disclosed by D-A),
    `UatDefectCorrectionsTest`, `FacilityPackageLineGateTest`, `CoordinatorCaseActionsTest` (Finance's view shows the fee line).
    Verification: `mvn -o -q test` (JVM in UTC) 853 tests, 0 failures, 3 pre-existing skips (832 + 21 new);
    `PostgresJpaMappingTest` on postgres:17-alpine with V96 applied: green (1/1; Flyway at 96, the two policy columns and the five named `ck_proposal_items_*` checks present).
  - Open gaps: the totals equal the old figures for every price whose 15% does not round (whole pounds never do); a line priced in
    piastres can now differ by a cent, in the direction of total = provider + margin, which the old markup did not guarantee
    (`ProposalPricingTest`). Display totals in a foreign currency are summed per line, so the fee line can move a converted total
    by a cent against the single marked-up line. The fee line's stored description is English; the patient wording per language,
    the "How your price works" panel, the guarantee placeholder, the cooling and FX-pause states on `ProposalSign.tsx` and the
    minimum Finance UI for the re-approval are session 2 (the API already returns `acceptableFrom` and `fxReapprovalStatus`). The
    scope-change reason is entered by the coordinator on the final quote (as before), not by the Consultant on the final
    assessment. The validity and the band are read from the care area's active policy at release and acceptance, not
    snapshotted on the version (the margin is). No SLA level for `FX_REAPPROVAL` / `FINAL_QUOTE_EXPIRED`, and no portal copy key
    for them yet (English title only). The scheduled expiry does not close an open proposal-assistance item (the inline one does).
    The fee shows without VAT until P1-17.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit and rebuilds the dev stack
    (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`) so V96 runs; then P1-10 session 2 in a new
    session (Sonnet 5.5 for copy/UI, per the UX plan): the three-step "How your price works" panel and the guarantee placeholder on
    `ProposalSign.tsx` and the homepage (EN/AR, one key each, logical CSS, WCAG 2.2 AA), the fee line's patient wording, the
    cooling-period and FX-pause states, and the minimum Finance UI for the FX re-approval item. V97 is the next free Flyway version.
- **Status (2026-10-15, session 2 of 2, Sonnet 5.5 as the plan names it; committed on `claude/p1-10-s2-ui-bf8b61`, cut from `feat/review-p0` at
  b4ab584, so the owner fast-forwards `feat/review-p0` to this commit):** the patient-facing and Finance UI and the copy are delivered; the only backend change is
  two read-only fields on Finance's commercial view (below), no migration (V97 is still the next free Flyway version). The backend and the frontend need a rebuild of the dev stack
  (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`).
  - Delivered: **Fee line wording.** A `PLATFORM_FEE` item (`lib/price-transparency.ts` `isPlatformFee`) is worded from `portalProposal.price.feeLabel` /
    `feeNote` ("Coordination and guarantee fee", what it covers) on the public proposal (`ProposalSign.tsx`: after the medical lines, not grouped under a raw
    category, not counted as a service), the signed-in proposal (`PatientProposal.tsx`), the staff proposal card, and Finance's approval table (tagged "Platform
    fee"). **"How your price works"** (`components/PriceTransparency.tsx` `HowYourPriceWorks`): three numbered steps (specialist reviews and gives a range;
    Consultant examines you, final quote only then; your protection = the guarantee), on the estimate in `ProposalSign.tsx` and on the home page
    (`home/PriceSection.tsx`, between Trust and Travel, no action of its own); My Care's proposal drawer shows the guarantee paragraph under the items instead
    of the panel (narrow surface). **Guarantee:** one key per language, `portalProposal.price.guarantee` (EN = the binding placeholder from this entry; AR
    is a draft, **pending native review and counsel**); no refund promise. **Final-quote states:** the Consultant's reason in a prominent block before the
    recommendation (`ScopeChangeNotice`); the cooling period as a calm note with the opening time in the viewer's locale and timezone, accept disabled
    (`aria-describedby` the note) and re-enabled by a timer when the time passes, request changes and decline never held; Finance checking the rate as
    "you do not need to do anything" with accept disabled. Both 409 codes (`COOLING_PERIOD`, `FX_REAPPROVAL_REQUIRED`) are explained in place on the
    **secure-link** path (`ProposalSign.decide`; any other 409 stays "newer version") and on the **signed-in** path: `Portal.api` now carries the
    backend `code` on its error, `mutate` keeps the four proposal codes out of the page banner, only on the two requests whose form or note explains them (the patient's decision, the coordinator's final-quote creation; a decision recorded on the patient's behalf still shows the banner), and exposes them as `FeedbackContext.errorCode` +
    `errorPath`, and `PatientProposal`/`PatientProposalDecision` answer with the same notes (never "your decision was not sent"). **Finance UI:**
    `portal/FxReapproval.tsx` on Finance's case page when the version's `fxReapprovalStatus` is PENDING: the frozen total and rate, "Keep the frozen rate"
    and "Re-release at today's rate", each behind a `ConfirmDialog`, POSTing to the two Finance endpoints; the coordinator's proposal card says Finance is
    checking and, in the cooling period, when the patient can accept. Work titles `FX_REAPPROVAL` and `FINAL_QUOTE_EXPIRED` added to `portalWork.workTitles`
    (en, ar). **Coordinator final-quote form:** optional "Valid until" date (hint "Leave empty for 14 days from sending; you can only shorten it."), no
    `validUntil` sent when empty (end of the chosen day otherwise), `SCOPE_CHANGE_REASON_REQUIRED` shown under the reason field and `QUOTE_VALIDITY_TOO_LONG`
    under the date (focus moves there). **Control Center › Margin & Deposit:** "Final quote validity (days)" and "Exchange-rate tolerance (%)" shown on the
    active version, prefilled in the revision form, in the confirmation, and sent with every margin revision (`finalQuoteValidityDays`, `fxToleranceRate`).
  - Tests and numbers: new `PriceTransparency.test.tsx` (21: fee label en and ar on the public and signed-in pages, the three steps and guarantee from the
    keys in en and ar and on the home page, no refund wording, scope-change block before the recommendation, cooling hides accept and shows the time,
    passed cooling re-enables accept, FX pending, both 409 codes on the secure link, any other 409 still "newer version", the signed-in cooling/FX
    notes and the refusal contract) and `portal/FinalQuotePricing.test.tsx` (8: both Finance confirmations call exactly their endpoint, cancelling sends
    nothing, Arabic, the coordinator form sends no `validUntil` when empty and the chosen date otherwise, both field errors). `PageHeaders.test.tsx` updated
    (the margin body now carries the two fields) plus one new test (prefilled, confirmed, sent). Verification: `pnpm typecheck` clean; eslint clean on every
    touched file; `vitest run` 69 files / 505 tests green; backend `mvn -o -q test` (JVM in UTC) 853 tests, 0 failures, 3 skips, ArchitectureRulesTest green; Playwright (production build) on a11y, home-quality, home-visual, pre8c-commercial-copy,
    proposal-responsive, arabic-proposal-decision, proposal-otp, my-care (+ my-care-new-case, my-care-polish, final-quote-holds): green. The first run had 8 failures: 6 in `my-care.spec.ts`, stale since DEP-3 (they expected a "Deposit arrangements" step My Care no longer renders; fixture and strings updated), and 2 Arabic-decision specs my price panel broke by being the first `ol li` on the page (locator scoped to "What happens next"). Checked in the browser pane with a throwaway harness (not committed): the
    estimate in en and ar (RTL: step numbers at the start, amounts at the end, fee row), the cooling note with its time and the disabled accept, the
    Arabic rate-check note, and the Arabic home section.
  - Closed after the first review: Finance's panel now also shows the total and rate at today's rate and the difference
    (`ProposalCommercialView.fxReapprovalRate` / `fxReapprovalTotal`, filled only while the re-approval is PENDING, from the rate stored when the patient
    tried to accept; `FinalQuoteRulesTest` asserts both and that they clear on confirmation); the signed-in refusal wiring is proved through the real `Portal` in
    `e2e/final-quote-holds.spec.ts` (cooling note, both refusals, no banner); the six stale `my-care.spec.ts` failures are repaired (the fixture's default step is
    now DEP-3's "We're checking your payment" with a submitted transfer).
  - Open gaps: the Arabic guarantee and every new Arabic string are drafts, pending native review (UX plan area X) and counsel (the English is the
    owner's placeholder). Not built: the Finance-side
    notification copy codes beyond the two work titles, a coordinator-facing control for `FINAL_QUOTE_EXPIRED` (it opens a normal item), the
    scope-change reason on the Consultant's final assessment (still entered by the coordinator, as session 1 noted), the guarantee on the final quote
    (a final quote is past the promise; it shows the reason and the hold instead). Final look is the UX plan's (areas 1 and 4), this is the faithful minimum.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit and rebuilds the frontend of the dev stack; walk it once live (release a final
    quote above the estimate's maximum, confirm the cooling note and disabled accept in My Care and on the secure link, move the rate beyond 3% and
    decide as Finance); counsel and a native reviewer read the guarantee and the new Arabic. Then P1-13.

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
- **Status (2026-10-15, session 1 of 2 = backend, Sonnet 5.5 stood in for Opus 5.5; committed on `claude/p1-13-guardians-23a6cb`, cut from
  `claude/p1-10-s2-ui-bf8b61` at 67b56ce, so the owner fast-forwards `feat/review-p0` to this commit):** the model, the rules, the endpoints and
  the tests are delivered; no screen. The model, its rules and the hooks for P1-16 and P1-18 are written down in
  `docs/incidents-guardians-reopen-model.md`. Flyway **V97** (`V97__guardians_incidents_reopen.sql`) is now used: the next free version is V98 (the
  `V95…V100` file names in the P1-15…P1-19 entries below are already stale, take the next free number when each is built). The dev stack needs a
  backend rebuild (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`) for V97; the frontend only gained message keys.
  - Delivered: **(1) Age band.** `medical_cases.age_band` (`UNDER_12`, `AGE_12_17`, `AGE_18_64`, `AGE_65_PLUS`, NULL = not stated), optional `ageBand` on the
    public intake, the signed-in next case and the case sent for someone else; a coordinator records or corrects it (`PUT /api/v1/coordinator/cases/{id}/age-band`,
    audited); `CaseView.ageBand` on staff views. **(2) Guardian delegation.** `patient_representatives.delegation_type` (`REPRESENTATIVE` | `GUARDIAN`), `legal_basis`
    (`PARENT`, `LEGAL_GUARDIAN`, `COURT_ORDER`), an evidence document (a clean document of the case) that a coordinator verifies or refuses
    (`GuardianService`). A minor's onboarding starts as GUARDIAN and PATIENT/REPRESENTATIVE/PAYER are refused for a minor; the account that sends a case for a
    child becomes a guardian when it is the PARENT or the GUARDIAN; readiness gains `MINOR_REQUIRES_GUARDIAN`, `GUARDIAN_AUTH_MISSING`,
    `GUARDIAN_EVIDENCE_MISSING` (patient-owed) and `GUARDIAN_EVIDENCE_UNVERIFIED` (coordinator-owed, deferred at submit, gating at treatment coordination).
    The guardian's consent is its own type `GUARDIAN_AUTHORIZATION` (policy version `guardian-v0-placeholder`; the wording is a **placeholder**, one key per
    language `guardianConsent.text` in `en.json` and `ar.json`, same words in `PatientActivationService.consentText`; counsel and a native reader replace it).
    **(3) Incidents.** `case_incidents` (COMPLAINT / DISPUTE / ADVERSE_EVENT / DEATH, severity, status, owner, typed resolution, encrypted summary and note),
    `IncidentService`: raised by the patient, the case team or another phase (`raiseFromSystem`); owner = a Care Coordination Manager, never the case's
    coordinator nor the reporter, least loaded and one per case; one `INCIDENT_REVIEW` item (2 working days, survives the case's exit); a critical
    incident tells the other managers, a clinical one the Consultant; Compliance and managers read (`INCIDENT_READ`), only the owner works it
    (`INCIDENT_MANAGE`); new permissions `INCIDENT_REPORT/MANAGE/READ`, `CASE_REOPEN`. **(4) Complaint intake from My Care:** `POST|GET
    /api/v1/patient/cases/{id}/concerns` (the patient sees type, status and dates only). **(5) Reopen:** `CLOSED -> FOLLOW_UP` through `CaseReopenService` only
    (`CLOSED` is no longer terminal in `CaseTransitionPolicy`), typed reason, `case_reopenings` row, the same Consultant gets a `FOLLOW_UP_REVIEW` item,
    the coordinator is told; by a manager or the case's own Consultant. Staff copy for the new work and notifications (`INCIDENT_REVIEW`,
    `INCIDENT_CRITICAL`, `INCIDENT_CLINICAL`, `CASE_REOPENED`, `FOLLOW_UP_REVIEW`) is in both message files (Arabic is a draft).
  - Tests and numbers: new `IncidentsAndReopenTest` (14) and `GuardiansAndAgeBandTest` (8); `CaseTransitionPolicyTest` updated (CLOSED reopens, no longer
    final). Verification: backend `mvn -o -q test` (JVM in UTC) 875 tests, 0 failures, 3 skips (853 before, 22 new),
    `ArchitectureRulesTest` and `RolePolicyTest` green (no JDBC or native query added; journey imports no coordination); `PostgresJpaMappingTest` green on a
    disposable PostgreSQL 17 (V97 applied, Hibernate validated, every new repository query executed). The two English/Arabic message files keep key parity; no
    frontend code changed, so no frontend suite was run (it needs `pnpm install --offline --frozen-lockfile` in the worktree first).
  - Open gaps (session 2 and later): **no screens yet**: the age-band question on the intake forms (it becomes required on the wire then), the guardian
    steps and evidence upload in onboarding, the guardian consent checkbox wired to `guardianConsent.text`, "Raise a concern" on My Care, the manager's incident
    list and detail, the Compliance view in the Control Center, the coordinator's age-band control and evidence decision, "Reopen case" for managers and
    Consultants, a patient-visible wording of a reopened case. Decisions not taken: Consultant matching on the `AGE_GROUP` capability, deriving the band from a date of birth
    at activation, a guardian's authority at 18, a patient notice when a concern is resolved (needs a WhatsApp template), an SLA clock on patient concerns
    visible to the patient, who may reopen a case cancelled for an unanswered information request. Counsel reviews the guardian consent wording; a native reader
    the Arabic. The incident summary is free text kept encrypted; its retention and its data-protection class
    (P1-7, and the PDPL review of P1-18) are not decided.
  - Next exact action (session 1): owner fast-forwards `feat/review-p0` to this commit and rebuilds the backend of the dev stack (V97); then P1-13 session 2.
- **Status (2026-10-15, session 2 of 2 = UI and copy, Opus 5.5; committed on `claude/upbeat-snyder-df6742`, cut from `76d6289`):** every screen of the
  session-1 contract is built, frontend only apart from one wire change (`ageBand` required). No migration; V97 stays the newest.
  - Delivered: **(1) Age band at intake.** One required question (four bands, chips) on Send my case (myself and someone else) and on the signed-in
    new-case form (myself and someone else), shown again on the review step; sent as `ageBand`. `CreateCaseRequest.ageBand` and
    `NewCaseForPatientRequest.ageBand` are now `@NotBlank` (a case created another way can still hold none and is recorded in intake review).
    **(2) Guardian onboarding in My Care** (`GuardianStep`): when the backend's step is `COMPLETE_PROFILE` with blocker `MINOR_REQUIRES_GUARDIAN` /
    `GUARDIAN_AUTH_MISSING`, the guardian chooses the legal basis (parent, legal guardian, court order), may choose the evidence document and gives the
    guardian consent (`guardianConsent.text`, recorded as `GUARDIAN_AUTHORIZATION` with policy version `guardian-v0-placeholder`); then
    `PUT .../onboarding/subject` (GUARDIAN). On `GUARDIAN_EVIDENCE_MISSING` only the document is asked (`PUT .../onboarding/guardian-evidence`). The step has
    its own title and body; `GUARDIAN_EVIDENCE_UNVERIFIED` is the coordinator's, so the patient sees no action. The secure-link activation page shows the
    same consent wording when `requiredConsents` holds `GUARDIAN_AUTHORIZATION` (it showed the raw code before). Staff waiting copy for the four guardian
    blockers (`readiness.*`). **(3) Coordinator** (`GuardianReview`, overview tab, coordinators): the age band read and corrected by the owner
    (`PUT .../age-band`), and for a minor the guardian (state, basis, verified date), "View the document" and Verify / Refuse (refusal confirmed;
    `POST .../guardian/evidence-decision`); read-only for a coordinator who does not own the case. **(4) My Care "Raise a concern"** (`PatientConcerns`):
    one quiet text line beside "Withdraw", opening a short form in place (a complaint, or a health problem after treatment = `ADVERSE_EVENT`, what
    happened); the patient's own concerns listed with status and dates. No new button-styled CTA. **(5) Incidents** (Control Center › Reviews & Safety ›
    Incidents, `/portal/control-center/incidents`, visible with `INCIDENT_READ`): list with status/type/"only mine" filters, severity, status and owner
    ("You", "Another manager", "Not assigned"); detail with what was reported, stage, source, outcome. A manager (`INCIDENT_MANAGE`) takes an incident
    (assign to self), and as owner starts the review, changes the severity and resolves with a typed outcome and a required note; Compliance reads the same
    list and detail with no control. A manager also gets one quiet "Incidents — in the Control Center" link on the portal work list. **Reopen case**
    (`ReopenCase`): on a `CLOSED` case, one quiet line for a holder of `CASE_REOPEN` (manager, `/coordinator/.../reopen`) and for the case's Consultant
    (`/doctor/.../reopen`); the dialog asks the reason, offers the case's incidents to a manager and an optional note. All copy is in `portalWork.safety`
    in `en.json` and `ar.json` (Arabic is a draft), apart from the Control Center sidebar label, which follows that file's inline pair convention.
  - Tests and numbers: frontend `pnpm typecheck` clean; `pnpm exec vitest run` 73 files, 528 tests green (new: `GuardianStep.test` 7,
    `PatientConcerns.test` 4, `GuardianReview.test` 6 incl. Reopen, `IncidentsPage.test` 4, plus one each in `case-form-schema.test` and
    `ProfileActivation.test`); eslint clean on every touched file (two warnings on untouched lines remain). New Playwright spec `my-care-safety.spec.ts`
    (guardian step en 1440 and ar 390, concern form en and ar 390, the age question en/ar 390; screenshots to `test-results/p1-13`, untracked);
    `my-care-new-case`, `public-batch-3`, `case-flow` and the three live specs choose an age band now (`case-flow` and the live specs need the backend and
    were not run here); the three mocked specs ran on the dev server, 23 passed. Backend (`mvn -o -q test`, JVM in UTC): 876 tests, 0 failures, 3 skips
    (875 before; `CaseControllerTest.rejectsAMissingAgeBand` new). The required `ageBand` also applies to the journey verification intake (`JourneyCaseVerificationService`
    validates the same record), so the fixtures of four journey integration tests now send `AGE_18_64`.
  - Open gaps: **the signed-in portal has no document upload**, so a guardian can only choose a document already on the case; without one they are sent to
    their coordinator for a secure upload link (an authenticated presign/confirm for My Care is a small backend phase of its own). Assigning an incident to
    another manager (only "take it" is offered; the API accepts any manager), a staff "Report an incident" form (`POST /incidents/cases/{id}`; the work
    copy exists), a link from an `INCIDENT_REVIEW` work item straight to its incident, and the patient-visible wording of a reopened case (P1-18) are not
    built. The Control Center still renders the legacy base theme (the new page uses its own `cc-*` classes). Unchanged from session 1: counsel replaces the
    guardian consent wording (bump the version on both sides together), a native reader reviews the Arabic, the AGE_GROUP matching decision, a guardian's
    authority at 18, a patient notice when a concern is resolved.
  - Next exact action: owner fast-forwards `feat/review-p0` to this session's commit (it contains `76d6289`) and rebuilds the dev stack (backend for V97 and the
    required `ageBand`, frontend for the screens: `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`); then walks a minor's
    case (send for a child as PARENT, acknowledge, guardian step, coordinator verifies) and a concern to resolution. Then P1-15 / P1-16 per "Remaining work".
- **Status (2026-10-15, follow-up = My Care upload for guardian evidence, Opus 5.5; committed on `claude/guardian-upload`, cut from `ee11261`):** the
  session-2 gap "the signed-in portal has no document upload" is closed for the guardian step. No migration; V97 stays the newest.
  - Delivered: **backend** `POST /api/v1/patient/cases/{caseId}/documents/presign|confirm` (`PatientDocumentController`, `PatientDocumentService` in the
    document module): `PATIENT_SELF_SERVICE` plus `MedicalCaseRepository.findPatientIdAccessibleTo` (the patient, or an active representative or guardian),
    then `DocumentService.presignAdditional|confirmAdditional` (submitted case only; same type, size, per-case limits and scan as every channel); a clean confirm
    is audited `PATIENT_DOCUMENT_UPLOADED`. **Frontend** `GuardianStep` gains `EvidenceUpload` (prop `send`, the portal `api`, passed by `Portal` →
    `PatientCaseView`): choose a PDF/JPG/PNG up to 15 MB, status "Uploading…" then "Checking … for viruses…", the clean file is listed first, selected and
    focused, then attached with "Use this document" (or sent with the guardian declaration). Scanner outage: "Check again" re-confirms the same upload;
    condemned file, wrong type, size and case-limit errors each have their own line. With documents already on the case the upload is offered under the list
    ("Not in the list? Upload it here."), because intake files are usually medical reports, not the guardianship paper. Copy `portalWork.safety.guardian.upload.*`
    in `en.json` and `ar.json` (Arabic is a draft); `noEvidence` (coordinator link) stays for a view without `send`.
  - Tests and numbers: new `PatientDocumentServiceTest` (3: stranger refused with no storage touched, upload rules and draft refusal, scanner outage kept
    PENDING and unaudited until the same confirm succeeds) and `GuardiansAndAgeBandTest.aGuardianWithNothingOnTheCaseUploadsTheEvidenceFromMyCareAndAttachesItOnceScanned`
    (presign, bytes to the local store, condemned fake refused as evidence, clean upload attached, audit row). Backend `mvn -o -q test` (JVM in UTC):
    880 tests, 0 failures, 3 skips (876 before, 4 new), `ArchitectureRulesTest` green. Frontend: `pnpm typecheck` clean, eslint clean on touched files, `vitest run` 73 files, 533 tests (5 new in `GuardianStep.test`: upload →
    check → selected, focused and attached; scanner outage and "Check again" with one presign; wrong type and condemned file; upload under an existing list;
    Arabic label). Not run: Playwright (`my-care-safety.spec.ts` still covers the step without an upload) and a live walk with ClamAV.
  - Follow-up, same branch (2026-10-15), closing the two gaps above. **(a) Documents tab upload** (`13859e8`): the control becomes
    `CaseDocumentUpload`, used by the guardian step and by My Care's Documents tab (`documentUpload` slot of `MyCare`; a clean upload calls
    `reloadDocuments`, new in `CaseViewProps`/`Portal`); the list says "Being checked" / "Did not pass the virus check" and hides REJECTED rows;
    the tab's hint no longer points to the coordinator's link; generic upload copy moved to `portalWork.myCare.upload` (en, ar draft).
    Tests: `CaseDocumentUpload.test` (3), `MyCare.test` +1; frontend gate 74 files, 537 tests. **(b) Unfinished-upload sweeper** (this commit):
    `PendingDocumentSweeper.sweep` (`@LeasedJob`, every 5 min, 50 per run) gives each upload PENDING since before presign expiry + 10 min, or
    QUARANTINED that long, `DocumentService.recheckStale`: bytes stored → scanned like a confirm; no bytes → REJECTED, which frees the case's
    quota (abandoned presigns counted against it before); no verdict or storage down → next run. The confirm path no longer leaves an upload
    stuck in QUARANTINED when storage fails between quarantine and read. JPQL `findStaleUploads` on the existing `(status, created_at)` index; no
    migration. The outage message now says the file is checked automatically. Tests: `DocumentServiceTest` +5, new `PendingDocumentSweeperTest`
    (arrived, never arrived, stuck in quarantine, in flight untouched, quota), `SchedulerLeaseTest` lists the job; `PostgresJpaMappingTest` green on a
    disposable PostgreSQL 17; backend `mvn -o -q test` (JVM in UTC) 886 tests, 0 failures, 3 skips (880 before, 6 new).
  - Minor gaps closed, same branch (2026-10-15): **progress bar**: the PUT goes through `putWithProgress` (`lib/upload.ts`,
    XMLHttpRequest, because fetch has no upload progress) and `CaseDocumentUpload` shows a progress bar (`role="progressbar"`, outside the live
    region); **sweeper audit and notice**: each decision is audited `DOCUMENT_RECHECKED` (actor `SYSTEM` / `DOCUMENT_SWEEPER`, the outcome as
    reason) and a file cleared in the sweep publishes `DocumentEvents.UploadCleared`, which `UploadNotices` (journey) turns into an in-app
    notification `DOCUMENT_CLEARED` for the case's coordinators (copy in `workCopy.items`, en and ar draft); patients have no notification
    centre, so they see it in My Care; **guardian step**: files of the case still PENDING or QUARANTINED are listed under "Still being checked",
    not choosable. Tests: `upload.test` (2), `CaseDocumentUpload.test` +1 (progress), `GuardianStep.test` +1, `PendingDocumentSweeperTest`
    asserts the audit rows and the notices; frontend 75 files, 541 tests; backend `mvn -o -q test` (JVM in UTC) 886 tests, 0 failures, 3 skips.
  - Last gaps closed, same branch (2026-10-15): **uploader recorded**: Flyway **V98** (`V98__document_uploaded_by.sql`) adds
    `medical_documents.uploaded_by`: the account's subject for a My Care upload, else the channel (`INTAKE`, `SECURE_LINK`, `WHATSAPP`); the
    next free version is V99. **Patient notice**: when the sweep clears an upload, `UploadNotices` also queues `document-cleared` through the
    outbox (WhatsApp, else email, in the patient's language, at the case's on-file contact, which for a child's case is the sender's; links
    to the case page, sign-in required, no file name); not for a draft's INTAKE upload (no case page yet). New WhatsApp template
    `rs_document_cleared` (bound in `application.yml`, wording in `docs/whatsapp-message-templates.md`) **must be created and approved in
    WhatsApp Manager**; until it exists Meta refuses those sends (retried, then dead-lettered); email works. **Playwright**: `my-care-safety.spec.ts` gains the
    guardian upload (presign, bytes, confirm, consent, evidence, en 1440) and the Documents tab upload (ar 390, no side scroll); the fixture
    serves presign, upload and confirm; the age spec now retries its first click until the form has hydrated (it failed on the dev server
    when run after other tests). Tests: `NotificationOutboxProcessorTest` +1 and the template in the language check,
    `PendingDocumentSweeperTest` (outbox row for the patient, none for an INTAKE upload, `uploaded_by`), `GuardiansAndAgeBandTest`
    (`uploaded_by` = the guardian); backend `mvn -o -q test` (JVM in UTC) 887 tests, 0 failures, 3 skips; `PostgresJpaMappingTest` green
    on PostgreSQL 17 with V98; frontend 75 files, 541 tests; Playwright `my-care-safety.spec.ts` 7 passed (dev server).
  - Open: owner tasks only: create and approve `rs_document_cleared` in WhatsApp Manager, native review of the new Arabic, the live walk
    below. A representative who uploads is reached at the case's contact, not their own (no separate contact is stored for them).
  - Next exact action: owner fast-forwards `feat/review-p0` to `claude/guardian-upload` and rebuilds backend and frontend; live walk: a minor's case with no
    document, the guardian uploads the guardianship paper from My Care, sees it checked, attaches it, the coordinator verifies; a patient
    uploads from the Documents tab; with ClamAV stopped, an upload shows the outage and is finished by the sweeper within ~5 minutes of
    ClamAV returning (once the upload is 15 minutes old).

### P1-14  Consultant public profiles — data and endpoint  (D-03, §16.2 item 5)
- Backend only: a public read of the published profile ("Credentials reviewed · current" derived from the credential
  state, years, sub-specialties, languages, practice locations from the facility registry, optional intro video on
  S3, scanned); no ratings; ethics regulation Article 10 (no promotional fields). The page itself is UX plan area 1b.
- Sessions: 1. Model: Opus 5.5 fast, medium.

### P1-15  Admission, voucher and balance  (post-deposit design §5 stages 1–3, §6; architecture §5.1)
- Source: `docs/post-deposit-journey-design.md` (decisions D-B, D-C, D-D) and `docs/post-deposit-solution-architecture.md`.
- `case_evidence` ledger with countersign rule; `facility_admissions` (reserve, hospital admission letter with quoted
  amount, Finance pro-forma check and `PRICE_VARIANCE`, voucher with the frozen money split as a generated document,
  point of no return set by Operations and approved by Finance); balance evidence recorded by Operations and
  countersigned by Finance (step-up); new macro state `ADMISSION_READY` in `CaseTransitionPolicy` with evidence
  blockers; `JourneyService.treatment` requires balance evidence and the admission number; patient states
  `CONFIRM_ARRIVAL`, `PAY_BALANCE` (voucher, pay at the hospital in phase 1), `CLEARED_FOR_ADMISSION`; "Your dates"
  and the arrival card on My Care and the status link; Operations and Finance screens.
- Files: new `journey/application/EvidenceLedger`, `AdmissionService`; `CaseTransitionPolicy`, `CaseHandoffService`,
  `CaseActionService`, `StaffWorkService.stageDefault`, `SlaPolicy`; `V95__evidence_ledger_and_admission_ready.sql`,
  `V96__facility_admissions.sql`; `MyCare.tsx`, `CaseStatusAccess.tsx`, `StaffCaseView.tsx`, `CaseWorkflowActions.tsx`,
  Finance verification screen; copy; templates `rs_your_dates`, `rs_arrival_card`, `rs_admission_voucher`,
  `rs_cleared_for_admission`.
- Tests: architecture §14 rows for the policy, admission and money split; `PasswordOnlySessionCoverageTest`;
  `PostgresJpaMappingTest` on V95–V96.
- Sessions: 2. Model: Fable 5.1, high (lifecycle and money). Needs: D-B, D-C, D-D decided; P1-10 fee line first.
- **Status (2026-10-15, session 1 of 2 = backend, Opus 5.5 stood in for Fable 5.1; committed on `claude/magical-edison-f4f675`):** delivered;
  no screen. Owner decisions recorded 2026-10-15: **D-B yes**, **D-C yes**, **D-D applied as recommended** (the owner agreed to "both
  recommendations" and asked to implement; D-D was not asked separately and may still be objected to). Flyway **V99**
  (`V99__admission_evidence_and_voucher.sql`; the `V95`/`V96` names above were stale) is now the newest; V100 is the next free.
  - **Integration merge first (step 0).** `feat/review-p0` had diverged (P1-10 session 1 + 21 UX commits), so this branch was cut from
    `claude/guardian-upload` (`9d0309b`: P1-10 session 2, P1-13 backend + UI, V97, My Care upload, sweeper, V98), merged
    `claude/amazing-jepsen-cb80d9` (`269d1b2`, P1-9, scripts and docs) and then `feat/review-p0` (`1a3ed8f`): merge `2287ae1` + fix `635ae46`.
    Conflicts were frontend only (ProfileActivation, ProposalSign, MyCare, the patient e2e fixture and two specs): the UX side's structure was
    kept and the P1-10/P1-13 behaviour re-applied (guardian consent words, acceptance holds, guardian step, final-quote step, fixture options;
    ProposalSign's price copy now comes from the page instead of `getDictionary` in the client). Verified on the merge: backend `mvn -o -q test`
    891 tests, 0 failures, 3 skips; `pnpm typecheck` clean; vitest of the touched components 336 green. So this branch contains
    `feat/review-p0`, and the owner can fast-forward `feat/review-p0` to it.
  - Delivered: **(1) `ADMISSION_READY`** in `CaseStatus`, the status check and `CaseTransitionPolicy`: `ARRIVAL_CONFIRMED -> ADMISSION_READY |
    CANCELLED`, `ADMISSION_READY -> TREATMENT_IN_PROGRESS | CANCELLED` (no edge around it), typed cancellation, advancing, `stageDefault`
    HOSPITAL, the status link's treatment phase and label. Entry blockers come from **`AdmissionReadiness`** (one answer for the gate, the
    treatment episode and the views): final quote accepted when one exists, procedure consent (or the consent override), and the balance
    evidenced against the voucher (cashier receipt countersigned by Finance for the hospital part, the platform's receipt for any fee balance)
    or the Consultant's emergency admission override; `TREATMENT_IN_PROGRESS` needs the hospital's admission number. Errors
    `ADMISSION_NOT_READY` and `ADMISSION_NUMBER_REQUIRED` list the missing pieces. **(2) Evidence ledger** `case_evidence` +
    `EvidenceLedger`: append-only rows (kind, stage, document of the case and clean, reference, amount, effective time, encrypted payload),
    countersigned once and never by the recorder (`SELF_COUNTERSIGN_REFUSED`, also a check constraint), corrections supersede; P1-15 kinds
    `FACILITY_ADMISSION_LETTER`, `PRICE_VARIANCE_CHECK`, `ARRIVAL_ATTESTED`, `PATIENT_ARRIVED`, `BALANCE_EVIDENCED`, `FEE_BALANCE_RECEIVED`,
    `ADMISSION_NUMBER`, `POINT_OF_NO_RETURN`, `EMERGENCY_ADMISSION_OVERRIDE`. **(3) `facility_admissions`** (one per case; Operations
    reserves facility + planned date in treatment coordination or after arrival; a new hospital supersedes the voucher; cancelled with the case).
    **(4) Letter and price check**: Operations records the hospital's letter with its quoted package (EGP); within the accepted version's provider
    maximum → Finance `CHECK_PROFORMA` (1 working day), above it → `PRICE_VARIANCE` (4 working hours) that Finance accepts with a reason
    (`PRICE_VARIANCE_CHECK` row) or refuses (back to Operations, `REVISE_ADMISSION_LETTER`); travel cannot be `CONFIRMED` while a variance is
    open (`PRICE_VARIANCE_OPEN`). **(5) Voucher (D-B)** `admission_vouchers` (immutable, revision `RS-V-<case>-<n>`, no sequence needed),
    issued by the system when the final quote is accepted and the letter is checked (both orders), or by Operations for a case with no final
    quote (then priced from the accepted estimate). Money rule `AdmissionMoney`, schema-checked: the deposit covers the platform fee first, the
    rest is credited to the hospital, the patient pays the hospital the package less that credit, a fee the capped deposit did not cover is
    owed to the platform. Hospital emailed (`admission-voucher-facility`, EN+AR, to `facilities.contact_email`), patient told
    (`admission-balance-due`). A voucher that cannot be issued (deposit above package + fee) never undoes the acceptance: it becomes Finance
    work `ADMISSION_VOUCHER_BLOCKED`. **(6) Balance (D-C)**: Operations records the cashier receipt (receipt number, EGP amount, paid at,
    method, optional document and paid currency; never above what is owed, `AMOUNT_EXCEEDS_BALANCE`), Finance countersigns with a fresh
    sign-in (`COUNTERSIGN_BALANCE`, 4 working hours); Finance records the fee balance (`PAYMENT_RECORD`). When the last gate passes,
    `CaseHandoffService.onAdmissionEvidenceChanged` moves the case to `ADMISSION_READY` and tells the patient (`cleared-for-admission`), the
    coordinator and Operations. **(7) Pay to admit**: `JourneyService.treatment` refuses the first episode without the balance
    (`BALANCE_EVIDENCE_REQUIRED`), walks `ADMISSION_READY` then `TREATMENT_IN_PROGRESS`, and takes the admission number
    (`TreatmentRequest.admissionNumber`, new optional field; Operations can record it too). **(8) Emergency**: the Consultant records an
    emergency admission with a reason (encrypted; audit carries no text); Finance gets `EMERGENCY_ADMISSION_REVIEW` (2 working days,
    survives the case's exit); it never stands in for the quote or the consent. **(9) Arrival**: Operations' confirmed arrival writes
    `ARRIVAL_ATTESTED`; the patient confirms "I have arrived" (`POST /patient/cases/{id}/arrived`, travel `CONFIRMED`), which records
    `PATIENT_ARRIVED` and moves the case under the policy. **(10) Point of no return**: Operations sets it, Finance approves (countersign).
    **(11) Patient states** (`CaseActionService`): `CONFIRM_ARRIVAL` (focus, arrival within a day), `PAY_BALANCE` (focus),
    `WAIT_BALANCE_CHECK`, `CLEARED_FOR_ADMISSION`; Operations' current action `RECORD_HOSPITAL_BALANCE` / `RECORD_ADMISSION_NUMBER`.
    **(12) Access**: permissions `ADMISSION_READ`, `ADMISSION_MANAGE`, `EVIDENCE_COUNTERSIGN` (step-up), `ARRIVAL_REPORT`; new scope
    `CASE_MONEY_OPEN` (deposit open or admission reserved/confirmed; reads audited like deposit reads) so any Finance member reads and
    countersigns an open admission without a clinical record. Finance's admission work goes to the case's Finance person, else the least-loaded
    Finance holder, and every Finance holder is told (the pool queries only cover deposits). **API** (`AdmissionController`):
    `GET …/{operations|finance|coordinator|doctor}/cases/{id}/admission`; Operations `POST /operations/cases/{id}/admission`, `…/letter`,
    `…/voucher`, `…/balance`, `…/point-of-no-return`, `…/number`; Finance `POST /finance/cases/{id}/admission/letter/decision`,
    `/finance/cases/{id}/evidence/{evidenceId}/countersign`, `…/admission/fee-balance`; Consultant `POST /doctor/cases/{id}/emergency-admission`;
    patient `GET /patient/cases/{id}/admission`, `POST /patient/cases/{id}/arrived`.
  - Tests and numbers: new `AdmissionServiceTest` (14: frozen split and replay, new hospital supersedes, estimate-only voucher by hand,
    blocked voucher never undoes acceptance, variance holds travel and needs a reason, refused letter back to Operations, countersigned receipts
    clear for admission then the admission number opens treatment, no self-countersign, capped deposit fee balance, pay to admit + emergency
    override + Finance review, override never replaces quote or consent, patient arrival, Finance scope and Operations assignment, cancellation
    cancels the admission), `AdmissionMoneyTest` (5, the worked examples), `CaseTransitionPolicyTest` +1, `NotificationOutboxProcessorTest` +2
    (and the two patient messages in the language test); `JourneyServiceIntegrationTest` updated for the new gate (episodes carry an admission
    number; a fixture emergency-admission row stands in for the receipt). Backend `mvn -o -q test` (JVM in UTC): 913 tests, 0 failures, 3 skips (891 after the merge, 22 new).
    `ArchitectureRulesTest` and `RolePolicyTest` green (JPA only, no native query). `PostgresJpaMappingTest` green on a disposable PostgreSQL 17 (V99 applied,
    Hibernate validated, every new repository query executed). No frontend code changed in this session after the merge.
  - Not done here (session 2 and later): **no screens or copy** — My Care / status-link blocks (`CONFIRM_ARRIVAL`, `PAY_BALANCE` with the voucher
    number and amounts, `WAIT_BALANCE_CHECK`, `CLEARED_FOR_ADMISSION`, "Your dates"), the staff "Admission & money" panel and forms, Finance
    letter decision / countersign / fee balance, the Consultant's emergency admission and admission number on the treatment form, the
    `ADMISSION_READY` label, staff work copy for the new work types. No voucher PDF (no renderer resolvable offline; the voucher is a record,
    an API view and the hospital email — architecture open point 1). No `PROVIDER` deposit component (the credit to settle is on the voucher;
    P1-12's settlement consumes it). `CaseExitService` does not read the point of no return for a refund class yet. No `RESERVE_ADMISSION`
    work item (Operations' `UPDATE_TRAVEL_PLAN` step covers the stage). Arrival is not gated on the letter (the voucher is), to keep existing
    flows. Templates `rs_your_dates` and `rs_arrival_card` not added; `rs_admission_voucher` and `rs_cleared_for_admission` need Meta approval.
    A date-only change of the reservation keeps the voucher (its email shows the old date).
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit (it contains `feat/review-p0`) and rebuilds the dev stack backend
    for V99 (`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build`); confirm the money rule (Owner decisions still
    open); then P1-15 session 2 (UI and copy).
- **Status (2026-10-15, session 2 of 2 = UI and copy, Opus 5.5; committed on `claude/p1-15-s2-ui`, cut from `1653760`):** delivered,
  frontend only (no wire gap blocked the brief; the status link's one gap is below). Amounts are shown exactly as the API returns them;
  nothing is recomputed in the browser. The money rule (deposit covers the platform fee first) is still awaiting the owner's confirmation.
  - **Patient (My Care).** New `PatientAdmission` block inside the current step (one `admissionStep` slot in `MyCare`, loaded on demand by
    `PatientCaseView`, keyed by the backend's step code; `admission-steps.ts` holds the four codes). It reads
    `GET /patient/cases/{id}/admission` (an empty answer = no reservation = the step alone) and shows the hospital, the admission date, the
    voucher number (`translate="no"`), what to pay at the cashier in EGP and "about … at the rate fixed on your quote" in the patient's
    currency, the deposit credit and any platform fee balance, with the balance state (To pay / Checking / Paid). `CONFIRM_ARRIVAL` carries
    the step's one primary action, "I have arrived", behind a confirmation (`POST /patient/cases/{id}/arrived`); `PAY_BALANCE` has no button
    (paid at the cashier); `WAIT_BALANCE_CHECK` says the receipt is being checked; `CLEARED_FOR_ADMISSION` says "You are cleared for
    admission on {date}". Step texts in `myCare.steps`, block copy in `myCare.admission`. `ADMISSION_READY` is in the staff `STATUS_LABELS`,
    the journey snapshot and the patient's Treatment phase (`CaseSwitcher` `PHASES`).
  - **Status link.** The public status carries no admission step, so in the treatment phase `CaseStatusAccess` no longer says "nothing is
    needed": the treatment explanation tells the patient to confirm arrival in My Care, where the voucher and the amount appear, with one quiet
    "Sign in to My Care" link (as DEP-3 did for the deposit). Open gap: showing the step itself on the link needs a patient-safe step code
    on `PublicCaseStatus` (backend).
  - **Staff "Admission & money" panel** (`AdmissionPanel`, on the case page for Operations, Finance, coordinator and Consultant from
    `TRAVEL_COORDINATION` to `TREATMENT_IN_PROGRESS`, reading `GET /{role}/cases/{id}/admission`): reservation, letter check, reference
    maximum, point of no return, admission number; the voucher with its frozen split and rate; the checklist from `admissionBlockers`; the
    emergency flag; the evidence trail (kind, amount, reference, recorded/countersigned by role and time, replaced rows). Every command
    answers with the view and the panel shows it. One primary action: the next task's disclosure opens first and is the "do it" target of
    the current-action panel (`ADMISSION_WORK`, `#admission-next`). Operations: reserve (facility + date), record the letter (clean case
    document + quoted EGP + reference), issue the voucher by hand (estimate-only cases), cashier receipt (number, EGP, paid at, method,
    optional copy, paid currency and amount), point of no return, admission number (after clearance). Finance (step-up through the portal's
    re-sign-in and replay): letter accept/refuse (a reason required for every refusal and for accepting `VARIANCE_OPEN`), countersign a
    receipt or the point of no return after a confirmation, fee balance (reference, EGP, received at). Consultant: "Emergency admission"
    with a required reason and a confirmation; the treatment episode form now opens at `ADMISSION_READY` and sends
    `TreatmentRequest.admissionNumber`.
  - **Copy** (en + ar; **Arabic is a draft** pending native review): `portalWork.workTitles` and `workCopy.items` for `CHECK_PROFORMA`,
    `PRICE_VARIANCE`, `REVISE_ADMISSION_LETTER`, `COUNTERSIGN_BALANCE`, `APPROVE_POINT_OF_NO_RETURN`, `EMERGENCY_ADMISSION_REVIEW`,
    `ADMISSION_VOUCHER_BLOCKED` (+ their `currentAction.work` button words), the `CLEARED_FOR_ADMISSION` notification, current-action states
    and buttons `RECORD_HOSPITAL_BALANCE` / `RECORD_ADMISSION_NUMBER`, waiting reasons `ADMISSION_BALANCE_DUE` / `ADMISSION_BALANCE_TO_CHECK`
    / `CLEARED_FOR_ADMISSION`, `portalWork.admission` (panel), `myCare.admission` and the four steps, `secureLink.journey.inMyCare`.
  - Tests: new `AdmissionPanel.test.tsx` (11: Operations reserve/letter/receipt/number with one primary, amounts as returned, pending
    documents never offered; Finance variance reason, refusal reason, countersign after confirmation, fee balance; read-only coordinator;
    Consultant emergency; Arabic), `PatientAdmission.test.tsx` (6, through `MyCare`), +1 `CaseWorkflowActions` (admission number), +1
    `CaseStatusAccess` (treatment phase), +1 `StaffOperationalUi` (current-action words en/ar). Playwright `e2e/my-care-admission.spec.ts`
    (6, route mocks via the new `admission` option of `patient-fixture.ts`: pay-balance en/ar × 390/1440 with no page scroll, arrival
    confirmation sent, cleared date in Arabic) green on the dev server. `pnpm typecheck` clean, eslint clean on touched files, vitest 79 files
    / 617 tests green. Reviewed with react-best-practices, composition-patterns, web-design-guidelines and Impeccable (fixes: no spell-check on
    codes and references, `translate="no"` on the voucher number, point of no return hidden once cleared).
  - Not done (later or owner): the final UX design of these screens (UX plan); the status link's own admission step (backend field above);
    no voucher PDF (session 1); staff panel not walked live — needs the dev stack rebuilt at V99 with this frontend.
  - Next exact action: owner fast-forwards `feat/review-p0` to `claude/p1-15-s2-ui` (it contains `1653760`), rebuilds backend and frontend,
    and walks one case live (reserve → letter → final quote → voucher → arrival → receipt → countersign → cleared → admission number); then
    P1-16 (treatment evidence: milestones and change orders), started in a new session.

### P1-16  Treatment evidence: milestones and change orders  (design §5 stage 4; architecture §5.2–5.3)
- `TreatmentMilestoneService` (eight milestone kinds, Consultant or Operations-with-countersign, 24-working-hour
  `RECORD_MILESTONE` rotation, complication → incident); `ChangeOrderService` with the band settings on the
  commercial policy (D-E), Finance pricing, patient acceptance above the band (step-up, My Care and secure link),
  emergency path; interim bills; the patient's treatment timeline; staff evidence checklist per stage.
- Files: new services; `V97__change_orders.sql`; `CommercialPolicyService` band settings; Consultant portal forms;
  `MyCare.tsx` timeline; Finance pricing screen; templates `rs_treatment_update`, `rs_change_order_review`.
- Sessions: 2. Model: Fable 5.1, high (money and consent-adjacent); milestone forms by Opus 5.5. Needs: P1-13
  incidents (can be built in the same session order: P1-13 first).
- **Status (2026-10-15, session 1 of 2 = backend, Opus 5.5 stood in for Fable 5.1; committed on `claude/p1-16-s1-treatment-d2acd9`, cut from
  `2aacb41` = `claude/p1-15-s2-ui`):** delivered; no screen. Flyway **V100** (`V100__treatment_milestones_and_change_orders.sql`; the
  `V97` name above was stale) is now the newest; V101 is the next free.
  - Decision recorded (owner's standing rule 2026-10-15: decide by the recommendation, do not ask): **D-E applied as recommended**: the
    band is the lower of 10% of the facility package and EGP 15,000 (`commercial_policies.change_order_band_rate` /
    `change_order_band_egp`; Finance Managers change them per care area; left out they carry over); Finance alone within it, the patient
    above it, emergency path with a Finance review. Further choices made here, each the design's best-practice reading: the band is
    **cumulative** over the case's accepted and emergency change orders (splitting a change never avoids the patient); the facility package
    is the current voucher's (else the accepted version's provider net, for an emergency admission without a voucher); an **interim bill is
    the hospital's running statement to date** (the latest countersigned one is "billed to date", not a sum); a **complication** opens a
    P1-13 adverse-event incident with the summary, reads `CARE_UPDATE` on the patient's timeline and sends no message (the Consultant tells
    the patient in person; the incident is the review, so no separate `REVIEW_COMPLICATION` item); the patient decides on the **verified
    secure status link** too (the one-time code to the registered contact is the fresh proof, as for the proposal decision). The P1-15
    money rule (deposit covers the fee first) is untouched and still awaits the owner.
  - Delivered: **(1) Milestones** (`TreatmentMilestoneService`): the eight kinds as `case_evidence` rows (`MILESTONE_ADMITTED` to
    `MILESTONE_DISCHARGE_PLANNED`; payload encrypted: operative note reference, implants, note, planned discharge date, incident id),
    recorded by the case's Consultant or by its Operations person on the Consultant's behalf; Operations' rows open
    `COUNTERSIGN_MILESTONE` for the Consultant (24 working hours) and the Consultant countersigns with a fresh sign-in
    (`MILESTONE_COUNTERSIGN`); until then the patient reads "reported by the care team". Rules: only in `TREATMENT_IN_PROGRESS`, not in
    the future; the completed procedure needs the operative note (reference or clean document), a complication a summary and severity, a
    planned discharge a date not in the past; ADMITTED / PROCEDURE_STARTED / PROCEDURE_COMPLETED / DISCHARGE_PLANNED are single facts
    (recording again supersedes). **The clock**: the treatment episode that opens treatment publishes `CaseEvents.TreatmentStarted`; the
    ADMITTED milestone is recorded for the Consultant with the admission number and `RECORD_MILESTONE` opens (24 working hours); every
    milestone rotates it, a planned discharge stops it, leaving treatment closes it (read-time repair in `CaseActionService`). Each
    milestone except a complication sends the patient `treatment-update`. **(2) Change orders** (`ChangeOrderService`, `change_orders` +
    `change_order_lines`): the Consultant proposes (encrypted clinical reason, 1-20 lines of kind PROCEDURE / IMPLANT / EXTRA_NIGHT /
    MEDICATION / OTHER), number `RS-CO-<case>-<n>`; Finance prices every line with a fresh sign-in (`CHANGE_ORDER_PRICE`,
    `PRICE_CHANGE_ORDER` 4 working hours); within the band it is `ACCEPTED` by Finance, above it `AWAITING_PATIENT` (patient
    `change-order-review`, coordinator `CHANGE_ORDER_PATIENT_DECISION` due in 24 h, waiting on PATIENT); the patient or representative
    accepts or declines in My Care (`PATIENT_DECIDE`, step-up) or on the secure link; the Consultant may withdraw an undecided order.
    **Emergency**: done first (`EMERGENCY`, the Consultant's decision is the record), Finance prices and reviews it after
    (`EMERGENCY_CHANGE_ORDER_REVIEW`, 2 working days, survives the case's exit), the patient is told (`change-order-applied`). Every
    decision is also a `CHANGE_ORDER` ledger row; amounts in EGP and at the voucher's frozen rate. A check constraint makes the band the
    only path to acceptance. **(3) Interim bills** (`InterimBillService`): Operations records the hospital's bill (clean document, number,
    EGP, billed at) as `INTERIM_BILL`; Finance countersigns it with a fresh sign-in (`COUNTERSIGN_INTERIM_BILL`, 4 working hours).
    **(4) Views** (`TreatmentViews`): the staff panel `TreatmentView` (milestones with countersign state, next milestone due, change
    orders, running money = package + counted change orders vs billed to date, variance, band and band used, interim bills, and the
    **evidence checklist per stage**: ADMISSION = reserved, letter checked, arrival, final quote, consent, voucher, balance, admission
    number; TREATMENT = the four required milestones, milestones countersigned, change orders settled, interim bills countersigned);
    clinical details and the change-order reason only for a reader of the clinical record. The patient's `PatientTreatmentView`: facility,
    calm timeline, priced (and emergency) change orders, the one awaiting their decision. **(5) Access**: permissions `MILESTONE_RECORD`,
    `MILESTONE_COUNTERSIGN` (step-up), `CHANGE_ORDER_PROPOSE`, `CHANGE_ORDER_PRICE` (step-up); the staff panel reuses `ADMISSION_READ`;
    `CASE_MONEY_OPEN` now also covers a case in `TREATMENT_IN_PROGRESS` (Finance prices and countersigns without a clinical record);
    `FinanceWork` is the one Finance router, shared with `AdmissionService`. **(6) Patient and staff states**: patient
    `REVIEW_CHANGE_ORDER` (FOCUS) in treatment; Consultant `RECORD_MILESTONE` stage step. **API** (`TreatmentController`):
    `GET .../{operations|finance|coordinator|doctor}/cases/{id}/treatment`; `POST /doctor|operations/cases/{id}/milestones`,
    `/doctor/cases/{id}/milestones/{evidenceId}/countersign`; `/doctor/cases/{id}/change-orders` (+ `/emergency`, `/{orderId}/withdraw`);
    `/finance/cases/{id}/change-orders/{orderId}/price`; `/operations/cases/{id}/treatment/interim-bills`,
    `/finance/cases/{id}/treatment/interim-bills/{evidenceId}/countersign`; patient `GET /patient/cases/{id}/treatment`,
    `POST /patient/cases/{id}/change-orders/{orderId}/decision`; link `POST /public/cases/{token}/treatment`,
    `/public/cases/{token}/change-orders/{orderId}/decision`.
  - Tests and numbers: new `TreatmentEvidenceServiceTest` (11: admitted on the episode and the rotating clock stopped by a planned discharge;
    Operations on the Consultant's behalf + countersign; complication to incident, `CARE_UPDATE`, no message; only in treatment; within band
    by Finance alone; cumulative band and the patient's fresh decision (+ the schema refusing Finance above the band); decline on the
    verified secure link; emergency priced and reviewed after; withdraw; band from the policy and carried over; interim bills countersigned,
    billed to date and variance). The P1-15 fixture moved to `AdmissionFixture` (shared; `AdmissionServiceTest` unchanged in substance);
    `NotificationOutboxProcessorTest` covers the three new patient messages in both languages and their case-page link. Backend
    `mvn -o -q test`: 924 tests, 0 failures, 3 skips (913 before, 11 new). `ArchitectureRulesTest` and `RolePolicyTest` green (JPA only,
    no native query). `PostgresJpaMappingTest` green on a disposable PostgreSQL 17 (V100 applied, Hibernate validated, every repository
    query executed). No frontend change.
  - Not done here (session 2 and later): **no screens or copy**: Consultant milestone / countersign / change-order forms, Operations
    milestone-on-behalf and interim-bill forms, Finance pricing and countersign, the staff "Treatment" panel and checklist, My Care
    timeline and change-order decision, the status link's treatment view, Control Center band fields; staff work copy for the six new work
    types. No assisted (coordinator-recorded) change-order decision; lines are priced by hand (no facility-package or catalogue link); the
    checklist gates nothing yet (P1-17's discharge gate will read it); templates `rs_treatment_update`, `rs_change_order_review` need Meta
    approval; the status link's own current step still needs a patient-safe step code on `PublicCaseStatus`.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit (it contains `2aacb41`) and rebuilds the dev backend for V100;
    then P1-16 session 2 (UI and copy, started in a new session; contract in the shared notes folder,
    `p1-16-session-1-handover.md`).
- **Status (2026-10-15, session 2 of 2 = UI and copy, Opus 5.5; committed on `claude/p1-16-s2-ui-aca50e`, cut from `b8dcf2d`):** delivered,
  frontend only (no wire gap blocked a screen). Amounts are shown exactly as the API returns them; nothing is added up or converted in the
  browser. The P1-15 money rule (deposit covers the platform fee first) is untouched and still awaits the owner.
  - **Staff "Treatment" panel** (`TreatmentPanel`, on the case page after "Admission & money" for Operations, Finance, the coordinator and
    the Consultant while the case is `TREATMENT_IN_PROGRESS`, and for an open Treatment work item afterwards, e.g. Finance's emergency
    review that survives the exit; reads `GET /{role}/cases/{id}/treatment`): milestones with who recorded them, countersign state, the
    clinical details (null for Finance) and "Incident opened for review" on a complication; the next milestone due (or "discharge is
    planned: no further milestone is due"); change orders (number, status, clinical reason, the lines table, total in EGP and the patient's
    currency, within/above the band, proposed and decided by channel); the running money (package, change orders, authorised, billed to
    date, bill awaiting countersign, variance marked "over" when positive, band and band used); interim bills; and the evidence checklist
    per stage (done/missing in words for screen readers, optional items marked). Every command answers with the view and the panel shows
    it. One primary action: the viewer's next task, and the "do it" target of the current-action panel (`TREATMENT_WORK`,
    `#treatment-next`). **Consultant**: the milestone form (eight kinds; the operative note reference or document for a completed
    procedure, checked before the round trip; implants; summary + severity for a complication with its incident hint; the date for a
    planned discharge; "recording this again corrects the one on file" for the four single facts), opening first on `RECORD_MILESTONE`;
    countersign Operations' milestones after a confirmation (step-up via the portal's re-sign-in and replay); the change-order form (reason
    the patient reads, 1-20 lines of kind / description / quantity) and its emergency variant behind a confirmation; withdraw an undecided
    order with a reason and a confirmation. **Operations**: the milestone form on the Consultant's behalf (with the countersign hint) and
    the interim-bill form (checked case document, bill number, EGP to date, issued at). **Finance**: line pricing per order (every line,
    EGP unit price; step-up) and the interim-bill countersign after a confirmation (step-up). In treatment the Finance primary goes to this
    panel only for `PRICE_CHANGE_ORDER` / `EMERGENCY_CHANGE_ORDER_REVIEW` / `COUNTERSIGN_INTERIM_BILL`, and "Admission & money" leads
    only for its own work, so the page never shows two filled actions. The shared panel pieces (task disclosure, facts, money, document
    picker, confirm-then-act, form helpers) moved to `panel-parts.tsx`; `AdmissionPanel` uses them unchanged in behaviour.
  - **My Care**: a `treatmentStep` slot (`TREATMENT_STEPS` = `IN_TREATMENT`, `REVIEW_CHANGE_ORDER` in `admission-steps.ts`) renders
    `PatientTreatment` (reads `GET /patient/cases/{id}/treatment`): the calm timeline (one line per milestone, `CARE_UPDATE` as "Care
    update: your Consultant will talk it through with you", "reported by the care team" for `CARE_TEAM`, the planned discharge date) and
    the decided changes ("Done in an emergency", "Price to follow" until priced). On `REVIEW_CHANGE_ORDER` (new step text) the change
    awaiting the patient comes first: the reason, the lines with EGP and the patient's currency per line, the added cost in EGP and "about
    … at the rate fixed on your quote", an optional note, then "Accept the change" (the step's one primary) and "Decline", each behind its
    own confirmation; `POST /patient/cases/{id}/change-orders/{orderId}/decision` with the portal's step-up replay; the answer is shown.
  - **Status link**: in the treatment phase the link reads `POST /public/cases/{token}/treatment` with the verified grant and shows the same
    timeline; when a change awaits the patient (and the coordinator is not asking for something) it is the page's story and its one action,
    decided with `POST /public/cases/{token}/change-orders/{id}/decision` on the grant (the one-time code is the fresh proof); "nothing is
    needed" and the My Care link are hidden then; refusals in the patient's words (`CHANGE_ORDER_NOT_AWAITING`, an ended session).
    `TreatmentStory` / `ChangeOrderDecision` are shared by both surfaces.
  - **Control Center**: the margin-policy form carries "Change-order band (% of the package)" and "Change-order band cap (EGP)", prefilled
    from the active version (10% / EGP 15,000 when none), sent as `changeOrderBandRate` / `changeOrderBandEgp`, listed and stated in the
    confirmation (inline en/ar, as the rest of that screen).
  - **Copy** (en + ar; **Arabic is a draft** pending native review): `portalWork.workTitles`, `workCopy.items` and `currentAction.work` for
    the six work types; `workCopy.items` for `CHANGE_ORDER_ACCEPTED`, `CHANGE_ORDER_REJECTED`, `TREATMENT_COMPLICATION`; waiting reason
    `CHANGE_ORDER_DECISION`; current actions `RECORD_MILESTONE` (state + button) and `REVIEW_CHANGE_ORDER` (`myCare.steps`); the panel
    (`portalWork.treatment`), the patient block (`myCare.treatment`), the ten evidence kinds on the admission trail; and a new
    `portalWork.errorCodes` (the 17 treatment codes + `CHANGE_ORDER_BAND_INVALID`), which the portal now shows in the viewer's language
    in place of the backend's English message (other codes unchanged).
  - Tests: new `TreatmentPanel.test.tsx` (9: Consultant countersign as the one primary after a confirmation, milestone per-kind fields and
    the operative-note check, change order with lines + emergency after a confirmation, withdraw; Finance money as returned + pricing,
    interim-bill countersign; Operations on-behalf milestone + interim bill from a checked document; read-only coordinator; Arabic and no
    primary without Finance's own work), `PatientTreatment.test.tsx` (4, through `MyCare`: accept, decline with note, timeline, Arabic),
    +3 `CaseStatusAccess` (decide on the grant, not-awaiting refusal, timeline only), +1 `StaffOperationalUi` (current-action words
    en/ar), +1 and 2 updated `PageHeaders` (band fields). Playwright `e2e/my-care-change-order.spec.ts` (4: en/ar × 390/1440, one primary,
    amounts as returned, no page scroll, the decision sent after the confirmation and read back) via the new `treatment` option of
    `patient-fixture.ts`, green on a dev server together with `my-care-admission.spec.ts` (10/10). `pnpm typecheck` clean, eslint clean on
    touched files, vitest 81 files / 635 tests green. Reviewed with react-best-practices, composition-patterns, web-design-guidelines and
    Impeccable (detector: no findings; fixes: one filled action across the two panels in treatment, `autocomplete="off"` on line
    descriptions, hoisted number format, generated heading ids, no glyphs standing in for icons).
  - Not done (later or owner): the final UX design of these screens (UX plan); no assisted (coordinator-recorded) change-order decision
    (backend has none); the status link still has no patient-safe step code of its own (`PublicCaseStatus`); staff panel not walked live —
    needs the dev stack rebuilt at V100 with this frontend; Meta approval of `rs_treatment_update` / `rs_change_order_review`.
  - Next exact action: owner fast-forwards `feat/review-p0` to `claude/p1-16-s2-ui-aca50e` (it contains `b8dcf2d`), rebuilds backend and
    frontend, and walks one case live (Operations milestone → Consultant countersign → change order → Finance price above the band →
    patient accepts in My Care); then P1-17 (discharge pack, reconciliation and statements), started in a new session.

### P1-17  Discharge pack, reconciliation and statements  (design §5 stage 5, §6; architecture §5.4–5.5)
- `DischargeService` pack completeness (summary, medication list, operative note, implant record, fit-to-fly with the
  72-hour rule D-F, follow-up plan), typed uploads, handover letter generated EN/AR; departure gated on fit-to-fly;
  final invoice; new module `settlement`: `ReconciliationService` (variance codes, unapproved extras never charged,
  dispute path, manager countersign above band, credits → refunds) and `StatementService` (`DISCHARGE` statement,
  immutable PDF, e-invoice reference slot); `DISCHARGED` entry blockers.
- Files: new services and module; `V98__reconciliation_and_statements.sql`; `JourneyService.upsertTravel` return
  gate; Finance reconciliation workbench (two-column invoice vs quote); patient "Going home" block; templates
  `rs_discharge_pack_ready`, `rs_statement_ready`.
- Sessions: 2. Model: Fable 5.1, high. Needs: P1-12's settlement statement for the payout leg (the reconciliation
  itself does not).
- **Status (2026-10-16, session 1 of 2 = backend, Opus 5.5 stood in for Fable 5.1; committed on `claude/p1-17-s1-discharge`, cut from
  `98958c3` = `claude/p1-16-s2-ui-aca50e`):** delivered; no screen. Flyway **V101** (`V101__discharge_reconciliation_and_statements.sql`; the
  `V98` name above was stale) is now the newest; V102 is the next free.
  - Decision recorded (owner's standing rule: decide by the recommendation, do not ask): **D-F applied as recommended**: a fit-to-fly is
    valid for a flight that leaves after the examination and within 72 hours of it (`commercial_policies.fit_to_fly_hours`, 24-168, Finance
    Managers change it per care area; left out it carries over); Operations cannot confirm a return flight without one (a ground return
    needs none). Further choices made here, each the design's best-practice reading: fit to fly is a pack item owed **before the return
    flight, not before discharge** (patients often fly days after discharge, outside any 72-hour window from it); the **discharge summary
    is the Consultant's discharge decision** (no separate "discharge ready" flag; the treatment episode's completion only triggers the
    check); the follow-up plan is made **before** discharge (the pack's last item) and the case moves `DISCHARGED -> FOLLOW_UP` (or closes
    with no follow-up) only once the final invoice is **reconciled** (closed, or closed with a facility dispute recorded), so the patient
    sees "Going home" until their statement is issued; the final invoice need only be **recorded** for discharge (Finance countersigns it
    when it opens the reconciliation: money never holds a patient in hospital); statements and the handover letter are **immutable
    structured records** the portal renders and prints (no PDF library resolves offline; architecture open point 1). The P1-15 money rule
    (deposit covers the fee first) is untouched and still awaits the owner.
  - Delivered: **(1) Discharge pack** (`DischargeService`, journey): the Consultant records the discharge summary (diagnosis, procedures,
    pending results, warning signs), the medication list (name, dose, frequency, duration), the operative note (the completed-procedure
    milestone's document also counts), the implant record (required when implants are on that milestone or a counted change-order line)
    and fit to fly (examination time), each a **typed clean document** (the `case_evidence` row is the type; `medical_documents` has no
    type) with its facts encrypted; recording a kind again corrects it. A planned discharge (P1-16 milestone) opens `DISCHARGE_PACK`
    (Consultant) and `RECORD_FINAL_INVOICE` (Operations), due 18:00 Cairo on that day. **Handover letter**: generated EN and AR from the
    pack (summary, medicines, implants, operative-note reference, pending results, warning signs, follow-up date and mode, facility and
    dates, patient and case), an encrypted `HANDOVER_LETTER` row; generating again replaces it. **(2) The discharge gate**
    (`DischargeReadiness`, read by `CaseTransitionPolicy`): `DISCHARGED` needs P1-16's TREATMENT checklist complete, the summary, the
    medication list, the operative note (after a completed procedure), the implant record (when implants were used), the follow-up plan
    and the final invoice recorded (codes `TREATMENT_CHECKLIST_INCOMPLETE`, `*_MISSING`); the move is automatic on any change of that
    evidence (`CaseEvents.DischargeEvidenceChanged`: a pack item, the plan, the invoice, a countersigned milestone or interim bill, a
    settled change order, the episode's completion); the coordinator's generic transition never discharges. Leaving `DISCHARGED` (follow-up
    or closed) needs the settled reconciliation (`SETTLEMENT_PENDING`). On discharge the patient gets `discharge-pack-ready`, the
    coordinator and Operations `PATIENT_DISCHARGED`. **(3) Final invoice, return, departure** (Operations, `ADMISSION_MANAGE`): the final
    invoice (clean document, number, EGP, issued at; corrections supersede until reconciled) opens Finance's `RECONCILE_INVOICE` (2 working
    days); the return travel (`FLIGHT` with a valid fit-to-fly, `GROUND`) and then the departure (`PATIENT_DEPARTED` to the coordinator).
    **(4) New module `settlement`**: `ReconciliationService` — Finance opens it (fresh sign-in; countersigns the invoice; authorised =
    voucher package + counted change orders; band = the case's D-E band), submits the invoice lines matched to `PACKAGE` / a counted
    `CHANGE_ORDER_LINE` / `NONE` with the amount the invoice shows the patient paid the hospital (at least the countersigned admission
    receipts); variance codes `WITHIN_BAND`, `CHANGE_ORDER`, `CREDIT` (billed below), `BILLING_ERROR` (billed above the price: the excess,
    or an unmatched mistake) and `UNAPPROVED_EXTRA`, the last two **never charged to the patient** (schema-enforced); a variance above the
    band waits for a Finance Manager (`COUNTERSIGN_RECONCILIATION`, 1 working day; approve or return; never the submitter); settling writes
    the `RECONCILIATION` ledger row (which ends Finance's open money on the case), issues the statement, opens `FACILITY_DISPUTE` (Finance
    Manager, 5 working days, survives exit; outcomes `FACILITY_WITHDREW` / `PLATFORM_ABSORBED`) when anything was not charged and
    `REFUND_CREDIT` (Finance, 2 working days, survives exit) when the patient paid more than charged. `StatementService` — the `DISCHARGE`
    statement (`RS-ST-<case>-<rev>`): package, change orders, medical charged (reconciled), platform fee, total; deposit paid, fee balance
    paid, paid at the hospital, refunded; balance due or credit due (schema-checked identities), EGP and the patient's currency at the
    voucher's frozen rate, encrypted lines; immutable, a correction is a new revision; the **e-invoice reference slot** set once by Finance
    (`STATEMENT_ISSUE`, fresh sign-in); the patient gets `statement-ready`. **(5) Access**: permissions `DISCHARGE_RECORD` (Consultant),
    `RECONCILE` (Finance, step-up), `RECONCILE_COUNTERSIGN` (Finance Manager @ platform, step-up), `SETTLEMENT_READ` (Finance, Finance
    Manager, the case's coordinator and Operations), `STATEMENT_ISSUE` (Finance @ platform, step-up); `CASE_MONEY_OPEN` also covers a
    recorded final invoice until it is reconciled. `SettlementBasis` is the journey's one door for the settlement module (no cycle).
    **(6) Patient and staff states**: patient `GOING_HOME` in `DISCHARGED`; Consultant `COMPLETE_DISCHARGE_PACK`; Operations
    `RECORD_FINAL_INVOICE`, `CONFIRM_RETURN`, `CONFIRM_DEPARTURE`. **API**: journey `DischargeController` — `GET .../{operations|finance|
    coordinator|doctor}/cases/{id}/discharge`; `POST /doctor/cases/{id}/discharge/pack`, `/doctor/cases/{id}/discharge/handover-letter`;
    `POST /operations/cases/{id}/discharge/{final-invoice|return|departure}`; patient `GET /patient/cases/{id}/discharge`, link `POST
    /public/cases/{token}/discharge`; the existing `POST /doctor/cases/{id}/follow-ups` now also in treatment. Settlement
    `SettlementController` — `GET .../{finance|coordinator|operations}/cases/{id}/reconciliation`; `POST /finance/cases/{id}/reconciliation`
    (+ `/submit`, `/countersign`, `/dispute/resolve`), `/finance/cases/{id}/statements/{statementId}/e-invoice`; patient `GET
    /patient/cases/{id}/statements`, link `POST /public/cases/{token}/statements`. Control Center: `fitToFlyHours` on the commercial policy.
  - Tests and numbers: new `DischargeServiceTest` (5: the gate waits for the pack, the plan and the invoice then tells the patient, with
    the typed-document and encryption checks and Finance's non-clinical read; fit-to-fly window on a return flight incl. the policy's 96
    hours and the departure; a ground return; the EN/AR handover letter and "Going home"; an uncountersigned interim bill holding
    discharge until Finance countersigns) and `SettlementServiceTest` (4: an invoice at the quoted price closes, issues the statement and
    starts follow-up, with the e-invoice slot, the schema's totals check and the patient's lines; an unapproved extra never charged,
    disputed and refunded as a credit, the dispute settled by a Finance Manager; a variance above the band returned then approved; the
    submitter never countersigns), both on the shared `DischargeFixture`; `JourneyServiceIntegrationTest`'s four discharge and exit tests
    now write the pack evidence first (the gate is `DischargeServiceTest`'s); `NotificationOutboxProcessorTest` covers the two new patient
    messages. Backend `mvn -o -q test`: 933 tests, 3 skips (924 before, 9 new); green except 5 facility-package tests that fail only between 00:00 and 04:00 local time (+04: the tests take the machine's date, the services UTC/Cairo; pre-existing, untouched here, green with `-Duser.timezone=UTC`). `ArchitectureRulesTest` and `RolePolicyTest` green (JPA only, no native query, no
    module cycle). `PostgresJpaMappingTest` green on a disposable PostgreSQL 17 (V101 applied, Hibernate validated, every repository query executed, the settlement repositories included). No frontend change.
  - Not done here (session 2 and later): **no screens or copy**: Consultant pack and letter, Operations invoice, return and departure, the
    Finance reconciliation workbench (two columns), statements and the e-invoice field, the Finance Manager's countersign and dispute, My
    Care "Going home" and the statement, the status link's equivalents, the Control Center fit-to-fly field; staff work copy for the six
    new work types. No PDF; no automatic invoice-line matching; `REFUND_CREDIT` is a work item (the refund is recorded with the existing
    deposit refund); no facility quarterly dispute counter or Compliance item (P1-19); no payout statement (P1-12); VAT stays inside the
    platform fee figure. Templates `rs_discharge_pack_ready`, `rs_statement_ready` need Meta approval.
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit (it contains `98958c3`) and rebuilds the dev backend for V101;
    then P1-17 session 2 (UI and copy, started in a new session; contract in the shared notes folder, `p1-17-session-1-handover.md`).
- **Status (2026-10-16, session 2 of 2 = UI and copy, Opus 5.5; committed on `claude/p1-17-s2-discharge-ui`, cut from `423bbae`):** delivered,
  frontend only (no wire gap blocked a screen). Amounts are shown exactly as the API returns them; the only sum in the browser is the
  "lines entered: X of Y" input help on the reconciliation form (whole cents; the backend still checks `INVOICE_LINES_MISMATCH`). The
  P1-15 money rule (deposit covers the platform fee first) is untouched and still awaits the owner.
  - **Staff "Discharge" panel** (`DischargePanel`, after "Treatment" on the case page for Operations, the coordinator and the Consultant
    while the case is `TREATMENT_IN_PROGRESS`, `DISCHARGED` or `FOLLOW_UP`, or for an open discharge item; reads
    `GET /{role}/cases/{id}/discharge`): what still blocks discharge, in words (the seven blocker codes), with "discharge happens on its
    own … there is no discharge button" instead of a button; the pack in the backend's order with each item's state (recorded / missing /
    not needed / before a return flight) and its facts (diagnosis, procedures, pending results, warning signs, medicines, implants, note;
    null for Finance), the fit to fly's examination time and "valid for a flight until"; the follow-up plan; the handover letter, English
    and Arabic side by side (`lang`/`dir` per version), each printable on its own page (a blank window written through the DOM, never as
    markup); the hospital's final invoice (number, EGP, issued, Finance's countersign); the return and the departure. Every command answers
    with the view. One primary action: the viewer's next one (`DISCHARGE_WORK`, `#discharge-next`). **Consultant**: the pack form (type,
    checked case document, and per type: diagnosis + warning signs with its plain-language hint + optional procedures and pending results;
    1-30 medicines of name / dose / how often / how long, "None" allowed; 1-20 implants of description / maker / lot; the examination time
    with "valid for a return flight within N hours" from `fitToFlyHours`; "recording this type again replaces the one on file"), opening on
    the first missing item on `COMPLETE_DISCHARGE_PACK` / `DISCHARGE_PACK`; the follow-up plan form (due, video/phone/in person, tests,
    instructions → `POST /doctor/cases/{id}/follow-ups`) while none is on file, leading once the pack is complete; generate / regenerate
    the letter. **Operations**: final invoice (record, or correct with `replaces` until the reconciliation is settled) leading on
    `RECORD_FINAL_INVOICE`; the return (flight or by land; for a flight "valid at departure: until …" from the fit to fly, or "the Consultant
    records it first"; departure, booking reference) leading on `CONFIRM_RETURN`; the departure once the return is confirmed, leading on
    `CONFIRM_DEPARTURE`. The coordinator reads only.
  - **Finance reconciliation workbench** (`ReconciliationPanel`, for Finance, the coordinator and Operations once `DISCHARGED` /
    `FOLLOW_UP`, and for Finance on any settlement item (`SETTLEMENT_WORK`, incl. an invoice recorded during treatment and Finance Manager
    items that survive the exit); reads `GET /{role}/cases/{id}/reconciliation`): status badge, the final invoice line, two columns —
    "What was authorised" (package with its voucher number, each counted change-order line) and "The hospital's invoice" (submitted lines
    with invoiced / authorised / charged and the variance code as a badge); the figures as returned (authorised, charged, variance,
    billed-not-charged, paid at the hospital, band limit, "above the band: a Finance Manager approves it") and the trail (opened /
    submitted / countersigned / settled). **Finance**: "Open the reconciliation" (countersigns the invoice; again after a corrected
    invoice) and the line form (description, signed EGP amount, "authorised by" = the package / a change-order line / nothing with
    unapproved extra or billing error; add/remove up to 100; paid at the hospital with its receipts hint; note), leading on
    `RECONCILE_INVOICE`; the credit reminder; the e-invoice reference on the current statement (once). **Finance Manager**: approve (after a
    confirmation) or return with what to correct, from `COUNTERSIGN_RECONCILIATION`; settle the dispute (hospital withdrew / platform
    absorbed + note) from `FACILITY_DISPUTE`; other viewers read "a Finance Manager approves / settles it". Every command is step-up
    through the portal's re-sign-in and replay, and each form says so. Statements: every revision with current/replaced and the shared
    `StatementSheet`.
  - **My Care**: a `dischargeStep` slot (`DISCHARGE_STEPS` = `GOING_HOME`, `FOLLOW_UP`) renders `PatientGoingHome` (reads
    `GET /patient/cases/{id}/discharge` and `/statements` in parallel): the warning signs first ("Get medical help at once if"), the
    medicines, the follow-up ("By video on …"), the journey home, the pack documents with their file names and a link to Documents, the
    letter for the home doctor (EN/AR, print), then the statement (lines with kind and the invoice's description, EGP and the patient's
    currency per line, total charged, balance due or credit due or "nothing is owed either way") or "your statement is ready once the
    hospital's final invoice has been checked". New step text `GOING_HOME`; no primary action on the step (nothing to do).
  - **Status link**: in the `followup` phase (DISCHARGED / FOLLOW_UP) the link reads `POST /public/cases/{token}/discharge` and
    `/statements` on the verified grant (each failing alone hides only itself) and shows "Going home" and the statement (`GoingHomeStory`,
    `StatementSheet`, shared with My Care; the page passes `dischargeCopy`).
  - **Control Center**: "Fit-to-fly window (hours)" (24-168, prefilled from the active version, 72 when none) on the margin-policy form,
    sent as `fitToFlyHours`, listed on the version and stated in the confirmation (inline en/ar, as the rest of that screen).
  - **Copy** (en + ar; **Arabic is a draft** pending native review): `portalWork.discharge`, `portalWork.reconciliation`,
    `portalWork.statement`, `myCare.goingHome`, `myCare.steps.GOING_HOME`; the six work types in `workTitles`, `workCopy.items` and
    `currentAction.work`; `workCopy.items` for `PATIENT_DISCHARGED` / `PATIENT_DEPARTED`; current actions `COMPLETE_DISCHARGE_PACK`,
    `RECORD_FINAL_INVOICE`, `CONFIRM_RETURN`, `CONFIRM_DEPARTURE` (button + state); the ten evidence kinds on the trail; 32 error codes in
    `portalWork.errorCodes` (the hand-over's list; `BILLED_IN_FUTURE` and `SELF_COUNTERSIGN_REFUSED` were already there), shown in the
    viewer's language by the portal.
  - Tests: new `DischargePanel.test.tsx` (8: blockers instead of a button and the pack states; pack form opening on the missing medication
    list with medicine rows; fit to fly's window; follow-up plan and the bilingual letter with print; Operations invoice as the one primary;
    return by land without a fit to fly and no departure before a return; departure in Arabic; read-only coordinator),
    `ReconciliationPanel.test.tsx` (6: open after a step-up confirmation; three lines matched to package / change-order line / nothing and
    submitted; variance codes and waiting for a Finance Manager; approve and return; dispute settled + statement + credit + e-invoice;
    read-only Operations), `PatientGoingHome.test.tsx` (3, through `MyCare`: going home without an action, the statement in EGP and USD,
    Arabic), +1 `CaseStatusAccess` (going home + statement on the grant), `PageHeaders` (fit-to-fly prefilled, listed and sent; four
    bodies updated). Playwright `e2e/my-care-going-home.spec.ts` (6: en/ar × 390/1440 in follow-up with warning signs, medicines and the
    statement as returned, no primary, no page scroll; en/ar going home before the statement) via the new `discharge` option of
    `patient-fixture.ts`, green on a dev server together with `my-care-change-order.spec.ts`. `pnpm typecheck` clean, eslint clean on
    touched files, vitest 84 files / 653 tests green (a pre-existing focus test in `CaseStatusAccess` failed once under the full
    parallel run and passed alone and on the re-run). Reviewed with react-best-practices, composition-patterns, web-design-guidelines and Impeccable (detector: no
    findings).
  - Not done (later or owner): the final UX design of these screens (UX plan); no PDF of the statement or letter (print only); no
    automatic invoice-line matching; pack documents download through My Care's Documents only if the patient documents endpoint lists
    staff-uploaded case documents (not checked live); the status link still has no patient-safe step code of its own; not walked live —
    needs the dev stack rebuilt at V101 with this frontend; Meta approval of `rs_discharge_pack_ready` / `rs_statement_ready`.
  - Next exact action: owner fast-forwards `feat/review-p0` to `claude/p1-17-s2-discharge-ui` (it contains `423bbae`), rebuilds backend and
    frontend, and walks one case live (discharge planned → Consultant pack + plan → Operations final invoice → automatic discharge →
    Finance opens, matches and submits → statement in My Care → Operations return and departure); then P1-18 (follow-up execution and
    outcomes), started in a new session.

### P1-18  Follow-up execution and outcomes  (design §5 stage 6; architecture §5.6)
- `FollowUpService`: scheduled contacts from the plan, `FOLLOW_UP_CONTACT` items and reminders, coordinator
  check-ins D3/D14/D30, outcomes at D30/D90 from My Care or a secure link (new OTP purpose `OUTCOME`), complication →
  incident + Consultant review + `REOPEN` (P1-13), 30-day window (D-G) closing the case, closure review request,
  `CLOSURE` statement.
- Files: new service; `V99__follow_up_contacts_and_outcomes.sql`; Consultant follow-up UI (also closes the P0-2
  follow-up gap); `MyCare.tsx` follow-up block and outcomes form; templates `rs_follow_up_reminder`,
  `rs_outcome_request`, `rs_closure_review`.
- Sessions: 1–2. Model: Opus 5.5 fast, medium; the outcome data classification reviewed by Fable (PDPL).
- **Status (2026-10-16, session 1 of 2 = backend, Opus 5.5; committed on `claude/goofy-neumann-7a404f`, cut from `7d2e78c` =
  `claude/p1-17-s2-discharge-ui`):** delivered; no screen. Flyway **V102** (`V102__follow_up_contacts_and_outcomes.sql`; the `V99` name
  above was stale) is now the newest; V103 is the next free. Two sessions: this one the backend, session 2 the UI and copy.
  - Decision recorded (owner's standing rule: decide by the recommendation, do not ask): **D-G applied as recommended**: 30 days of
    follow-up included (`commercial_policies.follow_up_free_days`, 7-90, Finance Managers change it per care area; left out it carries
    over; frozen on each case at discharge), counted from discharge; paid teleconsultation after it stays P2-25. Further choices made
    here, each the design's best-practice reading: the window **closes only when no reported complication waits for the Consultant**;
    the case then **closes on its own** (no button) once every follow-up contact is held, missed or cancelled, the check-ins that fall
    inside the window are recorded and no reopen review or rebooking is open; the **outcome questions are asked at day 30 and day 90
    whether or not the case has closed** (day 90 is after the window), each open 30 days; a complication on a closed case does not
    reopen it automatically — the Consultant or a manager reopens it with P1-13's reopen; check-ins are owed only inside the window,
    so a case reopened later owes none. The P1-15 money rule (deposit covers the fee first) is untouched and still awaits the owner.
  - Delivered (`FollowUpService`, `FollowUpReadiness`, journey): **(1) The window**: discharge (`CaseEvents.PatientDischarged`, from
    P1-17's move) opens `follow_up_windows` (discharged at, free days, ends at); the hourly sweep (`app.follow-up.scan-ms`, leased)
    writes `FOLLOW_UP_WINDOW_CLOSED` when it is over and then tries FOLLOW_UP -> CLOSED (`CaseExitService.closeAfterFollowUp`, exit
    reason `FOLLOW_UP_COMPLETED`, My Care's `COMPLETED`); the policy refuses the move otherwise (`FOLLOW_UP_NOT_COMPLETE`, blockers
    `FOLLOW_UP_WINDOW_OPEN`, `FOLLOW_UP_CONTACT_OPEN`, `CHECK_IN_OPEN`, `COMPLICATION_UNDER_REVIEW`, `FOLLOW_UP_REVIEW_OPEN`).
    **(2) Contacts** (`follow_up_contacts`; Consultant, `FOLLOW_UP_RECORD`): the plan's first contact is scheduled at discharge (also
    for a plan recorded after it), then as the Consultant adds; held (note required) or missed with a `FOLLOW_UP_CONTACT` ledger row, or
    cancelled with a reason; notes encrypted. One `FOLLOW_UP_CONTACT` item points at the next contact (due on its date); a missed one
    opens the coordinator's `REBOOK_FOLLOW_UP` (1 working day), closed by booking a new one; the patient is reminded once the day
    before (`follow-up-reminder`). **(3) Check-ins** (coordinator, `CHECK_IN_RECORD`): `CHECK_IN_D3/D14/D30` opened the day before
    their day, due 18:00 Cairo, recorded once as reached / not reached with a note (`CHECK_IN` ledger row, encrypted). **(4)
    Outcomes** (`case_outcomes`; patient or representative, `OUTCOME_REPORT`, no step-up): at day 30 and 90 the question is asked (a
    new secure link of purpose **`OUTCOME`**, 30 days, `outcome-request`; My Care `REPORT_OUTCOME`); pain, function, satisfaction
    0-10 and complication yes/no (+ what happened); answered once from My Care or the OUTCOME link only (`LINK_PURPOSE_MISMATCH` for
    another purpose). A complication opens an adverse-event incident (P1-13, HIGH, origin `OUTCOME_D30|D90`), the Consultant's
    `REVIEW_COMPLICATION` (4 working hours, survives exit) and tells the coordinators (`COMPLICATION_REPORTED`); the review (note)
    lets the window close. **(5) Closure**: `CaseEvents.CaseClosed` (here or "no follow-up needed") sends `closure-review` once per
    case, and the settlement module issues the **`CLOSURE` statement** (`RS-SC-<case>-<rev>`, `StatementService`; the same account with
    refunds since discharge; a new revision only when the figures changed). **(6) PDPL** (review by a Fable 5.1 sub-agent, fixes
    applied): outcome rows are health data; scores and the flag plain on pseudonymous rows, all free text encrypted; readers
    `FOLLOW_UP_READ` = the case's Consultant (everything) and coordinator + lead (no clinical free text: contact notes, complication
    and review text are null for them), never Finance or Operations; the complication text also reaches the incident's manager and
    Compliance as the incident summary (stated in the code and architecture §12); each answer stores the purpose notice version it
    was given under (`OUTCOME_NOTICE_VERSION` = `outcome-notice-2026-10`, `OUTCOME_NOTICE_OUTDATED`) and who answered (the link's
    `answeredBy`: PATIENT or REPRESENTATIVE → `PATIENT_REPRESENTATIVE`); audit and logs carry point, channel and ids, never an answer.
    **API**: `FollowUpController` — `GET /{doctor|coordinator}/cases/{id}/follow-up`; `POST /doctor/cases/{id}/follow-up/contacts`
    (+ `/{contactId}`, `/{contactId}/cancel`), `/doctor/cases/{id}/follow-up/outcomes/{point}/review`;
    `POST /coordinator/cases/{id}/follow-up/check-ins/{point}`; patient `GET /patient/cases/{id}/follow-up`,
    `POST /patient/cases/{id}/follow-up/outcomes/{point}`; links `POST /public/cases/{token}/follow-up`, `/public/cases/{token}/outcomes/{point}`.
    Control Center: `followUpFreeDays` on the commercial policy (`FOLLOW_UP_WINDOW_INVALID`). Templates `follow-up-reminder`,
    `outcome-request`, `closure-review` (EN/AR, bound to `rs_follow_up_reminder`, `rs_outcome_request`, `rs_closure_review`).
  - Tests and numbers: new `FollowUpServiceTest` (3: the schedule kept — reminder once, held, missed and rebooked, cancelled — the
    check-ins inside the window, the case closing on its own with the CLOSURE statement and the review request, the day-30 answer in
    My Care, day 90, an expired question, Operations refused the view; a complication on the OUTCOME link from a declared
    representative (encrypted text, no answer in audit, the coordinator sees the flag not the text) holding the window until the
    Consultant's review, then closing, reopened and closing again with no second statement or message; only the OUTCOME link answers),
    and the three templates in `NotificationOutboxProcessorTest` (+1 test). Backend `mvn -o -q test`: 937 tests, 3 skips (933 before, 4
    new); green except the 5 facility-package tests that fail only between 00:00 and 04:00 local time (pre-existing zone flake; they ran
    at 01:30 and are green with `-Duser.timezone=UTC`). `ArchitectureRulesTest` and `RolePolicyTest` green (JPA only, no native query,
    no module cycle: settlement listens to the journey's event). `PostgresJpaMappingTest` green on a disposable PostgreSQL 17 (V102
    applied, Hibernate validated, every repository query executed, the three new repositories included). No frontend change.
  - Not done here (session 2 and later): **no screens or copy**: the Consultant "Follow-up" panel (closes the P0-2 follow-up gap), the
    coordinator's check-ins, My Care's follow-up block, the outcomes form with the purpose notice (it sends `noticeVersion`), the
    status link's OUTCOME page, the Control Center "Free follow-up (days)" field, work copy for the six new work types. No reminder
    for an unanswered outcome question; the review request is a message only (where reviews are published is the owner's call);
    retention class for outcome and follow-up rows waits for P1-7 and counsel; the PDPC licence (D-I), breach procedure and DPO are
    the owner's; P1-19 must read outcome aggregates only and flag representative answers. Templates `rs_follow_up_reminder`,
    `rs_outcome_request`, `rs_closure_review` need Meta approval; the P1-16/P1-17 keys (`treatment-update`, `change-order-review`,
    `change-order-applied`, `discharge-pack-ready`, `statement-ready`) are still not bound in `application.yml` (pre-existing).
  - Next exact action: owner fast-forwards `feat/review-p0` to this commit (it contains `7d2e78c`) and rebuilds the dev backend for
    V102; then P1-18 session 2 (UI and copy, started in a new session; contract in the shared notes folder, `p1-18-session-1-handover.md`).

### P1-19  Hospital-agreement audit  (design §7; architecture §5.7)
- `consultant_affiliations` (yearly declaration, Compliance review, eligibility condition D-H, `UNDECLARED_FACILITY`
  flag at reservation); separate Consultant and hospital lines on the final quote (with P1-10); `ScorecardService`
  per Consultant and facility; `SamplingAuditService` monthly samples; facility package suspension path after
  repeated unapproved extras; "Raise a concern" on My Care creating an incident visible to Compliance.
- Files: `clinic` affiliation service and Virtual Clinic page; new `compliance` module (read-only); Control Center
  Compliance screens; `V100__affiliations_and_audit_samples.sql`.
- Sessions: 1–2. Model: Opus 5.5 fast, medium; eligibility change reviewed by Fable.

### UI/UX work is planned separately (decided 2026-10-15)
- Every user-interface slice (the public-site trust pass, Consultant public profile rendering, signature moments,
  Arabic typography and copy, the staff keyboard flow, Finance and Control Center redesigns) lives in the UX plan:
  `docs/ux-redesign/PLAN.md`, tracked in `docs/ux-redesign/STATUS.md`, run through `/redesign-area` in its own
  worktree and branch, in parallel with this plan. This plan keeps backend, workflow and data work only; where a
  backend phase delivers a screen, it delivers the minimum working UI and the UX plan designs the final one.

---

## P2 — Medium (first quarter after launch)

| ID | Slice | Sessions | Model |
|---|---|---|---|
| P2-15 | `market`/`destination` column with default `EG` on catalogue, policies, facility, base currency, readiness (C-01) | 1 | Fable high |
| P2-16 | S11 returning patient → same coordinator; patient-level primary coordinator (A-09) | 1 | Opus fast |
| P2-17 | Care-area change reason and "Reviewed by" (A-12); second-opinion visibility (A-11) | 1 | Opus fast |
| P2-18 | R1 travel items with companions and per-traveller documents (A-13, §2.7) | 3 | Fable high |
| P2-19 | Stage-weighted capacity; full-cover mode for leave (A-14) | 1 | Opus fast |
| P2-20 | Signature moments (D-04) — **moved to the UX plan** (areas 1 and 2); only the events they need stay here (P1-15…P1-18) | — | — |
| P2-21 | Arabic-first copy pass and type scale (D-05) — **moved to the UX plan** (cross-cutting); the native review stays a launch gate | — | — |
| P2-22 | Staff keyboard flow and one-next-action strip (D-06) — **moved to the UX plan** (area 2); bilingual reply templates stay here (backend data) | 0.5 | Opus fast |
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

## Remaining work (as of 2026-10-14, after P1-8 session 1; re-prioritised with the post-deposit design and the UX review)

Delivered on `feat/review-p0` (pushed at `e68dbc5`, local beyond that; dev stack at V94): P0-1, P0-2, P0-3, P0-4 (re-scoped),
P0-5, P1-6, and P1-8 sessions 1 and 2 (meters, internal metrics port, alert rules; `5919bf1`; scheduler lease V95, Prometheus
registry, Prometheus + Grafana, rules file, dashboard on `claude/p1-8-lease-5e9409`) and its verification (`df40908`). P1-10 session 1
(fee line, no-surprise cap, cooling period, validity, FX band; V96, `b4ab584`) and session 2 (patient and Finance UI, copy; `claude/p1-10-s2-ui-bf8b61`)
are done. P1-13 sessions 1 (backend: age band, guardians, incidents, reopen; V97; `76d6289`) and 2 (UI and copy; `claude/upbeat-snyder-df6742`) are done. Everything below is still to do.

**Why the order changed.** The owner's two priorities are (1) a complete, auditable journey after the deposit —
today nothing collects, proves or reconciles money after the 15%, and the Consultant's hospital deal is invisible —
and (2) a patient site that earns trust at the first visit. The post-deposit phases (P1-15…P1-19) need the fee
restructuring (P1-10, legal) and the incidents model (P1-13) first; all user-interface work is planned separately in
`docs/ux-redesign/PLAN.md` and runs in parallel in its own worktree. `JourneyService` is split (P1-11) only after the
journey code is final, and retention (P1-7) and the DR drill (P1-9) stay launch blockers that do not shape the product.

### Phases still to run (recommended order)

| # | Phase | Sessions | Model | Before it starts |
|---|---|---|---|---|
| 1 | P1-8 Metrics, alerts, scheduler leadership | done: sessions 1, 2 and the verification (2026-10-15, one fix) | Fable 5.1, high | Owner fast-forwards `feat/review-p0` to the session-2 result and rebuilds the dev stack (V95); verify the lease (18 leased jobs, 3 claim-based workers) and the row-lock claiming |
| 2 | ~~P1-10 Commercial truth + fee restructuring~~ (D-A) | **done**: sessions 1 and 2 (2026-10-15) | Fable 5.1 high, then Sonnet 5.5 | Owner fast-forwards `feat/review-p0` to the session-2 commit, rebuilds the frontend and walks the flow; counsel on the guarantee wording and the fee's VAT rate; native Arabic review |
| — | UI/UX (all areas) | own plan | see `docs/ux-redesign/PLAN.md` | Runs in parallel in its own worktree; Finance and Operations areas wait for P1-15 / P1-17 |
| 3 | ~~P1-13 Minors, guardians, incidents, reopen~~ | **done**: sessions 1 (backend) and 2 (UI, copy), 2026-10-15 | Opus 5.5; guardian consent reviewed by Fable | Owner fast-forwards `feat/review-p0` to the session-2 commit and rebuilds backend and frontend; counsel on the guardian consent, native Arabic review; My Care upload for guardian evidence done on `claude/guardian-upload` |
| 5 | **P1-15 Admission, voucher, balance, `ADMISSION_READY`** | 2 | Fable 5.1, high | D-B, D-C, D-D decided; P1-10 merged |
| 6 | **P1-16 Treatment evidence: milestones, change orders** | 2 | Fable 5.1 high; forms by Opus | D-E band; P1-13 |
| 7 | P1-12 Payouts, payer organisations, partners | 3 | Opus 5.5; settlement maths by Fable | Owner: payer terms, partner commission |
| 8 | **P1-17 Discharge pack, reconciliation, statements** | 2 | Fable 5.1, high | D-F; P1-12 settlement statement |
| 9 | **P1-18 Follow-up execution and outcomes** | 1–2 | Opus 5.5; data classification by Fable | D-G; P1-13 |
| 10 | **P1-19 Hospital-agreement audit** | 1–2 | Opus 5.5; eligibility change by Fable | D-H |
| 11 | P1-7 Retention, purge, erasure, draft clean-up | 2 | Fable 5.1, high | Decide retention of plaintext WhatsApp sender digits; evidence and statements as `LEGAL_RECORD` class |
| 12 | P1-11 Split `JourneyService` | 2 | Fable 5.1, xhigh | After P1-18, so the extracted code is final |
| 13 | ~~P1-9 Backups and restore drill~~ | **done**: 1 session (2026-10-15); local drill PASS in 135 s | Opus 5.5 | Production drill on the chosen host (managed PITR restore time, region failover) adds its row to `docs/deployment.md` before real patient data |
| 14 | P1-14 Consultant public profiles (data and endpoint) | 1 | Opus 5.5 | The page is UX plan area 1b; photographs with consent |
| 15 | P2-24 Refund rules enforced | 1 | Fable high | Moves up from P2: the point of no return (P1-15) and the 10-day rule need enforcement before the first paying patient |
| 16 | P2-15 … P2-26 (rest) | about 19 | per the P2 table | P2-15 needs the second-destination timing decision |
| 17 | P3 backlog | one each | Sonnet or Opus | — |

Decision D-I (PDPL licence application; liability-fund subscription as a Consultant credential) is not a phase: start
the licence now; the credential type is a one-line addition in P1-19.

### Owner decisions still open

- [x] D-A (fee restructuring): yes, before launch (owner, 2026-10-15); see the P1-10 entry.
- [x] D-B (voucher model): yes (owner, 2026-10-15). Phase 1: the patient pays the medical balance at the hospital cashier against an
      admission voucher the platform issues to the hospital (case, patient, package reference and price, inclusions, the deposit credit
      the platform will settle, the amount paid at the cashier, the frozen FX rate); the platform never holds hospital money; the hospital
      returns the cashier receipt. Phase 2 (later): platform collection through a licensed PSP. Built in P1-15 session 1.
- [x] D-C (pay to admit): yes (owner, 2026-10-15). No treatment episode opens without balance evidence on file (hospital receipt now, PSP
      confirmation in phase 2); emergency override by the Consultant with a reason plus a Finance review task, as for consent. Built in P1-15
      session 1.
- [x] D-D (`ADMISSION_READY` macro state): **applied as recommended** (2026-10-15; the owner agreed to "both recommendations" D-B and D-C and
      asked to implement — D-D was not asked separately, so the owner may still object). Built in P1-15 session 1.
- [ ] P1-15: the voucher's money rule was applied as recommended (design §6 rule 1: the deposit covers the platform fee first, the rest is
      credited to the hospital, a fee the capped deposit did not cover is owed to the platform before admission); the owner confirms it, or
      chooses "the whole deposit is credited to the hospital and the fee is paid to the platform separately" (the architecture's first
      worked example). Counsel confirms the hospital voucher email's content (patient name and amounts to the hospital's contact).
- [x] D-E (change-order band): **applied as recommended** (2026-10-15, owner's standing rule to decide by the recommendation; P1-16
      session 1): the lower of 10% of the facility package and EGP 15,000, cumulative over the case's change orders; Finance alone within
      it, the patient (fresh sign-in or verified secure link) above it, emergency path with a Finance review. Finance Managers can change
      the rate and cap per care area. The owner may still object.
- [ ] D-F…D-H from `docs/post-deposit-journey-design.md` §12 (fit-to-fly window, free follow-up window, affiliations as eligibility).
- [ ] D-I: start the PDPL licence application and the Law 13/2025 liability-fund subscription (owner action).
- [x] P1-10: final-quote validity 14 days and FX band 3% (owner, 2026-10-15); guarantee wording ships as a placeholder.
- [ ] P1-10: counsel approves the guarantee wording and the VAT rate on the platform fee; owner decides whether the
      guarantee carries a refund when a patient declines a final quote above the preliminary maximum.
- [ ] P1-12: payer terms and partner commission.
- [ ] Consent for Consultant and coordinator photographs (UX plan area 1b; P1-14).
- [ ] P2-15: when a second destination is added.
- [ ] Legal review of the patient refund copy (F2); the refund rule itself is decided (P0-4).
- [ ] Whether a case cancelled for an unanswered information request gets a reopen path (P1-6; today the patient sends it again).
- [x] P1-8: one online fetch of `micrometer-registry-prometheus` and the Prometheus/Grafana images, approved by the owner (2026-10-14); fetched in P1-8 session 2 (1.15.8); images pulled (prom/prometheus:v3.5.0, grafana/grafana:12.1.0).

### Before production (from delivered phases)

- [ ] Submit the new WhatsApp templates to Meta for approval: `rs_patient_action_reminder`, `rs_information_request_closed` (P1-6), `rs_admission_voucher`, `rs_cleared_for_admission` (P1-15), and the deposit templates if not yet approved (P0-4).
- [ ] P1-15: every facility that admits patients has an admissions contact email (`facilities.contact_email`): the voucher is emailed there; without one nothing is sent and Operations hands it over.
- [ ] Set the real bank-transfer details (`PAYMENT_BANK_*`); the defaults are dummy values (DEP-3).
- [ ] Start every environment with `PII_INDEX_KEY` set before V86 runs (P0-1).
- [ ] Apply PITR and bucket versioning/replication on the chosen host (`scripts/dr/`), start the nightly realm export, and run the production restore drill; record its time in `docs/deployment.md` (P1-9).
- [ ] Native Arabic review of all new copy (P0-3, P0-5, P1-6 and earlier), as part of P2-21.

### Follow-ups carried from delivered phases

- [ ] P0-1: encrypt patient and submitter `email` with the blind-index pattern, after reviewing the Keycloak email-resolution paths.
- [ ] P0-2: tell the patient when a case expires (today only the coordinator is told); Consultant UI for "no follow-up needed" and follow-up plans.
- [ ] P0-3: set urgency inside the intake form; show the previous reason in the urgency dialog; sort and badge queue cards and the team queue by urgency; a Send my case unit test for the emergency notice.
- [ ] P0-4: vetted agent list for agent cash (comes with the partner entity in P1-12); card payments through the DEP-2 adapter.
- [ ] P0-5: notify Consultant Operations when an accreditation lapses; store accreditation evidence documents; stamp `Facility.updated_at` from the expiry job; a dev-seed facility in `LocalDemoDataSeeder`; facility name on the patient proposal; patient-facing travel view.
- [ ] P1-8: archive or acknowledge dead letters so the level can fall; tune the starting alert thresholds after a month of data; an Alertmanager route (page, ticket) for the Prometheus rules; fix the three facility tests' `LocalDate.now()` (local versus UTC date).
- [ ] P1-6: an identity-review work item, so its 2-day level becomes a due date and a patient window; deadlines on referral offers; the offer deadline on queue cards (`CaseQueue.tsx`); email the consultant when an offer expires; an availability penalty after repeated expiry; escalate to the Finance Manager on an SLA breach (A-04); a window in the status link's deposit phase while Finance checks a transfer.

## Order of sessions (recommended, revised 2026-10-14)

Done: 1. P0-1 → 2. P0-2 → 3. P0-3 → 4. P0-4 → 5. P0-5 → 6. P1-6.

Next: 7. P1-8 (metrics + ShedLock) → 8. P1-10 (commercial truth + fee restructuring) → 9. P1-13
(guardian/incidents) → 10. P1-15 (admission, voucher, balance) → 11. P1-16 (milestones, change orders) → 12. P1-12
(payouts/payer/partner) → 13. P1-17 (discharge, reconciliation, statements) → 14. P1-18 (follow-up, outcomes) →
15. P1-19 (hospital-agreement audit) → 16. P1-7 (retention) → 17. P1-11 (split) → 18. P1-9 (DR drill) → 19. P1-14
(profile data) → 20. P2-24 (refund enforcement) → P2 in table order. The UX plan runs beside this sequence in its
own worktree (`docs/ux-redesign/PLAN.md`); its Finance and Operations areas start after P1-15 and P1-17.

Owner decisions that gate a slice: D-A (P1-10, decided 2026-10-15), D-B/D-C/D-D (P1-15), D-E (P1-16), D-F (P1-17), D-G (P1-18), D-H
(P1-19), P1-12 (payer terms, partner commission), P2-15 (second destination timing).

Roughly 25 sessions for the rest of P1 (including the six new phases), 19 for P2.
