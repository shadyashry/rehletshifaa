# OPS-04 durable replay and inactive-identity disable evidence — 2026-09-27

## Scope

This development-stack rehearsal completes the identity-specific OPS-04 proof left open by the initial live release
drill. It demonstrates that a restored pending identity operation is re-applied, that an identity whose database
lifecycle is inactive is disabled in Keycloak, and that reconciliation cannot release workforce access before that
correction finishes.

## Isolated fixtures

- LoA 3 restore operator: Keycloak/workforce subject `3d11d890-9487-4102-936b-000f13f7fd13` with a non-expiring
  `SYSTEM_ADMINISTRATOR` assignment. It enrolled OTP and WebAuthn in the focused browser process.
- Lifecycle-mismatch identity: subject `045dbff9-9baf-4ea9-a9cc-d2cb20013308`, database lifecycle
  `SIGNIN_DISABLED`, `access_subjects.active=false`, but initially enabled in Keycloak.
- Restored durable operation: `c54df5e1-9769-4ce0-8373-a5c797d9c31d`, type
  `DISABLE_USER_AND_LOGOUT`, targeting the lifecycle-mismatch identity.

The operation started `PENDING` and was deliberately not due while the first comparison ran. No local password or
OTP secret is retained in source or in this evidence file.

## Observed sequence

1. Backend restore id `live-ops04-replay-1790535900327` activated the singleton gate while the identity worker's
   initial dispatch was paused.
2. A normal `/me` request by the restore operator received the restore-gate `503`.
3. `POST_RESTORE` run `5e838923-7216-413e-95ec-f5e67d70aac4` checked all ten workforce identities and retained one
   `DATABASE_INACTIVE_IDENTITY_ENABLED` discrepancy for the `SIGNIN_DISABLED` fixture. The gate remained blocked.
4. The restored operation was made due and the backend was recreated with the same restore id and normal worker
   timing. Reusing the same id did not reset or bypass the blocked gate.
5. Interim comparisons continued to report the same discrepancy while the asynchronous worker was still executing.
6. The worker completed `DISABLE_USER_AND_LOGOUT` on its first attempt at `2026-09-27 19:06:20.227928+00`.
7. Keycloak then reported the target identity as `enabled=false`.
8. Run `7f7bdd7a-4545-4ae7-b553-8f626a4220ac` checked all ten identities, passed with zero discrepancies, and cleared
   the gate at `2026-09-27 19:06:21.08728+00`.
9. The same operator token immediately reached `/me` successfully. The test restored the canonical backend
   configuration without a restore-id override.

## Persisted evidence

The durable operation retained:

- status: `SUCCEEDED`;
- attempts: `1`;
- error: none;
- reason: `Re-apply inactive lifecycle disable after restore`.

The gate retained:

- status: `CLEARED`;
- restore id: `live-ops04-replay-1790535900327`;
- cleared by run: `7f7bdd7a-4545-4ae7-b553-8f626a4220ac`;
- revision: `4`.

## Verification

- `pnpm typecheck`: PASS.
- Focused Playwright Chromium replay/disable journey: **1 PASS** in 1.7 minutes.
- Canonical backend restored and healthy; `APP_IDENTITY_RESTORE_ID` is absent.
- No commit was created.

Together with `2026-09-27-ops04-live-release.md`, this closes the Section 1 live identity evidence for OPS-04.
The wider OPS-03 backup/data/document restore drill remains a separate launch-assurance activity.
