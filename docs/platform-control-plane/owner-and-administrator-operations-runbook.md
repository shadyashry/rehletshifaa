# Owner and System Administrator Operations Runbook

**Applies to:** `owner-and-system-administrator-target-architecture.md` (OSA-1–OSA-8)  
**Evidence owner:** Security and Platform Operations  
**Rule:** Never edit owner/administrator rows manually and never grant these business authorities in Keycloak.

Every execution uses named human identities, an approved change/incident reference, phishing-resistant
authentication where requested, and retained database audit/outbox evidence. Passwords, passkey material, OTP seeds,
private keys and tunnel credentials never enter tickets, manifests or command output.

## Common controls

- Accountable roles are the Platform Account Owner, two independent System Administrators, Security/Deployment
  Operator, and Incident Commander for recovery.
- Use the stable environment endpoints and two-file Docker command in `AGENTS.md` for local/dev. Production uses the
  approved deployment secret manager and change pipeline.
- Configure monitored distribution addresses in `GOVERNANCE_NOTIFICATION_EMAILS` and validate delivery before
  release.
- Commissioning/recovery commands are one-shot application properties. Supply them through the deployment secret
  manager to one instance, retain redacted output, then remove them.
- Retain the manifest hash, request id/revision, actor subjects, audit/outbox evidence, token-free `/api/v1/me`
  results and test results with the approved change/incident.
- Abort on identity ambiguity, unavailable identity evidence, missing passkey, stale revision, actor overlap,
  unexpected existing authority, audit/outbox failure, or any request to bypass the application with SQL.

## 1. Commission a clean installation

**Accountable:** Deployment Operator executes; approved owner and two administrator nominees accept.  
**Prerequisites:** incomplete bootstrap; three distinct enabled Keycloak subjects with passkeys; administrator
names/work emails/locales and owner authority verified out of band; approved commissioning record.

1. Run with `app.access.commissioning.action=validate`, supplying operator, idempotency key, owner subject, exactly
   two administrator subjects/names/emails/locales, and reason under `app.access.commissioning.*`.
2. Retain the manifest hash and resolve every failed check without weakening it.
3. Repeat with action `start` and identical inputs/key; record the commissioning id.
4. Send each participant `/{locale}/portal/governance/commissioning` by the approved out-of-band channel. The URL
   contains no acceptance token or authority assertion.
5. Each exact participant signs in with a recent passkey, reviews the responsibility and accepts with a reason.
6. The final acceptance atomically creates one owner and two non-expiring administrators. Before it, none is
   effective.

Expected audit: commissioning started, three participant acceptances, governance bootstrapped and commissioning
completed. Expected notification: commissioning completed. Before completion, cancel using the same deployment
boundary and a reason. After completion there is no reopen/rollback; use normal administrator change or transfer.

## 2. Close and verify commissioning

**Accountable:** Deployment Operator and Security Reviewer.  
**Prerequisite:** status `COMPLETED`.

Run the one-shot `status` action; retain only redacted status/hash. Remove commissioning properties and protected
runtime manifest copies. Remove/disable the temporary Keycloak bootstrap administrator. Independently sign in as all
three participants: `/api/v1/me` must show `OWNER` only to the owner and `SYSTEM_ADMINISTRATOR` only to both admins.
Verify the owner cannot open an unassigned case or mutate workforce/payment/clinical data, and verify notification
delivery. Abort release on extra authority, replay with changed inputs, or dead-lettered notification.

## 3. Appoint, replace or remove a System Administrator

**Accountable:** maker System Administrator; checker is a different administrator or current owner.  
**Prerequisites:** active workforce target, enabled sign-in and live identity, recorded/live passkey, compatible
roles, recent checker passkey.

Maker uses **Control Center → Administrators** to request APPOINT/REMOVE with dates and reason. Checker reviews target,
requester, expiry and eligibility and approves/rejects. For replacement, approve incoming before removing outgoing.
Verify immutable `approver_type`, dates, `/api/v1/me`, stale-token denial, and the below-two warning. Expected
notification/audit: requested plus approved/rejected. Abort self-action, actor overlap, conflict, ineligible target or
any schedule reaching zero administrators. Create a new request instead of editing an expired/decided one.

## 4. Transfer Platform Account Ownership

**Accountable:** current owner initiates; successor accepts; independent administrator verifies.  
**Prerequisites:** three distinct actors; enabled successor with passkey; recent owner passkey.

Owner uses **Owner workspace → Governance** to start transfer. The exact successor accepts, then an administrator
distinct from both verifies. Verify exactly one active owner pointer, ended history, immediate old-owner revocation
and new-owner access. Expected notifications/audit: initiated, accepted and completed. Before completion allow an
invalid request to expire; afterward reverse only by a new normal transfer.

## 5. Recover ownership when the owner is unavailable

**Accountable:** Administrator A initiates; Administrator B confirms; independent Security/Deployment Operator
verifies; successor accepts.  
**Prerequisites:** declared incident, owner genuinely unavailable, two effective administrators, successor enabled
with passkey, sealed organizational evidence reference, ordinary transfer unavailable.

1. A creates `/api/v1/admin/platform-access/owner-recoveries` with successor, reason, incident and evidence refs.
2. B confirms the exact request with an independent reason and recent passkey.
3. Operator runs one-shot recovery action `verify` with enabled flag, id/revision, named operator, reason and evidence
   reference. Cooling-off waiver defaults false and is permitted only under the approved emergency clause.
4. The exact successor accepts. Normal 24-hour cooling-off begins.
5. The scheduler completes when due, or the operator runs `complete` after cooling-off. Verify the normal serialized
   owner transition and immediate revocation.

Abort on fewer than two admins, actor overlap, unverifiable evidence, identity change or expiry. Never reduce quorum;
restore identity infrastructure/a second admin first. Retain every evidence row, waiver, audit and delivery result.

## 6. Recover the identity platform without creating business authority

**Accountable:** two sealed-credential custodians and Incident Commander.  
**Prerequisites:** declared Keycloak outage/lockout and approved window.

Retrieve the sealed Keycloak recovery administrator under dual custody and record only vault references. Restore
authentication, signing keys, clients and credentials—not application roles. Run identity reconciliation with a new
restore id; keep the restore gate closed until zero discrepancies and pending disable/logout work completes. Test
owner/admin authentication, make any authority change through application workflows, remove the temporary recovery
administrator, rotate/reseal credentials. Abort on issuer/audience/presenter drift or unresolved reconciliation.

## 7. Retrieve, use and rotate sealed Keycloak credentials

**Accountable:** two custodians; Security Officer reviews.  
**Prerequisite:** approved drill/incident and dual-authorized vault policy.

Retrieve inside the approved session, record vault references (never values), perform only the minimum identity
operation, terminate sessions, rotate immediately, reseal under split custody and prove the old credential fails.
Unexpected retrieval is a security incident and triggers governance notification.

## 8. Disable a privileged identity or reset MFA

**Accountable:** Support verifies caller; independent admin approves reset; admin performs lifecycle changes.  
**Prerequisites:** verification checklist/reason and another effective administrator.

Use existing Support/MFA-reset and People screens. Database lifecycle/access changes first, so authority ends
immediately; durable Keycloak disable/logout/reset follows. Confirm last-admin protection, stale-token denial, audit
and notification. Abort self-action or zero-admin results. Restore only through normal lifecycle and never reopen
completed offboarding.

## 9. Validate notifications and resolve dead letters

**Accountable:** Platform Operations; Security receives alerts.  
**Prerequisites:** monitored destinations and healthy provider.

Perform a governed non-destructive test in production-equivalent infrastructure. Locate its `governance-event`
outbox row, confirm minimal content/delivery and retain provider reference. Alert on missing destinations,
`RETRY` or `DEAD_LETTER`. Delivery failure does not reverse committed governance; restore the channel and use the
existing retry mechanism. Never include raw evidence.

## 10. Backup, restore and reconcile

**Accountable:** Database, Identity and Storage operators with Security Reviewer.  
**Prerequisites:** approved isolated target and new restore id.

Restore PostgreSQL, Keycloak and protected storage consistently with traffic closed. Validate Flyway, run identity
restore reconciliation, check owner-pointer/admin-count integrity and storage. Verify one owner, a safe admin schedule
(target two), disabled-user denial and no IAM-derived business authority. Release only after zero discrepancies.
Rollback means discard the isolated restore, not edit authority rows.

## 11. Quarterly sealed-recovery exercise

**Accountable:** Security, Platform Operations, owner and two administrators.  
**Prerequisite:** isolated production-equivalent environment with synthetic identities/data.

Exercise identity recovery, unavailable-owner recovery without waiver, notification delivery, stale-token revocation
and restore reconciliation. Time stages, record deviations and rotate used sealed credentials. Never perform an
unnecessary production ownership recovery. Failed objectives become tracked control defects.

## 12. Quarterly privileged-access and recovery review

**Accountable:** current owner and Compliance/Audit reviewer.  
**Prerequisites:** completed recertification campaign and audit/outbox reports.

Review the one active owner, all active/scheduled admins, passkey posture, pending/expired requests,
recertification, recovery evidence/waivers, notification failures, reconciliation discrepancies and last drill. Use
maker/checker or normal transfer to correct findings. Retain reviewer, period, findings and evidence; never delete
relationship, decision, recovery or audit history.
