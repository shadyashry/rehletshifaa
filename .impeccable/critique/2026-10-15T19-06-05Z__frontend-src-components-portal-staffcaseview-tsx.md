---
target: coordinator workspace (staff screens)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\focused-jackson-a4d85d\\frontend\\src\\components\\portal\\StaffCaseView.tsx"
target_fingerprint: "sha256:e2b9e5bd537ef47ffbe1dd2601ac1f6193a6c9f9e10817e1b093aec88a74963c"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\focused-jackson-a4d85d\\frontend\\src\\components\\portal\\StaffCaseView.tsx"
timestamp: 2026-10-15T19-06-05Z
slug: frontend-src-components-portal-staffcaseview-tsx
---
Method: dual-agent (A: a3cd847c1d8d3f6ed · B: a18973d24c7331f16)

# Critique — coordinator workspace (UX area 2, before), 2026-10-15

Evidence: `docs/ux-redesign/screenshots/area-2/before/` (my-work, my-cases, team-queue, conversations, case, case-messages × en/ar × 390/1440; synthetic fixture `frontend/e2e/coordinator-fixture.ts`).

## Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Waiting-on and counts clear; conversation list has no "awaiting your reply" mark, the WhatsApp 24h window shows only under the composer |
| 2 | Match system / real world | 2 | h1 is the role ("Coordinator") on every view; internal thread named "Doctor · internal" (not Consultant); Arabic rows fall back to English work titles |
| 3 | User control and freedom | 2 | Back says "My dashboard" (no such place); no next-case path; leaving a case does not return to the row you came from |
| 4 | Consistency and standards | 2 | Three tab styles (header pills, underline tabs, boxed pressed buttons in Conversations); hairline list in My work, bordered card list in the queue |
| 5 | Error prevention | 3 | Disabled send, required reasons, confirm on complete |
| 6 | Recognition rather than recall | 2 | Thread `<select>` hides which thread has unread messages; conversation ↔ case never linked |
| 7 | Flexibility and efficiency | 1 | No list keyboard model, no shortcuts, no next case, no templates (D-06) |
| 8 | Aesthetic and minimalist design | 2 | h1 + subtitle + count line repeat on every view (~230px); Out-of-office card on My work; waiting-on said three times on the case page |
| 9 | Error recovery | 2 | "No eligible Consultant": passive "ask your coordinator lead" line |
| 10 | Help and documentation | 2 | Inline intros good but long and permanent |
| **Total** | | **21/40** | **Acceptable** |

## Design specificity

On-palette, off-concept. Petrol, paper, hairlines and badges are right; the case-file direction is absent on the staff side — no file-tab edge, no stamp on real events, no journey markers (the rail is hollow radio-like dots), card-in-card (Case brief inside the tab panel; the messages card inside the drawer repeats the drawer title). Detector: 0 findings (regex-only on .tsx, element rules did not run; the browser overlay needs the Playwright-mocked OIDC session and was skipped). Mechanical scan: 70 off-ladder font sizes (StaffCaseView 29, CaseQueue 25), ~12 padded tinted notices (`bg-brand-50`/`bg-alert-50`), ~155 inline `ar?…:…` copy ternaries (StaffCaseView 102, Portal 24, CaseMessages 14, JourneySnapshot 8), 40px header buttons with a below-3:1 edge (`StaffCaseView.tsx:193,196`), one raw rgba shadow (`CurrentAction.tsx:64`), a "✓" glyph (`StaffCaseView.tsx:258`). No physical-direction classes.

## Priority issues

- **[P1] No working loop (D-06).** No list keyboard model in My work / the queue, no next item after finishing, focus not returned to the row. Fix: roving focus list (↑/↓, Home/End, Enter), return to the row on Back, a quiet "Next in My work" link on the case strip, a shortcuts dialog (`?`), physical-key bindings so Arabic layouts work, an off switch (WCAG 2.1.4).
- **[P1] The case page has no single "now" line that survives scrolling, and does not mirror the patient's side.** Current action, waiting-on (×3) and the patient's current step are scattered. Fix: a one-next-action strip — your action (backend `currentAction`) + who waits + what the patient's page says now (needs the patient-side step code from the backend) — the file cover's top edge, kept visible as a slim sticky line once the panel scrolls away.
- **[P1] Messaging is split and slow.** Thread `<select>`, per-message Mark read, copy inline; conversations list without awaiting/window state, garbled bidi in Arabic rows (`ConversationsView.tsx:70-71`). Fix: thread tabs with unread counts, read on view stays a backend call per message (no bulk endpoint today), awaiting-your-reply + window in the list, `<bdi>` per run, copy to messages files.
- **[P2] Staff chrome heavy, dossier identity missing.** h1 = role; repeated subtitle and count line; Out-of-office on My work; journey dots; card-in-card; 40px buttons. Fix: the view's name as the place, count line only on My work, file-tab edge on the case cover, journey markers, flatten, one tab style.
- **[P2] Arabic parity.** English fallbacks in Arabic rows; inline copy (~155 ternaries) bypasses the messages files and the native review.

## Persona red flags

- **Alex (keyboard power user):** ~20 Tab stops to reach row 2; no shortcuts; no next case; back to the list by hand after each case.
- **Sam (screen reader):** view switch keeps the same h1; picking a conversation does not move focus to the thread; repeated "Mark read" buttons; 40px header buttons with a sub-3:1 edge.
- **Bilingual coordinator with WhatsApp open:** cannot see which conversations await a reply or when the 24h window closes without opening each; no jump between a conversation and its case; English work copy in the Arabic UI.

## Minor observations

Team queue "Select page" for one row; mixed time formats; every `<dt>` in the case brief as an eyebrow; on phones the journey rail falls below the whole brief; conversations stack list and thread with no back step; a My work item waiting on the patient sits among actionable items.

## Note on one finding

A noted "urgent item vs current action disagree" in the fixture: the fixture's work items were written independently of the case's resolved action. In real data the backend resolves `currentAction` (often the same work item); the UI must not override it. The plan treats it as: show the case's other open work items (from My work) under the strip, never replace the backend's action.

## Questions to consider

1. Should a patient's WhatsApp reply be answered in place on the case strip rather than behind a drawer badge?
2. Should My cases and Team queue fold into My work as groups? (Not taken: the views are accepted, GATE P2-2.)
3. What would the coordinator lose if the role title disappeared entirely?
