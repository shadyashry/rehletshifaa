# RehletShifaa dev — test accounts and end-to-end journey

Environment: local Docker stack behind the named Cloudflare tunnel (`rehletshifaa-dev`). Synthetic data only — never enter real
patient or provider data. Arabic: replace `/en/` with `/ar/` in any page URL.

> **Passwords are not copied into this document.** Each seeded account's password is defined in
> `infrastructure/keycloak/realm-rehletshifaa.json` → `users[]` → the entry with that `username` → `credentials[0].value`.
> Admin-tool passwords are in your local `.env` (variable names below). Keep both out of chat, tickets and screenshots.

## 1. Environment URLs

| What | URL |
|---|---|
| Public site (EN / AR) | https://dev.rehletshifaa.com/en · https://dev.rehletshifaa.com/ar |
| **Sign in (all staff, clinicians and patients)** | https://dev.rehletshifaa.com/en/portal → redirects to Keycloak |
| Keycloak login realm | https://auth-dev.rehletshifaa.com/realms/rehletshifaa/account |
| Keycloak admin console | https://auth-dev.rehletshifaa.com/admin/ — user `KC_BOOTSTRAP_ADMIN_USERNAME`, password `KC_BOOTSTRAP_ADMIN_PASSWORD` (`.env` / `docker-compose.yml`) |
| Backend API (via gateway) | https://api-dev.rehletshifaa.com/api/v1 · health: https://api-dev.rehletshifaa.com/actuator/health |
| **Mailpit — every email, secure link and one-time code** | https://mail-dev.rehletshifaa.com |
| Files (MinIO S3) | https://files-dev.rehletshifaa.com (console locally on http://localhost:9001, `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`) |

In dev, WhatsApp messages are simulated and delivered to Mailpit (to `patient@local.test`), so every status link, proposal link,
activation link and OTP is read from Mailpit.

## 2. Seeded accounts (Keycloak realm `rehletshifaa`)

All sign in at **https://dev.rehletshifaa.com/en/portal**. Username or email both work.

| Username | Email | Name | Realm roles | What this account is for | Lands on |
|---|---|---|---|---|---|
| `patient` | patient@local.test | Nour Hassan | PATIENT | Signed-in patient view: My Care, proposal, deposit status, messages, documents | My Care (`/en/portal`) |
| `coordinator` | coordinator@local.test | Layla Hassan | COORDINATOR, COORDINATOR_LEAD | Coordination lead: Team queue, take/transfer case ownership, assign consultant, prepare/release proposals, final quotes, Coordination Setup | Staff Portal (`/en/portal`) |
| `coordinator2` | coordinator2@local.test | Omar Nasser | COORDINATOR | Second coordinator — transfer target, "Owned by my team" queue, OPS-1 notification check | Staff Portal |
| `doctor` | doctor@local.test | Ahmed AlAshry | DOCTOR | Consultant: clinical review + cost estimate, final in-person assessment, procedure consent, treatment / discharge | Staff Portal (consultant work) |
| `operations` | operations@local.test | Mariam Soliman | OPERATIONS | Travel package before release (when travel is requested), travel coordination, arrival | Staff Portal |
| `finance` | finance@local.test | Youssef Adel | FINANCE | Approve manually priced proposals, record deposit payments and refunds (offline, record-only) | Staff Portal |
| `credential-admin` | credential-admin@local.test | Maya Farid | CREDENTIALING_ADMIN, SYSTEM_ADMIN | Control Center: providers, clinicians, credential reviews, commercial setup, Care Journeys, access governance | Control Center (`/en/portal/control-center`) |
| `service-account-staff-identity-admin` | — | — | — | Backend service account (client `staff-identity-admin`). **Not a login.** | — |

Other roles that exist in the realm but have no seeded user: PATIENT_REPRESENTATIVE, OPERATIONS_LEAD, FINANCE_LEAD, AUDITOR,
PATIENT_IDENTITY_REVIEWER. Assign them in the Keycloak admin console (or via Control Center › Access) to a test user if needed.

**Accounts created during testing** (patients who activate, invited provider clinicians / practice managers) set their own
password through the Keycloak email link in Mailpit. Their passwords are never stored in the repo and cannot be looked up.

End-to-end specs read the same seeded passwords from environment variables: `PORTAL_TEST_PASSWORD`, `DOCTOR_TEST_PASSWORD`,
`OPERATIONS_TEST_PASSWORD`, `FINANCE_TEST_PASSWORD` (see `AGENTS.md` §5).

## 3. End-to-end journey — who does what, where

| # | Step | Actor | URL |
|---|---|---|---|
| 1 | Submit a case (no login) | Patient | https://dev.rehletshifaa.com/en/send-my-case |
| 2 | Open the status link + OTP from Mailpit; answer information requests | Patient | https://mail-dev.rehletshifaa.com → `/en/status/{token}` (or look up at https://dev.rehletshifaa.com/en/track-case) |
| 3 | Take the case from the Team queue (or it is routed); review intake; request information if needed | `coordinator` | https://dev.rehletshifaa.com/en/portal |
| 4 | Assign a consultant | `coordinator` | Staff Portal › case |
| 5 | Clinical review + recommended services / cost estimate | `doctor` | https://dev.rehletshifaa.com/en/portal |
| 6 | Prepare the **preliminary care estimate** | `coordinator` | Staff Portal › case › Proposal |
| 7 | Travel package before release (only if travel requested) | `operations` | Staff Portal › case |
| 8 | Approve manually priced services (only if required) | `finance` | Staff Portal › case |
| 9 | Release the estimate (link sent to the patient) | `coordinator` | Staff Portal › case |
| 10 | Open the proposal link + OTP from Mailpit; read the deposit/refund/cancellation terms; **acknowledge** | Patient | Mailpit → `/en/proposal/{token}` |
| 11 | Open the activation link; complete profile; accept agreements (deposit terms shown above the checkbox) | Patient | Mailpit → `/en/activate/{token}` |
| 12 | Create a password from the Keycloak account-setup email | Patient | Mailpit → Keycloak link |
| 13 | Record the coordination deposit payment (offline) | `finance` | Staff Portal › case › Coordination deposit & payments |
| 14 | Travel coordination → arrival confirmed | `operations` / `coordinator` | Staff Portal › case |
| 15 | Final in-person assessment | `doctor` | Staff Portal › case |
| 16 | Create + release the **final treatment plan and quote** | `coordinator` | Staff Portal › case |
| 17 | Open the final quote link + OTP; **accept** | Patient | Mailpit → `/en/proposal/{token}` |
| 18 | Procedure consent evidence → treatment → discharge → follow-up | `doctor` | Staff Portal › case |
| 19 | Follow the case signed in | Patient | https://dev.rehletshifaa.com/en/portal (My Care) |
| 20 | Transfer case ownership; check the new owner's bell and work email | `coordinator` → `coordinator2` | Staff Portal › case › Transfer ownership · Mailpit |

Which gates apply (operations, finance, deposit, consent) depends on the case: see `docs/end-to-end-workflows.md`.

## 4. Control Center and admin URLs (`credential-admin` unless noted)

Base: `https://dev.rehletshifaa.com/en/portal/control-center`

| Area | Path |
|---|---|
| Home | `/` |
| Providers (organizations) · new onboarding | `/providers` · `/providers/onboarding/new` · `/providers/{id}` |
| Clinicians (directory, direct, setup) | `/providers/clinicians` · `/providers/clinicians/new` · `/providers/clinicians/direct/{id}` · `/providers/clinicians/{orgId}/{practitionerId}/setup` |
| Organization team | `/providers/{id}/consultants` · `/associate-doctors` · `/assistants` · `/practice-managers` |
| Credential reviews | `/credentials` · `/credentials/{organizationId}/{revisionId}` |
| Identity checks | `/identity-checks` |
| Commercial: price lists, availability, exchange rates, margin & deposit | `/commercial` · `/commercial/prices` · `/commercial/pricing` · `/commercial/availability` · `/commercial/exchange-rates` · `/commercial/margin-deposit` |
| Care coordination setup | `/coordination` · `/coordination/{orgId}` |
| Care Journeys (production intake is OFF) | `/journeys` · `/journeys/{definitionId}` · `/journeys/{definitionId}/versions/{versionId}` |
| Access governance | `/access` · `/access/users` · `/access/roles` · `/access/permissions` · `/access/effective` · `/access/audit` |
| Team | `/team` |
| Provider Workspace (invited practice members) | `https://dev.rehletshifaa.com/en/portal/practice` |

Some pages are gated by role or capability (for example margin/deposit policies need a finance lead role; prices and schedules
are managed by the clinician's Practice Manager). If a page says you have no access, that is the role gate, not a fault.

## 5. Public pages

`/en` · `/en/care-areas` · `/en/cardiology` · `/en/orthopedics` · `/en/rheumatology-rehabilitation` · `/en/consultants` ·
`/en/consultants/{slug}` · `/en/how-it-works` · `/en/send-my-case` · `/en/track-case` · legal pages `/en/{legal}`
