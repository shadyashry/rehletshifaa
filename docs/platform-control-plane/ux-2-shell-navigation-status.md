# UX-2 — Control Center shell, navigation, Home and terminology

Date: 2026-09-24 · Branch: `codex/platform-control-plane` · Base: UX-1 `c8272b5` (UX-0 `d031450`)
Scope: plan §11 row UX-2 only. No Provider Workspace (UX-4), no Consultant Setup / Clinician directory redesign (UX-3),
no Access & Governance, Credential, Coordination or Journey redesign (UX-5 … UX-8), no Phase 8C. Journey production
intake stays OFF. **No backend change.**

## 1. Information architecture — before / after

| Before (44dd629 / UX-1) | After (UX-2) |
|---|---|
| Overview | **Home** (attention only) |
| Providers: Organizations · Consultants · Practice team | **Providers:** Organizations · **Clinicians** · **Practice Staff** |
| Credentials: Credential reviews | **Reviews & Safety:** **Credential Reviews** · **Identity Checks** |
| Commercial setup: Pricing (4 tabs incl. exchange rates) · Availability | **Commercial:** **Price Lists** · **Exchange Rates** · **Margin & Deposit** (moved from the Finance workspace) |
| Care operations team: Staff & teams · Identity checks | **Operations:** **RehletShifaa Staff** · **Coordination Setup** |
| Care coordination: Teams & routing | (→ Operations › Coordination Setup) |
| Journeys: Journey library | **Care Journeys:** Journeys (design and publishing inside each journey) |
| Access & governance: User access · Roles · Effective access · Permissions · Audit | **Access & Governance:** **People** · Roles · Audit (Access summary and Permission reference reached from their parent page) |

Final sidebar (for a broad administrator; everyone else sees only their lines):

```
Home
Providers            ▸ Organizations · Clinicians · Practice Staff
Reviews & Safety     ▸ Credential Reviews · Identity Checks
Commercial           ▸ Price Lists · Exchange Rates · Margin & Deposit
Operations           ▸ RehletShifaa Staff · Coordination Setup
Care Journeys          (one line → Journeys)
Access & Governance  ▸ People · Roles · Audit
```

Decisions inside the approved IA:
- **Groups are disclosures.** The group holding the current page is expanded; the others start collapsed, so the
  sidebar reads as seven business areas first. One icon per group; child lines have none.
- **A group with one visible line is one link named after the group** (e.g. a credential reviewer sees *Reviews &
  Safety*; a journey manager sees *Care Journeys*). No heading over a lone item; the breadcrumb names the child.
- **Journey Design / Publishing** has no cross-journey destination today (the list read has no version status), so it
  is the page family inside each journey (journey › version › design/publish), reached from *Journeys*. A separate
  "waiting to publish" view needs a read and belongs to UX-8. Recorded as a deliberate deviation, not a gap.
- **Schedules** (the former Availability hub) belongs under *Clinicians*: a secondary action in the Clinicians header,
  breadcrumb *Providers › Clinicians › Schedules*. It keeps its own sidebar line only for someone who can read schedules
  but cannot open Clinicians (`availability.view` without `provider.view`, e.g. the seeded clinical-support role), so
  no one loses their way in. UX-3 retires the hub into the clinician page.
- **Access summary** (formerly Effective access) and **Permission reference** (formerly Permissions) have no sidebar
  line: they are secondary actions on *People* and *Roles*; the sidebar highlights the parent (plan §2, §5).

## 2. Routes

| Route | Change |
|---|---|
| `/portal/control-center/commercial/prices` | **New** — Price Lists (provider prices, direct price lists, care-area templates) |
| `/portal/control-center/commercial/exchange-rates` | **New** — Exchange Rates (its own page; was a Pricing tab) |
| `/portal/control-center/commercial/margin-deposit` | **New** — Margin & Deposit (moved from the Finance workspace `<details>` panel; same endpoints, methods, bodies) |
| `/portal/control-center/commercial/pricing` | **Compatibility redirect** → `prices` keeping `view`/`org`/`clinician`; `?view=rates` → `exchange-rates` |
| `/portal/control-center/commercial` | Redirect now → `prices` (was `pricing`) |
| everything else | Unchanged. Earlier redirects (`/portal/access?tab=`, `/portal/journeys/**`, per-role organization pages, clinician pricing/availability pages) still resolve |

Not moved, on purpose (plan rule 10, "no rewrite for aesthetic purity"): `/providers/consultants/**` (the clinician
page family is UX-3's), `/providers/practice-team`, `/team`, `/identity-checks`, `/credentials/**`, `/coordination/**`,
`/access/**`, `/commercial/availability`. Their labels changed; their URLs and bookmarks did not.

## 3. App shell

- **Public chrome removed inside the Control Center.** `HideInControlCenter` drops the site header, marketing footer and
  site skip-link on `/{locale}/portal/control-center/**`; `SiteMain` renders a plain wrapper there so the Control
  Center's own `<main>` is the only main landmark (previously nested).
- **Compact top bar** (existing `ControlCenterShell`, no second shell): brand lock-up (RehletShifaa mark + wordmark ·
  Control Center) linking to Home; the language switch (same page, keeps the query); the account menu (name, email,
  *My workspace* only when the person has a care-portal workspace, *Password & account security*, *Sign out*).
  Previously the Control Center had no account menu, sign-out or language switch at all.
- **Sidebar** as in §1; **mobile** (< 900 px): compact top bar with the current section (*Commercial · Price Lists*),
  an explicit menu button (`aria-expanded`/`aria-controls`) opening a drawer with its own close button; focus moves into
  the drawer, Tab is contained, Escape and the backdrop close it, focus returns to the menu button.
- **Capability read failure is not "no access".** `useControlCenterAccess` now reports `failed` (network/5xx on
  `/admin/access/me`; 401/403 still mean "no capabilities") with `retry`; the sidebar says *Some sections couldn't be
  loaded · Try again*, Home and the interim landing say the check failed.

## 4. Page header standard

One pattern, owned by the shell: **breadcrumb · h1 · one-sentence description · primary action · optional secondary**.
- The breadcrumb's section part is generated from the IA (`Control Center › Group › [Parent ›] Item`); pages pass only
  what sits below (a person's or organization's name, *Setup*, a version). Examples:
  *Control Center › Providers › Clinicians › Dr Salma Farouk* · *Control Center › Reviews & Safety › Credential
  Reviews* · *Control Center › Care Journeys › Journeys › International Care*.
- Stable h1 while loading: Coordination Setup (was "Loading…"), a coordination organization (generic *Organization*,
  never its ID, in title and breadcrumb), journeys (generic *Journey* until the name loads), clinician (*Clinician*).
- Secondary actions added only where a page lost its sidebar line: Clinicians › *Schedules*, People › *Access summary*,
  Roles › *Permission reference*.

## 5. Home

Before: attention counts **plus** a "What do you want to manage?" grid repeating every sidebar destination.
After: attention only (`ControlCenterOverview`), from real reads the caller is already allowed to make:

| Item | Shown to | Links to |
|---|---|---|
| Credentials waiting for review | `credential.review` | the one organization's queue (`/credentials?org=`) when only one has work, else the queue |
| Direct consultants waiting for approval | legacy administration role | `/credentials?view=direct` |
| Identity checks waiting for a decision | identity reviewer role | `/identity-checks` |
| Organizations still being set up | `provider.view` | that organization's *Setup* tab when there is one, else the list |
| People waiting for membership activation | `provider.view` | that organization's *People* tab when one, else the list; marked *first 25 organizations only* when the fan-out is capped |
| Staff invitations not yet accepted | legacy administration role | `/team` |
| Cases waiting for a coordinator | `assignment.queue.manage` | that organization's queue tab when one, else Coordination Setup |

- Rows ordered by IA group, each labelled with its group; no fabricated KPI, trend or health indicator.
- A count that could not be read is reported (*Some waiting work couldn't be checked: … · Try again*) — never zero,
  never "no access"; *You're all caught up.* appears only when every check succeeded and names what was checked.
- A persona with no trackable waiting work (e.g. journey manager, access administrator) gets *There's no waiting work
  to track here for your areas* and at most three links to their own areas. No areas at all: a calm explanation.
- Primary action kept: *Add consultant* (only with `provider.clinician.invite` or the legacy manage role).

## 6. Duplicate entry points removed

| Before | After |
|---|---|
| Portal page: a separate "Control Center" button above every workspace | Removed. **Control Center** is one item in the workspace account menu, shown only when the person can open ≥ 1 area |
| Portal "Administration" role tab → *"Administration has moved to the Control Center"* card with 4 destination cards | Removed. Administration and identity-review are Control Center roles, not portal workspaces |
| Portal "Identity" role tab (identity queue duplicated in the Control Center) | Removed from the portal; Identity Checks lives in Control Center › Reviews & Safety |
| Administration-/identity-only account landing on `/portal` | **Lands directly in the Control Center** (`router.replace`) |
| Finance workspace `<details>` "Financial policies" panel | Moved to Commercial › Margin & Deposit; the Finance workspace keeps one contextual link for Finance leads |
| Control Center sidebar "Back to my workspace" | Account menu *My workspace* (only when there is one) |

Provider personas without a portal role keep the UX-1 interim landing (it lists their Control Center areas; now using the
same `openableSections` rule and a truthful failed-read state). Replacing it is UX-4.

## 7. Terminology (business labels only; no enum, key or API renamed)

| Before | After |
|---|---|
| Overview | Home (sidebar) · page h1 *Control Center* |
| Consultants (directory) | Clinicians (V-10 holds: CONSULTANT + ASSOCIATE_DOCTOR, plus direct consultants) |
| Practice team | Practice Staff / Practice staff |
| Credentials › Credential reviews | Reviews & Safety › Credential Reviews |
| Identity checks | Identity Checks |
| Commercial setup › Pricing | Commercial › Price Lists |
| (Pricing tab) Exchange rates | Exchange Rates (own page) |
| Financial policies (Finance workspace) | Margin & Deposit |
| Staff & teams | RehletShifaa Staff |
| Care coordination › Teams & routing / "Choose a provider organization" | Operations › Coordination Setup |
| Journeys › Journey library | Care Journeys › Journeys |
| Access & governance › User access | Access & Governance › People |
| Effective access | Access summary (helper: *Can this person…?*) |
| Permissions | Permission reference |
| Availability (clinician tab, directory action, hub) | Schedule / Schedules |

Checked and unchanged because already correct or out of scope: *Retire version* (P0-7 copy kept), *Start review* (no
"Claim review" in the Control Center), assignment/routing history labels (UX-7), no "Care pathway" anywhere.

## 8. Permission gating verification

Navigation uses the UX-1 capability read and the existing legacy realm-role gate; it only hides. Every route still
renders its own authorized/denied state and every endpoint still authorizes (unchanged backend; UX-1
`CallerCapabilityIntegrationTest` proves nav visibility does not bypass endpoint authorization, including a 403 on
another organization).

| Persona (test) | Sidebar |
|---|---|
| A · provider-only admin | Home · Providers ▸ Organizations · Clinicians · Practice Staff |
| B · credential reviewer | Home · Reviews & Safety (→ Credential Reviews) |
| C · coordination manager | Home · Operations (→ Coordination Setup) |
| D · journey manager | Home · Care Journeys |
| E · access administrator | Home · Access & Governance ▸ People · Roles · Audit |
| F · broad platform admin | all seven groups; no duplicate destination |
| G · mixed-role (coordinator + reviewer + journeys) | Home · Reviews & Safety · Care Journeys; account menu *My workspace* |
| schedule-only (clinical support) | Home · Providers (→ Schedules) |

No false "no access" introduced: a failed capability read is reported as a failed read in the shell, Home and the
interim landing (tests). No organization data is read for navigation beyond `/admin/access/me`.

## 9. Responsive, RTL, accessibility (baseline — formal validation is Phase 8C)

- **Mobile:** drawer navigation with managed focus; attention rows stack; header actions full-width; no horizontal
  overflow (see §10).
- **RTL:** logical properties throughout (`inset-inline-*`, `border-inline-*`, `padding-inline-*`); breadcrumb separator
  and the collapsed-group chevron mirror; the drawer opens from the inline start (right in Arabic); the brand wordmark
  and email are isolated `dir="ltr"`; Arabic labels use the UX-0 draft glossary.
- **Accessibility:** one `main`; sidebar `nav` labelled *Control Center*, breadcrumb `nav` labelled *Breadcrumb*;
  `aria-current="page"` plus weight and an inset bar (not colour alone); group disclosures are buttons with
  `aria-expanded`/`aria-controls`; skip link to content; 44 px touch targets in the drawer, top bar and account menu;
  Escape closes the drawer and account menu and returns focus.

**Arabic glossary items needing native healthcare-operations review (V-9)** — used as drafts, not final:
مقدمو الرعاية (Providers) · الجهات الطبية (Organizations) · الأطباء (Clinicians) · فريق العيادة (Practice Staff) ·
المراجعات والسلامة (Reviews & Safety) · مراجعة التراخيص والمؤهلات (Credential Reviews; shortened from the glossary's
«مراجعة التراخيص والمؤهلات المهنية» for the sidebar) · الشؤون التجارية (Commercial) · قوائم الأسعار · أسعار الصرف ·
الهامش والدفعة المقدمة · العمليات · فريق رحلة شفاء · إعداد التنسيق · رحلات الرعاية · الصلاحيات والحوكمة · الأشخاص ·
ملخص الصلاحيات · مرجع الصلاحيات · الجداول. **Kept** «مركز التحكم» for Control Center although the draft glossary
proposes «مركز الإدارة» — a reviewer decision, not changed here.

## 10. Live visual sanity (limited; not Phase 8C)

Canonical base + tunnel rebuild, then a temporary Playwright script (scratchpad only, not committed) against
`https://dev.rehletshifaa.com` with a synthetic session and mocked reads; **every write refused** (none attempted).

| View | Result |
|---|---|
| EN desktop 1440: Home, Providers › Clinicians, Reviews › Credential Reviews, Commercial › Price Lists and Margin & Deposit, Operations › RehletShifaa Staff, Care Journeys, Access › People and Access summary | one `main`, no site header/footer, stable h1, IA breadcrumbs, current group expanded with the active line marked, no horizontal overflow |
| Legacy `/commercial/pricing?view=rates` | lands on Exchange Rates |
| EN mobile 390: Home, drawer on Price Lists | compact top bar; drawer opens with focus on *Close menu*; attention rows stack; no overflow |
| AR desktop: Clinicians, Home · AR mobile: drawer on People | `dir=rtl`; sidebar on the right; breadcrumb and chevrons mirrored; drawer opens from the right; active bar on the inline start |
| Journey manager / credential reviewer Home | only *Care Journeys* / *Reviews & Safety* in the sidebar; calm empty state with one link / review work only |

Console: only the pre-existing Cloudflare Insights beacon refused by the site CSP (unrelated). No page errors.
Observed and left for later phases: the directory's engagement toggle still reads *Direct (current case workflow)*
and its default view (UX-3); journeys keep a *Refresh* header button (UX-8).

## 11. Tests

- `pnpm typecheck` clean. `pnpm test` **299 tests / 43 files, 0 failures** (3 consecutive full runs).
- New suites: `PageHeaders` (Margin & Deposit read/save with the unchanged body, non-lead refusal, stable h1, access
  titles and secondary actions, Clinicians/Schedules), `PortalEntry` (admin-only and identity-only land in the Control
  Center, mixed-role account-menu entry, no admin tab, no entry without an area), `HideInControlCenter` (no public
  header/footer and no nested `main` inside the Control Center; kept elsewhere).
- Rewritten: `ControlCenterShell` (personas A–G + schedule-only, disclosure groups, active state, parent highlighting,
  failed read + retry, IA breadcrumbs, top bar, account menu, drawer focus, Arabic), `ControlCenterOverview` (attention
  only, direct links, all caught up, persona-aware, failed count, partial count, failed capability read).
- Updated: `routes` (commercial → prices; pricing → prices/exchange-rates with the query), `CareOperations` (Price
  Lists / Exchange Rates split), `ConsultantOnboardingWizard` (*Schedule* tab), `JourneyList` (shell failed-read
  alert), `NoPortalWorkspace`, `ProviderOrganizations` (entry hook).
- **Test infrastructure:** the suite was already timing-sensitive under parallel load (the UX-1 base also failed 4
  `findBy…` tests on this machine). `vitest.setup.ts` raises Testing Library's async timeout to 5 s (`testTimeout`
  20 s), one race in `AccessGovernance` now awaits the loaded list, and the token-renewal test waits for the first
  loads to settle before asserting that renewal triggers no read.
- Backend: not run — no backend file changed. ESLint on touched files: only pre-existing findings remain
  (`set-state-in-effect` load pattern, `locale` deps, `window.location` in journeys, Portal `Date.now`/refs); new-code
  findings were fixed.

## 12. Remaining UX debt (not UX-2)

- **UX-3:** clinician page family URLs still `/providers/consultants/**`; *Add consultant* wording; the Schedules hub
  (retire into the clinician page); direct vs provider presentation.
- **UX-4:** the provider interim landing still lists Control Center areas; Provider Workspace replaces it.
- **UX-5:** People + Access summary merge; permission reference as an advanced surface inside Roles.
- **UX-7:** Coordination Setup internals (refresh button in the header, org-picker hop, identifiers).
- **UX-8:** a cross-journey "waiting to publish" view if wanted; journeys header *Refresh* button.
- **Performance:** each page mounts the capability hook in the shell and often in the page, so `/admin/access/me` is
  read twice per page load (pre-existing pattern). A shared provider would halve it; not changed to keep UX-2
  structural.
- **Home fan-out:** membership and credential counts fan out per organization (bounded; membership capped at 25 and
  labelled). An aggregate read would remove the cap (small read API; needs approval).
