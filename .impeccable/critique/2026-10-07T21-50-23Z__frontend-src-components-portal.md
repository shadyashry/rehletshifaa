---
target: portal, patient and staff views
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\frontend\\src\\components\\portal"
timestamp: 2026-10-07T21-50-23Z
slug: frontend-src-components-portal
---
Method: dual-agent (A: design review · B: detector + rendered evidence), synthetic fixtures on localhost dev server. Re-critique after Phases 1–6 of the UX redesign.

# Critique: portal (frontend/src/components/portal), patient and staff views — 25/40 (was 24/40)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Current step/action clear; KPI "1 Need action" next to "You have no open work" |
| 2 | Match system / real world | 3 | Plain patient wording; AR "العرض" vs drawer "مقترحك"; untranslated names/countries |
| 3 | User control and freedom | 2 | AR patient cannot accept but can decline; Decline via window.confirm |
| 4 | Consistency and standards | 2 | Three journey visuals; 12–16px radii; off-palette sky/violet/amber/stone; duplicated Assign Consultant |
| 5 | Error prevention | 3 | Note required for changes; ack gates primary; blank Assign select without guidance |
| 6 | Recognition rather than recall | 3 | Case header context good; no staff global nav |
| 7 | Flexibility and efficiency | 2 | No keyboard row nav; List/Cards + Select page at 390; filled CTA per row |
| 8 | Aesthetic and minimalist | 2 | Staff KPI tiles mostly zero; "You" repeated; patient five boxed cards |
| 9 | Error recovery | 3 | Errors inside the drawer; claim conflicts refresh; "No eligible consultant" dead end |
| 10 | Help and documentation | 2 | No deposit explanation before request; AR terms fallback English-only |

## Priority Issues
- [P0] Arabic patients cannot accept their proposal but can decline (owner decision GATE 2 option B): replace the dead end with a coordinator-mediated decision path; de-emphasise Decline while blocked; escalate Arabic terms approval. → clarify, harden
- [P1] Staff home is a template dashboard: off-palette KPI tiles, disabled zero tiles, empty My work landing, marketing footer, no staff nav (RoleDashboardSummary, CaseQueue, MyWork, Portal). → distill, layout
- [P1] Duplicated and dead-end current action in the coordinator case: CTA + inline "Assign a Consultant" form; blank care-area select; no next step when no Consultant is eligible. → clarify
- [P2] Token drift: rounded-xl/2xl, brand-50/sand-50 tinted panels, sub-13px labels, amber text, shadow-xl popover. → polish, typeset
- [P2] My Care is a stack of boxes and never names the patient; representative invisible. → layout

## Detector
CLI: 5 side-tab (border-s-4) in NotificationBell:101, Portal:358/475/500/665. In-page (7 views): mostly false positives (gradient underlines, closed menus, detector overlay, paper token, shared footer). Real: kicker above My Care current-step heading; nested surfaces in the proposal drawer (sticky header, deposit terms box); thin border + wide shadow on the drawer; shared footer 12px gutters at 390.

## Strengths
Patient current-step pattern; proposal content discipline (no internal status, honesty line, bdi amounts, note required); RTL mechanics largely right.
