# RehletShifaa — Customer Governance and Virtual Clinic: Implementation Reference

**Revision:** 5 — remaining scope only
**Status:** Implementation reference for the next phases, pending final business approval
**Supersedes:** revision 4 (consultant-centred model) and revision 3 (organization/facility topology)
**Date:** 2026-09-25

## 0. How to use this document

This is the reference for everything still to be built. It lists only work we are going to implement. Work that is
already in the repository appears once, in §1, as a baseline that must not be rebuilt. The detailed rules of that
baseline are in [`../consultant-virtual-clinic.md`](../consultant-virtual-clinic.md).

The model has no provider organizations, hospitals, clinic networks, branches, facilities or organization memberships.
The words “clinic” and “practice” refer only to a consultant’s digital Virtual Clinic. They never mean a place where
treatment happens. Hospital contracting, facility billing and treatment-site management are out of scope. They would
need a separate architecture if ever introduced.

```text
RehletShifaa platform (one customer account)
├─ Platform Account Owner        relationship, not a role
├─ System Administrators         privileged responsibility
├─ Internal staff                one primary job + compatible supplementals
└─ Consultants                   independent; cases assigned directly
   └─ Virtual Clinic (exactly one per consultant)
      └─ Practice Managers       explicit, consented, administrative-only delegations
```

---

## 1. Implemented baseline — do not rebuild

| Area | What exists | Where |
|---|---|---|
| Virtual Clinic aggregate | one `virtual_clinics` row per consultant; backfilled; created on consultant creation and lazily on first access | `V53`, `clinic.application.VirtualClinicService` |
| Consultant controls | availability + expected review time, public-profile draft → approve/discard/publish, manager-approval setting, clinic change history | `/api/v1/clinics/{id}/…` |
| Services & prices | governed `clinic_service_changes` (create/update/retire/activate), consultant approval, version history, stale-change protection, EGP base, professional-service kinds only, effective date honoured by the estimate picker | `VirtualClinicService`, `consultant_service_catalog` (+V53 columns) |
| Schedule | timezone-explicit (UTC instants) slots, VIDEO/IN_PERSON, overlap check, cancel, optimistic version; API update | `consultation_slots` |
| Practice Managers (interim) | database delegation with `SCHEDULE`/`PROFILE`/`SERVICES`; no realm role; revocable; closed when the consultant is disabled; proven to have no case/document/referral access | `practice_managers` |
| Eligibility | one rule: active consultant account, VERIFIED + current credential, AVAILABLE, primary care area or APPROVED `CARE_AREA` capability | `clinic.application.ConsultantEligibilityService` |
| Capabilities | structured capability table; credentialing approve/revoke API; no self-approval | `consultant_capabilities`, `/api/v1/admin/practitioners/{id}/capabilities` |
| Direct assignment | coordinator eligibility list (subspecialty, capabilities, review time, workload) and assignment by practitioner id | `/coordinator/cases/{id}/eligible-consultants`, `/consultant-assignment` |
| Referrals | transfer and second opinion: consultant request → coordinator confirm/decline → receiver accept/decline; atomic transfer; limited second-opinion assignment ending on submission; withdrawal of open transfers on clinical decision; full audit + assignment history | `journey.application.ConsultantReferralService` |
| UI | Virtual Clinic page (EN/AR), coordinator eligibility cards, referral confirmation, consultant referral + second-opinion forms | `/{locale}/portal/virtual-clinic`, `portal/ConsultantRouting.tsx` |
| Access-governance foundation | permission catalogue, role templates/versions, assignments, relationships, simulation, effective access, audit | `V31`, `access.*`, `/api/v1/admin/access/**` |

Interim gaps in that baseline, which the phases below close:

- Practice Managers become ACTIVE with no consent step and no MFA.
- Invites to an email that already has an identity account are refused.
- Access governance still carries an `organization_id` scope.
- Eligibility still consults the provider credential authority (`ProviderCredentialEligibility.adopted`).

---

## 2. Decisions that govern the remaining work

1. **Platform Account Owner is a relationship, not a role.** The owner approves governance changes. The owner has no
   staff administration, casework, clinical, financial or Virtual Clinic access.
2. **System Administrator is one privileged responsibility.** It covers `access.*` and `staff.*` only, with no
   clinical, financial, credential, journey, consultant or case authority.
3. **Keycloak authenticates; RehletShifaa authorizes.** Internal job realm roles are ignored once authority has
   converged. `DOCTOR` survives only until consultant access is database-derived.
4. **One platform scope.** Authorization has no organization dimension. Every assignment, relationship and template is
   platform-scoped. Organization columns are pinned to the platform sentinel, then retired (§5, O1).
5. **One primary job per staff member**, or administration-only, plus compatible supplemental responsibilities.
6. **MFA for every owner, staff member, consultant and Practice Manager.** Privileged commands also require
   authentication within the last five minutes.
7. **Durable, idempotent onboarding.** An invitation grants nothing until the first MFA-authenticated activation.
8. **Each consultant has exactly one Virtual Clinic.** It is a digital workspace, not a location.
9. **Cases are assigned directly to named consultants.** Care area and approved capabilities filter eligibility.
10. **Practice Manager access is explicit, consented, MFA-protected and revocable.** It never includes case access.
11. **Referrals are controlled handovers.** Only the resulting case assignment grants access.
12. **No big-bang rewrite.** Each phase is additive, gated and independently testable.

---

## 3. Target authority model

### 3.1 Authority split

Keycloak owns authentication, credentials and password policy, MFA enrolment and the achieved level (`acr`), sessions,
the enabled state and stable subjects.

RehletShifaa owns account ownership, staff lifecycle and jobs, access assignments and relationships, consultant
credentials and capabilities, Virtual Clinic ownership and manager delegations, case assignments and every business
authorization decision. No API accepts a browser-supplied subject or email as proof of identity, ownership or delegation.

### 3.2 Realm roles (end state)

- Keep `PATIENT` and `PATIENT_REPRESENTATIVE` for the patient portal paths.
- Keep `DOCTOR` only until consultant access derives from an ACTIVE consultant lifecycle (phase R1d).
- Use `MFA_REQUIRED` only as an authentication-policy classifier. It never authorizes business work.
- After convergence, internal job roles (`COORDINATOR*`, `OPERATIONS*`, `FINANCE*`, `CREDENTIALING_ADMIN`,
  `SYSTEM_ADMIN`, `AUDITOR`, `PATIENT_IDENTITY_REVIEWER`) are ignored, then deleted (G5a).

### 3.3 MFA and step-up

- **MFA required for:** every non-OFFBOARDED staff member, an active or nominated owner, every ACTIVE consultant and
  every ACTIVE Practice Manager.
- **Every request** from such an identity must carry `acr` level 2.
- **Privileged commands** also need `auth_time` within five minutes:
  - ownership claims and transfers
  - administrator appointment and removal
  - access grants
  - staff invitation and job change
  - sign-in management and offboarding
  - credential and capability decisions
  - Practice Manager invitation and permission changes
- The existing `ActorContext.requireRecentAuthentication` becomes the single step-up check, extended with `acr`.

### 3.4 Staff profile catalogue

Kinds:

- **P:** primary job; exactly one per ordinary staff member.
- **P/S:** may be the primary job or a supplemental responsibility.
- **Priv:** privileged supplemental responsibility, granted only through the approval flow.

| Profile key | Business name | Kind | Core authority |
|---|---|---:|---|
| `SYSTEM_ADMINISTRATOR` | System Administrator | Priv | `access.*`, `staff.*` |
| `CARE_COORDINATION_MANAGER` | Care Coordination Manager | P | coordination casework and supervision |
| `CARE_COORDINATOR` | Care Coordinator | P | assigned coordination casework |
| `TRAVEL_LOGISTICS_MANAGER` | Travel & Logistics Manager | P | travel casework and supervision |
| `TRAVEL_LOGISTICS_SPECIALIST` | Travel & Logistics Specialist | P | assigned travel casework |
| `COMMERCIAL_FINANCE_MANAGER` | Commercial & Finance Manager | P | finance casework, policy, FX, templates |
| `FINANCE_OFFICER` | Finance Officer | P | assigned finance casework |
| `CONSULTANT_OPERATIONS_MANAGER` | Consultant Operations Manager | P | consultant onboarding and readiness |
| `CONSULTANT_OPERATIONS_SPECIALIST` | Consultant Operations Specialist | P | consultant setup and account operations |
| `CREDENTIALING_SPECIALIST` | Credentialing Specialist | P/S | independent credential and capability review |
| `PATIENT_IDENTITY_REVIEWER` | Patient Identity Reviewer | P/S | patient identity decisions |
| `CARE_JOURNEY_MANAGER` | Care Journey Manager | P/S | author, validate, simulate, submit journeys |
| `CARE_JOURNEY_APPROVER` | Care Journey Approver | P/S | approve, publish, retire journeys |
| `COMPLIANCE_AUDITOR` | Compliance Auditor | P/S | access audit and effective-access review |

Rules:

- **Cardinality:** exactly one primary profile. None is allowed only for administration-only accounts or during
  configuration. Operational profiles are primary-only.
- **Source of truth:** `role_assignments` are authoritative. `staff_members.primary_profile_key` drives display and
  setup, never authorization.
- **Separation of duties:** these pairs are forbidden for the same person:
  - Credentialing Specialist and Consultant Operations
  - Journey Manager and Journey Approver
  - Compliance Auditor and System Administrator

  Self-grant, self-revoke and self-approval are always refused.
- **Reporting:** at most one direct manager, in the same function only. Supervisory visibility never replaces the
  assignment a protected case action requires.

---

## 4. Recommended implementation order

The order is chosen so that nothing new is built on the organization-scoped access model, and so that the Virtual
Clinic can reuse identity resolution and MFA instead of building its own.

```text
Release P1 (platform governance, production gate)
  G0   boundary hardening                              small, merged first, not released alone
  O1   de-organize access governance                    before R1: R1 builds on role_assignments
  R1   authority convergence + account governance       one atomic release (R1a–R1e)
  G3   staff onboarding
  G4   staff offboarding
  G5a  pre-production cleanup

Release VC-P (Virtual Clinic production readiness)
  VC2b Practice Manager consent invitation + MFA        needs R1c identity resolution + R1a MFA
  VC1b consultant onboarding lifecycle + MFA            needs R1a, R1c
  VC4  capability administration UI + capability filters
  VC3b referral completion items

Retirement (after P1 + VC-P, when no traffic depends on it)
  O2   coordinator routing without organizations
  O3   provider credentialing → direct consultant credentialing
  O4   remove provider/organization UI, APIs and code

Later bounded capabilities (not launch)
  VC5  patient booking of consultation slots
  VC6  public consultant profile on the website
```

Why O1 comes before R1:

- R1 makes `role_assignments` the only source of staff authority.
- Every assignment currently needs an `access_memberships(subject, organization_id)` row, and the API asks callers
  for `organization`.
- Converging authority onto that shape would carry organizations into every future feature. Pinning the scope first is
  a small additive change; untangling it after R1 would be expensive.

Why VC2b/VC1b come after R1:

- Practice Manager consent and consultant activation need the same global identity resolution and MFA/`acr`
  enforcement that staff onboarding needs. They should reuse them, not duplicate them.

Until VC-P passes, Virtual Clinic features stay behind a configuration flag (e.g. `app.virtual-clinic.enabled`,
default off in production), and existing direct-assignment traffic is unaffected.

---

## 5. Phase specifications

Each phase gives the gap (checked against the code on 2026-09-25), the recommended approach, the data and API changes,
and the acceptance checks.

### G0 — boundary hardening

**Gap:**

- `RoleAssignmentService.grant/revoke` has no self-grant or self-revoke refusal.
- There is no last-administrator protection.
- Platform grants do not require an internal staff record.
- Disabling sign-in (`KeycloakStaffIdentityService.setEnabled`) does not revoke sessions.

**Approach:**

- Add guard clauses in the existing services. No new tables.
- Revoke sessions through the Keycloak admin `logout` endpoint for the user, as a retryable outbox-style identity
  operation after commit.
- Remove any path that links an identity from a browser-supplied subject or email.

**Accept:**

- Self-grant and self-revoke return 403.
- Revoking the last active administrator is refused.
- A disabled identity’s next request fails, because its sessions are revoked.

### O1 — de-organize access governance

**Gap:**

- V31 scopes `role_templates`, `access_memberships`, `role_assignments` and `resource_relationships` by
  `organization_id`. Platform scope is a sentinel (`00000000-0000-0000-0000-000000000001`).
- Scope types include `ORGANIZATION` and `MANAGED_CLINICIANS`.
- `/api/v1/admin/access/**` takes `organization` parameters.
- `ProviderOrganizationAuthorityPort` feeds authorization.

**Approach (additive; no destructive migration):**

1. Add a migration check constraint (or a service-level invariant, if H2 limits it) that new rows use the platform
   sentinel. Existing non-platform rows stay readable for history but are ignored by `AuthorizationService`.
2. Remove `organization` from access API requests. The service fills in the sentinel, so the frontend never sends an
   organization.
3. Retire the `ORGANIZATION` and `MANAGED_CLINICIANS` scope types from the permission catalogue and the template editor.
   Keep `PLATFORM`, `SELF`, `ASSIGNED_CASES` and the journey/work scopes.
4. Drop `ProviderOrganizationAuthorityPort` from `AuthorizationService` decisions. Add an `ArchitectureRulesTest`
   rule: `access` must not depend on `provider`.
5. Rename the seeded `PLATFORM_OWNER` template so it cannot be confused with the Platform Account Owner relationship
   (templates are not ownership).

**Accept:**

- Every effective-access decision is identical with and without organization rows present.
- No access API accepts `organization`.
- The architecture rule passes.

### R1 — authority convergence and account governance (one atomic release)

R1 is built as five slices but is never partly released.

**R1a — MFA and step-up.**

- Enforce `acr` level 2 for MFA-required identities in a filter after JWT conversion.
- Extend `requireRecentAuthentication` to require `acr` too.
- Apply `MFA_REQUIRED` + `CONFIGURE_TOTP` through identity operations.
- Keycloak: add the `acr`→level mapping and step-up flow to `realm-rehletshifaa.json`, and document the live-realm
  change, because `--import-realm` does not update an existing realm.

**R1b — staff lifecycle and database-derived staff authority.**

- `staff_members` gains `primary_profile_key`, `lifecycle_status`
  (`INVITED/ACTIVE/SIGNIN_DISABLED/OFFBOARDING/OFFBOARDED/CANCELLED`), `activated_at`, `staffing_label` and
  offboarding fields (one `ADD COLUMN` per `ALTER`).
- Build a **legacy casework projection**: `JwtRoleConverter` stops trusting internal job realm roles. A new
  `StaffAuthorityResolver` maps ACTIVE staff + published assignments to the same `ActorRole` set.
  `ActorContext.require(...)` keeps working unchanged, so JourneyService call sites do not move in this release.
- First-login activation: on the first MFA-authenticated request, a dedicated transaction flips `INVITED → ACTIVE`
  once and audits it. A database failure returns 503 and grants nothing.

**R1c — global identity resolution** (shared by staff, consultants and Practice Managers).

- Add an `identity_resolutions` table. The flow:
  1. lease the email hash
  2. check local mappings
  3. check the identity-provider marker (already supported by `IdentityProvisioningPort.inviteTracked/recover`)
  4. do an exact email lookup
  5. create an identity only when none exists
- A conflict goes to a fail-closed `CONFLICT` review state.
- This removes today’s `STAFF_EMAIL_EXISTS` dead end. An existing account is **adopted**, never duplicated.

**R1d — remove god-role bypasses.**

- `SYSTEM_ADMIN`, `AUDITOR` and lead bypasses in case, document, identity, finance and credential reads/writes go.
  About 24 `SYSTEM_ADMIN` references in `JourneyService` alone, plus `authorizeRead`, `requireCoordinatorOwnership`,
  `ConsultantReferralService.requireCoordinator*`, and `PricingCatalogService`/`JourneyService` credential writes.
- Replace each with an explicit permission or assignment.
- Consultant access derives from the consultant lifecycle (ACTIVE). `DOCTOR` becomes compatibility-only.

**R1e — account governance.**

- Tables: `platform_accounts`, `platform_account_ownerships` (`NOMINATED → ACTIVE → ENDED`, `NOMINATED → CANCELLED`;
  at most one of each) and `privileged_access_requests` (72 h expiry, requester ≠ target ≠ approver).
- One-shot installation command → owner claim with MFA → owner authorizes the first administrators → vendor
  installation access closes.
- A serialized last-administrator invariant (governance lock), with owner emergency removal and restore.
- `GET /api/v1/me` returns identity, lifecycle and effective capabilities. The frontend route choice (Portal,
  Control Center, Virtual Clinic) reads only this, replacing role-list heuristics in `portal-role-access.ts`.
- `/api/v1/admin/access/me` is folded into it.

**Accept:** see §8.1.

### G3 — staff onboarding

- `staff_onboarding_operations` states:
  - `REQUESTED → CONFIGURED → INVITED → ACTIVE`, or `→ FAILED`
  - `REQUESTED`, `CONFIGURED` or `INVITED → CANCELLED`
- It stores: `UNIQUE(requested_by, idempotency_key)`, the request hash, encrypted name/email, the email hash, profile
  keys, the setup snapshot, attempt/failure/retry fields, and the resolved subject only after R1c succeeds.
- Wizard: Person → Job → Operational setup → Review (the resulting access, conflicts and reason). The browser sends
  profile keys only, never realm roles, template IDs or subjects.
- Reconcile, retry, cancel and resend. Retire the legacy staff-creation aliases (`/admin/staff` create paths).
- Job change is one atomic command:
  1. validate
  2. compute blockers (`JOB_CHANGE_BLOCKED`)
  3. revoke the old primary
  4. grant the new primary
  5. replace setup
  6. audit and notify

  There is never a window with two effective primary jobs.

### G4 — staff offboarding

1. A manager or administrator starts offboarding with a reason (`OFFBOARDING`). No new work is routed to the person;
   bounded authority remains for handover.
2. For urgent security cases, sign-in is disabled immediately and sessions are revoked.
3. The server computes blockers: owned cases, tasks, reports and the last-administrator rule. Existing
   transfer/reassign commands resolve them.
4. Completion rechecks under the governance lock. Revoking access, ending setup and reporting, and moving to
   `OFFBOARDED` happen in one transaction.
5. After commit, the identity is disabled and sessions revoked (retryable). History is never deleted.
6. Restoring sign-in never reverses offboarding. Re-onboarding is a new approved process.

### G5a — pre-production cleanup

- Delete obsolete internal job roles from `realm-rehletshifaa.json` and from the live realm (scripted).
- Retire superseded template versions and record the production access-catalogue baseline.
- Update the QA test-account seed to profiles instead of realm roles.

### VC2b — Practice Manager consent invitation and MFA

**Gap:** `practice_managers` rows are created ACTIVE at invite time, with no consent, no MFA, and an identity-exists
refusal.

**Approach:**

- Add an additive `practice_manager_invitations` table.
- Lifecycle:
  - `REQUESTED → INVITED → ACTIVE`, or `→ FAILED`
  - `INVITED → DECLINED / EXPIRED / CANCELLED`
  - `ACTIVE → REVOKED`
- Keep `practice_managers` as the delegation of record: a row is created or activated only on acceptance.
- Migrate existing ACTIVE rows as `ACTIVE` with `consent_recorded=false`, and require re-acceptance on the next sign-in.
- The consultant invites with MFA + recent authentication, using R1c identity resolution, so existing accounts can be
  invited.
- The invitation shows the consultant, the Virtual Clinic and the requested permissions, with no patient data.
- Acceptance requires MFA (R1a). A manager may hold several delegations, each accepted separately; revoking one never
  touches another.
- Permission changes, whether wider or narrower, need recent authentication. Widening needs re-consent.

**Accept:**

- Nothing is effective before acceptance.
- Expired or declined invites grant nothing.
- The existing isolation tests (no case, document, message, task or referral access) still pass for an accepted
  manager holding all permissions.

### VC1b — consultant onboarding lifecycle and MFA

**Gap:**

- Consultants are created by `JourneyService.createPractitioner` with `credentialing_status` +
  `account_status` + `availability_status`. There is no unified lifecycle and no MFA.
- Credentialing is a legacy admin path. Org-adopted consultants use provider credentialing (removed in O3).

**Lifecycle:**

```text
INVITED → PROFILE_INCOMPLETE → CREDENTIAL_REVIEW → VERIFIED → ACTIVE
                                     ├→ INFORMATION_REQUIRED
                                     └→ REJECTED
ACTIVE ⇄ SUSPENDED;  ACTIVE / SUSPENDED → OFFBOARDED
```

**Approach:**

- Add a `consultant_lifecycle_status` column plus a transition service.
- Activation requires:
  - a resolved identity (R1c) with MFA (R1a)
  - a completed professional profile
  - an independently verified current credential
  - at least one approved capability
  - explicit availability
  - the Virtual Clinic (already guaranteed)
- `ConsultantEligibilityService` adds `lifecycle = ACTIVE` to its rule.
- Consultant Operations owns setup; Credentialing decides independently. The inviter or operational manager of a
  consultant cannot be their credential decision-maker (person-level conflict check).
- Keep declared and independently credentialed professional level as separate fields. No role name can raise a level
  or bypass verification.

### VC3b — referral completion

- Let the referring consultant withdraw a referral that is `AWAITING_COORDINATOR` or `AWAITING_CONSULTANT` (a pending
  offer is ended).
- Allow referrals after clinical review (e.g. `ARRIVAL_CONFIRMED`, treatment) under the same confirm/accept rules. The
  transfer moves the treating-consultant assignment.
- Add a Journey-runtime (Flowable) stage for referrals so the governed journey matches the live workflow.
- Remove the legacy `REASSIGN` review decision once the Journey runtime no longer emits it.

### VC4 — capability administration and filters

- Add a Control Center “Consultant capabilities” screen for Credentialing Specialists, calling the existing
  approve/revoke API with recent authentication.
- Add coordinator filters on the eligibility list: subspecialty, procedure, age group, language. Filters narrow the
  list; they never widen eligibility.

### O2 — coordinator routing without organizations

**Gap:**

- The coordination engine (`AssignmentEngine`, `CoordinationRepository`, `Routing` records) keys teams, policies,
  preferences and routing decisions by `organizationId`.
- A case’s routing scope is derived from the consultant’s provider organization (`CoordinationRepository.provenance`).

**Approach:**

- Re-key teams, policies and preferences to the platform scope; add columns rather than rewriting history.
- Drop the provenance lookup, so routing depends on care area, language and consultant preference only.
- Remove `CoordinationOrganizationsController`.
- Keep the engine's shadow mode until parity with the current behaviour is shown.

### O3 — direct consultant credentialing

**Gap:**

- Credentials live in two places: the legacy `practitioner_credentials` and organization-scoped provider dossiers
  (`provider_credential_*`, `clinician_onboardings`).
- Eligibility fails closed on “adopted” consultants.

**Approach:**

- Migrate each adopted consultant’s current verified dossier revision into direct consultant credential records. Use
  additive tables if dossier fields such as evidence and revision history must be kept.
- Move `CredentialExpiryService` to the direct records only.
- Remove the `adopted()` check from `ConsultantEligibilityService`, so the `clinic` module no longer depends on
  `provider`.

### O4 — remove provider/organization product surface

- Retire the organization-based “My Practice” workspace:
  - route `/[locale]/portal/practice`
  - `ProviderWorkspace`, `useProviderPractice`, `/api/v1/provider-workspace/**` (including `ProviderCaseController`)
  - the Portal landing logic that redirects provider people there
- The Virtual Clinic becomes the only consultant workspace, and it may take the “My Practice” label (a business copy
  decision).
- Remove the Control Center provider screens (`ProviderOrganizations`, `ProviderOrganizationDetail`, `ProviderPeople`,
  `OrganizationProfile`, organization pricing/availability management, `provider-directory`) and their APIs
  (`/api/v1/admin/providers/**`).
- Delete the provider-module code only after a reviewed inventory proves it unused. Tables stay as history until a
  separate data-retention decision.

### VC5 / VC6 — later bounded capabilities

- **VC5 patient booking:**
  - a reservation of an OPEN slot is a separate aggregate; an open slot is never itself a reservation
  - hold → confirm → cancel, with timezone display for the patient
  - it links to a case only through an existing assignment
  - it adds a slot-editing UI (the API already supports updates)
- **VC6 public profile:** render published Virtual Clinic profiles on `/{locale}/consultants`. Show only published
  fields and never anything clinical.

---

## 6. Data-model additions (remaining phases only)

All changes are additive Flyway migrations after `V53`. They must be H2-safe, use `TIMESTAMP WITH TIME ZONE` and one
`ADD COLUMN` per `ALTER`, and never edit an applied migration.

| Phase | Additions |
|---|---|
| O1 | platform-scope constraint/invariant on access tables; catalogue retirement of org scope types |
| R1 | `staff_members` lifecycle/profile columns; `identity_resolutions`; `platform_accounts`; `platform_account_ownerships`; `privileged_access_requests` |
| G3/G4 | `staff_onboarding_operations`; offboarding fields/blocker snapshot |
| VC2b | `practice_manager_invitations`; consent columns on `practice_managers` |
| VC1b | consultant lifecycle columns; declared vs credentialed professional level |
| O2 | platform-scope columns on coordination teams/policies/preferences |
| O3 | direct consultant credential evidence/revision tables (if needed) + data migration |
| VC5 | `slot_reservations` |

---

## 7. API additions (remaining phases only)

- **Identity & account:**
  - `GET /api/v1/me`
  - ownership install/claim/transfer/recovery
  - System Administrator request/approve/reject/cancel
- **Staff:**
  - profile registry
  - staff list/detail
  - invitation create/status/retry/cancel/resend
  - atomic job change
  - sign-in disable/restore
  - operational setup
  - offboarding start/status/complete
- **Access:** the same endpoints without `organization` parameters.
- **Consultants:**
  - invitation and onboarding status
  - lifecycle transitions (activate/suspend/offboard)
  - credential evidence and decisions on direct records
- **Virtual Clinic:**
  - Practice Manager invitation create/cancel/resend (consultant)
  - accept/decline (invitee)
  - `GET /api/v1/clinics/invitations/mine`
- **Case routing:**
  - referral withdraw
  - coordinator eligibility filters

Every endpoint resolves the actor, consultant and delegation server-side. No Virtual Clinic or manager endpoint
returns case data.

---

## 8. Acceptance gates (remaining phases)

### 8.1 Platform governance (P1)

- The owner has only fixed governance capabilities.
- The System Administrator has `access.*`/`staff.*` and no clinical or operational bypass.
- Two-party administrator appointment and removal work; self-approval fails; last-administrator races serialize.
- JWT internal job roles confer no authority. Every active or invited staff identity needs MFA; privileged commands
  need step-up.
- Exactly one primary job with compatible supplementals is enforced. Job changes are atomic and blocked by work that
  would be orphaned.
- Invitations are idempotent under retries and concurrent identity creation. INVITED staff have no authority, and the
  first MFA request activates exactly once.
- Offboarding stops new work and cannot complete with blockers. Disabled or offboarded identities lose sessions
  immediately.
- No authorization decision reads an organization. Effective-access explanations match real decisions.

### 8.2 Virtual Clinic production readiness (VC-P)

- Every ACTIVE consultant is MFA-protected, has an independently verified current credential and an approved
  capability, and has exactly one Virtual Clinic.
- Practice Manager access exists only after accepted consent with MFA. It is revocable per delegation and isolated
  from every clinical resource (existing negative tests stay green).
- Existing identities can be invited without duplication.
- The coordinator filters by capability without widening eligibility. The capability admin UI enforces no self-approval.
- Referral withdrawal ends pending offers. Post-review referrals keep exactly one primary consultant.

### 8.3 Retirement (O2–O4)

- Coordinator routing produces the same decisions without organization keys (shadow parity first).
- No consultant depends on provider credentialing. `clinic` does not depend on `provider`.
- The provider UI and APIs are gone, and the existing patient, proposal, payment, document and case workflows remain
  green.

### 8.4 Verification for every phase

- Focused unit and integration tests, including authorization-matrix and negative isolation tests.
- Live Keycloak verification for MFA, step-up, session revocation and role deletion.
- EN/AR, RTL and 390 px checks on new screens.
- The full backend suite plus `pnpm typecheck` and vitest.
- Tunnel E2E for flows that touch sign-in.

---

## 9. Frontend information architecture (end state)

```text
Control Center
├─ Access & Governance: People · Roles · Administration · Audit
└─ Operations: RehletShifaa Staff · Consultant Operations · Credential & Capability Reviews
               · Coordination · Travel & Logistics · Commercial & Finance

Staff Portal (casework)       coordinator / consultant / travel / finance case workspaces

Virtual Clinic (consultant and Practice Managers)
├─ Overview (profile, availability)     ├─ Schedule
├─ Services & Prices                     ├─ Practice Managers   consultant only
└─ Change History                        consultant only
```

- Navigation comes only from `GET /api/v1/me`. Hidden navigation is never authorization.
- No “lead” checkbox and no template picker in onboarding.
- There are no Organization, Provider or Facility sections.
- Consultants reach their cases from the Staff Portal consultant workspace. The Virtual Clinic never lists cases.

---

## 10. Security and reliability requirements (all phases)

- **Deny by default.**
  - No owner, administrator, auditor or Practice Manager clinical bypass.
  - No self-grant, self-review or self-approval.
  - Maker/checker conflicts are checked per person.
- **Sensitive data.**
  - Encrypt sensitive profile, referral, invitation and identity fields.
  - No clinical narrative in audit detail, email or WhatsApp.
  - Clinical reasons stay encrypted in their domain rows.
- **Server-side checks.**
  - Re-authorize every object relationship server-side.
  - Keep document and message access scoped to case assignments.
- **Idempotency and concurrency.**
  - Idempotency keys bind to canonical request hashes.
  - Identity conflicts fail closed or adopt only an exact verified identity.
  - Optimistic versions on profile, job, delegation, slot, invitation and referral updates.
  - One governance-lock order for access and lifecycle changes.
- **Delivery and failure handling.**
  - Durable identity operations survive identity-provider outages.
  - The outbox retries without duplicating business changes.
  - A database failure during activation returns 503 and grants nothing.
- **Audit.** Every record includes the actor, action, target, outcome, reason, correlation/idempotency reference and time.

---

## 11. Open business decisions

Resolved by the implemented baseline (change only by explicit decision):

- **Manager-prepared service and price changes:** these need consultant approval by default. The consultant may switch
  approval off for their managers; changes applied that way are marked `APPLIED_WITHOUT_APPROVAL`.
- **Manager-prepared public-profile changes:** these always need consultant approval.
- **Managers for several consultants:** a Practice Manager may serve several consultants through separate delegations.

Still open (copy and policy only; none of them change the architecture):

- the final English/Arabic labels: “Virtual Clinic” vs “My Practice” after O4, and the Consultant Operations names;
- whether widening a manager’s permissions requires re-consent (recommended: yes);
- the patient-booking policy (VC5): hold duration, cancellation window and who may book on the patient’s behalf.

**Status:** ready for business review. Start with G0 → O1 → R1.
