---
target: portal (frontend/src/components/portal)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\vigilant-roentgen-29caab\\frontend\\src\\components\\portal"
timestamp: 2026-10-09T14-11-06Z
slug: frontend-src-components-portal
---
Method: dual-agent (A: design-review sub-agent · B: detector + browser sub-agent), isolated, parallel. Evidence: branch build `feat/ux-redesign-batch-3` (Batch 2 + Batch 3), synthetic fixtures; 41 screenshots (en/ar, 320–1440).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Patient side strong (current step, journey, dated "request sent"); staff header says "Waiting on: you" where the coordinator cannot act (assign-consultant-en-1440) |
| 2 | Match System / Real World | 2 | Raw values leaked: "v1 · RELEASED", "Nationality KE", English "Kenya" on /ar; staff saw the patient's voice ("Waiting for your decision") |
| 3 | User Control and Freedom | 3 | Leave-case guard, in-drawer decline confirm, Escape, request changes |
| 4 | Consistency and Standards | 2 | One Arabic price three ways ("$US 8,200", "500 US$", "820 US$"); long, numeric and short dates mixed; 16px radii on the secure link vs 8px elsewhere |
| 5 | Error Prevention | 3 | Acknowledgement, required change note, decline confirm, staff attestation; US-order date-time in the staff form |
| 6 | Recognition Rather Than Recall | 3 | Sort select reads as a filter (label sr-only); H1 is the role, not the case |
| 7 | Flexibility and Efficiency | 2 | Bulk claim and chips exist; no shortcuts, no "next case"; "My dashboard" names no nav item |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, but the waiting state is said three times on the case page; duplicate decision CTAs on the secure link |
| 9 | Error Recovery | 3 | Drawer-local, specific errors; staff generic fallback; no-Consultant dead end has advice only |
| 10 | Help and Documentation | 2 | Excellent inline explanation; no help entry point; terms "Pending legal review" at the decision |
| **Total** | | **27/40** | **Acceptable** (top of band; up from 25/40) |

## Design Specificity Verdict

**LLM assessment:** the behaviour is authored for this product (one backend-owned current step; the coordinator-mediated Arabic decision; "Recorded by … after a WhatsApp call with you"; authorised-representative-only attestation). The visual layer is category-generic: hairline cards, micro-eyebrows, pill nav, outlined "Open →"; the DESIGN.md signatures (coral eyebrow rule, file-tab top edge, numbered journey markers) stop at the public site. The secure-link proposal page (`ProposalSign.tsx`) spoke a different dialect from the My Care drawer.

**Deterministic scan:** `impeccable detect` over `frontend/src/components/portal` (54 files): 0 findings, also with `--no-config --no-inline-ignores`. Browser overlay (Playwright, fixture sessions, CSP bypassed in the test browser only) in coordinator/patient × en/ar: `cream-palette` ×4 and `kicker-above-heading` ×1 (My Care "Current step") — both the documented Petrol & Paper paper surface and signature eyebrow, so false positives here. Rendered checks: 0 text below 4.5:1, 0 under 12px, no heading skips, no console errors. Mechanical: case-header buttons 40px; several live regions mounted with their content; h2s styled as micro-labels on the staff case page.

## Overall Impression

Trustworthy, quiet, and genuinely shaped around the patient's next step. The weak point was the money moment in Arabic and the labels staff read — both truthfulness problems in small type.

## What's Working

- One current step, owned by the backend, with exactly one primary action only when the patient owes something.
- Recorded-on-behalf decisions are truthful end to end (who, how, when, attestation, dispute line).
- Risky actions are confirmed in place with safe focus; drawers return focus; RTL-aware tab keys.

## Priority Issues

- **[P1] Arabic money, plurals and dates on the proposal surfaces** — "$US 8,200" (un-isolated figure), "3 خدمة", a numeric date beside long ones. Fix: isolate every figure, Arabic plural forms, one long date style. → harden
- **[P1] Secure-link decision bar breaks on Arabic phones; drifts from Petrol & Paper** — six-line primary at 390, backdrop blur, tinted summary with a nested card, 11.5–12.5px labels, "Start my case" shown to someone who has a case. → adapt / quieter
- **[P1] Internal values and the wrong voice in labels** — RELEASED, KE, English country names, patient-voice statuses on staff screens, lowercase "consultant". → clarify
- **[P2] Staff case hierarchy and dead ends** — role as H1; waiting state ×3; blocked state without an action; 40px header buttons. → layout
- **[P2] Queue for daily power use** — sort reads as a filter; copy feedback not announced; no next-case. → polish

## Persona Red Flags

**Alex (coordinator):** sort looks like a filter; no shortcuts or next case; "← My dashboard" matches no nav item; status said three times, none says what to do when blocked; US-order date-time.
**Sam (screen reader):** 40px case-header buttons; copy confirmation visual only; static "No action is required" announced on load; truncated profile values.
**Amal (Arabic relative, Benghazi, phone):** crushed six-line primary, "$US 8,200", "3 خدمة", English rate note, two date formats; WhatsApp is her channel but My Care offers only the in-portal thread.

## Minor Observations

My Care H1 repeats the nav tab; patient and staff journeys name the same stages differently; two language fields in the profile; numeric message timestamps; two unread-count styles; staff free text without `dir="auto"` in the Arabic brief.

## Questions to Consider

- If WhatsApp is where patients talk to their coordinator, should My Care's contact action be WhatsApp?
- Should anyone acknowledge terms marked "Pending legal review", or should the assisted path be the only path until legal signs off?
- What if the staff case H1 were the patient, case number and current action?

## Resolution (Close step, same branch)

The three P1s were fixed before merge: every rendered amount isolated (`ProposalSign`, `StaffCaseView`), Arabic plural forms and one long date on the secure link; the secure-link bar stacks on phones with a short assisted label, no blur, an 8px hairline summary without the nested card, 13px labels, and no "Send my case" in the header on `/proposal` and `/status`; staff-voice status words with proposal and work states, `countryName()` via `Intl.DisplayNames`, "Consultant" capitalised. P2s are on the backlog's Post-launch list.
