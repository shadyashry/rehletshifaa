package com.rehletshifaa.clinic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.clinic.api.ClinicDtos.*;
import com.rehletshifaa.clinic.application.PracticeManagerDelegationService;
import com.rehletshifaa.clinic.application.VirtualClinicService;
import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.identity.operations.IdentityOperationExecutor;
import com.rehletshifaa.identity.operations.IdentityOperationStore;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PracticeManagerConsentIntegrationTest {
    @Autowired PracticeManagerDelegationService managers;
    @Autowired VirtualClinicService clinics;
    @Autowired IdentityOperationStore operations;
    @Autowired IdentityOperationExecutor executor;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @MockBean KeycloakStaffIdentityService identities;

    UUID clinicA;
    UUID clinicB;

    @BeforeEach void seed() {
        clinicA = consultant("consultant-a", "Dr A");
        clinicB = consultant("consultant-b", "Dr B");
        when(identities.resolveVerifiedEmail(anyString())).thenAnswer(invocation -> {
            String email = invocation.getArgument(0);
            return IdentityProvisioningPort.EmailResolution.unique("manager-subject", email);
        });
    }

    @Test void invitationGrantsNothingUntilExactVerifiedMfaIdentityAcceptsOnce() {
        ManagerView invited = invite(clinicA, "consultant-a", "manager@example.test", List.of("SCHEDULE"));
        resolvePendingIdentity();

        TestPrincipals.signInWithEmail("manager-subject", "manager@example.test", true, "1");
        assertThat(clinics.mine()).isEmpty();
        assertThatThrownBy(() -> managers.accept(new AcceptManagerInvitationRequest(token(invited.id()))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MFA_REQUIRED");

        TestPrincipals.signInWithEmail("wrong-subject", "manager@example.test", true, "2");
        assertThatThrownBy(() -> managers.accept(new AcceptManagerInvitationRequest(token(invited.id()))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PRACTICE_INVITATION_IDENTITY_MISMATCH");

        TestPrincipals.signInWithEmail("manager-subject", "manager@example.test", true, "2");
        ManagerView accepted = managers.accept(new AcceptManagerInvitationRequest(token(invited.id())));
        assertThat(accepted.status()).isEqualTo("ACTIVE");
        assertThat(clinics.mine()).singleElement().satisfies(row -> assertThat(row.permissions()).containsExactly("SCHEDULE"));
        assertThatThrownBy(() -> managers.accept(new AcceptManagerInvitationRequest(token(invited.id()))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PRACTICE_INVITATION_USED");
        assertThat(count("SELECT COUNT(*) FROM practice_manager_delegation_history WHERE delegation_id=? AND event_type='ACCEPTED'", accepted.id())).isOne();
    }

    @Test void directInvitationCreatesTheClinicForAConsultantAddedAfterTheClinicMigration() {
        UUID practitioner = consultant("consultant-late", "Dr Late");
        signInConsultant("consultant-late");

        ManagerView invitation = managers.invite(practitioner,
                new ManagerInviteRequest("Mona Manager", "late-manager@example.test", List.of("SCHEDULE"), "en"));

        assertThat(invitation.status()).isEqualTo("INVITED");
        assertThat(count("SELECT COUNT(*) FROM virtual_clinics WHERE practitioner_id=?", practitioner)).isOne();
    }

    @Test void exactExistingIdentityIsAdoptedAndAmbiguityFailsClosedWithoutCreatingAnAccount() {
        ManagerView invited = invite(clinicA, "consultant-a", "existing@example.test", List.of("PROFILE"));
        resolvePendingIdentity();
        assertThat(jdbc.queryForObject("SELECT identity_resolution_status FROM practice_manager_invitations WHERE id=?", String.class, invited.id())).isEqualTo("READY");
        verify(identities, never()).inviteTracked(anyString(), anyString(), anyString(), anyString());

        reset(identities);
        when(identities.resolveVerifiedEmail(anyString())).thenReturn(IdentityProvisioningPort.EmailResolution.reviewRequired());
        ManagerView ambiguous = invite(clinicB, "consultant-b", "ambiguous@example.test", List.of("SERVICES"));
        resolvePendingIdentity();
        assertThat(jdbc.queryForObject("SELECT identity_resolution_status FROM practice_manager_invitations WHERE id=?", String.class, ambiguous.id())).isEqualTo("REVIEW_REQUIRED");
        TestPrincipals.signInWithEmail("manager-subject", "ambiguous@example.test", true, "2");
        assertThatThrownBy(() -> managers.accept(new AcceptManagerInvitationRequest(token(ambiguous.id()))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PRACTICE_IDENTITY_NOT_READY");
        assertThat(count("SELECT COUNT(*) FROM practice_managers WHERE practitioner_id=?", clinicB)).isZero();
    }

    @Test void wideningWaitsForRenewedConsentWhileNarrowingAndRevocationAreImmediate() {
        ManagerView active = accept(invite(clinicA, "consultant-a", "manager@example.test", List.of("SCHEDULE")), "manager@example.test");
        signInConsultant("consultant-a");
        ManagerView pending = managers.change(clinicA, active.id(), new ManagerUpdateRequest(List.of("SCHEDULE", "SERVICES"), true, active.version()));
        assertThat(pending.permissions()).containsExactly("SCHEDULE");
        assertThat(pending.pendingPermissions()).containsExactly("SCHEDULE", "SERVICES");
        TestPrincipals.signInWithEmail("manager-subject", "manager@example.test", true, "2");
        assertThat(clinics.clinic(clinicA).permissions()).containsExactly("SCHEDULE");
        ManagerView widened = managers.accept(new AcceptManagerInvitationRequest(pendingToken(active.id())));
        assertThat(widened.permissions()).containsExactly("SCHEDULE", "SERVICES");

        signInConsultant("consultant-a");
        ManagerView narrowed = managers.change(clinicA, active.id(), new ManagerUpdateRequest(List.of("SERVICES"), true, widened.version()));
        assertThat(narrowed.permissions()).containsExactly("SERVICES");
        ManagerView revoked = managers.change(clinicA, active.id(), new ManagerUpdateRequest(List.of(), false, narrowed.version()));
        assertThat(revoked.status()).isEqualTo("REVOKED");
        TestPrincipals.signInWithEmail("manager-subject", "manager@example.test", true, "2");
        assertThat(clinics.mine()).isEmpty();
    }

    @Test void revocationAndConsultantSuspensionAreIsolatedPerConsultant() {
        ManagerView a = accept(invite(clinicA, "consultant-a", "manager@example.test", List.of("PROFILE")), "manager@example.test");
        ManagerView b = accept(invite(clinicB, "consultant-b", "manager@example.test", List.of("SERVICES")), "manager@example.test");
        signInConsultant("consultant-a");
        managers.change(clinicA, a.id(), new ManagerUpdateRequest(List.of(), false, a.version()));
        TestPrincipals.signInWithEmail("manager-subject", "manager@example.test", true, "2");
        assertThat(clinics.mine()).singleElement().satisfies(row -> assertThat(row.practitionerId()).isEqualTo(clinicB));

        managers.suspendForConsultant(clinicB, "Consultant offboarding", "system");
        assertThat(clinics.mine()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT status FROM practice_managers WHERE id=?", String.class, b.id())).isEqualTo("SUSPENDED");
        assertThat(jdbc.queryForObject("SELECT status FROM practice_managers WHERE id=?", String.class, a.id())).isEqualTo("REVOKED");
    }

    @Test void resendRotatesTheSingleUseTokenAndLifecycleReconciliationSuspendsAndRestores() {
        ManagerView invitation = invite(clinicA, "consultant-a", "manager@example.test", List.of("PROFILE"));
        String oldToken = token(invitation.id());
        signInConsultant("consultant-a");
        ManagerView resent = managers.resend(clinicA, invitation.id(), new VersionedRequest(invitation.version()));
        assertThat(resent.version()).isEqualTo(invitation.version() + 1);
        assertThat(jdbc.queryForObject("SELECT status FROM notification_outbox WHERE idempotency_key=?", String.class,
                "practice-manager-invitation:" + invitation.id())).isEqualTo("DEAD_LETTER");
        resolvePendingIdentity();
        TestPrincipals.signInWithEmail("manager-subject", "manager@example.test", true, "2");
        assertThatThrownBy(() -> managers.accept(new AcceptManagerInvitationRequest(oldToken)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("PRACTICE_INVITATION_INVALID");
        ManagerView active = managers.accept(new AcceptManagerInvitationRequest(token(invitation.id(), resent.version())));

        jdbc.update("UPDATE practitioner_profiles SET consultant_lifecycle_status='OFFBOARDING' WHERE id=?", clinicA);
        assertThat(managers.reconcileConsultantLifecycle()).isOne();
        assertThat(jdbc.queryForObject("SELECT status FROM practice_managers WHERE id=?", String.class, active.id())).isEqualTo("SUSPENDED");
        jdbc.update("UPDATE practitioner_profiles SET consultant_lifecycle_status='ACTIVE' WHERE id=?", clinicA);
        assertThat(managers.reconcileConsultantLifecycle()).isOne();
        assertThat(jdbc.queryForObject("SELECT status FROM practice_managers WHERE id=?", String.class, active.id())).isEqualTo("ACTIVE");
    }

    private ManagerView invite(UUID clinic, String consultant, String email, List<String> permissions) {
        signInConsultant(consultant); clinics.clinic(clinic);
        return managers.invite(clinic, new ManagerInviteRequest("Mona Manager", email, permissions, "en"));
    }

    private ManagerView accept(ManagerView invitation, String email) {
        resolvePendingIdentity();
        TestPrincipals.signInWithEmail("manager-subject", email, true, "2");
        return managers.accept(new AcceptManagerInvitationRequest(token(invitation.id())));
    }

    private void resolvePendingIdentity() {
        IdentityOperationStore.Operation operation = operations.claim(10).stream()
                .filter(candidate -> candidate.type().name().equals("RESOLVE_PRACTICE_MANAGER")).findFirst().orElseThrow();
        executor.execute(operation);
    }

    private String token(UUID invitationId) {
        return token(invitationId, 0);
    }

    private String token(UUID invitationId, long revision) {
        String key = "practice-manager-invitation:" + invitationId + (revision == 0 ? "" : ":" + revision);
        String encrypted = jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, key);
        try { return new ObjectMapper().readTree(crypto.decrypt(encrypted.substring(4))).get("token").asText(); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private String pendingToken(UUID delegationId) {
        UUID invitation = jdbc.queryForObject("SELECT id FROM practice_manager_invitations WHERE delegation_id=? AND status='INVITED'", UUID.class, delegationId);
        return token(invitation);
    }

    private void signInConsultant(String subject) { TestPrincipals.signIn(jdbc, crypto, subject, Role.CONSULTANT); }
    private UUID consultant(String subject, String name) {
        UUID id = UUID.randomUUID(); Instant now = Instant.now();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,account_status,created_at,updated_at,version) VALUES(?,?,?,?,'VERIFIED','CONSULTANT','AVAILABLE','ACTIVE',?,?,0)", id, subject, name, name, now, now);
        return id;
    }
    private long count(String sql, Object... values) { return jdbc.queryForObject(sql, Long.class, values); }
}
