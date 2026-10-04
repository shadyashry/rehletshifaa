# OPS-04 live restore-gate release evidence — 2026-09-27

## Scope

This development-stack rehearsal proves that a newly restored deployment blocks database-recognized workforce
sessions until a live database-versus-Keycloak `POST_RESTORE` comparison passes. The follow-up durable replay and
inactive-lifecycle proof is retained in `2026-09-27-ops04-replay-disable.md`.

## Setup

- Canonical tunnel stack: `docker-compose.yml` plus `docker-compose.tunnel.yml`.
- Focused browser journey: `frontend/e2e/restore-gate-live.spec.ts`.
- An isolated development restore operator was created with Keycloak subject
  `154afaa9-382b-4b39-bbe8-5b715c5b7c08`, an active workforce record and a non-expiring
  `SYSTEM_ADMINISTRATOR` assignment.
- The four ordinary seeded workforce identities enrolled OTP. The isolated restore operator enrolled OTP and a
  WebAuthn credential, then obtained a live LoA 3 token. Enrollment and release ran in one browser process because
  the Playwright virtual authenticator's private keys are process-local.

No local password or TOTP secret is retained in source or in this evidence file.

## Observed release sequence

1. A coordinator token successfully called `GET /api/v1/me` before restore activation (`200`).
2. The backend was recreated with unique restore id `live-ops04-1790535569195`.
3. The same coordinator token was rejected by `GET /api/v1/me` with `503` and
   `IDENTITY_RESTORE_RECONCILIATION_REQUIRED`.
4. The LoA 3 restore operator called `POST /api/v1/admin/identity-reconciliation` with `postRestore=true`.
5. Run `8651e80d-60cb-482a-a7ed-41d7c76b9942` completed `PASSED`, checking all eight workforce identities with
   zero discrepancies.
6. The run cleared the restore gate in the same database transaction. The same coordinator token then called
   `GET /api/v1/me` successfully (`200`).
7. The test recreated the backend from the canonical compose files without the temporary restore override.

## Persisted evidence

The singleton `identity_restore_gate` row retained:

- status: `CLEARED`;
- restore id: `live-ops04-1790535569195`;
- activated at: `2026-09-27 19:00:20.703826+00`;
- cleared at: `2026-09-27 19:00:22.943917+00`;
- cleared by run: `8651e80d-60cb-482a-a7ed-41d7c76b9942`;
- revision: `2`.

The reconciliation run retained:

- trigger: `POST_RESTORE`;
- status: `PASSED`;
- requester: `154afaa9-382b-4b39-bbe8-5b715c5b7c08`;
- checked/discrepancy count: `8 / 0`;
- reason: `Live OPS-04 restore gate release evidence`.

Keycloak reported `password`, `otp` and `webauthn` credentials for the restore operator. The normal backend is up
after the rehearsal and has no `APP_IDENTITY_RESTORE_ID` override.

## Verification

- `pnpm typecheck`: PASS.
- Focused Playwright Chromium journey: **1 PASS** in 1.2 minutes.
- No commit was created.

## Follow-up OPS-04 evidence

The follow-up rehearsal proved that a pending post-restore identity operation was re-applied and that an identity
restored as enabled while its database lifecycle was inactive was disabled before the gate released. Practice
Manager identity remains outside this claim until its consent state machine exists.
