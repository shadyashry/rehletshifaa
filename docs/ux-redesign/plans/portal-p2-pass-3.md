# Portal P2s — pass 3

Status: approved by the owner's pass-3 brief (2026-10-08), which lists these items and asks for this plan first.
Area: `frontend/src/components/portal/*`, `components/ProposalSign.tsx`, `app/globals.css`, `lib/i18n.ts`,
`lib/portal-labels.ts`. Backlog sources: "Pass 2 follow-ups", "Staff home — deferred", "Patient proposal — deferred",
"Accessibility and semantics", "Arabic proposal decision — deferred".

## 1. Unsaved text when leaving a case

- **Problem.** "My dashboard", a notification, another case from My Care, or a staff view in the header unmount the
  workspace and drop typed notes (clinical review, proposal notes, final assessment, operations plan, messages).
- **Rule.** Text typed in the open case and not yet sent is a draft. Leaving the case with a draft asks first; leaving
  without one never asks.
- **Detection.** One guard on the workspace root, not a flag in every form: a text field (`textarea`, text-like
  `input`) records its value when first focused; a draft is any such field still on the page whose value differs from
  that. A sent form resets or unmounts its field, so it stops counting. Selects, radios and checkboxes are not drafts.
- **Ask.** An in-page modal dialog (not `window.confirm`, which speaks the browser's language): title "Leave this case?",
  body "Text you typed in this case hasn't been sent. If you leave, it will be lost.", "Keep editing" (focused, quiet
  primary position) and "Leave without saving". Esc = keep editing. Closing or reloading the tab uses the browser's own
  `beforeunload` prompt.
- **Covered exits.** Back to the dashboard / My Care queue, opening a different case (notification bell, My work,
  My Care "other cases"), choosing a staff view, browser Back.

## 2. Staff view in the URL

- `?view=<id>` (`work`, `mine`, `team`, … the existing `StaffViewId`s) is written with `pushState` when a person picks a
  view, read on load (an explicit choice, so it wins over "first view with work"), and re-read on `popstate`, so
  Back/Forward and deep links reach a view. Patients keep their own `?view=` (documents/messages) — roles never mix.
- Views render as links (`<a href="?view=…">`, click handled in place) so "open in new tab" works. Focus moves to the
  view's `<h2>` after picking a view from inside a case (backlog P2).

## 3. Western digits in Arabic

- Owner default (GATE 2): Western digits until native review. One helper, `intlLocale(locale)` →
  `"ar-u-nu-latn"` for Arabic, used by every `Intl.*` constructor and `toLocale*String` in the portal, the secure
  link and `plural()`. A unit test covers an Arabic few/many count and a date.

## 4. Visible focus on fields

- `.field:focus { outline: 0 }` leaves a 1px border change and a ~1.2:1 halo. Keep the border colour change and the
  halo, and restore the global ring on keyboard focus: `.field:focus-visible { outline: var(--focus-ring);
  outline-offset: 2px }`. Mouse focus keeps the quiet border; keyboard focus always shows the 3px petrol ring.

## 5. Button edge and disabled tokens (proposed here, aliases of existing palette only)

| Token | Value | Why |
|---|---|---|
| `--button-secondary-border` | `var(--color-line-strong)` → `var(--color-ink-350)` | 1.66:1 → 3.63:1 on white, the same edge as fields (GATE 2 Field Edge), WCAG 1.4.11 |
| `--button-outline-border` | `var(--color-line-strong)` → `var(--color-ink-350)` | same control family |
| `--button-disabled-bg` *(new)* | `var(--paper-deep)` (#efeae0) | a flat, clearly inert fill instead of 55% opacity on petrol |
| `--button-disabled-fg` *(new)* | `var(--color-ink-500)` (#41555a) | ~7:1 on the fill: the label stays readable |
| `--button-disabled-border` *(new)* | `var(--color-line-strong)` | inert edge, deliberately quieter than an active one |

`button:disabled` in the portal, account dialog and secure link uses these (no opacity). Disabled controls are exempt
from 1.4.3, but a readable label tells people what the button would do. No new colour values.

## 6. Tap targets

Every remaining portal control under 44px gets `min-h-11` (and `min-w-11` for icon-only): "Mark read" (32px), the
notification "Mark all read" (≈28px), the error-banner Retry (`!min-h-9`), the "Back to dashboard" control (≈33px),
the queue copy button. Pills that are not controls stay as they are.

## 7. Arabic secure link: "what happens next"

In the assisted path (Arabic, terms not yet approved in Arabic) the numbered list must start with the conversation,
not "acknowledge this estimate": 1) ask your coordinator to go through the terms with you in Arabic, 2) they record
your decision with you, 3) the next steps follow (profile, deposit). English and the self-service path are unchanged.

## Out of scope

Status chip colours (B1), the drawer order (price first, approved), journey-bound cases, legal L1–L5, native Arabic
review.
