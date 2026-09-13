# Codex Master Implementation Prompt — RehletShifaa Platform Control Plane

> **Purpose:** Give this file to Codex as the canonical implementation specification for the Platform Control Plane epic. It is designed to eliminate recurring business/architecture discussions. Codex should make implementation decisions within these boundaries, persist decisions/status in the repo, and execute in verified phases.

---

## 0. Mission

Implement the RehletShifaa **Platform Control Plane** end to end in the existing `shadyashry/rehletshifaa` repository.

The target consists of four integrated capabilities:

1. **Access Governance** — configurable business role templates, registered permission catalog, scope, relationships, effective access and policy enforcement.
2. **Provider Management** — provider organizations, memberships, clinician/practice staff onboarding, credential verification, clinician relationships, pricing and availability governance.
3. **Journey Management** — RehletShifaa-owned global configurable/versioned care journey, with visual business designer, validation/simulation/publish and runtime orchestration.
4. **Work Assignment & Routing** — Coordinator teams, Consultant/provider routing preferences, deterministic explainable routing, capacity/workload, queue/fallback and assignment audit.

Do not reduce this epic to UI mockups. Implement the domain model, persistence, APIs, security, migrations, integrations, UI, tests, audit, migration/compatibility, and operational behavior.

The canonical product/business design is `00_FINAL_PLATFORM_BLUEPRINT.md`. Read and implement it; do not renegotiate its business decisions unless the existing repository proves a direct technical contradiction that cannot be reconciled safely.

---

# 1. NON-NEGOTIABLE STARTUP PROCEDURE

### 1.1 Read project instructions first

Before any code change:

1. Read repository `AGENTS.md`.
2. Read repository `CLAUDE.md` if present.
3. Read `docs/commercial-workflow-status.md` because this epic touches the current care/commercial journey.
4. Read only the sections of `docs/end-to-end-workflows.md` and `docs/architecture.md` required to map existing journey/security/domain behavior.
5. Read the canonical blueprint in this package.

Do not perform an unbounded repository scan. Use targeted searches for role checks, case transitions, WorkItems, doctors/profiles, pricing, coordinator assignment, credentialing, audit, and admin UI.

### 1.2 Create a new feature branch from the exact current checkout

The user requires a new branch from the **currently checked-out existing branch**, not automatically from `main`.

Run and record:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Let:

- `BASE_BRANCH` = the current branch name.
- `BASE_SHA` = current HEAD.

Preferred new branch:

```text
codex/platform-control-plane
```

Create it directly from the current checkout:

```bash
git switch -c codex/platform-control-plane
```

If that branch already exists locally/remotely and is not the current intended work, create a deterministic new name such as:

```text
codex/platform-control-plane-v2
```

Do **not** reset, rebase, discard, clean, stash, or overwrite user work. If the working tree already has uncommitted files, branch creation normally preserves them; record the pre-existing dirty files in implementation status and do not mix unrelated changes into commits.

After branch creation verify:

```bash
git branch --show-current
git rev-parse HEAD
```

### 1.3 Copy canonical implementation docs into repository

Create:

```text
docs/platform-control-plane/
```

Place/copy the canonical blueprint and implementation/status documents there so future Codex sessions do not depend on chat history.

At minimum maintain:

```text
docs/platform-control-plane/blueprint.md
docs/platform-control-plane/technical-decisions.md
docs/platform-control-plane/implementation-status.md
docs/platform-control-plane/migration-inventory.md
docs/platform-control-plane/test-status.md
```

`implementation-status.md` is mandatory and updated at the end of every phase.

---

# 2. TOKEN / CONTEXT DISCIPLINE

This is a large epic. Do **not** attempt to implement everything in one context window.

The repository documents are the memory mechanism.

For every continuation session read only:

1. `AGENTS.md`
2. `CLAUDE.md` if present
3. `docs/platform-control-plane/implementation-status.md`
4. `docs/platform-control-plane/technical-decisions.md`
5. the exact blueprint/phase section needed for the next action

Do not reread the full repo or all long docs after Phase 0.

At the end of each phase update `implementation-status.md` with:

```text
Current branch
Base branch/base SHA
Current phase
Completed items
Files/modules changed
Migrations added
API contracts added/changed
Tests run and results
Known pre-existing failures
New defects/blockers
Design decisions made
Compatibility notes
NEXT EXACT ACTIONS (ordered, executable)
```

The next Codex context should continue from `NEXT EXACT ACTIONS` without repeating architecture discovery.

Do not ask the user routine technical questions. Within the blueprint constraints, inspect the code, choose the least-complex compatible implementation, document the decision, and continue. Ask only for an external secret/account, an irreversible business choice not specified here, or a destructive operation that requires user approval.

---

# 3. CURRENT REPOSITORY FACTS TO PRESERVE

The actual checked-out repository is authoritative, but known current structure includes:

- Spring Boot backend with Java 21, PostgreSQL, Flyway, Spring Security/OAuth2 Resource Server, JPA, Validation, Redis cache, MinIO, ClamAV, mail/outbox patterns.
- Keycloak authentication.
- Next.js/React/TypeScript frontend with React Hook Form, Zod, Lucide, Tailwind/current CSS design system, Vitest and Playwright.
- Existing `ActorRole`/`ActorContext` role-based authorization that must be migrated incrementally rather than ripped out.
- Existing journey/case status, WorkItems, coordinator/doctor/operations/finance flows, secure proposal links, OTP, patient conversion, pricing/FX/commercial policy, deposits/offline payment ledger, travel/treatment/follow-up sub-workflows.
- Existing consultant price catalogue must be extended/reused, not replaced in a way that changes historical proposals.

The current commercial workflow status and end-to-end workflow docs must remain behaviorally correct.

### Preserve absolutely

- one authoritative backend case transition model during migration;
- secure-link/OTP protections;
- Keycloak-hosted authentication;
- patient identity/contact verification separation;
- released proposal immutability;
- backend-only money calculations and frozen snapshots;
- deposit/payment append-only ledger behavior;
- document authorization/scanning;
- transaction outbox/idempotent notification behavior;
- current role/thread privacy boundaries unless explicitly strengthened;
- current domain state in dedicated sub-workflow tables rather than polluting `medical_cases.status`.

---

# 4. ARCHITECTURE TO IMPLEMENT

Implement four separate control planes with clear boundaries.

```text
AUTHENTICATION (Keycloak)
        ↓
ACCESS GOVERNANCE ───────────┐
                            │
PROVIDER MANAGEMENT ────────┤
                            ├── Domain action enforcement
JOURNEY MANAGEMENT ─────────┤
                            │
ASSIGNMENT & ROUTING ───────┘
```

Do not combine them into a single God service or generic JSON rules engine.

---

# 5. ACCESS GOVERNANCE — COMPLETE REQUIREMENTS

## 5.1 Core domain

Implement/reuse domain concepts approximately equivalent to:

- `PermissionDefinition`
- `RoleTemplate`
- `RoleTemplateVersion`
- `RolePermissionGrant`
- `RoleAssignment`
- `OrganizationScope`
- `ResourceRelationship`
- `PermissionRisk`
- `ChannelEntitlement`
- `AuthorizationDecision`
- `AuthorizationDecisionReason`

Names may follow existing code conventions; semantics must match.

## 5.2 Default business role templates

Seed/default templates using business-friendly labels and stable keys:

Platform:

- RehletShifaa Owner — `PLATFORM_OWNER`
- Access Governance Manager — `ACCESS_GOVERNANCE_MANAGER`
- System Administrator — `PLATFORM_ADMIN`
- Provider Operations Manager — `PROVIDER_OPERATIONS_MANAGER`
- Credential Verification Officer — `CREDENTIAL_VERIFIER`
- Journey Manager — `JOURNEY_MANAGER`
- Journey Approver — `JOURNEY_APPROVER`
- Care Coordination Manager — `CARE_COORDINATION_MANAGER`
- Compliance & Audit Reviewer — `COMPLIANCE_AUDITOR`
- Support Officer — `SUPPORT_AGENT`

Provider:

- Organization Owner — `ORGANIZATION_OWNER`
- Practice Manager — `PRACTICE_MANAGER`
- Consultant — `CONSULTANT`
- Associate Doctor — `ASSOCIATE_DOCTOR`
- Consultant Assistant — `CONSULTANT_ASSISTANT`

Care journey:

- Care Coordinator — `COORDINATOR`
- Operations Specialist — `OPERATIONS`
- Finance Officer — `FINANCE`

System:

- Integration Service Account — `SERVICE_ACCOUNT`

Keep compatibility mappings from existing realm/`ActorRole` names such as `DOCTOR`, existing credentialing/admin/lead roles, etc. Do not break existing logins. Build a migration/adapter layer and phase out role-name checks gradually.

## 5.3 Permission catalog

Engineering-owned registered capabilities; configuration can only select registered keys.

Define capabilities at a practical business-action level, not one giant `manage_everything` permission.

Examples/families:

```text
provider.view
provider.create
provider.update
provider.activate
provider.suspend
provider.member.invite
provider.member.deactivate
provider.clinician.invite
provider.practice_staff.manage

credential.submit
credential.view
credential.review
credential.request_information
credential.verify
credential.reject
credential.suspend

availability.view
availability.manage
availability.manage_self
appointment.view
appointment.schedule
appointment.reschedule
appointment.cancel

service_catalog.view
service_catalog.manage
price_list.view
price_list.manage
price_list.publish

clinical.case.view
clinical.document.view
clinical.recommendation.draft
clinical.recommendation.submit
clinical.outcome.record

finance.deposit.view
finance.deposit.confirm
finance.deposit.waive
finance.deposit.refund
finance.reconcile

journey.view
journey.create
journey.edit_draft
journey.validate
journey.simulate
journey.submit
journey.approve
journey.publish
journey.retire
journey.instance_migrate

assignment.team.view
assignment.team.manage
assignment.policy.view
assignment.policy.manage
assignment.simulate
assignment.manual_assign
assignment.reassign
assignment.audit.view

access.role.view
access.role.create
access.role.edit_draft
access.role.simulate
access.role.publish
access.assignment.manage
access.effective_access.view

audit.view
support.account.view
support.invitation.resend
```

Use actual existing business operations when available and avoid duplicate synonym permissions.

## 5.4 Permission metadata

Each capability must expose metadata to wizard/UI:

- business label;
- help text;
- domain/category;
- risk;
- allowed scopes;
- compatible actor types;
- compatible channels;
- dependencies;
- conflicts;
- workflow-gated flag;
- recent-auth/MFA requirement when applicable.

## 5.5 Scope

Implement standard scope semantics:

- `SELF`
- `ASSIGNED_CASES`
- `MANAGED_CLINICIANS`
- `ORGANIZATION`
- `ASSIGNED_ORGANIZATIONS`
- `SPECIFIC_RESOURCE`
- `PLATFORM`

Every tenant-sensitive role assignment must have explicit scope. `PLATFORM` is exceptional and audited.

## 5.6 Relationships

Implement auditable relationships at least:

- `MANAGES`
- `SUPERVISES`
- `ASSISTS`
- `COORDINATES`
- `ASSIGNED_TO`
- `PREFERRED_COORDINATOR`
- `PREFERRED_COORDINATOR_TEAM`
- `VERIFIES`
- `REPRESENTS` (reuse existing representative model when present)

Do not duplicate existing patient representative domain.

## 5.7 Authorization service

Create a central backend authorization decision path.

Pseudo-contract:

```text
authorize(subject, capability, resourceContext)
 -> ALLOW or DENY + reason codes
```

Evaluate:

1. authenticated identity;
2. active account/membership;
3. capability grant through role template/version/assignment;
4. tenant/resource scope;
5. relationship if required;
6. resource attributes;
7. workflow/current WorkItem action if capability is workflow-gated;
8. additional security conditions (recent auth, status, conflict).

Default deny.

Do not trust frontend role/owner/tenant fields.

## 5.8 Migration from existing `ActorRole` checks

Inventory every `ActorContext.require`, `hasRole`, realm role check, or equivalent.

Classify:

- bootstrap identity/coarse system role;
- true business permission;
- workflow-state permission;
- lead/escalation behavior.

Create compatibility mapping so existing users keep functioning. Migrate endpoint/service authorization incrementally to capability checks. Do not delete legacy enum values until all usage is proven obsolete and tests pass.

## 5.9 Role configuration wizard

Implement 11-step wizard:

1. Purpose
2. Base Template
3. Capabilities
4. Scope
5. Relationships
6. Sensitive Data
7. Journey Participation
8. Channels
9. Constraints & Conflicts
10. Simulate
11. Review & Publish

Requirements:

- draft save/resume;
- role versioning;
- immutable published version;
- effective date/retirement;
- permission dependencies auto-added with explanation;
- conflicts blocked/warned according to severity;
- self-verification prohibited;
- no privilege escalation beyond platform-defined maximum envelope;
- human-readable effective access preview;
- before/after diff;
- simulation returns ALLOW/DENY + explanation;
- backend validation duplicates critical frontend checks.

---

# 6. PROVIDER MANAGEMENT — COMPLETE REQUIREMENTS

## 6.1 Provider organization

Implement/reuse `ProviderOrganization` with:

- stable ID;
- display/legal name as applicable;
- type (solo practice, group practice, clinic, hospital; extensible);
- status lifecycle;
- country/time zone/default currency where needed;
- onboarding/readiness metadata;
- audit.

A Consultant is never the tenant itself.

## 6.2 Membership

Implement organization membership with:

- user/Keycloak subject link;
- organization;
- business role assignments/version;
- active/effective dates;
- invitation state;
- who invited/activated/deactivated;
- no cross-tenant leakage.

Reuse current staff/doctor seeds and profiles. Migration must map them; do not create duplicate accounts.

## 6.3 Clinician model

Distinguish:

- Consultant / Doctor — final/senior configured clinical authority;
- Associate Doctor — independently licensed clinician under explicit Consultant supervision where configured;
- Consultant Assistant — support, not automatically licensed/final authority.

Explicit clinician/staff relationships must be data, not implicit naming.

## 6.4 Provider onboarding orchestration

Provider Operations Manager flow:

1. Create provider organization.
2. Add/invite organization owner.
3. Invite Lead Consultant/clinicians.
4. Clinician completes profile and credentials.
5. Credential Verification Officer verifies required evidence.
6. Add Practice Manager/staff.
7. Configure services/pricing.
8. Configure availability.
9. Configure Coordinator/routing preference or accept platform default.
10. Backend computes readiness.
11. Activate provider.

Provider activation must reject when mandatory readiness blockers remain.

## 6.5 Credential verification

Implement explicit verification records/lifecycle.

Support:

- credential types and required-by-clinician-type policy;
- secure evidence documents using existing document infrastructure;
- issuer/jurisdiction/reference/issue/expiry;
- status;
- verifier;
- reason/comments;
- request more information;
- expiry monitoring;
- self-verification prohibition;
- clinical eligibility check.

Verify action should require the appropriate capability and recent authentication if current project patterns use it for comparable high-risk actions.

## 6.6 Practice Manager

Default permissions allow configured-scope management of:

- administrative provider/clinician profile fields;
- weekly availability;
- availability exceptions;
- appointment scheduling/changes under policy;
- services;
- price lists;
- permitted practice staff/assistants;
- operational provider reporting.

No clinical-finalization, credential verification, finance settlement, journey publish, or platform-wide access by default.

## 6.7 Pricing

Reuse current `PricingCatalogService`/catalog entities and current proposal pricing behavior.

Enhance, do not replace, so pricing can resolve from:

- organization default;
- Consultant override;
- Associate Doctor override where allowed.

Requirements:

- service;
- clinician/provider scope;
- amount + currency;
- effective period;
- state/version;
- created/changed/published by;
- optional Consultant approval policy;
- audit;
- historical proposal snapshots unchanged.

Existing internal EGP/margin/FX/release logic remains authoritative for patient proposals according to current workflow docs.

## 6.8 Availability

Implement/reuse model for:

- recurring weekly slots;
- timezone;
- clinician/service/mode/location association where needed;
- exceptions/leave/blocked time/one-off availability;
- effective date;
- overlap validation;
- audit;
- future appointment integration.

Practice Manager is default editor; Consultant self-management is a configurable permission.

---

# 7. COORDINATOR TEAMS & ASSIGNMENT ENGINE

## 7.1 Team model

Implement `CoordinatorTeam` and membership with:

- name/purpose;
- active state;
- team lead(s);
- members;
- care-area eligibility;
- languages;
- region/timezone/business-hours attributes when available;
- capacity configuration;
- fallback/escalation team;
- audit.

## 7.2 Preferences/mappings

Support:

- Consultant → preferred Coordinator;
- Consultant → preferred Coordinator Team;
- Provider → default Coordinator Team;
- Care Area → default Coordinator Team;
- platform default team/policy.

Preferences are effective-dated and auditable.

## 7.3 Routing policy model

Versioned policy contains:

- precedence rules;
- strict eligibility rules;
- weighted scoring factors;
- tie-break policy;
- queue/fallback behavior;
- policy effective date/status;
- audit.

Do not execute administrator-supplied scripts/expressions. Use registered factor keys and safe typed configuration.

## 7.4 Routing precedence

Implement default behavior:

1. existing eligible Case Owner / continuity;
2. valid manual case override;
3. eligible preferred Coordinator;
4. preferred Coordinator Team;
5. provider mapping;
6. care-area/default team;
7. eligible-pool scoring;
8. unassigned team queue + Care Coordination Manager alert.

## 7.5 Eligibility

Candidate filtering checks applicable:

- active user/membership;
- Coordinator capability;
- organization/platform scope;
- team membership;
- care area;
- language when policy marks mandatory;
- shift/availability if modeled;
- not suspended/leave;
- remaining capacity;
- no access-governance conflict.

## 7.6 Scoring

Seed configurable factor keys such as:

- `CONSULTANT_AFFINITY`
- `PATIENT_CONTINUITY`
- `CARE_AREA_MATCH`
- `LANGUAGE_MATCH`
- `TIMEZONE_SHIFT_MATCH`
- `CAPACITY_SCORE`
- `WORKLOAD_PENALTY`
- `SLA_FIT`
- `PROVIDER_FAMILIARITY`
- `PRIORITY_FIT`

Weights live in policy version data. Validate weight ranges and normalization rules.

Start deterministic. No ML/AI selection in v1.

## 7.7 Tie-break

Default deterministic tie-break:

1. lowest normalized load/capacity;
2. longest since last automatic assignment;
3. stable ID last.

## 7.8 Assignment decision audit

Persist explanation:

- case/work item;
- actor type needed;
- routing policy/version;
- source precedence path;
- candidate eligibility/exclusion codes;
- scores;
- selected team/person;
- manual override/reassignment reason;
- timestamp/correlation.

## 7.9 Case owner distinction

Preserve one active primary Coordinator as Case Owner. Do not transfer case ownership merely because another WorkItem is currently owned by Operations/Finance/Consultant.

## 7.10 Concurrency

Automatic routing must not assign the same WorkItem twice due to concurrent events. Use transaction/optimistic locking/advisory current pattern as appropriate. Retry must be idempotent.

---

# 8. JOURNEY MANAGEMENT — COMPLETE REQUIREMENTS

## 8.1 Scope

Implement one initial platform journey:

```text
INTERNATIONAL_CARE
```

It is global RehletShifaa product configuration, not per-Consultant configuration.

Do not implement multiple speculative journeys yet. Architecture must allow future templates such as Second Opinion or Video Consultation.

## 8.2 Current behavior parity first

Map current hardcoded journey/case transitions, gates, recovery paths, WorkItems, notifications, proposal approvals, patient conversion, deposit, travel, final assessment/quote, treatment/follow-up.

Create `International Care Journey v1` representing current behavior. Do not change the business process merely because it is moved into configurable orchestration.

## 8.3 Business graph model

Implement application-owned safe graph entities:

- definition;
- version;
- node;
- edge/transition;
- stage/action bindings;
- actor type;
- stage configuration;
- SLA/timer;
- notifications;
- validation/simulation metadata;
- deployment/runtime link;
- case instance/version binding.

Published graph snapshot is immutable/hashable.

## 8.4 Stage types

Business palette:

- Start
- Staff Task
- Patient Action
- Consultant/Clinical Task (can be a configured Staff Task subtype if cleaner)
- Decision
- System Action
- Wait for Event
- Timer/SLA
- Notification
- End

Do not expose implementation class names.

## 8.5 Registered stage/action catalog

Build a typed registry from existing domain operations. Each entry declares:

- stable key;
- business label/description;
- allowed actor types;
- required permission(s);
- configuration schema;
- expected outcomes/transition ports;
- workflow-safe domain handler;
- supported channels/renderers metadata if useful;
- audit/notification behavior.

No arbitrary Java/SQL/SpEL/script execution from configuration.

## 8.6 Runtime: Flowable OSS

Preferred runtime is Flowable OSS BPMN process engine embedded in Spring Boot behind `JourneyRuntimePort`.

### Preflight

- Inspect actual Spring Boot/Java versions.
- Inspect local Maven cache.
- Choose/pin a compatible Flowable OSS 7.x process-engine version.
- Add only `flowable-spring-boot-starter-process` or the minimal equivalent; do not pull all engines/IDM/REST without need.
- RehletShifaa APIs remain the only browser/mobile business API; never expose Flowable REST publicly.

### Flowable database

Keep engine-internal schema lifecycle separate from application Flyway-owned business tables. Follow the supported Flowable schema-management approach for the chosen version; do not handcraft Flowable internal tables as JPA entities.

### Business graph compilation

On publish:

1. validate RehletShifaa business graph;
2. compile to deterministic BPMN 2.0;
3. compute/store graph+BPMN hash;
4. deploy to Flowable;
5. store deployment/process definition metadata;
6. mark version published atomically only after successful deployment;
7. audit.

Never allow a partially published version.

## 8.7 Version lifecycle

Support:

`DRAFT → VALIDATED → SIMULATED → PENDING_APPROVAL → PUBLISHED → RETIRED`

Business rules:

- draft editable;
- published immutable;
- new changes start new version;
- new cases bind to active version;
- running cases stay pinned;
- explicit migration is privileged and deferred until compatible migration support is implemented/tested;
- publishing a new version must not mutate existing case instances.

## 8.8 Validation

At minimum detect:

- zero/multiple start nodes;
- no reachable end;
- unreachable node;
- accidental dead end;
- illegal/unbounded cycle;
- missing actor;
- missing capability/action;
- invalid outcome mapping;
- invalid decision branch completeness;
- invalid timer/SLA;
- missing mandatory notification config;
- incompatible actor/permission;
- unsupported stage config;
- duplicated node key;
- dangerous change from prior version requiring approval warning.

## 8.9 Simulation

Purely synthetic/no real case mutation.

Input may include:

- care area;
- pricing path (catalog/manual);
- travel requested;
- patient continues/declines/revision;
- additional info needed;
- deposit required/waived;
- other safe decision fixtures.

Output:

- path;
- actor handoffs;
- generated conceptual WorkItems/PatientActions;
- waiting-on changes;
- actions/gates;
- end state;
- warnings.

## 8.10 Integration with existing WorkItems/current actions

Flowable is orchestration, not UI state storage replacement.

When a human stage activates, create/use the existing WorkItem model as the operational projection. WorkItem contains actor type/team/person, due date, blocking status, status, and task type.

Assignment Engine resolves specific person/team when actor type requires it.

WorkItem completion invokes registered domain command and then completes/advances journey runtime transactionally/idempotently as architecture permits.

Backend returns authoritative `currentAction`, `availableActions`, `waitingOn`, `blockers` projections; clients do not infer from case status.

## 8.11 Case status compatibility

Do not remove current macro status model immediately. Map journey stages to current macro statuses where needed and keep dedicated sub-workflow state in dedicated tables.

Run configurable journey in parity/shadow verification before cutover.

Existing active cases should remain on legacy path or explicitly pinned/migrated only after proven safe. New synthetic/new cases can be enabled incrementally.

---

# 9. ADMIN UI/UX — COMPLETE SPECIFICATION

## 9.1 Product experience

Create a unified **Platform Control Center** using the current RehletShifaa authenticated design language.

Primary sections:

- Overview
- Providers
- Access & Roles
- Journeys
- Care Coordination
- Governance & Audit

Only show sections/actions supported by backend effective permissions.

## 9.2 UI principles

- International healthcare operations: calm, credible, precise, safe.
- Same RehletShifaa pearl/deep-teal/pale-aqua/warm-ivory visual family.
- Operational density without clutter.
- One dominant action per business state.
- Progressive disclosure.
- Business language first, technical keys only in Advanced/Audit.
- No generic card wall.
- No giant typography.
- No gradients/glow as primary design.
- No fake metrics.
- No stock imagery.
- Meaningful visualizations instead of text walls.

## 9.3 Required frontend library

Add `@xyflow/react` for Journey Designer. Keep keyboard accessibility enabled. Use custom RehletShifaa nodes.

Optional `@dagrejs/dagre` only for auto-arrange if justified.

Reuse existing React Hook Form, Zod, Lucide, Tailwind/current CSS, Vitest, Playwright.

Do not add a heavy chart library.

## 9.4 Overview page

Use compact operational summary:

- providers onboarding / blocked;
- credential reviews requiring action;
- journey draft/approval state;
- unassigned coordination work;
- routing exceptions;
- role/access changes pending approval if implemented.

Every tile/list links to actionable queue; no vanity KPI.

## 9.5 Provider list/detail

Provider list columns/filters:

- name;
- type;
- status;
- owner;
- active clinicians;
- credential/readiness blockers;
- routing setup;
- last update.

Provider detail sections:

- Overview/readiness;
- Clinicians;
- Practice staff;
- Credentials;
- Services & Pricing;
- Availability;
- Coordination preferences;
- Audit.

## 9.6 Provider onboarding wizard

Steps:

1. Organization
2. Owner
3. Clinicians
4. Credential Verification
5. Practice Team
6. Services & Pricing
7. Availability
8. Care Coordination
9. Readiness
10. Activate

Support save/resume. Backend readiness authoritative. Block activation with explicit business blockers.

## 9.7 Credential Verification queue/detail

Queue supports search/filter/status/expiry/provider/care area where useful.

Detail page:

- clinician summary;
- provider;
- credentials list;
- secure document preview/download according to existing security;
- metadata/expiry;
- verification history;
- decision panel.

Decision actions:

- Verify
- Request more information
- Reject/Suspend as supported

Require reason where appropriate. Prevent self-verification in UI and backend.

## 9.8 Access & Roles pages

Pages:

- Role Templates
- Permission Catalog (readable registry)
- User Effective Access
- Role Version History
- Access Audit

Role wizard 11 steps exactly as blueprint.

Visualizations:

- capability-domain map;
- scope diagram;
- relationship chips/lines with clear labels;
- risk summary;
- effective access `Can / Cannot` panel;
- version diff.

## 9.9 Journey list/version page

Show:

- journey name/key;
- current published version;
- draft version;
- status;
- last publisher/date;
- active case count per version when safely computable;
- actions based on capability.

Version detail:

- read-only graph;
- version metadata;
- validation results;
- change diff;
- simulation history or last result;
- deployment metadata in Advanced view;
- audit.

## 9.10 Journey Designer

Three-pane desktop layout:

- left Stage Palette;
- center React Flow canvas;
- right Stage Configuration inspector.

Header:

- journey name/version/status;
- saved indicator;
- Undo/Redo;
- Validate;
- Simulate;
- Submit for approval;
- Publish only for appropriate actor/state.

Canvas:

- top-to-bottom default flow;
- minimap optional if helpful;
- zoom/fit;
- custom business nodes;
- clear selected state;
- error/warning badges;
- no raw BPMN jargon.

Inspector config depends on node type:

- Name / description
- Actor Type
- Registered Stage/Action
- Blocking/optional
- Entry conditions (safe registered fields/rules only)
- Outcomes/transitions
- SLA/due rule
- Reminder/escalation
- Notifications
- Assignment hint/team policy where relevant
- Advanced immutable technical key

Accessibility:

- React Flow node/edge focus enabled;
- keyboard selection/movement;
- add/move/remove controls available without drag;
- structured stage-list editor for narrow mobile;
- no color-only semantics;
- localized ARIA labels EN/AR.

## 9.11 Journey Simulation

Side panel or full-screen mode:

- choose synthetic scenario fields;
- Run Simulation;
- highlight traversed graph path;
- show ordered event timeline;
- show decisions/branch reasons;
- show actor handoffs;
- show validation warnings;
- never create a real patient/case.

## 9.12 Care Coordination — Teams

Team list/detail:

- team name;
- lead;
- members;
- care areas;
- languages;
- capacity;
- active workload;
- unassigned queue;
- fallback team;
- audit.

## 9.13 Routing policy UI

Use an ordered waterfall visualization for routing precedence. Each rule is reorderable only within safe constraints and has an explanation.

Weights section:

- factor label;
- weight;
- strict vs scoring where applicable;
- validation;
- safe default reset;
- version diff.

Do not show raw formulas unless Advanced view.

## 9.14 Consultant routing preference UI

Within Provider/Clinician detail allow authorized user to set:

- preferred Coordinator;
- preferred Coordinator Team;
- inherit provider default;
- no preference.

Show fallback behavior clearly.

## 9.15 Assignment simulation/audit

Simulation:

- synthetic Consultant/provider/care area/language/priority/continuity;
- candidate list;
- excluded reasons;
- score breakdown;
- selected result;
- no state mutation.

Audit:

- real case/work item;
- policy/version;
- route path;
- selected person/team;
- explanation;
- manual overrides;
- reassignment history.

## 9.16 Responsive/RTL

Validate 390, 768, 1024, 1280, 1440 widths.

Journey graph editing on mobile uses list/editor alternative; do not squeeze three panes into 390px.

Arabic RTL:

- layout direction and iconography checked;
- labels localized;
- graph remains top-to-bottom to avoid confusing flow reversal;
- numbers/currency/time remain correct;
- tables/forms/dialogs intentional, not mechanically mirrored.

## 9.17 Accessibility

WCAG 2.2 AA critical workflows.

Test keyboard-only operation, focus order, modal focus trapping, labels/errors, 200% zoom, non-drag journey editing, target size, contrast, and screen-reader descriptions for graph nodes.

---

# 10. API / CONTRACT RULES

- Existing API gateway remains the business API entry point.
- No frontend direct-database/Flowable/Keycloak Admin API calls.
- No raw Flowable runtime endpoints exposed to browser.
- DTOs never expose internal authorization secrets, provider cost/margin, unsafe audit payloads, or cross-tenant IDs unnecessarily.
- Use server-side filtering by authorized tenant/scope; do not fetch everything and filter client-side.
- Pagination for potentially large provider/audit/assignment lists.
- Error model consistent with current project.
- Conflict (`409`) for stale version/concurrency where appropriate.
- Optimistic version fields/ETags/current project equivalent for editable drafts/rules.

---

# 11. DATABASE / MIGRATION RULES

Before writing migration:

```bash
ls backend/src/main/resources/db/migration
```

Determine latest migration. Add next additive migration(s). Never edit historical migrations.

Follow repository H2/PostgreSQL compatibility rules.

Important indexes/constraints:

- provider membership uniqueness/effective active semantics;
- clinician/provider link;
- no duplicate active relationship where prohibited;
- journey key + version unique;
- one published active version according to policy;
- routing policy key/version unique;
- team membership lookup;
- case journey binding;
- assignment decision lookup by case/work item;
- price effective-date resolution;
- credential status/expiry queue.

Add foreign keys where compatible with existing lifecycle and soft-delete strategy.

---

# 12. SECURITY RULES

- Deny by default.
- Authorize every sensitive backend request.
- Explicit tenant isolation independent from authentication.
- IDOR tests for every resource family.
- Provider Operations Manager sees only assigned organizations unless explicit platform permission.
- Practice Manager sees/manages only authorized organization/clinicians.
- Associate Doctor/Assistant cannot elevate to Consultant final authority by changing IDs.
- Credential Verifier cannot verify self.
- Organization Owner cannot create platform roles.
- Journey Manager cannot publish unless also has publish capability/approved route.
- System Administrator does not imply patient/clinical authority.
- Support Agent has no silent impersonation.
- Manual coordinator reassignment requires permission and reason.
- Workflow/role/journey publishing is audited and should use recent-auth/MFA where current auth stack supports it.
- No admin-authored executable scripts/SQL/Java/URLs in configurable rules.

---

# 13. TESTING REQUIREMENTS

## 13.1 Backend unit tests

At minimum:

- permission dependencies/conflicts;
- policy evaluation by scope/relationship;
- role version lifecycle;
- provider readiness;
- credential transitions/self-verification block;
- price inheritance/effective versions;
- availability overlap rules;
- routing eligibility;
- routing scoring and tie-break;
- continuity/preference/fallback;
- journey graph validation;
- graph compiler deterministic output;
- journey version lifecycle;
- stage/action registry validation.

## 13.2 Integration tests

At minimum:

- cross-tenant authorization;
- existing Keycloak/legacy role compatibility mapping;
- provider onboarding end-to-end;
- clinician verification → activation eligibility;
- Practice Manager scoped operations;
- Associate Doctor/Assistant boundary;
- route a case to preferred Coordinator;
- preferred unavailable → team/scoring fallback;
- no eligible Coordinator → queue + alert;
- concurrent assignment idempotency;
- International Care Journey V1 parity for existing major happy/recovery paths;
- journey publish doesn't mutate running case version;
- WorkItem actor assignment and `availableActions`;
- current proposal/payment/identity flows remain green.

## 13.3 Frontend component tests

- role wizard dependencies/conflicts/summary;
- provider readiness blockers;
- credential decision validation;
- Journey Designer node add/configure/remove/non-drag reorder;
- validation errors;
- routing weights/precedence;
- simulation output;
- EN/AR critical content.

## 13.4 Playwright E2E

Create/add focused E2E scenarios:

### Governance / provider scenario

Platform user → create provider → invite Consultant → upload/seed safe test credential → verifier verifies → add Practice Manager → configure pricing/availability → set Coordinator preference → provider ready/active.

### Access scenario

Create/clone restricted Practice Manager role → remove pricing permission → publish → assign → verify pricing UI/action denied while availability remains allowed.

### Journey scenario

Clone current journey → insert a supported optional test stage in draft → validate → simulate → publish test version in isolated fixture → start new synthetic case → verify version binding and generated work; existing synthetic older case stays on prior version.

### Assignment scenario

Case for Consultant with preferred Coordinator → preferred eligible → assignment correct; then fixture preferred unavailable → fallback algorithm selected with explainable audit.

### Security scenario

Attempt cross-provider access and direct API mutations with wrong role/scope → 403/no data leak.

Run existing critical end-to-end commercial/patient journeys after cutover.

## 13.5 Accessibility/RTL

Automated and manual checks for key admin screens. Journey editing must have keyboard/non-drag path.

---

# 14. IMPLEMENTATION PHASES

Execute the following phases sequentially. Do not compress into one giant patch.

## Phase 0 — Branch, inventory, persistent design

Deliver:

- new branch from current branch;
- docs copied/created;
- exact inventory of current roles/checks;
- current provider/doctor/staff entities;
- current price catalog;
- current coordinator ownership/assignment behavior;
- current WorkItem/currentAction behavior;
- current journey transition source;
- current migration number;
- Flowable dependency compatibility/cache preflight;
- technical decision document;
- implementation plan tied to exact files/modules.

No broad business refactor yet.

## Phase 1 — Access Governance foundation

Deliver:

- permission registry/metadata;
- role template/version entities;
- scope/relationship primitives;
- role assignment;
- central authorization service;
- legacy-role compatibility adapter;
- seeded default templates;
- audit;
- backend APIs for role/permission read/configuration;
- tests.

Migrate only representative/critical endpoints first, then expand in later phases without breaking existing flows.

## Phase 2 — Provider Management foundation

Deliver:

- provider organizations/memberships;
- existing clinician/staff migration mapping;
- Consultant/Associate Doctor/Assistant semantics;
- credential lifecycle;
- Provider Operations Manager onboarding services/APIs;
- Practice Manager relationships;
- pricing ownership/inheritance extension;
- availability model;
- readiness computation;
- tests.

## Phase 3 — Care Coordination / Assignment Engine

Deliver:

- Coordinator Teams;
- memberships/capacity metadata;
- Consultant/provider routing preferences;
- routing policy/version;
- eligibility/scoring/tie-break;
- explainable decision audit;
- queue/fallback;
- manual reassignment with reason;
- integration with case owner/current WorkItems;
- shadow comparison where legacy assignment exists;
- tests.

## Phase 4 — Journey domain/runtime and parity

Deliver:

- journey definition/version/nodes/edges;
- stage/action registry;
- validation/simulation;
- Flowable adapter/compiler/deploy;
- case version binding;
- WorkItem projection integration;
- `International Care Journey v1` matching current behavior;
- parity/shadow tests;
- no UI designer yet except minimal APIs.

Do not cut over all cases until parity gates pass.

## Phase 5 — Platform Control Center UI: Providers + Access

Deliver polished responsive/RTL:

- control-center shell/nav;
- Provider list/detail;
- onboarding wizard;
- credential queue/detail;
- Practice team/relationships;
- pricing/availability surfaces leveraging existing components;
- role list/wizard/effective access/simulation;
- tests.

## Phase 6 — Platform Control Center UI: Journey + Care Coordination

Deliver:

- Journey list/version;
- React Flow Journey Designer;
- inspector/palette;
- keyboard/non-drag editing;
- validation/simulation/diff/publish;
- Coordinator Team UI;
- Routing Policy UI;
- Consultant routing preference UI;
- routing simulation;
- assignment audit/unassigned queue;
- tests.

## Phase 7 — Controlled cutover / client authorization cleanup

Deliver:

- configurable journey enabled for safe/new synthetic/new cases according to migration plan;
- web clients use backend `capabilities`/`availableActions` rather than role/status inference where in scope;
- coordinator assignment engine authoritative after shadow validation;
- expand permission enforcement across relevant endpoints;
- remove only proven obsolete hardcoded logic;
- legacy current cases preserved/pinned;
- regression.

## Phase 8 — Hardening, release-quality verification and handover

Deliver:

- full backend impacted suite;
- frontend typecheck/tests;
- Playwright critical E2E;
- security/IDOR matrix;
- concurrency/idempotency;
- performance sanity for list/routing/graph operations;
- RTL/responsive/accessibility;
- audit verification;
- documentation;
- final defect report;
- no unresolved Blocker/Critical/High defect in the feature before handover.

---

# 15. PHASE GATES / COMMIT DISCIPLINE

After each phase:

1. run focused tests;
2. run broader impacted gate when shared schema/security/API changes warrant it;
3. update implementation status;
4. review `git diff --stat` and `git status`;
5. ensure no secrets/config credentials are staged;
6. make a coherent commit for the phase or logical sub-phase;
7. record commit SHA in status doc.

Do not commit unrelated pre-existing dirty files.

Suggested commit family:

```text
feat(governance): add configurable access foundation
feat(provider): add provider onboarding and credentialing
feat(coordination): add team routing and assignment policies
feat(journey): add configurable journey runtime
feat(admin): add platform control center provider and access UI
feat(admin): add journey and coordination designers
test(platform): add control-plane end-to-end regression
```

---

# 16. CODING QUALITY

- Controller → application/service → domain → repository.
- Thin controllers.
- Constructor injection.
- No field injection.
- No business logic in React components that belongs on backend.
- No direct JDBC in controllers/services; use repository/persistence layer.
- No God service named `AdminService` or `WorkflowService` containing everything.
- Use typed enums/value objects where stable; use configurable DB data where business customization is intended.
- BigDecimal for money.
- Explicit time zone for schedule data.
- Avoid N+1 queries on provider/role/audit lists.
- Pagination.
- Use optimistic locking for editable versioned drafts.
- Never trust client-calculated permission/readiness/routing state.

---

# 17. DO NOT DO

Do not:

- create one workflow per Consultant;
- allow practice staff to modify the global journey;
- create a `SUPER_ADMIN` bypass used by normal operations;
- make Keycloak the complete multi-tenant business authorization database;
- allow arbitrary script/expression execution from Journey/Role/Assignment configuration;
- create a generic low-code platform;
- replace existing proposal/payment/identity/document models;
- expose internal provider cost/margin;
- infer access only because a user has the same organization ID;
- infer journey action only from client-side case status;
- use AI/ML for coordinator assignment in v1;
- silently move running cases to new journey versions;
- expose Flowable APIs to frontend;
- add unnecessary microservices;
- add libraries merely for visual decoration;
- stop after implementing CRUD without operational enforcement.

---

# 18. FINAL DEFINITION OF DONE

The implementation is done only when:

- business roles/permissions are configurable and scoped;
- provider onboarding/credential verification is operational;
- Practice Manager can manage provider operations within scope;
- clinicians/staff relationships are explicit;
- existing pricing is extended safely and historical proposals remain stable;
- central Journey Management can modify supported platform stages without Java changes;
- current International Care Journey behavior is represented/versioned and proven with tests;
- published versions are immutable and running cases are pinned;
- Coordinator teams/routing preferences and algorithm work;
- assignment is deterministic/explainable/audited;
- specific Consultant → Coordinator preference works with fallback;
- case owner remains separate from active WorkItem owner;
- backend access and workflow availability jointly authorize sensitive actions;
- web/admin UI is professionally designed, responsive, EN/AR, accessible;
- critical IDOR/cross-tenant/security tests pass;
- existing commercial/patient journey regression remains green;
- docs/status are complete for future Consultant mobile to consume the same APIs later.

Do not report completion merely because screens render or migrations compile. Verify business outcomes end to end.
