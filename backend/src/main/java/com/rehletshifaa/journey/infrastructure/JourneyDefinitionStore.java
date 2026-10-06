package com.rehletshifaa.journey.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.journey.application.JourneyDefinitionService;
import com.rehletshifaa.journey.domain.JourneyDefinition;
import com.rehletshifaa.journey.domain.JourneyEdge;
import com.rehletshifaa.journey.domain.JourneyNode;
import com.rehletshifaa.journey.domain.JourneyVersion;
import com.rehletshifaa.journey.domain.JourneyVersionEditor;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.persistence.OffsetPageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.rehletshifaa.journey.domain.JourneyModel.*;
import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The journey definition, its versions and their graphs. The graph is stored twice: the canonical JSON snapshot on the
 * version (authoritative, hashed) and per-element node and edge rows replaced on every save.
 */
@Repository
public class JourneyDefinitionStore {
    private final JourneyDefinitionRepository definitions;
    private final JourneyVersionRepository versions;
    private final JourneyNodeRepository nodes;
    private final JourneyEdgeRepository edges;
    private final JourneyVersionEditorRepository editors;
    private final JourneyDeploymentRepository deployments;
    private final JourneyGovernanceLockRepository governance;
    private final ObjectMapper mapper;
    private final Clock clock;

    public JourneyDefinitionStore(JourneyDefinitionRepository definitions, JourneyVersionRepository versions, JourneyNodeRepository nodes,
                                  JourneyEdgeRepository edges, JourneyVersionEditorRepository editors, JourneyDeploymentRepository deployments,
                                  JourneyGovernanceLockRepository governance, ObjectMapper mapper, Clock clock) {
        this.definitions = definitions; this.versions = versions; this.nodes = nodes; this.edges = edges; this.editors = editors;
        this.deployments = deployments; this.governance = governance; this.mapper = mapper; this.clock = clock;
    }

    public List<Definition> definitions() {
        return definitions.findAll(Sort.by("journeyKey")).stream().map(JourneyDefinition::toModel).toList();
    }

    public Definition definition(UUID id, boolean lock) {
        return (lock ? definitions.lockById(id) : definitions.findById(id)).map(JourneyDefinition::toModel)
                .orElseThrow(JourneyDefinitionStore::notFound);
    }

    public UUID create() {
        governanceLock();
        if (!definitions().isEmpty()) throw new ApiException(409, "JOURNEY_EXISTS", "The canonical International Care Journey already exists.");
        UUID id = UUID.randomUUID();
        definitions.saveAndFlush(new JourneyDefinition(id, "INTERNATIONAL_CARE", "International Care Journey", clock.instant()));
        return id;
    }

    public void governanceLock() { governance.acquire(); }

    public List<Version> versions(UUID definition) {
        List<JourneyVersion> rows = versions.findByDefinitionIdOrderByVersionNumberDesc(definition);
        Set<UUID> deployed = deployments.findAllById(rows.stream().map(JourneyVersion::getId).toList()).stream()
                .map(d -> d.getId()).collect(Collectors.toSet());
        return rows.stream().map(v -> model(v, deployed.contains(v.getId()))).toList();
    }

    /** Resolves the owning definition first; for callers (Journey runtime projections) that only hold a version id. */
    public Version version(UUID id) {
        return versions.findById(id).map(v -> model(v, deployments.existsById(v.getId()))).orElseThrow(JourneyDefinitionStore::notFound);
    }

    public Version version(UUID definition, UUID id) {
        return versions.findByIdAndDefinitionId(id, definition).map(v -> model(v, deployments.existsById(v.getId())))
                .orElseThrow(JourneyDefinitionStore::notFound);
    }

    public Version draft(UUID definition, Graph graph, String actor) {
        if (versions(definition).stream().anyMatch(v -> v.status() != Status.PUBLISHED && v.status() != Status.RETIRED))
            throw new ApiException(409, "DRAFT_EXISTS", "Finish or reuse the existing draft before creating another version.");
        int number = versions.nextNumber(definition);
        UUID id = UUID.randomUUID(); Graph canonical = canonical(graph); String json = json(canonical);
        versions.saveAndFlush(new JourneyVersion(id, definition, number, actor, json, hash(json), clock.instant()));
        elements(id, canonical); editor(id, actor);
        return version(definition, id);
    }

    public void save(Version version, Graph graph, String actor) {
        Graph canonical = canonical(graph); String json = json(canonical);
        changed(versions.saveGraph(version.id(), version.revision(), json, hash(json)));
        elements(version.id(), canonical); editor(version.id(), actor);
    }

    public void transition(Version v, Status status, String validation, String simulation) {
        Instant published = status == Status.PUBLISHED ? clock.instant() : v.publishedAt();
        Instant retired = status == Status.RETIRED ? clock.instant() : v.retiredAt();
        changed(versions.transition(v.id(), v.revision(), status.name(), validation, simulation, micros(published), micros(retired)));
    }

    public List<JourneyDefinitionService.HistoryEntry> history(UUID definition, int offset) {
        return versions.journeyAudit(definition.toString(), definition, OffsetPageRequest.of(offset, 100, Sort.unsorted())).stream()
                .map(e -> new JourneyDefinitionService.HistoryEntry(e.getActorSubject(), e.getEntityId(), e.getAction(), e.getOutcome(),
                        e.getReason(), e.getGovernanceReason(), e.getOccurredAt()))
                .toList();
    }

    /** When anything last happened to this journey or its versions (the newest journey audit event), for list summaries. */
    public Instant lastActivity(UUID definition) { return versions.lastJourneyActivity(definition.toString(), definition); }

    public boolean edited(UUID id, String actor) { return editors.existsById(new JourneyVersionEditor.Key(id, actor)); }

    private void editor(UUID id, String actor) { if (!edited(id, actor)) editors.saveAndFlush(new JourneyVersionEditor(id, actor)); }

    private void elements(UUID id, Graph graph) {
        edges.deleteForVersion(id); nodes.deleteForVersion(id);
        nodes.saveAllAndFlush(graph.nodes().stream().map(n -> new JourneyNode(id, n.key(), json(n))).toList());
        edges.saveAllAndFlush(graph.edges().stream().map(e -> new JourneyEdge(id, e.key(), e.from(), e.to(), json(e))).toList());
    }

    private Version model(JourneyVersion v, boolean deployed) {
        return new Version(v.getId(), v.getDefinitionId(), v.getVersionNumber(), Status.valueOf(v.getStatus()), v.getRevision(), v.getCreatedBy(),
                read(v.getGraphSnapshot(), Graph.class), v.getGraphHash(), v.getValidationSummary(), v.getSimulationSummary(),
                v.getPublishedAt(), v.getRetiredAt(), deployed ? "DEPLOYED" : "NOT_DEPLOYED");
    }

    public String json(Object object) {
        try { return mapper.writeValueAsString(object); } catch (Exception e) { throw new IllegalStateException("Cannot serialize Journey configuration", e); }
    }

    private <T> T read(String json, Class<T> type) {
        try { return mapper.readValue(json, type); } catch (Exception e) { throw new IllegalStateException("Cannot read stored Journey configuration", e); }
    }

    private Graph canonical(Graph g) {
        return new Graph(g.nodes().stream().sorted(Comparator.comparing(Node::key)).toList(), g.edges().stream().sorted(Comparator.comparing(Edge::key)).toList());
    }

    private String hash(String json) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static void changed(int n) { if (n != 1) throw new ApiException(409, "STALE_JOURNEY", "This journey changed. Reload before saving."); }

    private static ApiException notFound() { return new ApiException(404, "JOURNEY_NOT_FOUND", "Journey or version not found."); }
}
