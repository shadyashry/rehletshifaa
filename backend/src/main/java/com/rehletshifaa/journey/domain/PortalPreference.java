package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A signed-in person's portal display preferences (never a legal name or credential). */
@Entity
@Table(name = "portal_preferences")
public class PortalPreference extends PersistableEntity<String> {
    @Id private String subject;
    @Column(name = "display_name_encrypted", columnDefinition = "text") private String displayNameEncrypted;
    @Column(nullable = false, length = 2) private String locale;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected PortalPreference() {}

    public PortalPreference(String subject) { this.subject = subject; }

    @Override public String getId() { return subject; }
    public String getDisplayNameEncrypted() { return displayNameEncrypted; }
    public String getLocale() { return locale; }

    public void change(String displayNameEncrypted, String locale, Instant now) {
        this.displayNameEncrypted = displayNameEncrypted; this.locale = locale; this.updatedAt = micros(now);
    }
}
