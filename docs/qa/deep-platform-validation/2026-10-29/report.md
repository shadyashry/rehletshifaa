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

### 2. Functional completeness — **NOT PROVEN** (main journey proven live end to end; variants and owner gates open)

**Update 2 (journey extended):** on the QA stack the live spec now runs the **whole patient journey** with distinct
real identities — intake → … → travel gate → final assessment and final quote → hospital letter checked by Finance →
patient accepts by secure link + OTP → voucher → consent → hospital balance countersigned → admission number →
treatment milestones → discharge pack → final invoice (DISCHARGED) → return and departure → reconciliation → follow-up
contact (`FOLLOW_UP`); and the **withdrawal + full refund** variant. All 3 live tests pass (2.1 min). Getting there found
four more defects, three fixed: D-10 (staff could not file paperwork — approved gap), D-12 (patients could never confirm
a step-up decision), D-13 (an in-time patient cancellation could not be refunded); D-11 (per-IP write budget) needs your
decision. Not live yet: two-team routing, coordinator departure, change orders, complications, emergency admission,
follow-up closure (time-gated), WhatsApp (UC-15), and the staff upload UI (D-10 UI half).

**Update (owner chose dedicated QA identities):** an isolated QA stack (`docker-compose.qa.yml`, project
`rehletshifaa-qa`, fresh realm, no tester impact) now runs the live staff journeys. `operations-gate-live` passes end
to end at `2ae37ebe`: public intake → coordinator → consultant review with step-up → proposal → Operations step →
release → patient OTP acknowledgement → profile activation → Keycloak account setup → patient transfer reference →
Finance receipt confirmed with a **passkey** (acr 3) → `TRAVEL_COORDINATION` exactly once. `portal-gateway-live` 5/6
through the real gateway with no 429s; `my-care-live` and `uat-walkthrough-live` proven to the patient landing and the
consultant assignment, then stop on UI text the redesign changed. The run found D-09 (0 EGP demo services).
Not yet live: arrival → final quote → admission → treatment → discharge → follow-up, the two-team and departure
variants, refunds/cancellations, WhatsApp (UC-15).

Original slice-1 finding, kept for the record:

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

## Matrix counts (`requirements-matrix.csv`, 46 rows)

| Status | Count | Rows |
|---|---|---|
| PASS | 6 | UC-02, SEC-1, SEC-4, SEC-5, GW-1, DPV-LIVE-1 (cross-role journey to the travel gate) |
| PARTIAL | 35 | automated coverage, real boundary not (fully) exercised — incl. UC-01, SEC-13 (live fixes verified; ClamAV positive detection not shown) |
| FAIL | 1 | DPV-TEST-1 (11 stale browser specs) |
| BLOCKED | 2 | UC-15 (Meta test setup), P0 launch blockers |
| NOT TESTED | 2 | DPV-REV-1 (uploads into closed cases), DPV-REV-2 (0 EGP proposal total): decisions |
| DEFERRED BY DECISION | 0 | (Journey admission stays off; Practice Manager consent and booking not in scope) |

Defects: 14 found (D-01..D-14). By severity: 1 critical, 8 high, 4 medium, 1 low. Fixed and retested: 12 (D-10 backend
only). Open: D-11 (owner decision), D-14 (low). D-06, D-08, D-09, D-10, D-12 and D-13 were found or verified live.

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
| Live staff specs on the tunnel stack | not run: seeded staff accounts carry testers' authenticators |
| Live staff specs on the isolated QA stack (`2ae37ebe`) | `operations-gate-live` **PASS** (twice); `portal-gateway-live` 5/6; `my-care-live` and `uat-walkthrough-live` PARTIAL (stale UI text after the proven steps); `portal-live` not run (its own sign-in cannot answer MFA); `mfa-live`, governance/restore gates not run (env-gated drills) |
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
- `73f09570` `LocalDemoDataSeeder` (D-09); `2ae37ebe` `docker-compose.qa.yml`, `frontend/e2e/live-auth.ts`, live specs.
- `4d1d5fc6` D-10 (`StaffDocumentService`, `StaffDocumentController`, `CASE_DOCUMENT_ADD`) and D-12 (`Authority.decide`);
  D-13 (`RefundObligationService`, `RefundPolicyService`, `CaseExitService`) and the extended live spec in the next commit.
- Evidence: this folder, `docs/deployment.md` (drill row).

## Prioritized remaining actions

1. On the QA stack: extend the live journey past the travel gate (arrival, final assessment/quote, admission, voucher,
   treatment, discharge, follow-up) and run the two-team, departure, refund and cancellation variants. Start it with
   `docker compose -p rehletshifaa-qa -f docker-compose.yml -f docker-compose.qa.yml up -d` (state kept); run specs with
   `scripts/qa-live.sh <spec>` (`checkpoint.md`).
2. UX session: update the 10 stale browser specs to today's area-X copy (`case-cover` ×2, `final-quote-holds` ×3,
   `my-care-safety` ×4, `public-batch-3` ×1) and the stale live assertions (`my-care-live` deposit copy after DEP-3,
   `uat-walkthrough-live` hand-off sentence, `portal-gateway-live` Arabic "خطوتك").
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
