# QA deep test report — platform users, roles, hierarchy and journey governance

**Date:** 2026-10-04 · **Branch:** `codex/platform-control-plane` @ `652f47e` · **Role:** QA/QC test lead pass
**Scope:** governance bootstrap and owner → System Administrators → function managers → staff → teams, leads and
reporting lines; the role/permission/scope policy; step-up authentication; lifecycle; Journey Manager/Approver
governance; whether a journey change made in the designer really changes live behaviour.

## 1. Verdict

| Area | Verdict |
|---|---|
| Authorization core (deny-by-default, DB-only roles, scopes, step-up) | **Solid.** No escalation path found; every negative probe was refused with the right code. |
| Onboarding chain (admin → manager → staff → team/lead/line) | **Works end to end**, with one lifecycle dead end (QA-01) and a governance gap for the owner (QA-02). |
| Hierarchy coverage | **Partial by design:** only Care Coordination and Consultant Operations can have managed teams (QA-09). |
| Journey governance (maker/checker, versions, audit) | **Solid.** |
| "Journey change is dynamic, by drag and drop" | **Not true today.** The map is not drag-and-drop (QA-08). Edits are made through forms. A published change reaches **no live case** until deployment switches are set and the backend restarts (QA-10). |
| Regression net | **Was blind since A8:** 29 of 126 committed tests were red, all for one test-fixture cause. That is fixed in this pass (QA-00). |

## 2. Findings (most severe first)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| QA-00 | High (process) | 29 committed access/workforce/journey tests failed since A8: their sign-in fixtures carry no `acr`, so every step-up action was refused and dependent steps cascaded. The suites were not in A8's focused gate. **Fixed (test-only):** `AccessHygieneIntegrationTest`, `StaffLifecycleIntegrationTest`, `WorkforceRoleAssignmentIntegrationTest`, `JourneyDefinitionIntegrationTest` now sign in at `acr=3`. | Baseline 126 run: 7 F / 22 E → after fix all green |
| QA-08 | High | The journey map (`JourneyGraphCanvas`) passes no `onConnect`/`onNodesChange` to React Flow, and the "Steps" palette is empty. Dragging a node or drawing a connection changes nothing. Editing works only through the inspector form (add before/after, move earlier/later, connect via a select). Blueprint §31.3 asks for drag/drop **plus** a non-drag path; only the non-drag path exists. | `JourneyDesignerQa.test.tsx` QA-08 |
| QA-10 | High | **Live dynamism.** A published version drives new cases only when `JOURNEY_RUNTIME_ENABLED`, `JOURNEY_RUNTIME_PRODUCTION_INTAKE_ENABLED` and an `app.journey.cutover.policies[*]` rule are all set, which means a config change plus restart. Already-bound cases stay pinned to their version, and legacy cases never move. On dev all switches are off, no journey exists (0 versions, 0 deployments, 0 bindings), and nobody holds Journey Manager or Approver. The validator also warns `RUNTIME_NOT_DEPLOYED` on every check. | `docker exec … env`; live DB counts; `JourneyAdmissionDecisionService` |
| QA-04 | Major | A stage SLA passes validation and simulation, but `JourneyCompiler` refuses every SLA ("SLA projection is not available"). With the runtime on, publication deploys inside the publish transaction, so the last step fails with `JOURNEY_COMPILE_FAILED` after the whole maker/checker cycle. The inspector offers SLA fields. | `QaDefectReproductionTest.qa04` |
| QA-06 | Major | The designer accepts orders the case domain cannot execute (for example Release proposal → Clinical decision → Prepare proposal). The validator has no domain preconditions, and the simulator treats every staff/patient task as completed, so the dry run reports `COMPLETED`. At runtime the handler would refuse, and the case would stall. | `qa06` |
| QA-01 | Major | An **expired or cancelled invitation can never be re-sent to the same address**: `emailInUse` counts the closed INVITED person's email hash, giving `STAFF_EMAIL_EXISTS`. The spec says "INVITED → EXPIRED (re-invite creates a new invitation)". Re-hiring an offboarded person's email is blocked the same way. | `qa01`, `qa01b` |
| QA-02 | Major | GOV-02/SOD-03: the Platform Account Owner may approve a System Administrator appointment or removal. The code admits only `ACCESS_GOVERN` (administrators), so the owner gets `PERMISSION_NOT_HELD`. Consequence: with exactly two administrators neither can ever be removed, because the checker must be a third administrator. | `qa02` |
| QA-09 | Major (business gap) | `TEAM_MANAGE` exists only for `CARE_COORDINATION_MANAGER` and `CONSULTANT_OPERATIONS_MANAGER`. Operations, Finance, Credentialing, Care Journey, Support and Identity Review can have no teams, leads or reporting lines, so their `SUPERVISED` grants (for example Operations/Finance `TASK_SUPERVISE`, `CASE_READ`) can never fire. This is an open business decision, but it blocks a full hierarchy. | `PlatformUsersDeepQaTest` (manager refused for `FINANCE`) |
| QA-03 | Medium | Bootstrap requires the owner to be distinct from the System Administrators, but an ordinary transfer can hand ownership to an active administrator. | `qa03` |
| QA-07 | Medium | "Return to draft" is shown to `JOURNEY_EDIT` holders, who then get 403 because the backend requires `JOURNEY_APPROVE`. It is hidden from approvers who lack `JOURNEY_EDIT`, which is exactly who may use it. | `JourneyDesignerQa.test.tsx` QA-07/07b; backend proven in `JourneyGovernanceDeepQaTest` |
| QA-05 | Low | `/registry/metadata` reports `cyclePolicy: ACYCLIC_ONLY` while the validator accepts governed recovery loops (§22). | `qa05` |
| QA-11 | Low (gap) | SOD-05 (Credential Verifier ≠ the Consultant's Consultant Operations owner) is not modelled. STF-04 adoption and the STF-05 review state are missing: `IDENTITY_REVIEW_REQUIRED` is a dead end with no review queue. | code review |
| QA-12 | Observation | The Care Coordination Manager has no `CASE_READ` and does not supervise team cases; only designated leads do. Confirm this is intended. Disabling the only lead of a staffed team is not blocked (WF-12 covers only offboarding and role/lead removal), so the team is left unsupervised. | code review / `PlatformUsersDeepQaTest` |
| QA-13 | Observation (UAT readiness) | The dev seed has no Journey Manager, Journey Approver, Compliance Auditor, Support Officer or Patient Identity Reviewer, so those workspaces cannot be exercised live without an invitation round. | live DB |

## 3. What was proven correct (regression net added)

`backend/src/test/java/com/rehletshifaa/qa/PlatformUsersDeepQaTest` (9 scenarios):
- **Full chain:** admin invites a Care Coordination Manager → no authority while INVITED (`/me` shows only `ACTIVATE_ACCOUNT`) → MFA activation → exact workspaces, permissions, `managedFunctions`, step-up set. The manager files a staffing request, which an administrator executes. Two coordinators are invited and activated; the manager creates a team, adds members, designates a lead and sets a reporting line. Supervision is exactly lead → member, never upward or sideways, and every step is audited.
- **Activation:** provider unavailable → 503 code; disabled identity or missing MFA → refused; expired invitation → refused; a stranger cannot activate.
- **Escalation and SoD:** admin cannot manage teams, grant own roles, grant `SYSTEM_ADMINISTRATOR` directly, self-appoint, or approve own request. Support+Admin and Auditor+mutating role conflicts are enforced. An appointed admin is ineffective until MFA is recorded. A manager is confined to its own function and cannot invite, grant or read the directory. The auditor is read-only, and coordinators are refused.
- **Hierarchy:** cycles, self-report and non-lead managers are refused, and supervision is never transitive (OD-09).
- **Step-up matrix:** an admin needs LoA 3. Stale, future-dated or missing `auth_time` → `REAUTHENTICATION_REQUIRED`. Plain reads need no step-up, and step-up never substitutes for a role.
- **Lifecycle × authority:** INVITED, SIGNIN_DISABLED, OFFBOARDING, OFFBOARDED, CANCELLED, EXPIRED, inactive access subject, future/expired assignment, conflicting pair and admin-without-MFA all carry **zero** authority.
- **Lifecycle:** disable/restore/offboard (incl. stale revisions and terminal OFFBOARDED). Last-indefinite-administrator protection holds.
- **WF-12:** only-lead and role-removal blockers, team retirement with members, stale hierarchy and role revisions.
- **Policy table:** Admin has no case/clinical/finance/journey/team powers. Auditor is `*_READ` only, Support never sees cases, and Journey Manager and Journey Approver are disjoint. Every workforce role opens a workspace.

`backend/src/test/java/com/rehletshifaa/qa/JourneyGovernanceDeepQaTest` (5 scenarios):
- Only journey roles reach the designer (coordinator/admin refused, auditor read-only). There is one canonical journey. The maker cannot publish, the approver cannot edit, and publishing needs MFA. A dual-role editor cannot publish their own version (SOD-02). Return-to-draft is approver-only. History shows every action.
- **A designer change is honoured end to end:** reordering stages changes the simulated path and the compiled BPMN sequence flows, and leaves the published version immutable. Editing after a simulation discards the evidence and blocks submission. Stale revisions and parallel drafts are refused.
- Every registered action has a runtime handler and compiles.
- Hostile/malformed graphs are refused with stable codes (two starts, incoming start, control-with-action, wrong actor, missing wait condition, oversize label/graph, injected keys, duplicate edge keys, ungated branches), and labels are XML-escaped in BPMN.
- The governed recovery loop validates, and the dry run cannot hang (`LOOP_LIMIT_EXCEEDED`); declined and withdrawn branches end correctly.

`frontend/.../JourneyDesignerQa.test.tsx`: publish is disabled for a manager; a published version shows no edit controls; no journey content without `JOURNEY_READ`. QA-07, QA-07b and QA-08 are `it.fails` reproductions.

**Live stack (gateway :8081):** every admin, support, journey, owner-transfer and `/me` endpoint answers 401 to an anonymous call and to a forged `alg=none` token.

## 4. How to run

```bash
cd backend && mvn -o test -Dtest='PlatformUsersDeepQaTest,JourneyGovernanceDeepQaTest,IdentityOperationReinviteExecutionTest'
cd frontend && npx vitest run src/components/platform-control-center/JourneyDesignerQa.test.tsx src/components/platform-control-center/GovernancePages.test.tsx
```
All defect reproductions are now ordinary regression tests (section 7). The temporary `qa-defect` tag, its
reproduction class and the `pom.xml` exclusion were removed once the last defect was fixed.

## 5. Not covered in this pass

- A live Keycloak walkthrough of invite → email → TOTP enrolment → activation. Tokens need real OTP and WebAuthn, which automation cannot enrol here. The flow is covered with the identity provider mocked, and the A8 evidence covers the Keycloak side.
- Runtime-on journey admission was not re-run in this pass. The existing `JourneyCutoverIntegrationTest`, `JourneyProductionIntakeIntegrationTest` and `JourneyStageProjectionIntegrationTest` (now green again after QA-00) cover it.
- Practice Manager, consultant onboarding and patient/representative populations, except as negative probes.

## 6. Verification

- Backend, 207 tests (all access/workforce/journey suites + QA): **200 pass**. The 7 failures are exactly the `qa-defect` reproductions. With the default exclusion: green.
- Frontend: QA file 6/6 (3 behaviour + 3 `it.fails`); `pnpm typecheck` PASS.

## 7. Fix pass (2026-10-04, same day)

Every defect is fixed, and its reproduction is now an ordinary regression test. Gaps that need a business decision are listed after the table.

| ID | Fix | Proof |
|---|---|---|
| QA-01 | Re-inviting a CANCELLED, EXPIRED or OFFBOARDED address reuses the same person and identity: new single-use invitation, back to INVITED with inactive access, no MFA evidence, and roles only from the new invitation (effective after activation). One durable `RESEND_INVITE` operation carrying `reopen` re-enables the identity, resets MFA for a former employee, then emails, in that order and with no migration change. It is refused with `IDENTITY_OPERATION_PENDING` while the earlier disable is still queued. New audit event `STAFF_REINVITED`. | `PlatformUsersDeepQaTest.closedPeopleCanBeReinvited…`, `IdentityOperationReinviteExecutionTest` (3) |
| QA-02 | The current Platform Account Owner may read and decide (approve/reject) administrator change requests with recent passkey (LoA 3) sign-in, holding no administrator role. Raising requests stays administrator-only. `/me` gives the owner the Control Center workspace, and the overview returns display names. The Administrators page shows the owner decide-only actions, and a passkey refusal opens the sign-in prompt. | `…thePlatformAccountOwnerDecidesAdministratorChanges…`, `GovernancePages.test.tsx` (3) |
| QA-14 *(new, found while fixing QA-02)* | `PlatformAccessGovernanceService.request` had no transaction: its `@Transactional` sat on the `Overview` record. The governance lock was released at once, and the request insert and audit entry were not atomic. Moved onto `request()`. | code fix; covered by the QA-02 flows |
| QA-03 | Owner/administrator separation is enforced at transfer initiate, accept and verify, and on administrator appointment request and approval (`OWNER_ADMINISTRATOR_SEPARATION_REQUIRED`). | `…theOwnerIsNeverAlsoASystemAdministrator` |
| QA-04 | The validator reports `SLA_NOT_SUPPORTED` while the runtime cannot project deadlines, so an SLA can no longer pass review and then fail at publication. Metadata carries `slaSupported:false`. The designer hides SLA fields and offers "Remove service level" on older drafts. Real SLA enforcement (due times, reminders, escalation jobs) is a separate feature. | `…theDesignerOnlyAcceptsWhatTheRuntimeCanCompile…`, `JourneyCompilerTest` |
| QA-05 | Metadata says `GOVERNED_RECOVERY_LOOPS`. | same |
| QA-06 | The stage registry declares what each action depends on (for example Release → Prepare, Prepare → Clinical decision, Provide information → Request). A must-happen-before analysis runs over every path, including recovery loops, and reports `ACTION_PREREQUISITE` naming the missing step. The map shows it in the warning style. It is a **warning, not a blocker**: ordinary case actions stay available for journey-bound cases, so the work can legitimately happen outside the journey, and the runtime handler still fails closed when it has not. To make it blocking, ordinary case actions must first be closed for bound cases (a product decision). | `…stagesThatDependOnEarlierWorkAreFlaggedUnlessItIsOnEveryPath` |
| QA-07 | "Return to draft" is gated on `JOURNEY_APPROVE`, matching the backend. | `JourneyDesignerQa.test.tsx` |
| QA-08 | The map is a drag-and-drop editor when the version is editable. Drag step types from the palette onto the map (click also adds them, as the keyboard path). Drag from a step's handle to another step to connect: a decision gets Yes, then the complementary No; an ordinary step is re-pointed. Impossible links are refused with a reason. Delete/Backspace removes a step with its links (Start is protected), and steps can be moved. Positions are view-only: the saved journey has no coordinates. The inspector's non-drag path is unchanged. Read-only versions connect, delete and drop nothing. | `JourneyDesignerQa.test.tsx` (12) |

Still open (business decisions or features, not defects):
- **QA-09:** function managers for Operations, Finance, Credentialing, Care Journey, Support and Identity Review.
- **QA-10:** making live admission of new cases a governed in-product switch instead of configuration plus restart.
- **QA-11:** SOD-05 (verifier ≠ the Consultant's Consultant Operations owner) and the STF-04/05 identity review queue.
- **QA-12:** the Care Coordination Manager's case visibility.
- **QA-13:** seeding Journey, Audit, Support and Identity-review UAT identities.
- **New gap:** there is no owner-transfer UI. Its API exists, but the transfer can't be started from the Control Center.
