# Platform Control Plane — implementation status

Updated 2026-09-14. **Phase 1 accepted after final reconciliation. Phase 2 not started.**

Keycloak is authoritative for authentication and identity-session concerns. RehletShifaa is authoritative for dynamic business authorization, organization membership, roles, permissions, scopes and relationships.

## Checkout and recovered state

- Branch: `codex/platform-control-plane`; resumed HEAD `3a184b0`. No branch switch/reset/stash/cleanup.
- Previous session stopped before a coherent commit/handoff, with unstaged SecurityConfig/portal changes and untracked access backend, V31, tests and UI. All preserved and completed in place.
- Its status files still described Phase 0. Recovered test reports showed 14 passing access tests and one concurrency failure. The current concurrency file already contained a seed-date fix newer than that report; its fresh run passed.
- Phase 0 artifacts remain in history (`f1cc71c`, `3a184b0`); approved specs remain unchanged.

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
- New `backend/src/main/resources/db/migration/V31__access_governance_foundation.sql`; nine tables and default catalog/role seeds. V1–V30 unchanged; no additional migration needed during this continuation.
- Four access test classes under `backend/src/test/java/com/rehletshifaa/access`.
- New `frontend/src/components/platform-control-center`, localized access route, `frontend/e2e/access-governance.spec.ts`.
- Existing integration edits limited to SecurityConfig and localized portal page.
- Updated these persistent docs. No dependency, realm, commercial-flow or deployment configuration changes.

## Verification

- Full offline backend: **286 tests / 26 suites, 0 failures/errors/skips**. Includes the access, identity-provisioning, Flyway-through-V31, architecture, and existing clinical/commercial/payment/patient/security tests.
- Frontend typecheck passed; 9 component/portal-role tests passed.
- Chromium EN/AR desktop/mobile draft simulation/publication checks: 2 passed; screenshots reviewed. See test-status.md for scope.
- No live database migration, Docker rebuild, production build, live Keycloak test or tunnel deployment. Browser verification uses synthetic HTTP fixtures and a separate local test server.

## Cutover boundary

Only the new Access Governance route family uses the new policy. Existing coordinator/doctor/operations/finance/patient/secure-link/OTP/pricing/payment behavior is intentionally still protected by its existing authoritative services. Provider business execution, credential activation and active provider membership cutover are Phase 2 or later. Read migration-inventory.md and technical-decisions.md §10 before deployment or expansion.

## Remaining compatibility debt

- ActorRole, ActorContext, JwtRoleConverter and coarse Keycloak realm-role gates remain authoritative on business routes not yet migrated. This is intentional compatibility debt, not a fallback for `/api/v1/admin/access/*`.
- Phase 2 and later cutovers must replace each indexed legacy business-role decision only after an equivalent capability, authoritative resource resolver and parity/tenant-isolation test exist. A new-policy denial must never fall back to a legacy role.
- Existing staff/doctor invitation paths still use the legacy role-aware Keycloak overload. New Provider Management orchestration must use `IdentityProvisioningPort` and keep all organization membership and business-role data in RehletShifaa.

## NEXT EXACT ACTIONS — Phase 2 (future authorization required)

Phase 1 implementation is committed at `daf7e20`. Final reconciliation reviewed that commit/diff and its Phase 0/spec history from a clean `codex/platform-control-plane` checkout. Commit the reconciliation only; do not push or merge.

Stop after the Phase 1 commit. On future Phase 2 authorization:

1. Read AGENTS.md, CLAUDE.md, this status, technical-decisions.md §5/§10/§11, migration-inventory.md cutover section and test-status.md. Confirm this branch/status without discarding work.
2. Read only master spec §6.1–6.6 and provider acceptance matrix for Phase 2A. Recheck migrations; V31 is the baseline, next expected V32.
3. Add verified provider organizations and membership resolution, preserving practitioner/subject IDs. Do not treat the platform sentinel UUID or pending arbitrary IDs as verified providers.
4. Use reviewed deterministic solo-practice mappings for legacy practitioners; preserve credential history. Validate/backfill pending access organization targets before adding provider FKs or enabling memberships/relationships. No automatic activation.
5. Implement the authorized Provider Management business service against `IdentityProvisioningPort`: resolve/authorize the operator and organization, invite via Keycloak, store the stable subject, and create DB membership/profile/pinned role assignment/relationships. Reuse the existing adapter; add durable retry/reconciliation across identity/DB partial failures. Do not create dynamic realm roles or call Admin APIs from clients.
6. Extend independent clinician/Associate Doctor credential verification and provider evidence/readiness before activation, retaining the now-enforced legacy self-verification guard, expiry job and patient delegation boundary. Define the provider permission/delegation envelope and authoritative resource resolvers before making individual capabilities executable. Prove multi-organization and relationship isolation; never bulk-enable the future catalog.
7. Run focused provider/security/migration tests and update the persistent handoff. Pricing/scheduling follow only under the authorized Phase 2 scope. Journey Management and Coordinator routing remain later phases. Flowable remains a later Phase 4B prerequisite.

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
