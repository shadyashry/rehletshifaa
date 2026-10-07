# Section 1 — Implementation Status

**Scope:** platform users, roles, access and hierarchy  
**Status:** IN PROGRESS  
**Authority mode:** CLEAN CUTOVER — database relationships plus the code policy are the live authority  
**Started:** 2026-09-26

## Clean cutover (decided 2026-09-26) — supersedes shadow mode

No environment (local dev, `deploy/oracle`) holds data to preserve. The owner chose a **full clean cutover**:
- No shadow mode, parity gates, compatibility fallbacks or data-migration commands for this epic.
- Database authority replaces the legacy sources directly.
- Uncommitted migrations state the final design.

Where the S1-01..S1-11 sections below mention shadow mode, legacy reconciliation, the realm-role fallback or the
realm-identity migration, those parts are **removed** by C1.

Cutover slices (executed in order; each keeps the backend suite green):

| Slice | Scope | State |
|---|---|---|
| C1 | Squash V54–V63 into final-design V54–V58; delete legacy reconcile/backfill, S1-10 realm migration, realm-role fallback, `authorityMode`; staff creation writes workforce person + invited role directly; local seeder writes the model | DONE |
| C2 | Staff lifecycle on the workforce model (STF-01..11) with DB System Administrator authority; legacy staff directory dropped | DONE |
| C3 | Business authority cutover (IAM-06/07/08/09/11): every request's roles resolved from database state; realm roles ignored | DONE |
| C4 | Remove broad bypasses and lead shortcuts (ACG-08, SOD-08, WF-07/08/09, INV-28) with negative tests | DONE |
| C5 | Support, MFA reset, recertification, dormancy, service-account registry (SUP-01..04, IAM-15/16/17) | DONE |
| C6–C8 | Superseded by the from-scratch authority plan (`authority-from-scratch-design.md`, slices A1–A8) | REPLACED |

### C1 — delivered

- Migrations: `V54__workforce_model`, `V55__identity_operations`, `V56__platform_access_governance`,
  `V57__identity_reconciliation`, `V58__platform_ownership`.
  - `workforce_people` owns `display_name_encrypted`; `staff_member_id` is an optional link to the legacy directory
    until C2/C3.
  - Role-assignment sources are `GRANT`/`INVITATION`.
- Removed:
  - `reconcileLegacyDirectory` and `POST /api/v1/admin/workforce/reconcile-legacy`
  - the S1-10 migration service, store, controller and table, and `IdentityDirectoryReader`
  - resolver compatibility roles, `WORKFORCE_RECONCILE` and `SOURCE_*`
  - `/api/v1/me.authorityMode` and `.compatibility`
- `IdentityOperationCompletionService` creates the workforce person and the invited role (source `INVITATION`) when
  the identity is created. The role is not effective while the person is `INVITED`.
- `LocalDemoDataSeeder` seeds the QA identities as workforce people with roles:
  - one System Administrator (`credential-admin`, local-only seeded MFA flag);
  - a coordination team led by `coordinator`, with `coordinator2` reporting to them.
- Tests use `WorkforceTestData` (writes the final model). Section 1 test set: 77 tests PASS.
- **Dev database must be recreated** (edited migration checksums), for example:
  `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml down` → remove the Postgres volume only → `up -d --build`.

### C2 — delivered (staff lifecycle, Section 1.7)

- `V54` adds the staff record fields to `workforce_people`: email, locale, activation, last sign-in, offboarding and
  lifecycle reason. It also adds `workforce_invitations` + `workforce_invitation_roles` (single-use, email-bound,
  7-day expiry by default, `app.staff.invitation-lifetime-days`) and `workforce_staffing_requests`.
- `V59__retire_legacy_staff_directory` drops `staff_members` and `staff_team_assignments` (V4/V21/V22) and rebuilds
  `provider_membership_details` without its staff link. Every reader moved to the workforce model:
  - journey coordinator profile, staff directory and assignment eligibility;
  - notification recipients;
  - coordination people, `staffEnabled`;
  - provider identity lookups;
  - local seeder.
- Legacy `POST /api/v1/admin/{coordinators,staff,staff/*}` and `/api/v1/admin/{reporting,staff-teams}` are removed.
- `StaffLifecycleService` (`/api/v1/admin/platform-access/staff/**`) requires an effective System Administrator
  plus recent authentication for every mutation.
  - Invite: roles are validated, SOD-04 pairwise, no `SYSTEM_ADMINISTRATOR`. A duplicate email gives
    `STAFF_EMAIL_EXISTS`; an address known to another population gives `IDENTITY_REVIEW_REQUIRED` (fail closed).
  - The durable `CREATE_STAFF` identity operation on target `WorkforceInvitation` creates an INVITED person with
    inactive access and the invited roles (source `INVITATION`).
  - `POST /api/v1/me/activation` activates only when the identity provider confirms an enabled identity with an MFA
    credential (STF-02).
  - Activation trigger (2026-10-04). Before this, nothing called `/me/activation`: no backend hook on `GET /api/v1/me`,
    no login event listener, no portal or Control Center caller. `/me` only reported `pendingActions: ["ACTIVATE_ACCOUNT"]`,
    so an invitee who completed the Keycloak required actions stayed INVITED and their roles never took effect.
    - `AuthProvider` is the single `/me` reader for both the portal and the Control Center. When `/me` reports
      `ACTIVATE_ACCOUNT`, it calls `POST /me/activation` once per signed-in subject. On success it re-reads `/me`
      before publishing it, so the roles the invitation granted take effect with no INVITED flash.
    - A refusal (`MFA_ENROLMENT_REQUIRED`, `INVITATION_NOT_VALID`, a 503 from the identity provider, a network error) is
      kept as `activationIssue`. It never sets `meFailed` and it does not retry in a loop: `refreshMe` asks again.
    - `Portal` no longer treats an account that is awaiting activation as a patient-side account. It never reaches
      My Care or `/patient/account/session`. `NoPortalWorkspace` shows "Finish setting up your account": for MFA it
      offers a fresh sign-in, so Keycloak runs the pending `CONFIGURE_TOTP`, plus "Try again".
    - Tests: `AuthProvider.test.tsx` (3): activates and re-reads; keeps the MFA refusal without granting; never calls
      activation when it is not pending. `NoPortalWorkspace.test.tsx` adds the refusal screen. `e2e/staff-activation.spec.ts`
      (2, synthetic): an invited coordinator lands in the Coordinator workspace after one activation call, and an
      invitee without MFA sees the setup screen, makes no patient-session call, and retries on demand. There was no
      Playwright staff-invite flow to extend. A live Keycloak + Mailpit invitee walkthrough has not been run yet.
  - Resend (extends expiry) and cancel. A scheduled expiry sets EXPIRED and queues identity disablement.
  - Disable and restore take the governance lock and check the last-admin invariant; restore never reopens
    offboarding (STF-09).
  - Offboarding start ends authority at once and reports blockers: open assignments or tasks, privileged role,
    pending privileged requests, owner, only-lead, direct reports. Completion is refused while any blocker remains;
    it ends every relationship and keeps history (STF-08/10).
  - Job change grants and revokes roles in one transaction through the S1-08 rules (STF-06).
  - Staffing requests: a function manager submits, a System Administrator (not the requester) records
    EXECUTED/REJECTED with a reference (STF-11).
- Lifecycle decisions commit first; Keycloak enable/disable/logout/resend are queued identity operations (IDO-01).
- Tests: `StaffLifecycleIntegrationTest` (6), `IdentityOperationIntegrationTest` updated for invitations.
- Open: STF-04 adoption of an existing Keycloak identity (currently rejected by the adapter when the email exists),
  last-sign-in capture (column present, filled by C5 dormancy work).

### C3 — delivered (database business authority)

- `DatabaseAuthenticationConverter` replaces `JwtRoleConverter` (deleted). A validated token proves identity only;
  `DatabaseRoleResolver` resolves roles on every request (IAM-08) and never reads token role claims (IAM-09).
  - Staff: effective, conflict-free WF-02 assignments of an ACTIVE person with active access map to the service
    roles (`CREDENTIAL_VERIFIER`→`CREDENTIALING_ADMIN`, `COMPLIANCE_AUDITOR`→`AUDITOR`, and so on).
  - `SYSTEM_ADMIN` only from an effective platform `SYSTEM_ADMINISTRATOR` with recorded MFA.
  - `*_LEAD` only while also leading an active team of that function (WF-06).
  - `DOCTOR` from an enabled practitioner profile.
  - `PATIENT` from a linked patient profile or a plain self-service account (no workforce, consultant or delegate
    relationship), so token-authorized account binding still works.
  - `PATIENT_REPRESENTATIVE` only from an active representative delegation.
  - Workforce and delegate-only identities never receive patient authority (IAM-11).
- `PortalExperienceService` supervision: `reports`/`canLeadRead` use `WorkforceDirectory.supervised`. This covers
  teams the actor currently leads plus direct reports in that function, with no transitive depth (OD-09 fail-safe),
  and only ACTIVE assignments count (WF-08).
- Tests: `DatabaseRoleResolverIntegrationTest` (5); `PortalExperienceTest` rewritten for team-scoped supervision.
- Full backend suite after C1–C3: **595 tests, 0 failures, 0 errors, 1 skipped**.

### C4 — delivered (bypass removal)

- `JourneyService`:
  - `authorizeRead` no longer admits `SYSTEM_ADMIN`/`AUDITOR`. Leads read only through team supervision
    (`canLeadRead`, ACTIVE assignments of supervised members).
  - `requireCoordinatorOwnership` and `requireAcceptedStaffAssignment` lose their admin, lead and auditor early
    returns.
  - Message threads are no longer widened for lead, admin or auditor.
  - Task complete/cancel/reassign require a lead who supervises the task owner in that function; a reassignment
    target must also be supervised (`SUPERVISORY_SCOPE_DENIED`).
  - Credential add/verify require `CREDENTIALING_ADMIN` only.
  - Case-level coordinator endpoints (eligible consultants, transition, care area, assignment history, assign,
    coordinator reassignment) no longer accept `SYSTEM_ADMIN`.
- `ConsultantReferralService`: no admin ownership bypass; the lead read uses team supervision.
- `ConsultantCapabilityService`: governor is Credential Verifier only; the auditor stays read-only.
- Identity review (`IdentityVerificationService`, `/api/v1/identity-review/**`) is Patient Identity Reviewer only.
- Tests: `BypassRemovalNegativeTest` (4); `JourneyServiceIntegrationTest` asserts admins are refused credential
  decisions. Full suite: 599 PASS.
- Remaining SOD-07 item (not changed, commercial epic): `PricingCatalogService`/`CommercialPolicyService`/
  `PaymentService` still accept `SYSTEM_ADMIN` for pricing and commercial configuration. That needs a named
  pricing-policy role decision. Consultant lifecycle administration (create/enable Consultant) stays with
  Section 2.

### C5 — delivered (access hygiene, Section 1.5)

- `V60__account_support_and_access_hygiene`: `support_identity_checks`, `mfa_reset_requests`,
  `access_recertification_campaigns`/`_items`, `service_accounts`. `V55` gains the `RESET_PASSWORD`/`RESET_MFA`
  identity operations; `KeycloakStaffIdentityService` implements the reset email (`UPDATE_PASSWORD`) and the MFA
  reset (deletes OTP/WebAuthn credentials, requires `CONFIGURE_TOTP`, then the operation logs the person out).
- `AccessHygieneService`:
  - **Support** (`/api/v1/support/**`, effective Support Officer only):
    - bounded account view by exact email or id (lifecycle, invitation status, last sign-in, MFA yes/no, role
      names), no clinical or audit data (SUP-01);
    - resend of an existing unexpired invitation;
    - password-reset email, never for one's own account, after a recorded verification checklist (SUP-02).
  - **MFA reset** (SUP-03): Support (with checklist) or the person asks. An independent, recently authenticated
    System Administrator (not requester, not subject) approves within 72 h. Approval clears MFA evidence under the
    governance lock (the last-admin invariant applies) and queues `RESET_MFA`.
  - **Recertification** (IAM-15): privileged scope (Credential Verifier, Compliance Auditor, Support Officer,
    System Administrator) quarterly, the rest semi-annually. The daily schedule opens due campaigns (14-day
    window). There is no self-certification.
    - Not certified → workforce assignment revoked. Administrator removal is escalated to maker/checker.
    - Overdue items are suspended; the last effective administrator is escalated, never removed.
  - **Dormancy** (IAM-16): `/api/v1/me` records the latest interactive sign-in. A daily job disables ACTIVE people
    with no sign-in for 90 days through the ordinary lifecycle, and skips the last effective administrator.
  - **Service accounts** (IAM-17): register (workforce owner, purpose, scopes, rotation date), record a rotation,
    retire; `rotationOverdue` after 90 days. The local seeder registers `staff-identity-admin`.
- Tests: `AccessHygieneIntegrationTest` (6). Full suite: 605 PASS.
- Also fixed: `VirtualClinicService` service history ordering tie-break (`applied_revision`).
- Open: IAM-16 delegation suspension after 180 days (Practice Managers, Section 2); IAM-14 sealed recovery is
  procedural (no code); owner-relationship recertification is not itemised.

## Slice S1-01 — Workforce foundation

This slice establishes the target workforce data model without changing the current authorization source.

Delivered:

- Fixed catalogue of the ten workforce functions and twelve target business roles.
- One shadow workforce-person record for each reconciled internal `staff_members` identity.
- A single platform team model with effective-dated memberships and lead designations.
- Effective-dated reporting lines plus a database-enforced current-manager pointer allowing at most one current
  direct manager per person and function.
- Idempotent, row-locked reconciliation of the legacy V22 staff teams into the shadow workforce model, including
  reconciliation counts and an audit event.
- Read-only administration endpoints for the role/function catalogue, people and teams, plus an explicit
  recent-authentication reconciliation command.
- A `workforce` module boundary rule preventing dependencies on `journey` and `provider`.

Endpoints:

- `GET /api/v1/admin/workforce/catalogue`
- `GET /api/v1/admin/workforce/people`
- `GET /api/v1/admin/workforce/teams`
- `POST /api/v1/admin/workforce/reconcile-legacy`

Requirement position:

| Requirement | State after S1-01 | Remaining work |
|---|---|---|
| WF-03 | Foundation delivered | Derive a person's effective functions from database role assignments |
| WF-04 | Partial | Migrate V36 coordination teams and attach capacity/language/care-area facts |
| WF-05 | Partial | Validate manager role/lead eligibility and reject reporting cycles in mutation workflows |
| WF-06 | Partial | Remove legacy `*_LEAD` roles and all bypasses after parity |
| WF-11 | Partial | Add audited create/change/end commands with optimistic concurrency |
| WF-13 | Foundation delivered | Expose the non-authoritative hierarchy read model |
| WF-14 | Foundation delivered | Preserve the boundary in all later workforce commands and reads |
| WF-15 | Foundation delivered | Add workforce ports when journey/coordination begin consuming hierarchy facts |
| WF-16 | Partial | Migrate V21, V36 and realm-only identities; produce the unmapped-items report |
| WF-17 | Partial | Extend `/api/v1/me` and build People, Teams, Hierarchy and Roles interfaces |

Not yet delivered and therefore not claimed complete: database role-assignment authority, separation-of-duties
enforcement, identity-operation reliability, account-owner/administrator governance, lifecycle/offboarding commands,
scoped supervisory permissions, live-authority cutover, or the Control Center UI.

## Slice S1-02 — Token trust and durable identity operations

**State:** DELIVERED FOR THE IMPLEMENTED WORKFORCE PATH — G1 live MFA/`acr`, governance bootstrap, owner-transfer and
reconciliation evidence is retained. Practice Manager identity remains gated on its consent state machine.

Delivered:

- JWT business-role compatibility reads only `realm_access.roles`; the untrusted top-level `roles` claim is ignored.
- Resource-server tokens must carry both the dedicated `rehletshifaa-api` audience and an allowed `azp` presenter.
- The realm export has explicit five-minute access tokens, 30-minute idle sessions, ten-hour maximum sessions,
  refresh-token rotation, no default patient role, and an audience mapper for the API.
- New workforce and Consultant invitations require email verification, password setup and TOTP enrolment. Patient
  authority is assigned explicitly only by the patient identity adapter.
- V55/V56 add durable, leased identity operations with idempotency keys, encrypted invitation payloads, retries with
  exponential backoff, maximum-attempt dead lettering, recovery of marker-tagged creations and optimistic fencing.
- Staff and Consultant create/resend/enable/disable decisions now commit to the business database and queue the
  Keycloak mutation. Disable succeeds only after both account disablement and session logout succeed.
- Operator APIs list operations and allow a recently authenticated System Administrator to retry or abandon a dead
  operation with a reason. Invitation, account-state, credential and capability administration paths now require
  recent authentication where changed by this slice.
- Staff enable/disable updates the workforce lifecycle and `access_subjects.active` in the same business transaction,
  so the database-side access state does not wait for Keycloak.

Endpoints:

- `GET /api/v1/admin/identity-operations`
- `POST /api/v1/admin/identity-operations/{id}/retry`
- `POST /api/v1/admin/identity-operations/{id}/abandon`

Remaining outside the completed G1 gate:

- Route the Phase 5 Practice Manager identity flow through the durable-operation model when its consent state machine
  is implemented; the current V53 invitation remains gated and still calls Keycloak synchronously.

## Slice S1-03 — Platform-scope access governance and administrator protection

**State:** DELIVERED IN SHADOW MODE — the target write path and invariants exist, but legacy authority remains live
until reconciliation and parity evidence permits cutover.

Delivered:

- V57 adds the fixed platform role catalogue with target key `SYSTEM_ADMINISTRATOR`, effective-dated platform role
  assignments, a singleton database governance lock, privileged change requests, and immutable decision records.
- New administrator appointment/removal commands are platform-scoped. Their request contract contains no
  organization, provider, role-key or authority assertion; actor and target eligibility are resolved from
  authenticated/database records.
- System Administrator appointment and removal use a 72-hour, revision-protected maker/checker workflow. Maker and
  checker must be different effective System Administrators, both must have authenticated within ten minutes, and
  neither may grant, revoke or approve their own privileged access.
- Approval and staff lifecycle changes serialize on the database governance lock. The last-effective-administrator
  evaluation includes assignment start/end boundaries, scheduled expiry, `access_subjects.active`, workforce
  lifecycle `ACTIVE`, recorded MFA enrolment, and concurrent mutations. An effective-administrator schedule must
  retain an eligible non-expiring administrator.
- The existing staff disable/enable transaction now takes the same governance lock and rechecks INV-03 after changing
  workforce and access-subject lifecycle state. With no target assignments yet, it remains in explicit compatibility
  mode so legacy administration is not blocked before target bootstrap/parity.
- The new `/api/v1/admin/platform-access/**` path is authenticated at the HTTP boundary and resolves administrator
  authority from the target database assignments. It does not use provider authority. An ArchUnit rule prevents the
  new `access.platform` authority path from depending on the provider module.
- V31 organization-keyed roles, assignments, history and APIs are unchanged. `PLATFORM_ADMIN`,
  `ACCESS_GOVERNANCE_MANAGER` and other legacy compatibility roles have not been removed, and no final authority
  cutover was performed.

Endpoints:

- `POST /api/v1/admin/platform-access/administrator-changes`
- `POST /api/v1/admin/platform-access/administrator-changes/{id}/approve`
- `POST /api/v1/admin/platform-access/administrator-changes/{id}/reject`

Focused requirement evidence:

| Requirement | Evidence |
|---|---|
| SOD-01 | Authenticated-subject comparisons reject self-appointment and self-removal; request input cannot override the actor. |
| SOD-03 | Recent-authenticated, same-role maker/checker with request expiry, revision checks and one immutable decision. |
| SOD-06 | Administrator assignment and lifecycle mutations share the singleton database governance lock. |
| INV-03 | Tests cover effective dates, finite expiry and disabled workforce/access-subject lifecycle; unsafe changes fail atomically. |

Remaining before G2/G3 or authority cutover:

- Provision the controlled initial target administrator set and populate `workforce_people.mfa_enrolled` from trusted
  identity reconciliation evidence. The field defaults false; this slice does not infer MFA from a realm role or
  invitation-required action.
- Produce legacy-to-target row-count, history-read, effective-access comparison and rollback evidence, then wire all
  later offboarding/lifecycle commands through the same governance lock.
- Make the database resolver universal, complete `/api/v1/me`, remove legacy organization/provider authority from the
  old path, and retire legacy roles only after parity. These later gates are intentionally not performed here.

## Slice S1-04 — Identity reconciliation evidence

**State:** IDO-06 AND SECTION 1 OPS-04 IDENTITY EVIDENCE COMPLETE — reviewed manual, scheduled and post-restore runs,
the activated-block/passing-release rehearsal, and durable replay/inactive-lifecycle correction are retained.

Delivered:

- V58 adds durable reconciliation runs and per-subject discrepancy records plus a separately recorded
  phishing-resistant-MFA fact on workforce people.
- The staff identity adapter now reads the Keycloak user's enabled state and credential types. It derives TOTP/MFA
  and WebAuthn/passkey evidence from credentials only; realm roles and browser input are never treated as evidence.
- Manual and explicit post-restore reconciliation require a recently authenticated compatibility System
  Administrator. A configurable daily schedule runs the same comparison without granting authority.
- Reconciliation compares workforce lifecycle with Keycloak enabled state, records missing identities and state
  mismatches, records missing MFA/WebAuthn, updates the trusted credential-evidence projection, and raises a critical
  discrepancy when the target model has zero effective System Administrators.
- Credential-evidence projection and last-administrator evaluation serialize on the S1-03 governance lock. If the
  identity provider is unavailable, the run is marked `FAILED` and no partial credential projection is committed.
- Run and discrepancy reads are available to compatibility System Administrators and Auditors. This is an
  inspection/reconciliation path only; it does not infer or write business roles in Keycloak.

Endpoints:

- `POST /api/v1/admin/identity-reconciliation`
- `GET /api/v1/admin/identity-reconciliation`
- `GET /api/v1/admin/identity-reconciliation/{run}/discrepancies`

Reconciliation deliberately does not manufacture an administrator assignment from realm roles; the controlled
bootstrap below is the only initial target path. The wider OPS-03 backup/data/document restore drill remains a
separate launch-assurance activity.

## Slice S1-05 — Controlled governance bootstrap

**State:** IMPLEMENTATION DELIVERED; DEPLOYMENT HANDOVER OPEN — no subjects are committed in source and the one-shot
operation has not been executed against live Keycloak.

Delivered:

- V59 adds historical Platform Account Owner relationships, a singleton current-owner pointer, and a one-shot
  governance bootstrap marker recording the owner and two initial System Administrators.
- Bootstrap is opt-in through `app.access.bootstrap-owner-subject` and
  `app.access.bootstrap-system-administrator-subjects` (Spring environment forms
  `APP_ACCESS_BOOTSTRAP_OWNER_SUBJECT` and `APP_ACCESS_BOOTSTRAP_SYSTEM_ADMINISTRATOR_SUBJECTS`). The existing legacy
  `app.access.bootstrap-subject` path remains unchanged for compatibility.
- The configured owner and exactly two distinct administrators must be different enabled Keycloak identities with
  WebAuthn/passkey credentials. Initial administrators must also be active workforce people. No realm role,
  organization/provider membership or browser assertion is consulted.
- Under the database governance lock, bootstrap creates exactly one current owner relationship, records trusted MFA
  and phishing-resistant evidence for the administrators, creates two non-expiring target
  `SYSTEM_ADMINISTRATOR` assignments, records the controlled handover, and writes an access audit event atomically.
- Replaying the same configuration is idempotent and does not require Keycloak to be available after successful
  completion. A different owner/administrator set is rejected; restart cannot re-bootstrap or resurrect access.

Still required before governance production readiness:

- Execute and retain the controlled handover evidence with reviewed production subjects; no default identities are
  supplied by the application.
- Execute the ordinary owner-transfer path below against live identities. OD-02 recovery remains unavailable and is
  intentionally not inferred from System Administrator authority.

## Slice S1-06 — Platform Account Owner transfer and last-owner protection

**State:** IMPLEMENTATION DELIVERED; LIVE HANDOVER OPEN — ordinary transfer is available after controlled bootstrap,
but owner recovery is deliberately unavailable until OD-02 is approved.

Delivered:

- V60 adds revisioned, 72-hour Platform Account Owner transfer requests plus append-only acceptance and independent
  verification evidence. Initiation, acceptance and verification each retain their required reason and governance
  audit event.
- Only the subject resolved from the singleton current-owner database relationship can initiate. The command accepts
  only an incoming identity and reason; it accepts no organization, provider, realm role or claimed authority input.
- The named incoming owner must accept with authentication no older than ten minutes whose trusted JWT `acr` is in
  the configured phishing-resistant set. Both initiation and acceptance also require direct Keycloak evidence that
  the incoming identity exists, is enabled and has a WebAuthn/passkey credential.
- An effective target-model `SYSTEM_ADMINISTRATOR`, distinct from both outgoing and incoming owners, must perform the
  final verification with recent phishing-resistant authentication. Legacy realm roles do not grant checker
  authority on this path.
- Final verification serializes on the same singleton governance lock used for last-effective-administrator
  protection. It rechecks request status, revision, expiry, current-owner identity and accepted successor, ends the
  old relationship, creates the successor relationship, advances the singleton pointer and records immutable
  verification evidence in one transaction. Historical owner relationships are retained.
- No API can directly end an owner relationship. Without an accepted successor the current pointer and sole active
  relationship remain unchanged, keeping INV-01 and INV-02 separate from the INV-03 administrator check.

Endpoints:

- `POST /api/v1/admin/platform-access/owner-transfers`
- `POST /api/v1/admin/platform-access/owner-transfers/{id}/accept`
- `POST /api/v1/admin/platform-access/owner-transfers/{id}/verify`

Remaining gaps:

- Exercise and retain a live transfer rehearsal with production-equivalent Keycloak LoA/`acr`, WebAuthn and audit
  evidence. The configurable accepted `acr` values are an enforcement hook, not proof that the live Keycloak flow
  emits the intended assurance level.
- OD-02 owner recovery is not implemented. System Administrators cannot assume ownership, bypass the outgoing owner,
  or invoke an unavailable-owner recovery command.
- Owner approval of other privileged changes, critical-governance notification delivery and final replacement of
  the legacy `PLATFORM_OWNER` compatibility construct remain later Phase 2/3 work.

## Slice S1-07 — Platform-scope authority resolver and effective `/api/v1/me`

**State:** DELIVERED IN SHADOW MODE for the platform-scope family only — IAM-06 is not universal. Journey,
coordination, finance, credentialing and other families still authorize through realm roles/`ActorContext`.
Taken over by Claude from the interrupted Codex session at the S1-06 boundary; S1-03..S1-06 were re-verified green
before extending.

Delivered:

- `PlatformAuthorityResolver` is the single decision point for the platform-access capabilities
  `ADMINISTRATOR_CHANGE`, `OWNER_TRANSFER_INITIATE` and `OWNER_TRANSFER_VERIFY`. Inputs are database state only
  (target assignments, current-owner relationship, workforce lifecycle, `access_subjects.active`, recorded MFA);
  realm roles, organizations and providers are never consulted and nothing is cached.
- The administrator grant is the same `PlatformAccessRepository.effectiveAdministrator` query used by the INV-03
  invariant; `subjectFacts` supplies explanation inputs only, so explanation and invariant cannot drift.
- Administrator change request/approve/reject and owner-transfer initiate/verify now call `resolver.require(...)`;
  error codes and messages are unchanged (`SYSTEM_ADMINISTRATOR_REQUIRED`, `CURRENT_OWNER_REQUIRED`, and
  `PLATFORM_OWNER_NOT_INITIALIZED` 409). Request-level checks (recent auth, `acr`, maker/checker, independence,
  revision) remain endpoint domain checks (ACG-09) and are reported as decision `conditions`.
- `GET /api/v1/me` (authenticated, `Cache-Control: no-store`) returns `authorityMode=SHADOW`, workforce facts,
  owner/administrator status, current and scheduled platform roles, the resolver decisions with denial `code`
  (equal to the endpoint error code), `reason` and explanation, and the realm roles reported separately as the
  still-live compatibility source.
- `WorkforceFacts` (workforce module read port, WF-15) supplies the WF-17 facts: functions, compatibility role,
  effective team memberships with lead designations, and current managers per function. Legacy role→function
  mapping is shared with `WorkforceFoundationService`.

Endpoint:

- `GET /api/v1/me`

Evidence (`EffectiveAccessIntegrationTest`, 6 tests): granted decision replayed against the endpoint; each denial
reason (no assignment, not-yet-effective, MFA not recorded, lifecycle not active, access subject inactive) replayed
against the endpoint on the next request with identical code while the token still carries `SYSTEM_ADMIN` (IAM-08);
realm roles never grant platform capabilities; workforce facts; non-workforce subject; auth + no-store at HTTP.

Remaining for IAM-06/ACG-10 (not claimed):

- Extend the resolver family by family (workforce administration reads/reconcile still use `ActorRole`), then the
  bypass-negative matrix (ACG-08) and realm-role retirement per family (IAM-07) after parity.
- Workspace routing and non-platform capabilities in `/api/v1/me`; the frontend does not consume it yet.
- Functions/roles are still derived from legacy `staff_role` plus team membership until database role assignments
  exist for all workforce roles (WF-03).

## Slice S1-08 — Workforce database role assignments and SOD-04 conflicts

**State:** DELIVERED IN SHADOW MODE — WF-02 assignments exist, are maintained by System Administrators and feed
`/api/v1/me`; `staff_role` and realm roles remain live for endpoint families not yet moved.

Delivered:

- V61 adds `workforce_role_assignments` (effective-dated, revisioned, `source` `LEGACY_STAFF_ROLE`/`GRANT`,
  `SYSTEM_ADMINISTRATOR` excluded by constraint) and `workforce_role_conflicts` seeded with the launch role-pair set:
  Compliance & Audit Reviewer vs every other role (including System Administrator) and Support Officer vs System
  Administrator. Per-version journey and per-Consultant (SOD-05) conflicts stay decision-time checks.
- `reconcileLegacyDirectory` backfills each legacy `staff_role` once as its base role (`*_LEAD` → base; leads are
  designations). It is idempotent and never resurrects a revoked legacy assignment.
- `WorkforceRoleAssignmentService` grant/revoke commands require an effective System Administrator
  (`ROLE_ASSIGNMENT` capability) plus recent authentication, and serialize on the governance lock. They reject:
  self-change (SOD-01), `SYSTEM_ADMINISTRATOR` (maker/checker path only), people who are not INVITED/ACTIVE,
  unknown roles, Consultant identities (`practitioner_profiles`), overlapping periods and conflicting roles. Revoke
  is revision-protected, immediate or future-dated, and blocked by WF-12 (only lead of a staffed team, or direct
  reports) unless another role keeps the person in that function. Every change is audited with its reason.
- System Administrator appointment now checks SOD-04 at request and again at approval.
- `WorkforceFacts`/`/api/v1/me` list effective roles, and functions now derive from those roles (WF-03), not
  from `staff_role`.

Endpoints:

- `GET /api/v1/admin/platform-access/role-assignments?subject=`
- `POST /api/v1/admin/platform-access/role-assignments`
- `POST /api/v1/admin/platform-access/role-assignments/{id}/revoke`

## Slice S1-09 — Workforce administration family under the resolver

**State:** DELIVERED WITH COMPATIBILITY FALLBACK — database authority decides first; the legacy realm roles
(`SYSTEM_ADMIN`, `AUDITOR`) remain an explicitly labelled IAM-07 fallback until realm-only auditors/admins are
migrated (WF-16) and parity is shown.

Delivered:

- Resolver capabilities `WORKFORCE_READ` (effective System Administrator, or an effective conflict-free
  `COMPLIANCE_AUDITOR` assignment) and `WORKFORCE_RECONCILE` (effective System Administrator). A capability now
  declares its compatibility realm roles. Grants carry `source` `DATABASE` or `COMPATIBILITY_REALM_ROLE`.
  Platform-governance capabilities declare none, so a realm role can never grant them.
- `effectiveWorkforceRole` re-evaluates SOD-04 at decision time: a conflicting concurrent role fails closed.
- `workforce` consumes this through the `WorkforceAccessPolicy` port implemented in `access.platform` (WF-15; no
  module cycle). Denial stays `403 ACCESS_DENIED`; reconcile still needs recent authentication. The audit
  `actor_role` records the decision basis.
- `/api/v1/admin/workforce/**` is `authenticated()` at the HTTP boundary, so a target administrator/auditor without
  the realm role is no longer blocked by the filter. Endpoint and `/api/v1/me` use the same decision.

Cross-cutting fix: `SqlValues.timestamp` now truncates to microseconds. PostgreSQL/H2 round finer values, and on
Windows the JVM clock repeats a value within one tick. So a just-written "now" (bootstrap admin assignment,
legacy role) could be rounded up past a same-tick "now" check and look not yet effective. Truncation gives stored
values and comparison parameters one precision. The legacy backfill also clamps `effective_from` to the
reconciliation time.

## Slice S1-10 — Realm-only identity migration (WF-01/WF-16)

**State:** IMPLEMENTATION DELIVERED; LIVE RUN OPEN. No migration has been executed against live Keycloak. The S1-09
compatibility fallback stays until a reviewed live run shows zero unmapped `AUDITOR` items and every realm
`SYSTEM_ADMIN` holder has been appointed (or deliberately not) through the maker/checker path.

Delivered:

- V62 lets `workforce_people` exist without a legacy `staff_members` row (`staff_member_id` nullable). It adds its
  own encrypted display name and `record_source` (`STAFF_DIRECTORY`/`REALM_MIGRATION`), and a check that one of
  the two identity sources is present. It adds `REALM_MIGRATION` as an assignment source, and
  `realm_identity_migration_runs`/`_items` for the report.
- `IdentityDirectoryReader` (read-only, implemented by `KeycloakStaffIdentityService`) pages
  `GET /roles/{role}/users` (100 per page, capped at 10,000). The service account already has `view-realm` and
  `query-users` in the realm export. Any unavailable listing fails the whole run closed, with a `FAILED` run kept
  as evidence and no writes.
- `RealmIdentityMigrationService` (effective System Administrator via `ROLE_ASSIGNMENT` plus recent auth, governance
  lock; **dry run is the HTTP default**) maps:
  - `AUDITOR`→`COMPLIANCE_AUDITOR`
  - `CREDENTIALING_ADMIN`→`CREDENTIAL_VERIFIER`
  - `PATIENT_IDENTITY_REVIEWER`→same
  - `COORDINATOR`/`OPERATIONS`/`FINANCE` and their `_LEAD` variants → base role, with a `LEAD_DESIGNATION_REQUIRED`
    note because leads are team designations
  - `SYSTEM_ADMIN`→ workforce person only, reported `ADMINISTRATOR_CHANGE_REQUIRED` (never inferred)
- Each migration item is recorded as `ROLE_ASSIGNED`, `ALREADY_MAPPED` or `UNMAPPED`. The reasons for `UNMAPPED`
  are:
  - `SELF_CHANGE` (the actor's own identity)
  - `CONSULTANT_IDENTITY`
  - `IDENTITY_DISABLED` (the person is created as `SIGNIN_DISABLED` with no role)
  - `WORKFORCE_LIFECYCLE_NOT_GRANTABLE`
  - `ROLE_CONFLICT` (SOD-04 against held and same-run planned roles)
- The run returns per-realm-role counts and the complete unmapped list, and is audited. Replays are idempotent.
- `reconcileLegacyDirectory` links a realm-migrated person to a later-created staff row instead of duplicating it.
  Workforce reads use the person's own display name when there is no staff row.

Endpoints:

- `POST /api/v1/admin/platform-access/realm-identity-migrations?dryRun=true|false`
- `GET /api/v1/admin/platform-access/realm-identity-migrations`
- `GET /api/v1/admin/platform-access/realm-identity-migrations/{id}`

## Slice S1-11 — Function-manager hierarchy commands (WF-04/05/10/11/12)

**State:** DELIVERED IN SHADOW MODE for Care Coordination and Consultant Operations. The legacy V22 directory and
`PortalExperienceService.updateReporting` (System Administrator only) remain live until cutover.

Delivered:

- V63 `workforce_function_managers` maps a function to the WF-02 role that maintains its teams:
  `CARE_COORDINATION`→`CARE_COORDINATION_MANAGER` and `CONSULTANT_OPERATIONS`→`CONSULTANT_OPERATIONS_MANAGER`.
  Every other function fails closed with `403 NO_FUNCTION_MANAGER_ROLE`.
- `PlatformAuthorityResolver.managedFunctions` (effective, conflict-free manager role) is exposed in
  `/api/v1/me.managedFunctions`. `requireFunctionManager` applies the same rule at the endpoint through the
  `WorkforceAccessPolicy` port (`403 FUNCTION_MANAGER_REQUIRED`). System Administrators have no team authority
  here (D-11/D-13).
- `WorkforceHierarchyService` provides create/retire team, add/end membership, designate/end lead, and set/end
  manager.
  - The function always comes from the team or line record, never the request.
  - Commands serialize per function (row lock on `workforce_functions`, INV-27) and are revision-protected,
    reasoned and audited (`WORKFORCE_HIERARCHY`).
- Rules enforced:
  - Members and leads need an effective role in the function; members need INVITED/ACTIVE lifecycle.
  - A manager needs a role plus an active lead designation in the function (WF-05).
  - Reporting cycles are rejected. Replacing a manager ends the old line and keeps history, with one current
    pointer.
  - No self lead designation, self lead end, or own reporting-line change (SOD-01).
  - WF-12 blockers: `ONLY_TEAM_LEAD`, `DIRECT_REPORTS_WITHOUT_MANAGER` (last designation of someone with
    reports), `END_LEAD_DESIGNATION_FIRST`, `TEAM_HAS_MEMBERS`.
- Changes take effect immediately, so a lead that loses a designation loses supervision on the next request.
  Periods are never zero-length, and same-tick re-adds start after the previous end.

Endpoints (`/api/v1/admin/workforce`): `POST /teams`, `/teams/{id}/retire`, `/teams/{id}/members`,
`/memberships/{id}/end`, `/teams/{id}/leads`, `/leads/{id}/end`, `/reporting-lines`, `/reporting-lines/end`.

Open decision (business): who maintains teams for Operations, Finance, Credentialing, Care Journey, Compliance,
Support, Patient Identity and Platform Administration. There is no catalogued manager role, and ROLE-02 describes
Operations/Finance "lead responsibility" only. Adding a mapping is a one-row migration once decided.

Remaining WF work: scheduled (future-dated) hierarchy changes; V36 coordination-team migration with capacity,
languages and care areas (WF-04); WF-07/WF-08 supervisory permissions and `SUPERVISORY_READ` (OD-09 for depth);
WF-09 removal of `COORDINATOR_LEAD` bypasses; and a Control Center UI.

## Verification

- Focused S1-03 plus existing access/workforce regression tests: PASS (31 tests: 14 legacy access governance,
  4 platform access governance, 11 architecture, 2 workforce foundation).
- Offline backend compile: PASS.
- Focused S1-04 identity-adapter/reconciliation plus S1-03/architecture regression: PASS (23 tests: 7 identity
  adapter, 1 reconciliation integration, 4 platform access governance, 11 architecture).
- Focused S1-05 bootstrap plus governance/reconciliation/architecture regression: PASS (18 tests: 2 bootstrap,
  4 platform access governance, 1 reconciliation integration, 11 architecture).
- Focused S1-06 owner transfer, bootstrap and architecture regression: PASS (16 tests: 3 owner transfer,
  2 bootstrap, 11 architecture).
- Takeover re-verification of inherited S1-01..S1-06 (22 tests: workforce, architecture, owner transfer,
  bootstrap, platform governance): PASS.
- Focused S1-07 plus access/workforce/identity regression: PASS (50 tests: 6 effective access, 14 legacy access
  governance, 4 platform access governance, 3 owner transfer, 2 bootstrap, 1 reconciliation, 7 identity adapter,
  2 workforce foundation, 11 architecture). Full backend suite not rerun for this slice.
- S1-08/S1-09 focused plus regression: PASS (65 tests: 6 role assignment, 5 workforce authority, 6 effective
  access, 14 legacy access governance, 4 platform governance, 3 owner transfer, 2 bootstrap, 1 reconciliation,
  7 identity adapter, 1 JWT role converter, 3 token validator, 2 workforce foundation, 11 architecture).
- Full backend suite after S1-09: 585 tests, 3 errors, 0 failures, 1 skipped (before the precision fix: 6 failures,
  3 errors). The remaining errors are the pre-existing "verification code is invalid or has expired" flakes in
  `PatientActivationJourneyTest`/`CoordinatorCaseActionsTest`. Their helpers select the latest OTP with
  `ORDER BY created_at DESC LIMIT 1` across the whole outbox, which ties within one clock tick. On isolated rerun a
  different single test failed, which confirms nondeterminism unrelated to this epic. A separate test-only fix task
  was raised. Owner-transfer, identity-operation, secure-journey and notification hand-back now pass in the full run.
- S1-10 `RealmIdentityMigrationIntegrationTest`: PASS (4 tests). These cover the dry-run report with no writes;
  created people, roles and functions; the lead note; a disabled identity; a migrated auditor authorized by
  `DATABASE` source; idempotent replay; fail-closed unavailable listing; and a realm role alone cannot run it.
- Full backend suite after S1-10: 589 tests, 1 error (the known OTP-helper flake,
  `PatientActivationJourneyTest.readingAHistoricalDepositNeverRewritesItsTerms`), 0 failures.
- S1-11 `WorkforceHierarchyIntegrationTest`: PASS (5 tests). These cover manager build-out plus audit, authority
  (admin denied, unmapped function, wrong-function member), SOD-01 and cycles, WF-12 blockers and stale revision,
  and manager replacement history with same-tick end/re-add.
- `IdentityOperationIntegrationTest` fixture fixed: it wrote a raw nanosecond `next_attempt_at` then asked
  "due by now", the same precision race as the S1-09 fix. It now uses an unambiguous past instant; PASS 3/3
  isolated runs.
- Full backend suite after S1-11: 594 tests. The only other error is the known OTP-helper flake
  (`PatientActivationJourneyTest`); the identity-operation failure in that run is the fixture fixed above.
- STF-02 activation trigger (2026-10-04, frontend only):
  - `pnpm typecheck` PASS.
  - Vitest `AuthProvider`, `NoPortalWorkspace` and `PortalEntry`: PASS (13 tests).
  - Full Vitest run: 262/273 pass. All 11 failures are in `ProposalSign.test.tsx`, which does not use `AuthProvider`
    or the portal.
  - Playwright `e2e/staff-activation.spec.ts` against a local dev server: PASS (2).
  - `e2e/portal-ux.spec.ts` was already failing. Its fixture answers `GET /me` with a profile object that has no
    `workspaces`, so `portalViews` throws.
  - ESLint on the changed files: clean. The remaining `Portal.tsx` findings are on lines this change did not touch.
- QA deep pass (2026-10-04, `qa-deep-test-report-2026-10-04.md`):
  - 29 committed access/workforce/journey tests had been red since A8 because their sign-in fixtures had no `acr`.
    They were fixed test-only.
  - Added `qa/PlatformUsersDeepQaTest` (9) and `qa/JourneyGovernanceDeepQaTest` (5) as the regression net.
  - Same-day fix pass (report §7): every defect from the pass is fixed, plus QA-14, found while fixing.
    - QA-01: re-invite of a closed address on the same identity.
    - QA-02: the owner decides administrator changes, gets the Control Center workspace, and sees decide-only UI.
    - QA-03: owner/administrator separation is enforced.
    - QA-04: the validator reports `SLA_NOT_SUPPORTED`.
    - QA-05: metadata states the cycle policy.
    - QA-06: `ACTION_PREREQUISITE` must-happen-before warnings.
    - QA-07: Return-to-draft is shown to approvers only.
    - QA-08: the journey map is a drag-and-drop editor.
    - QA-14: `request()` now runs in a transaction.
  - The temporary `qa-defect` class and `pom.xml` exclusion were removed. `PatientIdentityAndAccountTest` had the same
    missing-`acr` fixture and is fixed.
  - Still open, needing decisions or features (QA-09..13): other functions' managers, an in-product admission switch,
    SOD-05/STF-05, the coordination manager's case visibility and UAT seeds.
  - Platform Ownership page built (report §8): read model, initiation by work email, withdraw/decline/refuse, and the
    incoming owner's access through `/me`.
- Flyway V1–V63 on H2: PASS.
- Earlier focused workforce, architecture, JWT and identity-operation tests: PASS (29 tests for the S1-01/S1-02 gate).
- The full backend run reached 556 tests but was not green: the new identity test initially collided with another
  scheduled test context and is now isolated on its own H2 database; it passes after that correction. Existing
  shared-state/timing failures remained in notification outbox, secure-journey and patient-activation tests. The
  secure-journey and patient-activation classes passed on immediate focused rerun; the notification hand-back test
  still fails independently and is not changed by this slice.

## Claude QA and fix pass — handoff to Codex (2026-10-04, commits `04e2175`, `0879859`, pushed)

Detail: `qa-deep-test-report-2026-10-04.md` (§2 findings, §7 fixes, §8 ownership UI). Everything below is committed on
`codex/platform-control-plane`. Backend: 544 tests, 0 failures, 0 errors, 1 skipped (`mvn -o -q test`). Frontend:
`pnpm typecheck` PASS; the only red Vitest file is the known `ProposalSign.test.tsx` (11, unrelated).

### Test infrastructure (read first)
- Since A8, every step-up `Permission` needs `acr` in `app.security.mfa-acr-values` (2,3), and a System
  Administrator needs 3. Test sign-ins without an `acr` claim are now refused. 44 tests had silently gone red for this
  reason. They were fixed in the access-hygiene, staff-lifecycle, role-assignment, journey-definition and
  patient-identity suites.
  - **Rule:** every new test JWT sets `acr` ("2" for staff, "3" when the actor holds `SYSTEM_ADMINISTRATOR` or is the
    owner).
- New regression suites:
  - `qa/PlatformUsersDeepQaTest` (13): the whole onboarding chain, SoD/escalation, step-up matrix, lifecycle ×
    authority, WF-12, re-invite, owner decisions, owner/admin separation, and the full ownership handover.
  - `qa/JourneyGovernanceDeepQaTest` (8).
  - `IdentityOperationReinviteExecutionTest` (3).
  - Frontend: `JourneyDesignerQa.test.tsx` (12) and `GovernancePages.test.tsx` (7).
- After changing a main API, run `rm -rf target/test-classes` before compiling tests.

### Behaviour and contract changes

| Area | Change | Where |
|---|---|---|
| Re-invite (QA-01) | `invite()` on an address whose person is CANCELLED/EXPIRED/OFFBOARDED reuses that person and identity (`email_hash` is UNIQUE). It inserts a new invitation, then `reopenForInvitation` sets it SENT, puts the person back to INVITED with access off and MFA evidence cleared, and adds roles (source INVITATION). It returns `subject` and revision 1. A pending identity operation for the subject gives 409 `IDENTITY_OPERATION_PENDING`. Audit: `STAFF_REINVITED`. `emailInUse` now ignores closed lifecycles. | `StaffLifecycleService.reinvite`, `StaffLifecycleStore` |
| Re-invite operation | There is no new operation type (V55 untouched). `IdentityOperationRequested.reinvite` produces `RESEND_INVITE` with payload `reopen=true`, `resetMfa=true|false` (true for OFFBOARDED). The executor runs `setEnabled(true)`, then `resetMfa`, then `resend`. A plain resend is unchanged. | `IdentityOperationExecutor` (`Payload` gained `reopen`, `resetMfa`) |
| Owner decides admin changes (QA-02) | `approve`/`reject` of administrator change requests accept the **current owner** via `GovernanceAuthentication.requireRecentPhishingResistant()` (no role needed); otherwise `ACCESS_GOVERN`. `request()` stays admin-only. `overview()` is readable by the owner and now returns `names` (subject → display name). | `PlatformAccessGovernanceService` |
| QA-14 | `@Transactional` sat on the `Overview` record, so `request()` had no transaction. It is now on `request()`. | same |
| `/me` | The owner always gets `CONTROL_CENTER`. A named incoming owner of a PENDING_ACCEPTANCE transfer gets `CONTROL_CENTER` plus pending action `ACCEPT_PLATFORM_OWNERSHIP`. | `EffectiveAccessService` |
| Owner/admin separation (QA-03) | 409 `OWNER_ADMINISTRATOR_SEPARATION_REQUIRED`: transfer initiate/accept/verify when the incoming owner holds any active or scheduled admin assignment; admin APPOINT request or approval naming the current owner. | `PlatformOwnerTransferService`, `PlatformAccessGovernanceService` |
| Ownership read and stop | `GET /owner-transfers` returns `Ownership{currentOwner, viewerIsOwner, viewerIsAdministrator, canInitiate, transfers[TransferView{…, canAccept, canVerify, canWithdraw, canDecline}]}`. Readable by the owner, `ACCESS_GOVERN` holders and the incoming owner (only their own); expired pending transfers show as EXPIRED. `POST /owner-transfers/{id}/reject {revision, reason}` sets REJECTED, decided by who calls (see note below). Initiate also accepts `incomingOwnerEmail`, resolved via `WorkforceDirectory.subjectByEmailHash`: 404 `OWNER_CANDIDATE_NOT_FOUND`. | `PlatformOwnerTransferService/Store/Controller` |
| SLA (QA-04) | `JourneyGraphValidator.SLA_SUPPORTED=false`, so any node SLA is error `SLA_NOT_SUPPORTED` (the compiler guard remains). Metadata gains `slaSupported`. | validator, `JourneyDefinitionService.RegistryMetadata` |
| Metadata (QA-05) | `cyclePolicy` is now `GOVERNED_RECOVERY_LOOPS`. | `JourneyDefinitionService` |
| Prerequisites (QA-06) | `JourneyStageRegistry.Capability` gained `dependsOn` (replacing nothing; the record shape changed). A must-happen-before data-flow over all paths emits **warning** `ACTION_PREREQUISITE`. It is a warning because ordinary case actions remain available for journey-bound cases; making it blocking needs that product decision first. | registry, validator |
| Frontend journey | Return-to-draft is gated on `JOURNEY_APPROVE` (QA-07). The map (`JourneyGraphCanvas`) is a drag-and-drop editor when editable (QA-08): palette drop/click, `onConnect` via `connectByDrag` rules, `onDelete`, session-only positions. Warnings render in the warning style. The SLA editor is hidden unless `slaSupported`. | `JourneyGraphCanvas`, `JourneyDesigner`, `journey-graph-utils.connectByDrag` |
| Frontend governance | The Administrators page is open to the owner with decide-only actions. New **Platform Ownership** page `/control-center/ownership` (nav key `ownership`), with a Home attention item. `isReauthenticationCode` also treats `PHISHING_RESISTANT_AUTHENTICATION_REQUIRED` as a sign-in prompt. | `GovernancePages`, `control-center-nav`, `ControlCenterOverview`, `lib/reauthentication` |

Note on `reject`: it records `PLATFORM_OWNER_TRANSFER_WITHDRAWN` when the current owner calls it,
`PLATFORM_OWNER_TRANSFER_DECLINED` when the incoming owner calls it before accepting, and
`PLATFORM_OWNER_TRANSFER_VERIFICATION_REFUSED` when an independent `ACCESS_GOVERN` holder calls it at
PENDING_VERIFICATION. Anyone else gets 403 `OWNER_TRANSFER_PARTY_REQUIRED`.

No migration was added or edited. The dev DB does not need recreating.

### Open, not defects (need a decision or a feature; do not start without one)
- **QA-09:** `TEAM_MANAGE` exists only for Care Coordination and Consultant Operations, so Operations, Finance and the
  other functions cannot have teams, leads or `SUPERVISED` scope.
- **QA-10:** live admission still needs `JOURNEY_RUNTIME_ENABLED`, `…PRODUCTION_INTAKE_ENABLED` and a cutover policy,
  plus a restart. Dev has none of them, no journey, and no Journey Manager or Approver.
- **QA-11:** SOD-05 and the STF-04/05 review queue (`IDENTITY_REVIEW_REQUIRED` is a dead end).
- **QA-12:** the Care Coordination Manager has no `CASE_READ`.
- **QA-13:** UAT seeds are missing for the Journey, Auditor, Support and Identity-review roles.
- The incoming owner must already be a workforce person. OD-02 recovery is still unavailable.

## Codex handoff intake (2026-10-05)

- Read `AGENTS.md`, the Claude QA/fix handoff and the next-action instructions. No implementation slice started:
  the resumption request's task field is still `<describe the next task here>`.
- Verified branch `codex/platform-control-plane`; working tree was clean at intake. Latest commits, newest first:
  `f874e5f`, `0879859`, `04e2175`, `652f47e`. Local tracking status reports one commit ahead of
  `origin/codex/platform-control-plane`; remote state was not refreshed.
- Delivered: handoff intake and this continuity note only. No application or migration changes. Tests were not
  rerun; the preceding handoff's verification remains historical evidence, not a new verification claim.
- Open gaps remain as listed above. Platform Ownership UI is already delivered and must not be rebuilt.
- **Next exact action:** obtain the concrete task omitted from the resumption request, then inspect only its
  affected files. Observe the request's explicit decision gates for QA-09..13, OD-02 and Practice Manager consent.

## Approved completion scope (2026-10-05)

The owner has now resolved QA-09..13 and explicitly authorized implementation. These decisions supersede the
earlier "do not start without one" gate for those five items only:

- Record an effective-dated, audited Consultant Operations owner for each Consultant. Credential and capability
  decisions must reject the Consultant and the owner captured for that already-open review; reassignment retains
  both ownership and conflict history. Backend decisions and ownership changes are transactional and serialized.
- Replace the workforce `IDENTITY_REVIEW_REQUIRED` dead end with exact server-side identity adoption plus a durable
  System Administrator review queue. Adoption requires the identity holder to authenticate and accept; authority
  remains inactive until acceptance, activation and MFA requirements pass. Patient identity review stays separate.
- Retain the two existing manager roles and add narrowly scoped Operations, Finance, Credentialing and Support
  Managers. Journey Manager remains the Care Journey function manager. Managers maintain only their function's
  teams, memberships, leads and reporting lines and submit staffing requests; they do not grant roles, self-appoint
  as leads, change their own reporting lines, or inherit execution/clinical/administrator powers.
- Care Coordination Managers receive backend-filtered operational summaries for managed teams. Clinical detail is
  available only to a Coordinator with a direct-report or team-lead relationship to the active assignee, never by
  recursive reporting. Supervisory reads are audited and confer no execution authority.
- Live Journey admission becomes database governed: a Journey Manager prepares, a different Journey Approver
  approves/activates a policy revision after recent authentication and a reason. Either role may immediately pause
  new admissions. Existing cases keep their pinned versions and continue; intake/fallback remains available.
- Development fixtures add distinct Journey Manager/Approver, auditor, support, patient-identity reviewer and new
  function-manager identities, with a second team for scope-denial testing. Seeding stays development-only, keeps
  real activation/MFA requirements, and places no credentials in source or logs.
- Patient activation remains independent of document verification. The existing narrow Patient Identity Reviewer
  role/queue remains an operational travel-readiness control and is not granted to all Operations staff.
- Still excluded: OD-02 recovery, Practice Manager identity/consent work, unrelated refactors/ProposalSign repair,
  publishing/pushing/merging, and enabling live admission merely as a demonstration. QA-06 stays warning-only.

Implementation slices (primary agent owns contracts, migrations, integration, verification and this checkpoint):

1. **P1 — Consultant ownership + SOD-05:** schema/history, owner commands/read model, decision-time conflict binding,
   concurrency tests and management UI.
2. **P2 — Workforce identity adoption:** durable review/adoption state machine, holder acceptance and activation
   integration, administrator UI, conflict/concurrency tests.
3. **P3 — Function management:** role/policy catalogue, function mapping, hierarchy invariants, staffing requests,
   UI and denial tests.
4. **P4 — Coordination visibility:** minimum operational summary, direct supervisory detail, field filtering,
   audit and execution-denial tests.
5. **P5 — Journey admission:** versioned policy/readiness/approval/pause controls, transactional admission and pinned
   execution, UI and concurrency/idempotency tests.
6. **P6 — Development fixtures and final gate:** development identities/teams/fixtures, secure setup documentation,
   focused verification per slice, frontend typecheck/tests and the full offline backend suite.

**Next exact action:** inspect the existing consultant, workforce identity, authority/hierarchy, coordination and
journey-admission boundaries; settle the shared schema/API contracts; then implement P1 before dependent slices.

## Next Section 1 slice

**Resume here (2026-09-26, direction changed):** the owner rejected mapping onto legacy structures. Build the
authority layer from scratch per `authority-from-scratch-design.md` (slices A1–A8). The uncommitted C6 mapping
work was reverted. C3's `DatabaseRoleResolver` (WF-02 → `ActorRole` mapping) is transitional and is deleted in A3.

**A1 DONE** — `authority` module (no dependency on any business module, enforced by ArchUnit):
- `Role` (the single vocabulary: 12 workforce + consultant, practice-manager, patient, representative, account
  holder; no lead role), `Permission` (business actions, step-up flagged), `Scope`, `Workspace`.
- `RolePolicy`: the only role→(permission, scope) table, in code.
- `EffectiveRoleStore`: every role read from its own record on every request.
- `Authority.require/decide/held`: deny by default, step-up, SUPERVISED via team leadership.
- `CaseRelationships` port, implemented by `JourneyCaseRelationships`.
- `/api/v1/me`: roles, permissions, workspaces, managed functions, pending actions.
- Tests: `RolePolicyTest` (policy invariants), `AuthorityIntegrationTest`.

**A2 DONE** — Staff lifecycle, role assignment, governance, owner transfer (verify), hygiene, the workforce port
and identity operations/reconciliation all call `Authority`.
- `PlatformAuthorityResolver` and the `workforce_function_managers` mapping table are deleted; managed functions
  come from `TEAM_MANAGE` roles.
- Owner-transfer initiation stays an owner-relationship domain check.
- Denials now use the single vocabulary (`PERMISSION_NOT_HELD`, `OUT_OF_SCOPE`, `REAUTHENTICATION_REQUIRED`).
- Full suite 613 PASS.

**A3 DONE** — every business service authorizes through `Authority.authorize(Permission, Resource)`:
- Converted: journey, case actions, referrals, pricing, payments, commercial policy, onboarding, identity review,
  patient account, portal, staff work, capabilities, virtual clinic and documents.
- Deleted: `ActorRole`, `ActorContext`, `DatabaseRoleResolver`, `LegacyRoleCompatibilityAdapter`,
  `IdentityWorkspaceRoleReader` and the realm workspace-roles read.
- The token is identity only (`DatabaseAuthenticationConverter` grants nothing); `SecurityConfig` has no role
  paths.
- Supervision is the `SUPERVISED` scope (team leads plus direct reports, OD-09 fail-safe), replacing the old
  `*_LEAD` early returns.
- Second opinions have their own scope. `CASE_ASSIGNED` means the case team (an ACTIVE assignment that is not a
  second opinion). `CASE_CONSULTED` (an ACTIVE `SECOND_OPINION` assignment) grants only
  `SECOND_OPINION_SUBMIT`. The second-opinion consultant reads via `CASE_OFFERED` and cannot message, review or
  refer.
- A repeated decline by the same assignee is an idempotent replay. It is bound to their own assignment row, so it
  discloses nothing.
- Tests use `TestPrincipals` (`Role` fixtures that record database facts). `WorkforceTestData.staff*` is
  idempotent and updates the display name. `NotificationOutboxDeliveryTest` isolates itself from other suites'
  committed rows.

**A4 DONE** — journey governance on `JOURNEY_READ` / `JOURNEY_EDIT` / `JOURNEY_APPROVE`:
- Permission mapping:
  - view → `JOURNEY_READ`;
  - create, edit, validate, simulate, submit and verification harness → `JOURNEY_EDIT`;
  - approve, publish, retire, deploy and return-to-draft (a review decision) → `JOURNEY_APPROVE` (step-up);
  - maker/checker is still the domain `INDEPENDENT_REVIEW_REQUIRED`.
- Projected work (`completeWorkItem`):
  - a VERIFICATION case is driven only by the Journey Manager who created it (`JOURNEY_EDIT`);
  - a real case needs `CASE_READ` on the case (its team), and the handler's own service enforces the specific
    action;
  - `journey.work.execute` and the org-scoped `ResourceContext` routing are gone.
- `AccessIdentity` is replaced by `Principal`. The audit trail moved to `shared.audit.GovernanceAuditLog`, the
  V31-only `editedVersion` was dropped, and `GET /api/v1/admin/platform-access/audit` (`AUDIT_READ`) replaces
  the V31 audit read.
- Tests:
  - journey fixtures grant `JOURNEY_MANAGER` / `JOURNEY_APPROVER`;
  - removed: the channel and tenant-scope tests (no such concepts);
  - "dormant grant" is now "revoked role";
  - org-scope work tests became "coordinator on/off the case" and "another manager cannot drive your
    verification case".
- Full suite 600 PASS.

**Sequencing change:** the V31 engine (`AuthorizationService`, templates, `RoleAssignmentService`, relationships,
`AccessQueryService`, `PermissionCatalog`, `AccessGovernanceController`, bootstrap) is still used by coordination
(`assignment.receive`, routing configuration) and the provider module. It is deleted at the end of A6, together
with its tables, in one new migration.

**A5 DONE** — care-coordination routing rebuilt, platform-wide, on the workforce:
- `V61__care_coordination_routing.sql` drops V36's provider-organization routing tables. Deleting the committed
  V36 file was refused, so V61 replaces the schema additively. It creates:
  - `coordination_team_profiles` (care areas, languages and fallback per workforce `CARE_COORDINATION` team);
  - `coordinator_capacity` (per person);
  - `coordination_policy_versions` and `consultant_routing_preferences` (no organization);
  - `coordination_decisions`;
  - `coordination_routing_lock`;
  - `case_tasks.coordination_team_id` pointing at `workforce_teams`.
- Eligibility:
  - an active `COORDINATOR` (`WorkforceDirectory.holds`) who is a current member of an active care-coordination
    team serving the care area;
  - with capacity, on duty and speaking the language when the policy requires it;
  - exclusions are reported (`NOT_AN_ACTIVE_COORDINATOR`, `NO_ACTIVE_TEAM`, `AT_CAPACITY`, …).
- No shadow or adoption mode:
  - `AUTO`, `ASSIGN`, `REASSIGN` and `QUEUE` commands (`ROUTING_ASSIGN`);
  - the revision is the per-case decision count;
  - `routeCoordinatorWork` keeps the owner, otherwise routes under the effective policy, and without a policy leaves
    the work unassigned;
  - queue alerts go to active `CARE_COORDINATION_MANAGER` holders.
- New permissions:
  - `ROUTING_READ` (manager and auditor);
  - `ROUTING_CONFIGURE` (step-up, manager);
  - `ROUTING_ASSIGN` (manager).
  - Membership changes go through the workforce hierarchy, not coordination.
- API: `/api/v1/admin/coordination/**` without `{org}`; team routing is set with `PUT /teams/{id}/profile`; the
  organization picker is deleted.
- `CoordinatorRoutingPort` has only `routeCoordinatorWork`. The legacy `guardLegacyWrite`, `compareLegacy` and
  `resolveOrganization` hooks are gone.
- Tests:
  - `CoordinationIntegrationTest` is rewritten (14 scenarios, including team profile, auditor read-only and
    Journey routing);
  - the concurrency and scoring tests are adapted;
  - the journey parity tests use workforce teams;
  - `CoordinationTestData.reset` isolates platform-wide routing config between committing suites.
- Test note: Maven's incremental compile does not recompile unchanged tests after a main API change. Run
  `rm -rf target/test-classes` before `test-compile` when verifying a refactor.
- Full suite 598 PASS.

**A6 DONE** — the provider-organization model and the V31 template engine are gone:
- Deleted code:
  - the `provider` module (organizations, workspace, operational setup, credential dossiers, clinician directory);
  - `ProviderCaseSummaryService` / `ProviderCaseController`;
  - `CoordinationReadinessAdapter`;
  - `access.{api,application,domain,infrastructure}` (`AuthorizationService`, templates, role assignments,
    relationships, `AccessQueryService`, `PermissionCatalog`, `AccessGovernanceController`, V31 bootstrap).
- `PlatformGovernanceBootstrapConfiguration` keeps only the owner/administrator bootstrap;
  `app.access.bootstrap-subject` is gone.
- Credential review is the consultant's own record: `addCredential` / `verifyPractitioner` (`CREDENTIAL_DECIDE`),
  with no "adopted provider credentialing" branches in journey, eligibility or pricing.
  - `CredentialExpiryService` expires `practitioner_credentials` and sends `consultant-credential-expiry`
    reminders.
  - `PractitionerSummaryView.providerCredentialing` is removed.
- `V62__retire_provider_organizations_and_template_engine.sql` drops the V31–V35 tables and the rebuilt
  `provider_membership_details`, and adds `journey_governance_lock`. `access_subjects` stays as the identity anchor.
- Tests:
  - provider and V31 suites deleted;
  - journey fixtures carry real Consultants and workforce Coordinators with no organizations;
  - ArchUnit now keeps workforce and platform access independent of the journey, coordination and clinic modules.
- Full suite 513 PASS.

**A7 DONE** — frontend uses the platform authority response and the clean-cutover APIs:
- `AuthProvider` reads `GET /api/v1/me`; the browser no longer decodes or routes on identity-provider business
  roles. Portal workspaces, Control Center visibility and step-up prompts all use the same roles, workspaces,
  permissions and `reauthenticate` set the backend reports.
- Deleted the provider-organization, V31 access-governance and legacy staff-team pages/components. Consultant
  management now uses the consultant endpoints; care-coordination setup is platform-wide with no `{org}` route.
- Added Control Center pages for people/staff lifecycle, role changes, teams and hierarchy, staffing requests,
  administrator maker/checker, support, recertification/MFA-reset decisions, service accounts and governance audit.
  Navigation is fail-closed and hides powers not present in `/api/v1/me`; endpoints remain the authorization
  boundary.
- Added the Consultant and virtual-clinic workspaces and updated the care portal to choose from backend workspaces.
- Verification on takeover:
  - backend offline compile: PASS;
  - focused authority/workforce/architecture/coordination/journey regression: **51 PASS** (`RolePolicyTest`,
    `AuthorityIntegrationTest`, `WorkforceHierarchyIntegrationTest`, `ArchitectureRulesTest`,
    `CoordinationIntegrationTest`, `JourneyServiceIntegrationTest`);
  - frontend typecheck: PASS;
  - focused A7 component set: **66 PASS**;
  - complete frontend unit/component suite: **265 PASS**.
- Full Playwright/live-tunnel suites were not run for this slice. The required A7 exit gate is typecheck plus
  component tests; live identity evidence belongs to A8.

**A8 IMPLEMENTATION, G1, IDO-06 AND SECTION 1 OPS-04 IDENTITY EVIDENCE DONE** — identity-provider
authority and authentication-strength cutover:
- The realm export has no business realm roles, composites, user realm-role assignments or role protocol mapper.
  The web client explicitly includes the `acr` scope and excludes the `roles` scope. The identity administration
  service account retains only its four required `realm-management` client roles.
- `DatabaseAuthenticationConverter` still grants no Spring authority from token roles; the realm contract has a
  negative token-role test.
- Keycloak has one ordered cumulative browser flow: LoA 1 username/password, LoA 2 OTP MFA and LoA 3 WebAuthn.
  WebAuthn requires user verification and prevents duplicate authenticator registration. The export imports
  successfully into an isolated Keycloak **26.7.3** container.
- `AuthenticationStrength` is the single backend interpreter for configured MFA and phishing-resistant ACRs.
  Every `Permission.stepUp()` action now needs recent MFA; a System Administrator grant additionally needs LoA 3.
  Owner transfer uses the same strength interpreter. Negative tests prove that a recent password-only request is
  denied, and that administrator LoA 2 is denied while LoA 3 is accepted.
- The frontend requests `acr_values=2` for ordinary sensitive workforce actions and `acr_values=3` for a Platform
  Account Owner or System Administrator. Its pre-flight prompt checks both `auth_time` and `acr`; unknown access
  fails closed at LoA 3.
- Verification:
  - realm JSON parse and focused realm/authority contract: PASS;
  - ephemeral Keycloak 26.7.3 realm import: PASS;
  - backend offline authority/workforce/architecture/coordination/journey/security gate: **64 PASS**;
  - frontend typecheck: PASS;
  - complete frontend unit/component suite: **266 PASS**.
- Clean-cutover/live evidence (2026-09-27):
  - the disposable development PostgreSQL and Keycloak volumes were recreated. Flyway applied all **62** migrations
    from an empty schema and Keycloak **26.7.3** imported the realm from an empty identity store;
  - clean startup exposed an inherited local-seed call-site defect: `seedWorkforce` existed but was never invoked.
    The seeder now invokes it, and the live database contains five workforce people/roles, one System Administrator,
    one team and one current manager;
  - a real authorization-code/PKCE login exposed that removing the Keycloak `basic` default client scope had also
    removed `sub` from access tokens. The web client now retains only the non-business default scopes `basic`,
    `acr`, `profile` and `email`; `roles` remains excluded, and `/api/v1/me` accepts the resulting token;
  - the seeded System Administrator enrolled a real Keycloak OTP credential and WebAuthn credential through the
    browser flow. Live tokens proved LoA 1, LoA 2 and passkey-backed LoA 3. Manual reconciliation was denied at LoA
    1 and LoA 2 (`REAUTHENTICATION_REQUIRED`) and accepted at LoA 3;
  - manual and `POST_RESTORE` reconciliation each checked all five workforce identities. Both accurately recorded
    four `MFA_NOT_ENROLLED` discrepancies for the four ordinary seeded staff, no missing identity, and no finding for
    the enrolled administrator. The administrator projection now records both MFA and phishing-resistant MFA;
  - focused live Playwright journey `mfa-live.spec.ts`: **1 PASS**; frontend typecheck: PASS; focused offline backend
    authority/workforce/realm/token gate: **20 PASS**. The canonical tunnel stack production build also passed.
  - controlled governance evidence (`evidence/2026-09-27-governance-bootstrap-owner-transfer.md`): three distinct
    enabled development identities enrolled OTP and WebAuthn through Keycloak's cumulative browser flow; the two
    active-workforce administrators and distinct owner passed the one-shot bootstrap. The ordinary owner transfer
    then completed at live LoA 3: current owner initiated, incoming owner accepted, and the other System
    Administrator independently verified. The current-owner pointer, immutable acceptance/verification records and
    four expected `SUCCESS` audit events were retained;
  - focused live Playwright `governance-bootstrap-live.spec.ts`: **1 PASS**; frontend typecheck: PASS; focused offline
    bootstrap/owner-transfer/authority/realm gate: **13 PASS**. The test restored the normal backend configuration
    and the tunnel stack was healthy afterward.
  - OPS-04 sign-in gate implementation:
    - V63 adds a singleton restore gate keyed by a deployment-generated `APP_IDENTITY_RESTORE_ID`; a new id blocks
      database-recognized workforce sessions, and replaying the same cleared id is idempotent;
    - while blocked, workforce requests fail `503 IDENTITY_RESTORE_RECONCILIATION_REQUIRED`; only the reconciliation
      read/run surface stays reachable, where ordinary authority checks still apply. Non-workforce identities are
      unaffected;
    - only a zero-discrepancy `POST_RESTORE` run clears the gate, transactionally with the run result. Manual and
      scheduled runs, discrepancies and provider failure never release it;
    - focused reconciliation/filter plus governance/authority/realm regression: **18 PASS**. H2 applied all **63**
      migrations from empty. The canonical tunnel stack rebuilt successfully and PostgreSQL applied V63;
    - scheduled reconciliation evidence (`evidence/2026-09-27-scheduled-identity-reconciliation.md`): a scheduler-
      originated run checked all seven workforce identities and retained the four expected `MFA_NOT_ENROLLED`
      findings for ordinary local seeded staff. Alert review found no missing identity, lifecycle mismatch or
      administrator-collapse finding. The temporary accelerated cron was removed and the normal daily cron restored.
    - live release evidence (`evidence/2026-09-27-ops04-live-release.md`): the four ordinary seeded workforce
      identities enrolled OTP and a fresh isolated restore operator enrolled OTP plus WebAuthn in one browser
      process. Restore id `live-ops04-1790535569195` changed the gate to `BLOCKED`; the same coordinator token that
      previously reached `/me` then received `503 IDENTITY_RESTORE_RECONCILIATION_REQUIRED`. LoA 3 operator run
      `8651e80d-60cb-482a-a7ed-41d7c76b9942` checked all eight identities, passed with zero discrepancies and cleared
      the gate transactionally. The coordinator request immediately returned `200` afterward;
    - focused live Playwright `restore-gate-live.spec.ts`: **1 PASS** in 1.2 minutes; frontend typecheck: PASS. The
      test restored the normal backend configuration, which is healthy without the temporary restore-id override.
    - durable replay/disable evidence (`evidence/2026-09-27-ops04-replay-disable.md`): with restore id
      `live-ops04-replay-1790535900327`, a zero-authority inactive workforce fixture was deliberately enabled in
      Keycloak while its real `DISABLE_USER_AND_LOGOUT` operation remained pending. The first `POST_RESTORE` run
      checked all ten identities, retained exactly `DATABASE_INACTIVE_IDENTITY_ENABLED`, and did not release the
      gate. The normal worker then replayed operation `c54df5e1-9769-4ce0-8373-a5c797d9c31d` successfully on its
      first attempt, disabled the Keycloak identity and logged out its sessions. Only the subsequent ten-identity,
      zero-discrepancy run `7f7bdd7a-4545-4ae7-b553-8f626a4220ac` cleared the gate;
    - focused live Playwright replay/disable journey: **1 PASS** in 1.7 minutes; frontend typecheck: PASS. The normal
      backend configuration was restored and is healthy without the temporary restore-id override.

**Next exact action:** Section 1 slices A1–A8, the 2026-10-04 Claude QA/fix pass and the Platform Ownership page are
complete and pushed. Read "Claude QA and fix pass — handoff to Codex" above before touching access, journey-designer or
test fixtures (the `acr` rule). Pick the next item only from its open list, once the owner decides it. Preserve the
worktree and review the final targeted diff/status. Do not start the Practice Manager
identity path until its consent state machine exists, and do not implement OD-02 recovery without the required
product/operational decision. Run broader backend or full live-tunnel verification only if requested before commit.

Business/operator/tester guide: `platform-users-roles-hierarchy-onboarding-and-test-guide.md` describes the user
model, hierarchy, who grants whom, current Control Center screens, onboarding/lifecycle flows, authentication rules,
test identities, acceptance scenarios and explicitly gated/deferred behavior.

Open business decisions (do not block):
- Function managers for the functions other than care coordination and consultant operations.
- Confirm the provisional pricing split (catalogs → Consultant Operations Manager; commercial policy, FX and
  payments → Finance).

Open gates (do not claim complete):
- **G1 COMPLETE (2026-09-27):** implementation/import validation, live System Administrator OTP/WebAuthn/LoA 1–3
  evidence, the controlled two-administrator bootstrap, and the ordinary three-party owner-transfer rehearsal are
  retained. This does not implement OD-02 recovery.
- **IDO-06 COMPLETE (2026-09-27):** live manual and `POST_RESTORE` comparisons, a scheduler-originated daily-job and
  alert review, the activated-block/passing-release rehearsal, and the OPS-04 durable replay/inactive-lifecycle
  disable proof are retained. The wider OPS-03 backup/data/document restore drill is separate launch evidence.
- **Practice Manager consent flow:** the identity path remains gated until its consent state machine exists.
- **OD-02:** recovery remains unavailable.
- Known pre-existing flaky history remains documented under Verification: OTP selection ties and the notification
  outbox hand-back test. Neither was observed in this takeover's focused runs; the full backend suite was not rerun.

## Approved completion scope delivered (2026-10-05)

The owner-approved P1–P6 work above is implemented in the current working tree. It preserves the Platform Ownership
workflow, patient activation without document verification, the narrow Patient Identity Reviewer queue, QA-06
warning-only behavior and all explicitly excluded work.

### Delivered behavior and contracts

- **P1 — Consultant Operations ownership and SOD-05:** V68 adds immutable effective-dated ownership history, a
  serialized current-owner pointer and conflict snapshots for already-open credential/capability reviews. The
  Consultant Operations Manager API and Consultant page support audited assignment/reassignment. Only an active
  Consultant Operations Manager is eligible. A Consultant and every owner captured for that review are denied at
  decision time; reassignment cannot erase the conflict. Ownership changes, review opening and decisions lock the
  Consultant row so concurrent changes cannot bypass the rule. Active ownership also blocks incompatible role
  removal/offboarding.
- **P2 — workforce identity adoption:** V70 adds the durable System Administrator review, decision, acceptance and
  history records. Staff invitation resolves identities from Keycloak server-side; neither email alone nor a
  browser identifier establishes ownership. Exact enabled/verified matches enter holder acceptance, and ambiguous,
  conflicting or create-race matches enter the administrator queue. Reviews support pending, awaiting acceptance,
  resolved and rejected outcomes with reasons/revisions/audit history. The authenticated resolved subject must
  accept; authority stays ineffective until acceptance, workforce activation and MFA. Prohibited population/role
  combinations remain non-waivable. A synchronous identity-domain event routes CREATE_STAFF races into review
  without creating an access↔identity module cycle. This surface is separate from patient identity review.
- **P3 — function management:** V69 and the fixed `RolePolicy` retain Care Coordination Manager and Consultant
  Operations Manager and add Operations, Finance, Credentialing and Support Managers. Journey Manager owns Care
  Journey team management. Each manager receives only their function's hierarchy/staffing authority; manager roles
  confer no role-grant, financial execution, credential-decision, patient-identity, clinical or administrator
  power. Existing hierarchy services continue to enforce eligible membership, no self-lead/self-reporting change,
  one direct manager per function, cycle prevention, effective dates and orphan safeguards. Leads remain
  relationships, not roles.
- **P4 — Care Coordination visibility:** `GET /api/v1/admin/coordination/managed-cases` returns only case reference,
  stage, active coordinator, workload, overdue count and blocker flags for teams the caller manages. Filtering is
  server-side. Detailed `CASE_READ` still requires the Coordinator role plus a direct-report or team-lead
  relationship to the active assignee; reporting is not recursive. Successful supervised reads are audited and do
  not authorize another person's task execution. The Control Center renders the operational summary without
  clinical documents, narratives or private messages.
- **P5 — governed live Journey admission:** V71 replaces the business cutover switch with a database policy carrying
  the exact published Journey version, eligibility, readiness, revision, state, actors, reasons and history. A
  Journey Manager prepares; a different Journey Approver with recent authentication approves/activates. Either
  role can immediately pause new admissions with a reason. Approval is bound to the policy revision and refuses an
  unpublished/unready version, absent runtime or disabled production-intake infrastructure. Pausing affects only
  new submissions; existing bindings continue on pinned versions. Every submitted case records one immutable
  Journey/legacy admission decision, including a paused/no-policy legacy result, preventing later replay from
  changing authority. Intake fallback remains available, policy changes require no restart and live admission or
  authorization state is not cached. The Control Center exposes prepare/approve/reject/pause and the complete
  policy history; no policy was enabled as demonstration.
- **P6 — development fixtures:** local-only seeding and the realm export now include distinct Journey Manager,
  Journey Approver, Compliance Auditor, Support Officer, Patient Identity Reviewer, all manager roles, a second
  Coordinator and a distinct second Care Coordination Manager/team for scope-denial testing. The new identities
  have no source-controlled credentials or fabricated authentication evidence; they remain invited until the real
  password-update, TOTP, activation and MFA checks succeed. `docs/local-development.md` documents their purposes
  and secure setup.

Additive H2-safe migrations are `V68__consultant_operations_ownership.sql`,
`V69__function_manager_roles.sql`, `V70__workforce_identity_adoption.sql` and
`V71__governed_journey_admission.sql`; no committed migration was edited.

### Fresh verification

- Required safe removal of only `backend/target/test-classes`, followed by offline `test-compile`: **PASS**.
- Focused governed Journey admission/intake integration: **24 PASS**.
- Focused ownership, workforce-adoption, coordination, staff lifecycle and role-policy integration before the final
  gate: **35 PASS**; the later architecture/adoption/Journey regression rerun also passed after replacing the
  cross-module callback with the domain event.
- Full offline backend suite (with the local Mockito agent required by this Windows environment): **557 tests, 0
  failures, 1 skipped**. All 71 Flyway migrations applied to fresh H2 test schemas.
- Frontend typecheck: **PASS**.
- Affected Control Center/portal component tests: **68 PASS across 9 files** (identity review, Journey admission and
  version governance, consultant ownership surfaces, coordination workspace, navigation/routes and holder pending
  actions).
- Keycloak realm JSON parse and `git diff --check`: **PASS** (line-ending notices only).

The requested Astra/high security design review informed the transactional/identity boundaries. A final independent
Astra/high read-only review was also started: it found that the same seeded manager led both test teams, which was
fixed by adding a distinct second Care Coordination Manager. That reviewer then exhausted its runtime usage limit,
so a complete second-pass review could not be obtained. The primary review plus ArchUnit and the full backend gate
found and fixed the identity→access dependency cycle.

## Clean-code and no-legacy continuation (approved 2026-10-05)

The owner approved a pre-production clean cutover across the platform: remove runtime compatibility branches,
fallback data states and legacy business-role provisioning rather than preserve historical data. Patient submission
must still remain available when governed Journey admission is paused or ineligible; those cases use the current
standard coordination path, not a legacy authority. Existing product invariants (database authority, independent
approval, MFA/activation, patient activation without document verification, pinned Journey cases and transactional
authorization) remain mandatory.

The target architecture applies SOLID boundaries throughout the backend:

- controllers depend on application use cases;
- application services orchestrate domain policy through ports and contain no SQL/JDBC;
- infrastructure repositories own persistence SQL and transaction-safe locking primitives;
- database authority is exclusive, so Keycloak carries identity/authentication state but no business-role mapping;
- historical compatibility names, fields and migrations that are not on `main` are removed or rewritten to the
  final pre-production design instead of receiving backfills or parity adapters;
- architecture tests prevent new application-layer SQL and compatibility dependencies.

Implementation slices (kept green independently):

| Slice | Scope | State |
|---|---|---|
| CL1 | Remove Keycloak business-role compatibility provisioning and its patient-role mutation | DONE |
| CL2 | Replace `LEGACY` Journey admission with explicit `STANDARD` versus `JOURNEY`; route every standard intake through governed team/capacity eligibility and remove unrestricted self-claim | DONE (2026-10-06, Claude) — see "CL2 delivered" below |
| CL3 | Remove onboarding/readiness/commercial legacy exemptions and require the current evidence model for every case | DONE (2026-10-06, Claude) — see "CL3 delivered" below |
| CL4 | Remove obsolete patient/provider/plaintext compatibility data paths and finalize clean pre-production schema | DONE (2026-10-06, Claude) — see "CL4 delivered" below |
| CL5 | Move all SQL/JDBC out of application services module by module — **now via Spring Data JPA** (owner decision 2026-10-06, technical-decisions §29); live tracker `jpa-migration-status.md` | IN PROGRESS — all writes JPA except the local seeder; only the two documented exceptions (`CaseNumberGenerator`, `LocalDemoDataSeeder`) still use JdbcClient (ratchet in `ArchitectureRulesTest`); `StaffWorkService`, `CaseActionService`, `JourneyService`, `PaymentService`, `ConsultantReferralService`, `PatientActivationService`, `PublicCaseAccessService`, `PatientAccountService`, `PatientActionService`, `IdentityVerificationService`, `CaseHandoffService`, `OnboardingService`, `JourneyCaseRelationships`, `CoordinationReadService` and the `CoordinationRepository` reads converted 2026-10-07; seeder move to `devdata` remains |
| CL6 | Enforce the boundaries with ArchUnit, finish documentation/test cleanup, run focused and full backend gates | DONE (2026-10-06, Claude) — see "CL6 delivered" below |
| CL7 | Add JaCoCo/Sonar configuration and run Sonar for the sole Maven backend when a Sonar server/project/token and scanner plugin are available | BLOCKED — no Sonar server/project/token; no Sonar scanner in the offline Maven cache |

Baseline inventory (at approval, 2026-10-05 — historical; CL1–CL4 removed every runtime legacy path named here): one Maven backend; 70 production classes currently use `JdbcClient`, including 46 application
classes. No Sonar or JaCoCo configuration exists and the Sonar Maven scanner is not present in the offline Maven
cache. Runtime legacy behavior still exists in Journey admission, coordinator self-claim, onboarding/readiness,
patient-name/plaintext fallbacks and Keycloak compatibility-role provisioning. Provider-organization legacy tables
are not runtime dependencies: V62 already drops them; their remaining mentions are historical migration text.

CL1 removed the `compatibilityRole` provisioning contract, all staff/Consultant realm-role writes, patient `PATIENT`
realm-role assignment and the corresponding recovery mutation. Keycloak now owns authentication state and required
actions only; application/database records exclusively resolve business authority. Durable provisioning markers,
recovery, invitations, identity-adoption collision handling, activation and MFA gates are unchanged. Verification:
safe removal of `backend/target/test-classes` plus offline test compilation passed; `IdentityProvisioningPortTest`
passed 5 tests; `IdentityOperationIntegrationTest` and `WorkforceIdentityAdoptionIntegrationTest` passed 10 tests.
The first in-sandbox integration attempt could not create the JDK HTTP client's loopback pipe and was rerun outside
that restriction; this was an environment permission failure, not a product-test failure.

**Claude fix to V72 (2026-10-06):** `decisionCheckConstraints` counted PostgreSQL's NOT NULL constraint (listed in
`information_schema.check_constraints` as `decision IS NOT NULL`) as a third decision CHECK, so V72 failed on every
PostgreSQL database (H2 passed) and the dev backend could not start. It now skips that clause; verified by applying all
migrations to a fresh PostgreSQL 17 (`PostgresJpaMappingTest`). PostgreSQL DDL is transactional, so the failed attempts left the dev database at V71; V72 applies on the next start
unless its preflight finds LEGACY admissions or unnamed patients (then reset the pre-production database).

**CL2 delivered (2026-10-06, Claude, continuing Codex's in-progress work).** The admission vocabulary was already
`COORDINATION` (the standard path) versus `JOURNEY` (V72), and the claim path already required governed eligibility.
Completed:

- *Routed intake starts intake review.* A standard (`COORDINATION`) admission routed to an eligible Coordinator moves the
  case RECEIVED → INTAKE_REVIEW (history actor `ROUTING_ENGINE`), exactly as a claim does; with nobody eligible or no
  policy it stays RECEIVED with the durable queue item. Before, a routed case sat in RECEIVED with no owner action.
- *Notifications.* Nobody is notified about a case they claimed or took over themselves. A transfer from one owner to
  another sends the OPS-1 `CASE_OWNERSHIP_TRANSFERRED` notification and work email again (case number and staff names
  only); CL2 had replaced it with a generic notice.
- *Assignment history keeps the person's reason* for manual (re)assignments, and every manual reassignment is its own
  history entry even to the current owner; automatic routing records the engine's explanation.
- *Single lock order* unchanged: case row → routing lock (engine) and case → governance → routing (admission).
- *Tests moved to the governed contract.* `CoordinationTestData.eligibleCoordinator` now models a general intake
  Coordinator (team and capacity serve every care area); all claim sites use it; transfer targets are made eligible;
  assertions that predate the durable queue now exclude the team-level `COORDINATION_ROUTING` item.
- *Persistence.* The coordination own-table writes (policies, preferences, team profiles, capacity, decisions, routing
  lock) are now JPA (`jpa-migration-status.md`).

Verification: full backend suite 570 tests, **8 failures (was 101)**, all in CL3 territory (below); `PostgresJpaMappingTest`
PASS.

**CL3 delivered (2026-10-06, Claude; the owner asked to proceed before the Astra review).**

- *No deposit-only gate.* `CaseActionService.readinessBlockers` no longer returns nothing for a case without an onboarding
  record: every case is judged by `CustomerReadinessService`. A missing onboarding shows as a STAFF blocker
  (`ONBOARDING_NOT_STARTED`, onboarding starts at acknowledgement), so Operations cannot be assigned and the case does
  not enter TRAVEL_COORDINATION without it.
- *Account activation is a readiness change.* Activation requires the profile and the identity-provider account to be
  ACTIVE (Codex's rule). Completing account setup now publishes `PatientReadinessChanged` for the patient's cases, so a
  deposit-settled ACCEPTED case moves into treatment coordination, and `CaseActionService` re-derives waiting-on on that
  event (previously only profile activation did, which no longer activates the account).
- *No commercial fallback.* The coordination deposit is no longer quoted in EGP at rate 1 when the acknowledged proposal
  version is missing or has no currency; it is refused (`PROPOSAL_NOT_FOUND`, `PROPOSAL_CURRENCY_MISSING`). Rate 1 stays
  only for an EGP proposal.
- *Tests on the current contract.* `CoordinatorCaseActionsTest` completes identity-provider setup after profile
  activation and resets the identity simulator per test; the missing-onboarding test now expects the case to stay
  ACCEPTED.

Verification: full backend suite **570 tests, 0 failures**; `PostgresJpaMappingTest` PASS.

**CL4 delivered (2026-10-06, Claude).** Inventory and decision per item (pre-production clean cutover: no data kept):

| Item found | Decision |
|---|---|
| `medical_cases.full_name`, `medical_cases.whatsapp_number` — V1 plaintext copies of the patient's name and number, written at intake; the name was never read, the number only addressed the status link | **Removed** (V73). The status link goes to the submission contact's number (the same number the copy held) |
| `medical_cases.patient_id` nullable since V2 (cases before patient records) | **NOT NULL** (V73). The patient is registered before the case row (`IntakeLifecycleService.registerPatient`); `MedicalCase` takes it in its constructor; `belongsTo` is gone. Case reads join the patient (no "no canonical name" branch) |
| "No submission contact = pre-V30 case submitted by the patient" (`PatientActivationService` `sub == null` branches, `LEFT JOIN … role == null ? "PATIENT"` in `PatientAccountService`) | **Removed.** Every case has a contact (V73 preflight); a missing one is an error |
| `patient_profiles.mobile_owner` — V30 "NULL = not yet clarified (legacy rows)"; the code only ever wrote `PATIENT` with a number, NULL without | **Removed** (V73). A number on the patient is the patient's own; the activation prefill still reports `PATIENT`/`REPRESENTATIVE`/null, now derived |
| Returning-patient snapshot fell back to the latest submission contact's number (a representative's number became the default of the patient's next case) | **Removed.** Only the patient's own number counts; without one the existing `MOBILE_REQUIRED` refusal applies |
| `CoordinationReadService.decrypt` returned null on any decryption failure | **Removed.** Undecryptable staff names now fail like every other encrypted read. (All `enc:` text already went through the strict `EncryptedText`; no plaintext read fallback remained) |
| `case_claim_challenges` (V2 claim codes, superseded by secure status links and account-link requests), the `case-claim-code`, `case-submitted` and `account-activation` templates and the unused `app.claim.expiry-seconds`/`max-attempts` settings | **Removed** (V73 drops the table; `app.claim.pepper` and `intake-grant-expiry-seconds` stay). `deploy/oracle` still passes the two dead env vars — harmless, left for that deployment's owner |
| Provider-organization remnants | **None left.** V62 dropped every table; the final PostgreSQL schema has no provider-organization column or view (`provider_membership_details_v` in the JPA tracker was stale) |
| `medical_cases.country` (case-level intake country, shown on queues) | **Kept** — a case fact, not identity |
| Patient name/contact columns on `patient_profiles` and `case_submission_contacts` are plaintext | **Kept** — current design, not a compatibility path; encrypting patient PII would be a new decision |
| Dead tables V64 (Practice Manager invitations/delegation history), V65 (owner commissioning/recovery) | **Kept, listed** — they back features gated on PM consent and OD-02 |
| `idempotency_records` (V2) | **Kept, listed** — technical-decisions §13.8 still names durable idempotency keys; owner decision |
| `platform_access_roles` | **Not dead** — the FK catalogue behind `platform_role_assignments.role_key` |

Migration `V73__finalize_clean_patient_schema` (Java, the V72 pattern) refuses — rather than mutates — cases without a
canonical patient, cases without a submission contact, and patient numbers whose owner is NULL/REPRESENTATIVE; then sets
`medical_cases.patient_id` NOT NULL, drops the two case columns, `mobile_owner` (+ its check) and `case_claim_challenges`.
`CleanPatientSchemaMigrationTest` proves each refusal and the final schema; `LegacyStatusMigrationTest` now stops at V72
(its V1-shaped rows have no patient).

Verification: full backend suite **574 tests, 0 failures** (2 skipped); `PostgresJpaMappingTest` **PASS** on a fresh
PostgreSQL 17 (V73 applied). One earlier full run had a single failure in
`SecureJourneyCorrectionsTest.transferMovesOpenCoordinatorWork…` (assignment history first entry was the ended owner):
the history is ordered `assigned_at DESC, id`, so two assignments in the same microsecond fall back to UUID order. It
passed alone twice and in the next full run; it is a pre-existing ordering tie, not a CL4 change.

**CL6 delivered (2026-10-06, Claude).** No product behaviour change. Every rule was probed against the current code
first; each holds today or the small violation it revealed was fixed.

- *Rules added to `ArchitectureRulesTest`* (13 → 22 tests; details in technical-decisions §29, CL6 addendum):
  controllers live in `..api..`; every HTTP entry point (including the flat `identity` controllers, now covered by
  annotation) stays out of persistence, Spring Data repositories, `..infrastructure..` and `@Transactional`;
  application services do not use the EntityManager/criteria/Hibernate API; `..domain..` does not depend on
  api/application/infrastructure; repositories stay in the persistence layer and `@Entity` classes in `..domain..`;
  no native queries; the JdbcClient ratchet now covers all plain-SQL types (`org.springframework.jdbc..`, `java.sql..`:
  RowMapper, ResultSet, Timestamp…); tokens carry no business authority (no token-role converter, granted authority,
  `@PreAuthorize`/`@Secured`/`@RolesAllowed` or `hasRole`-style checks) and no source touches Keycloak role mappings
  or role claims; retired compatibility names (`Legacy*`, `*Compatibility*`, `compatibilityRole`, provider
  organizations) stay gone.
- *Exception lists* (explicit, shrink-only): `JDBC_NOT_YET_CONVERTED` (unchanged, 17 classes) and the mock-storage
  `Local*` controllers (unchanged). No new exception was needed.
- *Not added (recorded, not violations of the target):* application → `..api..` DTOs (1,945 dependencies; services
  return the api records) and infrastructure → application ports (adapters implement ports declared in application).
  Moving DTOs out of `..api..` would be its own refactor.
- *Code fixed:* `JourneyService.LegacyDoctor` renamed `DoctorCandidate`; stale comments that described removed
  authority (`ActorContext`/`ActorRole`), "compatibility mode" governance and "legacy" behaviour reworded.
  The CL4 flaky `SecureJourneyCorrectionsTest.transferMovesOpenCoordinatorWork…` ordering was fixed separately by
  `6eb6aa8` (`assignmentHistory` breaks a same-instant tie: active, then later-ended, then id; the test pins the tie);
  CL6 was rebased onto it.
- *Tests renamed* (subjects that no longer exist under that name; no assertion changed): `signInWithLegacyRole` →
  `signInAs`; Journey cutover/binding/projection/parity tests now say *coordination* (the standard path) instead of
  *legacy*; `JourneyParityHarness` fields `legacy*` → `coordination*`. No test was obsolete enough to delete:
  `LegacyStatusMigrationTest` still tests the V6 migration, and `CleanPatientSchemaMigrationTest` the V73 refusals.
- *Docs:* `docs/architecture.md` no longer describes realm-role authorities, activation tokens, `full_name`/
  `mobile_owner` or the V30 legacy-data behaviour, nor the removed `provider` module or `X-Correlation-ID`; AGENTS §2c,
  technical-decisions §29 and `jpa-migration-status.md` (stale 101-failure baseline removed) describe the enforced
  rules; `implementation-status.md`, `migration-inventory.md` and `test-status.md` carry a historical-log banner; the
  P1–P6 "next exact action" below is no longer presented as current.

Verification: `ArchitectureRulesTest` 22/22; full backend suite **583 tests, 0 failures** (2 skipped); PostgreSQL
proof `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73).

**StaffWorkService converted (2026-10-07, Claude; CL5 read slice 1).** No product behaviour change. My Work and the
notification feed are now `StaffWorkQueryService` (JPA projections; at most four queries per queue, no per-row lookup);
`WorkController` uses it, HTTP contract unchanged. `StaffWorkService` keeps the commands and reads only through
repositories; it left `JDBC_NOT_YET_CONVERTED` (17 → 16). Queries added and details: `jpa-migration-status.md`,
2026-10-07 entry. Verification: full backend suite **584 tests, 0 failures** (2 skipped; +1 ordering/batching test);
`ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73).

**CaseActionService converted (2026-10-07, Claude; CL5 read slice 2).** No product behaviour change. The case page's
current action, blockers and available actions read through a new `CaseActionQueryService` (JPA projections in the owning
modules); `CaseActionService` keeps the resolver, the shared Operations-assignment policy and its repair writes, with an
unchanged public contract. One resolve now reads the case facts, its open assignments and the latest proposal once, where
it used to re-read them per rule. It left `JDBC_NOT_YET_CONVERTED` (16 → 15). Queries added and details:
`jpa-migration-status.md`, 2026-10-07 `CaseActionService` entry. Both read slices were rebased and live on the shared
branch as d0dbdb8 (`StaffWorkService`) and 5a00889 (`CaseActionService`). Verification: full backend suite **585 tests, 0 failures**
(2 skipped; +1 work-item precedence test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly
reset PostgreSQL 17 (V1–V73, new queries included).

**JourneyService converted (2026-10-07, Claude; CL5 read slice 3).** No product behaviour change. Every view — case
lists and queue cards, the case page, assignment history, proposal documents and the patient's secure proposal view —
moved to three JPA query services (`JourneyCaseQueryService`, `CaseWorkspaceQueryService`, `ProposalQueryService`); the
commands read through repositories. The whole class fit one session, so it left `JDBC_NOT_YET_CONVERTED` (15 → 14);
no view remains on JDBC. The case page no longer names people row by row (one batched names read for the timeline,
messages and assignments), and gate facts are one read. Public contract unchanged. Queries added and details:
`jpa-migration-status.md`, 2026-10-07 `JourneyService` entry. Verification: full suite **586 tests, 0 failures** (2 skipped; +1 case-page names test); `ArchitectureRulesTest` 22/22;
`PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

**PaymentService converted (2026-10-07, Claude; CL5 read slice 4).** No product behaviour change. The deposit view, the
readiness standing (status / waived / satisfied / amount due), net paid and the deposit-policy list moved to a new
`DepositQueryService` (JPA projections in `journey`); `PaymentService` keeps the commands with an unchanged public contract
(the unused `depositPaid` was removed). A receipt or refund now reads its deposit once (was four times) and the ledger
totals in one aggregate; readiness reads the active deposit once instead of once per question. It left
`JDBC_NOT_YET_CONVERTED` (14 → 13); the four deposit tables are fully JPA. Found while testing: Hibernate's H2 dialect
drops `nulls first`, so H2 tests could not see the default-first policy order; the query now orders explicitly
(`CommercialPolicyRepository` and `ClinicServiceChangeRepository` share the H2-only gap; PostgreSQL is correct). Queries added
and details: `jpa-migration-status.md`, 2026-10-07 `PaymentService` entry. Verification: full suite **587 tests, 0 failures** (2 skipped; +1 deposit-ledger test);
`ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries
included).

**ConsultantReferralService converted (2026-10-07, Claude; CL5 read slice 5).** No product behaviour change. Referral
views (coordinator list, the consultant's referrals, the view each command returns) moved to a new `ReferralQueryService`
(JPA projections in `journey`, consultant names in one batched `directory` read); `ConsultantReferralService` keeps the
commands with an unchanged public contract and reads through repositories. A referral list is two queries whatever its
length (it was one row read plus up to three name reads per referral); deciding an offer reads its referral once. It left
`JDBC_NOT_YET_CONVERTED` (13 → 12) and `consultant_referrals` is fully JPA. Queries added and details:
`jpa-migration-status.md`, 2026-10-07 `ConsultantReferralService` entry. Verification: full suite **588 tests, 0 failures**
(2 skipped; +1 referral-views test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset
PostgreSQL 17 (V1–V73, new queries included).

**PatientActivationService converted (2026-10-07, Claude; CL5 read slice 6).** No product behaviour change. The patient's
onboarding views — the pre-fill, the activation result and the deposit summary — moved to a new
`PatientActivationQueryService` (JPA projections in the owning modules; the deposit through the existing
`DepositQueryService`); `PatientActivationService` keeps the commands (activate, resend account setup, portal hand-off)
and the validation with an unchanged public contract, and reads through repositories. A view now reads the case once
(number, stage and waiting-on in one row; it was two reads); validation reads the consents on file once, and only when the
request leaves a required one out (it was one count per missing consent); activation takes the profile row lock once
(it was locked twice). It left `JDBC_NOT_YET_CONVERTED` (12 → 11). Queries added and details: `jpa-migration-status.md`,
2026-10-07 `PatientActivationService` entry. Verification: full suite **589 tests, 0 failures** (2 skipped; +1 consents-on-file test);
`ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries
included).

**PublicCaseAccessService converted (2026-10-07, Claude; CL5 read slice 7).** No product behaviour change. Its reads are
command lookups and authorization checks (link by token, open code, live grant, send counts, recovery contact), so they
became repository reads in the owning modules (`casemanagement` for links and the case, `journey` for codes) used by the
service directly — no query service was needed. Token, grant and OTP authorization, purpose checks, expiry, the hourly send
and recovery limits and every error code are unchanged. A code request resolves the case contact once (was twice); issuing a
link or stamping a verified channel takes the patient id from that contact instead of re-reading the case; the proposal
hand-off reads the last verified code's channel and hint in one row (was two). It left `JDBC_NOT_YET_CONVERTED` (11 → 10);
`case_access_links` and `case_access_challenges` are fully JPA. Queries added and details: `jpa-migration-status.md`,
2026-10-07 `PublicCaseAccessService` entry. Verification: full suite **590 tests, 0 failures** (2 skipped; +1 case-access
test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries
included).

**PatientAccountService converted (2026-10-07, Claude; CL5 read slice 8).** No product behaviour change. Like
`PublicCaseAccessService`, its reads are command lookups and single-row views (account state, the sign-in session, the
"is this case for you?" question, "Profile & Security"), so they became repository projection reads in the owning modules
(`directory` for the account and profile, `journey` for account-link requests, `casemanagement` for the case and its
submission contact) used by the service directly — no query service was needed. Account setup, resume and resend rules, the
continuation-link expiry, token and account-ownership checks, the current-case rule, masks and every error code are
unchanged; profile changes still lock the patient row (`lockById`). It left `JDBC_NOT_YET_CONVERTED` (10 → 9);
`patient_account_link_requests` and `case_submission_contacts` are fully JPA. Queries added and details:
`jpa-migration-status.md`, 2026-10-07 `PatientAccountService` entry. Verification: full suite **591 tests, 0 failures**
(2 skipped; +1 pending-continuation-link test, which also passes on the pre-conversion service); `ArchitectureRulesTest`
22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

**PatientActionService converted (2026-10-07, Claude; CL5 read slice 9).** No product behaviour change. Its one view, the
case's open information request (secure link, case page, action resolver), moved to a new `PatientActionQueryService`: two
queries (the request, then its lines), where it was three. `CaseWorkspaceQueryService` and `CaseActionService` call it
directly; `PatientActionService.openAction` delegates for `PublicCaseAccessService`. The commands (request, Journey actions,
patient answers, recording on the patient's behalf) read through repositories in the owning modules (`casemanagement` for
tasks, the case status, the patient's name and the coordinator; `journey` for the requested lines). One open request per case,
no duplicate lines, required answers, foreign item ids, the replay rule, the review work item and its summary, the stage
restore and every error code are unchanged; the service never took a row lock. Answers are now matched against the line rows
without decrypting labels on the write path. It left `JDBC_NOT_YET_CONVERTED` (9 → 8); `patient_action_items` is fully JPA.
Queries added and details: `jpa-migration-status.md`, 2026-10-07 `PatientActionService` entry. Verification: full suite
**592 tests, 0 failures** (2 skipped; +1 extended-request view test, which also passes on the pre-conversion service);
`ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

**IdentityVerificationService converted (2026-10-07, Claude; CL5 read slice 10).** No product behaviour change. Its views —
one check (returned by start and review), the patient's latest (case and onboarding page) and the reviewer queue — moved to a
new `IdentityVerificationQueryService`: one query each, selecting only the view columns (the encrypted legal name, date of
birth and provider reference are never read). The commands read through repositories in the owning modules (`journey` for
checks and onboardings, `casemanagement` for the case-access rule, `directory` for the representation). A decision reads the
check's status, onboarding and case in one row (was two reads). Case access (patient or active representative), the reason
rule, the reviewable-status guard, the 730-day validity, the onboarding hand-offs, the audit case id and every error code are
unchanged; the service never took a row lock. It left `JDBC_NOT_YET_CONVERTED` (8 → 7); `patient_identity_verifications` is
fully JPA. Queries added and details: `jpa-migration-status.md`, 2026-10-07 `IdentityVerificationService` entry.
Verification: full suite **593 tests, 0 failures** (2 skipped; +1 identity-views test, which also passes on the
pre-conversion service); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17
(V1–V73, new queries included).

**CaseHandoffService converted (2026-10-07, Claude; CL5 read slice 11).** No product behaviour change. Its reads are command
lookups inside the deposit and readiness event handlers, so they became repository reads in `casemanagement` (case status,
case number, the patient's contact, coordinator assignments) and `shared` (the audit one-shot marker) used by the service
directly — no query service was needed. The two status row locks are now `lockById`, still the first statement of each
handler. Deposit work only on an ACCEPTED case, the one-time handoff (original coordinator restored, TRAVEL work, shared-queue
alert when unowned, the patient's WhatsApp-else-email message), the policy-guarded move to TRAVEL_COORDINATION and replay
safety are unchanged. It left `JDBC_NOT_YET_CONVERTED` (7 → 6); `audit_events` is fully JPA. Queries added and details:
`jpa-migration-status.md`, 2026-10-07 `CaseHandoffService` entry. Verification: full suite **595 tests, 0 failures**
(2 skipped; +2 handoff tests, which also pass on the pre-conversion service); `ArchitectureRulesTest` 22/22;
`PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

**OnboardingService converted (2026-10-07, Claude; CL5 read slice 12).** No product behaviour change. The onboarding page —
for the patient, for staff and as returned by every command — moved to a new `OnboardingQueryService` (JPA projections in the
owning modules; the identity check through `IdentityVerificationQueryService`, readiness through `CustomerReadinessService`). The
commands read through repositories. The page now reads the case and its patient in one row (it was three reads). Case access
(patient or active representative), version guards, consent validation, the readiness gate on submission, the 45-day expiry,
the representative re-grant, which consents count and every error code are unchanged; the service never took a row lock. It
left `JDBC_NOT_YET_CONVERTED` (6 → 5); `patient_onboardings` and `consent_records` are fully JPA; the unused
`PatientNames.DISPLAY_SQL` was removed. Queries added and details: `jpa-migration-status.md`, 2026-10-07 `OnboardingService`
entry. Verification: full suite **596 tests, 0 failures** (2 skipped; +1 onboarding-page test, which also passes on the
pre-conversion service); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17
(V1–V73, new queries included).

**JourneyCaseRelationships converted (2026-10-07, Claude; CL5 read slice 13).** No product behaviour change. It is the
`CaseRelationships` port behind every case-scope authority decision (team, offer, second opinion, owner, unclaimed intake, own
patient, supervision); each fact became one existence/count read in `casemanagement` used directly — no query service. Team vs
offer vs second opinion, the active primary coordinator, the unclaimed-intake rule and the representative window (unrevoked,
effective, unexpired) are unchanged. It left `JDBC_NOT_YET_CONVERTED` (5 → 4); `patient_representatives` and
`patient_profiles` are fully JPA. Queries added and details: `jpa-migration-status.md`, 2026-10-07 `JourneyCaseRelationships`
entry. Verification: full suite **597 tests, 0 failures** (2 skipped; +1 relationship-facts test, which also passes on the
pre-conversion class); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17
(V1–V73, new queries included).

**CoordinationReadService converted (2026-10-07, Claude; CL5 read slice 14).** No product behaviour change. Its own plain
SQL — the Coordination Setup roster (account state, names, caseload) and the supervisor's managed-case summary (QA-12) — became
JPA projections in `workforce` and `casemanagement`, batched by subject or case and assembled in the service; the overview,
consultants and decision feed still read through `CoordinationRepository` (next). Account state, the NOT_A_COORDINATOR marker,
open caseload, the led-team scope (WF-08 `findSupervisedMembers`), latest-first order, work counts and the per-case audit are
unchanged. It left `JDBC_NOT_YET_CONVERTED` (4 → 3); `workforce_people`, `access_subjects` and `workforce_role_assignments` are
fully JPA outside the local seeder. Queries added and details: `jpa-migration-status.md`, 2026-10-07 `CoordinationReadService`
entry. Verification: full suite **598 tests, 0 failures** (2 skipped; +1 roster/summary test, which also passes on the
pre-conversion service); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17
(V1–V73, new queries included).

**CoordinationRepository reads converted (2026-10-07, Claude; CL5 read slice 15).** No product behaviour change. The coordination
facade (writes already JPA) now reads through JPQL projections in the owning modules with an unchanged public API: teams and
routing profiles, memberships and lead flags, capacity, policy and preference versions, consultants, case routing facts,
owner, workload, the routing queue (decision counts batched instead of one per item), replay, history and the decision feed.
It left `JDBC_NOT_YET_CONVERTED` (3 → 2): only `CaseNumberGenerator` (sequence) and `LocalDemoDataSeeder` (local profile)
remain, both documented exceptions, so **every table is read and written through JPA** (tracker swept to R). Queries added
and details: `jpa-migration-status.md`, 2026-10-07 `CoordinationRepository` entry. Verification: full suite **599 tests, 0
failures** (2 skipped; +1 routing-reads test, which also passes on the pre-conversion repository); `ArchitectureRulesTest`
22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

**Next exact action:** CL5 read conversions, one service per session, each rewritten as a query service and removed
from `ArchitectureRulesTest.JDBC_NOT_YET_CONVERTED`: `StaffWorkService`, `CaseActionService`, `JourneyService`,
`PaymentService`, `ConsultantReferralService`, `PatientActivationService`, `PublicCaseAccessService`,
`PatientAccountService`, `PatientActionService`, `IdentityVerificationService`, `CaseHandoffService`, `OnboardingService`, `JourneyCaseRelationships`,
`CoordinationReadService` and the `CoordinationRepository` reads are done; then move `LocalDemoDataSeeder` to a `devdata` package. CL7 is **blocked** (no Sonar server/project/token; no Sonar scanner in the offline
Maven cache). The independent Astra review of CL2+CL3 is still owed and needs a reviewer the owner chooses. Preserve
unrelated brand/theme work and do not run concurrent builds that share `backend/target`.

### Open evidence (P1–P6, 2026-10-05)

- No approved implementation gap remains in P1–P6. OD-02 and Practice Manager consent remain excluded.
- The canonical tunnel stack was not rebuilt and live identity/browser tests were not run for P1–P6 or CL1–CL6.
  Nothing was published, pushed or enabled, and no development volume was deleted. Existing historical live evidence
  remains historical rather than a fresh claim. If fresh deployment evidence is requested, use the canonical tunnel
  overlay and exercise the distinct holder/admin/manager identities without enabling Journey admission merely for
  demonstration. The current next action is the "Next exact action" after the CoordinationRepository note above.
