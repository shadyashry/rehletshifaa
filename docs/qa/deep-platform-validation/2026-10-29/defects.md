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
| D-09 | Medium | Money (dev seed: 0 EGP services offered) | FIXED (`73f09570`); **found live** on the QA stack | live `operations-gate-live` (deposit raised); dev DB: 0 active zero-priced services after restart |
| D-10 | High | Approved gap: staff cannot file case paperwork (blocks admission/discharge) | FIXED backend (`4d1d5fc6`); UI open | `StaffDocumentUploadTest`; live post-arrival journey |
| D-11 | High | Availability: backend write budget per IP blocks a normal multi-role journey (AR-06) | OPEN — owner decision (per-principal budgets / launch workload) | live: 429 on the 6th role's upload; QA stack runs with a raised per-address budget |
| D-12 | High | Blocked patient journey: patients can never confirm a step-up decision | FIXED, red/green (`4d1d5fc6`); **found live** | `AuthorityIntegrationTest.aPatientsDecisionNeedsAFreshSignInNotASecondFactor`, `RolePolicyTest`; live withdrawal 200 |
| D-13 | High | Money: an in-time patient cancellation cannot be refunded (Finance has no access) | FIXED (next commit); **found live** | `RefundObligationServiceTest`; live refund of 4,025 EGP, deposit REFUNDED |
| D-14 | Low | A refund replay after the full refund answers 403, not the idempotent 200 receipts give | OPEN (no duplicate recorded) | live refund test |

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

## D-09 — Dev seed offers services with no price evidence as active at 0 EGP (Medium, money; dev/UAT only)

- **Found:** isolated QA stack, `operations-gate-live`: the consultant's first catalogue service (`CARD-COMPLEX-PCI`,
  price evidence open per V107) was active at 0.00; the estimate, proposal and acknowledgement went through at 0 EGP
  and no deposit was raised (the 15% policy of 0 is 0).
- **Root cause:** `LocalDemoDataSeeder.makeEligible` inserted every template item active with `COALESCE(price,0)`.
  Production (`PricingCatalogService.copyTemplateToCatalog`) already lists unpriced items inactive.
- **Fix:** the seeder lists them inactive and deactivates the zero-priced rows it created before (local profile only).
  Dev after rebuild: 0 active zero-priced services, 78 priced.
- **Review item (not a decision taken):** the backend still accepts a hand-entered 0 EGP estimate line and a 0 EGP
  proposal total (`@DecimalMin("0.00")`); whether a released proposal may total 0 is a business rule to confirm
  (DPV-REV-2).

## D-10 — Staff could not add case documents (High, approved functionality gap) — found on the live journey

- **Requirement:** `docs/post-deposit-solution-architecture.md` §471 ("typed pickers for Operations (bills, letters) and
  Consultants (pack)"), §508–509 (Operations "letter upload … balance receipt upload, bills"; Consultant "discharge-pack
  checklist with typed uploads").
- **Actual:** the only upload endpoints were the patient's (My Care, secure link, intake). Every evidence row (letter,
  receipt, invoice, pack) must point at a clean case document, so admission and discharge could not be recorded unless the
  patient happened to upload the hospital's paperwork.
- **Fix (backend):** `CASE_DOCUMENT_ADD` (owner coordinator, Operations and Consultant on the case),
  `POST /api/v1/work/cases/{id}/documents/presign|confirm` on the same inspected pipeline; an ended case takes no new
  paperwork; an upload is confirmed by its uploader. Independently reviewed (no blocking findings).
- **Open:** the staff upload controls in the Operations and Consultant panels (UI; UX pipeline, en/ar copy). Reviewer notes
  kept open: staff files carry no "source" marker where patient-supplied evidence is expected (guardian/consent evidence);
  check whether hospital invoices should appear in the patient's document list.

## D-11 — Per-IP write budget blocks a normal journey (High, availability; AR-06 with live evidence)

- **Live:** on the QA stack all roles act from one address (as staff behind an office NAT). The backend's 30 writes/min
  per IP refused the Operations upload mid-journey (`429 RATE_LIMIT_EXCEEDED`); the gateway's 60/min per IP is the next limit.
  The dev `.env` already carries a UAT override for the same reason.
- **Not changed:** rate budgets are a security control at two layers; keying authenticated writes per principal (and
  anonymous per IP) is the proposed fix, for the owner to approve with the launch workload.

## D-12 — Patients could not confirm any step-up decision (High, blocked journey) — found live

- **Live:** a just-signed-in patient (`amr ["pwd"]`, `acr 1`) → `POST /patient/cases/{id}/withdraw` →
  `401 REAUTHENTICATION_REQUIRED "Use multi-factor authentication"`. `PATIENT_DECIDE` (withdraw, change-order and in-portal
  proposal decisions) required a second factor that patients are never asked to set up (owner decision D1). The tests
  hid it: their fixtures sign patients in at `acr 2`.
- **Fix:** step-up demands the second factor only when the grant used belongs to a role that signs in with one; patients
  and representatives confirm with a fresh sign-in (20 min). A `RolePolicyTest` keeps step-up permissions from being shared
  between password-only and second-factor roles. Reviewed: no staff power is confirmable without MFA.
- **Owner note (from the review):** for patients a stolen password plus a fresh sign-in now authorizes their decisions —
  the consequence of D1, stated explicitly.

## D-13 — An in-time patient cancellation could not be refunded (High, money) — found live

- **Live:** after the patient's withdrawal with a paid deposit, Finance's refund → `403 OUT_OF_SCOPE (CASE_DEPOSIT_READ)`.
  Refund work (which is also Finance's access to the case after an exit) opened only for guaranteed exits; the paid deposit
  is no longer "open"; Finance is not assigned on catalogue-priced cases. `PATIENT_CANCELLED` refunds, which the policy
  entitles before the cutoff (or with no confirmed appointment), were therefore impossible.
- **Fix:** `RefundObligationService.openForExit` opens the refund work for a patient's withdrawal or no-show that beat the
  cutoff; the cutoff rule has one home (`RefundPolicyService.patientCancelledInTime`). Live: refund 4,025 EGP recorded once,
  deposit `REFUNDED`, the over-amount attempt refused.

## Open (not fixed this run)

- AR-06 rate limit per IP for staff writes (needs launch workload), AR-07..AR-13 (see `architecture-review.md`).
- DPV-REV-1: uploads accepted into closed/cancelled cases (`presignAdditional` refuses only drafts) — needs a decision.
