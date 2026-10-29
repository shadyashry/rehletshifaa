# Deep platform validation — checkpoint (run 2026-10-29)

Prompt: `docs/prompts/claude-deep-platform-validation.md`. This file is the resume point; update it at every slice
boundary. Evidence files in this folder: `requirements-matrix.csv`, `architecture-review.md`, `defects.md`,
`performance.md`, `production-readiness.md`, `report.md`.

## Baseline (verified 2026-10-29)

| Item | Value |
|---|---|
| Branch / commit at start | `feat/review-p0` @ `92a2a900` (in sync with origin) |
| User-owned working tree (never touched) | `rehletshifaa-brand-film/**`, `FinalPrompt.txt`, `docs/prompts/consultant-public-profiles-codex.md`, `docs/remaining-work-prioritized.md`, `docs/testers/`, `scripts/reset-dev-for-testers.sh` |
| Running stack at start | tunnel overlay; backend image 2026-10-29T12:49Z, frontend 12:50Z (built from `92a2a900`); Flyway V109 |
| Dev data | tester reset earlier on 2026-10-29: one case (RS-2026-000001), empty Mailpit, 0 facilities |
| Baseline gates | backend `mvn -o -q test` 1006 tests / 0 failures / 3 gated skips; frontend typecheck 0 errors; Vitest 100 files / 818 tests pass; lint 0 errors / 10 warnings |

## Completed

Slice 1 (2026-10-29, final revision `1b1307f5`): review AR-01..AR-16; D-01..D-08 fixed; gates; live public journey;
restore drill PASS 94 s. Slice 2 (QA stack, owner decisions): D-09..D-14 fixed, live journey intake → follow-up and
withdrawal/refund, per-user write budgets (D-11). Final slice (2026-10-30, "fix all open points"):

1. Live variants on the QA stack: change order, complication + concern + incidents, emergency admission, two teams,
   coordinator departure (all in `operations-gate-live`, 5/5). Stale live assertions fixed: `my-care-live`,
   `uat-walkthrough-live`, `portal-gateway-live` (+ `gateway.spec`), all green.
2. AR-07 scan bulkhead, AR-08 batched eligibility, AR-09 actor reuses the decision's roles (request memo rejected), AR-10
   no preview lock. D-15 seeded routing policy now has an end.
3. Fault drills (`raw/fault-drill.mjs`): Redis, Keycloak, ClamAV, MinIO, SMTP, PostgreSQL. D-16 (storage outage → 500) and
   D-17 (DB outage → 30 s hang) fixed and re-drilled.
4. D-10 UI visual check en/ar 390/1440 (`e2e/staff-document-upload.spec.ts`, `raw/shots/`); formerly stale mocked specs
   34/34.
5. Gates: backend full suite 1026 / 0 failures / 3 gated skips, PostgreSQL 17 proof, Vitest 819/819, typecheck 0, lint 0 errors.

## Fixture manifest (synthetic, dev stack)

| Case | Created by | State | Notes |
|---|---|---|---|
| RS-2026-000002 | live-intake run DPV-1029B | DRAFT | abandoned draft (MinIO PUT header bug in the script) |
| RS-2026-000003 | probe.mjs | DRAFT | presign contract probe |
| RS-2026-000004 | live-intake run DPV-1029C, family name `Dpvdpvbajcjc` | INTAKE_REVIEW (auto-routed) | 4 documents (1 real PDF, 3 spoof/EICAR probes accepted before D-06) |
| RS-2026-000005..000008 | submit-timing.mjs, family name `Dpvtiming` | INTAKE_REVIEW (auto-routed to the seeded coordinator) | submit latency probe |
| RS-2026-000009 | live-intake DPV-1029D (pre-D-08 build) | DRAFT, stuck (refused file) | evidence of D-08 |
| RS-2026-000010, 000011 | live-intake DPV-1029E/F (final build) | RECEIVED → auto-routed | final live evidence |

Tester impact: the auto-routed synthetic cases appear in the seeded coordinator's work list (name starts with `Dpv`).

## Isolated QA stack (live staff journeys)

- Start: `docker compose -p rehletshifaa-qa -f docker-compose.yml -f docker-compose.qa.yml up -d` (volumes kept; stopped
  at the end of this run). URLs: web http://localhost:13000, API via gateway http://localhost:18081, Keycloak
  http://localhost:18180, Mailpit http://localhost:18025. Throw away with `down -v`.
- Identities: the realm's seeded accounts, freshly imported. Their authenticator secrets and Finance's virtual passkey
  are in `frontend/.e2e/mfa-qa/` (git-ignored); the runner moves them to `.e2e/mfa` for a run and back afterwards.
- Runner `scripts/qa-live.sh <spec…>`: exports the seeded passwords from the realm file without printing them,
  sets `PLAYWRIGHT_*` to the QA URLs and `MAILPIT_URL=http://localhost:18025`, runs `npx playwright test --workers=1`.
- QA data: RS-2026-000001..000010 on the QA stack (synthetic, "Playwright Ops Gate").

## Next exact action

Nothing closable in code remains. Waiting on owner decisions (DPV-REV-1, DPV-REV-2, DPV-REV-3, AR-14, launch workload for
AR-06) and external gates (P0 0.1–0.11, Meta for UC-15, penetration test, dependency/container scanning). Push only when
the owner asks.

## Runner notes

- `scripts/qa-live.sh` marks the QA secrets folder (`frontend/.e2e/mfa/.qa`) and parks it in `mfa-qa` on exit, so an
  interrupted run is never filed as the dev stack's secrets. Never start two runs at once.
- `portal-gateway-live` needs `GATEWAY_TEST_URL=http://localhost:18081`, `PORTAL_TEST_CASE` (an acknowledged case number)
  and `PORTAL_TEST_CASE_2` (an acknowledged case whose patient has not activated, e.g. the one `uat-walkthrough-live`
  leaves).
- Windows can hold a lock on tracked screenshots under `frontend/e2e/screenshots/` mid-run ("UNKNOWN: open"); delete
  them before a run and restore them with `git checkout` before a commit.

## Blockers

- UC-15 needs the Meta WhatsApp test setup. Everything else open is an owner, counsel, external or hosting item
  (`report.md`, "Remaining actions").
