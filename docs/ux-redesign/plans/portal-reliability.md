# Plan — Portal reliability

Status: **approved by the owner's standing instruction (2026-10-08)** to run the recommended follow-ups end to end
without further gates. Scope: the open backlog P1s that staff feel daily. No visual redesign.

## Job

Coordinators, Consultants, operations and finance act many times a day inside the case workspace and its drawers.
Every action must keep their place, show its result where they are looking, and never lose what they typed.

## Decisions

1. **Busy is not a disabled workspace.** The `<fieldset disabled={busy}>` around the workspace, the messages drawer
   and the patient proposal drawer becomes `aria-busy`. Disabling dropped keyboard focus to `<body>` on every action
   and dimmed the page to 65%. `mutate` already refuses a second mutation while one is pending, and every submit
   disables itself while busy.
2. **Feedback reaches the drawer.** A modal `<dialog>` makes the page banner inert and unseen, so drawers render the
   same notice and error themselves (`FeedbackContext`). A drawer clears the page feedback when it opens, so it shows
   only what happened inside it. When a drawer shows its own confirmation, the generic "Saved" is cleared.
3. **Drafts survive tab switches.** The overview and clinical tabs (proposal notes, operations plan, clinical review,
   final assessment) stay mounted and are hidden. Documents and activity stay conditional (read-only, data loads).
   Leaving the case ("My dashboard") still discards drafts — a dirty-form warning is a separate backlog item.
4. **Bulk actions report per case.**
   - Bulk *Take ownership* counts its outcomes: "Took ownership of N of M". Failed cases stay selected.
   - Bulk *Request information* sends once per case and keeps the typed request when some cases fail. A retry goes
     only to the cases that failed, so no patient gets the request twice.
5. **Every control has a label.** This covers the discharge document, the final-assessment currency, the service and
   amount fields, and the localised "Remove service". The hard-coded English `aria-label` is gone.

## Out of scope (backlog)

- A dirty-form warning when leaving the case.
- `mutate` returning the same value for "failed" and "skipped while another runs".
- The serial request waterfalls and the 132 KB `Portal.tsx` module (performance step).
