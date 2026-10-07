# Shape plan — Staff home and the Assign Consultant action

Status: **approved at GATE P2-2 (2026-10-08)**: S1 remove the List/Cards toggle, S2 slim footer on all `/portal`
routes, S3 "مهامي" for My work. No code. Input for `/redesign-area` "Staff home". Sources:
portal re-critique P1 ×2 (`.impeccable/critique/2026-10-07T21-50-23Z__frontend-src-components-portal.md`: heuristic
8 "Aesthetic and minimalist" = 2, 4 "Consistency" = 2, 6 "no staff global nav", 9 "No eligible consultant dead end"),
backlog "Staff home and shell" and re-critique rows, owner decisions (slim footer; staff home distill; fold in the
duplicated Assign Consultant).

## What exists today (verified in code, 2026-10-08)

| Piece | Today | Where |
|---|---|---|
| KPI tiles | Four bordered tiles (Active, Need action, Unowned/New assignments/Pending, Overdue), each with a tinted icon square in `sky-50`, `violet-50`, `stone-100` (off-palette). Zero tiles render **disabled**. "Need action" counts *cases* by status, while My work counts *work items*, so "1 Need action" can sit beside "You have no open work". | `RoleDashboardSummary.tsx` |
| Views | In-page tablist My work / My cases / Team queue (coordinator), counts on My work and Team queue. Default is always `work`, even when it is empty. | `Portal.tsx` `Queue` (~l.250–282) |
| Role switch + clinic | A row of `btn-primary`/`btn-secondary` buttons above the page (one per role + "Virtual Clinic"). | `Portal.tsx` ~l.216 |
| Header | Patients get `PatientNav` in `#portal-nav-slot`; staff get nothing there, only the account menu. | `Header.tsx`, `PatientNav.tsx`, `PortalAccount.tsx` |
| Footer | The full public marketing footer renders on every portal page. | `app/[locale]/layout.tsx`, `Footer.tsx` |
| Queue toolbar | Sub-tabs, scope hint, search, Filters popover, sort select, List/Cards toggle, then "Select page" beside the count — 6+ controls before the first case. Bulk actions exist (claim, request info) only for coordinators. | `CaseQueue.tsx` ~l.137–232 |
| My work | One `card` per item with a filled `btn-primary` "Open" on every row; chips in `amber-50`/`stone-100`; empty state is a large card. | `MyWork.tsx` |
| Assign Consultant | Current action panel shows primary "Assign Consultant" → `onFocusAction` scrolls to a second card "Assign a Consultant" with its own care-area select and "Confirm assignment". The select starts blank when the case has no stored care area; `EligibleConsultantPicker` then can say "No eligible consultant is available for this care area right now." with no next step. Same focus-then-form pattern for Confirm referral, Assign Operations, Assign Finance. | `CurrentAction.tsx`, `CoordinatorActions.tsx` (`CoordinatorActionForm`, `ConsultantAssignment`), `ConsultantRouting.tsx` |

## Job and audience

Coordinators (most), Consultants, operations and finance staff open the portal many times a day on a desktop,
sometimes a phone, in English or Arabic. Mode: **Operate**. They need one answer on arrival: *what should I do
next?* — then to get to it in one move. The home is a work surface, not a dashboard to admire.

## Outcome

- Land where the work is; see the few numbers that change a decision, each one a way into that work.
- Move between My work, My cases, Team queue and the Virtual Clinic from the header, like every other app.
- Assign a Consultant from one place, with the care area already chosen and a next step when nobody is eligible.
- Staff pages look like the product, not the marketing site.

## Direction (Petrol & Paper; enhance, don't revamp; type + hairlines, no new cards)

### 1. KPI tiles → one count line

Replace the tile grid with a single sentence-like line under the page title, hairline-separated, ink and petrol only:

> **3 cases need action** · **1 unowned** · **2 overdue**

- Each non-zero count is a **toggle button styled as text** (`aria-pressed`) that applies the same `matchesKpi`
  filter as today (behaviour and counts preserved, shared function kept). Pressed = petrol underline + weight.
- **Zero counts are omitted**, not disabled. All zero → one calm line: "Nothing needs action right now."
- "Active" is dropped: it repeats the My cases count.
- Wording names the unit ("cases need action", "work items") so the line never contradicts My work.
- Overdue uses `alert-700` text only when > 0; no icon squares, no tints.

### 2. Land on the first non-empty view

Order: My work → My cases → Team queue (coordinator). On first load with no `?view=` in the URL, select the first
view whose count is non-zero once data has loaded (not during loading, to avoid a jump: hold the default until the
first response). An explicit choice — a click or `?view=` — always wins and stays in the URL, as today.

### 3. Staff navigation in the header

A `StaffNav` rendered into `#portal-nav-slot` (same pattern as `PatientNav`), visible from `md`:

- My work (count) · My cases · Team queue (count, coordinator) · Virtual Clinic (when the person has a clinic).
- A `<nav>` of buttons/links with `aria-current="page"`, not a tablist (tabs must sit next to their panel).
- The role switch (people with more than one role) moves into the account menu as "Working as: Coordinator ▾"
  (`PortalAccount`), replacing the row of filled buttons above the page.
- Below `md` the in-page tablist stays (as My Care does for patients) and is hidden from `md` so desktop never shows
  two navigations. RTL: order follows reading direction; counts in `<bdi>`.

### 4. Slim portal footer

On portal routes the marketing footer is replaced by one hairline row: © RehletShifaa · Privacy · Terms · Medical
disclaimer · Help (existing pages; their content stays "pending legal review"). No link groups, no CTA, 16px
gutters at 390. Decided per route (`/portal…`), so it needs no role on the server. *Owner decision S2.*

### 5. Queue toolbar distill

- One row: search (grows) · Filters (popover, unchanged) · sort. Nothing else before the first case.
- **List/Cards toggle removed**; the list is the one presentation and already stacks on phones. *Owner decision S1.*
- "Select page" and row checkboxes appear **only in views that have a bulk action** (Team queue → Take ownership;
  coordinator My cases → Request information). Elsewhere no checkboxes.
- The scope hint moves under the view heading as the one secondary line; sub-tabs keep their place.

### 6. My work rows

- Rows become hairline list items (no `card` per item); priority/overdue/blocking chips use petrol/alert tokens
  only (amber and stone go — approved badge tokens).
- One quiet row action ("Open" as a text button with arrow, mirrored in RTL); the **whole row title is the link**,
  so there is no filled CTA per row. The first item may carry the single `btn-primary` if it is overdue or urgent.
- Empty state: one line + the next useful link ("Nothing assigned to you. 2 new cases in the Team queue →"), not a
  large card.

### 7. One entry point for focus-step actions (Assign Consultant first)

- When the backend's current action is a FOCUS form step (`ASSIGN_CONSULTANT`, `CONFIRM_REFERRAL`,
  `ASSIGN_OPERATIONS`, `ASSIGN_FINANCE`), the **form renders inside the current-action panel** and the panel has no
  CTA of its own. The separate "Assign a Consultant" card and the scroll-to behaviour go. The form's submit is the
  one primary, labelled by outcome ("Assign Consultant").
- **Care area preselected** from the case. If the case has none (patients don't choose one), the select reads
  "Choose a care area" with the hint "The patient didn't choose one. Pick it from their description." and the
  description excerpt is reachable from the case header. The builder confirms why the fixture case shows blank
  (missing `careCategory` vs a slug mismatch with `categories`) before changing anything.
- **No eligible Consultant → next steps**, inline under the message:
  1. "Choose another care area" (moves focus to the select);
  2. for people who hold Control Center access to Consultants: "See Consultants for {care area}" (link);
  3. otherwise: "Ask your coordinator lead to add or approve a Consultant for {care area}."
  No new backend action; nothing promises availability.

## States and ranges

- Counts 0 to 999+ (format with `Intl.NumberFormat`, Western digits per GATE 2 default); long Arabic labels wrap
  to two lines in the count line on 375px without overflow.
- Loading: count line and nav counts show no numbers (not zeros) until data arrives.
- Roles: coordinator, coordinator lead, Consultant (New assignments), operations, finance (finance home stays the
  link + empty state; its redesign is backlog P3), multi-role people.
- Errors: the existing page banner; nothing new.

## Scope and boundaries

- Files: `RoleDashboardSummary.tsx`, `CaseQueue.tsx` (toolbar, selection), `MyWork.tsx`, `Portal.tsx` (Queue, role
  switch, header slot, landing), a new `StaffNav.tsx`, a new portal footer (or a route switch in `Footer.tsx`),
  `PortalAccount.tsx` (role switch), `CurrentAction.tsx`, `CoordinatorActions.tsx`, `ConsultantRouting.tsx`
  (no-eligible next steps), `messages/en.json` + `ar.json` (new strings; move touched inline `ar ? … : …` copy there).
- Untouched: case workspace beyond the current-action panel, Control Center, patient My Care, backend.
- Anti-goals: no new tokens or colours; no charts; no keyboard shortcuts/saved views (P3); no second primary in any
  region; no removal of a filter or bulk action that works today.

## Owner decisions needed

Answered at GATE P2-2: **S1 remove**, **S2 all `/portal` routes**, **S3 مهامي**.

- **S1 Cards view** — remove the List/Cards toggle (recommended; staff scan lists, and the toggle is one of the six
  toolbar controls), or keep it on desktop only.
- **S2 Footer scope** — slim footer on **all** `/portal` routes, patients included (recommended; one rule by route,
  and My Care is an app too), or staff screens only as decided earlier (needs a client-side role switch).
- **S3 Arabic view names** — use "مهامي" for My work (the pending native-review suggestion) now, or keep "عملي".

## Acceptance and verification (for `/redesign-area`)

- Unit: count line (zero omission, pressed state, filter parity with `matchesKpi`), landing rule, StaffNav
  (aria-current, roles, clinic), toolbar without the toggle, current-action panel with the inline form, no-eligible
  next steps; existing `StaffOperationalUi`/`StaffWorkspace` tests updated for intended changes only.
- e2e on `frontend-dev` :3100 with `portal-fixture.ts` (synthetic): staff home en/ar at 390 and 1440; coordinator
  case with ASSIGN_CONSULTANT; `a11y.spec.ts` en + ar at or below baseline.
- Known pre-existing failures are compared against base `d09a3ad`, not counted as regressions.
