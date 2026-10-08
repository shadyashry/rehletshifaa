# Token proposals — Petrol & Paper

Status: **proposal only, nothing implemented** (input to GATE 2). Date: 2026-10-07.
Sources reviewed: `DESIGN.md`, `frontend/src/app/globals.css` (`@theme` = base "Light Healing"),
`frontend/src/app/theme-petrol.css` (`:root[data-brand-theme="petrol"]` = shipped system),
`frontend/src/components/platform-control-center/control-center.css` (`--cc-*`, legacy).
Pro Max was used to review and fill gaps only. Its picks were rejected: Neumorphism style, Figtree/Noto Sans,
the cyan/green palette (`#0891B2`, `#059669`) and the "Hero + Testimonials" pattern. Testimonials are also
forbidden by PRODUCT.md. Kept from Pro Max: the three-layer model, `color-semantic`, `color-accessible-pairs`,
"never colour alone", `contrast-data` (marks ≥ 3:1, labels ≥ 4.5:1), `number-tabular`, `legend-visible`
and `direct-labeling`.

Contrast key: **W** = white `#ffffff`, **P** = paper `#f7f4ee`, **PD** = paper-deep `#efeae0`, **T** = the
token's own tint. Text needs 4.5:1 (AA). Non-text marks and control boundaries need 3:1 (WCAG 1.4.11).

---

## A. Architecture and component tokens

### A1. Layering review (findings, by severity)

| # | Severity | Finding | Where |
|---|---|---|---|
| 1 | High | **No component layer.** Components read ramp primitives directly (`.btn-primary` → `--color-brand-600`) or hard-coded hex (`#ffffff` ×8 in `@layer components`, `#1c333a80` backdrop, `rgba(31,107,115,.8)` hover shadow). Petrol then re-overrides the same selectors one by one: radius 4×, secondary hover, field focus. | `globals.css` L324–571, L723–741; `theme-petrol.css` L156–189 |
| 2 | High | **Field boundary fails 1.4.11.** `.field` uses `--color-line-strong`, which is 1.66 on W, 1.52 on P and 1.39 on PD. That is below 3:1. Checkbox/radio cards share the same edge. | `globals.css` `.field`; `theme-petrol.css` L182 |
| 3 | Med | **Semantic layer is partial and mostly dead.** `--color-text-*`, `--color-surface-*` and `--color-border-*` exist, but components rarely use them. In petrol, 13 legacy names (`surface-clinical/sage/ivory/warm/hospitality`, `wash-*`, `mist*`, `sand-*`) all collapse to `--paper` / `--paper-deep` / brand-400. `--accent-*` duplicates `--brand-*`. | `globals.css` L27–79; `theme-petrol.css` L37–71, L110–112 |
| 4 | Med | **Inconsistent token naming.** `--paper`, `--paper-deep`, `--sys-*-deep` and `--petrol-shadow-raised` use no namespace and exist **only in the petrol scope**. Anything outside petrol, such as the Control Center, has no value for them. | `theme-petrol.css` L55–56, L87–107, L123 |
| 5 | Med | **Fourth, parallel token set.** `--cc-*` defines its own brand, focus (`#976128`, amber), success, warning, danger, info and input border (`#8fa6a2`, 2.58 on W, fails 3:1). It uses off-ladder sizes 12.5, 13.5 and 14.5px, plus 12–14px radii. | `control-center.css` L2–3, L113–123, L149–163, L260–262 |
| 6 | Med | **Radii off-system.** `.account-dialog` is 1rem, `.cc-dialog` 14px and `.cc-table-wrap` 12px. Base buttons and fields are 0.7–0.75rem. DESIGN allows only 6px, 8px and full. | `globals.css` L737; `control-center.css` L151, L261 |
| 7 | Low | **Ad-hoc status colours bypass tokens.** `bg-amber-50`/`text-amber-900`/`border-amber-200` (×34), `sky-*` and `emerald-*` utilities. | 10 portal files (see B1) |
| 8 | Low | **Type off the ladder in dense UI.** The table header is `text-[0.7rem]` uppercase (11.2px, below the 12px floor). Other sizes include 0.72/0.78/0.82/0.85/0.88rem. `.status-badge` is 0.8rem; the ladder says 12px for badges. | `VirtualClinic.tsx` L277–286; portal components |
| 9 | Info | The unlayered DOM-shape overrides (`theme-petrol.css` L263+) are out of scope for tokens. Component tokens would remove the need to re-target `.btn-*`/`.field`/`.card` there. | — |

### A2. Placement and naming

- **Naming:** `--{component}-{variant?}-{property}-{state?}`. Properties are `bg`, `fg`, `border`, `radius`,
  `shadow`, `height`, `padding`, `font-size`. Example: `--button-secondary-border-hover`.
- **Component tokens** (`--button-*`, `--badge-*`, `--table-*`, `--dialog-*`, `--field-*`, `--card-*`): declare
  **base fallbacks** in a plain `:root {}` inside `@layer base` in `globals.css`, directly after `@theme`. Keep them
  out of `@theme`, because there they would generate unwanted utilities and namespaces.
- **Why most need no petrol override:** each component token is a `var()` alias of a ramp token. That ramp token is
  re-pointed by `:root[data-brand-theme="petrol"]` on the **same element** (`<html>`), so the alias resolves to the
  petrol value automatically. `theme-petrol.css` overrides only the rows marked **P** below, where petrol differs in
  structure (radius, hover behaviour, shadow), not in colour.
- **Status, chart and table-type tokens** (section B) belong in `@theme` under Tailwind namespaces
  (`--color-status-*`, `--color-chart-*`, `--text-table-*`). That gives utilities to replace `bg-amber-50` and
  similar. Confirm in the build output that they are emitted; use `@theme static` if they are pruned.
- **Housekeeping (same change):** rename `--petrol-shadow-raised` to `--shadow-raised`, with base fallback
  `var(--shadow-card)`.

### A3. Component tokens

**Button** (`.btn-primary/.btn-secondary/.btn-inverse/.btn-outline`; `site-header`, `portal-shell`, `account-dialog`)

| Token | Base fallback → **P** petrol override | Rationale | Contrast (petrol) |
|---|---|---|---|
| `--button-radius` | `0.75rem` → **P** `0.5rem` | Replaces 4 per-selector radius overrides | — |
| `--button-height` / `-compact` / `-phone` | `3rem` / `2.75rem` / `2.875rem` | 48 public, 44 header/portal, 46 phone (DESIGN) | — |
| `--button-padding` / `-compact` | `0.7rem 1.35rem` / `0.55rem 1.1rem` | Existing values | — |
| `--button-font-size` / `-compact` | `1rem` / `0.9375rem` (16/15, on ladder) | Portal currently `.9rem` (14.4, off-ladder) → use 15 | — |
| `--button-primary-bg` / `-border` | `var(--color-brand-600)` | One Action Rule | white on it **7.38** ✓ |
| `--button-primary-fg` | `var(--color-surface-default)` | Removes literal `#ffffff` | — |
| `--button-primary-bg-hover` | `var(--color-brand-700)` | | white **9.26** ✓ |
| `--button-primary-shadow-hover` | `0 12px 26px -18px rgb(31 107 115/.8)` → **P** `none` | Petrol is flat | — |
| `--button-secondary-bg` | `var(--color-surface-default)` | | |
| `--button-secondary-fg` | `var(--color-brand-900)` | | W **15.17** ✓ |
| `--button-secondary-border` | `var(--color-line-strong)` | Edge is decorative; label and fill carry the control | 1.66 (decorative) |
| `--button-secondary-border-hover` | `var(--color-brand-600)` → **P** `var(--color-brand-900)` | Existing petrol behaviour | |
| `--button-secondary-bg-hover` | `var(--color-brand-50)` → **P** `var(--color-surface-default)` | | |
| `--button-secondary-fg-hover` | `var(--color-brand-700)` → **P** `var(--color-brand-900)` | | W 15.17 ✓ |
| `--button-inverse-bg` / `-border` | `var(--color-surface-default)` | On the brand-700 closing panel | |
| `--button-inverse-fg` | `var(--color-brand-700)` | | W **9.26** ✓ |
| `--button-inverse-bg-hover` | `var(--color-brand-50)` | | brand-700 on brand-50 **8.32** ✓ |
| `--button-outline-fg` | `var(--color-brand-700)` | Header "Sign in" | W 9.26, P 8.43 ✓ |
| `--button-outline-border` | `var(--color-line-strong)` | | decorative |
| `--button-outline-bg-hover` / `-border-hover` / `-fg-hover` | `var(--color-brand-50)` / `var(--color-brand-300)` / `var(--color-brand-800)` | Existing values | brand-800 on brand-50 **10.01** ✓ |
| `--button-disabled-opacity` | `0.55` | Portal value, made global | — |
| `--focus-ring` | `3px solid var(--color-brand-600)`, offset `3px` | Shared by all controls | vs W **7.38** ✓ |

**Status badge** (`.status-badge`: `PortalDirectories.tsx`; future portal tones; CC `.cc-status` when converged)

| Token | Mapping | Rationale | Contrast |
|---|---|---|---|
| `--badge-radius` | `0.5rem` | DESIGN status-badge = 8px (CC uses 999px pill, which must converge) | — |
| `--badge-padding` | `0.25rem 0.65rem` | Existing | — |
| `--badge-font-size` / `-weight` | `0.75rem` / `600` | Ladder: 12px is for badges. DESIGN prose says 0.8rem (12.8, off-ladder); see open question 4 | — |
| `--badge-bg` / `-fg` / `-border` (default) | `var(--color-brand-50)` / `var(--color-brand-800)` / `var(--color-brand-200)` | Existing default = **info** tone | fg on T **10.01**, W 11.14 ✓; border 1.43 (decorative, text carries meaning) |
| `--badge-{success,warning,danger,info,neutral}-{bg,fg,border}` | `var(--color-status-{tone}-{surface,fg,border})` (B1) | Portal gets the CC tone model; each tone keeps its icon (`cc-ui.tsx` `StatusBadge` pattern) | see B1 |

**Table** (`VirtualClinic.tsx`, `catalog-admin.tsx .cc-data`, portal cost lists)

| Token | Mapping | Rationale | Contrast |
|---|---|---|---|
| `--table-bg` | `var(--color-surface-default)` | | |
| `--table-border` (outer + row rules) | `var(--color-line)` | Hairline First | decorative |
| `--table-radius` | `var(--radius-card)` (petrol 0.5rem) | Replaces 12px `.cc-table-wrap` | — |
| `--table-header-bg` | `var(--color-surface-pearl)` (= paper in petrol) | Never paper-deep (muted ink fails there) | header fg ink-500 on P **7.16** ✓ |
| `--table-header-fg` | `var(--color-ink-500)` | | W 7.86, P 7.16, PD 6.56 ✓ |
| `--table-row-fg` | `var(--color-ink-600)` | Body ink | W 9.78, P 8.91 ✓ |
| `--table-row-fg-strong` | `var(--color-ink-900)` | Primary cell and numerals | W 15.65 ✓ |
| `--table-row-meta-fg` | `var(--color-ink-400)` | Second line in a cell | W 5.33, P 4.86, on hover T 4.79 ✓; **PD 4.45 ✗** (never on paper-deep) |
| `--table-row-bg-hover` / `-selected` | `var(--color-brand-50)` | Petrol tint = hover wash per DESIGN | ink-600 on it **8.79** ✓ |
| `--table-row-selected-edge` | `2px var(--color-brand-600)` (inline-start) | File-tab motif; colour is not the only cue (also `aria-selected`) | vs W 7.38 ✓ |
| `--table-cell-padding` / `--table-header-padding` | `0.625rem 0.875rem` / `0.5rem 0.875rem` | CC-equivalent density | — |
| `--table-row-min-height` | `2.75rem` | 44px target when the row is interactive | — |

**Dialog** (`.account-dialog`, `FocusTrapDialog.tsx`, `ProposalDecisionDialog.tsx`, `DeclineAssignmentDialog.tsx`, `.cc-dialog`)

| Token | Mapping | Rationale | Contrast |
|---|---|---|---|
| `--dialog-bg` / `-fg` | `var(--color-surface-default)` / `var(--color-ink-900)` | | W **15.65** ✓ |
| `--dialog-border` | `var(--color-line)` | | decorative |
| `--dialog-radius` | `1rem` → **P** `var(--radius-card)` (0.5rem) | DESIGN: dialogs 8px | — |
| `--dialog-padding` / `-max-width` | `1.5rem` / `30rem` | Existing | — |
| `--dialog-shadow` | `var(--shadow-raised)` (A2 rename) | A floating object, so Raised is allowed | — |
| `--dialog-backdrop` | `color-mix(in srgb, var(--color-brand-950) 50%, transparent)` | Equals the current `#1c333a80` in base; petrol tracks `#0b1d21` | n/a |

**Field** (`.field`, `form.card` radio cards, upload area)

| Token | Mapping | Rationale | Contrast |
|---|---|---|---|
| `--field-bg` / `-fg` | `var(--color-surface-default)` / `var(--color-ink-900)` | | W **15.65** ✓ |
| `--field-placeholder` | `var(--color-ink-400)` | Existing base rule | W **5.33** ✓ |
| `--field-border` | **Decision needed:** `var(--color-line-strong)` (today) | Boundary must reach 3:1 | **1.66 W ✗** (see open question 1) |
| `--field-border-hover` | `var(--color-brand-300)` | Existing | 2.14 (state cue; focus carries AA) |
| `--field-border-focus` / `--field-focus-halo` | `var(--color-brand-600)` / `3px var(--color-brand-100)` | Ring is the indicator; the halo is decorative | W **7.38** ✓ / 1.26 |
| `--field-label-fg-focus` | `var(--color-brand-700)` | Existing | W 9.26 ✓ |
| `--field-border-error` / `--field-error-fg` | `var(--color-alert-700)` / `var(--color-alert-800)` | Existing; message also needs icon + text | **8.43** / **10.67** ✓ |
| `--field-radius` | `0.75rem` → **P** `0.5rem` | | — |
| `--field-height` / `-compact` | `3.35rem` / `2.75rem` | Public / portal and dialog | — |
| `--field-padding` | `0.8rem 0.9rem` | | — |
| `--field-disabled-bg` | `var(--color-surface-pearl)` | Paper, not opacity, so text stays legible | ink-900 on P 14.26 ✓ |
| `--choice-checked-bg` / `-border` | `var(--color-brand-50)` / `var(--color-brand-600)` | Radio cards | |

**Card** (`.card`, `.surface-muted`, `.home-hero-card`, `.page-hero-aside`, care cards)

| Token | Mapping | Rationale | Contrast |
|---|---|---|---|
| `--card-bg` / `-fg` | `var(--color-surface-default)` / `var(--color-ink-600)` | | W **9.78** ✓ |
| `--card-bg-inset` | `var(--color-surface-pearl)` | Facts panel on a white section | ink-600 on P 8.91 ✓ |
| `--card-border` | `var(--color-line)` | | decorative |
| `--card-radius` | `var(--radius-card)` | Existing | — |
| `--card-shadow` / `-raised` | `var(--shadow-card)` / `var(--shadow-raised)` | Raised only for the hero intake card and hovered care cards | — |
| `--card-padding` / `-compact` | `1.5rem` / `1.25rem` | DESIGN range | — |
| `--card-tab-edge` | `2px solid var(--color-brand-600)` | Intake "file tab" | — |

---

## B. Missing tokens

### B0. Contrast method

WCAG 2.x relative luminance computed in Python (scratch script, reproducible):

```py
def lin(c): c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lum(hex): r,g,b = (int(hex[i:i+2],16) for i in (1,3,5)); return .2126*lin(r)+.7152*lin(g)+.0722*lin(b)
def ratio(a,b): hi,lo = sorted((lum(a),lum(b)), reverse=True); return (hi+.05)/(lo+.05)
```

Colour-vision deficiency (CVD) check for the chart palette works like this. Colours are simulated in linear RGB with
the Machado et al. (2009) severity-1.0 matrices for protanopia, deuteranopia and tritanopia. The script then
converts to CIELAB (D65) and reports the **minimum pairwise CIEDE2000** for each vision mode. Candidate sets were
brute-forced from the 16 petrol-family tokens that clear 3:1 on all three surfaces.

### B1. Status tokens (`@theme`, `--color-status-*`)

They are declared once with Petrol & Paper values, so the Control Center adopts them when it converges: swap
`--cc-success/-warning/-danger/-info` and `.cc-notice-*`. Every value is an existing token. Warning reuses the
repo's only amber, `--cc-warning*`. Each tone **must** show an icon and a text label: under deuteranopia the tints
are 1.6–2.3 ΔE apart, which is indistinguishable.

| Token | Value / mapping | Rationale | Contrast W / P / PD / T | AA |
|---|---|---|---|---|
| `--color-status-success-fg` | `#1b5f3d` = `--sys-heart-deep` | Sea green, inside the petrol family | 7.63 / 6.95 / 6.37 / 6.73 | ✓ |
| `--color-status-success-surface` | `#e2f5ec` = `--color-system-heart-well` | | — | |
| `--color-status-success-border` | `#bcdccc` = `--color-system-heart-ring` | Decorative | 1.47 / 1.34 / 1.23 / 1.30 | decorative |
| `--color-status-success-mark` | `#3b9166` = `--color-system-heart-line` | Dots and progress fills (non-text only) | 3.87 / 3.52 / 3.23 / 3.41 | ✓ 3:1 |
| `--color-status-warning-fg` | `#8a5218` = `--cc-warning` | Ochre amber, hue 31° vs coral 13°; never coral | 6.36 / 5.80 / 5.31 / 5.70 | ✓ |
| `--color-status-warning-surface` | `#fcf1e3` = `--cc-warning-bg` | | — | |
| `--color-status-warning-border` | `#ecd0a8` (CC `.cc-status-warning`) | Decorative | 1.48 / 1.35 / 1.24 / 1.33 | decorative |
| `--color-status-danger-fg` | `var(--color-alert-800)` `#74201e` | Builds on the alert scale; DESIGN error text | 10.67 / 9.72 / 8.90 / 9.93 | ✓ |
| `--color-status-danger-surface` | `var(--color-alert-50)` | | — | |
| `--color-status-danger-border` | `var(--color-alert-200)` (badge) · `var(--color-alert-700)` (field/control) | 200 is decorative; 700 when the edge must carry state | 1.40 / — · 8.43 / 7.68 / 7.03 | dec. · ✓ |
| `--color-status-danger-solid` | `var(--color-alert-600)` + white text | Unread counts | white on it 6.06 | ✓ |
| `--color-status-info-fg` | `var(--color-brand-800)` `#0c4247` | Info = today's petrol status-badge, so no new hue | 11.14 / 10.14 / 9.29 / 10.01 | ✓ |
| `--color-status-info-surface` | `var(--color-brand-50)` | | — | |
| `--color-status-info-border` | `var(--color-brand-200)` | Decorative | 1.59 / 1.45 / 1.33 / 1.43 | decorative |
| `--color-status-neutral-fg` | `var(--color-ink-500)` | Draft, closed, not started | 7.86 / 7.16 / 6.56 / 6.56 | ✓ |
| `--color-status-neutral-surface` | `var(--color-surface-sage)` (= paper-deep) | Small well, allowed by Two Surfaces | — | |
| `--color-status-neutral-border` | `var(--color-line-strong)` | Decorative | 1.66 / 1.52 / 1.39 | decorative |

Status-fg separation, minimum CIEDE2000: normal 10.5 (info/neutral); protan 7.1; deutan 8.2; tritan 8.6.
Distinguishable as text, but the icon is still required.

**Where used:** replaces `amber-50/200/800/900`, `sky-50/900` and `emerald-50/200/800` in `PatientJourneyTracker.tsx`,
`ProposalSign.tsx`, `portal/{AssignmentHistory,CaseBlockers,CaseQueue,ClinicalReview,JourneySnapshot,MyWork,Portal,RoleDashboardSummary}.tsx`.
Also replaces `control-center.css` L2–3, L100–123 and `cc-ui.tsx` `StatusBadge` tones. Warning is for **status only**:
it does not license the amber washes behind My Care cards (backlog P2 stands).

### B2. Categorical chart palette (`@theme`, `--color-chart-*`)

Rejected first: **the six care-system lines as-is** reach only ΔE **2.3** (tritan, neuro vs movement), and **the six
deeps** only **1.9**. They step hue too gently to tell apart. The palette below re-orders existing tokens to
alternate lightness. It stays inside the petrol family and adds no new hue. Values are literal in `@theme` (base
lacks `--sys-*-deep`, and base system lines differ), commented with their source token.

| Token | Value = source token | Role | Non-text contrast W / P / PD (≥ 3) |
|---|---|---|---|
| `--color-chart-1` | `#13292e` = `--color-brand-900` | Primary series / total | 15.17 / 13.82 / 12.65 ✓ |
| `--color-chart-2` | `#3b9166` = `--color-system-heart-line` | | 3.87 / 3.52 / 3.23 ✓ (marks only, never text) |
| `--color-chart-3` | `#435489` = `--color-system-women-line` | | 7.32 / 6.67 / 6.11 ✓ |
| `--color-chart-4` | `#1b5f3d` = `--sys-heart-deep` | | 7.63 / 6.95 / 6.37 ✓ |
| `--color-chart-5` | `#1c3b5e` = `--sys-surgery-deep` | Extension | 11.43 / 10.42 / 9.54 ✓ |
| `--color-chart-6` | `#377995` = `--color-system-digestive-line` | Extension | 4.85 / 4.42 / 4.04 ✓ |
| `--color-chart-neutral` | `var(--color-ink-400)` `#5d6e72` | "Other", unassigned, prior period | 5.33 / 4.86 / 4.45 ✓ |
| `--color-chart-grid` | `var(--color-line)` | Gridlines | decorative |
| `--color-chart-axis` | `var(--color-line-strong)` | Baseline | decorative |
| `--color-chart-label` | `var(--color-ink-400)` on W/P, `var(--color-ink-500)` on PD | Axis and value text | 5.33 / 4.86 ✓; on PD use ink-500 6.56 |

Minimum pairwise CIEDE2000, including neutral:

| Set | Normal | Protan | Deutan | Tritan |
|---|---|---|---|---|
| chart-1…4 + neutral (**default**) | 17.8 | 17.1 | 16.8 | 9.3 |
| + chart-5 | 10.4 | 10.4 | 10.1 | 8.1 |
| + chart-6 | 10.4 | 10.4 | 10.1 | 7.2 |

Rules:
- Default to ≤ 4 series plus neutral.
- 5–6 series require direct labels, or a pattern or marker shape.
- More than 6 series: use a table or small multiples.
- Petrol `brand-600` is excluded from fills (One Action Rule).
- Coral never appears.
- Every chart ships with a data-table alternative and a text summary (Pro Max `data-table`, `screen-reader-summary`).

**Where used:** none yet (no chart library in the repo). These tokens are for the future finance and operations
dashboards (`RoleDashboardSummary.tsx`, Control Center finance and exchange-rate pages).

### B3. Dense-table type scale (`@theme`, `--text-table-*`, on the ladder)

| Token | Size / line-height / weight | Colour | Arabic (`[dir=rtl]`) | Contrast | Replaces |
|---|---|---|---|---|---|
| `--text-table-row` | 14 (`0.875rem`) / 1.45 / 400 | `--table-row-fg` ink-600 | 14 / 1.6 | W 9.78, P 8.91 ✓ | `text-sm`, 14.5px `.cc-data` |
| `--text-table-row-strong` | 14 / 1.45 / 600 | ink-900 | 14 / 1.6 / 700 | W 15.65 ✓ | `<strong>` primary cell |
| `--text-table-meta` | 13 (`0.8125rem`) / 1.4 / 400 | ink-400 | 13 / 1.55 | W 5.33, P 4.86, hover 4.79 ✓; PD ✗ | 0.72/0.75/0.78/0.82rem, 13.5px `.cc-row-sub` |
| `--text-table-header` | 13 / 1.3 / 600, tracking `0.02em`, **sentence case** | ink-500 on paper | **14** / 1.4 / 700, tracking 0 (= label-ar) | P 7.16 ✓ | `text-[0.7rem]` uppercase (11.2px ✗), 12.5px `.cc-data th` |
| `--text-table-numeric` | 14 / 1.45 / 500, `font-variant-numeric: tabular-nums lining-nums`, `text-align: end` | ink-900 | same; digits follow locale formatter | W 15.65 ✓ | money, counts and dates in rows |
| `--text-table-row-comfortable` | 15 (`0.9375rem`) / 1.55 / 400 | ink-600 | 15 / 1.75 | W 9.78 ✓ | Patient-facing cost tables (Services & costs, proposal line items) |
| `--text-table-badge` | 12 (`0.75rem`) / 1.3 / 600 | per status tone | 12 / 1.4 | see B1 | in-row status badges |

Phone: tables with more than 3 columns become stacked rows (label above value, same tokens) instead of scrolling
sideways. If horizontal scroll is unavoidable, the wrapper is `overflow-x:auto` with a visible edge.

---

## Open questions for the owner

1. **Field boundary (WCAG 1.4.11).** `line-strong` is 1.66:1. Choose one:
   - (a) `var(--color-ink-400)`, an existing token at 5.33 on W. Firm, dossier-like, and visibly heavier.
   - (b) A new primitive `--color-ink-350: #7a898c`, interpolated between ink-300 and ink-400, at 3.63 / 3.31 / 3.03.
   - (c) Keep it as is and record a documented exception.

   Recommendation: (b). It is the only new value in this proposal.
2. **Info hue.** Info = petrol tint (the proposal, with no new hue) or steel blue (`--sys-digestive-deep #184c62`
   on its well, 8.02)? Petrol keeps one family, but info and default badges then look the same.
3. **Warning amber.** Adopt the CC's `#8a5218 / #fcf1e3 / #ecd0a8` as the system warning, or commission a
   petrol-adjacent alternative? It is the only hue outside the petrol family, and is justified by safety semantics.
4. **Badge size.** The DESIGN.md prose says 0.8rem and the ladder says 12px. Confirm 12px/600, and update DESIGN.md
   either way.
5. **Control Center convergence order.** Should CC adopt the B1/B2 tokens first (low risk, colour only), before its
   radius, pill-badge and type changes?
6. **Arabic numerals in money and tables.** *(Pass 3: Western digits pinned with `intlLocale()` → `ar-u-nu-latn`
   in the portal and secure link, per the GATE 2 default; native review still decides.)* Western digits (current `Intl` output) or Arabic-Indic in `ar`? This
   affects `--text-table-numeric` alignment testing, and needs a native-review decision.
7. **Legacy semantic names.** May the 13 collapsed petrol aliases (`surface-clinical/sage/ivory/warm/hospitality`,
   `wash-*`, `mist*`, `sand-*`, `accent-*`) be deleted once components move to component tokens? The
   clean-cutover policy suggests yes.

## Pass 3 — button edge and disabled tokens (applied 2026-10-08, plan `plans/portal-p2-pass-3.md` §5)

Aliases of existing palette values only; no new colour.

| Token | Base → petrol value | Contrast |
|---|---|---|
| `--button-secondary-border` | `line-strong` → `ink-350` (#7a898c) | 3.63 on white (was 1.66) ✓ 1.4.11 |
| `--button-outline-border` | `line-strong` → `ink-350` | 3.63 on white ✓ |
| `--button-disabled-bg` *(new)* | `mist-deep` → paper-deep #efeae0 | inert fill |
| `--button-disabled-fg` *(new)* | `ink-500` (#41555a) | ~6.4 on the fill |
| `--button-disabled-border` *(new)* | `line-strong` | decorative, deliberately below an active edge |

The owner may revert any of these; the backlog rows that asked for them are marked done.
