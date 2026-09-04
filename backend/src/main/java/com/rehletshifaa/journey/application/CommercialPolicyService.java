package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Central commercial policy: the internal coordinated-care margin. Configured
 * centrally by a senior FINANCE user (never a per-case slider); selected and
 * snapshotted by the backend when a proposal is prepared. The intended standard
 * band is ~10-15% but the value is a centrally approved formula, not per-case.
 */
@Service
public class CommercialPolicyService {
    private final JdbcClient jdbc;
    private final ActorContext actors;
    private final Clock clock;

    public record Policy(UUID id, String name, String careCategory, BigDecimal marginRate, int version) {}

    public CommercialPolicyService(JdbcClient jdbc, ActorContext actors, Clock clock) {
        this.jdbc = jdbc; this.actors = actors; this.clock = clock;
    }

    /** Most specific active policy for a care area (care-area override, else platform default). */
    public Policy activePolicyFor(String careCategory) {
        Policy p = careCategory == null ? null : jdbc.sql("SELECT id,name,care_category,margin_rate,version FROM commercial_policies WHERE active AND care_category=? ORDER BY version DESC LIMIT 1")
                .param(careCategory).query(this::map).optional().orElse(null);
        if (p != null) return p;
        return jdbc.sql("SELECT id,name,care_category,margin_rate,version FROM commercial_policies WHERE active AND care_category IS NULL ORDER BY version DESC LIMIT 1")
                .query(this::map).optional().orElse(null);
    }

    public List<CommercialPolicyView> list() {
        actors.require(ActorRole.FINANCE, ActorRole.CREDENTIALING_ADMIN, ActorRole.SYSTEM_ADMIN);
        return jdbc.sql("SELECT id,name,care_category,margin_rate,active,version,created_by,valid_from FROM commercial_policies ORDER BY care_category NULLS FIRST,version DESC")
                .query((rs, n) -> new CommercialPolicyView(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("care_category"), rs.getBigDecimal("margin_rate"), rs.getBoolean("active"), rs.getInt("version"), rs.getString("created_by"), rs.getObject("valid_from", LocalDate.class))).list();
    }

    /** Configure a new active policy version. Senior Finance only, with recent authentication. */
    @Transactional
    public CommercialPolicyView configure(CommercialPolicyRequest request) {
        var actor = actors.requireRecentAuthentication(Duration.ofMinutes(10), ActorRole.FINANCE, ActorRole.SYSTEM_ADMIN);
        BigDecimal rate = request.marginRate();
        if (rate == null || rate.signum() < 0 || rate.compareTo(new BigDecimal("0.5")) > 0)
            throw new ApiException(400, "MARGIN_RATE_INVALID", "The margin rate must be between 0 and 0.5");
        String careCategory = request.careCategory() == null || request.careCategory().isBlank() ? null : request.careCategory().trim();
        Integer prev = (careCategory == null
                ? jdbc.sql("SELECT COALESCE(MAX(version),0) FROM commercial_policies WHERE care_category IS NULL")
                : jdbc.sql("SELECT COALESCE(MAX(version),0) FROM commercial_policies WHERE care_category=?").param(careCategory)).query(Integer.class).single();
        if (careCategory == null) jdbc.sql("UPDATE commercial_policies SET active=FALSE WHERE care_category IS NULL AND active").update();
        else jdbc.sql("UPDATE commercial_policies SET active=FALSE WHERE care_category=? AND active").param(careCategory).update();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO commercial_policies(id,name,care_category,margin_rate,active,version,created_by,valid_from,created_at) VALUES(?,?,?,?,TRUE,?,?,?,?)")
                .params(id, request.name() == null || request.name().isBlank() ? "Coordinated-care margin" : request.name().trim(), careCategory, rate, prev + 1, actor.subject(), LocalDate.now(clock), timestamp(clock.instant())).update();
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), "COMMERCIAL_POLICY_CONFIGURED", actor.subject(), actor.primaryRole(), null, "CommercialPolicy", id.toString(), "CONFIGURE", "SUCCESS", "rate=" + rate + " careCategory=" + careCategory, timestamp(clock.instant())).update();
        return jdbc.sql("SELECT id,name,care_category,margin_rate,active,version,created_by,valid_from FROM commercial_policies WHERE id=?").param(id)
                .query((rs, n) -> new CommercialPolicyView(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("care_category"), rs.getBigDecimal("margin_rate"), rs.getBoolean("active"), rs.getInt("version"), rs.getString("created_by"), rs.getObject("valid_from", LocalDate.class))).single();
    }

    private Policy map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new Policy(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("care_category"), rs.getBigDecimal("margin_rate"), rs.getInt("version"));
    }
}
