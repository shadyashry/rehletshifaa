---
name: RehletShifaa
description: Petrol & Paper — an evidence-first clinical dossier for patients seeking specialist care in Egypt.
colors:
  petrol-50: "#eef4f3"
  petrol-100: "#d9e8e6"
  petrol-200: "#b6d3cf"
  petrol-300: "#8cbab4"
  petrol-400: "#5fb3ac"
  petrol-500: "#1d6b6b"
  petrol-600: "#0e5f66"
  petrol-700: "#0e4f55"
  petrol-800: "#0c4247"
  petrol-900: "#13292e"
  petrol-950: "#0b1d21"
  ink-900: "#14262b"
  ink-800: "#1b2f34"
  ink-700: "#24383d"
  ink-600: "#33474c"
  ink-500: "#41555a"
  ink-400: "#5d6e72"
  ink-300: "#a3afb1"
  ink-350: "#7a898c"
  paper: "#f7f4ee"
  paper-deep: "#efeae0"
  surface-white: "#ffffff"
  line: "#e3ded4"
  line-strong: "#cfc8ba"
  border-card: "#e0dacd"
  logo-coral: "#e07a5f"
  alert-50: "#fdf5f4"
  alert-200: "#f0d4d1"
  alert-600: "#b3352f"
  alert-700: "#8c2b28"
  alert-800: "#74201e"
  system-heart-deep: "#1b5f3d"
  system-heart-line: "#3b9166"
  system-heart-well: "#e2f5ec"
  system-neuro-deep: "#186256"
  system-neuro-line: "#379585"
  system-neuro-well: "#e2f6f3"
  system-movement-deep: "#175c63"
  system-movement-line: "#358d97"
  system-movement-well: "#e1f4f7"
  system-digestive-deep: "#184c62"
  system-digestive-line: "#377995"
  system-digestive-well: "#e2f0f6"
  system-surgery-deep: "#1c3b5e"
  system-surgery-line: "#3d638f"
  system-surgery-well: "#e3ebf5"
  system-women-deep: "#202e5b"
  system-women-line: "#435489"
  system-women-well: "#e4e8f4"
typography:
  display:
    fontFamily: "Alexandria, Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 1.6rem + 1.5vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  display-ar:
    fontFamily: "Alexandria, Cairo, Tahoma, sans-serif"
    fontSize: "clamp(1.65rem, 1.3rem + 1.3vw, 2.35rem)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
  headline:
    fontFamily: "Alexandria, Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "clamp(1.6rem, 1.2rem + 1.2vw, 2.125rem)"
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: "-0.025em"
  headline-ar:
    fontFamily: "Alexandria, Cairo, Tahoma, sans-serif"
    fontSize: "clamp(1.4rem, 1.2rem + 0.75vw, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.36
    letterSpacing: "0"
  statement:
    fontFamily: "Alexandria, Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "clamp(1.25rem, 1.05rem + 0.7vw, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.32
    letterSpacing: "-0.014em"
  title:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "clamp(1.15rem, 1.09rem + 0.25vw, 1.3rem)"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.008em"
  body:
    fontFamily: "Plus Jakarta Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1rem, 0.97rem + 0.14vw, 1.0625rem)"
    fontWeight: 400
    lineHeight: 1.7
  body-ar:
    fontFamily: "Cairo, Plus Jakarta Sans, Segoe UI, Tahoma, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.85
  lead:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "clamp(1rem, 0.98rem + 0.15vw, 1.0625rem)"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Plus Jakarta Sans, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.12em"
  label-ar:
    fontFamily: "Cairo, Tahoma, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  pill: "9999px"
spacing:
  gutter: "1.25rem"
  gutter-phone: "0.75rem"
  container: "1200px"
  section: "clamp(2.5rem, 2rem + 2vw, 4.25rem)"
  section-tight: "clamp(1.75rem, 2.4vw, 2.75rem)"
  section-phone: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.petrol-600}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "0.7rem 1.35rem"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.petrol-700}"
    textColor: "{colors.surface-white}"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.petrol-900}"
    rounded: "{rounded.md}"
    padding: "0.7rem 1.35rem"
    height: "3rem"
  button-inverse:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.petrol-700}"
    rounded: "{rounded.md}"
    padding: "0.7rem 1.35rem"
    height: "3rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.petrol-700}"
    rounded: "{rounded.md}"
    padding: "0.55rem 1.15rem"
    height: "2.75rem"
  button-outline-hover:
    backgroundColor: "{colors.petrol-50}"
    textColor: "{colors.petrol-800}"
  field:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "0.8rem 0.9rem"
    height: "3.35rem"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-600}"
    rounded: "{rounded.md}"
  nav-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink-600}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  nav-pill-active:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.petrol-900}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  status-badge:
    backgroundColor: "{colors.petrol-50}"
    textColor: "{colors.petrol-800}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.65rem"
  journey-marker:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.petrol-700}"
    rounded: "{rounded.pill}"
    size: "2rem"
  journey-marker-reached:
    backgroundColor: "{colors.petrol-700}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.pill}"
    size: "2rem"
---

# Design System: RehletShifaa

## Overview

**Creative North Star: "The Clinical Dossier"**

Every screen should read like a well-kept patient file: warm paper, near-black ink with a green cast, fine warm
hairlines, and one deep petrol that marks what matters and what to do next. The interface is evidence first. A
patient deciding on treatment abroad should meet facts set in confident type, arranged by space and rules, not
persuaded by panels, glows or repeated buttons. Decoration is edited down until only signals remain: a short coral
rule opening a section, a petrol edge on the top of a card like the tab of a file, and a numbered journey that fills
as you move through it.

Density is calm but not sparse. The public site breathes generously, while the patient portal and staff tools tighten
the same tokens for working use. English and Arabic are equal: Arabic gets its own sizes, leading and zero tracking,
never a mirrored copy of the Latin settings. Motion explains (arrival, progress, cause and effect) and switches off
completely for reduced motion.

**Petrol & Paper is the one visual system.** The token source is the `@theme` block in
`frontend/src/app/globals.css` re-pointed by `frontend/src/app/theme-petrol.css` under `data-brand-theme="petrol"`;
this file states the values those two produce together. The Control Center currently skips that attribute and still
renders the older base ("Light Healing") values. That is legacy: converge it to Petrol & Paper when it is touched,
rather than designing new work against the base values.

**Key Characteristics:**
- Two surfaces only (white and paper), separated by warm hairlines, not shadows.
- One action colour (petrol) and one warm note (logo coral, used as a mark and never as text).
- Alexandria headings shared with the wordmark; Plus Jakarta Sans body; Cairo for Arabic.
- One radius family (8px), flat at rest.
- Bilingual by construction: logical properties, direction-aware motion, Arabic type steps.

## Colors

A cool, inky petrol family on warm paper, with a single coral accent from the logo.

### Primary
- **Petrol** (petrol-600): the action colour. Primary buttons, links, focus outlines, checks, eyebrows and form
  accents (`accent-color`, caret). White on Petrol is 7.4:1.
- **Deep Petrol** (petrol-700): hover and pressed state of actions, the closing call-to-action panel, reached journey
  markers and the lead Consultant monogram.
- **Petrol Ink** (petrol-900): every heading and the wordmark; 13.8:1 on paper.
- **Petrol Tints** (petrol-50 / petrol-100): hover wash and the focus halo or selection respectively. Never a
  section background.
- **Support Teal** (petrol-400): thin rules, journey connector lines and markers only; never text.

### Tertiary
- **Logo Coral** (logo-coral): the one warm note, taken from the logo. Used for the 1–1.25rem rule that opens every
  eyebrow and the hero, the footer's opening rule, journey-marker rings, the reading-progress hairline and the
  closing panel's top rule. It does not reach AA on light surfaces, so it never carries text or meaning by itself.

### Neutral
- **Body Ink** (ink-600): running text; 8.9:1 on paper.
- **Muted Ink** (ink-400): secondary copy, metadata; 4.9:1 on paper, so it is the floor for any readable text.
- **Deep Ink** (ink-900 / ink-800): form values and the strongest non-heading text.
- **Quiet Ink** (ink-300): resting arrows and disabled marks only; not text.
- **Paper** (paper): the page canvas and alternating section ground; also the facts panel and upload areas.
- **Deep Paper** (paper-deep): icon wells and progress tracks only.
- **White** (surface-white): cards, fields, the header bar, and the alternating white sections.
- **Hairline** (line) and **Strong Hairline** (line-strong): every divider and card edge. Strong Hairline is for
  secondary-button edges and the hero photo's frame. Both are decorative (below 3:1), so neither may be the only
  boundary of a control.
- **Field Edge** (ink-350): the border of every text field, select and composite input (country search, phone
  prefix). It is the quietest grey that meets WCAG 1.4.11 non-text contrast: 3.63 on white, 3.31 on paper, 3.03 on
  deep paper.

### Semantic
- **Alert** (alert-50 → alert-800): safety notices, errors and unread counts. White on alert-600 clears AA;
  error text uses alert-800, error borders alert-700.

### Care-area systems
Six body systems (heart, neuro, movement, digestive, surgery, women) each get a **well** (tint), **line** (marks) and
**deep** shade (icons and text, 6.4:1+ on its well). Their hues step across the cool petrol family, from sea green
to slate, so they read as one family. An icon identifies each system first; the colour only supports it.

### Named Rules
**The One Action Rule.** Petrol is the only colour that means "do this". Nothing else is filled with it except the
single closing panel.

**The Coral Is a Mark Rule.** Logo Coral appears only as a short rule, ring or hairline. It never carries text,
fills a surface or stands alone for meaning.

**The Two Surfaces Rule.** A page uses white and paper, alternating by section and edged by hairlines. Deep Paper
is for small wells and tracks only; there are no washes, gradients or tinted section bands.

## Typography

**Display Font:** Alexandria (with Plus Jakarta Sans, Segoe UI)
**Body Font:** Plus Jakarta Sans (with Segoe UI, system-ui)
**Arabic:** Cairo for body; Alexandria's Arabic subset for display and headlines

**Character:** Alexandria is the wordmark's face, Egyptian-designed and covering both scripts, so headings and the
logo speak in one voice. Jakarta keeps body copy open and modern. Cairo's larger x-height means Arabic is set a step
smaller with more leading. All faces are self-hosted (`frontend/src/lib/fonts.ts`).

### Hierarchy
- **Display** (600, fluid 32→48px, 1.04): the one page headline per hero. Arabic: 26→38px, 1.3 leading. Phones:
  32px (Arabic 28px).
- **Headline** (600, fluid 26→34px, 1.16): section headings; they settle into place once on arrival. Arabic:
  22→28px, 1.36.
- **Statement** (600, fluid 20→28px, 1.32): editorial supporting statements, lighter than a heading.
- **Title** (600, fluid 18→21px, 1.4): card and step titles.
- **Body** (400, 16→17px, 1.7): running text, `text-wrap: pretty`. Arabic 16px, 1.85.
- **Lead** (400, 16→17px, 1.65): intro paragraphs under headings.
- **Label** (700, 13px, 0.12em, uppercase): eyebrows, opened by the coral rule. Arabic: 14px, no tracking, no case.

### Named Rules
**The Ladder Rule.** Fixed sizes come from one ladder: 12 (badges and initials only), 13 (smallest label), 14, 15,
16, 17, 18 and 20px, with the fluid roles above. Map any new size onto it.

**The Arabic Is Not Latin Rule.** Arabic never inherits negative tracking or uppercase. Display, headline, title and
label reset letter-spacing to 0, and Arabic sizes step down with leading opened up.

## Layout

A single centred column, `min(1200px, 100% − 2.5rem)` wide (phones: 0.75rem gutters), with sections that alternate
paper and white. Section rhythm is fluid (about 52px at 1024 up to 68px), with a compact variant for supporting bands
and a fixed 40px on phones. The phone layout is designed on its own terms, not a shrunk desktop: a smaller type scale,
tighter leading and thumb-sized controls (at least 46px buttons, 44px links). Layouts must hold from 320px.

Desktop navigation switches on at 1100px (`--breakpoint-nav`); English needs about 1000px, so header content must
not grow without re-testing that width. The header is one floating white bar at 93% opacity that firms its shadow as
the page scrolls; a coral hairline under it fills as you read.

All direction-sensitive spacing, borders, positions and transforms use logical properties (`margin-inline`,
`inset-inline-start`, `border-inline-start`). Arrows and slides mirror in RTL, and transform origins flip with
`dir`.

## Elevation & Depth

Flat by default. Depth comes from the two surfaces and hairlines, not from shadow. Three quiet shadows exist, each
with a single job, and none of them is decorative.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgba(20, 38, 43, 0.05)`): cards at rest; barely there.
- **Raised** (`box-shadow: 0 1px 2px rgba(20, 38, 43, 0.06), 0 12px 28px -20px rgba(20, 38, 43, 0.28)`): the hero's
  intake card and hovered care cards, the only objects that float.
- **Header firm** (`box-shadow: 0 22px 44px -26px rgba(14, 79, 85, 0.45)`): applied by scroll to the floating header.

### Named Rules
**The Hairline First Rule.** Separate with type, space and a 1px hairline before you reach for a surface or a shadow.
Never nest a card inside a card.

## Shapes

One radius family: 8px for cards, buttons, fields, photos, dialogs and panels; 6px for small inner elements (chips,
the film's duration tag); full circles only for journey markers, step dots, avatars and the navigation pill track.
Lists that read as editorial content (privacy, principles) drop their containers entirely and use straight top rules.
The hero photo sits inside a strong-hairline outline offset by 9px, like a print in a frame.

## Components

Firm and quiet: flat at rest, petrol for intent, hairlines for structure, motion only where it explains.

### Buttons
- **Shape:** gently squared corners (8px).
- **Primary:** Petrol fill, white text, 48px tall (44px in the header and portal, 46px on phones). Hover deepens to
  Deep Petrol with a single soft light passing across it; press scales to 0.98. No lift, no glow.
- **Secondary:** white with a Strong Hairline edge and Petrol Ink text; on hover the edge turns Petrol Ink.
- **Inverse:** white on the petrol closing panel, Deep Petrol text.
- **Outline:** the header's "Sign in": transparent, Strong Hairline edge, 44px, never a second filled action.
- **Arrows:** trailing arrows lean 3px toward their destination on hover, mirrored in RTL.

### Links
- **Text action:** Petrol, bold, at least 44px tall. The underline draws in from the start edge on hover rather than
  switching on. Footer links do the same in Body Ink.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** white on paper sections; paper for the facts panel inside a white section.
- **Shadow Strategy:** Rest, or none; Raised only for the hero intake card and hovered care cards.
- **Border:** 1px hairline. The intake card carries a 2px Petrol top edge, like the tab of a file.
- **Internal Padding:** 1.25rem (asides) to 1.5–2rem (feature cards).

### Inputs / Fields
- **Style:** white, Field Edge border, 8px radius, about 54px tall (44px in the portal).
- **Hover:** the border warms to petrol-300.
- **Focus:** Petrol border plus a 3px Petrol Tint halo; the field's label also turns Deep Petrol.
- **Error:** alert-700 border, alert-800 message text.
- **Choice cards** (radio groups): an 8px card that lifts 1px on hover; when checked it gets a Petrol edge, petrol-50
  fill and a 3px halo.
- **Upload area:** a paper drop zone that turns petrol-50 with a Petrol edge on hover.

### Navigation
- **Desktop:** one floating white bar holding the logo, a track of pill links, a coordinator WhatsApp chip, the
  language switch, Sign in and the primary action. Pills sit in Ink 600 at 15px/500 and rise to a white pill with
  Petrol Ink text and a hairline ring when active.
- **Care Areas:** a mega menu that drops as an 8px card with a short 6px settle.
- **Mobile:** a compact menu below 1100px plus a persistent case bar on phones.

### Journey markers (signature)
Numbered 32px circles connected by a thin petrol-300 line. A step not yet reached is white with a Petrol numeral and
a coral ring. A reached step fills Deep Petrol with a white numeral and a petrol-100 halo. On How It Works, each step
fills as it crosses the middle of the screen; step one is always filled ("you are here").

### Eyebrow (signature)
Petrol label text, opened by a 1rem × 2px coral rule. It is the most repeated brand signal on every page.

### Drawer (portal)
A native modal `<dialog>` sized to 36rem (full width minus 2rem on phones; a portal case drawer becomes a full-height sheet below 640px), 8px radius, Raised shadow. Its header — the
title as `<h2>` naming the dialog, and a 44px Close icon button — stays pinned while the content scrolls, edged by a
hairline. Escape closes it, and focus returns to the control that opened it. A result or error from an action inside
the drawer is reported inside the drawer: the page behind a modal is inert.

### Patient proposal (signature)
One reading column inside the drawer, in the patient's voice: document type, then a plain-word status and a long
localised "Valid until" date (never a version number or internal status); the total in Display weight; the line items
as a hairline list; the honesty line (estimate or final quote); the Consultant's recommendation and the coordinator's
note as plain text; the terms in a disclosure marked "Pending legal review", open while a decision is owed; then one
decision with Request changes and Decline as secondary actions.

### Status badge
8px, petrol-50 fill, petrol-200 edge, petrol-800 text at 12px/600, for case and workflow states in the portal.

### Component tokens
Buttons, status badges, tables, dialogs, fields and cards read component tokens (`--button-*`, `--badge-*`,
`--table-*`, `--dialog-*`, `--field-*`, `--card-*`, plus `--focus-ring` and `--shadow-raised`). They are declared in
`globals.css` (`:root` in `@layer base`) as aliases of the ramp and semantic tokens, so they follow the theme
automatically. `theme-petrol.css` overrides only where Petrol & Paper differs in structure: 8px radii, a flat primary
hover and the secondary-button hover. New components use these tokens rather than reading ramps or hex values directly.
The status, chart and dense-table tokens in `docs/ux-redesign/token-proposals.md` (B1–B3) are deferred, not adopted.

## Do's and Don'ts

### Do:
- **Do** give every control at least a 44×44px hit area — tabs, row checkboxes, icon buttons, chip removes — by
  expanding the hit area (padding with a negative margin) rather than the visual.
- **Do** isolate left-to-right runs inside Arabic: amounts and case numbers in `<bdi dir="ltr">`, names and staff
  free text in `<bdi>` or `dir="auto"`.
- **Do** read labels from the viewer's side: "you" only for the person actually waited on or responsible, counts
  through `Intl.PluralRules`, and enum values always as words.
- **Do** take every colour from the tokens above; propose any new token explicitly before using it.
- **Do** alternate white and paper sections with a 1px hairline where they meet.
- **Do** keep Petrol for actions and links, and Logo Coral for short rules and rings.
- **Do** keep at most one in-content route to the case form on an informational page, preferably a text link; the
  header's primary action covers the rest.
- **Do** use logical properties and mirror arrows, slides and transform origins in RTL.
- **Do** keep text at or above Muted Ink (4.9:1) contrast, and target WCAG 2.2 AA throughout.
- **Do** animate only opacity and transform, and never hide the hero headline or photo (LCP) behind motion; give
  every animation a static reduced-motion state.
- **Do** keep care-area colours inside the petrol family and let the icon carry identity.

### Don't:
- **Don't** set text in Logo Coral or use it as a fill.
- **Don't** add gradients, glows, mint washes, frosted glass or tinted section bands.
- **Don't** nest cards, or wrap editorial lists in feature cards.
- **Don't** stack calls to action: no hero buttons plus sticky cards plus closing panels on the same informational
  page.
- **Don't** use radii outside 6px, 8px and full circles, or the 14–18px "bubble" cards of the old look.
- **Don't** apply Latin tracking or uppercase to Arabic.
- **Don't** use `left`/`right` physical properties for layout.
- **Don't** redesign the hand-and-heart logo mark; wordmark changes need explicit confirmation.
- **Don't** introduce a multi-hue categorical palette outside the petrol family.
