package com.rehletshifaa.access.platform.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PlatformOwnerRecoveryCompletionJob {
    private final PlatformOwnerRecoveryService recoveries;
    private final PlatformOwnerTransferService transfers;
    private final String operator;

    public PlatformOwnerRecoveryCompletionJob(PlatformOwnerRecoveryService recoveries, PlatformOwnerTransferService transfers,
            @Value("${app.owner-recovery.completion-operator:system:owner-recovery-scheduler}") String operator) {
        this.recoveries = recoveries;
        this.transfers = transfers;
        this.operator = operator;
    }

    @Scheduled(fixedDelayString = "${app.owner-recovery.completion-delay-milliseconds:300000}",
            initialDelayString = "${app.owner-recovery.completion-initial-delay-milliseconds:60000}")
    public void completeDueRecoveries() {
        transfers.expireDue();
        recoveries.expireDue();
        recoveries.completeDue(operator);
    }
}
