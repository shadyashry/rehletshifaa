# Platform users, roles, hierarchy, onboarding and test guide

**Audience:** business owners evaluating or operating RehletShifaa, implementation teams, UAT testers, support,
compliance and QA.  
**Scope:** platform ownership, internal workforce, Consultants, Practice Managers, patients, representatives and
service accounts.  
**Status:** reflects the Section 1 A1–A8 implementation checkpoint dated 2026-09-27.

## 1. What this guide answers

This guide explains:

- which kinds of users exist and why they exist;
- how authority is structured without relying on identity-provider roles;
- who may invite, appoint, approve, manage, suspend or remove each kind of user;
- which screen an operator uses for each action;
- which actions require a second person or stronger authentication;
- the expected lifecycle and audit result;
- the minimum business and access-control tests for this part of the product.

This is the operational companion to the detailed
[platform requirements](platform-users-and-virtual-clinics-requirements.md), not a replacement for them.

## 2. The model in one page

RehletShifaa separates five concepts that are often incorrectly mixed together:

1. **Identity:** the Keycloak account used to sign in and its MFA/passkey credentials.
2. **Person or population record:** the business record identifying a workforce person, Consultant, Practice
   Manager, patient or representative.
3. **Role:** what category of work the person may perform.
4. **Relationship and scope:** which team, direct reports, case, clinic or patient the person may act on.
5. **Lifecycle:** whether the person is invited, active, disabled, offboarding or offboarded.

A role alone is never sufficient for protected business data. The backend checks the role, permission, scope,
current relationship, lifecycle, authentication strength and relevant business state on every request.

The platform does **not** use a single top-down permission hierarchy. It has three independent control layers:

1. **Platform ownership:** the Platform Account Owner is a separate governance relationship. The current owner
   initiates a transfer, the incoming owner accepts, and an independent System Administrator verifies it.
2. **Access governance:** System Administrators invite ordinary workforce users, assign roles, manage lifecycle and
   record access evidence. System Administrator appointment/removal requires two different administrators.
3. **Operational authority:** a functional role opens a workspace; team, reporting, case and task relationships
   determine where the person may act. No operational role inherits power from the owner or an administrator.

For a function that currently has `TEAM_MANAGE`, the ordinary onboarding handoff is:

```text
business need             access action             team placement             scoped work
Function Manager   ->     System Administrator  ->  Function Manager   ->      lead + assignment
```

The current policy grants `TEAM_MANAGE` only to `CONSULTANT_OPERATIONS_MANAGER` and
`CARE_COORDINATION_MANAGER`. Other functions must not infer manager-driven team or staffing authority from a job
title. Consultants, Practice Managers, patients and representatives are separate populations outside
**Workforce → People**.

Important boundaries:

- The Platform Account Owner is a governance relationship. Ownership does not grant clinical or commercial power.
- A System Administrator administers access but has no clinical, credential-decision, case or finance bypass.
- A manager or team lead has scoped supervisory authority, not global authority.
- Consultants, Practice Managers, patients and representatives are population roles, not internal workforce roles.
- Keycloak authenticates the person; the RehletShifaa database and code policy decide business authority.

## 3. User and role catalogue

### 3.1 Governance and internal workforce

| Role or relationship | Business purpose | Primary workspace | How it is obtained |
|---|---|---|---|
| Platform Account Owner | Account ownership and controlled ownership transfer | Governance | Controlled bootstrap for the first owner; afterward a three-party transfer |
| System Administrator | Workforce, access, identity operations, recertification and audit administration | Control Center | One administrator requests and a different administrator approves |
| Consultant Operations Manager | Consultant onboarding, catalogue oversight and Consultant Operations teams | Credentialing + Control Center | Assigned by a System Administrator |
| Credential Verification Officer | Review credentials and decide credentials/capabilities | Credentialing | Assigned by a System Administrator |
| Care Coordination Manager | Manage coordination teams, routing and staffing requests | Coordination + Control Center | Assigned by a System Administrator |
| Care Coordinator | Intake, coordination and assigned/supervised case work | Coordination | Assigned by a System Administrator |
| Operations Specialist | Assigned travel and fulfilment work | Operations | Assigned by a System Administrator |
| Finance Officer | Assigned finance work, commercial policy, FX and payment recording | Finance | Assigned by a System Administrator |
| Care Journey Manager | Design and edit journey definitions | Journey Governance | Assigned by a System Administrator |
| Care Journey Approver | Review and approve journey definitions | Journey Governance | Assigned by a System Administrator |
| Compliance and Audit Reviewer | Read-only governance, audit, credential, routing and journey review | Control Center | Assigned by a System Administrator; cannot hold another role |
| Support Officer | Bounded account support and MFA-reset requests | Support | Assigned by a System Administrator; cannot also be System Administrator |
| Patient Identity Reviewer | Review patient/representative identity evidence | Identity Review | Assigned by a System Administrator |

One person may hold compatible workforce roles. Conflicting combinations are rejected by the backend.

### 3.2 Relationships that are not roles

| Relationship | Meaning | Who controls it |
|---|---|---|
| Function manager | Holder of `TEAM_MANAGE` for one function | Current grants: Consultant Operations Manager and Care Coordination Manager only |
| Team membership | Person belongs to a team within the function of one of their roles | That function's manager |
| Team lead | Person supervises work in a named team | That function's manager |
| Direct manager | Person reports to one current manager in the same function | That function's manager |
| Case assignment | Person may act on a particular case in a particular capacity | The relevant workflow/assignment decision |
| Clinic delegation | Practice Manager may perform named administrative actions for one Consultant | The owning Consultant, after consent flow |
| Patient representation | Representative may act for one patient within a recorded scope and time | Patient onboarding/authorization workflow |

There is deliberately no `TEAM_LEAD` or generic `BUSINESS_MANAGER` role. Supervision comes from current team and
reporting relationships.

### 3.3 External and customer populations

| Population | How access begins | Scope |
|---|---|---|
| Consultant | Invited by Consultant Operations; identity activated; credentials and capabilities approved | Own clinic and specifically offered/assigned cases |
| Practice Manager | Invited by a Consultant and explicitly accepts with MFA | Only the named delegated clinic and selected `SCHEDULE`, `PROFILE`, `SERVICES` permissions |
| Patient | Account activation occurs through the accepted-proposal/onboarding journey | Own patient record and own cases |
| Patient Representative | Recorded, active, scoped and time-bound authorization | The represented patient's permitted actions only |
| Account Holder | Identity bound to a patient/representative relationship | Self-service account functions; not automatically patient authority |
| Service account | Registered by platform governance with owner, purpose, scopes and rotation date | Technical API purpose only; no interactive sign-in or business role |

## 4. Who can grant, approve or manage whom

| Target action | Initiator | Required approver/decision maker | Key controls |
|---|---|---|---|
| Initial owner and first administrators | Deployment operator starts controlled commissioning | Exact owner and two administrator nominees each accept | No subjects committed in source; passkeys required; atomic bootstrap cannot be rerun |
| Transfer Platform Account Owner | Current owner | Incoming owner accepts; a different System Administrator verifies | Three distinct actors, recent phishing-resistant MFA, immutable evidence |
| Appoint/remove System Administrator | Existing System Administrator | A different effective System Administrator or current owner | Maker/checker, recent phishing-resistant MFA, live candidate recheck, expiry/revision checks, last-admin protection |
| Invite internal workforce | System Administrator | No second approver for ordinary roles | Recent MFA, invitation grants no authority until activation |
| Add/remove ordinary workforce role | System Administrator | No second approver | Compatibility/SoD checks, reason, revision and audit |
| Request new hire/job change/team move/removal | Manager of that function | System Administrator executes or rejects | Request remains separate from the actual access change |
| Create/retire team or change members/leads/reporting | Manager of that function | No global administrator approval | Restricted to managed function; same-function eligibility |
| Supervise team work | Current team lead/direct manager | None | Supervised scope only; no role grants or identity actions |
| Invite/onboard Consultant | Consultant Operations Manager | Credential Verification Officer decides credentials/capabilities | Identity operation is durable; clinical eligibility is separate |
| Grant Consultant a case | Coordinator selects eligible Consultant | Consultant accepts the offer | Verified credentials, approved capability, active/available account |
| Delegate Practice Manager | Owning Consultant | Invitee accepts with MFA | Per-clinic permissions and immutable consent; currently gated, see §10 |
| Create patient account | Accepted-proposal/onboarding workflow | Patient/representative completes required activation and consent | No forced registration during inquiry; authority comes from patient relationships |
| Authorize patient representative | Patient onboarding/authorization workflow | Required consent/evidence | Scoped, time-bound and revocable; payer status alone grants no clinical access |
| Request MFA reset | Support Officer after caller verification | System Administrator approves/rejects | Support cannot approve its own request; sessions are revoked |
| Recertify access | System Administrator runs campaign | Authorized reviewer certifies/removes each item | Quarterly privileged and semi-annual ordinary access policy |

## 5. Control Center screen map

Replace `{locale}` with `en` or `ar`. The production/dev host supplies the prefix; paths below start after the host.
Navigation is permission-sensitive, so users see only the sections their effective access permits.

| Screen | Path | Main users | Purpose |
|---|---|---|---|
| Owner workspace | `/{locale}/portal/owner` | Current Platform Account Owner | Read-only executive analytics, administrator decisions and ownership transfer |
| Commissioning acceptance | `/{locale}/portal/governance/commissioning` | Exact initial owner/admin nominees | One-time, invitation-bound responsibility acceptance; not a registration form |
| Control Center Home | `/{locale}/portal/control-center` | Any Control Center user | Work requiring attention and links to permitted areas |
| People | `/{locale}/portal/control-center/people` | System Administrator; auditor read-only | Invite staff, change ordinary roles, disable/restore sign-in, offboard |
| Teams | `/{locale}/portal/control-center/teams` | Function managers; workforce readers | Create teams, membership, leads and direct reporting lines |
| Staffing Requests | `/{locale}/portal/control-center/staffing-requests` | Function managers and System Administrators | Request and decide staffing changes |
| Administrators | `/{locale}/portal/control-center/administrators` | System Administrators | Maker/checker appointment and removal |
| Account Support | `/{locale}/portal/control-center/account-support` | Support Officers | Verify caller, resend invite, password reset and MFA-reset request |
| Access Reviews | `/{locale}/portal/control-center/recertification` | System Administrators and auditors | Recertification campaigns and administrator MFA-reset decisions |
| Service Accounts | `/{locale}/portal/control-center/service-accounts` | Governance readers/admins | Record owner, purpose, scopes and secret rotation |
| Audit | `/{locale}/portal/control-center/audit` | System Administrator; Compliance/Audit | Review workforce, access and governance changes |
| Consultants | `/{locale}/portal/control-center/consultants` | Consultant Operations and Credentialing | Consultant directory and credential/capability state |
| Add Consultant | `/{locale}/portal/control-center/consultants/new` | Consultant Operations Manager | Send a Consultant invitation |
| Identity Checks | `/{locale}/portal/control-center/identity-checks` | Patient Identity Reviewer | Decide patient and representative identity evidence |
| Coordination Setup | `/{locale}/portal/control-center/coordination` | Care Coordination Manager; auditor read-only | Capacity, teams, preferences and routing configuration |
| Care Journeys | `/{locale}/portal/control-center/journeys` | Journey Manager/Approver; auditor read-only | Design, validate, simulate and approve journey versions |
| Price Lists | `/{locale}/portal/control-center/commercial/prices` | Consultant Operations Manager | Consultant catalogues and care-area templates |
| Exchange Rates | `/{locale}/portal/control-center/commercial/exchange-rates` | Finance and allowed readers | Reference FX rates |
| Margin & Deposit | `/{locale}/portal/control-center/commercial/margin-deposit` | Finance and allowed readers | Commercial margin/deposit policy |
| Consultant portal | `/{locale}/portal` | Consultant | Assigned clinical work and link to own Virtual Clinic |
| Virtual Clinic | `/{locale}/portal/virtual-clinic` | Consultant; accepted Practice Manager | Clinic profile, schedule and services within actor scope |

The UI is not an authorization boundary. Testers must also verify that calling a hidden or copied endpoint directly
is denied by the backend.

## 6. Screen-by-screen onboarding flows

### 6.1 First-time platform governance

The first owner and initial administrator set are created through controlled commissioning, not an ordinary
employee invitation or registration screen. The deployment operator starts the bounded session; the exact owner and
two administrator nominees each accept at `/{locale}/portal/governance/commissioning` with a recent passkey. The
final acceptance invokes the atomic one-shot bootstrap primitive. After that one-time event:

1. Maintain at least two effective System Administrators so maker/checker actions remain possible.
2. Use **Access & Governance → Administrators** for every later administrator appointment/removal.
3. Use the ordinary owner-transfer process for ownership changes; do not edit the database or Keycloak roles.

Unavailable-owner recovery uses OD-02 multi-party control: Administrator A initiates, Administrator B confirms, an
independent deployment/security operator verifies sealed evidence, and the exact successor accepts before cooling
off and completion. No single actor can complete it. Follow `owner-and-administrator-operations-runbook.md`.

### 6.2 Invite an internal workforce person

Actor: System Administrator with recent MFA.

1. Open **Workforce → People**.
2. Select **Invite person**.
3. Enter full name, work email and invitation language.
4. Select one or more compatible ordinary workforce roles.
5. Enter the business reason and send the invitation.
6. Confirm the invitation appears under **Open invitations** with an expiry.
7. The invitee completes email verification, password setup and MFA enrollment.
8. Confirm the person becomes `ACTIVE` before expecting any role to be effective.
9. Add them to the correct team/reporting structure from **Workforce → Teams** if their function uses teams.

Expected rule: an `INVITED` person may have planned role assignments but receives no usable business authority until
activation with required MFA.

### 6.3 Change ordinary workforce roles

Actor: System Administrator.

1. Open **Workforce → People** and find the active person.
2. Select **Change roles**.
3. Add/remove roles and provide a reason.
4. Confirm the card and `/api/v1/me` reflect the resulting effective role and workspace.

`SYSTEM_ADMINISTRATOR` never appears as an ordinary checkbox. Use **Administrators** and the two-person flow.

Expected conflicts:

- Compliance and Audit Reviewer cannot hold another role.
- Support Officer cannot also be System Administrator.
- A user cannot use a role change to bypass function, team, clinical or case scope.

### 6.4 Appoint or remove a System Administrator

Actors: two different existing System Administrators, both recently authenticated with phishing-resistant MFA.

1. Ensure the target is an `ACTIVE` workforce person with MFA.
2. Administrator A opens **Access & Governance → Administrators**.
3. Select **Request appointment** or **Request removal**, choose effective dates, and provide a reason.
4. Confirm the request appears under **Waiting for a second approval**.
5. Administrator B signs in separately, opens the same screen and approves or rejects it.
6. Confirm the effective administrators and recent decisions sections update.
7. Review the event under **Audit**.

The requester cannot decide their own request. The platform rejects any change that would leave zero effective
administrators or an unsafe expiry schedule.

### 6.5 Create the function hierarchy

Actor: the manager of the relevant function.

1. System Administrator first assigns either Consultant Operations Manager or Care Coordination Manager. These are
   the only roles that currently carry `TEAM_MANAGE`.
2. Open **Workforce → Teams**.
3. Create a team only for a function listed under the actor's managed functions.
4. Add active people whose role belongs to that same function.
5. Designate one or more team leads as required.
6. Record each member's direct manager where needed.
7. Test that leads see supervised work but cannot grant roles, manage identities, or act on unassigned clinical work.

A manager cannot maintain another function's teams. A person cannot report to themselves. Removing/offboarding the
only lead of a populated team is blocked until a replacement is designated.

Do not use this flow for Operations, Finance, Credentialing, Care Journey, Compliance, Support, Patient Identity or
Platform Administration until an explicit `TEAM_MANAGE` policy owner is defined for that function.

### 6.6 Use a staffing request

Actor sequence: function manager → System Administrator.

1. Function manager opens **Workforce → Staffing Requests**.
2. Select **New request**.
3. Choose one of `NEW_HIRE`, `JOB_CHANGE`, `TEAM_MOVE`, or `REMOVAL` and enter details.
4. System Administrator reviews the submitted request.
5. The administrator performs the real invitation/role/team/lifecycle action in the appropriate screen.
6. The administrator marks the request **Executed** with the invitation/change reference, or rejects it with a
   reason.

Marking a staffing request executed does not itself create authority; the referenced business action must exist.

### 6.7 Onboard a Consultant

Actor sequence: Consultant Operations Manager → Credential Verification Officer → Consultant.

1. Open **Consultants → Add consultant**.
2. Enter the Consultant's work email and professional/profile data and send the invitation.
3. Confirm a durable identity operation creates or recovers the Keycloak identity without duplication.
4. The Consultant accepts the invitation, configures credentials/MFA and signs in.
5. Credential Verification reviews evidence and records credential/capability decisions.
6. Confirm the account is active, credential state is verified/current, and required care-area capability is
   approved before making the Consultant available.
7. Confirm one Virtual Clinic exists for the Consultant.
8. In a case test, a Coordinator selects the Consultant from the eligibility list; the Consultant must accept the
   offer before assigned-case authority exists.

Creating a Consultant is not the same as making the Consultant eligible for clinical cases.

### 6.8 Onboard a Practice Manager — gated

Target actor sequence: owning Consultant → invitee.

The intended flow is:

1. Consultant opens their Virtual Clinic and invites a manager by email.
2. Consultant selects only `SCHEDULE`, `PROFILE`, and/or `SERVICES` for that clinic.
3. The invitation is `INVITED` and grants no authority.
4. The exact invitee signs in with MFA and explicitly accepts the delegation.
5. The delegation becomes `ACTIVE`; consent evidence, permissions and inviter are retained.
6. Widening permissions or reinstating a revoked delegation requires recent Consultant authentication and renewed
   manager consent.
7. Revocation removes that clinic's access immediately without affecting delegations for other Consultants.

**Current limitation:** the complete acceptance/adoption/MFA consent state machine is not implemented. Do not use the
current legacy invitation behavior as production acceptance evidence, and do not mark PM-03, PM-04, PM-05 or PM-07
passed until the gated flow exists.

### 6.9 Patient, account holder and representative onboarding

These users are not created from **Workforce → People**.

1. A new inquiry/case may proceed without forcing registration.
2. After the patient acknowledges an accepted proposal, the patient activation/onboarding workflow begins.
3. The patient or authorized representative verifies contact, establishes the account, completes applicable
   identity checks and consents, and satisfies required readiness steps.
4. A representative receives authority only from an active, scoped and time-bound representation record.
5. A payer does not receive medical-record access merely because they pay.
6. Patient Identity Reviewers decide configured manual identity-review items from **Identity Checks**.

### 6.10 Disable, restore and offboard workforce

Actor: System Administrator.

**Temporary disable**

1. Open **People**, select **Disable sign-in**, and provide a reason.
2. Database authority ends immediately; the durable operation disables Keycloak and logs out sessions.
3. Roles remain recorded for a possible controlled restore.

**Restore sign-in**

1. Use **Restore sign-in** only for `SIGNIN_DISABLED` people.
2. Restoration cannot silently reverse an offboarding decision.

**Offboarding**

1. Select **Start offboarding**; sign-in is disabled immediately.
2. Resolve every displayed blocker, such as open work, privileged assignment, manager/lead responsibility or team
   relationship.
3. Select **Complete offboarding**.
4. Confirm all roles, team memberships and reporting lines end while history and audit remain.

Self-disable/self-restore/self-offboard and removal of the last effective administrator are rejected.

## 7. Authentication requirements

| Level | Typical proof | Use |
|---|---|---|
| LoA 1 | Password | Ordinary authentication only; insufficient for sensitive workforce mutations |
| LoA 2 | Password + OTP/MFA | Ordinary sensitive workforce actions |
| Phishing-resistant MFA | WebAuthn/passkey | Platform owner and System Administrator high-risk governance actions |

High-risk commands also require recent interactive authentication. A stale token, password-only token, missing
`auth_time`, or insufficient `acr` must fail closed and prompt reauthentication.

After a platform restore, all database-recognized workforce requests return
`503 IDENTITY_RESTORE_RECONCILIATION_REQUIRED` until a zero-discrepancy `POST_RESTORE` identity reconciliation
passes. Reconciliation must re-apply pending identity operations and disable restored identities whose database
lifecycle is inactive before releasing access.

## 8. Minimum tester setup

Use separate accounts; never simulate maker/checker using one subject.

| Test identity | Minimum setup |
|---|---|
| Owner | LoA 3; distinct from incoming owner and verifier |
| Administrator A | Active workforce, System Administrator, OTP + WebAuthn |
| Administrator B | Active workforce, System Administrator, OTP + WebAuthn |
| Function manager | Relevant manager role and managed-function relationship |
| Team lead | Base functional role plus active team-lead relationship |
| Ordinary staff | Active functional role and team membership where relevant |
| Compliance reviewer | Compliance role only |
| Support officer | Support role only; not System Administrator |
| Consultant Operations Manager | Consultant onboarding permission |
| Credential verifier | Credential/capability decision permission |
| Consultant | Active identity, current verified credential, approved capability |
| Patient Identity Reviewer | Identity-review role with recent authentication for decisions |
| Patient and representative | Real onboarding/relationship fixtures; do not grant workforce roles |

For local development, use the stable environment URLs documented in `AGENTS.md`. Do not put passwords, OTP seeds,
passkey private keys or tunnel credentials into test source or evidence documents.

## 9. Core acceptance-test catalogue

### 9.1 Workforce invitation and activation

1. Administrator invites a person with one compatible role.
2. Invitation is visible, expiring and cancellable.
3. Before acceptance/MFA, protected workspace calls are denied.
4. After activation/MFA, `/api/v1/me` shows the expected role, permissions and workspace.
5. Resending does not create a duplicate identity or duplicate business person.

### 9.2 Ordinary role governance

1. Administrator grants and removes an ordinary role with a reason.
2. Effective access changes immediately from database state; stale token role claims do not restore it.
3. Compliance plus any other role is rejected.
4. Support plus System Administrator is rejected.
5. System Administrator cannot be added through **Change roles** or the ordinary role API.

### 9.3 Administrator maker/checker

1. Administrator A requests appointment of an active MFA-enrolled person.
2. A cannot approve the request.
3. Administrator B approves with recent LoA 3.
4. Target becomes effective only according to the approved dates.
5. Self-grant, self-revoke, duplicate decision and last-administrator removal are rejected.

### 9.4 Teams and hierarchy

1. Function manager creates and manages a team in their own function.
2. Cross-function team mutation is denied.
3. Only eligible active same-function people can be added.
4. Team lead sees supervised work but cannot perform role, identity or clinical-owner actions.
5. Self-reporting and removal of the only lead from a populated team are denied.
6. Ended memberships/reporting lines remove supervisory scope immediately.

### 9.5 Staffing requests

1. Function manager can submit only for a managed function.
2. Ordinary staff cannot submit or decide requests.
3. Administrator executes/rejects with reason.
4. Executed request contains a real invitation/change reference.
5. Request decision alone does not create authority.

### 9.6 Lifecycle and offboarding

1. Disable immediately removes database authority and ends Keycloak sessions asynchronously.
2. Restore works only from `SIGNIN_DISABLED`.
3. Offboarding exposes blockers and refuses completion until resolved.
4. Completion ends roles, memberships, leads and reporting lines but preserves audit/history.
5. Self-lifecycle changes and last-administrator disable/offboarding are denied.

### 9.7 Consultant onboarding and eligibility

1. Consultant Operations can invite; unauthorized roles cannot.
2. Retry/recovery does not duplicate the Consultant identity.
3. Unverified/expired credentials or missing capability prevent assignment eligibility.
4. Credential decision requires Credential Verification authority and recent authentication.
5. Eligible Consultant appears to Coordinator; case access begins only on the correct offer/assignment state.
6. System Administrator has no credential-decision or clinical bypass.

### 9.8 Practice Manager isolation

Run these after the consent flow is implemented:

1. Invitation alone grants no access.
2. Wrong identity cannot accept another person's invitation.
3. Acceptance without MFA is denied.
4. Active delegation permits only selected actions in the named clinic.
5. Manager cannot access cases, documents, messages, referrals, credentials or another clinic.
6. Permission widening requires new consent; revocation removes access immediately.
7. One clinic's revocation does not affect another clinic's delegation.

### 9.9 Patient and representative separation

1. Inquiry does not force account registration.
2. Patient authority is created only through the patient/account relationship.
3. Representative authority requires active scoped authorization.
4. Payer-only actor has no medical-record access.
5. Workforce and Consultant roles do not imply patient authority.

### 9.10 Support, recertification and audit

1. Support sees bounded account data and no case/clinical data.
2. MFA reset requires documented caller verification and administrator approval.
3. Support cannot approve its own request.
4. Recertification removal ends the assignment rather than silently retaining it.
5. Every invitation, role, administrator, team, lifecycle, support and review decision appears in audit with actor,
   target, outcome, time and reason.

### 9.11 Restore gate

1. New restore id blocks an already valid workforce token.
2. Manual, scheduled or discrepancy-bearing reconciliation does not release the gate.
3. Pending identity operations replay idempotently.
4. An enabled identity with inactive database lifecycle is disabled and logged out.
5. Only zero-discrepancy `POST_RESTORE` clears the gate.
6. Reusing the same cleared restore id does not re-block; a new restore id does.

## 10. Current completion and limitations

Complete at the Section 1 checkpoint:

- database-owned workforce roles and scoped relationships;
- workforce invite, role, lifecycle, hierarchy, staffing, support and access-review surfaces;
- System Administrator maker/checker and owner-transfer governance;
- controlled greenfield commissioning, owner executive/governance workspace and OD-02 owner recovery;
- database-versus-Keycloak reconciliation and restore-wide sign-in gate;
- durable identity-operation retry/replay controls;
- live MFA, WebAuthn and restore evidence.

Not complete or intentionally deferred:

- **Practice Manager consent flow:** acceptance, existing-identity adoption, MFA proof and permission re-consent are
  gated; the current legacy invitation path is not production acceptance evidence.
- **Production recovery evidence:** OD-02 implementation and its runbook are delivered; the production-equivalent
  quarterly rehearsal and sealed-credential exercise remain operational release evidence, not a code gap.
- **OD-07 patient-specific appointment administration by Practice Managers:** deferred; launch Practice Managers
  have no patient or case access.
- **OPS-03 wider restore assurance:** PostgreSQL, Keycloak, MinIO/document and full data restore drill is separate
  launch evidence.
- Function-manager ownership outside Care Coordination and Consultant Operations needs business confirmation.
- Provisional commercial ownership—Consultant catalogues vs Finance policy/FX/payments—needs business confirmation.

## 11. Source-of-truth references

- [Requirements](platform-users-and-virtual-clinics-requirements.md)
- [Execution plan](platform-users-and-virtual-clinics-execution-plan.md)
- [Section 1 implementation status](section-1-implementation-status.md)
- [Authority from-scratch design](authority-from-scratch-design.md)
- [Consultant Virtual Clinic](../consultant-virtual-clinic.md)
- [End-to-end workflows](../end-to-end-workflows.md)
- Backend role vocabulary: `backend/src/main/java/com/rehletshifaa/authority/domain/Role.java`
- Backend role policy: `backend/src/main/java/com/rehletshifaa/authority/domain/RolePolicy.java`
- Control Center navigation: `frontend/src/components/platform-control-center/control-center-nav.ts`

If this guide disagrees with executable authorization policy, treat that as a defect: the code policy and test suite
must be reconciled with the approved requirements, and this guide must be updated in the same change.
