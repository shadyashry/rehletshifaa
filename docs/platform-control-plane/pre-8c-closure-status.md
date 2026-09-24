# Pre-8C closure — J-1, OPS-1, COPY-1, COPY-2

Date: 2026-09-24 · Branch `codex/platform-control-plane` · Base UX-8 `1a9d751` · Claude Code.
Scope: the four pre-8C items only. **Phase 8C not started. Journey production intake OFF. Routing rollout unchanged.** No
navigation, Provider Workspace, access, credential, coordination-structure, commercial or Journey-architecture change.

## 1. J-1 root cause

Every governed Journey mutation asks for a reason, and the backend requires it (`JourneyDefinitionService.locked()`: non-blank,
≤ 500 chars) — then drops it. Path before this change:

| Step | Draft save / Check / Test / Send for approval / Return to draft | Edit a copy | Publish / Retire |
|---|---|---|---|
| UI | *Change note* field (`JourneyDesigner`), shared by the five actions | *Why are you making this change?* (`JourneyVersionWorkspace` dialog) | Own reason field in each confirmation (`JourneyPublishPanel`) |
| API | `PUT …/versions/{v}` / `POST …/validate`, `/simulate`, `/submit`, `/return-to-draft` — body `reason` | `POST …/clone` — `reason` | `POST …/publish`, `/retire` — `reason` |
| Service | validated in `locked()`; **not used again** | same | same |
| Persistence | `audit_events.reason` = `revision=N` / `errors=N` / `outcome=…; steps=N` | `source=<id>` | `graph=<hash>; runtime=…` / `graph=<hash>` |
| Read / history | `GET …/history` returned that technical detail as `reason`; the UI hid it | | |

Publish and retire reasons were **not** persisted separately either; no version field held a reason. So all eight governed
actions lost their reason (J-1 covers them all; nothing correct existed to leave unchanged).

## 2. J-1 implementation

- **Storage (option C, smallest correct):** `V52__journey_governance_reason.sql` — one nullable column
  `audit_events.governance_reason VARCHAR(500)`. The audit event already answers *what* (action + version), *who* (actor
  subject), *when* (occurred_at); the new column answers *why* on the same row. The existing `reason` column keeps the system's
  technical detail, so neither is parsed out of the other (the access-governance pattern of concatenating `detail; reason`
  was not copied for that reason). No parallel comment/note table; no change to `journey_versions`; no backfill.
- `AccessAuditRepository.record(…, governanceReason)` overload (the 5-argument form delegates with `null` — every other audit
  writer unchanged).
- `JourneyDefinitionService`: each of the eight actions stores the trimmed reason it was given; `HistoryEntry` gains
  `changeReason` (API field `reason` unchanged — still the technical detail, shown only under Advanced).
  `JourneyDefinitionRepository.history` reads the column.
- Frontend: `JourneyHistoryEntry.changeReason`; Versions & history › History shows **action · Version N · when · Reason: …**,
  or **Reason not recorded** for a governed action with none (entries before V52). Actions that never ask (journey created,
  runtime prepared, refused) show no reason line. Field hints now say *Saved in the journey history …* (EN/AR) instead of
  *Required by the platform*.

## 3. Reason persistence semantics

- One reason per governed action, stored with that action's audit event: Draft saved, Checked, Tested, Sent for approval,
  Returned to draft, New draft created (Edit a copy), Published, Retired. Publish and retire reasons stay distinct because they
  are distinct events with their own dialog field — they are never merged with the change note.
- The designer's *Change note* is one field used by save/check/test/send; each action stores what was in the field at that
  moment, so successive saves keep their own notes (no "latest note" overwrite; history is append-only).
- A refused or stale action writes nothing (the stale-revision check runs before the audit write; the transaction rolls back).
- Historical events keep `NULL` → *Reason not recorded*. No reason was fabricated.
- *Who*: the audit subject (shown under Advanced). Display names for platform admins remain a recorded future capability
  (no subject→name directory for admins exists; UX-8 §28).

## 4. Journey history result

Verified by `JourneyDefinitionIntegrationTest.governanceReasonsPersistPerActionAndReadBack` (service + HTTP) and
`JourneyVersionWorkspace.test` (EN/AR display), and in the rebuilt stack (`ux8-commercial-journeys.spec.ts`, screenshot
`journey-history-reasons-desktop-{en,ar}`).

## 5. OPS-1 implementation

`JourneyService.reassignCoordinator` (the authoritative *Transfer case ownership* command) now calls the existing
`StaffWorkService.notifyStaff` after the owner change, work move and audit, **in the same transaction**:
event `CASE_OWNERSHIP_TRANSFERRED`, recipient = new owner, idempotency key `ownership-transfer:<new assignment id>`, email on.
Skipped when the new owner already owned the case (a repeated/retried transfer) or is the person transferring (a lead taking
it themselves). The previous owner is never notified by this event.

## 6. Notification channel and content

- Channels: the ones live-routing assignment already uses for coordinators — **in-app Staff Portal notification** (bell) +
  **work email** queued on `notification_outbox` (template `coordinator-work-assigned`; falls back to the coordination team
  mailbox when the coordinator has no work address, as for every coordinator email). No new channel, template or preference.
- In-app title: *A case has been transferred to you*. Context: *You are now the owner of case {number} (previously {name}),
  transferred by {name}. Open coordinator work on the case is now yours; the reason is in the assignment history.* The bell
  links to the case.
- Email payload: title + case number + role only (existing template).
- **Not included:** patient name, contact details, clinical text, documents, the free-text transfer reason (it can contain
  clinical detail; it stays in Assignment history for authorized readers), routing diagnostics. Test asserts all of these.

## 7. Outbox / idempotency

- Atomic with the transfer: the notification row and the outbox row are inserted in the transfer transaction; a refused,
  unauthorized, or rolled-back transfer leaves neither (tested with a SQL savepoint rollback). Delivery is the existing
  asynchronous outbox worker — a mail failure never fails the transfer.
- Dedupe: `staff_notifications.idempotency_key` and `notification_outbox.idempotency_key` (`work-email:ownership-transfer:<id>`)
  `WHERE NOT EXISTS` inserts — the existing mechanism; outbox retries re-send the same row (existing at-least-once guarantee).
  A retried transfer request to the same coordinator finds them already owner and notifies nobody. No new dedupe mechanism.

## 8. Transfer UI copy

Review: *{name} gets a Staff Portal notification and a work email after the transfer is completed. The email carries only the
case number.* Result: *Ownership transferred to {name}. They have been notified in the Staff Portal and by work email.* Self-
transfer: *You are taking the case yourself, so no notification is sent.* / *You are now the owner of this case. No
notification was sent.* No SMS/WhatsApp implied. Arabic uses «بوابة الموظفين» (existing Staff Portal term; see Arabic pack G2).

## 9. Arabic review pack — COPY-1

[pre-8c-arabic-review-pack.md](pre-8c-arabic-review-pack.md): 27 rows grouped General · Provider/credentials · Care
coordination · Commercial · Journey · Patient-facing, each with English, current Arabic, screen, meaning, risk and options;
reviewer instruction at the top. New variants found: Staff Portal (بوابة الموظفين / بوابة الفريق), Credential Review
(مراجعة التراخيص والمؤهلات / مراجعة الاعتمادات). No disputed Arabic changed. **ARABIC REVIEW REQUIRED.**

## 10. Commercial copy review pack — COPY-2

[pre-8c-commercial-copy-review-pack.md](pre-8c-commercial-copy-review-pack.md): exact EN/AR copy, verified software facts and
the open decisions for the preliminary estimate, coordination deposit, final quote and exchange rates. Findings for the
reviewer: **F1** the patient consents to deposit cancellation/refund terms that no patient screen shows; **F2** the stored
deposit refund class (`NON_REFUNDABLE`) contradicts its stored text (refundable before coordination starts); **F3** placeholder
payment/refund terms and a fixed 14-day validity are stored on every proposal; **F4** no patient-facing FX explanation.
No policy answered. **LEGAL/BUSINESS COPY REVIEW REQUIRED.**

## 11. Tests

- Backend focused: `JourneyDefinitionIntegrationTest` **9/9** (+`governanceReasonsPersistPerActionAndReadBack`: every action's
  reason, Arabic/Unicode + trim round-trip over HTTP, publish/retire distinct, two v2 edits kept separately, legacy row with no
  reason readable, stale edit stores nothing, maker/checker path unchanged). `SecureJourneyCorrectionsTest#transfer*` **2/2**
  (+`transferNotifiesOnlyTheNewOwnerOnceAndOnlyWhenItCommits`; the UX-7 test's *no notification* assertion now expects exactly
  one). Deterministic: counts and keys, no clock dependence.
- Backend full `mvn -o test`: **533 tests, 0 failures, 0 errors, 1 skipped** (UX-8: 531).
- Frontend: `pnpm typecheck` clean; `pnpm test` **410 tests / 43 files** (UX-8: 407). Lint on changed files: same 2 findings as
  HEAD (pre-existing).
- Flyway: **V52** `journey_governance_reason` — applied on dev Postgres 17 (51 → 52, column `varchar(500)` nullable).

## 12. Live sanity (limited)

Canonical tunnel rebuild of backend + frontend. Signing in to dev with real credentials is not something this session does,
so the live run follows the established pattern: synthetic OIDC session + route-mocked reads, every write blocked and asserted
empty — `ux8-commercial-journeys.spec.ts` (history shows saved reason and *Reason not recorded*, EN/AR) and
`care-coordination.spec.ts` (transfer review states the notification truthfully, EN/AR): **10/10**. Persistence and
notification behaviour are proven by the integration tests on the real service code; V52 verified on dev Postgres.
**No records were written** on the dev stack (no journey edited, no case transferred, no real patient/provider data touched).
A signed-in walk-through (edit a draft with a reason → reload → history; transfer a synthetic case → new owner's bell) is
listed as a next action for a person with dev credentials.

## 13. Production intake / routing confirmation

`journey.runtime.production-intake-enabled` still `${JOURNEY_RUNTIME_PRODUCTION_INTAKE_ENABLED:false}`; no change under
`journey/api`, `coordination/**` or `application.yml`; cutover API still GET-only; publish behaviour unchanged. **Journey
production intake = OFF. Routing rollout unchanged.**

## 14. Outstanding human approvals

1. Native Arabic healthcare-operations review of the Arabic pack (V-9), then apply approved changes.
2. Business/legal review of the commercial pack (A–D, F1–F4), then apply approved copy (and any decided follow-ups).
3. No Critical issue open. **High (legal, pending review):** F1 consent to unseen deposit terms; F2 contradictory deposit refund
   data. Both are policy decisions, not engineering defects to fix unilaterally.

### PRE-8C TECHNICAL CLOSURE (2026-09-24): YES
### PHASE 8C ENTRY: NO — HUMAN COPY REVIEWS PENDING

---

## 15. Commercial copy closure — 2026-09-25 (Claude Code)

Base `f3ce109`. The business/legal review of COPY-2 returned. Decisions record:
[pre-8c-commercial-copy-decisions.md](pre-8c-commercial-copy-decisions.md). This session applied only what was approved for
implementation, left legally open items open, and did not start Phase 8C. **Journey production intake OFF** (no change under
`journey/api`, `coordination/**` or `application.yml`). No migration. No historical row changed.

### Implemented

- **F1** (subject to final legal copy wording): the approved short-form coordination deposit, refund, cancellation and
  how-to-pay terms (`frontend/src/lib/commercial-terms.ts`, `CoordinationDepositTerms`) are shown inline:
  - on the preliminary estimate, before acknowledgement, in both the secure-link document and the signed-in My Care drawer;
  - above the activation consent, with the approved checkbox copy (`aria-describedby` ties the checkbox to the terms).

  The consent record stores that exact text with `policy_version = deposit-terms-2026-09-25` (other consents stay `v1`). The
  acknowledgement evidence version is now `proposal-ack-2026-09-25`.
- **Terminology:** *accepted care estimate*, *Proposal accepted* and *Your proposal has been accepted* now say the patient
  acknowledged the preliminary estimate (activation, My Care, legacy status card). Final quote button: *Accept final treatment
  plan and quote*.
- **Estimate copy:** non-binding statement; the real basis inputs; "may increase or decrease"; a final quote comes before any
  non-emergency treatment. Included = listed services + RehletShifaa care coordination; the approved *Not included unless
  listed* list; no tax statement. A stored range is shown as *Estimated range X to Y* with *Expected Z* (main total, summary
  and sticky bar).
- **Final quote:** factual acceptance wording (no *financial agreement*, no *binding*); changes need a revised quote; the
  not-medical-consent sentence; the approved payment paragraph (no claim that the balance gates treatment). The estimate's "may
  change" basis line is no longer shown on a final quote.
- **Expiry:** an estimate *can no longer be acknowledged*; a quote *can no longer be accepted*. A later version may have
  different prices and exchange rate.
- **F4:** `PublicProposalView.fxRateDate` (additive) feeds the approved sentence naming the rate day and saying the rate is
  fixed for this estimate or quote while it is valid. Short form on the deposit terms. No live, real-time or official claim.
- **F3 (partial):** new preliminary estimates store the approved payment facts in `payment_terms`. They no longer store refund
  terms, placeholder exclusions or the English-only disclaimer. Stored placeholders are never rendered to patients (legacy
  rows keep them).
- **Deposit text:** new deposit components get neutral terms text pointing to the displayed terms. "Refundable before
  coordination begins" is no longer written. General disclaimers appear once, in the proposal document footer.

### Deliberately not done (open)

- **F2 BLOCKED — LEGAL DECISION STILL REQUIRED.** *Conditional refund eligibility is not represented accurately by the current
  model.* No `CONDITIONAL` value and no `PARTIALLY_REFUNDABLE` misuse. The refund class of new components is unchanged
  (`NON_REFUNDABLE`) and historical deposit rows are untouched.
- Also open:
  - final-quote validity (still 14 days);
  - refund processing time and method;
  - provider cancellation charges;
  - the emergency-cost clause;
  - taxes;
  - the legally payable currency and bank fees;
  - principal-vs-agent wording;
  - other-jurisdiction and governing-language questions.
- **Arabic:** no Arabic legal wording was written. Arabic pages show the English terms and FX sentence with an Arabic notice.
  Six factual Arabic fixes are recorded as X5–X10 in the [Arabic pack](pre-8c-arabic-review-pack.md) §6a for the native
  reviewer.
- The signed-in drawer shows the terms without an amount, because its payload has no anticipated deposit (follow-up).
- J-1 / OPS-1 signed-in walk-through: not performed. This session does not sign in to dev with real credentials. It stays a next
  action for a person with dev credentials.

### Verification

See [test-status.md](test-status.md) (2026-09-25 entry).

### COPY CLOSURE TECHNICAL PASS: YES
### PHASE 8C ENTRY: NO — F2 / refund enforceability, provider cancellation charges, final-quote validity, principal-vs-agent wording, tax/currency legal wording and native Arabic approval remain open
