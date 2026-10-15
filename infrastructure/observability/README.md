# Centralized log search (opt-in)

`docker-compose.observability.yml` adds Elasticsearch, Kibana and Filebeat (9.5.4, latest GA verified
2026-10-06) to the local stack. The application never depends on it.

```
backend (ECS JSON on stdout) ┐
api-gateway (ECS JSON)       ┴─> Filebeat ─> data stream logs-rehletshifaa-<namespace> ─> Kibana
```

## Start

Add three local-only secrets to `.env` (any long random strings):
`ELASTIC_PASSWORD`, `KIBANA_SYSTEM_PASSWORD`, `LOG_WRITER_PASSWORD`. Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml -f docker-compose.observability.yml up -d --build
```

Kibana: http://localhost:5601 (user `elastic`). Elasticsearch: http://localhost:9200. Both are bound to
loopback and are not routed through the Cloudflare tunnel. Needs ~3 GB of Docker memory.

## What is shipped

Only the `rehletshifaa-backend-*` and `rehletshifaa-api-gateway-*` containers. Keycloak, Postgres, MinIO,
Mailpit and other compose projects are excluded: their output is not ECS and can contain credentials or
patient e-mail content. Filebeat authenticates as `rehletshifaa_log_writer`, which can only append to
`logs-rehletshifaa-*`.

## Searching

Every event carries `service.name`, `log.level`, `@timestamp`; backend events add `log.logger` (the
module is the package, e.g. `com.rehletshifaa.journey.*`), `event.code` (stable API/cache error code)
and `error.type` / `error.message` / `error.stack_trace`; gateway events add `http.response.status_code`,
`url.path` and `gateway.request_time_seconds`. Both carry the correlation id in `http.request.id` — the
same value the API returns as `X-Request-ID` and in every error body (`requestId`).

| Question | KQL |
|---|---|
| Everything for one user-reported request | `http.request.id : "<X-Request-ID>"` |
| Errors in one module | `log.level : "ERROR" and log.logger : com.rehletshifaa.journey*` |
| A specific failure code | `event.code : "FX_RATE_UNAVAILABLE"` |
| Redis outage / cache problems | `event.code : CACHE_*` |
| Unhandled server errors | `event.code : "INTERNAL_ERROR"` |

Saved searches for these and for 5xx, 401/403, 429, database, integration and slow requests are
provisioned by `setup.sh` (Discover → Open).

## Retention

Data stream lifecycle, `LOG_RETENTION` (default `7d`). Suggested: dev/test 7d, UAT 14d, production 30d,
with audit evidence kept in PostgreSQL (`audit_events`), not in logs. Separate environments by
`LOG_NAMESPACE` (`dev`, `uat`, `prod`), never by index-per-class.

## Production

This overlay is a development tool (single node, HTTP without TLS). For a deployed environment use a
managed Elastic deployment or a TLS-enabled cluster, keep the same data stream name, template and
writer-role shape, and point Filebeat (or Elastic Agent) at it.

## Meters and alerts: Prometheus and Grafana (opt-in, P1-8)

The backend publishes its business and job-health meters on Micrometer with the Prometheus registry, at
`/actuator/prometheus` on its internal metrics port `backend:8090` (`METRICS_PORT`). Compose does not publish that
port and neither the api-gateway, Caddy nor the tunnel routes to it, so the scrape needs no token; the main port
(8080) serves health only.

```
backend:8090/actuator/prometheus ─> Prometheus (rules/alerts.yml) ─> Grafana (provisioned dashboard)
```

Add `GRAFANA_ADMIN_PASSWORD` to `.env` (any long random string), then start only these two:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml -f docker-compose.observability.yml up -d prometheus grafana
```

Compose checks every variable of the file, so the three Elastic secrets above must be set too (or exported in the
shell for this command) even though the Elastic services stay stopped.

- Grafana: http://localhost:3300 (user `admin`). Dashboard **RehletShifaa → RehletShifaa operations**: queues, service
  levels, outbox, scheduled jobs. Provisioned read-only from `grafana/dashboards/`; edit the JSON, not the UI.
- Prometheus: http://localhost:9090 (Alerts tab). Retention `PROMETHEUS_RETENTION`, default 15 days.
- Both bind to 127.0.0.1 only. About 0.5 GB of memory together. Stop them with
  `docker compose ... stop prometheus grafana`.

Files: `prometheus/prometheus.yml` (scrape config), `prometheus/rules/alerts.yml` (the rules), `grafana/provisioning/`
(data source and dashboard provider), `grafana/dashboards/rehletshifaa-operations.json`.

Rules: [alerts.md](alerts.md) is the source (thresholds, owners, runbooks); `prometheus/rules/alerts.yml` translates it
into PromQL. Change a threshold in alerts.md first, then in the rules file. There is no Alertmanager yet: alerts show in
Prometheus and Grafana but notify no one.

Prometheus names differ from the Micrometer names: dots become underscores, a gauge loses `.total` and gains its unit
(`work.open.high` → `work_open_high_items`, `work.open.total` → `work_open`), counters gain `_total`. The job meters are
tagged `task` (not `job`, which is Prometheus's own target label): `scheduler_job_last_success_seconds`,
`scheduler_job_cadence_seconds`, `scheduler_job_duration_seconds_*`, `scheduler_job_failures_total`.
