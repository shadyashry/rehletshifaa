# Alert rules

These are the alert rules as code and the source of truth for their thresholds, owners and runbooks. The backend publishes business and job-health meters on Micrometer with the Prometheus registry. `prometheus/rules/alerts.yml` translates every rule below into PromQL (Prometheus metric names: dots become underscores, a gauge loses `.total` and gains its unit, so `work.open.overdue` is `work_open_overdue_items`). Change a threshold here first, then in the rules file. Prometheus and Grafana run from `docker-compose.observability.yml` (see README.md); there is no Alertmanager yet, so alerts show in Prometheus and Grafana only.

How to read the meters:

- Prometheus scrapes `/actuator/prometheus` every 30 s; by hand, `GET /actuator/metrics/{name}?tag=key:value`, both on the backend's internal metrics port, `backend:8090` (`app.management.metrics-port`, `METRICS_PORT`). No token is needed.
- Only containers on the Docker network can reach that port: Compose does not publish it, and neither the API gateway nor the tunnel routes to it. The main port (8080) serves health only and refuses `/actuator/metrics`; the metrics port serves nothing but the meters.
- Gauges are refreshed from the database at most every 60 seconds.
- Counters count only committed work and reset when the backend restarts. "Increase over a window" is computed from two reads.

SLA source: `backend/src/main/java/com/rehletshifaa/journey/application/SlaPolicy.java` (`QUEUE_WORKING_DAYS`). Working week is Saturday to Thursday, 10:00 to 20:00 Africa/Cairo. One working day is one 10-hour window. Configurable under `app.sla.*`.

| Queue | Working days | Team |
|---|---|---|
| DEPOSIT_RECORD | 1 | Finance verification |
| PATIENT_IDENTITY_REVIEW | 2 | no work item yet, so no meter series today |
| PREPARE_TRAVEL_PACKAGE | 2 | Operations |
| UPDATE_TRAVEL_PLAN | 2 | Operations |
| CLINICAL_REVIEW | 2 | Consultant |
| ASSIGN_CONSULTANT | 1 | Coordinator intake |
| REVIEW_PATIENT_RESPONSE | 1 | Coordinator intake |
| PREPARE_PROPOSAL | 2 | Coordinator intake |

Consultant offer deadline: 48 working hours, 24 on an URGENT case.

The due date is written from this table when a work item opens. So `work.open.overdue` already means "older than the queue's service level in working days".

```yaml
alerts:
  - id: DEPOSIT_VERIFICATION_LATE
    severity: ticket
    meter: work.open.overdue
    tags: { queue: DEPOSIT_RECORD }
    condition: "> 0"
    for: 15m
    threshold_source: "SLA DEPOSIT_RECORD = 1 working day"
    owner: Finance Manager
    runbook: "Open the oldest deposit record, verify or reject it."
  - id: QUEUE_OVERDUE
    severity: ticket
    meter: work.open.overdue
    tags: { queue: "<each queue in the SLA table>" }
    condition: "> 0, one alert per queue"
    for: 30m
    threshold_source: "that queue's SLA working days"
    owner: "team lead of the team tag"
    runbook: "Read work.open.oldest.age for the same queue and team, clear or reassign the oldest item."
  - id: QUEUE_HIGH_BACKLOG
    severity: ticket
    meter: work.open.high
    tags: { team: "<each team>" }
    condition: "sum per team > 10"
    for: 30m
    threshold_source: "none; starting value, tune after a month of data"
    owner: "team lead of the team"
    runbook: "List HIGH and URGENT items for the team, rebalance."
  - id: OUTBOX_DEAD_LETTER
    severity: page
    meter: notification.outbox.dead.letters.total
    tags: {}
    condition: "increase > 0 (or increase of notification.delivery{outcome=~dead_letter.*})"
    for: "15m window"
    threshold_source: "any dead letter is a lost message"
    owner: platform on-call
    runbook: "Read the message's last_error_code, fix the cause, requeue."
  - id: OUTBOX_STUCK
    severity: page
    meter: notification.outbox.oldest.pending.age
    tags: { channel: "<each channel>" }
    condition: "> 900 s"
    for: 10m
    threshold_source: "15 minutes is the longest a pending message should wait"
    owner: platform on-call
    runbook: "Check the dispatcher and the channel provider, then the pending count."
  - id: OUTBOX_RETRYING
    severity: ticket
    meter: notification.outbox.retrying
    tags: { channel: "<each channel>" }
    condition: "> 20"
    for: 15m
    threshold_source: "starting value, tune with data"
    owner: platform on-call
    runbook: "Read recent errors for the channel, check the provider status."
  - id: REPLY_TIMER_BREACH
    severity: ticket
    meter: conversation.reply.timer.breach
    tags: {}
    condition: "increase > 0 (all tags)"
    for: "15m window"
    threshold_source: "reply timer deadlines"
    owner: Care Coordination Manager
    runbook: "Check which conversation and step breached, look for a staffing gap."
  - id: OFFERS_EXPIRING
    severity: ticket
    meter: journey.consultant.offer.expired
    tags: {}
    condition: "increase > 3"
    for: "24h window"
    threshold_source: "offer deadline 48 working hours, 24 on URGENT; the count is a starting value"
    owner: Consultant Operations
    runbook: "See which consultants let offers lapse, reassign or talk to them."
  - id: INFORMATION_REQUESTS_CANCELLING
    severity: ticket
    meter: journey.information.request.closed
    tags: { outcome: case_cancelled }
    condition: "increase > 0"
    for: "24h window"
    threshold_source: "information requests close at day 30"
    owner: coordinator lead
    runbook: "A patient journey was lost. Find the case and contact the patient."
  - id: PROPOSAL_SLOW
    severity: ticket
    meter: journey.proposal.time.to.release
    tags: { revision: first }
    condition: "max (or mean over 7 days) > 7 calendar days"
    for: 24h
    threshold_source: "derived: ASSIGN_CONSULTANT 1 + CLINICAL_REVIEW 2 + PREPARE_PROPOSAL 2 = 5 working days, about 7 calendar days"
    owner: Care Coordination Manager
    runbook: "Find which stage queue holds the slow cases."
```

## DEPOSIT_VERIFICATION_LATE

Fires when any deposit record is past its due date for 15 minutes. The due date comes from the 1 working day SLA. First step: open the oldest deposit record in the Finance queue and verify or reject it. Owner: Finance Manager. Ticket.

## QUEUE_OVERDUE

Same check for every queue in the SLA table, one alert per queue. The threshold is that queue's SLA in working days. PATIENT_IDENTITY_REVIEW has no work item yet, so it has no series today. First step: read `work.open.oldest.age` for the same queue and team. Owner: team lead of the `team` tag (`NONE` means unowned, send it to the coordinator lead). Ticket.

## QUEUE_HIGH_BACKLOG

Sum `work.open.high` per team. Over 10 for 30 minutes raises a ticket. There is no SLA source for 10. It is a starting value to tune after a month of data. First step: list the HIGH and URGENT items for the team and rebalance. Owner: team lead.

## OUTBOX_DEAD_LETTER

Any increase of `notification.outbox.dead.letters.total` over 15 minutes pages. The level never goes down on its own (dead letters are not archived), so alert on the increase, not the level. Superseded proposal resends are excluded. `notification.delivery{outcome=~dead_letter.*}` works as an alternative. First step: read the message's `last_error_code`, fix the cause, requeue. Owner: platform on-call. Page.

## OUTBOX_STUCK

Pages when the oldest pending message on a channel is older than 900 seconds for 10 minutes. First step: check the dispatcher and the channel provider. Owner: platform on-call.

## OUTBOX_RETRYING

More than 20 messages waiting after a failed attempt on a channel for 15 minutes. Starting value, tune with data. First step: read recent errors for the channel and check the provider. Owner: platform on-call. Ticket.

## REPLY_TIMER_BREACH

Any increase of `conversation.reply.timer.breach` (all tags) over 15 minutes. A breach already alerted the lead or managers in-app, so this is the trend signal. First step: see which conversation (case, intake) and step (lead, managers) breached and look for a staffing gap. Owner: Care Coordination Manager. Ticket.

## OFFERS_EXPIRING

More than 3 consultant offers declined by their deadline in 24 hours. The deadline is 48 working hours, 24 on an URGENT case. The count 3 is a starting value. First step: see which consultants let offers lapse. Owner: Consultant Operations. Ticket.

## INFORMATION_REQUESTS_CANCELLING

Any information request closed with `outcome=case_cancelled` in 24 hours. A patient journey was lost. First step: find the case and contact the patient. Owner: coordinator lead. Ticket.

## PROPOSAL_SLOW

Time from case submitted to first preliminary proposal released, max (or mean over 7 days) above 7 calendar days. This is a derived figure, not a single SLA entry: ASSIGN_CONSULTANT 1 + CLINICAL_REVIEW 2 + PREPARE_PROPOSAL 2 = 5 working days, about 7 calendar days. First step: find which stage queue holds the slow cases. Owner: Care Coordination Manager. Ticket.

## SCHEDULER_JOB_STALE, SCHEDULER_JOB_FAILING, BACKEND_METRICS_DOWN (P1-8 session 2)

The 18 leased jobs (sweeps, expiry scans, daily crons) publish `scheduler.job.last.success` (epoch seconds, read from
`scheduler_leases`, so the success of any instance counts; a job that has not succeeded yet reports the instance's start),
`scheduler.job.cadence` (seconds), `scheduler.job.duration` and `scheduler.job.failures`, tagged `task` = `SimpleClassName.method`.

- SCHEDULER_JOB_STALE: `time() - last_success > 2 x cadence` for 5 minutes. A job switched off (cron `-`) has no cadence and never
  fires. First step: read the task's row in `scheduler_leases` (holder, `locked_until`, `last_failed_at`, `last_error_code`) and the
  backend log for `event.code` `SCHEDULER_LEASE_*`. Owner: platform on-call. Ticket.
- SCHEDULER_JOB_FAILING: any failure in an hour. `last_error_code` holds the exception class. Owner: platform on-call. Ticket.
- BACKEND_METRICS_DOWN: Prometheus cannot scrape `backend:8090` for 5 minutes. Owner: platform on-call. Page.

## Not covered yet

- Alert delivery (no Alertmanager; alerts are visible in Prometheus and Grafana only).
- Identity review queue (no work item yet).
- Finance Manager escalation on SLA breach (A-04 follow-up).
