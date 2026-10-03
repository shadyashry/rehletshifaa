# Owner governance production-equivalent rehearsal — 2026-10-04

## Scope and isolation

- Ran in a fresh, isolated Docker Compose project, `rehletshifaa-osa-20261004-r3`, with new PostgreSQL,
  Keycloak and supporting-service volumes. No production or shared development authority was changed.
- Used the project Keycloak 26.7.3 realm and four synthetic identities. Each identity completed real TOTP and
  virtual WebAuthn enrollment; privileged requests used fresh LoA 3 authorization-code tokens.
- The backend image was rebuilt from the current worktree after the PostgreSQL compatibility correction described
  below. The existing frontend image was used because the new Playwright file is the test driver, not application
  runtime code.
- Governance notifications were routed to a local monitored Mailpit destination. No credential, OTP seed, passkey
  material or token is retained in this record.

## Journey exercised

The focused Playwright rehearsal `frontend/e2e/owner-governance-rehearsal-live.spec.ts` completed all of the
following through application APIs and deployment-only commands:

1. One-shot clean-install commissioning for exactly one Platform Account Owner and two distinct System
   Administrators, followed by exact-subject participant acceptance.
2. Owner workspace and no-store response validation, plus database-owned System Administrator resolution.
3. Maker/checker removal of the backup administrator, immediate denial of that administrator's privileged API,
   and governed reappointment approved by the owner.
4. OD-02 unavailable-owner recovery initiated by Administrator A, independently confirmed by Administrator B,
   verified by the deployment/security operator with a recorded rehearsal waiver, accepted by the exact successor,
   and completed by the operator.
5. Immediate denial of the former owner's still-valid token after recovery.
6. Normal three-party transfer back: current owner initiates, incoming owner accepts, independent administrator
   verifies. The temporary owner's still-valid token is then denied.
7. Durable governance notification delivery and final database invariants.

## Retained results

- Playwright Chromium: **1 passed** in 3.9 minutes (test body 3.7 minutes).
- Final database state:
  - active current-owner relationships: **1**;
  - effective System Administrators: **2**;
  - commissioning records: **1 COMPLETED**;
  - unavailable-owner recovery records: **1 COMPLETED**;
  - normal owner-transfer records: **1 COMPLETED**;
  - delivered governance notifications: **13**.
- The test's `finally` path restored the backend to its normal rehearsal configuration after deployment-command
  restarts.

## Defect found and corrected

The first PostgreSQL appointment replay exposed a database-driver defect that H2 did not reproduce. Indefinite
assignment overlap/conflict queries used a nullable JDBC parameter in `(? IS NULL OR ...)`; PostgreSQL could not
infer that null parameter's type and returned HTTP 500 during an administrator appointment with no end date.

The smallest correction branches the query when `effectiveTo` is null, removing the untyped null placeholder. The
same correction was applied to the shared workforce role overlap/conflict store because it used the identical SQL
shape. Policy, tables, API contracts and authorization architecture are unchanged.

Focused regression verification after the correction:

- `PlatformAccessGovernanceIntegrationTest`
- `WorkforceRoleAssignmentIntegrationTest`
- all 65 H2 migrations applied; focused Maven command passed.

## Evidence boundary

This closes the isolated production-equivalent commissioning, administrator replacement, normal transfer,
unavailable-owner recovery, immediate stale-token revocation and local notification-delivery rehearsal. It does not
claim the separate full backup/data/document restore drill, a no-waiver quarterly recovery exercise, external
notification-provider evidence, or independent penetration testing.
