# Production readiness (run 2026-10-29)

Verdict scale per gate: **MET** (fresh evidence), **PARTIAL** (code/config ready, external or human step missing),
**NOT MET**, **NOT VERIFIED**. A code test cannot close a legal, owner, provider or hosting gate.

## Priority 0 launch blockers (`docs/remaining-work-prioritized.md`, checked against the code on 2026-10-29)

| # | Blocker | Fresh evidence | Gate | Who closes it | Evidence required to close |
|---|---|---|---|---|---|
| 0.1 | Approved Arabic deposit/refund/cancellation terms; legal L1–L5 | `frontend/src/lib/commercial-terms.ts:24` `ARABIC_TERMS_APPROVED = false`; Arabic proposals use the assisted path (`PatientProposal.tsx:244`, `ProposalSign.tsx:150`) | NOT MET | Counsel | Signed-off EN/AR text; flip the flag and bump `DEPOSIT_TERMS_VERSION` together |
| 0.2 | Native Arabic review of portal/proposal/public copy | No review record in the repo | NOT MET | Native reviewer | Review pack sign-off |
| 0.3 | Counsel items: guarantee wording + VAT on fee, guardian consent, voucher email, retention terms | Placeholder/assisted copy in code | NOT MET | Counsel | Written opinions, copy updates |
| 0.4 | Real bank-transfer details | `ProductionSafetyValidator` refuses the dummy `PAYMENT_BANK_*` values at production start (code-enforced); real values not provided | PARTIAL | Owner | Real values in the production secret store; validator passes |
| 0.5 | `PII_INDEX_KEY` in every environment before V86 | `deploy/oracle/docker-compose.yml:204` requires it (`:?`); validator refuses dev/short keys | PARTIAL | Ops | Key generated in the production secret store (not verifiable here) |
| 0.6 | WhatsApp templates approved by Meta | Template keys configured in `application.yml` (`app.whatsapp.meta`); dev runs the simulator | NOT MET | Owner (Meta Business) | Approved template IDs per key |
| 0.7 | Every admitting facility has `contact_email` | Dev DB: 0 facilities (tester reset), so nothing to check here | NOT VERIFIED | Ops data entry | Query on production data: `count(*) = count(contact_email)` for admitting facilities |
| 0.8 | Backups: PITR + bucket versioning/replication, nightly realm export, production restore drill | `docs/deployment.md` RTO 4 h / RPO 15 min defined; fresh local drill 2026-10-29 PASS (94 s, V109) | PARTIAL | Ops (host choice) | Managed-host PITR restore timed and recorded |
| 0.9 | Journey-bound cases: proposal decision completes `REVIEW_PROPOSAL` (D1) | `journey.runtime.enabled=false`, `production-intake-enabled=false` by default; Journey admission stays off | NOT MET (decision) | Owner | D1 decision, then implementation + live run |
| 0.10 | PDPL licence application; liability-fund subscription | Outside the code | NOT MET | Owner | Application reference, subscription |
| 0.11 | Confirm the P1-15 money rule (deposit covers the platform fee first) | Implemented as recommended; unconfirmed | PARTIAL | Owner | Written confirmation |

## Security and configuration checks

| Check | Evidence | Result |
|---|---|---|
| Tokens carry no business authority | `DatabaseAuthenticationConverter` (no authorities); `ArchitectureRulesTest` | MET (code + test) |
| Deny by default at HTTP layer | `SecurityConfig` `anyRequest().denyAll()` | MET (code) |
| Staff MFA at sign-in, step-up for sensitive actions | `Authority.decide`, `SecondFactorGuard`; live: Keycloak asks seeded staff for an authenticator code | MET (code + live observation) |
| Gateway: real-client identity, budgets, correlation id, closed contract | `gateway.spec.ts` 8/8 against the running gateway | MET (live) |
| Upload pipeline: type, size, signature, malware | Live on `1b1307f5`: size/type refused; MIME-spoofed file refused (D-06 fixed); a refused file no longer blocks submission (D-08 fixed). ClamAV positive detection not shown live | PARTIAL |
| Secrets not in source | `.env` holds tunnel/observability secrets only; Keycloak bootstrap admin is a dev value in `docker-compose.yml` | MET for prod path (`deploy/oracle` requires env); dev values are dev-only |
| Rate limit sized for staff behind one NAT | Per-user write budgets at backend and gateway (D-11, `a262a138`); live journeys with all roles on one address pass at the default 30/min | MET (functional); capacity numbers still need the launch workload |
| Dependency / container scan | Frontend `pnpm audit --prod`: 3 critical fixed by Next 16.4.2 (D-07), 3 high remain (Playwright, source-map-js, zod). Backend: no offline scanner (OWASP dependency-check/Trivy absent, Maven offline); container images not scanned | PARTIAL (frontend) / NOT VERIFIED (backend, images) |
| Dev tunnel availability | 2 TLS connection resets in ~300 tunnel requests today; origin answered every request | Dev-only observation; production edge not chosen |
| External penetration test | Not performed | NOT MET |

## Recovery and availability

| Check | Evidence | Result |
|---|---|---|
| Restore drill to disposable resources | Local drill PASS, 94 s, V109 (below) | MET locally; production PITR NOT MET |
| Dependency outage drills (Redis, Keycloak, DB, MinIO/ClamAV, SMTP) | Not run this session on an isolated stack | NOT VERIFIED |
| Scheduler leadership | 22/25 jobs `@LeasedJob`, 3 row-leased processors (code review) | MET (code) |

## Restore drill (this run)

`scripts/backup-set.sh` (read-only against the dev stack) then `scripts/restore-drill.sh` into the disposable Compose
project `rehletshifaa-restore-drill` (own network, volumes, loopback ports; torn down afterwards), backend image built
from `1b1307f5`: **PASS, restore time 94 s** — 157 tables / 920 rows equal to the set, Flyway V109 with 0 failed,
realm with all 7 bound + 3 custom flows, 11 objects with equal checksums in a versioned private bucket, `/api/v1/me`
401 without a token and 200 with a token from the restored realm, and an overwritten-then-deleted object recovered
from its versions. Recorded in `docs/deployment.md`. This is local evidence only: a managed-host PITR restore and a
region failover are still required before real patient data (gate 0.8 stays PARTIAL).

## Unresolved owner decisions

- Launch workload (peak concurrent staff, cases/day, uploads/day) for the rate-limit and capacity envelope.
- Whether a case's documents and preview are visible to every coordination team while it waits (current fix D-04
  limits them to the serving team, per UC-03/UC-20).
- Live staff-journey identities for automated runs (see `report.md`).
