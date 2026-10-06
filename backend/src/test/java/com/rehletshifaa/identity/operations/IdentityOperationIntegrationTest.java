package com.rehletshifaa.identity.operations;

import com.rehletshifaa.identity.IdentityProvisioningPort;
import com.rehletshifaa.identity.KeycloakStaffIdentityService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.UUID;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = {
        "spring.task.scheduling.enabled=false",
        "app.identity-operations.initial-delay-milliseconds=3600000",
        "spring.datasource.url=jdbc:h2:mem:identity-operations;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class IdentityOperationIntegrationTest {
    @Autowired ApplicationEventPublisher events;
    @Autowired IdentityOperationProcessor processor;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate transactions;
    @Autowired Clock clock;
    @Autowired CryptoService crypto;
    @MockitoBean KeycloakStaffIdentityService identities;

    @BeforeEach
    void clear() {
        jdbc.update("DELETE FROM identity_operations");
        reset(identities);
    }

    @AfterEach
    void removeCreatedIdentityFixture() {
        jdbc.update("DELETE FROM workforce_role_assignments WHERE subject='created-subject'");
        jdbc.update("DELETE FROM workforce_people WHERE subject='created-subject'");
        jdbc.update("DELETE FROM access_subjects WHERE subject='created-subject'");
        jdbc.update("DELETE FROM workforce_invitation_roles");
        jdbc.update("DELETE FROM workforce_invitations");
        jdbc.update("DELETE FROM identity_operations");
    }

    @Test
    void recordsInBusinessTransactionThenDisablesAndLogsOutAfterCommit() {
        UUID id = UUID.randomUUID();
        transactions.executeWithoutResult(status -> events.publishEvent(request(id, "disable-1")));

        verifyNoInteractions(identities);
        assertThat(value("status", id)).isEqualTo("PENDING");

        processor.dispatch();

        verify(identities).setEnabled("staff-1", false);
        verify(identities).logout("staff-1");
        assertThat(value("status", id)).isEqualTo("SUCCEEDED");
        assertThat(jdbc.queryForObject("SELECT attempts FROM identity_operations WHERE id=?", Integer.class, id)).isOne();
    }

    @Test
    void providerFailureIsRetryableAndDoesNotLoseTheCommittedDecision() {
        UUID id = UUID.randomUUID();
        transactions.executeWithoutResult(status -> events.publishEvent(request(id, "disable-2")));
        doThrow(new ApiException(502, "IDENTITY_PROVIDER_ERROR", "down")).when(identities).setEnabled("staff-1", false);

        processor.dispatch();

        assertThat(value("status", id)).isEqualTo("RETRYING");
        assertThat(value("last_error_code", id)).isEqualTo("IDENTITY_PROVIDER_ERROR");
        assertThat(value("target_subject", id)).isEqualTo("staff-1");

        reset(identities);
        jdbc.update("UPDATE identity_operations SET next_attempt_at=? WHERE id=?", clock.instant().minusSeconds(1), id);
        processor.dispatch();
        verify(identities).setEnabled("staff-1", false);
        verify(identities).logout("staff-1");
        assertThat(value("status", id)).isEqualTo("SUCCEEDED");
    }

    @Test
    void trackedInvitationCompletesTheWorkforceRecordWithoutDuplicateProvisioning() {
        UUID invitationId = UUID.randomUUID();
        var now = clock.instant();
        jdbc.update("INSERT INTO workforce_invitations(id,display_name_encrypted,email_encrypted,email_hash,locale,status,invited_by,reason,created_at,expires_at,revision) " +
                        "VALUES(?,?,?,?,'en','QUEUED','admin-1','New coordinator',?,?,0)", invitationId, crypto.encrypt("Queued Staff"),
                crypto.encrypt("queued@example.test"), UUID.randomUUID().toString().replace("-", ""), now, now.plusSeconds(3600));
        jdbc.update("INSERT INTO workforce_invitation_roles(invitation_id,role_key) VALUES(?,'COORDINATOR')", invitationId);
        var event = IdentityOperationRequested.create(invitationId, "workforce-invite:" + invitationId,
                IdentityOperationRequested.Type.CREATE_STAFF, "admin-1", "Create workforce identity", "WorkforceInvitation", invitationId,
                Map.of("name", "Queued Staff", "email", "queued@example.test", "locale", "en"));
        transactions.executeWithoutResult(status -> events.publishEvent(event));
        when(identities.recover("workforce-invite:" + invitationId)).thenReturn(Optional.empty());
        when(identities.inviteTracked("Queued Staff", "queued@example.test", "en", "workforce-invite:" + invitationId))
                .thenReturn(new IdentityProvisioningPort.IdentityAccount("created-subject", "queued@example.test", "INVITED", now));

        processor.dispatch();

        assertThat(jdbc.queryForObject("SELECT subject FROM workforce_invitations WHERE id=?", String.class, invitationId)).isEqualTo("created-subject");
        assertThat(jdbc.queryForObject("SELECT status FROM workforce_invitations WHERE id=?", String.class, invitationId)).isEqualTo("SENT");
        assertThat(jdbc.queryForObject("SELECT lifecycle_status FROM workforce_people WHERE subject='created-subject'", String.class)).isEqualTo("INVITED");
        assertThat(jdbc.queryForObject("SELECT active FROM access_subjects WHERE subject='created-subject'", Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject("SELECT role_key FROM workforce_role_assignments WHERE subject='created-subject' AND source='INVITATION'", String.class))
                .isEqualTo("COORDINATOR");
        assertThat(value("status", invitationId)).isEqualTo("SUCCEEDED");
        assertThat(value("result_subject", invitationId)).isEqualTo("created-subject");
    }

    private IdentityOperationRequested request(UUID id, String key) {
        return IdentityOperationRequested.state(id, key, "staff-1", false, "admin-1", "Security decision");
    }

    private String value(String column, UUID id) {
        return jdbc.queryForObject("SELECT " + column + " FROM identity_operations WHERE id=?", String.class, id);
    }
}
