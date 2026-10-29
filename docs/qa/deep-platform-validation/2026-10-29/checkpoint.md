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

## Completed (final revision `1b1307f5`, stack rebuilt from it)

1. `/code-review` (high) + manual tracing → AR-01..AR-16 (`architecture-review.md`).
2. Fixed with red/green tests: D-01..D-06 (`61f2539f`), D-08 (`1b1307f5`); D-07 Next 16.4.2 (`1bd6a1e9`).
   Independent `security-reviewer` subagent: no blocking findings; four refinements applied.
3. Gates on final code: backend 1013 / 0 failures / 3 skips; PostgreSQL 17 mapping PASS (V109); typecheck 0;
   Vitest 818/818; lint 0 errors; `pnpm test:e2e` 443 pass / 53 skip / 11 stale failures (see `report.md`).
4. Live: gateway spec 8/8; public intake/status journey 21 PASS on the final build (DPV-1029F); D-06 and D-08
   verified live; restore drill PASS 94 s; single-user latency baseline and bounded cache ramp (`performance.md`).

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

1. Live variants on the QA stack: two coordination teams (activate `coordinator-scope`/`care-manager-scope` with
   `activateInvited` from `operations-gate-live.spec.ts`), coordinator departure, change orders, complication → incident,
   emergency admission; then follow-up closure with a moved clock (backend test only).
2. D-10 UI: staff upload controls in the Admission/Discharge panels (UX pipeline, en/ar).
3. D-11 decision with the owner (per-principal write budgets, launch workload), then load/fault drills on the QA stack.
4. Hand the stale browser specs to the UX session (list in `report.md`).

## Blockers

- None for live staff journeys (resolved by the QA stack). UC-15 still needs the Meta WhatsApp test setup.
