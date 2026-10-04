package com.rehletshifaa.clinic.application;

import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityAdminView;
import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.IdResult;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Structured clinical capabilities are platform governance: approved by credentialing (never by the consultant
 * or a practice manager), and never self-approved. An approved CARE_AREA capability widens assignment eligibility.
 */
@Service
public class ConsultantCapabilityService {
    private final JdbcClient jdbc;
    private final Authority authority;
    private final Clock clock;

    public ConsultantCapabilityService(JdbcClient jdbc, Authority authority, Clock clock) {
        this.jdbc = jdbc; this.authority = authority; this.clock = clock;
    }

    public List<CapabilityAdminView> list(UUID practitionerId) {
        authority.authorize(Permission.CREDENTIAL_READ);
        return jdbc.sql("SELECT * FROM consultant_capabilities WHERE practitioner_id=? ORDER BY capability_type,label").param(practitionerId)
                .query((rs, n) -> new CapabilityAdminView(rs.getObject("id", UUID.class), rs.getString("capability_type"), rs.getString("capability_code"),
                        rs.getString("label"), rs.getString("status"), rs.getObject("approved_at", OffsetDateTime.class).toInstant(), rs.getLong("version")))
                .list();
    }

    /** Approve (or re-approve a revoked) capability. */
    @Transactional
    public IdResult approve(UUID practitionerId, CapabilityRequest request) {
        var actor = governor(practitionerId);
        if ("CARE_AREA".equals(request.type())) {
            long area = jdbc.sql("SELECT COUNT(*) FROM care_categories WHERE slug=?").param(request.code()).query(Long.class).single();
            if (area == 0) throw new ApiException(400, "INVALID_CARE_CATEGORY", "Select a managed care area");
        }
        Instant now = clock.instant();
        UUID id = jdbc.sql("SELECT id FROM consultant_capabilities WHERE practitioner_id=? AND capability_type=? AND capability_code=?")
                .params(practitionerId, request.type(), request.code()).query(UUID.class).optional().orElse(null);
        if (id == null) {
            id = UUID.randomUUID();
            jdbc.sql("INSERT INTO consultant_capabilities(id,practitioner_id,capability_type,capability_code,label,status,approved_by,approved_at,version) VALUES(?,?,?,?,?,'APPROVED',?,?,0)")
                    .params(id, practitionerId, request.type(), request.code(), request.label().trim(), actor.subject(), timestamp(now)).update();
        } else {
            jdbc.sql("UPDATE consultant_capabilities SET label=?,status='APPROVED',approved_by=?,approved_at=?,revoked_by=NULL,revoked_at=NULL,version=version+1 WHERE id=?")
                    .params(request.label().trim(), actor.subject(), timestamp(now), id).update();
        }
        audit(actor, practitionerId, "CONSULTANT_CAPABILITY_APPROVED", "APPROVE", request.type() + ":" + request.code());
        return new IdResult(id, "APPROVED");
    }

    @Transactional
    public IdResult revoke(UUID practitionerId, UUID capabilityId) {
        var actor = governor(practitionerId);
        int changed = jdbc.sql("UPDATE consultant_capabilities SET status='REVOKED',revoked_by=?,revoked_at=?,version=version+1 WHERE id=? AND practitioner_id=? AND status='APPROVED'")
                .params(actor.subject(), timestamp(clock.instant()), capabilityId, practitionerId).update();
        if (changed != 1) throw new ApiException(409, "CAPABILITY_NOT_ACTIVE", "This capability is not currently approved");
        audit(actor, practitionerId, "CONSULTANT_CAPABILITY_REVOKED", "REVOKE", capabilityId.toString());
        return new IdResult(capabilityId, "REVOKED");
    }

    private Actor governor(UUID practitionerId) {
        var actor = authority.authorize(Permission.CAPABILITY_DECIDE);
        var subject = jdbc.sql("SELECT external_subject FROM practitioner_profiles WHERE id=? AND practitioner_type='CONSULTANT'").param(practitionerId)
                .query(String.class).optional();
        if (jdbc.sql("SELECT COUNT(*) FROM practitioner_profiles WHERE id=? AND practitioner_type='CONSULTANT'").param(practitionerId).query(Long.class).single() == 0)
            throw new ApiException(404, "PRACTITIONER_NOT_FOUND", "Consultant profile was not found");
        if (subject.isPresent() && actor.subject().equals(subject.get()))
            throw new ApiException(403, "SELF_VERIFICATION_PROHIBITED", "Another authorized reviewer must approve your clinical capabilities");
        return actor;
    }

    private void audit(Actor actor, UUID practitionerId, String type, String action, String detail) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, actor.subject(), actor.label(), "Practitioner", practitionerId.toString(), action, "SUCCESS", detail,
                        timestamp(clock.instant()))
                .update();
    }
}
