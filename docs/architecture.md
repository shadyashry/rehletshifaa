# Architecture

## Components

- **Web:** Next.js App Router renders localized marketing, intake, and role portals. Browser OIDC Authorization Code + PKCE supplies short-lived access tokens; tokens use session storage rather than persistent local storage.
- **API:** A Spring Boot modular monolith owns validation, state transitions, upload authorization, notification orchestration, and operational controls.
- **Database:** PostgreSQL stores cases and document metadata. Flyway is the only schema-change mechanism.
- **Identity:** Keycloak-compatible OIDC tokens map approved realm roles into Spring Security authorities. API services additionally enforce patient ownership or active case assignment. The Keycloak-hosted login/registration/reset/OTP pages use the branded `rehletshifaa` login theme (`infrastructure/keycloak/themes`) — bilingual EN/AR with RTL; the portal passes `ui_locales` on sign-in. See [commercial-workflow-status.md](commercial-workflow-status.md#keycloak-custom-login-theme-done).
- **Object storage:** Medical files are private. The API issues short-lived presigned PUT URLs, enforces quotas, quarantines and scans content, and issues audited short-lived GET URLs only for clean objects.
- **Notifications:** A transactional outbox retries SMTP and WhatsApp delivery with idempotency keys, exponential delay, and a terminal dead-letter state. Templates contain no clinical narrative.

## Commercial and payment subsystem

Pricing is EGP-based and computed only on the backend. Supporting services and tables were added additively in Flyway migrations `V9`–`V15` (never editing earlier scripts):

- **Consultant price catalog** (`PricingCatalogService`): per-consultant catalogs derived from care-area **service templates**; admin CRUD and CSV import; catalog-vs-manual price provenance drives the Finance gate.
- **Currency** (`CurrencyService`): daily EGP rates from a market provider cached in `fx_rates`, with a senior-Finance override; the rate is snapshotted and frozen on each released document.
- **Commercial policy** (`CommercialPolicyService`): a central, versioned, audited margin policy (default 12%) configured by senior Finance — never a per-case slider. The internal margin is baked into an inclusive patient package and never exposed to the patient.
- **Documents:** `proposal_versions.document_type` distinguishes an immutable `PRELIMINARY_ESTIMATE` from a `FINAL_TREATMENT_QUOTE`; items carry min/expected/max EGP ranges plus a provider base, and the version snapshots provider net, policy id/version, margin, and patient totals.
- **Deposits & payments** (`PaymentService`): `deposit_policies`, `deposits`, `deposit_components`, and an append-only `payment_events` ledger. Offline record-only: Finance records receipts/refunds with recent authentication, idempotent by key. Deposit state stays out of `medical_cases.status`.
- **Consent:** `consent_records` captures a doctor-owned `PROCEDURE_SPECIFIC` consent (or an audited emergency override) required before treatment; financial acceptance is never medical consent.

## Patient identity model

Several concepts are kept strictly distinct (see `end-to-end-workflows.md`). OTP possession is **not** identity:

- **Provisional patient profile** (`PROVISIONAL_PROFILE`) — created internally on submission; no account, no legal identity proofing.
- **Contact-verified secure access** (`CONTACT_VERIFIED`) — an OTP-protected, purpose-scoped, expiring proof that the patient controls one *registered* contact channel (`WHATSAPP_VERIFIED` → `phone_verified_at`, `EMAIL_VERIFIED` → `email_verified_at`). It proves contact possession only, never legal identity, and never changes case status.
- **Account activation** (`ACCOUNT_ACTIVATED`) — offered after a proposal is acknowledged/accepted; activation links the provisional profile and all its cases to the authenticated subject. Activation **only** links `external_subject` and consumes the one-time token — it never sets a contact-verification timestamp and is not identity verification.
- **Legal identity verification** (`IDENTITY_VERIFIED`) — a configured identity-proofing process for the patient or authorized representative (`patient_identity_verifications`, behind `IdentityVerificationPort`). Minimum-necessary data only; legal name/DOB encrypted, document reference masked, no biometrics stored.
- **Onboarding completion** (`ONBOARDING_COMPLETED`) — required profile/declarations/representative details and applicable consents complete (`patient_onboardings`, never folded into `medical_cases.status`).
- **Deposit satisfaction** (`DEPOSIT_SATISFIED`) — no deposit required, or PAID, or an authorized Finance waiver (`deposits.waived_at`).
- **Customer readiness** (`COORDINATION_READY`) — the single backend-computed `CustomerReadiness` DTO combining all applicable gates; enforced server-side before chargeable/non-cancellable coordination.

Purpose-scoped links (`case_access_links`, `proposal_share_tokens`), verification challenges (`case_access_challenges`, `proposal_access_challenges`), and activation tokens (`account_activations`) store only pepper-hashed secrets. Raw OTPs and link tokens are encrypted inside the notification outbox; the initial status token is also returned once to the submitting browser for the confirmation-page link.

### Canonical patient, contacts and accounts (V30)

`patient_profiles.id` is the **only** canonical patient identity. Email, WhatsApp/mobile, names and the Keycloak subject are attributes: they change, are shared within families, get mistyped, and often belong to a representative. Nothing is ever matched, merged, rejected or disclosed on the basis of an email/phone/name match alone.

| Concept | Where | Notes |
| --- | --- | --- |
| Patient | `patient_profiles` (`given_name`, `family_name`, `preferred_name`, `name_source`, `email`, `whatsapp_number`, `mobile_owner`) | Structured names; `full_name` is a display/legacy value, never authoritative. `mobile_owner` = PATIENT / REPRESENTATIVE / NULL (not yet clarified). |
| Case | `medical_cases.patient_id` | `medical_cases.full_name/whatsapp_number` are **snapshots** taken at intake; every case view renders the canonical name (`PatientNames.DISPLAY_SQL`). |
| Case submission contact | `case_submission_contacts` (one per case) | Who submitted and how to reach them: `contact_role` PATIENT or REPRESENTATIVE, name, relationship, email, WhatsApp. `CaseContactResolver` routes OTPs/links to the patient's own channel when present, else the submitter's; a code delivered to the submitter's channel never stamps the patient's `*_verified_at`. |
| Representative | `patient_representatives` | Existing delegation model (subject ↔ patient, relationship, permissions); portal queries already honour it. |
| Profile status | `profile_status` (PENDING/ACTIVE), `profile_completed_at` | Information completeness. Independent of payment and of the account. |
| Account status | `account_status` (NOT_PROVISIONED/SETUP_PENDING/ACTIVE), `external_subject` = Keycloak user id | Whether a usable sign-in exists. **Keycloak owns the credential**: `PatientIdentityPort` provisions the user with no password and the UPDATE_PASSWORD (+VERIFY_EMAIL) required actions; Keycloak's execute-actions email (branded `email` theme) is the only credential channel. The first authenticated portal entry (`POST /patient/account/session`) turns SETUP_PENDING into ACTIVE. |
| Existing-account resolution | `patient_account_link_requests` | An already-registered email used at intake or profile completion never creates a second Keycloak user or links anything. The address receives one neutral continuation link; the signed-in owner answers SAME_PATIENT (case joins their canonical patient — an explicit, audited merge via `merged_into_patient_id`), REPRESENTATIVE (delegation row, patient stays separate) or DECLINED. |

Journey: Send My Case (who is this for → given/family names → contact; email optional) → `Complete Profile` from the secure onboarding link (same patient row pre-filled; account email **mandatory**; mobile ownership explicit; case data read-only) → `PatientAccountService.ensureAccount` → Keycloak setup email → password created in Keycloak → redirect `/{lang}/portal?case=…&continue=1` → session registered → current case opened. A returning patient signs in and creates further cases with `POST /patient/cases` (same patient, no re-registration). `app.identity-admin.mode=simulator` (tests, unconfigured local runs) swaps the provider for an in-memory `LocalPatientIdentitySimulator`; production refuses to start on it.

**Legacy data (V30 migration behaviour):** rows created before structured names keep `full_name` as their display name with `name_source='LEGACY_FULL_NAME'` and `given_name/family_name` NULL — no string is ever split. The patient is asked to confirm the structured name on their next profile completion (`OnboardingPrefill.nameConfirmationRequired`). Existing bound profiles (`external_subject` set) are backfilled to `account_status='ACTIVE'`; every pre-existing number is treated as the patient's own (`mobile_owner='PATIENT'`) because that was the only intake option; cases without a `case_submission_contacts` row are read as submitted by the patient.

## Domain and state

A medical case is created as `DRAFT`, submitted as `RECEIVED`, and advances only through the explicit care state machine documented in `end-to-end-workflows.md`. A document moves through `PENDING → QUARANTINED → CLEAN`, or into a rejected/scan-failed terminal state. Database constraints enforce states, relationships, proposal versions, consent, and assignment history.

The public case number is generated by PostgreSQL as `RS-YYYY-NNNNNN`. Internal relationships use UUIDs. Object keys are independently randomized.

### Work, priority and staff notifications

Staff work lives in `case_tasks` (INTERNAL scope) and is opened only through `StaffWorkService.openWorkItem`, which is idempotent per case and type. Priority is never supplied by a caller: `StaffWorkService.derivePriority` reads it from real conditions (blocking work, or a due date within a day → HIGH; everything else NORMAL), so a new case or a fresh assignment is never "high" for being new. The queue's attention ranking and "High priority" chip are derived from those work items; the case itself carries no priority column.

Notifications follow the work, never the status change. Personally actionable work raises one in-app `staff_notifications` row and one work email, addressed by role: a consultant's item is looked up in `practitioner_profiles` and rendered with the `consultant-work-assigned` template, coordinator work in `staff_members` with `coordinator-work-assigned`; only coordinator work may fall back to the shared coordination mailbox (`app.mail.coordinator`), which is also where unowned work (a new case, a deposit on an unowned case) is announced by case reference. Every outbox row and notification carries an idempotency key, so a replayed event cannot send twice.

### The patient's current step (My Care)

`CaseActionService.resolve` answers the signed-in patient too: `currentAction` is a FOCUS only when the patient owes something (`PROVIDE_INFORMATION` for an open information request, `REVIEW_PROPOSAL` for a decidable version, `COMPLETE_PROFILE` / `VERIFY_IDENTITY` for a readiness step only they can finish), otherwise a WAIT naming whose move it is (`WAIT_COORDINATOR_REVIEW`, `WAIT_CONSULTANT_REVIEW`, `WAIT_PROPOSAL`, `WAIT_DEPOSIT_ARRANGEMENT`, `WAIT_COORDINATION`, `WAIT_TREATMENT`, `IN_TREATMENT`, `FOLLOW_UP`) or `NONE` for a closed case. The deposit is arranged offline by staff, so it is a WAIT and never a "pay" step; an online payment would be a new FOCUS code from the same resolver, which the page already reserves a slot for. `availableActions` carries `MESSAGE_COORDINATOR` when a coordinator owns the case. Patient views strip staff identity subjects (`CaseView.coordinatorSubject`/`doctorSubject` are null); people appear by name only.

`PatientAccountService.session()` names the current case: the one whose responsibility is on record with the patient (`waiting_on='PATIENT'`) first, else the most recently updated open case. `GET /patient/account/profile` returns the account facts for Profile & Security and nothing from any case. The portal lands a patient directly on that case (`MyCare`): case header, current step, journey (orientation only), proposal summary with one action, deposit summary from `DepositView` (proposal currency at its snapshot rate), coordinator with one message control; navigation is My Care · Documents · Messages, with Profile & Security under the account menu.

### Patient-visible proposal

`ProposalAccessService.state(caseId)` is the single rule for "which proposal may the patient see right now": it names only a RELEASED/VIEWED (decidable) or ACCEPTED version, describes drafts and internal-approval versions as "being prepared", and is consumed unchanged by the signed-in case page (`CaseWorkspace.patientProposal`) and the secure Check Case Status link (`PublicCaseStatus.proposal`). From a verified status session, `POST /public/cases/{token}/proposal-access` mints a share token for that exact version plus a view grant — the one-time code just verified on the same case's registered contact is the proof the proposal's own verification asks for, so no second code is requested. A foreign-currency proposal is released only with a snapshot FX rate (`fx_rate`, `fx_rate_date`, `fx_source`); every patient-facing line and total is that snapshot applied to the preserved EGP base, and a missing rate refuses the release rather than showing base-currency figures under a foreign label.

## Staff teams

Internal staff identities live in `staff_members`; lead membership lives in the additive
`staff_team_assignments` table. A staff subject can have one direct lead, and each assignment records
the function, assigning administrator, reason, and timestamps. The service enforces that both people
belong to the same function and that the selected manager has its `_LEAD` role. Multiple leads per
function are supported, with recursive report lookup for supervisory case visibility.

## Trust boundaries

The browser is untrusted. MIME type, size, consent, case status, Turnstile token, and upload completion are verified server-side. Presigned URLs grant access to one random object key for a short period and do not grant bucket-list or read access.

Anonymous access is restricted to case intake, presigned upload/confirmation, submission, and the purpose-scoped public status/proposal flows. Status and information-response links require link validity plus an OTP-derived short-lived grant; proposal detail and decisions require the equivalent proposal grant. Authenticated endpoints require role checks plus patient ownership, active delegation, or pending/active case assignment. Sensitive approvals require a recent OIDC authentication time (with token issue time as the standards-compatible fallback), and the web client initiates OIDC reauthentication when required. Audit events record identity, role, case, entity, action, outcome, reason, correlation, and time.

## Observability

Every request receives or propagates an `X-Correlation-ID`. Application logs are structured and avoid case narrative, contact details, filenames, and uploaded content. Only the liveness/readiness health endpoint is exposed by default.
