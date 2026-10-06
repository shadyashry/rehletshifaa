package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/** A node of a journey version graph (JSON configuration), replaced whenever the graph is saved. */
@Entity
@Immutable
@IdClass(JourneyNode.Key.class)
@Table(name = "journey_nodes")
public class JourneyNode extends PersistableEntity<JourneyNode.Key> {
    public record Key(UUID versionId, String nodeKey) {}

    @Id @Column(name = "version_id") private UUID versionId;
    @Id @Column(name = "node_key", length = 60) private String nodeKey;
    @Column(nullable = false, columnDefinition = "text") private String configuration;

    protected JourneyNode() {}

    public JourneyNode(UUID versionId, String nodeKey, String configuration) {
        this.versionId = versionId; this.nodeKey = nodeKey; this.configuration = configuration;
    }

    @Override public Key getId() { return new Key(versionId, nodeKey); }
}
