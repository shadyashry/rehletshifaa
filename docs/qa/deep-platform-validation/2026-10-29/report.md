# Deep platform validation — report (run 2026-10-29)

Scope: `docs/prompts/claude-deep-platform-validation.md`, run on `feat/review-p0` from `92a2a900`. Final revision
`1b1307f5`. The live stack was rebuilt with the canonical tunnel overlay and runs images built from it (backend
14:37Z, frontend 14:23Z with Next 16.4.2). Flyway V109. This is the **first slice** of a multi-session validation;
`checkpoint.md` is the resume point.

## Three verdicts

### 1. Code quality and architecture — **GOOD; security/money findings fixed, remaining risks recorded**

Layering, the single authorization core, "tokens carry no authority" and the JPA/no-native-SQL rule are enforced by
`ArchitectureRulesTest` (22 rules), not by convention. Deny-by-default, database-sourced roles on every request,
staff MFA at sign-in, step-up, append-only money ledgers with maker/checker, leased schedulers, HMAC-verified webhooks
and a transactional outbox are in place. The review recorded 16 items (AR-01..AR-16). The eight with security,
privacy, money or journey impact were fixed with regression tests. An independent read-only review found no blocking
issue, and four of its refinements were applied. Still open: performance hypotheses (AR-07..AR-10), staff
rate-limit sizing (AR-06), single-actor erasure (AR-14), and maintainability notes (AR-11..AR-13). See
`architecture-review.md`.

### 2. Functional completeness — **NOT PROVEN**

All 42 matrix rows have implementation and automated coverage. Only the public intake, secure-link status, upload
security and gateway paths were proven against the real boundaries (gateway, backend, PostgreSQL, MinIO, ClamAV,
outbox, Mailpit). Staff journeys UC-03..UC-20 did **not** run live. The seeded `coordinator` and `doctor` accounts
have authenticators enrolled by someone else since the tester reset. Enrolling authenticators on the other shared
seeded accounts would lock testers out, so it was not done. Two defects were **found live** and fixed: D-06 (upload
type spoofing) and D-08 (blocked submission). The production-rendered browser suite has 11 failing specs, all
stale against today's area-X copy pass or a Windows file lock. No critical/high failure remains open in safety,
privacy, authority or money. The main patient journey past intake is still unverified live.

### 3. Production readiness — **NOT READY**

Code cannot close these Priority 0 gates:
- approved Arabic/legal terms (0.1–0.3)
- real bank details (0.4)
- `PII_INDEX_KEY` in production (0.5, enforced at start)
- Meta template approval (0.6)
- facility contact emails (0.7)
- managed-host PITR drill (0.8; local drill PASS, 94 s)
- Journey D1 decision (0.9)
- PDPL/liability fund (0.10)
- money-rule confirmation (0.11)

Also missing: an external penetration test, a backend/container dependency scan, and an approved workload/SLO. The
critical Next.js advisories were removed (D-07). See `production-readiness.md`.

## Matrix counts (`requirements-matrix.csv`, 42 rows)

| Status | Count | Rows |
|---|---|---|
| PASS | 5 | UC-02, SEC-1, SEC-4, SEC-5, GW-1 |
| PARTIAL | 33 | automated coverage, real boundary not (fully) exercised — incl. UC-01, SEC-13 (live fixes verified; ClamAV positive detection not shown) |
| FAIL | 1 | DPV-TEST-1 (11 stale browser specs) |
| BLOCKED | 2 | UC-15 (Meta test setup), P0 launch blockers |
| NOT TESTED | 1 | DPV-REV-1 (uploads into closed cases: decision) |
| DEFERRED BY DECISION | 0 | (Journey admission stays off; Practice Manager consent and booking not in scope) |

Defects: 8 found (D-01..D-08). By severity: 1 critical, 4 high, 3 medium. All fixed and retested. D-06 and D-08
were also retested live.

## Tests actually run (final code unless noted)

| Gate | Result |
|---|---|
| Backend `mvn -o -q test` | **1013 tests, 0 failures, 0 errors, 3 gated skips** (baseline 1006) |
| `PostgresJpaMappingTest` on disposable PostgreSQL 17 | PASS, V109 (after the D-01..D-06 changes; D-08 changes no mapping) |
| Frontend `pnpm typecheck` | 0 errors |
| Frontend Vitest | 100 files, 818 tests pass |
| Frontend lint | 0 errors, 10 warnings (unchanged) |
| `pnpm test:e2e` (production build, route-mocked) | 514: 443 passed, 53 env-gated skipped, 18 failed under CPU load; rerun of the failures alone: 7 passed, **11 failed** (stale copy/structure ×10, screenshot file lock ×1) |
| `gateway.spec.ts` against the running gateway | 8/8 passed |
| Live public journey `raw/live-intake.mjs` (real tunnel, gateway, MinIO, ClamAV, outbox, Mailpit) | final build run DPV-1029F: 21 PASS, 1 NOT TESTED (EICAR offset limitation) |
| Live staff specs (`portal-live`, `operations-gate-live`, `uat-walkthrough-live`, `my-care-live`, `portal-gateway-live`, `mfa-live`, governance/restore gates) | **not run**: `portal-live` stopped at Keycloak's authenticator challenge; the rest need the same identities or env gates (`*_LIVE`) |
| Restore drill (disposable project) | PASS, 94 s |
| `pnpm audit --prod` | critical 3 → 0 |

## Live journeys

- Intake → upload (clean, oversize, wrong type, MIME-spoof) → submit → auto-routing to a coordinator (`INTAKE_REVIEW`)
  → staff mail in Mailpit → status link → OTP (WhatsApp simulator → Mailpit) → lockout after 5 wrong codes → view →
  OTP replay refused → neutral status-link recovery. Synthetic cases RS-2026-000002..000011 (manifest in `checkpoint.md`).
- Where the journey stops: the coordinator's claim and consultant assignment (UC-03 step 2). Staff sign-in needs
  the authenticator decision below.

## Changed files (commits on `feat/review-p0`, not pushed)

- `61f2539f` backend D-01..D-06:
  - `PaymentService`, `AdmissionService`, `ReplyCoverService`, `JourneyReadService`
  - new `authority/application/IntakeTeams`, new `coordination/application/CoordinationIntakeTeams`
  - `CoordinationRepository`, `CaseService`, `DocumentService`, `ClamAvDocumentInspector`, `SignatureDocumentInspector`
  - tests (incl. new `UnclaimedIntakeTeamScopeTest`)
- `1bd6a1e9` `frontend/package.json`, `pnpm-lock.yaml`: Next 16.4.2.
- `1b1307f5` `DocumentSubmissionReadiness` and new `DocumentSubmissionReadinessTest` (D-08).
- Evidence: this folder, `docs/deployment.md` (drill row).

## Prioritized remaining actions

1. **Owner:** choose how automated live staff journeys sign in:
   - (a) share the `coordinator`/`doctor` TOTP secrets as `COORDINATOR_TOTP_SECRET`/`DOCTOR_TOTP_SECRET` env vars and
     allow enrolment on `operations`/`finance`; or
   - (b) approve dedicated QA identities.

   Then run `operations-gate-live`, `uat-walkthrough-live`, `my-care-live`, `portal-gateway-live` and the
   intake → follow-up journey with distinct actors.
2. UX session: update the 10 stale browser specs to today's area-X copy (`case-cover` ×2, `final-quote-holds` ×3,
   `my-care-safety` ×4, `public-batch-3` ×1).
3. Isolated-stack performance and fault drills: authenticated mixed-role load, Redis/Keycloak/DB/MinIO/ClamAV/SMTP
   outages, outbox lag. They test AR-07..AR-10.
4. Decisions:
   - launch workload and the staff rate limit (AR-06)
   - second approver for erasure (AR-14)
   - uploads into closed cases (DPV-REV-1)
5. Backend dependency and container image scanning, once a scanner is available. External penetration test.
6. P0 owner/counsel/ops items in `production-readiness.md`.

## Skills and tools used

- `/code-review` (built-in skill, high effort, path-scoped).
- `backend-design:security-reviewer` subagent for independent review.
- Playwright 1.55 (repository config), Node 22 scripts for live API and performance runs.
- Keycloak admin API, read-only, to check credential types.
- `pnpm audit`.

Not applied this slice: UI/UX Pro Max, Impeccable and the Vercel guidelines. There were no UI changes, and visual,
RTL and accessibility review of live pages needs staff sessions for most screens. The `e2e` agentic runner was not
used (it needs an `ANTHROPIC_API_KEY` that is not configured here).
