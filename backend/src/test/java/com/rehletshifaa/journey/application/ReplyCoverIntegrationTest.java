package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.coordination.CoordinationTestData;
import com.rehletshifaa.journey.api.JourneyDtos.MessageRequest;
import com.rehletshifaa.journey.application.ReplyCoverService.NewReplyCover;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * S2: one staff voice on the patient thread — the case's primary coordinator, or their active reply cover instead of
 * them — and the rules that keep covers from overlapping or chaining.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class ReplyCoverIntegrationTest {
    static final String OWNER = "owner-co", COVER = "cover-co", OTHER = "other-co", LEAD = "lead-co", MANAGER = "manager-cc";
    @Autowired CaseService cases;
    @Autowired JourneyService journey;
    @Autowired ReplyCoverService covers;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager em;
    UUID caseId;

    @BeforeEach void ownedCase() {
        for (String s : new String[]{OWNER, COVER, OTHER, LEAD})
            WorkforceTestData.staff(jdbc, s, "COORDINATOR", crypto.encrypt(s.toUpperCase()));
        WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", LEAD, OWNER);
        var created = cases.create(new CreateCaseRequest("Cover", "Patient", "Kenya", "+254700000401", "Reports", "en", true, null));
        cases.submit(created.caseId());
        em.flush();
        caseId = created.caseId();
        as(OWNER, Role.COORDINATOR);
        CoordinationTestData.eligibleCoordinator(jdbc, OWNER);
        if (!CoordinationTestData.hasActiveCoordinator(jdbc, caseId, OWNER)) journey.claimCoordinatorCase(caseId, "pod");
        em.flush();
    }

    @AfterEach void signOut() { SecurityContextHolder.clearContext(); }

    void as(String subject, Role role) { TestPrincipals.signIn(jdbc, crypto, subject, role); }

    void replyAs(String subject) {
        as(subject, Role.COORDINATOR);
        journey.message(caseId, new MessageRequest("PATIENT_COORDINATOR", "Hello from " + subject, "en", false));
        em.flush();
    }

    static String code(Runnable call) {
        try { call.run(); return null; } catch (ApiException e) { return e.code(); }
    }

    NewReplyCover coverNow(String owner, String cover) {
        return new NewReplyCover(owner, cover, Instant.now(), Instant.now().plus(Duration.ofDays(1)), "Annual leave");
    }

    @Test void onlyTheOwnerRepliesWhenNobodyCovers() {
        replyAs(OWNER);
        assertThat(code(() -> replyAs(OTHER))).isNotNull();
        assertThat(code(() -> replyAs(LEAD))).as("a lead covers or reassigns, never replies alongside").isNotNull();
    }

    @Test void whileCoveredOnlyTheCoverRepliesAndTheOwnerReads() {
        as(OWNER, Role.COORDINATOR);
        covers.create(coverNow(null, COVER));
        em.flush();

        replyAs(COVER);
        assertThat(code(() -> replyAs(OWNER))).isEqualTo("PATIENT_REPLY_NOT_YOURS");

        as(COVER, Role.COORDINATOR);
        var coverView = journey.workspace(caseId).patientReply();
        assertThat(coverView.canReply()).isTrue();
        assertThat(coverView.viewerIsCover()).isTrue();
        assertThat(journey.coordinatorQueue()).anyMatch(c -> c.id().equals(caseId));

        as(OWNER, Role.COORDINATOR);
        var ownerView = journey.workspace(caseId).patientReply();
        assertThat(ownerView.canReply()).isFalse();
        assertThat(ownerView.coverName()).isEqualTo("COVER-CO");
        // The owner still talks to the case team on internal threads.
        journey.message(caseId, new MessageRequest("COORDINATOR_DOCTOR", "Internal note", "en", true));
    }

    @Test void reissuingASecureLinkFollowsTheReplyRule() {
        UUID anyVersion = UUID.randomUUID();
        for (String s : new String[]{OTHER, LEAD}) {
            as(s, Role.COORDINATOR);
            assertThat(code(() -> journey.resendProposalLink(caseId, anyVersion))).as(s).isEqualTo("PATIENT_REPLY_NOT_YOURS");
            assertThat(code(() -> journey.resendOnboardingLink(caseId))).as(s).isEqualTo("PATIENT_REPLY_NOT_YOURS");
        }

        as(OWNER, Role.COORDINATOR);
        covers.create(coverNow(null, COVER));
        em.flush();
        assertThat(code(() -> journey.resendProposalLink(caseId, anyVersion))).isEqualTo("PATIENT_REPLY_NOT_YOURS");
        // The cover passes the reply rule; what stops them here is only that this case has nothing to resend.
        as(COVER, Role.COORDINATOR);
        assertThat(code(() -> journey.resendProposalLink(caseId, anyVersion))).isNotNull().isNotEqualTo("PATIENT_REPLY_NOT_YOURS");
        assertThat(code(() -> journey.resendOnboardingLink(caseId))).isNotNull().isNotEqualTo("PATIENT_REPLY_NOT_YOURS");
    }

    @Test void revokingHandsTheConversationBackAtOnce() {
        as(OWNER, Role.COORDINATOR);
        var created = covers.create(coverNow(null, COVER));
        covers.revoke(created.id());
        em.flush();

        replyAs(OWNER);
        assertThat(code(() -> replyAs(COVER))).isNotNull();
    }

    @Test void aFutureCoverChangesNothingYet() {
        as(OWNER, Role.COORDINATOR);
        covers.create(new NewReplyCover(null, COVER, Instant.now().plus(Duration.ofDays(1)), Instant.now().plus(Duration.ofDays(2)), null));
        em.flush();
        replyAs(OWNER);
    }

    @Test void coversNeverOverlapOrChain() {
        as(OWNER, Role.COORDINATOR);
        covers.create(coverNow(null, COVER));
        assertThat(code(() -> covers.create(coverNow(null, OTHER)))).isEqualTo("COVER_OVERLAPS");

        as(OTHER, Role.COORDINATOR);
        assertThat(code(() -> covers.create(coverNow(null, OWNER)))).as("the chosen cover is away").isEqualTo("COVER_UNAVAILABLE");

        as(COVER, Role.COORDINATOR);
        assertThat(code(() -> covers.create(coverNow(null, OTHER)))).as("the cover is busy covering").isEqualTo("OWNER_IS_COVERING");
    }

    @Test void periodsAndPeopleAreChecked() {
        as(OWNER, Role.COORDINATOR);
        assertThat(code(() -> covers.create(new NewReplyCover(null, COVER, Instant.now(), Instant.now().plus(Duration.ofDays(31)), null))))
                .isEqualTo("COVER_TOO_LONG");
        assertThat(code(() -> covers.create(new NewReplyCover(null, COVER, Instant.now().minus(Duration.ofDays(2)), Instant.now().minus(Duration.ofDays(1)), null))))
                .isEqualTo("COVER_IN_PAST");
        assertThat(code(() -> covers.create(coverNow(null, OWNER)))).isEqualTo("COVER_INVALID");
        assertThat(code(() -> covers.create(coverNow(null, "not-a-coordinator")))).isEqualTo("COVER_NOT_COORDINATOR");
    }

    @Test void theOwnerTheirLeadOrAManagerSetsACoverButNotAColleague() {
        as(OTHER, Role.COORDINATOR);
        assertThat(code(() -> covers.create(coverNow(OWNER, COVER)))).isNotNull();

        as(LEAD, Role.COORDINATOR);
        var byLead = covers.create(coverNow(OWNER, COVER));
        covers.revoke(byLead.id());

        as(MANAGER, Role.CARE_COORDINATION_MANAGER);
        covers.create(coverNow(OWNER, COVER));
        assertThat(covers.current()).anyMatch(c -> c.ownerSubject().equals(OWNER) && c.active());
    }
}
