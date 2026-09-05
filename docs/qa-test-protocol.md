# RehletShifaa — QA & QC Master Test Protocol

_Internal testing reference · v1.0_

Everything a tester needs to exercise RehletShifaa (the international patient-care
coordination platform) end to end — from an anonymous inquiry through consultant review, a
preliminary estimate, onboarding, deposit and travel, to treatment and follow-up.

**How to use this:** read §1 first, then work the use cases in §6 in order against the test
matrix in §9. Run critical journeys in **both English and Arabic (RTL)**.

- Scope: web portal + secure links + APIs
- Languages: English & العربية (right-to-left)
- Destination of care: Egypt · Pricing base: EGP
- End-to-end use cases: 14

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
| Identity | Keycloak (OIDC) | Login, roles, step-up re-authentication for sensitive actions. Branded bilingual login theme. |
| Secure delivery | Notification outbox | WhatsApp / email carrying OTP codes and secure links. **Locally these land in Mailpit** (see §8). |
| Documents | MinIO + virus scan | Reports upload via short-lived presigned links, scanned (quarantine → clean), never public. |
| Commercial engine | — | EGP pricing with a hidden coordination margin, conditional Finance/Operations approvals, deposits, preliminary vs. final documents. |

---

## 2. Roles & test accounts

Every read and write is authorized by **role + object ownership** (case assignment or patient
ownership). Testing a role means confirming it can do its own actions **and cannot** do
anything outside its lane.

| Role | Owns / does | Must NOT be able to |
|---|---|---|
| `PATIENT` | Submit a case; verify contact; view & decide on proposals; complete onboarding & identity; read own cases. | See another patient's case; see internal notes, provider cost, margin or Finance reasons. |
| `PATIENT_REPRESENTATIVE` | Act for a patient under an active, scoped, non-expired delegation. | Access after the delegation expires/revokes; a payer-only person gets no clinical access. |
| `COORDINATOR` | Claim & own a case; classify care area; assign consultant/ops/finance; create & release proposals; message the patient; tasks. | Edit medical scope or price; record a payment; waive a deposit; declare identity verified; enter a patient's OTP. |
| `COORDINATOR_LEAD` | Everything a coordinator does, plus reassign case ownership between coordinators. | Same commercial/clinical prohibitions as coordinator. |
| `DOCTOR` | Consultant review & decision; cost estimates; final in-person assessment; procedure-specific consent; treatment/discharge. | Act on a case without an active assignment; whole-case cancel from review. |
| `OPERATIONS` | Complete the travel/operational plan; confirm travel (non-cancellable) once readiness is met. | Confirm a non-cancellable booking before deposit + readiness. |
| `FINANCE` | Approve manual/off-catalog pricing & final quotes; record deposit receipts/refunds; waive a deposit. | Act without recent authentication on sensitive money actions. |
| `PATIENT_IDENTITY_REVIEWER` | Review & decide (verify/reject) patient legal-identity submissions. | Verify identity without recent auth + a reason; be confused with practitioner credentialing. |
| `CREDENTIALING_ADMIN` | Onboard practitioners & staff; verify practitioner credentials. | Review *patient* identity (that is the reviewer role). |
| `SYSTEM_ADMIN` | Administrative override access across the platform. | — |
| `AUDITOR` | Read-only visibility, including internal threads. | Modify any record. |

**Seeded local sign-ins** — at `/en/portal` → “Staff sign in”. Passwords are for the
local/test realm only.

| Username | Password | Roles |
|---|---|---|
| `patient` | `Patient123!` | PATIENT |
| `coordinator` | `Coordinator123!` | COORDINATOR, COORDINATOR_LEAD |
| `coordinator2` | `Coordinator123!` | COORDINATOR |
| `doctor` | `Doctor123!` | DOCTOR |
| `operations` | `Operations123!` | OPERATIONS |
| `finance` | `Finance123!` | FINANCE |
| `credential-admin` | `Admin123!` | CREDENTIALING_ADMIN, SYSTEM_ADMIN |

> **Setup gap to flag.** No seeded user carries `PATIENT_IDENTITY_REVIEWER`. For
> identity-review tests, either assign that realm role to a user in Keycloak, or use
> **credential-admin** (its `SYSTEM_ADMIN` role is also accepted on the identity-review
> endpoints).

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

**Branches**

- `INFORMATION_REQUIRED` — during intake/review the patient can be asked for more; case
  returns to `INTAKE_REVIEW` after they respond via a secure link.
- `CLINICALLY_NOT_SUITABLE` — consultant outcome; the coordinator follows up (not a whole-case
  cancel by the doctor).
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
| `/{locale}/care-areas` | Care areas index | Public | Lists cardiology, rehabilitation/dysphagia, orthopedics. |
| `/{locale}/cardiology` · `/orthopedics` · `/rheumatology-rehabilitation` | Care-area detail | Public | Content + CTA into intake. |
| `/{locale}/consultants` · `/consultants/{slug}` | Consultants | Public | Profiles render; no fabricated ratings/claims. |
| `/{locale}/how-it-works` | Process explainer | Public | Matches the real 5-step journey. |
| `/{locale}/send-my-case` | Case intake | Public | Consent, anti-spam, document upload, submit → status link. |
| `/{locale}/track-case` | Find my case | Public | Recover a status link by case number + WhatsApp (no enumeration). |
| `/{locale}/status/{token}` | Secure case status | Patient (link) | OTP → grant → status; information-response upload. |
| `/{locale}/proposal/{token}` | Secure proposal | Patient (link) | OTP (channel choice) → view → acknowledge/decline/revise. |
| `/{locale}/portal` | Role portal | All roles | Dashboards, workspace, onboarding, readiness card — role-gated. |
| `/auth/callback` | OIDC return | Auth | Login round-trip, activation via `?activate=`. |
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
| `ACCOUNT_ACTIVATED` | Links the profile to a Keycloak subject. Sets **no** verification timestamp; not identity. |
| `IDENTITY_VERIFIED` | Patient/representative passes legal identity proofing → authorized manual review. |
| `ONBOARDING_COMPLETED` | Subject type, declarations, representative details and applicable consents complete, then submitted. |
| `DEPOSIT_SATISFIED` | No deposit required, or PAID, or an authorized Finance waiver. |

> **The gate.** All applicable gates roll up into one backend-computed `CustomerReadiness`. The
> frontend renders it verbatim and must never infer readiness from unrelated statuses. Readiness
> is enforced server-side before any chargeable / non-cancellable commitment (confirming
> travel). Legacy cases with no onboarding keep the deposit-only gate.

Where to see it: **Patient** → onboarding card in the case workspace. **Coordinator** →
“Customer readiness” card (read-only).

---

## 6. End-to-end use cases

Work these in order for a full journey pass. Tags: **FLOW** = primary happy path, **EDGE** =
conditional branch, **NEG** = must be blocked.

### UC-01 · Anonymous case submission — FLOW · Patient (public)
- **Pre:** No account. Start at `/en/send-my-case`.
- **Steps:** Give consent + pass anti-spam → enter contact (WhatsApp; optionally email) and a
  short note → upload a report via the presigned link and wait for the scan → submit.
- **Expected:** Case created (`RECEIVED`) with a provisional profile, consent record and audit
  history. Confirmation screen shows the public case number and a “check status” link. No portal
  registration required.

### UC-02 · Track case status via secure link — FLOW · Patient (link)
- **Pre:** A submitted case with a status token (from submission or `/track-case` recovery).
- **Steps:** Open `/status/{token}` → “Send code” → choose WhatsApp or email → read the code in
  Mailpit and enter it → view status.
- **Expected:** OTP is exchanged for a 30-min grant; high-level status shows. Verifying does NOT
  advance case status. Only the chosen channel’s verification timestamp is set.

### UC-03 · Coordinator claims, classifies & assigns — FLOW · Coordinator
- **Pre:** A `RECEIVED` case in the queue.
- **Steps:** Claim the case (→ `INTAKE_REVIEW`) → set the care area → assign a verified consultant
  whose specialty matches → consultant accepts (→ `CONSULTANT_REVIEW`).
- **Expected:** Only a matching, available, credential-current consultant can be assigned.
  Another coordinator has view-only until it is claimed.

### UC-04 · Consultant review & decision — FLOW · Doctor
- **Pre:** Case in `CONSULTANT_REVIEW` with an active doctor assignment.
- **Steps:** Review documents → record a decision (Accept with cost estimates / Request info /
  Not suitable / Return / Reassign) → on Accept, add at least one service + EGP cost.
- **Expected:** Accept → `CLINICAL_RECOMMENDATION_READY` with an approved review carrying the
  cost estimates. Each alternative outcome routes to its correct state; a doctor cannot cancel
  the whole case.

### UC-05 · Build & release the preliminary proposal — EDGE · Coordinator (+ Ops/Finance)
- **Pre:** `CLINICAL_RECOMMENDATION_READY`.
- **Steps:** Create the proposal from the approved review; pick the display currency → if a travel
  package was requested, Operations completes the plan → if any manual/off-catalog price, Finance
  approves → release.
- **Expected:** Gates are backend-computed and shown as a checklist — never inferred from status
  on the client. A catalog-only, no-travel quote releases immediately; otherwise the required
  approvals must complete first. Release mints the secure proposal link → `PATIENT_DECISION`.

### UC-06 · Patient acknowledges the preliminary estimate — FLOW · Patient (link)
- **Pre:** Released proposal; open `/proposal/{token}`.
- **Steps:** Verify via OTP (choose channel; “email instead” switch) → read the estimate (note
  the preliminary wording and “what you pay now”) → tick the acknowledgement statement and
  Acknowledge.
- **Expected:** Version → `ACCEPTED`, macro case → `ACCEPTED`. Exactly one onboarding record and
  one deposit are created; an account-activation invite is sent. Wording makes clear this is not
  final acceptance or medical consent.

### UC-07 · Account activation — FLOW · Patient
- **Pre:** An activation invite exists (from UC-06). Open the activation link / `?activate=`
  param signed in as a patient.
- **Steps:** Follow the activation link and sign in → confirm the profile links.
- **Expected:** The provisional profile and all its cases link to the account. **No** verification
  timestamp is set by activation. The one-time link cannot be reused.

### UC-08 · Onboarding → identity → readiness — FLOW · Patient + Identity Reviewer
- **Pre:** Activated patient with an onboarding record; open the case in the portal.
- **Steps:** Choose who is completing this (patient / guardian / representative / payer) → confirm
  the verified contact → submit identity details (→ manual review) → reviewer verifies the
  identity (recent auth + reason) → agree to the required consents → deposit shows paid/waived →
  review & submit onboarding.
- **Expected:** Progress advances only as each real gate is met. Onboarding cannot be submitted
  with a missing step. When all gates pass, `CustomerReadiness.readyForCoordination` becomes
  true. A payer receives no medical-record access.

### UC-09 · Deposit receipt, refund & waiver — EDGE · Finance
- **Pre:** A case with a `REQUESTED` deposit.
- **Steps:** Record a receipt (amount, method, reference — requires recent auth) → optionally
  record a refund → optionally waive with a mandatory reason.
- **Expected:** Paid status is backed by a ledger event; the ledger is append-only. Waiver marks
  the deposit satisfied and is audited. A coordinator cannot perform any of these.

### UC-10 · Non-cancellable booking gate — NEG · Operations
- **Pre:** `ACCEPTED`/`TRAVEL_COORDINATION` case that is NOT yet fully ready.
- **Steps:** Do administrative travel planning (allowed) → attempt to confirm travel
  (non-cancellable).
- **Expected:** Planning is allowed; confirmation is blocked until full readiness (identity,
  consents, onboarding, deposit) with structured blocking reasons. Legacy cases with no
  onboarding keep the deposit-only gate.

### UC-11 · Arrival → final assessment → final quote — FLOW · Doctor + Coordinator + Finance
- **Pre:** `ARRIVAL_CONFIRMED`.
- **Steps:** Doctor records the in-person final assessment → Coordinator creates the final
  treatment quote (reuses locked rate); Finance approves if needed; release → patient accepts the
  final quote.
- **Expected:** Final quote uses the locked preliminary rate; accepting it is a financial
  agreement, not medical consent, and does not move the macro case off `ARRIVAL_CONFIRMED`.
  Already-paid deposit is credited.

### UC-12 · Consent, treatment, discharge & follow-up — FLOW · Doctor
- **Pre:** Accepted final quote (where one exists).
- **Steps:** Capture procedure-specific consent (or an audited emergency override) → record
  treatment start (→ `TREATMENT_IN_PROGRESS`) → record discharge with a clean discharge document
  (→ `DISCHARGED`) → create a follow-up plan (→ `FOLLOW_UP`).
- **Expected:** Treatment is blocked without an accepted final quote (if any) AND
  procedure-specific consent. Discharge requires a clean document. Onboarding consents never
  substitute for procedure-specific consent.

### UC-13 · Coordination support: messages, tasks, reassignment — EDGE · Coordinator / Lead
- **Pre:** An owned case.
- **Steps:** Message the patient (patient thread) and staff (internal threads) → create and
  complete tasks → lead reassigns ownership to another coordinator.
- **Expected:** Thread membership is server-enforced (a doctor can’t post to the patient thread;
  the client ‘internal’ flag is ignored). After reassignment the old owner loses write access and
  the new owner gains it.

### UC-14 · Practitioner credentialing — EDGE · Credentialing Admin
- **Pre:** Admin portal.
- **Steps:** Create a practitioner profile and add a credential → verify the practitioner.
- **Expected:** Only verified, credential-current, available consultants appear for assignment;
  an expired credential removes them from availability.

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
| SEC-11 | Use a one-time activation link twice. | Second use is refused (“already used”). |
| SEC-12 | Confirm a non-cancellable booking before readiness/deposit. | Blocked with structured, patient-safe blocking reasons — not a bare error. |
| SEC-13 | Upload a malformed / oversized / non-clean document. | Rejected or quarantined; never downloadable until “clean”. |

---

## 8. Environment & getting the OTP codes

The most common “I’m stuck” moment: where does the code come from? Locally, simulated
WhatsApp/email messages are delivered to **Mailpit**.

| Service | Local URL | Use for |
|---|---|---|
| Portal / site | `http://localhost:3000` | All UI testing (or the live Cloudflare tunnel URL if given one). |
| Backend API | `http://localhost:8080` | API-level checks, health. |
| Keycloak | `http://localhost:8180` | Sign-in, assigning the identity-reviewer role. |
| Mailpit | `http://localhost:8025` | **Read OTP codes & secure links here.** |
| MinIO console | `http://localhost:9001` | Confirm document storage (not public). |

> **Retrieving an OTP.** (1) Trigger “Send code” on a secure link (or acknowledge to send an
> activation invite). (2) Open Mailpit at `:8025`. (3) Open the newest message and copy the
> 6-digit code (or the secure link). (4) Enter it before it expires (15 min). Codes are never
> shown in the UI or the URL, by design.

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

1. UC-01 → UC-12 as one continuous journey.
2. All NEG cases and the §7 security checks.
3. Both languages / RTL for §4 pages.
4. Role-boundary checks from §2.

> **Definition of “passed”.** A build passes when the full happy path completes, every §7
> security check holds, no patient screen leaks internal commercial data, and EN + AR show
> equivalent functional states. Report anything touching money, clinical wording, authentication,
> or a patient promise as **Critical**.
