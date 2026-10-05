package com.rehletshifaa.clinic;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.clinic.application.ConsultantOperationsOwnershipService;
import com.rehletshifaa.clinic.application.ConsultantCapabilityService;
import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityRequest;
import com.rehletshifaa.journey.application.JourneyService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@SpringBootTest(properties = {"spring.task.scheduling.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:consultant-operations-ownership;MODE=LEGACY;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"})
class ConsultantOperationsOwnershipIntegrationTest {
    @Autowired ConsultantOperationsOwnershipService ownership;
    @Autowired ConsultantCapabilityService capabilities;
    @Autowired JourneyService journeys;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;

    UUID consultant;
    UUID credential;

    @BeforeEach
    void setup() {
        consultant = UUID.randomUUID();
        credential = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) "
                        + "VALUES(?,?,'Consultant','Consultant','UNDER_REVIEW','CONSULTANT','AVAILABLE',?,?,0)",
                consultant, "consultant-owner-test", now, now);
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,'LICENSE','UNDER_REVIEW',?,?)",
                credential, consultant, now.plusSeconds(86400), now);
        grant("operations-owner-a", Role.CONSULTANT_OPERATIONS_MANAGER, Role.CREDENTIAL_VERIFIER);
        grant("operations-owner-b", Role.CONSULTANT_OPERATIONS_MANAGER, Role.CREDENTIAL_VERIFIER);
        grant("independent-reviewer", Role.CREDENTIAL_VERIFIER);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        jdbc.update("DELETE FROM consultant_review_conflicts WHERE practitioner_id=?", consultant);
        jdbc.update("DELETE FROM consultant_current_operations_owners WHERE practitioner_id=?", consultant);
        jdbc.update("DELETE FROM consultant_operations_ownerships WHERE practitioner_id=?", consultant);
        jdbc.update("DELETE FROM consultant_capabilities WHERE practitioner_id=?", consultant);
        jdbc.update("DELETE FROM practitioner_credentials WHERE practitioner_id=?", consultant);
        jdbc.update("DELETE FROM practitioner_profiles WHERE id=?", consultant);
    }

    @Test
    void reassignmentPreservesHistoryAndEveryOwnerOfAnOpenCredentialRemainsConflicted() {
        signIn("operations-owner-a", Role.CONSULTANT_OPERATIONS_MANAGER, Role.CREDENTIAL_VERIFIER);
        ownership.assign(consultant, new ConsultantOperationsOwnershipService.Assign("operations-owner-a", "Initial owner"));
        ownership.openCredentialReview(consultant, credential);

        signIn("operations-owner-b", Role.CONSULTANT_OPERATIONS_MANAGER, Role.CREDENTIAL_VERIFIER);
        ownership.assign(consultant, new ConsultantOperationsOwnershipService.Assign("operations-owner-b", "Coverage change"));

        var history = ownership.history(consultant);
        assertThat(history.current().ownerSubject()).isEqualTo("operations-owner-b");
        assertThat(history.history()).extracting(ConsultantOperationsOwnershipService.OwnershipView::ownerSubject)
                .containsExactly("operations-owner-b", "operations-owner-a");

        signIn("operations-owner-a", Role.CONSULTANT_OPERATIONS_MANAGER, Role.CREDENTIAL_VERIFIER);
        assertCode("INDEPENDENT_REVIEW_REQUIRED", () -> journeys.verifyPractitioner(consultant, true, "Reviewed"));
        signIn("operations-owner-b", Role.CONSULTANT_OPERATIONS_MANAGER, Role.CREDENTIAL_VERIFIER);
        assertCode("INDEPENDENT_REVIEW_REQUIRED", () -> journeys.verifyPractitioner(consultant, true, "Reviewed"));

        signIn("independent-reviewer", Role.CREDENTIAL_VERIFIER);
        assertThat(journeys.verifyPractitioner(consultant, true, "Independent review").status()).isEqualTo("VERIFIED");
    }

    @Test
    void ownerMustBeActiveConsultantOperationsStaffAndConsultantCannotDecideCapabilities() {
        grant("unrelated-staff", Role.OPERATIONS_MANAGER);
        signIn("operations-owner-a", Role.CONSULTANT_OPERATIONS_MANAGER);
        assertCode("CONSULTANT_OWNER_NOT_ELIGIBLE", () -> ownership.assign(consultant,
                new ConsultantOperationsOwnershipService.Assign("unrelated-staff", "Wrong function")));

        grant("consultant-owner-test", Role.CREDENTIAL_VERIFIER);
        signIn("consultant-owner-test", Role.CREDENTIAL_VERIFIER);
        assertCode("SELF_VERIFICATION_PROHIBITED", () -> capabilities.approve(consultant,
                new CapabilityRequest("SPECIALTY", "cardiology", "Cardiology")));
    }

    private void grant(String subject, Role... roles) {
        for (Role role : roles) TestPrincipals.grant(jdbc, crypto, subject, role);
    }

    private void signIn(String subject, Role... roles) {
        TestPrincipals.signIn(jdbc, crypto, subject, roles);
    }

    private static void assertCode(String expected, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        ApiException failure = catchThrowableOfType(ApiException.class, action);
        assertThat(failure).isNotNull();
        assertThat(failure.code()).isEqualTo(expected);
    }
}
