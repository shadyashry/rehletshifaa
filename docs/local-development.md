# Local development

Run the complete environment from the repository root:

```bash
docker compose up --build
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

The local Compose file supplies development-only `CLAIM_TOKEN_PEPPER`, `PII_ENCRYPTION_KEY`, and `APP_WEB_BASE_URL` values. Production must use distinct random secrets and the public HTTPS web origin.

The realm file is imported only into a new Keycloak data volume. To re-import changed seed data, remove only the named Compose development volumes after confirming no local data must be retained.
