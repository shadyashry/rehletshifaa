package com.rehletshifaa.access.platform.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.List;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Singleton (id=1) record of the one-shot initial governance handover: an owner and two administrators. */
@Entity
@Table(name = "platform_governance_bootstrap")
public class PlatformGovernanceBootstrap {
    public static final int ID = 1;

    @Id private Integer id;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "owner_subject") private String ownerSubject;
    @Column(name = "first_administrator_subject") private String firstAdministratorSubject;
    @Column(name = "second_administrator_subject") private String secondAdministratorSubject;

    protected PlatformGovernanceBootstrap() {}

    public void complete(String owner, List<String> administrators, Instant at) {
        completedAt = micros(at); ownerSubject = owner;
        firstAdministratorSubject = administrators.get(0); secondAdministratorSubject = administrators.get(1);
    }

    public Instant getCompletedAt() { return completedAt; }
    public String getOwnerSubject() { return ownerSubject; }
    public List<String> getAdministrators() { return List.of(firstAdministratorSubject, secondAdministratorSubject); }
}
