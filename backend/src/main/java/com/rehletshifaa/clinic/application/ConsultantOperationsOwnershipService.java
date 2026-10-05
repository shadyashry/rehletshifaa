package com.rehletshifaa.clinic.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Effective-dated Consultant Operations ownership and SOD-05 decision-time conflict enforcement. */
@Service
public class ConsultantOperationsOwnershipService {
    private final JdbcClient jdbc;
    private final Authority authority;
    private final CryptoService crypto;
    private final Clock clock;

    public ConsultantOperationsOwnershipService(JdbcClient jdbc, Authority authority, CryptoService crypto, Clock clock) {
        this.jdbc = jdbc; this.authority = authority; this.crypto = crypto; this.clock = clock;
    }

    public record Assign(String ownerSubject, String reason) {}
    public record OwnershipView(UUID id, String ownerSubject, String ownerName, Instant effectiveFrom, Instant effectiveTo,
                                String status, String assignedBy, String reason, String endedBy, String endReason, long revision) {}
    public record OwnershipHistory(UUID practitionerId, OwnershipView current, List<OwnershipView> history) {}

    @Transactional(readOnly = true)
    public OwnershipHistory history(UUID practitionerId) {
        authority.authorize(Permission.CONSULTANT_ONBOARD);
        ensureConsultant(practitionerId, false);
        List<OwnershipView> rows = jdbc.sql("SELECT o.id,o.owner_subject,p.display_name_encrypted,o.effective_from,o.effective_to,o.status,o.assigned_by,o.reason,o.ended_by,o.end_reason,o.revision "
                        + "FROM consultant_operations_ownerships o JOIN workforce_people p ON p.subject=o.owner_subject "
                        + "WHERE o.practitioner_id=? ORDER BY o.effective_from DESC")
                .param(practitionerId).query((rs, n) -> new OwnershipView(rs.getObject(1, UUID.class), rs.getString(2),
                        crypto.decrypt(rs.getString(3)), rs.getObject(4, OffsetDateTime.class).toInstant(),
                        rs.getObject(5, OffsetDateTime.class) == null ? null : rs.getObject(5, OffsetDateTime.class).toInstant(),
                        rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9), rs.getString(10), rs.getLong(11))).list();
        return new OwnershipHistory(practitionerId, rows.stream().filter(v -> "ACTIVE".equals(v.status())).findFirst().orElse(null), rows);
    }

    @Transactional
    public OwnershipView assign(UUID practitionerId, Assign command) {
        Actor actor = authority.authorize(Permission.CONSULTANT_ONBOARD);
        String owner = required(command.ownerSubject(), 255, "Choose an eligible Consultant Operations owner");
        String reason = required(command.reason(), 500, "Give a reason for the ownership change");
        ensureConsultant(practitionerId, true);
        lockFunction();
        ensureEligibleOwner(owner);
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Current current = current(practitionerId);
        if (current != null && current.ownerSubject().equals(owner))
            throw new ApiException(409, "CONSULTANT_OWNER_UNCHANGED", "This person already owns Consultant Operations for the Consultant");
        if (current != null) {
            Instant end = now.isAfter(current.effectiveFrom()) ? now : current.effectiveFrom().plus(1, ChronoUnit.MICROS);
            jdbc.sql("DELETE FROM consultant_current_operations_owners WHERE practitioner_id=? AND ownership_id=?")
                    .params(practitionerId, current.id()).update();
            if (jdbc.sql("UPDATE consultant_operations_ownerships SET status='ENDED',effective_to=?,ended_by=?,end_reason=?,revision=revision+1 "
                            + "WHERE id=? AND revision=? AND status='ACTIVE'")
                    .params(timestamp(end), actor.subject(), reason, current.id(), current.revision()).update() != 1) stale();
            now = end;
        }
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO consultant_operations_ownerships(id,practitioner_id,owner_subject,effective_from,status,assigned_by,reason,created_at,revision) "
                        + "VALUES(?,?,?,?,'ACTIVE',?,?,?,0)")
                .params(id, practitionerId, owner, timestamp(now), actor.subject(), reason, timestamp(clock.instant())).update();
        jdbc.sql("INSERT INTO consultant_current_operations_owners(practitioner_id,ownership_id,owner_subject) VALUES(?,?,?)")
                .params(practitionerId, id, owner).update();
        snapshotForOpenCredentials(practitionerId, owner);
        audit(actor, practitionerId, current == null ? "CONSULTANT_OWNER_ASSIGNED" : "CONSULTANT_OWNER_REASSIGNED", reason,
                "owner=" + owner + (current == null ? "" : "; previous=" + current.ownerSubject()));
        return history(practitionerId).current();
    }

    /** Captures the consultant and current owner when a credential review is opened. */
    @Transactional
    public void openCredentialReview(UUID practitionerId, UUID credentialId) {
        String consultant = ensureConsultant(practitionerId, true);
        Current owner = current(practitionerId);
        snapshot(practitionerId, "CREDENTIAL", credentialId, consultant, "CONSULTANT");
        if (owner != null) snapshot(practitionerId, "CREDENTIAL", credentialId, owner.ownerSubject(), "OPERATIONS_OWNER");
    }

    /** Locks the Consultant so ownership changes and credential decisions are serialized. */
    @Transactional
    public void requireCredentialReviewer(UUID practitionerId, String reviewer) {
        String consultant = ensureConsultant(practitionerId, true);
        Current owner = current(practitionerId);
        if (reviewer.equals(consultant) || (owner != null && reviewer.equals(owner.ownerSubject()))
                || jdbc.sql("SELECT COUNT(*) FROM consultant_review_conflicts c JOIN practitioner_credentials p ON p.id=c.review_reference "
                                + "WHERE c.practitioner_id=? AND c.review_kind='CREDENTIAL' AND c.conflict_subject=? AND p.status='UNDER_REVIEW'")
                        .params(practitionerId, reviewer).query(Long.class).single() > 0)
            throw new ApiException(403, "INDEPENDENT_REVIEW_REQUIRED", "A Consultant and their Consultant Operations owner cannot decide this review");
    }

    @Transactional
    public void requireCapabilityReviewer(UUID practitionerId, String reviewer) {
        String consultant = ensureConsultant(practitionerId, true);
        Current owner = current(practitionerId);
        if (reviewer.equals(consultant) || (owner != null && reviewer.equals(owner.ownerSubject())))
            throw new ApiException(403, "INDEPENDENT_REVIEW_REQUIRED", "A Consultant and their Consultant Operations owner cannot decide capabilities");
    }

    private void snapshotForOpenCredentials(UUID practitionerId, String owner) {
        jdbc.sql("SELECT id FROM practitioner_credentials WHERE practitioner_id=? AND status='UNDER_REVIEW'").param(practitionerId)
                .query(UUID.class).list().forEach(id -> snapshot(practitionerId, "CREDENTIAL", id, owner, "OPERATIONS_OWNER"));
    }

    private void snapshot(UUID practitionerId, String kind, UUID reference, String subject, String source) {
        if (subject == null) return;
        if (jdbc.sql("SELECT COUNT(*) FROM consultant_review_conflicts WHERE review_kind=? AND review_reference=? AND conflict_subject=?")
                .params(kind, reference, subject).query(Long.class).single() == 0)
            jdbc.sql("INSERT INTO consultant_review_conflicts(id,practitioner_id,review_kind,review_reference,conflict_subject,conflict_source,recorded_at) VALUES(?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(), practitionerId, kind, reference, subject, source, timestamp(clock.instant())).update();
    }

    private String ensureConsultant(UUID id, boolean lock) {
        String sql = "SELECT id FROM practitioner_profiles WHERE id=? AND practitioner_type='CONSULTANT'" + (lock ? " FOR UPDATE" : "");
        if (jdbc.sql(sql).param(id).query(UUID.class).optional().isEmpty())
            throw new ApiException(404, "PRACTITIONER_NOT_FOUND", "Consultant profile was not found");
        return jdbc.sql("SELECT external_subject FROM practitioner_profiles WHERE id=?").param(id).query(String.class).optional().orElse(null);
    }

    private void lockFunction() {
        jdbc.sql("SELECT function_key FROM workforce_functions WHERE function_key='CONSULTANT_OPERATIONS' FOR UPDATE")
                .query(String.class).single();
    }

    private void ensureEligibleOwner(String subject) {
        long eligible = jdbc.sql("SELECT COUNT(*) FROM workforce_people p JOIN workforce_role_assignments a ON a.subject=p.subject "
                        + "WHERE p.subject=? AND p.lifecycle_status='ACTIVE' AND a.role_key='CONSULTANT_OPERATIONS_MANAGER' AND a.status='ACTIVE' "
                        + "AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?)")
                .params(subject, timestamp(clock.instant()), timestamp(clock.instant())).query(Long.class).single();
        if (eligible == 0) throw new ApiException(409, "CONSULTANT_OWNER_NOT_ELIGIBLE", "The owner must be active Consultant Operations staff");
    }

    private Current current(UUID practitionerId) {
        return jdbc.sql("SELECT o.id,o.owner_subject,o.effective_from,o.revision FROM consultant_current_operations_owners c "
                        + "JOIN consultant_operations_ownerships o ON o.id=c.ownership_id WHERE c.practitioner_id=?")
                .param(practitionerId).query((rs, n) -> new Current(rs.getObject(1, UUID.class), rs.getString(2),
                        rs.getObject(3, OffsetDateTime.class).toInstant(), rs.getLong(4))).optional().orElse(null);
    }

    private void audit(Actor actor, UUID practitionerId, String event, String reason, String detail) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), event, actor.subject(), actor.label(), "Practitioner", practitionerId.toString(), "OWNERSHIP_CHANGE",
                        "SUCCESS", bounded(detail + "; reason=" + reason), timestamp(clock.instant())).update();
    }

    private record Current(UUID id, String ownerSubject, Instant effectiveFrom, long revision) {}
    private static String required(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }
    private static String bounded(String value) { return value.length() <= 1000 ? value : value.substring(0, 1000); }
    private static void stale() { throw new ApiException(409, "STALE_CONSULTANT_OWNERSHIP", "Ownership changed; reload and try again"); }
}
