# UX-6 — Credential Reviews, credential lifecycle presentation and readiness

Status: **COMPLETE** — 2026-09-24 (Claude Code). Branch `codex/platform-control-plane`, on top of UX-5 `ed13e0e`.

Scope: plan §11 row UX-6 only. No Care Coordination (UX-7) or Commercial/Journey (UX-8) redesign, no new activation path,
no credential state machine, no renewal/reminder work, no clinical privileging, no Phase 8C. Journey production intake OFF.
No migration, no authorization-model change, no new permission or role version.

## 1. Credential queue redesign

| Before (UX-5) | After (UX-6) |
|---|---|
| Frontend fan-out: organization list + every organization's detail + every organization's `…/credential-reviews` | One read: `GET /api/v1/admin/providers/credential-reviews` (open) and `?view=completed` (read only when opened) |
| Only SUBMITTED / UNDER_REVIEW; flat list; status filter | Groups from the stored revision status, each with a count: **Needs review** (SUBMITTED) · **In review** (UNDER_REVIEW) · **More information required** (MORE_INFORMATION_REQUIRED, latest version only) · **Completed (recent)** (latest 50 VERIFIED/REJECTED/SUSPENDED) |
| Row: type, clinician (resolved client-side), org, status | Row: clinician name + professional role + organization · credential type + licensing country + version + evidence count · submitted date + validity (*Expires …* / *Expiring soon · Expires in n days* / *Expired …*) · status + review ownership (*Not assigned* / *Review started by you / by {name}* / *Requested by …* / *Decided by …*) · *Open review* |
| Filters: organization, type, status | Search clinician, organization, credential type, expiry (any / expiring soon / expired / no expiry date), *Only reviews assigned to me* (In review / More info / Completed) |

A MORE_INFORMATION_REQUIRED version superseded by a newer submission is not listed (the new submission appears in Needs
review). The queue never decrypts issuer/reference numbers: those stay on the review page, whose read is audited
individually (`CREDENTIAL_SUBMITTED_FACTS_VIEWED`). Direct consultant approvals stay a separate typed view with one
sentence explaining their own model. The per-organization `GET /admin/providers/{id}/credential-reviews` is unchanged.

Queue privacy: rows carry professional data only — no patient, case, pricing or travel data.

## 2. Review page structure

`/credentials/{org}/{revision}` is now: status + validity line · **Clinician** (name → clinician Credentials tab when the
caller can view providers; professional role; provider organization) · **Submitted information** · **Evidence** ·
**Independent review** (status, reviewer, review started, last decision, reviewer's recorded basis for reviewers, the
state-specific explanation) · **Decision history** (collapsed) · **Decision** · Technical details (collapsed). It needs one
read (the enriched review detail) instead of three.

## 3. Submitted vs verified

Submitted facts sit in a neutral dashed panel headed *"Entered by the submitter. This is submitted information — not
verified information — until an independent reviewer verifies the credential."* No green/verified treatment is ever
applied because a value exists. Missing values say *Not provided*; an unreadable fact set says so and warns not to verify.

## 4. Evidence

*Evidence submitted: the document is attached and passed the security scan. Checking what it shows is part of the
independent review.* Each document shows file name (isolated LTR), type, size, uploader, upload date and the scan result;
*View document: {file name}* issues the existing short-lived, audited view URL. Evidence is never labelled verified.

## 5. Verification provenance available today

Stored per decision (`provider_credential_decisions` + revision `reviewed_by/at`): reviewer subject, timestamp, decision,
encrypted reason (the reviewer's written basis), policy version. **Not stored:** a separate verification source, an
external/primary-source reference, or which evidence items were checked. The page says exactly this (*"The platform does
not record a separate verification source or external reference."*). Structured primary-source provenance → **Phase 8D /
future credential governance** (schema + reviewer workflow decision).

## 6. Expiry

- One rule: backend `CredentialValidity` (`expired = expires_at <= now`; `effectiveVerified` = VERIFIED + dossier VERIFIED +
  not expired; `verifiedButExpired`). Readiness (`computeReadiness`, `credentialRequirementsSatisfied`) and the Clinicians
  directory now call it; the SQL readers (`ProviderCredentialEligibility`, `CredentialExpiryService`) already used the
  identical comparison (documented on the class). No inconsistency was found; duplication was removed.
- Frontend: `credentialExpired` (admin-labels) is the same rule; `credential-lifecycle.ts` derives validity and holds the
  **only** display threshold `EXPIRING_SOON_DAYS = 30`, matching the first reminder lead time the backend already sends
  (`app.credentials.reminder-days`, default 30,7,1). Day counts use calendar days in the viewer's time zone (the one
  dates are shown in); the UI stores expiry dates at 12:00 UTC so the date never shifts across time zones.
- Expired verified credentials show **Expired** (status) with *"It was independently verified, but its expiry date has
  passed, so it no longer counts"*; the verification stays in the history.
- Tests: future, expiring threshold edges, expiry today (before/after the instant, "Expires today"/"Expired today",
  tomorrow), past, no expiry — backend `CredentialValidityTest` (5) and frontend `credential-lifecycle.test.ts`.

## 7. More Information Required

Review page, clinician Credentials section and My credentials show: *More information required · The reviewer requested:
"…" · Requested on … · Responsible: Provider Operations or the clinician* (My credentials: *Your practice's Provider
Operations, or you through your practice*) · *The review resumes when a new version of this credential is submitted; the
new version returns to the review queue.* The request text is the stored decision reason — the backend now shares
exactly that reason (and only that) with the provider side. With `credential.submit`, the notice carries *Submit a new
version*. The reviewer's form for this outcome is its own first-class panel (*What is needed*, stated audience).

## 8. Rejected / suspended

- Rejected: separate danger action with its own panel (*"This is not a request for missing information…"*), reason
  required (reviewer-only). Provider side sees *Version n was rejected. This requirement isn't met until a new version is
  verified* and *Submit a new version* (submission of a new revision is the existing, supported path — no new button type).
- Suspended: status, date and actor in history; reviewer-only reason; copy states it suspends the credential only — not
  the organization membership, account or case eligibility controls. Restore (existing `RESTORE`) only for holders of
  `credential.suspend`, with *"It counts again if it has not expired. Readiness is re-checked; the clinician is not
  activated automatically."* A suspended lineage stays **Suspended** even when a newer version is submitted (directory
  fixed to match readiness).

## 9. Legacy records

Recognised by onboarding status `LEGACY_UNREVIEWED` or an unadopted enrollment (`credential_policy_cutover_at` null). V34
imported no legacy credential revisions, so nothing can surface as Verified; the Credentials section now says *"Legacy
record — independent review not recorded. An earlier approval under the Direct model is not an independent provider
credential review, and it is not shown here as verified."* No state is upgraded.

## 10. Readiness UX (clinician)

- Backend readiness remains the only source. Read addition: a not-yet-satisfied, submitted requirement now names why —
  `CREDENTIAL_MORE_INFORMATION_REQUIRED`, `CREDENTIAL_REJECTED`, `CREDENTIAL_SUSPENDED` (else the existing
  `CREDENTIAL_AWAITING_VERIFICATION`). Only codes/messages changed; every boolean, `credentialReady` and
  `readyForActivation` are computed exactly as before.
- Overview: **Credential status** (e.g. *More information required · 1 of 3 verified · 1 needs more information*), **Case
  eligibility**, and a new **Operational readiness** block grouped from the checklist sections (Account, Professional
  Profile, Credentials Submitted, Independent Credential Review, Prices, Schedule, Routing, Activation) with an overall
  *Needs attention* / *Ready to activate* / *Activated for cases*. No raw codes.
- Checklist: credential sections read *All submitted* / *All verified* instead of *Complete*; a suspension is named.
- Credentials section: *n of m verified* + attention counts; per credential status, validity, a newer version's state
  (*"the verified version keeps counting meanwhile"*, V-4), the information request, and *Show details* (submitted
  information, evidence, history). Review happens only via *Open in Credential Reviews* (reviewers).

## 11. Organization readiness

Organization Setup is its own list, not the clinician list: owner, clinical team, practice staff, **organization profile /
legacy record review** (new, from `PROVIDER_PROFILE_INCOMPLETE`), credentials (*Every required credential is independently
verified* / *n clinician(s) still need independently verified credentials*), prices & schedule, **routing** (new, from
`ROUTING_INCOMPLETE`), commercial acceptance. Fixed: with no clinicians the page said *Checking…* forever — it now says
*Add a clinician first*. Decision D unchanged: case 3 shows *Activation isn't available yet* with no button.

## 12. Provider clinician readiness / activation

Unchanged truth: *Not ready for cases · Provider activation isn't available in this release* while commercial acceptance
is fail-closed; a backend-ready clinician reads *Ready to activate* / *Ready — not activated yet*, never *Ready for cases*.
Verification never changes eligibility wording.

## 13. Direct clinicians

Kept on their own model (profile-level approval = credential check + case approval). Credential Reviews' Direct view says
so; labels unchanged (*Awaiting approval*, *Approved for cases*, *Not taking cases* when approved but unavailable). Direct
approval is not renamed activation; provider lifecycle UX is not applied to Direct records.

## 14. Provider Workspace — My credentials

Same Credentials section, `audience="self"`, read-only (`canSubmit=false`, no review link). The clinician sees their own
credential facts (under Details), status, validity/expiry, history outcomes and the reviewer's information request. They
do **not** see reviewer names, reasons for verify/reject/suspend or other clinicians' data — the backend withholds them
(`reviewerView=false` for the owner, even if the owner also holds review access). The attention item now points to the
request. No self-submission was added.

## 15. Renewal

No renewal/reminder workflow was built. The old *Submit renewal* label (UX-3) is now *Submit a new version* — the existing
new-revision submission — and appears only where a new version is needed (not submitted, expired, rejected, more
information). No "Renew credential", "Renewal due" or renewal messaging. V-4 verified: an effective verified revision keeps
counting while a newer revision is pending or rejected (`rejectedRenewalPreservesEarlierVerifiedCredential…`), and the UI
now shows that instead of hiding it behind the newer version's status.

## 16. Clinical privileging gap

Unchanged: the model has credential validity only. No specialties/procedures/"can treat" data exists; nothing was added.
Professional credential validity ≠ clinical scope → **Phase 8D / future business capability**.

## 17. Authorization

No authorization change. Decisions still re-authorized per call (`credential.review/verify/request_information/reject/
suspend`, recent auth for verify/reject/suspend, self and submitter denied). The new queue lists only organizations where
the caller has an active membership **and** a `credential.review` decision (same check as the per-organization queue).
The review-detail visibility split uses `credential.review` for the organization and excludes the credential's owner.

Tests (`ProviderCredentialIntegrationTest`): Provider Operations cannot Start review, Verify or Reject; the owner role
without review grant is denied; a reviewer cannot act on another organization's revision (state untouched); Start review
assigns (`UNDER_REVIEW`, dossier OPEN, not credential-ready); Verify only from UNDER_REVIEW; REQUEST_INFORMATION →
MORE_INFORMATION_REQUIRED; REJECT → REJECTED; SUSPEND → dossier SUSPENDED; reasons retained encrypted per decision;
provider-side detail shows only the information request, reviewers see all reasons.

## 18. Tests

- Backend focused: `CredentialValidityTest` 5, `ProviderCredentialIntegrationTest` 13 (3 new), `ProviderClinicianDirectory
  IntegrationTest` 4 (1 new) — all pass. Full `mvn -o test`: **528 tests, 0 failures, 0 errors, 1 skipped** (UX-5: 519).
- Frontend: `pnpm typecheck` clean; `pnpm test` **386 tests / 48 files** (UX-5: 345 / 46). Rewritten
  `CredentialQueue.test.tsx` (10) and `CredentialReview.test.tsx` (16); new `credential-lifecycle.test.ts`,
  `CredentialRequirements.test.tsx` (7); `ClinicianPage.test.tsx` +6 readiness combinations; `ProviderOrganizationDetail
  .test.tsx` +2.
- E2E: new `e2e/credential-reviews.spec.ts` **2/2** (EN, AR) + `access-governance.spec.ts` 2/2 against the rebuilt stack.
- Flyway: no migration.

## 19. Live sanity review (limited; not Phase 8C)

Canonical tunnel rebuild of backend + frontend; `credential-reviews.spec.ts` drives the real built UI with a synthetic
session and fixture reads; every write is refused by the route handler and asserted to be zero. Reviewed (EN and AR):
queue desktop (Needs review) and 390 px (More information required); review pages Submitted, Under review (+ Verify
confirmation, 390 px), More information required, Verified (expiring), Expired; clinician Overview readiness; clinician
Credentials; My credentials. No horizontal overflow, one h1, no writes. Fixed from screenshots: readiness list column
alignment; file type/size isolated in RTL; Arabic requirement names (policy display names are stored in English). No test
writes to the live database were made.

Accessibility baseline: statuses always carry text (validity has words and an icon, never colour alone); queue groups are
pressed-state buttons with counts in their names and the list is labelled by the group; decision panels are labelled groups
with an error summary that receives focus and links to the field; after a decision focus moves to the resulting status and
a `role=status` region announces it; evidence buttons are named *View document: {file}*; history is a native disclosure;
one h1, h2 per section. Mobile: queue rows become stacked cards with visible field labels (≤900 px), single column ≤640 px.

## 20. Remaining debt (UX-7+ / later)

- **Phase 8D / future:** primary-source verification provenance (§5); clinical privileging (§16); cross-organization
  expiring-credentials view and renewal workflow (reminders exist only as clinician emails); revocation (`REVOKED` has no
  command); reviewer-assignment/hand-over (reviewer = whoever started the review).
- Policy display names are English-only in the database (Arabic falls back to the frontend code map).
- Organization profile edit UI (existing `PUT /admin/providers/{id}`) still not offered; the blocker says it cannot be
  completed from the Control Center (plan row UX-6 mentioned it; not required by the UX-6 brief — deferred to UX-8 polish).
- Queue is not paged; completed view is capped at 50 (sufficient for current volumes).
- **Arabic review list additions (V-9, before Phase 8C):** مراجعة التراخيص والمؤهلات (Credential Reviews, kept from UX-2
  nav) · تحتاج إلى مراجعة · قيد المراجعة · مطلوب مزيد من المعلومات · المكتملة · المعلومات المقدَّمة · المستندات · المراجعة
  المستقلة · سجل القرارات · أساس التحقق · تنتهي قريبًا · انتهت الصلاحية · إرسال نسخة جديدة · الجاهزية التشغيلية · إثبات
  الهوية أو الصفة المهنية · المؤهل المهني · إثبات صفة الاستشاري · سجل مستورد — لم تُسجَّل مراجعة مستقلة.

## 21. Acceptance

| Gate | Result |
|---|---|
| Queue understandable | YES — groups, counts, names, validity, ownership |
| Submitted facts not presented as verified | YES |
| Evidence distinct from verification | YES |
| Independent reviewer role protected | YES — no authorization change; tests |
| Review decisions truthful | YES — per-decision effect copy; Verify never claims case eligibility |
| Expiry visible and correctly derived | YES — one rule backend + frontend, tested |
| Expired credentials cannot look valid | YES |
| Legacy unreviewed cannot look verified | YES |
| More Information Required actionable | YES — request, responsible, resumption, action |
| Credential status ≠ operational readiness | YES |
| Readiness uses backend truth | YES — only blocker explanations added |
| Organization / provider activation truthful | YES — Decision D unchanged |
| No renewal / privileging invented | YES |
| Workspace shows no reviewer-only information | YES — enforced server-side |
| Mobile / RTL / a11y sanity | YES (baseline; formal Phase 8C) |
| Frontend / backend tests pass | YES |
| No UX-7+ redesign | YES |

### UX-6 COMPLETE: YES
### UX-7 READY: YES

What remains is Care Coordination UX (UX-7); the open credential items above are future backend/governance capabilities,
not unresolved safety issues in the current credential or readiness UX.
