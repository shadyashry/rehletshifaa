# RehletShifaa Platform Control Plane — Acceptance Test & Handover Matrix

This is the minimum professional verification package for the Platform Control Plane epic. It supplements existing RehletShifaa SIT/QA/UAT coverage; it does not replace independent human QA/UAT.

---

## 1. Test dimensions

Every major capability must be exercised across:

- Happy path
- Validation failure
- Unauthorized role
- Wrong tenant
- Wrong resource relationship
- Stale version/concurrency
- Retry/idempotency
- Audit evidence
- EN/AR critical UI
- Responsive critical UI
- Backend direct API attempt (not only UI hiding)

---

## 2. Access Governance matrix

### AG-001 Default deny

**Given** authenticated user with no applicable permission  
**When** direct API request targets a protected resource  
**Then** 403 and no state/data leakage.

### AG-002 Cross-tenant denial

User with valid Practice Manager role in Provider A cannot read/edit Provider B resources by guessed ID.

### AG-003 Managed-clinician scope

Practice Manager manages Dr A but not Dr B in same organization; allowed for Dr A, denied Dr B.

### AG-004 Dependency rule

Selecting `clinical.recommendation.submit` requires dependent view/edit capability according to catalog; wizard explains addition.

### AG-005 Conflict rule

Self-verification or prohibited role combinations cannot publish.

### AG-006 Role version immutability

Published role v1 cannot be modified; editing creates v2 draft.

### AG-007 Effective access explanation

For user/resource/action, UI/API explains role/version, scope, relationship and allow/deny reason without leaking secrets.

### AG-008 Legacy compatibility

Existing Coordinator/Doctor/Operations/Finance users continue critical current journey behavior during migration.

### AG-009 Frontend not security boundary

Hidden action invoked manually by HTTP is still rejected.

### AG-010 Platform admin boundary

Technical System Administrator has no automatic clinical recommendation/finance/journey publish authority.

---

## 3. Provider Management matrix

### PM-001 Provider creation

Provider Operations Manager creates Provider Organization; unauthorized provider staff cannot.

### PM-002 Provider Operations Manager tenant scope

Manager assigned to Providers A/C cannot access B.

### PM-003 Consultant onboarding

Invite → profile → credentials → under verification → verified → operational setup → active.

### PM-004 Associate Doctor onboarding

Independent credential verification required; supervision relationship exists; final Consultant authority not inherited.

### PM-005 Practice Manager invitation

Provider Ops or Organization Owner can invite under policy; Practice Manager cannot self-promote to Organization Owner/platform role.

### PM-006 Consultant Assistant relationship

Assistant can access only Consultants/resources explicitly delegated and cannot submit final clinical recommendation unless a future explicit policy grants it.

### PM-007 Credential self-verification

Clinician who also holds verifier-like role cannot verify own credential.

### PM-008 Credential expiry

Expired mandatory credential causes clinician eligibility/readiness blocker according to policy without deleting historical verification evidence.

### PM-009 Provider readiness

Activation blocked with structured blockers when required clinician/service/credential/setup missing.

### PM-010 Provider activation idempotency

Double submit/retry creates one state transition/audit event.

---

## 4. Pricing matrix

### PR-001 Organization default

Clinician with no override resolves organization default service price.

### PR-002 Consultant override

Consultant-specific price wins according to configured inheritance.

### PR-003 Associate Doctor override

Where enabled, Associate Doctor explicit price resolves correctly.

### PR-004 Effective dates

Correct price version selected at boundary dates/timezone conventions.

### PR-005 Historical proposal stability

Publishing a new provider price never modifies an already released proposal amount/currency/FX/margin snapshot.

### PR-006 Practice Manager scope

Can edit pricing for managed clinicians only.

### PR-007 Finance separation

Finance can confirm payment according to finance permission but does not gain provider price-list edit by role implication.

### PR-008 Invalid money

Negative/invalid/unsupported currency/precision rejected server-side.

---

## 5. Availability matrix

### AV-001 Weekly template

Practice Manager creates recurring weekly availability for managed Consultant.

### AV-002 Exception

Leave/block exception overrides weekly schedule.

### AV-003 Overlap

Invalid overlapping configured intervals rejected.

### AV-004 Timezone

Stored/resolved using explicit clinician/provider timezone; no silent browser-local shift.

### AV-005 Consultant self management

Allowed only when effective permission includes `availability.manage_self`.

---

## 6. Credentialing matrix

### CR-001 Evidence access

Verifier can securely view allowed credential evidence; wrong tenant/role denied.

### CR-002 Verify

Verification stores verifier/time/status/evidence and audit.

### CR-003 Request more information

Status and notification generated without marking verified.

### CR-004 Reject/suspend

Reason required where policy says; clinical eligibility updated.

### CR-005 Concurrent review

Two verifiers cannot silently overwrite each other's decision; stale mutation conflicts.

---

## 7. Coordinator Team / Assignment matrix

### AS-001 Continuity first

Existing eligible case owner remains owner when new Coordinator work is generated.

### AS-002 Manual valid override

Explicit valid manual assignment takes precedence and is audited.

### AS-003 Preferred Coordinator

Consultant preferred Coordinator is selected when eligible/available/capacity-valid.

### AS-004 Preferred unavailable

Fallback goes to preferred team/provider team/scoring according to policy.

### AS-005 Provider mapping

Provider default team applied when no person preference.

### AS-006 Care-area mapping

Care-area default team used when provider mapping absent.

### AS-007 Eligibility filters

Inactive, out-of-scope, wrong-care-area, mandatory-language mismatch, on-leave, over-capacity candidates excluded with safe reason codes.

### AS-008 Weighted scoring

Known candidate fixtures produce deterministic expected score/result.

### AS-009 Tie-break

Equal score resolves by normalized load → longest since assignment → stable final key.

### AS-010 No candidate

Work goes to visible Team Queue and Care Coordination Manager notification/alert; not silently ownerless.

### AS-011 Explainability

Audit shows policy/version, route path, scores, result and reason.

### AS-012 Reassignment

Authorized manager reassigns with mandatory reason; previous/new owner and audit preserved.

### AS-013 Concurrency

Parallel assignment attempts produce one active assignment/owner.

### AS-014 Case owner vs task owner

Operations WorkItem can be owned by Operations while Coordinator remains primary Case Owner.

---

## 8. Journey configuration matrix

### JM-001 Create draft

Journey Manager clones/creates a draft without altering current published journey.

### JM-002 Add stage

Add registered stage through UI/list alternative; save/reload preserves graph.

### JM-003 Remove stage

Removing connected/blocking node requires valid rewiring/confirmation and cannot publish an invalid graph.

### JM-004 Reorder/replace

Supported stage can be moved/replaced using drag or accessible non-drag commands.

### JM-005 Unsupported action

Cannot inject arbitrary class/script/SQL/URL/action key.

### JM-006 Missing actor

Human stage without actor fails validation.

### JM-007 Unreachable stage

Validation identifies unreachable node.

### JM-008 Dead end

Validation blocks publish if required path cannot reach terminal outcome.

### JM-009 Decision completeness

All required decision outcomes mapped or validation fails.

### JM-010 Cycle safety

Invalid/unbounded accidental cycle caught; explicitly supported repeat/recovery flow represented safely.

### JM-011 SLA validation

Invalid timer values rejected.

### JM-012 Simulation

Synthetic scenario returns deterministic route/actor handoffs without creating a real case or WorkItem.

### JM-013 Publish authorization

Journey Manager without publish capability cannot publish; Approver can after valid state.

### JM-014 Atomic publish

If compile/deploy fails, version does not become published.

### JM-015 Published immutability

Published version cannot be edited.

### JM-016 Running-version pinning

Existing case on v1 stays v1 after v2 publish.

### JM-017 New case uses current version

New case binds to v2 after v2 is effective.

### JM-018 Current journey parity

International Care Journey v1 reproduces current expected happy/recovery paths.

### JM-019 WorkItem projection

Human journey stage creates/activates correct WorkItem, `waitingOn`, currentAction/availableActions.

### JM-020 Domain authority

Configuring sequence does not bypass domain guards, authorization, payment, identity, document, or clinical invariants.

---

## 9. Current International Care Journey regression

At minimum retain existing behavior for:

- anonymous intake/case creation;
- coordinator ownership and information request;
- Consultant assignment/decline/reassignment;
- Consultant review / recommendation / more-information / second-opinion / not-suitable/return paths;
- proposal preparation;
- conditional Operations/Finance gates;
- proposal release/security/OTP;
- patient decision/revision/decline;
- account activation and patient conversion/readiness;
- deposit creation/payment/waiver behavior;
- travel coordination gate;
- arrival/final assessment/final quote;
- treatment prerequisite/consent;
- discharge/follow-up/closure;
- cancellation and expiry/recovery paths;
- notification/thread privacy.

---

## 10. Admin UI functional matrix

Every visible button/tab/action must be mapped to backend behavior and test.

Required surfaces:

- Control Center nav
- Overview queues
- Providers list/detail
- Provider onboarding wizard
- Clinician/profile relations
- Credential queue/detail
- Practice team
- Services/Pricing
- Availability
- Access Role list/wizard
- Effective Access
- Journey list/version/designer
- Validate
- Simulate
- Submit/Approve/Publish/Retire
- Coordinator Teams
- Routing Policies
- Routing Simulation
- Consultant Preferences
- Assignment Audit
- Team Queue / manual assignment
- Audit screens

Test empty/loading/error/success/permission-denied/stale states.

---

## 11. Security matrix

Attempt direct API access for every resource family with:

- anonymous;
- Patient;
- wrong Provider staff;
- Practice Manager wrong clinician;
- Associate Doctor outside supervision;
- Consultant Assistant outside delegation;
- Coordinator wrong case;
- Provider Operations Manager wrong assigned organization;
- System Admin without business permission;
- valid privileged actor.

Verify 401/403 semantics and no cross-tenant metadata leakage.

---

## 12. Concurrency/idempotency matrix

Double/parallel/retry tests for:

- clinician invite;
- provider activate;
- credential verify;
- role publish;
- journey publish;
- automatic assignment;
- manual reassign;
- journey stage completion;
- existing proposal/payment high-value writes affected by cutover.

---

## 13. UX / accessibility / RTL matrix

Widths:

- 390
- 768
- 1024
- 1280
- 1440

English and Arabic for critical screens.

Verify:

- keyboard navigation;
- visible focus;
- dialog focus trap/restore;
- forms/errors linked;
- 200% zoom;
- no color-only status;
- Journey node/edge keyboard focus;
- non-drag add/reorder/connect alternative;
- graph labels readable;
- mobile Journey list editing does not horizontally overflow;
- RTL form/table/drawer/dialog arrangement;
- adequate touch target.

---

## 14. Performance sanity

Measure/observe at realistic synthetic size:

- provider list pagination;
- 100+ role permissions rendering without lockup;
- Journey Designer with representative node count;
- routing simulation over representative Coordinator pool;
- assignment decision execution latency;
- audit list pagination.

Do not pre-optimize with unsafe caching. Fix N+1/query explosions.

---

## 15. Handover artifacts

Before handover update/generate in repo:

```text
docs/platform-control-plane/implementation-status.md
docs/platform-control-plane/technical-decisions.md
docs/platform-control-plane/migration-inventory.md
docs/platform-control-plane/test-status.md
docs/platform-control-plane/api-contract-summary.md
docs/platform-control-plane/operational-guide.md
```

Final report includes:

- branch/base SHA;
- migrations;
- dependencies added + licenses/purpose;
- backend/frontend modules changed;
- seeded default roles/permissions;
- published test journey/routing fixtures;
- tests passed/failed/blocked;
- known defects by severity;
- migration/cutover state;
- rollback/feature toggle path where implemented;
- exact remaining work before production.

No claim of “no QA needed.” Target is a release candidate where independent QA/UAT validates rather than discovers obvious functionality/security defects.
