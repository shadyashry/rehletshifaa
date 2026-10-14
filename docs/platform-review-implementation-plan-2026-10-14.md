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

### P1-16  Treatment evidence: milestones and change orders  (design §5 stage 4; architecture §5.2–5.3)
- `TreatmentMilestoneService` (eight milestone kinds, Consultant or Operations-with-countersign, 24-working-hour
  `RECORD_MILESTONE` rotation, complication → incident); `ChangeOrderService` with the band settings on the
  commercial policy (D-E), Finance pricing, patient acceptance above the band (step-up, My Care and secure link),
  emergency path; interim bills; the patient's treatment timeline; staff evidence checklist per stage.
- Files: new services; `V97__change_orders.sql`; `CommercialPolicyService` band settings; Consultant portal forms;
  `MyCare.tsx` timeline; Finance pricing screen; templates `rs_treatment_update`, `rs_change_order_review`.
- Sessions: 2. Model: Fable 5.1, high (money and consent-adjacent); milestone forms by Opus 5.5. Needs: P1-13
  incidents (can be built in the same session order: P1-13 first).

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

### P1-18  Follow-up execution and outcomes  (design §5 stage 6; architecture §5.6)
- `FollowUpService`: scheduled contacts from the plan, `FOLLOW_UP_CONTACT` items and reminders, coordinator
  check-ins D3/D14/D30, outcomes at D30/D90 from My Care or a secure link (new OTP purpose `OUTCOME`), complication →
  incident + Consultant review + `REOPEN` (P1-13), 30-day window (D-G) closing the case, closure review request,
  `CLOSURE` statement.
- Files: new service; `V99__follow_up_contacts_and_outcomes.sql`; Consultant follow-up UI (also closes the P0-2
  follow-up gap); `MyCare.tsx` follow-up block and outcomes form; templates `rs_follow_up_reminder`,
  `rs_outcome_request`, `rs_closure_review`.
- Sessions: 1–2. Model: Opus 5.5 fast, medium; the outcome data classification reviewed by Fable (PDPL).

### P1-19  Hospital-agreement audit  (design §7; architecture §5.7)
- `consultant_affiliations` (yearly declaration, Compliance review, eligibility condition D-H, `UNDECLARED_FACILITY`
  flag at reservation); separate Consultant and hospital lines on the final quote (with P1-10); `ScorecardService`
  per Consultant and facility; `SamplingAuditService` monthly samples; facility package suspension path after
  repeated unapproved extras; "Raise a concern" on My Care creating an incident visible to Compliance.
- Files: `clinic` affiliation service and Virtual Clinic page; new `compliance` module (read-only); Control Center
  Compliance screens; `V100__affiliations_and_audit_samples.sql`.
- Sessions: 1–2. Model: Opus 5.5 fast, medium; eligibility change reviewed by Fable.

### P1-20  Public site trust pass  (UX review 2026-10-14)
- Source: `docs/ux-redesign/patient-site-review-2026-10-14.md` (critique 24/32 and the "dossier" direction). Runs
  through `/redesign-area` with shape plans and gates, in parallel with the backend phases (frontend only).
- Slices: (a) hero as the product artifact (dossier preview strip) with the photograph demoted, entrance animation
  robustness; (b) Consultant cards and profiles with photographs, "Credentials reviewed · current", where they
  practise, languages (joins P1-14); (c) Send my case opening: calm promise header with the reply window, emergency
  notice as a quiet disclosure, "what happens next" rail, resume by WhatsApp, camera-capture guidance on uploads;
  (d) home order and length (privacy before travel; care-area grid distilled); (e) confirmation page as the first
  stamped dossier page (joins P2-20); (f) Arabic-first typography and numerals (joins P2-21).
- Sessions: 3 (shape 0.5, build 2, polish 0.5). Model: Fable 5.1 high for shape and the hero; Opus 5.5 for the form
  and cards; Sonnet 5.5 for copy sweeps.

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

<<<<<<< HEAD
## Remaining work (as of 2026-10-14, after P1-6; re-prioritised with the post-deposit design and the UX review)

Delivered on `feat/review-p0` (pushed at `69329b8`; dev stack at V94): P0-1, P0-2, P0-3, P0-4 (re-scoped), P0-5,
P1-6, and the P1-8 kickoff prompt. Everything below is still to do.
=======
## Remaining work (as of 2026-10-14, after P1-8 session 1)

Delivered on `feat/review-p0` (local, not pushed; dev stack at V94): P0-1, P0-2, P0-3, P0-4 (re-scoped), P0-5, P1-6, P1-8 session 1 (meters, internal metrics port, alert rules).
Everything below is still to do, in the recommended order.
>>>>>>> 5919bf1

**Why the order changed.** The owner's two priorities are (1) a complete, auditable journey after the deposit —
today nothing collects, proves or reconciles money after the 15%, and the Consultant's hospital deal is invisible —
and (2) a patient site that earns trust at the first visit. The post-deposit phases (P1-15…P1-19) need the fee
restructuring (P1-10, legal) and the incidents model (P1-13) first; the UX pass (P1-20) is frontend-only and runs in
parallel. `JourneyService` is split (P1-11) only after the journey code is final, and retention (P1-7) and the DR
drill (P1-9) stay launch blockers that do not shape the product.

### Phases still to run (recommended order)

| # | Phase | Sessions | Model | Before it starts |
|---|---|---|---|---|
<<<<<<< HEAD
| 1 | P1-8 Metrics, alerts, scheduler leadership | 2 + 1 short | Opus 5.5, medium; ShedLock check Fable high | Prompt block written (`69329b8`); ShedLock now covers 19 `@Scheduled` jobs |
| 2 | **P1-10 Commercial truth + fee restructuring** (D-A) | 2 | Fable 5.1 high, then Sonnet 5.5 | Owner: D-A (platform fee line), guarantee wording, final-quote validity; counsel on the VAT rate of the fee |
| 3 | **P1-20 Public site trust pass** (parallel track) | 3 | Fable (shape, hero), Opus (form, cards), Sonnet (copy) | Owner reads the UX review; shape-plan gate |
| 4 | P1-13 Minors, guardians, incidents, reopen | 2 | Opus 5.5; guardian consent reviewed by Fable | — (P1-16 and P1-18 depend on it) |
| 5 | **P1-15 Admission, voucher, balance, `ADMISSION_READY`** | 2 | Fable 5.1, high | D-B, D-C, D-D decided; P1-10 merged |
| 6 | **P1-16 Treatment evidence: milestones, change orders** | 2 | Fable 5.1 high; forms by Opus | D-E band; P1-13 |
| 7 | P1-12 Payouts, payer organisations, partners | 3 | Opus 5.5; settlement maths by Fable | Owner: payer terms, partner commission |
| 8 | **P1-17 Discharge pack, reconciliation, statements** | 2 | Fable 5.1, high | D-F; P1-12 settlement statement |
| 9 | **P1-18 Follow-up execution and outcomes** | 1–2 | Opus 5.5; data classification by Fable | D-G; P1-13 |
| 10 | **P1-19 Hospital-agreement audit** | 1–2 | Opus 5.5; eligibility change by Fable | D-H |
| 11 | P1-7 Retention, purge, erasure, draft clean-up | 2 | Fable 5.1, high | Decide retention of plaintext WhatsApp sender digits; evidence and statements as `LEGAL_RECORD` class |
| 12 | P1-11 Split `JourneyService` | 2 | Fable 5.1, xhigh | After P1-18, so the extracted code is final |
| 13 | P1-9 Backups and restore drill | 1–2 | Opus 5.5, medium | — |
| 14 | P1-14 Consultant public profiles | 1 | Sonnet 5.5; Impeccable pass by Fable | Photographs with consent (P1-20 b) |
| 15 | P2-24 Refund rules enforced | 1 | Fable high | Moves up from P2: the point of no return (P1-15) and the 10-day rule need enforcement before the first paying patient |
| 16 | P2-15 … P2-26 (rest) | about 19 | per the P2 table | P2-15 needs the second-destination timing decision |
| 17 | P3 backlog | one each | Sonnet or Opus | — |

Decision D-I (PDPL licence application; liability-fund subscription as a Consultant credential) is not a phase: start
the licence now; the credential type is a one-line addition in P1-19.
=======
| 1 | P1-8 Metrics, alerts, scheduler leadership | session 1 done; session 2 + 1 short left | Opus 5.5, medium; lease check Fable high | Session 2: JPA lease table (V95, owner chose it over ShedLock, database clock) on the 17 sweep jobs, not the 5 claim-based workers; Grafana dashboard JSON; Prometheus registry and images only with the owner's OK |
| 2 | P1-7 Retention, purge, erasure, draft clean-up | 2 | Fable 5.1, high | Decide the retention of plaintext WhatsApp sender digits (carried from P0-1) |
| 3 | P1-10 Commercial truth on the proposal | 2 | Fable 5.1 high, then Sonnet 5.5 | Owner: guarantee wording and final-quote validity |
| 4 | P1-11 Split `JourneyService` | 2 | Fable 5.1, xhigh | After P1-10, so the extracted code is final |
| 5 | P1-12 Payouts, payer organisations, partners | 3 | Opus 5.5; settlement maths reviewed by Fable | Owner: payer terms and partner commission |
| 6 | P1-13 Minors, guardians, incidents, reopen | 2 | Opus 5.5; guardian consent reviewed by Fable | — |
| 7 | P1-9 Backups and restore drill | 1–2 | Opus 5.5, medium | — |
| 8 | P1-14 Consultant public profiles | 1 | Sonnet 5.5; Impeccable pass by Fable | — |
| 9 | P2-15 … P2-26 | about 20 | per the P2 table | P2-15 needs the second-destination timing decision |
| 10 | P3 backlog | one each | Sonnet or Opus | — |
>>>>>>> 5919bf1

### Owner decisions still open

- [ ] D-A…D-H from `docs/post-deposit-journey-design.md` §12 (fee restructuring, voucher model, pay to admit, new
      stage, change-order band, fit-to-fly window, free follow-up window, affiliations as eligibility).
- [ ] D-I: start the PDPL licence application and the Law 13/2025 liability-fund subscription (owner action).
- [ ] P1-10: guarantee wording on the proposal and final-quote validity; counsel: VAT rate on the platform fee.
- [ ] P1-12: payer terms and partner commission.
- [ ] P1-20: approve the "dossier" direction in the UX review before the shape plan; consent for Consultant photographs.
- [ ] P2-15: when a second destination is added.
- [ ] Legal review of the patient refund copy (F2); the refund rule itself is decided (P0-4).
- [ ] Whether a case cancelled for an unanswered information request gets a reopen path (P1-6; today the patient sends it again).
- [x] P1-8: one online fetch of `micrometer-registry-prometheus` and the Prometheus/Grafana images, approved by the owner (2026-10-14); the fetch itself runs in P1-8 session 2.

### Before production (from delivered phases)

- [ ] Submit the new WhatsApp templates to Meta for approval: `rs_patient_action_reminder`, `rs_information_request_closed` (P1-6), and the deposit templates if not yet approved (P0-4).
- [ ] Set the real bank-transfer details (`PAYMENT_BANK_*`); the defaults are dummy values (DEP-3).
- [ ] Start every environment with `PII_INDEX_KEY` set before V86 runs (P0-1).
- [ ] Native Arabic review of all new copy (P0-3, P0-5, P1-6 and earlier), as part of P2-21.

### Follow-ups carried from delivered phases

- [ ] P0-1: encrypt patient and submitter `email` with the blind-index pattern, after reviewing the Keycloak email-resolution paths.
- [ ] P0-2: tell the patient when a case expires (today only the coordinator is told); Consultant UI for "no follow-up needed" and follow-up plans.
- [ ] P0-3: set urgency inside the intake form; show the previous reason in the urgency dialog; sort and badge queue cards and the team queue by urgency; a Send my case unit test for the emergency notice.
- [ ] P0-4: vetted agent list for agent cash (comes with the partner entity in P1-12); card payments through the DEP-2 adapter.
- [ ] P0-5: notify Consultant Operations when an accreditation lapses; store accreditation evidence documents; stamp `Facility.updated_at` from the expiry job; a dev-seed facility in `LocalDemoDataSeeder`; facility name on the patient proposal; patient-facing travel view.
- [ ] P1-8: archive or acknowledge dead letters so the level can fall; tune the starting alert thresholds after a month of data.
- [ ] P1-6: an identity-review work item, so its 2-day level becomes a due date and a patient window; deadlines on referral offers; the offer deadline on queue cards (`CaseQueue.tsx`); email the consultant when an offer expires; an availability penalty after repeated expiry; escalate to the Finance Manager on an SLA breach (A-04); a window in the status link's deposit phase while Finance checks a transfer.

## Order of sessions (recommended, revised 2026-10-14)

Done: 1. P0-1 → 2. P0-2 → 3. P0-3 → 4. P0-4 → 5. P0-5 → 6. P1-6.

Next: 7. P1-8 (metrics + ShedLock) → 8. P1-10 (commercial truth + fee restructuring) → 9. P1-20 (public site trust
pass; parallel frontend track from here on) → 10. P1-13 (guardian/incidents) → 11. P1-15 (admission, voucher,
balance) → 12. P1-16 (milestones, change orders) → 13. P1-12 (payouts/payer/partner) → 14. P1-17 (discharge,
reconciliation, statements) → 15. P1-18 (follow-up, outcomes) → 16. P1-19 (hospital-agreement audit) → 17. P1-7
(retention) → 18. P1-11 (split) → 19. P1-9 (DR drill) → 20. P1-14 (profiles) → 21. P2-24 (refund enforcement) →
P2 in table order.

Owner decisions that gate a slice: D-A (P1-10), D-B/D-C/D-D (P1-15), D-E (P1-16), D-F (P1-17), D-G (P1-18), D-H
(P1-19), the UX direction (P1-20), P1-12 (payer terms, partner commission), P2-15 (second destination timing).

Roughly 25 sessions for the rest of P1 (including the six new phases), 19 for P2.
