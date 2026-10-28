---
target: Keycloak theme (login, setup, OTP, passkey; EN/AR)
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\quirky-leavitt-31a7ce\\infrastructure\\keycloak\\themes\\rehletshifaa\\login\\resources\\css\\rehletshifaa.css"
target_fingerprint: "sha256:c14e95057e6959f7e5742fc27cfa32fc52c999a7ea510cf1f05ad12dd97d6049"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\quirky-leavitt-31a7ce\\infrastructure\\keycloak\\themes\\rehletshifaa\\login\\resources\\css\\rehletshifaa.css"
timestamp: 2026-10-28T19-22-30Z
slug: ifaa-login-resources-css-rehletshifaa-css-0ac0c72f
---
Method: dual-agent (A: design review · B: detector + Playwright/axe on the static harness)
Target: Keycloak login theme `infrastructure/keycloak/themes/rehletshifaa` rendered by `infrastructure/keycloak/theme-harness` (real KC 26.7.3 templates, synthetic data; Keycloak on :8180 was down). 13 pages × en/ar × 390/1440. Before shots: `docs/ux-redesign/screenshots/area-7/before/`.

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Account setup has no sense of steps; "One last step" renders ": Create your password" with an orphan colon and a bare link |
| 2 | Match system / real world | 1 | Keycloak words reach patients and staff: Device Name, OTP devices, barcode, "We are sorry…", raw `webauthn-transport-internal` |
| 3 | User control and freedom | 2 | Expired setup link offers only "Continue to my case"; no route to a fresh link |
| 4 | Consistency and standards | 1 | Pre-Petrol palette (#0f8a7e teal, aqua, 10–14px radii, teal glow shadows, radial washes); Segoe UI instead of Alexandria/Jakarta/Cairo; Continue is a button on some pages, a link on others |
| 5 | Error prevention | 2 | No password rule before submit; the password intro is a warning alert |
| 6 | Recognition rather than recall | 2 | OTP/passkey pages put the email in the title slot with an unlabelled restart icon; no h1 |
| 7 | Flexibility and efficiency | 2 | Remember me and show-password fine; nothing else |
| 8 | Aesthetic and minimalist design | 2 | Clean card, but the aqua info footer breaks out; authenticator setup is a wall |
| 9 | Error recovery | 2 | Sign-in error is excellent (one generic, live line); "Invalid authenticator code" gives no next step |
| 10 | Help and documentation | 1 | No coordinator/WhatsApp route; expired page does not say who to ask |
| **Total** | | **17/40** | **Poor** |

## Design specificity verdict
LLM: generic Keycloak in a teal coat; only the logo and the cream canvas are authored. A patient arriving from the Petrol & Paper portal lands in a different product.
Detector: 394 findings (115 warning, 279 advisory) of which ~190 are vendor CSS (PatternFly v3/v4/v5, pficon, Keycloak login.css) — false positives. Ours: 19 in rehletshifaa.css — border-accent-on-rounded (:77, 4px stripe on 14px radius), off-system radii 10px ×7 / 12px / 14px, off-palette colours ×10. Mechanical: physical `text-align:right`, `padding-left/right`, 4-value radii + `html[dir=rtl]` overrides; letter-spacing 0.2px on title and buttons reaching Arabic, 4px on every input of the OTP form including its submit button; two radial gradients; no @font-face (Cairo named, never loaded); theme.properties links two `node_modules/patternfly` stylesheets that do not exist (404 on every page).
Browser: axe serious — color-contrast on 20 pages (white on #0f8a7e 4.23:1; #72767b on aqua 3.98:1), document-title on 26 (harness artifact: the template prints `title`); horizontal overflow at 390 on otp, otp-error, otp-setup, passkey, passkey-setup (458px, `.kc-tooltip-text`) and reset-password, verify-email (393px, `#kc-info`); targets under 44px: locale button 23px, checkboxes 13px, every text link 16–17px; field edge #d9d0c2 1.5:1 (needs 3:1); English on ar pages (verify-email stock copy, "languages" aria-label, raw transport key).

## What's working
1. The sign-in error: one generic, non-enumerating sentence, quiet invalid fields, aria-invalid + aria-live kept.
2. Both bundles carry plain journey wording; the Arabic reads naturally.
3. 44px inputs/buttons and a reduced-motion guard already exist.

## Priority issues
- [P0] Horizontal scroll at 390 on seven pages (tooltip text, info footer). Fix: contain the tooltip and the footer inside the card; min-width 0; scale the QR. → adapt
- [P1] Off-system palette, radii, shadows and type; button label 4.23:1 and field edge 1.5:1 fail AA. Fix: re-point to Petrol & Paper (paper, white, hairlines, petrol-600/700/900, ink-350 edge, 8px, Rest shadow) and self-host Alexandria/Jakarta/Cairo. → typeset, polish
- [P1] RTL and Arabic rules broken: tracking on Arabic titles/buttons, checkbox overlapping its label, physical properties, reversed » « glyphs in both locales, English and raw keys on ar pages. → harden, clarify
- [P2] Keycloak jargon and missing overrides (Device Name, OTP devices, barcode, Submit, We are sorry…, stock verify-email copy, `loginTotpIntro` never rendered, QR alt "Figure: Barcode"). → clarify
- [P2] Second-factor pages have no heading of their own (email in the title slot) and the setup/done/expired pages treat Continue as a bare link. → layout, onboard

## Persona red flags
- Jordan: cannot tell what "One last step" wants; "Device Name" stops them.
- Sam: button and field-edge contrast fail; focus ring 55% teal; locale switcher 23px; no h1 on OTP/passkey.
- Casey: sideways scroll on OTP and passkey setup; a QR code on the phone that holds the authenticator.
- Arabic-first relative: "حالتي" when the case is a relative's; email not isolated in RTL; reversed chevrons and clipped checkbox labels look broken at the account-creation moment.

## Minor observations
Card title centred while body is start-aligned; login heading repeats the logo; success alert is aqua, not the success token; error input at 390 lets typed text touch the start border; logo.png (835 KB) shipped but unused.

## Questions to consider
- Should patients see Keycloak at all after setup, or hand straight back to a portal "your file is ready" moment?
- Should a patient's first password page frame care while a staff sign-in frames duty?
- Can the expired page offer a fresh link instead of sending a worried relative to a case page they cannot open?
