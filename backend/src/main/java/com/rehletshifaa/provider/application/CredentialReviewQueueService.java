package com.rehletshifaa.provider.application;

import com.rehletshifaa.access.application.AccessIdentity;
import com.rehletshifaa.access.application.AuthorizationService;
import com.rehletshifaa.access.domain.ChannelEntitlement;
import com.rehletshifaa.access.domain.ResourceContext;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;

/**
 * Credential Reviews' one read: the review work of every provider organization in which the caller holds the
 * independent-review capability ({@code credential.review}, the same check as the per-organization queue), replacing a
 * per-organization fan-out. Read-only; no new state: rows are grouped by the stored revision status.
 *
 * <ul>
 *   <li>{@code open} — SUBMITTED (needs review), UNDER_REVIEW (in review) and MORE_INFORMATION_REQUIRED where that request
 *   is still the latest submission of the credential (a newer submission supersedes it), oldest submission first;</li>
 *   <li>{@code completed} — the most recent {@value #COMPLETED_LIMIT} decided revisions (VERIFIED, REJECTED, SUSPENDED).</li>
 * </ul>
 * Rows carry names and stored plain facts only. The encrypted submitted facts (issuer, reference number) stay on the review
 * page, whose read is individually audited; no reason, evidence or patient/case/commercial data is returned.
 */
@Service
public class CredentialReviewQueueService {
    static final int COMPLETED_LIMIT = 50;
    private final JdbcClient jdbc;
    private final AuthorizationService authorization;
    private final AccessIdentity identity;
    private final ProviderOrganizationService organizations;

    public CredentialReviewQueueService(JdbcClient jdbc, AuthorizationService authorization, AccessIdentity identity, ProviderOrganizationService organizations) {
        this.jdbc = jdbc; this.authorization = authorization; this.identity = identity; this.organizations = organizations;
    }

    public List<QueueRow> queue(String view) {
        boolean completed = switch (view == null ? "open" : view) {
            case "open" -> false;
            case "completed" -> true;
            default -> throw new ApiException(400, "INVALID_QUEUE_VIEW", "Choose the open or completed review view");
        };
        var actor = identity.current();
        List<UUID> reviewable = jdbc.sql("SELECT o.id FROM provider_organizations o JOIN access_memberships m ON m.organization_id=o.id AND m.subject=? AND m.status='ACTIVE' WHERE o.status<>'OFFBOARDED'")
                .param(actor.subject()).query(UUID.class).list().stream().filter(org -> reviewer(actor, org)).toList();
        if (reviewable.isEmpty()) return List.of();
        String select = "SELECT r.id,r.revision_number,r.status,r.jurisdiction,r.expires_at,r.submitted_at,r.reviewed_by,r.reviewed_at,d.organization_id,d.practitioner_id,d.credential_type,d.status dossier_status,"
                + "p.external_subject,o.display_name organization_name,c.clinician_type,"
                + "(SELECT COUNT(*) FROM provider_credential_revision_evidence e WHERE e.revision_id=r.id) evidence_count,"
                + "(SELECT MAX(x.revision_number) FROM provider_credential_revisions x WHERE x.dossier_id=r.dossier_id) latest_revision "
                + "FROM provider_credential_revisions r JOIN provider_credential_dossiers d ON d.id=r.dossier_id JOIN practitioner_profiles p ON p.id=d.practitioner_id "
                + "JOIN provider_organizations o ON o.id=d.organization_id LEFT JOIN clinician_onboardings c ON c.organization_id=d.organization_id AND c.practitioner_id=d.practitioner_id "
                + "WHERE d.organization_id IN (:organizations) AND r.status IN (:statuses) ";
        List<Stored> rows = completed
                ? jdbc.sql(select + "ORDER BY r.reviewed_at DESC LIMIT " + COMPLETED_LIMIT).param("organizations", reviewable).param("statuses", List.of("VERIFIED", "REJECTED", "SUSPENDED")).query(this::stored).list()
                : jdbc.sql(select + "ORDER BY r.submitted_at").param("organizations", reviewable).param("statuses", List.of("SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED")).query(this::stored).list()
                        .stream().filter(r -> !r.status().equals("MORE_INFORMATION_REQUIRED") || r.revisionNumber() == r.latestRevision()).toList();
        return rows.stream().map(r -> new QueueRow(r.id(), r.organizationId(), r.organizationName(), r.practitionerId(),
                organizations.memberName(r.ownerSubject(), r.organizationId(), r.practitionerId()), r.clinicianType(), r.credentialType(), r.revisionNumber(), r.status(), r.dossierStatus(),
                r.jurisdiction(), r.expiresAt(), r.submittedAt(), r.reviewedBy(), r.reviewedBy() == null ? null : organizations.memberName(r.reviewedBy(), r.organizationId(), null), r.reviewedAt(), r.evidenceCount())).toList();
    }

    private boolean reviewer(AccessIdentity.Identity actor, UUID organization) {
        var resource = new ResourceContext(organization, true, "PROVIDER_ORGANIZATION", organization.toString(), null, false);
        return authorization.decide(actor, "credential.review", resource, ChannelEntitlement.ADMIN_WEB).allowed()
                || authorization.decide(actor, "credential.review", resource, ChannelEntitlement.API).allowed();
    }

    private Stored stored(ResultSet r, int n) throws SQLException {
        return new Stored(r.getObject("id", UUID.class), r.getInt("revision_number"), r.getString("status"), r.getString("jurisdiction"), instant(r, "expires_at"), instant(r, "submitted_at"),
                r.getString("reviewed_by"), instant(r, "reviewed_at"), r.getObject("organization_id", UUID.class), r.getObject("practitioner_id", UUID.class), r.getString("credential_type"),
                r.getString("dossier_status"), r.getString("external_subject"), r.getString("organization_name"), r.getString("clinician_type"), r.getInt("evidence_count"), r.getInt("latest_revision"));
    }
    private static Instant instant(ResultSet r, String column) throws SQLException { var t = r.getTimestamp(column); return t == null ? null : t.toInstant(); }

    private record Stored(UUID id, int revisionNumber, String status, String jurisdiction, Instant expiresAt, Instant submittedAt, String reviewedBy, Instant reviewedAt,
                          UUID organizationId, UUID practitionerId, String credentialType, String dossierStatus, String ownerSubject, String organizationName, String clinicianType,
                          int evidenceCount, int latestRevision) {}

    /**
     * One credential submission awaiting or past review. {@code reviewedBy}/{@code reviewerName}: who started the review (UNDER_REVIEW),
     * requested information (MORE_INFORMATION_REQUIRED) or decided — starting a review assigns it, it never verifies.
     */
    public record QueueRow(UUID id, UUID organizationId, String organizationName, UUID practitionerId, String clinicianName, String clinicianType, String credentialType,
                           int revisionNumber, String status, String dossierStatus, String jurisdiction, Instant expiresAt, Instant submittedAt, String reviewedBy,
                           String reviewerName, Instant reviewedAt, int evidenceCount) {}
}
