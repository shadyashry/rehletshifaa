---
name: redesign-area
description: Redesign one RehletShifaa UI area end-to-end with Impeccable, Vercel guidelines, Pro Max checks and project rules. Use only when explicitly invoked.
argument-hint: <area name + files>
disable-model-invocation: true
---
Redesign: $ARGUMENTS

Preconditions — stop and report if any is missing:
- PRODUCT.md, DESIGN.md, docs/ux-redesign/backlog.md
- An approved plan for this area in docs/ux-redesign/plans/
- Clean working tree on feat/ux-redesign (or a branch from it)

Read first (only the parts for this area): the approved plan, matching backlog items, the latest
critiques in .impeccable/critique/, approved decisions in docs/ux-redesign/STATUS.md.

Roles: Impeccable decides UX. Tokens come only from globals.css @theme / theme-petrol.css (approved
component tokens included). Pro Max only reviews and advises on charts — never adopt its style,
page-pattern or font picks. Vercel skills win on code concerns.

Pipeline — in order, never skip a step:
1. /impeccable:impeccable craft this area following the approved plan. Use existing tokens; propose new
   ones instead of inventing values. If the area has charts, consult ui-ux-pro-max for chart type and an
   accessible chart palette mapped to existing tokens.
2. /impeccable:impeccable harden — long Arabic names, missing/empty data, error states, RTL mirroring.
3. /impeccable:impeccable clarify — every string in messages/en.json AND messages/ar.json; no hard-coded copy.
4. /impeccable:impeccable adapt — 375px, 390px and 1440px.
5. Launch FOUR subagents in parallel (one message), each READ-ONLY, each returning
   `file:line — severity — finding — fix`:
   a. vercel-react-best-practices + vercel-composition-patterns review of the changed files
   b. web-design-guidelines review of the changed files
   c. RTL/i18n review: logical properties only, mirrored directional icons, en/ar key parity,
      Intl for dates/numbers/plurals
   d. ui-ux-pro-max pre-delivery checklist on the changed screens: contrast ≥ 4.5:1, visible focus,
      reduced motion, touch targets ≥ 44px, SVG icons (no emoji), 375/768/1024/1440 breakpoints
6. Fix every CRITICAL and HIGH finding (when reviewers disagree, apply the stricter rule). Add MEDIUM/LOW
   to docs/ux-redesign/backlog.md under this area.
7. Verify: lint, typecheck, unit tests, Playwright specs for this area, e2e/a11y.spec.ts (en + ar).
   Update visual snapshots only for intended changes and list each one. Shrink the a11y baseline for
   any fixed entries.
8. Report: files changed, findings fixed/deferred per reviewer, test results, snapshot changes,
   screenshots (en/ar, 390px/1440px), open questions. Do NOT commit — wait for approval.
