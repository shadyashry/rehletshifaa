package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The stored result of one command on a shadow run, replayed for a repeated (run, actor, command key). */
@Entity
@Immutable
@IdClass(JourneyShadowCommand.Key.class)
@Table(name = "journey_shadow_commands")
public class JourneyShadowCommand extends PersistableEntity<JourneyShadowCommand.Key> {
    public record Key(UUID runId, String actorSubject, String commandKey) {}

    @Id @Column(name = "run_id") private UUID runId;
    @Id @Column(name = "actor_subject") private String actorSubject;
    @Id @Column(name = "command_key", length = 80) private String commandKey;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(name = "result_snapshot", nullable = false, columnDefinition = "text") private String resultSnapshot;
    @Column(name = "completed_at", nullable = false) private Instant completedAt;

    protected JourneyShadowCommand() {}

    public JourneyShadowCommand(UUID runId, String actorSubject, String commandKey, String requestHash, String resultSnapshot, Instant now) {
        this.runId = runId; this.actorSubject = actorSubject; this.commandKey = commandKey; this.requestHash = requestHash;
        this.resultSnapshot = resultSnapshot; this.completedAt = micros(now);
    }

    @Override public Key getId() { return new Key(runId, actorSubject, commandKey); }
    public String getRequestHash() { return requestHash; }
    public String getResultSnapshot() { return resultSnapshot; }
}
