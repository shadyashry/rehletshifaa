package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/** The singleton pointer to the active admission policy revision; replaced (deleted and inserted) on activation. */
@Entity
@Immutable
@Table(name = "journey_admission_policy_current")
public class JourneyAdmissionPolicyPointer extends PersistableEntity<Integer> {
    public static final int SINGLETON = 1;
    @Id @Column(name = "singleton_id") private Integer singletonId;
    @Column(name = "policy_revision_id", nullable = false, unique = true) private UUID policyRevisionId;

    protected JourneyAdmissionPolicyPointer() {}

    public JourneyAdmissionPolicyPointer(UUID policyRevisionId) { this.singletonId = SINGLETON; this.policyRevisionId = policyRevisionId; }

    @Override public Integer getId() { return singletonId; }
    public UUID getPolicyRevisionId() { return policyRevisionId; }
}
