# End-to-end care workflows

## Distinct identity & conversion concepts

The platform deliberately separates things that must never be conflated. **Entering a WhatsApp/email OTP, acknowledging an estimate, activating a Keycloak account, or creating a deposit does not make the patient a legally verified or fully onboarded customer.**

1. **Provisional patient profile** (`PROVISIONAL_PROFILE`) — created internally the moment an anonymous case is submitted. No account, no password, no legal identity proofing.
2. **Contact-verified secure access** (`CONTACT_VERIFIED`) — a purpose-scoped, expiring, OTP-protected proof that the patient controls one *registered* contact channel. The verified channel is tracked separately (`WHATSAPP_VERIFIED` → `phone_verified_at`, `EMAIL_VERIFIED` → `email_verified_at`); one successfully verified selected channel is sufficient. It proves **contact possession, not legal identity**, and never changes case status.
3. **Account activation** (`ACCOUNT_ACTIVATED`) — links the existing provisional profile (and every related case) to the authenticated subject. Activation **only** links the subject and consumes the one-time token; it is not contact verification and not identity verification, and it never sets a verification timestamp.
4. **Legal identity verification** (`IDENTITY_VERIFIED`) — the patient or authorized representative passes a configured identity-proofing process (test simulator → authorized manual review, or a future external-provider adapter).
5. **Onboarding completion** (`ONBOARDING_COMPLETED`) — required profile info, declarations, representative details and applicable consents are complete.
6. **Deposit satisfaction** (`DEPOSIT_SATISFIED`) — no deposit required, PAID, or an authorized Finance waiver.
7. **Customer readiness** (`COORDINATION_READY`) — all applicable conversion gates are satisfied (backend-computed).

### Contact-channel choice

When both a registered WhatsApp number and email exist, the patient chooses either channel for the OTP (default WhatsApp; "Use email instead"). One selected channel per challenge; switching or resending mints a fresh independent challenge and revokes the prior one. The destination is always the patient's own on-file contact — never a caller-supplied value — and public responses expose only masked destinations.

New patients are never forced to register during inquiry, intake, consultant review, or proposal evaluation. Returning patients who already have accounts may sign in earlier.

## Agreed patient happy path

1. An anonymous visitor submits a medical case (no account).
2. The system creates a provisional patient profile, a consent record, the case, and audit history.
3. The confirmation screen shows: case received, the public case number, "Continue on WhatsApp", and a lightweight "Check case status" — **no portal registration**.
4. Only **after successful submission** is a random status link created. An OTP is minted on demand when the patient opens that link and requests access, so no OTP expiry clock runs while a draft is still uploading documents.
5. The coordinator reviews the case and may request more information over the secure patient thread.
6. Pre-acceptance sensitive actions use purpose-scoped, expiring, case-scoped secure links protected by OTP.
7. A verified consultant produces an approved clinical recommendation.
8. The proposal completes only its **required** internal gates — Operations when a travel package was requested, Finance when any manual/off-catalog price is present — then the coordinator releases it (a catalog-only, no-travel quote releases immediately).
9. Release mints the random, expiring, case-scoped **secure proposal link** and moves the case to `PATIENT_DECISION`. The patient completes **contact-verified secure access** (OTP → short-lived view grant) before any clinical recommendation, risk, pricing, or document is exposed — this proves contact possession, not legal identity.
10. The patient accepts, declines, or requests a revision — recorded against the exact released version.
11. On `ACCEPTED`, an account-activation invitation is sent to the already-verified contact.
12. Activation links the existing profile and all related cases automatically (no manual case UUID/code re-entry).
13. After activation the patient lands in "My Journey".
14. A patient who declines needs no account. A revision stays in the verified-link journey until acceptance.
15. Activation failure or delay never undoes proposal acceptance (acceptance is persisted independently).

## Patient conversion layer (preliminary acknowledged → coordination-ready)

Acknowledging a **preliminary estimate** is not final treatment-plan acceptance, not procedure-specific medical consent, and confirms no non-cancellable booking. On a preliminary `ACKNOWLEDGED` decision the platform additively:

- idempotently creates/resumes a **`patient_onboardings`** record (unique per patient/case/acknowledged proposal; never for `DECLINED`/`REVISION_REQUESTED`);
- creates the deposit via the existing `PaymentService`;
- sends an account-activation invite when the provisional patient has no account.

Nothing is auto-marked complete. The resumable onboarding sub-workflow (`OnboardingService`) then covers: patient / guardian / representative / payer selection (reusing `patient_representatives`; a **payer never gets medical-record access**), verified-contact display, **legal identity verification** (`IdentityVerificationService` + `IdentityVerificationPort`; authorized manual review by the narrowly-scoped `PATIENT_IDENTITY_REVIEWER` role, with recent authentication, reason and audit), applicable onboarding **consents** (reusing `consent_records` — procedure-specific consent stays doctor-owned and is not duplicated), **deposit** status (PAID or an authorized Finance waiver), and final review/submission.

**Customer readiness** is computed only by the backend (`CustomerReadinessService` → `CustomerReadiness` DTO) and reports `accountActivated`, `contactVerified`, `verifiedChannel`, `identityRequired/Verified`, `onboardingCompleted`, `requiredConsentsCompleted`, `representativeAuthorizationValid`, `depositRequired/Status/Satisfied`, structured `blockingItems`, and `readyForCoordination`. The frontend renders this DTO verbatim and never infers readiness from unrelated statuses.

**Where the gate sits:** administrative planning may proceed before payment, but the non-cancellable commitment (`upsertTravel` with `status=CONFIRMED`) requires full readiness — legacy cases with no onboarding record keep the pre-existing deposit-only gate (backward compatible), and progressed pre-feature cases use a documented `LEGACY_EXEMPT` state rather than any fabricated identity evidence. The macro transition `ACCEPTED → TRAVEL_COORDINATION` is **not** overloaded with the gate.

## Secure-link + OTP lifecycle

- **Case access link** (`case_access_links`): minted after successful submission for `STATUS`, or by a coordinator for `INFORMATION_RESPONSE`. It is random, pepper-hashed, case- and purpose-scoped, expiring, and revocable. Opening it exposes only a case number, masked destination, and the verification prompt.
- **Case access challenge** (`case_access_challenges`): minted only when access is requested. Resend is capped at 5/hour; each challenge expires after 15 minutes, allows 5 attempts, and is consumed once. Successful verification issues a pepper-hashed 30-minute grant. The grant authorizes only its link and cannot cross cases or purposes.
- **Proposal access challenge** (`proposal_access_challenges`): minted on demand for a released proposal's secure link. Rate-limited resend (max 5/hour), 5 attempts, 15-minute expiry, one-time. A correct OTP consumes the challenge and issues a **hashed, 30-minute view grant**. Both viewing the sensitive proposal and deciding require a valid grant — possession of the URL plus a typed name is never sufficient.
- **Account activation** (`account_activations`): minted once per patient (unique constraint) when a proposal is accepted by a not-yet-registered patient; hashed token, 30-day expiry, one-time.
- Invalid secrets and codes return neutral errors and verification attempts are audited. Public summaries reveal only the public case number and a masked delivery destination after possession of a valid high-entropy link.

## Commercial documents and approval (enforced server-side)

The commercial workflow uses two **immutable document types** on `proposal_versions`
(`document_type`): a **preliminary estimate** (after remote review) and, after the
patient arrives, a **final treatment quote** (after in-person assessment). Every
proposal is built from an **APPROVED** clinical review; coordinators can never edit
medical scope, provider prices, or the internal margin.

### Conditional Operations / Finance gates (backend-computed)

Approvals are **not** always required. The backend computes `operationsRequired`,
`financeRequired`, `financeReasons`, the completion flags, and `readyForRelease`
(returned on the workspace); the UI drives the Operations/Finance/Release actions
from those fields, never from `proposal.status`. The four paths:

| Pricing | Travel package | Operations | Finance | Release |
|---|---|---|---|---|
| All pre-approved catalog | No | not required | not required | coordinator releases immediately |
| All catalog | Yes | required | not required | after Operations |
| Manual / off-catalog / mixed | No | not required | **required from `CLINICALLY_APPROVED`** | after Finance |
| Manual / off-catalog / mixed | Yes | required first | required second | after both |

Finance is also required for expired/inactive catalog prices, a missing EGP base
price, a missing applicable commercial policy, or a requested policy exception. The
ordinary centrally-calculated margin does **not** by itself require case-level Finance.

### Pricing, margin and currency

Prices are held in **EGP**. A central **commercial policy** (configured by a senior
Finance user, versioned and audited — not a per-case slider; standard band ~10–15%,
12% default) supplies the internal margin, which is **baked into an inclusive
patient package** and never itemized or exposed to the patient. Estimates carry
min/expected/max **ranges**. At release the EGP→display-currency FX rate, the policy
id/version/rate, the margin, and the patient totals are **snapshotted and frozen**.
The preliminary and final documents may have different snapshots.

### Preliminary estimate

`CLINICAL_RECOMMENDATION_READY` → `PROPOSAL_PREPARATION` → (`PROPOSAL_INTERNAL_APPROVAL`
only when Finance is required) → `PATIENT_DECISION` → `ACCEPTED | DECLINED |
REVISION_REQUESTED | EXPIRED`.

Creation never sends anything; the coordinator's separate **release** action mints the
secure link. `ACCEPTED` means the patient **acknowledged the preliminary estimate and
chose to continue** — it is not acceptance of a final plan and not medical consent.

### Final treatment quote (case stays `ARRIVAL_CONFIRMED`)

After `ARRIVAL_CONFIRMED`, the treating doctor records a final assessment and the
coordinator issues a `FINAL_TREATMENT_QUOTE` that reuses the **locked** policy rate
from the preliminary and recalculates against the confirmed scope (a smaller scope
lowers both the package price and the internal margin). Operations is not required
again; Finance only for manual/exception pricing. Releasing the final quote and the
patient's final decision (`ACCEPTED | REVISION_REQUESTED | DECLINED`) **do not move
the macro case off `ARRIVAL_CONFIRMED`** — final revision/decline/expiry keep it there
and allow a new final-quote version.

### Deposit and payment sub-workflow

Deposit and payment state live in dedicated tables (`deposits`, `deposit_components`,
append-only `payment_events`) and are **never** added to `medical_cases.status`. When
the patient acknowledges the preliminary estimate, the backend creates a deposit from
the active **deposit policy** — a senior-Finance-configured, versioned central policy
(default: a **3,000 EGP coordination-initiation** component, PLATFORM beneficiary,
credited to the final balance). Provider-reservation and travel components are added
later per booking. Payments are **offline record-only** in this build: Finance records
receipts and refunds with recent authentication, each idempotent by key and appended
to the ledger; the deposit status is recomputed from the ledger. No card data is
stored and the patient never sees a paid status without a recorded receipt. Confirming
a non-cancellable booking is gated on the required deposit being `PAID`. At the final
quote, eligible deposits are credited and the remaining balance or refund is shown.

The patient sees this through the secure proposal view: the preliminary estimate shows
a **"What you pay now"** coordination-deposit figure (the amount that will be due on
acknowledgement, credited to the final balance), and the final quote shows the amount
**already paid and credited**. The public proposal DTO exposes these deposit figures
and the min/expected/max package totals converted at the frozen rate, but never the
provider net cost, the margin rate, or the profit amount.

### Delivery, resend and treatment prerequisites

Releasing mints a high-entropy, case-scoped secure token (only its hash is stored)
and one idempotent, neutral outbox notification carrying only the link — never
clinical, pricing, or document content. A coordinator **resend** revokes the prior
link and OTP challenges and mints a fresh token without creating a new version or
moving the case. Normal treatment commencement additionally requires the accepted
final quote (when one exists) **and** a doctor-captured procedure-specific consent
(or an audited emergency break-glass override); financial acceptance is never medical
consent. Decisions apply to the exact released version; superseded, revoked,
already-decided and expired versions are rejected.

### Legacy compatibility

Existing proposal versions are treated as preliminary estimates; historical `ACCEPTED`
preliminary decisions remain valid legacy acknowledgements. No released document is
ever edited in place.

## Case-state model

Canonical lifecycle (one authoritative server-side transition map; every UI control derives from it):

`DRAFT → RECEIVED → INTAKE_REVIEW ↔ INFORMATION_REQUIRED → READY_FOR_CONSULTANT → CONSULTANT_ASSIGNMENT_PENDING → CONSULTANT_REVIEW → CLINICAL_RECOMMENDATION_READY → PROPOSAL_PREPARATION → PROPOSAL_INTERNAL_APPROVAL → PATIENT_DECISION → ACCEPTED → TRAVEL_COORDINATION → ARRIVAL_CONFIRMED → TREATMENT_IN_PROGRESS → DISCHARGED → FOLLOW_UP → CLOSED`

Corrections encoded in the model:
- Patient verification/login does **not** move `RECEIVED → INTAKE_REVIEW`; coordinator ownership drives intake.
- A doctor never cancels the whole case. Consultant-review outcomes are distinct: more information required (`INFORMATION_REQUIRED`), not clinically suitable (`CLINICALLY_NOT_SUITABLE`), return to coordinator (`INTAKE_REVIEW`), reassignment/second opinion (ends the assignment, returns to `READY_FOR_CONSULTANT`).
- A declined doctor assignment ends and returns the case to `READY_FOR_CONSULTANT`.
- Recovery paths: `REVISION_REQUESTED → PROPOSAL_PREPARATION`, `EXPIRED → PROPOSAL_PREPARATION`.
- `CANCELLED` is reachable only from coordinator-controlled states — it represents service cancellation, distinct from patient decline (`DECLINED`) and clinical unsuitability (`CLINICALLY_NOT_SUITABLE`).
- Legacy statuses (`NEW`, `COORDINATOR_REVIEW`, `RECOMMENDATION_READY`, `TREATMENT_COORDINATION`, `CLAIM_PENDING`, `PROPOSAL_READY`) were migrated to canonical equivalents and removed from the constraint in migration V6.
- Detailed payment/visa/booking/travel/treatment/follow-up state lives in dedicated sub-workflow tables (`travel_plans`, `treatment_episodes`, `follow_up_plans`), not the main case status.

## Patient-facing status language

Internal statuses are mapped to calm patient wording (English/Arabic parity), e.g. `CLINICAL_RECOMMENDATION_READY` → "Treatment recommendation ready" (never "Accepted"); `PATIENT_DECISION` → "Waiting for your decision"; `ACCEPTED` → "Proposal accepted".

## Task lifecycle and visibility

Tasks carry a validated type, encrypted title/description and completion evidence, owner role/person, priority, due date, blocking flag, status, version, visibility, and audit history. Assigned staff can start and complete their own tasks; leads/admins can cancel or reassign exceptions; optimistic locking rejects stale updates. Open or in-progress blocking tasks prevent protected forward transitions.

Internal tasks are never returned to patients. A patient-owned task is marked `PATIENT_ACTION`; before account activation its safe action is presented through the purpose-scoped information-response journey, while an account-linked patient can see only their own patient-action items. Internal notes and staff instructions are never copied into patient notifications.

## Message-thread membership (enforced on the server)

| Thread | Members | Patient-visible |
|---|---|---|
| `PATIENT_COORDINATOR` | patient/representative ↔ coordinator | yes |
| `COORDINATOR_DOCTOR` | coordinator ↔ doctor | no |
| `COORDINATOR_OPERATIONS` | coordinator ↔ operations | no |
| `COORDINATOR_FINANCE` | coordinator ↔ finance | no |

- The thread a role may post to is fixed by a server-side map; the client-supplied `internalOnly` flag is ignored — `internal_only` is derived from the thread type.
- Workspace message reads are scoped to the actor's allowed threads (not client-side filtering). Doctors cannot see or post to the patient thread; operations/finance see only their own thread.
- Message bodies are encrypted at rest. Sender name/role, direction, timestamp, and per-user read state are returned to authorized members. Patient notifications contain a fresh secure status link and never the message body.

## Notification privacy

WhatsApp/email notifications carry only a code or a secure link and no clinical narrative, documents, pricing, or identifiers. Delivery uses a transactional outbox with idempotency keys, bounded retries, and dead-letter handling.

## Ownership, assignments, travel/treatment/follow-up

Every submitted case has one active primary coordinator; a coordinator lead can view the queue and rebalance within their configured team. Coordination, Operations, and Finance each support multiple leads with distinct teams; a staff member has one direct lead in the same function, and leads can view cases assigned to direct or indirect reports. Normal coordinators can see limited routing data for unclaimed work and full details only after ownership. Doctors and ordinary Operations/Finance staff see only cases with a pending or active assignment to their identity; ended/declined assignments lose access. Lead visibility is supervisory and does not replace the accepted assignment required to perform protected case work. Representatives require an active scoped delegation; auditors are read-only. Only an available `VERIFIED` consultant with a current verified credential can receive a clinical assignment; an hourly expiry job marks expired credentials and removes an ineligible practitioner from availability. Accepted cases proceed through travel coordination, confirmed arrival, treatment, discharge, and follow-up; each change is authorized against an active assignment, guarded by version/state checks and blocking tasks, and recorded in status history and audit events.

## Recovery, expiry, and activation

- A doctor decline or reassignment ends that assignment and returns the case to `READY_FOR_CONSULTANT`.
- A coordinator information request moves the case to `INFORMATION_REQUIRED`; a verified secure response completes patient blocking actions and returns it to `INTAKE_REVIEW`.
- A revision or expired proposal can produce a new immutable proposal version, which repeats only the **required** Operations/Finance gates and the release step. Old links are revoked.
- A scheduled expiry job atomically marks released/viewed proposal versions `EXPIRED`, revokes their links, and moves a case still awaiting decision to `EXPIRED`.
- Acceptance is committed before the account-activation invitation is processed by the outbox. Activation is one-time and links the existing patient profile; a delayed notification cannot reverse acceptance.
