package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.util.UUID;

/** One assignment to keep or revoke in a recertification campaign; decided once. */
@Entity
@Table(name = "access_recertification_items")
public class RecertificationItem extends AssignedIdEntity {
    @Column(name = "campaign_id", nullable = false) private UUID campaignId;
    @Column(nullable = false) private String subject;
    @Column(name = "item_type", nullable = false, length = 20) private String itemType;
    @Column(name = "assignment_id", nullable = false) private UUID assignmentId;
    @Column(name = "role_key", nullable = false, length = 80) private String roleKey;
    @Column(nullable = false, length = 20) private String decision;
    @Column(name = "decided_by") private String decidedBy;
    @Column(name = "decided_at") private java.time.Instant decidedAt;
    @Column(length = 1000) private String reason;
    @Column(nullable = false) private long revision;

    protected RecertificationItem() {}

    public RecertificationItem(UUID campaignId, String subject, String itemType, UUID assignmentId, String roleKey) {
        super(UUID.randomUUID());
        this.campaignId = campaignId; this.subject = subject; this.itemType = itemType; this.assignmentId = assignmentId;
        this.roleKey = roleKey; this.decision = "PENDING";
    }

    public UUID getCampaignId() { return campaignId; }
    public String getSubject() { return subject; }
    public String getItemType() { return itemType; }
    public UUID getAssignmentId() { return assignmentId; }
    public String getRoleKey() { return roleKey; }
    public String getDecision() { return decision; }
    public String getDecidedBy() { return decidedBy; }
    public long getRevision() { return revision; }
}
