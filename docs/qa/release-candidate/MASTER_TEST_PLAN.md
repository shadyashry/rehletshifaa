# Master Test Plan

## Scope

Functional verification from public conversion through intake, staff coordination, clinical recommendation, proposal, patient acknowledgement, profile/account activation, My Care and manual/offline deposit settlement. Product fixes are excluded.

## Architecture and environment

Execution used the named development tunnel: browser → Cloudflare → API gateway → Spring backend → PostgreSQL/Redis/MinIO/ClamAV, Keycloak for OIDC, and Mailpit for synthetic delivery evidence. The live stack was healthy. No quick tunnel, real PII, production action or volume deletion was used.

## Personas

Anonymous, new patient, active patient, SETUP_PENDING patient, multiple-case patient (domain), representative, Coordinator/lead, Consultant, Operations, Finance, wrong role and expired/invalid-access users.

## Strategy

- Backend integration/domain suite for state permutations, authorization, identity, money, idempotency and invalid transitions.
- Vitest for component contracts and validation.
- Chromium Playwright regression for public/staff/patient UI, responsive, RTL and keyboard behaviour.
- Live Chromium journeys through gateway, Keycloak, persistence and Mailpit.
- Manual/exploratory catalog for destructive-risk-free boundary and assistive-technology checks.

## Entry criteria

Healthy tunnel stack; seeded QA staff; synthetic unique identities; no production endpoints.

## Exit criteria

All P0/P1 cases executed; Firefox/WebKit runtime available; blocked cases cleared; no blocker/critical/high product defects; evidence and traceability reviewed. These criteria are **not yet met** because Firefox/WebKit are unavailable and the remaining manual catalog has not been executed.

## Risks and exclusions

No PSP exists: only offline deposit ledger behaviour is in scope. Destructive production operations, real patient data, malicious payloads, real payments and volume deletion are excluded. Screen-reader vendor certification and real mobile devices remain external UAT activities.

## Browser/device matrix

Chromium: executed at 320/375/390/768/1024/1280/1440/1600 where covered. Firefox/WebKit: blocked before launch (missing executables). Responsive target matrix: 390/768/1024/1280/1440.

## Test layers

Backend integration, frontend unit/component, gateway policy, deterministic browser E2E, live end-to-end and manual exploratory.
