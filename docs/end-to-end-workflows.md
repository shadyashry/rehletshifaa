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
8. The proposal completes internal approvals (operations → finance → coordinator release).
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

## Proposal approval sequence (enforced server-side)

`CLINICAL_RECOMMENDATION_READY` → `PROPOSAL_PREPARATION` → `PROPOSAL_INTERNAL_APPROVAL` → `PATIENT_DECISION` → `ACCEPTED | DECLINED | REVISION_REQUESTED | EXPIRED`

- A proposal must be based on an **APPROVED** clinical-review version.
- Operations confirms feasibility (`OPERATIONS_COMPLETED`); finance re-authenticates and approves commercial terms (`FINANCE_APPROVED`); the coordinator releases the exact finance-approved immutable version (`RELEASED`).
- There is **no create-and-release shortcut** — `PROPOSAL_PREPARATION` can only advance to internal approval, and the release endpoint is the only place a patient link is minted.
- Decisions apply to the exact released version; superseded, revoked, already-decided, and expired versions are rejected. A revision creates a new version and repeats the gates. Expiry updates both proposal and case state.
- Proposal acceptance is separate from procedure-specific medical consent.

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
- A revision or expired proposal can produce a new immutable proposal version, which repeats operations, finance, and release gates. Old links are revoked.
- A scheduled expiry job atomically marks released/viewed proposal versions `EXPIRED`, revokes their links, and moves a case still awaiting decision to `EXPIRED`.
- Acceptance is committed before the account-activation invitation is processed by the outbox. Activation is one-time and links the existing patient profile; a delayed notification cannot reverse acceptance.
