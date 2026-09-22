package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Binds anonymous draft uploads and submission to the bot-verified browser that created the case. */
@Service
public class CaseIntakeGrantService {
    private final JdbcClient jdbc;
    private final IntakeLifecycleService intake;
    private final Clock clock;
    private final Duration ttl;
    private final SecureRandom random = new SecureRandom();

    public CaseIntakeGrantService(JdbcClient jdbc, IntakeLifecycleService intake, Clock clock,
            @Value("${app.claim.intake-grant-expiry-seconds:7200}") long expirySeconds) {
        this.jdbc=jdbc; this.intake=intake; this.clock=clock; this.ttl=Duration.ofSeconds(expirySeconds);
    }

    public String issue(UUID caseId) {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var now=clock.instant();
        jdbc.sql("INSERT INTO case_intake_grants(case_id,grant_hash,expires_at,created_at) VALUES(?,?,?,?)")
                .params(caseId,intake.hash(token),timestamp(now.plus(ttl)),timestamp(now)).update();
        return token;
    }

    public void require(UUID caseId,String token) {
        if(token==null || token.isBlank()) throw denied();
        Integer found=jdbc.sql("SELECT count(*) FROM case_intake_grants WHERE case_id=? AND grant_hash=? AND expires_at>? AND consumed_at IS NULL")
                .params(caseId,intake.hash(token),timestamp(clock.instant())).query(Integer.class).single();
        if(found==null || found!=1) throw denied();
    }

    public void consume(UUID caseId,String token) {
        int changed=jdbc.sql("UPDATE case_intake_grants SET consumed_at=? WHERE case_id=? AND grant_hash=? AND expires_at>? AND consumed_at IS NULL")
                .params(timestamp(clock.instant()),caseId,intake.hash(token),timestamp(clock.instant())).update();
        if(changed!=1) throw denied();
    }

    private ApiException denied(){return new ApiException(404,"CASE_NOT_FOUND","Case was not found");}
}
