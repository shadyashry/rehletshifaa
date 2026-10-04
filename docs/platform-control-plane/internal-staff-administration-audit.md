# Internal (non-clinical) RehletShifaa staff administration — audit

Date: 2026-09-25. Audit-only session (`codex/platform-control-plane`). Scope: RehletShifaa's own internal
non-clinical staff (Platform Owner, Access & Governance, Operations, Credentialing, Commercial/Finance, Journey,
Care Coordination). Explicitly excludes provider/clinic roles (Organization Owner, Practice Manager, Consultant,
Associate Doctor, Consultant Assistant) except for comparison/security-separation checks.

Doc-name substitutions: the brief names `technical-decisions.md`, `implementation-status.md`, `test-status.md`,
`ux-5-access-governance-status.md`, `ux-7-care-coordination-status.md`, `ux-implementation-plan.md` — all exist
under `docs/platform-control-plane/` and were read as named; no substitution needed.

## 1. Bootstrap account

- Mechanism: opt-in Spring property `app.access.bootstrap-subject` (env `APP_ACCESS_BOOTSTRAP_SUBJECT`), wired by
  `backend/src/main/java/com/rehletshifaa/access/infrastructure/AccessBootstrapConfiguration.java` (an
  `ApplicationRunner` that calls `AccessBootstrapService.initialize(subject)` only if the property is non-blank).
  Not set in `docker-compose.yml` / `docker-compose.tunnel.yml` today — it must be supplied out-of-band at
  first deployment (or run once and then removed; the completion marker makes re-running inert).
- Effect: one `access_bootstrap` completion row + one `role_assignments` row, `source=BOOTSTRAP`,
  `assigned_by=DEPLOYMENT`, `reason="Initial governance owner"`, template `PLATFORM_OWNER` v1
  (`31000001-0000-0000-0000-000000000001`), scope `PLATFORM`, status `ACTIVE`. Verified live: subject
  `00000000-0000-0000-0000-000000000106` (Keycloak user `credential-admin`) holds exactly this row
  (`role_assignments` query, 2026-09-22 06:16:18 UTC). `access_bootstrap` also shows one completed row for that
  subject — restart cannot re-bootstrap after revocation (technical-decisions.md §10).
- Identity vs business role for this account, verified live:
  - **Identity (Keycloak)**: realm roles `CREDENTIALING_ADMIN`, `SYSTEM_ADMIN` (`realm-rehletshifaa.json`,
    user id `00000000-0000-0000-0000-000000000106`).
  - **Business (RehletShifaa)**: `PLATFORM_OWNER` v1, scope PLATFORM (the row above). These are independent grants
    from independent systems — the account happens to hold both, not because one implies the other.
- Does the legacy `SYSTEM_ADMIN` realm role alone open Control Center → Access & Governance → People? **No.**
  `frontend/src/components/platform-control-center/control-center-nav.ts`: `accessUsers` (People) visibility is
  `access("access.effective_access.view")`, a real backend business-permission check
  (`ControlCenterAccess.can`), not `access.legacy.admin` (the realm-role group). Only the bootstrap-granted
  `PLATFORM_OWNER` business role (which carries `access.effective_access.view`) opens it. `SYSTEM_ADMIN` alone
  (no business role) would open `RehletShifaa Staff` (`/team`, gated by `access.legacy.admin`) but not
  Access & Governance.
- Can it grant access to others? Yes — `PLATFORM_OWNER` v1 holds `access.assignment.manage` (`access.role.*`,
  `access.relationship.manage`, `access.audit.view`, `access.effective_access.view`) — the full governance
  envelope (`V31__access_governance_foundation.sql` grants for template
  `31000000-0000-0000-0000-000000000001`).
- Intended for ongoing use or bootstrap-only? The design (technical-decisions.md §10) treats it as a one-time seed
  ("restart cannot regrant after revocation; an existing authorized owner must grant a replacement") — a
  deliberately narrow, audited bootstrap primitive, not a general provisioning API. Nothing in code marks the
  resulting Platform Owner assignment as special/non-renewable after that; it behaves like any other assignment
  once created (can be revoked/replaced through ordinary Give/Remove access).

## 2. Login model

- Keycloak (realm `rehletshifaa`) is authoritative for authentication, sessions, MFA and account
  enable/disable (technical-decisions.md §11). RehletShifaa's own tables (`access_memberships`, `role_assignments`,
  `resource_relationships`) are authoritative for business authorization.
- Sign-in is one OIDC Authorization Code + PKCE flow for every persona; there is no separate "Staff Portal login".
  Post-login, the frontend reads realm roles from the token (`ActorRole` enum: `COORDINATOR`, `COORDINATOR_LEAD`,
  `OPERATIONS`, `OPERATIONS_LEAD`, `FINANCE`, `FINANCE_LEAD`, `CREDENTIALING_ADMIN`, `SYSTEM_ADMIN`, `AUDITOR`,
  `PATIENT_IDENTITY_REVIEWER`, plus `PATIENT`/`PATIENT_REPRESENTATIVE`/`DOCTOR`) to decide workspace routing
  (`frontend/src/lib/portal-role-access.ts`) and calls `GET /admin/access/me` for the actual business-permission
  set (`ControlCenterAccess`) that drives Control Center navigation and page content.
- A realm role alone gives Staff Portal *workspace* access and the legacy `ActorRole`-gated endpoints (still the
  live authorization path for most Journey/coordination casework — technical-decisions.md §3, §11). It does **not**
  by itself grant any `access.*`/`assignment.*`/`credential.*`/… business capability; those come only from an
  ACTIVE `role_assignments` row. Conversely a business role alone (no realm role) cannot open Staff Portal, since
  workspace routing keys off realm roles, not `role_assignments`.
- Mixed-role users: realm roles and business roles are simply unioned — e.g. `credential-admin` gets both the
  legacy `SYSTEM_ADMIN` surface (`RehletShifaa Staff`, `/admin/**` legacy endpoints) and the `PLATFORM_OWNER`
  business surface (Access & Governance) because it independently holds both grants.

## 3. Current staff-invite flow ("RehletShifaa Staff" page)

Route: Control Center → Operations → **RehletShifaa Staff** (`/team`,
`frontend/src/components/platform-control-center/CareOperationsPages.tsx`, form component
`StaffInviteForm` in `legacy-admin.tsx`). Visible only when `access.legacy.admin` (realm roles
`CREDENTIALING_ADMIN`/`SYSTEM_ADMIN`/`AUDITOR`; write actions further require `SYSTEM_ADMIN`, non-read-only).

Fields: Full name, Work email, **Team** (dropdown: Coordination / Operations / Finance — hard-coded
`STAFF_FUNCTIONS = ["COORDINATOR","OPERATIONS","FINANCE"]`), Invitation language, "Team lead" checkbox (submits the
composite `_LEAD` role). No "Initial business role" field, no reason field — this screen never touches
`role_assignments`.

Backend: `POST /api/v1/admin/staff` → `AdminJourneyController.createStaff` → `JourneyService.inviteStaff`
(`backend/src/main/java/com/rehletshifaa/journey/application/JourneyService.java:403`). Guarded by
`actors.require(ActorRole.SYSTEM_ADMIN)`. Request DTO `StaffInviteRequest`
(`journey/api/JourneyDtos.java:52`) restricts `role` to the regex
`COORDINATOR|COORDINATOR_LEAD|OPERATIONS|OPERATIONS_LEAD|FINANCE|FINANCE_LEAD` — **no other internal role can be
invited through this endpoint**, at the DTO validation layer, not just the UI dropdown.

Steps performed: dedupe by email hash → `IdentityProvisioningPort`/`KeycloakStaffIdentityService.invite(name,email,
role,locale)` creates an **enabled** Keycloak user, maps the requested realm role (the four-argument overload is
explicitly "legacy staff/doctor realm-role compatibility" only — technical-decisions.md §11), and triggers
Keycloak's `UPDATE_PASSWORD`/`VERIFY_EMAIL` required-actions email (12 h link, `app.identity-admin
.invite-lifespan-seconds`) → inserts a `staff_members` row (`staff_role`, encrypted name/email, `invitation_status
=INVITED`) → audits `STAFF_INVITED`. **No `access_memberships` row and no `role_assignments` row is created.**
User activates (sets password) → signs in → lands in Staff Portal per their realm role.

So today's real flow is closer to the brief's Option 4-list variant:
1. RehletShifaa Staff → Invite Staff creates a **real Keycloak identity** (not "manual Keycloak creation" — it is
   UI-driven and automated), restricted to Coordinator/Operations/Finance (+ leads).
2. That identity is immediately visible in Access & Governance → People (identity/workspace section) because
   `staff_members`/Keycloak are read there.
3. The realm role alone is sufficient for Staff Portal and the legacy `ActorRole`-gated casework endpoints.
4. A **separate, manual** step — Access & Governance → People → *Give access* — is required to grant any
   `role_assignments` business role (e.g. `CARE_COORDINATION_MANAGER`, `PROVIDER_OPERATIONS_MANAGER`,
   `CREDENTIAL_VERIFIER`, `ACCESS_GOVERNANCE_MANAGER`, `PLATFORM_OWNER`, `JOURNEY_MANAGER`, `JOURNEY_APPROVER`,
   `COMPLIANCE_AUDITOR`, `SUPPORT_AGENT`) needed for Control Center configuration screens
   (Coordination Setup, Roles, Provider Operations, Credential Reviews, etc.).
5. For `PLATFORM_OWNER`, `ACCESS_GOVERNANCE_MANAGER`, `PLATFORM_ADMIN`, `CREDENTIAL_VERIFIER`, `JOURNEY_MANAGER`,
   `JOURNEY_APPROVER`, `COMPLIANCE_AUDITOR`, `SUPPORT_AGENT`, `PROVIDER_OPERATIONS_MANAGER` — **there is no
   identity-invitation UI or API at all**. The corresponding person must already have (or separately be given) a
   Keycloak identity with a realm role that grants Control Center entry (`SYSTEM_ADMIN`/`CREDENTIALING_ADMIN`/
   `AUDITOR`, or none at all — a business-only grant to an externally-provisioned subject also works, since
   `role_assignments.subject` is a free-text external subject id, not FK'd to `staff_members`), created either by
   direct Keycloak administration (kcadm/Admin Console) or reuse of an existing identity.

## 4. Role inventory (internal, non-clinical only)

19 templates total in `V31__access_governance_foundation.sql`; provider/clinic ones excluded here
(`ORGANIZATION_OWNER`, `PRACTICE_MANAGER`, `CONSULTANT`, `ASSOCIATE_DOCTOR`, `CONSULTANT_ASSISTANT`).

| Technical key | Display name (seed) | Actor type | Grants (v1, scope) | Assigned live? | Used by invite flow? | Privileged? |
|---|---|---|---|---|---|---|
| `PLATFORM_OWNER` | RehletShifaa Owner | GOVERNANCE | full `access.*` (role CRUD/publish/retire, assignment.manage, relationship.manage, effective_access.view, audit.view), PLATFORM | 1 (`credential-admin`, via bootstrap) | No (bootstrap only) | Yes — highest |
| `ACCESS_GOVERNANCE_MANAGER` | Access Governance Manager | GOVERNANCE | `access.role.view/create/edit_draft/simulate`, `access.effective_access.view`, `access.audit.view`, PLATFORM — **no `access.role.publish`, no `access.assignment.manage`, no `access.relationship.manage`** | 0 | No | Yes, but cannot grant/revoke access or publish roles as seeded |
| `PLATFORM_ADMIN` | System Administrator | GOVERNANCE | `support.account.view`, `support.invitation.resend`, ORGANIZATION | 0 | No | Low (support-only despite the name) |
| `PROVIDER_OPERATIONS_MANAGER` | Provider Operations Manager | GOVERNANCE | `provider.view/create/update`, `provider.clinician.invite`, ORGANIZATION | 0 | No | Yes (organization-scope provider onboarding) |
| `CREDENTIAL_VERIFIER` | Credential Verification Officer | GOVERNANCE | `credential.view/review/verify`, ORGANIZATION | 0 | No (centrally delegable, granted via People "Give access" only) | Yes (CRITICAL: `credential.verify`) |
| `JOURNEY_MANAGER` | Journey Manager | GOVERNANCE | `journey.view/create/edit_draft/validate/simulate`, ORGANIZATION | 0 | No | Medium (no publish) |
| `JOURNEY_APPROVER` | Journey Approver | GOVERNANCE | `journey.view/approve/publish/retire`, ORGANIZATION | 0 | No | Yes (`journey.publish` CRITICAL) |
| `CARE_COORDINATION_MANAGER` | Care Coordination Manager | COORDINATOR | `assignment.team.view/manage`, `assignment.policy.view/manage`, `assignment.simulate`, `assignment.reassign`, ORGANIZATION | 0 | No | Yes (manages other coordinators) |
| `COMPLIANCE_AUDITOR` | Compliance & Audit Reviewer | GOVERNANCE | `access.role.view`, `access.effective_access.view`, `access.audit.view`, PLATFORM | 0 | No | Low (read-only) |
| `SUPPORT_AGENT` | Support Officer | GOVERNANCE | `support.account.view`, `support.invitation.resend`, ORGANIZATION | 0 | No | Low |
| `COORDINATOR` | Care Coordinator | COORDINATOR | `clinical.case.view`, `appointment.view`, `assignment.manual_assign`, ASSIGNED_CASES | 0 (business role; identity role used instead — see §3/§6) | No | No |
| `OPERATIONS` | Operations Specialist | (default/complement set) | `appointment.view/schedule`, ASSIGNED_CASES | 0 | No | No |
| `FINANCE` | Finance Officer | (default/complement set) | `finance.deposit.view/confirm`, `finance.reconcile`, ASSIGNED_CASES | 0 | No | No (but touches money — see §16 gap) |
| `SERVICE_ACCOUNT` | Integration Service Account | SERVICE | `integration.invoke`, ORGANIZATION | 0 | No | System-only, not a person |

"Assigned live?" = count of ACTIVE `role_assignments` rows on this template today (verified via
`docker exec rehletshifaa-postgres-1 psql … SELECT * FROM role_assignments`, 5 total rows: 1 `PLATFORM_OWNER`
ACTIVE, 1 revoked test row, 3 PENDING legacy `CONSULTANT` mappings — none of the internal-staff templates above
except `PLATFORM_OWNER` are held by anyone).

Separately, the **identity-role** layer (Keycloak realm roles, `ActorRole.java`) still independently drives most
day-to-day authorization for `COORDINATOR`/`COORDINATOR_LEAD`/`OPERATIONS`/`OPERATIONS_LEAD`/`FINANCE`/
`FINANCE_LEAD`/`CREDENTIALING_ADMIN`/`SYSTEM_ADMIN`/`AUDITOR`/`PATIENT_IDENTITY_REVIEWER` — these are not
"business roles" in the `role_assignments` sense but they are how RehletShifaa Staff invites and legacy
authorization actually work, so they are listed for completeness in §12–15.

## 5. Recommended business-facing names

| Technical key | Current display name | Recommended | Rationale |
|---|---|---|---|
| `PLATFORM_OWNER` | RehletShifaa Owner | **RehletShifaa Platform Owner** | Matches brief direction; "RehletShifaa Owner" reads ambiguous with a company owner |
| `ACCESS_GOVERNANCE_MANAGER` | Access Governance Manager | **Access & Governance Administrator** | Actually administers configuration (roles, but not grants as seeded) — "Administrator" is warranted here per rule C, since this role is one of the few whose job is administering platform access itself |
| `PLATFORM_ADMIN` | System Administrator | **Support Officer (Escalations)** or fold into `SUPPORT_AGENT` | Grants are `support.account.view`/`support.invitation.resend` only — "System Administrator" overstates it; avoid "Admin" per rule C since it does not administer platform config |
| `PROVIDER_OPERATIONS_MANAGER` | Provider Operations Manager | **Provider Operations Manager** (keep) | Grants include `provider.create`/`provider.update` at ORGANIZATION scope — genuinely managerial, not specialist-only |
| `CREDENTIAL_VERIFIER` | Credential Verification Officer | **Credentialing Specialist** (independent-review framing: "Credential Reviewer" acceptable alt) | Grants are view/review/verify — decision-focused; "Officer" is not used elsewhere in the naming set |
| `JOURNEY_MANAGER` | Journey Manager | **Care Journey Manager** | Matches brief direction; distinguishes from `JOURNEY_APPROVER` |
| `JOURNEY_APPROVER` | Journey Approver | **Care Journey Approver** (keep distinct from Manager — maker/checker: edit_draft vs publish are mutually exclusive by `PermissionCatalog.validate`'s `MAKER_CHECKER_SEPARATION_REQUIRED`) | Distinct permissions (approve/publish/retire vs create/edit/validate) justify a distinct name, not a merge |
| `CARE_COORDINATION_MANAGER` | Care Coordination Manager | **Care Coordination Manager** (keep) | Matches brief exactly; manages teams/policy, i.e. genuinely a manager |
| `COMPLIANCE_AUDITOR` | Compliance & Audit Reviewer | **Compliance & Audit Reviewer** (keep) | Read-only, name already accurate |
| `SUPPORT_AGENT` | Support Officer | **Support Specialist** | "Agent" reads like a channel role; "Specialist" matches the naming convention used elsewhere |
| `COORDINATOR` (business template) | Care Coordinator | **Care Coordinator** (keep) | Matches brief |
| `OPERATIONS` (business template) | Operations Specialist | **Provider Operations Specialist** if scoped to provider onboarding work, else generic **Operations Specialist** — current grants (`appointment.view/schedule`) are journey/appointment work, not provider onboarding, so keep **Operations Specialist** and reserve "Provider Operations" for `PROVIDER_OPERATIONS_MANAGER`'s family | Avoid two different things both called "Provider Operations" |
| `FINANCE` (business template) | Finance Officer | **Finance Officer** (keep) | Deposit confirm/reconcile is officer-level, not policy-setting (`financePolicy` is a separate lead/admin check) |
| `SERVICE_ACCOUNT` | Integration Service Account | (not a person; no rename needed) | — |

No "Identity Verification Specialist" / "Commercial Manager" / "Patient Operations Specialist" role exists in the
current template set — the brief's suggested names for those are **not applicable** (see §11 gap list); do not
invent them without a corresponding permission bundle. Patient-identity review is instead a legacy realm role
(`PATIENT_IDENTITY_REVIEWER`) with no `role_templates` counterpart at all.

## 6. Role hierarchy (built strictly from actual grants)

```
RehletShifaa Platform Owner  (access.* full incl. assignment.manage — only role that can grant/revoke access)
│
├── Access & Governance Administrator   (role authoring only; cannot publish or grant/revoke — needs Owner for that)
├── Provider Operations Manager         (provider.view/create/update/clinician.invite, ORGANIZATION)
├── Credentialing Specialist            (credential.view/review/verify, ORGANIZATION) — centrally delegable, not self-service
├── Care Journey Manager  →  Care Journey Approver   (maker/checker: draft vs publish are separate people by design)
├── Care Coordination Manager
│   └── Care Coordinator                (identity-role only today; no business-template holder exists live)
├── Compliance & Audit Reviewer         (read-only across access.* )
└── Support Specialist / (System Administrator template, support-only)
```

No manager/lead tier exists above `PROVIDER_OPERATIONS_MANAGER`, `CREDENTIAL_VERIFIER`, `JOURNEY_MANAGER`/
`APPROVER`, or `COMPLIANCE_AUDITOR`/`SUPPORT_AGENT` in the data — they all report conceptually to Platform Owner
directly; no "Credentialing Lead" or "Operations Lead" business template exists (only the *identity*-layer
`OPERATIONS_LEAD`/`FINANCE_LEAD`/`COORDINATOR_LEAD` composite realm roles exist, which is a different, coarser
hierarchy used for Staff Portal supervisory visibility, not `role_assignments`).

## 7. Who-can-grant-what matrix (internal staff)

| Actor (holding only this) | Invite staff (`/admin/staff`) | Give business role (`access.assignment.manage`) | Revoke business role | Manage team (`assignment.team.manage`) | Disable sign-in (`/admin/staff/{s}/disable`) | Remove staff | Grant privileged role (Platform Owner/Access Gov.) |
|---|---|---|---|---|---|---|---|
| `PLATFORM_OWNER` (business) | No (needs `SYSTEM_ADMIN` realm role too) | **Yes** | **Yes** | No (not its permission set) | No (needs `SYSTEM_ADMIN` realm role) | No command exists for anyone | **Yes — including to itself, no maker/checker (§8)** |
| `ACCESS_GOVERNANCE_MANAGER` | No | **No** (`access.assignment.manage` not granted in v1) | **No** | No | No | No | No |
| `SYSTEM_ADMIN` (realm role only, no business role) | **Yes** (Coordinator/Operations/Finance/+lead only) | No | No | No | **Yes** | No ("no single delete person" — ux-5 §13) | No |
| `CREDENTIALING_ADMIN` / `AUDITOR` (realm role only) | No (endpoint requires `SYSTEM_ADMIN` specifically) | No | No | No | No | No | No |
| `CARE_COORDINATION_MANAGER` (business) | No | No | No | **Yes** (own organization) | No | No | No |
| `CREDENTIAL_VERIFIER` (business) | No | No | No | No | No | No | No |
| Provider Organization Owner / Practice Manager | No | No (their capabilities are `provider.*`/practice-scoped only; `access.assignment.manage` is PLATFORM-scoped and never granted to a provider template) | No | No | No | No | No |

## 8. Care Coordination staff onboarding (Manager + 3 Coordinators)

1. **Create identity** — Control Center → Operations → RehletShifaa Staff → Invite Staff, Team = Coordination, for
   each of the 4 people; check "Team lead" only for the manager (submits `COORDINATOR_LEAD`). **Implemented in UI.**
2. **Assign Staff Portal workspace** — automatic side effect of step 1 (realm role grants Staff Portal routing).
   **Implemented (automatic).**
3. **Assign business role** — the 3 Coordinators need nothing further for basic casework (the `COORDINATOR` realm
   role already drives `ActorRole`-gated endpoints). The Manager additionally needs the `CARE_COORDINATION_MANAGER`
   **business** role (`assignment.team.manage`, `assignment.policy.manage`, …) to use Coordination Setup — this is
   **not** offered anywhere in the RehletShifaa Staff flow; it requires a separate, manual Access & Governance →
   People → Give access grant (organization scope, published `CARE_COORDINATION_MANAGER` v1). **API/manual step,
   not exposed in the invite UI.**
4. **Add to coordinator team** — Coordination Setup → Teams & People → *Add person* (`PUT
   /admin/coordination/{org}/teams/{id}/members`), done by whoever holds `assignment.team.manage` (i.e. the Manager,
   once step 3 is done — a bootstrap ordering dependency: the Manager must get the business role before they can
   add anyone to a team). **Implemented in UI**, but gated behind step 3's manual grant.
5. **Mark on duty / capacity** — same Teams & People screen (capacity fields), **implemented in UI**.
6. **Sign in** — standard OIDC; **implemented**.
7. **Team Queue becomes visible** — Staff Portal Team queue derives from `coordinatorSubject` + team membership;
   **implemented**, contingent on steps 1–5 completing.

Net: coordinators are usable end-to-end through UI alone; the **Manager** requires one manual, API-only-in-practice
Access & Governance step (no wizard connects "invite as Coordination lead" to "grant Care Coordination Manager
business role" — an administrator must know to do both).

## 9. Provider Operations Manager/Specialist onboarding

No `PROVIDER_OPERATIONS` identity realm role exists (`ActorRole.java` has no such entry) and RehletShifaa Staff's
invite dropdown does not offer it either. The only path found:
1. Create/obtain a Keycloak identity for the person (no invite UI targets this business role; must reuse an
   existing staff/practitioner identity or provision one out-of-band, e.g. by inviting them as e.g. `OPERATIONS`
   staff for Staff Portal access, or through direct Keycloak administration for Control-Center-only access).
2. Access & Governance → People → Give access → `PROVIDER_OPERATIONS_MANAGER`, scope ORGANIZATION, requires actor
   to hold `access.assignment.manage` (Platform Owner) and to already itself hold `provider.view/create/update/
   clinician.invite` (self-check in `RoleAssignmentService.grant`, line 48) for a **non**-centrally-delegable,
   non-journey template — i.e. **the granting Platform Owner must already personally hold these provider
   capabilities**, or the grant is refused.
3. Once granted, the person can open Control Center → Providers (`provider.view`) and invite clinicians
   (`provider.clinician.invite`) for that organization; Credential Reviews access is separate (`credential.review`,
   not part of this template).
This is **Level C** for this role specifically: no identity-invitation UI at all; entirely manual/API-driven.

## 10. Credentialing staff onboarding

1. **Identity role**: no dedicated invite path; `CREDENTIALING_ADMIN` realm role exists in the realm but is not
   offered by RehletShifaa Staff's invite dropdown (regex excludes it) — must be set via direct Keycloak
   administration or reused from a seeded account (e.g. `credential-admin`).
2. **Control Center access**: `CREDENTIALING_ADMIN` (or `SYSTEM_ADMIN`/`AUDITOR`) as a realm role opens Credential
   Reviews via the `access.legacy.admin` fallback (`control-center-nav.ts`: `credentials` visible if
   `a.can("credential.review") || a.legacy.admin`) — so a bare legacy `CREDENTIALING_ADMIN` account can review
   credentials **without any `role_assignments` grant at all**, through the legacy path.
3. **Business role** (for the new, tenant-scoped, independently-reviewed model): `CREDENTIAL_VERIFIER` template,
   granted the same way as §9 (Give access, ORGANIZATION scope, "centrally delegable" bundle —
   `RoleAssignmentService.grant`'s `credentialVerifierBundle` branch, which requires a *verified* provider
   organization and a *trusted, existing* subject; it does not require the granting Platform Owner to personally
   hold `credential.verify`, unlike §9's provider-ops case — `catalog.centrallyDelegable` exempts it).
4. **Independent-review separation**: `AuthorizationService` (technical-decisions.md §13.4, verified in
   `ResourceRelationshipService.java:31` and `AuthorizationService.java:65`) rejects a reviewer verifying/reviewing
   their own submitted credential (self subject match), for every actor including `SYSTEM_ADMIN` — server-side, not
   just UI. This holds for both the legacy `CREDENTIALING_ADMIN` path and the new `CREDENTIAL_VERIFIER` path.
Level: **C** (business-role governance and separation are solid; identity provisioning is manual/Keycloak-only).

## 11. Commercial / Finance / Journey staff setup

- **Finance**: identity via RehletShifaa Staff (Team = Finance, +lead), realm role `FINANCE`/`FINANCE_LEAD` drives
  `/finance/**` and the `journey_work` `APPROVE_COMMERCIAL_TERMS` capability. `financePolicy` (Margin & Deposit
  page) additionally requires `FINANCE_LEAD` or `SYSTEM_ADMIN` (`legacyAdministration`, purely realm-role based —
  **no `FINANCE` business template involvement for this screen at all**, despite a `FINANCE` business template
  existing in `role_templates`). The `FINANCE` business template (`finance.deposit.*`, `finance.reconcile`,
  ASSIGNED_CASES) is seeded but **held by nobody live** and not wired into any invite flow — its relationship to
  the legacy `FINANCE`/`FINANCE_LEAD` realm roles is undefined/overlapping (see §16 redundancy finding).
- **Commercial/Pricing**: no dedicated "Commercial" business template or realm role exists at all. Price Lists /
  Exchange Rates Control Center pages are gated by `price_list.view` (provider-scoped business permission) **or**
  `access.legacy.admin` (`SYSTEM_ADMIN`/`CREDENTIALING_ADMIN`/`AUDITOR`) — i.e. today "Commercial staff" is not a
  first-class internal role; it is either a provider-side `price_list.manage` grant or falls to `SYSTEM_ADMIN`.
- **Care Journey Manager**: no realm role; only the `JOURNEY_MANAGER`/`JOURNEY_APPROVER` business templates, PLATFORM
  scope for their permissions (`journeyDelegable`), so `RoleAssignmentService.grant`'s branch at line 48 that skips
  the actor's own-permission self-check applies (`grants.stream().allMatch(g->g.scope()==ScopeType.PLATFORM &&
  catalog.journeyDelegable(g.permission()))`) — a Platform Owner can grant Journey Manager/Approver without
  personally holding `journey.*` themselves. Access to the Journeys screen itself needs `journey.view`.

## 12. Staff page vs People page responsibilities

Confirmed non-duplicated as designed (`ux-5-access-governance-status.md` §6–7 and live code):
- **RehletShifaa Staff** (`/team`): identity/workforce roster for Coordination/Operations/Finance — who works
  internally, team/lead structure, invite, resend, disable/enable sign-in. Gated by `access.legacy.admin`
  (identity/realm-role concept), not by any `access.*` business permission.
- **Access & Governance → People** (`/access/users`): identity read-only summary ("Account & workspaces", tagged
  *Managed by Identity System*, linking back to RehletShifaa Staff for changes) **plus** the business-access layer
  (role/organization cards, Give/Remove access, Access Summary "Can X do Y?", audit). Gated by
  `access.effective_access.view`/`access.role.view` (business permissions).
No screen re-implements the other's write actions; People links out to RehletShifaa Staff for identity changes and
vice versa. One real overlap: both screens can show/imply the same person's status, but only one (People) can
change business access and only one (Staff) can change identity/sign-in state.

## 13. Gaps (current maturity: LEVEL C, with parts of B)

- **LEVEL C** is the best overall description: business-role management (Roles/wizard/versions/Give-Remove access,
  maker/checker on publish) is complete and governed; but *identity* provisioning for anything other than
  Coordinator/Operations/Finance (+leads) has **no UI or dedicated API** — it requires direct Keycloak
  administration (kcadm/Admin Console) for `SYSTEM_ADMIN`, `CREDENTIALING_ADMIN`, `AUDITOR`,
  `PATIENT_IDENTITY_REVIEWER`, and for anyone who should hold `PLATFORM_OWNER`, `ACCESS_GOVERNANCE_MANAGER`,
  `PLATFORM_ADMIN`, `PROVIDER_OPERATIONS_MANAGER`, `CREDENTIAL_VERIFIER`, `JOURNEY_MANAGER`, `JOURNEY_APPROVER`,
  `COMPLIANCE_AUDITOR`, or `SUPPORT_AGENT` as their *business* role but has no matching realm-role/staff-invite
  counterpart already covering them.
- No single "Invite Staff" wizard connects identity creation → business role → team/manager assignment in one flow
  for anyone beyond Coordinator/Operations/Finance; for those three, business-role assignment for their *lead*
  supervisory business templates (`CARE_COORDINATION_MANAGER` etc.) is a second, disconnected manual step (§8).
- No "remove staff" / single offboarding action (ux-5 §13, confirmed unchanged): disabling identity, revoking
  business roles, ending provider membership, and reassigning open work are five separate commands with no
  orchestration — true for internal staff exactly as for providers.
- `FINANCE`/`OPERATIONS`/`COORDINATOR` business templates exist in `role_templates` but are held by nobody and
  are not reachable from any invite/assignment flow that maps a Coordinator/Operations/Finance realm-role hire
  onto them — the legacy realm role, not the business template, is what actually authorizes their daily work. The
  business templates for these three look like unused/dead seed data today (§16).
- No native "Commercial Manager/Specialist" or "Identity Verification Specialist" role exists per §11 — brief's
  suggested names for those have no corresponding template to rename.

## 14. Security findings

- **HIGH — no self-grant / no maker-checker on business-role assignment.**
  `RoleAssignmentService.grant()` (backend/src/main/java/com/rehletshifaa/access/application/
  RoleAssignmentService.java:26-75) requires only `access.assignment.manage` from the acting subject; there is no
  check preventing `command.subject()` from equalling the actor's own subject, and no independent-reviewer
  requirement (unlike `RoleTemplateService.publish`, which explicitly blocks the draft's own creator/editor from
  publishing it, lines 94-101). As seeded, only `PLATFORM_OWNER` holds `access.assignment.manage`, so in practice a
  Platform Owner can (a) grant `PLATFORM_OWNER` to themself again/to a second identity, or (b) grant themself any
  other role, with only the mitigating factor that `access.assignment.manage` is flagged `recent`-auth in
  `PermissionCatalog` (a fresh sign-in is required, per `AuthorizationService`'s 15-minute rule referenced in
  technical-decisions.md §13.4) — recent authentication is enforced, but reviewer independence and self-grant
  prevention are not. Given there is currently exactly one live Platform Owner, this is a single point of failure:
  that one account can mint unlimited additional Platform Owners unilaterally, audited but not blocked or
  dual-controlled. Recommend requiring an independent reviewer (or at minimum blocking self-targeted PLATFORM-scope
  grants) before treating this as production-ready governance, consistent with how `access.role.publish` is
  already treated.
- **MEDIUM — `ACCESS_GOVERNANCE_MANAGER` cannot do most of what its name implies.** As seeded it lacks
  `access.role.publish`, `access.assignment.manage`, and `access.relationship.manage` — it can draft/simulate roles
  and view audit/effective-access, but cannot grant/revoke access or publish a role. This is not unsafe, but the
  business-facing name should not read as "the person who runs Access & Governance day to day" without
  clarification, since only `PLATFORM_OWNER` actually can.
- **LOW/INFO — identity invitation is capability-gapped, not over-permissive.** The `/admin/staff` regex whitelist
  (Coordinator/Operations/Finance + leads only) is a genuine safety feature (it structurally prevents inventing a
  `SYSTEM_ADMIN`/`CREDENTIALING_ADMIN` account through this screen), but it also means those higher-privilege
  identity roles can *only* be created by whoever already has direct Keycloak admin access outside the
  application — worth documenting as an intentional out-of-band control rather than a gap to "fix" casually.
- **Verified safe — providers cannot touch internal staff.** `access.assignment.manage`/`access.role.*` are
  PLATFORM-scoped-only permissions (`PermissionCatalog`: family `"access"` → `Set.of(ScopeType.PLATFORM)`), never
  granted to `ORGANIZATION_OWNER`/`PRACTICE_MANAGER` templates, and `RoleAssignmentService.grant` explicitly
  requires `command.scope()==PLATFORM && organizationId==PLATFORM` for platform-scope grants — a provider
  administrator's organization-scoped capabilities (`provider.member.invite`, etc.) cannot reach this code path.
  Confirmed server-side, not merely hidden in navigation (item 21 of the brief).
- **Verified safe — independent credential review.** Self-verification/self-review is blocked server-side for
  every actor type including `SYSTEM_ADMIN` (`AuthorizationService.java:65`, `ResourceRelationshipService.java:31`).

## 15. Recommended target flow

Per brief §17 — smallest addition, not a redesign: extend the existing `StaffInviteForm`/`inviteStaff` flow (or a
parallel Control Center → Operations → RehletShifaa Staff → Invite Staff wizard) so that:
- Step 1 (Person) and Step 2 (Workspace & role) stay as today for Coordinator/Operations/Finance, but Step 2's
  role list is extended to also accept a `role_assignments` business-role selection (scoped to the templates that
  make sense for internal, non-clinical hires: `CARE_COORDINATION_MANAGER`, `PROVIDER_OPERATIONS_MANAGER`,
  `CREDENTIAL_VERIFIER`, `JOURNEY_MANAGER`/`JOURNEY_APPROVER`, `ACCESS_GOVERNANCE_MANAGER`, `COMPLIANCE_AUDITOR`,
  `SUPPORT_AGENT`) issued through the *same* transaction that creates the identity, calling
  `RoleAssignmentService.grant` immediately after `inviteStaff` with a required reason — closing the two-step gap
  in §8/§9/§10 without inventing new tables.
- Step 3 (Operational assignment) reuses the existing Teams & People "Add person" call when the chosen role is
  `CARE_COORDINATION_MANAGER`/`COORDINATOR`.
- `PLATFORM_OWNER` should remain deliberately excluded from any self-service invite wizard (bootstrap/emergency
  path only), consistent with its current bootstrap-only design intent.
- Independently of the invite flow, close the HIGH finding in §14 (self-grant / maker-checker) before treating
  `access.assignment.manage` as safe for routine, unsupervised use by a single Platform Owner.

## 16. Recommended implementation priority

1. **P0 (security, no product change needed to justify):** add a self-grant guard and/or independent-reviewer
   requirement to `RoleAssignmentService.grant`, mirroring `RoleTemplateService.publish`'s pattern — closes the
   HIGH finding in §14.
2. **P1:** extend the RehletShifaa Staff invite flow to optionally attach one business `role_assignments` grant in
   the same submission, for the internal (non-clinical) templates listed in §15 — closes the Level-B/C gap for
   Care Coordination Manager, Provider Operations Manager, Credentialing Specialist, Journey Manager/Approver.
3. **P2:** decide and document the relationship between the legacy `FINANCE`/`OPERATIONS`/`COORDINATOR` realm
   roles and their same-named, currently-unused `role_templates` business templates — either wire the business
   templates into real enforcement (superseding the legacy `ActorRole` checks per the long-stated migration plan)
   or retire the redundant seed templates so the inventory stops implying capability that isn't live.
4. **P3:** business-facing rename pass per §5 once the naming choices are approved (cosmetic/i18n copy change
   only, no schema/permission change).
5. **P4:** decide whether Commercial/Pricing staff deserve a first-class internal business template (today they
   are either provider-scoped `price_list.manage` holders or fall back to `SYSTEM_ADMIN`) — out of scope for this
   audit to prescribe further without a business decision, per brief §17's caution against inventing roles.

## 17. Sources cited

- `backend/src/main/java/com/rehletshifaa/access/infrastructure/AccessBootstrapConfiguration.java`
- `backend/src/main/java/com/rehletshifaa/access/application/RoleAssignmentService.java`
- `backend/src/main/java/com/rehletshifaa/access/application/RoleTemplateService.java`
- `backend/src/main/java/com/rehletshifaa/access/application/PermissionCatalog.java`
- `backend/src/main/java/com/rehletshifaa/access/application/AuthorizationService.java`
- `backend/src/main/java/com/rehletshifaa/access/application/ResourceRelationshipService.java`
- `backend/src/main/java/com/rehletshifaa/journey/application/JourneyService.java` (`inviteStaff`, line 403)
- `backend/src/main/java/com/rehletshifaa/journey/api/AdminJourneyController.java`
- `backend/src/main/java/com/rehletshifaa/journey/api/JourneyDtos.java` (`StaffInviteRequest`, line 52)
- `backend/src/main/java/com/rehletshifaa/identity/KeycloakStaffIdentityService.java`
- `backend/src/main/java/com/rehletshifaa/security/ActorRole.java`, `SecurityConfig.java`
- `backend/src/main/java/com/rehletshifaa/shared/config/LocalDemoDataSeeder.java`
- `backend/src/main/resources/db/migration/V31__access_governance_foundation.sql`
- `frontend/src/components/platform-control-center/legacy-admin.tsx` (`StaffInviteForm`, `StaffTeams`)
- `frontend/src/components/platform-control-center/CareOperationsPages.tsx`
- `frontend/src/components/platform-control-center/access-people.tsx`
- `frontend/src/components/platform-control-center/control-center-nav.ts`
- `frontend/src/components/platform-control-center/control-center-access.ts`
- `frontend/src/lib/portal-role-access.ts`
- `infrastructure/keycloak/realm-rehletshifaa.json`
- `docs/platform-control-plane/technical-decisions.md` (§10, §11, §13.4)
- `docs/platform-control-plane/ux-5-access-governance-status.md` (§6, §7, §13)
- `docs/platform-control-plane/ux-7-care-coordination-status.md` (§1, §20)
- Live Postgres: `role_assignments`, `access_bootstrap` tables (`rehletshifaa-postgres-1`, 2026-09-25)
