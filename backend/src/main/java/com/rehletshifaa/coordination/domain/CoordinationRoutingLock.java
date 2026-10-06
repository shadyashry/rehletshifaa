package com.rehletshifaa.coordination.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** The single row that serializes routing decisions and routing configuration. Holding its lock is the point. */
@Entity
@Table(name = "coordination_routing_lock")
public class CoordinationRoutingLock {
    public static final int ID = 1;
    @Id private Integer id;

    protected CoordinationRoutingLock() {}
}
