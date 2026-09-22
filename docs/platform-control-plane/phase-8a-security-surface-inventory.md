# Phase 8A security surface inventory

Date: 2026-09-23. Scope: externally reachable backend surfaces at the accepted Phase 7C baseline. Frontend visibility is not treated as authorization.

## Classification

| Surface | Route families | Classification | Authoritative security boundary |
|---|---|---|---|
| Anonymous intake | `POST /api/v1/cases`, draft documents, `POST /api/v1/cases/{caseId}/submit` | PUBLIC BY DESIGN | Bot verification at creation; V50 opaque, hashed, expiring, case-bound intake grant for every later draft upload/confirm/submit; grant consumed on submit; row lock serializes racing submits. |
| Public case status and information response | `/api/v1/public/cases/**` | PUBLIC BY DESIGN | High-entropy link plus OTP challenge, bounded attempts/send rate, short-lived purpose-bound grant, exact case/patient/PatientAction checks. Recovery response is non-enumerating. |
| Public proposal | `/api/v1/public/proposals/**` | PUBLIC BY DESIGN | Share token plus OTP grant, exact case/version/action binding, expiry/revocation and proposal state checks. |
| Public onboarding | `/api/v1/public/onboarding/**` | PUBLIC BY DESIGN | Purpose-bound onboarding grant, canonical patient/case binding, account/profile state checks and idempotent activation. |
| WhatsApp callback | `/api/v1/public/webhooks/whatsapp/meta` | CALLBACK/WEBHOOK | Constant-time verification-token comparison; HMAC-SHA256 over exact raw body; duplicate event uniqueness; monotonic provider timestamp update; unsupported statuses ignored; malformed signed JSON returns structured 400. Secrets are configuration-only. |
| Local object transfer | `/api/v1/local-uploads/**`, `/api/v1/local-downloads/**` | PUBLIC BY DESIGN, development/mock storage only | Random expiring upload/download bearer; upload token single-use; expected size/type enforced; only CLEAN objects can be downloaded; no raw object key is exposed. |
| Patient portal and PatientAction execution | `/api/v1/patient/**` | AUTHENTICATED PATIENT | JWT subject plus canonical patient/case relationship; action type, case, active projection and workflow state checked. Admin/simulation grants do not authorize patient execution. |
| Staff clinical/commercial journeys | `/api/v1/coordinator/**`, `/doctor/**`, `/operations/**`, `/finance/**`, `/identity-review/**` | AUTHENTICATED STAFF | Coarse authenticated route role plus service-level case assignment/ownership/relationship, state, optimistic version and recent-auth checks. Journey WorkItem completion additionally requires Access Governance capability and workflow authority. |
| Generic tasks/work/notifications | `/api/v1/tasks/**`, `/work/**`, `/notifications/**` | AUTHENTICATED STAFF or PATIENT as resolved | Server resolves owner subject, case, task status/version and allowed command; supplied case/task pairs cannot substitute ownership. |
| Legacy administration | `/api/v1/admin/staff`, `/coordinators`, `/practitioners`, service templates, catalogs, FX, reporting/staff teams | PLATFORM ADMIN | Authenticated legacy admin envelope plus application-service role, resource, self-review, recent-auth and immutable-state rules. |
| Access Governance | `/api/v1/admin/access/**` | PLATFORM ADMIN | Database-authoritative PLATFORM resource, active membership, pinned published role version, capability envelope, separation of duties, recent-auth and optimistic revision. No legacy-admin fallback after denial. |
| Provider organization management | `/api/v1/admin/providers/**` | ORGANIZATION-SCOPED (provider creation is exceptional PLATFORM operation) | Provider organization and membership are database-resolved; exact organization grant, relationship and target clinician membership are required. Deactivation/revocation is effective immediately. |
| Credential evidence and decisions | provider clinician/evidence/review routes | ORGANIZATION-SCOPED | Exact organization/evidence/revision association, owner or verifier scope, sealed CLEAN evidence, short-lived authorized URL, independent verifier, no self/submitter review, recent-auth and idempotency key. |
| Pricing and availability | provider clinician price/availability routes | ORGANIZATION-SCOPED | Exact organization/practitioner/resource resolver, managed-clinician scope where applicable, immutable publication states and optimistic revision. |
| Coordination and assignment engine | `/api/v1/admin/coordination/**` | ORGANIZATION-SCOPED | Exact organization/case/consultant/team binding, capability, eligibility, reason, revision and idempotency key; cross-organization identifiers fail closed. Case owner remains distinct from routed WorkItem owner. |
| Journey definition/designer | `/api/v1/admin/journeys/**` | PLATFORM ADMIN | Separate view/edit/validate/simulate/publish/retire capabilities, published immutability, maker/checker, recent-auth, revision and registered-action validation. |
| Journey runtime commands | Journey WorkItem and PatientAction command routes | AUTHENTICATED STAFF / AUTHENTICATED PATIENT | Exact version-bound case projection and available action plus actor/resource Access Governance. Both dimensions must allow. |
| Cutover status | `GET /api/v1/admin/journey-cutover/**` | PLATFORM ADMIN | `journey.view` with PLATFORM resource only; read-only. No write/enable route exists. Production-intake flags remain off by default. |
| Documents | case list and `/api/v1/documents/{documentId}/{view|download}` | AUTHENTICATED STAFF / AUTHENTICATED PATIENT | Authorization occurs before URL issuance using the document's stored case; guessed ID/cross-case access denied; only CLEAN content; random storage keys and short expiry; download/view audited. |
| Health/OpenAPI | health and configured API documentation routes | PUBLIC BY DESIGN | No patient/business data; health details disabled. OpenAPI exposure remains deployment-configurable. |

## Phase 8A threat checks

- Object-level authorization: existing suites cover wrong case/patient/action, wrong organization, wrong scope/relationship, foreign evidence/revision, wrong Journey parent/version, guessed WorkItem/PatientAction, stale commands and inactive memberships. Direct services resolve resource context from storage rather than trusting tenant/owner fields from the browser.
- Access escalation: published role versions are immutable; draft editor/creator cannot publish; assignments require a published version and capability-envelope checks; unsupported/PLATFORM scopes are rejected; conflicts and future/expired assignments deny; governance denial never falls back to a realm role.
- Recent authentication: `auth_time` is mandatory for sensitive legacy and Access Governance operations. `iat` is not a substitute, future values beyond clock tolerance deny, and refresh therefore cannot manufacture recent authentication.
- JWT boundary: resource-server validation enforces signature, issuer, expiry/not-before and the expected Keycloak client (`aud` or `azp`). Business authorization is resolved from RehletShifaa state; realm roles remain only coarse route/legacy compatibility data.
- Replay: OTP challenges are attempt-limited and consumed; purpose-bound grants expire; domain state and action projections make mutation replay idempotent or stale; assignment and credential commands retain their existing idempotency/revision controls; WhatsApp duplicate delivery is deduplicated.
- Error/input boundary: malformed UUID/query identifiers and framework binding/validation failures return deterministic structured 4xx responses. Stack traces and internal exception text are not returned. Upload size/type, metadata, quota and malware inspection remain server-enforced.
- Audit/sensitive data: sensitive document access, authorization denial, governance mutation, credential decision, assignment/reassignment, Journey publication/runtime and cutover/shadow events retain actor/resource/outcome evidence. Secrets, raw object keys, OTPs and authorization internals are not returned in DTOs or audit payloads.

## Corrections made in Phase 8A

1. Central malformed-identifier handling: application-wide UUID/query conversion failures now return `400 INVALID_IDENTIFIER` using the existing `ApiError` contract.
2. Framework input handling: missing headers/parameters, method validation, unsupported media/method, oversized bodies and missing routes receive structured 4xx responses rather than reaching the generic 500 handler.
3. Recent-auth hardening: removed the `iat` fallback and reject absent, stale or implausibly future `auth_time`.
4. Token trust: added expected Keycloak client validation in addition to standard issuer/signature/time validation.
5. Public intake IDOR closure: V50 stores only a hash of a random short-lived intake grant. Draft documents and submission require the exact case-bound grant, and successful submit consumes it.
6. Webhook input: a correctly signed but malformed Meta payload returns a bounded structured 400 without parser details.

Journey production intake remains disabled; no cutover setting or Journey catalog/business behavior changed.
