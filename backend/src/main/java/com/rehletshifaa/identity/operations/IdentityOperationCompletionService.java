package com.rehletshifaa.identity.operations;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class IdentityOperationCompletionService {
    private final JdbcClient jdbc;
    private final IdentityOperationStore store;
    private final Clock clock;

    public IdentityOperationCompletionService(JdbcClient jdbc, IdentityOperationStore store, Clock clock) {
        this.jdbc = jdbc;
        this.store = store;
        this.clock = clock;
    }

    @Transactional
    public void created(IdentityOperationStore.Operation operation, String subject) {
        if ("WorkforceInvitation".equals(operation.targetType())) completeInvitation(operation, subject);
        else if ("Practitioner".equals(operation.targetType())) completePractitioner(operation, subject);
        else throw new ApiException(409, "IDENTITY_OPERATION_TARGET_INVALID", "Identity operation target is invalid");
        if (!store.succeeded(operation, subject)) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Identity operation changed while completing");
    }

    @Transactional
    public void practiceManagerIdentityReady(IdentityOperationStore.Operation operation, String subject) {
        int changed = jdbc.sql("UPDATE practice_manager_invitations SET identity_resolution_status='READY',resolved_subject=?,updated_at=?,version=version+1 " +
                        "WHERE id=? AND status='INVITED' AND identity_resolution_status='PENDING'")
                .params(subject, timestamp(clock.instant()), operation.targetId()).update();
        if (changed != 1) throw new ApiException(409, "INVITATION_IDENTITY_CONFLICT", "The invitation no longer matches this operation");
        if (!store.succeeded(operation, subject)) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Identity operation changed while completing");
    }

    @Transactional
    public void practiceManagerIdentityConflict(IdentityOperationStore.Operation operation) {
        int changed = jdbc.sql("UPDATE practice_manager_invitations SET identity_resolution_status='REVIEW_REQUIRED',updated_at=?,version=version+1 " +
                        "WHERE id=? AND status='INVITED' AND identity_resolution_status='PENDING'")
                .params(timestamp(clock.instant()), operation.targetId()).update();
        if (changed != 1) throw new ApiException(409, "INVITATION_IDENTITY_CONFLICT", "The invitation no longer matches this operation");
        if (!store.succeeded(operation)) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Identity operation changed while completing");
    }

    /**
     * STF-01/02: the identity now exists, so the invited person and their invited roles are recorded. The person is
     * INVITED with inactive platform access; the roles take effect only after activation with MFA.
     */
    private void completeInvitation(IdentityOperationStore.Operation operation, String subject) {
        var now = clock.instant();
        int changed = jdbc.sql("UPDATE workforce_invitations SET subject=?,status='SENT',revision=revision+1 " +
                        "WHERE id=? AND status IN ('QUEUED','SENT') AND (subject IS NULL OR subject=?)")
                .params(subject, operation.targetId(), subject).update();
        if (changed != 1) throw new ApiException(409, "INVITATION_IDENTITY_CONFLICT", "The invitation no longer matches this operation");
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) SELECT ?,FALSE,0 " +
                        "WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)")
                .params(subject, subject).update();
        jdbc.sql("INSERT INTO workforce_people(subject,display_name_encrypted,email_encrypted,email_hash,locale,lifecycle_status,created_at,updated_at,revision) " +
                        "SELECT ?,i.display_name_encrypted,i.email_encrypted,i.email_hash,i.locale,'INVITED',i.created_at,?,0 FROM workforce_invitations i " +
                        "WHERE i.id=? AND NOT EXISTS(SELECT 1 FROM workforce_people p WHERE p.subject=?)")
                .params(subject, timestamp(now), operation.targetId(), subject).update();
        for (String role : jdbc.sql("SELECT role_key FROM workforce_invitation_roles WHERE invitation_id=? ORDER BY role_key")
                .param(operation.targetId()).query(String.class).list())
            jdbc.sql("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,status,source,assigned_by,reason,created_at,revision) " +
                            "SELECT ?,?,?,?,'ACTIVE','INVITATION',i.invited_by,i.reason,?,0 FROM workforce_invitations i WHERE i.id=? " +
                            "AND NOT EXISTS(SELECT 1 FROM workforce_role_assignments a WHERE a.subject=? AND a.role_key=? AND a.source='INVITATION')")
                    .params(UUID.randomUUID(), subject, role, timestamp(now), timestamp(now), operation.targetId(), subject, role).update();
    }

    private void completePractitioner(IdentityOperationStore.Operation operation, String subject) {
        int changed = jdbc.sql("UPDATE practitioner_profiles SET external_subject=?,updated_at=?,version=version+1 " +
                        "WHERE id=? AND (external_subject IS NULL OR external_subject=?)")
                .params(subject, timestamp(clock.instant()), operation.targetId(), subject).update();
        if (changed != 1) throw new ApiException(409, "PRACTITIONER_IDENTITY_CONFLICT", "Consultant identity no longer matches this operation");
    }
}
