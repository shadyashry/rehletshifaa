---
target: Operations workspace (hospital file) — UX 5-4
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\sharp-antonelli-b6a40e\\frontend\\src\\components\\portal\\AdmissionPanel.tsx"
target_fingerprint: "sha256:dbc8bc326020ce5922ea5c31a11a7b9c0bf6b8918a27c81dafbdae37bebac65b"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\sharp-antonelli-b6a40e\\frontend\\src\\components\\portal\\AdmissionPanel.tsx"
timestamp: 2026-10-28T13-12-53Z
slug: frontend-src-components-portal-admissionpanel-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent). Re-critique of UX 5-4 (the side cards folded into Operations'
hospital file). A ran four times on successive shots (30, 30, 31, 30 — the in-scope P2s of each pass were fixed before the next); this is
the last pass, on the committed state. B ran three times; the final detector run on the committed code is clean.

Target: the Operations side of the staff case page — `AdmissionPanel.tsx` (`OperationsFile`), `TravelPlanPanel.tsx`, `DischargePanel.tsx`
(`OperationsHome`), composed by `StaffCaseView.tsx`, shared `panel-parts.tsx`. Mode: Operate. Evidence: `docs/ux-redesign/screenshots/area-5/5-4/`
(synthetic `e2e/operations-fixture.ts`; plan, letter, balance, admit, depart × en/ar × 390/1440, plus My work). Baseline 29/40 (`2026-10-28T11-53-36Z`).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | ✓ trail excellent; on plan/letter the strip's "Arrange travel and arrival" sits above "✓ Travel … Booked" and an open letter/reservation (B-5-1) |
| 2 | Match System / Real World | 3 | "No refund for travel after … · approved by Finance" plain; "Point of no return" in the side label, "revision", "countersigned" unexplained; Arabic My work summaries English |
| 3 | User Control and Freedom | 3 | Correction behind each done fact; stage moves confirm; arrival / point of no return carry no "why no change" |
| 4 | Consistency and Standards | 3 | One filled button per view, one row grammar; queue vs case act names differ; depart view leaves the file grammar |
| 5 | Error Prevention | 3 | Prefilled, grouped amounts refused in the page's language when malformed; estimate maximum as hint; a price above it is not warned before submit |
| 6 | Recognition Rather Than Recall | 3 | Dashed "Later:" rows fixed the radio misread; plan-view travel uses the waiting clock for Operations' own work |
| 7 | Flexibility and Efficiency | 3 | Prefills, Next in My work, shortcuts, Go to the form; the phone does not open on the act |
| 8 | Aesthetic and Minimalist Design | 3 | Destination card gone, blockers narrowed, history folded; 390 pages 2,250–2,870px (were 2,500–3,320); three status vocabularies (strip tag, panel badge, rail) |
| 9 | Error Recovery | 3 | Refusals at the form; `loadFailed` panels still have no retry |
| 10 | Help and Documentation | 3 | Good hints (prefill, clock, "starts treatment"); point of no return's commitment only inside its form |
| **Total** | | **30/40** | **Good (from 29; passes 30–31)** |

## Design Specificity Verdict

**LLM assessment:** authored for this product (was "partly specific"). The file reads as one ledger of real hospital acts — reserve, letter,
point of no return, travel, voucher, receipt, number — as ✓ facts, one open act with the view's only filled button, and dashed "Later:" rows;
the cashier line and the discharge stamp belong to this platform. The generic shell around it (strip, status pill, panel badge, journey rail)
now disagrees with the precise file.

**Deterministic scan:** `impeccable detect` 0 findings on the five files (final run on the committed code). Physical direction 0 (one comment
false positive); raw colours 0 hex/rgb (2 Tailwind `white`, pre-existing, DischargePanel:304, StaffCaseView:514); `window.confirm` 0; inline
en/ar copy 0; money inputs without `dir="ltr"` 0 (the receipt and letter amounts are now `AmountInput`, grouped text fields); off-ladder sizes 3,
all pre-existing heading sizes in StaffCaseView; `datetime-local` outside `TimeField` 2 (TravelPlanPanel, both with `dir="ltr"` and own hints).
Filled buttons: at most 1 per Operations view at every stage. Letter view: 4 summaries at first paint (was ~6–7), 3 more inside closed parents.

**Visual overlays:** skipped — the portal needs the mocked OIDC session; no user-visible overlay.

## What's Working

1. One sequence, one open act: ✓ / open / dashed "Later:" reads order and state at a glance, mirrored cleanly in Arabic.
2. The cashier line answers the counter task and leaves once paid; the receipt is prefilled with the same figure and says why.
3. Disclosures named by their contents ("Also possible now: Point of no return · First confirmed appointment", "File history (n)").

## Priority Issues

- **[P1] The strip contradicts the file** on plan and letter (B-5-1). Fix: step codes for the reservation and the letter, so "Your step"
  names the file's open act. Command: /impeccable clarify.
- **[P1] Act names differ across surfaces; Arabic My work is half English.** "Record the receipt" / "Record the hospital receipt",
  "Confirm the patient has left" / "Confirm the departure", «تنسيق العلاج والسفر» / «رتّب السفر والوصول»; queue summaries in English.
  Fix: one act-name key for queue, strip and file; summary codes. Command: /impeccable clarify, /impeccable harden.
- **[P2] Plan-view travel shows the waiting clock** for Operations' own work. Fix: a "Later:" row or a plain to-do while the reservation is
  open. Command: /impeccable polish.
- **[P2] The depart view leaves the file grammar:** pack and letter are plain lines, no File history, "Discharged" pill beside "Confirm the
  departure". Command: /impeccable layout.
- **[P3] Three status vocabularies** (strip tag, panel badge, rail). Command: /impeccable distill.

## Persona Red Flags

**Operations officer at the cashier, Arabic phone:** the cashier line works; the native picker shows Latin "PM"; the My work card's summary is
English; the receipt form is ~1,000px down ("انتقل إلى النموذج" is the fast path).

**New Operations hire:** trusts "Your step" and looks for a travel form while travel is ✓; "Point of no return" in the side label gives no hint
it ends travel refunds; the clock on planning travel reads as someone else's work.

**Coordinator or auditor:** File history is collapsed (counted); the ✓ lines name no person; the voucher breakdown is one disclosure deeper;
the depart view has no history.

## Minor Observations

- At 1440 the letter form leaves "Hospital reference" alone on its row.
- No correction under "Arrived" / a checked letter after the receipt: if locked, say so.
- At 390 the journey rail and case team push the footer ~600px down on Operate views.
- A letter price above the estimate maximum is only a hint until Finance's check.

## Questions to Consider

- If the file shows the open act and its one button, does Operations' strip need "Your step" at all?
- Should the point of no return be a "Later:" row in the sequence with a one-line consequence, rather than a side act?
- At the cashier, could the balance view open on the receipt form, the cashier line as its heading?
