# Patient communication on WhatsApp — design

Status: **design draft, 2026-10-10.** Input: [rule set and recommendations](patient-communication-whatsapp-routing.md)
(R1–R11, §4 stages, §5 configuration, §6 acceptance criteria). Evidence: [research](research/reports/WhatsApp%20patient%20coordinator%20routing.md).

## 0. Approach: reuse, don't reinvent

The pattern that works elsewhere (Bumrungrad + Bird + Salesforce; Praga Medica + respond.io) is a channel connected to
an inbox, with the **case system as the single source of truth for who owns the patient**. RehletShifaa already has
that system, so the design connects WhatsApp to the parts that exist instead of adding a second inbox product:

| Need | Existing part reused | What is added |
|---|---|---|
| Send / receive WhatsApp | Meta Cloud API integration: `MetaWhatsAppChannel`, `MetaWhatsAppWebhookController` (signature check), `NotificationOutbox` (leased, idempotent delivery) | Inbound `messages` processing; template sending |
| Who owns a patient | `AssignmentEngine` (routing lock, eligibility, scoring, queue, claim, reassign, decision history) | An intake-conversation route on the same engine |
| Patient conversation once a case exists | Secure messaging (`case_messages`, `PATIENT_COORDINATOR` thread, encryption, audit, status-link nudge) | A `channel` on messages; inbound WhatsApp written into the thread |
| Files patients send | Document pipeline (S3/MinIO, ClamAV inspector, quarantine states) | Staging for files that arrive before a case exists |
| Reply rights | `Authority` grants and scopes, `RolePolicy` | A "replier" scope (owner or active cover) |
| "Patient is waiting" | Work items (`StaffWorkService.openWorkItem`, staff notifications), workforce hierarchy (leads) | Reply timers on working time |
| Configuration | Coordinator capacity, versioned routing policy, Control Center → Coordination | New capacity fields and policy fields |

## 1. Findings that shape the design

| # | Finding (verified in code) | Consequence |
|---|---|---|
| F1 | `MetaWhatsAppChannel.deliver` sends **free text** for everything except 6-digit codes; the outbox renders **English only** (`NotificationOutboxProcessor.render`). | Outside the 24-hour window Meta rejects free text, so status links, "proposal ready", onboarding and secure-message nudges would fail for most patients. **Template sending is a prerequisite** (slice S0). |
| F2 | The webhook path `/api/v1/public/webhooks/` already had its own gateway location, but on the shared write budget (60/min per address, burst 30). Meta delivers every receipt and message from a few of its own addresses. | Corrected in S1: a dedicated `api_webhooks` zone (600/min, burst 200); the backend still rejects unsigned requests. |
| F3 | Phone numbers are stored as entered (`patient_profiles.whatsapp_number`, `case_submission_contacts.whatsapp_number`); matching normalises ad hoc (`PublicCaseAccessService.normalizePhone`). | Inbound `wa_id` (digits, no `+`) cannot be matched by index. Add a normalised digits column. |
| F4 | Patient-thread write right is `COORDINATOR, CASE_MESSAGE, CASE_ASSIGNED`; only `PRIMARY` coordinator assignments exist. | Tighten to an explicit replier scope (rule gap G5). |
| F5 | `MedicalDocument` requires a case. | Files from intake conversations need staging until linked. |
| F6 | `coordinator_capacity.on_duty` is a manual flag; no schedule, absence or cover model exists. | Add schedule-derived duty and a cover model. |

## 2. Architecture

New backend module **`conversation`** (`api` / `application` / `domain` / `infrastructure`, per `ArchitectureRulesTest`,
JPA only). It depends on `notification` (send), `coordination` (routing, through a port as journey does), `journey`
(case thread, contacts), `document` (files) and `authority`.

```
Meta ──webhook──▶ gateway (/webhooks/whatsapp, own budget)
                   │
                   ▼
   MetaWhatsAppWebhookController ── verify signature ──▶ InboundEventStore.save(raw, dedupe by wamid) ──▶ 200 OK
                                                                   │  (same request: statuses as today)
                                                                   ▼
                                     InboundProcessor (@Scheduled, leased claims like the outbox)
                                     1. download media now (URLs expire in 5 min) → staging object → ClamAV
                                     2. SenderResolver: wa_id → open cases (patient or submitter phone)
                                     3a. one+ open case ──▶ CaseInbound: write CaseMessage(channel=WHATSAPP) into
                                         PATIENT_COORDINATOR; attach files as documents; open reply obligation
                                     3b. no open case ──▶ IntakeInbound: find/reopen/create IntakeConversation;
                                         route via AssignmentEngine.routeIntakeConversation; open reply obligation;
                                         out-of-hours auto-reply (template, once per off-hours period)

Coordinator UI ──▶ ConversationReplyService.reply(target, body)
                   lock target row → Authority: caller == replierOf(target, now)?   (owner, or the owner's active cover)
                   ├─ intake + window open  → outbox: WhatsApp free text
                   ├─ intake + window closed → template only (UI offers templates)
                   └─ case                  → secure message (existing) + nudge template with secure link
                   resolve reply obligation; audit
ReplyTimerJob (@Scheduled) ── due reminders / escalations on working time ──▶ notifyStaff (replier / lead)
```

**One-voice guarantee.** Every send goes through `ConversationReplyService`, which locks the conversation (intake row or
the case's routing row) and re-checks `replierOf` under the lock. A reassignment or cover change takes the same lock,
so a send and an ownership change cannot interleave. There is no other path to Meta for patient-addressed free text;
the outbox stays the only caller of the Graph API.

## 3. Data model (one migration, `V78__patient_whatsapp_conversations.sql`)

Pre-production: final design in one migration; H2-safe; `TIMESTAMP WITH TIME ZONE`; one `ADD COLUMN` per `ALTER`.

| Table / change | Purpose | Key columns |
|---|---|---|
| `whatsapp_inbound_events` | Raw, deduplicated webhook messages; retry state | `wamid` UNIQUE, `wa_id_digits`, `payload` (encrypted), `received_at`, `status` (PENDING/PROCESSED/FAILED), `attempts`, `lease_until`, `processed_at`; payload cleared after processing |
| `intake_conversations` | A WhatsApp conversation with someone who has no open case | `id`, `wa_id_digits`, `profile_name` (enc), `language`, `status` (OPEN/CLOSED/LINKED), `owner_subject`, `opened_at`, `last_inbound_at`, `window_expires_at`, `last_auto_reply_at`, `linked_case_id`, `closed_reason`, `revision`; index (`wa_id_digits`, `status`) |
| `intake_messages` | Messages of an intake conversation | `id`, `conversation_id`, `direction` (IN/OUT), `sender_subject` (null = patient), `kind` (TEXT/MEDIA/TEMPLATE), `body` (enc), `external_message_id` UNIQUE, `delivery_status`, `created_at` |
| `conversation_media` | Files received on WhatsApp, staged and scanned | `id`, `intake_conversation_id` or `case_id`, `external_message_id`, `object_key`, `content_type`, `size_bytes`, `status` (reuses `DocumentStatus` values), `document_id` (set when attached to a case) |
| `reply_covers` | Temporary cover | `id`, `owner_subject`, `cover_subject`, `starts_at`, `ends_at`, `reason`, `created_by`, `revoked_at`; CHECK cover ≠ owner; non-overlap per owner enforced under the routing lock |
| `reply_obligations` | "A patient is waiting for an answer" | `id`, `target_type` (CASE/INTAKE), `target_id`, `awaiting_since`, `remind_at`, `escalate_at`, `reminded_at`, `escalated_at`, `resolved_at`, `lease_until`; one open row per target |
| `coordination_decisions` | Intake routing decisions in the same history | + `intake_conversation_id` (nullable); `case_id` becomes nullable; CHECK exactly one of the two |
| `case_messages` | Channel of each message | + `channel` (PORTAL/SECURE_LINK/WHATSAPP), + `external_message_id` UNIQUE (nullable) |
| `coordinator_capacity` | Intake and schedule | + `intake_eligible` BOOLEAN, + `max_intake` INTEGER, + `schedule` TEXT (JSON weekly windows), + `time_zone` VARCHAR(64) |
| `patient_profiles`, `case_submission_contacts` | Matchable phones | + `whatsapp_digits` VARCHAR(20), indexed; written on every phone write |
| `coordination_policy_versions.configuration` | Policy fields | JSON only, no DDL: `intakeTeamsByLanguage`, `preferIntakeOwnerAsCaseOwner`, `businessHours`, `firstResponseMinutes`, `escalationMinutes`, `intakeIdleCloseHours`, `intakeReturnDays` (defaults per R10/R11) |

Bodies are encrypted with the existing `EncryptedText` crypto, as `case_messages` are.

## 4. Behaviour

### 4.1 Sender resolution (`SenderResolver`)
`wa_id` → normalised digits → open cases where `patient_profiles.whatsapp_digits` or
`case_submission_contacts.whatsapp_digits` matches (patient or representative). Results:
- **none** → intake path;
- **one** → that case;
- **several** → the case with the latest activity; its replier can move the message (audited `CASE_MESSAGE_MOVED`).
Closed cases only: intake path, with `preferredOwner` = the case's last primary coordinator.

A case number in the prefilled text is read as a hint (shown to the replier) and never links anything by itself.

### 4.2 Intake routing (`AssignmentEngine.routeIntakeConversation`)
Same `coordination_routing_lock`, same decision history (`coordination_decisions` gains `target_type`), same scorer.
Candidates: coordinators with `intake_eligible`, on duty (manual flag ∧ inside `schedule` ∧ no active cover of
themselves), language match against `intakeTeamsByLanguage`, `open intake < max_intake`. Order: returning person within
`intakeReturnDays` → last intake owner if eligible; else scored choice; else **intake queue** (unowned, visible to
intake-eligible coordinators, claimable under the lock; manager notified as today's queue does).

### 4.3 Case submission hand-off
`routeCoordinationIntake` gains one path, **`INTAKE_CONTINUITY`**, after `CONTINUITY` and before
`PREFERRED_COORDINATOR`: if the submitting phone has an OPEN intake conversation (or one closed within
`intakeReturnDays`) whose owner is eligible for the case, select them. The intake conversation becomes `LINKED`
(`linked_case_id`), its history shows read-only in the case workspace, its staged files become case documents, and if
the owner changed, the `coordinator_intro` template introduces the new owner by name.

### 4.4 Reply rights (`replierOf`)
`replierOf(target, now)` = the owner (intake owner, or the case's active **primary** coordinator), replaced by the
owner's active cover when `now ∈ [starts_at, ends_at)` and not revoked. Used by authority, the UI, and reply timers.
Covers are per person (they cover all the owner's conversations and cases), set by the owner (out of office) or the
owner's lead, or by a manager; a cover cannot itself be under cover at that time (no chains).

### 4.5 Sending
- **Intake, window open** (`now < window_expires_at`): free text via the outbox (`WHATSAPP_TEXT`), `preview_url=false`.
- **Intake, window closed**: approved templates only (`followup_window_closed`, `coordinator_intro`); the composer
  says so.
- **Case**: always a secure message; the patient gets the `secure_message` template with the link in a URL button.
- Meta error "outside the window" (re-engagement) on a free-text send → marked failed; the UI offers the template.

### 4.6 Reply timers
On inbound: open (or keep) the target's obligation with `remind_at = awaiting_since + firstResponseMinutes` and
`escalate_at = awaiting_since + escalationMinutes`, both on **working time** (`businessHours`, Africa/Cairo); an
inbound message out of hours starts the clock at the next opening. Any reply from the replier resolves it. The job
claims due rows with a lease (outbox pattern) and:
- **remind** → `notifyStaff` to `replierOf`; for a case, also the existing work item "Reply to patient";
- **escalate** → `notifyStaff` to the replier's lead(s) from the workforce hierarchy, who can cover or reassign.

### 4.7 Out of hours
First inbound in an off-hours period on an intake conversation → `out_of_hours` template once
(`last_auto_reply_at`). Case patients get no auto-reply (their owner is notified; the timer starts at opening).

### 4.8 Lifecycle and edge cases
- Silent intake conversation for `intakeIdleCloseHours` → CLOSED (reason IDLE); new inbound within `intakeReturnDays`
  reopens to the same owner if eligible.
- Owner offboarded or deactivated (`StaffLifecycleService`) → their intake conversations and cases are re-routed
  under the lock; open covers by them are revoked.
- Media: downloaded during processing; if Meta's URL has expired, mark `MEDIA_EXPIRED` and show the replier a
  "ask the patient to resend" note. Only `CLEAN` files can be opened.

## 5. Authority

| Permission (new unless noted) | Role | Scope |
|---|---|---|
| `CONVERSATION_READ` | Coordinator | `CONVERSATION_REPLIER` (new: `replierOf` = principal) |
| `CONVERSATION_READ` | Coordinator lead; Care Coordination Manager | `SUPERVISED`; `PLATFORM` — audited supervisory read |
| `CONVERSATION_REPLY` | Coordinator | `CONVERSATION_REPLIER` |
| `CONVERSATION_CLAIM` | Coordinator | `CONVERSATION_UNCLAIMED` (new) + intake-eligible check under lock |
| `CONVERSATION_REASSIGN` | Coordinator lead; manager | `SUPERVISED`; `PLATFORM` |
| `REPLY_COVER_MANAGE` | Coordinator; lead; manager | `SELF` (own out of office); `SUPERVISED`; `PLATFORM` |
| `CASE_PATIENT_REPLY` | Coordinator | `CASE_REPLIER` (new: primary coordinator or active cover). `JourneyService.message` requires it for `PATIENT_COORDINATOR`; `CASE_MESSAGE` keeps `CASE_ASSIGNED` for internal threads |

`Resource.Kind` gains `CONVERSATION`. Every reply, claim, reassignment, cover change, message move and supervisory read
is audited (`CONVERSATION_*`, `REPLY_COVER_*` codes).

## 6. Outbound templates (S0)

The outbox keeps one rendering point; for `WHATSAPP` it resolves a **template binding** instead of free text:
`templateKey → (Meta template name, category, parameters, URL-button suffix)` per language (`en`, `ar`), configured
next to `app.whatsapp.meta.*`. Email keeps today's text; Arabic email bodies are a follow-up (they need the same
native review as the Arabic templates).

**S0 delivered (2026-10-10):** `OutgoingNotification` carries language, body parameters and link path from the single
render step; `MetaWhatsAppChannel` sends bound templates only (codes via the authentication template) and parks an
unbound key at once (`WHATSAPP_TEMPLATE_NOT_BOUND`); bindings in `app.whatsapp.meta.templates` / `languages`.
Also fixed: `final-quote-ready` had no renderer, so every final-quote notice was dead-lettered as
`TEMPLATE_FAILURE`. Submission pack: [whatsapp-message-templates.md](whatsapp-message-templates.md).

| Template (en + ar) | Category | Replaces / used by |
|---|---|---|
| `rs_case_received` | Utility | `case-status-link` |
| `rs_secure_message` | Utility | `secure-message` |
| `rs_patient_action` | Utility | `patient-action-link` |
| `rs_proposal_ready` | Utility | `proposal-ready` |
| `rs_final_quote_ready` | Utility | `final-quote-ready` |
| `rs_decision_recorded` | Utility | `proposal-decision-recorded` |
| `rs_onboarding` | Utility | `onboarding-activation` |
| `rs_deposit_settled` | Utility | `deposit-settled-patient` |
| `rs_account_link` | Utility | `account-link-continue` |
| `rs_code` | Authentication | `case-access-code`, `proposal-access-code` (today's authentication template) |
| `rs_out_of_hours` | Utility | §4.7 |
| `rs_coordinator_intro` | Utility | §4.3 |
| `rs_followup_window_closed` | Utility | §4.5 |

Links go in a URL button with a dynamic suffix (the token), so tokens are not in message bodies. Staff notifications
stay on their current channels.

## 7. Frontend (en + ar, logical properties only)

| Surface | Change |
|---|---|
| Public "Talk to a coordinator" | Points to a first-party route `/{locale}/whatsapp` that redirects to `wa.me` with prefilled text in the page language (and the case number where the page knows it). Records the click (existing `whatsapp_clicked`). |
| Staff portal → **Conversations** (new) | Tabs: *Mine*, *Covering*, *Queue* (claim). Thread view, composer with window state (open: text; closed: template picker), staged files (clean only), "send case form link", hint of a case number in the first message. One quiet primary action per view. |
| Case workspace → messages (`CaseMessages.tsx`) | Channel badge (WhatsApp / Portal), linked intake history (read-only), "replying as cover for …" banner, owner read-only while covered, "move to another case" for multi-case phones. |
| Staff profile | Out of office + cover picker. |
| Control Center → Coordination | Capacity editor: intake eligible, intake limit, schedule, time zone. Policy editor: the new fields. Covers list; intake queue; escalations. Converge touched screens to Petrol & Paper. |

Copy goes to `en.json` and `ar.json`; templates submitted to Meta in both languages.

## 8. Infrastructure

- **Gateway:** a dedicated location for `/api/v1/public/webhooks/whatsapp/` with its own rate budget sized for Meta,
  body-size limit, no CORS; the backend still rejects unsigned requests.
- **Config:** `app.whatsapp.mode=meta` in production only after S1 is live (rule R2). Template bindings and the business
  number's display data under `app.whatsapp.meta.*`. Local/dev keeps `LocalWhatsAppNotificationChannel`; a dev-only
  endpoint replays signed sample webhooks for tests.
- **Retention:** raw inbound payloads cleared once processed; staged media that is never linked is deleted after
  `intakeReturnDays`.

## 9. Delivery slices

Each slice ends green (`mvn -o -q test`, `pnpm typecheck`, focused e2e) and is independently deployable.

| Slice | Scope | Proves |
|---|---|---|
| **S0 Templates** | Template bindings, `MetaWhatsAppChannel` template sends, Arabic rendering, Meta template submission list | Patient notifications deliver outside the 24-hour window |
| **S1 Inbound for case patients** | `whatsapp_inbound_messages`, processor, `whatsapp_digits`, sender matching, case path into `PATIENT_COORDINATOR` with `channel`, files scanned into case documents, gateway budget | A case patient's WhatsApp reaches the owner's thread exactly once; files are scanned |
| **S2 Reply rights + cover** | `CASE_REPLIER`/`CASE_COVERING`, `CASE_PATIENT_REPLY`, `reply_covers`, out-of-office UI | Two coordinators cannot both reply; cover hands over and back automatically |
| **S3 Intake conversations** | Tables, intake routing, schedule-derived duty, queue/claim/reassign, Conversations UI, window-aware composer | Every pre-case chat has one owner or sits in the queue |
| **S4 Case hand-off** | `INTAKE_CONTINUITY`, linking, intro template, history and files carried over | The intake person becomes the case owner when eligible, otherwise introduces the new one |
| **S5 Timers + out of hours** | `reply_obligations`, `conversation_settings`, working-time calculator, job, escalations, auto-reply, idle close | Reminder at 30 working minutes, lead alert at 60; one auto-reply per off-hours period |
| **S6 Configuration + entry point** | Control Center fields, policy fields, `/{locale}/whatsapp` redirect, copy | Everything configurable without code; both languages |

**Tests that must exist:** concurrent send by owner and non-owner (one refused); send racing a reassignment or cover
change; duplicate and out-of-order webhooks (one message); processor crash mid-batch (no loss, no duplicate);
expired media; outside-window error → template fallback; multi-case phone; representative's phone; closed-case return;
offboarding re-route; working-time maths across the weekend and off hours; Arabic RTL on every new screen; a PostgreSQL
mapping proof for the new entities.

## 9a. S1 delivered (2026-10-10)

- **Webhook:** `MetaWhatsAppWebhookService` stores each inbound message once (`whatsapp_inbound_messages`, unique provider
  id; encrypted payload with the sender's WhatsApp profile name). Nothing else happens in the request.
- **Processing:** `conversation.application.WhatsAppInboundProcessor` claims messages with a lease (SKIP LOCKED, as the
  outbox does), matches the sender's digits to an open case (patient's own number first, then the submitter's; most
  recently active case when several) and files the message into the case's `PATIENT_COORDINATOR` thread
  (`channel=WHATSAPP`, sender `PATIENT` or `PATIENT_REPRESENTATIVE`, Arabic detected from the text). The primary
  coordinator gets a portal notification (`PATIENT_WHATSAPP_MESSAGE`); a case still in the queue has no one to notify.
- **Files:** images and documents are downloaded at once (`MetaWhatsAppMediaClient`), inspected, and sealed as case
  documents (`DocumentService.fileFromChannel`, the upload rules for type, size and per-case limits). Voice notes, video,
  stickers and contacts are noted, not kept (`attachment_status`). No scanner verdict retries the whole message.
- **No open case:** the message is kept, encrypted, as `UNMATCHED` for S3; it is never dropped.
- **Deviation from §3:** `conversation_media` staging is not needed until S3 (case files go straight to documents);
  it arrives with intake conversations.
- **Migration:** `V78__whatsapp_inbound_messages` (Java: DDL plus a digits backfill shared by PostgreSQL and H2).
- **UI:** the message list marks "via WhatsApp" and says what happened to a file, in both languages.
- **Proof:** `WhatsAppInboundProcessorTest` (9), webhook test, `CaseMessages.test.tsx`, `PostgresJpaMappingTest`.

## 9b. S2 delivered (2026-10-10)

- **One voice on the patient thread:** new scope `CASE_REPLIER` (the case's primary coordinator, or their active cover
  instead of them) and permission `CASE_PATIENT_REPLY`. `JourneyService.message` requires it for staff posts to
  `PATIENT_COORDINATOR`, locks the case row (the lock reassignment takes) and re-checks under it; a refused owner gets
  `PATIENT_REPLY_NOT_YOURS`. Internal threads keep `CASE_MESSAGE`/`CASE_ASSIGNED`. Leads and managers have no reply grant.
- **Covers:** `reply_covers` (V79), `ReplyCoverService`, `/api/v1/coordinator/reply-covers` (list, create, revoke).
  Set by the owner (`SELF`), their lead (`SUPERVISED`) or a Care Coordination Manager (`PLATFORM`). At most 30 days;
  no overlap for the owner; no chains (the cover may not be away, the owner may not be covering someone). Overlapping
  rows created concurrently still resolve to the earliest created, so there is always exactly one replier. The cover is
  notified (`REPLY_COVER_ASSIGNED`).
- **Cover's view:** `CASE_READ` under new scope `CASE_COVERING`; the covered owner's cases join the cover's case list;
  the workspace carries `patientReply` (can I reply, who covers until when), shown above the patient thread.
- **UI:** "Out of office" panel under My work (coordinators set their own cover and end covers they may manage).
  Leads and managers set covers for others through the same API; their Control Center screen comes with S6.
- **Limits by design in S2:** a cover answers the patient; other case actions (requests, proposal steps) stay with the
  owner. Covers per person, not per case.
- **Proof:** `ReplyCoverIntegrationTest` (7), `CaseMessages.test.tsx` (4), `ReplyCoverPanel.test.tsx` (3), PostgreSQL proof.

## 9c. S3 delivered (2026-10-10)

- **Intake conversations** (`conversation` module, V80): a sender with no open case gets an `intake_conversations` row
  (one per sender; a conversation closed within 30 days reopens), their messages in `intake_messages`, files inspected
  and staged in `conversation_media` (`DocumentService.stageChannelFile`). Messages kept `UNMATCHED` in S1 are re-filed.
- **Routing** (`coordination.IntakeRoutingService`, same routing lock, policy weights and scorer): coordinators with
  `coordinator_intake_settings.intake_eligible`, under `max_intake`, on duty and inside their working schedule
  (`WorkingSchedule`, per-day windows in a time zone), not away under a reply cover, and speaking the person's language
  (their capacity languages; Arabic detected from the text). A returning person's previous owner wins when eligible.
  Nobody eligible: the intake queue, claimable by any intake-eligible coordinator under their limit.
- **One voice:** scopes `CONVERSATION_REPLIER` (owner, or their active cover) and `CONVERSATION_UNCLAIMED`; permissions
  `CONVERSATION_READ/REPLY/CLAIM/REASSIGN`; leads reassign within their team, managers anywhere; every send, claim and
  reassignment locks the conversation row and re-checks under it.
- **Sending:** free text inside the 24-hour window (outbox key `conversation-text`, the only free-text send); after it,
  one follow-up template (`intake-followup` → `rs_followup_window_closed`) until the person writes again.
- **API:** `/api/v1/coordinator/conversations` (list mine/queue/team/all, detail, reply, follow-up, claim, reassign,
  close, view file); `/api/v1/admin/coordination/intake-settings` (manager).
- **UI:** a "Conversations" staff view for coordinators: list by scope, thread, window-aware composer with a case-form
  link, take, hand over, close (en/ar).
- **Deviations from §3–§5:** language routing uses each coordinator's capacity languages instead of a separate
  `intakeTeamsByLanguage` policy field; routing decisions for intake are audited but not added to
  `coordination_decisions`; idle auto-close moves to S5 with the timers.
- **Proof:** `IntakeConversationIntegrationTest` (8), `WorkingScheduleTest` (3), inbound processor tests (10),
  `ConversationsView.test.tsx` (4), PostgreSQL proof.

## 9d. S4 delivered (2026-10-10)

- **Continuity:** `AssignmentEngine` tries `INTAKE_CONTINUITY` first for an unowned case: the owner of the person's open
  (or recently closed) intake conversation — matched on the patient's number, then the submitter's — when they are
  eligible for the case. Otherwise routing is unchanged. Port `coordination.IntakeContinuity`, implemented by
  `ConversationDirectory`.
- **Hand-off:** on `CaseSubmitted` (`BEFORE_COMMIT`, so after the submission's routing) the conversation becomes
  `LINKED` to the case; its staged files become case documents (same sealed object, `DocumentService.adoptStaged`,
  per-case limits apply; `conversation_media.document_id`, V81). If the case owner differs from the intake owner, the
  `rs_coordinator_intro` template introduces them by name and the intro is kept in the conversation history. Later
  WhatsApp messages from the person reach the case thread (S1).
- **History:** `GET /api/v1/coordinator/conversations/by-case/{caseId}` (case readers; 404 when none), shown read-only
  as "WhatsApp before the case" in the case's messages drawer.
- **Not covered:** a case submitted while nobody owns it (queue) gets no intro; whoever claims the case continues in
  the case thread.
- **Proof:** `CaseHandOffIntegrationTest` (4), `IntakeHistory.test.tsx` (2), PostgreSQL proof.

## 9e. S5 delivered (2026-10-10)

- **Service levels** (V82 `conversation_settings`, one row; default Sat–Thu 10:00–20:00 Africa/Cairo, reminder 30,
  escalation 60 working minutes, idle close 72 hours), manager API `/api/v1/admin/coordination/conversation-settings`.
  Kept out of the routing policy record so case routing is untouched.
- **Reply timers** (`reply_obligations`, one per conversation): a patient message starts waiting (the first unanswered
  message counts); `WorkingSchedule.plusWorkingTime` puts the reminder and escalation on working time. Case thread:
  journey publishes `PatientConversationEvents` (WhatsApp or portal message from the patient; a staff answer in the
  patient thread). Intake: receive starts, reply/follow-up/close/link stop.
- **Dispatch** (`ReplyTimerService`, every minute, SKIP LOCKED): reminder to the replier (owner or active cover);
  escalation to the owner's leads (`WorkforceDirectory.leadsOf`: team leads and direct manager), or to the Care
  Coordination Managers when nobody owns it or nobody leads the owner. Each fires once per waiting period.
- **Out of hours:** the first intake message in a closed period gets `rs_out_of_hours` once; again only after the team has
  worked since (`workedBetween`). Case patients get no auto-reply.
- **Idle close:** open intake conversations silent for `idle_close_hours` close as `IDLE` (every 15 minutes); a returning
  person reopens them (S3).
- **Proof:** `ReplyTimerIntegrationTest` (7), `WorkingScheduleTest` (5).

## 10. Open items (do not block S0–S2)

From the rule set §7: Meta pricing from 1 Oct 2026; Egypt PDPL licensing and consent wording (needed before S3 goes
live); Business Verification and display name; local-storage regions; webhook timeout/retry figures and the
business-scoped `user_id`; the exact outside-window error code.
