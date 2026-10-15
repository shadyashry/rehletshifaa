# Incidents, guardians, age band and reopening (P1-13)

Source: `docs/platform-review-2026-10-14.md` findings A-05 and A-06; phase entry in
`docs/platform-review-implementation-plan-2026-10-14.md`. Migration `V97__guardians_incidents_reopen.sql`.
P1-16 (treatment evidence) and P1-18 (follow-up execution) write to these models; read this before changing them.

## 1. Age band (A-05)

| Where | What |
|---|---|
| `medical_cases.age_band` | `UNDER_12`, `AGE_12_17`, `AGE_18_64`, `AGE_65_PLUS`, or NULL = not stated. `casemanagement.domain.AgeBand`. |
| Intake | Optional `ageBand` on `CreateCaseRequest` and `NewCaseForPatientRequest` (signed-in next case, and the case sent for someone else). It becomes required on the wire when the form sends it (UI session). |
| Correction | `PUT /api/v1/coordinator/cases/{id}/age-band` (`CASE_COORDINATE`, case owner). Audited as `CASE_AGE_BAND_RECORDED` with `from -> to`. |
| Staff view | `CaseView.ageBand` (coordinator and consultant views; null in the patient's own view). |
| Rule | The two minor bands mean the patient cannot consent alone. A missing band is treated as an adult until a coordinator records it. |

Not done: Consultant matching on the `AGE_GROUP` capability (a decision: it can empty the eligible pool), deriving the band from
a date of birth given at activation, what happens to a guardian's authority at 18.

## 2. Guardian delegation (A-05)

`patient_representatives` gains `delegation_type` (`REPRESENTATIVE` | `GUARDIAN`), `legal_basis` (`PARENT` | `LEGAL_GUARDIAN` |
`COURT_ORDER`), `evidence_document_id` (a `medical_documents` row of the same case, status `CLEAN`), `evidence_verified_at/by`.
Named checks: a guardian has a basis, a representative has none; verification needs a document.

Rules (`GuardianService`, `CustomerReadinessService`, `OnboardingService`):

- A minor's onboarding is created as a `GUARDIAN` onboarding (`OnboardingService.createForAcknowledgement`); choosing PATIENT,
  REPRESENTATIVE or PAYER for a minor is refused (`MINOR_REQUIRES_GUARDIAN`). A coordinator recording a minor band moves an
  open onboarding to GUARDIAN; a completed one is not rewritten and shows the `MINOR_REQUIRES_GUARDIAN` blocker.
- At intake the signed-in account that sends (or is confirmed to act for) a child becomes a guardian when its relationship is
  `PARENT` (basis PARENT) or `GUARDIAN` (basis LEGAL_GUARDIAN); any other relationship stays a representative.
- A guardian counts only when the evidence is verified. Readiness blockers, in order: `GUARDIAN_AUTH_MISSING` (no delegation) →
  `GUARDIAN_EVIDENCE_MISSING` (patient owes a document) → `GUARDIAN_EVIDENCE_UNVERIFIED` (a coordinator owes the check; deferred at
  submit, gating at treatment coordination; owner STAFF in `CaseActionService.readinessBlockers`).
- Evidence: `PUT /api/v1/patient/cases/{id}/onboarding/guardian-evidence {documentId}` (or `evidenceDocumentId` when choosing GUARDIAN);
  decision: `POST /api/v1/coordinator/cases/{id}/guardian/evidence-decision {VERIFY|REJECT}`; read: `GET .../guardian`.
  Re-attaching clears a verification; a refusal drops the document link (the coordinator explains in the case thread).
- Consent: `GUARDIAN_AUTHORIZATION` is its own consent type (replaces `REPRESENTATIVE_AUTHORIZATION` for a GUARDIAN subject), recorded
  in `consent_records` with policy version `guardian-v0-placeholder`. **The wording is a placeholder** (backend
  `PatientActivationService.consentText`, frontend `guardianConsent.text` in `en.json` and `ar.json`, same words). Counsel and a
  native Arabic reader replace it; bump the version then so earlier consents can be found and re-asked.

## 3. Incidents (A-06)

`case_incidents` (entity `journey.domain.CaseIncident`, service `IncidentService`).

| Field | Values / meaning |
|---|---|
| type | `COMPLAINT`, `DISPUTE`, `ADVERSE_EVENT`, `DEATH` (always `CRITICAL`, staff only; also a DB check) |
| severity | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (patient complaint = MEDIUM, patient-reported health problem = HIGH) |
| status | `OPEN` → `UNDER_REVIEW` → `RESOLVED` (final; a new concern is a new incident) |
| source | `PATIENT`, `STAFF`, `SYSTEM` |
| summary, resolution_note | encrypted at rest, never in audit or notifications |
| resolution | `NO_ACTION_NEEDED`, `EXPLAINED_TO_PATIENT`, `CORRECTIVE_ACTION`, `REFERRED_TO_PROVIDER`, `REFERRED_TO_AUTHORITY`, `WITHDRAWN_BY_PATIENT` + a note (required) |

Routing: owner = a Care Coordination Manager, never the case's coordinator, never the reporter; the manager who already owns an
unresolved incident of the case, else the one with the fewest. No manager: the incident stays unowned (visible to Compliance).
The owner gets one `INCIDENT_REVIEW` work item (2 working days, survives the case's exit). CRITICAL tells every other manager;
`ADVERSE_EVENT` and `DEATH` tell the case's Consultant. The coordinator a patient complains about is told nothing.

Permissions (`RolePolicy`): `INCIDENT_REPORT` (patient and representative on their case; coordinator owner, Consultant, Operations,
Finance on an assigned case), `INCIDENT_MANAGE` (Care Coordination Manager; only the owner reviews, changes severity or resolves,
any manager may assign), `INCIDENT_READ` (Care Coordination Manager, Compliance auditor).

Endpoints (`SafetyController`): patient `POST|GET /api/v1/patient/cases/{id}/concerns` (type COMPLAINT or ADVERSE_EVENT; the patient
sees type, status, dates only); staff `POST /api/v1/incidents/cases/{id}`; managers and Compliance `GET /api/v1/incidents`
(`status`, `type`, `mine`), `GET /incidents/{id}`, `GET /incidents/cases/{id}`; owner `POST /incidents/{id}/review|severity|resolve`,
manager `POST /incidents/{id}/assign`.

**For P1-16 and P1-18:** raise through `IncidentService.raiseFromSystem(caseId, type, severity, summary, originLabel)` inside the
caller's transaction (a complication milestone: `ADVERSE_EVENT`; an outcome that reports one: `ADVERSE_EVENT`). Do not write
`case_incidents` directly. Pass the incident id to `ReopenRequest.incidentId` when it causes a reopening.

## 4. Reopening a closed case (A-06)

`CLOSED → FOLLOW_UP`, only through `CaseReopenService.reopen` (the coordinator's generic transition still refuses FOLLOW_UP). The
move goes through `CaseTransitionPolicy` (`CLOSED` is no longer terminal; its one exit is `FOLLOW_UP`), writes the status history with
`REOPENED: <reason>`, an append-only `case_reopenings` row (reason, encrypted note, optional incident) and audit `CASE_REOPENED`.
The case's Consultant (the existing ACTIVE `DOCTOR` assignment, so "the same Consultant") gets a `FOLLOW_UP_REVIEW` item (2 working
days); the coordinator is told.

Who: `CASE_REOPEN` for Care Coordination Managers and the case's own Consultant. The patient raises a concern; a manager decides.
Reasons: `COMPLICATION_REPORTED`, `PATIENT_REQUEST`, `CLINICAL_FOLLOW_UP_NEEDED`, `INCIDENT_REVIEW`.
Endpoints: `POST /api/v1/coordinator/cases/{id}/reopen` (manager), `POST /api/v1/doctor/cases/{id}/reopen` (Consultant).

Not touched (P1-18): the 30-day window, the closure statement and review request, patient-visible wording of a reopened case.
