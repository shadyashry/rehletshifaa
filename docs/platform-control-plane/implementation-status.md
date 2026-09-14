# Platform Control Plane — implementation status

Updated 2026-09-14. **Phases 1, 2A, 2B and 2C remain accepted. Phase 3 Care Coordination / Assignment Engine is implemented and accepted at the offline backend verification boundary. Phase 4A Journey domain foundation is implemented and accepted at the offline backend verification boundary. Phase 4B has not started.**

## Implemented Phase 4A — Journey foundation

- Resumed clean `codex/platform-control-plane` at `4f6620c` (accepted Phase 3), with actual repository Flyway baseline V36. Added V37 only; all historical migrations and canonical specifications remain unchanged.
- One centrally owned INTERNATIONAL_CARE definition, versioned normalized nodes/edges, canonical sorted JSON graph snapshots and SHA-256 hashes. Draft creation, graph editing, cloning, validation, simulation, submission, independent publication, retirement and audit/history APIs live under `/api/v1/admin/journeys`.
- Lifecycle is DRAFT → VALIDATED → SIMULATED → PENDING_APPROVAL → PUBLISHED → RETIRED. Edits invalidate evidence; pending approval must return to draft first. Published/retired graph content is immutable; clones create a new numbered draft. Expected revisions and database definition locks protect edits, lifecycle changes and concurrent clones.
- Engineering catalog registers existing actions with actor/stage compatibility and source contracts. Actor types follow canonical semantic names. The metadata endpoint exposes stage/actor/fact choices and size/loop limits. No arbitrary handlers, scripts, SQL, expressions or external URLs execute.
- Authoritative validation returns readable errors for starts, references, reachability, completion, cycles, actor/action compatibility, decision completeness, conditions and timer/SLA validity. Conditional branches are complementary boolean outcomes; optional stages use explicit branches. Phase 4A rejects cycles pending governed recovery semantics in 4B.
- Pure deterministic simulation returns conceptual route, actor/action, waits, blockers and completion. It does not call current runtime/projection services or create cases, WorkItems, notifications or assignments. Only summary outcomes are persisted; supplied test facts are not audited/stored.
- Phase 1 authorization governs every operation, using PLATFORM scope, GOVERNANCE grant actor, approved version cutovers and ADMIN_WEB/API channels. Manager/Approver grants are separate; publication rejects the creator and all prior editors even after access replacement. Approve/publish/retire require recent authentication. Safe successful governance audit shares the transaction; denial audit survives rejection.
- WorkRequirement is a future integration contract only, with semantic actor and registered action/SLA. No recipient identifiers, duplicate Case/WorkItem/PatientAction models, Flowable dependency, runtime binding, parity seed, production cutover or visual designer were added. Every version explicitly returns `runtimeDeployment=NOT_DEPLOYED`.
- Verification: focused 22-test set passed, followed by the final full offline backend gate: **344 tests / 35 suites, zero failures/errors/skips**. This includes the final API-channel/history assertions and all existing case/provider/coordination/security regressions. Live deployment checks remain outside this implementation boundary. **PHASE 4A ACCEPTED: YES. PHASE 4B READY: YES (domain handoff; DEPENDENCY-01 preflight remains required).**
## Phase 3 resumed state and completion

- Resumed `codex/platform-control-plane` at Phase 2C HEAD `80ae466` with the interrupted V36 coordination module, access/provider/Journey integration and focused tests still unstaged/untracked. No branch switch, reset, clean, stash, discard or canonical-specification edit was performed.
- Already implemented when resumed: Coordinator Teams, effective membership and capacity configuration; immutable policy/preference versions; separate eligibility/scoring; deterministic precedence/tie-break; shadow/LIVE commands; assignment decisions; queue/manual commands; legacy hooks; readiness integration; V36; and initial focused tests.
- The recovered reports showed 3 scoring tests and the concurrency test passing, Flyway passing through V36, and 11 of 12 integration tests passing. The effective-period precision correction in the working tree postdated that report; a fresh run confirmed it.
- Completion review closed a remaining fail-open eligibility edge by requiring an active Coordinator/Coordinator Lead staff record, and added explicit queue-resolution audit coverage. Focused, impacted and full offline backend verification now pass.

## Implemented Phase 3

- V36 adds provider-owned Coordinator Teams, effective/revisioned membership, centralized per-provider capacity/on-duty/skill-language metadata, immutable routing-policy and Consultant-preference versions, per-case SHADOW/LIVE routing scope, durable decision/idempotency records and coordination queue metadata on existing `case_tasks`.
- Access Governance is authoritative for all coordination reads/mutations and recipient eligibility. V36 publishes explicit Coordination Manager and Coordinator recipient envelopes with cutover records; older pinned assignment grants remain dormant. Provider membership, case provenance and target staff identity are database-resolved and cross-tenant targets fail closed.
- Eligibility is evaluated before scoring: active identity/provider membership and approved `assignment.receive`, enabled Coordinator staff record, active effective team membership, care-area/language/on-duty requirements and remaining global capacity. Preferences never bypass hard eligibility.
- Routing preserves eligible continuity, then preferred Coordinator, preferred/provider/care-area/default/fallback teams, then the eligible scored pool. Capacity and language use the frozen normalized weights and scale; ties use normalized workload, oldest automatic assignment (null first), then lexical subject.
- Every decision persists policy/version, preference, algorithm, full candidates/exclusions, factor scores, path, previous/new Case Owner, source, reason and evaluation time. Identical command replay returns the same decision; changed payload conflicts.
- Default routing is SHADOW. LIVE adoption requires a current matching shadow result and reason. Legacy claim/reassign remains authoritative for SHADOW/unresolved cases, records comparisons when provenance/configuration exists, and is denied after per-case LIVE adoption.
- LIVE automatic/manual assignment updates only the primary Coordinator owner history and Coordinator/unassigned tasks following the previous owner. Operations, Finance, Consultant and other WorkItem ownership plus medical-case status/currentAction/WaitingOn semantics are preserved.
- No eligible Coordinator creates a durable `COORDINATION_ROUTING` WorkItem with team, reason, queued/due timestamps and authorized manager notification. Manual queue placement/resolution and scheduled opt-in retry reuse the same task/outbox infrastructure and are audited.
- Global database serialization plus provider/case locks, optimistic routing revisions and the unique durable command key protect duplicate delivery, concurrent routing, automatic/manual races, global-capacity contention, duplicate owner history and duplicate domain notifications. No in-memory routing lock was introduced.
- The Phase 2 operational-readiness adapter now consumes an effective policy plus active configured team. Commercial/legal acceptance remains its separate blocker. Canonical specifications remain unchanged; no frozen Phase 3 decision required replacement.

## Implemented Phase 2C

- V35 adds immutable, effective-dated provider price versions at organization, Consultant and permitted Associate Doctor scope. Draft/change/publish/retire history is optimistic and audited; overlap, money, currency, period and clinician-scope validation fail closed.
- `ProviderOperationalSetupService` resolves clinician override before organization default and then the existing supported Consultant catalogue fallback. Resolution returns amount, currency, source level, source/version and effective period; no client-calculated price is trusted.
- Published Consultant prices cross a narrow provider-to-commercial port into the existing `PricingCatalogService` and `consultant_service_catalog`. Non-EGP provider amounts use the existing FX authority to derive the EGP catalogue value. Existing proposal item/version money, FX, margin and released HTML/PDF snapshots are never rewritten.
- V35 adds recurring weekly clinician slots with IANA timezone, effective dates, optional service/mode/location, plus leave, blocked time, clinic closure, extra availability and special-clinic exceptions. Effective queries apply an active exception before recurring schedule and validate overlapping slots/exceptions.
- Production provider APIs cover price list/history, draft/version changes, clinician approval, publish/retire and effective resolution; schedule read/update, exception add/update/remove and effective availability. Controllers expose DTO records only and delegate to the application service.
- Phase 1 Access Governance is authoritative. Reviewed V35 Practice Manager grants use exact `MANAGES` clinician scope; Consultant/Associate default versions are view-only, and self-management requires an explicit approved grant. Finance receives no catalogue authority. Old pinned role versions stay dormant for Phase 2C capabilities until explicitly replaced.
- The Phase 2B `OperationalSetupReadinessPort` now has a real implementation. Pricing and availability readiness use current database facts and emit business-language blockers. Provider/clinician activation therefore consumes real Phase 2C state; routing and commercial/legal acceptance remain explicit blockers rather than being fabricated before their owning phase.
- Canonical files under `docs/platform-control-plane/specs/` remain byte-unchanged.

Phase 2B design review completed against clean Phase 2A HEAD `a28ed7b` on `codex/platform-control-plane`. Implementation decisions are frozen in technical-decisions.md §13. Architecture is retained; required corrections cover identity recovery, immutable scanned evidence, verifier delegation/independence, legacy eligibility cutover and readiness prerequisites. This was documentation-only; no Phase 2B/2C code or live changes. Full operational activation must remain blocked wherever later-phase setup is unavailable.

Keycloak is authoritative for authentication and identity-session concerns. RehletShifaa is authoritative for dynamic business authorization, organization membership, roles, permissions, scopes and relationships.

## Phase 2B resumed state and completion

- Resumed `codex/platform-control-plane` at Phase 2A HEAD `a28ed7b` with an unstaged/untracked interrupted Phase 2B implementation. No branch switch, reset, clean, stash or overwrite was performed.
- Already present but unverified: V34 credential/onboarding schema, provider credential API/service, versioned evidence and decisions, readiness/activation, identity operation markers, storage sealing and initial focused tests.
- Partially present: identity finalization serialization, reviewer segregation, lifecycle transitions, expiry/outbox, legacy eligibility and compatibility. The first focused run exposed two fixture assertions; later review exposed real defects in membership timestamp precision, reviewer decision state mapping, scanner-failure rollback, verifier delegation, supervisor eligibility and multi-provider legacy resolution. These were corrected in place.
- Canonical specifications under `docs/platform-control-plane/specs/` remain unchanged. Frozen decisions in technical-decisions.md §13 were preserved; no replacement decision was required.

## Implemented Phase 2B

- Durable role-free identity invitation/linkage uses a server-managed operation marker, exact-subject recovery, requested-role reauthorization, serialized finalization and idempotent completed replay. Existing stored identities link by stable subject; display name, phone and unverified email never merge identities.
- Per-tenant clinician onboarding separates membership, authentication, credential verification, credential readiness, operational readiness and explicit activation. Clients cannot patch lifecycle state. Consultant, Associate Doctor, Assistant, Practice Manager, Organization Owner and Provider Operations boundaries remain distinct.
- V34 adds clinician enrollments, immutable credential policy versions and requirements, tenant dossiers, submission revisions, sealed evidence metadata, exact-revision evidence links, immutable decisions, command idempotency, domain-event deduplication and legacy-adoption markers. V1–V33 were not edited and no historical verifier facts were fabricated.
- Provider evidence reuses the existing storage and inspection ports. Browser uploads target random staging keys; the service verifies metadata, reads and scans bounded bytes, seals those same bytes to a new server-only key, stores digest/scan facts and authorizes each short-lived view URL by stored tenant ownership.
- Credential submission, correction, rejection, independent verification, suspension/restoration and renewal preserve revision/decision history. Self-review and submitter-review are denied; verify/reject/suspend/activation require recent authentication. Provider Operations and provider-local managers receive no verifier bypass.
- Central Access Governance can delegate only the published registered credential-verifier envelope to a verified provider and trusted active subject. This creates/reviews the canonical provider membership without creating a fake practitioner/staff record; the central administrator does not gain evidence access.
- Readiness is server-authoritative and returns structured business blockers. Associate readiness requires a same-tenant, effective, credential-ready Consultant supervisor. Missing Phase 2C services/pricing/availability/routing facts remain explicitly blocking through `OperationalSetupReadinessPort`; no Phase 2C state was fabricated.
- Provider and clinician activation are permission-controlled, optimistic, readiness-gated, idempotent and audited. Credential expiry is evaluated synchronously for readiness, scheduled reconciliation appends deduplicated expiry events without mutating approvals, and configurable reminders use the existing notification outbox.
- Legacy credential writes remain available before explicit adoption. After adoption they are rejected, Journey consultant eligibility uses all mandatory current provider credentials, and ambiguous multi-organization enrollment fails closed rather than selecting any passing tenant.

## Checkout and recovered state

- Branch: `codex/platform-control-plane`; resumed HEAD `3a184b0`. No branch switch/reset/stash/cleanup.
- Previous session stopped before a coherent commit/handoff, with unstaged SecurityConfig/portal changes and untracked access backend, V31, tests and UI. All preserved and completed in place.
- Its status files still described Phase 0. Recovered test reports showed 14 passing access tests and one concurrency failure. The current concurrency file already contained a seed-date fix newer than that report; its fresh run passed.
- Phase 0 artifacts remain in history (`f1cc71c`, `3a184b0`); approved specs remain unchanged.

## Implemented Phase 2A

- Added real `provider_organizations` tenants with stable UUIDs, legal/business/display identity, extensible provider type, controlled lifecycle, audit metadata and optimistic versioning. Phase 2A allows DRAFT/ONBOARDING/SUSPENDED/OFFBOARDED changes; READINESS_REVIEW/ACTIVE are explicitly blocked until Phase 2B readiness exists.
- `access_memberships` remains the authoritative user-to-organization membership. Provider-specific linkage extends it through `provider_membership_details`; pinned Phase 1 role assignments remain the business-role truth and allow one subject to belong to multiple organizations and hold multiple organization roles.
- Reused `practitioner_profiles` for Consultants and Associate Doctors and `staff_members` only for already-known platform staff. New clinicians retain stable Keycloak subjects and receive a practitioner profile; Practice Managers/Assistants do not become fake internal staff or clinicians.
- Reused `resource_relationships` for active/pending `MANAGES`, `ASSISTS` and `SUPERVISES` facts. The provider service validates source role, target clinician role, tenant and effective membership before insertion. Assistant/Associate templates still lack final Consultant authority.
- Added `/api/v1/admin/providers` create/list/detail/update, membership link/invite/activate/deactivate, relationship and identity-reconciliation APIs. Every operation resolves the organization/profile from the database and uses `AuthorizationService`; no endpoint authorizes by realm-role name.
- Made only Phase 2A provider capabilities executable, added `provider.relationship.manage`, and published additive v2 default provider-role versions. `provider.activate`, credential, pricing, availability, clinical, finance, journey and assignment capabilities remain unavailable unless previously executable Access Governance capabilities.
- Provider creation requires a platform-scoped `provider.create` grant and gives the creator access only to the newly created organization. Provider Operations Managers do not receive universal provider access. Organization Owner/Practice Manager cannot assign platform roles or bypass credential/readiness controls.
- Provider invitations call role-free `IdentityProvisioningPort`. Encrypted operation records preserve REQUESTED/IDENTITY_CREATED/COMPLETED/FAILED reconciliation state around the non-atomic Keycloak/database boundary; the stable external subject is stored. Existing identities are reused only from a trusted stored practitioner/staff email/subject link.
- V33 deterministically maps every existing subject-linked practitioner to a distinct solo-practice organization and pinned Consultant assignment while preserving practitioner IDs and all case/pricing/proposal/availability/credential references. Mappings and memberships remain PENDING_REVIEW/PENDING and never auto-activate.

## Implemented Phase 1

- Engineering permission catalog: 71 registered capabilities, metadata/dependencies/conflicts, actor/channel/scope envelopes. Only 10 `access.*` capabilities execute in Phase 1. Future provider/clinical/finance/journey capabilities remain unavailable in the new decision path.
- Nineteen stable default role templates; configurable custom roles; pinned, immutable published versions; draft save/resume/validation; effective publication and retirement; optimistic revision checks and serialized changes; independent publisher, including prohibition on any prior editor publishing.
- Explicit scope and relationship primitives; subject state, effective tenant memberships, assignment/revocation history and overlap/SoD checks. Unknown provider organizations and relationships remain PENDING with no activation API.
- Authoritative default-deny AuthorizationService checks account/membership, tenant, version, scope, relationship, workflow authority, registered envelope and recent authentication. No authorization cache or legacy-role fallback.
- Effective Access includes membership/account state, assignment source, role/version, scopes, relationships and reasoned decisions. Saved-draft simulation uses the same evaluator with a hypothetical grant and never changes live assignments or policy. Target-user recent authentication is not borrowed from the administrator.
- Protected `/api/v1/admin/access/*` APIs. Authenticated identities without an ActorRole can use explicitly assigned governance access. Existing business routes, ActorContext, JwtRoleConverter and Keycloak realm remain intact.
- Transactional successful-change audit, permission diffs, effective-access/simulation events; independent denial audit survives rollback. One-shot explicit deployment bootstrap never infers an owner from SYSTEM_ADMIN and never resurrects revoked access.
- EN/AR `/[locale]/portal/access` UI: role/catalog pages, 11-step wizard, scope/relationship/risk preview, before/after grant diff, immutable version history, save/validate/simulate/publish/retire, effective-access/membership explanations, assignment/revocation forms, audit history and backend-driven navigation.

## Files and schema

- New `backend/src/main/java/com/rehletshifaa/access/{domain,application,infrastructure,api}`.
- V31 remains immutable. V32 adds provider organizations, provider membership detail, invitation/reconciliation state, provider capability cutover and provider role v2 records. Java Flyway V33 performs the deterministic legacy-practitioner mapping. V1–V31 are unchanged.
- New `backend/src/main/java/com/rehletshifaa/provider/{application,api}` and focused provider integration tests.
- Four access test classes under `backend/src/test/java/com/rehletshifaa/access`.
- New `frontend/src/components/platform-control-center`, localized access route, `frontend/e2e/access-governance.spec.ts`.
- Existing integration edits limited to SecurityConfig and localized portal page.
- Updated these persistent docs. No dependency, realm, commercial-flow or deployment configuration changes.

## Verification

- Full offline backend: **291 tests / 27 suites, 0 failures/errors/skips**. Includes focused provider/access/identity, Flyway-through-V33, architecture, and all existing clinical/commercial/payment/patient/security tests.
- Frontend typecheck passed; 9 component/portal-role tests passed.
- Chromium EN/AR desktop/mobile draft simulation/publication checks: 2 passed; screenshots reviewed. See test-status.md for scope.
- No live PostgreSQL migration, Docker rebuild, production build, live Keycloak invitation or tunnel deployment. No frontend changed in Phase 2A.

## Cutover boundary

The Access Governance and `/api/v1/admin/providers/**` route families use the new policy. Existing coordinator/doctor/operations/finance/patient/secure-link/OTP/pricing/payment behavior remains protected by its existing authoritative services. Provider credential/readiness activation is Phase 2B; pricing/availability is Phase 2C. Read migration-inventory.md and technical-decisions.md §10–§12 before deployment or expansion.

## Remaining compatibility debt

- ActorRole, ActorContext, JwtRoleConverter and coarse Keycloak realm-role gates remain authoritative on business routes not yet migrated. This is intentional compatibility debt, not a fallback for `/api/v1/admin/access/*`.
- Phase 2 and later cutovers must replace each indexed legacy business-role decision only after an equivalent capability, authoritative resource resolver and parity/tenant-isolation test exist. A new-policy denial must never fall back to a legacy role.
- Existing staff/doctor invitation paths still use the legacy role-aware Keycloak overload. New Provider Management orchestration must use `IdentityProvisioningPort` and keep all organization membership and business-role data in RehletShifaa.

## NEXT EXACT ACTIONS — Phase 4B (not started)

1. Read this handoff, technical-decisions.md §16, test-status.md and migration-inventory.md. Confirm clean Phase 4A commit and actual migration baseline before changes. Keep canonical specifications read-only.
2. Resolve DEPENDENCY-01 through a policy-authorized one-time bootstrap of the pinned Flowable 7.2.0 process starter and inspect its transitive dependencies under the actual Boot BOM; return to offline builds. No engine or compiler has been added in 4A.
3. Implement a Journey runtime/compiler port and Flowable adapter with engine-owned schema separation. Verify deploy/start/complete/timer/restart and atomic rollback on H2 and PostgreSQL before runtime activation. Phase 4A PUBLISHED is domain approval only, always NOT_DEPLOYED; never treat it as an active runtime deployment.
4. Model International Care Journey v1 from the unchanged CaseTransitionPolicy and dedicated domain gates, including recovery paths. Explicitly design safe bounded recovery semantics beyond the 4A acyclic policy. Prove existing happy/recovery/terminal, proposal/payment/identity and WorkItem/PatientAction/currentAction/WaitingOn parity before any cutover.
5. Keep the Phase 3 boundary: Journey emits semantic actor work requirements; Assignment Engine chooses the eligible person/team. Implement any future version binding and controlled adoption only under the separately approved Phase 4B/cutover scope; do not silently migrate existing cases.
6. Before live deployment, back up/review real PostgreSQL mappings and apply pending migrations through the standard Compose+tunnel stack. Explicitly assign reviewed V37 Journey Manager/Approver PLATFORM envelopes; no default user assignment or production journey seed exists. Designer/UI remains later work.

## Final acceptance/reconciliation — 2026-09-13

| Acceptance area | Result | Evidence / scope |
|---|---|---|
| 1. Authorization boundary | PASS | Single default-deny AuthorizationService; authoritative resource facts; no new business role-name fallback |
| 2. Legacy compatibility | PASS | ActorRole/ActorContext/JWT/realm retained; existing security and commercial journey tests pass; credential guard only tightens access |
| 3. DB authority | PASS | V31 templates, immutable versions, catalog/grants, per-subject/per-org memberships and assignments, scoped/effective relationships, audit; verified provider entities remain Phase 2 |
| 4. Tenant isolation | PASS | Membership plus resolved organization required; central governance explicitly PLATFORM; wrong parent/org/relationship subject denied; provider UUIDs remain pending |
| 5. Effective access | PASS | Assignment/version, permission, org, scope, relationship and reasons; same evaluator for simulation; unknown provider facts deny |
| 6. Identity integration | GAP FOUND → PASS | Added role-free IdentityProvisioningPort implemented by existing KeycloakStaffIdentityService; legacy overload retained |
| 7. Admin UI | PASS | RehletShifaa EN/AR business labels, capability-driven navigation, DB role/assignment/effective-access API; no Keycloak Admin Console dependency |
| 8. Single business authority | PASS | DB business grants; realm roles compatibility only; explicit authority and provisioning contract in technical-decisions §11 |
| 9. Security | GAP FOUND → PASS | Closed legacy self-credential decision gap and immediate-start timestamp rounding; added IDOR, membership, permission-removal and provisioning regressions; existing SoD/audit tests pass |
| 10. Phase 2 readiness | PASS | Backend port supports identity lifecycle + stable subject; provider domain/orchestration and controlled capability cutover are exact next work |

Corrections are confined to the identity boundary, legacy self-verification guard, access timestamp persistence, focused tests and handoff docs. No schema/realm/frontend/deployment changes. See test-status.md for executed results and unrun live checks. Phase 1 is accepted as the foundation for the requested UI → authorized Provider Management service → Keycloak identity / RehletShifaa business data pattern.
