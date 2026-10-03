# Consultant virtual clinic & consultant routing

Status: **Phase 1 implemented** (2026-09-25, migration `V53__consultant_virtual_clinic.sql`).

Operating model: **Consultant → one Virtual Clinic → optional Practice Managers.** Every consultant is independent,
cases are assigned directly to a named consultant, and nothing in this model uses provider organizations, hospitals,
clinic networks, organization membership or organization routing. The provider-organization modules are untouched
and are not connected to this workflow.

## 1. The consultant workflow before this change

- The coordinator classified the case care area and picked from `/coordinator/doctors`: every verified,
  available consultant, keyed by identity-provider **subject**, filtered in the browser by care area.
- `JourneyService.assign` re-checked care area + VERIFIED + AVAILABLE + `ProviderCredentialEligibility.eligible`
  (the direct credential rule, or — for a consultant adopted into provider credentialing — an organization-scoped rule).
- The consultant accepted (→ `CONSULTANT_REVIEW`) or declined (→ `READY_FOR_CONSULTANT` + coordinator work).
- "Request second opinion" (`REASSIGN`) actually **ended the consultant's own assignment** and returned the case to
  `READY_FOR_CONSULTANT`; there was no transfer, no limited second opinion and no confirmation step.
- The consultant's price list (`consultant_service_catalog`) was maintained only by platform administrators.

## 2. What phase 1 adds

### Eligibility (`clinic.application.ConsultantEligibilityService`)
One rule, used by coordinator assignment, referral confirmation/suggestion and the clinic's "assignable" indicator:
consultant profile with a linked sign-in and an account that is not disabled; credentialing `VERIFIED` **and** at least
one verified credential that has not expired; availability `AVAILABLE`; care area = primary care area **or** an
`APPROVED` structured `CARE_AREA` capability. Organization membership plays no part. A consultant whose credentials
moved to the provider credential workflow fails closed here (their direct credentials are not the authority).

The coordinator sees, per eligible consultant: specialty, subspecialty, approved capabilities, languages, usual
review time, active cases and pending offers, and why they match. The coordinator still chooses.
Care area is the first filter; `consultant_capabilities` (`CARE_AREA`, `SUBSPECIALTY`, `PROCEDURE`, `AGE_GROUP`,
`LANGUAGE`) is the structure for later filters. Capabilities are approved only by credentialing
(`/api/v1/admin/practitioners/{id}/capabilities`, no self-approval).

### Direct assignment
`POST /coordinator/cases/{id}/consultant-assignment {practitionerId}` resolves the consultant server-side and runs the
unchanged `JourneyService.assign` (ownership, state, eligibility, work item, audit). The legacy subject-based
`/coordinator/cases/{id}/assignments` keeps working (Journey runtime `ASSIGN_CONSULTANT` handler uses it).
The UI no longer sends or shows subjects.

### Referrals (`journey.application.ConsultantReferralService`)
| Step | Who | Effect |
|---|---|---|
| Refer (`TRANSFER` or `SECOND_OPINION`) | the case's primary consultant, case in `CONSULTANT_REVIEW` | clinical reason (encrypted), optional suggested care area / capability / consultant (eligibility validated). `AWAITING_COORDINATOR`; coordinator work `CONFIRM_TRANSFER`/`CONFIRM_SECOND_OPINION`. No access granted. |
| Confirm | owning coordinator | chooses an eligible consultant (≠ referrer, not already on the case). A `PENDING` assignment typed `TRANSFER`/`SECOND_OPINION` is created. `AWAITING_CONSULTANT`. |
| Decline | owning coordinator | reason required; referrer notified. |
| Accept transfer | receiving consultant | in one transaction the original assignment ENDS and the offer becomes the `PRIMARY` assignment; clinical work moves to them; case care area follows the confirmed area. Case stays `CONSULTANT_REVIEW`. |
| Accept second opinion | receiving consultant | `SECOND_OPINION` assignment `ACTIVE`: read the case + submit one opinion. Cannot record the clinical decision, treatment, messages or tasks (all require a non-referral assignment). |
| Submit opinion | second-opinion consultant | opinion stored (encrypted) and visible to the referrer and coordinator; the assignment ENDS, and with it the access. |
| Decline offer | receiving consultant | offer `DECLINED`; referral back to `AWAITING_COORDINATOR`; original consultant stays primary; case never drops to `READY_FOR_CONSULTANT`. |
| Clinical decision recorded | primary consultant | open transfers are `WITHDRAWN` and any pending offer ended. |

"Return to the coordinator for different routing" remains the existing `RETURN_TO_COORDINATOR` clinical outcome.
The old `REASSIGN` decision is still accepted by the API (backward compatibility, Journey runtime) but is no longer
offered in the consultant UI. Every step writes `audit_events` against the case, and every offer/acceptance/decline
is a row in `case_assignments` (assignment history).

Invariants: exactly one primary consultant; referral assignment types never stand in for "the case's consultant"
(`withAssignments`) and never satisfy `requireActiveAssignment`.

### Virtual clinic (`clinic.application.VirtualClinicService`, `/api/v1/clinics/**`)
One `virtual_clinics` row per consultant (primary key = practitioner id; backfilled for existing consultants, created
on consultant creation and lazily on first access). Contents: professional profile (read-only; verified by
RehletShifaa), public profile (draft → consultant approval → published), availability + expected review time,
consultation slots, professional services & price list, practice managers, change history.

Services: `consultant_service_catalog` gained kind, description, included/excluded scope, currency (EGP only — patient
currency is applied on the proposal), price range, effective date, revision and approval status. Every clinic-side
change is a `clinic_service_changes` record (`CREATE`/`UPDATE`/`RETIRE`/`ACTIVATE`): the consultant's own change applies
immediately; a practice manager's change waits for the consultant unless the consultant switched approval off for
their managers (then it is marked `APPLIED_WITHOUT_APPROVAL`). Applied changes are the version history. Approval fails
if the service changed after the change was prepared (catalogue `version`, which platform price-list edits also bump).
Allowed kinds are the consultant's own professional services only; hospital charges, implants, accommodation, travel
and third-party services are rejected. The existing clinical-review estimate picker ignores services whose
effective date has not arrived.

### Practice managers — permissions and access control
- Invited by the consultant (identity invite, no realm role — the delegation lives in `practice_managers`).
- Explicit permissions: `SCHEDULE`, `PROFILE`, `SERVICES`. Approvals, availability, settings, managers and the change
  history are **consultant-only**.
- A delegation grants nothing outside `/api/v1/clinics/{id}`: case, document, message, clinical, credential and
  capability endpoints authorize by role + case assignment, and a practice manager has neither. Tested: a manager with
  every permission gets 403 on the consultant's case workspace, documents and referrals.
- Revoked delegations, and delegations to a disabled consultant, lose access immediately.
- UI entry: consultants get a "Virtual Clinic" button in the portal; an account whose only access is a managed clinic
  lands on `/{locale}/portal/virtual-clinic`.

## 3. Data model (V53)
`virtual_clinics`, `practice_managers`, `consultation_slots`, `clinic_service_changes`, `consultant_capabilities`,
`consultant_referrals`; additive columns on `consultant_service_catalog`. No existing migration changed.

## 4. Verification
- Backend: `ConsultantVirtualClinicTest` (11 tests: eligibility incl. expiry/unavailable/disabled/capability,
  self-approval, decline compatibility, transfer, declined transfer, ownership, second-opinion limits and end of
  access, manager prepare/approve/version history, stale change, approval switch, profile approval, optimistic lock,
  slot overlap, availability, manager isolation from cases, revocation). Full suite: 547/548 — the one error is an
  order-dependent OTP lookup in `PatientActivationJourneyTest` that passes alone (pre-existing).
- Frontend: `VirtualClinic.test.tsx`, `ConsultantRouting.test.tsx`, updated `ClinicalReview.test.tsx`; full vitest
  431/431; `pnpm typecheck` clean; no new lint findings.
- Not run: live tunnel E2E / visual review (needs a rebuild of the stack).

## 5. Deferred (next phases)

The sequenced plan for everything below, and for platform governance and organization retirement, is
[`platform-control-plane/customer-governance-target-architecture-reviewed.md`](platform-control-plane/customer-governance-target-architecture-reviewed.md)
(revision 5, phases VC1b–VC6 and O1–O4).

1. **Admin UI** for approving/revoking consultant capabilities (backend endpoints exist; Control Center screen not built).
2. **Capability-based filters** beyond care area in the coordinator picker (subspecialty, procedures, adult/pediatric, language).
3. **Patient booking** of consultation slots, appointments and their non-clinical details; slot editing UI (the API supports update).
4. **Public profile publication** on the marketing site (`/consultants`) — the published profile is stored but not yet rendered publicly.
5. **Practice-manager invites for existing accounts** (today an email that already has an identity account is refused).
6. Referral withdrawal by the referring consultant; referrals outside `CONSULTANT_REVIEW` (e.g. post-arrival).
7. Version history for platform-side (admin/template/CSV) price-list edits — only clinic-side changes are versioned.
8. Journey-runtime (Flowable) stage for referrals; today referrals run on the live assignment workflow only.
