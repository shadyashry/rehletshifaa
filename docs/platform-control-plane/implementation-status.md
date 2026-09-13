# Platform Control Plane — implementation status

Updated 2026-09-14. **Phase 1 remains accepted. Phase 2A Provider Organization, Membership and Clinician Relationship Foundation is complete. Phase 2B has not started.**

Keycloak is authoritative for authentication and identity-session concerns. RehletShifaa is authoritative for dynamic business authorization, organization membership, roles, permissions, scopes and relationships.

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

## NEXT EXACT ACTIONS — Phase 2B (future authorization required)

Stop after the Phase 2A commit. Do not start these actions without explicit Phase 2B authorization:

1. Reconfirm branch/status and V33 baseline; read only master spec §6.4–6.5, Provider Management PM-003/PM-004/PM-007–PM-010 and Credentialing CR-001–CR-005.
2. Add provider-owned secure credential evidence without fabricating patient cases; preserve existing `practitioner_credentials`, document scanning/storage boundaries, IDs and history.
3. Add explicit immutable verification decisions and required-credential policy for Consultant and Associate Doctor, including more-information/reject/suspend/expiry states, recent authentication, independent reviewer and existing self-verification prohibition.
4. Implement backend-computed provider/clinician readiness with structured blockers. Review and explicitly activate V33 PENDING_REVIEW mappings; never infer readiness from legacy VERIFIED alone.
5. Make `provider.activate` and only the required credential capabilities executable after authoritative resource resolvers and delegation envelopes exist. Activation must be optimistic/idempotent/audited and reject incomplete readiness.
6. Extend provider APIs/tests for credential submission/review queues, readiness and activation. Preserve legacy JourneyService contracts until parity/cutover tests prove replacement; do not start pricing, availability, Journey Management or routing.
7. Run focused credential/provider/security/migration tests, then the full offline backend suite; update all persistent status files and commit Phase 2B without push/merge.

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
