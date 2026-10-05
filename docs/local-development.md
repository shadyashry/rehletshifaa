# Local development

Run the complete environment from the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Services:

- Web and portals: `http://localhost:3000/en` and `/ar`
- API/OpenAPI: `http://localhost:8080/swagger-ui.html`
- Keycloak: `http://localhost:8180`
- Mailpit: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

Seeded local users:

| Role | Username | Password |
|---|---|---|
| Patient | `patient` | `Patient123!` |
| Coordinator lead | `coordinator` | `Coordinator123!` |
| Verified doctor | `doctor` | `Doctor123!` |
| Operations | `operations` | `Operations123!` |
| Finance | `finance` | `Finance123!` |
| Credentialing/system admin | `credential-admin` | `Admin123!` |

The local profile routes simulated WhatsApp messages to Mailpit at `patient@local.test`. This lets developers open the status or proposal link and retrieve its on-demand OTP without a real provider. The adapter is profile-restricted and cannot start in production.

## Governed platform-control-plane test identities

The local realm also contains passwordless, development-only identities for `journey-manager`, `journey-approver`,
`compliance-auditor`, `support-officer`, `patient-identity-reviewer`, `operations-manager`, `finance-manager`,
`credentialing-manager`, `support-manager`, `care-manager`, `consultant-operations-manager`, `coordinator-scope`,
and `care-manager-scope`. Their matching workforce records are `INVITED`; their role assignments remain ineffective
until the real holder activation and MFA checks complete. The two Journey identities are deliberately distinct,
while `coordinator-scope` and `care-manager-scope` own the second coordination team so the primary manager can be
tested against an out-of-scope team.

No password or MFA evidence is seeded for these accounts. For a local test, an authorized developer sets a unique
temporary password in the local Keycloak administration console, leaves the required password-update and TOTP
actions enabled, then signs in as that identity through `https://dev.rehletshifaa.com`. The first successful sign-in
must complete those required actions; `/api/v1/me/activation` then performs the normal server-side identity, enabled
state and MFA checks before workforce authority becomes effective. Never copy the temporary password, recovery
codes, OTP seed, session cookie or token into source, documentation, commands, screenshots or test output.

The local Compose file supplies development-only `CLAIM_TOKEN_PEPPER`, `PII_ENCRYPTION_KEY`, and `APP_WEB_BASE_URL` values. Production must use distinct random secrets and the public HTTPS web origin.

The realm file is imported only into a new Keycloak data volume. To re-import changed seed data, remove only the named Compose development volumes after confirming no local data must be retained.

The branded `rehletshifaa` login theme is bind-mounted from `infrastructure/keycloak/themes` with theme caching disabled, so CSS/logo edits appear on reload. Realm settings such as `loginTheme` are seeded on first import only; on an already-persisted `keycloak-data` volume, activate the theme once (idempotent, non-destructive — it never deletes the volume):

```bash
bash infrastructure/keycloak/apply-theme.sh
```
