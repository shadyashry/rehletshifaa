package com.rehletshifaa.clinic;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.clinic.api.ClinicDtos.*;
import com.rehletshifaa.clinic.application.ConsultantCapabilityService;
import com.rehletshifaa.clinic.application.VirtualClinicService;
import com.rehletshifaa.identity.IdentityProvisioningPort.IdentityAccount;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.ReferralDtos.*;
import com.rehletshifaa.journey.application.ConsultantReferralService;
import com.rehletshifaa.journey.application.JourneyService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Consultant -> one virtual clinic -> optional practice managers; direct named-consultant assignment; and
 * consultant referrals (transfer / second opinion). Every rule here is enforced by the backend, not the page.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class ConsultantVirtualClinicTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired ConsultantReferralService referrals;
    @Autowired VirtualClinicService clinics; @Autowired ConsultantCapabilityService capabilities;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @MockBean KeycloakStaffIdentityService identities;

    UUID doctorA, doctorB, doctorC;

    @BeforeEach void seed() {
        doctorA = consultant("doctor-a", "Dr A", "cardiology");
        doctorB = consultant("doctor-b", "Dr B", "cardiology");
        doctorC = consultant("doctor-c", "Dr C", "orthopedics");
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Layla Hassan"));
        when(identities.invite(anyString(), anyString(), anyString())).thenReturn(new IdentityAccount("pm-subject", "pm@example.test", "INVITED", Instant.now()));
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ================= eligibility & direct assignment =================

    @Test void eligibilityRequiresCurrentCredentialsAvailabilityActiveAccountAndMatchingCareArea() throws Exception {
        UUID expired = consultant("doctor-x", "Dr Expired", "cardiology");
        jdbc.update("UPDATE practitioner_credentials SET expires_at=? WHERE practitioner_id=?", Instant.now().minusSeconds(60), expired);
        UUID away = consultant("doctor-y", "Dr Away", "cardiology");
        jdbc.update("UPDATE practitioner_profiles SET availability_status='UNAVAILABLE' WHERE id=?", away);
        UUID disabled = consultant("doctor-z", "Dr Disabled", "cardiology");
        jdbc.update("UPDATE practitioner_profiles SET account_status='DISABLED',disabled_at=? WHERE id=?", Instant.now(), disabled);
        UUID caseId = readyCase();

        authenticate("coordinator-subject", Role.COORDINATOR);
        var eligible = journey.eligibleConsultants(caseId, null);
        assertThat(eligible).extracting(EligibleConsultantView::practitionerId).containsExactlyInAnyOrder(doctorA, doctorB);
        assertThat(eligible).allSatisfy(c -> assertThat(c.matchedBy()).isEqualTo("PRIMARY_CARE_AREA"));

        // A governance-approved CARE_AREA capability widens eligibility; care area is only the first filter.
        authenticate("credential-admin", Role.CREDENTIAL_VERIFIER);
        capabilities.approve(doctorC, new CapabilityRequest("CARE_AREA", "cardiology", "Sports cardiology"));
        authenticate("coordinator-subject", Role.COORDINATOR);
        var widened = journey.eligibleConsultants(caseId, "cardiology");
        assertThat(widened).extracting(EligibleConsultantView::practitionerId).contains(doctorC);
        assertThat(widened.stream().filter(c -> c.practitionerId().equals(doctorC)).findFirst().orElseThrow().matchedBy()).isEqualTo("APPROVED_CAPABILITY");

        assertThatThrownBy(() -> journey.assignConsultant(caseId, new ConsultantAssignmentRequest(expired, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CONSULTANT_CATEGORY_MISMATCH");
        var assignment = journey.assignConsultant(caseId, new ConsultantAssignmentRequest(doctorA, "Best subspecialty match"));
        assertThat(assignment.status()).isEqualTo("PENDING");
        assertThat(status(caseId)).isEqualTo("CONSULTANT_ASSIGNMENT_PENDING");
        em.flush();
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.eligibleConsultants(caseId, null).stream().filter(c -> c.practitionerId().equals(doctorA)).findFirst().orElseThrow().pendingOffers()).isEqualTo(1);
    }

    @Test void capabilitiesAreNeverSelfApproved() {
        jdbc.update("UPDATE practitioner_profiles SET external_subject='self-admin' WHERE id=?", doctorC);
        authenticate("self-admin", Role.CREDENTIAL_VERIFIER);
        assertThatThrownBy(() -> capabilities.approve(doctorC, new CapabilityRequest("CARE_AREA", "cardiology", "Cardiology")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SELF_VERIFICATION_PROHIBITED");
    }

    @Test void aDeclinedAssignmentStillReturnsToTheCoordinator() throws Exception {
        UUID caseId = readyCase();
        authenticate("coordinator-subject", Role.COORDINATOR);
        var assignment = journey.assignConsultant(caseId, new ConsultantAssignmentRequest(doctorA, null));
        authenticate("doctor-a", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, assignment.id(), new AssignmentDecisionRequest(false, "On leave"));
        assertThat(status(caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REASSIGN_CONSULTANT' AND status='OPEN'", caseId)).isEqualTo(1);
    }

    // ================= transfer =================

    @Test void transferIsConfirmedByTheCoordinatorAndEndsTheOriginalAssignmentOnlyWhenAccepted() throws Exception {
        UUID caseId = underReviewBy("doctor-a", doctorA);
        authenticate("doctor-a", Role.CONSULTANT);
        assertThatThrownBy(() -> referrals.create(caseId, new CreateReferralRequest("TRANSFER", "Needs structural heart expertise", null, null, doctorC)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SUGGESTED_CONSULTANT_NOT_ELIGIBLE");
        var referral = referrals.create(caseId, new CreateReferralRequest("TRANSFER", "Needs structural heart expertise", null, "Structural heart", doctorB));
        assertThat(referral.status()).isEqualTo("AWAITING_COORDINATOR");
        em.flush();

        // No silent access: the suggested consultant cannot open the case before the coordinator confirms.
        authenticate("doctor-b", Role.CONSULTANT);
        assertThatThrownBy(() -> journey.workspace(caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThat(journey.workspace(caseId).actions().currentAction().workType()).isEqualTo("CONFIRM_TRANSFER");
        var confirmed = referrals.confirm(caseId, referral.id(), new ConfirmReferralRequest(doctorB, null, "Agreed", referral.version()));
        assertThat(confirmed.status()).isEqualTo("AWAITING_CONSULTANT");
        em.flush();
        assertThat(status(caseId)).isEqualTo("CONSULTANT_REVIEW");
        assertThat(journey.workspace(caseId).caseSummary().doctorName()).isEqualTo("Dr A"); // still the primary consultant

        authenticate("doctor-b", Role.CONSULTANT);
        UUID offer = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject='doctor-b' AND status='PENDING'", UUID.class, caseId);
        assertThat(journey.workspace(caseId).actions().currentAction().code()).isEqualTo("ACCEPT_ASSIGNMENT");
        journey.acceptDoctorAssignment(caseId, offer, new AssignmentDecisionRequest(true, null));
        em.flush();

        assertThat(status(caseId)).isEqualTo("CONSULTANT_REVIEW");
        assertThat(jdbc.queryForObject("SELECT assignment_type FROM case_assignments WHERE id=?", String.class, offer)).isEqualTo("PRIMARY");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_subject='doctor-a' AND status='ACTIVE'", caseId)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM consultant_referrals WHERE id=?", String.class, referral.id())).isEqualTo("COMPLETED");
        assertThat(journey.workspace(caseId).caseSummary().doctorName()).isEqualTo("Dr B");

        authenticate("doctor-a", Role.CONSULTANT);
        assertThatThrownBy(() -> journey.workspace(caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type IN ('REFERRAL_REQUESTED','REFERRAL_CONFIRMED','REFERRAL_ACCEPTED','ASSIGNMENT_ENDED')", caseId)).isEqualTo(4);
    }

    @Test void aDeclinedTransferGoesBackToTheCoordinatorAndLeavesTheOriginalConsultantInCharge() throws Exception {
        UUID caseId = underReviewBy("doctor-a", doctorA);
        authenticate("doctor-a", Role.CONSULTANT);
        var referral = referrals.create(caseId, new CreateReferralRequest("TRANSFER", "Second specialist preferred", null, null, null));
        authenticate("coordinator-subject", Role.COORDINATOR);
        referrals.confirm(caseId, referral.id(), new ConfirmReferralRequest(doctorB, null, null, referral.version()));
        em.flush();
        authenticate("doctor-b", Role.CONSULTANT);
        UUID offer = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject='doctor-b'", UUID.class, caseId);
        journey.acceptDoctorAssignment(caseId, offer, new AssignmentDecisionRequest(false, "Outside my practice"));
        em.flush();

        assertThat(status(caseId)).isEqualTo("CONSULTANT_REVIEW"); // never back to READY_FOR_CONSULTANT
        assertThat(jdbc.queryForObject("SELECT status FROM consultant_referrals WHERE id=?", String.class, referral.id())).isEqualTo("AWAITING_COORDINATOR");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_subject='doctor-a' AND status='ACTIVE'", caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_assignments WHERE id=? AND status='DECLINED'", offer)).isEqualTo(1);
    }

    @Test void onlyTheOwningCoordinatorConfirmsAndOnlyTheAssignedConsultantRefers() throws Exception {
        UUID caseId = underReviewBy("doctor-a", doctorA);
        authenticate("doctor-b", Role.CONSULTANT);
        assertThatThrownBy(() -> referrals.create(caseId, new CreateReferralRequest("SECOND_OPINION", "Curious", null, null, null)))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        authenticate("doctor-a", Role.CONSULTANT);
        var referral = referrals.create(caseId, new CreateReferralRequest("SECOND_OPINION", "Borderline indication", null, null, null));
        authenticate("other-coordinator", Role.COORDINATOR);
        assertThatThrownBy(() -> referrals.confirm(caseId, referral.id(), new ConfirmReferralRequest(doctorB, null, null, referral.version())))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUT_OF_SCOPE");
    }

    // ================= second opinion =================

    @Test void aSecondOpinionIsReadAndOpinionOnlyAndItsAccessEndsWithTheOpinion() throws Exception {
        UUID caseId = underReviewBy("doctor-a", doctorA);
        authenticate("doctor-a", Role.CONSULTANT);
        var referral = referrals.create(caseId, new CreateReferralRequest("SECOND_OPINION", "Borderline indication for PCI", null, null, null));
        authenticate("coordinator-subject", Role.COORDINATOR);
        referrals.confirm(caseId, referral.id(), new ConfirmReferralRequest(doctorB, null, null, referral.version()));
        em.flush();
        authenticate("doctor-b", Role.CONSULTANT);
        UUID offer = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_subject='doctor-b'", UUID.class, caseId);
        journey.acceptDoctorAssignment(caseId, offer, new AssignmentDecisionRequest(true, null));
        em.flush();

        // One primary consultant: the second opinion does not change it, and cannot act as it.
        assertThat(journey.workspace(caseId).caseSummary().doctorName()).isEqualTo("Dr A");
        assertThat(journey.workspace(caseId).actions().currentAction().workType()).isEqualTo("SECOND_OPINION");
        assertThatThrownBy(() -> journey.reviewDecision(caseId, new ReviewDecisionRequest("NOT_SUITABLE", "no", null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUT_OF_SCOPE");
        assertThatThrownBy(() -> journey.message(caseId, new MessageRequest("COORDINATOR_DOCTOR", "hello", "en", false)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUT_OF_SCOPE");

        referrals.submitOpinion(caseId, referral.id(), new SecondOpinionRequest("PCI is reasonable after stress imaging."));
        em.flush();
        assertThatThrownBy(() -> journey.workspace(caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        authenticate("doctor-a", Role.CONSULTANT);
        var seen = referrals.forConsultant(caseId);
        assertThat(seen).singleElement().satisfies(r -> {
            assertThat(r.status()).isEqualTo("COMPLETED");
            assertThat(r.opinion()).isEqualTo("PCI is reasonable after stress imaging.");
            assertThat(r.targetConsultantName()).isEqualTo("Dr B");
        });
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_subject='doctor-a' AND status='ACTIVE'", caseId)).isEqualTo(1);
    }

    // ================= virtual clinic =================

    @Test void practiceManagersPrepareButOnlyTheConsultantApprovesServicesAndPrices() {
        authenticate("doctor-a", Role.CONSULTANT);
        var clinic = clinics.clinic(doctorA);
        assertThat(clinic.relation()).isEqualTo("OWNER");
        var pm = clinics.inviteManager(doctorA, new ManagerInviteRequest("Mona PM", "pm@example.test", List.of("SERVICES"), "en"));
        assertThat(pm.permissions()).containsExactly("SERVICES");

        authenticate("pm-subject", Role.PATIENT); // a delegated account holds no staff role at all
        assertThat(clinics.mine()).singleElement().satisfies(s -> assertThat(s.relation()).isEqualTo("PRACTICE_MANAGER"));
        var draft = clinics.proposeServiceChange(doctorA, new ServiceChangeRequest(null, "CREATE", "VID-30", "Video consultation (30 min)", "VIDEO_CONSULTATION",
                "Remote specialist consultation", "Review of uploaded reports", "Prescriptions", "EGP", new BigDecimal("2500.00"), null, null, null));
        assertThat(draft.status()).isEqualTo("PENDING_APPROVAL");
        assertThat(draft.proposedByName()).isEqualTo("Mona PM");
        assertThat(count("SELECT count(*) FROM consultant_service_catalog WHERE practitioner_id=? AND service_code='VID-30'", doctorA)).isZero();
        assertThatThrownBy(() -> clinics.approveServiceChange(doctorA, draft.id(), new ChangeDecisionRequest(draft.version(), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CONSULTANT_APPROVAL_REQUIRED");
        assertThatThrownBy(() -> clinics.createSlot(doctorA, new SlotRequest(Instant.now().plus(2, ChronoUnit.DAYS), Instant.now().plus(2, ChronoUnit.DAYS).plusSeconds(1800), "VIDEO", null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PRACTICE_PERMISSION_REQUIRED");
        assertThatThrownBy(() -> clinics.setAvailability(doctorA, new AvailabilityRequest("UNAVAILABLE", null, 0)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CONSULTANT_APPROVAL_REQUIRED");
        assertThatThrownBy(() -> clinics.auditHistory(doctorA)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("CONSULTANT_APPROVAL_REQUIRED");
        assertThat(clinics.clinic(doctorA).managers()).isEmpty();
        assertThatThrownBy(() -> clinics.clinic(doctorB)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUT_OF_SCOPE");
        // Material price changes are rejected outside the governed kinds and currency.
        assertThatThrownBy(() -> clinics.proposeServiceChange(doctorA, new ServiceChangeRequest(null, "CREATE", "HOTEL", "Hotel night", "ACCOMMODATION",
                null, null, null, "EGP", BigDecimal.TEN, null, null, null))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("SERVICE_KIND_NOT_ALLOWED");

        authenticate("doctor-a", Role.CONSULTANT);
        var applied = clinics.approveServiceChange(doctorA, draft.id(), new ChangeDecisionRequest(draft.version(), null));
        assertThat(applied.status()).isEqualTo("APPLIED");
        UUID serviceId = applied.serviceId();
        assertThat(jdbc.queryForObject("SELECT approval_status FROM consultant_service_catalog WHERE id=?", String.class, serviceId)).isEqualTo("CONSULTANT_APPROVED");

        authenticate("pm-subject", Role.PATIENT);
        var raise = clinics.proposeServiceChange(doctorA, new ServiceChangeRequest(serviceId, "UPDATE", null, "Video consultation (30 min)", "VIDEO_CONSULTATION",
                null, null, null, "EGP", new BigDecimal("2750.00"), new BigDecimal("3000.00"), null, null));
        authenticate("doctor-a", Role.CONSULTANT);
        clinics.approveServiceChange(doctorA, raise.id(), new ChangeDecisionRequest(raise.version(), "Annual update"));
        var history = clinics.serviceHistory(doctorA, serviceId);
        assertThat(history).extracting(ServiceChangeView::appliedRevision).containsExactly(2, 1);
        assertThat(jdbc.queryForObject("SELECT price_egp FROM consultant_service_catalog WHERE id=?", BigDecimal.class, serviceId)).isEqualByComparingTo("2750.00");
        assertThat(clinics.auditHistory(doctorA)).extracting(ClinicAuditEntry::event).contains("CLINIC_MANAGER_INVITED", "CLINIC_SERVICE_CHANGE_APPLIED");
    }

    @Test void aStaleChangeCannotOverwriteANewerPriceAndApprovalCanBeSwitchedOff() {
        authenticate("doctor-a", Role.CONSULTANT);
        clinics.inviteManager(doctorA, new ManagerInviteRequest("Mona PM", "pm@example.test", List.of("SERVICES"), "en"));
        var own = clinics.proposeServiceChange(doctorA, new ServiceChangeRequest(null, "CREATE", "FU", "Follow-up consultation", "FOLLOW_UP_CONSULTATION",
                null, null, null, null, new BigDecimal("1500.00"), null, null, null));
        assertThat(own.status()).isEqualTo("APPLIED"); // the consultant's own change is its own approval

        authenticate("pm-subject", Role.PATIENT);
        var stale = clinics.proposeServiceChange(doctorA, new ServiceChangeRequest(own.serviceId(), "UPDATE", null, "Follow-up consultation", "FOLLOW_UP_CONSULTATION",
                null, null, null, null, new BigDecimal("1600.00"), null, null, null));
        jdbc.update("UPDATE consultant_service_catalog SET price_egp=1700,version=version+1 WHERE id=?", own.serviceId()); // a platform edit in between
        authenticate("doctor-a", Role.CONSULTANT);
        assertThatThrownBy(() -> clinics.approveServiceChange(doctorA, stale.id(), new ChangeDecisionRequest(stale.version(), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SERVICE_CHANGED_SINCE_PREPARED");

        long version = clinics.clinic(doctorA).version();
        clinics.updateSettings(doctorA, new ClinicSettingsRequest(false, version));
        authenticate("pm-subject", Role.PATIENT);
        var auto = clinics.proposeServiceChange(doctorA, new ServiceChangeRequest(null, "CREATE", "REVIEW", "Initial medical-case review", "INITIAL_CASE_REVIEW",
                null, null, null, null, new BigDecimal("1000.00"), null, null, null));
        assertThat(auto.status()).isEqualTo("APPLIED");
        assertThat(jdbc.queryForObject("SELECT approval_status FROM consultant_service_catalog WHERE id=?", String.class, auto.serviceId())).isEqualTo("APPLIED_WITHOUT_APPROVAL");
    }

    @Test void theConsultantApprovesThePublicProfileAndControlsAvailability() {
        authenticate("doctor-a", Role.CONSULTANT);
        clinics.inviteManager(doctorA, new ManagerInviteRequest("Mona PM", "pm@example.test", List.of("PROFILE", "SCHEDULE"), "en"));
        long v = clinics.clinic(doctorA).version();

        authenticate("pm-subject", Role.PATIENT);
        clinics.saveProfileDraft(doctorA, new ProfileDraftRequest("Dr A", "Interventional cardiology", "Bio", "English, Arabic", v), false);
        assertThatThrownBy(() -> clinics.saveProfileDraft(doctorA, new ProfileDraftRequest("Dr A", "x", null, null, v + 1), true))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CONSULTANT_APPROVAL_REQUIRED");
        assertThatThrownBy(() -> clinics.saveProfileDraft(doctorA, new ProfileDraftRequest("Dr A", "stale", null, null, v), false))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CLINIC_VERSION_CONFLICT");
        var slot = clinics.createSlot(doctorA, new SlotRequest(Instant.now().plus(3, ChronoUnit.DAYS), Instant.now().plus(3, ChronoUnit.DAYS).plusSeconds(1800), "VIDEO", "Room link sent by email", null));
        assertThatThrownBy(() -> clinics.createSlot(doctorA, new SlotRequest(slot.startsAt().plusSeconds(600), slot.endsAt().plusSeconds(600), "IN_PERSON", null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("SLOT_OVERLAP");

        authenticate("doctor-a", Role.CONSULTANT);
        var clinic = clinics.clinic(doctorA);
        assertThat(clinic.draft().status()).isEqualTo("PENDING_APPROVAL");
        assertThat(clinic.draft().updatedByName()).isEqualTo("Mona PM");
        clinics.approveProfile(doctorA, new VersionedRequest(clinic.version()));
        assertThat(clinics.clinic(doctorA).publicProfile().headline()).isEqualTo("Interventional cardiology");

        long pv = clinics.clinic(doctorA).professional().practitionerVersion();
        clinics.setAvailability(doctorA, new AvailabilityRequest("UNAVAILABLE", 48, pv));
        assertThat(clinics.clinic(doctorA).professional().assignable()).isFalse();
    }

    @Test void aPracticeManagerNeverReachesCasesAndLosesTheClinicWhenRevoked() throws Exception {
        UUID caseId = underReviewBy("doctor-a", doctorA);
        authenticate("doctor-a", Role.CONSULTANT);
        var pm = clinics.inviteManager(doctorA, new ManagerInviteRequest("Mona PM", "pm@example.test", List.of("SCHEDULE", "PROFILE", "SERVICES"), "en"));

        authenticate("pm-subject", Role.PATIENT);
        assertThatThrownBy(() -> journey.workspace(caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThatThrownBy(() -> journey.assertCanReadDocument(caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThatThrownBy(() -> referrals.forConsultant(caseId)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        authenticate("doctor-a", Role.CONSULTANT);
        clinics.updateManager(doctorA, pm.id(), new ManagerUpdateRequest(List.of(), false, pm.version()));
        authenticate("pm-subject", Role.PATIENT);
        assertThat(clinics.mine()).isEmpty();
        assertThatThrownBy(() -> clinics.clinic(doctorA)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("PERMISSION_NOT_HELD");
    }

    // ================= helpers =================

    private UUID consultant(String subject, String name, String area) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,expected_review_hours,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)",
                id, subject, name, name, "VERIFIED", "CONSULTANT", "AVAILABLE", area, 72, Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
        return id;
    }

    private UUID readyCase() throws Exception {
        var created = cases.create(new CreateCaseRequest("Case", "Patient", "Kenya", "+254700000020", "Cardiac reports", "en", true, null, "link@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        return created.caseId();
    }

    private UUID underReviewBy(String subject, UUID practitioner) throws Exception {
        UUID caseId = readyCase();
        var assignment = journey.assignConsultant(caseId, new ConsultantAssignmentRequest(practitioner, null));
        authenticate(subject, Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, assignment.id(), new AssignmentDecisionRequest(true, null));
        em.flush();
        return caseId;
    }

    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }

    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
