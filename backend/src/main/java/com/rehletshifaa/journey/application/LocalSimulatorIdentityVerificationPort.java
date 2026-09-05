package com.rehletshifaa.journey.application;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Profile-restricted local/test simulator. It performs NO identity proofing of its own and never
 * auto-verifies — it always routes a submission to authorized manual review so the reviewer flow is
 * exercised end to end. A genuine external-provider adapter, when it exists, is registered as an
 * {@link IdentityVerificationPort} bean and takes precedence over this one.
 */
@Component
@ConditionalOnMissingBean(value = IdentityVerificationPort.class, ignored = LocalSimulatorIdentityVerificationPort.class)
public class LocalSimulatorIdentityVerificationPort implements IdentityVerificationPort {
    @Override public Outcome submit(Submission submission) {
        return new Outcome("MANUAL_REVIEW", providerName(), "sim-" + UUID.randomUUID(), "LOW");
    }
    @Override public String providerName() { return "LOCAL_SIMULATOR"; }
}
