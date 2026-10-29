# Performance (run 2026-10-29)

## Workload, budgets and limits

- **Approved workload / SLOs:** none found in the repository (no launch traffic figures, latency budgets or capacity
  targets). Only recovery objectives exist (`docs/deployment.md`: RPO 15 min, RTO 4 h). The launch workload is an
  open owner question.
- **Provisional engineering targets (not approved):** public pages p95 < 1.5 s through Cloudflare; API reads p95 < 500 ms
  and writes p95 < 1 s at the gateway; zero unexpected 5xx/429 in ordinary single-user journeys.
- **Environment:** Windows 11 laptop, Docker Desktop, all services on one host, shared with UAT testers; Cloudflare named
  tunnel for `*.rehletshifaa.com`. Not production sizing.
- **Bounds:** no load beyond the gateway's own per-client budgets on the shared tunnel (public 30/min burst 15, reads
  300/min, writes 60/min); no spoofed client identities; no higher-load or soak runs (they need an isolated stack).

## Measurements

### Case submit latency (live, through gateway; `submit-timing.mjs`)

| Sample | Status | Latency |
|---|---|---|
| no email | 200 | 1035 ms |
| with email (Keycloak lookup on submit) | 200 | 2371 ms |
| no email | 200 | 761 ms |
| with email | 200 | 884 ms |

Final build (`1b1307f5`): submit 607 ms. An earlier live submit took 9.4 s (gateway `request_time_seconds` 9.014) while the backend test suite was using the
same CPU; it is not representative and is excluded. Submit runs routing (global routing lock), the Keycloak
existing-account lookup (`PatientAccountService.onCaseSubmitted`, synchronous) and outbox writes in one request.

### Single-user baseline (tunnel vs local) — images from `1b1307f5`, nothing else running

Sequential requests with think time (`raw/perf-baseline.mjs`, results `raw/perf-baseline-2026-10-29.json`). ms.

| Target | Local p50 / p95 | Through Cloudflare tunnel p50 / p95 | Codes |
|---|---|---|---|
| `/en` (home, request-rendered) | 64 / 97 | 529 / 1946 | 15× 200 |
| `/ar` | 47 / 68 | 470 / 1005 | 15× 200 |
| `/en/consultants` | 47 / 60 | 484 / 850 | 15× 200 |
| `/en/send-my-case` | 34 / 48 | 484 / 1164 | 15× 200 |
| `/en/track-case` | 15 / 24 | 416 / 994 | 15× 200 |
| `GET /api/v1/public/consultants` (gateway local / backend direct) | 19 / 32 (gateway), 14 / 34 (backend) | 454 / 1008 | 11× 200, **1 connection reset** |
| `/actuator/health` (backend direct) | 13 / 21 | 476 / 1052 | 15× 200 |

Attribution: the application answers in 15–100 ms; **the tunnel/CDN path adds ~400–500 ms at p50 and up to ~1.9 s at
p95** from this host. Two TLS connection resets through the tunnel were seen today (one in the live intake run, one
here) in roughly 300 tunnel requests: a dev-tunnel availability issue, not an application error (no 5xx anywhere).
Live journey latencies on the final build: create 458 ms, clean upload (presign + PUT + scan) 832 ms, submit 607 ms,
status view 518 ms, OTP mail delivered in 0.7–3.7 s, staff new-case mail 1.4–2.4 s (outbox poll + SMTP).

### Bounded concurrency ramp (cache ceiling, not workflow capacity)

`raw/ramp.mjs`: closed loop, 20 s per step, backend direct (no gateway budget), one cached public read; stop rule
p95 > 2 s or errors > 1 %. Results `raw/ramp-2026-10-29.json`.

| Concurrency | Requests | req/s | Errors | p50 / p95 / p99 ms |
|---|---|---|---|---|
| 1 | 4,672 | 234 | 0 | 4 / 7 / 9 |
| 4 | 20,636 | 1,032 | 0 | 4 / 6 / 9 |
| 8 | 25,810 | 1,291 | 0 | 6 / 9 / 13 |
| 16 | 28,954 | 1,448 | 0 | 10 / 16 / 22 |

PostgreSQL CPU stayed at 0 % (served from the reference-data cache); backend memory 778 → 992 MiB. This only shows
the HTTP/cache path does not limit capacity; it says nothing about authenticated workflows.

### Not measured (and why)

- Authenticated queues/search/case detail, proposal/payment actions, mixed-role load, soak and burst: need staff
  sessions (blocked, see `report.md`) and an isolated stack; the shared tunnel must stay modest.
- Outbox lag under load, DB lock waits and pool saturation (AR-07/AR-08 hypotheses): need the isolated stack.

## Operating envelope (tested only)

One laptop, all services co-located: public pages and public API are fast at the origin; the tunnel dominates
user-visible latency. No capacity statement for production can be made from this run, and no approved workload exists.

## Hypotheses from the code review (not yet measured)

AR-07 (scan inside the DB transaction), AR-08 (eligibility N+1 under the global routing lock), AR-09 (effective roles
recomputed per request), AR-10 (preview row lock). See `architecture-review.md`.
