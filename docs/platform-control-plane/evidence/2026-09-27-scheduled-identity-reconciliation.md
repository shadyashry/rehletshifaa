# Scheduled identity reconciliation and alert review — 2026-09-27

Environment: local development stack served through the named `rehletshifaa-dev` tunnel after V63 applied. The
configured daily job was temporarily accelerated to a 15-second cron solely to capture scheduler-originated
evidence, then the backend was recreated without the override so the normal `02:20` daily cron was restored.

Retained run:

- Run id: `d1bdfef9-e945-4ad1-9518-79170721ef94`
- Trigger/requester: `SCHEDULED` / `SYSTEM`
- Reason: `Daily database-to-identity reconciliation`
- Started/completed: `2026-09-27T12:44:29.998164Z` / `2026-09-27T12:44:30.390233Z`
- Result: `DISCREPANCIES`; 7 workforce identities checked; 4 discrepancies

Alert review confirmed all four findings were the expected local seeded identities without an MFA credential:

- `00000000-0000-0000-0000-000000000102`
- `06d5980a-76fe-4e34-9900-89aef8a9d87a`
- `00000000-0000-0000-0000-000000000104`
- `00000000-0000-0000-0000-000000000105`

Every finding was `MFA_NOT_ENROLLED` with database state `ACTIVE` and identity state `NO_MFA_CREDENTIAL`. There was
no `IDENTITY_NOT_FOUND`, lifecycle mismatch, phishing-resistant administrator mismatch, or
`ZERO_EFFECTIVE_SYSTEM_ADMINISTRATORS` finding. The observed result matches the earlier manual and post-restore
comparison evidence while proving that the scheduled path executes and produces reviewable discrepancy rows.

The OPS-04 gate implementation is verified offline; a retained live run with `APP_IDENTITY_RESTORE_ID` activated,
a blocked workforce request, and a passing `POST_RESTORE` release remains open.
