package com.rehletshifaa.journey.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** The single row that serializes journey governance (definition, versions, admission policy). Holding its lock is the point. */
@Entity
@Table(name = "journey_governance_lock")
public class JourneyGovernanceLock {
    public static final int ID = 1;
    @Id private Integer id;

    protected JourneyGovernanceLock() {}
}
