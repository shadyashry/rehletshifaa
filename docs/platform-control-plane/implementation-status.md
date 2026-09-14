# Platform Control Plane — implementation status

Updated 2026-09-14. **Phase 1 and Phase 2A remain accepted. Phase 2B Provider Credentialing, Readiness and Activation is implemented and accepted at the offline backend verification boundary. Phase 2C has not started.**

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

## NEXT EXACT ACTIONS — post-Phase 2B operational cutover

1. Before deployment, inspect real PostgreSQL V33 legacy mappings and take the normal database backup; apply V34 through the standard tunnel-overlay stack only after that review. Do not hand-edit mappings or migration history.
2. In the development environment, exercise Keycloak operation-marker recovery for timeout, zero-match and ambiguous-match outcomes, then confirm no duplicate identity or membership is created.
3. Exercise MinIO plus ClamAV with an actual browser upload: mutate the staging object after scanning begins and confirm the sealed object retains exactly the inspected digest; verify cross-tenant view issuance is denied.
4. Assign the first independent credential officer through central Access Governance for each reviewed provider tenant; do not repin dormant legacy grants or give Provider Operations verifier authority.
5. Keep provider/clinician activation blocked until authoritative Phase 2C operational setup inputs exist. Start Phase 2C only under separate authorization; no Phase 2C work is included in this checkpoint.

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
