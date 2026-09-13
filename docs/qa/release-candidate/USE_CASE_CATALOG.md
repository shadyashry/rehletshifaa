# Use Case Catalog

Release-candidate functional use cases. Related test IDs are exhaustive in `TEST_CASE_CATALOG.csv`.

## UC-PUB-001 — Use the public conversion site

- Primary actor: Anonymous visitor
- Secondary actor(s): Patient
- Preconditions: Public site available
- Trigger: Visitor opens a public route
- Main success flow: Open Home; use Care Areas, How It Works and Consultants; switch language; start or track a case
- Alternate flows: Open deep links; use browser back/forward; open footer/legal links
- Exception flows: Unknown locale/path; network failure; inaccessible navigation
- Business rules: Only one primary conversion action; public content reveals no case data
- Security rules: No authentication required; secure routes disclose metadata only
- Data requirements: EN/AR; desktop/mobile
- Postconditions: None for browsing
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /en, /ar, /care-areas, /how-it-works, /consultants, /send-my-case, /track-case
- Related UI: /en, /ar, /care-areas, /how-it-works, /consultants, /send-my-case, /track-case
- Related test cases: TC-PUB-001, TC-PUB-002, TC-PUB-003, TC-PUB-004, TC-PUB-005, TC-PUB-006, TC-PUB-007, TC-PUB-008, TC-PUB-009, TC-PUB-010, TC-PUB-011, TC-PUB-012, TC-PUB-013, TC-PUB-014, TC-PUB-015, TC-PUB-016, TC-PUB-017, TC-PUB-018

## UC-CASE-001 — Create and submit a care request

- Primary actor: Anonymous patient
- Secondary actor(s): Coordinator team
- Preconditions: Synthetic patient; consent available
- Trigger: Patient selects Start my case
- Main success flow: Complete identity/contact/need/documents; review; submit; receive case reference and secure status link
- Alternate flows: Email omitted; representative submits; retry same draft
- Exception flows: Validation, upload, timeout, rate-limit or duplicate submit failure
- Business rules: Email optional at intake; phone normalized; one case per successful submission
- Security rules: Bot protection, server validation, idempotent submit, no PII in team email
- Data requirements: Unique synthetic identity and benign files
- Postconditions: Case submitted; coordination work created
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: POST /cases; POST /cases/{id}/submit
- Related UI: POST /cases; POST /cases/{id}/submit
- Related test cases: TC-CASE-001, TC-CASE-002, TC-CASE-003, TC-CASE-004, TC-CASE-005, TC-CASE-006, TC-CASE-007, TC-CASE-008, TC-CASE-009, TC-CASE-010, TC-CASE-011, TC-CASE-012, TC-CASE-013, TC-CASE-014, TC-CASE-015, TC-CASE-016, TC-CASE-017, TC-CASE-018, TC-CASE-019, TC-CASE-020, TC-CASE-021, TC-CASE-022, TC-CASE-023, TC-CASE-024, TC-CASE-025, TC-CASE-026, TC-CASE-027, TC-CASE-028, TC-CASE-029, TC-CASE-030, TC-CASE-031, TC-CASE-032, TC-CASE-033, TC-CASE-034

## UC-DOC-001 — Upload and retrieve medical documents

- Primary actor: Patient or authorized staff
- Secondary actor(s): ClamAV, MinIO
- Preconditions: Authorized case access or valid status grant
- Trigger: Actor selects a supported file
- Main success flow: Presign; upload exact bytes; confirm; scan; list; view/download authorized copy
- Alternate flows: Multiple/duplicate/unicode files; retry upload; expired signed URL
- Exception flows: Unsupported, corrupt, oversized, zero-byte, MIME mismatch, malware or unauthorized ID
- Business rules: Only supported benign content becomes AVAILABLE; no ghost document
- Security rules: Case-scoped authorization; opaque IDs; short-lived signed URLs
- Data requirements: PDF/JPEG/PNG boundary fixtures
- Postconditions: Document metadata and bytes persist securely
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: POST documents/presign; PUT signed URL; POST confirm; GET view/download
- Related UI: POST documents/presign; PUT signed URL; POST confirm; GET view/download
- Related test cases: TC-DOC-001, TC-DOC-002, TC-DOC-003, TC-DOC-004, TC-DOC-005, TC-DOC-006, TC-DOC-007, TC-DOC-008, TC-DOC-009, TC-DOC-010, TC-DOC-011, TC-DOC-012, TC-DOC-013, TC-DOC-014, TC-DOC-015, TC-DOC-016, TC-DOC-017, TC-DOC-018, TC-DOC-019, TC-DOC-020, TC-DOC-021, TC-DOC-022, TC-DOC-023, TC-DOC-024, TC-DOC-025, TC-DOC-026

## UC-COORD-001 — Own and coordinate a new case

- Primary actor: Coordinator
- Secondary actor(s): Coordinator lead, consultant
- Preconditions: Submitted unowned case
- Trigger: Coordinator opens Team queue
- Main success flow: Review intake; claim; classify; assign eligible consultant; monitor current action
- Alternate flows: Lead rebalances; request information; another coordinator wins race
- Exception flows: Unauthorized role, stale version, invalid consultant or duplicate claim
- Business rules: Exactly one accountable owner and one active assignment
- Security rules: Backend role and team scope re-authorize every action
- Data requirements: Submitted synthetic case
- Postconditions: Case waiting on consultant; correct work item and notifications
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /coordinator/cases; /claim; /assignments; /tasks; /messages
- Related UI: /coordinator/cases; /claim; /assignments; /tasks; /messages
- Related test cases: TC-COORD-001, TC-COORD-002, TC-COORD-003, TC-COORD-004, TC-COORD-005, TC-COORD-006, TC-COORD-007, TC-COORD-008, TC-COORD-009, TC-COORD-010, TC-COORD-011, TC-COORD-012, TC-COORD-013, TC-COORD-014, TC-COORD-015, TC-COORD-016, TC-COORD-017, TC-COORD-018, TC-COORD-019, TC-COORD-020, TC-COORD-021, TC-COORD-022, TC-COORD-023, TC-COORD-024, TC-COORD-025, TC-COORD-026, TC-COORD-027, TC-COORD-028

## UC-CONS-001 — Review a consultant assignment

- Primary actor: Consultant
- Secondary actor(s): Coordinator, patient
- Preconditions: Pending matching assignment
- Trigger: Consultant opens My Work
- Main success flow: Open documents; accept; save draft; select catalog services/currency; submit recommendation
- Alternate flows: Decline with reason; request information; second opinion; return; not suitable
- Exception flows: Missing recommendation/reason; stale assignment; foreign catalog; duplicate submit
- Business rules: Acceptance creates clinical work; submit returns responsibility once
- Security rules: Only assigned active consultant can read/act
- Data requirements: Catalog, FX snapshot and synthetic case
- Postconditions: Approved review persists; coordinator becomes actionable
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /doctor/cases; /assignments; /review-draft; /review-decision
- Related UI: /doctor/cases; /assignments; /review-draft; /review-decision
- Related test cases: TC-CONS-001, TC-CONS-002, TC-CONS-003, TC-CONS-004, TC-CONS-005, TC-CONS-006, TC-CONS-007, TC-CONS-008, TC-CONS-009, TC-CONS-010, TC-CONS-011, TC-CONS-012, TC-CONS-013, TC-CONS-014, TC-CONS-015, TC-CONS-016, TC-CONS-017, TC-CONS-018, TC-CONS-019, TC-CONS-020, TC-CONS-021, TC-CONS-022, TC-CONS-023, TC-CONS-024, TC-CONS-025, TC-CONS-026, TC-CONS-027, TC-CONS-028, TC-CONS-029, TC-CONS-030, TC-CONS-031, TC-CONS-032, TC-CONS-033

## UC-MONEY-001 — Preserve proposal money and currency

- Primary actor: Consultant
- Secondary actor(s): Coordinator, Finance, patient
- Preconditions: Active catalog and supported FX rate
- Trigger: Consultant chooses display currency
- Main success flow: Preserve EGP base; snapshot FX; round display values; freeze issued version; show identical values downstream
- Alternate flows: AED/EUR/USD; Finance-gated off-list item; later FX change
- Exception flows: Unsupported/missing rate; negative/zero values; mixed currency
- Business rules: No silent EGP fallback; released version never reprices
- Security rules: Server computes prices; internal margin never exposed
- Data requirements: Catalog IDs, expected amounts, rate timestamp/source
- Postconditions: Immutable issued totals and currency
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /doctor/catalog; /fx; /proposals
- Related UI: /doctor/catalog; /fx; /proposals
- Related test cases: TC-MONEY-001, TC-MONEY-002, TC-MONEY-003, TC-MONEY-004, TC-MONEY-005, TC-MONEY-006, TC-MONEY-007, TC-MONEY-008, TC-MONEY-009, TC-MONEY-010, TC-MONEY-011, TC-MONEY-012, TC-MONEY-013, TC-MONEY-014, TC-MONEY-015, TC-MONEY-016, TC-MONEY-017, TC-MONEY-018

## UC-PROP-001 — Prepare, release and decide a proposal

- Primary actor: Coordinator
- Secondary actor(s): Consultant, Operations, Finance, patient
- Preconditions: Approved clinical recommendation
- Trigger: Coordinator prepares proposal
- Main success flow: Create draft; satisfy gates; release; patient verifies OTP; views exact version; acknowledges
- Alternate flows: Request changes; decline; resend; superseding version; travel/finance gates
- Exception flows: Premature release; stale/expired version; invalid grant; repeat decision
- Business rules: Preliminary acceptance is ACKNOWLEDGED; decision binds exact version
- Security rules: Purpose-scoped token/grant; no browser-return authority
- Data requirements: Proposal scope, validity, language, money
- Postconditions: Case moves to accepted/readiness; deposit requested
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /coordinator/.../proposals; /public/proposals
- Related UI: /coordinator/.../proposals; /public/proposals
- Related test cases: TC-PROP-001, TC-PROP-002, TC-PROP-003, TC-PROP-004, TC-PROP-005, TC-PROP-006, TC-PROP-007, TC-PROP-008, TC-PROP-009, TC-PROP-010, TC-PROP-011, TC-PROP-012, TC-PROP-013, TC-PROP-014, TC-PROP-015, TC-PROP-016, TC-PROP-017, TC-PROP-018, TC-PROP-019, TC-PROP-020, TC-PROP-021, TC-PROP-022, TC-PROP-023, TC-PROP-024, TC-PROP-025, TC-PROP-026, TC-PROP-027, TC-PROP-028, TC-PROP-029, TC-PROP-030, TC-PROP-031, TC-PROP-032, TC-PROP-033

## UC-ACT-001 — Complete profile and activate account

- Primary actor: New patient
- Secondary actor(s): Keycloak, coordinator
- Preconditions: Acknowledged proposal and onboarding link
- Trigger: Patient opens activation link
- Main success flow: Choose channel; verify OTP; complete structured profile/consents; provision account; receive setup email
- Alternate flows: No initial email; change email; single legal name; representative phone; resume SETUP_PENDING
- Exception flows: Expired/replayed link; duplicate email/phone conflict; invalid DOB; missing consent
- Business rules: Never link identities by email alone; Keycloak owns password
- Security rules: OTP proves contact only; setup link is time-limited; no password in application
- Data requirements: Structured names, DOB, nationality, residence, contacts
- Postconditions: Profile ACTIVE; account SETUP_PENDING or ACTIVE
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /public/onboarding; Keycloak execute-actions
- Related UI: /public/onboarding; Keycloak execute-actions
- Related test cases: TC-ACT-001, TC-ACT-002, TC-ACT-003, TC-ACT-004, TC-ACT-005, TC-ACT-006, TC-ACT-007, TC-ACT-008, TC-ACT-009, TC-ACT-010, TC-ACT-011, TC-ACT-012, TC-ACT-013, TC-ACT-014, TC-ACT-015, TC-ACT-016, TC-ACT-017, TC-ACT-018, TC-ACT-019, TC-ACT-020, TC-ACT-021, TC-ACT-022, TC-ACT-023, TC-ACT-024, TC-ACT-025, TC-ACT-026, TC-ACT-027, TC-ACT-028, TC-ACT-029, TC-ACT-030, TC-ACT-031, TC-ACT-032, TC-ACT-033, TC-ACT-034, TC-ACT-035, TC-ACT-036, TC-ACT-037, TC-ACT-038, TC-ACT-039, TC-ACT-040, TC-ACT-041

## UC-AUTH-001 — Secure the account and session

- Primary actor: Patient or staff
- Secondary actor(s): Keycloak
- Preconditions: Account exists
- Trigger: Actor signs in through Keycloak
- Main success flow: OIDC code+PKCE; correct role landing; refresh; logout; protected-route rejection
- Alternate flows: Session refresh; browser restart; multiple cases
- Exception flows: Wrong password; expired token/session; back after logout
- Business rules: No local password form; generic login error
- Security rules: 401 unauthenticated; 403 wrong role; cached data unusable after logout
- Data requirements: Seeded staff or synthetic patient
- Postconditions: Authenticated portal session or clean logout
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: OIDC endpoints; /account/session
- Related UI: OIDC endpoints; /account/session
- Related test cases: TC-AUTH-001, TC-AUTH-002, TC-AUTH-003, TC-AUTH-004, TC-AUTH-005, TC-AUTH-006, TC-AUTH-007, TC-AUTH-008, TC-AUTH-009, TC-AUTH-010, TC-AUTH-011, TC-AUTH-012, TC-AUTH-013, TC-AUTH-014, TC-AUTH-015, TC-AUTH-016, TC-AUTH-017, TC-AUTH-018, TC-AUTH-019

## UC-PAT-001 — Use My Care

- Primary actor: Active patient
- Secondary actor(s): Coordinator
- Preconditions: Linked active account
- Trigger: Patient opens portal
- Main success flow: Land on current case; view proposal/documents/messages/profile; see current action and coordinator
- Alternate flows: Multiple cases; no-case account; Arabic; mobile
- Exception flows: Cross-case ID; stale state; failed message/download
- Business rules: One authoritative current action; clinical and account areas separated
- Security rules: Patient can access only linked cases
- Data requirements: One or more linked synthetic cases
- Postconditions: Read state/message and navigation persist
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /patient/cases; /patient/account; /documents; /messages
- Related UI: /patient/cases; /patient/account; /documents; /messages
- Related test cases: TC-PAT-001, TC-PAT-002, TC-PAT-003, TC-PAT-004, TC-PAT-005, TC-PAT-006, TC-PAT-007, TC-PAT-008, TC-PAT-009, TC-PAT-010, TC-PAT-011, TC-PAT-012, TC-PAT-013, TC-PAT-014, TC-PAT-015, TC-PAT-016, TC-PAT-017, TC-PAT-018, TC-PAT-019, TC-PAT-020, TC-PAT-021, TC-PAT-022

## UC-DEP-001 — Arrange and settle a manual deposit

- Primary actor: Finance
- Secondary actor(s): Patient, Coordinator, Operations
- Preconditions: Acknowledged proposal and configured policy
- Trigger: Deposit work is created
- Main success flow: Patient sees amount/status with no Pay CTA; Finance records offline receipt or waiver; workflow reevaluates
- Alternate flows: Partial/multiple payment; refund; waiver; replay same receipt
- Exception flows: Wrong actor; over/negative amount; stale/duplicate confirmation; before prerequisites
- Business rules: Offline ledger is append-only and idempotent; no PSP UI
- Security rules: Recent-auth for waiver; Finance-only mutation
- Data requirements: EGP base and proposal display currency
- Postconditions: Deposit settled/waived once; readiness transition once
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /finance/.../payments|refunds|waiver; /patient/.../deposit
- Related UI: /finance/.../payments|refunds|waiver; /patient/.../deposit
- Related test cases: TC-DEP-001, TC-DEP-002, TC-DEP-003, TC-DEP-004, TC-DEP-005, TC-DEP-006, TC-DEP-007, TC-DEP-008, TC-DEP-009, TC-DEP-010, TC-DEP-011, TC-DEP-012, TC-DEP-013, TC-DEP-014, TC-DEP-015, TC-DEP-016, TC-DEP-017, TC-DEP-018, TC-DEP-019, TC-DEP-020, TC-DEP-021, TC-DEP-022, TC-DEP-023, TC-DEP-024, TC-DEP-025

## UC-NOTIF-001 — Deliver workflow notifications

- Primary actor: System
- Secondary actor(s): Patient and staff
- Preconditions: Business event committed
- Trigger: Outbox worker processes event
- Main success flow: Deliver correct template to accountable recipient; create one in-app notification; mark read
- Alternate flows: Retry transient delivery; team mailbox fallback for unowned work
- Exception flows: Missing staff email; provider failure; duplicate event
- Business rules: One logical message per idempotency key; no patient facts in team email
- Security rules: Recipient authorization and masked delivery status
- Data requirements: Synthetic addresses; Mailpit
- Postconditions: Delivery/audit status recorded
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: /notifications; Mailpit; outbox
- Related UI: /notifications; Mailpit; outbox
- Related test cases: TC-NOTIF-001, TC-NOTIF-002, TC-NOTIF-003, TC-NOTIF-004, TC-NOTIF-005, TC-NOTIF-006, TC-NOTIF-007, TC-NOTIF-008, TC-NOTIF-009, TC-NOTIF-010, TC-NOTIF-011, TC-NOTIF-012, TC-NOTIF-013, TC-NOTIF-014, TC-NOTIF-015, TC-NOTIF-016, TC-NOTIF-017, TC-NOTIF-018, TC-NOTIF-019, TC-NOTIF-020

## UC-RBAC-001 — Enforce role and object authorization

- Primary actor: All personas
- Secondary actor(s): Gateway, backend
- Preconditions: Known identities and two unrelated cases
- Trigger: Actor calls UI/API action
- Main success flow: Allow only role-, team-, assignment- and case-scoped operation
- Alternate flows: Lead visibility without protected action; ended assignment loses access
- Exception flows: Anonymous, wrong role, foreign patient/case/document, ID tampering
- Business rules: UI hiding is not authorization; backend rejects independently
- Security rules: 401/403 with no resource leakage
- Data requirements: Two synthetic patients and all staff roles
- Postconditions: No unauthorized read/write
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: All protected APIs
- Related UI: All protected APIs
- Related test cases: TC-RBAC-001, TC-RBAC-002, TC-RBAC-003, TC-RBAC-004, TC-RBAC-005, TC-RBAC-006, TC-RBAC-007, TC-RBAC-008, TC-RBAC-009, TC-RBAC-010, TC-RBAC-011, TC-RBAC-012, TC-RBAC-013, TC-RBAC-014, TC-RBAC-015, TC-RBAC-016, TC-RBAC-017, TC-RBAC-018, TC-RBAC-019, TC-RBAC-020, TC-RBAC-021, TC-RBAC-022, TC-RBAC-023, TC-RBAC-024

## UC-ERR-001 — Recover safely from errors and retries

- Primary actor: All personas
- Secondary actor(s): Gateway and dependencies
- Preconditions: Action available
- Trigger: Inject safe failure
- Main success flow: Show human message; retain draft; retry only safely; preserve business state
- Alternate flows: Offline/timeout/reload/two tabs; Redis unavailable
- Exception flows: 400/401/403/404/409/429/500
- Business rules: No raw stack traces; no duplicate side effects
- Security rules: Request correlation and throttling enforced
- Data requirements: Synthetic requests and controlled mocks
- Postconditions: Consistent prior or completed state
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: Gateway and affected endpoint
- Related UI: Gateway and affected endpoint
- Related test cases: TC-ERR-001, TC-ERR-002, TC-ERR-003, TC-ERR-004, TC-ERR-005, TC-ERR-006, TC-ERR-007, TC-ERR-008, TC-ERR-009, TC-ERR-010, TC-ERR-011, TC-ERR-012, TC-ERR-013, TC-ERR-014, TC-ERR-015, TC-ERR-016, TC-ERR-017, TC-ERR-018, TC-ERR-019, TC-ERR-020, TC-ERR-021, TC-ERR-022, TC-ERR-023

## UC-UX-001 — Operate responsively, accessibly and in RTL

- Primary actor: All personas
- Secondary actor(s): Browser
- Preconditions: Route available
- Trigger: Actor uses alternate viewport/input/locale
- Main success flow: Use every reachable control at 390/768/1024/1280/1440, keyboard, 200% zoom and Arabic
- Alternate flows: Mobile menu, modal/drawer, tables, long content
- Exception flows: Hidden/clipped control; lost focus; unlabeled error; color-only status
- Business rules: WCAG 2.2 AA target; equivalent EN/AR outcomes
- Security rules: No accessibility bypass of security controls
- Data requirements: EN/AR and representative data
- Postconditions: Task completes without inaccessible control
- Notifications/events: Business events and notifications are verified when the flow changes accountability or patient state.
- Related APIs: All scoped UI routes
- Related UI: All scoped UI routes
- Related test cases: TC-UX-001, TC-UX-002, TC-UX-003, TC-UX-004, TC-UX-005, TC-UX-006, TC-UX-007, TC-UX-008, TC-UX-009, TC-UX-010, TC-UX-011, TC-UX-012, TC-UX-013, TC-UX-014, TC-UX-015, TC-UX-016, TC-UX-017, TC-UX-018, TC-UX-019, TC-UX-020, TC-UX-021, TC-UX-022, TC-UX-023, TC-UX-024, TC-UX-025, TC-UX-026, TC-UX-027, TC-XBR-001, TC-XBR-002

