package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.PublicCaseDtos.PublicCaseStatus;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.RequestedItem;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * UAT defect-correction pass (defects #2–#12): the business state behind each screenshot.
 *
 * <ul>
 *   <li>Proposal visibility is one backend rule shared by Check Case Status and the patient case page, and
 *       it names the exact current patient-visible version.</li>
 *   <li>The consultant's proposal currency survives to the patient's lines and totals; no EGP fallback.</li>
 *   <li>Work priority is derived from real conditions; a new case is never HIGH by default.</li>
 *   <li>Notifications follow the work: the consultant's address for consultant work, the accountable
 *       coordinator for coordinator work, the shared queue for unowned work — idempotently.</li>
 *   <li>Once the case is with the consultant the coordinator keeps utilities but not workflow commands.</li>
 * </ul>
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class UatDefectCorrectionsTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired ProposalAccessService proposalAccess; @Autowired StaffWorkService work; @Autowired CaseHandoffService handoff;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ================= A/B/C/D — proposal access from Check Case Status and the patient case page =================

    @Test void checkCaseStatusOffersNoProposalActionBeforeAProposalIsReleased() throws Exception {
        UUID caseId = ownedCase("+254700000501", "uat-a@local.test");
        String token = statusToken(caseId);
        var grant = verifyStatusLink(token, "+254700000501");
        PublicCaseStatus view = publicCases.view(token, grant);
        assertThat(view.proposal().state()).isEqualTo("NONE");
        assertThat(view.proposal().action()).isNull();
        assertThat(view.proposal().versionId()).isNull();
        // The action itself is refused by the backend, not merely hidden by the page.
        assertThatThrownBy(() -> publicCases.proposalAccess(token, grant)).isInstanceOf(ApiException.class).hasMessageContaining("No proposal is available");

        // Consultant recommendation recorded, proposal drafted but not released: "being prepared", never a draft id.
        toClinicalRecommendation(caseId, "USD");
        authenticate("coordinator-subject", "COORDINATOR");
        var draft = journey.createProposal(caseId, draftRequest(approvedReview(caseId)));
        em.flush(); SecurityContextHolder.clearContext();
        PublicCaseStatus preparing = publicCases.view(token, grant);
        assertThat(preparing.proposal().state()).isEqualTo("PREPARING");
        assertThat(preparing.proposal().action()).isNull();
        assertThat(preparing.proposal().versionId()).isNull();
        assertThat(draft.status()).isEqualTo("CLINICALLY_APPROVED");
        assertThatThrownBy(() -> publicCases.proposalAccess(token, grant)).isInstanceOf(ApiException.class);
    }

    @Test void checkCaseStatusOpensTheExactReleasedVersionWithoutASecondCode() throws Exception {
        UUID caseId = ownedCase("+254700000502", "uat-b@local.test");
        UUID versionId = releasedUsdProposal(caseId);
        String token = statusToken(caseId);
        var grant = verifyStatusLink(token, "+254700000502");

        PublicCaseStatus view = publicCases.view(token, grant);
        assertThat(view.proposal().state()).isEqualTo("READY");
        assertThat(view.proposal().action()).isEqualTo("REVIEW_PROPOSAL");
        assertThat(view.proposal().versionId()).isEqualTo(versionId);
        assertThat(view.proposal().currency()).isEqualTo("USD");

        ProposalAccessHandoff handoffCredentials = publicCases.proposalAccess(token, grant);
        em.flush();
        assertThat(handoffCredentials.versionId()).isEqualTo(versionId);
        // The credentials open the proposal page directly: full view and a decision, on this version only.
        PublicProposalView proposal = journey.viewProposal(handoffCredentials.token(), handoffCredentials.grant());
        assertThat(proposal.versionNumber()).isEqualTo(view.proposal().versionNumber());
        assertThat(proposal.currency()).isEqualTo("USD");
        assertThat(proposal.decided()).isFalse();
        // The link the patient was originally sent is untouched: nothing was revoked to make room.
        assertThat(count("SELECT count(*) FROM proposal_share_tokens WHERE proposal_version_id=? AND revoked_at IS NULL", versionId)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CASE_STATUS_PROPOSAL_OPENED'", caseId)).isEqualTo(1);
    }

    @Test void aForgedGrantOrAnotherCaseLinkCannotOpenTheProposal() throws Exception {
        UUID caseId = ownedCase("+254700000503", "uat-d1@local.test");
        releasedUsdProposal(caseId);
        UUID otherCase = ownedCase("+254700000504", "uat-d2@local.test");
        String token = statusToken(caseId);
        String otherToken = statusToken(otherCase);
        var otherGrant = verifyStatusLink(otherToken, "+254700000504");
        // The other patient's verified session cannot be pointed at this case's link…
        assertThatThrownBy(() -> publicCases.proposalAccess(token, otherGrant)).isInstanceOf(ApiException.class);
        // …and their own link has no proposal to open.
        assertThatThrownBy(() -> publicCases.proposalAccess(otherToken, otherGrant)).isInstanceOf(ApiException.class).hasMessageContaining("No proposal is available");
        assertThatThrownBy(() -> publicCases.proposalAccess(token, "not-a-grant")).isInstanceOf(ApiException.class);
    }

    @Test void thePatientCasePageCarriesTheSameProposalAnswerAndOnlyTheOwnerCanReadIt() throws Exception {
        UUID caseId = ownedCase("+254700000505", "uat-c@local.test");
        linkPatient(caseId, "patient-c");
        authenticate("patient-c", "PATIENT");
        CaseWorkspace before = journey.workspace(caseId);
        assertThat(before.patientProposal().state()).isEqualTo("NONE");
        assertThat(before.proposal()).isNull();
        SecurityContextHolder.clearContext();

        UUID versionId = releasedUsdProposal(caseId);
        authenticate("patient-c", "PATIENT");
        CaseWorkspace after = journey.workspace(caseId);
        assertThat(after.patientProposal().state()).isEqualTo("READY");
        assertThat(after.patientProposal().action()).isEqualTo("REVIEW_PROPOSAL");
        assertThat(after.patientProposal().versionId()).isEqualTo(versionId);
        assertThat(after.proposal().versionId()).isEqualTo(versionId); // the same version, never a draft
        // One rule, both surfaces: the public link answers identically.
        assertThat(proposalAccess.state(caseId).versionId()).isEqualTo(versionId);

        // Another patient can neither read this case nor decide its proposal.
        authenticate("patient-other", "PATIENT");
        assertThatThrownBy(() -> journey.workspace(caseId)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> journey.decideProposal(caseId, versionId, new ProposalDecisionRequest("ACKNOWLEDGED", List.of(), null)))
                .isInstanceOf(ApiException.class);
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?", versionId)).isZero();
    }

    // ================= E/F — currency pipeline =================

    @Test void aUsdRecommendationReachesThePatientInUsdOnEveryLineAndTotal() throws Exception {
        UUID caseId = ownedCase("+254700000506", "uat-e@local.test");
        toClinicalRecommendation(caseId, "USD");
        // The coordinator's preparation view already quotes the consultant's EGP lines in USD at today's rate.
        authenticate("coordinator-subject", "COORDINATOR");
        ClinicalReviewView review = journey.workspace(caseId).clinicalReviews().stream().filter(r -> "APPROVED".equals(r.status())).findFirst().orElseThrow();
        assertThat(review.proposalCurrency()).isEqualTo("USD");
        assertThat(review.quoteRate()).isEqualByComparingTo("0.0200");
        assertThat(review.costEstimates()).allSatisfy(line -> {
            assertThat(line.currency()).isEqualTo("EGP");
            assertThat(line.quotedCurrency()).isEqualTo("USD");
            assertThat(line.quotedCost()).isEqualByComparingTo(line.estimatedCost().multiply(new BigDecimal("0.0200")));
        });
        var proposal = journey.createProposal(caseId, draftRequest(review.id()));
        assertThat(proposal.currency()).isEqualTo("USD");
        jdbc.update("UPDATE proposal_versions SET requires_finance_approval=FALSE WHERE id=?", proposal.versionId());
        journey.releaseProposal(caseId, proposal.versionId()); em.flush();
        assertThat(jdbc.queryForObject("SELECT fx_rate FROM proposal_versions WHERE id=?", BigDecimal.class, proposal.versionId())).isEqualByComparingTo("0.0200");

        var ctx = openViaStatusLink(caseId, "+254700000506");
        PublicProposalView view = journey.viewProposal(ctx.token(), ctx.grant());
        assertThat(view.currency()).isEqualTo("USD");
        // 390,000 EGP provider price × 1.12 seeded margin = 436,800 EGP inclusive; × 0.02 snapshot = 8,736 USD per line. Totals follow the same snapshot.
        assertThat(view.items()).isNotEmpty().allSatisfy(item -> assertThat(item.unitPrice()).isEqualByComparingTo("8736.00"));
        assertThat(view.totalExpected()).isEqualByComparingTo("8736.00");
        assertThat(view.totalMin()).isEqualByComparingTo("8736.00");
        assertThat(view.totalMax()).isEqualByComparingTo("8736.00");
        // The base-currency amounts are preserved alongside, not destroyed.
        assertThat(jdbc.queryForObject("SELECT provider_price_egp FROM proposal_items WHERE proposal_version_id=?", BigDecimal.class, proposal.versionId())).isEqualByComparingTo("390000.00");
        assertThat(jdbc.queryForObject("SELECT unit_price_egp FROM proposal_items WHERE proposal_version_id=?", BigDecimal.class, proposal.versionId())).isEqualByComparingTo("436800.00");
    }

    @Test void aForeignCurrencyProposalIsNotReleasedWithoutASnapshotRate() throws Exception {
        UUID caseId = ownedCase("+254700000507", "uat-e2@local.test");
        toClinicalRecommendation(caseId, "USD");
        authenticate("coordinator-subject", "COORDINATOR");
        var proposal = journey.createProposal(caseId, draftRequest(approvedReview(caseId)));
        jdbc.update("UPDATE proposal_versions SET requires_finance_approval=FALSE WHERE id=?", proposal.versionId());
        jdbc.update("DELETE FROM fx_rates WHERE quote_currency='USD'");
        evictFxCache();
        assertThatThrownBy(() -> journey.releaseProposal(caseId, proposal.versionId()))
                .isInstanceOf(ApiException.class).hasMessageContaining("exchange rate");
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposal.versionId())).isEqualTo("CLINICALLY_APPROVED");
        assertThat(status(caseId)).isEqualTo("PROPOSAL_PREPARATION");
    }

    @Test void anAcknowledgedProposalKeepsItsMoneyWhenTheRateChanges() throws Exception {
        UUID caseId = ownedCase("+254700000508", "uat-f@local.test");
        UUID versionId = releasedUsdProposal(caseId);
        var ctx = openViaStatusLink(caseId, "+254700000508");
        journey.decideProposalPublic(ctx.token(), ctx.grant(), new PublicProposalDecisionRequest(ctx.grant(), "ACKNOWLEDGED", null, true));
        em.flush();
        BigDecimal frozenLine = jdbc.queryForObject("SELECT unit_price FROM proposal_items WHERE proposal_version_id=?", BigDecimal.class, versionId);
        BigDecimal frozenRate = jdbc.queryForObject("SELECT fx_rate FROM proposal_versions WHERE id=?", BigDecimal.class, versionId);

        seedFxRate("USD", new BigDecimal("0.0300")); evictFxCache(); // the market moves after acknowledgement
        assertThat(jdbc.queryForObject("SELECT unit_price FROM proposal_items WHERE proposal_version_id=?", BigDecimal.class, versionId)).isEqualByComparingTo(frozenLine);
        assertThat(jdbc.queryForObject("SELECT fx_rate FROM proposal_versions WHERE id=?", BigDecimal.class, versionId)).isEqualByComparingTo(frozenRate);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, versionId)).isEqualTo("ACCEPTED");
        // The patient-visible answer is now the acknowledged version, read-only.
        var state = proposalAccess.state(caseId);
        assertThat(state.state()).isEqualTo("ACCEPTED");
        assertThat(state.action()).isEqualTo("VIEW_PROPOSAL");
        assertThat(state.versionId()).isEqualTo(versionId);
        assertThat(state.decidedAt()).isNotNull();
    }

    // ================= G — priority =================

    @Test void aNewCaseAndItsFirstAssignmentAreNormalPriorityNotHigh() throws Exception {
        UUID caseId = readyForConsultant("+254700000509", "uat-g@local.test");
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.coordinatorCaseCards().stream().filter(c -> c.caseSummary().id().equals(caseId)).findFirst().orElseThrow().highPriorityCount()).isZero();
        journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review")); em.flush();
        assertThat(jdbc.queryForObject("SELECT priority FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT'", String.class, caseId)).isEqualTo("NORMAL");
        authenticate("doctor-subject", "DOCTOR");
        assertThat(work.myWork()).filteredOn(w -> w.caseId().equals(caseId)).extracting(w -> w.priority()).containsExactly("NORMAL");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND priority IN ('HIGH','URGENT')", caseId)).isZero();
    }

    @Test void priorityComesFromRealConditionsOnly() {
        Instant now = Instant.now();
        assertThat(StaffWorkService.derivePriority(false, null, now)).isEqualTo("NORMAL");
        assertThat(StaffWorkService.derivePriority(true, null, now)).isEqualTo("HIGH");     // blocks the journey
        assertThat(StaffWorkService.derivePriority(false, now.plusSeconds(3600), now)).isEqualTo("HIGH"); // due within a day
        assertThat(StaffWorkService.derivePriority(false, now.plusSeconds(7 * 86400), now)).isEqualTo("NORMAL");
    }

    // ================= H — clinical recommendation is required server-side =================

    @Test void aSubmissionWithoutAClinicalRecommendationIsRejected() throws Exception {
        UUID caseId = readyForConsultant("+254700000510", "uat-h@local.test");
        UUID assignment = assignConsultant(caseId);
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null));
        assertThatThrownBy(() -> journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "   ", "Some risks", List.of(), "USD")))
                .isInstanceOf(ApiException.class).hasMessageContaining("clinical recommendation");
        assertThat(status(caseId)).isEqualTo("CONSULTANT_REVIEW");
        assertThat(count("SELECT count(*) FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", caseId)).isZero();
    }

    // ================= I/J/K/L/P — notifications follow the work =================

    @Test void theConsultantAssignmentEmailGoesToTheConsultantWithTheConsultantTemplate() throws Exception {
        UUID caseId = readyForConsultant("+254700000511", "uat-i@local.test");
        setPractitionerEmail("doctor-subject", "consultant.one@local.test");
        setStaffEmail("coordinator-subject", "coordinator.one@local.test");
        UUID assignment = assignConsultant(caseId);
        em.flush();
        String caseNumber = caseNumber(caseId);
        var mail = outboxRow("work-email:assignment:" + assignment);
        assertThat(mail.destination()).isEqualTo("consultant.one@local.test");
        assertThat(mail.templateKey()).isEqualTo("consultant-work-assigned");
        assertThat(mail.data().get("case")).isEqualTo(caseNumber);
        assertThat(mail.data().get("role")).isEqualTo("DOCTOR");
        assertThat(mail.data().get("title")).isEqualTo("New clinical assignment");
        // Nothing about this assignment reaches the coordinator's address or the shared mailbox.
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE 'work-email:assignment:%' AND destination IN (?,?)", "coordinator.one@local.test", "coordinator@test.invalid")).isZero();
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE idempotency_key=?", "assignment:" + assignment)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT recipient_subject FROM staff_notifications WHERE idempotency_key=?", String.class, "assignment:" + assignment)).isEqualTo("doctor-subject");
    }

    @Test void aConsultantWithoutAWorkAddressGetsNoEmailRatherThanTheCoordinatorsMailbox() throws Exception {
        UUID caseId = readyForConsultant("+254700000512", "uat-i2@local.test");
        UUID assignment = assignConsultant(caseId);
        em.flush();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?", "work-email:assignment:" + assignment)).isZero();
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE idempotency_key=?", "assignment:" + assignment)).isEqualTo(1);
    }

    @Test void coordinatorWorkIsEmailedToTheAccountableCoordinatorWithTheCoordinatorTemplate() throws Exception {
        UUID caseId = readyForConsultant("+254700000513", "uat-j@local.test");
        setStaffEmail("coordinator-subject", "coordinator.j@local.test");
        UUID assignment = assignConsultant(caseId);
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null));
        UUID service = seedCatalogService("ECHO", "Echocardiogram", "Diagnostics", new BigDecimal("6500.00"));
        seedFxRate("USD", new BigDecimal("0.0200"));
        journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "Echo then review", null,
                List.of(new CostEstimateItem("Echocardiogram", new BigDecimal("6500.00"), "EGP", service)), "USD"));
        em.flush();
        var mail = outboxRow("work-email:consultant-outcome:ACCEPT:" + caseId);
        assertThat(mail.destination()).isEqualTo("coordinator.j@local.test");
        assertThat(mail.templateKey()).isEqualTo("coordinator-work-assigned");
        assertThat(mail.data().get("case")).isEqualTo(caseNumber(caseId));
        assertThat(jdbc.queryForObject("SELECT recipient_subject FROM staff_notifications WHERE idempotency_key=?", String.class, "consultant-outcome:ACCEPT:" + caseId)).isEqualTo("coordinator-subject");
    }

    @Test void anUnownedNewCaseReachesTheTeamQueueAndTheTeamMailboxNotAPerson() throws Exception {
        var created = cases.create(new CreateCaseRequest("Queue", "Patient", "Kenya", "+254700000514", "Reports", "en", true, null, "uat-k@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        var mail = outboxRow("case-submitted:" + created.caseId());
        assertThat(mail.destination()).isEqualTo("coordinator@test.invalid"); // app.mail.coordinator: the shared team mailbox
        assertThat(mail.templateKey()).isEqualTo("new-case-received");
        assertThat(mail.data().get("case")).isEqualTo(created.caseNumber());
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE case_id=?", created.caseId())).isZero();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=?", created.caseId())).isZero();
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.coordinatorQueue()).extracting(CaseView::id).contains(created.caseId());
        assertThat(journey.coordinatorQueue().stream().filter(c -> c.id().equals(created.caseId())).findFirst().orElseThrow().coordinatorSubject()).isNull();
    }

    @Test void acknowledgingAnEstimateNotifiesTheCoordinatorOnlyThroughRealDepositWork() throws Exception {
        UUID caseId = ownedCase("+254700000515", "uat-l@local.test");
        setStaffEmail("coordinator-subject", "coordinator.l@local.test");
        UUID versionId = releasedUsdProposal(caseId);
        seedDepositPolicy(new BigDecimal("5000.00"));
        var ctx = openViaStatusLink(caseId, "+254700000515");
        int coordinatorMailBefore = count("SELECT count(*) FROM notification_outbox WHERE destination='coordinator.l@local.test'");
        int teamMailBefore = count("SELECT count(*) FROM notification_outbox WHERE destination='coordinator@test.invalid'");
        journey.decideProposalPublic(ctx.token(), ctx.grant(), new PublicProposalDecisionRequest(ctx.grant(), "ACKNOWLEDGED", null, true));
        em.flush();
        assertThat(status(caseId)).isEqualTo("ACCEPTED");
        // The deposit must be arranged by our side: that is the coordinator's work, and the only coordinator email.
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_ARRANGEMENT' AND status='OPEN' AND owner_subject='coordinator-subject'", caseId)).isEqualTo(1);
        var mail = outboxRow("work-email:deposit-required:" + caseId);
        assertThat(mail.destination()).isEqualTo("coordinator.l@local.test");
        assertThat(mail.templateKey()).isEqualTo("coordinator-work-assigned");
        assertThat(mail.data().get("title")).contains("acknowledged the estimate");
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE destination='coordinator.l@local.test'")).isEqualTo(coordinatorMailBefore + 1); // exactly one new coordinator email
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key LIKE 'deposit-settled%'")).isZero();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE destination='coordinator@test.invalid'")).isEqualTo(teamMailBefore); // the shared mailbox is not copied on owned work
        assertThat(versionId).isNotNull();
        // A replayed deposit event changes nothing.
        handoff.onDepositRequired(caseId); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_ARRANGEMENT'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?", "work-email:deposit-required:" + caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE idempotency_key=?", "deposit-required:" + caseId)).isEqualTo(1);
    }

    @Test void acknowledgingWithoutADepositPolicySendsNoCoordinatorEmailAtAll() throws Exception {
        UUID caseId = ownedCase("+254700000516", "uat-l2@local.test");
        setStaffEmail("coordinator-subject", "coordinator.l2@local.test");
        releasedUsdProposal(caseId);
        jdbc.update("UPDATE deposit_policies SET active=FALSE");
        var ctx = openViaStatusLink(caseId, "+254700000516");
        int coordinatorMailBefore = count("SELECT count(*) FROM notification_outbox WHERE destination='coordinator.l2@local.test'");
        int notificationsBefore = count("SELECT count(*) FROM staff_notifications WHERE case_id=?", caseId);
        journey.decideProposalPublic(ctx.token(), ctx.grant(), new PublicProposalDecisionRequest(ctx.grant(), "ACKNOWLEDGED", null, true));
        em.flush();
        assertThat(status(caseId)).isEqualTo("ACCEPTED");
        // No actionable coordinator work arises, so nothing is sent — a status change alone is not an event to email about.
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE destination='coordinator.l2@local.test'")).isEqualTo(coordinatorMailBefore);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE case_id=?", caseId)).isEqualTo(notificationsBefore);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND status='OPEN' AND visibility_scope='INTERNAL'", caseId)).isZero();
    }

    @Test void anUnownedDepositAlertUsesTheDepositRequiredWordingAndItsOwnKey() throws Exception {
        UUID caseId = ownedCase("+254700000517", "uat-l3@local.test");
        releasedUsdProposal(caseId);
        seedDepositPolicy(new BigDecimal("5000.00"));
        jdbc.update("UPDATE case_assignments SET status='ENDED' WHERE case_id=? AND assignee_role='COORDINATOR'", caseId);
        var ctx = openViaStatusLink(caseId, "+254700000517");
        int notificationsBefore = count("SELECT count(*) FROM staff_notifications WHERE case_id=?", caseId);
        journey.decideProposalPublic(ctx.token(), ctx.grant(), new PublicProposalDecisionRequest(ctx.grant(), "ACKNOWLEDGED", null, true));
        em.flush();
        var mail = outboxRow("deposit-required-team:" + caseId);
        assertThat(mail.destination()).isEqualTo("coordinator@test.invalid");
        assertThat(mail.templateKey()).isEqualTo("deposit-required-coordinator");
        assertThat(mail.data().get("case")).isEqualTo(caseNumber(caseId));
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='deposit-settled-coordinator'")).isZero();
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE case_id=?", caseId)).isEqualTo(notificationsBefore); // nobody random was picked
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_ARRANGEMENT' AND owner_subject IS NULL AND status='OPEN'", caseId)).isEqualTo(1); // the work waits in the shared queue
    }

    @Test void replayingAWorkItemNeverDuplicatesTheNotificationOrTheEmail() throws Exception {
        UUID caseId = ownedCase("+254700000518", "uat-p@local.test");
        setStaffEmail("coordinator-subject", "coordinator.p@local.test");
        var item = new NewWorkItem(caseId, "REVIEW", "Review patient information", null, "coordinator-subject", "COORDINATOR",
                false, null, "SYSTEM", "WORK_ASSIGNED", "replay:" + caseId, true);
        work.openWorkItem(item); work.openWorkItem(item); work.openWorkItem(item); em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REVIEW'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE idempotency_key=?", "replay:" + caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?", "work-email:replay:" + caseId)).isEqualTo(1);
    }

    // ================= M/N — coordinator after consultant assignment =================

    @Test void onceTheCaseIsWithTheConsultantTheCoordinatorKeepsUtilitiesButNoWorkflowCommands() throws Exception {
        UUID caseId = readyForConsultant("+254700000519", "uat-m@local.test");
        UUID assignment = assignConsultant(caseId);
        authenticate("coordinator-subject", "COORDINATOR");
        CaseWorkspace pending = journey.workspace(caseId);
        assertThat(pending.actions().waitingOn()).isEqualTo("CONSULTANT");
        assertThat(pending.actions().currentAction().code()).isEqualTo("WAIT_CONSULTANT");
        assertThat(pending.actions().availableActions()).doesNotContain("ASSIGN_CONSULTANT", "CANCEL_CASE", "REQUEST_INFORMATION", "MOVE_TO_INTAKE_REVIEW")
                .contains("SET_TRAVEL_PACKAGE");
        // Direct calls are refused independently of what the page offered.
        long version = pending.caseSummary().version();
        assertThatThrownBy(() -> journey.transition(caseId, new TransitionRequest("CANCELLED", "no", version))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> journey.transition(caseId, new TransitionRequest("INTAKE_REVIEW", "back", version))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> journey.requestInformation(caseId, new InformationRequestCommand("Send more", List.of(new RequestedItem("INFORMATION", "X", "X", true)), true, null, "en")))
                .isInstanceOf(ApiException.class).hasMessageContaining("with the consultant");
        assertThatThrownBy(() -> journey.createProposal(caseId, draftRequest(UUID.randomUUID()))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> journey.updateCareCategory(caseId, new CareCategoryUpdateRequest("orthopedics", version, "late"))).isInstanceOf(ApiException.class);

        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null));
        authenticate("coordinator-subject", "COORDINATOR");
        CaseWorkspace review = journey.workspace(caseId);
        assertThat(review.actions().waitingOn()).isEqualTo("CONSULTANT");
        assertThat(review.actions().currentAction().code()).isEqualTo("WAIT_CONSULTANT");
        assertThat(review.actions().availableActions()).doesNotContain("ASSIGN_CONSULTANT", "REQUEST_INFORMATION", "CANCEL_CASE");
        assertThatThrownBy(() -> journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "again"))).isInstanceOf(ApiException.class);
        // Legitimate utilities still work: a message to the patient, the travel-package flag, reading the case.
        assertThat(journey.message(caseId, new MessageRequest("PATIENT_COORDINATOR", "We will update you soon.", "en", false)).status()).isEqualTo("SENT");
        assertThat(journey.setTravelPackage(caseId, true).travelPackageRequested()).isTrue();
        assertThat(journey.workspace(caseId).messages()).isNotEmpty();
        // Completed work never drives the current action: the accepted assignment item is closed.
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CONSULTANT_ASSIGNMENT' AND status='OPEN'", caseId)).isZero();
    }

    // ================= helpers =================

    private record Mail(String destination, String templateKey, Map<String, String> data) {}
    private record Handoff(String token, String grant) {}

    private Mail outboxRow(String idempotencyKey) throws Exception {
        return jdbc.query("SELECT destination,template_key,template_data FROM notification_outbox WHERE idempotency_key=?", rs -> {
            if (!rs.next()) throw new AssertionError("no outbox row for " + idempotencyKey);
            try { return new Mail(rs.getString("destination"), rs.getString("template_key"), json.readValue(payload(rs.getString("template_data")), new TypeReference<Map<String, String>>() {})); }
            catch (Exception e) { throw new AssertionError(e); }
        }, idempotencyKey);
    }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Uat", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        seedDoctorProfile(); seedCoordinatorProfile();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private UUID readyForConsultant(String whatsapp, String email) throws Exception {
        UUID caseId = ownedCase(whatsapp, email);
        authenticate("coordinator-subject", "COORDINATOR");
        long version = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version));
        em.flush(); SecurityContextHolder.clearContext();
        return caseId;
    }

    private UUID assignConsultant(UUID caseId) {
        authenticate("coordinator-subject", "COORDINATOR");
        UUID id = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review")).id();
        em.flush(); SecurityContextHolder.clearContext();
        return id;
    }

    /** Consultant accepts and records a recommendation with one catalogue service (390,000 EGP) in the given currency. */
    private void toClinicalRecommendation(UUID caseId, String proposalCurrency) throws Exception {
        authenticate("coordinator-subject", "COORDINATOR");
        long version = journey.workspace(caseId).caseSummary().version();
        if ("INTAKE_REVIEW".equals(status(caseId))) journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version));
        UUID assignment = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review")).id();
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null));
        UUID service = seedCatalogService("PACE-DUAL", "Dual chamber pacemaker implant", "Procedure", new BigDecimal("390000.00"));
        seedFxRate("USD", new BigDecimal("0.0200")); evictFxCache();
        journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "Pacemaker implantation", null,
                List.of(new CostEstimateItem("Dual chamber pacemaker implant", new BigDecimal("390000.00"), "EGP", service)), proposalCurrency));
        em.flush(); SecurityContextHolder.clearContext();
    }

    private UUID releasedUsdProposal(UUID caseId) throws Exception {
        toClinicalRecommendation(caseId, "USD");
        authenticate("coordinator-subject", "COORDINATOR");
        var proposal = journey.createProposal(caseId, draftRequest(approvedReview(caseId)));
        jdbc.update("UPDATE proposal_versions SET requires_finance_approval=FALSE WHERE id=?", proposal.versionId());
        journey.releaseProposal(caseId, proposal.versionId());
        em.flush(); SecurityContextHolder.clearContext();
        return proposal.versionId();
    }

    private Handoff openViaStatusLink(UUID caseId, String whatsapp) throws Exception {
        String token = statusToken(caseId);
        String grant = verifyStatusLink(token, whatsapp);
        var handoffCredentials = publicCases.proposalAccess(token, grant); em.flush();
        return new Handoff(handoffCredentials.token(), handoffCredentials.grant());
    }

    private UUID approvedReview(UUID caseId) { return jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId); }

    /** No currency stated by the coordinator: the consultant's choice must carry through on its own. */
    private ProposalDraftRequest draftRequest(UUID reviewId) {
        return new ProposalDraftRequest(reviewId, "en", "Plan", null, "Included", "Excluded", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Line", BigDecimal.ONE, new BigDecimal("1.00"), false, 0)), null);
    }

    private String statusToken(UUID caseId) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_STATUS_LINK' AND idempotency_key IN (SELECT 'case-status:'||id FROM case_access_links WHERE case_id=? AND purpose='STATUS') ORDER BY created_at DESC LIMIT 1", String.class, caseId));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
    }

    private String verifyStatusLink(String token, String whatsapp) throws Exception {
        publicCases.requestAccess(token); em.flush();
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_ACCESS' AND destination=? ORDER BY created_at DESC LIMIT 1", String.class, whatsapp));
        String code = json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
        return publicCases.verify(token, code).grant();
    }

    private void linkPatient(UUID caseId, String subject) {
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", subject, caseId);
    }

    private void seedCoordinatorProfile() {
        if (count("SELECT count(*) FROM staff_members WHERE external_subject=?", "coordinator-subject") > 0) return;
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",
                UUID.randomUUID(), "coordinator-subject", "COORDINATOR", crypto.encrypt("Coordinator One"), Instant.now(), Instant.now());
    }

    private void seedDoctorProfile() {
        if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
    }

    private void setStaffEmail(String subject, String email) { jdbc.update("UPDATE staff_members SET email_encrypted=?,email_hash=? WHERE external_subject=?", crypto.encrypt(email), UUID.nameUUIDFromBytes(email.getBytes()).toString().replace("-", ""), subject); }
    private void setPractitionerEmail(String subject, String email) { jdbc.update("UPDATE practitioner_profiles SET email_encrypted=?,email_hash=? WHERE external_subject=?", crypto.encrypt(email), UUID.nameUUIDFromBytes(email.getBytes()).toString().replace("-", ""), subject); }

    private UUID seedCatalogService(String code, String name, String category, BigDecimal priceEgp) {
        UUID practitioner = jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, "doctor-subject");
        UUID existing = jdbc.query("SELECT id FROM consultant_service_catalog WHERE practitioner_id=? AND service_code=?", rs -> rs.next() ? rs.getObject("id", UUID.class) : null, practitioner, code);
        if (existing != null) return existing;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, practitioner, code, name, category, priceEgp, true, "admin", Instant.now(), Instant.now());
        return id;
    }

    private void seedFxRate(String quoteCurrency, BigDecimal rate) {
        jdbc.update("DELETE FROM fx_rates WHERE quote_currency=? AND rate_date=?", quoteCurrency, java.time.LocalDate.now(java.time.ZoneOffset.UTC));
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID(), "EGP", quoteCurrency, rate, java.time.LocalDate.now(java.time.ZoneOffset.UTC), "API", Instant.now());
    }

    @Autowired(required = false) org.springframework.cache.CacheManager cacheManager;
    private void evictFxCache() { if (cacheManager == null) return; var cache = cacheManager.getCache(com.rehletshifaa.shared.cache.CacheNames.FX_RATES); if (cache != null) cache.clear(); }

    private void seedDepositPolicy(BigDecimal egp) {
        jdbc.update("UPDATE deposit_policies SET active=FALSE");
        jdbc.update("INSERT INTO deposit_policies(id,name,care_category,coordination_deposit_egp,active,version,created_by,valid_from,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), "UAT deposit", null, egp, true, 1, "test", java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(1), Instant.now());
    }

    private String caseNumber(UUID caseId) { return jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?", String.class, caseId); }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, String role) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), subject));
    }
}
