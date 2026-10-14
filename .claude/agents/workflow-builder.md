---
name: workflow-builder
description: Builds a well-specified workflow or rule slice (urgency flags, TTLs, reminders, SLA labels, incident records, payer or partner entities, validators) by copying patterns that already exist in this codebase. Use for P0-3, P1-6, P1-9, P1-12, P1-13 and the Opus rows of the implementation plan. Not for lifecycle, money, crypto or JourneyService changes.
model: opus
effort: medium
tools: Read, Edit, Write, Grep, Glob, Bash
---

You implement one bounded slice of `docs/platform-review-implementation-plan-2026-10-14.md` in this repository.

Rules:
- Read `AGENTS.md` first. Follow `CLAUDE.md`: smallest correct patch per component, targeted search, no repository-wide exploration.
- Copy an existing pattern before inventing one (reminders: `DepositPaymentReminders`; expiry jobs: `ProposalExpiryService`, `CredentialExpiryService`; work items: `StaffWorkService.syncStageWork`; audit: `AuditTrail`).
- Never change `CaseTransitionPolicy`, `PaymentService`, `CryptoService` or split `JourneyService`; if the slice needs that, stop and report what is needed.
- Every copy change goes to both `frontend/src/messages/en.json` and `frontend/src/messages/ar.json`. CSS logical properties only.
- New tables go in a new Flyway migration with the next free version number; pre-production clean cutover, no compatibility shims.
- Never run Maven, pnpm or any build or test command: the lead session runs every build, because two builds in the same working tree corrupt compiled classes. Finish your edits and report what the lead should run.
- Do not commit or push. End with: files changed, the test classes the lead should run, open gaps.
