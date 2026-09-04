# End-to-end care workflows

## Three distinct identity concepts

The platform deliberately separates three things that used to be conflated:

1. **Provisional patient record** — created internally the moment an anonymous case is submitted. No account, no password, no OTP is required to create it.
2. **Verified identity** — a purpose-scoped, expiring, OTP-protected proof of contact ownership, required only for *sensitive pre-acceptance actions* (viewing clinical detail/pricing, deciding on a proposal). Verification never changes the operational/clinical case status.
3. **Activated account** — a full patient account, **offered only after a proposal is accepted**. Activating it links the existing provisional profile — and therefore every related case — to the newly authenticated identity automatically.

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
9. Release mints the random, expiring, case-scoped **secure proposal link** and moves the case to `PATIENT_DECISION`. The patient verifies identity (OTP → short-lived view grant) before any clinical recommendation, risk, pricing, or document is exposed.
10. The patient accepts, declines, or requests a revision — recorded against the exact released version.
11. On `ACCEPTED`, an account-activation invitation is sent to the already-verified contact.
12. Activation links the existing profile and all related cases automatically (no manual case UUID/code re-entry).
13. After activation the patient lands in "My Journey".
14. A patient who declines needs no account. A revision stays in the verified-link journey until acceptance.
15. Activation failure or delay never undoes proposal acceptance (acceptance is persisted independently).

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

Every submitted case has one active primary coordinator; a coordinator lead can view the queue and rebalance. Normal coordinators can see limited routing data for unclaimed work and full details only after ownership. Doctors/operations/finance see only cases with a pending or active assignment to their identity; ended/declined assignments lose access. Representatives require an active scoped delegation; auditors are read-only. Only an available `VERIFIED` consultant with a current verified credential can receive a clinical assignment; an hourly expiry job marks expired credentials and removes an ineligible practitioner from availability. Accepted cases proceed through travel coordination, confirmed arrival, treatment, discharge, and follow-up; each change is authorized against an active assignment, guarded by version/state checks and blocking tasks, and recorded in status history and audit events.

## Recovery, expiry, and activation

- A doctor decline or reassignment ends that assignment and returns the case to `READY_FOR_CONSULTANT`.
- A coordinator information request moves the case to `INFORMATION_REQUIRED`; a verified secure response completes patient blocking actions and returns it to `INTAKE_REVIEW`.
- A revision or expired proposal can produce a new immutable proposal version, which repeats only the **required** Operations/Finance gates and the release step. Old links are revoked.
- A scheduled expiry job atomically marks released/viewed proposal versions `EXPIRED`, revokes their links, and moves a case still awaiting decision to `EXPIRED`.
- Acceptance is committed before the account-activation invitation is processed by the outbox. Activation is one-time and links the existing patient profile; a delayed notification cannot reverse acceptance.
