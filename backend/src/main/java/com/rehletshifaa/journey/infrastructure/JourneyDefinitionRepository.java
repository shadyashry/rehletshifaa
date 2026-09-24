package com.rehletshifaa.journey.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.time.*;
import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;
import static com.rehletshifaa.journey.domain.JourneyModel.*;

@Repository
public class JourneyDefinitionRepository {
    private final JdbcClient jdbc;private final ObjectMapper mapper;private final Clock clock;
    public JourneyDefinitionRepository(JdbcClient jdbc,ObjectMapper mapper,Clock clock){this.jdbc=jdbc;this.mapper=mapper;this.clock=clock;}
    public List<Definition> definitions(){return jdbc.sql("SELECT * FROM journey_definitions ORDER BY journey_key").query((r,n)->new Definition(r.getObject("id",UUID.class),r.getString("journey_key"),r.getString("display_name"),r.getTimestamp("created_at").toInstant())).list();}
    public Definition definition(UUID id,boolean lock){
        return jdbc.sql("SELECT * FROM journey_definitions WHERE id=?"+(lock?" FOR UPDATE":"")).param(id).query((r,n)->new Definition(r.getObject("id",UUID.class),r.getString("journey_key"),r.getString("display_name"),r.getTimestamp("created_at").toInstant())).optional().orElseThrow(JourneyDefinitionRepository::notFound);
    }
    public UUID create(){
        jdbc.sql("SELECT id FROM access_bootstrap WHERE id=1 FOR UPDATE").query(Integer.class).single();
        if(!definitions().isEmpty())throw new ApiException(409,"JOURNEY_EXISTS","The canonical International Care Journey already exists.");
        UUID id=UUID.randomUUID();jdbc.sql("INSERT INTO journey_definitions VALUES(?,'INTERNATIONAL_CARE','International Care Journey',?)").params(id,timestamp(clock.instant())).update();return id;
    }
    public List<Version> versions(UUID definition){return jdbc.sql("SELECT id FROM journey_versions WHERE definition_id=? ORDER BY version_number DESC").param(definition).query(UUID.class).list().stream().map(id->version(definition,id)).toList();}
    /** Resolves the owning definition first; for callers (Journey runtime projections) that only hold a version id. */
    public Version version(UUID id){
        UUID definition=jdbc.sql("SELECT definition_id FROM journey_versions WHERE id=?").param(id).query(UUID.class).optional().orElseThrow(JourneyDefinitionRepository::notFound);
        return version(definition,id);
    }
    public Version version(UUID definition,UUID id){return jdbc.sql("SELECT v.*,d.journey_version_id AS deployed_version FROM journey_versions v LEFT JOIN journey_deployments d ON d.journey_version_id=v.id WHERE v.definition_id=? AND v.id=?").params(definition,id).query((r,n)->new Version(id,definition,r.getInt("version_number"),Status.valueOf(r.getString("status")),r.getLong("revision"),r.getString("created_by"),read(r.getString("graph_snapshot"),Graph.class),r.getString("graph_hash"),r.getString("validation_summary"),r.getString("simulation_summary"),instant(r.getTimestamp("published_at")),instant(r.getTimestamp("retired_at")),r.getObject("deployed_version")==null?"NOT_DEPLOYED":"DEPLOYED")).optional().orElseThrow(JourneyDefinitionRepository::notFound);}
    public Version draft(UUID definition,Graph graph,String actor){
        if(versions(definition).stream().anyMatch(v->v.status()!=Status.PUBLISHED && v.status()!=Status.RETIRED))throw new ApiException(409,"DRAFT_EXISTS","Finish or reuse the existing draft before creating another version.");
        int number=jdbc.sql("SELECT COALESCE(MAX(version_number),0)+1 FROM journey_versions WHERE definition_id=?").param(definition).query(Integer.class).single();
        UUID id=UUID.randomUUID();Graph canonical=canonical(graph);String json=json(canonical);
        jdbc.sql("INSERT INTO journey_versions(id,definition_id,version_number,status,revision,created_by,created_at,graph_snapshot,graph_hash) VALUES(?,?,?,'DRAFT',0,?,?,?,?)").params(id,definition,number,actor,timestamp(clock.instant()),json,hash(json)).update();
        nodes(id,canonical);editor(id,actor);return version(definition,id);
    }
    public void save(Version version,Graph graph,String actor){
        Graph canonical=canonical(graph);String json=json(canonical);
        changed(jdbc.sql("UPDATE journey_versions SET graph_snapshot=?,graph_hash=?,status='DRAFT',validation_summary=NULL,simulation_summary=NULL,revision=revision+1 WHERE id=? AND revision=? AND status IN ('DRAFT','VALIDATED','SIMULATED')").params(json,hash(json),version.id(),version.revision()).update());
        nodes(version.id(),canonical);editor(version.id(),actor);
    }
    public void transition(Version v,Status status,String validation,String simulation){
        changed(jdbc.sql("UPDATE journey_versions SET status=?,validation_summary=?,simulation_summary=?,published_at=?,retired_at=?,revision=revision+1 WHERE id=? AND revision=?")
            .params(status.name(),validation,simulation,timestamp(status==Status.PUBLISHED?clock.instant():v.publishedAt()),timestamp(status==Status.RETIRED?clock.instant():v.retiredAt()),v.id(),v.revision()).update());
    }
    public List<com.rehletshifaa.access.infrastructure.AccessAuditRepository.Entry> history(UUID definition,int offset) {
        return jdbc.sql("SELECT actor_subject,entity_id,action,outcome,reason,occurred_at FROM audit_events WHERE (entity_id=? OR entity_id IN (SELECT CAST(id AS VARCHAR) FROM journey_versions WHERE definition_id=?)) AND (action LIKE 'JOURNEY_%' OR action='ACCESS_DENIED') ORDER BY occurred_at DESC,id DESC LIMIT 100 OFFSET ?")
            .params(definition.toString(),definition,offset).query((r,n)->new com.rehletshifaa.access.infrastructure.AccessAuditRepository.Entry(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getTimestamp(6).toInstant())).list();
    }
    /** When anything last happened to this journey or its versions (the newest journey audit event), for list summaries. */
    public Instant lastActivity(UUID definition){
        return jdbc.sql("SELECT MAX(occurred_at) FROM audit_events WHERE (entity_id=? OR entity_id IN (SELECT CAST(id AS VARCHAR) FROM journey_versions WHERE definition_id=?)) AND action LIKE 'JOURNEY_%'")
            .params(definition.toString(),definition).query((r,n)->instant(r.getTimestamp(1))).optional().orElse(null);
    }
    public boolean edited(UUID id,String actor){return jdbc.sql("SELECT COUNT(*) FROM journey_version_editors WHERE version_id=? AND actor_subject=?").params(id,actor).query(Long.class).single()>0;}
    private void editor(UUID id,String actor){if(!edited(id,actor))jdbc.sql("INSERT INTO journey_version_editors VALUES(?,?)").params(id,actor).update();}
    private void nodes(UUID id,Graph graph){
        jdbc.sql("DELETE FROM journey_edges WHERE version_id=?").param(id).update();jdbc.sql("DELETE FROM journey_nodes WHERE version_id=?").param(id).update();
        for(Node n:graph.nodes())jdbc.sql("INSERT INTO journey_nodes VALUES(?,?,?)").params(id,n.key(),json(n)).update();
        for(Edge e:graph.edges())jdbc.sql("INSERT INTO journey_edges VALUES(?,?,?,?,?)").params(id,e.key(),e.from(),e.to(),json(e)).update();
    }
    public String json(Object object){try{return mapper.writeValueAsString(object);}catch(Exception e){throw new IllegalStateException("Cannot serialize Journey configuration",e);}}
    private <T>T read(String json,Class<T> type){try{return mapper.readValue(json,type);}catch(Exception e){throw new IllegalStateException("Cannot read stored Journey configuration",e);}}
    private Graph canonical(Graph g){return new Graph(g.nodes().stream().sorted(Comparator.comparing(Node::key)).toList(),g.edges().stream().sorted(Comparator.comparing(Edge::key)).toList());}
    private String hash(String json){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static Instant instant(java.sql.Timestamp t){return t==null?null:t.toInstant();}
    private static void changed(int n){if(n!=1)throw new ApiException(409,"STALE_JOURNEY","This journey changed. Reload before saving.");}
    private static ApiException notFound(){return new ApiException(404,"JOURNEY_NOT_FOUND","Journey or version not found.");}
}
