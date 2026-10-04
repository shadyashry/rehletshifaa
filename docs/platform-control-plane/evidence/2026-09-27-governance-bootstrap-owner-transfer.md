# Controlled governance bootstrap and owner-transfer evidence — 2026-09-27

Environment: disposable local development stack served through the named `rehletshifaa-dev` tunnel. No production
identity or credential was used. Passwords and OTP secrets are intentionally not retained.

## Identity evidence

Three distinct enabled Keycloak identities completed the cumulative browser flow. Each retained `password`, `otp`
(`Governance bootstrap evidence`) and `webauthn` (`Passkey (Default Label)`) credentials after the run:

| Purpose | Username | Subject |
|---|---|---|
| Initial Platform Account Owner | `governance-owner-evidence` | `edc0fc92-dc57-4f32-9d20-cd16a3679b66` |
| Initial System Administrator / incoming owner | `governance-admin-primary-evidence` | `df1cd1b7-73c8-4a82-bea2-31f7de814f25` |
| Initial System Administrator / independent verifier | `governance-admin-backup-evidence` | `44e72b5a-ede0-4313-a7ed-cff72bcbd595` |

The two administrator subjects were active workforce people before bootstrap. The Playwright browser used a
user-verified CTAP2 virtual authenticator, so Keycloak executed its real WebAuthn registration and authentication
protocol while the private keys remained browser-local.

## One-shot bootstrap evidence

- `platform_governance_bootstrap.id=1` completed at `2026-09-27T12:30:35.626182Z`.
- Owner: `edc0fc92-dc57-4f32-9d20-cd16a3679b66`.
- Exactly two configured initial administrators: `44e72b5a-ede0-4313-a7ed-cff72bcbd595` and
  `df1cd1b7-73c8-4a82-bea2-31f7de814f25`.
- Both received active, non-expiring `SYSTEM_ADMINISTRATOR` assignments with `assigned_by=DEPLOYMENT` and reason
  `Controlled initial governance handover`.
- The governance audit recorded `PLATFORM_GOVERNANCE_BOOTSTRAPPED / SUCCESS` at
  `2026-09-27T12:30:35.643756Z`, including `initial administrators=2; credential evidence verified`.

## Ordinary owner-transfer evidence

Transfer `081b4bac-4688-435a-9bc6-65a47b5e4bc9` followed the ordinary three-party path at live LoA 3:

1. The bootstrap owner initiated the transfer to the primary administrator at
   `2026-09-27T12:30:39.998305Z`.
2. The named incoming owner accepted at `2026-09-27T12:30:40.392125Z`; the acceptance row records
   `phishing_resistant_authentication=true`.
3. The backup administrator, distinct from both owners, verified at `2026-09-27T12:30:40.766726Z`.
4. The request finished `COMPLETED`, revision `2`, and the current-owner pointer now resolves to
   `df1cd1b7-73c8-4a82-bea2-31f7de814f25`.

The audit stream contains `SUCCESS` entries for `PLATFORM_OWNER_TRANSFER_INITIATED`,
`PLATFORM_OWNER_TRANSFER_ACCEPTED`, and `PLATFORM_OWNER_TRANSFER_COMPLETED`, with the expected actor for each step.

## Verification

- `frontend/e2e/governance-bootstrap-live.spec.ts`: **1 passed** in 1.3 minutes against the stable tunnel URLs.
- Frontend `pnpm typecheck`: **PASS**.
- Focused offline backend gate: **13 passed** — `PlatformGovernanceBootstrapIntegrationTest` (2),
  `PlatformOwnerTransferIntegrationTest` (3), `AuthorityIntegrationTest` (5), and `KeycloakRealmContractTest` (3).
- After the test removed its temporary bootstrap override, the normal backend, Keycloak, PostgreSQL and API gateway
  were running; the gateway and PostgreSQL were healthy.

The scheduler-originated reconciliation and alert review are retained separately in
`2026-09-27-scheduled-identity-reconciliation.md`. The OPS-04 gate is implemented and green offline; its live
activated-block/passing-release drill remains open. Practice Manager identity remains unclaimed until its consent
state machine exists.
