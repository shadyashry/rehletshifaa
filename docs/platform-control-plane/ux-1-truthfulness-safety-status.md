# UX-1 — Truthfulness & Safety status

Date: 2026-09-23 · Branch: `codex/platform-control-plane` · Base: UX-0 `d031450`
Scope: the ten P0 items frozen in [ux-implementation-plan.md](ux-implementation-plan.md) §10. No UX-2 navigation
redesign, no Provider Workspace (UX-4), no Journey cutover, no Phase 8C work.

## Summary

| P0 | Verified against code | Status |
|---|---|---|
| P0-1 Provider people have no home | CONFIRMED | FIXED (interim landing; the final workspace is UX-4) |
| P0-2 Activation shown as possible | CONFIRMED | FIXED |
| P0-3 Shadow Assign/Reassign | PARTIALLY TRUE — audit assumption corrected | FIXED |
| P0-4 Identity-system roles missing | CONFIRMED | FIXED (read-only block; the People page is UX-5) |
| P0-5 Professional details blank after save | CONFIRMED | FIXED |
| P0-6 Controls with no real effect | PARTIALLY TRUE (stub unreachable) | FIXED |
| P0-7 Dangerous actions without confirmation | CONFIRMED | FIXED |
| P0-8 Misleading errors / re-auth | CONFIRMED — larger than the audit found | FIXED |
| P0-9 Provider-persona data-access matrix | DESIGN GATE | DONE — [provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md) |
| P0-10 Credential review missing facts | CONFIRMED | FIXED |

## New Critical finding closed in UX-1 (the fourth approved read)

**`GET /admin/access/me` returned only `access.*` decisions, evaluated at platform scope.** Every capability-gated
Control Center area therefore told authorized people "You do not have access to this area": Organizations,
Consultants, Credentials, Pricing, Availability, Coordination and Journeys. This included Provider Operations
Managers, Credential Verifiers, Journey Managers and every provider persona. Unit tests mocked `/me` with those keys,
which hid the defect.

The user approved a fourth read enhancement with these constraints:

- `AccessQueryService.mine()` reports the caller's **own** capabilities.
- It evaluates, through the existing `AuthorizationService` on the `ADMIN_WEB` and `CONSULTANT_WEB` channels, only the permission keys in the caller's active, published role assignments.
- It evaluates them at the platform and at the organizations of those assignments. It uses server-side facts only; no organization or subject comes from the request.
- It is bounded to 50 organizations.
- A held recent-auth capability is reported as held, with `recentAuthentication: true`. This comes from the same evaluation with a fresh sign-in time.
- The response is `{permission, allowed, recentAuthentication}` only: no organization IDs, assignment IDs or reasons.
- It is navigation and discoverability only; every endpoint still authorizes.
- Self- and relationship-scoped grants are not claimed.

**Performance:** one `allForSubject` read, plus version/grant reads per assignment, plus `decide()` per (organization,
granted key, channel). Real accounts hold a handful of assignments, so the cost stays bounded by the caller's own
grants.

## Per-item record

### P0-1 — Provider people had no usable home
- **Finding:** `Portal.tsx` rendered a red "Your account has no portal role assigned." for any account without a
  realm portal role, including every provider persona.
- **Evidence:** new `components/portal/NoPortalWorkspace.tsx` replaces it.
  - When the caller's own capabilities open any Control Center area, it lists exactly those areas (from the same `NAV_ITEMS` visibility), plus "Open the Control Center".
  - When nothing is set up, it shows a calm, neutral explanation (membership may be pending; who to contact).
  - No error styling; no data other than navigation links.
- **Tests:** `NoPortalWorkspace.test.tsx` (3): areas listed and never "no access"; only `/admin/access/me` is
  fetched (no case or patient data); nothing-set-up state; Arabic.
- **Remaining:** the final Provider Workspace (UX-4), gated by P0-9. The interim landing points provider people to
  the organization areas the backend already serves them (see the matrix §4 on seeded breadth).

### P0-2 — Activation appeared possible when it is not
- **Finding (confirmed):**
  - `ProviderOperationalSetupService.evaluate` always returns `commercialAcceptanceComplete=false`, so no clinician can be `readyForActivation` and no organization can activate.
  - The organization page showed an enabled primary **Activate organization**.
  - The clinician page showed a disabled primary **Activate consultant** with a generic hint.
  - The commercial row read "Needs action" in danger tone.
  - Readiness counts included a step nobody can complete.
- **Evidence:**
  - `consultant-setup.tsx` gets `activationUnavailable()`, keyed on the backend's own `COMMERCIAL_ACCEPTANCE_MISSING` blocker behind an explicit `COMMERCIAL_ACCEPTANCE_IN_RELEASE=false` switch, plus `ActivationUnavailable` with the approved copy.
  - `ActivationPanel` now implements the three Decision D cases:
    - case 3: information only;
    - case 2: a disabled button plus "Not ready to activate · Waiting for:" with the named blockers;
    - case 1: no control.
    - The confirmation states the consequence.
  - The organization Setup tab gets the same three cases (the owner and ready-clinician prerequisites are named). The commercial row reads "Not available yet" in neutral tone. An inactive owner row gets an "Open People" action. Readiness-read failures never offer activation.
  - `readinessSummary()` stops counting the unavailable step.
  - The blocker labels for commercial acceptance and the organization profile (no edit UI) now say what is true.
- **Backend gates:** unchanged; activation still cannot succeed.
- **Tests:**
  - `ConsultantOnboardingWizard.test.tsx`: case 3, no button; case 2 with named blockers; a ready clinician is still activatable behind a confirmation.
  - `ProviderOrganizationDetail.test.tsx` (+4): approved copy with no button; disabled with "Waiting for"; ready with consequence confirmation and a real POST; hidden without `provider.activate`.

### P0-3 — Shadow Assign/Reassign
- **Audit correction:** in SHADOW mode the backend **refuses** ASSIGN/REASSIGN ("Explicit routing adoption is
  required"); it does not silently record a comparison. In LIVE mode the command is authoritative: it replaces the
  PRIMARY coordinator assignment.
  - Queue items exist only for LIVE-routed cases.
  - The misleading path was **Look up a case → "Reassign"**, which opened an Assign/Reassign form showing "Mode: Shadow (comparison only)" and then failed with a raw backend error.
- **Evidence:**
  - `AssignmentQueue.tsx`: the lookup trigger reads "Check coordinator assignment".
  - For a non-LIVE case the dialog shows no command. It says the coordinator can't be changed here and points to the authoritative Staff Portal "Transfer case".
  - The mode/revision line is removed.
  - History labels: "Evaluation only — nothing changed" / "Applied to the case" (no `SHADOW`).
  - The UI never issues the SHADOW command, so there is no "Preview routing recommendation" control to relabel.
  - The authoritative paths (portal Transfer, LIVE queue Assign) are unchanged.
- **Tests:** `AssignmentQueue.test.tsx` (+1: an evaluation-only case offers no Assign/Reassign and sends no command);
  `AssignmentAudit.test.tsx` labels updated.

### P0-4 — Identity-system roles missing from the access picture
- **Finding:** User/Effective access read only platform assignments, and an empty list said "No matching access
  assignment" to working staff.
- **Evidence:**
  - Backend: `IdentityWorkspaceRoleReader` (new, read-only), implemented by `KeycloakStaffIdentityService.workspaceRoles`. It reads composite realm role mappings with the existing `view-users` service account, filters to portal workspace roles, and returns `available=false` rather than "none" when the identity system can't be asked.
  - `GET /admin/access/workspace-roles?subject=` requires platform `access.effective_access.view` and is audited as `WORKSPACE_ROLES_REVIEWED`. There is no write endpoint.
  - Frontend: `AccessGovernance.tsx` shows **Account & workspaces** ("Managed by the identity system · read-only", no controls) above **Business access** ("Managed by RehletShifaa").
  - The empty business state now reads "No RehletShifaa business roles assigned".
- **Tests:**
  - Backend: `IdentityProvisioningPortTest` (+2: filtering/status, and 404, 5xx and unconfigured never claim "none"); `CallerCapabilityIntegrationTest` (403 without the capability; POST/PUT/DELETE refused).
  - Frontend: `AccessGovernance.test.tsx` (+2).

### P0-5 — Professional details blank after save
- **Evidence:**
  - `GET /admin/providers/{org}/clinicians/{id}/profile` (`ProviderCredentialService.profile`) returns the stored registration number, speciality, sub-speciality, qualifications, jurisdiction and version. It requires `provider.update`, the same capability as the write.
  - `ProfessionalDetailsForm` reads first, shows the saved values, and edits in place from them.
  - It is not offered until the read succeeds (retry on failure).
  - The save carries the version that was read.
  - The "Saved values aren't shown" warning is removed.
- **Tests:**
  - Backend `ProviderCredentialIntegrationTest.savedProfessionalDetailsReadBackForEditorsOnly`: save → read → edit one field → others intact → a stale version is refused → a reviewer without `provider.update` gets 403.
  - Frontend wizard tests: read-back, edit in place, the exact PUT body; no form until the read succeeds.

### P0-6 — Controls with no real effect
- **Reviewed:**
  - `MyCare` `PAY_DEPOSIT` button: had no handler; the backend never emits the code, so it was unreachable. Removed with its copy.
  - Shadow Assign: see P0-3.
  - Unavailable activation: see P0-2.
  - The organization-owner "Needs action" row with no action now links to People.
  - Consultant-workspace "More actions" items navigate to the tabs they name: a real effect, not a P0 (UX-3).
- **Tests:** `MyCare.test.tsx` (+1: a `PAY_DEPOSIT` code renders no button).

### P0-7 — High-risk confirmations
Each confirmation states its consequence; the reasons already required are kept.

| Action | Before | After |
|---|---|---|
| Retire price | none | inline confirmation: not used for new estimates or quotes; sent proposals keep their price; can't be reactivated |
| Approve direct consultant for cases | none | "may become eligible for live case assignment when all other requirements are satisfied" |
| Credential Reject / Suspend | immediate | confirmation card; Reject → a new version is needed; Suspend → readiness lost immediately |
| Retire journey version | one click | confirmation: no longer offered for new journeys; existing cases stay; can't be republished |
| Remove access (role assignment) | reason only | adds "loses everything this role allows, immediately; audited" |
| Disable staff access | "Disable X's access?" | adds "They will no longer be able to sign in." |
| Role version retire, member removal | already had consequence confirmations | unchanged |

Routine actions (publish price, save) were left without confirmation. Maker/checker and independent review are
unchanged.

**Tests:** `PricingManagement.test.tsx` (+1), `CareOperations.test.tsx` (updated), `CredentialReview.test.tsx`
(Reject confirmation), `JourneyPublishPanel.test.tsx` (new).

### P0-8 — Errors and recent-authentication
- **Findings:**
  - Every fetcher redirected to sign-in immediately on `REAUTHENTICATION_REQUIRED`, with no explanation. Six of them first threw "You do not have access".
  - No page said the interrupted change was not saved.
  - `friendlyError` had no 401 branch.
  - It treated every 409 as "changed since you opened it", including business refusals such as `READINESS_BLOCKERS`.
  - It said "Nothing was lost" even for 5xx responses, where the outcome is unknown.
  - The coordination organization list said "no access" for an empty list and for load errors.
  - The Access recent-auth notice depended on a `/me` field that no longer exists.
- **Evidence:**
  - `lib/reauthentication.ts` and `components/ReauthenticationNotices.tsx`.
  - Shared `admin-api`: `ErrorNotice` explains the refusal ("Nothing was changed") and offers "Sign in again".
  - Legacy fetchers (Pricing, Availability, Coordination, Journeys, Portal) keep the redirect but mark it.
  - The Control Center shell and the portal show, once on return, "The change you were making was not saved — please make it again".
  - `friendlyError` now distinguishes:
    - re-authentication;
    - an ended session;
    - a permission refusal (nothing changed);
    - a missing item;
    - stale data (`STALE|CONCURRENT|CHANGED|STATE_CONFLICT|REVALIDATION` → nothing saved, refresh);
    - a business-rule refusal (nothing changed, with the backend reason);
    - validation (nothing saved);
    - rate limiting;
    - 503 and other 5xx (the change *may not* have been saved; refresh to check).
  - Network failures become a coded error.
  - The Access notice now uses `needsFreshSignIn` (the capability's `recentAuthentication` plus the token's `auth_time`).
- **Architecture limit:** the sign-in round trip reloads the page, so a half-filled form cannot be restored. The UI
  says so before and after.
- **Tests:** `routes.test.tsx` (+2: six failure classes are distinct; the re-auth notice has the button and no support
  code), `reauthentication.test.ts` (3), `CareCoordinationOrganizations.test.tsx` (empty vs. denied).

### P0-9 — Provider persona data-access matrix
- **Evidence:** [provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md). It is verified
  against `SecurityConfig`, `JourneyService.authorizeRead`, `PermissionCatalog` and the seeded role versions V31–V35.
  - Today **no provider persona can read patient or case data**.
  - The clinical capabilities are catalogued but not executable.
  - UX-1 added no new provider data exposure.
- **Open business decisions:** every UNDECIDED row (patient identity for practice staff, commercial visibility,
  aggregate case status for owners, and others). Seeded breadth is flagged for Phase 8D.

### P0-10 — Credential review facts
- **Evidence:**
  - `reviewDetail` now returns `ReviewDetail` = the revision + `submittedFacts {issuer, referenceNumber, issuedAt, expiresAt, jurisdiction}` (decrypted for `credential.view` holders only) + `reviewedBy/reviewedAt`.
  - It is audited as `CREDENTIAL_SUBMITTED_FACTS_VIEWED`. List and queue reads are unchanged.
  - The review page has three separate sections: **Submitted facts** ("doesn't mean they have been verified"), **Evidence documents**, and **Independent review decision**.
  - A missing fact reads "Not provided"; unavailable facts carry a do-not-verify note.
  - A past expiry is flagged.
  - "Start review" says it assigns the review to you.
  - The page reloads after a decision.
- **Credential status truthfulness:**
  - A VERIFIED revision past `expires_at` shows **Expired** everywhere it is listed (review, queue, clinician requirements), with "Submit renewal" (an existing submit capability).
  - Uploaded, submitted, in review and verified remain distinct labels.
  - `LEGACY_UNREVIEWED` is an onboarding status and is never rendered as "Verified".
- **Tests:** backend `reviewDetailShowsTheSubmittedFactsWithoutVerifyingThem` (facts, `reviewedBy` after an
  independent verify, the clinician still can't decide their own); frontend `CredentialReview.test.tsx` (8: facts vs.
  evidence vs. decision; missing facts; Reject confirmation; expired never shown as verified).

## Accessibility / RTL (changed screens)
- New confirmations are inline groups with an `aria-label` and real buttons.
- The re-auth prompt and the return notice use `role=alert` / `role=status`.
- Activation states carry icon plus text (never colour alone).
- Workspace roles are a labelled region.
- Identifiers use `<bdi>`, `dir=ltr` for reference numbers and country codes.
- Every new string exists in Arabic.
- No new fixed-direction CSS.
- Lint: the only remaining findings in the touched files are the pre-existing repository-wide
  `react-hooks/set-state-in-effect` load pattern. The new-code findings (effect reset, `Date.now` during render, a
  missing dependency) were fixed.

## Remaining (not P0)
- **P2:** the organization "Setup & activation" tab keeps its attention dot while only the unavailable step remains.
- **P2:** deposit copy ("credited to your final balance", Arabic «الوديعة») needs business confirmation (UX-8).
- **P1:** the credential "Review" link inside clinician setup (UX-3/UX-6).
- **P1:** coordination shows people and cases as identifiers (UX-7).
- **P1:** the organization profile has no edit UI (UX-6).
