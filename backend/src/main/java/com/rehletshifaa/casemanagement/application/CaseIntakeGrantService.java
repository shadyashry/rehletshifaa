package com.rehletshifaa.casemanagement.application;

import com.rehletshifaa.casemanagement.domain.CaseIntakeGrant;
import com.rehletshifaa.casemanagement.infrastructure.CaseIntakeGrantRepository;
import com.rehletshifaa.shared.api.ApiException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Binds anonymous draft uploads and submission to the bot-verified browser that created the case. */
@Service
public class CaseIntakeGrantService {
    private final CaseIntakeGrantRepository grants;
    private final IntakeLifecycleService intake;
    private final Clock clock;
    private final Duration ttl;
    private final SecureRandom random = new SecureRandom();

    public CaseIntakeGrantService(IntakeLifecycleService intake, Clock clock,
            @Value("${app.claim.intake-grant-expiry-seconds:7200}") long expirySeconds, CaseIntakeGrantRepository grants) { this.grants = grants;
        this.intake=intake; this.clock=clock; this.ttl=Duration.ofSeconds(expirySeconds);
    }

    public String issue(UUID caseId) {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var now=clock.instant();
        grants.saveAndFlush(new CaseIntakeGrant(caseId,intake.hash(token),now.plus(ttl),now));
        return token;
    }

    public void require(UUID caseId,String token) {
        if(token==null || token.isBlank()) throw denied();
        if(!grants.isUsable(caseId,intake.hash(token),micros(clock.instant()))) throw denied();
    }

    public void consume(UUID caseId,String token) {
        int changed=grants.consume(caseId,intake.hash(token),micros(clock.instant()));
        if(changed!=1) throw denied();
    }

    private ApiException denied(){return new ApiException(404,"CASE_NOT_FOUND","Case was not found");}
}
