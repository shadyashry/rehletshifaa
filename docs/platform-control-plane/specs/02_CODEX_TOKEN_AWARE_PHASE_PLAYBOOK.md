# Codex Token-Aware Execution Playbook — RehletShifaa Platform Control Plane

This playbook is designed for a large implementation where Codex context/token limits may be reached. The solution must survive fresh Codex sessions without repeating business/architecture discussions.

---

## 1. Principle

**The repository is the persistent memory. The chat is not.**

Do not send the full master prompt on every continuation. Put the canonical documents into the feature branch during Phase 0 and force every later session to read only the current handoff plus the relevant phase section.

Recommended repo folder:

```text
docs/platform-control-plane/
├── blueprint.md
├── master-implementation-spec.md
├── technical-decisions.md
├── migration-inventory.md
├── implementation-status.md
├── test-status.md
└── phase-notes/
```

---

## 2. Recommended Codex working model

Use **one fresh Codex session per major phase**, and split a phase again if the context becomes large.

Recommended maximum scope per session:

- one domain foundation; or
- one major admin UI area; or
- one migration/cutover; or
- one comprehensive verification pass.

Do not combine schema + all backend + all frontend + E2E in one unbounded session.

### Session/phase map

| Session | Phase | Main goal |
|---|---|---|
| 1 | 0 | Branch + targeted inventory + persistent docs + exact technical plan |
| 2 | 1A | Permission catalog, role/version/scope/relationship persistence |
| 3 | 1B | Authorization service + compatibility migration + APIs/tests |
| 4 | 2A | Provider org/membership/clinician relationships + migration |
| 5 | 2B | Credentialing + onboarding/readiness |
| 6 | 2C | Pricing/availability extension |
| 7 | 3 | Coordinator teams + routing/assignment engine |
| 8 | 4A | Journey graph/version/stage registry + validation/simulation |
| 9 | 4B | Flowable adapter/compiler/runtime + current journey V1 parity |
| 10 | 5A | Control Center shell + Provider onboarding/credential UI |
| 11 | 5B | Access Role Wizard + effective access UI |
| 12 | 6A | Journey Designer + validation/simulation/version UI |
| 13 | 6B | Care Coordination teams/routing/simulation/audit UI |
| 14 | 7 | Controlled cutover + availableActions/capability migration |
| 15 | 8 | Full hardening, E2E, security, RTL/a11y, defect closure |

Codex may combine adjacent sessions when context remains healthy and verification is small, but must not compromise the phase gates.

---

## 3. Exact first-session kickoff prompt

Send Codex the three package Markdown files, then paste only this:

```text
Implement the RehletShifaa Platform Control Plane described in the attached/canonical Markdown files.

This first session is PHASE 0 ONLY. Do not start broad implementation yet.

Mandatory start:
1. Read repository AGENTS.md first.
2. Read CLAUDE.md if present.
3. Read the Final Platform Blueprint and Master Implementation Prompt.
4. Inspect the current checked-out branch and working tree.
5. Create a NEW branch from the exact current checkout, not from main. Preferred name: codex/platform-control-plane. Never reset/stash/discard unrelated user work.
6. Create docs/platform-control-plane/ and copy/persist the canonical design/spec there.
7. Read docs/commercial-workflow-status.md and only the required sections of end-to-end-workflows.md / architecture.md.
8. Perform targeted inventory only: current role checks, ActorRole/ActorContext, current doctor/provider/staff models, credentialing, pricing catalog, availability if any, coordinator ownership/assignment, WorkItems/currentAction, journey transitions, audit/outbox, admin UI routes, latest Flyway migration.
9. Perform the Flowable OSS dependency compatibility/cache preflight described in the master spec. Do not install a random version.
10. Write:
   - docs/platform-control-plane/technical-decisions.md
   - migration-inventory.md
   - implementation-status.md
   - test-status.md
11. implementation-status.md must contain NEXT EXACT ACTIONS for Phase 1A with exact files/modules anticipated.
12. Run no destructive command and do not delete volumes/secrets.

Do not ask me to choose architecture already decided in the spec. Reconcile implementation details against existing code and document the decision.

At the end give me only: branch created, inventory summary, technical decisions, blockers if any, tests/checks run, and NEXT EXACT ACTIONS.
```

---

## 4. Exact continuation prompt for every later session

Use this instead of resending the full design:

```text
Continue the RehletShifaa Platform Control Plane implementation from the repository handoff.

Mandatory:
1. Read AGENTS.md.
2. Read CLAUDE.md if present.
3. Read docs/platform-control-plane/implementation-status.md.
4. Read docs/platform-control-plane/technical-decisions.md.
5. Read only the relevant phase section from docs/platform-control-plane/master-implementation-spec.md and blueprint.md.
6. Confirm current branch is the platform-control-plane feature branch and do not switch back to main/base.
7. Execute the NEXT EXACT ACTIONS from implementation-status.md.
8. Preserve current business behavior outside the phase.
9. Run the phase's focused tests and required shared-security/schema checks.
10. Update implementation-status.md and test-status.md before ending.
11. Commit only coherent phase changes; do not include unrelated pre-existing dirty files.
12. End with the next exact actions for the following session.

Do not rediscover the entire repository, do not reopen unrelated docs, and do not ask business-design questions already answered by the canonical spec.
```

---

## 5. Phase 1A prompt — Access persistence

If a session needs more explicit scope, append:

```text
This session scope is Phase 1A only:
- registered Permission Catalog + metadata
- RoleTemplate / RoleTemplateVersion
- role-permission grants
- scope types
- relationship primitives
- RoleAssignment
- default seeded business templates
- Flyway migrations
- repositories/domain/services needed for persistence
- unit/integration tests for lifecycle, uniqueness, versioning and tenant boundaries

Do not migrate every endpoint yet. Do not build the UI yet. Keep legacy role compatibility intact.
```

## 6. Phase 1B prompt — Authorization service / migration

```text
This session scope is Phase 1B:
- central authorization decision service
- effective-access explanation
- dependencies/conflicts/risk rules
- legacy ActorRole/ActorContext compatibility mapping
- migrate a representative set of high-risk endpoints, then systematically continue only as context permits
- access APIs: permission catalog, role drafts/versions, simulation/effective access
- cross-tenant/IDOR tests
- update migration inventory showing remaining hardcoded role checks

Do not delete legacy roles until all call sites are migrated and regression is green.
```

## 7. Phase 2A prompt — Provider foundation

```text
Implement Provider Organization, memberships and explicit clinician/staff relationships.
Migrate/reuse existing doctor/staff profiles and seeded users; do not duplicate identities.
Introduce Consultant, Associate Doctor, Practice Manager, Consultant Assistant semantics through configurable role templates and relationships.
Implement Provider Operations Manager scoped onboarding foundation.
Add migrations/APIs/tests. No credential UI yet unless required by dependency.
```

## 8. Phase 2B prompt — Credentialing/readiness

```text
Implement clinician credential lifecycle using existing secure document infrastructure, self-verification prohibition, verifier evidence/audit, expiry status, and provider readiness computation.
Add provider onboarding services/APIs and credential verification queue APIs.
Preserve existing patient identity verification — this is practitioner credentialing, not patient identity.
```

## 9. Phase 2C prompt — Pricing/availability

```text
Extend existing pricing catalogue instead of replacing it.
Add provider default + Consultant override + optional Associate Doctor override with effective-dated versions and audit while preserving released proposal snapshots/current margin/FX logic.
Implement recurring weekly clinician availability + exceptions/timezone and scoped Practice Manager permissions.
Add tests including historical price stability.
```

## 10. Phase 3 prompt — Routing

```text
Implement Care Coordination Manager capabilities, CoordinatorTeam, memberships/capacity, Consultant/provider preferred Coordinator/team mappings, versioned routing policies, deterministic eligibility/scoring/tie-break, explainable AssignmentDecision, unassigned team queue/fallback, manual reassignment with reason, and case-owner continuity.
Integrate with existing case/WorkItem ownership in shadow-safe manner.
No AI/ML routing.
```

## 11. Phase 4A prompt — Journey domain

```text
Implement central JourneyDefinition/JourneyVersion/Node/Edge/application metadata, registered Stage/Action Catalog from existing domain operations, graph validation, synthetic simulation, version lifecycle, current International Care Journey V1 model, APIs/tests.
Do not expose arbitrary scripts/expressions.
Do not cut over runtime yet.
```

## 12. Phase 4B prompt — Flowable/runtime parity

```text
Implement the approved Flowable OSS process-engine adapter behind JourneyRuntimePort after dependency preflight.
Compile deterministic RehletShifaa business graph to BPMN, deploy atomically on publish, bind case instances to exact journey version, project human stages to existing WorkItems, and integrate domain action handlers.
Run parity/shadow tests against current hardcoded journey across happy and recovery paths.
Do not move existing active cases silently.
```

## 13. Phase 5/6 UI prompts

Use the Master Spec exact UI sections. Explicitly tell Codex:

```text
Do not produce generic admin cards. Implement the exact business workflows and visualizations defined in the canonical spec using the existing RehletShifaa theme. Use @xyflow/react only for Journey Designer. No stock images, no decorative chart library. All controls must have backend behavior and tests. Validate desktop/tablet/mobile and Arabic RTL. Journey editing must have a non-drag accessible alternative.
```

---

## 14. End-of-session handoff format — mandatory

Codex must write this to `implementation-status.md`, not only chat:

```markdown
# Platform Control Plane Implementation Status

## Branch
- Current:
- Base branch:
- Base SHA:

## Current phase

## Completed
- ...

## Changed modules/files
- ...

## Database migrations
- ...

## APIs/contracts
- ...

## Compatibility / migration state
- Remaining legacy role checks:
- Journey legacy/parity state:
- Routing cutover state:

## Tests executed
| Test | Result | Notes |
|---|---|---|

## Known pre-existing failures
- ...

## New defects/blockers
- ...

## Decisions made this phase
- ...

## NEXT EXACT ACTIONS
1. ...
2. ...
3. ...
```

---

## 15. How to avoid token waste

Codex should:

- use `rg`/targeted symbol search, not dump directory trees repeatedly;
- inspect exact controller/service/repository around the capability;
- not paste long logs into chat/status;
- store decisions in docs once;
- avoid reading the full Master Spec every session;
- run focused test class/module first;
- run broader regression only when shared security/schema/journey changes justify it;
- not regenerate already accepted UI architecture;
- not repeatedly explain existing project architecture to the user.

If a phase starts approaching context limits, stop at a coherent tested commit, update status with remaining exact actions, and continue in a fresh session. Do not rush the rest into an unverified patch.

---

## 16. Hard blockers vs normal decisions

Codex should NOT ask user about:

- class/package naming that can follow repo conventions;
- minor layout choices already defined;
- whether to use configurable roles vs hardcoded roles;
- whether Journey is global or per Consultant;
- whether assignment is deterministic vs AI;
- who owns credentialing/pricing/routing;
- whether existing active journeys should silently migrate (they should not).

Codex may stop/ask only when:

- a required external credential/account is unavailable;
- a destructive data migration would be required and there is no safe additive path;
- Flowable dependency cannot be acquired in the environment after approved preflight/bootstrap and runtime work cannot continue;
- repository state indicates unrelated unresolved merge/conflict/corruption;
- an actual business contradiction exists between production code/data and the canonical design and choosing either path could cause patient/financial/security harm.

---

## 17. Final merge/release sequence

Before declaring ready:

1. `git status` clean except intentional changes.
2. all feature migrations tested on fresh DB and upgrade path where feasible.
3. backend impacted/full suite green or all pre-existing failures precisely separated.
4. frontend typecheck + unit tests.
5. Playwright critical E2E including existing care workflow.
6. security/IDOR matrix.
7. concurrency/idempotency tests.
8. responsive/RTL/a11y review.
9. no Blocker/Critical/High feature defect.
10. final `implementation-status.md` set to COMPLETE with known Low/Medium only if explicitly acceptable.
11. summary of commits and migration numbers.
12. only then prepare PR/merge handover.
