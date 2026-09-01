# End-to-end care workflows

## Ownership model

Every submitted case has one active primary coordinator. A coordinator lead can view the full queue, rebalance ownership, and cover absences. Doctors, operations, and finance users see only cases explicitly assigned to their identity. Patient representatives require an active, scoped delegation record. Auditors are read-only.

## Patient identity and follow-up

An unknown patient may submit a case without an account. Intake creates a provisional patient profile and a hashed, short-lived, single-use claim challenge. The raw code is sent through the durable notification outbox and is never stored as plaintext in the challenge table. After OIDC sign-in, the patient enters the case UUID and code. The API rate-limits attempts, rejects expired/replayed challenges, binds the external identity subject, and exposes all owned cases in the patient portal.

## Coordinator journey

New submissions enter a shared intake queue. A coordinator claims primary ownership, verifies completeness, exchanges secure patient messages, creates blocking tasks, and moves the case through explicit state transitions. The coordinator assigns only credentialed doctors and remains the communication owner across clinical, operational, travel, treatment, and follow-up stages.

## Doctor onboarding and workspace

Credentialing administrators create a practitioner profile, record evidence and source references, and approve or reject it. Only a `VERIFIED` practitioner linked to an OIDC subject can receive a case. The doctor accepts or declines assignments, communicates through the coordinator-doctor thread, creates immutable clinical-review versions, and reauthenticates before final approval. The workspace keeps active, completed, and follow-up cases in one longitudinal view.

## Proposal approval

An approved clinical review is the mandatory source for a proposal. A coordinator creates a new version with included/excluded services, itemized pricing, terms, validity, and disclaimers. Operations confirms delivery and travel feasibility; finance reauthenticates and approves commercial terms; the coordinator releases an immutable HTML snapshot. The patient sees only released versions and reauthenticates to accept, decline, or request revision. Proposal acceptance is explicitly separate from procedure-specific medical consent.

## Travel, treatment, and follow-up

Accepted cases proceed to travel coordination, confirmed arrival, treatment episodes, discharge, and scheduled follow-up. Each change is authorized against case assignment, guarded by version/state checks, and recorded in status history and audit events.

## Canonical case states

`DRAFT → RECEIVED → INTAKE_REVIEW ↔ INFORMATION_REQUIRED → READY_FOR_CONSULTANT → CONSULTANT_ASSIGNMENT_PENDING → CONSULTANT_REVIEW → CLINICAL_RECOMMENDATION_READY → PROPOSAL_PREPARATION → PROPOSAL_INTERNAL_APPROVAL → PATIENT_DECISION → ACCEPTED → TRAVEL_COORDINATION → ARRIVAL_CONFIRMED → TREATMENT_IN_PROGRESS → DISCHARGED → FOLLOW_UP → CLOSED`

Controlled alternatives include revision, decline, expiry, cancellation, reassignment, and return for missing information.
