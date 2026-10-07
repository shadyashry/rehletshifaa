# UX redesign: public site trust fixes, patient proposal, role-aware staff work views

**Base:** `codex/platform-control-plane` · **Head:** `feat/ux-redesign`

This PR applies the first pass of the RehletShifaa UX redesign epic. The rules are in `CLAUDE.md` → "UX redesign
epic"; the tracker is `docs/ux-redesign/STATUS.md`; the backlog is `docs/ux-redesign/backlog.md`. All work used
synthetic fixtures only.

## What changed

### Product and design context
- `PRODUCT.md` (users, positioning, constraints, open legal decisions).
- `DESIGN.md`: the Petrol & Paper "Clinical Dossier" system, plus the `.impeccable/design.json` sidecar.
- Critique snapshots are in `.impeccable/critique/`.

### Public site
- **"Verified" removed.** Consultants are no longer labelled "Verified" anywhere (stats, intros, router, home
  principles, verification section). Credential review is described as a process.
- **WhatsApp.** Every pre-filled message is localised (no hard-coded "cardiac"), and the post-submission message
  carries the case number. Site metadata is no longer cardiac-only.
- **Phone field.** A representative abroad can choose their own WhatsApp country code; it defaults to the patient's
  country.
- **Calls to action.** The care areas and Consultants index pages have one quiet route to the case form, and the
  header's "Start my case" is hidden on the case form itself.
- **Arabic labels.** Eyebrows have no letter-spacing.
- **Contrast.** Placeholders meet AA.

### Portal fixes (also merged into `codex/platform-control-plane`)
- **My Care reload loop for linked patients** (`6ea32d2`):
  - `signIn` is now stable;
  - the session registers once per user;
  - no role-less `/undefined/` request.
- **Cross-case drafts** (`6f561e6`): the case workspace is keyed by case id, so typed drafts can no longer be
  submitted against another patient's case.

### Patient proposal
- **Wording.** The drawer is titled "Your proposal" / "مقترحك", with plain-word statuses and a long localised
  validity date.
- **Order.** Price, then line items, then the honesty line (English identical to the approved commercial wording),
  then the Consultant's recommendation.
- **Terms.** Behind a disclosure marked "Pending legal review", open while a decision is owed.
- **Decision.** One primary decision. Request changes needs a note, and failures are reported inside the drawer.
- **Arabic (owner decision, option B).** The primary decision is disabled until the Arabic terms are legally
  approved. The switch is `ARABIC_TERMS_APPROVED` in `lib/commercial-terms.ts`.
- **Amounts.** One money format; bidi isolation for amounts and free text.

### Staff work views (CurrentAction, MyWork, CaseQueue)
- **"You" only for the person really waited on.** That is the owning coordinator, the assigned Consultant or the
  patient. Others read "our team" or "another party".
- **One coordinator label everywhere** (queue, header, case team, brief), and Consultant-specific wording on
  coordinator-owned cases.
- **Wording.** "Assign a Consultant" with no "verified"; "Consultant" capitalised throughout.
- **Counts and labels.** `Intl.PluralRules` counts (Arabic forms included); priority and care-area words from one
  source; "Case RS-…" titles.
- **Arabic.** Work-item titles in Arabic by work type, and "responsibility" wording.
- **Keyboard and touch.** RTL arrow keys plus Home/End on every portal tablist; 44px hit areas.
- **Copy.** All staff work copy is in `messages/*.json` (`portalWork`), passed by the server page through a context.

### Tokens
- **Component tokens** for button, badge, table, dialog, field and card, as aliases of the existing tokens; Petrol &
  Paper overrides only the structural differences.
- **Field edge.** New `--color-ink-350` `#7a898c`, giving 3:1 non-text contrast.
- **Deferred.** The status, chart and dense-table tokens (B1–B3) are not adopted.

### Tooling
- **Accessibility ratchet.** `e2e/a11y.spec.ts` checks 10 pages in en and ar against WCAG 2.2 AA (axe), blocking only
  serious and critical violations. Known issues live in `e2e/a11y-baseline.json`, which can only shrink. It currently
  has one entry: `en/care-areas` `color-contrast`, from the decorative numerals.
- **`/redesign-area` skill** (`.claude/skills/redesign-area`) with a four-reviewer gate.

## Tests

| Check | Result |
|---|---|
| typecheck | ✅ |
| lint | 25 errors / 13 warnings, unchanged from the base branch |
| unit (vitest) | 318 passed, 11 failed. The 11 are pre-existing `ProposalSign.test.tsx` failures. New tests cover labels, copy parity, plurals, ownership, RTL keys, the proposal decision and the Arabic gate. |
| Playwright (local dev server, synthetic fixtures) | 178 passed, 26 skipped (live specs need credentials), 22 failed |
| Accessibility ratchet | 20/20 |

All 22 Playwright failures are pre-existing or environmental:
- 18 fail identically on the base commit `975f071`: `portal-ux` ×4, `care-coordination` Control Center ×2,
  `access-governance` ×2, `credential-reviews` ×2, `ux8-commercial-journeys` ×6 and `home-media` ×2.
- 4 are `case-flow` tests, which submit to the real backend. Its CORS allows only the tunnel origin, so they need a
  run on the tunnel stack. A locator regression in this spec, caused by the new country-code select, is fixed.

**Not run:** the live specs (they need credentials) and `case-flow` on the tunnel stack. The tunnel stack needs a
frontend rebuild from this branch first.

## Accessibility baseline delta

The ratchet is introduced here. The baseline starts at one entry (`en/care-areas` `color-contrast`) and did not
change during the epic.

## Critique scores

| Surface | Before | After |
|---|---|---|
| Portal | 24/40 | 25/40 |
| Public site | 25/40 | not re-run |

## Open items (see `docs/ux-redesign/backlog.md`)
- **Owner decision (P0):** Arabic patients can decline but not accept under option B. The proposal is a
  coordinator-mediated Arabic decision path.
- **P1:**
  - the duplicated "Assign Consultant" current action, and the dead end when no Consultant is eligible;
  - the staff home distill (stat tiles, toolbar, slim footer, staff navigation).
- **P2:**
  - token drift (12–16px radii, tinted panels, sub-13px labels);
  - My Care naming the patient or representative;
  - drawer nesting and shadow;
  - "Pending legal review" next to concrete refund promises (legal).
- **Backend:**
  - work-item titles as codes rather than English text;
  - a `coordinatorSubject` on work items.
- **Native Arabic review** of all new Arabic copy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
