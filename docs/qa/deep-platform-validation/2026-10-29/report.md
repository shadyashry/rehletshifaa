# Deep platform validation — report (run 2026-10-29 / 2026-10-30)

Scope: `docs/prompts/claude-deep-platform-validation.md`, run on `feat/review-p0` from `92a2a900`. Final slice
2026-10-30 ("fix all open points"): every code-closable item is fixed; what remains needs an owner, counsel, an external
party or production hosting. Live staff journeys ran on the isolated QA stack (`docker-compose.qa.yml`, project
`rehletshifaa-qa`, fresh realm, dedicated identities). Flyway V109. `checkpoint.md` is the resume point.

## Three verdicts

### 1. Code quality and architecture — **GOOD; every code finding fixed or decided**

Layering, the single authorization core, "tokens carry no authority" and the JPA/no-native-SQL rule are enforced by
`ArchitectureRulesTest`, not by convention. Deny-by-default, database-sourced roles on every request, staff MFA at
sign-in, step-up, append-only money ledgers with maker/checker, leased schedulers, HMAC-verified webhooks and a
transactional outbox are in place. Of the 16 review items (AR-01..AR-16), all with security, privacy, money or journey
impact are fixed with regression tests. AR-07, AR-08 and AR-10 are now also fixed: a scan bulkhead, batched
eligibility, and no row lock on the preview. AR-12 and AR-13 are fixed. AR-09 is partly fixed: a request-wide role memo
was rejected as unsafe, because activation changes roles mid-request. Left open: AR-06 sizing, which needs a launch
workload; AR-11, an optional facade removal; and AR-14, a second approver for erasure (owner decision). See
`architecture-review.md`.

### 2. Functional completeness — **PROVEN for the built scope; owner-gated items open**

The live spec runs the whole patient journey on real services with distinct real identities. The flow, step by step:

1. Intake, coordinator, and Consultant with step-up.
2. Proposal, patient OTP acknowledgement, activation, and the DEP-3 transfer reference.
3. Finance confirms with a passkey, then the travel gate.
4. Arrival, final assessment and quote, the hospital letter checked by Finance, patient acceptance, voucher, consent.
5. Balance countersigned, admission number, treatment, discharge, final invoice, return, reconciliation, follow-up.

It also runs these variants:
- withdrawal with a full refund, once
- change order (Consultant proposes, Finance prices, patient accepts)
- complication milestone and patient concern, with incidents assigned, reviewed and resolved
- emergency admission in place of the hospital balance, with Finance's review on a service level
- two coordination teams: isolation, and a manager move with a reason
- coordinator departure: their case is routed again, and restoring access does not move it back

All five `operations-gate-live` tests pass, as do `portal-gateway-live` (6/6), `gateway.spec` (9/9), `my-care-live` and
`uat-walkthrough-live`. The staff upload control (D-10 UI) passes in en/ar at 390 and 1440 px. Found and fixed while
proving this: D-15 (the seeded routing policy could never be followed).

Not live:
- WhatsApp (UC-15): needs the Meta test setup.
- Follow-up closure: time-gated; covered by `FollowUpServiceTest`.
- Care-area routing by a new policy: a policy cannot be replaced mid-interval. This follows frozen decision §15 and is
  an owner decision (DPV-REV-3).
- Two product decisions: DPV-REV-1 (uploads into closed cases) and DPV-REV-2 (a 0 EGP proposal total).

### 3. Production readiness — **NOT READY (code side ready; external gates open)**

The fault drills now pass on the QA stack. Each of Redis, Keycloak, ClamAV, MinIO, SMTP and PostgreSQL was stopped:
- No data was lost.
- Every failure answered a retryable code.
- Every service recovered in under 45 s.

The drills found two availability defects, fixed and re-drilled: D-16 (an unreachable store answered 500) and D-17 (a
database outage held requests 30 s).

Code cannot close these Priority 0 gates:
- approved Arabic and legal terms (0.1–0.3)
- real bank details (0.4)
- `PII_INDEX_KEY` in production (0.5; enforced at start)
- Meta template approval (0.6)
- facility contact emails (0.7)
- a managed-host PITR drill (0.8; the local drill passed in 94 s)
- the Journey D1 decision (0.9)
- PDPL and the liability fund (0.10)
- confirmation of the money rule (0.11)

Also missing: an external penetration test, a backend and container dependency scan (no scanner available offline), an
approved workload and SLO, and a decision on the Playwright 1.55.1 dev-tool advisory (it needs a browser download). See
`production-readiness.md`.

## Matrix counts (`requirements-matrix.csv`, 50 rows)

| Status | Count | Rows |
|---|---|---|
| PASS | 15 | UC-02, UC-18, UC-20, SEC-1, SEC-4, SEC-5, GW-1, DPV-LIVE-1..7, DPV-TEST-1 |
| PARTIAL | 31 | automated coverage; the real boundary is exercised only through the live journeys above or not at all (row by row in the CSV) |
| BLOCKED | 2 | UC-15 (Meta test setup), P0 launch blockers |
| NOT TESTED | 2 | DPV-REV-1, DPV-REV-2 (decisions) |

Defects: 17 found (D-01..D-17). By severity: 1 critical, 8 high, 7 medium, 1 low. All 17 are fixed and retested.
D-06, D-08..D-10 and D-12..D-17 were found or verified live; D-16 and D-17 were found by the fault drills.

## Tests actually run (final code)

| Gate | Result |
|---|---|
| Backend `mvn -o -q test` | **1026 tests, 0 failures, 0 errors, 3 gated skips** (final code, after D-16/D-17; baseline 1006) |
| `PostgresJpaMappingTest` on disposable PostgreSQL 17 | PASS (every repository query incl. the new batched eligibility queries) |
| Frontend typecheck / lint | 0 errors / 0 errors, 10 warnings (unchanged) |
| Frontend Vitest | 100 files, 819 tests pass |
| Mocked browser specs formerly stale (case-cover, final-quote-holds, my-care-safety, public-batch-3, messages-conversations) | 34/34 pass |
| New `staff-document-upload.spec.ts` (en/ar, 390/1440) | 4/4 pass; shots in `raw/shots/` |
| Live, QA stack: `operations-gate-live` | 5/5 (gate; withdrawal + refund; after arrival with change order, complication, incidents; emergency admission; two teams + departure) |
| Live, QA stack: `portal-gateway-live` + `gateway.spec` | 15/15 |
| Live, QA stack: `my-care-live`, `uat-walkthrough-live` | 2/2 |
| Fault drills (`raw/fault-drill.mjs`) | 6 dependencies; 2 defects found, fixed, re-drilled PASS |
| Restore drill (disposable project, earlier slice) | PASS, 94 s |

The full production-build `pnpm test:e2e` was not re-run end to end in this slice. Only the previously failing specs and
the new spec were run. A Windows lock on tracked screenshot files can fail a run; this is environmental, and the runner
note is in `checkpoint.md`.

## Commits on `feat/review-p0` (not pushed)

- `61f2539f` D-01..D-06; `1bd6a1e9` Next 16.4.2 (D-07); `1b1307f5` D-08; `73f09570` D-09; `2ae37ebe` QA stack and live specs.
- `4d1d5fc6` D-10 backend, D-12; D-13 and the extended live spec; `a262a138` D-11 per-user write budgets.
- `402942ef` D-14, AR-12, AR-13; `d4e3d9f5` D-10 UI, dependency advisories (zod, source-map-js), stale-spec cleanup.
- Final slice (this commit): AR-07/08/09/10, D-15, D-16, D-17, the live variants, stale live assertions, the QA runner's
  secret parking, the fault-drill script, and evidence.

## Remaining actions (none closable in code)

1. Owner decisions:
   - DPV-REV-1 (uploads into closed cases)
   - DPV-REV-2 (0 EGP proposal total)
   - DPV-REV-3 (replacing a routing policy mid-interval)
   - AR-14 (second approver for erasure)
   - the launch workload behind AR-06
2. External parties:
   - P0 items 0.1–0.11 (`production-readiness.md`)
   - Meta setup for UC-15
   - penetration test
   - dependency and container scanning
3. Optional maintainability work: AR-11, removing the `JourneyService` facade.
4. Your `.env` sets a UAT `RATE_LIMIT_REQUESTS` override, which per-user budgets (D-11) make unnecessary. It's your file,
   so I left it untouched.

## Skills and tools used

- `/code-review` (high), and the `backend-design:security-reviewer` subagent for independent review.
- D-10 upload UI: reuses the patient's `CaseDocumentUpload` (no new visual pattern); checked visually in en/ar at 390 and
  1440 px. A full Impeccable/web-design-guidelines review of it was not run in this slice.
- Playwright 1.55 (live specs with a virtual WebAuthn authenticator and TOTP).
- Node scripts for live API, performance and fault drills; Docker for the isolated QA stack and the PostgreSQL proof.
- `pnpm audit`.
