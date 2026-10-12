# End-to-end coverage matrix

_Snapshot 2026-10-13 at `9a2304b` (`codex/platform-control-plane`), mapped against
[qa-test-protocol.md](../qa-test-protocol.md) **v1.1** (19 use cases, 17 security checks). Replaces the 2026-09-13
release-candidate package (removed 2026-10-13; recoverable from git at `9a2304b`)._

Each row names the tests that prove the test case today, at three depths:

| Depth | Meaning | Runs with |
|---|---|---|
| **Live** | Real browser → gateway → backend → Keycloak/Mailpit on the tunnel stack | `pnpm test:e2e` with the live env (AGENTS.md §5), `pnpm test:agentic` |
| **UI** | Playwright against the built frontend with route-mocked API | `pnpm test:e2e` |
| **Backend** | Spring integration test (H2) | `mvn -o -q test` |

Status: **Covered** = live or UI proof of the journey plus backend proof of the rule (for SEC rows: the rule is fully
asserted) · **Partial** = rule proven in the backend but the journey is not, or a branch is missing · **Gap** = no
automated proof.

## Summary

| Status | Use cases | Security checks |
|---|---|---|
| Covered | UC-01, 02, 03, 06, 07, 10 | SEC-4, 5, 7, 10, 12, 14, 15, 16 |
| Partial | UC-04, 05, 08, 09, 11, 12, 13, 14, 15, 16, 17, 18, 19 | SEC-1, 2, 3, 6, 8, 9, 11, 13, 17 |

Highest-value gaps, in order:
1. **Document upload** — no browser test uploads a file through presign → MinIO → ClamAV (UC-01, SEC-13).
2. **After arrival** — UC-11 → UC-12 is proven in the backend only; no live journey past `TRAVEL_COORDINATION`.
3. **WhatsApp coordination (UC-15, UC-16, UC-18)** — strong backend coverage, no end-to-end run; live verification
   with the Meta test number is still pending.
4. **Staff screens with no browser test** — Finance refund/waiver, identity-reviewer decision, referrals, credentialing.

SEC-10 and UC-12 were closed on 2026-10-13; the SEC-10 test found and led to the fix of QA-SEC10-001 (below).

## Use cases

| ID | Journey | Live | UI | Backend | Status | Missing |
|---|---|---|---|---|---|---|
| UC-01 | Anonymous submission + routing outcome | `uat-walkthrough-live`; `agentic/case-submission` (self EN, relative AR) | `case-flow` (wizard, consent, contact validation, retry continues same case, representative, phone + AR) | `CaseServiceTest` (submit, repeated submission); `CaseControllerTest.rejectsMissingConsent`; `UatDefectCorrectionsTest.aNewCaseRoutedToACoordinatorOnSubmitMails…`, `.anUnownedNewCaseReachesTheTeamQueue…` | Covered | No document upload in any browser test |
| UC-02 | Status via secure link + OTP | `uat-walkthrough-live` | `status-access`; `track-case` | `SecureJourneyCorrectionsTest.statusAccessIsOnlyCreatedAfterSubmission`, `.statusVerificationDoesNotAdvanceCaseStatus`; `PatientConversionLayerTest.whatsappOtpSetsPhoneVerifiedOnly`, `.emailOtpSetsEmailVerifiedOnly` | Covered | — |
| UC-03 | Routed intake, claim, consultant assignment | `uat-walkthrough-live`; `portal-live`; `portal-gateway-live` | `portal-ux` (review before claim, lost claim race, lead-only queue); `staff-home` (one assign entry, EN/AR) | `ConsultantVirtualClinicTest.eligibilityRequires…`; `SecureJourneyCorrectionsTest.coordinatorClassifiesCaseAndCanOnlyAssignAMatchingConsultant`; `OperationalWorkflowTest` (accept, decline, other consultant cannot accept); `CoordinationIntegrationTest` | Covered | `ROUTING_POLICY_MISSING` refusal not asserted by name |
| UC-04 | Consultant review and decision | `uat-walkthrough-live` (Accept) | `portal-ux` (pending assignment from My Work); `portal-reliability` | `SecureJourneyCorrectionsTest` (accept with estimates, catalogue price enforced, off-list → Finance, not suitable, request info, return, draft, reason required, retry) | Partial | Only Accept runs in a browser; no Arabic consultant journey |
| UC-05 | Build and release preliminary proposal | `uat-walkthrough-live` (catalog path); `operations-gate-live` (Operations step) | `portal-ux` (recommendation in proposal panel) | `JourneyServiceIntegrationTest.fastLaneReleasesCatalogOnly…`, `.manualNoTravelRequiresFinance…`, `.proposalConvertsEgpBase…`; `SecureJourneyCorrectionsTest` (consultant currency, explicit other currency, no silent EGP fallback) | Partial | Finance approval never runs in a browser; manual + travel (both gates) has no test |
| UC-06 | Decision on the estimate — A English acknowledgement, B Arabic coordinator-recorded | A: `uat-walkthrough-live` | A: `proposal-otp`, `proposal-responsive`, `pre8c-commercial-copy`, `status-proposal`; B: `arabic-proposal-decision` (no dead acknowledgement, drawer asks coordinator, coordinator records, representative pick, provenance shown) | `PatientConversionLayerTest.acknowledgementCreatesExactlyOneOnboardingAndDeposit`; `SecureJourneyCorrectionsTest` (statement required, expired/superseded refused, decline/changes need none); `AssistedProposalDecisionTest` (same effect, attestation, one authorised representative, lapsed version) | Covered | Path B has no live run |
| UC-07 | Profile completion and account setup | `my-care-live` | `activation-flow` (prefill, setup + resend, already-active → deposit, phone, AR) | `PatientActivationJourneyTest` (prefill, consents, replay, cancelled case, no payment, setup required); `PatientIdentityAndAccountTest`; `PostActivationLandingTest` | Covered | — |
| UC-08 | Representatives, identity, readiness | — | `my-care` (care for a relative, representative's own case, identity pending / rejected + resubmit) | `PatientConversionLayerTest` (representative scope/expiry, payer no access, identity review audited + recent auth, readiness never invents evidence) | Partial | Reviewer decision never runs in a browser; "identity required only with a travel package" not asserted |
| UC-09 | Deposit receipt, refund, waiver | `my-care-live`; `operations-gate-live` (idempotent settlement) | `activation-flow` (settled deposit) | `JourneyServiceIntegrationTest.depositLedgerTracksPartialPaymentsAndRefunds…`; `PatientActivationJourneyTest` (identical receipt ignored, settlement continues journey, no refund window on new deposits); `PatientConversionLayerTest` (waiver recent auth, coordinator cannot waive) | Partial | Refund and waiver never run in a browser |
| UC-10 | Readiness gate for Operations and travel | `operations-gate-live` | — | `PatientConversionLayerTest.nonCancellableCommitmentRejectedWhenNotReady`, `.aMissingOnboardingHoldsAReadyPaidCase…`; `CoordinatorCaseActionsTest.operationsAssignmentIsRefusedWhileTheDepositIsUnsettled…`, `.theCoordinatorTransitionEndpointCannotForceTreatmentCoordination`, `.aDepositSettledBeforeActivationHolds…` | Covered | — |
| UC-11 | Arrival → final assessment → final quote | — | `pre8c-commercial-copy` (final quote wording) | `JourneyServiceIntegrationTest.finalQuoteStaysAtArrivalConfirmedAndReducesWithScope`; `NotificationOutboxProcessorTest.aFinalQuoteNotice…` | Partial | No browser journey; deposit credit on the final quote not asserted |
| UC-12 | Consent, treatment, discharge, follow-up | — | — | `JourneyServiceIntegrationTest.treatmentRequiresProcedureConsentThenSucceeds`, `.emergencyOverrideAllowsTreatmentAndCreatesReviewTask`, `.treatmentNeedsTheAcceptedFinalQuoteAsWellAsProcedureConsent`, `.dischargeNeedsACleanDocumentOfThisCaseAndFollowUpOnlyComesAfterDischarge` (no / pending / quarantined / other case's document refused; follow-up only after discharge) — all pass | Partial | No browser journey |
| UC-13 | Case messages, tasks, ownership transfer | — | `care-coordination` (team queue, transfer, history, EN/AR); `portal-ux` (failed send keeps draft); `portal-p2-pass-3` (unsent-text guard) | `SecureJourneyCorrectionsTest` (thread membership, internal flag, lead rebalance, transfer notifies once); `ReplyCoverIntegrationTest.onlyTheOwnerRepliesWhenNobodyCovers`; `BypassRemovalNegativeTest.taskCancelAndReassignRequireSupervision…` | Partial | The non-owner refusal on the patient thread is not exercised in a browser |
| UC-14 | Practitioner credentialing | — | — | `JourneyServiceIntegrationTest.credentialDecisionRequiresIndependentReviewer…`; `ConsultantVirtualClinicTest.capabilitiesAreNeverSelfApproved`; `SecureJourneyCorrectionsTest.expiredCredentialRemoves…` | Partial | Control Center consultant/credential screens have no browser test |
| UC-15 | WhatsApp intake conversation → case | — | — | `IntakeConversationIntegrationTest` (owner by language, one per sender, queue + one claim wins, window, returning owner, limit); `CaseHandOffIntegrationTest` (continuity, introduced by name); `WhatsAppInboundProcessorTest` | Partial | No end-to-end run; needs the Meta test setup |
| UC-16 | One voice, covers, reply timers, out of hours | — | — | `ReplyCoverIntegrationTest` (8: cover only, revoke, no overlap, who may set, link resend); `ReplyTimerIntegrationTest` (7: remind → lead → managers, working time, out of hours once, idle close) | Partial | No end-to-end run; simultaneous sends not asserted |
| UC-17 | Consultant referral: transfer, second opinion | — | — | `ConsultantVirtualClinicTest` (confirm/accept, declined transfer, second opinion read + opinion only, only owning coordinator confirms) | Partial | No browser test |
| UC-18 | A coordinator leaves | — | — | `CoordinationIntegrationTest.aCoordinatorWhoLeavesHandsTheirCases…`, `.withNobodyElseEligibleTheCaseGoesToTheQueue…`, `.aRoleThatEndedOnItsDateIsSweptLikeADeparture`; `CoordinatorDepartureIntegrationTest` (6) | Partial | No browser test |
| UC-19 | Staff invitation and workforce hierarchy | `governance-bootstrap-live`; `mfa-live`; `restore-gate-live` | `staff-activation` (invite → ACTIVE, MFA required, never a patient); `staff-home` | `WorkforceHierarchyIntegrationTest`; `WorkforceRoleAssignmentIntegrationTest` (only lead, SoD, next-request revocation); `PortalExperienceTest.leadSupervisionIsLimitedToTheirOwnTeam…`; `BypassRemovalNegativeTest.leadsReadOnlyCasesOfTheirOwnTeam` | Partial | Team-scoped case visibility never runs in a browser |

## Security checks

| ID | Check | Proof | Status | Missing |
|---|---|---|---|---|
| SEC-1 | 5 wrong OTPs lock the challenge | `SecureJourneyCorrectionsTest.wrongOtpIsRejectedAndLockedAfterMaxAttempts` | Partial | Proposal-link challenge lock not asserted separately |
| SEC-2 | >5 OTP sends/hour → 429 | `SecureJourneyCorrectionsTest.caseAccessChecksTheOpenCodeLimitsSends…`; `gateway.spec`; `track-case` | Partial | Proposal-link resend cap not asserted |
| SEC-3 | Expired OTP / grant rejected | `SecureJourneyCorrectionsTest.caseAccessChecks…ExpiresGrantsAndLinks`; `PatientActivationJourneyTest.anInvalidOrExpiredLinkIsRejected` | Partial | Proposal 30-min view-grant expiry not asserted |
| SEC-4 | URL alone never shows content | `SecureJourneyCorrectionsTest.secureLinkSummaryHidesSensitiveDataAndViewNeedsAGrant`; `PatientActivationJourneyTest.sensitiveDataRequiresAVerifiedGrant`; `proposal-otp` | Covered | — |
| SEC-5 | Status-link recovery does not enumerate | `SecureJourneyCorrectionsTest.patientCanRecoverStatusLinkWithoutCaseEnumeration`; `track-case` | Covered | — |
| SEC-6 | Patient A cannot open patient B | `PatientConversionLayerTest.patientCannotAccessAnotherPatientsOnboarding`; `PatientActivationJourneyTest.aGrantCannotBeUsedAgainstAnotherPatientsCase`; `BypassRemovalNegativeTest` | Partial | No signed-in two-patient check through the gateway |
| SEC-7 | No caller-supplied OTP destination | `PatientConversionLayerTest.arbitraryOrUnavailableChannelIsRejected` | Covered | — |
| SEC-8 | Coordinator cannot waive / verify identity / record payment | `PatientConversionLayerTest.coordinatorCannotWaiveDeposit`, `.coordinatorCannotMarkIdentityVerified` | Partial | No dedicated "coordinator records a payment" negative test |
| SEC-9 | Step-up for waiver and identity review | `PatientConversionLayerTest.financeWaiverRequiresRecent…`, `.identityReviewRequiresRecent…`; `AuthorityIntegrationTest.stepUpAndNextRequestRevocationApply`; `mfa-live` | Partial | Not exercised on the waiver / identity-review screens |
| SEC-10 | No net cost, margin, profit or Finance reason on patient screens/payloads | `SecureJourneyCorrectionsTest.noPatientPayloadCarriesProviderCostMarginProfitOrFinanceReasons` (proposal summary + view, status view, my cases, my case, deposit, readiness; by field name and by value) | Covered | — |
| SEC-11 | Profile / setup / status-link replay | `PatientActivationJourneyTest.replayedActivationChangesNothing`, `.activeProfileReplayDoesNotReplaceAccountEmail`, `.aStatusLinkCannotBeReplayedAgainstOnboarding` | Partial | Keycloak setup-link reuse not tested |
| SEC-12 | Booking before readiness → `COORDINATION_NOT_READY` | `PatientConversionLayerTest.nonCancellableCommitmentRejectedWhenNotReady`; `operations-gate-live` | Covered | — |
| SEC-13 | Bad uploads (web and WhatsApp) | `DocumentServiceTest` (MIME spoof, oversize, malware, scanner outage); `ClamAvDocumentInspectorTest`; `WhatsAppInboundProcessorTest.noScannerVerdictRetries…` | Partial | No end-to-end upload |
| SEC-14 | Practice manager reaches no case | `ConsultantVirtualClinicTest.aPracticeManagerNeverReachesCasesAndLosesTheClinicWhenRevoked` | Covered | — |
| SEC-15 | Admin / auditor / support have no case bypass | `BypassRemovalNegativeTest.administratorsAndAuditorsHaveNoCaseReadBypass`; `RolePolicyTest.administratorsAuditorsAndSupportHaveNoCase…`; `CoordinationIntegrationTest.readModelsAreNamedReadOnlyForTheAuditor…` | Covered | — |
| SEC-16 | Realm role or token claim grants nothing | `ArchitectureRulesTest.tokensCarryNoBusinessAuthority`; `WorkforceRoleAssignmentIntegrationTest.sod01AndAuthorityAreResolvedFromDatabaseNotRealmRoles`; `WorkforceFoundationIntegrationTest.readsNeedAnAdministratorOrAuditorAssignmentNotARealmRole` | Covered | — |
| SEC-17 | Non-owner / second coordinator cannot send | `IntakeConversationIntegrationTest.onlyTheOwnerRepliesAndOnlyInsideTheWindow`; `ReplyCoverIntegrationTest.whileCoveredOnlyTheCoverRepliesAndTheOwnerReads` | Partial | A true simultaneous-send race is not asserted |

## Not in the protocol (no UC row)

| Area | Proof |
|---|---|
| Gateway budgets and correlation ids | `gateway.spec` (8) |
| Care Journeys designer and runtime | `Journey*Test`; UI `ux8-commercial-journeys`; maker/checker in `JourneyGovernanceDeepQaTest` |
| Public site quality (layout, RTL, a11y, visuals) | `home-*`, `care-areas-visual`, `consultants-visual`, `how-it-works-visual`, `public-batch-3`, `a11y` |

## Defects found by this matrix

| ID | Severity | Found by | Defect | Status |
|---|---|---|---|---|
| QA-SEC10-001 | Critical (money) | SEC-10 test, 2026-10-13 | `GET /api/v1/patient/cases/{id}` (`CaseWorkspaceQueryService.workspace`) returns the approved clinical review to the patient with `costEstimates[].estimatedCost` (the provider's EGP price, 390,000 in the test) and `quotedCost` (the same in the proposal currency, 7,800 USD). The patient UI renders only `recommendedTreatment` and `risksAndLimitations`, so the leak is in the payload, visible in browser dev tools. The secure-link proposal and status payloads were clean. | **Fixed 2026-10-13**: patients get the review without `costEstimates` (`CaseWorkspaceQueryService.forPatient`); full backend suite 687 tests, 0 failures |

## Known harness issues

Carried over from the removed release-candidate defect register; neither is a product defect.

| ID | Issue | Effect |
|---|---|---|
| QA-ENV-001 | Firefox and WebKit Playwright browsers are not installed on the QA host | `playwright.qa.config.ts` (cross-browser pack, `e2e/qa/qa-09-critical-crossbrowser.spec.ts`) runs Chromium only until `pnpm exec playwright install firefox webkit` |
| QA-HARNESS-002 | The cross-browser pack imports specs that write screenshots to fixed paths | Evidence-file collisions across projects; assertions still pass |

Parallel live runs sharing the public rate budget and Mailpit (former QA-HARNESS-001) are covered by the "run live
checks one at a time" rule in the protocol §8.

## Protocol v1.1 changes (2026-10-13)

The v1.0 protocol (2026-09-11) no longer matched the implementation. v1.1 corrected:

| # | Was | Now | Source |
|---|---|---|---|
| D1 | `DOCTOR`, `COORDINATOR_LEAD`, `CREDENTIALING_ADMIN`, `SYSTEM_ADMIN`, `AUDITOR` as Keycloak realm roles | 21-role platform catalogue; authority from the database; leads via hierarchy | `Role.java`, `RolePolicy` |
| D2 | Use `credential-admin` for identity review | `SYSTEM_ADMINISTRATOR` has no identity power; `patient-identity-reviewer` is seeded (invited) | `LocalDemoDataSeeder` |
| D3 | Coordinator claims every case | Routing assigns and starts intake; claim only from the queue; WhatsApp continuity first | CL2 `17770bf`, S4 `b378dd1` |
| D4 | Reassign outcome | Referrals (UC-17) | `consultant-virtual-clinic.md` |
| D5 | Same acknowledgement in both languages | Arabic: coordinator-recorded decision (UC-06 B) | `6315f07`, `09f7390` |
| D6 | `?activate=` while signed in | `/activate/{token}` + Keycloak setup email | CL3 `1b3f4bd` |
| D7 | Legacy deposit-only gate | One readiness model, no exemption; identity only with a travel package | CL3 `1b3f4bd`, `CustomerReadinessService` |
| D8–D9 | No WhatsApp coordination | UC-15, UC-16, UC-18; SEC-17 | S0–S6, `8d32e0b`, `9a2304b` |
| D10 | Refund window | No refund window on new deposits (legal decision pending) | `PatientActivationJourneyTest` |

Also corrected: `end-to-end-workflows.md` (legacy exemption) and `test-accounts-and-e2e-journey.md` (platform roles,
invited accounts, Control Center routes).

## Recommended next steps

1. **SEC-10 assertion** (backend + UI): serialize the public proposal and status DTOs and assert the internal
   commercial fields are absent; check `/proposal/{token}` and My Care.
2. **UC-12 backend tests**: discharge refused without a clean document; follow-up plan → `FOLLOW_UP`.
3. **Live "after arrival" journey**: extend the `operations-gate-live` fixture through arrival → final quote →
   consent → treatment → discharge → follow-up.
4. **Document upload in the browser**: one live spec that uploads a PDF in the intake and waits for the clean verdict.
5. **WhatsApp live verification** (UC-15, UC-16, UC-18) with the Meta test number, then one live spec.
6. **Agentic bug bash** on Finance, identity-reviewer, referral, credentialing and Conversations screens; turn each
   confirmed bug into a fixed spec.
