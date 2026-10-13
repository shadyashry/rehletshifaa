# RehletShifaa — QA & QC Master Test Protocol

_Internal testing reference · v1.1 · 2026-10-13 (aligned to `9a2304b`: database-owned roles, routed intake,
referrals, coordinator-recorded Arabic decisions, one readiness model, WhatsApp coordination)_

Everything a tester needs to exercise RehletShifaa (the international patient-care
coordination platform) end to end — from an anonymous inquiry through consultant review, a
preliminary estimate, onboarding, deposit and travel, to treatment and follow-up.

**How to use this:** read §1 first, then work the use cases in §6 in order against the test
matrix in §9. Run critical journeys in **both English and Arabic (RTL)**.

- Scope: web portal + secure links + APIs
- Languages: English & العربية (right-to-left)
- Destination of care: Egypt · Pricing base: EGP
- End-to-end use cases: 20 (coverage per case: [qa/e2e-coverage-matrix.md](qa/e2e-coverage-matrix.md))

---

## 1. What the system is

RehletShifaa **coordinates** care for international patients seeking specialist treatment in
Egypt. A patient can begin with only the medical information they already have; the platform
securely organizes the case, a credentialed **consultant** in the relevant specialty reviews
it, and the patient receives proposed next steps and an **initial (preliminary) cost
estimate**. The estimate may increase or decrease after an in-person clinical assessment. The
patient stays free to decide whether to proceed or travel, supported throughout by one
dedicated **coordinator**.

> **Core principle to test for.** The platform coordinates; it does **not** make clinical
> decisions. Final diagnosis, treatment selection, procedure-specific consent and final pricing
> all follow appropriate clinical assessment by the treating consultant — never the
> coordinator, and never the software.

**Moving parts you are testing**

| Part | Tech | Notes |
|---|---|---|
| Web portal | Next.js | Public pages, intake form, secure patient links, role-based portal. Bilingual EN/AR with full RTL. |
| Backend API | Spring Boot (`/api/v1`) | Enforces the case state machine, authorization, pricing, deposits, every business rule. The UI must never be the only enforcement. |
| Identity | Keycloak (OIDC) | Sign-in, MFA and step-up re-authentication only. Roles and authority live in the platform database (Control Center › Access), never in the token. Branded bilingual login theme. |
| WhatsApp coordination | Meta WhatsApp + outbox | Approved templates out; inbound messages filed to an intake conversation or the case's patient thread; one owner replies. |
| Secure delivery | Notification outbox | WhatsApp / email carrying OTP codes and secure links. **Locally these land in Mailpit** (see §8). |
| Documents | MinIO + virus scan | Reports upload via short-lived presigned links, scanned (quarantine → clean), never public. |
| Commercial engine | — | EGP pricing with a hidden coordination margin, conditional Finance/Operations approvals, deposits, preliminary vs. final documents. |

---

## 2. Roles & test accounts

Every read and write is authorized by **role + object relationship** (case ownership or assignment,
patient ownership, an in-force representative link, or a reporting line). Roles are granted in the platform
database (`authority/domain/Role.java`, Control Center › Access); Keycloak only authenticates, so a realm role
or token claim grants nothing. Testing a role means confirming it can do its own actions **and cannot** do anything
outside its lane.

**Leads are not a role.** A coordinator leads a team through a lead designation and manages people through a
reporting line (workforce hierarchy). A lead reads the cases of their own team only (no transitive depth) and can
reassign within it; supervision never replaces the ownership or assignment needed to do protected case work.

| Role | Workspace | Owns / does | Must NOT be able to |
|---|---|---|---|
| `PATIENT` | My Care | Submit a case; verify contact; view and decide on proposals; complete the profile; read own cases. | See another patient's case; see internal notes, provider cost, margin or Finance reasons. |
| `PATIENT_REPRESENTATIVE` | My Care | Act for a patient under an active, scoped, non-expired representative link. | Act after the link expires or is revoked; a payer-only person gets no clinical access. |
| `COORDINATOR` | Coordination | Own routed or claimed cases and intake conversations; classify care area; assign a consultant; confirm referrals; create and release proposals; record a patient's decision when the patient asks; reply to the patient (owner or active cover only). | Edit medical scope or price; record a payment; waive a deposit; declare identity verified; enter a patient's OTP; write on a patient thread they neither own nor cover. |
| `CARE_COORDINATION_MANAGER` | Coordination, Control Center | Routing and coordination setup; reassign cases and conversations anywhere in the function. | Same commercial and clinical prohibitions as a coordinator. |
| `CONSULTANT` | Consultant | Review assigned cases; clinical decision with cost estimates; refer (transfer / second opinion); final assessment; procedure consent; treatment and discharge; their virtual clinic. | Act without an active assignment; cancel a whole case; do clinical work on a second-opinion assignment. |
| `PRACTICE_MANAGER` | Virtual clinic | Schedule, public-profile drafts and service/price drafts for one consultant's clinic, per granted permission. | Reach any case, document, message or credential. |
| `OPERATIONS` | Operations | Travel/operational plan; confirm travel (non-cancellable) once readiness is met. | Confirm a non-cancellable booking before readiness; be assigned while the deposit is unsettled. |
| `FINANCE` | Finance | Approve manual/off-catalog pricing and final quotes; record deposit receipts and refunds; waive a deposit. | Act without recent authentication on sensitive money actions. |
| `PATIENT_IDENTITY_REVIEWER` | Identity review | Verify or reject patient legal-identity submissions. | Decide without recent authentication and a reason. |
| `CREDENTIAL_VERIFIER` | Credentialing | Verify practitioner credentials and capabilities. | Decide a credential they prepared (an independent reviewer is required); review *patient* identity. |
| `SYSTEM_ADMINISTRATOR` | Control Center | Workforce administration, access governance, identity operations, recertification. | Read or act on cases, clinical data, credentials or patient identity. |
| `COMPLIANCE_AUDITOR` | Control Center | Read audit and governance views. | Modify anything; read cases through a bypass. |
| `OPERATIONS_MANAGER`, `FINANCE_MANAGER`, `CREDENTIALING_MANAGER`, `CONSULTANT_OPERATIONS_MANAGER`, `SUPPORT_MANAGER` | Control Center | Configure their function (commercial and deposit policy for Finance). | Do the front-line work of another function. |
| `JOURNEY_MANAGER`, `JOURNEY_APPROVER` | Journey governance | Draft and approve Care Journey versions (maker/checker). | Approve their own draft. |
| `SUPPORT_AGENT` | Support | Support workspace. | Case, clinical or commercial actions. |

**Seeded local sign-ins** — at `/en/portal` → "Staff sign in". Passwords are for the local/test realm only.

| Username | Password | Platform roles and relationships |
|---|---|---|
| `patient` | `Patient123!` | PATIENT |
| `coordinator` | `Coordinator123!` | COORDINATOR; lead of "Coordination team"; manager of `coordinator2` |
| `coordinator2` | `Coordinator123!` | COORDINATOR; member of "Coordination team"; reports to `coordinator` |
| `doctor` | `Doctor123!` | CONSULTANT (Dr Ahmed Alashry, cardiology, verified) |
| `operations` | `Operations123!` | OPERATIONS |
| `finance` | `Finance123!` | FINANCE |
| `credential-admin` | `Admin123!` | CREDENTIAL_VERIFIER + SYSTEM_ADMINISTRATOR (MFA enrolled) |

**Seeded invited accounts** (no password, no MFA): `patient-identity-reviewer`, `care-manager`, `operations-manager`,
`finance-manager`, `credentialing-manager`, `consultant-operations-manager`, `support-manager`, `support-officer`,
`journey-manager`, `journey-approver`, `compliance-auditor`, plus `coordinator-scope` and `care-manager-scope` (a second
team, for scope-denial tests). Usernames match `<name>@local.test`. To use one, re-send its invitation from the Control
Center as `credential-admin` and finish password and MFA setup from the Mailpit link.

### Test data setup

**Baseline — created automatically.** `LocalDemoDataSeeder` (profile `local`) runs on every backend start and is
idempotent: the accounts and relationships above, the verified cardiology consultant (`doctor`), and the routing a
coordinator needs — "Coordination team" serves every care area in `en` and `ar`, routing policy v1 sends everything to
that team, and **only `coordinator`** is on duty with capacity 100 (`en`, `ar`). So every new case routes to
`coordinator`; that is deliberate, it keeps live journeys deterministic. Do not change the seeder for a scenario.
The seeder only adds what is missing, so a database already used for UAT keeps earlier changes (e.g. the dev database
has had `coordinator2` on duty with capacity 100 since a 2026-10-10 UAT preparation, so new cases are shared between
both coordinators). Check Control Center › Coordination before a run that depends on who receives a case.

**Per scenario — set, run, put back.** Anything beyond the baseline is part of the scenario: set it through the screen
named (which also tests that screen), run the case, then restore the baseline so the next scenario starts clean.

| Scenario | Setting it needs | Where | Signed in as | Restore |
|---|---|---|---|---|
| UC-03 B (case waits in the queue) | `coordinator` off duty, or at its case limit | Control Center › Coordination (teams and people) | `care-manager` | On duty, limit 100 |
| UC-13, UC-18, transfer target | `coordinator2` on duty with capacity | Control Center › Coordination (teams and people) | `care-manager` | Remove its capacity |
| UC-16, UC-20 (two teams) | Team B profile (care areas: orthopedics; `en`,`ar`); `coordinator-scope` on duty with capacity; routing policy mapping cardiology → Team A, orthopedics → Team B (publish a new policy version) | Control Center › Coordination (teams and people, routing policy); activate `coordinator-scope` and `care-manager-scope` first | `care-manager`; `credential-admin` for the activations | Publish the previous policy again (every area → Team A); remove `coordinator-scope` capacity |
| UC-15 (WhatsApp intake) | Intake switched on for `coordinator` ("Not set up yet" until then) + Meta test number | Control Center › Coordination (conversations) | `care-manager` | Intake off |
| UC-16 (one voice) | Shorter reply times / opening hours for the run; a cover for `coordinator` | Control Center › Coordination (conversations); cover on the coordinator's My work view | `care-manager`; `coordinator` or its lead | Defaults (Sat–Thu 10:00–20:00 Africa/Cairo, 30/60 min, 72 h); revoke the cover |
| UC-18 (coordinator leaves) | `coordinator2` owning cases/conversations, then disabled | Control Center › People | `credential-admin` | Re-enable; reassign its work back if needed |
| UC-08 B, UC-14, UC-19, manager screens | An invited account activated, or a role granted | Control Center › People / Access; Mailpit for the invitation | `credential-admin`, then the tester sets the password | Leave activated (no password is stored in the repo) |
| UC-05 (all four gate paths) | Travel package on the case; an off-catalog price on the estimate | During the case itself (intake / consultant review) | the journey's own actors | none |

**One-time prerequisite:** `care-manager` is only invited, and coordination setup needs the Care Coordination Manager
role, so activate `care-manager` (row "UC-08 B, UC-14, UC-19" above) before any coordination scenario.

Passwords for invited accounts are set by the person testing, from the Mailpit link; they are never committed or
shared in chat. A full reset (fresh dev database) brings back the baseline only.

---

## 3. The case lifecycle

The macro state machine is authoritative and lives only in `medical_cases.status`. A state can
only be reached through its allowed transition and, usually, a dedicated authorized operation —
not a free “move to any status” control. Confirm the UI offers **only** valid next steps.

**Happy path**

```
DRAFT → RECEIVED → INTAKE_REVIEW → READY_FOR_CONSULTANT → CONSULTANT_ASSIGNMENT_PENDING
→ CONSULTANT_REVIEW → CLINICAL_RECOMMENDATION_READY → PROPOSAL_PREPARATION
→ PROPOSAL_INTERNAL_APPROVAL → PATIENT_DECISION → ACCEPTED → TRAVEL_COORDINATION
→ ARRIVAL_CONFIRMED → TREATMENT_IN_PROGRESS → DISCHARGED → FOLLOW_UP → CLOSED
```

`RECEIVED → INTAKE_REVIEW` happens when routing assigns an eligible coordinator at submission, or when a
coordinator claims a case that routing left in the queue. Contact verification never moves it.

**Branches**

- `INFORMATION_REQUIRED` — during intake/review the patient can be asked for more; case
  returns to `INTAKE_REVIEW` after they respond via a secure link.
- `CLINICALLY_NOT_SUITABLE` — consultant outcome; the coordinator follows up (not a whole-case
  cancel by the consultant).
- **Referral** (transfer or second opinion) — the case stays in `CONSULTANT_REVIEW` throughout; a declined
  referral offer never drops it back to `READY_FOR_CONSULTANT`.
- `DECLINED` — patient declines the proposal. No account needed; coordinator remains available.
- `REVISION_REQUESTED` / `EXPIRED` — both re-enter `PROPOSAL_PREPARATION` as recovery paths; an
  expired proposal link is revoked.

> **Preliminary vs. final — test the wording.** A patient **ACKNOWLEDGES** a preliminary
> estimate (version status maps to `ACCEPTED`, macro case → `ACCEPTED`, a deposit is created).
> This is **not** final treatment acceptance and **not** medical consent. The final treatment
> quote is accepted later, after the in-person assessment, and does **not** move the macro case
> off `ARRIVAL_CONFIRMED`.

---

## 4. Pages & routes

Every page must render correctly in both `/en/…` and `/ar/…`; the Arabic side must be
right-to-left with correct spacing, punctuation and icon direction.

| Route | Page | Who | Test focus |
|---|---|---|---|
| `/{locale}` | Home | Public | Hero messaging, care-area entry, CTAs, RTL, metadata title/description. |
| `/{locale}/care-areas` | Care areas atlas | Public | Every care area grouped by body system; each links to its page and consultants. |
| `/{locale}/<care-area>` (cardiology, orthopedics, vascular-endovascular-surgery, …) | Care-area detail | Public | Plain-language treatments; one in-content route to the form. |
| `/{locale}/consultants` · `/consultants/{slug}` | Consultants | Public | Bilingual profiles; no case buttons; never claims an unverified status. |
| `/{locale}/how-it-works` | Process explainer | Public | The same four stages as the home journey; explains the two cost stages. |
| `/{locale}/send-my-case` | Case intake | Public | Consent, anti-spam, self or someone else, document upload, submit → status link; no travel-package question. |
| `/{locale}/whatsapp?case=` | WhatsApp entry | Public | Redirects to WhatsApp with the prefilled message in the page language; a case number is a hint, never identity. |
| `/{locale}/track-case` | Find my case | Public | Recover a status link by case number + WhatsApp (no enumeration). |
| `/{locale}/status/{token}` | Secure case status | Patient (link) | OTP → grant → status; information-response upload. |
| `/{locale}/proposal/{token}` | Secure proposal | Patient (link) | OTP (channel choice) → view → acknowledge (English) or ask the coordinator (Arabic) / decline / revise. |
| `/{locale}/activate/{token}` | Profile completion | Patient (link) | Prefilled profile, consents incl. deposit terms → Keycloak account-setup email. |
| `/{locale}/portal` | Role portal | All roles | My Care for patients; staff views (My work, cases, Conversations, team queue) by workspace. |
| `/{locale}/portal/control-center` | Control Center | Managers, admins, auditors | Access, workforce, coordination setup, commercial, conversation settings. |
| `/{locale}/portal/virtual-clinic` | Virtual clinic | Consultant, practice manager | Profile, schedule, services and price drafts, managers. |
| `/{locale}/portal/journeys` | Care Journeys | Journey roles | Designer, check, test, approval. |
| `/auth/callback` | OIDC return | Auth | Login round-trip lands on the account's workspace. |
| `/{locale}/privacy` · `/terms` · `/medical-disclaimer` | Legal | Public | Present & localized. |

---

## 5. The patient conversion layer

This is the newest area and the most important to test carefully. It turns an *acknowledged
preliminary estimate* into a *coordination-ready customer* through separate, non-interchangeable
gates. Entering an OTP, acknowledging an estimate, activating an account, or creating a deposit
does **not**, by itself, make someone a verified, onboarded customer.

| Gate | Meaning |
|---|---|
| `PROVISIONAL_PROFILE` | Created on submission. No account, no identity proofing. |
| `CONTACT_VERIFIED` | Patient proved control of one *registered* channel via OTP — WhatsApp (→ phone) or email. **Contact possession only, not identity.** |
| `ONBOARDING_COMPLETED` | Profile completed at `/activate/{token}`: subject type, declarations, representative details and consents (`PRIVACY_DATA_PROCESSING`, `CROSS_BORDER_CARE`, `DEPOSIT_CANCELLATION_TERMS`, plus `REPRESENTATIVE_AUTHORIZATION` when not the patient). |
| `ACCOUNT_ACTIVATED` | Profile ACTIVE **and** the Keycloak account setup finished (password from the setup email). A completed profile with pending account setup does not count. Sets **no** verification timestamp; not identity. |
| `DEPOSIT_SATISFIED` | No deposit required, or PAID, or an authorized Finance waiver. Comes after the profile is active. |
| `IDENTITY_VERIFIED` | Legal identity proofing → authorized manual review. **Required only when a travel package was requested** (visa, travel, hospital registration). |

> **The gate.** All applicable gates roll up into one backend-computed `CustomerReadiness` with structured
> `blockingItems` (`ACCOUNT_NOT_ACTIVATED`, `CONTACT_NOT_VERIFIED`, `IDENTITY_NOT_VERIFIED`,
> `REPRESENTATIVE_AUTH_MISSING`, `CONSENTS_INCOMPLETE`, `DEPOSIT_UNPAID`, `ONBOARDING_NOT_STARTED`,
> `ONBOARDING_INCOMPLETE`). The frontend renders it verbatim and never infers readiness. **There is no legacy
> deposit-only gate and no exemption: every case is judged by this one model.** A missing onboarding is a staff
> blocker: Operations cannot be assigned and the case cannot enter `TRAVEL_COORDINATION`. Entry to
> `TRAVEL_COORDINATION` happens only on a deposit-settled or readiness-changed event, exactly once; a deposit settled
> before the account is set up holds the case in `ACCEPTED` until setup finishes.

Where to see it: **Patient** → My Care current step. **Coordinator** → "Customer readiness" card (read-only) and the
case's current action.

---

## 6. End-to-end use cases

Work these in order for a full journey pass. Tags: **FLOW** = primary happy path, **EDGE** =
conditional branch, **NEG** = must be blocked.

### UC-01 · Anonymous case submission — FLOW · Patient (public)
- **Pre:** No account. Start at `/en/send-my-case`.
- **Steps:** Choose self or someone else → give consent + pass anti-spam → enter contact (WhatsApp; optionally
  email; a representative abroad picks their own country code) and a short note → upload a report via the presigned
  link and wait for the scan → submit. Repeat in Arabic as a relative.
- **Expected:** Patient registered before the case, with a provisional profile, submission contact, consent record and
  audit history; a representative is recorded separately. Routing then either assigns an eligible coordinator
  (case → `INTAKE_REVIEW`, coordinator notified) or leaves it `RECEIVED` in the team queue (team-queue email only in
  that case). Confirmation shows the public case number and a "check status" link; no registration. A retried submit
  continues the same case.

### UC-02 · Track case status via secure link — FLOW · Patient (link)
- **Pre:** A submitted case with a status token (from submission or `/track-case` recovery).
- **Steps:** Open `/status/{token}` → “Send code” → choose WhatsApp or email → read the code in
  Mailpit and enter it → view status.
- **Expected:** OTP is exchanged for a 30-min grant; high-level status shows. Verifying does NOT
  advance case status. Only the chosen channel’s verification timestamp is set.

### UC-03 · Routed intake, classification & consultant assignment — FLOW · Coordinator
- **Pre:** Routing configured (seeded locally). Variant A: a case routed to `coordinator` by UC-01. Variant B: a case
  left `RECEIVED` in the queue (e.g. every eligible coordinator off duty or at capacity).
- **Steps:** A — open the case from My work. B — review it from the team queue, then claim it (→ `INTAKE_REVIEW`). Then
  set the care area → open "Assign a Consultant" (one entry point) → pick from the eligibility list → consultant
  accepts (→ `CONSULTANT_REVIEW`).
- **Expected:** The routed owner is not notified about a case they took themselves. Unowned cases show routing data
  before claim; a claim lost to another coordinator returns to a refreshed queue with a message; no routing policy →
  claim refused (`ROUTING_POLICY_MISSING`). The eligibility list holds only consultants with a linked active account,
  `VERIFIED` credentialing plus an unexpired credential, `AVAILABLE`, and a matching care area or approved capability,
  each with why they match. Another coordinator cannot act on the case.

### UC-04 · Consultant review & decision — FLOW · Consultant
- **Pre:** Case in `CONSULTANT_REVIEW` with an active primary assignment (`doctor`).
- **Steps:** Review documents → save a draft → record a decision: Accept with cost estimates / Request more
  information / Not suitable / Return to coordinator → on Accept, add services from the consultant's catalogue.
- **Expected:** Accept → `CLINICAL_RECOMMENDATION_READY`; the approved review carries the estimates, catalogue services
  at their approved price whatever the client sends, and the consultant's currency. Off-list services require Finance.
  Request info creates a patient action; Not suitable cannot become a proposal; Return hands work back without
  cancelling. An exceptional outcome needs a reason; a retried submission duplicates nothing. Reassign is **not**
  offered; transfers and second opinions are referrals (UC-17).

### UC-05 · Build & release the preliminary proposal — EDGE · Coordinator (+ Ops/Finance)
- **Pre:** `CLINICAL_RECOMMENDATION_READY`.
- **Steps:** Create the proposal from the approved review (issued in the consultant's currency unless the
  coordinator explicitly picks another supported one) → if a travel package was requested, Operations completes the
  plan → if any manual/off-catalog price, Finance approves → release. Run all four paths of the gate table in
  [end-to-end-workflows.md](end-to-end-workflows.md).
- **Expected:** Gates are backend-computed and shown as a checklist — never inferred from status
  on the client. A catalog-only, no-travel quote releases immediately; otherwise the required
  approvals must complete first. Release mints the secure proposal link → `PATIENT_DECISION`.

### UC-06 · Patient acknowledges the preliminary estimate — FLOW · Patient (link)
- **Pre:** Released proposal; open `/proposal/{token}` (or from a verified status session, or the My Care drawer for a
  signed-in patient).
- **Steps A (English):** Verify via OTP (choose channel; "email instead" switch) → read the estimate: preliminary
  wording, min/expected/max range, fixed rate and its date, "what you pay now", deposit/refund/cancellation terms
  before the acknowledgement → tick the acknowledgement statement and Acknowledge. Also try Decline and Request
  changes.
- **Steps B (Arabic):** Same link in `/ar/`. The estimate shows the approved English terms with the pending-Arabic
  notice and **no acknowledgement control**; the patient asks their coordinator instead. As the owning `coordinator`,
  open the `PROPOSAL_TERMS_CALL` current action → record the decision with channel, time, who confirmed (the patient,
  or exactly one in-force authorised representative) and the attestation, under step-up.
- **Expected:** Version → `ACCEPTED`, macro case → `ACCEPTED`. Exactly one onboarding record and one deposit; one
  continuation message carrying the profile link. Acknowledging without the statement is refused even via the API;
  Decline and Request changes need no acknowledgement; a second, expired or superseded decision changes nothing. A
  recorded decision has the same effect as the patient's own, stores its provenance, and the patient sees who
  recorded it and how. Wording is never final acceptance or medical consent; no placeholders.

### UC-07 · Profile completion & account setup — FLOW · Patient
- **Pre:** The profile link from UC-06 (Mailpit). Variant: an account that is already active.
- **Steps:** Open `/activate/{token}` → check the prefill (nothing asked again from the case, no registration
  questions) → complete the profile and consents (deposit terms shown directly above the consent that accepts them) →
  receive the Keycloak account-setup email (resend available, no password on screen) → set a password → sign in.
- **Expected:** Profile `ACTIVE` but the account counts as activated only after the Keycloak setup; sign-in lands on
  My Care on the current case with the deposit as the next step. All the patient's cases are linked. Completing the
  profile creates no payment and sets **no** verification timestamp. Missing consent blocks completion; a replayed
  link changes nothing; a status link cannot be replayed against the profile; a cancelled case cannot be activated.
  An already-active account finishes the profile on its own and goes straight to the deposit step. Arabic is RTL.

### UC-08 · Representatives, identity & readiness — FLOW · Patient + Identity Reviewer
- **Pre:** Variant A: a case submitted for someone else. Variant B: an accepted case with a travel package requested.
- **Steps A:** Complete the profile as the representative (subject type) → consents now include
  `REPRESENTATIVE_AUTHORIZATION` → view the case in My Care. Repeat as payer-only.
- **Steps B:** Patient submits identity details in My Care → as `patient-identity-reviewer`, verify with recent
  authentication and a reason (or reject with a reason) → patient sees "awaiting review", or the rejection reason
  with the form to resubmit.
- **Expected:** A: the representative sees "Care for <patient>" and acts only while the link is in force; a payer
  gets no medical-record access. B: identity is a blocker only because a travel package exists (without one it never
  appears); the decision is audited and flows into `CustomerReadiness`. Readiness never reports progress that has no
  evidence.

### UC-09 · Deposit receipt, refund & waiver — EDGE · Finance
- **Pre:** A case with a `REQUESTED` coordination deposit (default 3,000 EGP component, shown at the frozen rate).
- **Steps:** As `finance`, in the case's "Coordination deposit & payments": record a partial receipt, then the rest
  (amount, method, reference — recent auth) → resubmit an identical receipt → record a refund → on another case,
  waive with a mandatory reason.
- **Expected:** Amount and currency come from the backend; status is recomputed from the append-only ledger; an
  identical receipt is ignored by idempotency key. Settlement closes the staff arrangement work, sends the patient to
  their case, and moves the case to `TRAVEL_COORDINATION` once readiness allows (otherwise it holds in `ACCEPTED`).
  The waiver satisfies the deposit and is audited. A coordinator can do none of these. New deposits state **no**
  refund window (refund class pending the legal decision); historic deposits keep their terms.

### UC-10 · Readiness gate for Operations and travel — NEG · Coordinator + Operations
- **Pre:** An `ACCEPTED` case that is not fully ready (e.g. deposit unsettled, or account setup unfinished).
- **Steps:** As the coordinator, try to assign Operations and to move the case to `TRAVEL_COORDINATION` → as
  `operations`, do administrative travel planning → attempt to confirm travel (non-cancellable).
- **Expected:** Operations assignment is refused while the deposit is unsettled or onboarding is missing; the
  coordinator transition endpoint refuses `TRAVEL_COORDINATION` (`DEDICATED_OPERATION_REQUIRED`). Planning is
  allowed and never changes the stage (recording an arrival on an `ACCEPTED` case → `INVALID_CASE_TRANSITION`).
  Confirmation is refused with `COORDINATION_NOT_READY` and patient-safe blocking reasons until every applicable gate
  (§5) passes. The gate opens exactly once. Automated: `frontend/e2e/operations-gate-live.spec.ts`.

### UC-11 · Arrival → final assessment → final quote — FLOW · Consultant + Coordinator + Finance
- **Pre:** `ARRIVAL_CONFIRMED`.
- **Steps:** Consultant records the in-person final assessment → Coordinator creates the final
  treatment quote (reuses locked rate); Finance approves if needed; release → patient accepts the
  final quote.
- **Expected:** Final quote uses the locked preliminary rate; accepting it is a financial
  agreement, not medical consent, and does not move the macro case off `ARRIVAL_CONFIRMED`.
  Already-paid deposit is credited.

### UC-12 · Consent, treatment, discharge & follow-up — FLOW · Consultant
- **Pre:** Accepted final quote (where one exists).
- **Steps:** Capture procedure-specific consent (or an audited emergency override) → record
  treatment start (→ `TREATMENT_IN_PROGRESS`) → record discharge with a clean discharge document
  (→ `DISCHARGED`) → create a follow-up plan (→ `FOLLOW_UP`).
- **Expected:** Treatment is blocked without an accepted final quote (if any) AND
  procedure-specific consent. Discharge requires a clean document. Onboarding consents never
  substitute for procedure-specific consent.

### UC-13 · Case messages, tasks & ownership transfer — EDGE · Coordinator / Lead
- **Pre:** A case owned by `coordinator2` (who reports to `coordinator`).
- **Steps:** As the owner, message the patient and the internal threads → as `coordinator` (not owner, no cover), try
  to write on the patient thread → create, start and complete tasks, including a blocking one → as `coordinator`
  (lead), transfer ownership with a reason → leave a case with unsent text, then with a saved draft.
- **Expected:** Thread membership is server-enforced (a consultant can't see or post to the patient thread; the
  client "internal" flag is ignored); only the owner or their active cover writes to the patient, anyone else is
  refused by the server. Patient notifications carry a secure link, never the body. A blocking task prevents
  protected transitions; cancelling or reassigning a task needs supervision of its owner. The transfer records its
  reason, moves open coordinator work, notifies only the new owner once (bell + work email), and the old owner loses
  write access. Unsent text asks before leaving (in-page and browser Back); a saved draft does not; a failed send
  keeps the draft.

### UC-14 · Practitioner credentialing — EDGE · Credential Verifier
- **Pre:** Control Center as `credential-admin`; a second `CREDENTIAL_VERIFIER` for the decision (none is seeded:
  grant the role to an invited account).
- **Steps:** Create a practitioner profile, add a credential and a care-area capability → submit for verification →
  decide as the other verifier → let a credential expire.
- **Expected:** The preparer cannot decide their own credential (independent reviewer, even for a system
  administrator). Capabilities are approved only by credentialing. Only consultants meeting the UC-03 eligibility
  rule appear for assignment; the hourly expiry job removes an expired one from availability.

### UC-15 · WhatsApp intake conversation → case — FLOW · Coordinator
- **Pre:** Meta WhatsApp test setup ([meta-whatsapp-test-setup.md](meta-whatsapp-test-setup.md)); a coordinator with
  an intake setting, on duty, speaking the test language.
- **Steps:** From a phone with no open case, open `/{locale}/whatsapp` and send the prefilled message → as the owner,
  answer in Conversations within the 24-hour window and send the case-form link → let the window lapse and reply
  again → submit a case from the same phone (UC-01) → open the case's messages drawer.
- **Expected:** One conversation per sender, owned by an intake-eligible, on-duty coordinator under their limit who
  speaks the language (a returning sender's previous owner wins when eligible); nobody eligible → intake queue, claimed
  under lock. Free text only inside the window, then exactly one follow-up template. On submission routing tries the
  intake owner first (`INTAKE_CONTINUITY`); the conversation is linked to the case, staged files become case
  documents, and if someone else got the case `rs_coordinator_intro` introduces them by name. The drawer shows
  "WhatsApp before the case" read-only. Inbound files are scanned before anyone can open them. EN and AR templates.

### UC-16 · One voice: who replies to the patient, covers, timers & out of hours — EDGE · Coordinator / Lead
- **Pre:** A case owned by `coordinator` with a WhatsApp-reachable patient; `coordinator2` on duty; the second team set
  up (UC-20); conversation settings in Control Center (default Sat–Thu 10:00–20:00 Africa/Cairo, 30/60 minutes,
  72 hours; shorten them for the test).
- **Steps — who replies:** The patient writes (WhatsApp and portal) → the owner replies → try to reply as
  `coordinator2` (same team, not owner), as the owner's lead, and as `coordinator-scope` (other team) → transfer the
  case to `coordinator2` → the patient writes again → both coordinators try to reply.
- **Expected — who replies:** The patient's message lands in the case's patient thread and is the owner's to answer.
  Only the owner replies; the colleague, the lead and the other team are refused by the server (a lead covers or
  reassigns, never writes over the owner). After the transfer only `coordinator2` replies and the previous owner is
  refused. The patient sees one coordinator by name and gets the "new secure message" nudge, never the message body.
- **Steps — covers and timers:** Two coordinators send to the same conversation at once → the owner sets a time-bounded cover → the cover
  replies, and the cover resends the secure link → let the cover expire → the patient writes and nobody answers →
  someone with no case writes out of hours → leave an intake conversation silent.
- **Expected:** The second concurrent send is refused. During the cover only the cover writes and the owner reads;
  rights return automatically at expiry. The first unanswered message starts a clock in working hours: reminder to the
  replier at 30 working minutes, alert to the owner's leads and direct manager at 60 (Care Coordination Managers when
  there is nobody), each once per waiting period; any answer, close or hand-off stops it. `rs_out_of_hours` once per
  closed period. A silent intake conversation closes as `IDLE` after 72 hours and reopens when the person writes.
  No free text reaches WhatsApp for a patient who has a case.

### UC-17 · Consultant referral: transfer & second opinion — EDGE · Consultant + Coordinator
- **Pre:** Case in `CONSULTANT_REVIEW`; a second eligible consultant.
- **Steps:** As the primary consultant, refer for a transfer with a clinical reason → as the owning coordinator,
  confirm with an eligible consultant (or decline with a reason) → the receiver accepts or declines. Repeat as a second
  opinion: the receiver submits one opinion.
- **Expected:** No access exists until the receiver accepts. Accepted transfer: the original assignment ends and the
  receiver becomes the one primary consultant; care area follows the confirmed area. Second opinion: read access and
  one opinion only (no clinical decision, messages or tasks); submitting ends the assignment and its access. A
  declined offer returns to the coordinator and the original consultant stays primary. Recording the clinical
  decision withdraws open referrals. The case stays `CONSULTANT_REVIEW` throughout; every step is audited.

### UC-18 · A coordinator leaves — EDGE · Care Coordination Manager / System Administrator
- **Pre:** A coordinator who owns cases, owns intake conversations and holds a reply cover.
- **Steps:** Disable their sign-in (or start offboarding, remove the Coordinator role, or let it end on a date) → try
  to complete offboarding → check their cases, conversations and covers.
- **Expected:** Every case they own is routed again to an eligible coordinator, or queued with the manager alert,
  with open coordinator work moving along (decision source `OWNER_LEFT_ROLE`). Their intake conversations go back
  through intake routing or the queue; covers they hold end and the owner answers again; a cover who lost the role
  never counts as the replier. A role ending on a scheduled date is swept within 15 minutes. Offboarding cannot
  complete while conversations or covers still name the person. New coordinators show "Not set up yet" for intake in
  Control Center.

### UC-19 · Staff invitation & workforce hierarchy — EDGE · System Administrator + Coordinator
- **Pre:** Control Center as `credential-admin`.
- **Steps:** Invite a coordinator → complete the invitation from Mailpit (password + MFA) → sign in → as
  `coordinator-scope` (other team), open a case of the Coordination team → try to remove the only lead of a team and
  to grant a conflicting role.
- **Expected:** The invitee becomes `ACTIVE` on first sign-in and lands in their workspace; without MFA they are asked
  to set it up and are never treated as a patient. A lead reads only their own team's cases; another team's
  coordinator is refused. Removing the only lead or a manager with reports, and separation-of-duties conflicts, are
  refused at grant. Role changes take effect on the next request.

### UC-20 · Two coordination teams — EDGE · Coordinators, Leads, Care Coordination Manager
- **Pre:** Team A = "Coordination team" (lead `coordinator`, member `coordinator2`); Team B = "Coordination
  scope-denial team" (lead `care-manager-scope`, member `coordinator-scope`), both activated. Routing set up per
  "Test data setup": Team A serves cardiology, Team B serves orthopedics, each with an on-duty coordinator.
- **Steps:** Submit a cardiology case and an orthopedics case → open each as each coordinator and lead → as
  `coordinator` (lead A), try to reassign the orthopedics case and to reassign the cardiology case to
  `coordinator-scope` → as `care-manager`, move a case from Team A to Team B → submit a case in a care area no team
  serves.
- **Expected:** Each case routes to the team serving its care area and to that team's eligible coordinator. A lead
  sees only their own team's cases (no indirect depth) and reassigns only within the team; the other team's lead and
  coordinators cannot open or act on it. The Care Coordination Manager can move work across teams, with a reason, and
  the move is audited and notifies only the new owner. A care area no team serves follows the policy's fallback, or
  waits in the queue with the manager alert — never lands on an ineligible team. Repeat with WhatsApp intake: an
  Arabic speaker's conversation goes only to a coordinator who speaks Arabic.

---

## 7. Security & negative tests

A green build is not a passed build until these are confirmed.

| ID | Check | Expected |
|---|---|---|
| SEC-1 | Enter a wrong OTP 5 times. | Challenge locks; even the correct code then fails. Neutral error, no hint whether the code existed. |
| SEC-2 | Request more than 5 OTPs in an hour. | Rate-limited (HTTP 429) with a neutral message. |
| SEC-3 | Let an OTP (15 min) or view grant (30 min) expire, then use it. | Rejected; must re-request. |
| SEC-4 | Open a secure link URL and try to view without verifying. | Blocked — a valid grant is required; the URL alone is never enough. |
| SEC-5 | Recover a status link with a wrong case number / phone. | Identical “if it matches, we’ll send it” response — no enumeration. |
| SEC-6 | Signed-in patient A opens patient B’s case / onboarding. | 403 — object-level ownership denies it. |
| SEC-7 | Request an email OTP for a case with only a WhatsApp number on file. | Rejected — the destination must already belong to the profile; no caller-supplied destination is accepted. |
| SEC-8 | Coordinator attempts to waive a deposit / mark identity verified / record a payment. | All denied — reserved for Finance / reviewer roles. |
| SEC-9 | Finance waiver / identity review after >10 min since login. | Step-up re-authentication required before the action completes; a reason is mandatory. |
| SEC-10 | Inspect any patient-facing screen & payload. | No provider net cost, margin rate, profit, internal Finance reason, or internal reference is ever present. |
| SEC-11 | Replay the profile link after completion; reuse the Keycloak account-setup link; replay a status link against the profile. | Profile replay changes nothing (no new account, email unchanged); a used setup link is refused by Keycloak; a status link never opens the profile. |
| SEC-12 | Confirm a non-cancellable booking before readiness/deposit. | `409 COORDINATION_NOT_READY` with structured, patient-safe blocking reasons — not a bare error. |
| SEC-13 | Upload a malformed / oversized / MIME-spoofed / infected document (web form and WhatsApp). | Rejected, or condemned and deleted; a scanner outage leaves it unusable but recoverable; never openable until "clean". |
| SEC-14 | Practice manager with every clinic permission opens the consultant's case workspace, documents or referrals. | 403 on each; clinic delegation reaches only `/api/v1/clinics/{id}`. Revoked delegation or disabled consultant → access gone immediately. |
| SEC-15 | `SYSTEM_ADMINISTRATOR`, `COMPLIANCE_AUDITOR` and `SUPPORT_AGENT` open a case, its documents or a credential decision. | Denied — no case, clinical, credential or identity bypass; the auditor's read models write nothing. |
| SEC-16 | Give a test user a Keycloak realm role or token claim (e.g. `FINANCE`) without a platform grant. | Grants nothing: authority comes only from the platform database. |
| SEC-17 | A second coordinator, or a non-owner without an active cover, sends on a patient thread or intake conversation. | Refused by the server under the conversation lock; nothing reaches the patient. |

---

## 8. Environment & getting the OTP codes

The most common “I’m stuck” moment: where does the code come from? Locally, simulated
WhatsApp/email messages are delivered to **Mailpit**.

| Service | Dev URL (tunnel) | Local port | Use for |
|---|---|---|---|
| Portal / site | `https://dev.rehletshifaa.com` | 3000 | All UI testing. The backend allows CORS from the tunnel origin only. |
| Business API | `https://api-dev.rehletshifaa.com` | 8081 (gateway) | API checks; every response carries `X-Request-ID` — quote it in defects. |
| Keycloak | `https://auth-dev.rehletshifaa.com` | 8180 | Sign-in, MFA, password setup. **Not** where roles are granted. |
| Mailpit | `https://mail-dev.rehletshifaa.com` | 8025 | **Read OTP codes, secure links, invitations and work email here.** |
| MinIO | `https://files-dev.rehletshifaa.com` | 9001 (console) | Confirm document storage (not public). |

Roles, teams and reporting lines are granted in the Control Center (`/en/portal/control-center`), not Keycloak.

> **Retrieving an OTP.** (1) Trigger "Send code" on a secure link (or acknowledge to receive the profile link).
> (2) Open Mailpit. (3) Open the newest message and copy the 6-digit code (or the link). (4) Enter it before it
> expires (15 min). Codes are never shown in the UI or the URL, by design. Run live checks one at a time: parallel
> runs share the public rate budget (429s) and match each other's Mailpit messages.

> **Environment guardrail.** Do **not** rebuild the stack with a bare `docker compose up` — it
> bakes `localhost` URLs into the tunnel-served build and breaks the shared environment. If a
> rebuild is truly needed, include the tunnel overlay file. Ask the dev before recreating
> containers.

---

## 9. Test matrix & how to log results

Record every run with the same fields so a failure is reproducible.

| Field | Meaning |
|---|---|
| Test ID | Use-case ID (UC-06) or security ID (SEC-3), plus a variant suffix if needed. |
| Title | One line — what is being verified. |
| Role / Account | Which seeded user & role. |
| Language | EN / AR — run critical journeys in both. |
| Precondition | Case state and any prior steps. |
| Steps | Numbered, reproducible actions. |
| Expected | The result from this document. |
| Actual + Status | PASS / FAIL / BLOCKED with a screenshot and, for API issues, the request ID. |
| Severity | Critical (money/clinical/auth) · High · Medium · Low. |

**Priority order for a first pass**

1. UC-01 → UC-12 as one continuous journey (English), then UC-01 → UC-07 in Arabic using UC-06 B.
2. UC-13 → UC-20 (coordination, two teams, referrals, WhatsApp, workforce).
3. All NEG cases and the §7 security checks.
4. Both languages / RTL for §4 pages.
5. Role-boundary checks from §2.

> **Definition of "passed".** A build passes when the full happy path completes, every §7
> security check holds, no patient screen leaks internal commercial data, and EN + AR show
> equivalent functional states — except the deliberate Arabic proposal difference (UC-06 B) until the terms have
> approved Arabic wording. Report anything touching money, clinical wording, authentication,
> or a patient promise as **Critical**.
