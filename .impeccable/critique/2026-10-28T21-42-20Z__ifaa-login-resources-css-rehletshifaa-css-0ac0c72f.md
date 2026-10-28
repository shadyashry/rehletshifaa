---
target: Keycloak theme close (login, setup, OTP, passkey; EN/AR)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\happy-elbakyan-3f197e\\infrastructure\\keycloak\\themes\\rehletshifaa\\login\\resources\\css\\rehletshifaa.css"
target_fingerprint: "sha256:40ebae925d193f7b9e4c2e293b39c92ecafd96be9e8617fb4380d9978f2191e4"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\happy-elbakyan-3f197e\\infrastructure\\keycloak\\themes\\rehletshifaa\\login\\resources\\css\\rehletshifaa.css"
timestamp: 2026-10-28T21-42-20Z
slug: ifaa-login-resources-css-rehletshifaa-css-0ac0c72f
---
Method: dual-agent (A: design review · B: detector + Playwright/axe on the static harness)
Target: Keycloak login theme `infrastructure/keycloak/themes/rehletshifaa` at the close of area 7 (slices 7-0..7-3), rendered by `infrastructure/keycloak/theme-harness` (Keycloak 26.7.3 templates, synthetic data): 20 scenarios × en/ar × 390/1440. Shots: `docs/ux-redesign/screenshots/area-7/after/`. Keycloak on :8180 serves the main checkout's theme, so nothing was checked live.

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Setup names the next step; no sense of how many remain or that the account is the last gate before the case |
| 2 | Match system / real world | 4 | Keycloak's vocabulary is gone in both languages (phone name, code from your authenticator app, on this device, USB security key) |
| 3 | User control and freedom | 3 | Restart link labelled on every second step; the expired page without a client has no action |
| 4 | Consistency and standards | 3 | One card, one petrol action, one h1 everywhere; expired page's button says "Continue to the case" while the copy says sign in |
| 5 | Error prevention | 3 | Password rule before typing, numeric one-time-code fields; the rule list is static |
| 6 | Recognition rather than recall | 3 | Labels above fields, passkeys named with where and when; the rule sits between the password label and its field |
| 7 | Flexibility and efficiency | 3 | Show password, keep signed in, choose an authenticator, key and QR side by side (key first on a phone) |
| 8 | Aesthetic and minimalist design | 3 | Calm Petrol & Paper card with the portal's lockup; authenticator setup is ~1,400px at 390 |
| 9 | Error recovery | 3 | Sign-in and code errors say what to do, tied to their fields |
| 10 | Help and documentation | 2 | "Ask your coordinator" with no route to reach one (no WhatsApp/contact in the theme) |
| **Total** | | **30/40** | **Good** (from 17/40) |

## Design specificity verdict
LLM: now visibly RehletShifaa: paper, petrol tab, Alexandria headings, the portal's own bilingual lockup as live text, plain words. Still one card silhouette for every moment; the journey idea stops at the door.
Detector: our CSS and templates scan clean (0). On the rendered pages 84 hits, all false positives (sr-only brand name, fieldset UA border, a PatternFly 3 focus colour never applied); 193 vendor CSS hits. Browser: spec 12/12 (overflow, axe serious/critical, fonts, targets, words); axe best-practice: positive tabindex on Keycloak's stock login.ftl (4 pages, not overridden); missing main landmark (fixed in template.ftl).

## What's working
1. The vocabulary rewrite, complete and humane in both languages.
2. Errors: one specific line, tied to the field, quiet invalid state.
3. RTL care: isolated email, key, algorithm, dates; mirrored chevron; both scripts in the lockup.

## Priority issues
- [P1] Expired setup link without a client is a dead end and "ask your coordinator" has no route. Fix: a contact/WhatsApp route needs a backend link the theme can render (plan O-3); "Sign in" on the client variant.
- [P1] verify-email: the only action is a footer link; make it the card's button, spam hint only after sending.
- [P2] Password rule static and between label and field; live checklist under the field; hide "Sign out from other devices" on a first password.
- [P2] Setup done is flat: one line on what happens next.
- [P2] Stock login.ftl keeps positive tabindex 2–7.

## Persona red flags
Patient on an Arabic phone: English-letter password rules without saying to switch keyboard; expired dead end. Staff enrolling: step 3 bundles code + phone name; "Phone name" assumes a phone. First-timer: two session checkboxes.

## Minor observations
Language switch on its own row pushes the h1 down at 390; large empty paper under short cards; passkey dates follow Keycloak's server format.

## Questions
- Should a patient see a password page at all, or a passkey/magic-link setup?
- Why is the most likely patient error (expired link) the least designed page?
