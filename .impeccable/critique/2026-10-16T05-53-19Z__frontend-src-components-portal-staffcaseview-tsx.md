---
target: coordinator workspace (staff screens), after area 2
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\angry-haibt-7f91be\\frontend\\src\\components\\portal\\StaffCaseView.tsx"
target_fingerprint: "sha256:94078c6960c1337f3b53cbe1f33901c2e51b347c8ebc6a27884d7c454e58cf37"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\angry-haibt-7f91be\\frontend\\src\\components\\portal\\StaffCaseView.tsx"
timestamp: 2026-10-16T05-53-19Z
slug: frontend-src-components-portal-staffcaseview-tsx
---
Method: dual-agent (A: a4e5fd7b7594d5f52 · B: ad8c97d90157726fa)

# Critique — coordinator workspace (UX area 2, after slices 2-0…2-4), 2026-10-16

Evidence: `docs/ux-redesign/screenshots/area-2/after/` (my-work, my-cases, team-queue, conversations, case, case-messages × en/ar × 390/1440; synthetic `frontend/e2e/coordinator-fixture.ts`), plus `2-1/case-line-*`, `2-2/help-*`, `2-3/strip-reply-*`. No live browser session (the portal renders only behind the Playwright-mocked OIDC session): screenshots are the visual evidence. Baseline: 21/40 (2026-10-15).

## Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Nav counts, overdue and both sides of the case are clear; Conversations has no "awaiting you" count; the case drawer does not show the WhatsApp reply window |
| 2 | Match system / real world | 3 | Steps named by outcome; "Blocking", "Reply window", "Intake review" vs "Received" still need translating |
| 3 | User control and freedom | 3 | Back to My work, Next in My work, Escape, confirm on complete; no undo after Take ownership |
| 4 | Consistency and standards | 2 | Two row grammars (My work vs My cases / Team queue); "Blocking" chip reads as a status; one tab style now holds |
| 5 | Error prevention | 3 | Disabled send, required note, failed bulk claims stay selected; claim offered on a list row before review |
| 6 | Recognition rather than recall | 3 | Shortcuts visible, sticky line repeats the step; Next names a case, not its task |
| 7 | Flexibility and efficiency | 3 | Roving lists, physical-key shortcuts, `n`, bulk select; no keys for messages/reply/send/claim |
| 8 | Aesthetic and minimalist design | 3 | Calm hairlines on paper, place-named pages, one count line; the first My work row says urgency four times |
| 9 | Error recovery | 2 | "No eligible Consultant" offers a fix; other request errors land in the page banner, not at the control |
| 10 | Help and documentation | 3 | One-line view intros, shortcuts dialog with the off switch, composer says who sees the message |
| **Total** | | **28/40** | **Good** (from 21) |

## Design specificity

The case page is authored for this product: the file-tab cover, "Your step" beside "Waiting on" and "The patient's page", "Also open on this case", the sticky case line and the journey markers. The lists (My cases, Team queue, Conversations) are still category-standard rows (checkbox, copy icon, status chip, search/filters/sort). Detector: 0 findings (regex-only on `.tsx`; element rules did not run — an undercount). Mechanical scan against the baseline: off-ladder sizes 70 → 0 (the last 3 in `JourneySnapshot` fixed after the scan), tinted notices ~12 → 0 (the bulk-selection bar made a hairline after the scan), inline copy ternaries ~155 → 6 (3 punctuation-only; real copy left only in `JourneySnapshot`, with its ~45 `{en, ar}` label maps), physical-direction classes 0, raw colours 0 (was 1), glyph icons 0 (was 1), `aria-pressed` for navigation 0.

## Priority issues

- **[P1] Two list grammars.** My work leads with chips then id and name; the queues lead with name/"Case RS-…", a status badge, a checkbox and a copy icon. Fix: one shared row (id and name, step title, one meta line, one action), bulk selection shown only once something is selected. → /impeccable layout
- **[P1] Take ownership on a list row.** Filled once per list since 2-4, but still a claim before review (PRODUCT: review before claiming). Fix: Open as the row's action, the claim on the case strip (CLAIM kind), bulk claim in the selection bar — needs a look at GATE P2-2's accepted queue. → /impeccable distill
- **[P1] The case drawer hides the reply channel and window.** Fix: the Conversations window hint under the case composer ("Sends on WhatsApp · window closes …" / "Window closed: goes to their secure page"); needs the window on the case's `patientReply`. → /impeccable clarify
- **[P2] Arabic parity leaks.** English work titles/contexts and "Team Coordinator" in Arabic rows; `JourneySnapshot` label maps. Fix: work-copy codes for every work type, `lang="en"` on any fallback, the maps to messages. → /impeccable harden
- **[P2] Urgency said four times on one row.** Urgent + Overdue + Blocking + red due date. Fix: one priority word, the overdue date in alert ink, "Blocks the case" as a meta phrase. → /impeccable quieter

## Persona red flags

- **Alex (power user):** no keys for Messages, reply focus, send (Ctrl+Enter), claim or mark read; help lists Shift+Tab as "this row's other actions"; Next shows a case, not its task.
- **Sam (screen reader):** request errors announced far from the control; per-message Mark read; phone nav scrolls with the scrollbar hidden and no sign of more items.
- **Bilingual coordinator with WhatsApp open:** window as an absolute time, not time left; no "awaiting you" count on Conversations; no window state in the case drawer; English in Arabic rows.

## Minor observations

Mixed date styles ("Updated Sep 5" vs "2 days ago"); content shows through the translucent header above the sticky line; "Select page" for a single row; the sort select has no visible label; the drawer composer sits close to the "WhatsApp before the case" link. The case strip opens on the backend's current action while My work ranks the overdue reply first (fixture-written; the UI must not override the backend, but it could say why).

## Questions to consider

1. If My work ranks the overdue reply first, should the strip say why it shows a different step?
2. Should claiming exist on a list row at all, given "review before claiming"?
3. Should "awaiting your reply" conversations become My work items — one queue instead of two inboxes?
