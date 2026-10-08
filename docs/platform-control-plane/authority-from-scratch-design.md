# Platform authority — built from scratch (Section 1)

**Status:** approved direction, 2026-09-26 (owner: "no mapping, build from scratch, nothing depends on the old
building; nobody uses the platform yet"). Supersedes the C6–C8 "cleanup" plan and the C3 role-mapping approach.

## 1. Why the current state is not acceptable

Today four authority structures coexist, and the newer ones translate into the older ones:

| Structure | Where | Problem |
|---|---|---|
| `ActorRole` enum (`COORDINATOR_LEAD`, `SYSTEM_ADMIN`, `CREDENTIALING_ADMIN`…) | ~170 checks, 79 in `JourneyService` | Legacy realm-role vocabulary. C3's `DatabaseRoleResolver` *maps* new database roles back onto it. |
| V31 permission-template engine (templates, versions, grants, `role_assignments`, `access_memberships`, relationships) | `access` (4k lines), provider, journey governance, coordination config | Organization-keyed; a second, configurable authority engine. |
| Platform resolver capabilities (`PlatformAuthorityResolver`) | `access.platform` | Correct model, but only for governance endpoints. |
| Realm roles in the browser | `frontend/src/lib/auth-client.ts`, `portal-role-access.ts` | UI routes on identity-provider roles the backend no longer trusts. |

A mapping layer keeps the old vocabulary alive forever. The target has **one** vocabulary, **one** engine and
**one** source of truth, with no translation table between old and new.

## 2. Principles

1. **Keycloak proves identity only:** `sub`, `auth_time`, `acr`. It never carries business roles; the realm has
   none.
2. **The database holds relationships; the code holds the policy.** Assignments, lifecycles and case, team and clinic
   relationships are rows. What a role may do is a code-reviewed, versioned-in-git policy, not editable templates.
   This suits a fixed launch catalogue (12 workforce roles) and removes a whole class of misconfiguration.
3. **One entry point:** `Authority.require(Permission, Resource)`. Every endpoint calls it. `/api/v1/me` enumerates
   from the same policy, so explanations equal decisions (ACG-10).
4. **Deny by default; nothing cached.** Each request re-reads lifecycle, assignment and relationship (IAM-08).
5. **Domain checks stay in the domain** (ACG-09): case state, versions, maker/checker, self-action.
6. **Nothing is migrated.** Old tables, enums and endpoints are deleted, not adapted (pre-production).

## 3. Model

### 3.1 Principals and populations

A request's `Principal` is the authenticated subject. The populations it belongs to are facts read from their own
records:

| Population | Record | Active when |
|---|---|---|
| Workforce person | `workforce_people` | `lifecycle_status='ACTIVE'` and `access_subjects.active` |
| Consultant | consultant record (Section 2 rebuild; today `practitioner_profiles`) | enabled, not suspended |
| Practice Manager | accepted clinic delegation | delegation ACTIVE |
| Patient | `patient_profiles.external_subject` | linked |
| Patient representative | `patient_representatives` | not revoked, within effective dates |
| Account holder | any authenticated subject | always; can only bind its own patient record with a one-time token |

A person may belong to several populations. A decision is evaluated for the **relationship the request uses**,
never by combining populations (§1.1).

### 3.2 Roles

`Role` is a code enum, the single vocabulary:

- **Workforce (granted by assignment rows):** `SYSTEM_ADMINISTRATOR`, `CONSULTANT_OPERATIONS_MANAGER`,
  `CREDENTIAL_VERIFIER`, `CARE_COORDINATION_MANAGER`, `COORDINATOR`, `OPERATIONS`, `FINANCE`, `JOURNEY_MANAGER`,
  `JOURNEY_APPROVER`, `COMPLIANCE_AUDITOR`, `SUPPORT_AGENT`, `PATIENT_IDENTITY_REVIEWER`.
- **Population roles (implied by the population record, no assignment row):** `CONSULTANT`, `PRACTICE_MANAGER`,
  `PATIENT`, `PATIENT_REPRESENTATIVE`, `ACCOUNT_HOLDER`.

There is **no lead role.** Lead is a team relationship (WF-06); supervisory permissions use the `SUPERVISED`
scope.

A workforce role is **effective** when the assignment is ACTIVE and within its dates, the person and access subject
are active, no SOD-04 conflicting role is concurrently held, and — for `SYSTEM_ADMINISTRATOR` — MFA evidence is
recorded.

### 3.3 Permissions and scopes

`Permission` is a code enum naming business actions, for example:

- **Cases and work:** `CASE_INTAKE_PREVIEW`, `CASE_CLAIM`, `CASE_READ`, `CASE_COORDINATE`, `CASE_ASSIGN_STAFF`,
  `CASE_ASSIGN_CONSULTANT`, `CASE_MESSAGE`, `TASK_WORK`, `TASK_SUPERVISE`, `REFERRAL_DECIDE`, `PROPOSAL_DECISION_RECORD` (the owning coordinator's
  recording of a patient's proposal decision after an assisted Arabic conversation; step-up, `CASE_OWNER` scope).
- **Clinical:** `CLINICAL_REVIEW_SUBMIT`.
- **Fulfilment:** `OPERATIONS_FULFIL`, `FINANCE_SETTLE`, `PRICING_POLICY_MANAGE`.
- **Credentials and identity:** `CREDENTIAL_DECIDE`, `CAPABILITY_DECIDE`, `PATIENT_IDENTITY_REVIEW`.
- **Journeys:** `JOURNEY_EDIT`, `JOURNEY_APPROVE`.
- **Platform administration:** `WORKFORCE_ADMINISTER`, `WORKFORCE_READ`, `TEAM_MANAGE`, `ACCESS_GOVERN`,
  `AUDIT_READ`, `SUPPORT_ACCOUNT`, `IDENTITY_OPERATIONS`.
- **Patient self-service:** `PATIENT_SELF_SERVICE`.

Each permission has exactly one **scope rule**, evaluated against the `Resource`:

| Scope | Rule |
|---|---|
| `PLATFORM` | no resource relationship needed |
| `CASE_ASSIGNED` | principal holds a live assignment on the case in the permission's function |
| `CASE_OWNER` | principal is the case's primary coordinator |
| `CASE_UNCLAIMED` | case is in intake and has no primary coordinator |
| `SUPERVISED` | the affected assignee is a member of an active team the principal leads, or a direct report, in that function (OD-09 fail-safe: no transitive depth) |
| `OWN_PATIENT` | case belongs to the principal's patient record, or to a patient they represent |
| `OWN_CLINIC` / `DELEGATED_CLINIC` | Consultant's own clinic / accepted delegation with the named permission flag |
| `SELF` | resource is the principal's own account |

### 3.4 Policy

`RolePolicy` is a single code table: `Role → { Permission }`. It is the only place a role gains a power, and it is
reviewed like code. SoD rules that are about *combinations* stay in data (`workforce_role_conflicts`). Rules that are
about *the same object* (self-verification, maker ≠ checker, lead ≠ self) are domain checks.

### 3.5 Decision flow

```
require(permission, resource):
  principal  = authenticated subject (401 if none)
  roles      = effective roles of principal       (database, every request)
  candidates = roles whose policy includes permission
  if none            → 403 PERMISSION_NOT_HELD   (reason names the missing role)
  if !scope(resource) → 403 OUT_OF_SCOPE          (reason names the scope rule)
  if permission.stepUp && !recentAuth(10m, acr)   → 401 REAUTHENTICATION_REQUIRED
  audit denials; return Decision(role, scope)
```

Relationship facts for scopes (case assignments, primary coordinator, patient ownership) are answered through a
narrow `CaseRelationships` port implemented by the case module, so `authority` never depends on `journey`.

### 3.6 `/api/v1/me`

`/api/v1/me` returns:
- the principal;
- populations with lifecycle;
- effective roles with their sources;
- `PLATFORM`-scope permissions held;
- **workspaces** derived from roles (e.g. `COORDINATION`, `OPERATIONS`, `FINANCE`, `CREDENTIALING`,
  `CONTROL_CENTER`, `CONSULTANT`, `PATIENT`), plus pending actions (activation, MFA reset).

The frontend routes only on this response.

## 4. What is deleted (not adapted)

- `ActorRole`, `ActorContext` role logic (keep an `AuthenticatedPrincipal` accessor: subject, `auth_time`, `acr`),
  `DatabaseRoleResolver`, `DatabaseAuthenticationConverter` authorities, and role-based `SecurityConfig` path rules
  (paths only require authentication; services decide).
- The V31 engine: `permission_definitions`, `role_templates`, `role_template_versions`, `role_permission_grants`,
  `role_assignments`, `access_memberships`, `resource_relationships`, `access_bootstrap`, the access-governance API,
  `LegacyRoleCompatibilityAdapter`, `IdentityWorkspaceRoleReader`.
- `PlatformAuthorityResolver` capability enum: folded into the single policy.
- The provider organization module and its tables (§2.15 retirement). Consultant credential review moves to the
  consultant module under `CREDENTIAL_DECIDE`.
- The organization-keyed coordination configuration (V36). Routing capacity, languages and care areas attach to
  workforce team membership (WF-04).
- Keycloak realm business roles and composites; the browser's realm-role routing.

## 5. Delivery slices

| Slice | Content | Exit |
|---|---|---|
| A1 | `authority` module: `Role`, `Permission`, `Scope`, `RolePolicy`, principal/populations, effective roles, `Authority.require/decide`, `CaseRelationships` port; `/api/v1/me` roles, permissions, workspaces; architecture rules | unit + integration tests; nothing yet rewired |
| A2 | Platform administration families (workforce, staff lifecycle, hierarchy, governance, hygiene, identity operations, audit) onto `Authority`; `PlatformAuthorityResolver` capabilities removed | family tests green |
| A3 | Case and journey runtime rewire (journey, clinic, identity review, payments, pricing): every `ActorRole` check becomes a permission + scope; `ActorRole` and `DatabaseRoleResolver` deleted; `SecurityConfig` authenticated-only | full suite green; negative matrix |
| A4 | Journey governance (definitions, deployments, cutover, projection) on `JOURNEY_READ`/`JOURNEY_EDIT`/`JOURNEY_APPROVE` (DONE; V31 deletion moved to A6) | full suite green |
| A5 | Coordination routing rebuilt on workforce teams; V36 organization model deleted | routing tests |
| A6 | Provider module deleted; credential review on the consultant module; V31 engine and tables deleted | full suite green |
| A7 | Frontend: auth client without realm roles; workspace routing from `/api/v1/me`; Control Center on the new staff, role, team, hygiene endpoints | typecheck + component tests |
| A8 | Realm export without business roles; MFA/`acr` flows; checkpoint and docs final | live evidence list |
