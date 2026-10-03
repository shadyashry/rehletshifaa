# RehletShifaa — Platform Users and Virtual Clinics Requirements

**Status:** Canonical requirements, **revision 3**. Architecture is **CONDITIONALLY CLOSED FOR REQUIREMENTS
REMEDIATION**. Implementation may proceed only in the order and behind the gates in §2.16 and
[`platform-users-and-virtual-clinics-execution-plan.md`](platform-users-and-virtual-clinics-execution-plan.md).
Production launch requires every open-decision gate applicable to the launch scope, §2.17, and §3 acceptance.  
**Decision date:** 2026-09-25 · **Revision 2:** 2026-09-26, after the architecture challenge review · **Revision 3:**
2026-09-26, after independent repository verification
([challenge review](architecture-challenge-review-2026-09-26.md) ·
[Codex verification](architecture-review-verification-codex.md))  
**Scope:** Remaining platform-governance, workforce, consultant, Virtual Clinic, and provider-retirement work  
**Canonical replacement for:** `customer-governance-target-architecture-reviewed.md`

## Document rules

This document records the approved target in two deliberately separate sections, plus cross-cutting requirements:

1. RehletShifaa platform users, roles, access, and reporting hierarchies.
2. Independent consultants and their Virtual Clinics.
3. Cross-cutting invariants, data, security, privacy, reliability and accessibility requirements.
4. Open decisions.

The separation between sections 1 and 2 is mandatory. Designing a Virtual Clinic must not silently redefine
internal staff authority. An internal platform role must not silently grant access to a consultant's patients or
clinic.

Requirement labels:

- **IMPLEMENTED:** already present; preserve it and verify it during migration.
- **REMAINING:** approved work that still needs implementation.
- **RETIRE:** existing provider-organization functionality that must be safely removed.
- **DEFERRED:** approved direction, but not required for the first production release.

**⚠ Correction** marks a REMAINING item where current code *contradicts* the requirement (review status
IMPLEMENTED BUT UNSAFE or CONTRADICTED). Every ⚠ item in the uncommitted Virtual Clinic slice belongs to Phase 0
(§2.16).

Normative words: **must** is required; **must not** is prohibited; **should** is the preferred implementation when
no stronger constraint applies.

Requirement IDs (`GOV-`, `IAM-`, `CNS-`, …) are stable. Implementation records, tests and audits cite them (§2.18).
Invariants (`INV-`) are in §3.1. Open decisions (`OD-`) are in §4.

**Evidence precedence.** When sources disagree: confirmed decisions in this document → backend authorization and
domain invariants → database constraints → automated tests and verified runtime → architecture decision records →
UI → comments. Frontend visibility is never a security control.

**Revision and source governance.** Every canonical revision is retained in Git with a semantic decision diff;
D-01..D-20 may change only through an explicitly approved decision record. `consultant-virtual-clinic.md` describes
the feature intent but does not prove current concurrency or access behaviour. `technical-decisions.md` provider-
organization authority is superseded for the target by D-02/D-20. `journey-parity-status.md` remains authoritative
for what the runtime implements today until executable acceptance evidence moves that status forward.

### Approved operating-model decisions (frozen)

| ID | Decision |
|---|---|
| D-01 | RehletShifaa uses one platform scope. |
| D-02 | Provider organizations, organization memberships, facility memberships, branches, clinic-network tenancy, and provider access scopes are retired from the target model. |
| D-03 | Physical hospitals and treatment locations may remain operational, appointment, quotation, travel, treatment, and Journey facts. They are not security tenants. |
| D-04 | Every Consultant is independent. |
| D-05 | Every Consultant owns exactly one Virtual Clinic. |
| D-06 | The Virtual Clinic is a professional/practice-administration workspace, not a patient-case or clinical workspace. |
| D-07 | Consultant case access derives from an explicit active case assignment. |
| D-08 | Practice Managers are explicit administrative delegates of named Consultants. |
| D-09 | Practice Managers have no patient-case or clinical access in the first production release. |
| D-10 | Platform Account Owner is an ownership/governance relationship, not an ordinary super-administrator. |
| D-11 | System Administrator is the one default customer administration role. |
| D-12 | Two holders of the same System Administrator role are recommended; “primary” and “backup” are operational labels, not roles. |
| D-13 | Business Managers manage teams and workloads; they do not become general access administrators. |
| D-14 | Credential verification and professional capability approval are separate domain concepts. |
| D-15 | Clinical assignment requires approved professional capability. |
| D-16 | A professional-profile care area alone does not authorize assignment. |
| D-17 | A Journey Instance begins with the submitted case and spans pre-care and active-care phases. |
| D-18 | Keycloak authenticates; RehletShifaa authorizes business operations. |
| D-19 | Existing patient, representative, commercial, proposal, payment, document, travel, treatment, and follow-up behaviour must not regress. |
| D-20 | Provider-architecture retirement is a pre-production cutover, not a prolonged production coexistence programme. |

---

# Section 1 — Platform users, roles, access, and hierarchy

## 1.1 Platform user populations

The platform must distinguish these populations:

| Population | Purpose | Authority source |
|---|---|---|
| Platform ownership | Executive ownership, controlled governance, recovery | Platform Account Owner relationship |
| Platform administration | People, identity lifecycle, access governance, support, audit administration | System Administrator role assignment |
| Internal operations | Coordination, travel/fulfilment, finance, consultant operations | Role assignment plus work/team assignment |
| Independent reviewers | Credentialing, patient identity, journey approval, compliance review | Narrow published role assignment |
| Consultants | Assigned clinical work and their own Virtual Clinic | Active consultant lifecycle plus case assignment/clinic ownership |
| Practice Managers | Administrative help for named consultants | Accepted per-clinic delegation |
| Patients and representatives | Their own care and explicitly delegated patient access | Patient ownership or representative delegation |
| Service accounts | Approved non-human integrations and background work | Registered technical credentials with least-privilege scopes (IAM-17) |

No population inherits authority merely by appearing above another population in a diagram. A single identity may
belong to several populations, for example a Consultant who is also a patient. Authority is always evaluated for
the specific relationship the request uses, never by combining populations.

## 1.2 Agreed platform role catalogue

Platform ownership and business roles are separate concepts.

### Platform Account Owner relationship

The **Platform Account Owner** is the CEO, founder, managing director, or other authorized executive who owns the
RehletShifaa account relationship. It is not a normal RBAC super-role.

- **GOV-01 (REMAINING):** Exactly one active Platform Account Owner relationship exists after bootstrap (INV-01).
  It is stored as a governance relationship, not as a role assignment.
- **GOV-02:** The owner may accept or claim ownership through a controlled handover; authorize the initial System
  Administrators; approve System Administrator appointment and removal, ownership transfer, and critical
  security-policy changes; receive critical governance and security notifications; and take part in recovery
  governance.
- **GOV-03:** The owner must not automatically create ordinary staff or manage roles daily; reset ordinary
  accounts, operate Keycloak, or expand business permissions; access patient cases, clinical records, finance data,
  or Virtual Clinics; or decide credentials or capabilities or operate care workflows.
- **GOV-04:** Ownership transfer is a privileged change request (SOD-03). The current owner initiates. The incoming
  owner accepts with recent, phishing-resistant authentication. A System Administrator records the verification.
  The relationship cannot end without an accepted successor (INV-02).
- **GOV-05 (IMPLEMENTED):** Governance bootstrap is a one-shot, deployment-configured operation with no realm-role
  inference (`AccessBootstrapService`). **REMAINING:** bootstrap creates the owner relationship and the first
  System Administrator, and records both as the controlled handover.
- **GOV-06:** Owner-approval commands pending while the owner is unavailable never block ordinary platform
  operation. The two-System-Administrator path (SOD-03) covers additional administrators.
- **GOV-07:** Every owner action requires recent authentication (≤ 10 minutes, `auth_time`), a reason, and
  concurrency protection, and is audited in the governance stream.
- **GOV-08 (REMAINING, OD-02):** Owner recovery when the owner is permanently unavailable follows the procedure
  decided in OD-02. Until then, owner-only commands are unavailable, and nothing in the platform lets System
  Administrators assume the owner relationship.

`PLATFORM_OWNER` is an **IMPLEMENTED technical/pre-production construct requiring redesign** (role template, V31).
**REMAINING:** replace its broad role-assignment semantics with the GOV relationship and fixed governance commands.

### Default customer administration role

- **ROLE-01:** The one default customer administration role is **System Administrator**, target key
  `SYSTEM_ADMINISTRATOR`. `PLATFORM_ADMIN` is a misleading legacy key. Replace it before the first production
  catalogue unless a final dependency inventory proves an alias is temporarily required.
- Two people should hold the same System Administrator role. The platform must not create
  `PRIMARY_SYSTEM_ADMINISTRATOR` or `BACKUP_SYSTEM_ADMINISTRATOR` authorization roles.
- System Administrators may manage people, staff invitations, sign-in lifecycle, role and scope assignments,
  effective-access review, role drafts, access review, access audit, offboarding, and account support, and may
  initiate or approve privileged changes under policy.
- A System Administrator must not automatically receive patient, clinical, credential-review, capability, Consultant
  lifecycle, referral, finance-execution, journey-publish, or operational-work authority (SOD-08).

`ACCESS_GOVERNANCE_MANAGER` is **not** a default first-release customer role. Its ordinary administration
functions move to System Administrator. Existing technical templates and assignments using the key are **RETIRE**
after reconciliation. Maker/checker uses two System Administrators holding the same role. Splitting Identity
Administrator from Access Governance Administrator for large enterprises is **DEFERRED**.

### Business role catalogue

| Role | Target key | Core responsibility | Mandatory boundary |
|---|---|---|---|
| System Administrator | `SYSTEM_ADMINISTRATOR` | Internal identity/access lifecycle and access governance | No automatic business-operation or clinical authority |
| Consultant Operations Manager | `CONSULTANT_OPERATIONS_MANAGER` | Consultant invitation, profile completion, readiness, suspension, reactivation, offboarding, and blocker resolution | Cannot decide credentials or capabilities for Consultants they own (SOD-05); no clinical work |
| Credential Verification Officer | `CREDENTIAL_VERIFIER` | Independently verify identity, licence, registration, qualification, certificates, evidence, and expiry; decide capabilities under policy; emergency suspension on credential grounds | Credential and capability decisions stay separate records; no self-review |
| Care Journey Manager | `JOURNEY_MANAGER` | Create, edit, validate, and simulate journey drafts | Cannot approve their own material change |
| Care Journey Approver | `JOURNEY_APPROVER` | Independently approve, publish, and retire journey versions | No maker/checker collapse for the same version |
| Care Coordination Manager | `CARE_COORDINATION_MANAGER` | Teams, routing policy, workload, reassignment, and escalation | Routing control grants no clinical authority |
| Compliance & Audit Reviewer | `COMPLIANCE_AUDITOR` | Read-only authorization, workflow, credential, and audit review | No mutation; clinical content only through a recorded, time-bounded audit case (AUD-05) |
| Support Officer | `SUPPORT_AGENT` | Bounded support status, allowed invitation resend, login-recovery help (SUP-01..SUP-04), troubleshooting, and escalation | Cannot provision roles/access, appoint administrators, reset MFA alone, impersonate, or access clinical data |
| Care Coordinator | `COORDINATOR` | Patient relationship, intake, missing information, Consultant offer/assignment, referral confirmation, and proposal coordination | No final clinical or financial-settlement authority |
| Operations Specialist | `OPERATIONS` | Appointment, hospital, travel, visa, accommodation, transfer, arrival, and fulfilment work | Assigned work only; no clinical authority |
| Finance Officer | `FINANCE` | Deposits, receipt confirmation, reconciliation, authorized refund/waiver work, and finance gates | Assigned finance work only; no clinical authority |
| Patient Identity Reviewer | `PATIENT_IDENTITY_REVIEWER` | Resolve patient-identity exceptions and account-link conflicts | No clinician credential authority or unrelated case access |

- **ROLE-02:** “Operations lead”, “Finance lead” and similar supervisory responsibilities are the base role plus an
  explicit team/reporting relationship and a named supervisory permission set (for example task reassignment within
  the team). They are not separate business roles and not realm composites.

`PROVIDER_OPERATIONS_MANAGER` is a legacy key. **REMAINING:** migrate only its legitimate Consultant-onboarding
authority to `CONSULTANT_OPERATIONS_MANAGER`. Provider, organization, membership, and facility authority is **RETIRE**.

Lead and composite realm roles such as `COORDINATOR_LEAD`, `OPERATIONS_LEAD`, and `FINANCE_LEAD` are temporary
compatibility inputs, not the target authorization model. Express their legitimate supervisory meaning through
ROLE-02 before the composites are removed.

## 1.3 Functional hierarchy

```text
Platform Account Owner                 ownership / governance only
        │
System Administrators                  platform user/access administration
        │
Business functions
├─ Consultant Operations Manager
├─ Credential Verification Officer     independent credential/capability decision function
├─ Care Coordination Manager
│  └─ Care Coordinators
├─ Operations lead responsibility (ROLE-02)
│  └─ Operations Specialists
├─ Finance lead responsibility (ROLE-02)
│  └─ Finance Officers
├─ Care Journey Manager
│  └─ Care Journey Approver             independent maker/checker when required
├─ Compliance & Audit Reviewer          independent, read-only
└─ Support Officer                      bounded support only
```

Hierarchy rules:

1. **HIE-01:** Reporting lines are operational relationships. They do not grant permissions by inheritance.
2. **HIE-02:** A staff member may hold multiple compatible responsibilities. Each must be explicitly assigned and
   must pass the conflict rules (SOD-04).
3. **HIE-03:** A person may have only one direct manager within the same operational function at a time.
4. **HIE-04:** Multiple managers/leads may exist in a function and may supervise separate teams.
5. **HIE-05:** Manager visibility is limited to the configured team/reporting relationship. It does not replace the
   work or case assignment required for a protected action.
6. **HIE-06:** Business Managers manage teams, workloads, and staffing requests (STF-11). They are not general access
   administrators.
7. **HIE-07:** A lead label or realm composite must not create a platform-wide bypass.

## 1.3a Workforce model and hierarchy — implementation requirements

This section turns §1.2 and §1.3 into buildable requirements. It is delivered in **Phase 2A** (§2.16), and the
database authority work in Phase 3 depends on it.

### Current implementation (review 2026-09-26, addendum F-38..F-47)

| Piece | Where | Status |
|---|---|---|
| Staff directory | `staff_members` (V4, V20, V21, V23) | ⚠ `ck_staff_role` allows only `COORDINATOR`, `OPERATIONS`, `FINANCE` and their `_LEAD` variants. The other nine internal roles have no workforce record, lifecycle, manager, team, or offboarding path |
| One role per person | `staff_members.staff_role` | ⚠ A single column; multiple compatible responsibilities are impossible. Business role is held in three places: `staff_role`, Keycloak realm role, and `role_assignments` |
| Reporting line | `staff_members.manager_subject` (V21, coordinators only) + `staff_team_assignments` (V22) | ⚠ V22 primary key is the staff member, so one team per person across all functions. Functions limited to three. Cycle prevention IMPLEMENTED (`PortalExperienceService.updateReporting`) |
| Second team model | `coordinator_teams`, `coordinator_memberships`, `coordinator_capacity` (V36) | ⚠ Keyed to `provider_organizations`; separate from V22; has its own `team_lead` flag |
| Lead authority | `*_LEAD` staff roles + Keycloak composites; `PortalExperienceService.leadFunctions` | ⚠ A lead is a role, not a relationship. `COORDINATOR_LEAD` bypasses referral read, message-thread limits, and the accepted-assignment check platform-wide |
| Manager visibility | `PortalExperienceService.reports()`, `canLeadRead` | Transitive (whole subtree). Includes `PENDING` assignments of reports |
| Who edits teams | `updateReporting` | `SYSTEM_ADMIN` only; function managers cannot manage their own teams (contradicts D-13) |
| Code location | `journey.application.PortalExperienceService` | Hierarchy lives inside the case module |

### Requirements

- **WF-01 (REMAINING ⚠ Correction):** Every internal workforce person has exactly one workforce record with the
  STF lifecycle (§1.7), whatever their role: System Administrators, Consultant Operations, Credential
  Verification, Care Coordination, Operations, Finance, Care Journey, Compliance & Audit, Support, and Patient
  Identity (INV-26). Seeded or realm-only internal accounts are migrated into workforce records before Phase 3.
- **WF-02 (REMAINING):** A person's business roles are the platform-scope database role assignments (several per
  person, effective-dated, conflict-checked by SOD-04). `staff_members.staff_role` is retired as an authority
  source. It may remain only as a derived display value until removed. Realm roles are derived from assignments
  during migration, never the reverse.
- **WF-03:** Functions are a fixed catalogue: `PLATFORM_ADMINISTRATION`, `CONSULTANT_OPERATIONS`, `CREDENTIALING`,
  `CARE_COORDINATION`, `OPERATIONS`, `FINANCE`, `CARE_JOURNEY`, `COMPLIANCE`, `SUPPORT`, `PATIENT_IDENTITY`. Each
  role template belongs to exactly one function. A person belongs to every function for which they hold an
  effective role.
- **WF-04 (REMAINING ⚠ Correction):** There is **one** team model: platform-scope teams, each with a function, a
  name, one or more lead designations, and effective-dated memberships (INV-29). It replaces both
  `staff_team_assignments` (V22) and the organization-keyed `coordinator_teams`/`coordinator_memberships` (V36).
  Routing capacity, languages, and care areas attach to the coordination-team membership.
- **WF-05:** A person has at most one active direct manager **per function**, and may have different managers in
  different functions. The manager must hold the function's base role and an active lead designation in that
  function. Reporting cycles are rejected. Changes are serialized (INV-27).
- **WF-06 (REMAINING ⚠ Correction):** A lead is a **relationship** (lead designation on a team), not a role.
  `COORDINATOR_LEAD`, `OPERATIONS_LEAD`, and `FINANCE_LEAD` staff roles and realm composites are **RETIRE** after
  every current use is mapped to WF-07 permissions (ROLE-02).
- **WF-07:** Each function publishes a supervisory permission set, which applies only to members of teams the
  actor leads:
  - view team workload, queues, and capacity;
  - reassign work items and case roles within the function to an eligible team member;
  - set on-duty and capacity for team members;
  - view team members' cases within the scope set by OD-09;
  - raise staffing requests (STF-11).

  Supervisory permissions never include role grants, identity changes, credential or capability decisions, or
  clinical actions (INV-28).
- **WF-08:** Supervisory visibility covers direct reports and the members of teams the actor leads. Visibility of
  deeper levels (the current transitive `reports()`) is decided by OD-09. Supervisory reads are audited as
  `SUPERVISORY_READ`. Only `ACTIVE` assignments of team members count; `PENDING` offers never extend visibility.
- **WF-09 (REMAINING ⚠ Correction):** No lead bypass. Remove the `COORDINATOR_LEAD` early returns in
  `ConsultantReferralService.requireCoordinatorRead`, `JourneyService.requireAcceptedStaffAssignment`, lead
  message-thread widening (`ROLE_THREADS`/`allowedThreads`), and `cancelTask`/`reassignTask` without a team check.
  Every lead action requires that the affected assignee is in a team the actor leads.
- **WF-10 (REMAINING ⚠ Correction):** The function manager maintains team membership and lead designations
  **within their own function**. For example, the Care Coordination Manager maintains coordination teams. The
  System Administrator maintains role assignments. Neither needs the other's authority (D-11, D-13). A lead cannot
  designate themselves or change their own reporting line (SOD-01).
- **WF-11:** Hierarchy changes (manager change, team move, lead designation) are effective-dated, reasoned,
  audited, and concurrency-protected. A person leaving a team keeps their open work until it is reassigned. A lead
  losing a designation loses supervisory actions on the next request (IAM-08).
- **WF-12:** Offboarding, role removal, and lead removal are blocked while the person is the only lead of a team
  with members, or has direct reports without another manager in that function. Those reports must be re-parented
  first.
- **WF-13:** Platform administration is a function like any other for reporting purposes. Its reporting lines grant
  nothing. The Platform Account Owner relationship stands outside every team (GOV-01).
- **WF-14:** Consultants and Practice Managers are external populations and are not part of the workforce
  hierarchy. Consultant Operations relates to Consultants through the lifecycle owner relationship (SOD-05), not a
  reporting line.
- **WF-15:** Hierarchy and team code moves from `journey` to a `workforce` module. `journey` and `coordination`
  consume it through a port. An architecture test forbids `workforce` depending on `journey` or `provider`.
- **WF-16 — migration:** existing `staff_role` → role assignment and function; `*_LEAD` → base role plus lead
  designation; V22 team assignments and V21 `manager_subject` → platform teams and reporting lines; V36
  coordination teams → platform coordination teams (organization dropped); realm-only internal accounts → workforce
  records. Reconciliation counts per source, and every unmapped item listed, before Phase 3 switches authority.
- **WF-17 — read models and UI:** `/api/v1/me` returns functions, roles, teams, lead designations, and managers.
  Control Center:
  - **People:** several roles, a manager per function, teams.
  - **Teams:** per function, with members, leads, and capacity.
  - **Hierarchy:** read-only chart per function that states it grants nothing.
  - **Roles:** catalogue and versions.
  - **Administration:** owner, administrators, privileged requests.

## 1.4 Separation of duties and conflicts

The backend must enforce:

- **SOD-01:** No self-grant or self-revoke of privileged access. No self-approval, self-verification, or
  self-publication (INV-04). The check compares server-resolved subjects, never browser input.
- **SOD-02:** The maker of a material role or journey change cannot approve that same version.
- **SOD-03 (REMAINING):** Privileged actions are two-step **privileged change requests**. The requester and approver
  differ; both need recent authentication (≤ 10 minutes); a reason is mandatory; the request has an expiry
  (default 72 h), a version, and an immutable decision record. Privileged actions are: System Administrator
  appointment and removal, ownership transfer, owner recovery, sensitive role-definition publication, conflict-rule
  changes, MFA reset for workforce identities, and critical security-policy changes. For an additional System
  Administrator, one System Administrator initiates and a different System Administrator or the Platform Account
  Owner approves.
- **SOD-04:** Conflicting role combinations are rejected at grant time and re-evaluated at decision time
  (IMPLEMENTED: `AuthorizationService.prohibited`). The launch conflict set: Compliance & Audit Reviewer vs any
  mutating role; Journey Manager vs Journey Approver for the same version; Credential Verification Officer vs
  Consultant Operations for the same Consultant (SOD-05); Consultant vs any internal workforce role on the same
  identity; Support Officer vs System Administrator.
- **SOD-05 (REMAINING):** Each Consultant has a recorded Consultant Operations owner relationship. The Credential
  Verification Officer deciding for Consultant X must not be X's Consultant Operations owner, and must not be X.
- **SOD-06:** Last-owner (INV-02) and last-effective-System-Administrator (INV-03) protections are separate checks,
  evaluated under a governance lock in the same transaction as the change. They also apply to scheduled
  effective-date expiry, disablement and offboarding.
- **SOD-07:** Technical administration does not imply business-operation authority. Finance authority does not
  imply pricing-policy authority unless separately granted. Supervisory visibility does not confer execution
  authority.
- **SOD-08 (REMAINING ⚠ Correction):** No owner, administrator, auditor, support user, manager, or Practice Manager
  receives a clinical, credential, capability, referral, or case-ownership bypass (INV-22). Current code grants
  `SYSTEM_ADMIN` such bypasses (see ACG-08). New code must not add any.

## 1.5 Authentication and authorization

### Keycloak responsibilities

Keycloak must own credentials, password policy, MFA enrolment, authenticator lifecycle, sessions, account enabled
state, stable subject identifiers, authentication level (`acr`) and time (`auth_time`) claims, and temporary
compatibility roles during migration.

### RehletShifaa responsibilities

RehletShifaa must own staff lifecycle and reporting relationships; business-role templates, immutable versions,
assignments, conflicts, and effective dates; consultant lifecycle, credentials, capabilities, and Virtual Clinic
ownership; Practice Manager delegations; work, team, patient, representative, and case relationships; and every
business authorization decision and explanation.

**IAM-00:** The browser must never supply a subject, email address, role name, manager relationship, clinic
ownership, organization, or case relationship as trusted evidence. The server resolves those facts from
authoritative records.

### Token validation

- **IAM-01 (REMAINING):** The API validates issuer, signature, expiry, a dedicated API audience
  (`rehletshifaa-api`, added by a Keycloak audience mapper), and an `azp` allowlist. Accepting a token only because
  `azp` or `aud` equals the public web client ID (`KeycloakClientTokenValidator`, current behaviour) is retired.
- **IAM-02 (REMAINING):** Realm roles, while still consumed, are read only from `realm_access.roles`. The top-level
  `roles` claim is ignored (`JwtRoleConverter`, current behaviour, reads both).
- **IMPLEMENTED:** Public web client uses authorization code + PKCE S256 with direct-access grants disabled (realm
  export). `auth_time` recency fails closed when missing, stale, or more than 60 s in the future
  (`ActorContext.requireRecentAuthentication`).

### MFA and recent authentication

- **IAM-03 (REMAINING):** MFA is required for every workforce identity: owner, internal staff, Consultants, and
  Practice Managers. Patients follow the patient security policy.
- **IAM-04 (REMAINING):** Keycloak maps authentication flows to `acr` levels. The backend rejects workforce requests
  whose `acr` does not prove MFA (401 `MFA_REQUIRED`). Keycloak policy alone is not treated as evidence.
- **IAM-05 (REMAINING):** The Platform Account Owner and System Administrators must use phishing-resistant
  authenticators (WebAuthn/passkey). Other workforce identities need at least TOTP or WebAuthn at launch.
- High-risk commands additionally need recent interactive authentication (`auth_time` ≤ 10 minutes; step-up through
  `max_age`/`acr_values`): Platform Account Owner transfer and System Administrator appointment/removal; privileged
  role grants and removals; staff invitation, job change, sign-in disable/restore, and offboarding completion;
  credential and capability decisions; consultant suspension, reactivation, and offboarding; Practice Manager
  invitation, permission expansion, and reinstatement; finance mutations already classified as recent-auth
  operations; role and journey publication; clinical acceptance decisions already classified as recent-auth.

### Business authorization

- **IAM-06 (REMAINING):** One authority resolver decides every business request from database state: identity
  lifecycle (staff, consultant, delegate) is ACTIVE, an effective role assignment exists, and the required
  relationship holds (case assignment, team, delegation, patient/representative). Domain checks follow and are
  never skipped (ACG-09).
- **IAM-07 (RETIRE before production):** Keycloak workforce and Consultant business-role compatibility
  (`ActorContext`/`ActorRole` realm-role gates) is removed per endpoint family once that family's authority moves to
  IAM-06 and parity tests pass. It must not remain a second business authorization engine. Realm roles may remain
  as authentication-policy classifiers (which login flow and `acr` apply) and must never grant resource access by
  themselves.
- **IAM-08 (REMAINING):** Revoking a database assignment, disabling sign-in, suspending, or offboarding removes
  business authority on the **next request**, whatever the realm roles or token lifetime (INV-21). Authorization
  state is never cached.
- **IAM-09:** No legacy realm role may resurrect authority after a database assignment is revoked or denied.
- **IAM-10 (REMAINING):** Access-token lifespan is explicitly configured at ≤ 5 minutes. The workforce SSO idle
  timeout is ≤ 30 minutes and the maximum ≤ 10 hours. Refresh tokens are rotated.
- **IAM-11 (REMAINING ⚠ Correction):** An identity holds patient authority only through a `patient_profiles` or
  representative relationship. Delegate-only and workforce identities must not reach patient endpoints through the
  realm default `PATIENT` role (the realm currently grants `PATIENT` by default, and Practice Manager invitations
  keep it).
- **IAM-12:** Service-to-Keycloak administration uses a confidential client whose realm-management roles are
  limited to the user operations the identity adapter needs. Its secret is rotated at least every 90 days and on
  personnel change.

### Emergency access, reviews and dormant accounts

- **IAM-13:** There is **no clinical break-glass access** in the first production release. Urgent clinical continuity
  is handled by reassignment (CNS-12), never by widening someone's access.
- **IAM-14:** Identity-platform recovery (loss of all System Administrators or Keycloak administrative access) uses
  sealed Keycloak administrative credentials held under dual control, whose use is logged, alerted to the owner,
  and followed by credential rotation.
- **IAM-15 (REMAINING):** Privileged access (owner, System Administrators, Credential Verification, Compliance &
  Audit, Support) is recertified quarterly and all other workforce access semi-annually. Items not recertified are
  suspended, never silently kept.
- **IAM-16 (REMAINING):** Workforce identities with no successful sign-in for 90 days are disabled through the
  standard lifecycle (with owner and last-admin protections). Delegations unused for 180 days are suspended.
- **IAM-17 (REMAINING):** Service accounts and technical clients are recorded in a registry: owner, purpose,
  scopes, secret-rotation date. They hold no interactive sign-in and no business role.

### Account support and recovery

- **SUP-01:** Support may view bounded account-support state (invitation status, sign-in enabled, last sign-in,
  MFA enrolled yes/no) and resend an **existing** invitation. Support cannot see clinical data, roles beyond names,
  or audit content.
- **SUP-02:** Password recovery is self-service through Keycloak. Support may trigger the standard reset email after
  completing the documented identity-verification checklist, which is recorded.
- **SUP-03:** MFA reset for workforce identities is a privileged change request (SOD-03): Support or the user
  requests it, and a System Administrator approves. It ends all sessions.
- **SUP-04:** Support cannot impersonate a user, cannot change email addresses, and cannot link identities. Identity
  conflicts go to the Patient Identity Reviewer (patients) or the System Administrator (workforce).

## 1.6 Access-governance requirements

**IMPLEMENTED:** permission catalogue, role templates and immutable versions, assignments, relationships,
simulation, effective-access explanations, maker/checker **role-version publication**, conflict rules, one-shot
bootstrap, and access audit foundations. Assignment-level maker/checker and self-grant/last-admin guards are **not**
implemented (SOD-01, SOD-03, SOD-06).

**REMAINING:**

1. **ACG-01:** Convert access governance to the single platform scope.
2. **ACG-02:** Stop accepting `organization` in access-governance API requests.
3. **ACG-03:** Retire the `ORGANIZATION`, `ASSIGNED_ORGANIZATIONS`, and `MANAGED_CLINICIANS` scope types.
4. **ACG-04:** Preserve the `PLATFORM`, `SELF`, `ASSIGNED_CASES`, team/reporting, journey, and work-item scopes.
5. **ACG-05:** Remove provider authority lookups (`ProviderOrganizationAuthorityPort`, `access_memberships`
   organization checks, `organizationVerified`) from effective-access decisions.
6. **ACG-06:** Add an architecture test preventing `access` from depending on the legacy `provider` module.
7. **ACG-07:** Make database role assignments authoritative for internal business access after parity is proven
   (IAM-06, IAM-07).
8. **ACG-08 (⚠ Correction):** Remove the broad `SYSTEM_ADMIN`, `AUDITOR`, and lead bypasses. Current bypasses to
   remove include `JourneyService.authorizeRead`, both `requireCoordinatorOwnership` methods,
   `requireAcceptedStaffAssignment`, referral confirm/decline, `ConsultantCapabilityService.governor`,
   `verifyPractitioner`/`addCredential`, task cancel/reassign, message-thread visibility, and identity review.
   Each removal gets a negative test.
9. **ACG-09:** Keep endpoint-level domain checks even when the actor holds the relevant permission.
10. **ACG-10:** Return effective capabilities, lifecycle state, and workspace routing from one authenticated
    `/api/v1/me` response. Explanations must match actual endpoint decisions (tested by replaying the same
    decision inputs).
11. **ACG-11:** Retire `PLATFORM_OWNER`, `PLATFORM_ADMIN`, and `ACCESS_GOVERNANCE_MANAGER` as customer-facing target
    roles after owner-relationship and `SYSTEM_ADMINISTRATOR` parity is proven.

## 1.7 Staff lifecycle and administration

```text
INVITED → ACTIVE → SIGNIN_DISABLED → ACTIVE
                 └→ OFFBOARDING → OFFBOARDED
INVITED → CANCELLED
INVITED → EXPIRED (invitation lapsed; re-invite creates a new invitation)
```

**REMAINING requirements:**

1. **STF-01:** One staff administration workflow covers identity, business responsibility, operational setup,
   manager, and team assignment.
2. **STF-02:** An invitation grants no business authority before successful activation with required MFA.
   Invitations are single-use, expire (default 7 days), and are bound to the invited email.
3. **STF-03:** Invitation and identity operations are durable, retryable, idempotent, and safe under concurrent
   requests (IDO-01..IDO-07).
4. **STF-04:** Existing identities are adopted after exact, server-side resolution on a verified email held by
   exactly one identity. They must not be duplicated or linked from a browser assertion. Adoption requires the
   identity holder to sign in and accept.
5. **STF-05:** Identity ambiguity (several candidates, unverified email, or an existing relationship in another
   population) enters a fail-closed review state resolved by a System Administrator.
6. **STF-06:** Job and responsibility changes validate conflicts, blockers, team/reporting changes, and orphaned work
   in one business-database transaction.
7. **STF-07:** Disabling sign-in commits the lifecycle change in one business-database transaction, which ends
   authority immediately (IAM-08). Session revocation follows as a durable after-commit identity operation.
8. **STF-08:** Offboarding stops new routing, calculates blockers (open cases, work items, pending approvals,
   privileged roles, last-admin status), supports handover, and revokes application access in one business-database
   transaction while retaining history. Identity disablement and session revocation follow after commit.
9. **STF-09:** Restoring sign-in must not silently undo an offboarding decision.
10. **STF-10:** Staff administration never deletes audit, assignment, case, financial, or clinical history.
11. **STF-11 (REMAINING):** Business Managers submit staffing requests (new hire, job change, team move, removal).
    The System Administrator executes them. Privileged requests follow SOD-03. The request, execution, and outcome
    are linked in audit.

“Atomic” in this document refers to an internal RehletShifaa business-database transition. It never claims a
distributed ACID transaction between PostgreSQL and Keycloak.

### Identity operations (consistency model)

- **IDO-01 (REMAINING ⚠ Correction):** Every Keycloak mutation (create, enable, disable, logout, role compatibility
  change, required-action reset) is recorded as an `identity_operations` row in the same transaction as the business
  decision, and executed by a worker **after commit**. No service may call Keycloak inside a business transaction.
  Current staff and practitioner enable/disable and Practice Manager invitation violate this.
- **IDO-02:** Each operation has an idempotency key, a target subject, a type, a status (`PENDING`, `RUNNING`,
  `RETRYING`, `SUCCEEDED`, `DEAD`), attempts, next attempt, last error code, and correlation ID.
- **IDO-03:** Identity creation carries an operation marker (IMPLEMENTED: `inviteTracked`/`recover`) so a retried or
  orphaned creation is adopted, never duplicated.
- **IDO-04:** Disable and offboarding operations end all Keycloak sessions for the subject. Success is recorded only
  after Keycloak confirms.
- **IDO-05:** Retries use exponential backoff. After a configured maximum the operation becomes `DEAD`, raises an
  alert, and appears in the operator view with retry and abandon-with-reason actions.
- **IDO-06:** A reconciliation job compares database lifecycle with Keycloak enabled state and marker-tagged users,
  and raises discrepancies as operations or review items. It runs at least daily and after every restore (OPS-04).
- **IDO-07:** The database is authoritative for business lifecycle; Keycloak is authoritative for credentials and
  sessions. A committed business decision is never rolled back or duplicated because an identity operation failed.

## 1.8 Platform administration interfaces

```text
Access & Governance
├─ People
├─ Roles
├─ Access Summary
├─ Administration
├─ Identity operations (retry / reconcile view)
└─ Audit

Platform Operations
├─ RehletShifaa Staff
├─ Consultant Operations
├─ Credential & Capability Reviews
├─ Care Coordination
├─ Travel & Fulfilment
├─ Commercial & Finance
└─ Care Journeys
```

There must be no Organization, Provider, Facility, Provider Membership, or Provider Workspace section in the end
state. `Access & Governance → Administration` shows the Platform Account Owner, System Administrators, privileged
change requests, recertification status, and governance/recovery state. It must not create a default Access
Governance Manager workspace.

## 1.9 Platform acceptance criteria

Platform governance is production-ready only when:

- Platform Account Owner is a fixed governance relationship with transfer and INV-01/INV-02 enforced;
- one default System Administrator role exists and INV-03 holds under revoke, disable, offboard, and expiry;
- no default Access Governance Manager is required;
- every business action is authorized from database assignments and authoritative relationships (IAM-06), and
  realm-role business compatibility is removed (IAM-07);
- workforce tokens without MFA `acr` are refused; owner and administrators use phishing-resistant authenticators;
- role and journey maker/checker and privileged change requests are enforced server-side;
- staff invitation, job change, disable, restore, and offboarding have durable audited workflows, with identity
  operations visible and retryable;
- no administrator or internal role has an undocumented clinical or finance bypass (negative-test matrix green);
- self-grant and self-approval fail, and the last owner and last System Administrator have distinct protection;
- hierarchy visibility matches configured teams and reporting relationships;
- every internal person, in all ten functions, has one workforce record, database role assignments, a manager per
  function where applicable, and team membership in the single platform team model;
- `*_LEAD` roles and composites are retired; supervisory actions work only through lead designations over the
  actor's own teams, and no lead action reaches outside them;
- function managers maintain their own teams without System Administrator authority, and System Administrators
  grant roles without team authority;
- no authorization decision depends on an organization, membership, facility, or provider role;
- `/api/v1/me` explains the actor's effective capabilities and available workspaces;
- revocation ends authority on the next request and sessions within the access-token lifespan;
- effective-access explanations match the actual endpoint decisions.

---

# Section 2 — Independent consultants and Virtual Clinics

## 2.1 Target doctor and clinic model

```text
Independent Consultant
├─ exactly one Virtual Clinic
├─ zero or more accepted Practice Manager delegations
├─ verified credentials and approved professional capabilities (separate records)
├─ services, prices, availability, and consultation schedule
└─ direct case assignments and controlled referrals (case domain, not clinic)
```

The target model has no provider organization, hospital tenant, clinic network, branch, facility membership, or
organization owner. “Clinic” means the consultant's digital Virtual Clinic. Physical treatment locations remain
ordinary journey or appointment data (LOC-01).

## 2.2 Implemented baseline to preserve or correct

The uncommitted Virtual Clinic slice (V53, `clinic` module, `ConsultantReferralService`) must be corrected (Phase 0),
reviewed, committed, and regression-tested. It must stay gated in every shared environment until Phase 0
acceptance passes.

| Area | Implemented behaviour | Review status |
|---|---|---|
| Virtual Clinic | One `virtual_clinics` row per Consultant (PK = practitioner ID), backfilled. Lazy creation on first access remains as temporary compatibility behaviour | CONFIRMED; lazy creation is REMAINING (VC-02) |
| Consultant controls | Availability, expected review time, public-profile draft/approval/publication, manager-approval setting, history | CONFIRMED |
| Services and prices | Governed create/update/retire/activate changes, EGP base, version checks, effective dates, professional services only | CONFIRMED |
| Schedule | Timezone-explicit slots, VIDEO/IN_PERSON, overlap rejection, cancellation, optimistic versioning | CONFIRMED |
| Practice Managers | Database delegation with `SCHEDULE`, `PROFILE`, `SERVICES`; revocable; no workforce realm role; isolated from cases (tested) | CONFIRMED isolation; ⚠ active on invitation, no consent/MFA, existing identities refused, default `PATIENT` role kept (PM-03..PM-08, IAM-11) |
| Eligibility | Active account, `VERIFIED` status with **at least one** current credential, `AVAILABLE`, and **profile care area or** approved `CARE_AREA` capability | ⚠ CONTRADICTS D-15/D-16 and CNS-04 (ELG-01) |
| Capabilities | Structured capabilities, approve/revoke, no self-approval | CONFIRMED no self-approval; ⚠ `SYSTEM_ADMIN` may decide; decisions overwrite in place with no reason/evidence (CAP-03..CAP-06) |
| Direct assignment | Coordinator eligibility list and server-resolved assignment by practitioner ID; `PENDING` → accept/decline | CONFIRMED; ⚠ no eligibility recheck on acceptance, no expiry, pending offeree reads the full case and receives patient identity/document counts through My Work, not concurrency-safe (ASG-) |
| Referrals | Transfer and second-opinion request, coordinator confirmation, acceptance/decline, assignment history, audit | CONFIRMED flow; ⚠ pending receiver reads the full case, ended receiver relationships can retain decrypted referral reads, acceptance races clinical decision, creation is not idempotent/atomic, no eligibility recheck, no expiry, no referrer withdrawal (REF-) |
| UI | Consultant Virtual Clinic, coordinator eligibility cards, referrals, second-opinion interfaces | Not yet reviewed against UX-01..UX-05 |

## 2.3 Consultant lifecycle

- **CNS-01 (REMAINING):** The Consultant lifecycle is an explicit, persisted state owned by the `clinic` domain,
  replacing the current combination of `account_status`, `credentialing_status`, `availability_status`, and
  `disabled_at`. Availability stays a separate attribute and is not a lifecycle state.

```text
INVITED → PROFILE_INCOMPLETE → CREDENTIAL_REVIEW ⇄ INFORMATION_REQUIRED
                                     ├→ REJECTED
                                     └→ VERIFIED → ACTIVE
ACTIVE ⇄ RESTRICTED        (system: mandatory credential lapsed or no approved capability; cleared by verification)
ACTIVE / RESTRICTED ⇄ SUSPENDED
ACTIVE / RESTRICTED / SUSPENDED → OFFBOARDING → OFFBOARDED
INVITED → CANCELLED
```

- **CNS-02:** `RESTRICTED` is system-driven and non-disciplinary. `SUSPENDED` is a human decision with a reason.
  The two are separate so that renewal restores eligibility automatically, but only a reactivation decision ends a
  suspension.
- **CNS-03 — transition authority:**

  | Transition | Authority |
  |---|---|
  | INVITED → PROFILE_INCOMPLETE | System, on identity resolution + MFA enrolment |
  | PROFILE_INCOMPLETE → CREDENTIAL_REVIEW | Consultant submits; Consultant Operations may submit on their behalf |
  | CREDENTIAL_REVIEW → VERIFIED / INFORMATION_REQUIRED / REJECTED | Credential Verification Officer (recent auth, reason) |
  | VERIFIED → ACTIVE | System invariant check (CNS-04), triggered by Consultant Operations |
  | ACTIVE ⇄ RESTRICTED | System (credential and capability events); cleared by a verification decision |
  | → SUSPENDED, reactivation | Consultant Operations (recent auth, reason); emergency suspension on credential or safety grounds also by Credential Verification Officer |
  | → OFFBOARDING → OFFBOARDED | Consultant Operations; completion only when CNS-09 blockers are empty |
  | INVITED → CANCELLED | Consultant Operations |

- **CNS-04:** An `ACTIVE` Consultant must have: a resolved identity; an enabled account with required MFA; a
  complete professional profile; **every** mandatory credential requirement satisfied, verified, and current
  (CRD-02); at least one approved `CARE_AREA` capability; an explicit availability state; exactly one Virtual Clinic
  (INV-06); and no suspension or activation blocker (INV-07).
- **CNS-05:** One valid document must never make an otherwise incomplete Consultant clinically eligible.
- **CNS-06:** Only Consultant Operations coordinates onboarding and lifecycle administration. Only Credential
  Verification decides credentials and capabilities. No role name, declared seniority, or legacy provider membership
  may raise the Consultant's verified professional level.
- **CNS-07:** Suspended, restricted, and offboarded Consultants receive no new offers or referral offers.
- **CNS-08:** Reactivation from `SUSPENDED` re-evaluates CNS-04. It never restores withdrawn offers.
- **CNS-09:** Offboarding identifies and resolves active cases, pending offers, referral offers, second opinions,
  appointments, future slots, public profile, and Practice Manager delegations before completion. The Virtual
  Clinic becomes read-only history, and the public profile is withdrawn.

### Loss of eligibility during active work (patient safety)

- **CNS-10 (REMAINING):** Any event that removes eligibility (lifecycle → `RESTRICTED`, `SUSPENDED`, `OFFBOARDING`;
  account disabled; capability revoked) is recorded as a Consultant eligibility event in the same transaction as
  its cause.
- **CNS-11:** In that transaction, every **pending** initial offer, referral offer, and not-yet-accepted second
  opinion held by the Consultant is withdrawn (reason recorded), and the owning Coordinator receives one
  idempotent work item per case.
- **CNS-12:** For **active** primary assignments: when the cause is a lapsed licence or registration, a suspension,
  or offboarding, clinical write actions (clinical review save and approve, clinical decision, final assessment,
  treatment, discharge, follow-up) are refused with 409 `CLINICAL_AUTHORITY_SUSPENDED` (INV-25). Read access
  continues only for handover until reassignment is accepted or the OD-05 window elapses. The Coordinator receives
  an URGENT reassignment item.
- **CNS-13:** Capability revocation affects new eligibility for that capability only, unless the decision is flagged
  `IMMEDIATE`. In that case CNS-12 applies to active cases in the affected care area (OD-05).
- **CNS-14:** Emergency suspension (credential fraud, sanction, safety concern) ends all case access immediately,
  including handover read. Handover is done by the Coordinator from the case record.

## 2.4 Credential verification and professional capability authority

Credential verification and capability approval are separate domain decisions, even when the same launch function
performs both.

**Credential verification** answers whether identity, licence, professional registration, qualification, identity
document, specialty certificate, and other required evidence are valid and current.

**Professional capability approval** answers which clinical work the Consultant may receive in RehletShifaa.
Examples include `CARE_AREA:CARDIOLOGY`, `SUBSPECIALTY:INTERVENTIONAL_CARDIOLOGY`, `AGE_GROUP:ADULT`,
`LANGUAGE:ARABIC`, and `PROCEDURE:TAVI`.

### Credentials

- **CRD-01 (REMAINING):** Direct Consultant credential records owned by the `clinic` domain are the sole credential
  authority.
- **CRD-02 (REMAINING, OD-03):** Mandatory credential requirements are a versioned policy configurable by
  professional type, the jurisdiction where advice or treatment is given, capability or specialty, and RehletShifaa
  policy. Eligibility and expiry evaluate **requirements**, not “any verified document”.
- **CRD-03:** Each credential decision records the decision, reason, evidence document references, verifier, recent
  authentication, and expiry. Evidence documents are malware-scanned and stored with the credential-evidence
  classification (DAT-01).
- **CRD-04:** A single expiry job evaluates requirement satisfaction at least hourly, triggers CNS-10 on lapse, and
  sends reminders at the configured intervals (30/7/1 days; today IMPLEMENTED only for provider dossier revisions,
  REMAINING for direct records). The job is idempotent and its last successful run is monitored (OPS-06).
- **CRD-05 — migration:** inventory every Consultant using provider credential dossiers; copy current verified
  evidence, decisions, expiry, and required history into direct records with source identifiers and audit lineage;
  compare old and new eligibility outcomes before cutover and explain every difference.
- **CRD-06:** Move all expiry processing to direct records. Remove provider-credential adoption checks
  (`ProviderCredentialEligibility`) only after parity and reconciliation pass.
- **CRD-07:** The `clinic` module must not depend on the retired `provider` module (currently it does, through
  `ConsultantEligibilityService`).
- **CRD-08:** Credential evidence is never shown to Coordinators, Practice Managers, or patients.

### Capabilities

- **CAP-01:** Supported capability kinds: care area, subspecialty, procedure, age group, and language.
- **CAP-02:** Verified evidence may support a capability decision, but a capability must be explicitly approved. It
  is never inferred from free text, a profile declaration, a title, a retired organization membership, or an old
  provider role.
- **CAP-03 (REMAINING ⚠ Correction):** Only the Credential Verification Officer approves or revokes capabilities.
  It must not be the Consultant or their Consultant Operations owner (SOD-05). System Administrators cannot decide
  capabilities.
- **CAP-04 (REMAINING):** Capability decisions are append-only records: decision (approve/revoke), reason, supporting
  credential references, actor, recent authentication, optional expiry, and for revocation the effect
  (`NEW_WORK_ONLY` or `IMMEDIATE`). The current capability state is derived from the latest decision. In-place
  overwrite is retired.
- **CAP-05:** A capability approval requires the Consultant's mandatory credentials for that capability to be
  verified and current.
- **CAP-06:** Capability filters may narrow eligible Consultants. They never make an otherwise ineligible Consultant
  eligible.

## 2.5 Virtual Clinic ownership and content

- **VC-01:** Each Consultant owns exactly one Virtual Clinic (INV-06). The clinic contains verified professional
  information (readable, not editable as self-declared truth); public-profile draft, approval, publication, and
  withdrawal; availability and expected review time; consultation slots and timezone behaviour; professional
  services and price ranges; Practice Manager delegations; and immutable change history.
- **VC-02 (REMAINING):** Creation is deterministic in the same business transaction that creates the Consultant
  domain record, with `virtual_clinics.practitioner_id` as the primary key. A Consultant never becomes `ACTIVE`
  without exactly one persisted clinic. First UI access is not a creation trigger; the lazy `ensureClinic` path is
  removed after VC-02.

```text
Consultant identity/profile created
        ↓ (same transaction)
Consultant domain record created
        ↓
Virtual Clinic created (PK = practitioner_id)
```

- **VC-03:** Clinic administration and clinical casework are separate authorization surfaces. Consultants reach
  assigned clinical work through the Staff Portal consultant workspace.
- **VC-04:** The Virtual Clinic must not contain or list patient cases, documents, messages, tasks, clinical notes,
  referrals, case activity, Journey data, hospital tenancy, or authorization scope.
- **VC-05:** The `clinic` module must not read case, document, message, or referral tables for any clinic-facing
  response. Workload counts shown to Coordinators are computed in the case domain.
- **VC-06:** Every clinic mutation uses optimistic concurrency (`expectedVersion`) and writes clinic change history
  in the same transaction.
- **VC-07:** Clinic change history is visible to the owning Consultant, and to a Practice Manager only for entries
  within their delegated permissions.
- **VC-08 (REMAINING ⚠ Correction):** Clinic mutations require the owner's lifecycle to be neither `SUSPENDED`,
  `OFFBOARDING`, nor `OFFBOARDED`. Suspension or offboarding withdraws the public profile and suspends all
  delegations. `RESTRICTED` keeps clinic administration but hides the public profile's “accepting new patients”
  signal.

## 2.6 Practice Managers

A Practice Manager is an administrative delegate of one or more named consultants, not a platform staff role and
not a clinical actor.

- **PM-01:** Each delegation is separate and names the Consultant and the allowed permissions.
- **PM-02:** Permissions are limited to `SCHEDULE`, `PROFILE`, and `SERVICES`. Approvals, availability, settings,
  delegate management, and change-history administration are Consultant-only.
- **PM-03 (REMAINING ⚠ Correction):** Delegation states are `INVITED → ACTIVE → SUSPENDED → REVOKED`, plus
  `INVITED → EXPIRED/CANCELLED`. An invitation grants nothing until the invitee accepts it.
- **PM-04 (REMAINING):** Acceptance requires the invitee to be signed in with MFA, as the identity bound to the
  invited email. The invitation token is single-use and expires (default 7 days).
- **PM-05 (REMAINING):** Existing identities can accept an invitation without a duplicate account (server-side
  resolution per STF-04). Ambiguity fails closed.
- **PM-06:** The invitation and its notifications contain no patient or case data.
- **PM-07 (REMAINING):** Widening permissions or reinstating a revoked delegation needs the Consultant's recent
  authentication and creates a pending grant. Nothing widens until the delegate re-accepts. Narrowing and
  revocation take effect immediately.
- **PM-08:** Each acceptance retains the invitation, inviting Consultant, delegated permissions, acceptance
  timestamp, accepting identity, effective status, and revocation history.
- **PM-09:** Practice Managers never receive case, document, message, task, referral, credential-decision, or
  clinical access (INV-15). IMPLEMENTED and tested for case workspace, documents, and referrals; IAM-11 closes the
  patient-endpoint path.
- **PM-10:** Revoking one delegation does not affect another Consultant's delegation. Consultant suspension,
  offboarding, or account disablement suspends all of that Consultant's delegations (VC-08).
- **PM-11:** Manager-prepared service and price changes require Consultant approval by default. The Consultant may
  disable this; such changes are marked `APPLIED_WITHOUT_APPROVAL` (IMPLEMENTED). Manager-prepared public-profile
  changes always require Consultant approval (IMPLEMENTED). A change prepared before the delegation is revoked stays
  `PENDING_APPROVAL` for the Consultant to decide. Version guards prevent stale application.

**DEFERRED BUSINESS DECISION (OD-07) — patient-specific appointment administration:** launch Practice Managers stay
isolated from cases. A future `APPOINTMENT_ADMIN` capability, if approved, must use a separately approved,
server-shaped minimum-necessary response contract (patient display name, appointment time, Consultant, status,
approved operational contact details). It must not expose diagnosis, clinical documents, medical history,
Consultant recommendations, referral reasons, or the full case. No such access exists until it is separately
approved.

## 2.7 Services, pricing, availability, and schedule

Virtual Clinic services are the Consultant's professional services only. They must not represent hospital charges,
implants, accommodation, travel, platform fees, or unrelated third-party costs.

- **SVC-01:** Service changes are versioned, audited, and protected against stale updates.
- **SVC-02:** Retirement and reactivation preserve history.
- **SVC-03:** Effective dates are respected by estimate and proposal workflows.
- **SVC-04:** EGP remains the base catalogue currency. Patient currency conversion stays in the commercial
  subsystem. Published patient totals continue to use frozen policy and FX snapshots.
- **SVC-05:** Platform-side (administrator, template, CSV) price edits are versioned like clinic-side changes
  (REMAINING).
- **SVC-06:** Consultation slots use UTC instants plus an explicit display timezone. Overlapping active slots are
  rejected. Reservation state is separate from slot availability. Schedule changes use optimistic concurrency.

## 2.8 Direct assignment and eligibility

- **ELG-01 (REMAINING ⚠ Correction):** One eligibility rule, used for offers, referrals, and the clinic's
  “assignable” indicator, requires all of: lifecycle `ACTIVE`; enabled identity/account; every mandatory credential
  requirement satisfied and current; an **approved `CARE_AREA` capability** matching the case care area;
  `AVAILABLE`; no suspension, restriction, activation, or assignment blocker; every additional requested capability
  filter; and capacity for new work under applicable policy (INV-08).
- **ELG-02:** The primary specialty/care area in the professional profile supports display and search only. It never
  authorizes assignment (D-16). Consultants currently assignable only through the profile branch get a
  capability-review work item. Approvals are not backfilled automatically.
- **ELG-03:** The Coordinator sees only the routing information needed to choose: name, specialty, subspecialty,
  approved capabilities, languages, expected review time, active workload, pending offers, and the match
  explanation. The browser never sends a trusted identity subject. Assignment is by practitioner identifier,
  resolved server-side.
- **ELG-04:** Case access comes from the active assignment, never from the Virtual Clinic, a delegation, a prior
  assignment, a pending offer, or any retired provider relationship.

## 2.9 Initial Consultant assignment offer

The existing `PENDING` Consultant assignment (`CONSULTANT_ASSIGNMENT_PENDING`) is the offer record. The
requirements below complete it into the offer lifecycle.

```text
Coordinator selects eligible Consultant
        ↓
Offer — PENDING (expires_at)
        ├─ ACCEPT (eligible, before expires_at) → ACTIVE PRIMARY ASSIGNMENT
        ├─ DECLINE  → READY_FOR_CONSULTANT + Coordinator work
        ├─ WITHDRAW (Coordinator or CNS-11) → READY_FOR_CONSULTANT
        └─ EXPIRE (job, or at read time) → READY_FOR_CONSULTANT + one Coordinator notification
```

- **ASG-01:** A pending offer is recorded in assignment history but is not an active primary assignment.
- **ASG-02 (REMAINING):** A case has at most one open initial offer (INV-09). A new offer requires an explicit
  withdrawal of the open one. Silent end-and-replace is retired.
- **ASG-03 (REMAINING ⚠ Correction):** Offer creation, acceptance, decline, expiry, and withdrawal lock the case row
  first, check that every conditional update affected exactly one row, and roll back with 409 otherwise. Exactly one
  active primary Consultant is enforced by a database-level primary pointer (`case_primary_consultant`, `case_id`
  primary key; H2-safe, no partial index) (INV-11).
- **ASG-04 (REMAINING):** Every offer stores a required `expires_at`, calculated from the configured assignment-offer
  SLA and snapshotted at creation. Past `expires_at` the offer grants nothing and cannot be accepted, even before
  the expiry job runs (INV-10). The expiry job is idempotent and raises one Coordinator notification.
- **ASG-05 (REMAINING ⚠ Correction):** Before acceptance, a Consultant must not receive the case workspace,
  documents, messages, tasks, timeline, readiness/deposit data, proposals, referral clinical content, patient name,
  identifying case reference, document count, or read/mutation action (INV-12). This applies to workspace, My Work,
  notifications, referral reads, document APIs, and every alternate projection—not only `authorizeRead`. Today a
  pending offeree opens the workspace and My Work exposes patient identity and document count. The offer uses one
  server-shaped preview contract whose fields are decided in OD-04. Until then, it contains only care area,
  requested capability, review type, urgency, and expiry.
- **ASG-06 (REMAINING ⚠ Correction):** Acceptance rechecks ELG-01 and CNS state inside the locked transaction. A
  no-longer-eligible Consultant gets 409 `CONSULTANT_NO_LONGER_ELIGIBLE`, the offer is withdrawn, and the Coordinator
  is notified.
- **ASG-07:** Decline, expiry, or withdrawal returns the case to coordination without residual access.
- **ASG-08:** Every event records actor, reason where applicable, outcome, correlation ID, and timestamp. When no
  Consultant accepts within the configured number of offers or elapsed time, the case escalates to the Care
  Coordination Manager.

## 2.10 Transfers and second opinions

1. **REF-01:** Only the active primary Consultant requests `TRANSFER` or `SECOND_OPINION`, with an encrypted clinical
   reason. IMPLEMENTED while the case is in `CONSULTANT_REVIEW`.
2. **REF-02:** The owning Coordinator confirms or declines the request (IMPLEMENTED). The decline note is treated as
   clinical free text (SEC-06).
3. **REF-03:** On confirmation, the Coordinator chooses an eligible Consultant (ELG-01) other than the referrer and
   not already on the case (IMPLEMENTED).
4. **REF-04 (REMAINING ⚠ Correction):** A pending referral assignment grants **no** access to the case (INV-12). It
   grants only the offer preview (ASG-05). Today the pending receiver reads the full case.
5. **REF-05 (REMAINING):** A referral offer has `expires_at`. On expiry it behaves as a receiver decline: the referral
   returns to `AWAITING_COORDINATOR` and the original primary stays in place.
6. **REF-06 (REMAINING ⚠ Correction):** Acceptance rechecks ELG-01 for the receiver, and that the case is still in a
   referral-eligible state with the source assignment still active.
7. **REF-07:** An accepted transfer atomically ends the original primary assignment and makes the receiver the only
   primary (IMPLEMENTED in intent; see REF-08). An accepted second opinion grants read access plus one opinion
   submission, for a bounded window (REMAINING: default 5 days, configurable). Submission or expiry ends the
   assignment and its access (INV-14).
8. **REF-08 (REMAINING ⚠ Correction):** Every referral command (create, confirm, decline, accept, decline offer,
   withdraw, submit opinion) and the clinical decision lock the case row first. Each conditional update must affect
   exactly one row, and referral updates use version guards. An acceptance racing a final clinical decision results
   in exactly one outcome, never zero or two primaries (INV-11).
9. **REF-09:** Declining an offer leaves the original primary Consultant in place and returns the referral to
   coordination (IMPLEMENTED).
10. **REF-10 (REMAINING):** The referrer may withdraw a pending referral. Any pending offer ends.
11. **REF-11:** A final clinical decision withdraws incompatible open transfers (IMPLEMENTED). A second opinion
    continues independently.
12. **REF-12 (DEFERRED):** Referrals outside `CONSULTANT_REVIEW` (for example after arrival).
13. **REF-13 (REMAINING ⚠ Correction):** Every referral read authorizes the caller's current relationship and shapes
    fields for that relationship. A pending receiver gets only ASG-05 preview. A declined, expired, withdrawn, or
    ended receiver gets no clinical reason, opinion, coordinator note, receiver note, or case-derived content. A
    completed receiver sees clinical content only while another current active assignment independently authorizes
    it. Referrer and owning-Coordinator history access remains policy-scoped and audited.
14. **REF-14 (REMAINING ⚠ Correction):** Referral creation is an idempotent aggregate command. The case row is
    locked before checking/inserting, at most one open referral of a type exists per case, and actor + endpoint +
    request-body-hash idempotency returns the original result on replay and rejects key reuse with a different body.
    Work items, audit, and notifications are emitted once.

Referral assignments must never satisfy a primary-assignment check (INV-13, IMPLEMENTED). The referral reason and
the opinion are visible only to the referrer, the receiver while a current accepted relationship authorizes it, and
the owning Coordinator. The Journey runtime must represent these referral stages before the legacy `REASSIGN`
outcome is removed.

## 2.11 Proposal acceptance and Journey activation

- **JRN-01:** The **Journey Instance** is the case lifecycle record, created when a submitted case is admitted and
  version-pinned for its lifetime (INV-17). One case identity carries it through pre-care and active care.
- **JRN-02 — authority:** The authoritative state of the Journey Instance is `medical_cases.status` and its history,
  under `CaseTransitionPolicy`, together with the domain records (assignments, proposals, payments, onboarding).
  The deployed Journey runtime (flag-gated, default off; frozen V1 catalogue ends at `COMPLETE_PROFILE`) is a
  version-pinned execution and projection. It may become authoritative for a stage only after that stage's recorded
  shadow parity is accepted. It must never diverge silently from the case state.
- **JRN-03:** No new Journey object is created after proposal acceptance.

```text
CASE SUBMITTED
        ↓
Journey Instance admitted and pinned to its version
        ↓
PRE-CARE
intake → Consultant offer/acceptance → clinical review → estimate/proposal
        ↓
PATIENT ACCEPTS PRELIMINARY PROPOSAL
case → ACCEPTED; deposit and onboarding records created/resumed
        ↓
ACTIVATION GATES (CaseTransitionPolicy.entryBlockers)
accepted proposal on record
+ required deposit PAID, WAIVED, or not required
+ no patient profile/account/contact/consent/onboarding gate outstanding
        ↓
ACTIVE CARE — entry at TRAVEL_COORDINATION
travel → arrival → final assessment/quote where applicable → treatment → discharge → follow-up
```

- **JRN-04:** Proposal acceptance is durable and is not undone by a later activation failure (INV-19). It moves the
  case to `ACCEPTED` and creates or resumes the deposit and onboarding sub-workflows. It does not by itself enter
  active care. If deposit or onboarding creation fails, a repair job creates it (OPS-05).
- **JRN-05 (IMPLEMENTED):** The transition to active care is exactly `ACCEPTED → TRAVEL_COORDINATION`. It is made
  only by `CaseHandoffService` under a case-row lock with a status-guarded update, when `entryBlockers` is empty. It
  is triggered by `DepositSettled` or `PatientReadinessChanged` and is idempotent under duplicate events (INV-18).
  **REMAINING:** a scheduled reconciliation sweep (OPS-05) also moves any case that is `ACCEPTED` with no blockers.
- **JRN-06:** Administrative planning may happen earlier. Non-cancellable commitments remain protected by their
  stronger readiness and identity gates (`assertReadyForCommitment`). Later final-quote acceptance remains the
  separate treatment gate where applicable.

Case status history, Journey runtime history, proposal decisions, onboarding, deposit/payment events, and audit
records keep one continuous case identity across the boundary. Commercial values and payment policy are not
redefined here.

## 2.12 Audit sources and timelines

- **AUD-01:** Virtual Clinic change history is the source of truth for professional/practice configuration: profile
  publication, service/price changes, slot changes, availability, and Practice Manager delegation.
- **AUD-02:** Case and Journey history is the source of truth for patient-care progression: offers and assignments,
  acceptance, proposal acceptance, appointments, travel, arrival, treatment, referrals/transfers, discharge, and
  follow-up. A referral is case history, not Virtual Clinic history.
- **AUD-03 (REMAINING):** In production, the application database role has INSERT and SELECT only on audit and
  history tables (`audit_events`, `access_audit`, clinic change history, case status history) (INV-24). Audit is
  exported at least daily to write-once storage.
- **AUD-04:** High-risk commands commit their audit record in the same transaction, or not at all (INV-23).
- **AUD-05 (REMAINING):** The Compliance & Audit Reviewer sees audit metadata by default. Access to clinical content
  requires an audit case with a reason and an expiry, and is itself audited.
- **AUD-06 (REMAINING):** Reads of patient clinical content (workspace, documents, downloads) by staff and
  Consultants produce access-log entries sufficient to answer “who viewed this patient's record, when, and under
  which relationship”.

The two timelines may share audit infrastructure, correlation identifiers, and security controls, but they remain
separate business timelines and separate user-facing audit surfaces.

## 2.13 Patient booking and public profiles

**DEFERRED — patient booking (OD-08):**

- an open slot is not itself a reservation;
- booking uses hold → confirm → cancel states;
- concurrent attempts cannot double-book a slot;
- patient-facing times use the patient's timezone while retaining the UTC instant;
- booking links to a case only through an existing valid relationship;
- hold duration, cancellation window, and proxy-booking policy need final product values before implementation.

**DEFERRED — public consultant profile:**

- only explicitly published Virtual Clinic fields may appear on `/{locale}/consultants`;
- unpublished drafts, credential evidence, internal capabilities, availability internals, manager data, workload,
  and all patient information remain private;
- withdrawing publication removes the public profile without deleting its audit history.

## 2.14 Physical locations

- **LOC-01:** Physical hospitals, centers, consulting rooms, and treatment locations may be recorded as treatment,
  consultation, appointment, quotation, travel, journey, or commercial facts (name, city, country, address). They
  are never access scopes, tenants, membership containers, provider-governance branches, or owners of identity or
  authorization. A Consultant may work at several physical locations without owning multiple Virtual Clinics.

## 2.15 Pre-production Provider Architecture retirement and cutover

- **RET-01:** Retirement is approved and must complete before production. There are no production customers
  requiring a prolonged dual-runtime programme. The cutover must still reconcile data and prove access, credential,
  pricing, routing, workflow, and audit correctness. Temporary compatibility is removed, not institutionalized.

### Stage A — freeze and inventory

1. **RET-02:** Stop adding product requirements to provider organizations, facilities, memberships, and Provider
   Workspace. Inventory every provider table, API, UI route, role version, assignment, relationship, credential
   dossier, price, availability record, routing rule, test, notification template, and background job, and classify
   each as migrate, retain as history, replace, or delete after retention approval. The known live dependencies are:

   | Dependency | Location | Disposition |
   |---|---|---|
   | `access_memberships(subject, organization_id)` required by every assignment and relationship; `activeMember` / `organizationVerified` checks | V31; `AuthorizationService`; `RoleAssignmentRepository` | Replace with platform-scope subjects (ACG-01..ACG-05) |
   | `ORGANIZATION`, `ASSIGNED_ORGANIZATIONS`, `MANAGED_CLINICIANS` scopes | V31; `AuthorizationService.scopeMatches` | Retire after reconciliation |
   | `ProviderOrganizationAuthorityPort` | `RoleAssignmentService`, `AccessQueryService` | Remove |
   | `organization_id` in access repositories and effective-access reads | `RoleTemplateRepository`, `RoleAssignmentRepository`, `ResourceRelationshipRepository`, `AccessQueryService` | Re-key to platform scope; retain historical provenance separately |
   | Coordination teams, capacity, policy versions, routing preferences, decisions, case routing keyed by `organization_id` | V36; `CoordinationRepository`, `CoordinationReadService` | Re-key to platform (RET-03) |
   | Provider membership and clinician onboarding used by provider case summaries | `ProviderCaseSummaryService` | Replace with platform role, lifecycle, and assignment facts |
   | `AssignmentEngine.guardLegacyWrite` (LIVE organization routing) | coordination | Keep semantics under platform scope |
   | `ProviderCredentialEligibility` | `ConsultantEligibilityService`, `JourneyService` | Remove after CRD-05/CRD-06 |
   | `clinician_onboardings.credential_policy_cutover_at`; `reconcileProviderCredentials`; `provider_domain_events` | `CredentialExpiryService` | One expiry job on direct records |
   | `ProviderPricingCatalogPort` | `PricingCatalogService` | Point estimates at the clinic catalogue |
   | Direct `clinician_onboardings` credentialing projection in practitioner catalogue | `PricingCatalogService` | Replace with direct Consultant credential authority |
   | Direct membership/onboarding reads in coordination administration | `CoordinationRepository`, `CoordinationReadService` | Replace with workforce teams and Consultant lifecycle facts |
   | `CoordinationReadinessAdapter` | coordination → provider | Replace with clinic lifecycle facts |
   | `/api/v1/admin/providers/**`, `/api/v1/provider-workspace/**` | `SecurityConfig` | Retire (Stage C) |
   | `PROVIDER_CREDENTIAL` notification template, provider seeds, flags | notification, seeds | Retire |

### Stage B — remove organization dependency from live authority

1. Convert access decisions and APIs to platform, self, assigned-case, team, and explicit-delegation scope.
2. **RET-03:** Re-key coordination teams, routing policies, preferences, capacity, and decisions to platform scope.
3. Remove organization provenance from Consultant routing.
4. Migrate provider credential authority to direct Consultant credentials (CRD-05, CRD-06).
5. **RET-04:** Migrate legitimate Consultant service, price, availability, and schedule data to the Virtual Clinic.
6. **RET-05:** Replace Provider Operations responsibility with Consultant Operations responsibility, including the
   SOD-05 owner relationships.
7. Use reconciliation scripts and tests, synthetic fixtures, and bounded shadow comparison where they give
   meaningful evidence before switching authority. Do not build long-lived dual execution.
8. **RET-06 — reconciliation evidence:** before and after counts per migrated table; old and new eligibility outcome
   for every Consultant with every difference explained; zero live assignments with a non-platform organization;
   zero reads of provider tables from live endpoints or jobs (SQL inventory + architecture test); price parity per
   active service; full regression suite green. The Consultant Operations and Credential Verification leads sign
   the report off.

### Stage C — retire product surfaces

- **RET-07 — point of no return:** provider write paths are disabled only after RET-06 sign-off. Before that point,
  rollback means restoring the pre-cutover database snapshot and redeploying the previous build. After it, the
  programme rolls forward only.
- After Stage B acceptance, retire: `/{locale}/portal/practice` and Provider Workspace components/hooks;
  `/api/v1/provider-workspace/**`; the Control Center provider organization, people, profile, directory, pricing,
  availability, membership, and facility UI; `/api/v1/admin/providers/**` and organization-specific coordination
  APIs; provider invitations, memberships, organization ownership, organization-manager relationships, and facility
  selectors; and organization/provider role templates and scope types after effective assignments are reconciled.
- **RET-08:** Provider-module application code is removed only after architecture and runtime inventories prove it
  unused.

### Stage D — regression and cleanup

- **RET-09:** Architecture tests forbid dependencies from `access`, `clinic`, `journey`, and `coordination` on
  `provider`.
- **RET-10:** Remove dead navigation, translations, feature flags, tests, seeds, and configuration. Remove legacy
  realm roles only after no runtime path consumes them. Verify patients, representatives, cases, documents,
  proposals, payments, treatment, travel, and follow-up. Verify that no live endpoint or background job queries
  provider membership or organization scope for authority.
- **RET-11:** Database history is never physically deleted as part of functional retirement. Physical deletion
  needs a separate retention, legal, backup, and recovery decision (OD-01).

### Pre-production role-catalogue cleanup

- **RET-12:** Flyway migration history and business role-version history are different. Applied Flyway history is
  never reset or rewritten. Development-only role versions with no enduring governance meaning are archived as
  pre-production evidence and excluded from the launch catalogue. The first production catalogue is seeded cleanly
  with target names such as `Care Coordinator v1` and `System Administrator v1`, through an explicitly reviewed
  additive procedure with reconciliation evidence.

## 2.16 Delivery order

The normative, requirement-complete execution plan is
[`platform-users-and-virtual-clinics-execution-plan.md`](platform-users-and-virtual-clinics-execution-plan.md). It
assigns every requirement, invariant, frozen decision, and open decision to one primary phase with prerequisites,
deliverables, tests, evidence, and exit criteria.

| Phase | Outcome | Hard gate |
|---|---|---|
| 0 | Make the uncommitted V53 slice safe: close pending/ended access, races, idempotency, eligibility, capability, free-text, cascade, lifecycle, and Keycloak transaction gaps. The identity-operation outbox kernel ships here; otherwise manager invitation stays disabled. | None; must pass before V53 is committed or enabled in a shared environment |
| 1 | Authentication, MFA, token, session, identity-operation, and immediate governance safety foundation. | Phase 0 |
| 2 | Platform-scope access-governance schema/API foundation, with history preserved. | Phase 1 |
| 2A | One workforce catalogue, multi-role assignments, functions, teams, reporting lines, lead designations, and supervisory controls. | Phase 2; OD-09 only for supervisory case visibility |
| 3 | Database authority resolver, Platform Account Owner, System Administrator governance, maker/checker, and effective `/api/v1/me`. | Phase 2A; OD-02 only for owner-recovery commands |
| 4 | Staff invitation, adoption, job change, disable/restore, offboarding, staffing requests, recertification, dormancy, service accounts, and support. | Phase 3 |
| 5 | Consultant lifecycle, credential/capability authority, Virtual Clinic, Practice Manager consent, services, and schedule. | Phase 4; OD-03 and OD-05 |
| 6 | Eligibility, initial offers, referrals, second opinions, Journey activation, reconciliation, and case-access proof. | Phase 5; OD-04 |
| 7 | Provider-data migration and platform replacements, with shadow comparison and reconciliation. | Phase 6 |
| 8 | Authority cutover and point of no return. | RET-06 signed; rollback rehearsal passed |
| 9 | Provider product/code/role removal and launch-catalogue cleanup. | Phase 8 |
| 10 | Production assurance: audit, privacy, legal, reliability, restore, security, accessibility, and final acceptance. | Phases 0–9; all launch-scope OD gates including OD-01 and OD-06 |
| 11 | Deferred booking, appointment administration, expanded referrals, public profiles, and interoperability only when separately approved. | OD-07/OD-08 or the relevant partner/regulatory gate |

No phase may remove old authority before its replacement is populated, reconciled, tested, observable, and included
in a rehearsed rollback. A gate's fail-safe default may permit engineering only where §4 explicitly says so; it does
not waive the decision for production.

## 2.17 Doctor, clinic, Journey, and retirement acceptance criteria

The target is complete only when:

- every Consultant record creates exactly one Virtual Clinic in the same transaction, before activation;
- Consultant activation requires MFA, every mandatory credential requirement complete and current, an approved
  capability, profile completion, availability, and no blocker;
- the profile primary care area alone never grants eligibility;
- loss of eligibility withdraws pending offers, blocks clinical writes as CNS-12 defines, and raises urgent
  reassignment;
- Practice Manager authority exists only after accepted consent with MFA and stays isolated from all clinical and
  patient resources;
- initial assignment uses a pending offer with bounded preview, expiry, withdrawal, accept/decline, eligibility
  recheck, and no case, referral, work-item, notification, identity, case-reference, or document-count disclosure
  before acceptance;
- cases have exactly one active primary Consultant, enforced by the database and proven by concurrency tests;
- transfers and second opinions preserve assignment history, recheck eligibility, expire, and grant only the
  required temporary access; receiver clinical reads end with the authorizing assignment;
- referral creation and every referral mutation are aggregate-locked and idempotent, and concurrent requests cannot
  create duplicate open referrals or duplicate work/audit/notification side effects;
- consultant services, prices, slots, and profiles are versioned and protected from stale or concurrent updates;
- coordinator routing and eligibility operate without organizations or provider memberships;
- direct Consultant credentials are the only credential authority;
- credential verification and professional capability approval remain distinct, append-only decisions;
- the single Journey Instance starts with the submitted case; proposal acceptance and `ACCEPTED →
  TRAVEL_COORDINATION` activation semantics are enforced, reconciled, and auditable;
- Virtual Clinic configuration history and patient Case/Journey history remain distinct timelines;
- no provider/organization/facility UI or API remains reachable;
- no authorization decision reads an organization, membership, organization role, or facility relationship;
- no Provider or Organization Keycloak role grants business authority;
- historical provider data remains available for audit and retention but grants no authority;
- the full patient, case, document, proposal, commercial, payment, travel, treatment, and follow-up regression suite
  remains green;
- all new screens pass UX-01..UX-05;
- live Keycloak tests prove MFA `acr` enforcement, recent authentication, disabled-session revocation, and
  retired-role cleanup;
- every invariant in §3.1 has a passing automated test.

## 2.18 Required implementation records

Each delivery phase records:

- requirement IDs implemented (this document's IDs);
- additive migrations and data-reconciliation counts;
- APIs/UI added, changed, or retired;
- authorization, negative-isolation, and concurrency tests, keyed to INV- IDs;
- shadow-parity or cutover evidence where applicable;
- rollback/recovery method;
- remaining blockers and open decisions touched.

Migrations are additive, keep applied migration history, stay H2-safe where the project requires it, use
`TIMESTAMP WITH TIME ZONE`, and add one column per `ALTER TABLE` statement.

---

# Section 3 — Cross-cutting requirements

## 3.1 Invariant catalogue

Every invariant must have an automated test named with its ID.

| ID | Invariant |
|---|---|
| INV-01 | Exactly one active Platform Account Owner relationship exists after bootstrap. |
| INV-02 | The owner relationship cannot end without an accepted successor or a completed OD-02 recovery. |
| INV-03 | At least one effective System Administrator (ACTIVE lifecycle, effective assignment, MFA enrolled) exists after every committed change, including scheduled expiry. |
| INV-04 | No actor grants, revokes, approves, verifies, or publishes anything whose subject or maker is themselves. |
| INV-05 | The Credential Verifier for Consultant X is neither X nor X's Consultant Operations owner. |
| INV-06 | Every Consultant has exactly one Virtual Clinic from the transaction that creates the Consultant. |
| INV-07 | Lifecycle `ACTIVE` implies every mandatory credential requirement is satisfied and current and at least one `CARE_AREA` capability is approved. |
| INV-08 | Eligibility for care area A implies `ACTIVE`, an approved `CARE_AREA:A` capability, `AVAILABLE`, an enabled account, and no blocker. |
| INV-09 | A case has at most one open initial offer. |
| INV-10 | An offer past `expires_at` grants nothing and cannot be accepted. |
| INV-11 | A case has exactly one active primary Consultant from first acceptance until the assignment legitimately ends, and never more than one. |
| INV-12 | `PENDING`, `DECLINED`, `WITHDRAWN`, `EXPIRED`, and `ENDED` assignments grant no case, document, message, task, timeline, readiness, deposit, proposal, referral-clinical-content, patient-identity, case-reference, document-count, work-item, notification, or read-action access. Only the OD-04 offer-preview contract is allowed before acceptance. |
| INV-13 | Referral assignments never satisfy a primary-assignment check. |
| INV-14 | A second-opinion assignment is read-only plus one submission, and ends on submission or expiry. |
| INV-15 | A Practice Manager delegation grants no access outside its own Virtual Clinic API, and no patient-endpoint access. |
| INV-16 | A delegation grants nothing until accepted with MFA. Widening grants nothing until re-accepted. |
| INV-17 | One Journey Instance per admitted case; its version pin never changes. |
| INV-18 | `ACCEPTED → TRAVEL_COORDINATION` happens only when `entryBlockers` is empty, exactly once. |
| INV-19 | Proposal acceptance is never rolled back by a later activation or deposit-creation failure. |
| INV-20 | No authorization decision reads organization, membership, facility, or provider-role data. |
| INV-21 | Revoking an assignment or disabling, suspending, or offboarding an identity removes business authority on the next request, whatever the realm roles or token lifetime. |
| INV-22 | No administrator, owner, auditor, support user, manager, or Practice Manager passes a clinical authorization check by role alone. |
| INV-23 | A high-risk command whose audit record cannot be written does not commit. |
| INV-24 | Application code never updates or deletes audit or history rows. |
| INV-25 | Clinical write actions require a current eligible primary assignment whose Consultant is not restricted for licence reasons, suspended, or offboarding. |
| INV-26 | Every active internal workforce identity has exactly one workforce record and at least one effective platform role assignment. No internal person exists only as a Keycloak user. |
| INV-27 | A person has at most one active direct manager per function; the manager holds that function's base role and a lead designation; the reporting graph has no cycles. |
| INV-28 | A supervisory action succeeds only when the actor holds an active lead designation over a team containing the affected assignee. No role grants supervisory authority by itself. |
| INV-29 | Exactly one team model exists, and no team, membership, or capacity row is keyed by an organization. |
| INV-30 | A case has at most one open referral of each type. Idempotent replay returns the original result and produces no duplicate work item, audit event, or notification. |

## 3.2 Security requirements

- **SEC-01:** Launch security verification targets OWASP ASVS 5.0.0 Level 2 for all APIs and the portal, with
  health-data handling treated as sensitive.
- **SEC-02:** Every object-level endpoint authorizes the object against the server-resolved relationship (BOLA), and
  every function checks role and relationship (BFLA). Request DTOs bind only fields the actor may set; lifecycle,
  ownership, and status fields are never bindable (mass assignment).
- **SEC-03:** Idempotency keys are scoped to actor, endpoint, and request body hash. Reuse with a different body is
  rejected. Assignment and referral create/decide/withdraw commands implement this in Phase 0; the same rule applies
  to every externally retryable command added later.
- **SEC-04:** Invitations, OTPs, secure links, and presigned URLs are single-purpose, bound to their subject or case,
  short-lived, and never logged. Presigned download URLs are minted only after authorization and scanning, with an
  expiry of 5 minutes or less.
- **SEC-05:** Webhooks (WhatsApp, payments) verify signatures, reject replays by event ID and timestamp window, and
  are idempotent.
- **SEC-06 (REMAINING ⚠ Correction):** Clinical or potentially clinical free text (referral reasons, decline notes,
  opinions, clinical reasons) is encrypted at rest. It is excluded from `audit_events.reason`, notification text,
  work-item titles and descriptions, logs, metrics, and URLs. Audit records reference the source record instead.
  Staff emails carry only an approved non-clinical title, case reference where the recipient already has access,
  recipient role, and destination link (IMPLEMENTED storage shape). They carry no patient identity or clinical
  context. The case-reference rule is covered by UX-05.
- **SEC-07:** Personal data never appears in URL paths or query strings, metric labels, or log messages. Correlation
  IDs are used instead.
- **SEC-08:** Browser requests are stateless bearer-token requests (no cookies), so CSRF protection is not required
  for the API. Any future cookie-based session (for example a backend-for-frontend) must add CSRF protection.
- **SEC-09:** Outbound HTTP (identity, notifications, payments, FX) goes only to configured hosts. No endpoint fetches
  a URL supplied in a request (SSRF).

## 3.3 Data, privacy, and retention

- **DAT-01 — classification:**

  | Class | Examples | Controls |
  |---|---|---|
  | Clinical (special category) | Case content, documents, clinical reviews, referral reasons, opinions | Encrypted at rest (field-level for free text); assignment-based access; read logging (AUD-06) |
  | Patient identity and contact | Names, DOB, contacts, identity documents | Encrypted fields; minimum-necessary views |
  | Financial evidence | Proposals, acknowledgements, deposits, receipts | Immutable versions; finance access only |
  | Credential evidence | Licences, qualifications | CredVer access only |
  | Workforce identity | Staff, Consultants, Practice Managers | Admin and self access |
  | Governance and audit | Assignments, privileged changes, audit | Append-only |
  | Public | Published consultant profile | Consultant-approved |

- **DAT-02:** Each class has a domain owner (§E10 of the review) and a single authoritative table set. Projections
  and caches never hold clinical or authorization state (IMPLEMENTED: Redis holds reference data only).
- **DAT-03:** Encryption keys for field-level encryption are held outside the database, rotated at least annually,
  and on suspicion of compromise. Rotation re-encrypts without downtime.
- **DAT-04:** Retention periods per class are set by OD-01. Until then nothing is physically deleted. Where UAE
  Federal Law No. 2 of 2019 applies, health data is kept for at least 25 years from the last health procedure.
- **DAT-05:** Legal hold suspends any retention-driven deletion for the held records. Provider history is retained
  read-only under the same rules.
- **DAT-06 (REMAINING ⚠ Correction):** No foreign key from clinic, capability, credential, case, or audit data
  cascades deletes from `practitioner_profiles` or `medical_cases`. A new migration replaces the V53 `ON DELETE
  CASCADE` constraints with `RESTRICT`. Practitioners and cases are never physically deleted by application code.
- **DAT-07:** Anonymization, when retention ends, keeps aggregate and audit integrity (subjects replaced by stable
  pseudonyms).
- **DAT-08:** Migrations that move data (RET-04, CRD-05) keep source identifiers and produce reconciliation counts.

### Privacy and jurisdiction

- **PRV-01 (OD-01):** The operating jurisdictions and applicable laws are decided by counsel before production. This
  document claims no legal compliance.
- **PRV-02:** For each processing activity, RehletShifaa records whether it acts as controller or processor, relative
  to patients, Consultants, and hospitals. Consultants are independent professionals whose own obligations counsel
  must define.
- **PRV-03:** Cross-border transfer of patient data (patient country → hosting region → Consultant's country →
  hospital country) is documented per flow, with its legal basis.
- **PRV-04:** Consent evidence (proposal acknowledgement, onboarding consents) stays versioned and immutable
  (IMPLEMENTED for proposal acknowledgement).
- **PRV-05:** A breach-notification procedure (detection, assessment, regulator and patient notification timelines
  per OD-01) exists before production.

## 3.4 Reliability and operations

- **OPS-01 (OD-06):** Availability SLO, RPO, and RTO are set by OD-06. Point-in-time recovery for PostgreSQL is
  enabled in every production environment.
- **OPS-02:** Keycloak realm state (users, credentials, configuration) is backed up on the same schedule as the
  database, and restore procedures cover both.
- **OPS-03:** A restore drill runs before launch and quarterly afterwards. It verifies data, documents (MinIO), and
  identity consistency.
- **OPS-04:** After any restore, workforce sign-in stays blocked until IDO-06 reconciliation passes: identity
  operations recorded after the restore point are re-applied, and identities whose restored lifecycle is not ACTIVE
  are disabled.
- **OPS-05 (REMAINING):** Reconciliation sweeps run at least every 15 minutes: `ACCEPTED` cases with no entry
  blockers → handoff; `ACCEPTED` cases missing deposit or onboarding records → repair; offers and referral offers
  past expiry → expire; second opinions past window → end. Every sweep is idempotent and emits a count metric.
- **OPS-06:** Alerts fire for: dead identity operations; dead notifications; any sweep or expiry job without a
  successful run in 2× its interval; cases stuck in `CONSULTANT_ASSIGNMENT_PENDING` past SLA; zero effective System
  Administrators pending (INV-03 near-miss); audit write failures; repeated authorization denials per subject.
- **OPS-07:** Operator recovery actions exist, are privileged where they change access, and are audited: retry or
  abandon an identity operation; withdraw an offer; force-withdraw a stuck referral; re-run the activation handoff
  for one case; reconcile Keycloak with the database; replay a dead-lettered notification; export audit.
- **OPS-08:** Degradation behaviour is preserved and tested: Redis outage → database reads (IMPLEMENTED); MinIO or
  scanner outage → uploads fail visibly and unscanned files are never downloadable; notification outage → business
  state unaffected, outbox retries (IMPLEMENTED).
- **OPS-09:** All servers synchronise time (NTP). Token and expiry decisions use the database or application clock
  consistently within a transaction.

## 3.5 Regulated-software scope and interoperability

- **REG-01:** RehletShifaa's regulated-software classification is **not yet closed**. Current repository evidence is
  administrative—clinical recommendations are authored by licensed Consultants and eligibility/routing do not
  generate treatment recommendations—but intended use, product claims, jurisdictions, and future features require a
  documented classification approved before production. Before building any automated
  triage, risk scoring, clinical suggestion, or AI-generated clinical summary, a formal regulatory classification
  is required. IEC 62304, ISO 14971, and IEC 82304-1 then apply as that assessment directs.
- **INT-01:** The first external clinical interface uses HL7 FHIR R4 (4.0.1) unless a partner or regulator mandates
  another published version. Unpublished R6 artifacts, including the September 2026 `6.0.0-snapshot1`, are not
  adopted as a production interoperability baseline.
- **INT-02:** Care areas stay platform codes until an interface or reporting obligation needs SNOMED CT or ICD-11
  mapping. SNOMED CT use depends on the licensing position of the operating country.
- **INT-03:** ISO 27269:2025 (Edition 2) and the applicable published HL7 IPS implementation guide are candidate
  baselines for discharge-summary exchange, deferred until a partner/use case requires them.

## 3.6 Product and accessibility

- **UX-01:** New screens meet WCAG 2.2 AA, including keyboard operation, focus visibility, screen-reader labels, and
  target size.
- **UX-02:** Arabic and English have parity, RTL layout is correct, and screens work at 320–390 px widths.
- **UX-03:** Role and state labels are truthful: “pending offer”, “restricted”, “suspended” are never shown as
  “active”. Practice-administration screens are visually and navigationally separate from patient care.
- **UX-04:** Errors are actionable (what happened, what to do, who can help) and never reveal whether a record the
  actor cannot access exists.
- **UX-05:** Notifications to patients, Consultants, and delegates contain no clinical content, and case numbers
  only where the recipient already has access.

---

# Section 4 — Open decisions

Only decisions requiring business, clinical-governance, privacy, security, or legal authority are listed. Each has a
fail-safe default that applies until it is decided.

| ID | Decision | Owner | Recommended option | Gate | Fail-safe default |
|---|---|---|---|---|---|
| OD-01 | Operating jurisdictions, controller/processor roles, data residency, cross-border transfer, retention, breach notification, patient rights | Legal counsel + DPO + CEO | Counsel opinion covering UAE federal health-ICT law (Federal Law 2/2019, Cabinet Res. 32/2020), UAE PDPL and its interplay with health data, the relevant emirate health authority, Egypt Law 151/2020, and GDPR/HIPAA only if triggered | Production launch | Single hosting region; no replication outside it; no deletion; no secondary use of health data |
| OD-02 | Owner recovery and transfer when the owner is unavailable | Owner / board + Legal | Named successor on file; recovery started by two System Administrators, confirmed by board resolution and out-of-band identity verification, 72 h cooling-off, all administrators and the outgoing owner notified | Phase 3 (owner recovery) | Owner-only commands unavailable; platform runs under System Administrators |
| OD-03 | Mandatory credential requirement set per professional type and jurisdiction | Medical director / credentialing lead | Government identity document; current licence/registration valid where advice or treatment occurs; specialist qualification for the claimed specialty; professional indemnity where the jurisdiction requires it | Phase 5 | No Consultant becomes ACTIVE in production |
| OD-04 | Pre-acceptance offer preview dataset | DPO + medical director | Care area, capability, review type, urgency, expiry, age band, sex only if clinically relevant, preferred language, a Coordinator-authored clinical question, number and type of documents. Excludes identifiers, contacts, nationality, exact location, patient-authored text, and document content | Phase 6 | Care area, capability, review type, urgency, expiry only |
| OD-05 | Clinical continuity window when eligibility is lost | Medical director / clinical governance | Clinical writes blocked immediately; handover read until reassignment is accepted, at most 72 h; urgent Coordinator item within 4 business hours; capability revocation affects new work unless flagged `IMMEDIATE` | Phase 5 | Immediate write block; handover read until reassignment |
| OD-06 | Availability SLO, RPO, RTO, support hours | CEO / operations lead | RPO ≤ 15 min, RTO ≤ 4 h, 99.5 % monthly for patient and staff APIs, quarterly restore drill | Production launch | PITR + daily backups; restore drill before launch |
| OD-09 | Supervisory case visibility: depth (direct reports vs whole subtree) and content (same scope as the report's role vs workload/summary only) | Head of operations + DPO | Leads see cases actively assigned to members of teams they lead, with the same data scope as that member's role, audited as `SUPERVISORY_READ`. Managers above team leads see workload and summaries only, not case content | Phase 2A (visibility rules only) | Direct team members only; same data scope as the member's role; audited |
| OD-07 | Practice Manager `APPOINTMENT_ADMIN` (DEFERRED) | Product + DPO | Keep deferred; contract per §2.6 if revisited | Future release | No patient or case access |
| OD-08 | Booking hold duration, cancellation window, proxy booking (DEFERRED) | Product | Decide with the booking release | Booking release | Booking disabled |

These decisions do not change the approved ownership, administration, authorization, Consultant, Virtual Clinic,
Journey, or provider-retirement architecture.
