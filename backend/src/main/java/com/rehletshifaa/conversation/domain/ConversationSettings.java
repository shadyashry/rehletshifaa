package com.rehletshifaa.conversation.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The team's working week (WorkingSchedule JSON in {@code timeZone}) and how fast a waiting patient must be answered. */
@Entity
@Table(name = "conversation_settings")
public class ConversationSettings extends PersistableEntity<Integer> {
    public static final int ID = 1;
    @Id private Integer id;
    @Column(name = "business_hours", nullable = false, columnDefinition = "text") private String businessHours;
    @Column(name = "time_zone", nullable = false, length = 64) private String timeZone;
    @Column(name = "first_response_minutes", nullable = false) private int firstResponseMinutes;
    @Column(name = "escalation_minutes", nullable = false) private int escalationMinutes;
    @Column(name = "idle_close_hours", nullable = false) private int idleCloseHours;
    @Column(name = "updated_by", nullable = false) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long revision;

    protected ConversationSettings() {}

    public void update(String businessHours, String timeZone, int firstResponseMinutes, int escalationMinutes, int idleCloseHours, String by, Instant now) {
        this.businessHours = businessHours; this.timeZone = timeZone; this.firstResponseMinutes = firstResponseMinutes;
        this.escalationMinutes = escalationMinutes; this.idleCloseHours = idleCloseHours; this.updatedBy = by; this.updatedAt = micros(now); revision++;
    }

    @Override public Integer getId() { return id; }
    public String getBusinessHours() { return businessHours; }
    public String getTimeZone() { return timeZone; }
    public int getFirstResponseMinutes() { return firstResponseMinutes; }
    public int getEscalationMinutes() { return escalationMinutes; }
    public int getIdleCloseHours() { return idleCloseHours; }
    public long getRevision() { return revision; }
}
