# UX-7 — Care Coordination: Team Queue, ownership transfer, Coordination Setup and routing diagnostics

Status: **COMPLETE** — 2026-09-24 (Claude Code). Branch `codex/platform-control-plane`, on top of UX-6 `5af3703`.

Scope: plan §11 row UX-7 only. No Commercial or Care Journeys redesign (UX-8), no Journey runtime/cutover change, no
routing rollout change (no case was adopted into live routing, no default changed), no Phase 8C. Journey production
intake OFF. No migration, no new permission, scope type, role version, routing engine, assignment model, suspension
state machine or point-of-no-return engine.

## 1. Operational / configuration split

| Daily operations → **Staff Portal** (`/portal`, coordinator workspace) | Configuration & governance → **Control Center › Coordination Setup** |
|---|---|
| **My work** — WorkItems assigned to me personally | **Teams & People** — coordinator teams, membership, capacity |
| **My cases** — cases I own as coordinator | **Clinician Preferences** — whom routing tries first for a clinician |
| **Team queue** — *Needs an owner* (everyone) · *Owned by my team* (leads) | **Rules** — hard requirements + fixed order of preference, versioned |
| **Take ownership** · **Transfer case ownership** (authoritative) | **Advanced** — Preview routing recommendation · Routing decision history · Live-routed cases waiting (only when live routing exists) · Technical configuration |
| **Assignment history** on the case (Activity tab) | |

The Control Center no longer shows an operational queue in its primary sections, no "Look up a case (Case ID)", no
Overview with engine notes, and no Assign/Reassign on evaluation-only cases. The only assignment command left in the
Control Center is the authoritative one for **live-routed** cases (see §6), because the Staff Portal refuses to take or
transfer those (`ROUTING_ADOPTED`) — it appears under Advanced only when at least one case uses live routing.

## 2. Case Owner vs WorkItem assignee vs routing preference (verified in code)

| Concept | Stored as | Changed by | Not changed by |
|---|---|---|---|
| **Case Owner** (the responsible coordinator) | active `case_assignments` row, `assignee_role=COORDINATOR`, `assignment_type=PRIMARY` | *Take ownership* (`POST /coordinator/cases/{id}/claim`: RECEIVED + unowned only → INTAKE_REVIEW); *Transfer case ownership* (`POST …/coordinator-assignment`: COORDINATOR_LEAD within reporting team, or SYSTEM_ADMIN; reason required); live routing (`AssignmentEngine.persist` for LIVE cases: AUTO/ACTIVATE/ASSIGN/REASSIGN/QUEUE) | Evaluation-only (SHADOW) routing, Journey WorkItem routing hint, preferences, team membership changes |
| **WorkItem assignee** | `case_tasks.owner_subject` (+ `owner_role`) | WorkItem creation (`StaffWorkService.openWorkItem`, usually the case owner for coordinator work); an owner change moves the previous owner's (or nobody's) **open coordinator** WorkItems; the lead-only task reassign API (`POST /tasks/{taskId}/cases/{caseId}/reassign`, not exposed in the UI); Journey `routeCoordinatorWork` sets only the WorkItem owner, never the Case Owner (technical-decisions §18) | Other roles' work (Consultant/Operations/Finance) on an owner change; completed work |
| **Routing preference / recommendation** | `consultant_routing_preferences` (versioned) + `coordination_policy_versions`; recommendations in `coordination_decisions` | Clinician Preferences / Rules publish; recommendations are recorded by SHADOW comparisons (legacy claim/transfer hooks) | Anything real, unless the case is LIVE |

- **A transfer changes the Case Owner and the open coordinator WorkItems that followed the previous owner** (UX-7 fix, §7).
  It does not touch Consultant/Operations/Finance assignments or their work.
- **Several WorkItems can exist under one case** (one open item per type; different roles).
- **A case can have an owner while work is assigned elsewhere** — by design for Consultant/Operations/Finance work, and for
  Journey-routed WorkItems (owner hint only).
- Consultant/Operations/Finance also have case-level `case_assignments` (PRIMARY), which the case owner creates; those are
  what *My cases* means for those roles.

## 3. Team queue

Source: `GET /coordinator/cases` (one read, with the batched open-work signals added in the UAT pass). Sub-views are
derived from the backend's `coordinatorSubject` only — no frontend queue state:

- **Needs an owner** (every coordinator): RECEIVED cases with no active primary coordinator. Shown with patient display
  name (already authorized for pre-ownership triage), case number, stage, care area, attention chip (from real work
  signals) and **Received {date}**. Action: **Take ownership** (authoritative claim; routine, so no confirmation). The
  intake preview still withholds assignment identity before ownership.
- **Owned by my team** (COORDINATOR_LEAD only): cases owned by coordinators who report to the lead. Action: **Transfer
  ownership** next to Open (teammate-owned, non-terminal cases only).
- Each view states what it is in one line. Completed/cancelled work follows the existing *Active cases* status filter.
- Unassigned WorkItems (`owner_subject` NULL) are **not** a Staff Portal queue: the legacy workflow gives coordinator
  WorkItems an owner (the case owner); NULL-owner items come from live routing (Coordination Setup › Advanced) and from
  Journey handlers on verification-harness cases (production intake OFF). A WorkItem-level team pool is future work
  (§22) — not created as frontend-only state.

## 4. My work

`GET /work/mine`: `case_tasks.owner_subject = me`, open only. Unchanged backend; copy now says *Work assigned to you
personally, most urgent first.* Team work is never mixed in.

## 5. My cases

For coordinators: cases whose active primary coordinator assignment is mine (Case Owner) — *Cases you own as the
responsible coordinator.* For Consultant/Operations/Finance: cases with my active assignment of that role — *Cases you
are assigned to.* A WorkItem alone never puts a case in My cases.

## 6. Assign

- **Staff Portal** has no generic "Assign case" command: ownership is taken (*Take ownership*) or transferred. Consultant
  / Operations / Finance assignment stays in the case's current-action forms (unchanged, not in UX-7 scope).
- **Live-routed cases only** (Coordination Setup › Advanced › *Live-routed cases waiting for a coordinator*): **Assign
  coordinator** — eligible coordinators by name (from the latest routing evaluation; the backend re-checks eligibility),
  required reason, and the stated effects: the coordinator becomes the case owner, open coordinator work moves to them,
  they are notified in the Staff Portal and by email; other roles' work unchanged; decision recorded. Requires
  `assignment.manual_assign` (REASSIGN when an owner exists: `assignment.reassign`).

## 7. Reassign / transfer semantics

One verb per command:

| Label | Command | Effect |
|---|---|---|
| **Take ownership** | `POST /coordinator/cases/{id}/claim` | Me → Case Owner; case → Intake review |
| **Transfer case ownership** | `POST /coordinator/cases/{id}/coordinator-assignment` | New Case Owner; **open coordinator WorkItems of the previous owner (or unowned) move to the new owner**; previous owner loses case access unless they lead the new owner; history keeps both, with the reason; **no notification** |
| **Assign coordinator** (live routing only) | `POST /admin/coordination/{org}/cases/{id}/commands` ASSIGN/REASSIGN | As §6; notifies |
| **Remove from team** (configuration) | `PUT …/teams/{id}/members` active=false | Future routing only |

**Backend fix (write path, justified):** before UX-7 the transfer ended/created the owner assignment but left the previous
owner's open coordinator WorkItems with them — work stranded with someone who could no longer open the case, and missing
from the new owner's My work. The transfer now applies the frozen Phase 3 owner-change rule verbatim (the same SQL as
`CoordinationRepository.owner`). **Also fixed:** disabled coordinator accounts were valid transfer targets and appeared in
`/coordinator/staff`; both now exclude `disabled_at`/`DISABLED` (same rule as routing's `staffEnabled`). The staff
directory fix also applies to the Operations/Finance picker (read-side narrowing only).

Transfer UX: *Transfer case ownership* drawer (from the Team queue row or the case header/More menu) → **1.** choose a
coordinator (search by name; radio list; only the lead's reporting team; current owner excluded; *(you)* marked) + reason
(max 500, the backend limit — the old form allowed 1000) → **2.** review: case, from, to, reason, *What changes* / *What
stays the same* / *Notifications* → **Transfer ownership** → result *Ownership transferred to X. Nobody was notified
automatically.* A refused command keeps the review open and shows the backend message.

## 8. Assignment history

Staff Portal case → Activity → **Assignment history** (coordinators): new read `GET /coordinator/cases/{id}/assignment-history`
(authoritative `case_assignments` rows, ended ones included): role (*Case owner (coordinator)*, Consultant, Operations,
Finance), person name, status (*Current* / *Awaiting acceptance* / *Declined* / *Ended {date}*), date, **by** (person
name / *automatic routing* / *the system*), reason. No account identifiers. Routing recommendations are **not** here —
they are *Routing decision history* in Coordination Setup (§15). "Coordinator changes" is not used anywhere.
Reasons written by the system are stored in English and shown as stored (UX-8 debt).

## 9. Teams & People

One section, two lists: **Coordinator teams** (name, active status with icon + text, purpose, care areas, languages,
fallback team, active members by name with *Team lead*, former members collapsed) and **People** (name, account
Active/Disabled/Not a coordinator account, on/off duty, teams, **caseload "3 of 12 cases"**, languages, care areas, "No
capacity set — routing cannot consider them yet", "No longer a member of this organization"). Read model
`GET /admin/coordination/{org}/people` (`assignment.team.view`): coordinators who are active members of the organization
plus anyone already in a team or capacity record; clinicians and other members are not listed; workload is the global
active-case count the engine uses. Care areas and languages are choices (checkboxes), not comma lists.

## 10. Team membership

*Add person* (dialog): search by name; only active coordinator accounts with membership here and not already active in
the team; start date; *Team lead*; required reason → `PUT …/teams/{id}/members` (revision −1 for new, stored revision to
re-add a former member). *Remove from team*: consequence dialog — *Routing stops considering them for this team. Cases
they already own and their open work stay with them. Assignment history is unchanged. Nobody is notified.* — required
reason → active=false. Team create/edit and capacity require a reason too (previously the UI faked the reason with the
button label). No staffing/scheduling features added.

## 11. Clinician Preferences

One read `GET /admin/coordination/{org}/consultants` (`assignment.policy.view`): each Consultant by name with the
preference in effect (preferred coordinator, preferred team, fallback team — exactly the backend fields) and a scheduled
next version. *Change preference* (`assignment.preference.manage`) dialog: the three optional selects, required start and
end dates (the backend requires a finite, non-overlapping period — the old UI always sent no end date and every save
failed), a note that a new version starts when the current one ends, required reason, earlier versions on demand. Copy:
a preference never guarantees an assignment; eligibility always applies. No invented preferences (language, time window,
provider relationship are eligibility/team attributes, not clinician preferences, and are not presented as such).

## 12. Rules

`GET …/policies`, business order: status (*Version 2 · in effect 1 Jan – 1 Jun*, *starts …*, *No rules version is in
effect*), **Hard requirements** (access/account/team, below maximum, care area — always; on duty, language — Required /
Not required from the policy), **Order of preference** (1 keep current coordinator · 2 clinician's preferred coordinator ·
3 teams in the engine's order — clinician's preferred team, *Organization team*, *Care-area teams*, *Default team*,
clinician's fallback team, *Last-resort team*, each team's own fallback · 4 best available coordinator · 5 nobody
eligible → waits, deadline N hours, live routing only). Weights under *Advanced settings*; raw JSON only under Advanced.
*Publish new version* (`assignment.policy.manage`): dates (finite, non-overlapping), requirements, team per slot and per
care area (previously care-area teams were not editable), deadline, weights under a disclosure (must total 100), reason.
Fixed a display defect: the old page labelled the fallback team as the default team. No second routing language; the
order is the engine's and is not editable.

## 13. Routing preview

Advanced › **Preview routing recommendation** (`assignment.simulate`), with the approved copy *Evaluation only — this will
not change the case owner or the person assigned to this work.* Inputs are selectors: clinician (by name), care area,
patient language; *What if…* (unsaved preferred coordinator/team) under a disclosure. Result (announced via `aria-live`):
*Recommended: Sara Ahmed · through Cardiology Desk*, *Why:* the backend path translated (e.g. *From the organization
team*) + caseload + language match; *Other eligible coordinators*; *Not eligible* with the backend exclusion codes
translated; *Evaluated against rules version N.* Everything shown comes from the engine response — no frontend scoring.
Calls `POST /simulate` only (ephemeral; backend test proves no decision/assignment/task/audit row). No real-case preview:
the per-case SHADOW command records an audited decision and advances the routing revision, so it is not offered (future:
a side-effect-free real-case preview read).

## 14. Simulation

The product has one evaluation tool: the engine's `simulate` (current live configuration against synthetic facts). There
is no draft-rules simulation. So there is one primary label (*Preview routing recommendation*) and the copy says it is the
engine's routing simulation. "Routing simulation" of draft rules is future work if rule drafts are ever introduced.

## 15. Evaluation / shadow mode

A banner on every Coordination Setup section, from `GET …/overview` (live vs evaluation case counts, policy in effect):
*Evaluation mode — Routing recommendations are measured but are not applied to live assignments. Coordinators take and
transfer cases in the Staff Portal.* / *N cases use live routing* (with what that means) / *No routing rules are in effect*.
"Shadow" appears nowhere in business UX. No rollout state was changed; ACTIVATE has no UI.

## 16. Routing decision history

Advanced › **Routing decision history** (`assignment.audit.view`): new org-wide bounded read `GET …/decisions?limit=`
(default 50, max 100; case numbers, no patient data; names resolved server-side). Each entry: kind (*Recommendation
recorded* / *Manual assignment* / *Assigned by routing* / *Moved to the waiting queue*), case number, a status badge that
separates **Evaluation only — nothing changed** from **Applied to the case**, date, *By* (person, when not the system),
recommendation vs actual (*Matched / Differed from the current coordinator* for evaluations; *From → To* for applied),
*Why* (path) and reason. Manual overrides are visible as *Manual assignment* with actor and required reason.

## 17. Notification behavior

| Action | Notification |
|---|---|
| Take ownership | none |
| Transfer case ownership | **none** — stated in the review and the result |
| Live-routing assign / owner change | in-app + email to the selected coordinator (existing `persist` behavior) — stated |
| Live-routing queue | in-app + email to queue managers (existing) |
| Team membership / capacity / preferences / rules | none — stated for removal |

No notification functionality was added.

## 18. Suspension / point of no return

- No WorkItem suspension state exists (`case_tasks` statuses are exactly OPEN, IN_PROGRESS, COMPLETED, CANCELLED); no case pause;
  "clinician unavailable" = `availability_status` (consultant assignment eligibility, unchanged); "routing disabled" =
  team inactive / membership inactive / off duty / no policy in effect — each shown where it applies. Nothing added.
- **No point-of-no-return model exists.** Transfer is allowed in any non-terminal state (the only refusal is a LIVE-routed
  case, surfaced by the backend's message; the Team queue offers Transfer only on non-terminal cases). Recorded as a future
  business capability, not built.

## 19. Performance / request counts

| Surface | Before | After |
|---|---|---|
| Coordination Setup landing | org picker hop, then `me` + organizations + teams + queue + capacity, + 1 `members` per expanded team | single org opens directly; `me`×2 (shell + page, existing pattern) + organizations + overview + teams + people = **6 GETs**, no per-team/per-person call |
| Clinician Preferences | UUID lookup, 1 read per consultant looked up | **+1** (`consultants`), history +1 only when opened |
| Rules | +1 (`policies`) | +1 (`policies`) |
| Advanced | simulation form + UUID lookups | +1 `consultants` (preview selector) + 1 `decisions`; `queue` only when live routing exists; `policies` only when Technical opens; preview = 1 POST |
| Staff Portal Transfer | 0 extra (staff directory already loaded) | 0 extra + 1 POST |
| Assignment history | — | 1 GET per Activity tab open (coordinators) |

Backend reads are bounded: `people` = 4 queries + 1 per team; `consultants` = 2; `decisions` = 2 (LIMIT ≤ 100);
`overview` = 3–4 COUNT queries.

## 20. Authorization / privacy

- Staff Portal commands keep realm-role + case authorization (claim: COORDINATOR/LEAD; transfer: LEAD in reporting scope or
  SYSTEM_ADMIN; history read: coordinator roles + `authorizeRead`). A Team queue viewer gains nothing in the Control Center.
- Coordination Setup reads use the existing assignment capabilities: `overview` any coordination view capability (live
  queue count only for `assignment.queue.manage`); `people` `assignment.team.view`; `consultants` `assignment.policy.view`;
  `decisions` `assignment.audit.view`; writes unchanged (`team.manage`, `preference.manage`, `policy.manage`,
  `manual_assign`/`reassign`). All reads are organization-scoped; a foreign organization is denied (tested).
- Privacy: Coordination Setup shows staff/clinician names and case numbers only — no patient names, contact details,
  clinical or document data; the decision feed and live queue carry case numbers only. Account identifiers appear only
  under Advanced › Technical configuration (team/policy/org IDs).

## 21. Tests and visual sanity

- Backend: `CoordinationIntegrationTest.readModelsAreNamedScopedAndWriteNothing` (overview counts, people by name and
  scope, consultants + current/latest preference, decision feed with case number, reads write nothing, foreign org and
  missing capability denied); `SecureJourneyCorrectionsTest.transferMovesOpenCoordinatorWorkOnlyRecordsHistoryAndRefusesDisabledCoordinators`
  (only open coordinator work moves; other roles' and completed work unchanged; no notification; disabled coordinator
  neither listed nor accepted; history names, by, reason, ended entry; Consultant denied the read). Existing simulation
  test proves preview writes nothing. See test-status.md for totals.
- Frontend: `CareCoordinationWorkspace.test.tsx` (15; replaces the seven old coordination test files) and
  `portal/CareCoordination.test.tsx` (7). Visual review: see test-status.md.

## 22. Remaining UX-8 / Phase 8D debt

- WorkItem-level team pool (NULL-owner WorkItems) in the Staff Portal — needed when Journey production intake turns on.
- Lead task reassign API has no UI (WorkItem-only reassignment); expose as *Reassign work* if the business needs it.
- Real-case routing preview without a recorded decision (needs a side-effect-free read).
- Notification on Transfer (product decision; none sent today).
- System-written assignment reasons are English-only; staff Operations/Finance assignment pickers now exclude disabled
  accounts but `assign()` itself does not re-check disabled staff (API-only gap, Phase 8D).
- `/admin/access/me` is read twice per Control Center page (shell + page) — existing pattern across pages.
- Arabic terms for native review (V-9): الفرق والأشخاص (Teams & People), تفضيلات الأطباء (Clinician Preferences), القواعد
  (Rules), وضع التقييم (Evaluation mode), معاينة توصية التوجيه (Preview routing recommendation), سجل قرارات التوجيه (Routing
  decision history), سجل التعيينات (Assignment history), نقل ملكية الحالة (Transfer case ownership), تحتاج إلى مالك (Needs an
  owner), حالات فريقي (Owned by my team), مالك الحالة (Case owner), فريق الملاذ الأخير (Last-resort team), التوجيه الفعلي
  (live routing). Not final.
