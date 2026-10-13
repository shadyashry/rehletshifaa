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

Roles below are **platform** roles granted in the database (Control Center › Access); Keycloak carries no roles.

| Username | Email | Name | Platform roles | What this account is for | Lands on |
|---|---|---|---|---|---|
| `patient` | patient@local.test | Nour Hassan | PATIENT | Signed-in patient view: My Care, proposal, deposit status, messages, documents | My Care (`/en/portal`) |
| `coordinator` | coordinator@local.test | Layla Hassan | COORDINATOR (lead of "Coordination team", manager of `coordinator2`) | Coordination lead: Team queue, take/transfer case ownership, assign consultant, prepare/release proposals, final quotes, Coordination Setup | Staff Portal (`/en/portal`) |
| `coordinator2` | coordinator2@local.test | Omar Nasser | COORDINATOR | Second coordinator — transfer target, "Owned by my team" queue, OPS-1 notification check | Staff Portal |
| `doctor` | doctor@local.test | Ahmed AlAshry | CONSULTANT | Consultant: clinical review + cost estimate, final in-person assessment, procedure consent, treatment / discharge | Staff Portal (consultant work) |
| `doctor-orthopedics` | doctor-orthopedics@local.test | Hossam Kibba | CONSULTANT (orthopedics) | Second Consultant (another care area): receiving end of a referral — transfer or second opinion (QA W-34). **No password in the repo**: activate as below | Staff Portal (consultant work) |
| `operations` | operations@local.test | Mariam Soliman | OPERATIONS | Travel package before release (when travel is requested), travel coordination, arrival | Staff Portal |
| `finance` | finance@local.test | Youssef Adel | FINANCE | Approve manually priced proposals, record deposit payments and refunds (offline, record-only) | Staff Portal |
| `credential-admin` | credential-admin@local.test | Maya Farid | CREDENTIAL_VERIFIER, SYSTEM_ADMINISTRATOR | Control Center: people, teams, access governance, consultants and credential reviews | Control Center (`/en/portal/control-center`) |
| `service-account-staff-identity-admin` | — | — | — | Backend service account (client `staff-identity-admin`). **Not a login.** | — |

Seeded **invited** accounts (no password, no MFA): `patient-identity-reviewer`, `care-manager`, `operations-manager`,
`finance-manager`, `credentialing-manager`, `consultant-operations-manager`, `support-manager`, `support-officer`,
`journey-manager`, `journey-approver`, `compliance-auditor`, `coordinator-scope`, `care-manager-scope` (all `@local.test`),
plus the Consultant login `doctor-orthopedics`. Full role catalogue and boundaries:
[qa-test-protocol.md §2](../qa-test-protocol.md#2-roles--test-accounts).

**Activating an invited account for a walk (no admin chain needed):**

1. Sign in page → **Forgot Password?** → the username (e.g. `patient-identity-reviewer`) → open the reset email in
   Mailpit (https://mail-dev.rehletshifaa.com) → set a password.
2. At the first sign-in Keycloak asks for an authenticator: scan the QR with the owner's authenticator app and save the
   entry in the owner's password manager (name it `RehletShifaa dev — <username>`). Secrets never go into the repo.
3. The portal activates the person on that first sign-in (staff invitations: needs the seeded `SENT` invitation, the
   Keycloak user and the enrolled authenticator — `StaffLifecycleService.activate`).

Alternative: Control Center › People › the person › **Resend invitation** (needs `credential-admin`, whose re-check needs
a passkey — use Chrome, see MFA below). If a setup or reset link says *"already authenticated as different user"*, an
abandoned sign-in is still in that browser: open the link in a private (Incognito) window.

**Keycloak users added to the realm file after a stack was created** reach it on the next
`docker compose … up -d`: the one-shot `keycloak-sync` service partial-imports `infrastructure/keycloak/realm-rehletshifaa.json`
and skips everything that exists (passwords, authenticators and passkeys set during testing survive). Check it with
`docker logs rehletshifaa-keycloak-sync-1` (it prints the added/skipped counts) — QA W-51.

**Second factor per account (MFA-1, W-29).** A normal sign-in is password only; every sensitive action (record a payment,
an identity decision, an invitation, approvals) asks for a fresh sign-in with the second factor ("Sign in again").

| Account | Second factor | Where the secret lives | Reset route |
|---|---|---|---|
| `finance`, `doctor`, `coordinator`, `operations`, invited staff, `doctor-orthopedics` | Authenticator app (TOTP codes), enrolled at first step-up / first sign-in | Owner's authenticator app + password manager | Control Center › People › MFA reset (approved by a second administrator), or Keycloak admin console › Users › Credentials (dev only) |
| `credential-admin` (System Administrator) | **Passkey** (WebAuthn) — administrator changes require phishing-resistant MFA | Owner's device (Windows Hello / security key) | Keycloak admin console › Users › Credentials (dev only) |
| `patient` and activated patients | Authenticator app if asked; patients act mostly through secure links + one-time codes | Owner's app | Account settings, or Keycloak admin console (dev only) |

Passkey registration fails in browsers that block `window.prompt()` (W-40) — including the Claude desktop built-in
browser: register and use the administrator passkey in Chrome.

**Accounts created during testing** (patients who activate, invited provider clinicians / practice managers) set their own
password through the Keycloak email link in Mailpit. Their passwords are never stored in the repo and cannot be looked up.

**Simulating an inbound WhatsApp message on dev (QA W-31).** The local stack sends WhatsApp to Mailpit and has no Meta
webhook. To make "someone text the business number" (an intake conversation for a new number, or a message in the case
thread of a number with an open case), call the dev-only endpoint from this machine — it is not reachable through the
tunnel:

```bash
curl -s -X POST http://localhost:8080/dev/whatsapp/inbound -H "Content-Type: application/json" -d '{"from":"+254799000031","name":"QA Sender","text":"Hello, I need a knee consultation"}'
```

The scheduled inbound processor files it within ~5 s; Conversations (coordinator) shows it. Synthetic numbers only.

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

## 4. Control Center and admin URLs

Base: `https://dev.rehletshifaa.com/en/portal/control-center`. Each page is gated by a platform permission; a "no access"
page is the role gate, not a fault. `credential-admin` (SYSTEM_ADMINISTRATOR + CREDENTIAL_VERIFIER) reaches the workforce,
access and consultant pages; commercial pages need FINANCE_MANAGER, coordination setup CARE_COORDINATION_MANAGER, Care
Journeys the journey roles.

| Area | Path |
|---|---|
| Home | `/` |
| People, teams, staffing requests, ownership | `/people` · `/teams` · `/staffing-requests` · `/ownership` |
| Administrators, service accounts, recertification, audit | `/administrators` · `/service-accounts` · `/recertification` · `/audit` |
| Workforce identity reviews, account support | `/workforce-identity-reviews` · `/account-support` |
| Consultants (directory, new, detail incl. credentials) | `/consultants` · `/consultants/new` · `/consultants/{id}` |
| Patient identity checks | `/identity-checks` |
| Commercial: price lists, exchange rates, margin & deposit | `/commercial` · `/commercial/prices` · `/commercial/exchange-rates` · `/commercial/margin-deposit` |
| Care coordination setup (routing, intake, conversation settings) | `/coordination` |
| Care Journeys (production intake is OFF) | `/journeys` · `/journeys/{definitionId}` · `/journeys/{definitionId}/versions/{versionId}` |
| Consultant virtual clinic (consultant, practice managers) | `https://dev.rehletshifaa.com/en/portal/virtual-clinic` |

## 5. Public pages

`/en` · `/en/care-areas` · `/en/cardiology` · `/en/orthopedics` · `/en/rheumatology-rehabilitation` · `/en/consultants` ·
`/en/consultants/{slug}` · `/en/how-it-works` · `/en/send-my-case` · `/en/track-case` · legal pages `/en/{legal}`
