package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Platform access switch for an authenticated subject; workforce lifecycle changes toggle it (IAM-08). */
@Entity
@Table(name = "access_subjects")
public class AccessSubject extends PersistableEntity<String> {
    @Id @Column(length = 255) private String subject;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private long revision;

    protected AccessSubject() {}

    public AccessSubject(String subject, boolean active) { this.subject = subject; this.active = active; }

    @Override public String getId() { return subject; }
    public boolean isActive() { return active; }
    public long getRevision() { return revision; }
}
