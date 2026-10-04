# Platform Account Owner and System Administrator — Target Architecture

**Status:** Target implementation blueprint  
**Date:** 2026-09-28  
**Scope:** Initial platform commissioning, Platform Account Owner experience, executive analytics, System
Administrator lifecycle, privileged change governance, ownership transfer, emergency recovery, audit and operations  
**Implementation posture:** Additive. Preserve the current authority architecture and existing behavior until each
slice below is implemented, verified and deliberately enabled.

## 0. How to use this document

This document is the implementation authority for future Platform Account Owner and System Administrator work. It
extends the delivered Section 1 control plane; it does not authorize a rewrite of working workforce, identity,
authorization, hierarchy, case-scope or lifecycle code.

For this bounded scope, this document refines earlier statements that described the owner as governance-only. The
target owner is both:

1. the single accountable platform-governance relationship; and
2. an active executive user with owner-specific, read-only business analytics.

Executive analytics does not turn the owner into a System Administrator, Finance Officer, clinician, case worker or
unrestricted data reader. Older statements that say the owner receives no finance visibility should be read in the
target state as: **the owner receives governed executive financial analytics, but no payment mutation authority,
payment credentials or unrestricted transaction-level personal data.**

Normative words (`MUST`, `MUST NOT`, `SHOULD`, `MAY`) describe the target. Current implementation facts are explicitly
labelled as such. Open product decisions are not silently converted into code requirements.

## 1. Executive decision

RehletShifaa will use a three-part privileged-governance model:

```text
Controlled commissioning        Normal in-product governance       Sealed recovery
first owner + first 2 admins  -> owner transfer + maker/checker  -> exceptional dual control
deployment-assisted              ordinary operating path             tested, alerted, audited
```

The architectural decision is:

- Keep the current one-shot bootstrap service as the low-level atomic trust-establishment primitive.
- Place an operator-grade commissioning workflow around it so a greenfield installation does not depend on seeded
  workforce rows, manual SQL or permanently configured environment variables.
- Keep Platform Account Owner as a database relationship, never an ordinary role.
- Add fixed owner capabilities for executive dashboards and narrowly defined governance decisions.
- Keep `SYSTEM_ADMINISTRATOR` outside ordinary invitation and role-selection APIs.
- Use the existing administrator maker/checker mechanism for every post-commissioning appointment or removal.
- Permit either a different effective System Administrator or the current owner to approve an administrator change,
  subject to the same independence, step-up and conflict rules.
- Add an unavailable-owner recovery process that no single administrator, operator or database edit can complete.
- Keep Keycloak responsible for authentication only. Application business authority remains database-owned and is
  recalculated on every protected request.

This is a targeted extension, not a new JobProfile system, configurable IAM engine, tenant model or cloud-IAM role
mapping.

## 2. Goals and non-goals

### 2.1 Goals

1. Commission a completely empty production installation without circular authorization dependencies.
2. Retain explicit evidence that the owner accepted ownership and approved the first administrators.
3. Give the current owner a useful executive workspace covering revenue and every major operating function.
4. Enforce minimum-necessary disclosure, particularly for patient, clinical and payment information.
5. Maintain at least two effective System Administrators without allowing self-appointment or one-person elevation.
6. Make ownership and administrator succession possible during absence, departure or authenticator loss.
7. Preserve immediate revocation despite stale identity-provider tokens.
8. Produce immutable, reviewable audit evidence for every privileged transition.
9. Keep normal operation independent of deployment credentials after commissioning.
10. Deliver the target in independently testable, additive slices.

### 2.2 Non-goals

- No public “claim owner” or “become administrator” page.
- No owner super-role.
- No automatic clinical, case, credential, pricing-mutation, payment-mutation or workforce-administration bypass.
- No business roles in Keycloak, JWT claims, AWS IAM or another external IAM system.
- No shared human administrator accounts.
- No direct database procedure as a supported ownership or administrator lifecycle operation.
- No administrator authority derived from email domain, title, deployment access or an identity-provider realm role.
- No new generic role-template engine or user-configurable permission designer.
- No clinical break-glass access.
- No replacement of existing workforce multi-role, team, reporting, case assignment or lifecycle controls.

## 3. Baseline to preserve

The following current implementation is the foundation and MUST be reused:

| Existing capability | Preserve |
|---|---|
| `platform_account_owner_relationships` plus singleton current-owner pointer | Exactly one current relationship and retained history |
| One-shot `platform_governance_bootstrap` marker | Idempotency and prevention of re-bootstrap |
| `PlatformGovernanceBootstrapService` identity checks and governance lock | Atomic initial trust establishment |
| Separate `platform_role_assignments` for `SYSTEM_ADMINISTRATOR` | Administrator is not an ordinary workforce assignment |
| `PlatformAccessGovernanceService` | Effective dates, request expiry, maker/checker, revision checks and last-admin protection |
| `PlatformOwnerTransferService` | Current owner initiation, incoming-owner acceptance and independent verification |
| `Authority.require(Permission, Resource)` | One server-side authorization entry point |
| Database-owned effective authority | Lifecycle, access-subject, MFA, role, scope and relationship checks on every request |
| Keycloak identity adapter | Identity existence, enabled state, credentials, sessions and authentication evidence |
| Durable identity-operation outbox | Database-first identity changes, retry, reconciliation and dead-letter handling |
| Governance audit | Actor, target, action, outcome, reason and time |
| Control Center Administrators page | Ongoing appointment/removal user experience |

The target must not reintroduce legacy provider organizations, realm-role authorization, the retired template engine
or browser-supplied authority facts.

## 4. Concepts and invariants

### 4.1 Concepts

| Concept | Meaning | Authority source |
|---|---|---|
| Identity | Stable Keycloak subject and its authenticators | Keycloak authentication evidence |
| Workforce person | Internal person lifecycle and organizational facts | Application database |
| Platform Account Owner | Exactly one accountable ownership relationship | Application database relationship |
| System Administrator | Privileged platform-access responsibility | `platform_role_assignments` |
| Ordinary workforce role | Business responsibility such as coordination or operations | `workforce_role_assignments` |
| Owner capability | Fixed code policy available only through the active owner relationship | Application code + current-owner row |
| Executive metric | Governed, read-only business measure with definition, source and freshness | Domain data or rebuildable analytics projection |
| Recovery authority | Exceptional operational procedure; never an ordinary application role | Dual-control runbook + immutable recovery record |

### 4.2 Mandatory invariants

| ID | Invariant |
|---|---|
| OSA-01 | After commissioning, exactly one active owner relationship is referenced by the singleton pointer. |
| OSA-02 | Ownership cannot end without an accepted successor or completed approved recovery. |
| OSA-03 | The owner relationship is not stored in either workforce role-assignment table. |
| OSA-04 | At least two effective System Administrators SHOULD normally exist; the platform MUST never commit a state with zero effective administrators. |
| OSA-05 | No actor appoints, removes, approves or verifies privileged authority for themselves. |
| OSA-06 | Bootstrap/commissioning can complete only once and cannot be reopened by restart or configuration replay. |
| OSA-07 | Owner and administrator authority is resolved from current database state on every request. |
| OSA-08 | A stale JWT cannot retain authority after transfer, removal, disablement or offboarding. |
| OSA-09 | Owner analytics is read-only and never implies an operational permission. |
| OSA-10 | Owner analytics never grants generic case or clinical-document access. |
| OSA-11 | Every privileged mutation requires a reason, recent authentication, optimistic concurrency and audit. |
| OSA-12 | Every governance recovery requires multiple independent actors and out-of-band organizational evidence. |
| OSA-13 | Keycloak administrators can restore authentication infrastructure but cannot manufacture application business authority. |
| OSA-14 | Analytics projections are rebuildable and never used to authorize a business action. |
| OSA-15 | Ordinary System Administrator changes continue to use the privileged change-request store and cannot use Invite Person or Change Roles. |

## 5. Logical architecture

```text
┌──────────────────────────────── Identity plane ────────────────────────────────┐
│ Keycloak: subject, enabled state, passkeys, OTP, auth_time, acr, sessions      │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ authenticated Principal only
┌──────────────────────────────────────▼──────────────────────────────────────────┐
│ RehletShifaa authority plane                                                    │
│ Authority.require(permission, resource)                                         │
│ ├─ current owner relationship -> fixed OwnerPolicy capabilities                 │
│ ├─ effective System Administrator assignment -> RolePolicy capabilities         │
│ ├─ ordinary workforce roles -> RolePolicy capabilities                          │
│ └─ lifecycle, access subject, MFA, scope, assignment and domain constraints      │
└──────────────────────────────┬────────────────────────────┬──────────────────────┘
                               │                            │
┌──────────────────────────────▼────────────┐  ┌────────────▼─────────────────────┐
│ Governance command plane                 │  │ Executive analytics query plane   │
│ commissioning, transfer, maker/checker,  │  │ definitions, aggregates, trends,  │
│ recovery, audit and notification         │  │ privacy filters and freshness      │
└───────────────────────────────────────────┘  └────────────┬─────────────────────┘
                                                            │ read-only
                                               ┌────────────▼─────────────────────┐
                                               │ Domain facts / rebuildable       │
                                               │ analytics projections            │
                                               └──────────────────────────────────┘
```

Authentication, business authorization, governance commands and analytics are separate planes. They share a subject
identifier and audit correlation, not authority shortcuts.

## 6. Platform Account Owner target model

### 6.1 Owner responsibility

The owner represents the executive accountable for the RehletShifaa platform account. The owner is expected to sign
in regularly to review business performance and governance state. The owner is not analogous to an everyday root or
database administrator.

The same active relationship supplies two fixed capability groups:

**Executive insight**

- `EXECUTIVE_OVERVIEW_VIEW`
- `EXECUTIVE_REVENUE_VIEW`
- `EXECUTIVE_JOURNEY_ANALYTICS_VIEW`
- `EXECUTIVE_CONSULTANT_ANALYTICS_VIEW`
- `EXECUTIVE_OPERATIONS_ANALYTICS_VIEW`
- `EXECUTIVE_WORKFORCE_ANALYTICS_VIEW`
- `EXECUTIVE_PATIENT_EXPERIENCE_VIEW`
- `EXECUTIVE_RISK_COMPLIANCE_VIEW`

**Governance**

- `PLATFORM_GOVERNANCE_VIEW`
- `ADMINISTRATOR_CHANGE_APPROVE`
- `OWNER_TRANSFER_INITIATE`
- `OWNER_RECOVERY_PARTICIPATE`

These are code-owned permissions derived from the current-owner relationship. They MUST NOT be assignable, selectable
or editable as roles. Adding a future capability requires code review, threat modelling and tests.

### 6.2 Explicit denials

Ownership alone never grants:

- `WORKFORCE_ADMINISTER`, `ROLE_ASSIGNMENT`, `TEAM_MANAGE` or identity-operation execution;
- `CASE_READ`, `CASE_COORDINATE`, clinical review or document access;
- credential or capability decisions;
- pricing, settlement, refund, waiver, payment or bank-detail mutation;
- journey design/publication;
- consultant, Practice Manager or patient lifecycle mutation;
- support impersonation or credential reset;
- arbitrary database queries or unrestricted exports.

If the same human needs an operational responsibility, it must be separately assigned and evaluated through the
ordinary policy. Ownership does not satisfy that policy and does not widen its scope.

### 6.3 Executive workspace

Target route:

```text
/{locale}/portal/owner
```

Recommended navigation:

| Screen | Purpose | Default disclosure |
|---|---|---|
| Executive Overview | Current performance, alerts and trend summary | Aggregates only |
| Revenue and Margin | Recognized/collected revenue, margin, deposits, refunds and trend breakdowns | Aggregated by period/service/market; no payment instruments |
| Journeys and Cases | Funnel, stage aging, conversion, cancellation and SLA performance | Counts/rates; pseudonymous exceptions only |
| Consultants and Virtual Clinics | Onboarding, readiness, availability, utilization and service performance | Professional/business facts; no credentials documents |
| Operations | Travel/fulfilment throughput, blockers, SLA and workload | Aggregates; controlled operational exception references |
| Workforce | Headcount, capacity, role coverage, vacancies and access-review posture | Business identity where needed; no credentials |
| Patient Experience | Satisfaction, response times, complaints and service outcomes | Aggregated/de-identified by default |
| Risk and Compliance | Audit trends, overdue reviews, privileged changes and control health | Governance metadata, never clinical content |
| Governance | Current owner, administrators, pending approvals, transfer and recovery state | Named privileged identities and immutable evidence metadata |

### 6.4 Dashboard disclosure tiers

| Tier | Data | Owner access |
|---|---|---|
| E0 | Public/reference data | Allowed |
| E1 | Aggregate business measures with no person identifier | Allowed |
| E2 | Named workforce/consultant business-performance facts | Allowed only where management action requires it |
| E3 | Pseudonymous patient/case exception facts | Allowed only through a defined exception drill-down with audit |
| E4 | Identifiable patient data, clinical narrative/documents, payment instruments, identity evidence | Not granted by ownership |

Small cohorts MUST be suppressed or grouped to prevent re-identification. The initial threshold SHOULD be five, with
the value configuration-controlled and security-reviewed. Free-text clinical, support and audit payloads MUST NOT be
copied into executive projections.

### 6.5 Financial boundary

The owner may view executive financial performance, including revenue, margin, receivables, deposits, refund totals
and forecast measures. Ownership alone MUST NOT expose:

- full card, bank or payment credentials;
- patient payment-instrument tokens;
- unmasked bank account data;
- mutation controls;
- unrestricted transaction exports;
- clinical details used to explain an individual charge.

Transaction drill-down, if introduced, must use a dedicated permission and purpose-bound audit event. It is not part
of the initial owner dashboard.

## 7. Executive analytics architecture

### 7.1 Metric contract

Every metric MUST have a code-reviewed definition containing:

- stable metric key and bilingual label;
- business definition and formula;
- authoritative source tables/events;
- accounting/time basis and timezone;
- supported dimensions and filters;
- privacy tier;
- freshness target;
- correction/restatement behavior;
- empty, partial and delayed-data behavior;
- owner permission required;
- named business owner and technical owner.

The frontend must display “as of” time and must not present incomplete data as final.

### 7.2 Query model

Use a dedicated `executive.analytics` application boundary. Controllers call typed query services; they do not expose
generic SQL, arbitrary grouping, table names or user-supplied formulas.

Initial implementation MAY query indexed domain tables for bounded date ranges when performance tests prove it safe.
High-cost metrics SHOULD move to explicit, rebuildable projection tables such as:

- daily revenue/margin projection;
- daily journey funnel projection;
- daily operations/SLA projection;
- daily consultant readiness/utilization projection;
- daily workforce/capacity projection;
- daily risk/control projection.

Projection facts are derived data, not a second source of business truth. Projection delay cannot grant or retain
authority. A failed projection returns a clearly delayed/unavailable tile, not fabricated zeroes.

### 7.3 Consistency and freshness

- Governance status is live and strongly consistent.
- Revenue headline data SHOULD target hourly freshness; settled/accounting figures identify their finalization basis.
- Operational and journey dashboards SHOULD target 15-minute or better freshness where projections are used.
- Historical trend projections MAY be daily.
- All timestamps are stored as `TIMESTAMP WITH TIME ZONE`; display timezone is explicit.
- Corrections rebuild affected projection windows idempotently.

### 7.4 Exports

Owner export is disabled initially. If later required, it must be a separate protected action with:

- a defined export type, columns and maximum period;
- recent phishing-resistant authentication;
- reason and purpose;
- asynchronous generation into protected object storage;
- short expiry and one-time or bounded download;
- watermark, audit and notification;
- privacy-tier enforcement identical to the screen.

## 8. First-install commissioning

### 8.1 Why a commissioning layer is required

The delivered bootstrap correctly requires two active workforce administrators. A completely empty installation has
no administrator authorized to create those workforce people. Manual database inserts or permanent environment
variables are not acceptable production procedures.

The target introduces a narrowly bounded commissioning workflow around the existing bootstrap primitive. It is not a
general administrator API.

### 8.2 Actors

| Actor | Responsibility |
|---|---|
| Deployment operator | Starts a commissioning session from an approved deployment environment |
| Prospective owner | Proves identity, enrolls passkeys, accepts ownership and approves initial administrators |
| Administrator nominees | Prove identity, enroll passkeys and accept privileged responsibility |
| Application | Validates, atomically activates governance and permanently closes commissioning |

All three human subjects are distinct. Deployment operator identity must be recorded separately and cannot become an
application authority merely by running the command.

### 8.3 Preconditions

- Governance bootstrap marker is incomplete.
- No active owner pointer exists.
- No System Administrator assignment exists.
- Exactly one owner and exactly two administrator nominees are supplied.
- Each human identity is individually attributable; shared accounts are rejected.
- Owner business authority has been verified out of band against an approved organizational record.
- Every nominee has an enabled Keycloak identity and at least one WebAuthn/passkey credential before activation.
- Recommended: each privileged person registers two independent authenticators and two notification methods.
- Administrator nominees have required workforce name, work email, locale and employment/contract evidence.

### 8.4 State machine

```text
DRAFT
  -> INVITATIONS_SENT
  -> OWNER_ACCEPTED
  -> ADMINISTRATORS_ACCEPTED
  -> READY
  -> COMPLETED

DRAFT / INVITATIONS_SENT / OWNER_ACCEPTED / ADMINISTRATORS_ACCEPTED
  -> CANCELLED

Any transient identity delivery failure -> RETRYABLE
Any identity/evidence conflict          -> BLOCKED_REVIEW
```

No owner or administrator authority is effective before `COMPLETED`. Completion is one database transaction under
the existing governance lock.

### 8.5 Commissioning command

Provide an offline application command or one-shot deployment job, not an internet-facing setup endpoint. Suggested
operator interface:

```text
governance commission validate --manifest <protected-file>
governance commission start    --manifest <protected-file>
governance commission status   --id <commissioning-id>
governance commission cancel   --id <commissioning-id> --reason <reason>
```

The manifest contains references and subjects, not passwords, passkey material, OTP secrets or permanent recovery
credentials. Secrets are supplied through the deployment secret manager. Command output must redact personal and
credential data.

`validate` performs every safe precondition check without mutation. `start` uses an idempotency key and manifest
hash. Reusing the key with different content fails. After completion, all start/cancel commands fail closed.

### 8.6 Activation transaction

When all acceptances exist, completion must atomically:

1. lock governance;
2. re-read the commissioning revision and bootstrap marker;
3. recheck all subjects, Keycloak enabled state and phishing-resistant credentials;
4. create or activate the two workforce people without an ordinary role;
5. create/activate access subjects;
6. record owner acceptance and initial-admin acceptance/approval evidence;
7. invoke the existing bootstrap store to create the owner relationship and two non-expiring assignments;
8. mark commissioning and bootstrap complete;
9. append governance audit events and notification-outbox rows;
10. commit or roll back everything.

Identity creation/invitation remains a durable external operation. Database authority is never half-created because
an email or Keycloak call failed.

### 8.7 Post-completion controls

- Delete or disable the temporary commissioning deployment configuration.
- Remove any temporary Keycloak bootstrap administrator as required by the identity runbook.
- Verify both administrators and the owner can authenticate through the real production flow.
- Verify `/api/v1/me` independently for all three identities.
- Retain the reviewed manifest hash, acceptance records, audit correlation and completion report.
- Run an owner-transfer rehearsal in a non-production or approved production-equivalent environment.

## 9. System Administrator target model

### 9.1 Responsibility

System Administrators operate identity and access lifecycle, not business operations. Their role policy remains fixed
in code and must not imply clinical, case, finance, credential or executive-dashboard authority.

### 9.2 Eligibility at approval time

An appointment is effective only when all conditions hold:

- target is a current workforce person;
- lifecycle is `ACTIVE`;
- access subject is active;
- Keycloak identity exists and is enabled;
- recorded MFA and phishing-resistant MFA are current;
- no overlapping administrator assignment exists;
- no authoritative role-conflict rule is violated;
- effective period is valid;
- request has not expired and revision is current;
- target, requester and approver satisfy independence rules.

The backend rechecks eligibility and conflicts at approval. A frontend filtered list is convenience only.

### 9.3 Ongoing appointment/removal

```text
Admin A requests APPOINT/REMOVE
                 │
                 ├─> Admin B approves/rejects
                 └─> Current Owner approves/rejects
```

Rules:

- Requester must be an effective administrator with recent phishing-resistant authentication.
- Approver is either another effective administrator or the current owner.
- Approver cannot be requester or target.
- Owner approval grants no administrator capabilities to the owner.
- Request lifetime remains 72 hours.
- Appointment and removal remain effective-dated.
- The governance lock and last-effective-administrator checks run in the approval transaction.
- Rejection and expiry change no assignment.
- All participants and reasons are audited and notified.

### 9.4 Number and account posture

- Maintain at least two effective, non-expiring administrators.
- Keep the population small and review it quarterly.
- Use named individual identities; shared `admin` accounts are prohibited for normal application administration.
- Administrators must use passkeys for high-risk actions and SHOULD use managed devices.
- A separate privileged identity for the same human is a desirable later hardening measure, but must not be simulated
  with duplicate workforce people. Implement it only after an explicit person-to-identities model is approved.
- System Administrators may retain compatible ordinary roles under current policy. Those permissions remain
  independent; holding both never widens scope or creates case access.

### 9.5 Lifecycle integration

- Disabling or offboarding an administrator rechecks the administrator invariant under the same governance lock.
- Offboarding cannot complete while an administrator assignment remains active.
- Removing one role or relationship removes only the corresponding authority.
- Session logout is queued after the database mutation; request-time database checks remove authority immediately.
- Dormancy and recertification must include administrator assignments.

## 10. Ownership transfer

Preserve the delivered three-party transfer:

1. current owner initiates and names a different incoming subject;
2. incoming owner accepts with recent phishing-resistant authentication;
3. an effective System Administrator distinct from both verifies;
4. one transaction ends the previous relationship, creates the successor relationship and advances the singleton;
5. owner capabilities and dashboard access move immediately because they resolve from the singleton relationship;
6. the previous owner’s stale token has no owner authority on its next request;
7. acceptance, verification, audit and notifications remain immutable.

Additional target checks:

- incoming owner identity must have verified organizational authority recorded outside the token;
- incoming owner must acknowledge analytics confidentiality and governance responsibilities;
- any owner export in progress is cancelled or re-authorized on completion;
- dashboard caches, if introduced, are keyed by data only and reauthorize every delivery; never cache owner
  entitlement in a way that survives transfer.

## 11. Recovery architecture

Recovery has two separate scopes and they must not be confused.

### 11.1 Identity-platform recovery

Purpose: regain Keycloak administrative access or repair authentication when normal identity administration is
unavailable.

- Maintain sealed Keycloak recovery credentials under dual organizational control.
- Recovery credentials are not normal employee accounts and carry no RehletShifaa business role.
- Store the two required factors/materials separately so one person cannot use them alone.
- Every retrieval and use is ticketed, logged, alerted and followed by rotation/removal.
- Test the procedure at least quarterly in a production-equivalent environment.
- Recovery restores named normal identities; it does not directly edit owner/admin application tables.

### 11.2 Unavailable-owner recovery (OD-02 target decision)

Use only when ordinary transfer is impossible because the current owner is permanently unavailable, legally unable
to act or cannot recover authentication within the approved incident window.

Required parties:

1. Administrator A initiates the recovery request.
2. Administrator B independently confirms the platform state and request.
3. An authorized deployment/security operator verifies out-of-band organizational evidence.
4. The incoming owner accepts with recent phishing-resistant authentication.

If fewer than two effective administrators remain, identity-platform recovery first restores or appoints a second
administrator through the sealed procedure. The system must not weaken the owner-recovery quorum merely because an
administrator is unavailable.

Required evidence:

- why normal transfer is impossible;
- organizational authority for the successor;
- identity-proofing reference;
- incident/ticket reference;
- participants and timestamps;
- notification recipients;
- cooling-off period decision and emergency-waiver reason, if any.

Recommended state machine:

```text
PENDING_SECOND_ADMIN
  -> PENDING_OPERATOR_VERIFICATION
  -> PENDING_SUCCESSOR_ACCEPTANCE
  -> COOLING_OFF
  -> COMPLETED

Any pending state -> REJECTED / EXPIRED
```

Default cooling-off SHOULD be 24 hours, with immediate alerts to registered owner contacts, all administrators and
the compliance channel. A documented security emergency may waive it only with all required parties recorded.

Completion uses the governance lock and the same relationship transition primitive as normal transfer. There is no
special owner role, no administrator impersonation and no direct pointer update outside the service.

## 12. Authentication and authorization

### 12.1 Authentication levels

| Activity | Minimum target |
|---|---|
| Owner dashboard viewing | MFA; phishing-resistant option required and preferred |
| Owner governance action | Recent authentication within 10 minutes plus phishing-resistant `acr` |
| Administrator read-only governance screen | MFA |
| Administrator privileged mutation | Recent authentication within 10 minutes plus phishing-resistant `acr` |
| Commissioning acceptance | Recent phishing-resistant authentication |
| Recovery participation | Recent phishing-resistant authentication plus recovery evidence |

The backend validates `auth_time` and accepted `acr` values. Merely configuring Keycloak flows is not proof that a
request achieved the required assurance.

### 12.2 Owner policy integration

Add a fixed `OwnerPolicy` alongside `RolePolicy`; do not add an `OWNER` role. `Authority` evaluates owner capability
only when the current-owner relationship subject equals the authenticated principal and the access subject is active.

Illustrative decision flow:

```text
require(permission, resource):
  principal = authenticated JWT subject
  facts = current database facts at request time

  grants = RolePolicy(effective roles)
         + OwnerPolicy(if principal is current active owner)

  deny when permission absent
  deny when resource scope fails
  deny when lifecycle/access state fails
  require step-up when permission is protected
  apply domain invariants
  audit protected denials and decisions
```

No owner capability may use a generic `PLATFORM` scope to read sensitive domain objects. Owner analytics endpoints
return predefined projections, not domain entities protected by case scopes.

### 12.3 Token and cache rules

- JWT supplies subject and authentication evidence only.
- JWT role/group claims are ignored for owner and business authorization.
- Owner and administrator facts are queried for every protected request.
- Authorization decisions are not cached.
- Analytics result caching may be introduced only after authorization and must not encode a durable entitlement.
- Disable, offboard, administrator removal or owner transfer takes effect before session revocation completes.

## 13. Persistence design

Use additive Flyway migrations beginning after the current highest migration. Do not edit historical migrations.

### 13.1 Commissioning tables

`platform_governance_commissioning`

- singleton-compatible `id`, status, revision;
- deployment operator, idempotency key and manifest hash;
- created/updated/expires/completed timestamps;
- cancellation/block reason;
- unique completed constraint/invariant enforced with the governance lock.

`platform_governance_commissioning_participants`

- commissioning id;
- participant type `OWNER`, `ADMINISTRATOR`;
- subject, workforce identity reference where applicable;
- invitation/acceptance status and timestamps;
- identity-evidence snapshot flags, not secrets;
- unique participant subject and exactly one owner/two-admin service invariant.

`platform_governance_commissioning_decisions`

- immutable owner acceptance and initial-admin approval evidence;
- actor, decision, reason, authentication assurance, timestamp and correlation id.

The completed workflow invokes the existing bootstrap tables; it does not replace them.

### 13.2 Administrator change extension

Extend privileged administrator decisions to record approver type (`SYSTEM_ADMINISTRATOR` or
`PLATFORM_ACCOUNT_OWNER`) and assurance evidence. Preserve existing request and decision history.

### 13.3 Owner recovery tables

`platform_owner_recovery_requests`

- current and incoming owner subjects;
- status, reason, evidence reference, incident reference;
- initiation, expiry, cooling-off and revision fields.

Append-only evidence tables record:

- second-administrator confirmation;
- operator verification;
- successor acceptance;
- cooling-off waiver, if any;
- completion metadata.

Never store identity documents, secrets or raw legal evidence in these tables. Store protected external evidence
references and hashes.

### 13.4 Analytics projections

Use explicit domain projection tables rather than a generic user-programmable metric store. Every projection row has
a period, dimensions, measures, source watermark, calculated time and schema/definition version. Projection rows
contain no authorization data and can be deleted/rebuilt without affecting business state.

## 14. API design

All paths below are target contracts. Existing APIs remain unchanged until their implementing slice is introduced.

### 14.1 Owner workspace

```text
GET /api/v1/owner/overview
GET /api/v1/owner/analytics/revenue
GET /api/v1/owner/analytics/journeys
GET /api/v1/owner/analytics/consultants
GET /api/v1/owner/analytics/operations
GET /api/v1/owner/analytics/workforce
GET /api/v1/owner/analytics/patient-experience
GET /api/v1/owner/analytics/risk-compliance
GET /api/v1/owner/governance
```

Every request:

- derives subject from the authenticated principal;
- requires the exact owner capability;
- validates date range and a fixed filter vocabulary;
- enforces disclosure tier and small-cohort suppression server-side;
- returns data freshness and definition version;
- never accepts SQL, arbitrary metric expressions or a subject override.

### 14.2 Administrator changes

Preserve:

```text
GET  /api/v1/admin/platform-access/administrator-changes
POST /api/v1/admin/platform-access/administrator-changes
POST /api/v1/admin/platform-access/administrator-changes/{id}/approve
POST /api/v1/admin/platform-access/administrator-changes/{id}/reject
```

Extend decision authorization so the current owner can approve/reject, while retaining all existing administrator
paths and response shapes where possible.

### 14.3 Commissioning

Operator start/status/cancel is a deployment command, not a browser API. Authenticated participant endpoints MAY be:

```text
GET  /api/v1/governance/commissioning/current-invitation
POST /api/v1/governance/commissioning/{id}/owner-acceptance
POST /api/v1/governance/commissioning/{id}/administrator-acceptance
```

The server binds the action to the token subject and invitation record. No body field chooses the acting subject.

### 14.4 Recovery

Recovery endpoints live under a clearly exceptional governance path and are absent from ordinary navigation until a
valid recovery request exists. Each transition has its own command and actor requirement; there is no generic status
update endpoint.

## 15. Frontend architecture and UX

### 15.1 Navigation

`/api/v1/me` gains an owner workspace/capability projection derived from the current relationship. Frontend routing
continues to use `/me`, not decoded JWT roles.

An identity with both owner and ordinary workforce responsibilities sees separate workspace choices. The UI never
combines an owner analytics context with an operational case-action context.

### 15.2 Owner dashboard behavior

- Bilingual English/Arabic with proper RTL layout.
- Desktop-first executive presentation with accessible responsive summaries.
- Every tile shows period, unit and freshness.
- Amounts show currency and accounting basis.
- Trends expose comparison period and formula.
- Suppressed values explain privacy suppression without leaking the hidden count.
- Empty, delayed, partial and failed states are distinct.
- Drill-down breadcrumbs make disclosure depth visible.
- No owner screen contains operational mutation buttons.
- Governance approvals are visually separated from analytics.

### 15.3 Commissioning UX

Commissioning participant pages are invitation-bound, minimal and unavailable after completion. They explain:

- the responsibility being accepted;
- authentication requirements;
- separation-of-duties rules;
- privacy and audit expectations;
- recovery contacts;
- why the action cannot be delegated.

There is no discoverable first-owner registration form.

### 15.4 Administrators UX

Extend the delivered Administrators screen to:

- show whether a request may be decided by an owner or administrator;
- show candidate lifecycle/MFA eligibility without treating it as authority;
- prevent the requester/target buttons as a convenience while relying on backend rejection;
- display expiry, effective dates, requester, approver type and immutable result;
- warn when effective administrator count is below the operational target of two;
- link blocked removal to required remediation.

## 16. Audit, notifications and monitoring

### 16.1 Required audit events

- commissioning created, invitation delivered, participant accepted, blocked, cancelled and completed;
- bootstrap completed;
- owner dashboard sensitive drill-down and future export events;
- administrator change requested, approved, rejected, expired and applied;
- owner transfer initiated, accepted, verified, expired and completed;
- recovery initiated, confirmed, verified, accepted, waived, rejected, expired and completed;
- sealed identity-recovery credential retrieval/use/rotation reference;
- authorization denial for protected owner/governance actions.

Audit records contain identifiers, safe before/after state, reason, correlation id and assurance facts. They do not
contain passwords, passkeys, OTP secrets, raw clinical content or raw legal evidence.

### 16.2 Notifications

Immediate notifications go to the registered governance channels for:

- commissioning completion;
- administrator appointment/removal requests and decisions;
- owner transfer activity;
- recovery activity and any cooling-off waiver;
- privileged identity disablement or MFA reset;
- unexpected use of sealed recovery credentials;
- owner analytics export creation/download, if enabled.

Notifications are delivered through the durable outbox. They contain minimal data and link to authenticated views.
Failed notification delivery does not roll back an already valid governance transaction, but it raises an operational
alert and remains retryable.

### 16.3 Operational indicators

- effective administrator count;
- active owner count/pointer integrity;
- privileged identities without current phishing-resistant MFA;
- pending/expired privileged requests;
- last successful recovery drill;
- last privileged access recertification;
- projection freshness/error state;
- failed governance notifications;
- identity/application reconciliation discrepancies.

## 17. Concurrency and failure behavior

- All owner/admin relationship mutations acquire the existing singleton governance lock first.
- Request and decision commands use expected revision.
- External identity calls never execute inside the database transaction.
- Authority is committed in the application database before any identity operation is considered complete.
- A failed post-commit identity operation is retried and can trigger the existing restore/sign-in gate where required.
- Commissioning completion is idempotent for the same manifest hash and refuses different inputs after completion.
- Analytics failure degrades the affected tile/query, never the governance plane.
- Partial analytics data is labelled; no missing value is silently converted to zero.
- Owner transfer and recovery invalidate pending conflicting owner requests under the same lock.
- Clock comparisons use the project’s microsecond-normalized timestamp convention.

## 18. Implementation slices

Implement in this order. Each slice is independently reviewed and verified; do not begin with dashboard visuals
before authority and data contracts exist.

### OSA-1 — Policy and contract foundation

- Add owner permission vocabulary and fixed `OwnerPolicy`.
- Extend `/api/v1/me` with owner workspace/capability facts.
- Add negative tests proving owner capabilities grant no operational authority.
- Approve the metric catalogue, disclosure tiers and dashboard definitions.

**Exit:** current owner can be recognized for target read permissions without gaining any existing domain permission.

### OSA-2 — Operator-grade commissioning

- Add commissioning migration and application service.
- Add validate/start/status/cancel deployment command.
- Reuse durable identity operations and bootstrap completion transaction.
- Add participant acceptance pages and evidence.
- Resolve the empty-installation administrator workforce dependency.

**Exit:** a clean database can reach one accepted owner and two active administrators without seed data or manual SQL.

### OSA-3 — Administrator approval resilience

- Permit current owner approval/rejection of administrator changes.
- Recheck target enabled identity and phishing-resistant MFA at decision time.
- Add notifications and below-two warning.

**Exit:** loss of one of two administrators does not prevent a governed replacement when the owner remains available.

### OSA-4 — Owner governance workspace

- Implement owner governance summary, administrator request inbox and transfer views.
- Keep normal transfer endpoints and invariants.
- Add critical notifications.

**Exit:** the owner can perform defined governance responsibilities without Control Center administrator authority.

### OSA-5 — Executive analytics foundation

- Implement metric registry/contracts and typed analytics query boundary.
- Build overview, revenue and risk/control projections first.
- Add freshness, suppression and negative disclosure tests.

**Exit:** owner sees trustworthy executive summaries without raw clinical/case/payment data.

### OSA-6 — Domain dashboards

- Add journeys, consultants, operations, workforce and patient-experience analytics incrementally.
- Performance-test every query/projection and define reconciliation.
- Add bilingual UI and accessibility tests.

**Exit:** every major platform area has an owner-level read model with a documented metric definition.

### OSA-7 — Owner recovery

- Implement OD-02 recovery state machine and evidence records.
- Implement operator verification and cooling-off controls.
- Write and rehearse identity-platform and owner-recovery runbooks.

**Exit:** unavailable-owner recovery succeeds under dual/multi-party control and no single actor can complete it.

### OSA-8 — Production assurance

- Privileged access recertification and owner-relationship review.
- Alert delivery validation.
- Backup/restore and reconciliation rehearsal.
- Quarterly sealed-recovery exercise schedule.
- Threat-model and penetration-test owner APIs, filters, exports and recovery.

**Exit:** production evidence exists for commissioning, transfer, administrator replacement, immediate revocation and recovery.

## 19. Verification strategy

### 19.1 Backend tests

At minimum prove:

1. empty-install commissioning succeeds only with one owner and exactly two distinct administrators;
2. all nominees must exist, be enabled and have phishing-resistant credentials;
3. no authority exists in any pending commissioning state;
4. completion is atomic and idempotent;
5. different replay inputs are rejected;
6. owner capabilities derive only from the current relationship;
7. previous owner loses dashboards and governance immediately after transfer;
8. owner analytics grants no domain mutation or generic case/clinical read;
9. Admin A request may be approved by Admin B or the current owner;
10. requester, target and approver independence is enforced;
11. inactive, disabled, offboarding or non-passkey target cannot become effective administrator;
12. last-effective-administrator protection holds across removal, expiry, disable and offboarding;
13. stale JWTs cannot retain removed owner/admin authority;
14. recovery cannot complete without every required independent record;
15. recovery completion preserves exactly one current owner;
16. analytics privacy suppression and filter validation are server-side;
17. projection delay/failure cannot affect authorization;
18. audit and notification rows commit with every governance transition.

### 19.2 Frontend tests

- owner navigation appears only from `/me` owner facts;
- owner screens never route from JWT roles;
- governance and analytics are visually separated;
- owner has no operational mutation controls;
- amount, currency, date range and freshness render correctly in EN/AR;
- suppression, delayed, partial, empty and error states are distinct;
- administrator maker cannot approve their own request;
- owner can approve an eligible administrator request but cannot request ordinary workforce changes;
- commissioning invitation is bound to the exact signed-in participant;
- previous owner loses owner navigation after relationship change and refresh.

### 19.3 Live security journeys

- clean-environment commissioning through real Keycloak passkey enrollment;
- owner dashboard sign-in and governance step-up at intended `acr`;
- initial administrator replacement using owner approval;
- normal three-party owner transfer;
- disable/removal with an already-issued token;
- sealed Keycloak recovery drill without application-authority mutation;
- unavailable-owner recovery in an isolated production-equivalent environment;
- notification and audit evidence review.

## 20. Operations runbooks required before release

1. Verify organizational authority for an initial or successor owner.
2. Commission a new environment.
3. Remove temporary Keycloak bootstrap administration.
4. Add, replace and remove System Administrators.
5. Transfer ownership normally.
6. Recover a privileged user’s authenticator without bypassing approval.
7. Use and rotate sealed Keycloak recovery credentials.
8. Recover an unavailable owner.
9. Respond to suspected owner/administrator compromise.
10. Reconcile Keycloak identity state with application state after restore.
11. Rebuild and reconcile analytics projections.
12. Review privileged access and recovery evidence quarterly.

Each runbook names accountable roles, prerequisites, commands/screens, expected audit events, abort conditions,
rollback/recovery behavior and evidence-retention location. No runbook may instruct an operator to edit governance
tables directly.

## 21. Architecture acceptance criteria

The target is complete only when all statements are true:

- A clean deployment can be commissioned without seed identities, manual SQL or a pre-existing administrator.
- The owner explicitly accepts ownership and approves the initial administrator set.
- Exactly one current owner and at least one effective administrator are database-enforced; normal operations maintain two.
- The owner has a dedicated executive workspace with documented revenue and cross-platform metrics.
- Owner analytics cannot reveal raw clinical records or mutate operational/financial state.
- Every owner/admin protected request reauthorizes from current database state.
- Additional administrators can be approved by an independent administrator or the current owner.
- Ordinary invitation and role APIs still cannot grant `SYSTEM_ADMINISTRATOR` or ownership.
- Normal owner transfer and unavailable-owner recovery both preserve relationship history and immediate revocation.
- Sealed identity recovery is dual-controlled, tested and does not grant application business authority.
- Critical governance changes are audited and notified.
- All negative authorization, privacy, concurrency, stale-token and recovery-quorum tests pass.
- Production-equivalent commissioning, replacement, transfer and recovery evidence is retained.

## 22. Standards alignment

This design intentionally maps to:

- NIST SP 800-53 controls for account management, separation of duties, least privilege, privileged MFA, audit and
  contingency planning;
- NIST SP 800-63B phishing-resistant authentication and controlled account recovery;
- NIST SP 800-207 request-time, resource-oriented authorization principles;
- CIS Controls 5 and 6 account/access granting, revocation and administrative MFA;
- OWASP deny-by-default and server-side authorization on every request;
- Keycloak’s temporary bootstrap/recovery-administrator lifecycle;
- established cloud-provider guidance for limited privileged populations, multi-person approval, monitored emergency
  access and periodic recovery testing.

Standards guide the controls; they do not replace RehletShifaa’s business decisions or make an external identity
provider authoritative for application permissions.

## 23. Final architectural position

Bootstrap is retained because every system needs an initial trust-establishment mechanism. RehletShifaa will not
*depend on bootstrap only*. The finished design uses:

```text
one-time controlled commissioning
        +
database-owned owner relationship and administrator assignments
        +
normal maker/checker and three-party transfer
        +
owner-specific read-only executive analytics
        +
dual-control identity and ownership recovery
        +
continuous audit, notifications, recertification and rehearsals
```

This provides a professional control plane suitable for a lean organization without collapsing ownership,
administration, executive insight and operational authority into one dangerous super-user.
