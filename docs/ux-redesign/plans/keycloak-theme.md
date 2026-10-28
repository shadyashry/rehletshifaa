# Shape plan — Area 7: the Keycloak theme, the file's front door

Status: **plan, 2026-10-28** — written without an owner gate under the owner's standing instruction (2026-10-15: "always
continue each next implementation on new session without asking me till the end"); assumptions are marked **[A]**.
Scope: `PLAN.md` row 7 — the Keycloak login theme `infrastructure/keycloak/themes/rehletshifaa`: sign-in, the patient's
account setup (emailed link → password → ready / expired), password reset, email verification, and the staff second
factor (authenticator app, one-time code, passkey), in en and ar.
Critique: `.impeccable/critique/2026-10-28T19-22-30Z__ifaa-login-resources-css-rehletshifaa-css-0ac0c72f.md`, **17/40**
(dual-agent; detector 19 findings in our CSS, ~190 vendor false positives; axe serious: contrast on 20 pages; overflow at
390 on 7 pages). Before shots: `screenshots/area-7/before/`.

**Rendering.** Keycloak on :8180 was down (another session is rebuilding the stack), so every shot comes from the static
harness `infrastructure/keycloak/theme-harness/` (`render.sh`): the real Keycloak 26.7.3 FreeMarker templates, resolved
base ← keycloak ← rehletshifaa as the server does, with synthetic data; `frontend/e2e/keycloak-theme.spec.ts` shoots and
checks the output (`KC_HARNESS_DIR`, `AREA7_SHOTS`, `PLAYWRIGHT_EXTERNAL_SERVER=true`). Each slice re-shoots on the harness;
the close also walks the live pages once the stack is up (`login-error.spec.ts`, `mfa-live.spec.ts`).

## Job and audience

Two people meet this door. **The patient (or a relative acting for them)**, Arabic-first, on a phone, opening the emailed
"finish setting up your account" link: they need to know this is RehletShifaa, set one password, and get back to the file
— trust is highest-stakes here. **Staff**, signing in daily and passing a second factor: they need the shortest correct
path and plain words for the authenticator and the passkey. Mode: **Operate**; brand lives in the details.

## Outcome and proof

- **Success:** a patient from My Care's email lands on a page that is visibly the same paper, ink and type as the portal,
  sets a password and reaches "ready" in Arabic on a 390px phone without a sideways scroll, an English word, a backwards
  arrow or a Keycloak term; a staff member enrols an authenticator or a passkey on a page that says what it is for.
- **Evidence:** the harness pages and `keycloak-theme.spec.ts` checks (no overflow at 390, axe serious/critical clean,
  Arabic untracked in Cairo/Alexandria, 44px targets); the live specs at the close.

## Selected direction (Petrol & Paper unchanged; no new token)

Keycloak cannot read `globals.css`, so the theme **mirrors** the Petrol & Paper values it needs as custom properties named
after their source tokens (`--color-brand-600`, `--paper`, `--color-ink-350`, …), with a header naming the source files;
any token change in the portal must be copied here (a check in the spec compares the values **[A: grep-level, 7-0]**).

1. **Paper, ink and type (7-0).** Paper canvas, white card edged by a hairline with the 2px petrol file-tab edge, 8px radii,
   Rest shadow only; petrol-600 actions (white 7.4:1), petrol-900 Alexandria headings, Jakarta body, Cairo Arabic,
   self-hosted from the portal's own font files; ink-350 field edges, petrol focus ring and halo, alert-700/800 errors,
   status-token alerts; no tracking or case on Arabic anywhere; logical properties only (the `html[dir=rtl]` physical
   overrides go); no horizontal scroll at 390 (tooltip, info footer, QR); 44px targets for the locale switcher, links and
   checkboxes; the two dead `node_modules` stylesheets removed from `theme.properties`.
2. **Words (7-1).** Both bundles, inserted textually: Keycloak jargon replaced (Device Name, OTP devices, barcode, Submit,
   "We are sorry…", Title Case "Forgot Password?"), the » « glyphs dropped (the arrow, if any, is CSS and mirrors), the
   verify-email and reset pages in our words, setup copy that works for a relative ("the case", not "my case"), the
   expired link saying who can send a new one, the locale button's label, the passkey label and transport names in Arabic.
3. **The setup moments (7-2).** Template overrides where copy alone cannot: `info.ftl` (setup start and done: Continue as the
   one primary button, no orphan colon), `error.ftl` (expired: recovery route to the coordinator), `login-update-password.ftl`
   (the intro as plain text, not a warning alert; the password rule stated before submit) **[A: rule copy from the realm
   policy]**.
4. **The second factor (7-3).** `login-otp.ftl`, `login-config-totp.ftl`, `webauthn-register.ftl`, `webauthn-authenticate.ftl`:
   a real h1 per page with the account as a quiet line beneath (the restart link labelled), `loginTotpIntro` rendered, on a
   phone the manual key first ("this phone holds the app"), the QR's alt in the page language, the digits field one-time-
   code styled; then the close: re-critique (target ≥ 28/40), after shots (`AREA7_SHOTS=after`), live walk if the stack is up,
   STATUS closing the area.

## Slices (one per session; each: Impeccable + Vercel skills loaded at batch start, the four read-only reviews, verify, commit)

| Slice | What | Files | Depends |
|---|---|---|---|
| **7-0 paper, ink and type** (this session) | Harness + shots/checks spec; critique; this plan; the theme CSS re-pointed to Petrol & Paper, fonts, logical properties, overflow, targets, dead stylesheets | `rehletshifaa.css`, `theme.properties`, `resources/fonts/*`, `theme-harness/*`, `e2e/keycloak-theme.spec.ts` | — |
| **7-1 words** | Message overrides in both bundles; glyphs; jargon; Arabic gaps | `messages_en/ar.properties` (login + email if touched) | 7-0 |
| **7-2 the setup moments** | `info.ftl`, `error.ftl`, `login-update-password.ftl` overrides; one primary Continue; expired recovery | `login/*.ftl`, messages | 7-1 |
| **7-3 the second factor + close** | OTP / TOTP / passkey template overrides; re-critique ≥ 28/40; after shots; live walk; STATUS closes area 7 | `login/*.ftl`, messages, css | 7-2 |

## States and ranges

Sign-in (empty, wrong credentials), reset (sent), account setup (start, password with policy refusal, done, link expired or
used, already signed in as someone else), email verification, OTP setup (scan / manual), OTP sign-in (one or several
authenticators, wrong code), passkey setup and sign-in (one or several keys, unsupported browser). Long Arabic labels, the
email as an LTR run inside RTL copy, 320px phones.

## Open questions (assumed, not asked)

- O-1 The page `<title>` is empty in the harness (`template.ftl` prints `title`, which Keycloak fills); confirm live at the close.
- O-2 Whether the patient should leave Keycloak straight for a portal "ready" page (a redirect, not a theme change) — product decision.
- O-3 A fresh-link action on the expired page needs a backend route; 7-2 words the recovery through the coordinator **[A]**.
