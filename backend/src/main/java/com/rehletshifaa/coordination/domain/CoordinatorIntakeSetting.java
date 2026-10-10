package com.rehletshifaa.coordination.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Whether a coordinator takes intake conversations (people writing on WhatsApp before they have a case), how many at
 * once, and their working week ({@link WorkingSchedule} JSON in {@code timeZone}); no schedule means always working.
 */
@Entity
@Table(name = "coordinator_intake_settings")
public class CoordinatorIntakeSetting extends PersistableEntity<String> {
    @Id private String subject;
    @Column(name = "intake_eligible", nullable = false) private boolean intakeEligible;
    @Column(name = "max_intake", nullable = false) private int maxIntake;
    @Column(columnDefinition = "text") private String schedule;
    @Column(name = "time_zone", length = 64) private String timeZone;
    @Column(name = "updated_by", nullable = false) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long revision;

    protected CoordinatorIntakeSetting() {}

    public CoordinatorIntakeSetting(String subject) { this.subject = subject; }

    public void update(boolean intakeEligible, int maxIntake, String schedule, String timeZone, String by, Instant now) {
        this.intakeEligible = intakeEligible; this.maxIntake = maxIntake; this.schedule = schedule; this.timeZone = timeZone;
        this.updatedBy = by; this.updatedAt = micros(now); this.revision++;
    }

    @Override public String getId() { return subject; }
    public String getSubject() { return subject; }
    public boolean isIntakeEligible() { return intakeEligible; }
    public int getMaxIntake() { return maxIntake; }
    public String getSchedule() { return schedule; }
    public String getTimeZone() { return timeZone; }
    public long getRevision() { return revision; }
}
