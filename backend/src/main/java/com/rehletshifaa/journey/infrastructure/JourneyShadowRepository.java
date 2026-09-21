package com.rehletshifaa.journey.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.time.Clock;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class JourneyShadowRepository {
    public record Run(UUID id, UUID versionId, String engineReference, String requestHash, long revision) {}
    public record Result(String requestHash, String snapshot) {}
    private final JdbcClient jdbc;
    private final Clock clock;
    private final ObjectMapper mapper;
    public JourneyShadowRepository(JdbcClient jdbc, Clock clock, ObjectMapper mapper) {this.jdbc=jdbc;this.clock=clock;this.mapper=mapper;}
    public Optional<Run> replayStart(String actor,String key) {
        return jdbc.sql("SELECT * FROM journey_shadow_runs WHERE created_by=? AND command_key=?").params(actor,key).query(this::map).optional();
    }
    public Run lock(UUID id,UUID version) {
        return jdbc.sql("SELECT * FROM journey_shadow_runs WHERE id=? AND journey_version_id=? FOR UPDATE").params(id,version).query(this::map)
                .optional().orElseThrow(()->new ApiException(404,"JOURNEY_SHADOW_NOT_FOUND","Synthetic journey run not found."));
    }
    public void insert(UUID id,UUID version,String engine,String actor,String key,String hash) {
        jdbc.sql("INSERT INTO journey_shadow_runs(id,journey_version_id,engine_instance_ref,created_by,command_key,request_hash,created_at) VALUES(?,?,?,?,?,?,?)")
                .params(id,version,engine,actor,key,hash,timestamp(clock.instant())).update();
    }
    public Optional<Result> result(UUID id,String actor,String key) {
        return jdbc.sql("SELECT request_hash,result_snapshot FROM journey_shadow_commands WHERE run_id=? AND actor_subject=? AND command_key=?")
                .params(id,actor,key).query((r,n)->new Result(r.getString(1),r.getString(2))).optional();
    }
    public void completed(Run run,String actor,String key,String hash,Object result) {
        int updated=jdbc.sql("UPDATE journey_shadow_runs SET revision=revision+1 WHERE id=? AND revision=?").params(run.id(),run.revision()).update();
        if(updated!=1)throw new ApiException(409,"STALE_JOURNEY_SHADOW","Synthetic journey changed; reload it.");
        jdbc.sql("INSERT INTO journey_shadow_commands VALUES(?,?,?,?,?,?)").params(run.id(),actor,key,hash,json(result),timestamp(clock.instant())).update();
    }
    public String json(Object value) {try{return mapper.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Cannot encode synthetic runtime metadata",e);}}
    public <T>T read(String value,Class<T> type) {try{return mapper.readValue(value,type);}catch(Exception e){throw new IllegalStateException("Cannot read synthetic runtime metadata",e);}}
    private Run map(java.sql.ResultSet r,int n)throws java.sql.SQLException {
        return new Run(r.getObject("id",UUID.class),r.getObject("journey_version_id",UUID.class),r.getString("engine_instance_ref"),r.getString("request_hash"),r.getLong("revision"));
    }
}
