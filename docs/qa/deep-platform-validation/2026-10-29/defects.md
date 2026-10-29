# Defects (run 2026-10-29)

Severity order: safety/privacy, unauthorized access, data loss, incorrect money, blocked journeys, other.
"Red/green" names the test that failed before the fix and passes after it (focused Maven runs, H2).

| ID | Severity | Area | Status | Regression test |
|---|---|---|---|---|
| D-01 | High | Authorization (Finance) | FIXED, red/green | `JourneyServiceIntegrationTest.acknowledgementCreatesDepositIdempotentAndAuthorizedPayments` |
| D-02 | High | Money (admission receipts) | FIXED, red/green | `AdmissionServiceTest` balance + fee-balance tests |
| D-03 | Medium | Privacy / team isolation | FIXED, red/green | `ReplyCoverIntegrationTest.aColleagueNeverListsCoversOutsideTheirOwnAndTheirTeams` |
| D-04 | Medium | Privacy / team isolation | FIXED, red/green | `UnclaimedIntakeTeamScopeTest` (+ fixture updates in `PortalExperienceTest`, `UatDefectCorrectionsTest`) |
| D-05 | Medium | Integrity (upload quota) | FIXED (ordering test; no concurrent test) | `DocumentServiceTest.countsTheCaseLimitsOnlyUnderTheCaseLock` |
| D-06 | High | Upload security (SEC-13) | FIXED, red/green; **found live** | `ClamAvDocumentInspectorTest.aFileWhoseBytesAreNotTheDeclaredTypeIsRefusedBeforeTheScan` |
| D-07 | Critical | Frontend dependency (Next.js) | FIXED (16.3.3 → 16.4.2); gates re-run | `pnpm audit --prod`: critical 3 → 0 |
| D-08 | High | Blocked patient journey (UC-01) | FIXED, red/green; **found live** | `DocumentSubmissionReadinessTest` |

## D-01 — Deposit receipt replay discloses another case's deposit (High)

- **Requirement:** SEC-6 (object-level ownership), UC-09.
- **Reproduction:** Finance records a receipt with key K on deposit D of case C1, then calls
  `POST /api/v1/finance/cases/{C2}/deposits/{D}/payments` with key K.
- **Expected:** refused; nothing disclosed. **Actual:** the replay short-circuit (`PaymentService.recordReceipt`) ran
  before `requireDeposit(caseId, depositId)` and the scope check, and returned `depositForCase(C2)`.
- **Fix:** `requireDeposit(caseId, depositId)` before the replay check, so a replay answers only for the deposit's own
  case. The replay-after-settlement behavior (same actor) is kept.

## D-02 — Hospital balance and platform fee receipts not idempotent (High, incorrect money)

- **Requirement:** UC-11 / P1-15 D-C: balance evidenced and fee balance paid before `ADMISSION_READY`.
- **Reproduction:** submit the same fee-balance reference twice for half the fee each time.
- **Actual:** two ledger rows summing to the fee; the case became `ADMISSION_READY` with half the money.
- **Fix:** `AdmissionService.alreadyRecorded`: a live ledger row of the same kind and reference (trimmed,
  case-insensitive) with the same amount and payment time is a resubmit — a no-op returning the current view; any other
  receipt under that reference is refused `409 RECEIPT_ALREADY_RECORDED` (never silently dropped; refined after the
  independent review).
- **Residual:** two *concurrent* first submits are serialized by the existing case lock (`lockStage`), so the second
  sees the first; no DB uniqueness constraint was added (migration not needed for correctness under the lock).

## D-03 — Every coordinator lists every team's reply covers (Medium)

- **Root cause:** `Authority.inScope` treats a `SELF` grant as matching any `PLATFORM` resource, so the manager probe
  `allowed(REPLY_COVER_MANAGE, platform)` passed for every coordinator.
- **Fix:** `ReplyCoverService.current` asks `held(principal).platformPermissions()` (platform-scope grants only).
- **Checked:** no other `allowed(..., Resource.platform())` probe widens a query (the other six uses were reviewed).

## D-04 — Unclaimed cases readable by every team's coordinators (Medium)

- **Requirement:** UC-03 B "team queue"; UC-20 "the other team's lead and coordinators cannot open or act on it".
- **Actual:** the unclaimed queue, `intakePreview` (condition text) and the case documents were open to every coordinator.
- **Fix:** new port `authority.application.IntakeTeams` implemented by `coordination.application.CoordinationIntakeTeams`
  (member of an active care-coordination team whose care areas include the case's, or a team with no care areas).
  Applied to queue rows, preview and document reads in `JourneyReadService`; a holder of `ROUTING_ASSIGN` (Care
  Coordination Manager) keeps the whole queue. The claim keeps its own full eligibility and error codes.
- **First attempt (reverted):** putting the rule in the `CASE_UNCLAIMED` scope changed the claim's errors
  (`ROUTING_POLICY_MISSING`/`INELIGIBLE_COORDINATOR` became `OUT_OF_SCOPE`) and failed `CoordinationIntegrationTest`.

## D-05 — Per-case upload quota racy (Medium)

- **Fix:** `CaseService.lock` (row lock, `MANDATORY` propagation) before `validateQuota` in presign, channel files
  (after the scan, so no lock is held while scanning) and staged-file adoption.

## D-06 — No file-signature check in `clamav` scanning mode (High, SEC-13) — found by the live run

- **Reproduction (live, RS-2026-000004, run DPV-1029C):** presign `image/png`, PUT PDF bytes with
  `Content-Type: image/png`, confirm → `200 CLEAN`.
- **Root cause:** `ClamAvDocumentInspector.inspect(content, ignored)` discarded the type; the magic-byte check lived only
  in `SignatureDocumentInspector`, which is active only when `scanning-mode=signature`. Dev and production use `clamav`.
  `docs/security-and-production-readiness.md` claims "true file signature" checking.
- **Fix:** `SignatureDocumentInspector.declaredType` runs first in both modes; a mismatch is `CONTENT_TYPE_MISMATCH`.
- **Live retest (2026-10-29, images built from `1bd6a1e9`, run DPV-1029D, RS-2026-000009):** PDF bytes declared as
  `image/png` → `422 DOCUMENT_INSPECTION_FAILED`. PASS. The retest exposed D-08.
- **Note:** the live "infected" probe (EICAR after a `%PDF` header) was not detected by ClamAV because EICAR is only
  recognised at offset 0; this is a test-design limitation, not a defect. Raw EICAR is now refused by the signature
  check first, so a live ClamAV detection test needs a file that passes the type check (e.g. a PDF with an embedded
  ClamAV test signature) — recorded as NOT TESTED.

## D-07 — Next.js 16.3.3 with critical advisories (Critical, dependency)

- `pnpm audit --prod` (2026-10-29): 3 critical (RCE: Image Optimization with SVG; `use cache`; `next/og`), 7 high,
  5 moderate. The app uses `next/image` with the default optimizer, so `/_next/image` is publicly reachable; `use cache`,
  `next/og` and server actions are not used.
- **Fix:** `next` and `eslint-config-next` 16.3.3 → 16.4.2 (released 2026-10-15). After: 0 critical; 3 high remain
  (Playwright 1.55 browser download, build-time `source-map-js`, `zod` 4.1.5 collection DoS) — RECORDED.

## D-08 — One refused upload blocks the case from ever being submitted (High, blocked journey) — found live

- **Requirement:** UC-01 (submission after uploads); SEC-13 (refused files "rejected, or condemned and deleted").
- **Reproduction (live, RS-2026-000009):** attach a valid PDF and a file that fails inspection, then submit →
  `409 DOCUMENTS_NOT_READY`. The patient cannot remove the refused file (no delete endpoint) and `CaseForm` retries the
  same draft (`draftCase` ref), so the draft can never be submitted without reloading the page and starting again.
- **Root cause:** `DocumentSubmissionReadiness` counted `REJECTED` and `SCAN_FAILED` as "not ready", contradicting its
  own contract ("still unverified"); those files are already deleted from storage and never openable. D-06 makes
  refusals more frequent (e.g. a PNG screenshot saved as `.jpg`), so this would have hit real patients.
- **Fix:** only `PENDING` and `QUARANTINED` (no verdict yet) block submission.
- **Live retest:** pending the next backend rebuild.

## Open (not fixed this run)

- AR-06 rate limit per IP for staff writes (needs launch workload), AR-07..AR-13 (see `architecture-review.md`).
- DPV-REV-1: uploads accepted into closed/cancelled cases (`presignAdditional` refuses only drafts) — needs a decision.
