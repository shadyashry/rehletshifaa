package com.rehletshifaa.journey.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.journey.domain.JourneyShadowCommand;
import com.rehletshifaa.journey.domain.JourneyShadowRun;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Repository;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JourneyShadowStore {
    public record Run(UUID id, UUID versionId, String engineReference, String requestHash, long revision) {}
    public record Result(String requestHash, String snapshot) {}
    private final JourneyShadowRunRepository runs;
    private final JourneyShadowCommandRepository commands;
    private final Clock clock;
    private final ObjectMapper mapper;
    public JourneyShadowStore(JourneyShadowRunRepository runs, JourneyShadowCommandRepository commands, Clock clock, ObjectMapper mapper) {
        this.runs = runs; this.commands = commands; this.clock = clock; this.mapper = mapper;
    }
    public Optional<Run> replayStart(String actor, String key) { return runs.findByCreatedByAndCommandKey(actor, key).map(JourneyShadowStore::run); }
    public Run lock(UUID id, UUID version) {
        return runs.lockById(id).filter(r -> r.getJourneyVersionId().equals(version)).map(JourneyShadowStore::run)
                .orElseThrow(() -> new ApiException(404, "JOURNEY_SHADOW_NOT_FOUND", "Synthetic journey run not found."));
    }
    public void insert(UUID id, UUID version, String engine, String actor, String key, String hash) {
        runs.saveAndFlush(new JourneyShadowRun(id, version, engine, actor, key, hash, clock.instant()));
    }
    public Optional<Result> result(UUID id, String actor, String key) {
        return commands.findById(new JourneyShadowCommand.Key(id, actor, key)).map(c -> new Result(c.getRequestHash(), c.getResultSnapshot()));
    }
    public void completed(Run run, String actor, String key, String hash, Object result) {
        if (runs.advance(run.id(), run.revision()) != 1) throw new ApiException(409, "STALE_JOURNEY_SHADOW", "Synthetic journey changed; reload it.");
        commands.saveAndFlush(new JourneyShadowCommand(run.id(), actor, key, hash, json(result), clock.instant()));
    }
    public String json(Object value) { try { return mapper.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot encode synthetic runtime metadata", e); } }
    public <T> T read(String value, Class<T> type) { try { return mapper.readValue(value, type); } catch (Exception e) { throw new IllegalStateException("Cannot read synthetic runtime metadata", e); } }
    private static Run run(JourneyShadowRun r) { return new Run(r.getId(), r.getJourneyVersionId(), r.getEngineInstanceRef(), r.getRequestHash(), r.getRevision()); }
}
