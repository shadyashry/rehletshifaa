package com.rehletshifaa.journey.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class ProposalExpiryService {
    private final JdbcClient jdbc;
    private final Clock clock;

    public ProposalExpiryService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.proposals.expiry-scan-ms:60000}")
    @Transactional
    public void expireReleasedProposals() {
        Instant now = clock.instant();
        List<Expired> expired = jdbc.sql("SELECT pv.id,p.case_id FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE pv.status IN ('RELEASED','VIEWED') AND pv.valid_until IS NOT NULL AND pv.valid_until<=?")
            .param(timestamp(now)).query((rs,n)->new Expired(rs.getObject("id",UUID.class),rs.getObject("case_id",UUID.class))).list();
        for (Expired item : expired) expire(item, now);
    }

    private void expire(Expired item, Instant now) {
        int versionChanged = jdbc.sql("UPDATE proposal_versions SET status='EXPIRED' WHERE id=? AND status IN ('RELEASED','VIEWED')")
            .param(item.versionId()).update();
        if (versionChanged != 1) return;
        jdbc.sql("UPDATE proposal_share_tokens SET revoked_at=? WHERE proposal_version_id=? AND revoked_at IS NULL")
            .params(timestamp(now),item.versionId()).update();
        int caseChanged = jdbc.sql("UPDATE medical_cases SET status='EXPIRED',updated_at=?,version=version+1 WHERE id=? AND status='PATIENT_DECISION'")
            .params(timestamp(now),item.caseId()).update();
        if (caseChanged == 1) jdbc.sql("INSERT INTO case_status_history(id,case_id,from_status,to_status,actor_subject,actor_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),item.caseId(),"PATIENT_DECISION","EXPIRED","SYSTEM","SYSTEM","Proposal validity period ended",timestamp(now)).update();
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(),"PROPOSAL_EXPIRED","SYSTEM","SYSTEM",item.caseId(),"ProposalVersion",item.versionId().toString(),"EXPIRE","SUCCESS",timestamp(now)).update();
    }

    private record Expired(UUID versionId, UUID caseId) {}
}
