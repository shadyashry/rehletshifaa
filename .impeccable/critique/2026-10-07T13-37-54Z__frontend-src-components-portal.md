---
target: portal, patient and staff views
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\frontend\\src\\components\\portal"
timestamp: 2026-10-07T13-37-54Z
slug: frontend-src-components-portal
---
Method: dual-agent (A: design review · B: detector + rendered evidence), synthetic fixtures on localhost dev server.

# Critique: portal (frontend/src/components/portal), patient and staff views — 24/40

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | My Care reload loop; "Waiting on: the consultant" shown to the Consultant |
| 2 | Match system / real world | 2 | "v1 · RELEASED", NORMAL, cardiology, Latin "Kenya" in AR; "Patient proposal" to the patient |
| 3 | User control and freedom | 3 | Breadcrumbs, drafts kept, review-before-claim |
| 4 | Consistency and standards | 2 | Two shells; consultant/Consultant; "verified consultant" |
| 5 | Error prevention | 3 | Disabled actions carry reasons |
| 6 | Recognition rather than recall | 3 | Journey rail, case brief, waiting-on |
| 7 | Flexibility and efficiency | 2 | No keyboard nav/saved views; bulk select without bulk actions |
| 8 | Aesthetic and minimalist | 2 | Marketing footer on staff screens; duplicated assign controls |
| 9 | Error recovery | 3 | Retry works; "no eligible Consultant" dead end |
| 10 | Help and documentation | 2 | Staff gates unexplained |

## Priority Issues
- [P0] My Care reload loop for linked patients: AuthProvider.tsx:44 signIn deps [me] → Portal api deps signIn → session effect (deps api) calls refreshMe() on linked → me null → loop. ~845 preference calls/10 s; GET /api/v1/undefined/cases/case-1. Fix: stable signIn via ref, register session once per subject, guard undefined path. → harden
- [P1] Proposal dialog written for staff: third-person title, raw RELEASED status, US dates, English-only terms on AR, terms wall before decision, refund rules stated as settled while F2 is open (Portal.tsx:753, lib/commercial-terms.ts). → clarify
- [P1] Role-blind copy and raw enums in staff views (CurrentAction, MyWork, CaseQueue): "Owned by another coordinator" to Consultants, "Coordinator: Unassigned" on own case, "1 cases", NORMAL/cardiology, "verified consultant". → clarify
- [P2] Staff homes generic dashboard: multi-hue stat tiles, 6+ toolbar controls, lands on empty My work, List/Cards + Select page without purpose, marketing footer (RoleDashboardSummary, CaseQueue). → distill, quieter
- [P2] Off-system type/shapes: 0.7–0.75rem/text-xs labels (37+ in Portal.tsx), rounded-xl ×40, 5 border-s-4 side stripes (NotificationBell:101, Portal:339/454/479/639), amber tones, petrol/cream washes, 32px "Mark read". → typeset, polish

## Detector
CLI: 5 side-tab. In-page (7 views): 117 raw, ~90% false positives (gradient underlines, closed menus, detector overlay, paper token, shared footer). Real: all-caps body, nested cards (services table, intake summary), kicker on current step. Static HTML scan unreliable (CSS not loaded). Overlay injection by URL blocked by CSP.

## Persona Red Flags
Alex: no keyboard nav, empty My work landing, two-step assign. Sam: loop re-announces loading; h2 styled 11.5px label; unnamed 32px Mark read; tablist wraps at 390 AR. Casey: proposal legal scroll; footer +500px. Arabic son acting for mother: English money terms, Latin country, three currency formats, no representative context, "عرض العرض".
