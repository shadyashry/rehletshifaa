# Practice Manager consent live rehearsal — 2026-10-04

## Scope and environment

- Ran against the named-tunnel development stack at `dev.rehletshifaa.com`, `api-dev.rehletshifaa.com` and
  `auth-dev.rehletshifaa.com`, with the real PostgreSQL, Keycloak and Mailpit services.
- Used a uniquely generated Practice Manager identity. The invited person completed email/password setup, TOTP
  enrolment and verified-email profile completion through real Keycloak required actions.
- The seeded Consultant's temporary rehearsal TOTP was removed after the run. No password, OTP seed, invitation
  token or access token is retained in this record.

## Journey exercised

The gated Playwright rehearsal `frontend/e2e/practice-manager-consent-live.spec.ts` completed:

1. Consultant sign-in with MFA and creation of a `SCHEDULE`-only Practice Manager invitation.
2. Delivery of the Keycloak setup email and application invitation email to the real local mail sink.
3. Invitation-first sign-in by the exact verified email at ACR 2 and explicit acceptance.
4. Database-owned `PRACTICE_MANAGER` scope for the named clinic only, plus HTTP 403 for an unrelated case.
5. A requested widening from `SCHEDULE` to `SCHEDULE + PROFILE`, proving the existing permissions remained in
   force until the manager accepted the new consent.
6. Renewed consent at ACR 2 and the widened permissions becoming effective only afterwards.
7. Consultant revocation and immediate denial of the manager's still-valid access token.

## Retained results

- Playwright Chromium: **1 passed** in 40 seconds (test body 39.1 seconds).
- PostgreSQL evidence for the successful delegation:
  - initial invitation: `ACCEPTED`, identity `READY`, `SCHEDULE`, accepted ACR `2`;
  - permission-change invitation: `ACCEPTED`, identity `READY`, `SCHEDULE + PROFILE`, accepted ACR `2`;
  - final delegation: `REVOKED`, with no service permission;
  - immutable history: `ACCEPTED → PERMISSIONS_ACCEPTED → REVOKED`.
- Both successful invitation notifications were `DELIVERED` on their first attempt. All 14 retained Practice
  Manager invitation outbox rows in this development database were delivered.
- Full backend suite: **542 tests, 0 failures, 0 errors, 1 intentional skip**; all 65 migrations applied.
- Focused frontend invitation suite: **3 passed**; frontend typecheck and production Docker build passed.
- The full frontend unit run had **263 passed and 11 failed**. All failures were the unrelated `ProposalSign` test
  fixtures whose hard-coded October 1–2, 2026 quote dates are expired on the October 4, 2026 test clock; the changed
  Practice Manager and authentication coverage passed.

## Defects found and corrected

### Direct invitation after Consultant creation

A Consultant created after migration V53 could be returned by `GET /clinics/mine`, but a direct invitation call
could fail its `virtual_clinics` foreign key unless the clinic-detail UI had first caused the row to be created.
`PracticeManagerDelegationService` now idempotently establishes the Consultant's virtual-clinic row after the
existing `CLINIC_APPROVE` authorization check. This removes the accidental UI-order dependency without changing
authority, schema or API contracts. An integration test covers the direct-API path.

### Pre-acceptance MFA strength

The invitation page asked the shared sign-in helper for generic reauthentication while the invitee had no `/me`
record yet. The fail-closed default correctly selected ACR 3, but that is the owner/System Administrator
phishing-resistant level and sent an ordinary Practice Manager to WebAuthn enrollment. The Practice Manager policy
and backend acceptance check require MFA at ACR 2. The shared helper now accepts an explicit required level, and
only the Practice Manager consent page supplies `2`; the default for unknown access remains ACR 3. Unit and live
tests prove the boundary.

## Evidence boundary

This closes the real Keycloak, email, named-tunnel, consent-renewal, scope-isolation and stale-token-revocation gate
for Practice Managers. It does not claim the separate OPS-03 backup/data/document restore drill, external
notification-provider evidence, no-waiver quarterly owner-recovery exercise or independent threat/penetration
review.
