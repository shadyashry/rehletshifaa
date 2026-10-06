package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/** That a person edited a journey version (the four-eyes rule excludes editors from approving it). */
@Entity
@Immutable
@IdClass(JourneyVersionEditor.Key.class)
@Table(name = "journey_version_editors")
public class JourneyVersionEditor extends PersistableEntity<JourneyVersionEditor.Key> {
    public record Key(UUID versionId, String actorSubject) {}

    @Id @Column(name = "version_id") private UUID versionId;
    @Id @Column(name = "actor_subject") private String actorSubject;

    protected JourneyVersionEditor() {}

    public JourneyVersionEditor(UUID versionId, String actorSubject) {
        this.versionId = versionId; this.actorSubject = actorSubject;
    }

    @Override public Key getId() { return new Key(versionId, actorSubject); }
}
