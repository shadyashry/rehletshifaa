package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/** An edge of a journey version graph (JSON configuration), replaced whenever the graph is saved. */
@Entity
@Immutable
@IdClass(JourneyEdge.Key.class)
@Table(name = "journey_edges")
public class JourneyEdge extends PersistableEntity<JourneyEdge.Key> {
    public record Key(UUID versionId, String edgeKey) {}

    @Id @Column(name = "version_id") private UUID versionId;
    @Id @Column(name = "edge_key", length = 60) private String edgeKey;
    @Column(name = "source_key", nullable = false, length = 60) private String sourceKey;
    @Column(name = "target_key", nullable = false, length = 60) private String targetKey;
    @Column(nullable = false, columnDefinition = "text") private String configuration;

    protected JourneyEdge() {}

    public JourneyEdge(UUID versionId, String edgeKey, String sourceKey, String targetKey, String configuration) {
        this.versionId = versionId; this.edgeKey = edgeKey; this.sourceKey = sourceKey; this.targetKey = targetKey; this.configuration = configuration;
    }

    @Override public Key getId() { return new Key(versionId, edgeKey); }
}
