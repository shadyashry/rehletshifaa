# Commercial workflow — implementation status & handoff

Working branch: `codex/end-to-end-care-platform`. This document is the entry point for
continuing the proposal-to-patient **commercial workflow** epic. Read it with
[`end-to-end-workflows.md`](end-to-end-workflows.md) (behaviour) and
[`architecture.md`](architecture.md) (structure).

## How to run and verify (read first)

- **Local stack must use the tunnel overlay** — the trycloudflare URLs are baked into the
  containers. Always:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up --build -d
  ```
  Never run a bare `docker compose up` (it reconfigures services for `localhost` and breaks
  the tunnel-served portal). Never delete the `keycloak-data` (or any) volume.
- **Backend build/tests are offline Maven**: `cd backend && mvn -o -q test`. Do **not** add a
  dependency that isn't already in the local `~/.m2` (it will break the offline build — this is
  why CSV, not Apache POI, was used for the price-list import).
- **Frontend**: `cd frontend && pnpm typecheck` (the reliable gate). `pnpm lint` has **two
  pre-existing errors** in `ProposalSign`/`TrackCaseLanding` unrelated to this epic.
- Full backend suite is currently **79 tests, green**. Key classes:
  `JourneyServiceIntegrationTest` (the long end-to-end flows), `SecureJourneyCorrectionsTest`
  (secure link/OTP/decision), `PricingCatalogServiceTest` (catalog + FX + CSV import),
  `PatientConversionLayerTest` (contact-verification split, channel choice, onboarding, identity,
  deposit waiver, readiness gate).
- **Flyway migrations are additive** — never edit `V1`–`V15`; add `V16+`. H2 (test) runs in
  PostgreSQL mode; keep migrations H2-safe: `TIMESTAMP WITH TIME ZONE` (not `TIMESTAMPTZ`), no
  partial indexes (`WHERE`), one `ADD COLUMN` per `ALTER`, fixed UUIDs in seeds (not
  `gen_random_uuid()`), `ON CONFLICT`/`MERGE` avoided in test-run migrations (use
  update-then-insert).

## What is implemented (all committed & pushed)

Prices are **EGP-based** and computed only on the backend; the internal margin is **baked into
an inclusive patient package** and never exposed (no provider net cost, margin rate, or profit
in any patient-facing DTO/UI).

| Area | Backend | UI |
|---|---|---|
| Per-consultant **price catalog** + care-area templates + CSV import | `PricingCatalogService` | admin catalog screen; doctor multi-select |
| **Currency** (daily FX cached in `fx_rates`, senior-Finance override, snapshot+freeze on release) | `CurrencyService` | currency switcher (doctor/coordinator) |
| **Central margin / commercial policy** (senior Finance, versioned, audited; 12% default) | `CommercialPolicyService` | Finance "Commercial settings" panel |
| **Two document types** `PRELIMINARY_ESTIMATE` / `FINAL_TREATMENT_QUOTE`, min/expected/max **ranges** | `JourneyService.createProposal` / `createFinalQuote` | `ProposalSign` (patient) + coordinator/doctor panels |
| **Conditional gates** (backend-computed `ProposalGates`) | `computeGates` | Not required / Waiting / Complete checklist |
| **Final in-person assessment → final quote** (locked rate, scope diff, case stays `ARRIVAL_CONFIRMED`) | `saveFinalAssessment` / `createFinalQuote` / `releaseFinalQuote` | doctor `FinalAssessment`, coordinator `FinalQuoteActions` |
| **Treatment-commencement gate** (accepted final quote + procedure-specific consent, or audited break-glass) | `captureProcedureConsent` / `emergencyOverride` / `treatment` | (endpoints only) |
| **Deposits + offline payment ledger** (central deposit policy, append-only `payment_events`, idempotent) | `PaymentService` | `DepositCard` (finance record/refund; others read-only); patient "what you pay now" |
| **Secure delivery + idempotent resend** (masked delivery status) | `resendProposalLink` / `deliveryStatus` | coordinator `DeliveryCard` |

### The four conditional approval paths (never inferred from status on the client)

| Pricing | Travel package | Operations | Finance | Release |
|---|---|---|---|---|
| All catalog | No | – | – | immediate |
| All catalog | Yes | required | – | after Operations |
| Manual/off-catalog/mixed | No | – | **required from `CLINICALLY_APPROVED`** | after Finance |
| Manual/off-catalog/mixed | Yes | first | second | after both |

Finance is also required for expired/inactive catalog prices, a missing EGP base, a missing
policy, or a requested policy exception. The ordinary margin never creates a case-level Finance gate.

### Money model specifics (important when touching pricing code)

- `proposal_items.unit_price_egp` is the **inclusive** expected EGP (provider × (1+margin));
  `provider_price_egp` is the internal provider base. `unit_price` is the display-currency value,
  **frozen** at release (`ROUND(unit_price_egp × fx_rate, 2)`).
- `createProposal`/`createFinalQuote` duplicate the pricing block intentionally (final reuses the
  **locked** preliminary rate). If you change the margin/markup formula, change both and update the
  deterministic-margin tests.
- Preliminary decisions are recorded as `ACKNOWLEDGED` (version status maps to `ACCEPTED`, macro →
  `ACCEPTED`, deposit created). Final decisions use `ACCEPTED` and **do not** move the macro case
  off `ARRIVAL_CONFIRMED`. Legacy `ACCEPTED` preliminary rows remain valid.

## Migrations added by this epic

`V9` cost estimates · `V11` catalog/templates/FX + proposal snapshot cols · `V12`
`travel_package_requested` · `V13` document type + ranges + commercial policy · `V14` consent
linkage + `ACKNOWLEDGED` decision · `V15` deposit policies + deposits + `payment_events` ·
`V16` Meta WhatsApp delivery tracking · `V17` `patient_onboardings` · `V18`
`patient_identity_verifications` · `V19` deposit-waiver columns on `deposits`.

## Keycloak custom login theme (done)

Branded theme at `infrastructure/keycloak/themes/rehletshifaa/login` (parent `keycloak` classic; CSS +
logo + EN/AR message bundles only, so KC's forms/validation survive upgrades). Warm cream + healing
teal, soft-ink headings, pale-aqua surfaces; RTL via logical properties + KC's `dir="rtl"` for `ar`.
Delivery: **local** bind-mounts the theme with caching off (`KC_SPI_THEME_CACHE_*=false`); **Oracle**
`COPY`s a synced copy (`deploy/oracle/keycloak/themes`) into the `start --optimized` image. Both realm
JSONs set `loginTheme` + `internationalizationEnabled` + `supportedLocales [en,ar]` for fresh imports;
already-persisted realms are activated by the idempotent, non-destructive
`infrastructure/keycloak/apply-theme.sh` (kcadm, never deletes the volume). The portal passes
`ui_locales` on sign-in (`AuthProvider.signIn`). See `infrastructure/keycloak/themes/README.md`.
Verified: EN + AR login forms render the theme (assets 200), teal primary button, `dir="rtl"` + Arabic
labels under `ui_locales=ar`.

## Patient conversion layer (done)

Additive layer turning an acknowledged preliminary estimate into a coordination-ready customer, without
rebuilding the commercial workflow. Terminology is now precise: OTP possession is **contact-verified
secure access**, never legal identity (see [end-to-end-workflows.md](end-to-end-workflows.md#distinct-identity--conversion-concepts)).

- **Verification split (correctness fix).** `JourneyService.activateAccount` now links `external_subject`
  only — it no longer sets `phone_verified_at`. A verified OTP stamps only the channel used
  (`WHATSAPP`→`phone_verified_at`, `EMAIL`→`email_verified_at`), preserving existing timestamps.
- **Contact-channel choice.** `requestProposalAccess`/`requestAccess` accept an optional `channel`
  (default WhatsApp; backward compatible). Destination always from the profile; masked in responses;
  switching/resending revokes the prior challenge.
- **Onboarding sub-workflow** — `patient_onboardings` (`OnboardingService`), created idempotently on
  `ACKNOWLEDGED`; subject selection (reuses `patient_representatives`; payer gets no clinical access);
  onboarding consents reuse `consent_records` (procedure-specific consent not duplicated); resumable.
- **Legal identity verification** — `patient_identity_verifications` (`IdentityVerificationService` +
  `IdentityVerificationPort`, `LocalSimulatorIdentityVerificationPort`); encrypted legal name/DOB, masked
  doc ref, no biometrics; new `PATIENT_IDENTITY_REVIEWER` role (local + Oracle realms) with recent-auth,
  reason, audit.
- **Deposit waiver** — `PaymentService.waiveDeposit` (Finance/System-Admin, recent-auth, reason, audit;
  additive `deposits.waived_*` columns preserve the append-only ledger).
- **Customer readiness** — `CustomerReadinessService` → `CustomerReadiness` DTO; enforced at the
  non-cancellable commitment (`upsertTravel` `CONFIRMED`); legacy cases keep the deposit-only gate;
  `LEGACY_EXEMPT` for progressed pre-feature cases. Frontend: `PatientOnboarding.tsx`,
  `CustomerReadinessCard.tsx`, and the `ProposalSign.tsx` channel picker.

## Remaining work (backlog)

1. Optional: extract focused components out of `Portal.tsx` (do **not** rewrite the whole portal);
   add a frontend test matrix (Playwright/Vitest) for the preliminary/final patient views, the gate
   checklist, and bilingual/RTL critical content.
3. Decisions still owed to Egyptian legal/tax/PSP advisers (see references in the task brief): exact
   deposit refundability, PSP choice (currently **offline record-only**), VAT invoice separation,
   procedure-specific consent wording (a reviewed default is in place).

## Preserve (do not rebuild or weaken)

The authoritative macro case-state machine and its recovery/terminal paths; secure link + OTP +
short-lived grant; hashed secrets/attempt limits/expiry/revocation/audit; Keycloak-hosted OIDC
(Authorization Code + PKCE — never build a Next.js username/password form); real seeded profiles and
role assignments; consultant-owned pricing and the coordinator's inability to edit medical scope or
margin; released documents immutable. Do **not** add commercial sub-statuses to `medical_cases.status`.
